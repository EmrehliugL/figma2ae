// Mock mínimo da Plugin API do Figma pra testar a lógica do Figma2AE no Node.
"use strict";
let NEXT = 1;
const REG = {};
const MIXED = Symbol("mixed");

function makeNode(type, props, children) {
  const n = Object.assign({
    id: "1:" + (NEXT++), type, name: type, visible: true, x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1,
    blendMode: "NORMAL", fills: [], strokes: [], effects: [], strokeWeight: 1, strokeAlign: "INSIDE", cornerRadius: 0, parent: null,
    _plugin: {}
  }, props || {});
  if (children) { n.children = children; children.forEach(c => c.parent = n); }
  REG[n.id] = n;
  Object.defineProperty(n, "absoluteTransform", { get() {
    // translação + rotação (graus, sentido horário em y pra baixo) acumuladas pelos pais
    const p = n.parent && n.parent.type !== "PAGE" && n.parent.type !== "SECTION" ? n.parent.absoluteTransform : (n.parent && n.parent.type === "SECTION" ? n.parent.absoluteTransform : [[1,0,0],[0,1,0]]);
    const r = (n.rotation || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    const local = [[c, -s, n.x], [s, c, n.y]];
    return [
      [p[0][0]*local[0][0] + p[0][1]*local[1][0], p[0][0]*local[0][1] + p[0][1]*local[1][1], p[0][0]*local[0][2] + p[0][1]*local[1][2] + p[0][2]],
      [p[1][0]*local[0][0] + p[1][1]*local[1][0], p[1][0]*local[0][1] + p[1][1]*local[1][1], p[1][0]*local[0][2] + p[1][1]*local[1][2] + p[1][2]]
    ];
  }});
  Object.defineProperty(n, "absoluteRenderBounds", { get() { const t = n.absoluteTransform; return { x: t[0][2], y: t[1][2], width: n.width, height: n.height }; } });
  Object.defineProperty(n, "absoluteBoundingBox", { get() { const t = n.absoluteTransform; return { x: t[0][2], y: t[1][2], width: n.width, height: n.height }; } });
  n.getPluginData = k => n._plugin[k] || "";
  n.setPluginData = (k, v) => { n._plugin[k] = v; };
  n.exportAsync = async opts => new Uint8Array([137, 80, 78, 71, (n.width | 0) & 255, (n.height | 0) & 255, n.id.length, 1, 2, 3]);
  n.remove = () => { if (n.parent && n.parent.children) n.parent.children = n.parent.children.filter(c => c !== n); delete REG[n.id]; };
  // como no Figma: o clone vai pra página atual (mesmos x/y locais, então muda a posição absoluta)
  n.clone = () => { const c = deepClone(n); const pg = global.figma && global.figma.currentPage; c.parent = pg || n.parent; if (c.parent && c.parent.children) c.parent.children.push(c); return c; };
  if (type === "TEXT") {
    // _segs opcional: [{ start, end, fills }] (estilos mistos). Layout simulado: 1 linha por "\n";
    // com _wrapWords cada palavra quebra pra linha de baixo (simula quebra automática da caixa)
    const seg = (a, b, f) => ({ start: a, end: b, fontName: n.fontName, fontSize: n.fontSize, fills: f, letterSpacing: { unit: "PIXELS", value: 0 }, lineHeight: { unit: "AUTO" }, textCase: "ORIGINAL", textDecoration: "NONE" });
    n.getStyledTextSegments = () => (n._segs ? n._segs.map(x => seg(x.start, x.end, x.fills)) : [seg(0, n.characters.length, n.fills)]);
    n.getRangeAllFontNames = () => [n.fontName];
    n.deleteCharacters = (a, b) => {
      n.characters = n.characters.slice(0, a) + n.characters.slice(b);
      if (n._segs) n._segs = n._segs.map(x => ({ start: x.start < a ? x.start : Math.max(a, x.start - (b - a)), end: x.end <= a ? x.end : Math.max(a, x.end - (b - a)), fills: x.fills })).filter(x => x.end > x.start);
      if (n.textAutoResize === "HEIGHT") n.height = mockLines(n) * n.fontSize * 1.2;
    };
    Object.defineProperty(n, "relativeTransform", { set(m) { n.x = m[0][2]; n.y = m[1][2]; n.rotation = Math.atan2(m[1][0], m[0][0]) * 180 / Math.PI; }, get() { const t = n.absoluteTransform; return t; }, configurable: true });
  }
  if (type === "INSTANCE") n.getMainComponentAsync = async () => n._main || null;
  if (["RECTANGLE", "ELLIPSE", "VECTOR", "STAR", "POLYGON", "LINE", "BOOLEAN_OPERATION"].includes(type) && !n.fillGeometry) {
    const w = n.width, h = n.height;
    n.fillGeometry = type === "ELLIPSE"
      ? [{ windingRule: "NONZERO", data: `M ${w} ${h/2} C ${w} ${h*0.776} ${w*0.776} ${h} ${w/2} ${h} C ${w*0.224} ${h} 0 ${h*0.776} 0 ${h/2} C 0 ${h*0.224} ${w*0.224} 0 ${w/2} 0 C ${w*0.776} 0 ${w} ${h*0.224} ${w} ${h/2} Z` }]
      : [{ windingRule: "NONZERO", data: `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} L 0 0 Z` }];
    n.strokeGeometry = [];
  }
  return n;
}
function mockLines(n) {
  const t = n.characters || "";
  if (!t) return 1;
  return t.split("\n").reduce((a, l) => a + (n._wrapWords ? Math.max(1, l.trim().split(/\s+/).length) : 1), 0);
}
function deepClone(n) {
  const kids = n.children ? n.children.map(deepClone) : undefined;
  const props = {};
  for (const k of Object.keys(n)) if (!["id", "children", "parent", "getPluginData", "setPluginData", "exportAsync", "remove", "clone", "getStyledTextSegments", "getMainComponentAsync", "getRangeAllFontNames", "deleteCharacters", "relativeTransform"].includes(k)) props[k] = n[k];
  props._plugin = Object.assign({}, n._plugin);   // pluginData acompanha a duplicação
  const c = makeNode(n.type, props, kids);
  return c;
}
function solid(r, g, b, o) { return { type: "SOLID", color: { r, g, b }, opacity: o === undefined ? 1 : o, visible: true }; }
function image(hash) { return { type: "IMAGE", imageHash: hash, scaleMode: "FILL", visible: true }; }

function install(page) {
  global.figma = {
    mixed: MIXED, currentPage: page, root: { name: "Storyboard Teste" }, loadFontAsync: async () => {},
    getNodeByIdAsync: async id => REG[id] || null,
    getImageByHash: h => ({ getSizeAsync: async () => ({ width: 2000, height: 1200 }), getBytesAsync: async () => new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, h.length & 255, 7, 7, 7]) }),
    ui: { postMessage: () => {} }, notify: () => {}, viewport: { scrollAndZoomIntoView() {} }
  };
}
module.exports = { makeNode, deepClone, solid, image, install, REG, MIXED };
