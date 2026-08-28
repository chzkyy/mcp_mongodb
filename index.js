#!/usr/bin/env node
/**
 * mcp-mongodb — MCP (Model Context Protocol) server
 * untuk menghubungkan Claude ke MongoDB.
 *
 * Konfigurasi via environment variable:
 *   MONGODB_URI — URI koneksi (default: mongodb://localhost:27017)
 *   MONGODB_DB  — nama database default (opsional)
 *
 * Semua logging dikirim ke stderr; stdout khusus untuk protokol MCP.
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
    `[mcp-mongodb] Server MCP berjalan via stdio | URI: ${maskUri(MONGODB_URI)}${
      DEFAULT_DB ? ` | Database default: ${DEFAULT_DB}` : ""
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
