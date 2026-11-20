/* Discord Rich Presence do After Effects: só mostra "Jogando After Effects", nada mais.
   Roda dentro do receptor escondido (server.html), que vive enquanto o After Effects está aberto.
   Fala direto com o Discord pelo pipe local (discord-ipc-N); sem dependências. */
"use strict";
const net = require("net"), fs = require("fs"), path = require("path"), os = require("os");

let PATHS = null; try { PATHS = require("./paths.js"); } catch (e) {}
const CFG = path.join(PATHS ? PATHS.docs() : path.join(os.homedir(), "Documents", "Figma2AE"), "discord.json");
const RETRY_MS = 15000;

function readCfg(file) { try { return JSON.parse(fs.readFileSync(file || CFG, "utf8")); } catch (e) { return {}; } }
function pipePath(i) {
  if (process.env.F2AE_DISCORD_PIPE) return process.env.F2AE_DISCORD_PIPE + i; // testes
  if (process.platform === "win32") return "\\\\?\\pipe\\discord-ipc-" + i;
  const dir = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || "/tmp";
  return path.join(dir, "discord-ipc-" + i);
}
function frame(op, obj) {
  const body = Buffer.from(JSON.stringify(obj), "utf8"), h = Buffer.alloc(8);
  h.writeInt32LE(op, 0); h.writeInt32LE(body.length, 4);
  return Buffer.concat([h, body]);
}

function start(opts) {
  opts = opts || {};
  const cfgFile = opts.cfgFile || CFG, log = opts.log || (() => {});
  const state = { status: "parado", clientId: "", error: "" };
  let sock = null, timer = 0, stopped = false, startedAt = Date.now(), triedPlain = false;

  function setStatus(s, err) { state.status = s; state.error = err || ""; if (opts.onStatus) opts.onStatus(Object.assign({}, state)); }
  function schedule(ms) { clearTimeout(timer); if (!stopped) timer = setTimeout(connect, ms); }
  function setActivity(withTime) {
    // atividade vazia = o Discord mostra só o nome do aplicativo ("Jogando After Effects")
    const activity = withTime ? { timestamps: { start: Math.floor(startedAt / 1000) }, instance: false } : { instance: false };
    sock.write(frame(1, { cmd: "SET_ACTIVITY", args: { pid: process.pid, activity }, nonce: String(Date.now()) + Math.random() }));
  }
  function tryPipe(i, clientId) {
    if (i > 9) { setStatus("discord fechado"); schedule(RETRY_MS); return; }
    const s = net.createConnection(pipePath(i));
    let buf = Buffer.alloc(0), ok = false;
    s.once("error", () => { s.destroy(); if (!ok) tryPipe(i + 1, clientId); });
    s.once("connect", () => {
      ok = true; sock = s; s.removeAllListeners("error");
      s.on("error", () => {});
      s.write(frame(0, { v: 1, client_id: clientId }));
    });
    s.on("data", d => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 8) {
        const op = buf.readInt32LE(0), len = buf.readInt32LE(4);
        if (buf.length < 8 + len) break;
        let msg = {}; try { msg = JSON.parse(buf.slice(8, 8 + len).toString("utf8")); } catch (e) {}
        buf = buf.slice(8 + len);
        if (op === 2) { setStatus("erro", (msg && msg.message) || "o Discord recusou a conexão (confira o ID do aplicativo)"); s.destroy(); return; }
        if (op === 3) { s.write(frame(4, msg)); continue; } // ping → pong
        if (msg.evt === "READY") { setActivity(false); continue; }
        if (msg.cmd === "SET_ACTIVITY") {
          if (msg.evt === "ERROR" && !triedPlain) { triedPlain = true; setActivity(true); continue; }
          if (msg.evt === "ERROR") setStatus("erro", msg.data && msg.data.message);
          else setStatus("mostrando");
        }
      }
    });
    s.on("close", () => {
      if (sock !== s) return; // fechada por nós (troca de ID / desligado): quem reagenda é quem fechou
      sock = null;
      if (!stopped) { if (state.status === "mostrando") setStatus("discord fechado"); schedule(RETRY_MS); }
    });
  }
  function connect() {
    if (stopped) return;
    const c = readCfg(cfgFile), id = String(c.clientId || "").trim();
    state.clientId = id;
    if (c.enabled === false) { setStatus("desligado"); schedule(RETRY_MS); return; }
    if (!/^\d{15,22}$/.test(id)) { setStatus("sem ID", "falta o ID do aplicativo do Discord"); schedule(RETRY_MS); return; }
    if (sock) return;
    triedPlain = false;
    tryPipe(0, id);
  }
  // muda o ID ou desliga no painel → aplica sem reabrir o After
  let lastCfg = JSON.stringify(readCfg(cfgFile));
  const watch = setInterval(() => {
    const now = JSON.stringify(readCfg(cfgFile));
    if (now === lastCfg) return;
    lastCfg = now;
    if (sock) { try { sock.destroy(); } catch (e) {} sock = null; }
    schedule(200);
  }, 3000);
  connect();
  return {
    state,
    stop() { stopped = true; clearTimeout(timer); clearInterval(watch); if (sock) { try { sock.destroy(); } catch (e) {} } }
  };
}
module.exports = { start, readCfg, CFG, frame };
