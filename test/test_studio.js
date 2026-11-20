// Motor de tomadas do Figma2AE Studio com um storyboard parecido com o do print:
// 4 frames da pessoa falando (troca a foto do 1º pro 2º e os textos) + 1 frame do "$10,000" (fundo e composição novos).
"use strict";
globalThis.__F2AE_TEST__ = true;
const assert = require("assert");
const M = require("./mockFigma");
const { makeNode, solid, image } = M;
const P = require("../figma-plugin/code.js");
const E = require("../studio/app/engine.js");

const T = (txt, x, y, w, h, size, op) => makeNode("TEXT", { name: txt, characters: txt, x, y, width: w, height: h, opacity: op === undefined ? 1 : op, fontName: { family: "Inter", style: "Regular" }, fontSize: size, fills: [solid(1, 1, 0.8)] });
const bg = (hash, name) => makeNode("RECTANGLE", { name, width: 1920, height: 1080, fills: [image(hash)] });
const fr = (name, y, kids) => makeNode("FRAME", { name, y, width: 1920, height: 1080, clipsContent: true, fills: [solid(0, 0, 0)] }, kids);
const f1 = fr("Scene 14 - Beat 1 (1.5s)", 0, [bg("pose1", "image 36"), T("14-day challenge", 150, 300, 500, 160, 64)]);
const f2 = fr("Scene 14 - Beat 2", 1200, [bg("pose2", "image 37"), T("No", 150, 380, 200, 110, 96), T("violations", 150, 500, 520, 110, 96, 0.3), T("found?", 150, 620, 380, 110, 96, 0.3)]);
const f3 = fr("Scene 14 - Beat 3", 2400, [bg("pose2", "image 37"), T("No", 150, 380, 200, 110, 96, 0.3), T("violations", 150, 500, 520, 110, 96), T("found?", 150, 620, 380, 110, 96, 0.3)]);
const f4 = fr("Scene 14 - Beat 4", 3600, [bg("pose2", "image 37"), T("No", 150, 380, 200, 110, 96, 0.3), T("violations", 150, 500, 520, 110, 96, 0.3), T("found?", 150, 620, 380, 110, 96)]);
const f5 = fr("Scene 14 - Beat 5", 4800, [bg("desk", "image 39"), T("$10,000", 60, 250, 1800, 520, 420)]);
const box = makeNode("FRAME", { name: "Scene 14", width: 1920, height: 6000, fills: [] }, [f1, f2, f3, f4, f5]);
const page = { type: "PAGE", name: "P", id: "0:1", children: [box], selection: [box] }; box.parent = page;
M.install(page); page.id = "0:1";

(async () => {
  const pkg = JSON.parse((await P.exportFrames({ options: { reference: true } })).manifest);
  assert.strictEqual(pkg.comps.length, 5);
  require("fs").writeFileSync("/tmp/studio_pkg.json", JSON.stringify(pkg));
  const frames = E.suggest(pkg, { defaultDur: 2 });
  console.log(frames.map(f => `${f.name.padEnd(26)} nota ${String(f.score).padEnd(5)} ${f.cut ? "CORTA " : "junta "} ${f.why}`).join("\n"));
  assert.deepStrictEqual(frames.map(f => f.cut), [true, false, false, false, true], "4 frames da fala numa tomada só, o $10,000 numa nova");
  assert.strictEqual(frames[0].dur, 1.5, "duração lida do nome do frame");
  assert.strictEqual(frames[1].dur, 2);
  assert.ok(/texto/.test(frames[2].why));
  const plan = E.buildPlan(pkg, frames, {});
  assert.strictEqual(plan.shots.length, 2);
  const s1 = plan.shots[0];
  assert.strictEqual(s1.duration, 7.5);
  const byName = n => s1.items.filter(i => i.spec.name === n).sort((a, b) => a.t0 - b.t0);
  // a foto: pose1 de 0 a 1.5, pose2 de 1.5 até o fim (uma camada só pros frames 2-4)
  const photos = s1.items.filter(i => /^image/.test(i.spec.name)).sort((a, b) => a.t0 - b.t0);
  assert.deepStrictEqual(photos.map(p => [p.t0, p.t1]), [[0, 1.5], [1.5, 7.5]]);
  assert.deepStrictEqual(byName("14-day challenge").map(i => [i.t0, i.t1]), [[0, 1.5]]);
  // cada palavra muda de opacidade a cada frame: estados separados no tempo
  assert.deepStrictEqual(byName("violations").map(i => [i.t0, i.t1, i.spec.opacity]), [[1.5, 3.5, 0.3], [3.5, 5.5, 1], [5.5, 7.5, 0.3]]);
  assert.ok(s1.items.indexOf(photos[1]) < s1.items.indexOf(byName("No")[0]), "foto fica embaixo do texto");
  assert.deepStrictEqual(s1.markers.map(m => m.t), [0, 1.5, 3.5, 5.5]);
  assert.strictEqual(s1.bgs.length, 1, "fundo do frame igual vira um sólido só");
  assert.strictEqual(s1.refs.length, 4);
  assert.strictEqual(plan.shots[1].items.length, 2);
  console.log("TODOS OS TESTES DO STUDIO (MOTOR DE TOMADAS) PASSARAM");
})().catch(e => { console.error(e); process.exit(1); });
