import { z } from "zod";
import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, summarizeBody } from "./util.js";

const inputShape = {
  id: z.string().min(1),
};

export function registerMailGet(server: McpServer, graph: Client): void {
  server.registerTool(
    "mail_get",
    {
      title: "Get a single message",
      description:
        "Fetch a single mail message by id (read-only). HTML is stripped and the body is truncated to 4000 chars.",
      inputSchema: inputShape,
    },
    async (args) => {
      const m = await graph
        .api(`/me/messages/${encodeURIComponent(args.id)}`)
        .select([
          "id",
          "subject",
          "from",
          "toRecipients",
          "ccRecipients",
          "receivedDateTime",
          "isRead",
          "hasAttachments",
          "body",
        ])
        .get();
      return jsonResult({
        id: m.id,
        subject: m.subject,
        from: m.from,
        to: m.toRecipients,
        cc: m.ccRecipients,
        receivedDateTime: m.receivedDateTime,
        isRead: m.isRead,
        hasAttachments: m.hasAttachments,
        bodyPreview: summarizeBody(m.body?.content),
      });
    },
  );
}
