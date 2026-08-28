import { z } from "zod";
import { getDb } from "../lib/connection.js";
import {
  registrar,
  parseJson,
  maybeObjectId,
  clampLimit,
  DEFAULT_FIND_LIMIT,
} from "../lib/helpers.js";
import * as S from "../lib/schemas.js";

/** Tools pembacaan data: find, findOne, get_by_id, count, distinct, aggregate, list_indexes */
export function registerQueryTools(server) {
  const reg = registrar(server);

  reg(
    "find",
    "Cari dokumen dalam koleksi dengan filter opsional, proyeksi field, urutan, dan paginasi.",
    {
      database: S.DatabaseArg,
      collection: S.CollectionArg,
      filter: S.FilterArg,
      projection: S.ProjectionArg,
      sort: S.SortArg,
      limit: S.LimitArg,
      skip: S.SkipArg,
    },
    async (a) => {
      const db = await getDb(a.database);
      const filter = parseJson(a.filter, "filter") ?? {};
      const projection = parseJson(a.projection, "projection");
      const sort = parseJson(a.sort, "sort");
      const limit = clampLimit(a.limit, DEFAULT_FIND_LIMIT);

      let cursor = db.collection(a.collection).find(filter, projection ? { projection } : {});
      if (sort) cursor = cursor.sort(sort);
      if (a.skip) cursor = cursor.skip(a.skip);
      cursor = cursor.limit(limit);

      const documents = await cursor.toArray();
      return {
        database: db.databaseName,
        collection: a.collection,
        returned: documents.length,
        appliedLimit: limit,
        hasMore: documents.length === limit,
        documents,
      };
    },
    { readOnlyHint: true }
  );

  reg(
    "find_one",
    "Ambil SATU dokumen pertama yang cocok dengan filter.",
    {
      database: S.DatabaseArg,
      collection: S.CollectionArg,
      filter: S.FilterArg,
      projection: S.ProjectionArg,
    },
    async (a) => {
      const db = await getDb(a.database);
      const filter = parseJson(a.filter, "filter") ?? {};
      const projection = parseJson(a.projection, "projection");
      const doc = await db
        .collection(a.collection)
        .findOne(filter, projection ? { projection } : {});
      return doc ?? { message: "Dokumen tidak ditemukan." };
    },
    { readOnlyHint: true }
  );

  reg(
    "get_by_id",
    "Ambil satu dokumen berdasarkan _id. String hex 24 karakter otomatis dikonversi menjadi ObjectId.",
    {
      database: S.DatabaseArg,
      collection: S.CollectionArg,
      id: z.string().min(1).describe('Nilai _id dokumen. Contoh: "665f1c9e2f8b3a0012ab34cd".'),
    },
    async (a) => {
      const db = await getDb(a.database);
      const doc = await db
        .collection(a.collection)
        .findOne({ _id: maybeObjectId(a.id) });
      return doc ?? { message: `Dokumen dengan _id '${a.id}' tidak ditemukan.` };
    },
    { readOnlyHint: true }
  );

  reg(
    "count",
    "Menghitung jumlah dokumen yang cocok dengan filter.",
    {
      database: S.DatabaseArg,
      collection: S.CollectionArg,
      filter: S.FilterArg,
    },
    async (a) => {
      const db = await getDb(a.database);
      const filter = parseJson(a.filter, "filter") ?? {};
      const count = await db.collection(a.collection).countDocuments(filter);
      return { database: db.databaseName, collection: a.collection, count };
    },
    { readOnlyHint: true }
  );

  reg(
    "distinct",
    "Ambil daftar nilai unik dari sebuah field (opsional dengan filter).",
    {
      database: S.DatabaseArg,
      collection: S.CollectionArg,
      field: z.string().min(1).describe("Nama field yang ingin diambil nilai uniknya."),
      filter: S.FilterArg,
    },
    async (a) => {
      const db = await getDb(a.database);
      const filter = parseJson(a.filter, "filter") ?? {};
      const values = await db
        .collection(a.collection)
        .distinct(a.field, filter);
      return {
        field: a.field,
        distinctCount: values.length,
        values,
      };
    },
    { readOnlyHint: true }
  );

  reg(
    "aggregate",
    "Jalankan aggregation pipeline MongoDB untuk analisis data (grouping, join via $lookup, dsb).",
    {
      database: S.DatabaseArg,
      collection: S.CollectionArg,
      pipeline: S.PipelineArg,
      limit: S.LimitArg,
    },
    async (a) => {
      const db = await getDb(a.database);
      const pipeline = parseJson(a.pipeline, "pipeline");
      if (!Array.isArray(pipeline)) {
        throw new Error("'pipeline' harus berupa array of stages.");
      }
      const limit = clampLimit(a.limit, 200);
      let docs = await db
        .collection(a.collection)
        .aggregate(pipeline, { allowDiskUse: true })
        .toArray();

      const totalBeforeLimit = docs.length;
      const truncated = docs.length > limit;
      if (truncated) docs = docs.slice(0, limit);

      return {
        returned: docs.length,
        totalBeforeLimit,
        truncated,
        documents: docs,
      };
    },
    { readOnlyHint: true }
  );

  reg(
    "list_indexes",
    "Daftar semua index pada sebuah koleksi.",
    { database: S.DatabaseArg, collection: S.CollectionArg },
    async (a) => {
      const db = await getDb(a.database);
      const indexes = await db.collection(a.collection).listIndexes().toArray();
      return {
        collection: a.collection,
        count: indexes.length,
        indexes,
      };
    },
    { readOnlyHint: true }
  );
}
