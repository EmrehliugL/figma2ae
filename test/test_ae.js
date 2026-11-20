"use strict";
const assert = require("assert");
const fs = require("fs");
global.$ = { os: "Windows 10" };
global.F2AE_TEST = {};
const src = fs.readFileSync(__dirname + "/../after-effects/Figma2AE.jsx", "utf8");
new Function("F2AE_TEST", "$", src.replace(/\}\)\(this\);\s*$/, "})({});"))(global.F2AE_TEST, global.$);
const { parsePath, decompose } = global.F2AE_TEST;
// retângulo fechado: último ponto == primeiro → 4 vértices
let r = parsePath("M 0 0 L 100 0 L 100 50 L 0 50 L 0 0 Z");
assert.strictEqual(r.length, 1); assert.strictEqual(r[0].v.length, 4); assert.ok(r[0].closed);
// elipse do Figma (4 cúbicas) → 4 vértices com tangentes
r = parsePath("M 120 60 C 120 93.1 93.1 120 60 120 C 26.9 120 0 93.1 0 60 C 0 26.9 26.9 0 60 0 C 93.1 0 120 26.9 120 60 Z");
assert.strictEqual(r[0].v.length, 4);
assert.deepStrictEqual(r[0].ot[0].map(Math.round), [0, 33]);
assert.deepStrictEqual(r[0].it[0].map(Math.round), [0, -33], "tangente de entrada do 1º vértice vem da última curva");
// dois subpaths (ex.: anel com furo) + quadrática + relativo
r = parsePath("M0 0L10 0L10 10L0 10ZM2 2L8 2L8 8L2 8Z");
assert.strictEqual(r.length, 2);
r = parsePath("M 0 0 Q 50 100 100 0 Z");
assert.strictEqual(r[0].v.length, 2);
assert.deepStrictEqual(r[0].ot[0].map(v => Math.round(v * 100) / 100), [33.33, 66.67]);
r = parsePath("m 10 10 l 20 0 l 0 20 z");
assert.deepStrictEqual(r[0].v[2], [30, 30]);
// decomposição
let d = decompose({ a: Math.cos(Math.PI / 6), b: Math.sin(Math.PI / 6), c: -Math.sin(Math.PI / 6), d: Math.cos(Math.PI / 6), tx: 5, ty: 5 });
assert.ok(Math.abs(d.rot - 30) < 1e-9 && Math.abs(d.sx - 1) < 1e-9 && Math.abs(d.sy - 1) < 1e-9);
d = decompose({ a: -1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }); // espelhado na horizontal
assert.ok(Math.abs(Math.abs(d.rot) - 180) < 1e-9 && d.sy < 0);
// todos os paths do pacote de teste são parseados sem erro
const pkg = JSON.parse(fs.readFileSync("/tmp/teste_manifest.json", "utf8"));
let n = 0;
(function walk(ls) { ls.forEach(l => { (l.fillGeometry || []).concat(l.strokeGeometry || []).forEach(g => { const p = parsePath(g.data); assert.ok(p.length > 0); n++; }); walk(l.children || []); walk(l.altStates || []); }); })(pkg.scenes[0].layers);
console.log("paths do pacote testados:", n);
console.log("TODOS OS TESTES DO PAINEL AE PASSARAM");
