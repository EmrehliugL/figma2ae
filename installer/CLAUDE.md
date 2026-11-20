# Instalação do Figma2AE: instruções para o Claude

Esta pasta é o pacote de instalação do **Figma2AE 2.3**, um conjunto de ferramentas que leva frames do Figma para o After Effects. Se a pessoa pediu para instalar, siga este roteiro. Fale com ela em português do Brasil, informal e direto.

## O que é cada parte
| Pasta / arquivo | O que é | Onde é instalado |
|---|---|---|
| `INSTALAR.bat` | Instalador. Aceita `/auto` (sem pausas) | — |
| `VERIFICAR.bat` | Confere a instalação. Aceita `/auto` | — |
| `DESINSTALAR.bat` | Remove extensão e Studio (mantém `Documentos\Figma2AE`) | — |
| `1 - Plugin Figma` | Plugin do Figma (`manifest.json`, `code.js`, `ui.html`) | `%USERPROFILE%\Documents\Figma2AE\figma-plugin` |
| `2 - Extensao After Effects\com.iug.figma2ae` | Extensão CEP (painel + receptor na porta 7452) | `%APPDATA%\Adobe\CEP\extensions\com.iug.figma2ae` |
| `4 - Figma2AE Studio` | App Electron que monta tomadas | `%LOCALAPPDATA%\Programs\Figma2AE Studio` |
| `3 - Script After Effects (alternativo)` | Script avulso, plano B. Não precisa instalar | — |
| `Tutorial\Tutorial Figma2AE.pdf` | Tutorial completo para a pessoa | — |

Requisitos: Windows 10/11, After Effects 2020+ e **Figma de desktop** (o Figma no navegador não roda plugin local).

## Roteiro

**Antes de começar**, diga em uma frase o que vai fazer e confirme duas coisas com a pessoa:
1. Se o **After Effects** estiver aberto, peça para ela **salvar o projeto e fechar**. Não feche o After por ela nem salve o projeto dela sem ela mandar: pode haver trabalho não salvo.
2. Se o **Figma2AE Studio** estiver aberto, peça para fechar (ou feche, se ela autorizar: ele não guarda trabalho).

**1. Instalar.** Na pasta do pacote, rode:
```
cmd /c INSTALAR.bat /auto
```
Códigos de saída:
- `0`: instalado.
- `2`: After Effects ou Studio ainda aberto. Peça para fechar e rode de novo.
- `3`: pacote incompleto (o zip não foi extraído inteiro). Peça para extrair tudo de novo.
- `4`: erro ao copiar. Leia `%USERPROFILE%\Documents\Figma2AE\instalacao.log` e explique em uma frase.

O instalador grava `PlayerDebugMode=1` em `HKCU\Software\Adobe\CSXS.9` a `CSXS.12`. É uma chave **só do usuário** que deixa o After carregar extensões sem assinatura, necessária para a extensão aparecer. Se a pessoa perguntar, explique isso.

**2. Conferir.**
```
cmd /c VERIFICAR.bat /auto
```
Cada linha sai como `[OK]` ou `[FALTA]`, e o código de saída é `0` quando está tudo certo. Se algo faltar, rode o instalador de novo antes de investigar.

**3. Plugin no Figma (passo de interface).** O Figma não deixa instalar plugin por linha de comando. Se você tiver controle da tela (computer use), faça; senão, passe as instruções:
1. Abra o **Figma de desktop** com qualquer arquivo aberto (não a tela inicial).
2. Menu **Plugins → Desenvolvimento → Importar plugin do manifesto…** (em inglês: *Plugins → Development → Import plugin from manifest…*). Também dá pela busca rápida: `Ctrl + /` e digite "manifest".
3. Na janela de arquivo, cole o caminho `%USERPROFILE%\Documents\Figma2AE\figma-plugin\manifest.json` e confirme.
4. Para conferir: **Plugins → Desenvolvimento → Figma2AE** deve abrir a janela do plugin.

**4. Testar a ligação (opcional, com a pessoa).**
1. Peça para ela abrir o After Effects. O painel fica em **Janela → Extensões → Figma2AE** (em algumas versões, *Extensões (legado)*).
2. Rode `VERIFICAR.bat /auto` de novo: com o After aberto, a linha do receptor deve sair `[OK]`.
3. No Figma, abra o plugin: no topo deve aparecer **"AE conectado"** em verde.
4. Se ela quiser, peça para selecionar um frame e clicar em **Enviar pro After Effects**. As comps aparecem no After. Só envie você mesmo se ela pedir, porque a importação mexe no projeto aberto dela.

**5. Terminar.** Diga em duas ou três frases o que foi instalado, o que (se algo) ficou faltando e que o passo a passo de uso está em `Tutorial\Tutorial Figma2AE.pdf`. Ofereça abrir o tutorial.

## Regras
- Não altere configurações do sistema além da chave `PlayerDebugMode` do usuário que o instalador já grava.
- Não apague nada de `Documentos\Figma2AE` (histórico, Biblioteca, configurações) sem a pessoa pedir.
- Não mexa no projeto do After Effects dela sem pedir.

## Problemas comuns
| Sintoma | O que fazer |
|---|---|
| Painel não aparece em Janela → Extensões | Conferir `[OK]` em "Extensão" e "PlayerDebugMode" no VERIFICAR e reabrir o After. |
| Receptor `[FALTA]` com o After aberto | O After abriu antes da instalação: peça para fechar e abrir de novo. Se continuar, a porta 7452 pode estar ocupada por outro programa. |
| Plugin mostra "AE desconectado" | After fechado, ou ainda não foi reaberto depois da instalação. |
| Windows SmartScreen bloqueou o .bat | "Mais informações → Executar assim mesmo". |
