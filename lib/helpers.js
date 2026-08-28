import { ObjectId } from "mongodb";

export const MAX_DOCS = 1000;
export const DEFAULT_FIND_LIMIT = 50;
const MAX_OUTPUT_CHARS = 700000;

/** JSON.stringify dengan konversi ObjectId otomatis ke string hex */
export function jsonify(value) {
  return JSON.stringify(
    value,
    (_key, v) => (v instanceof ObjectId ? v.toHexString() : v),
    2
  );
}

/** Membuat hasil tool sukses (MCP content text) dengan pembatasan ukuran output */
export function ok(value) {
  const text = typeof value === "string" ? value : jsonify(value);
  if (text.length > MAX_OUTPUT_CHARS) {
    return {
      content: [
        {
          type: "text",
          text:
            text.slice(0, MAX_OUTPUT_CHARS) +
            "\n\n... [output dipotong karena terlalu besar, persempit query Anda]",
        },
      ],
    };
  }
  return { content: [{ type: "text", text }] };
}

/** Membuat hasil tool error (MCP isError) dengan pesan yang ramah */
export function fail(error) {
  let message = error?.message || String(error);
  if (error?.name === "MongoServerSelectionError") {
    message =
      "Tidak dapat terhubung ke server MongoDB. Pastikan server berjalan dan MONGODB_URI benar.\n" +
      `Detail: ${message}`;
  }
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/**
 * Menerima parameter sebagai objek langsung ATAU string JSON (Claude
 * kadang mengirim JSON sebagai string), lalu mengembalikan objeknya.
 */
export function parseJson(value, name) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(
      `Parameter '${name}' bukan JSON yang valid: ${String(value).slice(0, 120)}`
    );
  }
}

/** Mengubah string hex 24 karakter menjadi ObjectId, selain itu dikembalikan apa adanya */
export function maybeObjectId(value) {
  if (typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value)) {
    return new ObjectId(value);
  }
  return value;
}

/** Konversi ObjectId menjadi string hex (untuk dimasukkan ke hasil JSON) */
export function idToString(value) {
  return value instanceof ObjectId ? value.toHexString() : value;
}

/**
 * Memastikan dokumen update memakai operator atomik.
 * Jika tidak ada operator $ sama sekali, bungkus otomatis dengan $set.
 */
export function normalizeUpdate(update) {
  if (update === null || typeof update !== "object" || Array.isArray(update)) {
    throw new Error("'update' harus berupa objek dokumen update MongoDB.");
  }
  const keys = Object.keys(update);
  const hasOperator = keys.some((k) => k.startsWith("$"));
  if (!hasOperator && keys.length > 0) {
    return { $set: update };
  }
  return update;
}

/** Batasi nilai limit ke rentang [1, MAX_DOCS] dengan nilai fallback */
export function clampLimit(limit, fallback) {
  const n = Number.isFinite(limit) ? Math.floor(limit) : fallback;
  return Math.min(Math.max(1, n), MAX_DOCS);
}

/** Ambil hanya opsi index yang dikenal dari objek opsi bebas */
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
 * Membuat fungsi registrasi tool yang membungkus handler dengan
 * try/catch sehingga error apapun dikembalikan sebagai isError result.
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
