/* Figma2AE Studio — processo principal */
const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const path = require("path"), fs = require("fs"), http = require("http");
const engine = require("./engine");

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
  criar();
  fs.mkdirSync(BASE, { recursive: true });
  // avisa o After Effects que o Studio está aberto (aí o painel não importa sozinho)
  const beat = () => { try { fs.writeFileSync(path.join(BASE, "_studio.json"), JSON.stringify({ t: Date.now() })); } catch (e) {} };
  beat(); setInterval(beat, 2000);
  let tm = 0;
  try { fs.watch(BASE, () => { clearTimeout(tm); tm = setTimeout(() => win && win.webContents.send("atualizar"), 500); }); } catch (e) {}
});
app.on("window-all-closed", () => { try { fs.unlinkSync(path.join(BASE, "_studio.json")); } catch (e) {} app.quit(); });

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
