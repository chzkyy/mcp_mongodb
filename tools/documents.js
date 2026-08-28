import { z } from "zod";
import { getDb } from "../lib/connection.js";
import {
  registrar,
  parseJson,
  idToString,
  normalizeUpdate,
} from "../lib/helpers.js";
import * as S from "../lib/schemas.js";

function ensureObject(value, name, { allowEmpty = false } = {}) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`'${name}' harus berupa objek JSON.`);
  }
  if (!allowEmpty && Object.keys(value).length === 0) {
    throw new Error(`'${name}' tidak boleh kosong.`);
  }
  return value;
}

async function withCollection(a) {
  const db = await getDb(a.database);
  return { db, col: db.collection(a.collection) };
}

function updateResult(res) {
  return {
    matchedCount: res.matchedCount,
    modifiedCount: res.modifiedCount,
    upsertedId: res.upsertedId ? idToString(res.upsertedId) : null,
  };
}

/** Tools penulisan data: insert, update, replace, delete */
export function registerDocumentTools(server) {
  const reg = registrar(server);

  reg(
    "insert_one",
    "Sisipkan SATU dokumen baru ke dalam koleksi. Mengembalikan _id dokumen yang dibuat.",
    {
      database: S.DatabaseArg,
      collection: S.CollectionArg,
      document: S.DocumentArg,
    },
    async (a) => {
      const doc = ensureObject(parseJson(a.document, "document"), "document");
      const { db, col } = await withCollection(a);
      const res = await col.insertOne(doc);
      return {
        insertedInto: `${db.databaseName}.${a.collection}`,
        insertedId: idToString(res.insertedId),
      };
    }
  );

  reg(
    "insert_many",
    "Sisipkan BANYAK dokumen sekaligus ke dalam koleksi.",
    {
      database: S.DatabaseArg,
      collection: S.CollectionArg,
      documents: S.DocumentsArrayArg,
    },
    async (a) => {
      const docs = parseJson(a.documents, "documents");
      if (!Array.isArray(docs) || docs.length === 0) {
        throw new Error("'documents' harus array berisi minimal satu dokumen.");
      }
      const { db, col } = await withCollection(a);
      const res = await col.insertMany(docs);
      const insertedIds = {};
      for (const [k, v] of Object.entries(res.insertedIds)) {
        insertedIds[k] = idToString(v);
      }
      return {
        insertedInto: `${db.databaseName}.${a.collection}`,
        insertedCount: res.insertedCount,
        insertedIds,
      };
    }
  );

  reg(
    "update_one",
    "Perbarui DOKUMEN PERTAMA yang cocok dengan filter menggunakan operator update.",
    {
      database: S.DatabaseArg,
      collection: S.CollectionArg,
      filter: S.FilterArg,
      update: S.UpdateArg,
      upsert: S.UpsertArg,
    },
    async (a) => {
      const filter = ensureObject(parseJson(a.filter, "filter"), "filter");
      const update = normalizeUpdate(parseJson(a.update, "update"));
      const { col } = await withCollection(a);
      return updateResult(await col.updateOne(filter, update, { upsert: Boolean(a.upsert) }));
    }
  );

  reg(
    "update_many",
    "Perbarui SEMUA dokumen yang cocok dengan filter menggunakan operator update.",
    {
      database: S.DatabaseArg,
      collection: S.CollectionArg,
      filter: S.FilterArg,
      update: S.UpdateArg,
      upsert: S.UpsertArg,
    },
    async (a) => {
      const filter = parseJson(a.filter, "filter") ?? {};
      const update = normalizeUpdate(parseJson(a.update, "update"));
      const { col } = await withCollection(a);
      return updateResult(await col.updateMany(filter, update, { upsert: Boolean(a.upsert) }));
    }
  );

  reg(
    "replace_one",
    "Ganti seluruh isi satu dokumen yang cocok dengan filter dengan dokumen baru.",
    {
      database: S.DatabaseArg,
      collection: S.CollectionArg,
      filter: S.FilterArg,
      replacement: S.ReplacementArg,
      upsert: S.UpsertArg,
    },
    async (a) => {
      const filter = ensureObject(parseJson(a.filter, "filter"), "filter");
      const replacement = ensureObject(parseJson(a.replacement, "replacement"), "replacement");
      if (Object.keys(replacement).some((k) => k.startsWith("$"))) {
        throw new Error("'replacement' tidak boleh mengandung operator $. Gunakan update_one/update_many.");
      }
      const { col } = await withCollection(a);
      return updateResult(await col.replaceOne(filter, replacement, { upsert: Boolean(a.upsert) }));
    }
  );

  reg(
    "delete_one",
    "Hapus SATU dokumen pertama yang cocok dengan filter.",
    {
      database: S.DatabaseArg,
      collection: S.CollectionArg,
      filter: S.FilterArg,
    },
    async (a) => {
      const filter = ensureObject(parseJson(a.filter, "filter"), "filter");
      const { col } = await withCollection(a);
      const res = await col.deleteOne(filter);
      return {
        deletedCount: res.deletedCount,
        ...(res.deletedCount === 0 ? { note: "Tidak ada dokumen yang cocok." } : {}),
      };
    },
    { destructiveHint: true }
  );

  reg(
    "delete_many",
    "PERINGATAN: Hapus SEMUA dokumen yang cocok dengan filter! Filter kosong ({}) hanya diizinkan bila confirm: true.",
    {
      database: S.DatabaseArg,
      collection: S.CollectionArg,
      filter: S.FilterArg,
      confirm: S.ConfirmArg,
    },
    async (a) => {
      const filter = parseJson(a.filter, "filter") ?? {};
      if (Object.keys(filter).length === 0 && !a.confirm) {
        throw new Error(
          "Filter kosong akan menghapus SEMUA dokumen dalam koleksi. Set 'confirm': true jika benar-benar yakin."
        );
      }
      const { col } = await withCollection(a);
      const res = await col.deleteMany(filter);
      return {
        deletedCount: res.deletedCount,
        ...(res.deletedCount === 0 ? { note: "Tidak ada dokumen yang cocok." } : {}),
      };
    },
    { destructiveHint: true }
  );
}

