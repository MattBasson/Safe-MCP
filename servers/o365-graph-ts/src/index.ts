#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { buildAuthContext } from "./auth/msal.js";
import { createGraphClient } from "./graph/client.js";
import { registerAllTools } from "./tools/index.js";

const PKG_NAME = "@safe-mcp/o365-graph-ts";
const PKG_VERSION = "0.1.0";

async function main(): Promise<void> {
  if (process.argv.includes("--version")) {
    process.stdout.write(`${PKG_NAME} ${PKG_VERSION}\n`);
    return;
  }

  const cfg = loadConfig();
  const logger = createLogger(cfg.logLevel);
  logger.info("starting o365-graph-ts", {
    version: PKG_VERSION,
    tenantId: cfg.tenantId,
    scopes: cfg.scopes,
    cacheDir: cfg.cacheDir,
  });

  const auth = await buildAuthContext(cfg, logger);
  const graph = createGraphClient(auth);

  const server = new McpServer({
    name: PKG_NAME,
    version: PKG_VERSION,
  });

  registerAllTools(server, graph);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("ready", { transport: "stdio" });

  const shutdown = (signal: string) => () => {
    logger.info("shutting down", { signal });
    server.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown("SIGINT"));
  process.on("SIGTERM", shutdown("SIGTERM"));
}

main().catch((err) => {
  process.stderr.write(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      msg: "fatal",
      err: (err as Error).message,
    }) + "\n",
  );
  process.exit(1);
});
