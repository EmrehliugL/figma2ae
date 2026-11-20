# Figma2AE

Leva as telas do storyboard no Figma para o After Effects como camadas nativas e editáveis: shape layers com Stroke de verdade, textos editáveis, imagens, gradientes recriados com efeitos nativos e uma comp por frame, com o design igual ao do Figma.

## Baixar

**[⬇ Baixar a versão mais recente](https://github.com/EmrehliugL/figma2ae/releases/latest)**: baixe o `Figma2AE_v<versão>.zip`, extraia e dê dois cliques em `INSTALAR.bat`. O passo a passo está em `Tutorial/Tutorial Figma2AE.pdf` dentro do zip.

Quem já tem instalado não precisa baixar de novo: quando sai uma versão, aparece **"Atualização disponível"** no plugin do Figma e no painel do After. É só clicar em **Atualizar**.

## Partes

| Pasta | O que é |
|---|---|
| `figma-plugin/` | Plugin do Figma (escolhe os frames e envia pro After) |
| `extension/` | Extensão CEP do After Effects: painel, receptor na porta 7452 e atualizador |
| `after-effects/` | Biblioteca ExtendScript que monta as comps (também funciona como script avulso) |
| `studio/app/` | Figma2AE Studio (Electron): monta tomadas automaticamente |
| `installer/` | Instalador, verificador, tutorial e guia de pastas que vão no zip |
| `tools/` | `publicar.py` (pacote de atualização), `montar_instalador.py` (zip completo) |

Requisitos: Windows 10/11, After Effects 2020+ e Figma de desktop.
