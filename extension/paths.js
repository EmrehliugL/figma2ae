/* Pastas do Figma2AE, iguais em todas as partes (extensão, painel, atualizador, Studio).
   A pasta Documentos de verdade pode não ser C:\Users\<nome>\Documents: com o OneDrive ligado
   ela vira ...\OneDrive\Documentos. Aqui lemos o caminho real no registro do Windows, que é o
   mesmo que o Studio (Electron) usa. Sem isso, o Studio e o After olham pastas diferentes. */
"use strict";
const path = require("path"), os = require("os"), fs = require("fs");
let cached = null;

function realDocuments() {
  if (cached) return cached;
  let dir = "";
  if (process.platform === "win32") {
    try {
      const out = require("child_process").execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders" /v Personal', { encoding: "utf8", windowsHide: true, timeout: 4000 });
      const m = out.match(/Personal\s+REG_(?:EXPAND_)?SZ\s+(.+)/i);
      if (m) dir = m[1].trim().replace(/%([^%]+)%/g, (a, k) => process.env[k] || process.env[k.toUpperCase()] || a);
    } catch (e) {}
  }
  if (!dir || !fs.existsSync(dir)) dir = path.join(os.homedir(), "Documents");
  cached = dir;
  return dir;
}
const docs = () => path.join(realDocuments(), "Figma2AE");
const legacyDocs = () => path.join(os.homedir(), "Documents", "Figma2AE");

/* Pastas de onde o Figma Desktop carrega o Figma2AE: a lista "localFileExtensions" do settings.json dele.
   Quem importou o manifesto direto do zip (Downloads etc.) tem o plugin numa pasta fora de Documentos;
   sem isso o Atualizar atualizava Documentos e o Figma continuava lendo a pasta velha. */
const PLUGIN_ID = "figma2ae-iug-local";
function figmaSettingsFile() { return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Figma", "settings.json"); }
function figmaPluginDirs(file) {
  try {
    const d = JSON.parse(fs.readFileSync(file || figmaSettingsFile(), "utf8").replace(/^\uFEFF/, ""));
    const out = [];
    (Array.isArray(d.localFileExtensions) ? d.localFileExtensions : []).forEach(e => {
      if (!e || e.lastKnownPluginId !== PLUGIN_ID || typeof e.manifestPath !== "string") return;
      const dir = path.win32.dirname(e.manifestPath); // aceita C:\... e caminhos com "/"
      if (fs.existsSync(path.join(dir, "manifest.json")) && out.indexOf(dir) < 0) out.push(dir);
    });
    return out;
  } catch (e) { return []; }
}
/* Pastas do plugin do Figma que podem existir (o Figma lê de onde o manifesto foi importado). */
function pluginDirs(settingsFile) {
  const list = [path.join(docs(), "figma-plugin"), path.join(legacyDocs(), "figma-plugin")].concat(figmaPluginDirs(settingsFile));
  const found = list.filter((d, i) => list.indexOf(d) === i && fs.existsSync(path.join(d, "manifest.json")));
  return found.length ? found : [list[0]];
}
const studioExe = () => path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Programs", "Figma2AE Studio", "Figma2AE Studio.exe");

module.exports = { realDocuments, docs, legacyDocs, pluginDirs, figmaPluginDirs, figmaSettingsFile, studioExe };
