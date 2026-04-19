import { z } from "zod";
import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { clamp, jsonResult } from "./util.js";

const inputShape = {
  top: z.number().int().positive().max(50).default(25),
  skip: z.number().int().nonnegative().default(0),
  unreadOnly: z.boolean().default(false),
};

export function registerMailList(server: McpServer, graph: Client): void {
  server.registerTool(
    "mail_list",
    {
      title: "List inbox messages",
      description:
        "List messages in the signed-in user's Inbox (read-only). Returns subject, from, receivedDateTime, isRead, and id. Hard cap of 50 per call.",
      inputSchema: inputShape,
    },
    async (args) => {
      const top = clamp(args.top ?? 25, 1, 50);
      const skip = Math.max(0, args.skip ?? 0);
      let req = graph
        .api("/me/mailFolders/inbox/messages")
        .select(["id", "subject", "from", "receivedDateTime", "isRead"])
        .top(top)
        .skip(skip)
        .orderby("receivedDateTime DESC");
      if (args.unreadOnly) {
        req = req.filter("isRead eq false");
      }
      const resp = await req.get();
      return jsonResult({
        items: resp.value ?? [],
        nextSkip: (resp.value?.length ?? 0) === top ? skip + top : null,
      });
    },
  );
}
