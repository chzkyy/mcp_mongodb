import { z } from "zod";
import { getClient, getDb } from "../lib/connection.js";
import { registrar } from "../lib/helpers.js";
import {
  DatabaseArg,
  DatabaseRequired,
  CollectionArg,
} from "../lib/schemas.js";

/** Tools administratif: info server, database, dan koleksi */
export function registerAdminTools(server) {
  const reg = registrar(server);

  reg(
    "server_info",
    "Cek koneksi dan ambil informasi server MongoDB (versi, host, status replikasi). Gunakan ini untuk memastikan koneksi berjalan.",
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
    "Daftar semua database yang tersedia beserta ukurannya.",
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
    "Daftar semua koleksi di dalam sebuah database.",
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
    "Statistik database: jumlah koleksi, objek, ukuran data, dan index.",
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
    "Statistik koleksi: jumlah dokumen, ukuran rata-rata, ukuran storage, dan index.",
    { database: DatabaseArg, collection: CollectionArg },
    async (a) => {
      const db = await getDb(a.database);
      const rows = await db
        .collection(a.collection)
        .aggregate([{ $collStats: { storageStats: {} } }])
        .toArray();
      if (!rows || rows.length === 0) {
        throw new Error(`Koleksi '${a.collection}' tidak ditemukan.`);
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
    "Membuat koleksi baru di dalam sebuah database.",
    { database: DatabaseArg, collection: CollectionArg },
    async (a) => {
      const db = await getDb(a.database);
      await db.createCollection(a.collection);
      return { created: `${db.databaseName}.${a.collection}` };
    }
  );

  reg(
    "rename_collection",
    "Mengganti nama sebuah koleksi.",
    {
      database: DatabaseArg,
      collection: CollectionArg,
      newName: z.string().min(1).describe("Nama baru untuk koleksi."),
      dropTarget: z
        .boolean()
        .optional()
        .describe("Hapus koleksi tujuan bila namanya sudah dipakai (default false)."),
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
    "PERINGATAN: Menghapus koleksi BESERTA SELURUH ISINYA secara permanen!",
    { database: DatabaseArg, collection: CollectionArg },
    async (a) => {
      const db = await getDb(a.database);
      const dropped = await db.collection(a.collection).drop().catch((e) => {
        if (e?.codeName === "NamespaceNotFound") return false;
        throw e;
      });
      return dropped
        ? { dropped: `${db.databaseName}.${a.collection}` }
        : { message: `Koleksi '${a.collection}' tidak ditemukan, tidak ada yang dihapus.` };
    },
    { destructiveHint: true }
  );

  reg(
    "drop_database",
    "PERINGATAN: Menghapus seluruh database beserta semua koleksinya secara permanen! Wajib set confirm: true.",
    {
      database: DatabaseRequired,
      confirm: z.boolean().describe("Wajib bernilai true sebagai konfirmasi penghapusan."),
    },
    async (a) => {
      if (!a.confirm) {
        throw new Error("Operasi dibatalkan. Set 'confirm': true jika benar-benar ingin menghapus database.");
      }
      const db = await getDb(a.database);
      await db.dropDatabase();
      return { dropped: db.databaseName };
    },
    { destructiveHint: true }
  );
}
