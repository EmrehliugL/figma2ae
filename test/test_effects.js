"use strict";
// efeitos simples e máscaras viram recursos nativos do After (não PNG)
globalThis.__F2AE_TEST__ = true;
const assert = require("assert");
const M = require("./mockFigma");
const { makeNode, solid } = M;
const P = require("../figma-plugin/code.js");
const sh = (type, extra) => Object.assign({ type, visible: true, color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 4 }, radius: 8, spread: 0 }, extra || {});
const LIN = { type: "GRADIENT_LINEAR", visible: true, gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [{ position: 0, color: { r: 1, g: 1, b: 1, a: 1 } }, { position: 1, color: { r: 1, g: 1, b: 1, a: 0 } }] };

(async () => {
  const glass = makeNode("RECTANGLE", { name: "Vidro", x: 100, y: 100, width: 400, height: 200, cornerRadius: 24, fills: [solid(1, 1, 1, 0.2)], effects: [{ type: "BACKGROUND_BLUR", visible: true, radius: 30 }, sh("INNER_SHADOW")] });
  const txt = makeNode("TEXT", { name: "No", characters: "No", x: 50, y: 50, width: 100, height: 40, fontName: { family: "Inter", style: "Bold" }, fontSize: 32, fills: [solid(1, 1, 1)], effects: [{ type: "LAYER_BLUR", visible: true, radius: 6 }] });
  const fadeGroup = makeNode("GROUP", { name: "Environment fade", x: 600, y: 300, width: 500, height: 300 }, [
    makeNode("RECTANGLE", { name: "Fade", x: 0, y: 0, width: 500, height: 300, isMask: true, fills: [LIN] }),
    makeNode("TEXT", { name: "82 percent", characters: "82%", x: 10, y: 10, width: 200, height: 80, fontName: { family: "Inter", style: "Bold" }, fontSize: 64, fills: [solid(1, 1, 1)] }),
    makeNode("ELLIPSE", { name: "Bola", x: 300, y: 100, width: 100, height: 100, fills: [solid(1, 0, 0)] })
  ]);
  const topMask = makeNode("ELLIPSE", { name: "Janela", x: 0, y: 0, width: 300, height: 300, isMask: true, maskType: "VECTOR", fills: [solid(0, 0, 0, 0.3)] });
  const under = makeNode("RECTANGLE", { name: "Fundo", width: 1920, height: 1080, fills: [solid(0.1, 0.1, 0.1)] });
  const masked = makeNode("RECTANGLE", { name: "Recortado", x: 0, y: 0, width: 600, height: 600, fills: [solid(0, 0, 1)] });
  const f = makeNode("FRAME", { name: "1.1", width: 1920, height: 1080, clipsContent: true, fills: [solid(0, 0, 0)] }, [under, topMask, masked, glass, txt, fadeGroup]);
  const page = makeNode("PAGE", { name: "P" }, [f]);
  M.install(page); page.selection = [f];
  P.describeTargets(P.resolveTargets(page.selection));
  const out = await P.exportFrames({ options: {} });
  const pkg = JSON.parse(out.manifest);
  const L = pkg.comps[0].layers;
  const all = []; (function walk(ls) { ls.forEach(l => { all.push(l); walk(l.children || []); if (l.matte) walk([l.matte.spec]); }); })(L);
  assert.ok(!all.some(l => l.kind === "raster"), "nada virou PNG: " + all.filter(l => l.kind === "raster").map(l => l.name + " (" + l.reason + ")").join(", "));

  // máscara no nível do frame: o que vem acima da máscara vai pra dentro do precomp mascarado
  assert.deepStrictEqual(L.map(l => l.name), ["Fundo", "Janela · mascarado"]);
  const run = L[1];
  assert.strictEqual(run.kind, "precomp"); assert.strictEqual(run.matte.type, "ALPHA");
  assert.strictEqual(run.matte.spec.name, "Janela"); assert.strictEqual(run.matte.spec.kind, "shape");
  assert.strictEqual(run.matte.spec.fills[0].alpha, 1, "máscara VECTOR usa só o contorno (opacidade cheia)");
  assert.deepStrictEqual(run.children.map(c => c.name), ["Recortado", "Vidro", "No", "Environment fade"]);

  // desfoque de fundo + sombra interna nativos
  const g = run.children[1];
  assert.strictEqual(g.kind, "shape");
  assert.deepStrictEqual(g.effects.map(e => e.type), ["bgblur", "inner"]);
  assert.deepStrictEqual(g.bgShape, { prim: "rect", w: 400, h: 200, radius: 24 });
  // desfoque de camada no texto continua nativo
  assert.deepStrictEqual(run.children[2].effects.map(e => e.type), ["blur"]);

  // grupo com máscara de gradiente: antes virava PNG; agora precomp com a máscara (gradiente nativo) como matte
  const fg = run.children[3];
  assert.strictEqual(fg.kind, "precomp");
  assert.strictEqual(fg.children.length, 1);
  const inner = fg.children[0];
  assert.strictEqual(inner.name, "Fade · mascarado");
  assert.strictEqual(inner.w, 500); assert.strictEqual(inner.h, 300);
  assert.notStrictEqual(inner.matte.spec.kind, "raster");
  assert.deepStrictEqual(inner.children.map(c => c.name), ["82 percent", "Bola"]);
  console.log("TODOS OS TESTES DE EFEITOS E MÁSCARAS PASSARAM");
})().catch(e => { console.error(e); process.exit(1); });

// ---- texto com fileiras de estilos diferentes → uma camada por fileira
(async () => {
  const fade = [solid(1, 1, 1, 0.35)], full = [solid(1, 1, 1, 1)];
  const T = (name, chars, segs, extra) => makeNode("TEXT", Object.assign({ name, characters: chars, x: 40, y: 20, width: 520, height: 3 * 120, fontName: { family: "Inter", style: "Regular" }, fontSize: 100, fills: fade, textAutoResize: "HEIGHT", _segs: segs }, extra || {}));
  const a = T("Manchete", "No\nviolations\nfound?", [{ start: 0, end: 3, fills: fade }, { start: 3, end: 14, fills: full }, { start: 14, end: 20, fills: fade }]);
  // mesma coisa sem "\n": quebra automática da caixa
  const b = T("Manchete wrap", "No violations found?", [{ start: 0, end: 3, fills: fade }, { start: 3, end: 13, fills: full }, { start: 13, end: 20, fills: fade }], { y: 500, _wrapWords: true });
  // estilo muda no meio da linha → continua uma camada só
  const c = T("Inline", "No violations found?", [{ start: 0, end: 3, fills: fade }, { start: 3, end: 13, fills: full }, { start: 13, end: 20, fills: fade }], { y: 900 });
  // texto longo (chat) → uma camada só
  const longTxt = "Olá! ".repeat(40) + "\nfim";
  const d = T("Chat", longTxt, [{ start: 0, end: 200, fills: fade }, { start: 200, end: longTxt.length, fills: full }], { y: 950 });
  // mesmo estilo em tudo (o beat seguinte do mesmo título) → também uma camada por linha
  const e = T("Mesmo estilo", "No violations found?", null, { y: 300, _wrapWords: true, fills: full });
  const f = makeNode("FRAME", { name: "2.1", width: 1920, height: 1080, clipsContent: true, fills: [solid(0, 0, 0)] }, [a, b, c, d, e]);
  const page = makeNode("PAGE", { name: "P2" }, [f]);
  M.install(page); page.selection = [f];
  P.describeTargets(P.resolveTargets(page.selection));
  const pkg = JSON.parse((await P.exportFrames({ options: {} })).manifest);
  const [la, lb, lc, ld, le] = pkg.comps[0].layers;
  assert.strictEqual(le.kind, "group"); assert.deepStrictEqual(le.children.map(k => k.name), ["No", "violations", "found?"]);
  assert.deepStrictEqual(le.children.map(k => k.colorAlpha), [1, 1, 1]);
  for (const g of [la, lb]) {
    assert.strictEqual(g.kind, "group", g.name + " vira grupo de fileiras");
    assert.deepStrictEqual(g.children.map(k => k.text), ["No", "violations", "found?"]);
    assert.deepStrictEqual(g.children.map(k => k.name), ["No", "violations", "found?"]);
    assert.deepStrictEqual(g.children.map(k => k.colorAlpha), [0.35, 1, 0.35], "opacidade de cada fileira igual ao Figma");
    assert.deepStrictEqual(g.children.map(k => Math.round(k.xf.ty - g.children[0].xf.ty)), [0, 120, 240], "cada fileira na altura certa");
    assert.ok(g.children.every(k => k.xf.tx === 40));
  }
  assert.strictEqual(la.children[0].xf.ty, 20);
  assert.strictEqual(lc.kind, "text"); assert.strictEqual(ld.kind, "text");
  assert.strictEqual(page.children.length, 1, "clones de medição removidos");
  console.log("TODOS OS TESTES DE TEXTO EM FILEIRAS PASSARAM");
})().catch(e => { console.error(e); process.exit(1); });
