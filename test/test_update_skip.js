"use strict";
// Pulou atualizações: o usuário verificou quando a última era a 2.4.0, não atualizou, saíram a 2.5.0 e a 2.6.0.
// Ao clicar em Atualizar, tem que instalar a mais nova (antes baixava o "latest" e o SHA-256 da 2.4.0 não batia).
const assert = require("assert"), fs = require("fs"), path = require("path"), http = require("http"), os = require("os"), zlib = require("zlib"), crypto = require("crypto");
const T = "/tmp/f2ae_upd_skip"; fs.rmSync(T, { recursive: true, force: true });
const ext = path.join(T, "ext"), docs = path.join(T, "docs"), studio = path.join(T, "studio");
[ext, docs, path.join(studio, "resources")].forEach(d => fs.mkdirSync(d, { recursive: true }));
fs.writeFileSync(path.join(ext, "version.json"), '{"version":"2.3.9"}'); fs.writeFileSync(path.join(ext, "server.html"), "2.3.9");
const html = fs.readFileSync(path.join(__dirname, "../extension/server.html"), "utf8");
const unzipTo = new Function("fs", "path", "zlib", "Buffer", html.match(/function unzipTo[\s\S]*?\n}\n/)[0] + "; return unzipTo;")(fs, path, zlib, Buffer);
function crc32(b) { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; } return ~c >>> 0; }
function zip(files) { // zip "store" mínimo
  const parts = []; for (const [n, d0] of Object.entries(files)) { const d = Buffer.from(d0), nm = Buffer.from(n), h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt32LE(crc32(d), 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(nm.length, 26);
    parts.push(h, nm, d); }
  return Buffer.concat(parts);
}
const REL = {};
function release(v) { const z = zip({ "version.json": JSON.stringify({ version: v }), "extension/server.html": v }); REL[v] = { zip: z, latest: { version: v, notes: "v" + v, file: "figma2ae-update.zip", sha256: crypto.createHash("sha256").update(z).digest("hex"), size: z.length } }; }
let LATEST = "2.4.0";
["2.4.0", "2.5.0", "2.6.0"].forEach(release);
const srv = http.createServer((q, s) => {
  // como o GitHub: /latest/... sempre a última; /v<versão>/... fixo
  const m = q.url.match(/^\/(latest|v([\d.]+))\/(.+)$/);
  if (!m) { s.writeHead(404); return s.end(); }
  const v = m[1] === "latest" ? LATEST : m[2], r = REL[v];
  if (!r) { s.writeHead(404); return s.end(); }
  const b = m[3] === "latest.json" ? Buffer.from(JSON.stringify(Object.assign({}, r.latest, { url: "http://127.0.0.1:" + srv.address().port + "/v" + v + "/figma2ae-update.zip" }))) : r.zip;
  s.writeHead(200, { "Content-Length": b.length }); s.end(b);
}).listen(0, async () => {
  const port = srv.address().port;
  const realHome = os.homedir; os.homedir = () => T;
  fs.mkdirSync(path.join(T, "Documents", "Figma2AE"), { recursive: true });
  const U = require("../extension/updater.js");
  // fonte padrão = GitHub; aqui troca o endereço padrão pelo servidor local
  const src = "http://127.0.0.1:" + port + "/latest/";
  fs.writeFileSync(path.join(T, "Documents", "Figma2AE", "update_source.txt"), src);
  const u = U.create({ extDir: ext, unzip: unzipTo, studioOpen: () => false, studioDir: studio, docsDir: docs });
  await u.check(true);
  assert.strictEqual(u.state.latest, "2.4.0");
  // ...o tempo passa, saem duas versões e o usuário só agora clica em Atualizar
  LATEST = "2.6.0";
  const r = await u.apply();
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.version, "2.6.0", "instalou a mais nova, sem erro de SHA-256");
  assert.strictEqual(fs.readFileSync(path.join(ext, "server.html"), "utf8"), "2.6.0");
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(ext, "version.json"))).version, "2.6.0");
  // versão nova sai bem no meio do download: confere de novo e instala a certa
  LATEST = "2.6.0"; release("2.7.0");
  await u.check(true); assert.strictEqual(u.state.latest, "2.6.0"); assert.ok(!u.state.available);
  LATEST = "2.7.0";
  const r2 = await u.apply();
  assert.strictEqual(r2.version, "2.7.0");
  assert.strictEqual(fs.readFileSync(path.join(ext, "server.html"), "utf8"), "2.7.0");
  // verificação automática: refresh só confere de novo depois de 15 min
  assert.strictEqual(typeof u.refresh, "function");
  os.homedir = realHome; srv.close();
  console.log("TODOS OS TESTES DE ATUALIZAÇÃO PULANDO VERSÕES PASSARAM");
});
