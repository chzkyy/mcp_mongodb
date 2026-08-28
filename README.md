# mcp-mongodb

Server MCP (**Model Context Protocol**) untuk menghubungkan **Claude** ke **MongoDB**.
Dengan server ini Claude dapat menjelajah, men-query, dan memodifikasi database MongoDB
Anda secara langsung melalui percakapan.

## Fitur / Tools

| Kategori | Tool | Deskripsi |
|---|---|---|
| Info | `server_info` | Cek koneksi & versi MongoDB |
| | `list_databases` | Daftar semua database + ukuran |
| Database | `db_stats` | Statistik database |
| | `drop_database` | ⚠️ Hapus database (wajib `confirm: true`) |
| Koleksi | `list_collections` | Daftar koleksi dalam database |
| | `collection_stats` | Statistik koleksi (jumlah dokumen, ukuran) |
| | `create_collection` | Buat koleksi baru |
| | `rename_collection` | Ganti nama koleksi |
| | `drop_collection` | ⚠️ Hapus koleksi beserta isinya |
| Baca data | `find` | Query dokumen (filter, proyeksi, sort, limit, skip) |
| | `find_one` | Ambil satu dokumen |
| | `get_by_id` | Ambil dokumen berdasarkan `_id` (auto-konversi ObjectId) |
| | `count` | Hitung jumlah dokumen yang cocok |
| | `distinct` | Nilai unik sebuah field |
| | `aggregate` | Jalankan aggregation pipeline (`$match`, `$group`, `$lookup`, dll.) |
| Tulis data | `insert_one` / `insert_many` | Sisipkan dokumen |
| | `update_one` / `update_many` | Update dengan operator (`$set`, `$inc`, ...) |
| | `replace_one` | Ganti seluruh isi satu dokumen |
| | `delete_one` / `delete_many` | ⚠️ Hapus dokumen (filter kosong wajib `confirm: true`) |
| Index | `create_index` / `drop_index` / `list_indexes` | Kelola index |

## Persyaratan

- Node.js ≥ 18 (dikembangkan & diuji pada v22)
- Server MongoDB (lokal maupun MongoDB Atlas)

## Instalasi

```bash
cd d:\mcp_server\mcp_mongodb
npm install
```

## Konfigurasi Environment Variable

| Variabel | Wajib? | Default | Keterangan |
|---|---|---|---|
| `MONGODB_URI` | Tidak | `mongodb://localhost:27017` | URI koneksi MongoDB |
| `MONGODB_DB` | Tidak | — | Nama database default; jika kosong, setiap tool butuh parameter `database` |

Contoh URI Atlas:
```
mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

## Menghubungkan ke Claude Desktop

1. Buka file konfigurasi:
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
     (biasanya `C:\Users\<NamaAnda>\AppData\Roaming\Claude\claude_desktop_config.json`)
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Tambahkan entri berikut (sesuaikan path dan kredensial):

```json
{
  "mcpServers": {
    "mongodb": {
      "command": "node",
      "args": ["d:\\mcp_server\\mcp_mongodb\\index.js"],
      "env": {
        "MONGODB_URI": "mongodb://localhost:27017",
        "MONGODB_DB": "nama_database_anda"
      }
    }
  }
}
```

3. Simpan file, lalu **restart Claude Desktop** (quit sepenuhnya, buka lagi).
4. Ikon palu/toolbar di kotak chat akan menampilkan tools `mcp-mongodb`.

### Contoh penggunaan di Claude

- *"Tampilkan semua database MongoDB"* → `list_databases`
- *"Ada koleksi apa saja di database toko?"* → `list_collections`
- *"Cari 10 produk terlaris, urutkan dari yang terbanyak terjual"* → `find` dengan `sort` + `limit`
- *"Tambahkan produk baru bernama 'Kopi Arabika' harga 85000"* → `insert_one`
- *"Naikkan stok semua produk kategori 'minuman' sebanyak 10"* → `update_many`
- *"Berapa total penjualan per bulan?"* → `aggregate` dengan `$group`
- *"Buat index unique pada field email koleksi users"* → `create_index`

## Testing

Smoke test protokol (tidak butuh MongoDB berjalan):

```bash
npm test
```

Output yang diharapkan:

```
PASS: initialize — server=mcp-mongodb v1.0.0
PASS: tools/list — 25 tool terdaftar
PASS: tool inti tersedia — semua ada
PASS: tools/call merespons
```

> Panggilan `server_info` pada smoke test akan menampilkan pesan error bila MongoDB
> belum berjalan — itu normal dan justru membuktikan jalur RPC berfungsi.

## Keamanan & Catatan Penting

- **Gunakan akun MongoDB dengan hak minimum** yang diperlukan. Jika Anda hanya ingin
  Claude membaca data, buat user read-only di MongoDB/Atlas.
- Jangan menyimpan password di file yang di-commit ke git. Untuk produksi pertimbangkan
  menyimpan `MONGODB_URI` di environment sistem, bukan di config JSON.
- Operasi destruktif dilindungi: `drop_database` dan `delete_many` dengan filter kosong
  menuntut konfirmasi eksplisit (`confirm: true`), namun `update_many` / `delete_many`
  dengan filter tertentu tetap langsung dieksekusi — selalu periksa rencana aksi Claude
  sebelum menyetujui.
- Output query dibatasi (default 50 dokumen, maksimum 1000) agar tidak melebihi
  konteks Claude.

## Troubleshooting

| Masalah | Solusi |
|---|---|
| Tools tidak muncul di Claude | Pastikan path `node` dan `index.js` benar; lihat log MCP di Claude Desktop (Settings ▸ Developer) |
| `ServerSelectionTimeoutError` | MongoDB tidak jalan / URI salah / IP belum di-whitelist (Atlas) |
| `Authentication failed` | Periksa username/password & `authSource` pada URI |
| Karakter `\` pada Windows | Gunakan double backslash (`\\`) atau forward slash (`/`) di JSON config |

## Struktur Proyek

```
mcp_mongodb/
├── index.js           # Entry point: McpServer + StdioServerTransport
├── lib/
│   ├── connection.js  # Singleton MongoClient (lazy connect), env config
│   ├── helpers.js     # Result builder, parser JSON, util ObjectId
│   └── schemas.js     # Skema Zod bersama
├── tools/
│   ├── admin.js       # Info server, database, koleksi
│   ├── query.js       # Pembacaan data & agregasi
│   ├── documents.js   # Insert/update/replace/delete
│   └── indexes.js     # Manajemen index
└── test-smoke.js      # Smoke test JSON-RPC via stdio
```
