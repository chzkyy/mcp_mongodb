import { z } from "zod";
import { getDb } from "../lib/connection.js";
import { registrar, parseJson, pickIndexOptions } from "../lib/helpers.js";
import * as S from "../lib/schemas.js";

/** Index management tools */
export function registerIndexTools(server) {
  const reg = registrar(server);

  reg(
    "create_index",
    "Create an index on a collection to speed up queries or enforce a unique constraint.",
    {
      database: S.DatabaseArg,
      collection: S.CollectionArg,
      keys: S.IndexKeysArg,
      options: S.IndexOptionsArg,
    },
    async (a) => {
      const keys = parseJson(a.keys, "keys");
      if (!keys || typeof keys !== "object" || Array.isArray(keys) || Object.keys(keys).length === 0) {
        throw new Error("'keys' must be an index specification object, for example: {\"email\": 1}.");
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
    "Drop an index by name (the default '_id_' index cannot be dropped).",
    {
      database: S.DatabaseArg,
      collection: S.CollectionArg,
      indexName: z.string().min(1).describe("The name of the index to drop, e.g. 'email_1'."),
    },
    async (a) => {
      const db = await getDb(a.database);
      await db.collection(a.collection).dropIndex(a.indexName);
      return { droppedIndex: a.indexName, on: `${db.databaseName}.${a.collection}` };
    },
    { destructiveHint: true }
  );
}
