/* Figma2AE Studio — motor de análise de tomadas.
 * Compara frames vizinhos elemento por elemento e decide se o próximo frame continua a mesma tomada
 * (mesmo fundo/composição, só troca texto ou detalhe) ou começa uma tomada nova (comp nova).
 * Depois monta o plano de camadas de cada tomada: o que não muda vira uma camada só; o que muda vira
 * camadas separadas, cada uma no seu tempo.                                                           */
"use strict";

const SPLIT_BELOW = 0.55;        // abaixo disso, corta pra uma tomada nova
const DEFAULT_DUR = 2;

function parseTiming(name) {
  const s = String(name || "");
  const d = s.match(/\(\s*(\d+(?:[.,]\d+)?)\s*s(?:eg)?\s*\)/i) || s.match(/(?:^|[\s\-–_])(\d+(?:[.,]\d+)?)\s*s(?:eg)?(?=$|[\s\)\-–_])/i);
  return { dur: d ? Math.max(0.04, parseFloat(d[1].replace(",", "."))) : null };
}
function outlineOnly(l) {
  // forma só de contorno (linha, círculo tracejado, guia): visualmente é fina, não ocupa a área da caixa
  if (l.kind !== "shape") return false;
  return !(l.fills && l.fills.length) && !!((l.strokeGeometry && l.strokeGeometry.length) || (l.strokes && l.strokes.length));
}
function layerArea(l, fa) {
  const xf = l.xf || { a: 1, b: 0, c: 0, d: 1 };
  const det = Math.abs(xf.a * xf.d - xf.b * xf.c) || 1;
  let a = (l.w || 0) * (l.h || 0) * det;
  if (outlineOnly(l)) a = Math.max(l.w || 0, l.h || 0) * 6 * Math.sqrt(det); // faixa fina ao longo do contorno
  else if (l.kind === "group" && l.children && l.children.length && l.children.every(outlineOnly)) a *= 0.05;
  return Math.min(fa, Math.max(0, a));
}
function hasImage(l) {
  if (l.kind === "image" || l.kind === "raster") return true;
  if (l.kind === "paintstack") return (l.paints || []).some(p => p.type === "image");
  return (l.children || []).some(hasImage);
}
const LIGHT_DIFFS = /^(texto|posição|opacidade|rotação|reaparece|tamanho)/;
function continuityOf(l) {
  const id = l.identity;
  if (!id) return null;
  if (id.status === "EXISTING") return 1;
  if (id.status === "NEW") return 0;
  const diffs = id.diffs || [];
  if (diffs.every(d => LIGHT_DIFFS.test(d))) return 0.85;          // mesmo elemento, só texto/posição/opacidade
  if (hasImage(l)) return 0.7;                                     // troca de imagem no mesmo lugar (frame de vídeo, pose)
  return 0.5;
}
function x0(A, id) { return (A.layers || []).find(x => x.identity && x.identity.id === id); }
function sig(spec) {
  // assinatura do elemento sem nome/identidade: pra juntar camadas iguais quando não há continuidade
  return JSON.stringify(spec, (k, v) => (k === "identity" || k === "name" || k === "figmaId" || k === "notes") ? undefined : v);
}

/* garante um id por elemento: o da continuidade do plugin ou, em pacotes antigos, nome + ocorrência */
function withIds(c) {
  if (!c || c._ids) return c;
  const seen = {};
  (c.layers || []).forEach(l => {
    if (!l.identity) return;
    if (!l.identity.id) { const k = l.name + "|" + l.kind; seen[k] = (seen[k] || 0) + 1; l.identity.id = "n:" + k + "#" + seen[k]; }
  });
  c._ids = true; return c;
}
/* nota de 0 a 1: quanto o frame B continua o frame A */
function transition(A, B) {
  withIds(A); withIds(B);
  if (!A || !B) return { score: 0, reason: "" };
  if (A.width !== B.width || A.height !== B.height) return { score: 0, reason: "tamanho de frame diferente" };
  if (A.sceneKey && B.sceneKey && A.sceneKey !== B.sceneKey) return { score: 0, reason: "outra cena" };
  const fa = (B.width * B.height) || 1;
  let sw = 0, sc = 0, unknown = 0;
  let textSwaps = 0, imgSwaps = 0, news = 0, bigNew = 0, bigKeep = null;
  const idsB = new Set();
  const top = B.layers || [];
  let largest = null;
  const sameGeom = (x, y) => Math.abs(x.xf.tx - y.xf.tx) < x.w * 0.02 + 2 && Math.abs(x.xf.ty - y.xf.ty) < x.h * 0.02 + 2 && Math.abs(x.w - y.w) < x.w * 0.03 + 2 && Math.abs(x.h - y.h) < x.h * 0.03 + 2;
  const swappedA = new Set();
  top.forEach(l => {
    const w = layerArea(l, fa) / fa; if (w <= 0) return;
    if (!largest || w > largest.w) largest = { w, l };
    let c = continuityOf(l);
    if (c === 0 && l.identity && (A.layers || []).some(x => x.identity && x.identity.id === l.identity.id)) c = sig(x0(A, l.identity.id)) === sig(l) ? 1 : 0.85;
    // "novo" com o mesmo nome e tipo de um que saiu: é o mesmo elemento mudando de tamanho/lugar (zoom, movimento)
    if (c === 0 && l.identity) {
      const twin = (A.layers || []).find(x => x.identity && x.name === l.name && x.kind === l.kind && !(B.layers || []).some(y => y.identity && y.identity.id === x.identity.id) && !swappedA.has(x.identity.id));
      if (twin) { c = 0.85; swappedA.add(twin.identity.id); l = Object.assign({}, l, { _swap: true }); }
    }
    // imagem "nova" exatamente no lugar de uma imagem que saiu (ex.: frames de vídeo com nomes diferentes): é troca de imagem
    if (c === 0 && hasImage(l) && w > 0.3) {
      const prev = (A.layers || []).find(x => x.identity && hasImage(x) && sameGeom(x, l) && !(B.layers || []).some(y => y.identity && y.identity.id === x.identity.id));
      if (prev) { c = 0.7; swappedA.add(prev.identity.id); imgSwaps++; l = Object.assign({}, l, { _swap: true }); }
    }
    if (c === null) {
      // sem identidade (fundo do frame etc.): igual ao do frame anterior?
      c = (A.layers || []).some(x => !x.identity && sig(x) === sig(l)) ? 1 : 0.5; unknown++;
    } else if (l.identity.id) idsB.add(l.identity.id);
    sw += w; sc += w * c;
    if (l.identity) {
      if (l.identity.status === "NEW" && !l._swap) { news++; if (w > 0.12) bigNew++; }
      if (l.identity.status === "MODIFIED") { if (l.kind === "text" || (l.identity.diffs || []).some(d => d === "texto")) textSwaps++; else if (hasImage(l)) imgSwaps++; }
    }
  });
  // o que saiu do frame A também conta como mudança (menos um retângulo da mesma cor do fundo: sumir não muda nada na tela)
  const sameColor = (c1, c2) => c1 && c2 && Math.abs(c1[0] - c2[0]) + Math.abs(c1[1] - c2[1]) + Math.abs(c1[2] - c2[2]) < 0.03;
  const invisibleVsBg = (l, bgSpec) => l.kind === "shape" && l.fills && l.fills.length === 1 && bgSpec && bgSpec.kind === "solid" && sameColor(l.fills[0].color, bgSpec.color) && layerArea(l, fa) / fa > 0.9;
  (A.layers || []).forEach(l => { if (l.identity && !idsB.has(l.identity.id) && !swappedA.has(l.identity.id) && !invisibleVsBg(l, B.bg)) { const w = layerArea(l, fa) / fa; sw += w; } });
  if (B.bg && A.bg && JSON.stringify(B.bg) !== JSON.stringify(A.bg)) { sw += 0.6; }
  const score = sw > 0 ? sc / sw : 1;
  const bgKept = largest ? (largest.l._swap ? 0.7 : continuityOf(largest.l) === null ? 0.8 : continuityOf(largest.l)) : 1;
  let reason;
  if (score >= SPLIT_BELOW) {
    if (textSwaps && !imgSwaps) reason = "mesmo fundo, só troca de texto";
    else if (imgSwaps && textSwaps) reason = "mesmo enquadramento: troca a imagem e o texto";
    else if (imgSwaps) reason = "mesmo enquadramento, troca de imagem";
    else if (news) reason = "mesmo fundo, entram elementos novos";
    else reason = "quase igual ao anterior";
  } else {
    if (bgKept < 0.6) reason = "o fundo muda";
    else if (bigNew) reason = "entra um elemento grande novo";
    else reason = "a composição muda bastante";
  }
  return { score: Math.round(score * 100) / 100, reason };
}

/* ordem dos frames: por cena e posição na cena, mantendo a ordem do pacote entre cenas */
function orderedFrames(pkg) {
  const comps = (pkg.comps || []).map((c, i) => Object.assign({ _i: i }, c));
  const firstOf = {};
  comps.forEach(c => { const k = c.sceneKey || ("_" + c._i); if (firstOf[k] === undefined) firstOf[k] = c._i; });
  return comps.sort((a, b) => {
    const ka = a.sceneKey || ("_" + a._i), kb = b.sceneKey || ("_" + b._i);
    if (ka !== kb) return firstOf[ka] - firstOf[kb];
    return (a.frameIndex - b.frameIndex) || (a._i - b._i);
  });
}

/* sugestão de tomadas: devolve frames (com duração) e os cortes sugeridos */
function suggest(pkg, opts) {
  opts = opts || {};
  const frames = orderedFrames(pkg).map(c => {
    const t = parseTiming(c.frameName);
    return { i: c._i, name: c.frameName, comp: c.compName, group: c.group, sceneName: c.sceneName, w: c.width, h: c.height, ref: c.ref ? c.ref.file : null,
      dur: opts.useNames !== false && t.dur ? t.dur : (opts.defaultDur || DEFAULT_DUR), durFromName: !!(opts.useNames !== false && t.dur) };
  });
  const comps = pkg.comps || [];
  for (let k = 0; k < frames.length; k++) {
    if (k === 0) { frames[k].cut = true; frames[k].why = "início"; frames[k].score = 0; continue; }
    const tr = transition(comps[frames[k - 1].i], comps[frames[k].i]);
    frames[k].score = tr.score; frames[k].why = tr.reason; frames[k].cut = tr.score < SPLIT_BELOW;
  }
  return frames;
}
function shotsOf(frames) {
  const shots = [];
  frames.forEach(f => { if (f.cut || !shots.length) shots.push({ frames: [] }); shots[shots.length - 1].frames.push(f); });
  return shots;
}

/* plano de camadas de uma tomada */
function shotPlan(pkg, shot, name) {
  const comps = pkg.comps || [];
  shot.frames.forEach(f => withIds(comps[f.i]));
  const first = comps[shot.frames[0].i];
  const W = first.width, H = first.height;
  const stack = [], entries = {};          // stack = ids de entrada, de baixo pra cima
  const openById = {}, openBySig = {};
  const bgs = [], refs = [], markers = [];
  let t = 0, uid = 0;
  shot.frames.forEach((f, k) => {
    const c = comps[f.i], t0 = t, t1 = t + f.dur;
    markers.push({ t: t0, label: "F" + String(k + 1).padStart(2, "0") + " · " + (f.name || "") });
    if (c.bg) {
      const last = bgs[bgs.length - 1];
      if (last && JSON.stringify(last.bg) === JSON.stringify(c.bg) && Math.abs(last.t1 - t0) < 1e-6) last.t1 = t1;
      else bgs.push({ bg: c.bg, t0, t1 });
    }
    if (c.ref) refs.push({ file: c.ref.file, scale: c.ref.scale, t0, t1, label: "F" + String(k + 1).padStart(2, "0") });
    let below = null;
    const nextOpenById = {}, nextOpenBySig = {};
    (c.layers || []).forEach(spec => {
      const id = spec.identity && spec.identity.id;
      const sg = id ? null : sig(spec);
      let e = null;
      if (id && openById[id] && spec.identity.status === "EXISTING") e = openById[id];
      else if (!id && openBySig[sg]) e = openBySig[sg];
      if (e && Math.abs(e.t1 - t0) < 1e-6) {
        e.t1 = t1;
      } else {
        e = { key: "e" + (++uid), spec, t0, t1, frame: k };
        entries[e.key] = e;
        // entra logo acima do vizinho de baixo (mesma lógica de empilhamento do Figma)
        const pos = below === null ? 0 : stack.indexOf(below) + 1;
        stack.splice(pos, 0, e.key);
      }
      if (id) nextOpenById[id] = e; else nextOpenBySig[sg] = e;
      below = e.key;
    });
    Object.keys(openById).forEach(k2 => delete openById[k2]); Object.assign(openById, nextOpenById);
    Object.keys(openBySig).forEach(k2 => delete openBySig[k2]); Object.assign(openBySig, nextOpenBySig);
    t = t1;
  });
  return {
    compName: name, group: first.group || "", width: W, height: H, duration: Math.round(t * 1000) / 1000,
    frameNames: shot.frames.map(f => f.name), items: stack.map(k => ({ spec: entries[k].spec, t0: entries[k].t0, t1: entries[k].t1 })),
    bgs, refs, markers
  };
}
function buildPlan(pkg, frames, opts) {
  opts = opts || {};
  const shots = shotsOf(frames);
  const base = (frames[0] && (frames[0].group || "")) || "TOMADA";
  const used = {};
  const plans = shots.map((s, i) => {
    let nm = (s.name || ((s.frames[0].group || base).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").toUpperCase() || "TOMADA") + "_TOMADA_" + String(i + 1).padStart(2, "0")).slice(0, 30);
    let n2 = nm, k = 2; while (used[n2]) n2 = nm + "_" + (k++); used[n2] = 1;
    return shotPlan(pkg, s, n2);
  });
  return { format: "figma2ae-plan", version: 1, file: pkg.file, page: pkg.page, master: opts.master !== false, masterName: opts.masterName || "MASTER_SEQUENCIA", shots: plans };
}

module.exports = { parseTiming, transition, suggest, shotsOf, shotPlan, buildPlan, SPLIT_BELOW };
