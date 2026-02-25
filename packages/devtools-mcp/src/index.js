#!/usr/bin/env node
/**
 * what-devtools-mcp — MCP server entry point.
 * Creates WS bridge on port 9229, registers 10 tools, connects MCP stdio transport.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBridge } from './bridge.js';
import { registerTools } from './tools.js';

const port = parseInt(process.env.WHAT_MCP_PORT || '9229', 10);

const bridge = createBridge({ port });

const server = new McpServer({
  name: 'what-devtools-mcp',
  version: '0.1.0',
});

registerTools(server, bridge);

const transport = new StdioServerTransport();
await server.connect(transport);
