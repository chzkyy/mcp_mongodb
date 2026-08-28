import { z } from "zod";
import { getDb } from "../lib/connection.js";
import { registrar, parseJson, pickIndexOptions } from "../lib/helpers.js";
import * as S from "../lib/schemas.js";

/** Tools manajemen index */
export function registerIndexTools(server) {
  const reg = registrar(server);

  reg(
    "create_index",
    "Membuat index pada koleksi untuk mempercepat query atau menegakkan unique constraint.",
    {
      database: S.DatabaseArg,
      collection: S.CollectionArg,
      keys: S.IndexKeysArg,
      options: S.IndexOptionsArg,
    },
    async (a) => {
      const keys = parseJson(a.keys, "keys");
      if (!keys || typeof keys !== "object" || Array.isArray(keys) || Object.keys(keys).length === 0) {
        throw new Error("'keys' harus objek spesifikasi index, contoh: {\"email\": 1}.");
      }
      const options = pickIndexOptions(parseJson(a.options, "options"));
      const db = await getDb(a.database);
      const indexName = await db.collection(a.collection).createIndex(keys, options);
      return {
        createdIndex: indexName,
        on: `${db.databaseName}.${a.collection}`,
        keys,
        options,
      };
    }
  );

  reg(
    "drop_index",
    "Hapus index berdasarkan nama (index default '_id_' tidak dapat dihapus).",
    {
      database: S.DatabaseArg,
      collection: S.CollectionArg,
      indexName: z.string().min(1).describe("Nama index yang akan dihapus, contoh: 'email_1'."),
    },
    async (a) => {
      const db = await getDb(a.database);
      await db.collection(a.collection).dropIndex(a.indexName);
      return { droppedIndex: a.indexName, on: `${db.databaseName}.${a.collection}` };
    },
    { destructiveHint: true }
  );
}
