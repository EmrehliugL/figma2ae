// Testa a extensão: receptor em segundo plano (server.html) + painel (index.html) num DOM simulado.
"use strict";
const assert = require("assert"), fs = require("fs"), http = require("http"), path = require("path");
const { JSDOM } = require("/tmp/node_modules/jsdom");
const os = require("os"); fs.rmSync("/tmp/home", { recursive: true, force: true }); os.homedir = () => "/tmp/home";
const calls = [], opened = [];
function cep() { return {
  evalScript(s, cb) {
    calls.push(s);
    if (s.startsWith("f2aePing") || s.startsWith("f2aeLoad")) cb('{"ok":true,"version":"2.1.0","project":"teste.aep","error":""}');
    else if (s.startsWith("f2aeBuildPlan")) cb('{"ok":true,"comps":2,"layers":12,"seconds":2.1,"fonts":[],"notes":[],"names":["A","B","MASTER_SEQUENCIA"]}');
    else if (s.startsWith("f2aeImport")) cb('{"ok":true,"comps":1,"layers":9,"precomps":1,"seconds":1.5,"fonts":[],"notes":[],"names":["SCENE_07_F02"]}');
    else cb("");
  },
  requestOpenExtension(id) { opened.push(id); }
}; }
function load(file, url) {
  const html = fs.readFileSync(path.join(__dirname, "../extension", file), "utf8");
  const dom = new JSDOM(html.replace(/<script>[\s\S]*?<\/script>/g, ""), { runScripts: "outside-only", url });
  const w = dom.window; w.require = require; w.process = process; w.__adobe_cep__ = cep();
  Object.defineProperty(w, "localStorage", { value: { getItem: () => null, setItem() {} } });
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => w.eval(m[1].replace('"use strict";', "")));
  return w;
}
function req(method, url, body, headers) {
  return new Promise((ok, bad) => {
    const r = http.request({ host: "127.0.0.1", port: 7452, method, path: url, headers: headers || {} }, res => { const ch = []; res.on("data", c => ch.push(c)); res.on("end", () => ok({ status: res.statusCode, headers: res.headers, body: Buffer.concat(ch).toString() })); });
    r.on("error", bad); if (body) r.write(body); r.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  // 1) receptor sobe sozinho (sem painel aberto)
  load("server.html", "file:///C:/ext/server.html");
  await sleep(400);
  const pre = await req("OPTIONS", "/package", null, { "Access-Control-Request-Private-Network": "true" });
  assert.strictEqual(pre.status, 204); assert.strictEqual(pre.headers["access-control-allow-private-network"], "true");
  // só o plugin do Figma (origem "null"), o painel e o Studio (sem origem) entram; sites, não
  for (const o of ["https://site-qualquer.com", "http://localhost:3000", "https://figma.com.golpe.io"]) {
    const bad = await req("POST", "/quick", Buffer.from("x"), { Origin: o, "Content-Type": "text/plain" });
    assert.strictEqual(bad.status, 403, "recusa " + o);
    assert.strictEqual(bad.headers["access-control-allow-origin"], undefined);
    assert.strictEqual((await req("OPTIONS", "/package", null, { Origin: o })).status, 403);
    assert.strictEqual((await req("GET", "/ping", null, { Origin: o })).status, 403, "não revela o projeto aberto pra sites");
  }
  for (const o of ["null", "https://www.figma.com", "file://"]) assert.strictEqual((await req("GET", "/ping", null, { Origin: o })).status, 200, "aceita " + o);
  const ping = JSON.parse((await req("GET", "/ping")).body);
  assert.strictEqual(ping.app, "Figma2AE"); assert.strictEqual(ping.ok, true, "script do AE carregado");
  // 2) Figma envia com o painel FECHADO → guarda e pede pra abrir o painel
  const zip = fs.readFileSync("/tmp/f2ae_test.zip");
  const r = await req("POST", "/package", zip, { "Content-Type": "application/zip", "X-F2AE-Name": encodeURIComponent("Storyboard Teste - SCENE_07") });
  assert.strictEqual(r.status, 200, r.body); assert.strictEqual(JSON.parse(r.body).comps, 2);
  assert.deepStrictEqual(opened, ["com.iug.figma2ae.panel"], "abre o painel sozinho");
  const base = "/tmp/home/Documents/Figma2AE/Recebidos";
  assert.ok(fs.readdirSync(base).some(n => !n.startsWith("_")), "pacote salvo na pasta Recebidos");
  assert.strictEqual((await req("POST", "/package", Buffer.from("lixo"))).status, 400);
  // 3) painel abre e mostra o pacote pendente
  const w = load("index.html", "file:///C:/ext/index.html");
  await sleep(300);
  assert.strictEqual(w.document.querySelectorAll(".cp").length, 2, "2 comps listados");
  assert.ok(w.document.querySelector(".ph b").textContent.includes("SCENE_07"));
  assert.ok(w.document.querySelector("#conn").textContent.includes("Figma conectado"));
  const cb0 = w.document.querySelector('.cp input[data-c="0"]'); cb0.checked = false; cb0.dispatchEvent(new w.Event("change", { bubbles: true }));
  w.document.querySelector("[data-imp]").click();
  await sleep(300);
  const imp = calls.find(c => c.startsWith("f2aeImport"));
  const jp = JSON.parse(imp.match(/^f2aeImport\((".*?"),/)[1]);
  const sent = JSON.parse(fs.readFileSync(jp, "utf8"));
  assert.deepStrictEqual(sent.comps.map(c => c.compName), ["SELECAO_PARCIAL"], "só o marcado");
  assert.ok(w.document.querySelector(".res .ok"));
  const metaDir = fs.readdirSync(base).find(n => !n.startsWith("_"));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(base, metaDir, "_meta.json"))).status, "done", "marcado como importado");
  // 4) com o painel aberto, um novo envio aparece sozinho
  await req("POST", "/package", zip, { "X-F2AE-Name": "Outro" });
  await sleep(3000);
  assert.strictEqual(w.document.querySelectorAll(".pkg").length, 2, "novo pacote apareceu no painel aberto");
  // 5) Studio: com o Studio aberto o painel não abre sozinho; /build manda o After Effects montar o plano
  fs.writeFileSync(path.join(base, "_studio.json"), "{}");
  opened.length = 0;
  await req("POST", "/package", zip, { "X-F2AE-Name": "Pro Studio" });
  assert.strictEqual(opened.length, 0, "com o Studio aberto, quem mostra o pacote é o Studio");
  const pid = fs.readdirSync(base).filter(n => !n.startsWith("_")).sort().pop();
  const plan = { format: "figma2ae-plan", version: 1, file: "X", shots: [], master: true };
  const rb = JSON.parse((await req("POST", "/build", JSON.stringify({ id: pid, plan, opts: { fps: 25 } }))).body);
  assert.ok(rb.ok, JSON.stringify(rb));
  const bcall = calls.find(c => c.startsWith("f2aeBuildPlan"));
  assert.ok(bcall && /"fps":25/.test(bcall), "chamou o After Effects com o plano e as opções");
  const bad = JSON.parse((await req("POST", "/build", JSON.stringify({ id: "../../etc", plan }))).body);
  assert.ok(!bad.ok, "não aceita caminho fora da pasta Recebidos");
  // 5b) Studio INSTALADO mas fechado: o pacote vai pro Studio (abre o Studio), não pro painel
  fs.unlinkSync(path.join(base, "_studio.json"));
  const fakeLocal = "/tmp/fakelocal"; fs.rmSync(fakeLocal, { recursive: true, force: true });
  const exeDir = path.join(fakeLocal, "Programs", "Figma2AE Studio"); fs.mkdirSync(exeDir, { recursive: true });
  const exe = path.join(exeDir, "Figma2AE Studio.exe");
  fs.writeFileSync(exe, "#!/bin/sh\necho $$ > /tmp/fakelocal/abriu\n"); fs.chmodSync(exe, 0o755);
  process.env.LOCALAPPDATA = fakeLocal;
  opened.length = 0;
  const rs = JSON.parse((await req("POST", "/package", zip, { "X-F2AE-Name": "Vai pro Studio" })).body);
  assert.strictEqual(rs.route, "studio", "com o Studio instalado o destino é o Studio");
  assert.strictEqual(rs.auto, false, "não importa sozinho no After");
  await sleep(600);
  assert.ok(fs.existsSync("/tmp/fakelocal/abriu"), "abriu o Studio");
  assert.strictEqual(opened.length, 0, "não abriu o painel");
  const pg = JSON.parse((await req("GET", "/ping")).body);
  assert.strictEqual(pg.route, "studio");
  // opção desligada no painel: volta pro painel
  fs.writeFileSync(path.join(base, "_config.json"), JSON.stringify({ oStudio: false }));
  const rp = JSON.parse((await req("POST", "/package", zip, { "X-F2AE-Name": "Vai pro painel" })).body);
  assert.strictEqual(rp.route, "panel");
  assert.deepStrictEqual(opened, ["com.iug.figma2ae.panel"]);
  delete process.env.LOCALAPPDATA;
  fs.writeFileSync(path.join(base, "_studio.json"), "{}");
  // 6) apagar do disco: lixeira por pacote pede confirmação e remove a pasta
  const before = fs.readdirSync(base).filter(n => !n.startsWith("_")).length;
  w.document.querySelector("[data-rm]").click();
  assert.ok(w.document.querySelector(".modal"), "pede confirmação antes de apagar");
  w.document.querySelector(".modal [data-x]").click();
  assert.strictEqual(fs.readdirSync(base).filter(n => !n.startsWith("_")).length, before, "cancelar não apaga nada");
  w.document.querySelector("[data-rm]").click(); w.document.querySelector(".modal [data-ok]").click();
  assert.strictEqual(fs.readdirSync(base).filter(n => !n.startsWith("_")).length, before - 1, "apagou 1 pasta");
  w.document.querySelector("#clear").click(); w.document.querySelector(".modal [data-ok]").click();
  const left = fs.readdirSync(base).filter(n => !n.startsWith("_"));
  assert.ok(left.every(n => { const m = JSON.parse(fs.readFileSync(path.join(base, n, "_meta.json"))); return m.status !== "done" && m.status !== "studio"; }), "apagou só os importados");
  assert.ok(fs.existsSync(path.join(base, "_studio.json")), "não toca nos arquivos internos");
  console.log("TODOS OS TESTES DA EXTENSÃO (RECEPTOR + PAINEL) PASSARAM");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
