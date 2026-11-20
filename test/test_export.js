"use strict";
globalThis.__F2AE_TEST__ = true;
const assert = require("assert");
const fs = require("fs");
const M = require("./mockFigma");
const { makeNode, deepClone, solid, image } = M;
const P = require("../figma-plugin/code.js");

// cena com todos os tipos de elemento
const card = makeNode("FRAME", { name: "Card arredondado", x: 1000, y: 650, width: 400, height: 300, cornerRadius: 32, clipsContent: true, fills: [solid(1, 1, 1)], strokes: [solid(0.2, 0.2, 0.2)], strokeAlign: "INSIDE", strokeWeight: 2 }, [
  makeNode("RECTANGLE", { name: "Foto", x: -20, y: -20, width: 440, height: 200, fills: [image("hashFoto")] })
]);
const LIN = { type: "GRADIENT_LINEAR", visible: true, gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [{ position: 0, color: { r: 1, g: 0, b: 0, a: 1 } }, { position: 0.5, color: { r: 0, g: 1, b: 0, a: 1 } }, { position: 1, color: { r: 0, g: 0, b: 1, a: 0 } }] };
const TEX = { type: "IMAGE", visible: true, imageHash: "linhas", scaleMode: "TILE", scalingFactor: 0.5, opacity: 0.4, blendMode: "MULTIPLY" };
const gradFrame = makeNode("FRAME", { name: "Painel gradiente", x: 60, y: 60, width: 300, height: 200, cornerRadius: 12, clipsContent: false, fills: [LIN, TEX] }, [
  makeNode("TEXT", { name: "Label", characters: "Oi", x: 20, y: 20, width: 100, height: 30, fontName: { family: "Inter", style: "Regular" }, fontSize: 24, fills: [solid(0, 0, 0)] })
]);
const kids = [
  makeNode("RECTANGLE", { name: "Background", width: 1920, height: 1080, fills: [image("hashBG")] }),
  makeNode("ELLIPSE", { name: "Bolinha", x: 900, y: 500, width: 120, height: 120, fills: [solid(0.9, 0.5, 0.3)] }),
  makeNode("TEXT", { name: "Title", characters: "Olá storyboard", x: 120, y: 400, width: 700, height: 90, fontName: { family: "Inter", style: "Bold" }, fontSize: 72, fills: [solid(1, 1, 1)], textAlignHorizontal: "LEFT", textAutoResize: "WIDTH_AND_HEIGHT" }),
  makeNode("GROUP", { name: "Logo", x: 1500, y: 800, width: 300, height: 120 }, [
    makeNode("RECTANGLE", { name: "Base", x: 0, y: 0, width: 300, height: 120, fills: [solid(0.1, 0.1, 0.1)] }),
    makeNode("TEXT", { name: "Marca", characters: "ACME", x: 20, y: 20, width: 200, height: 60, fontName: { family: "Inter", style: "Regular" }, fontSize: 48, fills: [solid(1, 1, 1)] })
  ]),
  card, gradFrame
];
const f1 = makeNode("FRAME", { name: "7.1", width: 1920, height: 1080, fills: [solid(0.05, 0.05, 0.05)], clipsContent: true }, kids);
const f2 = deepClone(f1); f2.name = "7.2"; f2.x = 2100;
f2.children.filter(c => c.name === "Bolinha")[0].x = 1100; // muda de posição
const sceneBox = makeNode("FRAME", { name: "Scene 7", width: 4200, height: 1200, fills: [] }, [f1, f2]);
const loose = makeNode("RECTANGLE", { name: "Solto", x: 5000, y: 0, width: 50, height: 80, fills: [solid(1, 0, 0)] });
const page = { type: "PAGE", name: "P", id: "0:1", children: [sceneBox, loose], selection: [] };
sceneBox.parent = page; loose.parent = page;
M.install(page);
page.id = "0:1";

function names(arr) { return arr.map(d => d.compName); }
function flat(list, out) { (list || []).forEach(l => { out.push(l); if (l.kind === "group") flat(l.children, out); }); return out; }

(async () => {
  // 1) um frame selecionado → 1 comp idêntico
  page.selection = [f1];
  let desc = P.describeTargets(P.resolveTargets(page.selection));
  assert.deepStrictEqual(names(desc), ["SCENE_07_F01"]);
  assert.strictEqual(desc[0].mode, "frame");
  let out = await P.exportFrames({ options: { rasterScale: 2 } });
  let pkg = JSON.parse(out.manifest);
  assert.strictEqual(pkg.version, 2);
  assert.strictEqual(pkg.comps.length, 1);
  let c = pkg.comps[0];
  assert.strictEqual(c.width, 1920); assert.strictEqual(c.group, "SCENE_07");
  assert.ok(c.bg && c.bg.kind === "solid", "fundo sólido do frame");
  assert.ok(c.ref && /REF\//.test(c.ref.file), "referência do Figma no pacote");
  assert.deepStrictEqual(c.layers.map(l => l.name), ["Background", "Bolinha", "Title", "Logo", "Card arredondado", "Painel gradiente"]);
  const logo = c.layers[3];
  assert.strictEqual(logo.kind, "group", "grupo neutro vira Null + filhos");
  assert.deepStrictEqual(logo.children.map(k => k.name), ["Base", "Marca"]);
  assert.strictEqual(logo.children[0].xf.tx, 1500, "filhos do grupo no espaço do comp");
  const cardS = c.layers[4];
  assert.strictEqual(cardS.kind, "precomp"); assert.strictEqual(cardS.clipRadius, 32, "recorte arredondado");
  assert.deepStrictEqual(cardS.children.map(k => k.name), ["Card arredondado · fundo", "Foto", "Card arredondado · contorno"], "fundo embaixo, contorno por cima");
  const grad = c.layers[5];
  assert.strictEqual(grad.kind, "group");
  const gb = grad.children[0];
  assert.strictEqual(gb.kind, "paintstack", "fundo com gradiente/textura recriado com recursos nativos");
  assert.strictEqual(gb.prim, "rect"); assert.strictEqual(gb.radius, 12);
  assert.deepStrictEqual(gb.paints.map(p => p.type), ["linear", "image"], "uma camada por preenchimento, de baixo pra cima");
  assert.deepStrictEqual(gb.paints[0].handles.start, [0, 100]); assert.deepStrictEqual(gb.paints[0].handles.end, [300, 100]);
  assert.strictEqual(gb.paints[0].stops.length, 3); assert.strictEqual(gb.paints[0].stops[2].alpha, 0);
  assert.strictEqual(gb.paints[1].mode, "TILE"); assert.strictEqual(gb.paints[1].scalingFactor, 0.5);
  assert.strictEqual(gb.paints[1].blend, "MULTIPLY"); assert.strictEqual(gb.paints[1].alpha, 0.4);
  assert.ok(/\.jpg$/.test(gb.paints[1].file), "textura original no formato original (jpg)");
  assert.deepStrictEqual([grad.children[0].xf.tx, grad.children[0].xf.ty], [60, 60], "fundo rasterizado no lugar certo (não onde o Figma pôs o clone)");
  assert.ok(!page.children.some(n => n.name === "Painel gradiente" && n !== gradFrame), "clone removido da página");
  assert.strictEqual(grad.children[1].name, "Label");
  assert.ok(c.layers.every(l => l.identity && l.identity.status === "NEW"), "continuidade: tudo novo no F01");

  // 2) cena inteira → 1 comp por frame
  page.selection = [sceneBox];
  desc = P.describeTargets(P.resolveTargets(page.selection));
  assert.deepStrictEqual(names(desc), ["SCENE_07_F01", "SCENE_07_F02"]);
  out = await P.exportFrames({ options: {} });
  pkg = JSON.parse(out.manifest);
  assert.strictEqual(pkg.comps.length, 2);
  const bol2 = pkg.comps[1].layers.find(l => l.name === "Bolinha");
  assert.strictEqual(bol2.identity.status, "MODIFIED");
  assert.ok(bol2.identity.id && bol2.identity.id === pkg.comps[0].layers.find(l => l.name === "Bolinha").identity.id, "mesma identidade nos dois frames");
  assert.ok(pkg.comps[0].sceneKey && pkg.comps[0].sceneKey === pkg.comps[1].sceneKey); assert.deepStrictEqual(pkg.comps.map(c => c.frameIndex), [0, 1]);
  assert.ok(bol2.identity.diffs[0].indexOf("posição") === 0);
  assert.strictEqual(pkg.comps[1].layers.find(l => l.name === "Title").identity.status, "EXISTING");
  const gbg2 = pkg.comps[1].layers.find(l => l.name === "Painel gradiente").children[0];
  assert.deepStrictEqual([gbg2.xf.tx, gbg2.xf.ty], [60, 60], "fundo rasterizado no lugar certo também em frame deslocado no canvas");

  // 3) objetos dentro de um frame → comp do tamanho do frame só com eles
  const bolF2 = f2.children.find(n => n.name === "Bolinha"), marca = f2.children.find(n => n.name === "Logo").children[1];
  page.selection = [marca, bolF2];
  desc = P.describeTargets(P.resolveTargets(page.selection));
  assert.deepStrictEqual(names(desc), ["SCENE_07_F02_PARCIAL"]);
  assert.strictEqual(desc[0].count, 2);
  out = await P.exportFrames({ options: {} });
  pkg = JSON.parse(out.manifest);
  c = pkg.comps[0];
  assert.strictEqual(c.width, 1920);
  assert.deepStrictEqual(c.layers.filter(l => l.figmaType !== "FRAME").map(l => l.name), ["Bolinha", "Marca"], "na ordem de empilhamento do Figma");
  assert.strictEqual(c.layers.find(l => l.name === "Bolinha").xf.tx, 1100);
  assert.strictEqual(c.layers.find(l => l.name === "Marca").xf.tx, 1520);

  // 4) frame + objeto do mesmo frame → frame inteiro vence; objeto solto na página → comp da seleção
  page.selection = [bolF2, f2, loose];
  desc = P.describeTargets(P.resolveTargets(page.selection));
  assert.deepStrictEqual(names(desc), ["SCENE_07_F02", "SELECAO_PARCIAL"]);
  assert.strictEqual(desc[0].mode, "frame");
  out = await P.exportFrames({ options: { reference: false } });
  pkg = JSON.parse(out.manifest);
  assert.strictEqual(pkg.comps[1].width, 50); assert.strictEqual(pkg.comps[1].height, 80);
  assert.strictEqual(pkg.comps[1].layers[0].xf.tx, 0);
  assert.strictEqual(pkg.comps[0].ref, null);

  // 4b) cena selecionada, mas só um frame marcado na lista → exporta só ele
  page.selection = [sceneBox];
  desc = P.describeTargets(P.resolveTargets(page.selection));
  assert.strictEqual(desc[0].containerId, sceneBox.id, "sabe de qual contêiner veio");
  out = await P.exportFrames({ include: [f2.id], options: { reference: false } });
  pkg = JSON.parse(out.manifest);
  assert.deepStrictEqual(pkg.comps.map(c => c.frameName), ["7.2"], "só o frame marcado");
  await assert.rejects(() => P.exportFrames({ include: [], options: {} }), /Nenhum frame marcado/);

  // 4c) "juntar numa comp só": frames continuam separados no pacote, marcados como sequência (o AE monta uma comp só, no tempo)
  desc = P.describeTargets(P.resolveTargets(page.selection, { [sceneBox.id]: true }));
  assert.strictEqual(desc.length, 2); assert.ok(desc.every(d => d.whole && d.seq === sceneBox.id));
  out = await P.exportFrames({ whole: [sceneBox.id], options: { reference: false } });
  pkg = JSON.parse(out.manifest);
  assert.strictEqual(pkg.comps.length, 2);
  assert.deepStrictEqual(pkg.sequences, [{ name: "SCENE_07", keys: [f1.id, f2.id], comps: [0, 1] }]);

  // 4f) vetor com centenas de sub-formas vira imagem (rápido no After); desligando a opção fica shape
  {
    const dots = Array.from({ length: 400 }, (_, i) => `M ${i} 0 L ${i + 1} 0 L ${i + 1} 1 Z`).join(" ");
    const v = makeNode("VECTOR", { name: "Campo de pontos", x: 10, y: 10, width: 400, height: 10, fills: [solid(1, 1, 1)], fillGeometry: [{ data: dots, windingRule: "NONZERO" }] });
    const fr = makeNode("FRAME", { name: "Pontos", x: 0, y: 0, width: 1920, height: 1080, fills: [solid(0, 0, 0)] }, [v]);
    const pgV = { type: "PAGE", name: "V", id: "0:4", children: [fr], selection: [fr] }; fr.parent = pgV;
    const saved = global.figma.currentPage; global.figma.currentPage = pgV;
    let o = await P.exportFrames({ options: {} });
    let lv = flat(JSON.parse(o.manifest).comps[0].layers, []).find(l => l.name === "Campo de pontos");
    assert.strictEqual(lv.kind, "raster", "vetor pesado vira imagem");
    o = await P.exportFrames({ options: { heavyRaster: false } });
    lv = flat(JSON.parse(o.manifest).comps[0].layers, []).find(l => l.name === "Campo de pontos");
    assert.notStrictEqual(lv.kind, "raster", "com a opção desligada continua shape");
    global.figma.currentPage = saved;
  }

  // 4g) frame do storyboard com camadas-frame do mesmo tamanho (partículas, grid, marcadores) é UMA tela
  {
    const layer = (n) => makeNode("FRAME", { name: n, x: 0, y: 0, width: 1920, height: 1080, fills: [] }, [makeNode("RECTANGLE", { name: n + " r", x: 5, y: 5, width: 10, height: 10, fills: [solid(1, 1, 1)] })]);
    const small = (n, x) => makeNode("FRAME", { name: n, x, y: 40, width: 563, height: 30, fills: [] }, []);
    const beat = (k, y) => makeNode("FRAME", { name: "Scene - 12 - beat " + k, x: 0, y, width: 1920, height: 1080, fills: [solid(0.2, 0.3, 0.2)] }, [layer("Particle field"), layer("Grid"), layer("Markers"), small("Section head", 40), small("Timecode", 1300)]);
    const sc = makeNode("FRAME", { name: "Scene 12", x: 0, y: 0, width: 1920, height: 3500, fills: [] }, [beat(2, 0), beat(3, 1200), beat(4, 2400)]);
    const pg = { type: "PAGE", name: "B", id: "0:5", children: [sc], selection: [sc] }; sc.parent = pg;
    const saved = global.figma.currentPage; global.figma.currentPage = pg;
    let ds = P.describeTargets(P.resolveTargets(pg.selection));
    assert.deepStrictEqual(ds.map(d => d.frameName), ["Scene - 12 - beat 2", "Scene - 12 - beat 3", "Scene - 12 - beat 4"], "cada beat é uma tela, não abre as camadas de dentro");
    pg.selection = [sc.children[1]];
    ds = P.describeTargets(P.resolveTargets(pg.selection));
    assert.deepStrictEqual(ds.map(d => d.frameName), ["Scene - 12 - beat 3"], "selecionar um beat pega ele inteiro");
    global.figma.currentPage = saved;
  }

  // 4h) cena agrupada só pelo nome (frames soltos na página) também pode ser juntada
  {
    const fb = (k) => makeNode("FRAME", { name: "Scene 20 - beat " + k, x: k * 2000, y: 0, width: 1920, height: 1080, fills: [solid(0.1, 0.1, 0.1)] }, [makeNode("RECTANGLE", { name: "r", x: 1, y: 1, width: 5, height: 5, fills: [solid(1, 1, 1)] })]);
    const fs3 = [fb(1), fb(2), fb(3)];
    const pg = { type: "PAGE", name: "G", id: "0:6", children: fs3, selection: fs3.slice() }; fs3.forEach(f => f.parent = pg);
    const saved = global.figma.currentPage; global.figma.currentPage = pg;
    let ds = P.describeTargets(P.resolveTargets(pg.selection));
    const g = ds[0].group; assert.ok(g && ds.every(d => d.group === g), "mesmo grupo pela cena");
    const w = {}; w["g:" + g] = true;
    ds = P.describeTargets(P.resolveTargets(pg.selection, w));
    assert.ok(ds.every(d => d.whole && d.seq === "g:" + g), "juntar pelo grupo");
    const o = await P.exportFrames({ options: {}, include: ds.map(d => d.key), whole: ["g:" + g] });
    const pk = JSON.parse(o.manifest);
    assert.ok(pk.sequences && pk.sequences[0].comps.length === 3, "sequência com os 3 frames: " + JSON.stringify(pk.sequences));
    global.figma.currentPage = saved;
  }

  // 4i) contornos viram Stroke nativo do AE (não forma preenchida): linha, path aberto tracejado, retângulo por dentro
  {
    const line = makeNode("LINE", { name: "Linha", x: 10, y: 10, width: 300, height: 0, fills: [], strokes: [solid(1, 0, 0)], strokeWeight: 4, strokeCap: "ROUND", strokeAlign: "CENTER" });
    const vec = makeNode("VECTOR", { name: "Curva", x: 10, y: 50, width: 200, height: 100, fills: [], strokes: [solid(0, 0, 1)], strokeWeight: 3, strokeAlign: "CENTER", strokeJoin: "ROUND", dashPattern: [10, 5],
      vectorPaths: [{ data: "M 0 100 C 50 0 150 0 200 100", windingRule: "NONE" }], strokeGeometry: [{ data: "M 0 0 L 1 1 Z", windingRule: "NONZERO" }] });
    const rect = makeNode("RECTANGLE", { name: "Caixa", x: 400, y: 50, width: 200, height: 100, cornerRadius: 12, fills: [solid(1, 1, 1)], strokes: [solid(0, 0, 0)], strokeWeight: 6, strokeAlign: "INSIDE" });
    const arrow = makeNode("VECTOR", { name: "Seta", x: 10, y: 300, width: 200, height: 10, fills: [], strokes: [solid(0, 0, 0)], strokeWeight: 2, strokeCap: "ARROW_LINES", strokeAlign: "CENTER",
      vectorPaths: [{ data: "M 0 5 L 200 5", windingRule: "NONE" }], strokeGeometry: [{ data: "M 0 4 L 200 4 L 200 6 L 0 6 Z", windingRule: "NONZERO" }] });
    const fr = makeNode("FRAME", { name: "Traços", x: 0, y: 0, width: 1920, height: 1080, fills: [solid(0.5, 0.5, 0.5)] }, [line, vec, rect, arrow]);
    const pg = { type: "PAGE", name: "S", id: "0:7", children: [fr], selection: [fr] }; fr.parent = pg;
    const saved = global.figma.currentPage; global.figma.currentPage = pg;
    const L = flat(JSON.parse((await P.exportFrames({ options: {} })).manifest).comps[0].layers, []);
    const by = n => L.find(l => l.name === n);
    assert.ok(by("Linha").strokes.length === 1 && !by("Linha").strokeGeometry, "linha vira Stroke");
    assert.strictEqual(by("Linha").strokes[0].cap, "round");
    assert.strictEqual(by("Linha").strokePaths[0].data, "M 0 0 L 300 0", "linha central da linha");
    assert.deepStrictEqual(by("Curva").strokes[0].dash, [10, 5], "tracejado");
    assert.strictEqual(by("Curva").strokes[0].join, "round");
    assert.ok(/^M 0 100 C/.test(by("Curva").strokePaths[0].data), "usa o path central do vetor, não o contorno expandido");
    assert.strictEqual(by("Caixa").prim, "rect"); assert.strictEqual(by("Caixa").strokes[0].align, "INSIDE", "traço por dentro → Offset Paths no AE");
    assert.ok(by("Seta").strokeGeometry && !by("Seta").strokes.length, "ponta de seta não tem equivalente → forma preenchida");
    global.figma.currentPage = saved;
  }

  // 4e) contêiner aninhado: frame com frames do tamanho do storyboard dentro abre em frames (não vira comp gigante)
  {
    const sub = (n, y) => makeNode("FRAME", { name: n, y, width: 1920, height: 1080, fills: [solid(0.2, 0.3, 0.2)] }, [makeNode("TEXT", { name: n + " t", characters: n, x: 10, y: 10, width: 300, height: 50, fontName: { family: "Inter", style: "Regular" }, fontSize: 40, fills: [solid(1, 1, 1)] })]);
    const loop = makeNode("FRAME", { name: "Loop option 2", x: 0, y: 1200, width: 1920, height: 3500, fills: [] }, [sub("01", 0), sub("02", 1200), sub("03", 2400)]);
    const cards = makeNode("FRAME", { name: "Frame com cards", x: 0, y: 0, width: 1920, height: 1080, fills: [solid(1, 1, 1)] }, [makeNode("FRAME", { name: "card a", x: 100, y: 100, width: 400, height: 700, fills: [solid(0, 0, 0)] }, []), makeNode("FRAME", { name: "card b", x: 600, y: 100, width: 400, height: 700, fills: [solid(0, 0, 0)] }, [])]);
    const b4 = sub("Beat 4", 0); b4.x = 2000; const b5 = sub("Beat 5", 0); b5.x = 4000;
    const sideBox = makeNode("FRAME", { name: "Side to side", x: 0, y: 0, width: 6000, height: 5000, fills: [] }, [cards, b4, b5, loop]);
    const pg = { type: "PAGE", name: "N", id: "0:3", children: [sideBox], selection: [sideBox] }; sideBox.parent = pg;
    const saved = global.figma.currentPage; global.figma.currentPage = pg;
    const ds = P.describeTargets(P.resolveTargets(pg.selection));
    assert.deepStrictEqual(ds.map(d => d.frameName).sort(), ["01", "02", "03", "Beat 4", "Beat 5", "Frame com cards"], "Loop option 2 abre nos 3 frames; o frame com cards fica inteiro");
    assert.ok(ds.every(d => d.h === 1080), "nenhuma comp gigante");
    assert.strictEqual(ds.find(d => d.frameName === "02").group, "LOOP_OPTION_2");
    // juntar "Side to side" leva junto os frames do Loop aninhado, tudo numa sequência só
    const w = {}; w[sideBox.id] = true;
    const dj = P.describeTargets(P.resolveTargets(pg.selection, w));
    assert.ok(dj.every(d => d.whole && d.seq === sideBox.id), "todos os 6 frames entram na mesma sequência");
    global.figma.currentPage = saved;
  }

  // 4d) gradiente radial de 3 cores → anéis exatos; combinação impossível → só esse preenchimento vira imagem
  {
    const rad = { type: "GRADIENT_RADIAL", visible: true, gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [{ position: 0, color: { r: 1, g: 1, b: 1, a: 1 } }, { position: 0.5, color: { r: 0.6, g: 0.6, b: 0.6, a: 1 } }, { position: 1, color: { r: 0.2, g: 0.2, b: 0.2, a: 1 } }] };
    const bad = { type: "GRADIENT_RADIAL", visible: true, gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [{ position: 0, color: { r: 0, g: 0, b: 0, a: 1 } }, { position: 0.8, color: { r: 1, g: 1, b: 1, a: 1 } }, { position: 1, color: { r: 0, g: 0, b: 0, a: 1 } }] };
    const ang = { type: "GRADIENT_ANGULAR", visible: true, gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [] };
    const fr = makeNode("FRAME", { name: "Radiais", x: 0, y: 0, width: 400, height: 400, fills: [rad, bad, ang] }, []);
    const pgR = { type: "PAGE", name: "R", id: "0:2", children: [fr], selection: [fr] }; fr.parent = pgR;
    const saved = global.figma.currentPage; global.figma.currentPage = pgR;
    const o = JSON.parse((await P.exportFrames({ options: { reference: false, continuity: false } })).manifest);
    const ps = o.comps[0].layers[0];
    assert.strictEqual(ps.kind, "paintstack");
    assert.strictEqual(ps.paints[0].type, "radial"); assert.strictEqual(ps.paints[0].rings.length, 2);
    assert.deepStrictEqual(ps.paints[0].handles.center, [200, 200]); assert.deepStrictEqual(ps.paints[0].handles.rx, [400, 200]);
    assert.deepStrictEqual(ps.paints[0].rings[1].c0, [1, 1, 1], "cor do centro extrapolada do 2º anel");
    assert.strictEqual(ps.paints[1].type, "image", "radial impossível vira imagem só desse preenchimento");
    assert.strictEqual(ps.paints[2].type, "image", "angular vira imagem só desse preenchimento");
    global.figma.currentPage = saved;
  }

  // 5) nada selecionado → erro amigável
  page.selection = [];
  await assert.rejects(() => P.exportFrames({ options: {} }), /Selecione/);

  // 6) ZIP gerado pela interface é válido (pacote com 2 comps, usado também pelo teste do painel)
  page.selection = [bolF2, f2, loose];
  out = await P.exportFrames({ options: { reference: false } });
  const html = fs.readFileSync(__dirname + "/../figma-plugin/ui.html", "utf8");
  const zipSrc = html.slice(html.indexOf("const CRC = "), html.indexOf("function warningsOf"));
  const makeZip = new Function("Blob", "TextEncoder", zipSrc + "; return makeZip;")(class { constructor(parts) { this.parts = parts; } }, TextEncoder);
  const files = [{ path: "figma2ae.json", bytes: new TextEncoder().encode(out.manifest) }].concat(out.files);
  const blob = makeZip(files);
  const buf = Buffer.concat(blob.parts.map(p => Buffer.from(p.buffer ? new Uint8Array(p.buffer, p.byteOffset, p.byteLength) : p)));
  fs.writeFileSync("/tmp/f2ae_test.zip", buf);
  const r = require("child_process").execSync("python3 -c \"import zipfile;z=zipfile.ZipFile('/tmp/f2ae_test.zip');print(z.testzip(),len(z.namelist()))\"").toString().trim();
  assert.ok(r.startsWith("None"), "zip válido: " + r);

  console.log("TODOS OS TESTES DE EXPORTAÇÃO POR SELEÇÃO PASSARAM");
})().catch(e => { console.error(e); process.exit(1); });
