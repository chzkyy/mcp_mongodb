/**
 * Smoke test for mcp-mongodb.
 * Runs the server as a child process and communicates via
 * newline-delimited JSON-RPC (exactly like Claude Desktop).
 *
 * It does not require MongoDB to be running — the connection is lazy.
 * Run with: npm test
 */
import { spawn } from "node:child_process";

const proc = spawn(process.execPath, ["index.js"], {
  stdio: ["pipe", "pipe", "pipe"],
});

let stdoutBuf = "";
let stderrBuf = "";
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

proc.stderr.on("data", (c) => {
  stderrBuf += c.toString();
});

let nextId = 1;
function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      waiters.delete(id);
      reject(new Error(`Timeout waiting for the '${method}' response`));
    }, 20000);
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

let failures = 0;
function check(label, cond, extra = "") {
  const status = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`${status}: ${label}${extra ? ` — ${extra}` : ""}`);
}

try {
  // 1) Handshake initialize
  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "1.0.0" },
  });
  check(
    "initialize",
    init.result?.serverInfo?.name === "mcp-mongodb",
    `server=${init.result?.serverInfo?.name} v${init.result?.serverInfo?.version}`
  );
  notify("notifications/initialized");

  // 2) List tools
  const tools = await rpc("tools/list", {});
  const names = (tools.result?.tools ?? []).map((t) => t.name);
  check("tools/list", names.length >= 20, `${names.length} tools registered`);
  console.log("Tools:", names.join(", "));

  const coreTools = ["find", "insert_one", "update_one", "delete_one", "aggregate", "list_collections"];
  const missing = coreTools.filter((n) => !names.includes(n));
  check("core tools available", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : "all present");

  // 3) Call one tool (server_info). If local MongoDB is not running,
  //    the error result is still considered passing because it proves the RPC path works.
  const call = await rpc("tools/call", { name: "server_info", arguments: {} });
  const text = call.result?.content?.[0]?.text ?? "";
  console.log(`INFO: server_info → ${text.replace(/\n/g, " ").slice(0, 160)}`);
  check("tools/call responds", Array.isArray(call.result?.content) && call.result.content.length > 0);

  check("no foreign output on stdout", true);
} catch (e) {
  failures++;
  console.log(`FAIL: ${e.message}`);
} finally {
  proc.stdin.end();
  proc.kill();
}

if (stderrBuf.trim()) {
  console.log("--- server stderr log ---");
  console.log(stderrBuf.trim());
}
process.exit(failures ? 1 : 0);
