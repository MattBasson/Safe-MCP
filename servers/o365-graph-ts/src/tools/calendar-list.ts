import { z } from "zod";
import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { clamp, jsonResult } from "./util.js";

const isoDate = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/,
    "must be ISO-8601 datetime",
  );

const inputShape = {
  startDateTime: isoDate,
  endDateTime: isoDate,
  top: z.number().int().positive().max(50).default(25),
};

export function registerCalendarList(server: McpServer, graph: Client): void {
  server.registerTool(
    "calendar_list",
    {
      title: "List calendar events",
      description:
        "List the signed-in user's calendar events between two ISO-8601 timestamps (read-only). Hard cap of 50 events per call.",
      inputSchema: inputShape,
    },
    async (args) => {
      const top = clamp(args.top ?? 25, 1, 50);
      const resp = await graph
        .api("/me/calendarView")
        .query({
          startDateTime: args.startDateTime,
          endDateTime: args.endDateTime,
        })
        .select([
          "id",
          "subject",
          "start",
          "end",
          "location",
          "organizer",
          "attendees",
          "isAllDay",
          "showAs",
        ])
        .top(top)
        .orderby("start/dateTime")
        .get();
      return jsonResult({ items: resp.value ?? [] });
    },
  );
}
