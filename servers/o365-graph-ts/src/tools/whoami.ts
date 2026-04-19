import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult } from "./util.js";

export function registerWhoAmI(server: McpServer, graph: Client): void {
  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description:
        "Return the signed-in user's basic profile from Microsoft Graph (/me).",
      inputSchema: {},
    },
    async () => {
      const me = await graph
        .api("/me")
        .select(["id", "displayName", "userPrincipalName", "mail", "jobTitle"])
        .get();
      return jsonResult(me);
    },
  );
}
