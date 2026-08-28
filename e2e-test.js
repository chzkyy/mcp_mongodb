/**
 * E2E test for mcp-mongodb using a real in-memory MongoDB.
 * Tests the full CRUD + aggregation + index cycle through the MCP protocol.
 * Run with: npm run test:e2e
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import { spawn } from "node:child_process";

console.log("Starting in-memory MongoDB...");
const mongod = await MongoMemoryServer.create();
const uri = mongod.getUri();

const proc = spawn(process.execPath, ["index.js"], {
  env: { ...process.env, MONGODB_URI: uri, MONGODB_DB: "toko" },
  stdio: ["pipe", "pipe", "pipe"],
});

let stdoutBuf = "";
const waiters = new Map();
proc.stdout.on("data", (chunk) => {
  stdoutBuf += chunk.toString();
  let nl;
  while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
    const line = stdoutBuf.slice(0, nl).trim();
    stdoutBuf = stdoutBuf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id != null && waiters.has(msg.id)) {
      const resolve = waiters.get(msg.id);
      waiters.delete(msg.id);
      resolve(msg);
    }
  }
});

let nextId = 1;
function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      waiters.delete(id);
      reject(new Error(`Timeout waiting for the '${method}' response`));
    }, 30000);
    waiters.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

function notify(method) {
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n");
}

async function callTool(name, args = {}) {
  const res = await rpc("tools/call", { name, arguments: args });
  if (res.error) throw new Error(`${name}: ${res.error.message}`);
  return JSON.parse(res.result?.content?.[0]?.text ?? "{}");
}

let failures = 0;
function check(label, cond, extra = "") {
  const status = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`${status}: ${label}${extra ? ` — ${extra}` : ""}`);
}

try {
  // Handshake MCP
  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "e2e-test", version: "1.0.0" },
  });
  check("initialize", init.result?.serverInfo?.name === "mcp-mongodb");
  notify("notifications/initialized");

  // --- Info & structure tools ---
  const info = await callTool("server_info");
  check("server_info", info.connected === true && !!info.mongodbVersion, `v${info.mongodbVersion}`);

  const dbs = await callTool("list_databases");
  check("list_databases", Array.isArray(dbs.databases));

  const cols0 = await callTool("list_collections", {});
  check("list_collections (db default 'toko')", Array.isArray(cols0.collections), `db=${cols0.database}`);

  await callTool("create_collection", { collection: "produk" });
  check("create_collection", true);

  // --- Insert ---
  const ins = await callTool("insert_one", {
    collection: "produk",
    document: { nama: "Kopi Arabika", kategori: "minuman", harga: 85000, stok: 10 },
  });
  const id1 = ins.insertedId;
  check("insert_one (returns ObjectId)", /^[0-9a-f]{24}$/.test(id1 || ""), id1);

  const many = await callTool("insert_many", {
    collection: "produk",
    documents: [
      { nama: "Teh Hijau", kategori: "minuman", harga: 25000, stok: 30 },
      { nama: "Gula Pasir", kategori: "bahan", harga: 15000, stok: 100 },
      { nama: "Kopi Robusta", kategori: "minuman", harga: 55000, stok: 5 },
    ],
  });
  check("insert_many", many.insertedCount === 3);

  // --- Query ---
  const found = await callTool("find", {
    collection: "produk",
    filter: { kategori: "minuman" },
    sort: { harga: -1 },
    limit: 10,
  });
  check(
    "find filter+sort+limit",
    found.returned === 3 && found.documents[0]?.nama === "Kopi Arabika"
  );

  const one = await callTool("find_one", { collection: "produk", filter: { nama: "Gula Pasir" } });
  check("find_one", one?.nama === "Gula Pasir");

  const byId = await callTool("get_by_id", { collection: "produk", id: id1 });
  check("get_by_id (auto ObjectId)", byId?._id === id1, byId?.nama);

  const cnt = await callTool("count", { collection: "produk" });
  check("count", cnt.count === 4, String(cnt.count));

  const dist = await callTool("distinct", { collection: "produk", field: "kategori" });
  check("distinct", dist.distinctCount === 2 && dist.values.includes("minuman"));

  // --- Update ---
  const upd = await callTool("update_one", {
    collection: "produk",
    filter: { nama: "Kopi Arabika" },
    update: { harga: 90000 },
  });
  check("update_one (auto-$set)", upd.matchedCount === 1 && upd.modifiedCount === 1);

  const updMany = await callTool("update_many", {
    collection: "produk",
    filter: { kategori: "minuman" },
    update: { $inc: { stok: 5 } },
  });
  check("update_many ($inc)", updMany.modifiedCount === 3);


  // --- Replace ---
  const rep = await callTool("replace_one", {
    collection: "produk",
    filter: { nama: "Gula Pasir" },
    replacement: { nama: "Gula Merah", kategori: "bahan", harga: 18000, stok: 80 },
  });
  check("replace_one", rep.modifiedCount === 1);

  // --- Aggregate ---
  const agg = await callTool("aggregate", {
    collection: "produk",
    pipeline: [
      { $group: { _id: "$kategori", totalProduk: { $sum: 1 }, nilaiStok: { $sum: { $multiply: ["$harga", "$stok"] } } } },
      { $sort: { totalProduk: -1 } },
    ],
  });
  check(
    "aggregate ($group + $sort)",
    agg.documents.length === 2 && agg.documents[0]?._id === "minuman",
    JSON.stringify(agg.documents[0] ?? {})
  );

  // --- Index ---
  const idx = await callTool("create_index", {
    collection: "produk",
    keys: { nama: 1 },
    options: { unique: true, name: "nama_unique" },
  });
  check("create_index", idx.createdIndex === "nama_unique");

  const idxList = await callTool("list_indexes", { collection: "produk" });
  check("list_indexes", idxList.indexes.some((i) => i.name === "nama_unique"));

  // --- Delete (with guard test) ---
  const guard = await rpc("tools/call", {
    name: "delete_many",
    arguments: { collection: "produk", filter: {} },
  });
  check("delete_many empty filter REJECTED without confirm", guard.result?.isError === true);

  const delOne = await callTool("delete_one", { collection: "produk", filter: { nama: "Kopi Robusta" } });
  check("delete_one", delOne.deletedCount === 1);

  const delMany = await callTool("delete_many", { collection: "produk", filter: { kategori: "bahan" } });
  check("delete_many with filter", delMany.deletedCount >= 1, String(delMany.deletedCount));

  // --- Statistics & advanced structures ---
  const cstat = await callTool("collection_stats", { collection: "produk" });
  check("collection_stats", typeof cstat.count === "number", `count=${cstat.count}`);

  const dstat = await callTool("db_stats", {});
  check("db_stats (db default)", dstat.db === "toko");

  const ren = await callTool("rename_collection", { collection: "produk", newName: "barang" });
  check("rename_collection", typeof ren.to === "string", ren.to ?? "");

  const dropCol = await callTool("drop_collection", { collection: "barang" });
  check("drop_collection", typeof dropCol.dropped === "string");

  console.log(failures === 0 ? "\nALL E2E TESTS PASSED ✔" : `\n${failures} TESTS FAILED ✘`);
} catch (e) {
  failures++;
  console.log(`FAIL: ${e.message}`);
} finally {
  proc.stdin.end();
  proc.kill();
  await mongod.stop();
}
process.exit(failures ? 1 : 0);

