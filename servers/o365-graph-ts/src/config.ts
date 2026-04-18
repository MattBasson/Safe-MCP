import { z } from "zod";

const DEFAULT_SCOPES = [
  "User.Read",
  "Mail.Read",
  "Calendars.Read",
  "Files.Read",
  "Sites.Read.All",
  "Chat.Read",
  "offline_access",
];

const guidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const schema = z.object({
  AZURE_TENANT_ID: z
    .string()
    .regex(guidPattern, "AZURE_TENANT_ID must be a GUID"),
  AZURE_CLIENT_ID: z
    .string()
    .regex(guidPattern, "AZURE_CLIENT_ID must be a GUID"),
  GRAPH_SCOPES: z.string().optional(),
  MCP_CACHE_DIR: z
    .string()
    .min(1)
    .default("/home/nonroot/.cache/o365-graph-mcp"),
  CACHE_PASSPHRASE_FILE: z
    .string()
    .default("/run/secrets/cache-passphrase"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  ALLOW_DEBUG_LOGS: z.string().optional(),
});

export interface Config {
  tenantId: string;
  clientId: string;
  scopes: string[];
  cacheDir: string;
  cachePassphraseFile: string;
  logLevel: "error" | "warn" | "info" | "debug";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.parse(env);

  const scopes = parsed.GRAPH_SCOPES
    ? parsed.GRAPH_SCOPES.split(/\s+/).filter(Boolean)
    : DEFAULT_SCOPES;

  let logLevel = parsed.LOG_LEVEL;
  if (logLevel === "debug" && parsed.ALLOW_DEBUG_LOGS !== "1") {
    logLevel = "info";
  }

  return {
    tenantId: parsed.AZURE_TENANT_ID,
    clientId: parsed.AZURE_CLIENT_ID,
    scopes,
    cacheDir: parsed.MCP_CACHE_DIR,
    cachePassphraseFile: parsed.CACHE_PASSPHRASE_FILE,
    logLevel,
  };
}

export const __test__ = { DEFAULT_SCOPES };
