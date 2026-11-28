"use strict";
// Correções da 2.12: hash de imagem do arquivo inteiro, nome único da guia, resposta do After com caracteres de controle.
globalThis.__F2AE_TEST__ = true;
const assert = require("assert"), fs = require("fs"), path = require("path");
const M = require("./mockFigma");
const P = require("../figma-plugin/code.js");
const src = fs.readFileSync(path.join(__dirname, "../figma-plugin/code.js"), "utf8");
const fnvBytes = new Function(src.match(/function fnvBytes[\s\S]*?\n}\n/)[0] + "; return fnvBytes;")();

// 1) duas imagens grandes do MESMO tamanho, diferentes só em bytes que a versão antiga pulava
const a = new Uint8Array(3e6); for (let i = 0; i < a.length; i++) a[i] = (i * 7) & 255;
const b = a.slice(); b[1] ^= 1; b[2999998] ^= 4;
assert.notStrictEqual(fnvBytes(a), fnvBytes(b), "imagens diferentes nunca viram a mesma");
assert.strictEqual(fnvBytes(a), fnvBytes(a.slice()), "imagem igual continua sendo reaproveitada");
const ex = new P.Exporter({});
const pa = ex.addFile("IMAGES", "foto", a), pb = ex.addFile("IMAGES", "foto", b), pc = ex.addFile("IMAGES", "foto", a.slice());
assert.notStrictEqual(pa, pb); assert.strictEqual(pa, pc); assert.strictEqual(ex.files.length, 2);
// velocidade: 3 MB em bem menos de meio segundo
const t0 = Date.now(); for (let k = 0; k < 5; k++) fnvBytes(a); assert.ok((Date.now() - t0) / 5 < 400, "hash rápido");

// 2) guias de comps com nomes longos que começam iguais não se sobrescrevem
const long = "SCENE_01_ESTE_NOME_E_MUITO_COMPRIDO_PRA_CABER_EM_SESSENTA_CARACTERES_";
const r1 = ex.addFile("REF", long + "A", new Uint8Array([1, 2, 3])), r2 = ex.addFile("REF", long + "B", new Uint8Array([4, 5, 6]));
assert.notStrictEqual(r1, r2, "cada guia num arquivo"); assert.ok(/^assets\/REF\//.test(r1));
// pelo caminho todo: dois frames de tamanhos diferentes com nomes longos parecidos
const f1 = M.makeNode("FRAME", { name: long + "1", width: 1920, height: 1080, fills: [M.solid(1, 1, 1)] }, [M.makeNode("RECTANGLE", { name: "r", fills: [M.solid(1, 0, 0)] })]);
const f2 = M.makeNode("FRAME", { name: long + "2", x: 2000, width: 1280, height: 720, fills: [M.solid(1, 1, 1)] }, [M.makeNode("RECTANGLE", { name: "r", fills: [M.solid(0, 0, 1)] })]);
const page = { type: "PAGE", name: "P", id: "0:1", children: [f1, f2], selection: [] }; f1.parent = page; f2.parent = page;
M.install(page); page.selection = [f1, f2];

// 3) resposta do After: tab, \r e outros controles no nome de camada não quebram o JSON
const host = fs.readFileSync(path.join(__dirname, "../extension/host/host.jsx"), "utf8");
const esc = new Function(host.match(/function f2aeEsc[\s\S]*?\n}\n/)[0] + "; return f2aeEsc;")();
const nasty = 'Título\t"aspas"\r\nlinha\\barra\u0001 fim';
assert.strictEqual(JSON.parse('"' + esc(nasty) + '"'), nasty);

// 4) o .bat do "Abrir pacote…" não recebe caminho com % ou ! (o cmd trocaria o texto)
const jsx = fs.readFileSync(path.join(__dirname, "../after-effects/Figma2AE.jsx"), "utf8");
assert.ok(/\/\[%!\^&"\]\/\.test\(zipFile\.fsName\)/.test(jsx), "zip com % no nome é copiado pra um nome simples antes de extrair");
assert.strictEqual(jsx, fs.readFileSync(path.join(__dirname, "../extension/jsx/Figma2AE.jsx"), "utf8"), "cópia da extensão igual");

(async () => {
  const out = await P.exportFrames({ options: {} });
  const pkg = JSON.parse(out.manifest);
  const refs = pkg.comps.map(c => c.ref.file);
  assert.strictEqual(new Set(refs).size, 2, "duas guias diferentes: " + refs.join(" | "));
  refs.forEach(r => assert.ok(out.files.some(f => f.path === r), "arquivo da guia está no pacote"));
  // 5) mesma foto em vários frames: baixa uma vez só por exportação
  let bytesCalls = 0; const gi = figma.getImageByHash;
  figma.getImageByHash = h => { const im = gi(h); return { getSizeAsync: im.getSizeAsync, getBytesAsync: async () => { bytesCalls++; return im.getBytesAsync(); } }; };
  const mk = (x, n) => M.makeNode("FRAME", { name: "F" + n, x, width: 1920, height: 1080, fills: [M.solid(1, 1, 1)] }, [M.makeNode("RECTANGLE", { name: "Foto", width: 800, height: 600, fills: [M.image("hashFotoX"), M.solid(0, 0, 0, 0.3)] })]);
  const fr = [mk(0, 1), mk(2000, 2), mk(4000, 3)];
  const pg2 = { type: "PAGE", name: "P2", id: "0:2", children: fr, selection: fr }; fr.forEach(f => f.parent = pg2);
  figma.currentPage = pg2;
  const o2 = await P.exportFrames({ options: { reference: false } });
  assert.strictEqual(bytesCalls, 1, "foto baixada uma vez pros 3 frames");
  const files2 = JSON.parse(o2.manifest).comps.map(c => c.layers.find(l => l.name === "Foto").paints[0].file);
  assert.strictEqual(new Set(files2).size, 1, "os 3 frames usam o mesmo arquivo");
  figma.getImageByHash = gi;
  // 6) miniaturas: não exporta de novo a cada clique; refaz só o frame que mudou
  let exp = 0; const posts = [];
  fr.forEach(f => { const e0 = f.exportAsync; f.exportAsync = async o => { exp++; return e0(o); }; });
  figma.ui.postMessage = m => posts.push(m);
  P._thumbWatch(true);
  const ids = fr.map(f => f.id);
  await P.sendThumbs(ids); assert.strictEqual(exp, 3);
  await P.sendThumbs(ids); assert.strictEqual(exp, 3, "segundo clique não exporta nada");
  P.thumbsDirty({ nodeChanges: [{ type: "PROPERTY_CHANGE", node: fr[1].children[0] }] });
  await P.sendThumbs(ids); assert.strictEqual(exp, 4, "só o frame editado é refeito");
  P.thumbsDirty({ nodeChanges: [{ type: "DELETE", node: { removed: true } }] });
  await P.sendThumbs(ids); assert.strictEqual(exp, 7, "algo apagado: refaz tudo por segurança");
  P._thumbWatch(false);
  await P.sendThumbs(ids); assert.strictEqual(exp, 10, "sem como vigiar mudanças, nunca reaproveita");
  console.log("TODOS OS TESTES DAS CORREÇÕES PASSARAM");
})().catch(e => { console.error(e); process.exit(1); });
