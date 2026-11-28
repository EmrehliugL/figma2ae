"use strict";
// Atualização segura: (1) acha a pasta de onde o Figma carrega o plugin (lista do Figma), mesmo fora de Documentos;
// (2) se a instalação falhar no meio, volta tudo como estava.
const assert = require("assert"), fs = require("fs"), path = require("path"), http = require("http"), os = require("os"), zlib = require("zlib"), crypto = require("crypto");
const T = "/tmp/f2ae_upd_safe"; fs.rmSync(T, { recursive: true, force: true });
const ext = path.join(T, "ext"), docs = path.join(T, "Documents", "Figma2AE"), studio = path.join(T, "studio");
const zipDir = path.join(T, "Downloads", "Figma2AE_v2.3", "1 - Plugin Figma"); // importado direto do zip
[ext, docs, studio, zipDir, path.join(docs, "figma-plugin"), path.join(T, "AppData", "Figma")].forEach(d => fs.mkdirSync(d, { recursive: true }));
fs.writeFileSync(path.join(ext, "version.json"), '{"version":"2.3.9"}'); fs.writeFileSync(path.join(ext, "server.html"), "2.3.9");
for (const d of [zipDir, path.join(docs, "figma-plugin")]) { fs.writeFileSync(path.join(d, "manifest.json"), "{}"); fs.writeFileSync(path.join(d, "code.js"), "velho"); }
const SETTINGS = path.join(T, "AppData", "Figma", "settings.json");
fs.writeFileSync(SETTINGS, JSON.stringify({ zoomStop: 1, localFileExtensions: [
  { id: 1, manifestPath: path.join(zipDir, "manifest.json"), lastKnownName: "Figma2AE", lastKnownPluginId: "figma2ae-iug-local", fileMetadata: { type: "manifest", codeFileId: 2, uiFileIds: [3] } },
  { id: 9, manifestPath: "/nao/existe/manifest.json", lastKnownPluginId: "outro-plugin" } ] }));
const html = fs.readFileSync(path.join(__dirname, "../extension/server.html"), "utf8");
const unzipTo = new Function("fs", "path", "zlib", "Buffer", html.match(/function unzipTo[\s\S]*?\n}\n/)[0] + "; return unzipTo;")(fs, path, zlib, Buffer);
function crc32(b) { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; } return ~c >>> 0; }
function zip(files) { const parts = []; for (const [n, d0] of Object.entries(files)) { const d = Buffer.from(d0), nm = Buffer.from(n), h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt32LE(crc32(d), 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(nm.length, 26); parts.push(h, nm, d); }
  return Buffer.concat(parts); }
const REL = {}; let LATEST;
function release(v) { const z = zip({ "version.json": JSON.stringify({ version: v }), "extension/server.html": v, "plugin/manifest.json": "{}", "plugin/code.js": v }); REL[v] = { zip: z, latest: { version: v, file: "figma2ae-update.zip", sha256: crypto.createHash("sha256").update(z).digest("hex") } }; }
const srv = http.createServer((q, s) => { const m = q.url.match(/^\/(latest|v([\d.]+))\/(.+)$/); const v = m && (m[1] === "latest" ? LATEST : m[2]), r = REL[v];
  if (!r) { s.writeHead(404); return s.end(); }
  const b = m[3] === "latest.json" ? Buffer.from(JSON.stringify(Object.assign({}, r.latest, { url: "http://127.0.0.1:" + srv.address().port + "/v" + v + "/figma2ae-update.zip" }))) : r.zip;
  s.writeHead(200, { "Content-Length": b.length }); s.end(b); }).listen(0, async () => {
  const realHome = os.homedir; os.homedir = () => T;
  const P = require("../extension/paths.js");
  // a lista do Figma aponta pra pasta do zip; o outro plugin (e caminhos que não existem) fica de fora
  assert.deepStrictEqual(P.figmaPluginDirs(SETTINGS), [zipDir]);
  assert.deepStrictEqual(P.figmaPluginDirs(path.join(T, "nada.json")), []);
  const dirs = P.pluginDirs(SETTINGS);
  assert.ok(dirs.includes(zipDir) && dirs.includes(path.join(docs, "figma-plugin")), JSON.stringify(dirs));
  fs.writeFileSync(path.join(docs, "update_source.txt"), "http://127.0.0.1:" + srv.address().port + "/latest/");
  const U = require("../extension/updater.js");
  // (2) falha no meio: nada muda
  release("2.4.0"); LATEST = "2.4.0";
  let fail = true;
  const u = U.create({ extDir: ext, unzip: unzipTo, studioOpen: () => false, studioDir: studio, docsDir: docs, pluginDirs: () => P.pluginDirs(SETTINGS),
    beforeInstall: () => { if (fail) { fs.writeFileSync(path.join(zipDir, "code.js"), "meio-copiado"); fs.writeFileSync(path.join(ext, "server.html"), "meio-copiado"); throw new Error("EBUSY: arquivo em uso"); } } });
  let err = null; try { await u.apply(); } catch (e) { err = e; }
  assert.ok(err && /voltou como estava/.test(err.message), err && err.message);
  assert.strictEqual(fs.readFileSync(path.join(ext, "server.html"), "utf8"), "2.3.9", "extensão voltou");
  assert.strictEqual(fs.readFileSync(path.join(zipDir, "code.js"), "utf8"), "velho", "plugin voltou");
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(ext, "version.json"))).version, "2.3.9");
  assert.ok(!u.state.busy);
  // (1) sem falha: atualiza a pasta que o Figma usa E a de Documentos
  fail = false;
  const r = await u.apply();
  assert.strictEqual(r.version, "2.4.0");
  assert.strictEqual(fs.readFileSync(path.join(zipDir, "code.js"), "utf8"), "2.4.0", "pasta do Figma (zip) atualizada");
  assert.strictEqual(fs.readFileSync(path.join(docs, "figma-plugin", "code.js"), "utf8"), "2.4.0");
  assert.strictEqual(fs.readFileSync(path.join(ext, "server.html"), "utf8"), "2.4.0");
  os.homedir = realHome; srv.close();
  console.log("TODOS OS TESTES DE ATUALIZAÇÃO SEGURA PASSARAM");
});
