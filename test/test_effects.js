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
