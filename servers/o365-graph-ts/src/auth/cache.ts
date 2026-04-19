import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import type { ICachePlugin, TokenCacheContext } from "@azure/msal-node";
import type { Logger } from "../logger.js";

const SCRYPT_SALT = Buffer.from("safe-mcp/o365-graph-ts/v1", "utf8");
const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
// Node's default scryptSync maxmem is 32 MiB, which is exactly what N=2^15,
// r=8 needs - triggering RangeError on some runtimes. Bump it explicitly.
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const KEY_LEN = 32;
const NONCE_LEN = 12;
const TAG_LEN = 16;

export interface EncryptedFileCacheOptions {
  cacheDir: string;
  passphrase: Buffer | null; // null = in-memory only mode
  logger: Logger;
}

export class EncryptedFileCachePlugin implements ICachePlugin {
  private readonly path: string;
  private readonly key: Buffer | null;
  private readonly logger: Logger;

  constructor(opts: EncryptedFileCacheOptions) {
    this.path = join(opts.cacheDir, "token-cache.bin");
    this.logger = opts.logger;
    if (opts.passphrase) {
      this.key = scryptSync(
        opts.passphrase,
        SCRYPT_SALT,
        KEY_LEN,
        {
          N: SCRYPT_N,
          r: SCRYPT_R,
          p: SCRYPT_P,
          maxmem: SCRYPT_MAXMEM,
        },
      );
    } else {
      this.key = null;
    }
  }

  async beforeCacheAccess(ctx: TokenCacheContext): Promise<void> {
    if (!this.key) return;
    if (!existsSync(this.path)) return;
    try {
      const blob = await readFile(this.path);
      const plaintext = this.decrypt(blob);
      ctx.tokenCache.deserialize(plaintext);
    } catch (err) {
      this.logger.warn("token cache decrypt failed; starting empty", {
        err: (err as Error).message,
      });
    }
  }

  async afterCacheAccess(ctx: TokenCacheContext): Promise<void> {
    if (!this.key) return;
    if (!ctx.cacheHasChanged) return;
    try {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const plaintext = ctx.tokenCache.serialize();
      const blob = this.encrypt(plaintext);
      const tmp = `${this.path}.tmp`;
      await writeFile(tmp, blob, { mode: 0o600 });
      await rename(tmp, this.path);
    } catch (err) {
      this.logger.error("token cache write failed", {
        err: (err as Error).message,
      });
    }
  }

  private encrypt(plaintext: string): Buffer {
    if (!this.key) throw new Error("cache key not configured");
    const nonce = randomBytes(NONCE_LEN);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    const enc = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([nonce, enc, tag]);
  }

  private decrypt(blob: Buffer): string {
    if (!this.key) throw new Error("cache key not configured");
    if (blob.length < NONCE_LEN + TAG_LEN) {
      throw new Error("cache file too short");
    }
    const nonce = blob.subarray(0, NONCE_LEN);
    const tag = blob.subarray(blob.length - TAG_LEN);
    const ciphertext = blob.subarray(NONCE_LEN, blob.length - TAG_LEN);
    const decipher = createDecipheriv("aes-256-gcm", this.key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
      .toString("utf8");
  }
}

export async function readPassphrase(
  path: string,
  logger: Logger,
): Promise<Buffer | null> {
  if (!existsSync(path)) {
    logger.warn(
      "cache passphrase file not present; running in memory-only mode",
      { path },
    );
    return null;
  }
  const raw = await readFile(path);
  const trimmed = raw.toString("utf8").trim();
  if (trimmed.length < 16) {
    logger.warn(
      "cache passphrase too short (<16 chars); running in memory-only mode",
    );
    return null;
  }
  return Buffer.from(trimmed, "utf8");
}
