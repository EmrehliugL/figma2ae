/* Figma2AE Studio — processo principal */
const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const path = require("path"), fs = require("fs"), http = require("http");
const engine = require("./engine");
const zlib = require("zlib"), os = require("os"), { spawn } = require("child_process");
const Updater = require("./updater");

if (!app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId("com.iug.figma2ae.studio");

const BASE = path.join(app.getPath("documents"), "Figma2AE", "Recebidos");
const CFG = path.join(app.getPath("userData"), "config.json");
const PADRAO = { defaultDur: 2, useNames: true, fps: "30", master: true, openAfter: true };
const cfg = () => { try { return Object.assign({}, PADRAO, JSON.parse(fs.readFileSync(CFG, "utf8"))); } catch (e) { return Object.assign({}, PADRAO); } };
const pkgs = {}; // cache dos pacotes abertos

let win;
function criar() {
  win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 980, minHeight: 640, show: false,
    backgroundColor: "#1b1b1b", title: "Figma2AE Studio",
    titleBarStyle: "hidden", titleBarOverlay: { color: "#1b1b1b", symbolColor: "#9a9a9a", height: 38 },
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "index.html"));
  win.once("ready-to-show", () => win.show());
}
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  { const prev = process.noAsar; process.noAsar = true; const pending = finishPendingSwap(); process.noAsar = prev; if (pending) return; }
  { const prev = process.noAsar; process.noAsar = true; if (!fs.existsSync(PEND)) { try { fs.unlinkSync(path.join(DOCS, "_update", "troca_tentativas.txt")); } catch (e) {} } process.noAsar = prev; }
  criar();
  fs.mkdirSync(BASE, { recursive: true });
  // avisa o After Effects que o Studio está aberto (aí o painel não importa sozinho)
  const beat = () => { try { fs.writeFileSync(path.join(BASE, "_studio.json"), JSON.stringify({ t: Date.now() })); } catch (e) {} };
  beat(); setInterval(beat, 2000);
  setTimeout(() => checarUpd(true), 4000); setInterval(() => checarUpd(true), 6 * 3600e3);
  let tm = 0;
  let known = new Set(); try { known = new Set(fs.readdirSync(BASE)); } catch (e) {}
  try { fs.watch(BASE, () => { clearTimeout(tm); tm = setTimeout(() => {
    if (!win) return;
    win.webContents.send("atualizar");
    // pacote novo do Figma: traz o Studio pra frente
    let now = []; try { now = fs.readdirSync(BASE).filter(n => !n.startsWith("_")); } catch (e) {}
    const fresh = now.filter(n => !known.has(n)); now.forEach(n => known.add(n));
    if (fresh.length) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); win.flashFrame(true); }
  }, 500); }); } catch (e) {}
});
app.on("window-all-closed", () => { try { fs.unlinkSync(path.join(BASE, "_studio.json")); } catch (e) {} app.quit(); });

/* ---------- atualização universal: um botão atualiza plugin do Figma + extensão do After + Studio ---------- */
const EXT_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Adobe", "CEP", "extensions", "com.iug.figma2ae");
const DOCS = path.join(app.getPath("documents"), "Figma2AE");
function unzipTo(buf, dir) {
  let p = 0, n = 0;
  while (p + 30 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8), flags = buf.readUInt16LE(p + 6);
    const csize = buf.readUInt32LE(p + 18), nlen = buf.readUInt16LE(p + 26), xlen = buf.readUInt16LE(p + 28);
    const name = buf.slice(p + 30, p + 30 + nlen).toString(flags & 0x800 ? "utf8" : "latin1");
    const start = p + 30 + nlen + xlen;
    if (flags & 8 && csize === 0) throw new Error("zip com descritor de dados não suportado");
    const raw = buf.slice(start, start + csize);
    const data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : null;
    if (!data) throw new Error("compressão não suportada no zip");
    const safe = name.replace(/\\/g, "/").split("/").filter(x => x && x !== ".." && x !== ".").join(path.sep);
    if (!name.endsWith("/") && safe) { const out = path.join(dir, safe); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, data); n++; }
    p = start + csize;
  }
  if (!n) throw new Error("pacote vazio ou inválido");
  return n;
}
if (!fs.existsSync(path.join(EXT_DIR, "version.json"))) { try { fs.mkdirSync(EXT_DIR, { recursive: true }); } catch (e) {} }
const upd = Updater.create({
  extDir: EXT_DIR, docsDir: DOCS, unzip: unzipTo, fallbackVersion: app.getVersion(),
  studioOpen: () => true, // o próprio Studio está aberto: a troca dele é feita ao reiniciar
  studioDir: path.dirname(path.dirname(app.getAppPath())), // ...\Figma2AE Studio\resources\app.asar → pasta do Studio
  log: m => console.log("[update] " + m)
});
function updInfo() { const s = upd.state; return { current: s.current, latest: s.latest, available: s.available, notes: s.notes, busy: s.busy, phase: s.phase, progress: s.progress, error: s.error, studio: app.getVersion() }; }
async function checarUpd(force) { await upd.check(force); if (win) win.webContents.send("upd", updInfo()); return updInfo(); }
ipcMain.handle("upd:check", (e, force) => checarUpd(!!force));
/* Troca o .asar do Studio: só dá com o Studio totalmente fechado (o Electron tem vários processos que
   seguram o arquivo). Um PowerShell separado espera todos fecharem, tenta copiar várias vezes e abre o Studio de novo. */
const PEND = path.join(DOCS, "_update", "studio_pendente.asar");
const SWAP_LOG = path.join(DOCS, "_update", "troca_studio.log");
function swapAndRestart() {
  const q = x => "'" + String(x).replace(/'/g, "''") + "'";
  const dst = path.join(path.dirname(app.getAppPath()), "app.asar"), exe = process.execPath;
  const ps = [
    `$log = ${q(SWAP_LOG)}; "inicio $(Get-Date)" | Out-File $log`,
    `$t = 0; while ((Get-Process -Name 'Figma2AE Studio' -ErrorAction SilentlyContinue) -and $t -lt 120) { Start-Sleep -Milliseconds 250; $t++ }`,
    `$ok = $false; for ($i = 0; $i -lt 40 -and -not $ok; $i++) { try { Copy-Item -LiteralPath ${q(PEND)} -Destination ${q(dst)} -Force -ErrorAction Stop; $ok = $true } catch { "tentativa $i : $($_.Exception.Message)" | Out-File $log -Append; Start-Sleep -Milliseconds 500 } }`,
    `if ($ok) { Remove-Item -LiteralPath ${q(PEND)} -Force -ErrorAction SilentlyContinue; "ok" | Out-File $log -Append } else { "falhou" | Out-File $log -Append }`,
    `Start-Process -FilePath ${q(exe)}`
  ].join("\r\n");
  // PowerShell aberto direto pelo Electron com "detached" morre sem rodar (sem console). Testado no Windows:
  // gravar um .ps1 e abrir via "cmd /c start" funciona e sobrevive ao Studio fechar.
  const ps1 = path.join(DOCS, "_update", "troca_studio.ps1");
  try { fs.mkdirSync(path.dirname(ps1), { recursive: true }); fs.writeFileSync(ps1, "\ufeff" + ps, "utf8"); } catch (e) {}
  spawn("cmd.exe", ["/c", "start", '""', "/min", "powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", ps1], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  setTimeout(() => app.exit(0), 1500); // exit (não quit) pra fechar tudo de uma vez
}
// abriu com uma troca pendente (uma tentativa anterior falhou): termina a atualização sozinho, no máximo 2 vezes
function finishPendingSwap() {
  if (!app.isPackaged || !fs.existsSync(PEND)) return false;
  const tries = path.join(DOCS, "_update", "troca_tentativas.txt");
  let n = 0; try { n = +fs.readFileSync(tries, "utf8") || 0; } catch (e) {}
  if (n >= 2) return false;
  try { fs.writeFileSync(tries, String(n + 1)); } catch (e) {}
  swapAndRestart(); return true;
}
ipcMain.handle("upd:apply", async () => {
  const tick = setInterval(() => win && win.webContents.send("upd", updInfo()), 400);
  const prev = process.noAsar; process.noAsar = true; // o Electron trataria os .asar como pasta
  let r;
  try { r = await upd.apply(); } catch (e) { clearInterval(tick); process.noAsar = prev; return { ok: false, error: e.message }; }
  clearInterval(tick); process.noAsar = prev;
  const prevNA = process.noAsar; process.noAsar = true; const hasPend = fs.existsSync(PEND); process.noAsar = prevNA;
  if (r.ok && hasPend && app.isPackaged) { try { fs.unlinkSync(path.join(DOCS, "_update", "troca_tentativas.txt")); } catch (e) {} swapAndRestart(); r.restarting = true; }
  return r;
});

function readJSON(f) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; } }
ipcMain.handle("cfg", () => cfg());
ipcMain.handle("salvarCfg", (e, c) => { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(Object.assign(cfg(), c))); return true; });
ipcMain.handle("listar", () => {
  let ids = [];
  try { ids = fs.readdirSync(BASE).filter(n => !n.startsWith("_") && fs.statSync(path.join(BASE, n)).isDirectory()); } catch (e) {}
  return ids.map(id => {
    const m = readJSON(path.join(BASE, id, "_meta.json")) || {};
    let st; try { st = fs.statSync(path.join(BASE, id, "figma2ae.json")); } catch (e) { return null; }
    return { id, label: m.label || id, time: m.time || st.mtimeMs, comps: m.comps || 0, status: m.status || "new", studio: !!m.studio };
  }).filter(Boolean).sort((a, b) => b.time - a.time).slice(0, 60);
});
ipcMain.handle("abrir", (e, id, opts) => {
  const dir = path.join(BASE, id);
  const pkg = readJSON(path.join(dir, "figma2ae.json"));
  if (!pkg || !pkg.comps) throw new Error("Pacote antigo ou inválido. Envie de novo pelo plugin do Figma.");
  pkgs[id] = pkg;
  const frames = engine.suggest(pkg, opts || cfg());
  frames.forEach(f => { f.thumb = f.ref ? path.join(dir, f.ref) : null; });
  return { id, dir, file: pkg.file, page: pkg.page, frames, continuity: pkg.comps.some(c => (c.layers || []).some(l => l.identity)) };
});
function post(url, body) {
  return new Promise((ok, bad) => {
    const data = Buffer.from(JSON.stringify(body), "utf8");
    const r = http.request(url, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length } }, res => {
      const ch = []; res.on("data", c => ch.push(c)); res.on("end", () => { try { ok(JSON.parse(Buffer.concat(ch).toString("utf8"))); } catch (e) { bad(new Error("resposta inválida do After Effects")); } });
    });
    r.on("error", bad); r.setTimeout(10 * 60 * 1000, () => r.destroy(new Error("o After Effects demorou demais pra responder")));
    r.write(data); r.end();
  });
}
ipcMain.handle("montar", async (e, id, frames, opts) => {
  const pkg = pkgs[id] || readJSON(path.join(BASE, id, "figma2ae.json"));
  const plan = engine.buildPlan(pkg, frames, { master: opts.master });
  try {
    return await post("http://127.0.0.1:7452/build", { id, plan, opts: { fps: +opts.fps || 30, master: opts.master, openAfter: opts.openAfter, duration: 5, states: "guias" } });
  } catch (err) {
    return { ok: false, error: "Não consegui falar com o After Effects (" + err.message + "). Ele precisa estar aberto." };
  }
});
ipcMain.handle("ping", () => new Promise(ok => {
  const r = http.get("http://127.0.0.1:7452/ping", res => { const ch = []; res.on("data", c => ch.push(c)); res.on("end", () => { try { ok(JSON.parse(Buffer.concat(ch).toString())); } catch (e) { ok(null); } }); });
  r.on("error", () => ok(null)); r.setTimeout(1500, () => { r.destroy(); ok(null); });
}));
function dirSize(d) { let t = 0; try { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); t += e.isDirectory() ? dirSize(p) : fs.statSync(p).size; }); } catch (e) {} return t; }
function safeDir(id) { const d = path.resolve(BASE, String(id || "")); return id && !String(id).startsWith("_") && path.dirname(d) === path.resolve(BASE) ? d : null; }
// apaga pacotes do histórico (e as pastas no disco). which: lista de ids | "feitos" | "todos"
ipcMain.handle("tamanho", (e, ids) => (ids || []).reduce((t, id) => { const d = safeDir(id); return t + (d ? dirSize(d) : 0); }, 0));
ipcMain.handle("apagar", (e, ids) => {
  let n = 0, bytes = 0;
  (ids || []).forEach(id => { const d = safeDir(id); if (!d || !fs.existsSync(d)) return; const sz = dirSize(d);
    try { fs.rmSync(d, { recursive: true, force: true }); n++; bytes += sz; } catch (er) {} });
  return { n, bytes };
});
ipcMain.handle("pasta", (e, id) => shell.openPath(id ? path.join(BASE, id) : BASE));
