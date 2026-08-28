import { z } from "zod";
import { getClient, getDb } from "../lib/connection.js";
import { registrar } from "../lib/helpers.js";
import {
  DatabaseArg,
  DatabaseRequired,
  CollectionArg,
} from "../lib/schemas.js";

/** Administrative tools: server info, databases, and collections */
export function registerAdminTools(server) {
  const reg = registrar(server);

  reg(
    "server_info",
    "Check the connection and fetch MongoDB server information (version, host, replication status). Use this to verify the connection is working.",
    {},
    async () => {
      const client = await getClient();
      const buildInfo = await client.db("admin").command({ buildInfo: 1 });
      const hello = await client
        .db("admin")
        .command({ hello: 1 })
        .catch(() => ({}));
      return {
        connected: true,
        mongodbVersion: buildInfo.version,
        host: hello.me ?? null,
        isWritablePrimary: hello.isWritablePrimary ?? null,
        replicaSet: hello.setName ?? null,
      };
    },
    { readOnlyHint: true }
  );

  reg(
    "list_databases",
    "List all available databases along with their sizes.",
    {},
    async () => {
      const client = await getClient();
      const res = await client.db("admin").command({ listDatabases: 1 });
      return {
        totalSizeBytes: res.totalSize,
        databases: res.databases.map((d) => ({
          name: d.name,
          sizeOnDiskBytes: d.sizeOnDisk,
          empty: d.empty,
        })),
      };
    },
    { readOnlyHint: true }
  );

  reg(
    "list_collections",
    "List all collections inside a database.",
    { database: DatabaseArg },
    async (a) => {
      const db = await getDb(a.database);
      const cols = await db.listCollections().toArray();
      return {
        database: db.databaseName,
        count: cols.length,
        collections: cols.map((c) => ({
          name: c.name,
          type: c.type || "collection",
          ...(c.options?.capped ? { capped: true } : {}),
        })),
      };
    },
    { readOnlyHint: true }
  );

  reg(
    "db_stats",
    "Database statistics: number of collections, objects, data size, and indexes.",
    { database: DatabaseArg },
    async (a) => {
      const db = await getDb(a.database);
      const s = await db.command({ dbStats: 1 });
      return {
        db: s.db,
        collections: s.collections,
        views: s.views,
        objects: s.objects,
        dataSizeBytes: s.dataSize,
        storageSizeBytes: s.storageSize,
        indexes: s.indexes,
        indexSizeBytes: s.indexSize,
      };
    },
    { readOnlyHint: true }
  );

  reg(
    "collection_stats",
    "Collection statistics: document count, average size, storage size, and indexes.",
    { database: DatabaseArg, collection: CollectionArg },
    async (a) => {
      const db = await getDb(a.database);
      const rows = await db
        .collection(a.collection)
        .aggregate([{ $collStats: { storageStats: {} } }])
        .toArray();
      if (!rows || rows.length === 0) {
        throw new Error(`Collection '${a.collection}' was not found.`);
      }
      const st = rows[0].storageStats || {};
      return {
        ns: rows[0].ns,
        host: rows[0].host,
        count: st.count,
        avgObjSizeBytes: st.avgObjSize,
        sizeBytes: st.size,
        storageSizeBytes: st.storageSize,
        indexes: st.nindexes,
        totalIndexSizeBytes: st.totalIndexSize,
      };
    },
    { readOnlyHint: true }
  );

  reg(
    "create_collection",
    "Create a new collection inside a database.",
    { database: DatabaseArg, collection: CollectionArg },
    async (a) => {
      const db = await getDb(a.database);
      await db.createCollection(a.collection);
      return { created: `${db.databaseName}.${a.collection}` };
    }
  );

  reg(
    "rename_collection",
    "Rename a collection.",
    {
      database: DatabaseArg,
      collection: CollectionArg,
      newName: z.string().min(1).describe("The new name for the collection."),
      dropTarget: z
        .boolean()
        .optional()
        .describe("Drop the target collection if the name is already in use (default false)."),
    },
    async (a) => {
      const db = await getDb(a.database);
      await db.collection(a.collection).renameCollection(a.newName, Boolean(a.dropTarget));
      return {
        renamed: `${db.databaseName}.${a.collection}`,
        to: `${db.databaseName}.${a.newName}`,
      };
    }
  );

  reg(
    "drop_collection",
    "WARNING: Permanently deletes a collection together with ALL of its contents!",
    { database: DatabaseArg, collection: CollectionArg },
    async (a) => {
      const db = await getDb(a.database);
      const dropped = await db.collection(a.collection).drop().catch((e) => {
        if (e?.codeName === "NamespaceNotFound") return false;
        throw e;
      });
      return dropped
        ? { dropped: `${db.databaseName}.${a.collection}` }
        : { message: `Collection '${a.collection}' was not found, nothing was deleted.` };
    },
    { destructiveHint: true }
  );

  reg(
    "drop_database",
    "WARNING: Permanently deletes an entire database along with all of its collections! Must set confirm: true.",
    {
      database: DatabaseRequired,
      confirm: z.boolean().describe("Must be true as confirmation of the deletion."),
    },
    async (a) => {
      if (!a.confirm) {
        throw new Error("Operation cancelled. Set 'confirm': true if you really want to delete the database.");
      }
      const db = await getDb(a.database);
      await db.dropDatabase();
      return { dropped: db.databaseName };
    },
    { destructiveHint: true }
  );
}
