// Atualizador: servidor local servindo dist/<versão>, extensão "instalada" na 2.3.0, aplica e confere.
"use strict";
const assert = require("assert"), fs = require("fs"), path = require("path"), http = require("http"), os = require("os"), zlib = require("zlib");
const DIST = process.argv[2]; // pasta com latest.json e figma2ae-update.zip
const T = "/tmp/f2ae_upd"; fs.rmSync(T, { recursive: true, force: true });
const ext = path.join(T, "ext"), docs = path.join(T, "docs"), studio = path.join(T, "studio");
fs.mkdirSync(ext, { recursive: true }); fs.mkdirSync(path.join(studio, "resources"), { recursive: true }); fs.mkdirSync(docs, { recursive: true });
fs.writeFileSync(path.join(ext, "version.json"), '{"version":"2.3.0"}'); fs.writeFileSync(path.join(ext, "server.html"), "antigo");
fs.writeFileSync(path.join(studio, "resources", "app.asar"), "asar antigo");
// mesmo unzip do receptor
const html = fs.readFileSync(path.join(__dirname, "../extension/server.html"), "utf8");
const unzipSrc = html.match(/function unzipTo[\s\S]*?\n}\n/)[0];
const unzipTo = new Function("fs", "path", "zlib", "Buffer", unzipSrc + "; return unzipTo;")(fs, path, zlib, Buffer);
let tamper = false, studioOpen = true;
const srv = http.createServer((q, s) => {
  const f = path.join(DIST, path.basename(q.url));
  if (q.url.startsWith("/go/")) { s.writeHead(302, { Location: "/" + path.basename(q.url) }); return s.end(); } // testa redirecionamento (GitHub faz isso)
  if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); }
  let b = fs.readFileSync(f); if (tamper && f.endsWith(".zip")) { b = Buffer.from(b); b[100] ^= 1; }
  s.writeHead(200, { "Content-Length": b.length }); s.end(b);
}).listen(0, async () => {
  const base = "http://127.0.0.1:" + srv.address().port + "/go/";
  fs.writeFileSync(path.join(docs, "update_source.txt"), base);
  const U = require("../extension/updater.js");
  assert.ok(U.cmpVer("2.10.0", "2.9.9") > 0 && U.cmpVer("2.3.0", "2.3.0") === 0 && U.cmpVer("2.3.0", "2.3.1") < 0, "comparação de versões");
  // fonte lida de Documentos\Figma2AE\update_source.txt: aqui o updater usa DOCS do usuário, então passamos docsDir e trocamos a fonte via env
  const realHome = os.homedir; os.homedir = () => T; fs.mkdirSync(path.join(T, "Documents", "Figma2AE"), { recursive: true }); fs.writeFileSync(path.join(T, "Documents", "Figma2AE", "update_source.txt"), base);
  delete require.cache[require.resolve("../extension/updater.js")];
  const U2 = require("../extension/updater.js");
  const u = U2.create({ extDir: ext, unzip: unzipTo, studioOpen: () => studioOpen, studioDir: studio, docsDir: docs });
  await u.check(true);
  assert.ok(u.state.available, "achou a versão nova: " + JSON.stringify(u.state));
  // arquivo adulterado: não instala nada
  tamper = true;
  await assert.rejects(u.apply(), /SHA-256/);
  assert.strictEqual(fs.readFileSync(path.join(ext, "server.html"), "utf8"), "antigo", "nada mudou com arquivo adulterado");
  tamper = false;
  const r = await u.apply();
  const latest = JSON.parse(fs.readFileSync(path.join(DIST, "latest.json")));
  assert.ok(r.ok && r.version === latest.version, JSON.stringify(r));
  assert.ok(fs.readFileSync(path.join(ext, "server.html"), "utf8").includes("Receptor do Figma2AE"), "extensão trocada");
  assert.ok(fs.existsSync(path.join(ext, "updater.js")), "arquivos novos da extensão");
  assert.ok(fs.existsSync(path.join(docs, "figma-plugin", "code.js")), "plugin do Figma atualizado");
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(ext, "version.json"))).version, latest.version);
  assert.strictEqual(r.studio, "pendente", "Studio aberto: fica pendente");
  assert.strictEqual(fs.readFileSync(path.join(studio, "resources", "app.asar"), "utf8"), "asar antigo");
  studioOpen = false; u.applyPendingStudio();
  assert.ok(fs.statSync(path.join(studio, "resources", "app.asar")).size > 1000, "Studio trocado depois de fechar");
  assert.ok(fs.existsSync(path.join(docs, "_update", "backup_2.3.0", "server.html")), "backup da versão anterior");
  await u.check(true); assert.ok(!u.state.available, "depois de atualizar, nada novo");
  os.homedir = realHome; srv.close();
  console.log("TODOS OS TESTES DO ATUALIZADOR PASSARAM");
});
