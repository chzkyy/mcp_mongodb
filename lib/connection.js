import { MongoClient } from "mongodb";

/** MongoDB connection URI — read from the environment variable MONGODB_URI */
export const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";

/** Default database name (optional) — read from the environment variable MONGODB_DB */
export const DEFAULT_DB = process.env.MONGODB_DB || "";

let mongoClient = null;

/**
 * Returns the MongoClient instance (the connection is created once, lazily).
 * The connection is only opened the first time a tool is called, so the MCP
 * handshake stays fast and does not require MongoDB at startup.
 */
export async function getClient() {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGODB_URI, {
      appName: "mcp-mongodb",
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    await mongoClient.connect();
    await mongoClient.db("admin").command({ ping: 1 });
  }
  return mongoClient;
}

/**
 * Returns a database handle. Priority: the 'database' parameter,
 * then a fallback to MONGODB_DB. Throws if both are empty.
 */
export async function getDb(database) {
  const dbName = database || DEFAULT_DB;
  if (!dbName) {
    throw new Error(
      "Database name is unknown. Include the 'database' parameter or set the MONGODB_DB environment variable."
    );
  }
  const client = await getClient();
  return client.db(dbName);
}

/** Hides the password in a URI for logging purposes */
export function maskUri(uri) {
  return uri.replace(/\/\/([^:/@]+):[^@]*@/, "//$1:****@");
}

/** Closes the MongoDB connection (called on shutdown) */
export async function closeClient() {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
  }
}
