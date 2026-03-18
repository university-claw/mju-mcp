import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppContext } from "../mcp/app-context.js";
import { registerCourseTools } from "./courses.js";
import { registerNoticeTools } from "./notices.js";

export function registerMjuLmsTools(
  server: McpServer,
  context: AppContext
): void {
  registerCourseTools(server, context);
  registerNoticeTools(server, context);
}
