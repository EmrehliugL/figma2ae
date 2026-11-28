// Registra (ou remove) o plugin Figma2AE no Figma Desktop, sem a pessoa precisar
// fazer "Import plugin from manifest…". Roda com o Electron do Studio em modo node
// (ELECTRON_RUN_AS_NODE=1). O Figma precisa estar FECHADO: ele regrava o settings.json ao sair.
//
// uso: registrar_figma.js add    <settings.json> <pasta do plugin>
//      registrar_figma.js remove <settings.json>
// saída: 0 = registrado/removido, 2 = já estava certo, 3 = Figma nunca aberto (sem settings.json), 1 = erro
"use strict";
const fs = require("fs");
const path = require("path");

const PLUGIN_ID = "figma2ae-iug-local";

function isOurs(e) {
  if (!e) return false;
  if (e.lastKnownPluginId === PLUGIN_ID) return true;
  return false;
}

// remove as entradas do Figma2AE (manifesto + code.js + ui.html ligados a ele)
function strip(list) {
  const ours = new Set(list.filter(isOurs).map(e => e.id));
  return list.filter(e => {
    if (ours.has(e.id)) return false;
    const m = e.fileMetadata || {};
    if (m.manifestFileId != null && ours.has(m.manifestFileId)) return false;
    return true;
  });
}

function entries(list, dir) {
  let id = list.reduce((mx, e) => Math.max(mx, Number(e.id) || 0), 0);
  const man = ++id, code = ++id, ui = ++id;
  return [
    { id: man, manifestPath: path.win32.join(dir, "manifest.json"), lastKnownName: "Figma2AE", lastKnownPluginId: PLUGIN_ID,
      fileMetadata: { type: "manifest", codeFileId: code, uiFileIds: [ui] }, cachedContainsWidget: false },
    { id: code, manifestPath: path.win32.join(dir, "code.js"), fileMetadata: { type: "code", manifestFileId: man } },
    { id: ui, manifestPath: path.win32.join(dir, "ui.html"), fileMetadata: { type: "ui", manifestFileId: man } }
  ];
}

function alreadyOk(list, dir) {
  const man = list.find(isOurs);
  if (!man || !man.fileMetadata) return false;
  const want = path.win32.join(dir, "manifest.json").toLowerCase();
  if (String(man.manifestPath).toLowerCase() !== want) return false;
  const code = list.find(e => e.id === man.fileMetadata.codeFileId);
  const ui = list.find(e => (man.fileMetadata.uiFileIds || []).indexOf(e.id) >= 0);
  return !!(code && ui) && list.filter(isOurs).length === 1;
}

function run(argv) {
  const [mode, settings, dir] = argv;
  if (!fs.existsSync(settings)) return 3;
  const raw = fs.readFileSync(settings, "utf8").replace(/^﻿/, "");
  const d = JSON.parse(raw);
  const list = Array.isArray(d.localFileExtensions) ? d.localFileExtensions : [];
  let next;
  if (mode === "add") {
    if (!dir) return 1;
    if (alreadyOk(list, dir)) return 2;
    const base = strip(list);
    next = base.concat(entries(base, dir));
  } else if (mode === "remove") {
    next = strip(list);
    if (next.length === list.length) return 2;
  } else return 1;
  d.localFileExtensions = next;
  // backup, grava num temporário e troca: nunca deixa o settings.json pela metade
  try { fs.copyFileSync(settings, settings + ".f2ae-backup"); } catch (e) {}
  const tmp = settings + ".f2ae-tmp";
  fs.writeFileSync(tmp, JSON.stringify(d), "utf8");
  JSON.parse(fs.readFileSync(tmp, "utf8"));
  fs.renameSync(tmp, settings);
  return 0;
}

if (require.main === module) {
  let code = 1;
  try { code = run(process.argv.slice(2)); } catch (e) { code = 1; }
  process.exit(code);
}
module.exports = { run, strip, entries, alreadyOk };
