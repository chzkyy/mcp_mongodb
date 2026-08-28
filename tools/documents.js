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
    throw new Error(`'${name}' must be a JSON object.`);
  }
  if (!allowEmpty && Object.keys(value).length === 0) {
    throw new Error(`'${name}' must not be empty.`);
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

/** Data writing tools: insert, update, replace, delete */
export function registerDocumentTools(server) {
  const reg = registrar(server);

  reg(
    "insert_one",
    "Insert ONE new document into the collection. Returns the _id of the created document.",
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
    "Insert MANY documents into the collection at once.",
    {
      database: S.DatabaseArg,
      collection: S.CollectionArg,
      documents: S.DocumentsArrayArg,
    },
    async (a) => {
      const docs = parseJson(a.documents, "documents");
      if (!Array.isArray(docs) || docs.length === 0) {
        throw new Error("'documents' must be an array containing at least one document.");
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
    "Update the FIRST document matching the filter using update operators.",
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
    "Update ALL documents matching the filter using update operators.",
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
    "Replace the entire contents of one document matching the filter with a new document.",
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
        throw new Error("'replacement' must not contain $ operators. Use update_one/update_many instead.");
      }
      const { col } = await withCollection(a);
      return updateResult(await col.replaceOne(filter, replacement, { upsert: Boolean(a.upsert) }));
    }
  );

  reg(
    "delete_one",
    "Delete the FIRST document matching the filter.",
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
        ...(res.deletedCount === 0 ? { note: "No documents matched." } : {}),
      };
    },
    { destructiveHint: true }
  );

  reg(
    "delete_many",
    "WARNING: Delete ALL documents matching the filter! An empty filter ({}) is only allowed when confirm: true.",
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
          "An empty filter will delete ALL documents in the collection. Set 'confirm': true if you are really sure."
        );
      }
      const { col } = await withCollection(a);
      const res = await col.deleteMany(filter);
      return {
        deletedCount: res.deletedCount,
        ...(res.deletedCount === 0 ? { note: "No documents matched." } : {}),
      };
    },
    { destructiveHint: true }
  );
}

