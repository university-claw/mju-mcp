import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { APP_NAME, APP_VERSION } from "../app-meta.js";
import { registerMjuLmsTools } from "../tools/index.js";
import {
  createAppContext,
  type AppContext
} from "./app-context.js";

export function createMcpServer(context: AppContext = createAppContext()): McpServer {
  const server = new McpServer({
    name: APP_NAME,
    version: APP_VERSION
  });

  registerMjuLmsTools(server, context);
  return server;
}

export async function startStdioServer(
  context: AppContext = createAppContext()
): Promise<void> {
  const server = createMcpServer(context);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
