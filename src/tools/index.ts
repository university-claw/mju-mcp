import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppContext } from "../mcp/app-context.js";
import { registerAssignmentTools } from "./assignments.js";
import { registerCourseTools } from "./courses.js";
import { registerMaterialTools } from "./materials.js";
import { registerNoticeTools } from "./notices.js";
import { registerOnlineTools } from "./online.js";

export function registerMjuLmsTools(
  server: McpServer,
  context: AppContext
): void {
  registerAssignmentTools(server, context);
  registerCourseTools(server, context);
  registerMaterialTools(server, context);
  registerNoticeTools(server, context);
  registerOnlineTools(server, context);
}
