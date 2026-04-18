import { describe, it, expect } from "vitest";
import { loadConfig, __test__ } from "../src/config.js";

const VALID_GUID_A = "00000000-0000-0000-0000-000000000001";
const VALID_GUID_B = "00000000-0000-0000-0000-000000000002";

function baseEnv(): NodeJS.ProcessEnv {
  return {
    AZURE_TENANT_ID: VALID_GUID_A,
    AZURE_CLIENT_ID: VALID_GUID_B,
  } as NodeJS.ProcessEnv;
}

describe("loadConfig", () => {
  it("requires AZURE_TENANT_ID and AZURE_CLIENT_ID as GUIDs", () => {
    expect(() => loadConfig({} as NodeJS.ProcessEnv)).toThrow();
    expect(() =>
      loadConfig({
        AZURE_TENANT_ID: "not-a-guid",
        AZURE_CLIENT_ID: VALID_GUID_B,
      } as NodeJS.ProcessEnv),
    ).toThrow(/AZURE_TENANT_ID/);
  });

  it("defaults scopes to the read-only set", () => {
    const cfg = loadConfig(baseEnv());
    expect(cfg.scopes).toEqual(__test__.DEFAULT_SCOPES);
    expect(cfg.scopes).toContain("Mail.Read");
    expect(cfg.scopes).not.toContain("Mail.ReadWrite");
    expect(cfg.scopes).not.toContain("Mail.Send");
  });

  it("parses GRAPH_SCOPES as space-delimited list", () => {
    const cfg = loadConfig({
      ...baseEnv(),
      GRAPH_SCOPES: "User.Read   Mail.Read",
    });
    expect(cfg.scopes).toEqual(["User.Read", "Mail.Read"]);
  });

  it("downgrades debug log level unless ALLOW_DEBUG_LOGS=1", () => {
    const noOptIn = loadConfig({ ...baseEnv(), LOG_LEVEL: "debug" });
    expect(noOptIn.logLevel).toBe("info");
    const optIn = loadConfig({
      ...baseEnv(),
      LOG_LEVEL: "debug",
      ALLOW_DEBUG_LOGS: "1",
    });
    expect(optIn.logLevel).toBe("debug");
  });
});
