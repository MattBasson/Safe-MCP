import { z } from "zod";
import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { clamp, jsonResult } from "./util.js";

const inputShape = {
  query: z.string().min(1).max(256),
  top: z.number().int().positive().max(25).default(10),
};

export function registerMailSearch(server: McpServer, graph: Client): void {
  server.registerTool(
    "mail_search",
    {
      title: "Search messages",
      description:
        "Search the signed-in user's mailbox using Graph $search (KQL-like). Hard cap of 25 results per call.",
      inputSchema: inputShape,
    },
    async (args) => {
      const top = clamp(args.top ?? 10, 1, 25);
      const resp = await graph
        .api("/me/messages")
        .header("ConsistencyLevel", "eventual")
        .search(`"${args.query.replace(/"/g, "")}"`)
        .select(["id", "subject", "from", "receivedDateTime", "isRead"])
        .top(top)
        .get();
      return jsonResult({ items: resp.value ?? [] });
    },
  );
}
