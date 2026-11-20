// Testa o Rich Presence com um "Discord" falso escutando no pipe/socket local.
"use strict";
const assert = require("assert"), net = require("net"), fs = require("fs"), path = require("path");
const dir = "/tmp/f2ae_dc"; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
process.env.F2AE_DISCORD_PIPE = path.join(dir, "ipc-");
const D = require("../extension/discord.js");
const cfg = path.join(dir, "discord.json");
const got = [];
function parse(buf, cb) { while (buf.length >= 8) { const op = buf.readInt32LE(0), len = buf.readInt32LE(4); if (buf.length < 8 + len) break; cb(op, JSON.parse(buf.slice(8, 8 + len))); buf = buf.slice(8 + len); } return buf; }
let rejectEmpty = true;
const srv = net.createServer(s => {
  let b = Buffer.alloc(0);
  s.on("data", d => { b = parse(Buffer.concat([b, d]), (op, m) => {
    got.push({ op, m });
    if (op === 0) s.write(D.frame(1, { cmd: "DISPATCH", evt: "READY", data: { v: 1 } }));
    if (op === 1 && m.cmd === "SET_ACTIVITY") {
      const empty = !m.args.activity.timestamps;
      if (empty && rejectEmpty) s.write(D.frame(1, { cmd: "SET_ACTIVITY", evt: "ERROR", nonce: m.nonce, data: { message: "fields required" } }));
      else s.write(D.frame(1, { cmd: "SET_ACTIVITY", evt: null, nonce: m.nonce, data: {} }));
    }
  }); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  // sem ID: não conecta
  fs.writeFileSync(cfg, JSON.stringify({ clientId: "", enabled: true }));
  const sts = [];
  srv.listen(path.join(dir, "ipc-1")); // o pipe 0 não existe: tem que achar o 1
  const h = D.start({ cfgFile: cfg, onStatus: s => sts.push(s.status) });
  await sleep(200);
  assert.strictEqual(h.state.status, "sem ID");
  assert.strictEqual(got.length, 0);
  // cola o ID → conecta sozinho, handshake com o client_id, e a atividade é só o nome do app
  fs.writeFileSync(cfg, JSON.stringify({ clientId: "1234567890123456789", enabled: true }));
  await sleep(3800);
  const hs = got.find(g => g.op === 0);
  assert.ok(hs && hs.m.client_id === "1234567890123456789" && hs.m.v === 1, "handshake");
  const acts = got.filter(g => g.op === 1 && g.m.cmd === "SET_ACTIVITY");
  assert.ok(!acts[0].m.args.activity.details && !acts[0].m.args.activity.state && !acts[0].m.args.activity.assets, "sem nenhuma informação extra");
  assert.ok(acts[0].m.args.pid > 0, "pid do processo (o Discord limpa quando o After fecha)");
  assert.strictEqual(acts.length, 2, "se o Discord recusar a atividade vazia, manda só o tempo");
  assert.strictEqual(h.state.status, "mostrando");
  // desligar no painel → fecha a conexão
  fs.writeFileSync(cfg, JSON.stringify({ clientId: "1234567890123456789", enabled: false }));
  await sleep(3800);
  assert.strictEqual(h.state.status, "desligado");
  h.stop(); srv.close();
  console.log("TODOS OS TESTES DO DISCORD PASSARAM");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
