import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TokenCacheContext } from "@azure/msal-node";
import { EncryptedFileCachePlugin } from "../src/auth/cache.js";
import { createLogger } from "../src/logger.js";

const PASSPHRASE = Buffer.from(
  "this-is-a-long-enough-test-passphrase-32b",
  "utf8",
);

function makeCtx(initial: string): TokenCacheContext {
  let serialized = initial;
  return {
    cacheHasChanged: false,
    tokenCache: {
      serialize: () => serialized,
      deserialize: (s: string) => {
        serialized = s;
      },
    },
  } as unknown as TokenCacheContext;
}

describe("EncryptedFileCachePlugin", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "o365-cache-"));
    return () => rmSync(dir, { recursive: true, force: true });
  });

  it("does nothing when passphrase is null (memory-only mode)", async () => {
    const plugin = new EncryptedFileCachePlugin({
      cacheDir: dir,
      passphrase: null,
      logger: createLogger("error"),
    });
    const ctx = makeCtx('{"foo":"bar"}');
    ctx.cacheHasChanged = true;
    await plugin.afterCacheAccess(ctx);
    expect(existsSync(join(dir, "token-cache.bin"))).toBe(false);
  });

  it("encrypts then decrypts a round-trip", async () => {
    const plugin = new EncryptedFileCachePlugin({
      cacheDir: dir,
      passphrase: PASSPHRASE,
      logger: createLogger("error"),
    });
    const writeCtx = makeCtx('{"alpha":1,"beta":"two"}');
    writeCtx.cacheHasChanged = true;
    await plugin.afterCacheAccess(writeCtx);

    const path = join(dir, "token-cache.bin");
    expect(existsSync(path)).toBe(true);

    const blob = readFileSync(path);
    expect(blob.length).toBeGreaterThan(12 + 16);
    // Plaintext must not appear in the encrypted file.
    expect(blob.includes(Buffer.from("alpha"))).toBe(false);

    const readCtx = makeCtx("");
    await plugin.beforeCacheAccess(readCtx);
    expect(readCtx.tokenCache.serialize()).toBe('{"alpha":1,"beta":"two"}');
  });

  it("rejects a tampered cache file (auth tag fails)", async () => {
    const plugin = new EncryptedFileCachePlugin({
      cacheDir: dir,
      passphrase: PASSPHRASE,
      logger: createLogger("error"),
    });
    const writeCtx = makeCtx('{"x":1}');
    writeCtx.cacheHasChanged = true;
    await plugin.afterCacheAccess(writeCtx);

    const path = join(dir, "token-cache.bin");
    const blob = readFileSync(path);
    blob[blob.length - 1] = blob[blob.length - 1]! ^ 0xff;
    const fs = await import("node:fs/promises");
    await fs.writeFile(path, blob);

    const readCtx = makeCtx("");
    await plugin.beforeCacheAccess(readCtx);
    // On failure the plugin logs a warning and leaves the cache empty.
    expect(readCtx.tokenCache.serialize()).toBe("");
  });
});
