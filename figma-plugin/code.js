/* Figma2AE — plugin do Figma
 * Analisa storyboards (cenas -> frames -> elementos), reconhece a continuidade
 * dos elementos entre frames e exporta um pacote pro painel do After Effects.
 */
"use strict";

var TAG_KEY = "f2ae_id";
var SHAPE_TYPES = { RECTANGLE: 1, ELLIPSE: 1, VECTOR: 1, LINE: 1, STAR: 1, POLYGON: 1, BOOLEAN_OPERATION: 1 };
var CONTAINER_TYPES = { GROUP: 1, FRAME: 1, COMPONENT: 1, INSTANCE: 1, COMPONENT_SET: 1 };

/* ------------------------------------------------------------------ utilidades */
function fnv(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return ("0000000" + h.toString(16)).slice(-8);
}
function fnvBytes(bytes) {
  var h = 0x811c9dc5, step = Math.max(1, Math.floor(bytes.length / 65536));
  for (var i = 0; i < bytes.length; i += step) { h ^= bytes[i]; h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return ("0000000" + h.toString(16)).slice(-8) + "_" + bytes.length.toString(16);
}
function r2(v) { return Math.round(v * 100) / 100; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function isMixed(v) { return typeof figma !== "undefined" && v === figma.mixed || (typeof v === "symbol"); }
function asciiName(s) { return safeName(String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "_")); }
function safeName(s) { return String(s || "item").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 60) || "item"; }

/* matrizes afins 2x3 no formato do Figma: [[a, c, tx], [b, d, ty]] */
function m2o(m) { return { a: m[0][0], c: m[0][1], tx: m[0][2], b: m[1][0], d: m[1][1], ty: m[1][2] }; }
function mul(p, q) { // p * q
  return { a: p.a * q.a + p.c * q.b, c: p.a * q.c + p.c * q.d, tx: p.a * q.tx + p.c * q.ty + p.tx,
           b: p.b * q.a + p.d * q.b, d: p.b * q.c + p.d * q.d, ty: p.b * q.tx + p.d * q.ty + p.ty };
}
function inv(m) {
  var det = m.a * m.d - m.b * m.c; if (Math.abs(det) < 1e-12) det = 1e-12;
  return { a: m.d / det, c: -m.c / det, b: -m.b / det, d: m.a / det,
           tx: (m.c * m.ty - m.d * m.tx) / det, ty: (m.b * m.tx - m.a * m.ty) / det };
}
function apply(m, x, y) { return { x: m.a * x + m.c * y + m.tx, y: m.b * x + m.d * y + m.ty }; }
function decompose(m) {
  var sx = Math.sqrt(m.a * m.a + m.b * m.b) || 1e-9;
  var det = m.a * m.d - m.b * m.c;
  return { rot: Math.atan2(m.b, m.a) * 180 / Math.PI, sx: sx, sy: det / sx };
}
function relXf(containerAbs, nodeAbs) { return mul(inv(containerAbs), nodeAbs); }
function roundXf(m) { return { a: +m.a.toFixed(6), b: +m.b.toFixed(6), c: +m.c.toFixed(6), d: +m.d.toFixed(6), tx: r2(m.tx), ty: r2(m.ty) }; }

/* ------------------------------------------------------------------ assinaturas */
function visiblePaints(arr) { if (!arr || isMixed(arr)) return []; return arr.filter(function (p) { return p.visible !== false && (p.opacity === undefined || p.opacity > 0); }); }
function paintSig(p) {
  if (p.type === "SOLID") return "S" + [p.color.r, p.color.g, p.color.b, p.opacity === undefined ? 1 : p.opacity].map(function (v) { return Math.round(v * 255); }).join(",");
  if (p.type === "IMAGE") return "I" + (p.imageHash || "") + (p.scaleMode || "");
  if (p.type && p.type.indexOf("GRADIENT") === 0) return "G" + p.type + JSON.stringify((p.gradientStops || []).map(function (s) { return [r2(s.position), Math.round(s.color.r * 255), Math.round(s.color.g * 255), Math.round(s.color.b * 255), r2(s.color.a)]; }));
  return p.type || "?";
}
function styleSig(n) {
  var parts = [];
  if ("fills" in n) parts.push("f:" + visiblePaints(n.fills).map(paintSig).join("|"));
  if ("strokes" in n) parts.push("s:" + visiblePaints(n.strokes).map(paintSig).join("|") + "@" + (isMixed(n.strokeWeight) ? "m" : r2(n.strokeWeight || 0)));
  if ("effects" in n && n.effects) parts.push("e:" + n.effects.filter(function (e) { return e.visible !== false; }).map(function (e) { return e.type + (e.radius || 0) + (e.offset ? e.offset.x + "," + e.offset.y : ""); }).join("|"));
  if ("cornerRadius" in n) parts.push("r:" + (isMixed(n.cornerRadius) ? "m" : r2(n.cornerRadius || 0)));
  return fnv(parts.join(";"));
}
function geomSig(n) {
  try {
    if ("fillGeometry" in n && n.fillGeometry && n.fillGeometry.length) return fnv(n.fillGeometry.map(function (g) { return g.data; }).join("|"));
    if ("vectorPaths" in n && n.vectorPaths && n.vectorPaths.length) return fnv(n.vectorPaths.map(function (g) { return g.data; }).join("|"));
  } catch (e) {}
  return "";
}
function collectImages(n, out, depth) {
  if (depth > 8 || out.length > 40) return out;
  if ("fills" in n) visiblePaints(n.fills).forEach(function (p) { if (p.type === "IMAGE" && p.imageHash) out.push(p.imageHash); });
  if ("children" in n && n.type !== "INSTANCE") n.children.forEach(function (c) { if (c.visible !== false) collectImages(c, out, depth + 1); });
  return out;
}
function textOf(n) { try { return n.characters || ""; } catch (e) { return ""; } }
/* hash do "conteúdo" (aparência própria + filhos), independente da posição do elemento no frame */
function contentSig(n, depth, budget) {
  budget.n++;
  if (budget.n > 400 || depth > 8) return "…";
  var s = n.type + ":" + Math.round(n.width) + "x" + Math.round(n.height) + ":" + styleSig(n);
  if (n.type === "TEXT") s += ":t" + fnv(textOf(n)) + ":" + (isMixed(n.fontSize) ? "m" : n.fontSize) + ":" + (isMixed(n.fontName) ? "m" : n.fontName.family + n.fontName.style);
  else if (SHAPE_TYPES[n.type]) s += ":g" + geomSig(n);
  if ("children" in n) {
    var ch = n.children.filter(function (c) { return c.visible !== false; });
    s += "[" + ch.map(function (c) {
      var rel = relXf(m2o(n.absoluteTransform), m2o(c.absoluteTransform));
      return contentSig(c, depth + 1, budget) + "@" + Math.round(rel.tx) + "," + Math.round(rel.ty);
    }).join(",") + "]";
  }
  return fnv(s);
}

/* ------------------------------------------------------------------ cenas */
function sceneNumber(name) { var m = String(name || "").match(/(?:scene|cena|sc)[\s_\-\.]*0*(\d+)/i); return m ? +m[1] : null; }
function compNameFor(name, i) {
  var n = sceneNumber(name);
  if (n !== null) return "SCENE_" + (n < 10 ? "0" + n : n);
  var clean = safeName(name).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return clean || ("SCENE_" + (i + 1));
}
function isFrameLike(n) { return n.type === "FRAME" || n.type === "COMPONENT" || n.type === "INSTANCE"; }
function byPos(a, b) { return (a.y - b.y) || (a.x - b.x); }

function frameKids(n) { return "children" in n ? n.children.filter(function (c) { return isFrameLike(c) && c.visible !== false; }) : []; }
function similarSizes(list) {
  if (list.length < 2) return false;
  var ws = list.map(function (f) { return f.width; }).sort(function (a, b) { return a - b; }), hs = list.map(function (f) { return f.height; }).sort(function (a, b) { return a - b; });
  var mw = ws[Math.floor(ws.length / 2)], mh = hs[Math.floor(hs.length / 2)];
  var ok = list.filter(function (f) { return Math.abs(f.width - mw) <= mw * 0.15 && Math.abs(f.height - mh) <= mh * 0.15; }).length;
  return ok >= Math.max(2, Math.ceil(list.length * 0.6));
}
function isLayeredComposition(n, kids) {
  var area = n.width * n.height || 1;
  // algum filho cobre quase o frame todo → é camada de fundo/overlay, não um frame do storyboard guardado ali
  if (kids.some(function (k) { return k.width * k.height >= area * 0.8; })) return true;
  if (kids.length < 2) return false;
  var list = kids.slice(0, 40), over = 0, tot = 0;
  for (var i = 0; i < list.length; i++) {
    var a = list[i]; tot += a.width * a.height;
    for (var j = i + 1; j < list.length; j++) {
      var b = list[j];
      var w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x), h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (w > 0 && h > 0) over += w * h;
    }
  }
  return over > tot * 0.3; // frames empilhados um em cima do outro = camadas da mesma tela
}
/* um frame/grupo que guarda os frames do storyboard de uma cena (ex.: frame "Scene 7" com 7.1, 7.2 … dentro) */
function sceneContainerFrames(n, siblingsSameNumber) {
  if (!(isFrameLike(n) || n.type === "GROUP")) return null;
  var kids = frameKids(n);
  if (!kids.length) return null;
  var area = n.width * n.height || 1, kidArea = kids.reduce(function (a, k) { return a + k.width * k.height; }, 0);
  // um frame de storyboard com camadas-frame do mesmo tamanho dele (fundo, grid, partículas, marcadores)
  // é UMA tela, não um contêiner: contêiner tem os frames lado a lado, menores que ele e sem se sobrepor
  if (isLayeredComposition(n, kids)) return null;
  if (kids.length >= 2 && similarSizes(kids) && kidArea >= area * 0.15) return kids.sort(byPos);
  if (sceneNumber(n.name) !== null && siblingsSameNumber === 1 && kidArea >= area * 0.25) return kids.sort(byPos);
  return null;
}

function detectScenes(page, selection) {
  var scenes = [];
  var pool = [];
  var sel = (selection || []).filter(function (n) { return n.parent && (n.parent.type === "PAGE" || n.parent.type === "SECTION"); });
  var sections = [];
  var top = sel.length ? sel : page.children;
  top.forEach(function (n) { if (n.type === "SECTION") sections.push(n); else if (isFrameLike(n) || n.type === "GROUP") pool.push(n); });
  function numCount(list) { var c = {}; list.forEach(function (f) { var k = sceneNumber(f.name); if (k !== null) c[k] = (c[k] || 0) + 1; }); return c; }
  function takeContainers(list) {
    var cnt = numCount(list), rest = [];
    list.forEach(function (f) {
      var k = sceneNumber(f.name);
      var fr = sceneContainerFrames(f, k === null ? 0 : cnt[k]);
      if (fr) scenes.push({ name: f.name, source: "frame da cena", frames: flatKids(f).map(function (x) { return x.f; }), x: f.x, y: f.y });
      else if (isFrameLike(f)) rest.push(f);
    });
    return rest;
  }
  sections.sort(function (a, b) { return (a.x - b.x) || (a.y - b.y); });
  sections.forEach(function (s) {
    var inner = s.children.filter(function (c) { return isFrameLike(c) || c.type === "GROUP"; });
    var before = scenes.length;
    var plain = takeContainers(inner).filter(function (c) { return c.visible !== false; }).sort(byPos);
    if (plain.length) scenes.splice(before, 0, { name: s.name, source: "section", frames: plain, x: s.x, y: s.y });
    s.children.filter(function (c) { return c.type === "SECTION"; }).forEach(function (sub) { var f2 = sub.children.filter(isFrameLike).sort(byPos); if (f2.length) scenes.push({ name: sub.name, source: "section", frames: f2, x: sub.x, y: sub.y }); });
  });
  if (pool.length) {
    var rest0 = takeContainers(pool);
    // 1) por nome (SCENE 15 / ...)
    var named = {}, rest = [];
    rest0.forEach(function (f) { var n = sceneNumber(f.name); if (n !== null) (named[n] = named[n] || []).push(f); else rest.push(f); });
    Object.keys(named).map(Number).sort(function (a, b) { return a - b; }).forEach(function (n) {
      var fr = named[n].sort(byPos);
      scenes.push({ name: "SCENE " + n, source: "nome", frames: fr, x: fr[0].x, y: fr[0].y });
    });
    // 2) por colunas (frames alinhados verticalmente)
    rest.sort(function (a, b) { return a.x - b.x; });
    var cols = [];
    rest.forEach(function (f) {
      var cx = f.x + f.width / 2, col = null;
      for (var i = 0; i < cols.length; i++) { if (Math.abs(cols[i].cx - cx) < Math.max(f.width, cols[i].w) * 0.5) { col = cols[i]; break; } }
      if (!col) { col = { cx: cx, w: f.width, frames: [] }; cols.push(col); }
      col.frames.push(f);
    });
    cols.forEach(function (c, i) {
      var fr = c.frames.sort(byPos);
      var nm = cols.length === 1 && fr.length === 1 ? fr[0].name : "Coluna " + (i + 1);
      scenes.push({ name: nm, source: "coluna", frames: fr, x: fr[0].x, y: fr[0].y });
    });
  }
  // ordem: número da cena quando houver, senão posição no canvas
  scenes.sort(function (a, b) {
    var na = sceneNumber(a.name), nb = sceneNumber(b.name);
    if (na !== null && nb !== null && na !== nb) return na - nb;
    if (na !== null && nb === null) return -1;
    if (na === null && nb !== null) return 1;
    return (a.x - b.x) || (a.y - b.y);
  });
  return scenes;
}

/* ------------------------------------------------------------------ elementos */
async function extractElements(frame, frameIndex, expanded) {
  var out = [];
  var frameAbs = m2o(frame.absoluteTransform);
  var diag = Math.sqrt(frame.width * frame.width + frame.height * frame.height);
  async function visit(node, path) {
    if (node.visible === false) return;
    if (expanded[node.id] && "children" in node && node.children.length) {
      for (var i = 0; i < node.children.length; i++) await visit(node.children[i], path.concat(node.name));
      return;
    }
    var xf = relXf(frameAbs, m2o(node.absoluteTransform));
    var c = apply(xf, node.width / 2, node.height / 2);
    var tag = "";
    try { tag = node.getPluginData(TAG_KEY) || ""; } catch (e) {}
    var comp = "";
    if (node.type === "INSTANCE") { try { var mc = await node.getMainComponentAsync(); comp = mc ? mc.id : ""; } catch (e) {} }
    var imgs = collectImages(node, [], 0).sort();
    out.push({
      nodeId: node.id, frameIndex: frameIndex, name: node.name, type: node.type, path: path.join(" / "),
      xf: roundXf(xf), w: r2(node.width), h: r2(node.height), cx: c.x, cy: c.y, diag: diag,
      opacity: "opacity" in node ? node.opacity : 1, z: out.length,
      hasChildren: "children" in node && node.children.length > 0,
      sig: {
        tag: tag, comp: comp, img: imgs.join(","), vec: SHAPE_TYPES[node.type] ? geomSig(node) : "",
        text: node.type === "TEXT" ? textOf(node) : "", style: styleSig(node),
        content: contentSig(node, 0, { n: 0 }), name: node.name
      }
    });
  }
  for (var i = 0; i < frame.children.length; i++) await visit(frame.children[i], []);
  return out;
}

/* ------------------------------------------------------------------ correspondência */
function sameKind(a, b) { return a.type === b.type || (SHAPE_TYPES[a.type] && SHAPE_TYPES[b.type]) || (CONTAINER_TYPES[a.type] && CONTAINER_TYPES[b.type]); }
function scorePair(a, b) {
  var at = a.sig.tag, bt = b.sig.tag;
  if (at && bt) return at === bt ? { score: 1000, strong: true, tag: true } : null;
  if ((at && at.indexOf("x:") === 0) || (bt && bt.indexOf("x:") === 0)) return null; // separado manualmente
  if (!sameKind(a, b)) return null;
  var s = 0, strong = false;
  if (a.sig.comp && a.sig.comp === b.sig.comp) { s += 55; strong = true; }
  if (a.sig.img && a.sig.img === b.sig.img) { s += 55; strong = true; }
  if (a.sig.vec && a.sig.vec === b.sig.vec) { s += 40; strong = true; }
  if (a.sig.content === b.sig.content) { s += 35; strong = true; }
  if (a.type === "TEXT" && b.type === "TEXT") { if (a.sig.text === b.sig.text && a.sig.text) { s += 35; strong = true; } else s += 8; }
  if (a.sig.name === b.sig.name) s += 15;
  if (a.sig.style === b.sig.style) s += 6;
  var d = Math.sqrt(Math.pow(a.cx - b.cx, 2) + Math.pow(a.cy - b.cy, 2)) / (a.diag || 1000);
  var posScore = 22 * (1 - Math.min(1, d / 0.12));
  s += posScore;
  var size = Math.abs(Math.log((a.w + 1) / (b.w + 1))) + Math.abs(Math.log((a.h + 1) / (b.h + 1)));
  s += 10 * (1 - Math.min(1, size));
  if (!strong && a.sig.name !== b.sig.name && posScore < 11) return null;
  return { score: s, strong: strong, tag: false, posScore: posScore };
}
var MATCH_MIN = 42;
/* atribuição um-a-um pela melhor pontuação global (pares ordenados por score) */
function assign(prev, cur, minScore) {
  var pairs = [];
  for (var i = 0; i < prev.length; i++) for (var j = 0; j < cur.length; j++) {
    var sc = scorePair(prev[i], cur[j]);
    if (sc && sc.score >= minScore) pairs.push({ i: i, j: j, sc: sc });
  }
  pairs.sort(function (p, q) { return q.sc.score - p.sc.score; });
  var usedA = {}, usedB = {}, result = {};
  pairs.forEach(function (p) {
    if (usedA[p.i] || usedB[p.j]) return;
    usedA[p.i] = usedB[p.j] = true;
    var rival = pairs.filter(function (q) { return q !== p && (q.j === p.j || q.i === p.i) && q.sc.score >= p.sc.score - 8; }).length > 0;
    var conf = p.sc.tag ? "certa" : (p.sc.strong && p.sc.posScore > 8 && !rival) ? "alta" : "provavel";
    result[p.j] = { i: p.i, score: p.sc.score, confidence: conf, ambiguous: rival && !p.sc.tag };
  });
  return result;
}
function diffStates(a, b) {
  var d = [];
  var dx = b.cx - a.cx, dy = b.cy - a.cy;
  if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) d.push("posição (" + (dx >= 0 ? "+" : "") + Math.round(dx) + ", " + (dy >= 0 ? "+" : "") + Math.round(dy) + ")");
  if (Math.abs(a.w - b.w) > 0.5 || Math.abs(a.h - b.h) > 0.5) d.push("tamanho (" + Math.round(a.w) + "×" + Math.round(a.h) + " → " + Math.round(b.w) + "×" + Math.round(b.h) + ")");
  var ra = decompose(a.xf).rot, rb = decompose(b.xf).rot;
  if (Math.abs(((rb - ra + 540) % 360) - 180) > 0.1) d.push("rotação (" + Math.round(ra) + "° → " + Math.round(rb) + "°)");
  if (Math.abs(a.opacity - b.opacity) > 0.005) d.push("opacidade (" + Math.round(a.opacity * 100) + "% → " + Math.round(b.opacity * 100) + "%)");
  if (a.type === "TEXT" && a.sig.text !== b.sig.text) d.push("texto");
  if (a.sig.style !== b.sig.style) d.push("cor/estilo");
  else if (a.sig.content !== b.sig.content && !(a.type === "TEXT" && a.sig.text !== b.sig.text) && d.indexOf("tamanho") < 0 && !d.some(function (x) { return x.indexOf("tamanho") === 0; })) d.push("conteúdo");
  return d;
}
function iou(a, b) {
  function box(e) { return { x0: e.cx - e.w / 2, y0: e.cy - e.h / 2, x1: e.cx + e.w / 2, y1: e.cy + e.h / 2 }; }
  var p = box(a), q = box(b);
  var ix = Math.max(0, Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)), iy = Math.max(0, Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0));
  var inter = ix * iy, uni = a.w * a.h + b.w * b.h - inter;
  return uni > 0 ? inter / uni : 0;
}

/* analisa uma cena: liga elementos entre frames e calcula os status */
function linkScene(framesEls) {
  var identities = {}, order = [];
  var removedByFrame = [];
  function newIdentity(el) {
    var id = "i" + (order.length + 1);
    identities[id] = { id: id, name: el.name, type: el.type, states: [], firstFrame: el.frameIndex, minConfidence: "certa", ambiguous: false };
    order.push(id);
    return id;
  }
  var confRank = { certa: 3, alta: 2, provavel: 1 };
  for (var f = 0; f < framesEls.length; f++) {
    var cur = framesEls[f];
    removedByFrame[f] = [];
    if (f === 0) {
      cur.forEach(function (el) { el.identityId = newIdentity(el); el.status = "NEW"; el.diffs = []; el.confidence = "certa"; identities[el.identityId].states.push(el); });
      continue;
    }
    var prev = framesEls[f - 1];
    var m = assign(prev, cur, MATCH_MIN);
    var matchedPrev = {};
    cur.forEach(function (el, j) {
      var r = m[j];
      if (r) {
        var p = prev[r.i]; matchedPrev[r.i] = true;
        el.identityId = p.identityId; el.confidence = r.confidence; el.ambiguous = r.ambiguous;
        el.diffs = diffStates(p, el);
        el.status = el.diffs.length ? "MODIFIED" : "EXISTING";
      }
    });
    // reaparecimentos: compara com identidades ausentes no frame anterior
    var absent = order.filter(function (id) { return !prev.some(function (p) { return p.identityId === id; }); })
      .map(function (id) { var st = identities[id].states; return st[st.length - 1]; });
    var unmatched = []; cur.forEach(function (el, j) { if (!m[j]) unmatched.push(el); });
    if (absent.length && unmatched.length) {
      var m2 = assign(absent, unmatched, MATCH_MIN + 15);
      unmatched.forEach(function (el, j) {
        var r = m2[j]; if (!r) return;
        var p = absent[r.i];
        el.identityId = p.identityId; el.confidence = r.confidence === "certa" ? "certa" : "provavel"; el.ambiguous = r.ambiguous;
        el.diffs = ["reaparece (estava no " + "F" + pad2(p.frameIndex + 1) + ")"].concat(diffStates(p, el));
        el.status = "MODIFIED"; el.reappears = true;
      });
    }
    cur.forEach(function (el) {
      if (!el.identityId) { el.identityId = newIdentity(el); el.status = "NEW"; el.diffs = []; el.confidence = "certa"; }
      var idt = identities[el.identityId];
      idt.states.push(el);
      if (confRank[el.confidence] < confRank[idt.minConfidence]) idt.minConfidence = el.confidence;
      if (el.ambiguous) idt.ambiguous = true;
    });
    prev.forEach(function (p, i) {
      if (!matchedPrev[i] && !cur.some(function (c) { return c.identityId === p.identityId; })) removedByFrame[f].push({ identityId: p.identityId, name: p.name, type: p.type, nodeId: p.nodeId, frameIndex: f });
    });
    // sugestões de substituição: algo saiu e algo novo entrou no mesmo lugar
    removedByFrame[f].forEach(function (rm) {
      var old = prev.filter(function (p) { return p.identityId === rm.identityId; })[0];
      cur.forEach(function (el) {
        if (el.status === "NEW" && sameKind(old, el) && iou(old, el) > 0.5) { el.replaces = old.name; rm.replacedBy = el.name; }
      });
    });
  }
  // ordem de empilhamento: começa pelo frame 1 e insere os novos logo acima do vizinho de baixo
  var stack = [];
  framesEls.forEach(function (els) {
    var below = null;
    els.forEach(function (el) {
      var at = stack.indexOf(el.identityId);
      if (at >= 0) { below = el.identityId; return; }
      var pos = below === null ? 0 : stack.indexOf(below) + 1;
      stack.splice(pos, 0, el.identityId);
      below = el.identityId;
    });
  });
  return { identities: identities, order: order, stack: stack, removedByFrame: removedByFrame };
}
function pad2(n) { return (n < 10 ? "0" : "") + n; }

/* ------------------------------------------------------------------ análise completa */
var LAST = null; // última análise (com referências aos nós) pra exportação
async function analyze(opts) {
  opts = opts || {};
  var page = figma.currentPage;
  var expanded = {}; (opts.expanded || []).forEach(function (id) { expanded[id] = true; });
  var raw = detectScenes(page, opts.scope === "selection" ? page.selection : []);
  var scenes = [];
  for (var s = 0; s < raw.length; s++) {
    var sc = raw[s];
    var framesEls = [];
    for (var f = 0; f < sc.frames.length; f++) {
      post({ type: "progress", text: "Analisando " + sc.name + " · frame " + (f + 1) + "/" + sc.frames.length });
      framesEls.push(await extractElements(sc.frames[f], f, expanded));
    }
    var link = linkScene(framesEls);
    scenes.push({
      id: "s" + s, name: sc.name, compName: compNameFor(sc.name, s), source: sc.source,
      frames: sc.frames.map(function (fr, i) { return { id: fr.id, name: fr.name, label: "F" + pad2(i + 1), w: r2(fr.width), h: r2(fr.height) }; }),
      frameEls: framesEls, link: link
    });
  }
  // nomes de comp únicos
  var seen = {};
  scenes.forEach(function (sc) { var n = sc.compName, k = 2; while (seen[n]) n = sc.compName + "_" + (k++); seen[n] = true; sc.compName = n; });
  LAST = { scenes: scenes, expanded: expanded, scope: opts.scope };
  return serialize(scenes);
}
function serialize(scenes) {
  return scenes.map(function (sc) {
    return {
      id: sc.id, name: sc.name, compName: sc.compName, source: sc.source, frames: sc.frames,
      stack: sc.link.stack,
      identities: sc.link.order.map(function (id) {
        var idt = sc.link.identities[id];
        return { id: id, name: idt.name, type: idt.type, firstFrame: idt.firstFrame, minConfidence: idt.minConfidence, ambiguous: idt.ambiguous,
          states: idt.states.map(function (e) { return { frameIndex: e.frameIndex, nodeId: e.nodeId, status: e.status }; }) };
      }),
      frameEls: sc.frameEls.map(function (els, f) {
        return {
          elements: els.map(function (e) { return { nodeId: e.nodeId, name: e.name, type: e.type, path: e.path, identityId: e.identityId, status: e.status, diffs: e.diffs, confidence: e.confidence, ambiguous: !!e.ambiguous, replaces: e.replaces || "", hasChildren: e.hasChildren, tagged: !!e.sig.tag && e.sig.tag.indexOf("x:") !== 0, w: e.w, h: e.h }; }),
          removed: sc.link.removedByFrame[f] || []
        };
      })
    };
  });
}

/* ------------------------------------------------------------------ miniaturas */
var thumbJob = 0;
async function sendThumbs(ids) {
  var job = ++thumbJob;
  for (var i = 0; i < ids.length; i++) {
    if (job !== thumbJob) return;
    try {
      var n = await figma.getNodeByIdAsync(ids[i]);
      if (!n || !("exportAsync" in n)) continue;
      var longSide = Math.max(n.width, n.height) || 1;
      var bytes = await n.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: Math.min(2, 96 / longSide) } });
      post({ type: "thumb", nodeId: ids[i], bytes: bytes });
    } catch (e) {}
  }
}

/* ------------------------------------------------------------------ exportação */
function colorOf(p) { return [r2(p.color.r * 1000) / 1000, r2(p.color.g * 1000) / 1000, r2(p.color.b * 1000) / 1000]; }
function supportedEffects(n) {
  var res = { list: [], unsupported: [] };
  if (!("effects" in n) || !n.effects) return res;
  n.effects.forEach(function (e) {
    if (e.visible === false) return;
    if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") res.list.push({ type: e.type === "DROP_SHADOW" ? "shadow" : "inner", color: [e.color.r, e.color.g, e.color.b], alpha: e.color.a, dx: e.offset.x, dy: e.offset.y, radius: e.radius || 0, spread: e.spread || 0 });
    else if (e.type === "LAYER_BLUR") res.list.push({ type: "blur", radius: e.radius || 0, progressive: e.blurType === "PROGRESSIVE" });
    else if (e.type === "BACKGROUND_BLUR") res.list.push({ type: "bgblur", radius: e.radius || 0 });
    else res.unsupported.push(e.type);
  });
  return res;
}
/* forma usada como recorte do desfoque de fundo (o After desfoca o que está atrás, só dentro dessa forma) */
function bgBlurShape(node) {
  var w = r2(node.width), h = r2(node.height);
  if (node.type === "ELLIPSE" && (!node.arcData || Math.abs(node.arcData.endingAngle - node.arcData.startingAngle - 2 * Math.PI) < 1e-3 && !node.arcData.innerRadius)) return { prim: "ellipse", w: w, h: h };
  if ((node.type === "RECTANGLE" || CONTAINER_TYPES[node.type]) && node.type !== "GROUP" && !isMixed(node.cornerRadius)) return { prim: "rect", w: w, h: h, radius: node.cornerRadius || 0 };
  var g = null; try { g = node.fillGeometry; } catch (e) {}
  if (g && g.length) return { prim: "path", w: w, h: h, fillGeometry: geomList(g) };
  return { prim: "rect", w: w, h: h, radius: 0 };
}
function hasMaskChild(n) { return "children" in n && n.children.some(function (c) { return c.isMask && c.visible !== false; }); }
function effectPad(n, depth) {
  var p = 0;
  if (depth > 8) return 0;
  if ("effects" in n && n.effects) n.effects.forEach(function (e) { if (e.visible !== false && (e.type === "DROP_SHADOW" || e.type === "LAYER_BLUR")) p = Math.max(p, (e.radius || 0) * 1.5 + (e.spread || 0) + (e.offset ? Math.max(Math.abs(e.offset.x), Math.abs(e.offset.y)) : 0)); });
  if ("strokes" in n && visiblePaints(n.strokes).length && !isMixed(n.strokeWeight)) p = Math.max(p, n.strokeWeight || 0);
  if ("children" in n && !(n.clipsContent)) n.children.forEach(function (c) { if (c.visible !== false) p = Math.max(p, effectPad(c, depth + 1)); });
  return Math.min(400, Math.ceil(p));
}

function Exporter(opts) {
  this.opts = opts || {};
  this.files = [];          // { path, bytes }
  this.byHash = {};         // dedupe de imagens
  this.names = {};
  this.warnings = [];
  this.count = 0;
}
function imageExt(bytes) {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return ".jpg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return ".gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return ".webp";
  return ".png";
}
Exporter.prototype.addFile = function (folder, base, bytes) {
  var h = fnvBytes(bytes);
  if (this.byHash[h]) return this.byHash[h];
  var ext = imageExt(bytes);
  var name = safeName(base), p = folder + "/" + name + ext, k = 2;
  while (this.names[p]) p = folder + "/" + name + "_" + (k++) + ext;
  this.names[p] = true;
  this.files.push({ path: "assets/" + p, bytes: bytes });
  this.byHash[h] = "assets/" + p;
  return "assets/" + p;
};
Exporter.prototype.raster = async function (node, containerAbs, base, folder, reason) {
  var rb = node.absoluteRenderBounds || node.absoluteBoundingBox;
  // resolução: a escolhida, mas sem passar de 4096 px no lado maior (fundos de 1920 em 4x viravam 7680 px)
  var longSide = Math.max(rb ? rb.width : node.width, rb ? rb.height : node.height) || 1;
  var scale = Math.max(0.25, Math.min(this.opts.rasterScale || 2, 4096 / longSide));
  scale = Math.round(scale * 1000) / 1000;
  var bytes = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: scale } });
  var abs = { a: 1, b: 0, c: 0, d: 1, tx: rb.x, ty: rb.y };
  base.kind = "raster";
  base.file = this.addFile(folder, node.name, bytes);
  base.scale = scale;
  base.xf = roundXf(relXf(containerAbs, abs));
  base.w = r2(rb.width); base.h = r2(rb.height);
  base.effects = []; // já estão no PNG
  base.reason = reason;
  return base;
};
/* contêiner "neutro": não muda a aparência dos filhos (sem opacidade, blend, efeito, máscara nem recorte)
   → vira um Null no AE com os filhos parentados, em vez de precomp (bem mais rápido e mais fácil de animar) */
function neutralContainer(n) {
  if (!CONTAINER_TYPES[n.type] || !("children" in n)) return false;
  if ("opacity" in n && n.opacity < 0.999) return false;
  if ("blendMode" in n && n.blendMode !== "PASS_THROUGH" && n.blendMode !== "NORMAL") return false;
  if ("effects" in n && n.effects && n.effects.some(function (e) { return e.visible !== false; })) return false;
  if (hasMaskChild(n)) return false;
  if (n.type !== "GROUP" && n.clipsContent) return false;
  return true;
}
function solidList(arr) { return arr.map(function (p) { return { color: colorOf(p), alpha: p.opacity === undefined ? 1 : p.opacity }; }); }
function geomList(g) { return (g || []).map(function (x) { return { data: x.data, rule: x.windingRule }; }); }

/* contorno nativo do AE (Stroke de verdade, editável: espessura, pontas, junções, tracejado, dentro/fora) */
var CAPS = { NONE: "butt", ROUND: "round", SQUARE: "square" }, JOINS = { MITER: "miter", ROUND: "round", BEVEL: "bevel" };
function strokeCenterline(node, prim) {
  if (prim === "rect" || prim === "ellipse") return null; // o próprio primitivo é a linha central
  var g = [];
  try {
    if (node.type === "LINE") g = [{ data: "M 0 0 L " + r2(node.width) + " 0", windingRule: "NONE" }];
    else if (node.type === "VECTOR" && node.vectorPaths && node.vectorPaths.length) g = node.vectorPaths;
    else g = node.fillGeometry || [];
  } catch (e) { g = []; }
  return g.length ? geomList(g) : [];
}
function nativeStrokeSpec(node, vs, sw, prim) {
  if (!vs.every(function (p) { return p.type === "SOLID"; })) return null;
  var cap = isMixed(node.strokeCap) ? "NONE" : (node.strokeCap || "NONE"), join = isMixed(node.strokeJoin) ? "MITER" : (node.strokeJoin || "MITER");
  if (!CAPS[cap]) return null; // setas/triângulos/círculos nas pontas
  if (["strokeTopWeight", "strokeRightWeight", "strokeBottomWeight", "strokeLeftWeight"].some(function (k) { return k in node && typeof node[k] === "number" && Math.abs(node[k] - sw) > 0.01; })) return null;
  var paths = strokeCenterline(node, prim);
  if (paths && !paths.length) return null;
  var closed = !paths || paths.every(function (g) { return /z\s*$/i.test(g.data.trim()); });
  var align = node.type === "LINE" || !closed ? "CENTER" : (node.strokeAlign || "CENTER");
  var dash = node.dashPattern && node.dashPattern.length ? node.dashPattern.slice(0, 6).map(r2) : null;
  return {
    paths: paths,
    strokes: vs.slice().reverse().map(function (p) { // de cima pra baixo
      return { color: colorOf(p), alpha: p.opacity === undefined ? 1 : p.opacity, width: r2(sw), align: align, cap: CAPS[cap], join: JOINS[join] || "miter", miter: r2(node.strokeMiterLimit || 4), dash: dash };
    })
  };
}
/* aparência própria (preenchimentos + contornos) de uma forma ou do fundo de um frame */
Exporter.prototype.paintSpec = async function (node, base, containerAbs, isFrameBg, part) {
  var vf = part === "stroke" ? [] : visiblePaints(node.fills), vs = part === "fill" ? [] : visiblePaints(node.strokes);
  var sw = isMixed(node.strokeWeight) ? null : node.strokeWeight;
  if (isFrameBg && !vf.length && !(vs.length && sw)) return null;
  var onlySolid = vf.every(function (p) { return p.type === "SOLID"; }) && vs.every(function (p) { return p.type === "SOLID"; });
  var singleImage = !isFrameBg && vf.length === 1 && vf[0].type === "IMAGE" && !vs.length;
  if (singleImage) {
    var scale = 2;
    try { var img = figma.getImageByHash(vf[0].imageHash); var sz = await img.getSizeAsync(); scale = Math.max(1, Math.min(4, sz.width / Math.max(1, node.width))); } catch (e) {}
    var bytes = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: scale } });
    var rb = node.absoluteRenderBounds || node.absoluteBoundingBox;
    base.kind = "image"; base.file = this.addFile("IMAGES", node.name, bytes); base.scale = r2(scale);
    base.xf = roundXf(relXf(containerAbs, { a: 1, b: 0, c: 0, d: 1, tx: rb.x, ty: rb.y })); base.w = r2(rb.width); base.h = r2(rb.height);
    return base;
  }
  if (!onlySolid && vs.every(function (p) { return p.type === "SOLID"; })) {
    // preenchimentos com gradiente/imagem: recria no AE camada por camada (Gradient Ramp, imagem original, máscaras)
    return this.paintStack(node, base, containerAbs, vf, vs, sw, isFrameBg);
  }
  if (!onlySolid) {
    if (!isFrameBg) return this.raster(node, containerAbs, base, "VECTORS", "contorno com gradiente/imagem");
    // fundo de frame com gradiente/imagem: exporta só o fundo (um clone sem os filhos)
    // o Figma cria o clone direto na página (fora do frame), então a posição vem do ORIGINAL
    var clone = node.clone();
    try {
      if ("effects" in clone) clone.effects = [];
      if (part === "fill") clone.strokes = [];
      if (part === "stroke") clone.fills = [];
      if ("children" in clone) clone.children.slice().forEach(function (c) { c.remove(); });
      var cAbs = m2o(clone.absoluteTransform), oAbs = m2o(node.absoluteTransform);
      var spec = await this.raster(clone, containerAbs, base, "IMAGES", "fundo com gradiente/imagem");
      var crb = clone.absoluteRenderBounds || clone.absoluteBoundingBox || { x: cAbs.tx, y: cAbs.ty };
      spec.xf = roundXf(relXf(containerAbs, { a: 1, b: 0, c: 0, d: 1, tx: oAbs.tx + (crb.x - cAbs.tx), ty: oAbs.ty + (crb.y - cAbs.ty) }));
      return spec;
    } finally { clone.remove(); }
  }
  base.kind = "shape";
  base.fills = solidList(vf);
  var dashed = node.dashPattern && node.dashPattern.length;
  var uniformRadius = !("cornerRadius" in node) || !isMixed(node.cornerRadius);
  var ellipseFull = node.type !== "ELLIPSE" || !node.arcData || (Math.abs(node.arcData.endingAngle - node.arcData.startingAngle - 2 * Math.PI) < 1e-3 && !node.arcData.innerRadius);
  var nativeStroke = vs.length === 1 && sw !== null && node.strokeAlign === "CENTER" && !dashed;
  var rectLike = node.type === "RECTANGLE" || isFrameBg;
  if ((rectLike && uniformRadius) || (node.type === "ELLIPSE" && ellipseFull)) {
    base.prim = node.type === "ELLIPSE" ? "ellipse" : "rect";
    base.radius = base.prim === "rect" ? (node.cornerRadius || 0) : 0;
  } else {
    base.prim = "path";
    base.fillGeometry = vf.length ? geomList(node.fillGeometry) : [];
  }
  base.strokes = [];
  if (vs.length && sw) {
    var ns = nativeStrokeSpec(node, vs, sw, base.prim);
    if (ns) { base.strokes = ns.strokes; if (ns.paths) base.strokePaths = ns.paths; }
    else {
      // sem equivalente nativo (pontas com seta, espessura diferente por lado…): contorno vira forma preenchida
      base.strokeGeometry = geomList(node.strokeGeometry);
      base.strokeFill = { color: colorOf(vs[vs.length - 1]), alpha: vs[vs.length - 1].opacity === undefined ? 1 : vs[vs.length - 1].opacity };
      if (base.prim !== "path") { base.prim = "path"; base.fillGeometry = vf.length ? geomList(node.fillGeometry) : []; }
      base.notes.push("contorno sem equivalente nativo virou forma preenchida");
    }
  }
  return base;
};
/* pilha de preenchimentos (de baixo pra cima, como no Figma) pra recriar no AE com recursos nativos */
function gradHandles(p, w, h) {
  var T = m2o(p.gradientTransform), I = inv(T);
  function pt(x, y) { var q = apply(I, x, y); return [r2(q.x * w), r2(q.y * h)]; }
  return { start: pt(0, 0.5), end: pt(1, 0.5), center: pt(0.5, 0.5), rx: pt(1, 0.5), ry: pt(0.5, 1) };
}
Exporter.prototype.paintRaster = async function (node, paint, label) {
  // um preenchimento sozinho como imagem (só pro que não tem equivalente nativo: gradiente angular/diamante)
  var clone = node.clone();
  try {
    clone.fills = [paint];
    if ("strokes" in clone) clone.strokes = [];
    if ("effects" in clone) clone.effects = [];
    if ("children" in clone) clone.children.slice().forEach(function (c) { c.remove(); });
    if ("opacity" in clone) clone.opacity = 1;
    var sc = Math.max(0.25, Math.min(this.opts.rasterScale || 2, 4096 / (Math.max(node.width, node.height) || 1)));
    var bytes = await clone.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: sc } });
    return { file: this.addFile("IMAGES", label, bytes), scale: r2(sc) };
  } finally { clone.remove(); }
};
Exporter.prototype.paintStack = async function (node, base, containerAbs, vf, vs, sw, isFrameBg) {
  var w = node.width, h = node.height;
  base.kind = "paintstack";
  base.paints = [];
  for (var i = 0; i < vf.length; i++) {
    var p = vf[i], pa = { alpha: p.opacity === undefined ? 1 : p.opacity, blend: p.blendMode || "NORMAL" };
    if (p.type === "SOLID") { pa.type = "solid"; pa.color = colorOf(p); }
    else if (p.type === "GRADIENT_LINEAR" || p.type === "GRADIENT_RADIAL") {
      pa.type = p.type === "GRADIENT_LINEAR" ? "linear" : "radial";
      pa.handles = gradHandles(p, w, h);
      pa.stops = (p.gradientStops || []).map(function (st) { return { pos: r2(st.position * 1000) / 1000, color: [r2(st.color.r * 1000) / 1000, r2(st.color.g * 1000) / 1000, r2(st.color.b * 1000) / 1000], alpha: r2(st.color.a * 1000) / 1000 }; });
      if (pa.type === "radial") {
        // a rampa radial do AE sempre começa no centro: cada anel [a,b] vira uma rampa centro→b com a cor do centro extrapolada
        var rs = pa.stops.slice();
        if (rs.length && rs[0].pos > 0) rs.unshift({ pos: 0, color: rs[0].color, alpha: rs[0].alpha });
        var rings = [], ok = true;
        for (var q = 0; q < rs.length - 1; q++) {
          var A = rs[q], B = rs[q + 1], k = B.pos - A.pos < 1e-4 ? 0 : A.pos / (B.pos - A.pos);
          var cc = [0, 1, 2].map(function (j) { return A.color[j] + (A.color[j] - B.color[j]) * k; }), ca = A.alpha + (A.alpha - B.alpha) * k;
          if (cc.some(function (v) { return v < -0.004 || v > 1.004; }) || ca < -0.004 || ca > 1.004) ok = false;
          rings.push({ r0: A.pos, r1: Math.max(B.pos, A.pos + 0.0005), c0: cc.map(function (v) { return Math.min(1, Math.max(0, v)); }), c1: B.color, a0: Math.min(1, Math.max(0, ca)), a1: B.alpha });
        }
        if (!ok) {
          var rr0 = await this.paintRaster(node, p, node.name + " gradiente radial");
          pa.type = "image"; pa.mode = "RASTER"; pa.file = rr0.file; pa.scale = rr0.scale; delete pa.stops; delete pa.handles;
          base.notes.push("gradiente radial com combinação de cores sem equivalente direto no AE: virou imagem (só esse preenchimento)");
        } else pa.rings = rings;
      }
    } else if (p.type === "IMAGE") {
      pa.type = "image";
      try {
        var img = figma.getImageByHash(p.imageHash);
        var bytes = await img.getBytesAsync(), sz = await img.getSizeAsync();
        pa.file = this.addFile("IMAGES", node.name + " textura", bytes); pa.iw = sz.width; pa.ih = sz.height;
      } catch (e) { var rr = await this.paintRaster(node, p, node.name + " imagem"); pa.file = rr.file; pa.mode = "RASTER"; pa.scale = rr.scale; }
      pa.mode = pa.mode || p.scaleMode || "FILL";
      pa.scalingFactor = p.scalingFactor || 1;
      pa.rotation = p.rotation || 0;
      if (p.imageTransform) pa.imageTransform = m2o(p.imageTransform);
      var f = p.filters || {};
      if (Object.keys(f).some(function (k) { return f[k]; })) base.notes.push("ajustes de imagem do Figma (exposição, contraste…) não foram aplicados");
    } else {
      // gradiente angular/diamante: sem equivalente direto, vira imagem só desse preenchimento
      var r = await this.paintRaster(node, p, node.name + " " + String(p.type).toLowerCase());
      pa.type = "image"; pa.mode = "RASTER"; pa.file = r.file; pa.scale = r.scale;
      base.notes.push(p.type + " virou imagem (só esse preenchimento)");
    }
    base.paints.push(pa);
  }
  var uniformRadius = !("cornerRadius" in node) || !isMixed(node.cornerRadius);
  var ellipseFull = node.type !== "ELLIPSE" || !node.arcData || (Math.abs(node.arcData.endingAngle - node.arcData.startingAngle - 2 * Math.PI) < 1e-3 && !node.arcData.innerRadius);
  if ((node.type === "RECTANGLE" || isFrameBg) && uniformRadius) { base.prim = "rect"; base.radius = node.cornerRadius || 0; }
  else if (node.type === "ELLIPSE" && ellipseFull) base.prim = "ellipse";
  else { base.prim = "path"; base.fillGeometry = geomList(node.fillGeometry); }
  if (vs.length && sw) {
    var ns = nativeStrokeSpec(node, vs, sw, base.prim);
    if (ns) { base.strokes = ns.strokes; if (ns.paths) base.strokePaths = ns.paths; }
    else {
      base.strokeGeometry = geomList(node.strokeGeometry);
      base.strokeFill = { color: colorOf(vs[vs.length - 1]), alpha: vs[vs.length - 1].opacity === undefined ? 1 : vs[vs.length - 1].opacity };
    }
    base.pad = Math.ceil(sw * 2);
  }
  return base;
};
Exporter.prototype.baseOf = function (node, containerAbs, fx) {
  return {
    name: node.name, figmaType: node.type, figmaId: node.id,
    xf: roundXf(relXf(containerAbs, m2o(node.absoluteTransform))), w: r2(node.width), h: r2(node.height),
    opacity: "opacity" in node ? r2(node.opacity) : 1, blend: "blendMode" in node ? node.blendMode : "NORMAL",
    effects: fx ? fx.list : [], notes: []
  };
};
/* fundo de um frame/instância (camada de baixo) e contorno (o Figma desenha o contorno do frame por cima do conteúdo) */
Exporter.prototype.frameBg = async function (node, containerAbs, part) {
  if (node.type === "GROUP" || !("fills" in node)) return null;
  var b = this.baseOf(node, containerAbs, null);
  b.name = node.name + (part === "stroke" ? " · contorno" : " · fundo"); b.opacity = 1; b.blend = "NORMAL";
  return this.paintSpec(node, b, containerAbs, true, part);
};
var HEAVY_PATHS = 250, HEAVY_CHARS = 60000;
function vectorComplexity(node) {
  var paths = 0, chars = 0;
  ["fillGeometry", "strokeGeometry"].forEach(function (k) {
    var g; try { g = node[k]; } catch (e) { g = null; }
    (g || []).forEach(function (x) { var d = x.data || ""; chars += d.length; var m = d.match(/[Mm]/g); paths += m ? m.length : 0; });
  });
  return { paths: paths, chars: chars };
}
Exporter.prototype.spec = async function (node, containerAbs, depth) {
  this.count++;
  if (this.count % 10 === 0) post({ type: "progress", text: "Exportando… " + this.count + " camadas" });
  var abs = m2o(node.absoluteTransform);
  var fx = supportedEffects(node);
  var base = this.baseOf(node, containerAbs, fx);
  if (fx.unsupported.length && !CONTAINER_TYPES[node.type]) return this.raster(node, containerAbs, base, SHAPE_TYPES[node.type] ? "VECTORS" : "OTHER", "efeito sem equivalente nativo: " + fx.unsupported.join(", "));
  if (fx.unsupported.length) base.notes.push("efeitos ignorados: " + fx.unsupported.join(", "));
  if (fx.list.some(function (e) { return e.type === "bgblur"; })) base.bgShape = bgBlurShape(node);

  if (node.type === "TEXT") return this.textSpec(node, base, containerAbs);

  if (CONTAINER_TYPES[node.type] && "children" in node) {
    if (depth > 10) return this.raster(node, containerAbs, base, "OTHER", "aninhamento muito profundo");
    var kids = node.children.filter(function (c) { return c.visible !== false; });
    var i, bg;
    if (neutralContainer(node)) {
      // Null + filhos posicionados direto no comp de cima
      base.kind = "group";
      base.children = [];
      bg = await this.frameBg(node, containerAbs, "fill");
      if (bg) base.children.push(bg);
      for (i = 0; i < kids.length; i++) base.children.push(await this.spec(kids[i], containerAbs, depth + 1));
      bg = await this.frameBg(node, containerAbs, "stroke");
      if (bg) base.children.push(bg);
      return base;
    }
    base.kind = "precomp";
    base.pad = node.clipsContent ? 0 : effectPad(node, 0);
    base.clipRadius = node.type !== "GROUP" && node.clipsContent && !isMixed(node.cornerRadius) ? (node.cornerRadius || 0) : 0;
    base.children = [];
    bg = await this.frameBg(node, abs, "fill");
    if (bg) base.children.push(bg);
    var specs = await this.childSpecs(kids, abs, depth + 1, base.w, base.h, node.type !== "GROUP" && node.clipsContent ? 0 : effectPad(node, 0));
    for (i = 0; i < specs.length; i++) base.children.push(specs[i]);
    bg = await this.frameBg(node, abs, "stroke");
    if (bg) base.children.push(bg);
    return base;
  }

  if (SHAPE_TYPES[node.type]) {
    // vetores com centenas de sub-formas (campos de pontos, retratos pontilhados) deixam o After lento
    // pra montar e pra renderizar; viram imagem em alta (opção "Vetores pesados viram imagem")
    if (this.opts.heavyRaster !== false) {
      var cx = vectorComplexity(node);
      if (cx.paths > HEAVY_PATHS || cx.chars > HEAVY_CHARS) return this.raster(node, containerAbs, base, "VECTORS", "vetor pesado (" + cx.paths + " sub-formas) virou imagem — desmarque “Vetores pesados viram imagem” pra manter editável");
    }
    return this.paintSpec(node, base, containerAbs, false);
  }
  return this.raster(node, containerAbs, base, "OTHER", "tipo " + node.type + " sem equivalente nativo");
};
/* filhos de um contêiner, respeitando as máscaras do Figma: a camada com "Use as mask" recorta todas as irmãs
   acima dela (até a próxima máscara) → no After vira um precomp com as camadas recortadas + a máscara como
   track matte de alfa/luminância (tudo editável, nada vira PNG). onEach(spec, node) é chamado pra cada filho. */
Exporter.prototype.childSpecs = async function (kids, abs, depth, w, h, pad, onEach) {
  var out = [], run = null;
  for (var i = 0; i < kids.length; i++) {
    var kd = kids[i];
    if (kd.isMask) {
      var ms = await this.spec(kd, abs, depth);
      if (kd.maskType === "VECTOR") { ms.opacity = 1; (ms.fills || []).forEach(function (f) { f.alpha = 1; }); }
      run = { kind: "precomp", name: kd.name + " · mascarado", figmaType: "MASK", xf: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
        w: r2(w), h: r2(h), pad: pad || 0, opacity: 1, blend: "NORMAL", effects: [], notes: [], children: [],
        matte: { spec: ms, type: kd.maskType === "LUMINANCE" ? "LUMA" : "ALPHA" } };
      out.push(run);
      continue;
    }
    var ks = await this.spec(kd, abs, depth);
    if (onEach) onEach(ks, kd);
    if (run) run.children.push(ks); else out.push(ks);
  }
  return out;
};
Exporter.prototype.textSpec = async function (node, base, containerAbs) {
  var segs = [];
  try { segs = node.getStyledTextSegments(["fontName", "fontSize", "fills", "letterSpacing", "lineHeight", "textCase", "textDecoration"]); } catch (e) {}
  var s0 = segs[0] || { fontName: node.fontName, fontSize: node.fontSize, fills: node.fills, letterSpacing: node.letterSpacing, lineHeight: node.lineHeight, textCase: node.textCase };
  var fills = visiblePaints(s0.fills);
  if (fills.length && fills[0].type !== "SOLID") return this.raster(node, containerAbs, base, "OTHER", "texto com gradiente/imagem");
  base.kind = "text";
  base.text = node.characters;
  // posição real da tinta das letras dentro da caixa (pra alinhar no AE com precisão em qualquer fonte)
  try {
    var rbx = node.absoluteRenderBounds, at = node.absoluteTransform;
    if (rbx && Math.abs(at[0][1]) < 1e-6 && Math.abs(at[1][0]) < 1e-6 && at[0][0] > 0 && at[1][1] > 0) base.ink = { x: r2(rbx.x - at[0][2]), y: r2(rbx.y - at[1][2]), w: r2(rbx.width), h: r2(rbx.height) };
  } catch (e) {}
  base.font = { family: s0.fontName.family, style: s0.fontName.style };
  base.size = s0.fontSize;
  base.color = fills.length ? colorOf(fills[0]) : [0, 0, 0];
  base.colorAlpha = fills.length ? (fills[0].opacity === undefined ? 1 : fills[0].opacity) : 0;
  var ls = s0.letterSpacing || { unit: "PIXELS", value: 0 };
  base.tracking = ls.unit === "PERCENT" ? ls.value * 10 : (ls.value / (s0.fontSize || 1)) * 1000;
  var lh = s0.lineHeight || { unit: "AUTO" };
  base.leading = lh.unit === "PIXELS" ? lh.value : lh.unit === "PERCENT" ? s0.fontSize * lh.value / 100 : null;
  // altura de linha automática: quando a caixa abraça o texto, altura = nº de linhas × altura de linha (exato pra qualquer fonte)
  if (base.leading === null && s0.fontSize) {
    var hugs = node.textAutoResize === "HEIGHT" || node.textAutoResize === "WIDTH_AND_HEIGHT";
    var nLines = Math.max(1, Math.round(node.height / (s0.fontSize * 1.21)));
    base.leadingAuto = hugs ? r2(node.height / nLines) : r2(s0.fontSize * 1.21);
  }
  base.align = node.textAlignHorizontal || "LEFT";
  base.valign = node.textAlignVertical || "TOP";
  base.autoResize = node.textAutoResize || "NONE";
  base.caps = s0.textCase === "UPPER" ? "upper" : s0.textCase === "LOWER" ? "lower" : s0.textCase === "TITLE" ? "title" : "";
  var distinct = {};
  segs.forEach(function (s) { distinct[JSON.stringify([s.fontName, s.fontSize, visiblePaints(s.fills).map(paintSig)])] = 1; });
  if (Object.keys(distinct).length > 1) {
    base.notes.push("texto com estilos mistos: usei o estilo do primeiro trecho");
    base.runs = segs.map(function (s) { var f = visiblePaints(s.fills)[0]; return { start: s.start, end: s.end, family: s.fontName.family, style: s.fontName.style, size: s.fontSize, color: f && f.type === "SOLID" ? colorOf(f) : null }; });
  }
  return base;
};

/* ------------------------------------------------------------------ seleção → composições
   Regras:
   • frame do storyboard selecionado → 1 comp idêntico ao frame
   • cena selecionada (frame/grupo com os frames dentro, ou Section) → 1 comp por frame
   • objetos soltos dentro de um frame → 1 comp do tamanho do frame só com eles
   • objetos fora de qualquer frame → 1 comp do tamanho da seleção                        */
function isBoardParent(p) { return !p || p.type === "PAGE" || p.type === "SECTION"; }
function containerKidsOf(n) { return (isFrameLike(n) || n.type === "GROUP") ? sceneContainerFrames(n, 1) : null; }
/* frames de dentro de um contêiner, abrindo contêineres aninhados (ex.: "Loop option 2" com 6 frames empilhados dentro da cena) */
function medianWH(list) {
  var ws = list.map(function (f) { return f.width; }).sort(function (a, b) { return a - b; }), hs = list.map(function (f) { return f.height; }).sort(function (a, b) { return a - b; });
  return { w: ws[Math.floor(ws.length / 2)] || 0, h: hs[Math.floor(hs.length / 2)] || 0 };
}
function flatKids(container) {
  var out = [], kids = containerKidsOf(container) || [], ref = medianWH(kids);
  kids.forEach(function (k) {
    var inner = containerKidsOf(k);
    // só abre o frame de dentro se os sub-frames dele forem do tamanho dos frames do storyboard (não cards/mockups)
    var mi = inner ? medianWH(inner) : null;
    var nested = inner && Math.abs(mi.w - ref.w) <= ref.w * 0.15 && Math.abs(mi.h - ref.h) <= ref.h * 0.15 && (k.width > ref.w * 1.3 || k.height > ref.h * 1.3);
    if (nested) out = out.concat(flatKids(k)); else out.push({ f: k, parent: container });
  });
  return out;
}
function containerChain(p) { return !!p && !!containerKidsOf(p) && (isBoardParent(p.parent) || containerChain(p.parent)); }
function isStoryFrame(n) {
  if (!isFrameLike(n)) return false;
  var p = n.parent;
  if (isBoardParent(p)) return !containerKidsOf(n);
  if (!containerChain(p)) return false;
  return flatKids(p).some(function (x) { return x.f === n; });
}
function storyFrameOf(n) { var p = n.parent; while (p && p.type !== "PAGE") { if (isStoryFrame(p)) return p; p = p.parent; } return null; }
function framesInside(n) {
  // devolve [{ f: frame, parent: contêiner imediato }]
  if (containerKidsOf(n)) return flatKids(n);
  if (n.type === "SECTION") {
    var out = [];
    n.children.filter(function (c) { return c.visible !== false; }).sort(byPos).forEach(function (c) {
      if (c.type === "SECTION" || containerKidsOf(c)) out = out.concat(framesInside(c) || []);
      else if (isFrameLike(c)) out.push({ f: c, parent: n });
    });
    return out;
  }
  return null;
}
function zPath(n) { var path = []; while (n && n.parent) { path.unshift(n.parent.children.indexOf(n)); n = n.parent; if (n.type === "PAGE") break; } return path; }
function zCompare(a, b) { var pa = zPath(a), pb = zPath(b); for (var i = 0; i < Math.min(pa.length, pb.length); i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]; return pa.length - pb.length; }

function resolveTargets(selection, whole) {
  // whole: ids de contêineres que o usuário quer juntar numa comp só, com os frames em sequência no tempo
  whole = whole || {};
  RESOLVE_WHOLE = whole;
  var targets = [], byFrame = {}, loose = [];
  function addFrame(f, container) {
    if (byFrame[f.id]) { byFrame[f.id].nodes = null; return; }
    // juntar vale também pros frames de contêineres aninhados (ex.: "Loop option 2" dentro de "Side to side")
    for (var w = container; w && !isBoardParent(w); w = w.parent) if (whole[w.id]) { container = w; break; }
    var t = { frame: f, nodes: null, group: container ? container.name : "", container: container || null, seq: container && whole[container.id] ? container.id : "" };
    byFrame[f.id] = t; targets.push(t);
  }
  selection.forEach(function (n) {
    if (n.visible === false) return;
    var inside = framesInside(n);
    if (inside && inside.length) { inside.forEach(function (x) { addFrame(x.f, x.parent); }); return; }
    if (isStoryFrame(n)) { addFrame(n, isBoardParent(n.parent) ? null : n.parent); return; }
    var sf = storyFrameOf(n);
    if (sf) {
      var t = byFrame[sf.id];
      if (!t) { t = { frame: sf, nodes: [], group: isBoardParent(sf.parent) ? "" : sf.parent.name, container: isBoardParent(sf.parent) ? null : sf.parent, seq: "" }; byFrame[sf.id] = t; targets.push(t); }
      if (t.nodes && t.nodes.indexOf(n) < 0) t.nodes.push(n);
      return;
    }
    loose.push(n);
  });
  // objeto selecionado junto com o próprio frame inteiro: o frame inteiro vence; e tira filhos de algo já selecionado
  targets.forEach(function (t) {
    if (!t.nodes) return;
    t.nodes = t.nodes.filter(function (n) { var p = n.parent; while (p && p !== t.frame) { if (t.nodes.indexOf(p) >= 0) return false; p = p.parent; } return true; });
    t.nodes.sort(zCompare);
  });
  if (loose.length) { loose.sort(zCompare); targets.push({ frame: null, nodes: loose, group: "" }); }
  return targets;
}
function cleanCompName(s) { return (safeName(s).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "FRAME").slice(0, 26); }
var SCENE_CACHE = null;
function sceneIndex() {
  // mapa frameId → { scene, index } com as cenas da página (pra nome do comp e continuidade)
  if (SCENE_CACHE && SCENE_CACHE.page === figma.currentPage.id && Date.now() - SCENE_CACHE.t < 15000) return SCENE_CACHE.map;
  var map = {};
  try {
    detectScenes(figma.currentPage, []).forEach(function (sc, i) {
      var cn = compNameFor(sc.name, i);
      sc.frames.forEach(function (f, k) { map[f.id] = { scene: sc, compName: cn, index: k }; });
    });
  } catch (e) {}
  SCENE_CACHE = { page: figma.currentPage.id, t: Date.now(), map: map };
  return map;
}
var RESOLVE_WHOLE = {};
function describeTargets(targets) {
  var idx = sceneIndex(), used = {};
  return targets.map(function (t) {
    var name, info = t.frame ? idx[t.frame.id] : null;
    if (t.frame) name = info && info.scene.frames.length > 1 ? info.compName + "_F" + pad2(info.index + 1) : (info ? info.compName : cleanCompName(t.frame.name));
    else name = "SELECAO";
    if (t.nodes) name += "_PARCIAL";
    var base = name, k = 2; while (used[name]) name = base + "_" + (k++); used[name] = true;
    var box = t.frame ? { w: t.frame.width, h: t.frame.height } : null;
    if (!box) {
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      t.nodes.forEach(function (n) { var b = n.absoluteRenderBounds || n.absoluteBoundingBox; if (!b) return; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); });
      box = { w: x1 - x0, h: y1 - y0, x: x0, y: y0 };
    }
    t.compName = name; t.box = box; t.info = info;
    var group = t.container && t.container.parent && !isBoardParent(t.container.parent) ? cleanCompName(t.container.name) : (info ? info.compName : (t.container ? cleanCompName(t.container.name) : ""));
    // frames agrupados só pelo nome da cena (sem frame-contêiner): juntar pela chave do grupo
    if (!t.seq && t.frame && !t.nodes && group && RESOLVE_WHOLE["g:" + group]) t.seq = "g:" + group;
    return {
      key: t.frame ? t.frame.id : "loose", containerId: t.container ? t.container.id : "", containerName: t.container ? t.container.name : "", whole: !!t.seq, seq: t.seq || "",
      compName: name, frameName: t.frame ? t.frame.name : "objetos fora de frame", frameId: t.frame ? t.frame.id : (t.nodes[0] && t.nodes[0].id),
      group: group,
      sceneName: info ? info.scene.name : t.group,
      mode: t.nodes ? "objetos" : "frame", count: t.nodes ? t.nodes.length : t.frame.children.filter(function (c) { return c.visible !== false; }).length,
      w: Math.round(box.w), h: Math.round(box.h)
    };
  });
}

/* continuidade: status de cada elemento do frame em relação ao frame anterior da mesma cena */
var LINK_CACHE = {};
async function continuityFor(info) {
  if (!info || info.scene.frames.length < 2) return null;
  var key = info.scene.frames.map(function (f) { return f.id; }).join(",");
  if (!LINK_CACHE[key]) {
    var framesEls = [];
    for (var f = 0; f < info.scene.frames.length; f++) {
      post({ type: "progress", text: "Lendo continuidade da " + info.scene.name + " · frame " + (f + 1) + "/" + info.scene.frames.length });
      framesEls.push(await extractElements(info.scene.frames[f], f, {}));
    }
    var link = linkScene(framesEls), byNode = {};
    framesEls.forEach(function (els) { els.forEach(function (e) {
      var idt = link.identities[e.identityId];
      byNode[e.nodeId] = { status: e.status, diffs: e.diffs || [], confidence: e.confidence, presence: idt.states.map(function (s) { return "F" + pad2(s.frameIndex + 1); }), identity: e.identityId };
    }); });
    LINK_CACHE[key] = byNode;
  }
  return LINK_CACHE[key];
}

async function exportFrames(req) {
  var opts = req.options || {};
  var ex = new Exporter(opts);
  var wholeMap = {}; (req.whole || []).forEach(function (id) { wholeMap[id] = true; });
  var targets = resolveTargets(figma.currentPage.selection, wholeMap);
  var desc = describeTargets(targets);
  if (req.include) {
    // só os frames marcados na lista do plugin
    var inc = {}; req.include.forEach(function (k) { inc[k] = true; });
    var keep = targets.map(function (t, i) { return inc[desc[i].key] ? i : -1; }).filter(function (i) { return i >= 0; });
    targets = keep.map(function (i) { return targets[i]; }); desc = keep.map(function (i) { return desc[i]; });
  }
  if (!targets.length) throw new Error(req.include ? "Nenhum frame marcado na lista." : "Selecione no Figma o que quer importar: frames, uma cena inteira ou objetos dentro de um frame.");
  var pkg = { format: "figma2ae", version: 2, created: new Date().toISOString(), file: figma.root.name, page: figma.currentPage.name, options: opts, comps: [] };
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i], d = desc[i];
    post({ type: "progress", text: "Exportando " + d.compName + " (" + (i + 1) + "/" + targets.length + ")…" });
    var frameAbs = t.frame ? m2o(t.frame.absoluteTransform) : { a: 1, b: 0, c: 0, d: 1, tx: t.box.x, ty: t.box.y };
    var out = { compName: d.compName, group: d.group, frameName: d.frameName, sceneName: d.sceneName || "",
      sceneKey: t.info ? fnv(t.info.scene.frames.map(function (f) { return f.id; }).join(",")) : "", frameIndex: t.info ? t.info.index : -1, figmaId: t.frame ? t.frame.id : "", width: Math.max(4, Math.round(t.box.w)), height: Math.max(4, Math.round(t.box.h)), bg: null, layers: [], ref: null, partial: !!t.nodes };
    var cont = null;
    if (opts.continuity !== false && t.frame) { try { cont = await continuityFor(t.info); } catch (e) { cont = null; } }
    if (t.frame) {
      // fundo do frame (+ contorno por cima no fim)
      if (opts.includeBg !== false) {
        var vf = visiblePaints(t.frame.fills);
        if (vf.length && vf.every(function (p) { return p.type === "SOLID"; }) && vf.length === 1 && (vf[0].opacity === undefined || vf[0].opacity >= 0.999)) out.bg = { kind: "solid", color: colorOf(vf[0]), alpha: 1 };
        else { var bgs = await ex.frameBg(t.frame, frameAbs, "fill"); if (bgs) out.layers.push(bgs); }
      }
    }
    var nodes = t.nodes || t.frame.children.filter(function (c) { return c.visible !== false; });
    var top = await ex.childSpecs(nodes, frameAbs, 0, t.frame ? t.frame.width : 0, t.frame ? t.frame.height : 0, 0, function (spec, nd) {
      var c = cont && cont[nd.id];
      if (c) spec.identity = { id: c.identity, presence: c.presence, state: "F" + pad2(t.info.index + 1), status: c.status, diffs: c.diffs, confidence: c.confidence };
    });
    for (var k = 0; k < top.length; k++) out.layers.push(top[k]);
    if (t.frame && opts.includeBg !== false) { var st = await ex.frameBg(t.frame, frameAbs, "stroke"); if (st) out.layers.push(st); }
    // referência do Figma (camada-guia no AE pra conferir o design)
    if (opts.reference !== false && t.frame) {
      var longSide = Math.max(t.frame.width, t.frame.height) || 1, sc = Math.min(1, 4096 / longSide);
      var bytes = await t.frame.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: sc } });
      ex.files.push({ path: "assets/REF/" + safeName(d.compName) + ".png", bytes: bytes });
      out.ref = { file: "assets/REF/" + safeName(d.compName) + ".png", scale: sc };
    }
    pkg.comps.push(out);
  }
  // grupos marcados pra virar UMA comp com os frames em sequência no tempo
  var seqs = {}, order = [];
  desc.forEach(function (d, i) { if (!d.seq) return; if (!seqs[d.seq]) { seqs[d.seq] = { name: d.group || cleanCompName(d.containerName), keys: [], comps: [] }; order.push(d.seq); } seqs[d.seq].keys.push(d.key); seqs[d.seq].comps.push(i); });
  if (order.length) pkg.sequences = order.map(function (k) { return seqs[k]; });
  return { manifest: JSON.stringify(pkg), files: ex.files, count: ex.count, comps: desc.length };
}

/* resumo da seleção pra interface */
var selJob = 0, WHOLE = {};
function sendSelection() {
  var job = ++selJob;
  setTimeout(function () {
    if (job !== selJob) return;
    try {
      var targets = resolveTargets(figma.currentPage.selection, WHOLE);
      var desc = describeTargets(targets);
      post({ type: "selection", count: figma.currentPage.selection.length, targets: desc });
      sendThumbs(desc.map(function (d) { return d.frameId; }).filter(Boolean));
    } catch (e) { post({ type: "selection", count: figma.currentPage.selection.length, targets: [], error: e.message }); }
  }, 120);
}

/* ------------------------------------------------------------------ marcação de identidade */
async function lockScene(sceneId) {
  var sc = LAST && LAST.scenes.filter(function (s) { return s.id === sceneId; })[0];
  if (!sc) return 0;
  var n = 0;
  for (var id in sc.link.identities) {
    var idt = sc.link.identities[id];
    var tag = (idt.states.map(function (e) { return e.sig.tag; }).filter(function (t) { return t && t.indexOf("x:") !== 0; })[0]) || uid();
    for (var i = 0; i < idt.states.length; i++) {
      var node = await figma.getNodeByIdAsync(idt.states[i].nodeId);
      if (node) { node.setPluginData(TAG_KEY, tag); n++; }
    }
  }
  return n;
}
async function clearScene(sceneId) {
  var sc = LAST && LAST.scenes.filter(function (s) { return s.id === sceneId; })[0];
  if (!sc) return 0;
  var n = 0;
  for (var f = 0; f < sc.frameEls.length; f++) for (var i = 0; i < sc.frameEls[f].length; i++) {
    var node = await figma.getNodeByIdAsync(sc.frameEls[f][i].nodeId);
    if (node && node.getPluginData(TAG_KEY)) { node.setPluginData(TAG_KEY, ""); n++; }
  }
  return n;
}
async function splitNode(nodeId) {
  var node = await figma.getNodeByIdAsync(nodeId);
  if (node) node.setPluginData(TAG_KEY, "x:" + uid());
}

/* ------------------------------------------------------------------ ponte com a interface */
function post(msg) { if (typeof figma !== "undefined" && figma.ui) figma.ui.postMessage(msg); }
async function handle(msg) {
  try {
    if (msg.type === "analyze") {
      var data = await analyze(msg);
      post({ type: "analysis", scenes: data, page: figma.currentPage.name, scope: msg.scope || "page" });
      var ids = [];
      LAST.scenes.forEach(function (sc) { sc.frameEls.forEach(function (els) { els.forEach(function (e) { ids.push(e.nodeId); }); }); });
      sendThumbs(ids);
    } else if (msg.type === "thumbs") {
      sendThumbs(msg.ids || []);
    } else if (msg.type === "focus") {
      var n = await figma.getNodeByIdAsync(msg.nodeId);
      if (n) { figma.currentPage.selection = [n]; figma.viewport.scrollAndZoomIntoView([n]); }
    } else if (msg.type === "lock") {
      var c = await lockScene(msg.sceneId);
      figma.notify("Figma2AE: " + c + " elementos marcados. Duplicações futuras mantêm a identidade.");
      await handle({ type: "analyze", expanded: msg.expanded, scope: msg.scope });
    } else if (msg.type === "clear") {
      var c2 = await clearScene(msg.sceneId);
      figma.notify("Figma2AE: marcações removidas de " + c2 + " elementos.");
      await handle({ type: "analyze", expanded: msg.expanded, scope: msg.scope });
    } else if (msg.type === "split") {
      await splitNode(msg.nodeId);
      await handle({ type: "analyze", expanded: msg.expanded, scope: msg.scope });
    } else if (msg.type === "export") {
      post({ type: "progress", text: "Preparando exportação…" });
      var res = await exportFrames(msg);
      var nm = res.comps === 1 ? JSON.parse(res.manifest).comps[0].compName : figma.currentPage.name + " - " + res.comps + " comps";
      post({ type: "exported", manifest: res.manifest, files: res.files, count: res.count, name: asciiName(figma.root.name + " - " + nm) });
    } else if (msg.type === "setWhole") {
      WHOLE = {}; (msg.whole || []).forEach(function (id) { WHOLE[id] = true; }); sendSelection();
    } else if (msg.type === "peek") {
      var pn = await figma.getNodeByIdAsync(msg.nodeId);
      if (pn) figma.viewport.scrollAndZoomIntoView([pn]); // mostra sem mudar a seleção
    } else if (msg.type === "refreshSelection") {
      SCENE_CACHE = null; sendSelection();
    } else if (msg.type === "close") {
      figma.closePlugin();
    } else if (msg.type === "resize") {
      var rw = Math.max(420, Math.min(1600, msg.w | 0)), rh = Math.max(360, Math.min(1200, msg.h | 0));
      figma.ui.resize(rw, rh);
      clearTimeout(saveSizeT); saveSizeT = setTimeout(function () { figma.clientStorage.setAsync("f2ae_size", { w: rw, h: rh }).catch(function () {}); }, 400);
    } else if (msg.type === "notify") {
      figma.notify(msg.text);
    }
  } catch (e) {
    post({ type: "error", text: (e && e.message) ? e.message : String(e) });
  }
}

if (typeof figma !== "undefined" && !(typeof globalThis !== "undefined" && globalThis.__F2AE_TEST__)) {
  var saveSizeT = 0;
  figma.showUI(__html__, { width: 520, height: 620, themeColors: false, title: "Figma2AE" });
  figma.clientStorage.getAsync("f2ae_size").then(function (sz) { if (sz && sz.w && sz.h) figma.ui.resize(sz.w, sz.h); }).catch(function () {});
  figma.ui.onmessage = handle;
  figma.on("selectionchange", sendSelection);
  figma.on("currentpagechange", function () { SCENE_CACHE = null; sendSelection(); });
  sendSelection();
}

if (typeof module !== "undefined") module.exports = {
  fnv: fnv, mul: mul, inv: inv, apply: apply, decompose: decompose, relXf: relXf, m2o: m2o,
  detectScenes: detectScenes, extractElements: extractElements, scorePair: scorePair, assign: assign,
  linkScene: linkScene, diffStates: diffStates, analyze: analyze, exportFrames: exportFrames, resolveTargets: resolveTargets, describeTargets: describeTargets, Exporter: Exporter,
  compNameFor: compNameFor, handle: handle, _last: function () { return LAST; }
};
