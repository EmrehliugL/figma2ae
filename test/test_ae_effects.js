"use strict";
// monta máscara, desfoque de fundo e sombra interna num After falso e confere a pilha de camadas
const assert = require("assert");
const fs = require("fs");
function prop(name) {
  const p = { name, value: null, kids: {}, list: [], enabled: true,
    setValue(v) { p.value = v; },
    property(k) { if (typeof k === "number") return p.list[k - 1]; return p.kids[k] || (p.kids[k] = prop(k)); },
    addProperty(k) { const c = prop(k); p.list.push(c); p.kids[k] = c; return c; } };
  return p;
}
let NID = 0;
function layerOf(comp, kind, src) {
  const L = prop("layer"); Object.assign(L, { id: ++NID, kind, source: src || { name: kind }, containingComp: comp, selected: false, parent: null, matte: null,
    setTrackMatte(m, t) { L.matte = { layer: m, type: t }; },
    moveBefore(o) { comp._ls.splice(comp._ls.indexOf(L), 1); comp._ls.splice(comp._ls.indexOf(o), 0, L); },
    moveAfter(o) { comp._ls.splice(comp._ls.indexOf(L), 1); comp._ls.splice(comp._ls.indexOf(o) + 1, 0, L); } });
  L.name = kind; return L;
}
function makeComp(name, w, h) {
  const c = { name, width: w, height: h, duration: 5, frameRate: 24, pixelAspect: 1, _ls: [], opened: 0,
    openInViewer() { c.opened++; global.app.project.activeItem = c; } };
  const add = (kind, src) => { const L = layerOf(c, kind, src); c._ls.unshift(L); return L; };
  c.layers = { add: src => add("comp:" + src.name, src), addShape: () => add("shape"), addSolid: (col, n) => { const L = add("solid"); L.name = n; return L; }, addNull: () => add("null"),
    addText: () => add("text") };
  Object.defineProperty(c, "numLayers", { get: () => c._ls.length });
  c.layer = i => c._ls[i - 1];
  return c;
}
const executed = [];
global.app = { project: { items: { addComp: (n, w, h) => makeComp(n, w, h) }, activeItem: null },
  findMenuCommandId: n => (n === "Inner Shadow" ? 9001 : 0),
  executeCommand: id => { executed.push(id); const comp = global.app.project.activeItem; comp._ls.filter(l => l.selected).forEach(l => l.property("ADBE Layer Styles").property("innerShadow/enabled")); } };
global.TrackMatteType = { ALPHA: "ALPHA", LUMA: "LUMA" };
global.BlendingMode = {};
global.$ = { os: "Windows 10" };
global.F2AE_TEST = {};
const src = fs.readFileSync(__dirname + "/../after-effects/Figma2AE.jsx", "utf8");
new Function("F2AE_TEST", "$", src.replace(/\}\)\(this\);\s*$/, "})({});"))(global.F2AE_TEST, global.$);
const { buildLayer, flushStyles } = global.F2AE_TEST;
const F = () => ({ items: { length: 0 } });
const ctx = { notes: [], layers: 0, precomps: 0, fPre: F(), fOther: F(), fNulls: F(), opts: {}, missingFonts: {}, footage: {} };
const id = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const rect = (name, extra) => Object.assign({ kind: "shape", name, xf: Object.assign({}, id), w: 100, h: 50, prim: "rect", radius: 0, fills: [{ color: [1, 1, 1], alpha: 1 }], opacity: 1, effects: [], notes: [] }, extra || {});

const comp = makeComp("Cena", 1920, 1080);
buildLayer(comp, rect("Fundo", { w: 1920, h: 1080 }), ctx);
const run = { kind: "precomp", name: "Fade · mascarado", xf: id, w: 500, h: 300, pad: 0, opacity: 1, effects: [], notes: [], children: [rect("82 percent")],
  matte: { spec: rect("Fade", { w: 500, h: 300 }), type: "LUMA" } };
const runL = buildLayer(comp, run, ctx);
const glass = rect("Vidro", { xf: { a: 1, b: 0, c: 0, d: 1, tx: 300, ty: 200 }, effects: [{ type: "bgblur", radius: 30 }, { type: "inner", color: [0, 0, 0], alpha: 0.25, dx: 0, dy: 4, radius: 8, spread: 0 }], bgShape: { prim: "rect", w: 100, h: 50, radius: 12 } });
const glassL = buildLayer(comp, glass, ctx);
assert.deepStrictEqual(ctx.notes, [], "sem erros: " + ctx.notes.join("; "));
const names = comp._ls.map(l => l.name);
assert.deepStrictEqual(names, ["Vidro", "Vidro · forma do desfoque", "Vidro · desfoque de fundo", "Fade · máscara", "Fade · mascarado", "Fundo"]);
assert.strictEqual(runL.matte.type, "LUMA"); assert.strictEqual(runL.matte.layer.name, "Fade · máscara"); assert.strictEqual(runL.matte.layer.enabled, false);
const adj = comp._ls[2];
assert.strictEqual(adj.adjustmentLayer, true); assert.strictEqual(adj.matte.layer, comp._ls[1]); assert.strictEqual(comp._ls[1].parent, glassL);
assert.strictEqual(adj.property("ADBE Effect Parade").property("ADBE Gaussian Blur 2").property("ADBE Gaussian Blur 2-0001").value, 30);
// sombra interna aplicada no fim, pelo Estilo de Camada
flushStyles(ctx);
assert.deepStrictEqual(executed, [9001]);
const g = glassL.property("ADBE Layer Styles").property("innerShadow/enabled");
assert.strictEqual(g.property("innerShadow/opacity").value, 25);
assert.strictEqual(Math.round(g.property("innerShadow/localLightingAngle").value), 90, "sombra pra baixo = luz de cima (90°)");
assert.strictEqual(g.property("innerShadow/distance").value, 4);
assert.deepStrictEqual(ctx.notes, []);
console.log("TODOS OS TESTES DE EFEITOS NO AE PASSARAM");
