#!/usr/bin/env node
/**
 * mcp-mongodb — MCP (Model Context Protocol) server
 * to connect Claude to MongoDB.
 *
 * Configuration via environment variables:
 *   MONGODB_URI — connection URI (default: mongodb://localhost:27017)
 *   MONGODB_DB  — default database name (optional)
 *
 * All logging goes to stderr; stdout is reserved for the MCP protocol.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MONGODB_URI, DEFAULT_DB, maskUri, closeClient } from "./lib/connection.js";
import { registerAdminTools } from "./tools/admin.js";
import { registerQueryTools } from "./tools/query.js";
import { registerDocumentTools } from "./tools/documents.js";
import { registerIndexTools } from "./tools/indexes.js";

const server = new McpServer({
  name: "mcp-mongodb",
  version: "1.0.0",
});

registerAdminTools(server);
registerQueryTools(server);
registerDocumentTools(server);
registerIndexTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[mcp-mongodb] MCP server running over stdio | URI: ${maskUri(MONGODB_URI)}${
      DEFAULT_DB ? ` | Default database: ${DEFAULT_DB}` : ""
    }`
  );
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void closeClient().finally(() => process.exit(0));
  });
}

process.on("unhandledRejection", (err) => {
  console.error("[mcp-mongodb] Unhandled rejection:", err);
});

await main();
