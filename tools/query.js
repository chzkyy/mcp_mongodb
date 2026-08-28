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

/** Data reading tools: find, findOne, get_by_id, count, distinct, aggregate, list_indexes */
export function registerQueryTools(server) {
  const reg = registrar(server);

  reg(
    "find",
    "Search for documents in a collection with an optional filter, field projection, ordering, and pagination.",
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
    "Fetch the FIRST document matching the filter.",
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
      return doc ?? { message: "Document not found." };
    },
    { readOnlyHint: true }
  );

  reg(
    "get_by_id",
    "Fetch one document by _id. A 24-character hex string is automatically converted to an ObjectId.",
    {
      database: S.DatabaseArg,
      collection: S.CollectionArg,
      id: z.string().min(1).describe('The _id value of the document. Example: "665f1c9e2f8b3a0012ab34cd".'),
    },
    async (a) => {
      const db = await getDb(a.database);
      const doc = await db
        .collection(a.collection)
        .findOne({ _id: maybeObjectId(a.id) });
      return doc ?? { message: `Document with _id '${a.id}' was not found.` };
    },
    { readOnlyHint: true }
  );

  reg(
    "count",
    "Count the number of documents matching the filter.",
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
    "Fetch a list of unique values of a field (optionally with a filter).",
    {
      database: S.DatabaseArg,
      collection: S.CollectionArg,
      field: z.string().min(1).describe("The field name whose unique values you want to fetch."),
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
    "Run a MongoDB aggregation pipeline for data analysis (grouping, join via $lookup, etc.).",
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
        throw new Error("'pipeline' must be an array of stages.");
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
    "List all indexes on a collection.",
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
