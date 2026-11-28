// Registro automático do plugin no Figma Desktop (installer/registrar_figma.js)
const fs = require("fs"), os = require("os"), path = require("path"), assert = require("assert");
const R = require("../installer/registrar_figma.js");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "f2ae-fig-"));
const S = path.join(tmp, "settings.json");
const DIR = "C:\\Users\\Amigo\\Documents\\Figma2AE\\figma-plugin";
const big = { zoomStop: 1, featureFlags: { a: true, A: false, "": 1 }, windows: [{ x: 1 }], localFileExtensions: [
  { id: 4, manifestPath: "C:\\outro\\manifest.json", lastKnownName: "Outro", lastKnownPluginId: "outro", fileMetadata: { type: "manifest", codeFileId: 5, uiFileIds: [] } },
  { id: 5, manifestPath: "C:\\outro\\code.js", fileMetadata: { type: "code", manifestFileId: 4 } } ] };
// 1) Figma nunca aberto
assert.strictEqual(R.run(["add", S, DIR]), 3);
// 2) primeiro registro preserva o resto
fs.writeFileSync(S, "\uFEFF" + JSON.stringify(big, null, 2));
assert.strictEqual(R.run(["add", S, DIR]), 0);
let d = JSON.parse(fs.readFileSync(S, "utf8"));
assert.deepStrictEqual(d.featureFlags, big.featureFlags);
assert.strictEqual(d.localFileExtensions.length, 5);
const man = d.localFileExtensions.find(e => e.lastKnownPluginId === "figma2ae-iug-local");
assert.strictEqual(man.manifestPath, DIR + "\\manifest.json");
assert.strictEqual(man.id, 6);
const code = d.localFileExtensions.find(e => e.id === man.fileMetadata.codeFileId);
assert.strictEqual(code.manifestPath, DIR + "\\code.js"); assert.strictEqual(code.fileMetadata.manifestFileId, man.id);
assert.ok(fs.existsSync(S + ".f2ae-backup"));
// 3) segunda vez: nada muda
assert.strictEqual(R.run(["add", S, DIR]), 2);
// 4) importado antes de outra pasta (ex.: zip extraído): troca pelo caminho novo, sem duplicar
const D2 = "C:\\Users\\Amigo\\Downloads\\Figma2AE_v2.3\\1 - Plugin Figma";
assert.strictEqual(R.run(["add", S, D2]), 0);
assert.strictEqual(R.run(["add", S, DIR]), 0);
d = JSON.parse(fs.readFileSync(S, "utf8"));
assert.strictEqual(d.localFileExtensions.filter(e => e.lastKnownPluginId === "figma2ae-iug-local").length, 1);
assert.strictEqual(d.localFileExtensions.length, 5);
assert.ok(!d.localFileExtensions.some(e => String(e.manifestPath).indexOf("Downloads") >= 0));
// 5) remover (desinstalador)
assert.strictEqual(R.run(["remove", S]), 0);
d = JSON.parse(fs.readFileSync(S, "utf8"));
assert.deepStrictEqual(d.localFileExtensions, big.localFileExtensions);
assert.strictEqual(R.run(["remove", S]), 2);
// 6) settings real do Iug (se disponível): registra sem perder nada
const real = "/mnt/user-data/uploads/Figma/settings.json";
if (fs.existsSync(real)) {
  fs.copyFileSync(real, S);
  const before = JSON.parse(fs.readFileSync(S, "utf8"));
  assert.strictEqual(R.run(["add", S, "C:\\Users\\Iug\\Documents\\Figma2AE\\figma-plugin"]), 2);
  assert.strictEqual(R.run(["remove", S]), 0);
  assert.strictEqual(R.run(["add", S, "C:\\Users\\Iug\\Documents\\Figma2AE\\figma-plugin"]), 0);
  const after = JSON.parse(fs.readFileSync(S, "utf8"));
  for (const k of Object.keys(before)) if (k !== "localFileExtensions") assert.deepStrictEqual(after[k], before[k], k);
}
console.log("TODOS OS TESTES DO REGISTRO NO FIGMA PASSARAM");
