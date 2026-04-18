import { describe, it, expect } from "vitest";
import { __test__ } from "../src/tools/files-list.js";

describe("files_list safePath", () => {
  it("uses /me/drive/root/children when path is empty or '/'", () => {
    expect(__test__.safePath(undefined)).toBe("/me/drive/root/children");
    expect(__test__.safePath("")).toBe("/me/drive/root/children");
    expect(__test__.safePath("/")).toBe("/me/drive/root/children");
  });

  it("encodes path segments and joins with the items: prefix", () => {
    expect(__test__.safePath("Documents/My Reports")).toBe(
      "/me/drive/root:/Documents/My%20Reports:/children",
    );
  });

  it("rejects '..' segments", () => {
    expect(() => __test__.safePath("Documents/../etc")).toThrow(/'\.\.'/);
  });
});
