import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerWhoAmI } from "./whoami.js";
import { registerMailList } from "./mail-list.js";
import { registerMailGet } from "./mail-get.js";
import { registerMailSearch } from "./mail-search.js";
import { registerCalendarList } from "./calendar-list.js";
import { registerFilesList } from "./files-list.js";
import { registerChatsList } from "./chats-list.js";
import { registerChatMessagesList } from "./chat-messages-list.js";

export function registerAllTools(server: McpServer, graph: Client): void {
  registerWhoAmI(server, graph);
  registerMailList(server, graph);
  registerMailGet(server, graph);
  registerMailSearch(server, graph);
  registerCalendarList(server, graph);
  registerFilesList(server, graph);
  registerChatsList(server, graph);
  registerChatMessagesList(server, graph);
}
