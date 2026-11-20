# Figma2AE · Tutorial de instalação e uso

O Figma2AE leva as telas do seu storyboard no Figma para o After Effects como camadas nativas e editáveis: formas com Stroke de verdade, textos editáveis, imagens, gradientes recriados com efeitos nativos e uma comp por frame, com o design igual ao do Figma.

São três peças que trabalham juntas:

| Peça | O que faz |
|---|---|
| **Plugin do Figma** | Você escolhe os frames e clica em **Enviar pro After Effects**. |
| **Extensão do After Effects** | Recebe o envio em segundo plano (mesmo com o painel fechado) e monta as comps. |
| **Figma2AE Studio** (opcional) | Analisa uma sequência de frames e monta tudo como **tomadas**: troca de texto vira animação na mesma comp, troca de fundo vira comp nova, e no fim gera uma MASTER com tudo em ordem. |

**Requisitos:** Windows 10 ou 11 · After Effects 2020 ou mais novo · Figma **app de desktop** (o Figma no navegador não roda plugins locais).

---

# Parte 1 · Instalação

## Jeito rápido (recomendado)

1. Feche o **After Effects** e o **Figma2AE Studio**, se estiverem abertos.
2. Extraia este zip numa pasta qualquer (botão direito → **Extrair tudo**).
3. Dê dois cliques em **INSTALAR.bat**.
    Se o Windows mostrar "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo**.
4. O instalador faz sozinho:
    - instala a extensão no After Effects e libera extensões sem assinatura (só no seu usuário);
    - instala o **Figma2AE Studio** com atalho na Área de Trabalho e no Menu Iniciar;
    - copia o plugin do Figma para `Documentos\Figma2AE\figma-plugin`;
    - cria as pastas `Recebidos` e `Biblioteca`.
5. Falta **um passo no Figma** (o Figma não deixa instalar plugin por fora):
    - Abra qualquer arquivo no **Figma de desktop**.
    - Menu **Plugins → Desenvolvimento → Importar plugin do manifesto…**
    (em inglês: *Plugins → Development → Import plugin from manifest…*)
    - Escolha `Documentos\Figma2AE\figma-plugin\manifest.json`.
6. Abra o **After Effects**. O painel aparece em **Janela → Extensões → Figma2AE** (em algumas versões: *Extensões (legado)*).

Pronto. Na próxima vez que abrir o plugin no Figma, ele deve mostrar **"AE conectado"** em verde.

Para conferir, dê dois cliques em **VERIFICAR.bat**: cada item aparece como `[OK]` ou `[FALTA]`.

## Deixar o Claude instalar tudo

Se você usa o **Claude Code** ou o app do Claude no computador com acesso a pastas ou uso do computador ligado, ele pode fazer a instalação inteira por você:

1. Extraia o zip.
2. Abra o arquivo **PROMPT PARA O CLAUDE.txt**, copie a mensagem e cole no Claude, trocando o caminho pela pasta onde você extraiu.
3. O Claude lê o **CLAUDE.md** (as instruções dele), confere se o After está fechado (e te pede pra fechar, sem mexer no seu projeto), roda o instalador no modo automático, confere com o VERIFICAR e, se tiver controle da tela, importa o plugin no Figma. No fim ele te diz o que ficou pronto e o que faltou.

## Instalação manual (se preferir fazer na mão)

**Plugin do Figma**

1. Copie a pasta `1 - Plugin Figma` para um lugar fixo (ex.: `Documentos\Figma2AE\figma-plugin`). O Figma lê os arquivos de lá toda vez, então não mova depois.
2. No Figma de desktop: **Plugins → Desenvolvimento → Importar plugin do manifesto…** e escolha o `manifest.json`.

**Extensão do After Effects**

1. Copie a pasta `2 - Extensao After Effects\com.iug.figma2ae` para:
    `C:\Users\SEU_USUARIO\AppData\Roaming\Adobe\CEP\extensions\`
    (cole `%APPDATA%\Adobe\CEP\extensions` na barra do Explorador de Arquivos; crie as pastas se não existirem).
2. Dê dois cliques em **Ativar extensoes sem assinatura.reg** e confirme.
3. Abra o After Effects → **Janela → Extensões → Figma2AE**.

**Figma2AE Studio**

1. Copie a pasta `4 - Figma2AE Studio` para onde quiser (ex.: `%LOCALAPPDATA%\Programs\Figma2AE Studio`).
2. Abra o **Figma2AE Studio.exe**. Se quiser, clique com o botão direito → **Enviar para → Área de trabalho (criar atalho)**.

**Script alternativo (sem extensão)**
A pasta `3 - Script After Effects (alternativo)` tem o `Figma2AE.jsx`, que funciona sem instalar nada: no After, **Arquivo → Scripts → Executar arquivo de script…**, escolha o `.jsx` e importe um `.f2ae.zip` salvo pelo plugin. Ele não recebe envios automáticos: serve de plano B.

## Atualizar

**Com um clique (recomendado).** Quando sai uma versão nova, aparece uma faixa azul **"Atualização disponível"** no topo do plugin do Figma e do painel do After, com o que mudou. Clique em **Atualizar**: o After baixa a versão nova, confere se o arquivo está íntegro e atualiza as três partes de uma vez (plugin, extensão e Studio). Depois é só fechar e abrir o plugin e reiniciar o After. Se o Studio estiver aberto, ele atualiza sozinho assim que você fechar ele.

O After procura atualizações quando abre e a cada 6 horas. Precisa estar com internet, e o After precisa estar aberto (é ele que baixa).

**Pelo instalador.** Rodar o **INSTALAR.bat** de uma versão nova também atualiza tudo e mantém o seu histórico e a Biblioteca.

## Desinstalar
Dê dois cliques em **DESINSTALAR.bat**: ele remove a extensão, o Studio e os atalhos, e mantém `Documentos\Figma2AE` (histórico, Biblioteca e plugin). No Figma, remova o plugin em **Plugins → Gerenciar plugins**. Apague `Documentos\Figma2AE` só se não precisar mais do histórico e da Biblioteca.

---

# Parte 2 · Uso

## Fluxo básico: Figma → After em 3 cliques

1. **No After Effects**, deixe o After aberto (o painel pode estar fechado: o receptor roda em segundo plano).
2. **No Figma**, selecione o que quer levar e rode o plugin: **Plugins → Desenvolvimento → Figma2AE** (ou `Ctrl + /` e digite *Figma2AE*).
3. Confira a lista e clique em **Enviar N comps pro After Effects**.

O painel do After abre sozinho com o envio. Com **Importar automaticamente** ligado, as comps já são montadas na hora.

## O plugin do Figma

### O que selecionar
| Você seleciona… | O que vira no After |
|---|---|
| **Um frame** | Uma comp idêntica a ele. |
| **Vários frames** | Uma comp separada pra cada um. |
| **A cena inteira** (o frame ou a Section que guarda as telas) | Uma comp por tela, agrupadas com o nome da cena. |
| **Objetos dentro de um frame** | Uma comp do tamanho do frame só com esses objetos, na mesma posição. |

O plugin entende contêineres dentro de contêineres (ex.: um "Loop option 2" com várias telas dentro do "Side to side"): cada tela vira uma comp de 1920×1080, nunca uma comp gigante.

### A lista de comps
- **Caixinha de cada linha:** marca ou desmarca o que vai. A caixinha do grupo marca tudo de uma cena.
- **Miniatura:** clique para o Figma mostrar aquele frame.
- **Juntar numa comp só (em sequência):** as telas daquele grupo viram **uma comp** do tamanho da tela, uma depois da outra no tempo, com marcadores. Cada tela continua tendo a sua comp, dentro de uma pasta `_FRAMES`. Para voltar, clique em **Separar (1 comp por frame)**.
- **Redimensionar a janela:** arraste o canto inferior direito. O tamanho fica salvo.

### Opções (embaixo)
| Opção | Pra que serve |
|---|---|
| **Referência do Figma (guia)** | Põe a imagem do frame como camada-guia no topo da comp (desligada). Ligue o olho para comparar; ela não sai no render. |
| **Fundo do frame** | Inclui o fundo do frame. |
| **Continuidade nos comentários** | Em telas da mesma cena, cada camada diz no comentário se é nova, igual ou mudou em relação à tela anterior. |
| **Vetores pesados viram imagem** | Vetores com centenas de formas (campos de pontos, retratos pontilhados) entram como imagem em alta. A importação fica muito mais rápida e o After mais leve. Desmarque se precisar deles editáveis. |
| **Qualidade das imagens** | Resolução das imagens exportadas (2x é o equilíbrio). |

- **Enviar pro After Effects:** manda direto para o After aberto.
- **Salvar .zip:** salva um pacote `.f2ae.zip` para importar depois (ou em outro computador).

## O painel do After Effects

Fica em **Janela → Extensões → Figma2AE**.

- **Bolinha verde "Figma conectado":** o plugin do Figma está aberto e conversando com o After.
- **Pacotes recebidos:** cada envio aparece como um cartão, com as comps marcadas. Desmarque o que não quer e clique em **Importar**.
- **Importar automaticamente ao receber do Figma:** monta tudo assim que chega, sem clicar.
- **Frame rate / Duração:** fps e duração de cada comp.
- **MASTER em sequência:** cria também uma comp MASTER com todas em ordem.
- **Abrir pacote…:** importa um `.f2ae.zip` salvo.
- **🗑 no cartão / Apagar importados…:** apaga pacotes do histórico e libera espaço. Sempre pede confirmação e mostra quanto vai liberar. As imagens que os seus projetos usam ficam guardadas na **Biblioteca**, então os projetos não quebram.
- **📁:** abre a pasta dos pacotes recebidos.

### O que vem em cada comp
- Retângulos, elipses e vetores viram **shape layers**, com **Stroke nativo** (espessura, pontas, junções, tracejado, por dentro ou por fora).
- Textos viram **texto editável**, com a mesma fonte, tamanho, cor e entrelinha.
- Fotos entram na resolução original. Gradientes e texturas de fundo são **recriados com efeitos nativos** (Gradient Ramp, máscaras, Motion Tile) sempre que possível.
- Efeitos simples também viram recursos nativos e editáveis: **sombra** (Drop Shadow), **sombra interna** (Estilo de Camada > Sombra Interna), **desfoque** (Gaussian Blur), **desfoque de fundo** (camada de ajuste com Gaussian Blur recortada pela forma), **contorno** (Stroke de verdade) e **máscara** (“Use as mask” vira track matte de alfa ou luminância).
- Grupos ganham **um nulo** só quando ajuda (grupos de cima com 2 ou mais itens), sem poluir a timeline.
- Frames que recortam o conteúdo viram **precomp**, com recorte arredondado quando têm canto.

## O Figma2AE Studio (tomadas automáticas)

Use quando a cena é uma sequência: por exemplo, a mesma pessoa falando e só os textos mudando. Em vez de uma comp por tela, o Studio monta **tomadas**.

1. Abra o **Figma2AE Studio** (atalho na Área de Trabalho). Com ele aberto, os envios do Figma vão para ele em vez do painel do After.
2. No Figma, selecione as telas da cena e clique em **Enviar pro After Effects**.
3. No Studio, o pacote aparece na lista da esquerda. Ele analisa sozinho:
    - **mesmo fundo, só troca de texto** → tudo na mesma tomada, com os textos trocando no tempo certo;
    - **fundo diferente ou elemento grande novo** → tomada nova.
4. Ajuste se quiser:
    - **✂** corta uma tomada em duas a partir daquela tela;
    - **juntar com a anterior** desfaz um corte;
    - o número embaixo de cada tela é a **duração** em segundos.
5. Clique em **Montar N tomadas no After Effects**. O After monta as tomadas e uma **MASTER_SEQUENCIA** com tudo em ordem e marcadores.

**Dica de duração:** coloque o tempo no nome da tela no Figma, ex.: `Scene 12 - beat 3 (1.5s)`. Com a opção **Ler duração do nome do frame** ligada, o Studio já usa esse tempo.

Para limpar o histórico: **🗑** em cada pacote (passe o mouse), **Apagar montados** ou **Apagar tudo**, sempre com confirmação.

---

# Problemas comuns

| Problema | Solução |
|---|---|
| O instalador diz que o **After Effects está aberto** | Salve o projeto, feche o After e aperte uma tecla: ele tenta de novo. |
| O plugin mostra **"AE desconectado"** | O After Effects precisa estar aberto. Se acabou de instalar, feche e abra o After uma vez. |
| O painel diz **"receptor parado"** | Outra coisa está usando a porta 7452, ou o After abriu antes da instalação. Feche e abra o After. |
| O painel não aparece em **Janela → Extensões** | Rode o **VERIFICAR.bat**. Se algo estiver `[FALTA]`, rode o **INSTALAR.bat** de novo e reabra o After. O registro de cada instalação fica em `Documentos\Figma2AE\instalacao.log`. |
| **Fonte trocada** no After | A fonte do Figma não está instalada no Windows. O painel avisa qual é: instale e importe de novo. |
| Importação **lenta** | Deixe **Vetores pesados viram imagem** ligado. Campos de partículas com milhares de pontos são o que mais pesa. |
| Algo **diferente do Figma** | Ligue a camada **REFERÊNCIA FIGMA (guia)** para comparar. O aviso no fim da importação lista o que não tem equivalente no After (ex.: pontas de seta, efeitos de vidro/ruído novos do Figma), que entra como imagem. |
| O botão **Atualizar** deu erro | Confira a internet e tente de novo. Se o arquivo baixado vier corrompido, nada é alterado. A versão anterior da extensão fica guardada em `Documentos\Figma2AE\_update\backup_<versão>`. |
| Imagens sumiram de um projeto antigo | Projetos importados antes da versão 2.3 apontavam para a pasta Recebidos. Se você apagou o pacote, importe aquele frame de novo. |

**Estrutura de pastas:** veja `5 - Organizacao de pastas\Organizacao de pastas.md`.
