import { MongoClient } from "mongodb";

/** URI koneksi MongoDB — diambil dari environment variable MONGODB_URI */
export const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";

/** Nama database default (opsional) — diambil dari environment variable MONGODB_DB */
export const DEFAULT_DB = process.env.MONGODB_DB || "";

let mongoClient = null;

/**
 * Mendapatkan instance MongoClient (koneksi dibuat sekali secara lazy).
 * Koneksi hanya terbuka saat tool pertama kali dipanggil sehingga proses
 * handshake MCP tetap cepat dan tidak butuh MongoDB saat startup.
 */
export async function getClient() {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGODB_URI, {
      appName: "mcp-mongodb",
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    await mongoClient.connect();
    await mongoClient.db("admin").command({ ping: 1 });
  }
  return mongoClient;
}

/**
 * Mendapatkan handle database. Prioritas: parameter 'database',
 * lalu fallback ke MONGODB_DB. Error jika keduanya kosong.
 */
export async function getDb(database) {
  const dbName = database || DEFAULT_DB;
  if (!dbName) {
    throw new Error(
      "Nama database tidak diketahui. Sertakan parameter 'database' atau set environment variable MONGODB_DB."
    );
  }
  const client = await getClient();
  return client.db(dbName);
}

/** Menyembunyikan password pada URI untuk keperluan logging */
export function maskUri(uri) {
  return uri.replace(/\/\/([^:/@]+):[^@]*@/, "//$1:****@");
}

/** Menutup koneksi MongoDB (dipanggil saat shutdown) */
export async function closeClient() {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
  }
}
