# mcp-mongodb

An MCP (**Model Context Protocol**) server that connects **Claude** to **MongoDB**.
With this server, Claude can explore, query, and modify your MongoDB databases
directly through conversation.

## Features / Tools

| Category | Tool | Description |
|---|---|---|
| Info | `server_info` | Check MongoDB connection & version |
| | `list_databases` | List all databases + sizes |
| Database | `db_stats` | Database statistics |
| | `drop_database` | ⚠️ Drop a database (requires `confirm: true`) |
| Collection | `list_collections` | List collections in a database |
| | `collection_stats` | Collection statistics (document count, sizes) |
| | `create_collection` | Create a new collection |
| | `rename_collection` | Rename a collection |
| | `drop_collection` | ⚠️ Drop a collection along with its contents |
| Read data | `find` | Query documents (filter, projection, sort, limit, skip) |
| | `find_one` | Fetch a single document |
| | `get_by_id` | Fetch a document by `_id` (auto ObjectId conversion) |
| | `count` | Count matching documents |
| | `distinct` | Unique values of a field |
| | `aggregate` | Run an aggregation pipeline (`$match`, `$group`, `$lookup`, etc.) |
| Write data | `insert_one` / `insert_many` | Insert documents |
| | `update_one` / `update_many` | Update with operators (`$set`, `$inc`, ...) |
| | `replace_one` | Replace the entire contents of a document |
| | `delete_one` / `delete_many` | ⚠️ Delete documents (empty filter requires `confirm: true`) |
| Index | `create_index` / `drop_index` / `list_indexes` | Manage indexes |

## Requirements

- Node.js ≥ 18 (developed & tested on v22)
- A MongoDB server (local or MongoDB Atlas)

## Installation

```bash
cd d:\mcp_server\mcp_mongodb
npm install
```

## Environment Variable Configuration

| Variable | Required? | Default | Description |
|---|---|---|---|
| `MONGODB_URI` | No | `mongodb://localhost:27017` | MongoDB connection URI |
| `MONGODB_DB` | No | — | Default database name; if empty, every tool needs a database parameter |

Example Atlas URI:

```
mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

## Connecting to Claude Desktop

1. Open the configuration file:
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
     (usually `C:\Users\<YourName>\AppData\Roaming\Claude\claude_desktop_config.json`)
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Add the following entry (adjust the path and credentials):

```json
{
  "mcpServers": {
    "mongodb": {
      "command": "node",
      "args": ["d:\\mcp_server\\mcp_mongodb\\index.js"],
      "env": {
        "MONGODB_URI": "mongodb://localhost:27017",
        "MONGODB_DB": "your_database_name"
      }
    }
  }
}
```

3. Save the file, then **restart Claude Desktop** (quit completely, then reopen).
4. The hammer/toolbar icon in the chat box will show the mcp-mongodb tools.

### Example usage in Claude

- *"Show all MongoDB databases"* → `list_databases`
- *"What collections are in the store database?"* → `list_collections`
- *"Find the 10 best-selling products, sorted by most sales"* → `find` with `sort` + `limit`
- *"Add a new product named 'Kopi Arabika' priced at 85000"* → `insert_one`
- *"Increase the stock of all products in the 'minuman' category by 10"* → `update_many`
- *"What is the total sales per month?"* → `aggregate` with `$group`
- *"Create a unique index on the email field of the users collection"* → `create_index`

## Testing

Protocol smoke test (does not require MongoDB to be running):

```bash
npm test
```

Expected output:

```
PASS: initialize — server=mcp-mongodb v1.0.0
PASS: tools/list — 25 tools registered
PASS: core tools available — all present
PASS: tools/call responds
```

> A `server_info` call during the smoke test will show an error message if MongoDB
> is not running — that is normal and actually proves the RPC path works.

## Security Notes

- **Use a MongoDB account with the least privileges** required. If you only want
  Claude to read data, create a read-only user in MongoDB/Atlas.
- Do not store passwords in files committed to git. For production, consider
  storing `MONGODB_URI` in the system environment rather than in a JSON config file.
- Destructive operations are protected: `drop_database` and `delete_many` with an empty
  filter require explicit confirmation (`confirm: true`), but `update_many` / `delete_many`
  with a specific filter still run directly — always review Claude's intended action plan
  before approving.
- Query output is capped (default 50 documents, maximum 1000) so it does not exceed
  Claude's context.

## Troubleshooting

| Problem | Solution |
|---|---|
| Tools do not appear in Claude | Make sure the `node` and `index.js` paths are correct; check the MCP logs in Claude Desktop (Settings ▸ Developer) |
| `ServerSelectionTimeoutError` | MongoDB is not running / wrong URI / IP not whitelisted (Atlas) |
| `Authentication failed` | Check username/password and `authSource` in the URI |
| `\` character on Windows | Use double backslash (`\\`) or forward slash (`/`) in the JSON config |

## Project Structure

```
mcp_mongodb/
├── index.js           # Entry point: McpServer + StdioServerTransport
├── lib/
│   ├── connection.js  # Singleton MongoClient (lazy connect), env config
│   ├── helpers.js     # Result builder, JSON parser, ObjectId utils
│   └── schemas.js     # Shared Zod schemas
├── tools/
│   ├── admin.js       # Server, database, and collection info
│   ├── query.js       # Data reading & aggregation
│   ├── documents.js   # Insert/update/replace/delete
│   └── indexes.js     # Index management
└── test-smoke.js      # JSON-RPC smoke test over stdio
```