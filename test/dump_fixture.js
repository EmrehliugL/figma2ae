globalThis.__F2AE_TEST__ = true;
const M = require("./mockFigma"); const { makeNode, deepClone, solid, image } = M; const P = require("../figma-plugin/code.js");
function frame(name, x, y, kids) { return makeNode("FRAME", { name, x, y, width: 1920, height: 1080, fills: [solid(0.06,0.05,0.05)], clipsContent: true }, kids); }
function texto(name, chars, x, y) { return makeNode("TEXT", { name, characters: chars, x, y, width: 600, height: 80, fontName: { family: "Inter", style: "Bold" }, fontSize: 64, fills: [solid(1,1,1)] }); }
const f1 = frame("Frame 01", 0, 0, [makeNode("RECTANGLE", { name: "Background", width: 1920, height: 1080, fills: [image("bg")] }), makeNode("RECTANGLE", { name: "Presenter", x: 1100, y: 200, width: 600, height: 880, fills: [image("p")] }), texto("Title", "Como funciona o solo", 120, 160)]);
const f2 = deepClone(f1); f2.name = "Frame 02"; f2.y = 1300; f2.children.push(Object.assign(makeNode("ELLIPSE", { name: "Circle 01", x: 300, y: 600, width: 120, height: 120, fills: [solid(0.9,0.7,0.3)] }), { parent: f2 }));
const f3 = deepClone(f2); f3.name = "Frame 03"; f3.y = 2600; f3.children.push(Object.assign(makeNode("ELLIPSE", { name: "Circle 02", x: 520, y: 600, width: 120, height: 120, fills: [solid(0.9,0.7,0.3)] }), { parent: f3 })); f3.children.filter(c => c.name === "Title")[0].x = 180;
const sec = makeNode("SECTION", { name: "SCENE 15", width: 2200, height: 4000 }, [f1, f2, f3]);
const sec2 = makeNode("SECTION", { name: "SCENE 16", x: 3000, width: 2200, height: 2000 }, [deepClone(f1)]);
const page = { type: "PAGE", name: "Storyboard", children: [sec, sec2], selection: [] }; sec.parent = page; sec2.parent = page; M.install(page);
P.analyze({}).then(r => require("fs").writeFileSync("/tmp/fixture.json", JSON.stringify(r)));
