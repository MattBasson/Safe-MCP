import { mkdir, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  PublicClientApplication,
  type AuthenticationResult,
  type Configuration,
  type DeviceCodeResponse,
} from "@azure/msal-node";
import {
  EncryptedFileCachePlugin,
  readPassphrase,
} from "./cache.js";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";

export interface AuthContext {
  pca: PublicClientApplication;
  scopes: string[];
  cacheDir: string;
  logger: Logger;
}

export async function buildAuthContext(
  cfg: Config,
  logger: Logger,
): Promise<AuthContext> {
  const passphrase = await readPassphrase(cfg.cachePassphraseFile, logger);
  const cachePlugin = new EncryptedFileCachePlugin({
    cacheDir: cfg.cacheDir,
    passphrase,
    logger,
  });

  const msalConfig: Configuration = {
    auth: {
      clientId: cfg.clientId,
      authority: `https://login.microsoftonline.com/${cfg.tenantId}`,
    },
    cache: { cachePlugin },
    system: {
      loggerOptions: {
        loggerCallback: () => {
          // MSAL's internal logs are intentionally suppressed - we have our
          // own redacting logger and stdout must stay JSON-RPC-only.
        },
        piiLoggingEnabled: false,
        logLevel: 0,
      },
    },
  };

  return {
    pca: new PublicClientApplication(msalConfig),
    scopes: cfg.scopes,
    cacheDir: cfg.cacheDir,
    logger,
  };
}

export async function acquireToken(ctx: AuthContext): Promise<string> {
  const accounts = await ctx.pca.getTokenCache().getAllAccounts();
  const [account] = accounts;
  if (account) {
    try {
      const silent = await ctx.pca.acquireTokenSilent({
        account,
        scopes: ctx.scopes,
      });
      if (silent) return silent.accessToken;
    } catch (err) {
      ctx.logger.info(
        "silent token acquisition failed; falling back to device code",
        { err: (err as Error).message },
      );
    }
  }
  const result = await acquireByDeviceCode(ctx);
  return result.accessToken;
}

async function acquireByDeviceCode(
  ctx: AuthContext,
): Promise<AuthenticationResult> {
  const sidecarPath = join(ctx.cacheDir, "pending-device-code.json");
  await mkdir(ctx.cacheDir, { recursive: true, mode: 0o700 }).catch(() => {});

  const result = await ctx.pca.acquireTokenByDeviceCode({
    scopes: ctx.scopes,
    deviceCodeCallback: (resp: DeviceCodeResponse) => {
      // The instructions are intended for a human; emit them on stderr only.
      // stdout belongs to JSON-RPC.
      process.stderr.write(`\n${resp.message}\n\n`);
      const sidecar = {
        userCode: resp.userCode,
        verificationUri: resp.verificationUri,
        expiresOn: new Date(Date.now() + resp.expiresIn * 1000).toISOString(),
      };
      writeFile(sidecarPath, JSON.stringify(sidecar, null, 2), {
        mode: 0o600,
      }).catch((err) => {
        ctx.logger.warn("failed to write pending-device-code sidecar", {
          err: (err as Error).message,
        });
      });
    },
  });

  if (existsSync(sidecarPath)) {
    await unlink(sidecarPath).catch(() => {});
  }

  if (!result) {
    throw new Error("device code flow returned no result");
  }
  return result;
}
