import { z } from "zod";
import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { clamp, jsonResult } from "./util.js";

const inputShape = {
  path: z
    .string()
    .max(1024)
    .regex(/^[^\0]*$/u, "path must not contain NUL")
    .optional(),
  top: z.number().int().positive().max(100).default(50),
};

function safePath(path: string | undefined): string {
  if (!path || path === "/" || path === "") {
    return "/me/drive/root/children";
  }
  // Reject parent-traversal segments before encoding.
  const segments = path.split("/").filter(Boolean);
  if (segments.some((s) => s === "..")) {
    throw new Error("path must not contain '..'");
  }
  const encoded = segments.map((s) => encodeURIComponent(s)).join("/");
  return `/me/drive/root:/${encoded}:/children`;
}

export function registerFilesList(server: McpServer, graph: Client): void {
  server.registerTool(
    "files_list",
    {
      title: "List OneDrive items",
      description:
        "List items in the signed-in user's OneDrive (read-only). Provide a folder `path` (e.g. 'Documents/Reports') or omit for the drive root. Hard cap of 100 items per call.",
      inputSchema: inputShape,
    },
    async (args) => {
      const top = clamp(args.top ?? 50, 1, 100);
      const resp = await graph
        .api(safePath(args.path))
        .select([
          "id",
          "name",
          "size",
          "lastModifiedDateTime",
          "webUrl",
          "folder",
          "file",
        ])
        .top(top)
        .get();
      return jsonResult({ items: resp.value ?? [] });
    },
  );
}

export const __test__ = { safePath };
