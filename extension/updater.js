/* Atualizador do Figma2AE.
   Roda dentro do receptor (server.html), que tem Node e acesso à internet.
   Procura a versão nova num endereço público (GitHub Releases), baixa o pacote,
   confere o SHA-256 e instala as três partes: plugin do Figma, extensão do After e Figma2AE Studio. */
"use strict";
const https = require("https"), http = require("http"), fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");

let PATHS = null; try { PATHS = require("./paths.js"); } catch (e) {}
const DOCS = PATHS ? PATHS.docs() : path.join(os.homedir(), "Documents", "Figma2AE");
const DEFAULT_SOURCE = "https://github.com/EmrehliugL/figma2ae/releases/latest/download/";

function source() {
  // dá pra apontar pra outro lugar (testes, servidor próprio) com Documentos\Figma2AE\update_source.txt
  try { const s = fs.readFileSync(path.join(DOCS, "update_source.txt"), "utf8").trim(); if (s) return s.endsWith("/") ? s : s + "/"; } catch (e) {}
  return DEFAULT_SOURCE;
}
function cmpVer(a, b) {
  const pa = String(a || "0").split(/[.\-]/).map(n => parseInt(n, 10) || 0), pb = String(b || "0").split(/[.\-]/).map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}
function get(url, opts, redirects) {
  opts = opts || {}; redirects = redirects || 0;
  return new Promise((ok, bad) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(url, { headers: { "User-Agent": "Figma2AE-updater", "Accept": "*/*" }, timeout: opts.timeout || 20000 }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 6) {
        res.resume(); return ok(get(new URL(res.headers.location, url).toString(), opts, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return bad(new Error("servidor respondeu " + res.statusCode)); }
      const total = +res.headers["content-length"] || 0, chunks = []; let got = 0;
      res.on("data", c => { chunks.push(c); got += c.length; if (opts.onProgress) opts.onProgress(got, total); if (got > 600 * 1024 * 1024) req.destroy(new Error("arquivo grande demais")); });
      res.on("end", () => ok(Buffer.concat(chunks)));
      res.on("error", bad);
    });
    req.on("timeout", () => req.destroy(new Error("tempo esgotado")));
    req.on("error", bad);
  });
}

function create(o) {
  // o: { extDir, unzip(buf, dir), studioOpen(), studioDir, docsDir, log }
  const docsDir = o.docsDir || DOCS;
  const studioDir = o.studioDir || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Programs", "Figma2AE Studio");
  const log = o.log || (() => {});
  const st = { current: localVersion(), latest: null, notes: "", available: false, checking: false, lastCheck: 0, error: "", busy: false, progress: 0, phase: "", studioPending: false, done: "" };

  // sem a extensão instalada (só o Studio), vale a versão que quem chamou informar
  function localVersion() { try { return JSON.parse(fs.readFileSync(path.join(o.extDir, "version.json"), "utf8")).version || o.fallbackVersion || "0"; } catch (e) { return o.fallbackVersion || "0"; } }
  let info = null;

  async function check(force) {
    if (st.checking || st.busy) return st;
    if (!force && Date.now() - st.lastCheck < 60 * 1000) return st;
    st.checking = true; st.error = "";
    try {
      const j = JSON.parse((await get(source() + "latest.json", { timeout: 15000 })).toString("utf8"));
      if (!j.version || !j.file || !j.sha256) throw new Error("latest.json incompleto");
      info = j; st.latest = j.version; st.notes = j.notes || ""; st.current = localVersion();
      st.available = cmpVer(j.version, st.current) > 0;
    } catch (e) { st.error = "não consegui verificar atualizações (" + e.message + ")"; }
    st.lastCheck = Date.now(); st.checking = false;
    return st;
  }

  function copyDir(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      const a = path.join(src, e.name), b = path.join(dst, e.name);
      if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
    }
  }
  function swapStudio(staged) {
    // o .asar do Studio só pode ser trocado com o Studio fechado
    const dst = path.join(studioDir, "resources", "app.asar");
    if (!fs.existsSync(path.dirname(dst))) return "sem-studio";
    if (o.studioOpen && o.studioOpen()) return "pendente";
    const prevNoAsar = process.noAsar; process.noAsar = true;
    try { fs.copyFileSync(staged, dst); } finally { process.noAsar = prevNoAsar; }
    return "ok";
  }
  const PENDING = path.join(docsDir, "_update", "studio_pendente.asar");
  function applyPendingStudio() {
    if (!fs.existsSync(PENDING)) { st.studioPending = false; return; }
    try { const r = swapStudio(PENDING); if (r !== "pendente") { fs.unlinkSync(PENDING); st.studioPending = false; if (r === "ok") log("Studio atualizado"); } else st.studioPending = true; }
    catch (e) { st.studioPending = true; }
  }

  /* Onde baixar o pacote DESTA versão. Nunca o ".../latest/download/": se saiu outra versão depois da
     última verificação (o usuário pulou 2 ou 3 atualizações), o "latest" já é outro arquivo e o SHA-256 não bate. */
  function zipUrl(j) {
    const src = source();
    if (src !== DEFAULT_SOURCE) return src + j.file; // servidor próprio / testes (update_source.txt)
    return j.url || DEFAULT_SOURCE.replace(/latest\/download\/$/, "download/v" + j.version + "/") + j.file;
  }
  async function waitIdle() { for (let i = 0; i < 100 && st.checking; i++) await new Promise(r => setTimeout(r, 100)); }
  async function apply() {
    if (st.busy) throw new Error("já está atualizando");
    // sempre confere de novo na hora de atualizar: a informação guardada pode ser de horas atrás
    await waitIdle(); await check(true);
    if (!info) throw new Error(st.error || "sem informação da versão nova");
    if (!st.available) return { ok: true, nothing: true, version: st.current };
    st.busy = true; st.error = ""; st.done = ""; st.progress = 0;
    try {
      let buf = null, sha = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        st.phase = "baixando"; st.progress = 0;
        try {
          buf = await get(zipUrl(info), { timeout: 180000, onProgress: (g, t) => { st.progress = t ? Math.round(g / t * 100) : 0; } });
        } catch (e) {
          // endereço com a versão não existe (servidor próprio/antigo): cai pro endereço da fonte
          if (attempt === 0 && zipUrl(info) !== source() + info.file) { buf = await get(source() + info.file, { timeout: 180000, onProgress: (g, t) => { st.progress = t ? Math.round(g / t * 100) : 0; } }); }
          else throw e;
        }
        st.phase = "conferindo";
        sha = crypto.createHash("sha256").update(buf).digest("hex");
        if (sha.toLowerCase() === String(info.sha256).toLowerCase()) break;
        if (attempt === 0) {
          // saiu versão nova no meio do caminho: pega a informação de novo e tenta mais uma vez
          log("SHA-256 diferente; conferindo a versão de novo");
          st.busy = false; await check(true); st.busy = true;
          if (!st.available) return { ok: true, nothing: true, version: st.current };
          continue;
        }
        throw new Error("o arquivo baixado não confere (SHA-256 diferente); nada foi alterado");
      }
      const work = path.join(docsDir, "_update", String(info.version).replace(/[^\w.\-]/g, "_"));
      fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
      o.unzip(buf, work);
      const vj = JSON.parse(fs.readFileSync(path.join(work, "version.json"), "utf8"));
      if (vj.version !== info.version) throw new Error("versão do pacote não bate com a anunciada");
      st.phase = "instalando";
      // cópia de segurança da extensão e do plugin atuais: se qualquer cópia falhar no meio
      // (arquivo travado, disco cheio), tudo volta sozinho como estava, sem ficar metade nova e metade velha
      const bak = path.join(docsDir, "_update", "backup_" + st.current);
      fs.rmSync(bak, { recursive: true, force: true }); copyDir(o.extDir, path.join(bak, "extension"));
      const dirs = !fs.existsSync(path.join(work, "plugin")) ? [] : (o.pluginDirs ? o.pluginDirs() : PATHS ? PATHS.pluginDirs() : [path.join(docsDir, "figma-plugin")]);
      // o Figma lê o plugin da pasta onde o manifesto foi importado: atualiza todas que existirem
      if (dirs.length && !dirs.includes(path.join(docsDir, "figma-plugin")) && fs.existsSync(path.join(docsDir, "figma-plugin", "manifest.json"))) dirs.push(path.join(docsDir, "figma-plugin"));
      const saved = [];
      dirs.forEach((d, i) => { if (fs.existsSync(d)) { const b = path.join(bak, "plugin_" + i); copyDir(d, b); saved.push([d, b]); } });
      try {
        if (o.beforeInstall) o.beforeInstall(); // só pros testes simularem falha
        dirs.forEach(d => copyDir(path.join(work, "plugin"), d));
        if (fs.existsSync(path.join(work, "extension"))) copyDir(path.join(work, "extension"), o.extDir);
      } catch (e) {
        let back = true;
        try { copyDir(path.join(bak, "extension"), o.extDir); saved.forEach(([d, b]) => copyDir(b, d)); } catch (e2) { back = false; }
        throw new Error("não deu pra instalar (" + e.message + "). " + (back ? "Tudo voltou como estava." : "Volte a cópia de segurança em " + bak + "."));
      }
      let studio = "sem-mudança";
      const asar = path.join(work, "studio", "app.asar.bin"); // .bin: evita que algum Node com suporte a asar trate como pasta
      if (fs.existsSync(asar)) {
        fs.mkdirSync(path.dirname(PENDING), { recursive: true });
        fs.copyFileSync(asar, PENDING);
        applyPendingStudio();
        studio = st.studioPending ? "pendente" : "ok";
      }
      fs.writeFileSync(path.join(o.extDir, "version.json"), JSON.stringify({ version: info.version }));
      fs.rmSync(work, { recursive: true, force: true });
      st.current = info.version; st.available = false; st.phase = ""; st.done = info.version;
      log("atualizado para " + info.version);
      return { ok: true, version: info.version, studio, notes: info.notes || "" };
    } catch (e) { st.error = e.message; st.phase = ""; throw e; }
    finally { st.busy = false; }
  }

  // confere sozinho se a última verificação tem mais de 15 min (o receptor chama a cada ping do plugin)
  function refresh() { if (!st.checking && !st.busy && Date.now() - st.lastCheck > 15 * 60 * 1000) check(true).catch(() => {}); }
  return { state: st, check, apply, applyPendingStudio, refresh, cmpVer };
}
module.exports = { create, cmpVer, get, source, DEFAULT_SOURCE };
