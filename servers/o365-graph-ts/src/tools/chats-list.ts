import { z } from "zod";
import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { clamp, jsonResult } from "./util.js";

const inputShape = {
  top: z.number().int().positive().max(50).default(20),
};

export function registerChatsList(server: McpServer, graph: Client): void {
  server.registerTool(
    "chats_list",
    {
      title: "List Teams chats",
      description:
        "List the signed-in user's Microsoft Teams chats (read-only). Hard cap of 50 chats per call.",
      inputSchema: inputShape,
    },
    async (args) => {
      const top = clamp(args.top ?? 20, 1, 50);
      const resp = await graph
        .api("/me/chats")
        .select(["id", "topic", "chatType", "lastUpdatedDateTime"])
        .top(top)
        .get();
      return jsonResult({ items: resp.value ?? [] });
    },
  );
}
