# Figma2AE: notas para o Claude (desenvolvimento)

Projeto do Iug (motion designer, fala português do Brasil, informal). Ele quer que tudo funcione sem ele precisar mexer: faça, teste e entregue.

## Estrutura
- `figma-plugin/` (`code.js` lógica, `ui.html` interface). O Figma lê os arquivos do disco a cada execução. Menu do plugin: "Figma2AE" (completo) e "Quick Import" (`figma.command === "quick"`: janelinha flutuante que manda camadas soltas pro endpoint `/quick` do receptor → `f2aeQuick` → `quickImport` na comp aberta).
- `extension/` (CEP, id `com.iug.figma2ae`): `index.html` painel, `server.html` receptor escondido (porta 7452, endpoints `/ping`, `/package`, `/build`, `/update/check|status|apply`), `updater.js`, `host/host.jsx`, `jsx/Figma2AE.jsx` (cópia de `after-effects/Figma2AE.jsx`).
- `after-effects/Figma2AE.jsx`: monta comps (ES3/ExtendScript). Recarregado a cada importação.
- `studio/app/`: Electron (`engine.js` análise de tomadas, `main.js`, `index.html`). Tem o botão **"Atualizar tudo"** na barra de título: atualiza plugin do Figma + extensão do After + o próprio Studio (reinicia sozinho). `studio/app/updater.js` é cópia de `extension/updater.js` (o `publicar.py` copia).
- `extension/paths.js`: pasta Documentos de verdade (registro do Windows; com OneDrive não é `%USERPROFILE%\Documents`). Use sempre ela pra `Figma2AE\Recebidos`, Biblioteca etc. O Studio usa `app.getPath("documents")`, que é a mesma.
- Fluxo do que chega do Figma: Studio aberto → ele recebe; Studio instalado e fechado → o receptor abre o Studio; opção "Mandar pro Figma2AE Studio" desligada no painel → vai pro painel.
- `installer/setup.nsi` + `tools/montar_setup.py`: instalador universal **Figma2AE_Setup_vX.Y.Z.exe** (NSIS, só usuário atual, sem admin): plugin → `Documentos\Figma2AE\figma-plugin`, extensão → CEP + PlayerDebugMode, Studio → `%LOCALAPPDATA%\Programs` com atalhos, desinstalador em Aplicativos. O workflow gera e anexa no Release. O import do plugin no Figma continua manual (o instalador copia o caminho do manifesto).
- `installer/`: arquivos do zip de instalação (`INSTALAR.bat` aceita `/auto`; `installer/CLAUDE.md` é o roteiro de instalação para outro Claude, diferente deste arquivo).

## Testes
`node test/test_export.js`, `test_analysis.js`, `test_studio.js`, `test_panel.js` (precisa de jsdom), `test_update.js <pasta dist/versão>`, `test_update_skip.js` (usuário pulou várias versões: tem que instalar a mais nova sem erro de SHA-256), `test_ae.js`, `test_effects.js` (máscaras/efeitos nativos no plugin), `test_ae_effects.js` (montagem deles num After falso), `test_flat.js` (menos precomps: clip que não corta vira nulo, preenchimentos sem comp interno), `test_quick.js` (Quick Import: camadas soltas na comp aberta, editável ou PNG separado).

## Publicar uma versão (atualização automática pra todo mundo)
1. `python3 tools/publicar.py X.Y.Z "o que mudou"`: carimba a versão em `extension/version.json`, `after-effects/Figma2AE.jsx`, `CSXS/manifest.xml`, `studio/app/package.json` e gera `dist/`.
2. Commit com a mensagem = notas da versão e push na `main`. O workflow `.github/workflows/release.yml` cria o Release `vX.Y.Z` com `figma2ae-update.zip`, `latest.json` e o instalador `Figma2AE_vX.Y.Z.zip`.
3. Os usuários veem "Atualização disponível" (o receptor consulta `https://github.com/EmrehliugL/figma2ae/releases/latest/download/latest.json` ao abrir o After, a cada 15 min enquanto o plugin está aberto e a cada 6 h; o Studio a cada 30 min). O pacote é SEMPRE baixado pelo endereço fixo da versão (`releases/download/vX.Y.Z/`, campo `url` do latest.json) e o updater confere de novo na hora de aplicar: pular versões nunca pode quebrar.

Sempre suba a versão (semver) quando mudar plugin, extensão ou Studio. O updater confere SHA-256 e guarda backup em `Documentos\Figma2AE\_update\backup_<versão>`.

## No PC do Iug
- Plugin: `C:\Users\Iug\Documents\Figma2AE\figma-plugin`
- Extensão instalada: `%APPDATA%\Adobe\CEP\extensions\com.iug.figma2ae` (cópia de trabalho em `Documents\Figma2AE\extension`)
- Studio: `%LOCALAPPDATA%\Programs\Figma2AE Studio`
- Antes de mexer no After dele, cuidado com projeto não salvo.
