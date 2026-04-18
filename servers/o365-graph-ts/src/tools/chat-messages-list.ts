import { z } from "zod";
import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { clamp, jsonResult, summarizeBody } from "./util.js";

const inputShape = {
  chatId: z.string().min(1).max(256),
  top: z.number().int().positive().max(25).default(10),
};

interface GraphChatMessage {
  id?: string;
  from?: unknown;
  createdDateTime?: string;
  body?: { content?: string | null } | null;
}

export function registerChatMessagesList(
  server: McpServer,
  graph: Client,
): void {
  server.registerTool(
    "chat_messages_list",
    {
      title: "List Teams chat messages",
      description:
        "List recent messages in a single Teams chat (read-only). HTML is stripped from message bodies. Hard cap of 25 messages per call.",
      inputSchema: inputShape,
    },
    async (args) => {
      const top = clamp(args.top ?? 10, 1, 25);
      const resp = await graph
        .api(`/me/chats/${encodeURIComponent(args.chatId)}/messages`)
        .top(top)
        .get();
      const items = ((resp.value ?? []) as GraphChatMessage[]).map((m) => ({
        id: m.id,
        from: m.from,
        createdDateTime: m.createdDateTime,
        body: summarizeBody(m.body?.content ?? "", 2000),
      }));
      return jsonResult({ items });
    },
  );
}
