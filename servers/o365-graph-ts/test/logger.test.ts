import { describe, it, expect } from "vitest";
import { __test__ } from "../src/logger.js";

describe("logger redaction", () => {
  it("redacts known secret-like keys (case-insensitive)", () => {
    const out = __test__.redact({
      Authorization: "Bearer abc",
      access_token: "deadbeef",
      Refresh_Token: "rt",
      passphrase: "hunter2",
      safe: "ok",
    });
    expect(out["Authorization"]).toBe("[redacted]");
    expect(out["access_token"]).toBe("[redacted]");
    expect(out["Refresh_Token"]).toBe("[redacted]");
    expect(out["passphrase"]).toBe("[redacted]");
    expect(out["safe"]).toBe("ok");
  });

  it("redacts JWT-shaped strings inside arbitrary string values", () => {
    const jwt =
      "eyJhbGciOi" +
      "JIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4iLCJpYXQiOjE1MTYyMzkwMjJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const out = __test__.redact({ note: `header was ${jwt} ok` });
    expect(out["note"]).toContain("[redacted-jwt]");
    expect(out["note"]).not.toContain("eyJ");
  });

  it("recurses into nested objects and arrays", () => {
    const out = __test__.redact({
      nested: { access_token: "x", arr: [{ password: "p" }] },
    });
    const nested = out["nested"] as Record<string, unknown>;
    expect(nested["access_token"]).toBe("[redacted]");
    const arr = nested["arr"] as Array<Record<string, unknown>>;
    expect(arr[0]!["password"]).toBe("[redacted]");
  });
});
