import { ObjectId } from "mongodb";

export const MAX_DOCS = 1000;
export const DEFAULT_FIND_LIMIT = 50;
const MAX_OUTPUT_CHARS = 700000;

/** JSON.stringify with automatic ObjectId conversion to hex string */
export function jsonify(value) {
  return JSON.stringify(
    value,
    (_key, v) => (v instanceof ObjectId ? v.toHexString() : v),
    2
  );
}

/** Builds a successful tool result (MCP text content) with output size limiting */
export function ok(value) {
  const text = typeof value === "string" ? value : jsonify(value);
  if (text.length > MAX_OUTPUT_CHARS) {
    return {
      content: [
        {
          type: "text",
          text:
            text.slice(0, MAX_OUTPUT_CHARS) +
            "\n\n... [output truncated because it was too large, narrow your query]",
        },
      ],
    };
  }
  return { content: [{ type: "text", text }] };
}

/** Builds a tool error result (MCP isError) with a friendly message */
export function fail(error) {
  let message = error?.message || String(error);
  if (error?.name === "MongoServerSelectionError") {
    message =
      "Cannot connect to the MongoDB server. Make sure the server is running and MONGODB_URI is correct.\n" +
      `Detail: ${message}`;
  }
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/**
 * Accepts a parameter either as a plain object OR as a JSON string (Claude
 * sometimes sends JSON as a string), then returns the object.
 */
export function parseJson(value, name) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(
      `Parameter '${name}' is not valid JSON: ${String(value).slice(0, 120)}`
    );
  }
}

/** Converts a 24-character hex string into an ObjectId; otherwise returned as-is */
export function maybeObjectId(value) {
  if (typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value)) {
    return new ObjectId(value);
  }
  return value;
}

/** Converts an ObjectId to a hex string (for embedding into JSON results) */
export function idToString(value) {
  return value instanceof ObjectId ? value.toHexString() : value;
}

/**
 * Ensures an update document uses atomic operators.
 * If there is no $ operator at all, auto-wrap it with $set.
 */
export function normalizeUpdate(update) {
  if (update === null || typeof update !== "object" || Array.isArray(update)) {
    throw new Error("'update' must be a MongoDB update document object.");
  }
  const keys = Object.keys(update);
  const hasOperator = keys.some((k) => k.startsWith("$"));
  if (!hasOperator && keys.length > 0) {
    return { $set: update };
  }
  return update;
}

/** Clamps a limit value to the range [1, MAX_DOCS] with a fallback value */
export function clampLimit(limit, fallback) {
  const n = Number.isFinite(limit) ? Math.floor(limit) : fallback;
  return Math.min(Math.max(1, n), MAX_DOCS);
}

/** Picks only the known index options from a free-form options object */
export function pickIndexOptions(options) {
  const src = options && typeof options === "object" ? options : {};
  const out = {};
  for (const key of [
    "name",
    "unique",
    "sparse",
    "expireAfterSeconds",
    "partialFilterExpression",
    "collation",
  ]) {
    if (src[key] !== undefined) out[key] = src[key];
  }
  return out;
}

/**
 * Creates a tool registration function that wraps the handler in a
 * try/catch so that any error is returned as an isError result.
 */
export function registrar(server) {
  return (name, description, inputSchema, handler, annotations) =>
    server.registerTool(
      name,
      {
        description,
        inputSchema,
        ...(annotations ? { annotations } : {}),
      },
      async (args) => {
        try {
          return ok(await handler(args ?? {}));
        } catch (e) {
          return fail(e);
        }
      }
    );
}
