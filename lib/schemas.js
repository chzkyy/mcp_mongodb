import { z } from "zod";

export const DatabaseArg = z
  .string()
  .min(1)
  .optional()
  .describe("Nama database tujuan. Opsional jika MONGODB_DB sudah diatur.");

export const DatabaseRequired = z
  .string()
  .min(1)
  .describe("Nama database.");

export const CollectionArg = z
  .string()
  .min(1)
  .describe("Nama koleksi.");

export const FilterArg = z
  .any()
  .optional()
  .describe(
    'Query filter MongoDB. Contoh: {"status": "aktif", "umur": {"$gt": 25}}. Kirim sebagai objek atau string JSON. Gunakan {} untuk semua dokumen.'
  );

export const ProjectionArg = z
  .any()
  .optional()
  .describe('Proyeksi field yang dikembalikan. Contoh: {"nama": 1, "email": 1, "_id": 0}.');

export const SortArg = z
  .any()
  .optional()
  .describe('Urutan hasil. Contoh: {"createdAt": -1} untuk terbaru, {"nama": 1} untuk A-Z.');

export const LimitArg = z
  .coerce
  .number()
  .int()
  .min(1)
  .max(1000)
  .optional()
  .describe("Jumlah maksimum dokumen yang dikembalikan (default 50, maksimum 1000).");

export const SkipArg = z
  .coerce
  .number()
  .int()
  .min(0)
  .optional()
  .describe("Jumlah dokumen yang dilewati (untuk paginasi).");

export const UpsertArg = z
  .boolean()
  .optional()
  .describe("Jika true, dokumen baru dibuat bila tidak ada yang cocok dengan filter (default false).");

export const ConfirmArg = z
  .boolean()
  .optional()
  .describe("Set true untuk mengonfirmasi operasi destruktif.");

export const DocumentArg = z
  .any()
  .describe('Satu dokumen JSON untuk disimpan. Contoh: {"nama": "Budi", "umur": 30, "tags": ["vip"]}.');

export const DocumentsArrayArg = z
  .any()
  .describe('Array dokumen JSON untuk disimpan sekaligus. Contoh: [{"nama": "Ani"}, {"nama": "Budi"}].');

export const UpdateArg = z
  .any()
  .describe(
    'Dokumen update MongoDB. Gunakan operator seperti {"$set": {"umur": 31}} atau {"$inc": {"counter": 1}}. Tanpa operator akan otomatis dibungkus "$set".'
  );

export const ReplacementArg = z
  .any()
  .describe("Dokumen pengganti LENGKAP (tanpa operator $). Seluruh isi dokumen lama diganti.");

export const PipelineArg = z
  .any()
  .describe(
    'Aggregation pipeline MongoDB (array of stages). Contoh: [{"$match": {"status": "aktif"}}, {"$group": {"_id": "$kategori", "total": {"$sum": 1}}}].'
  );

export const IndexKeysArg = z
  .any()
  .describe('Definisi kunci index. Contoh: {"email": 1} ascending, {"createdAt": -1} descending.');

export const IndexOptionsArg = z
  .any()
  .optional()
  .describe('Opsi index. Contoh: {"unique": true, "name": "email_unique", "expireAfterSeconds": 3600}.');
