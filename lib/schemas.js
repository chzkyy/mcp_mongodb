import { z } from "zod";

export const DatabaseArg = z
  .string()
  .min(1)
  .optional()
  .describe("Name of the target database. Optional if MONGODB_DB is set.");

export const DatabaseRequired = z
  .string()
  .min(1)
  .describe("Name of the database.");

export const CollectionArg = z
  .string()
  .min(1)
  .describe("Name of the collection.");

export const FilterArg = z
  .any()
  .optional()
  .describe(
    'MongoDB query filter. Example: {"status": "active", "age": {"$gt": 25}}. Send as an object or a JSON string. Use {} to match all documents.'
  );

export const ProjectionArg = z
  .any()
  .optional()
  .describe('Projection of returned fields. Example: {"name": 1, "email": 1, "_id": 0}.');

export const SortArg = z
  .any()
  .optional()
  .describe('Result ordering. Example: {"createdAt": -1} for newest first, {"name": 1} for A-Z.');

export const LimitArg = z
  .coerce
  .number()
  .int()
  .min(1)
  .max(1000)
  .optional()
  .describe("Maximum number of documents to return (default 50, maximum 1000).");

export const SkipArg = z
  .coerce
  .number()
  .int()
  .min(0)
  .optional()
  .describe("Number of documents to skip (for pagination).");

export const UpsertArg = z
  .boolean()
  .optional()
  .describe("If true, create a new document when none matches the filter (default false).");

export const ConfirmArg = z
  .boolean()
  .optional()
  .describe("Set true to confirm a destructive operation.");

export const DocumentArg = z
  .any()
  .describe('A single JSON document to store. Example: {"name": "Budi", "age": 30, "tags": ["vip"]}.');

export const DocumentsArrayArg = z
  .any()
  .describe('An array of JSON documents to store at once. Example: [{"name": "Ani"}, {"name": "Budi"}].');

export const UpdateArg = z
  .any()
  .describe(
    'MongoDB update document. Use operators such as {"$set": {"age": 31}} or {"$inc": {"counter": 1}}. Without an operator it is auto-wrapped in "$set".'
  );

export const ReplacementArg = z
  .any()
  .describe("The FULL replacement document (no $ operators). The entire old document is replaced.");

export const PipelineArg = z
  .any()
  .describe(
    'MongoDB aggregation pipeline (array of stages). Example: [{"$match": {"status": "active"}}, {"$group": {"_id": "$category", "total": {"$sum": 1}}}].'
  );

export const IndexKeysArg = z
  .any()
  .describe('Index key definition. Example: {"email": 1} ascending, {"createdAt": -1} descending.');

export const IndexOptionsArg = z
  .any()
  .optional()
  .describe('Index options. Example: {"unique": true, "name": "email_unique", "expireAfterSeconds": 3600}.');
