"use strict";
// v2.5 Quick Import: camadas escolhidas no Figma → soltas na comp aberta do After (editável ou PNG separado)
globalThis.__F2AE_TEST__ = true;
const assert = require("assert");
const fs = require("fs");
const M = require("./mockFigma");
const { makeNode, solid } = M;
const P = require("../figma-plugin/code.js");

/* ------------------------------------------------ After falso (mesmo esquema do test_flat) */
function prop(name) {
  const p = { name, value: null, kids: {}, list: [], enabled: true,
    setValue(v) { p.value = v; },
    property(k) { if (typeof k === "number") return p.list[k - 1]; return p.kids[k] || (p.kids[k] = prop(k)); },
    addProperty(k) { const c = prop(k); p.list.push(c); p.kids[k] = c; p.numProperties = p.list.length; return c; } };
  return p;
}
function itemsList() { const a = []; return { arr: a, get length() { return a.length; } }; }
function folder(name) { const f = { name, items: null, parentFolder: null }; const l = itemsList(); f.items = new Proxy(l, { get: (t, k) => (k === "length" ? t.arr.length : /^\d+$/.test(k) ? t.arr[+k - 1] : t[k]) }); f._arr = l.arr; return f; }
global.FolderItem = function () {}; global.CompItem = function () {};
const ROOT = folder("root"); Object.setPrototypeOf(ROOT, FolderItem.prototype);
let COMPS = 0;
function layerOf(comp, kind, w, h) {
  const L = prop("layer"); Object.assign(L, { kind, parent: null, selected: false, containingComp: comp, source: { name: kind },
    setTrackMatte(m, t) { L.matte = { layer: m, type: t }; }, remove() { comp._ls.splice(comp._ls.indexOf(L), 1); },
    moveBefore(o) { comp._ls.splice(comp._ls.indexOf(L), 1); comp._ls.splice(comp._ls.indexOf(o), 0, L); },
    moveAfter(o) { comp._ls.splice(comp._ls.indexOf(L), 1); comp._ls.splice(comp._ls.indexOf(o) + 1, 0, L); } });
  const t = L.property("ADBE Transform Group");
  t.property("ADBE Anchor Point").value = kind === "shape" || kind === "null" ? [0, 0] : [(w || 0) / 2, (h || 0) / 2];
  t.property("ADBE Position").value = [comp.width / 2, comp.height / 2];
  t.property("ADBE Scale").value = [100, 100]; t.property("ADBE Rotate Z").value = 0;
  L.name = kind; return L;
}
function makeComp(name, w, h) {
  COMPS++;
  const c = Object.create(CompItem.prototype);
  Object.assign(c, { name, width: w, height: h, duration: 10, frameRate: 30, pixelAspect: 1, _ls: [], parentFolder: null, openInViewer() { global.app.project.activeItem = c; } });
  const add = (kind, w2, h2) => { const L = layerOf(c, kind, w2, h2); c._ls.unshift(L); return L; };
  c.layers = { add: src => add("footage", src.width, src.height), addShape: () => add("shape"), addSolid: (col, n, sw, sh) => { const L = add("solid", sw, sh); L.name = n; return L; }, addNull: () => add("null"),
    addText: () => { const L = add("text"); L.property("ADBE Text Properties").property("ADBE Text Document").value = { text: "" }; return L; },
    addBoxText: sz => { const L = add("text"); L.property("ADBE Text Properties").property("ADBE Text Document").value = { text: "", boxTextPos: [0, 0], boxTextSize: sz, resetCharStyle() {}, resetParagraphStyle() {} }; return L; } };
  Object.defineProperty(c, "numLayers", { get: () => c._ls.length });
  c.layer = i => c._ls[i - 1];
  return c;
}
let MANIFEST = "";
global.app = { version: "26.0", project: { activeItem: null, rootFolder: ROOT,
  items: { addComp: (n, w, h) => makeComp(n, w, h), addFolder: n => { const f = folder(n); Object.setPrototypeOf(f, FolderItem.prototype); ROOT._arr.push(f); return f; } },
  importFile: o => ({ name: o.file.name, width: 400, height: 200, parentFolder: null }) },
  beginUndoGroup() {}, endUndoGroup() {}, beginSuppressDialogs() {}, endSuppressDialogs() {}, findMenuCommandId: () => 0, executeCommand() {} };
global.ImportOptions = function (f) { this.file = f; };
global.File = function (p) { this.fsName = p; this.exists = true; this.name = String(p).split("/").pop(); this.length = 10; this.parent = { fsName: "/pkg" };
  this.open = () => true; this.read = () => MANIFEST; this.close = () => {}; this.copy = () => true; };
global.Folder = function (p) { this.fsName = p; this.exists = true; this.create = () => {}; };
global.Folder.myDocuments = { fsName: "/docs" };
global.Shape = function () {}; global.MarkerValue = function () {};
global.TrackMatteType = { ALPHA: "ALPHA", LUMA: "LUMA" }; global.MaskMode = { ADD: "ADD", INTERSECT: "INTERSECT" };
global.BlendingMode = {}; global.ParagraphJustification = {};
global.$ = { os: "Windows 10" };
global.F2AE_TEST = {};
const src = fs.readFileSync(__dirname + "/../after-effects/Figma2AE.jsx", "utf8");
new Function("F2AE_TEST", "$", src.replace(/\}\)\(this\);\s*$/, "})({});"))(global.F2AE_TEST, global.$);
const { quickImport } = global.F2AE_TEST;

(async () => {
  /* ------------------------------------------------ plugin */
  const botao = makeNode("RECTANGLE", { name: "Botão", x: 100, y: 200, width: 300, height: 80, cornerRadius: 12, fills: [solid(0.2, 0.5, 1)] });
  const titulo = makeNode("TEXT", { name: "Título", characters: "Olá mundo", x: 100, y: 60, width: 400, height: 60, fontName: { family: "Inter", style: "Bold" }, fontSize: 48, fills: [solid(1, 1, 1)] });
  const icone = makeNode("ELLIPSE", { name: "Ícone", x: 20, y: 10, width: 40, height: 40, fills: [solid(1, 1, 0)] });
  const card = makeNode("GROUP", { name: "Card", x: 600, y: 300, width: 300, height: 200 }, [icone, makeNode("RECTANGLE", { name: "Fundo card", x: 0, y: 0, width: 300, height: 200, fills: [solid(0.1, 0.1, 0.1)] })]);
  const f = makeNode("FRAME", { name: "Tela 1", x: 5000, y: 3000, width: 1920, height: 1080, clipsContent: true, fills: [solid(0, 0, 0)] }, [botao, titulo, card]);
  const solto = makeNode("RECTANGLE", { name: "Solto", x: -800, y: -800, width: 200, height: 100, fills: [solid(1, 0, 0)] });
  const page = makeNode("PAGE", { name: "P" }, [f, solto]);
  M.install(page);

  // várias camadas, inclusive uma dentro da outra (o ícone está dentro do card: não pode vir duplicado)
  page.selection = [botao, titulo, card, icone];
  assert.deepStrictEqual(P.quickTargets(page.selection).map(n => n.name), ["Botão", "Título", "Card"]);
  let r = await P.quickExport({ mode: "vector", options: {} });
  let pkg = JSON.parse(r.manifest);
  assert.strictEqual(pkg.quick, true); assert.strictEqual(pkg.layers.length, 3);
  const kinds = pkg.layers.map(l => l.spec.kind);
  assert.deepStrictEqual(kinds, ["shape", "text", "group"], "editável: shape, texto e grupo (nulo), nada de precomp");
  assert.deepStrictEqual([pkg.layers[0].spec.xf.tx, pkg.layers[0].spec.xf.ty], [100, 200], "posição em relação ao frame dele");
  assert.strictEqual(pkg.layers[0].frameW, 1920);

  // rasterizado: uma imagem separada pra cada camada
  r = await P.quickExport({ mode: "raster", options: { rasterScale: 2 } });
  pkg = JSON.parse(r.manifest);
  assert.ok(pkg.layers.every(l => l.spec.kind === "raster"), "tudo imagem");
  assert.strictEqual(new Set(pkg.layers.map(l => l.spec.file)).size, 3, "um PNG pra cada camada, separados");
  assert.strictEqual(r.files.length, 3);
  assert.ok(!pkg.layers.some(l => l.spec.reason), "sem aviso de 'virou imagem' (foi pedido)");

  // camada solta no canvas (fora de frame) entra no meio da comp
  page.selection = [solto];
  r = await P.quickExport({ mode: "vector", options: {} });
  pkg = JSON.parse(r.manifest);
  assert.strictEqual(pkg.layers[0].center, true);
  assert.deepStrictEqual([pkg.layers[0].spec.xf.tx, pkg.layers[0].spec.xf.ty], [0, 0]);

  /* ------------------------------------------------ After: entra na comp aberta, sem criar comp */
  page.selection = [botao, titulo, card];
  r = await P.quickExport({ mode: "vector", options: {} });
  const aberta = makeComp("Minha comp", 1920, 1080); aberta._ls.push(layerOf(aberta, "solid", 1920, 1080));
  global.app.project.activeItem = aberta; COMPS = 0; MANIFEST = r.manifest;
  let q = quickImport(new File("/pkg/figma2ae.json"));
  assert.strictEqual(COMPS, 0, "não criou comp nem precomp");
  assert.strictEqual(q.comp, "Minha comp"); assert.strictEqual(q.created, false);
  assert.deepStrictEqual(q.notes, [], q.notes.join("; "));
  const novos = aberta._ls.filter(l => l.selected);
  assert.ok(novos.length >= 4, "camadas novas ficam selecionadas");
  assert.ok(!aberta._ls[aberta._ls.length - 1].selected, "o que já estava na comp não fica selecionado");
  assert.ok(novos.some(l => l.kind === "text") && novos.some(l => l.kind === "null"), "texto e o nulo do grupo");

  // rasterizado na comp aberta: camadas de imagem separadas
  page.selection = [botao, titulo, card];
  r = await P.quickExport({ mode: "raster", options: {} });
  const c2 = makeComp("Outra", 1920, 1080); global.app.project.activeItem = c2; COMPS = 0; MANIFEST = r.manifest;
  q = quickImport(new File("/pkg/figma2ae.json"));
  assert.strictEqual(COMPS, 0); assert.strictEqual(c2.numLayers, 3);
  assert.ok(c2._ls.every(l => l.kind === "footage"));

  // sem comp aberta: cria uma do tamanho do frame e abre
  global.app.project.activeItem = null; COMPS = 0;
  q = quickImport(new File("/pkg/figma2ae.json"));
  assert.strictEqual(COMPS, 1); assert.strictEqual(q.created, true);
  assert.strictEqual(global.app.project.activeItem.width, 1920);
  console.log("TODOS OS TESTES DO QUICK IMPORT PASSARAM");
})().catch(e => { console.error(e); process.exit(1); });
