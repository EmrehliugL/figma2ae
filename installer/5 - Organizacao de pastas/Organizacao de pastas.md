# Organização de pastas do Figma2AE

## No computador (Documentos\Figma2AE)

```
Documentos\Figma2AE\
├── figma-plugin\           ← o plugin do Figma (o Figma lê daqui: não mova)
│   ├── manifest.json
│   ├── code.js
│   └── ui.html
├── Recebidos\              ← cada envio do Figma vira uma pasta aqui
│   ├── 2026-11-20_153012_ab12\
│   │   ├── figma2ae.json   ← o pacote (camadas, textos, posições)
│   │   ├── assets\         ← imagens e vetores exportados
│   │   │   └── REF\        ← imagem de referência de cada frame
│   │   └── _meta.json      ← nome, data e se já foi importado
│   ├── _config.json        ← opções do painel do After (não apague)
│   └── _estado.json        ← status do receptor (não apague)
├── Biblioteca\             ← cópia das imagens usadas nos projetos do After
│   └── <nome do arquivo do Figma>\
```

**Recebidos** é o histórico. Pode apagar à vontade pelos botões **Apagar importados…** (painel do After) ou **Apagar montados / Apagar tudo** (Studio).

**Biblioteca** guarda as imagens que os seus projetos do After usam. **Não apague** se ainda for abrir esses projetos: é por causa dela que apagar o histórico não quebra nada.

## Onde cada parte fica instalada

| Parte | Pasta |
|---|---|
| Extensão do After Effects | `%APPDATA%\Adobe\CEP\extensions\com.iug.figma2ae` |
| Figma2AE Studio | `%LOCALAPPDATA%\Programs\Figma2AE Studio` (atalho na Área de Trabalho e no Menu Iniciar) |
| Plugin do Figma | `Documentos\Figma2AE\figma-plugin` |

## Dentro do projeto do After Effects

Cada importação cria (ou reaproveita) esta árvore no painel **Project**:

```
FIGMA_<NOME_DO_ARQUIVO>\
├── COMPOSITIONS\           ← uma comp por frame (SCENE_07_F01, SCENE_07_F02…)
│   └── <SEQUENCIA>_FRAMES\ ← frames que você juntou "em sequência"
├── MASTER_COMPOSITION\     ← MASTER com tudo em sequência (se a opção estiver ligada)
└── ASSETS\
    ├── IMAGES\             ← fotos e fundos
    ├── VECTORS\            ← vetores pesados que viraram imagem
    ├── REFERENCIA_FIGMA\   ← imagem do Figma de cada frame (camada-guia)
    └── OTHER\
        ├── PRECOMPS\       ← frames internos, preenchimentos recriados
        └── NULLS\          ← nulos dos grupos
```

O **Studio** usa a mesma árvore: as tomadas vão pra `COMPOSITIONS` (`…_TOMADA_01`, `…_TOMADA_02`) e a sequência final pra `MASTER_COMPOSITION\MASTER_SEQUENCIA`.

## Organização recomendada no Figma

O plugin entende melhor um storyboard organizado assim:

- **Uma cena = um frame ou Section** com o nome da cena (`Scene 7`, `Scene 12`…), com as telas dentro.
- **Telas da cena do mesmo tamanho** (ex.: 1920×1080), de preferência numa coluna ou linha.
- **Nome de cada tela com o beat**: `Scene 12 - beat 3`. Pra definir a duração no Studio, ponha o tempo no nome: `Scene 12 - beat 3 (1.5s)`.
- Camadas de fundo, grid e partículas podem ser frames do tamanho da tela: o plugin entende que são camadas da mesma tela.
