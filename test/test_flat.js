"use strict";
// v2.4: menos precomps. (1) frames com "Clip content" que não cortam nada viram nulo; (2) gradientes/imagens
// viram camadas direto no comp, recortadas por máscara de camada, sem comp interno/externo.
globalThis.__F2AE_TEST__ = true;
const assert = require("assert");
const fs = require("fs");
const M = require("./mockFigma");
const { makeNode, solid, image } = M;
const P = require("../figma-plugin/code.js");

/* ---------------------------------------------------------------- After falso */
function prop(name) {
  const p = { name, value: null, kids: {}, list: [], enabled: true,
    setValue(v) { p.value = v; },
    property(k) { if (typeof k === "number") return p.list[k - 1]; return p.kids[k] || (p.kids[k] = prop(k)); },
    addProperty(k) { const c = prop(k); p.list.push(c); p.kids[k] = c; p.numProperties = p.list.length; return c; } };
  return p;
}
let NID = 0, COMPS = 0;
function layerOf(comp, kind, src, w, h) {
  const L = prop("layer"); Object.assign(L, { id: ++NID, kind, source: src || { name: kind }, containingComp: comp, parent: null, matte: null, removed: false,
    setTrackMatte(m, t) { L.matte = { layer: m, type: t }; },
    remove() { L.removed = true; comp._ls.splice(comp._ls.indexOf(L), 1); },
    moveBefore(o) { comp._ls.splice(comp._ls.indexOf(L), 1); comp._ls.splice(comp._ls.indexOf(o), 0, L); },
    moveAfter(o) { comp._ls.splice(comp._ls.indexOf(L), 1); comp._ls.splice(comp._ls.indexOf(o) + 1, 0, L); } });
  const t = L.property("ADBE Transform Group");
  const sw = w || 0, shh = h || 0;
  t.property("ADBE Anchor Point").value = kind === "shape" || kind === "null" ? [0, 0] : [sw / 2, shh / 2];
  t.property("ADBE Position").value = kind === "shape" ? [0, 0] : [comp.width / 2, comp.height / 2];
  t.property("ADBE Scale").value = [100, 100];
  t.property("ADBE Rotate Z").value = 0;
  t.property("ADBE Opacity").value = 100;
  L.property("ADBE Mask Parade").numProperties = 0;
  L.name = kind; return L;
}
function makeComp(name, w, h) {
  COMPS++;
  const c = { name, width: w, height: h, duration: 5, frameRate: 24, pixelAspect: 1, _ls: [] };
  const add = (kind, src, sw, sh) => { const L = layerOf(c, kind, src, sw, sh); c._ls.unshift(L); return L; };
  c.layers = { add: src => add("footage:" + src.name, src, src.width, src.height), addShape: () => add("shape"),
    addSolid: (col, n, sw, sh) => { const L = add("solid", { name: n, width: sw, height: sh }, sw, sh); L.name = n; return L; },
    addNull: () => add("null"), addText: () => add("text"), precompose: () => { throw new Error("precompose não devia ser chamado"); } };
  Object.defineProperty(c, "numLayers", { get: () => c._ls.length });
  c.layer = i => c._ls[i - 1];
  return c;
}
global.app = { version: "26.0", project: { items: { addComp: (n, w, h) => makeComp(n, w, h) }, importFile: o => ({ name: "img", width: 2000, height: 1000 }) } };
global.ImportOptions = function (f) { this.file = f; };
global.File = function (p) { this.fsName = p; this.exists = true; this.name = p.split("/").pop(); this.length = 10; };
global.Folder = function (p) { this.fsName = p; this.exists = true; this.create = () => {}; };
global.Folder.myDocuments = { fsName: "/docs" };
global.Shape = function () {};
global.TrackMatteType = { ALPHA: "ALPHA", LUMA: "LUMA" };
global.MaskMode = { ADD: "ADD", INTERSECT: "INTERSECT" };
global.BlendingMode = {};
global.$ = { os: "Windows 10" };
global.F2AE_TEST = {};
const src = fs.readFileSync(__dirname + "/../after-effects/Figma2AE.jsx", "utf8");
new Function("F2AE_TEST", "$", src.replace(/\}\)\(this\);\s*$/, "})({});"))(global.F2AE_TEST, global.$);
const { buildLayer, canFlatten } = global.F2AE_TEST;
const F = () => ({ items: { length: 0 } });
const mkCtx = () => ({ notes: [], layers: 0, precomps: 0, fPre: F(), fOther: F(), fNulls: F(), fImages: F(), fVectors: F(), fRef: F(), opts: { library: false }, missingFonts: {}, footage: {}, dir: { fsName: "/pkg" }, pkg: {},
  importAsset(rel) { return { name: rel, width: 2000, height: 1000 }; } });

function T(l) { const t = l.property("ADBE Transform Group"); return { A: t.property("ADBE Anchor Point").value, P: t.property("ADBE Position").value, S: t.property("ADBE Scale").value, R: t.property("ADBE Rotate Z").value }; }
function world(l, x, y) { // ponto da camada → comp (com pais)
  let p = [x, y], cur = l;
  while (cur) { const t = T(cur), th = (t.R || 0) * Math.PI / 180, sx = t.S[0] / 100, sy = t.S[1] / 100, dx = (p[0] - t.A[0]) * sx, dy = (p[1] - t.A[1]) * sy;
    p = [t.P[0] + Math.cos(th) * dx - Math.sin(th) * dy, t.P[1] + Math.sin(th) * dx + Math.cos(th) * dy]; cur = null; } // no After, parentar mantém a posição no comp (o mock não recalcula)
  return p;
}
const near = (a, b, m) => assert.ok(Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05, (m || "") + " " + JSON.stringify(a) + " != " + JSON.stringify(b));

(async () => {
  /* ------------------------------------------------ 1) plugin: recorte que não corta nada vira nulo */
  const bg = makeNode("RECTANGLE", { name: "BG", x: 0, y: 0, width: 1920, height: 1080, fills: [solid(0.1, 0.1, 0.1)] });
  const inner = makeNode("FRAME", { name: "Conteúdo", x: 100, y: 100, width: 800, height: 600, clipsContent: true, fills: [] }, [
    makeNode("FRAME", { name: "Card", x: 50, y: 50, width: 400, height: 300, clipsContent: true, cornerRadius: 0, fills: [image("card")] }, [
      makeNode("TEXT", { name: "Título", characters: "Oi", x: 20, y: 20, width: 200, height: 40, fontName: { family: "Inter", style: "Bold" }, fontSize: 32, fills: [solid(1, 1, 1)] })
    ])
  ]);
  const vaza = makeNode("FRAME", { name: "Vaza", x: 1000, y: 100, width: 300, height: 300, clipsContent: true, fills: [] }, [
    makeNode("ELLIPSE", { name: "Bola grande", x: 200, y: 200, width: 300, height: 300, fills: [solid(1, 0, 0)] })]);
  const canto = makeNode("FRAME", { name: "Canto", x: 1400, y: 100, width: 300, height: 300, clipsContent: true, cornerRadius: 40, fills: [] }, [
    makeNode("RECTANGLE", { name: "Foto", x: 0, y: 0, width: 300, height: 300, fills: [image("foto")] })]);
  const meio = makeNode("FRAME", { name: "Meio", x: 1400, y: 500, width: 300, height: 300, clipsContent: true, cornerRadius: 40, fills: [] }, [
    makeNode("RECTANGLE", { name: "Selo", x: 100, y: 100, width: 100, height: 100, fills: [solid(0, 1, 0)] })]);
  const fade = makeNode("GROUP", { name: "Fade", x: 100, y: 800, width: 200, height: 100, opacity: 0.5 }, [
    makeNode("RECTANGLE", { name: "Faixa", x: 0, y: 0, width: 200, height: 100, fills: [solid(1, 1, 1)] })]);
  const lay = makeNode("GROUP", { name: "Layout", x: 0, y: 0, width: 1920, height: 1080 }, [inner, vaza, canto, meio, fade]);
  const f = makeNode("FRAME", { name: "1.1", width: 1920, height: 1080, clipsContent: true, fills: [solid(0, 0, 0)] }, [bg, lay]);
  const page = makeNode("PAGE", { name: "P" }, [f]);
  M.install(page); page.selection = [f];
  P.describeTargets(P.resolveTargets(page.selection));
  const out = await P.exportFrames({ options: {} });
  const L = JSON.parse(out.manifest).comps[0].layers;
  const names = []; (function w(ls) { ls.forEach(l => { names.push(l.name + ":" + l.kind); w(l.children || []); }); })(L); if (process.env.DBG) console.log(names);
  const by = n => { let r = null; (function w(ls) { ls.forEach(l => { if (l.name === n) r = r || l; w(l.children || []); }); })(L); return r; };
  assert.strictEqual(by("Conteúdo").kind, "group", "frame com clip que não corta nada vira nulo");
  assert.strictEqual(by("Card").kind, "group", "frame aninhado com clip sem vazamento também");
  assert.strictEqual(by("Vaza").kind, "precomp", "conteúdo saindo do frame continua recortado");
  assert.strictEqual(by("Canto").kind, "precomp", "foto encostando no canto arredondado continua recortada");
  assert.strictEqual(by("Meio").kind, "group", "elemento longe dos cantos arredondados: sem precomp");
  assert.strictEqual(by("Fade").kind, "group", "grupo só com opacidade e um filho: sem precomp");
  assert.strictEqual(by("Faixa").opacity, 0.5, "opacidade do grupo desceu pro filho");
  const cardBg = by("Card · fundo");
  assert.strictEqual(cardBg.kind, "paintstack");

  /* ------------------------------------------------ 2) After: pilha de preenchimentos sem precomp */
  COMPS = 0;
  const comp = makeComp("Cena", 1920, 1080); COMPS = 0;
  const ctx = mkCtx();
  const rot = 30 * Math.PI / 180;
  const xf = { a: Math.cos(rot), b: Math.sin(rot), c: -Math.sin(rot), d: Math.cos(rot), tx: 500, ty: 300 };
  // imagem FILL num retângulo arredondado e girado (era comp interno + externo + matte)
  const photo = { kind: "paintstack", name: "Foto", xf, w: 400, h: 200, prim: "rect", radius: 20, opacity: 1, effects: [], notes: [],
    paints: [{ type: "image", file: "assets/IMAGES/foto.jpg", mode: "FILL", alpha: 1, blend: "NORMAL", rotation: 0 }] };
  assert.ok(canFlatten(photo));
  const pl = buildLayer(comp, photo, ctx);
  assert.deepStrictEqual(ctx.notes, []);
  assert.strictEqual(COMPS, 0, "nenhum comp criado");
  assert.strictEqual(comp.numLayers, 1, "uma camada só");
  assert.strictEqual(pl.name, "Foto");
  const masks = pl.property("ADBE Mask Parade");
  assert.strictEqual(masks.list.length, 1, "recorte por máscara de camada");
  // os cantos da máscara (em coordenadas da camada) caem nos cantos do elemento no comp
  const sh = masks.list[0].property("ADBE Mask Shape").value;
  const elem = (x, y) => [xf.a * x + xf.c * y + xf.tx, xf.b * x + xf.d * y + xf.ty];
  near(world(pl, sh.vertices[0][0], sh.vertices[0][1]), elem(20, 0), "início do canto arredondado");
  near(world(pl, sh.vertices[3][0], sh.vertices[3][1]), elem(400, 180), "lado direito");
  // a imagem cobre o elemento (FILL): centro da imagem = centro do elemento
  near(world(pl, 1000, 500), elem(200, 100), "centro da imagem");

  // gradiente linear de 3 paradas + contorno: várias camadas, sem precomp, parentadas na de cima
  const c2 = makeComp("Cena 2", 1920, 1080); COMPS = 0;
  const grad = { kind: "paintstack", name: "Botão", xf: { a: 1, b: 0, c: 0, d: 1, tx: 100, ty: 100 }, w: 300, h: 80, prim: "rect", radius: 40, opacity: 1, effects: [], notes: [], pad: 4,
    strokes: [{ color: [1, 1, 1], alpha: 1, width: 2, align: "CENTER", cap: "butt", join: "miter", miter: 4 }],
    paints: [{ type: "linear", alpha: 1, blend: "NORMAL", handles: { start: [0, 40], end: [300, 40] }, stops: [{ pos: 0, color: [1, 0, 0], alpha: 1 }, { pos: 0.5, color: [0, 1, 0], alpha: 1 }, { pos: 1, color: [0, 0, 1], alpha: 1 }] }] };
  const gl = buildLayer(c2, grad, mkCtx());
  assert.strictEqual(COMPS, 0, "gradiente sem precomp");
  assert.strictEqual(c2.numLayers, 3, "2 trechos de gradiente + contorno");
  assert.strictEqual(gl.name, "Botão"); assert.strictEqual(gl.kind, "shape", "contorno por cima é a camada principal");
  c2._ls.filter(l => l !== gl).forEach(l => assert.strictEqual(l.parent, gl, "trechos parentados no principal"));
  const piece2 = c2._ls[1];
  assert.strictEqual(piece2.property("ADBE Mask Parade").list.length, 2, "trecho: máscara da parada + forma");
  near(world(piece2, 0, 0), [100, 100], "sólido do trecho no lugar do elemento");

  // gradiente com transparência (fade): camada + luma matte, ainda sem precomp
  const c3 = makeComp("Cena 3", 1920, 1080); COMPS = 0;
  const fadeG = { kind: "paintstack", name: "Sombra", xf: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 600 }, w: 1920, h: 480, prim: "rect", radius: 0, opacity: 0.8, effects: [], notes: [],
    paints: [{ type: "linear", alpha: 1, blend: "NORMAL", handles: { start: [960, 0], end: [960, 480] }, stops: [{ pos: 0, color: [0, 0, 0], alpha: 0 }, { pos: 1, color: [0, 0, 0], alpha: 1 }] }] };
  const fl = buildLayer(c3, fadeG, mkCtx());
  assert.strictEqual(COMPS, 0);
  assert.strictEqual(fl.name, "Sombra"); assert.strictEqual(fl.matte.type, "LUMA");
  assert.strictEqual(fl.property("ADBE Transform Group").property("ADBE Opacity").value, 80, "opacidade do elemento na camada");
  assert.strictEqual(c3._ls[0].enabled, false, "transparência é matte escondido");

  // gradiente radial numa elipse: anéis com máscara + forma da elipse
  const c5 = makeComp("Cena 5", 1920, 1080); COMPS = 0;
  const rad = { kind: "paintstack", name: "Brilho", xf: { a: 1, b: 0, c: 0, d: 1, tx: 800, ty: 400 }, w: 200, h: 200, prim: "ellipse", opacity: 1, effects: [{ type: "blur", radius: 10 }], notes: [],
    paints: [{ type: "radial", alpha: 1, blend: "NORMAL", handles: { center: [100, 100], rx: [200, 100], ry: [100, 200] }, stops: [{ pos: 0, color: [1, 1, 0], alpha: 1 }, { pos: 1, color: [1, 0.5, 0], alpha: 1 }],
      rings: [{ r0: 0, r1: 1, c0: [1, 1, 0], c1: [1, 0.5, 0], a0: 1, a1: 1 }] }] };
  const rl = buildLayer(c5, rad, mkCtx());
  assert.strictEqual(COMPS, 0); assert.strictEqual(c5.numLayers, 1);
  assert.ok(rl.property("ADBE Effect Parade").kids["ADBE Box Blur2"], "desfoque direto na camada");
  const rsh = rl.property("ADBE Mask Parade").list[0].property("ADBE Mask Shape").value;
  near(world(rl, rsh.vertices[0][0], rsh.vertices[0][1]), [1000, 500], "borda direita da elipse");
  near(world(rl, rsh.vertices[1][0], rsh.vertices[1][1]), [900, 600], "borda de baixo da elipse");

  // casos que precisam do jeito antigo continuam funcionando (blend entre preenchimentos)
  const c4 = makeComp("Cena 4", 1920, 1080); COMPS = 0;
  const blend = Object.assign({}, photo, { name: "Mistura", paints: [{ type: "solid", color: [1, 0, 0], alpha: 1, blend: "NORMAL" }, { type: "image", file: "x.png", mode: "FILL", alpha: 1, blend: "MULTIPLY" }] });
  assert.ok(!canFlatten(blend));
  global.app.project.items.addComp = (n, w, h) => makeComp(n, w, h);
  c4.layers.precompose = () => ({});
  buildLayer(c4, blend, mkCtx());
  assert.ok(COMPS >= 1, "blend entre preenchimentos ainda usa comp");
  console.log("TODOS OS TESTES DE MENOS PRECOMPS PASSARAM");
})().catch(e => { console.error(e); process.exit(1); });
