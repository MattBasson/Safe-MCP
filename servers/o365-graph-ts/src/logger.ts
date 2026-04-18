type Level = "error" | "warn" | "info" | "debug";

const LEVEL_ORDER: Record<Level, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const SECRET_KEYS = new Set([
  "authorization",
  "access_token",
  "refresh_token",
  "id_token",
  "client_secret",
  "password",
  "passphrase",
  "usercode",
  "user_code",
  "device_code",
]);

const JWT_REGEX = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

function redactValue(v: unknown): unknown {
  if (typeof v === "string") {
    return v.replace(JWT_REGEX, "[redacted-jwt]");
  }
  if (Array.isArray(v)) return v.map(redactValue);
  if (v && typeof v === "object") return redact(v as Record<string, unknown>);
  return v;
}

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEYS.has(k.toLowerCase())) {
      out[k] = "[redacted]";
    } else {
      out[k] = redactValue(v);
    }
  }
  return out;
}

export interface Logger {
  error: (msg: string, fields?: Record<string, unknown>) => void;
  warn: (msg: string, fields?: Record<string, unknown>) => void;
  info: (msg: string, fields?: Record<string, unknown>) => void;
  debug: (msg: string, fields?: Record<string, unknown>) => void;
}

export function createLogger(level: Level): Logger {
  const threshold = LEVEL_ORDER[level];
  const emit = (lvl: Level, msg: string, fields?: Record<string, unknown>) => {
    if (LEVEL_ORDER[lvl] > threshold) return;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level: lvl,
      msg,
      ...(fields ? redact(fields) : {}),
    });
    process.stderr.write(line + "\n");
  };
  return {
    error: (m, f) => emit("error", m, f),
    warn: (m, f) => emit("warn", m, f),
    info: (m, f) => emit("info", m, f),
    debug: (m, f) => emit("debug", m, f),
  };
}

export const __test__ = { redact };
