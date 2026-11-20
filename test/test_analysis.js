"use strict";
globalThis.__F2AE_TEST__ = true;
const assert = require("assert");
const M = require("./mockFigma");
const { makeNode, deepClone, solid, image } = M;
const P = require("../figma-plugin/code.js");

function frame(name, x, y, kids) { return makeNode("FRAME", { name, x, y, width: 1920, height: 1080, fills: [solid(0.06, 0.05, 0.05)], clipsContent: true }, kids); }
function texto(name, chars, x, y) { return makeNode("TEXT", { name, characters: chars, x, y, width: 600, height: 80, fontName: { family: "Inter", style: "Bold" }, fontSize: 64, fills: [solid(1, 1, 1)], textAlignHorizontal: "LEFT", textAutoResize: "WIDTH_AND_HEIGHT" }); }

// ---------- Cenário 1: SCENE 15 dentro de uma Section, frames duplicados (IDs novos) ----------
const bg = makeNode("RECTANGLE", { name: "Background", width: 1920, height: 1080, fills: [image("hashBG")] });
const presenter = makeNode("RECTANGLE", { name: "Presenter", x: 1100, y: 200, width: 600, height: 880, fills: [image("hashPRES")] });
const title = texto("Title", "Como funciona o solo", 120, 160);
const f1 = frame("Frame 01", 0, 0, [bg, presenter, title]);
const f2 = deepClone(f1); f2.name = "Frame 02"; f2.y = 1300;
f2.children.push(Object.assign(makeNode("ELLIPSE", { name: "Circle 01", x: 300, y: 600, width: 120, height: 120, fills: [solid(0.9, 0.7, 0.3)] }), { parent: f2 }));
const f3 = deepClone(f2); f3.name = "Frame 03"; f3.y = 2600;
f3.children.push(Object.assign(makeNode("ELLIPSE", { name: "Circle 01", x: 520, y: 600, width: 120, height: 120, fills: [solid(0.9, 0.7, 0.3)] }), { parent: f3 })); // segunda bolinha idêntica (mesmo nome!)
f3.children.filter(c => c.name === "Title")[0].x = 180; // título mudou de posição
const sec = makeNode("SECTION", { name: "SCENE 15", x: 0, y: 0, width: 2200, height: 4000 }, [f1, f2, f3]);

// ---------- Cenário 2: coluna solta sem section, com remoção, reaparecimento e troca ----------
const g1 = frame("Shot A", 4000, 0, [
  makeNode("RECTANGLE", { name: "Fundo", width: 1920, height: 1080, fills: [solid(0.2, 0.3, 0.4)] }),
  texto("Legenda", "Primeira frase", 200, 900),
  makeNode("STAR", { name: "Estrela", x: 800, y: 400, width: 200, height: 200, fills: [solid(1, 0.8, 0)] })
]);
const g2 = deepClone(g1); g2.name = "Shot B"; g2.y = 1300;
g2.children = g2.children.filter(c => c.name !== "Estrela");                 // estrela removida
g2.children.filter(c => c.name === "Legenda")[0].characters = "Segunda frase"; // texto mudou
g2.children.push(Object.assign(makeNode("POLYGON", { name: "Triangulo", x: 810, y: 410, width: 190, height: 190, fills: [solid(1, 0.8, 0)] }), { parent: g2 })); // troca no mesmo lugar
const g3 = deepClone(g1); g3.name = "Shot C"; g3.y = 2600;                  // estrela volta (reaparece)
g3.children.forEach(c => c.parent = g3);

const page = { type: "PAGE", name: "Storyboard", children: [sec, g1, g2, g3], selection: [] };
[sec, g1, g2, g3].forEach(n => n.parent = page);
M.install(page);

(async () => {
  const res = await P.analyze({ scope: "page" });
  assert.strictEqual(res.length, 2, "duas cenas");
  const s15 = res[0];
  assert.strictEqual(s15.compName, "SCENE_15");
  assert.strictEqual(s15.frames.length, 3);
  const st = (f, name, idx) => s15.frameEls[f].elements.filter(e => e.name === name)[idx || 0];
  console.log("SCENE_15");
  s15.frameEls.forEach((fe, f) => console.log("  F" + (f + 1) + ":", fe.elements.map(e => `${e.name}[${e.status}${e.diffs.length ? " " + e.diffs.join("; ") : ""} · ${e.confidence}]`).join("  "), fe.removed.length ? " REMOVED: " + fe.removed.map(r => r.name).join(",") : ""));
  assert.strictEqual(st(1, "Background").status, "EXISTING");
  assert.strictEqual(st(1, "Presenter").status, "EXISTING");
  assert.strictEqual(st(1, "Circle 01").status, "NEW");
  assert.strictEqual(st(2, "Title").status, "MODIFIED");
  assert.ok(st(2, "Title").diffs[0].startsWith("posição"));
  // as duas bolinhas iguais no F03: a da posição antiga continua, a nova é NEW
  const c1 = st(2, "Circle 01", 0), c2 = st(2, "Circle 01", 1);
  assert.strictEqual(c1.status, "EXISTING");
  assert.strictEqual(c2.status, "NEW");
  assert.strictEqual(c1.identityId, st(1, "Circle 01").identityId);
  assert.strictEqual(s15.identities.length, 5, "5 identidades: BG, Presenter, Title, Circle01, Circle02");
  assert.strictEqual(s15.stack[s15.stack.length - 1], c2.identityId, "bolinha nova fica no topo");

  const sc2 = res[1];
  console.log(sc2.compName);
  sc2.frameEls.forEach((fe, f) => console.log("  F" + (f + 1) + ":", fe.elements.map(e => `${e.name}[${e.status}${e.diffs.length ? " " + e.diffs.join("; ") : ""}${e.replaces ? " substitui " + e.replaces : ""}]`).join("  "), fe.removed.length ? " REMOVED: " + fe.removed.map(r => r.name + (r.replacedBy ? "→" + r.replacedBy : "")).join(",") : ""));
  const e2 = n => sc2.frameEls[1].elements.filter(e => e.name === n)[0];
  assert.strictEqual(e2("Legenda").status, "MODIFIED");
  assert.ok(e2("Legenda").diffs.includes("texto"));
  assert.strictEqual(sc2.frameEls[1].removed[0].name, "Estrela");
  assert.strictEqual(e2("Triangulo").replaces, "Estrela");
  const e3 = n => sc2.frameEls[2].elements.filter(e => e.name === n)[0];
  assert.strictEqual(e3("Estrela").status, "MODIFIED", "estrela reaparece ligada à mesma identidade");
  assert.strictEqual(e3("Estrela").identityId, sc2.frameEls[0].elements.filter(e => e.name === "Estrela")[0].identityId);

  // ---------- marcação de identidade: depois de travar, renomear e mover não quebra ----------
  await P.handle({ type: "lock", sceneId: s15.id });
  const t2 = f2.children.filter(c => c.name === "Title")[0];
  t2.name = "Titulo renomeado"; t2.x = 900; t2.characters = "Outro texto";
  const res2 = await P.analyze({ scope: "page" });
  const tt = res2[0].frameEls[1].elements.filter(e => e.name === "Titulo renomeado")[0];
  assert.strictEqual(tt.confidence, "certa");
  assert.strictEqual(tt.status, "MODIFIED");
  // duplicar um frame marcado leva a marca junto
  const f4 = deepClone(f3); f4.name = "Frame 04"; f4.y = 3900; sec.children.push(f4); f4.parent = sec;
  const res3 = await P.analyze({ scope: "page" });
  assert.ok(res3[0].frameEls[3].elements.every(e => e.status === "EXISTING" && e.confidence === "certa"), "frame duplicado depois da marcação: tudo EXISTING com certeza");
  console.log("Marcação: OK (renomear/mover/duplicar mantém identidade)");

  // ---------- separar manualmente ----------
  await P.handle({ type: "split", nodeId: f2.children.filter(c => c.name === "Presenter")[0].id });
  const res4 = await P.analyze({ scope: "page" });
  assert.strictEqual(res4[0].frameEls[1].elements.filter(e => e.name === "Presenter")[0].status, "NEW");
  console.log("Separar: OK");
  console.log("\nTODOS OS TESTES DE ANÁLISE PASSARAM");
})().catch(e => { console.error("FALHOU:", e); process.exit(1); });

// ---------- Cenário 3: frame da cena com os frames do storyboard dentro (como no arquivo real) ----------
(async () => {
  await new Promise(r => setTimeout(r, 200));
  const sub1 = makeNode("FRAME", { name: "7.1", x: 0, y: 100, width: 1920, height: 1080, fills: [solid(1,1,1)] }, [makeNode("TEXT", { name: "Legenda", characters: "Oi", x: 10, y: 10, width: 100, height: 40, fontName: { family: "Inter", style: "Bold" }, fontSize: 32, fills: [solid(0,0,0)] })]);
  const sub2 = deepClone(sub1); sub2.name = "7.2 - 0:00 MATCH - Scene 6's last frame"; sub2.y = 1300;
  const label = makeNode("RECTANGLE", { name: "label", x: 0, y: 0, width: 1920, height: 60, fills: [solid(1, 0.8, 0)] });
  const cont = makeNode("FRAME", { name: "Scene 7", x: 9000, y: 0, width: 1920, height: 2500 }, [label, sub1, sub2]);
  // beats soltos com o nome da cena (também como no arquivo real) — o "Beat 1" tem um frame interno, que NÃO deve virar container
  const b1 = makeNode("FRAME", { name: "Scene 9 Beat 1", x: 12000, y: 0, width: 1920, height: 1080 }, [makeNode("FRAME", { name: "Celular", x: 100, y: 100, width: 400, height: 800 })]);
  const b2 = deepClone(b1); b2.name = "Scene 9 Beat 2"; b2.y = 1300;
  const page2 = { type: "PAGE", name: "Real", children: [cont, b1, b2], selection: [] };
  [cont, b1, b2].forEach(n => n.parent = page2);
  M.install(page2);
  const r = await P.analyze({ scope: "page" });
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].compName, "SCENE_07"); assert.strictEqual(r[0].frames.length, 2, "frames internos viram os frames da cena");
  assert.strictEqual(r[0].frameEls[1].elements[0].status, "EXISTING");
  assert.strictEqual(r[1].compName, "SCENE_09"); assert.strictEqual(r[1].frames.length, 2, "beats soltos agrupados pelo nome");
  assert.strictEqual(r[1].frameEls[0].elements[0].name, "Celular", "frame interno de um beat continua sendo elemento");
  console.log("Frame-container de cena + beats por nome: OK");
})().catch(e => { console.error("FALHOU:", e); process.exit(1); });
