# Base Veio

A identidade compartilhada por todas as páginas da extensão. A spec travada está em
[`docs/design/identidade-veio/`](../docs/design/identidade-veio/README.md), variante F.

| Caminho | O que é |
|---|---|
| `tokens.css` | O único arquivo de tokens: cor, tipo, raio e movimento, mais as fontes empacotadas, a marca (cristal, nome e cursor) e a base de acessibilidade (foco visível e movimento reduzido). Toda página o inclui antes do CSS dela. |
| `componentes.css` | Os componentes base, uma vez só: botões, campos, toggle, checkbox, selos, `kbd`, controle segmentado, azulejo, modal, toast, aviso persistente, esqueleto e a linha de frase. Nenhuma cor é escrita aqui: tudo sai dos tokens. |
| `componentes.js` | O que os componentes precisam de JavaScript: o modal (foco inicial, foco preso, Esc, clique fora), o toast que some sozinho, o aviso com Detalhes, o grifo da Palavra e os ícones. Pendurado em `PerpetualMiner.Veio`. |
| `fontes/*.woff2` | Manrope e JetBrains Mono, subsets latin + cyrillic. Nada vem do Google Fonts em runtime. |
| `icones/` | A marca: `icone.svg` e os PNG 16/32/48/128 que o manifest usa na toolbar. |

## Como usar

```html
<link rel="stylesheet" href="veio/tokens.css">
<link rel="stylesheet" href="veio/componentes.css">
<link rel="stylesheet" href="painel.css">
…
<script src="lib/voz/catalogo.js"></script>
<script src="lib/voz/texto.js"></script>
<script src="veio/componentes.js"></script>
```

```js
const { abrirModal, mostrarToastDeSucesso, escreverFrase } = PerpetualMiner.Veio;
```

- **Cor nova não se escreve fora daqui.** Se falta um valor, ele entra como token, com o nome da
  tabela da spec. As exceções são duas, as duas por não haver CSS para ler:
  - `icones/icone.svg`: um SVG servido como imagem não lê variáveis CSS, então as cores do
    cristal ficam escritas nele, iguais às do asset da spec.
  - `BADGE_COR_DE_FUNDO` / `BADGE_COR_DO_TEXTO` em `background.js`: o badge da toolbar é
    desenhado pelo Chrome, e `chrome.action.setBadgeBackgroundColor` / `setBadgeTextColor` só
    aceitam a cor escrita. São cópias de `--veio-accent` e `--veio-accent-ink`, e andam juntas:
    mudar um dos dois tokens aqui pede mudar a cópia lá, senão o contraste de 10,4:1 se perde.
- **Tamanho, raio e duração novos também entram como token.** A exceção é a imitação do badge
  da toolbar na vitrine (`.icone-com-badge b`): o tamanho da letra e o raio dela são os que o
  Chrome desenha, não da Veio, e ficam escritos lá.
- **Tema:** o escuro é o padrão. O claro entra com `data-tema="claro"`, no `<html>` ou num trecho
  qualquer (é assim que a vitrine mostra os dois lado a lado). O seletor de tema é outro ticket.
- **Marca:** `<img class="veio-marca" src="veio/icones/icone.svg" alt="PerpetualMiner">` e
  `<span class="veio-nome">Perpetual<b>Miner</b><span class="veio-cursor"></span></span>`.
  O cursor ouro pisca a cada 1,1 s e fica parado com `prefers-reduced-motion: reduce`.
- **Fontes:** `var(--veio-fonte-ui)` para interface e frases, `var(--veio-fonte-mono)` para número,
  contador, atalho e custo. As duas cobrem cirílico.

## Os componentes

**Um componente existe uma vez.** Uma tela que precisa de um botão usa
`.veio-botao`; ela não redesenha o botão dela. Se falta uma variante, ela entra
aqui, com o nome da spec, e passa a valer para todas as telas.

- **Botões:** `.veio-botao` com `--primario` (ouro, um por tela), `--secundario`,
  `--fantasma`, `--contorno` (o botão comum do Painel: só a borda, com o acento no
  hover), `--perigo` (contorno: a entrada que abre o modal destrutivo) e
  `--perigo-cheio` (só o botão que confirma dentro dele). `.veio-botao-icone` é
  circular e sempre leva `aria-label`, porque não tem texto.
- **Campos:** `.veio-campo` em `input`, `select` e `textarea`, dentro de
  `.veio-busca` quando tem lupa e ×. O erro é dito por `aria-invalid="true"`, que
  pinta a borda e o leitor de tela também ouve; a mensagem vai num
  `.veio-campo-erro` abaixo.
- **Toggle e checkbox:** `.veio-toggle` (trilho de 40×24) e `.veio-checkbox`,
  desenhado (quadrado de raio 6, cheio de acento com o visto). O estado misto do
  cabeçalho de uma lista é o `indeterminate`, com um traço:
  `refletirSelecao(checkbox, selecionados, total)`.
- **Selos:** `.veio-selo` neutro para a Fonte (contorno e ícone, sem a cor de
  marca de terceiro) e `--ok` / `--info` / `--erro` para estado (fundo suave, só
  o texto).
- **`kbd`:** `.veio-kbd` para o atalho gravado e `.veio-kbd--sem-atalho`, o
  tracejado de GLB-02, quando não há nenhum.
- **Modal:** `.veio-scrim` por fora, `[role="dialog"]` por dentro, aberto por
  `abrirModal(scrim)`. O foco entra no botão seguro — o `[data-foco-seguro]`, ou
  o primeiro que não está pintado de perigo —, fica preso enquanto o modal está
  aberto, e volta para quem abriu. Esc e o clique fora fecham. O resto da página
  fica `inert`.
- **Toast e aviso:** o toast (`mostrarToastDeSucesso`) é **só para sucesso
  curto**: some sozinho depois de 2,6 s mais o tempo de leitura do texto, e
  aparece dentro de `dentroDe` (o `body`, se nada for dito), com o tema dali. Todo
  erro que pede ação é `montarAviso(…)`, que fica no lugar do problema até ser
  fechado, com a ação ao lado e a causa técnica num Detalhes recolhido (V3).
- **Esqueleto:** `.veio-esqueleto` no lugar do conteúdo em espera curta, sem
  texto (C3). O brilho é sinal de estado e para com movimento reduzido.
- **Estado vazio:** `.veio-vazio` no lugar do conteúdo quando não há o que
  mostrar (C1). Ele ensina o que fazer e leva a ação junto quando existe uma —
  “Limpar busca”, em PAI-04.
- **Linha de frase:** `.veio-frase`, com a Palavra grifada por
  `escreverFrase(no, texto, palavra)` — uma faixa `kw-bg` de 50% a 94% da linha,
  sem raio — e o chip de `montarChipDaPalavra(palavra, { detectada })`, que diz
  `palavra:` quando a pessoa a escolheu e `auto:` quando foi detectada. Onde a
  pessoa escolhe a Palavra na própria frase, `escreverFraseClicavel(no, trechos)`
  escreve cada palavra como `role="button"` (`aria-pressed`), com a mesma faixa
  na escolhida e uma parada só do Tab por frase; `andarEntrePalavras(evento)` e
  `focarPalavra(palavra)` levam o foco pelas setas. Dentro de uma ilha `surface`,
  o cartão é `.veio-frase--na-ilha` (fundo `bg`).

**A cópia não mora aqui.** Quem chama passa o texto já buscado no catálogo da
Voz: `abrirModal` não conhece “Apagar 12 frases?”, a tela é que a pede por
`textoDaVoz('PAI-13.titulo', { n })`. O aviso chega a recusar o serviço sem o
rótulo do × — ele não inventa um.

As três únicas palavras que a base escreve sozinha estão em
`ROTULOS_DO_PADRAO`, uma constante interna de `componentes.js` (não
exportada), porque não são estado de tela nenhuma e por isso não têm ID: `palavra:` e `auto:`, travados no glossário (CONTEXT.md), e `Detalhes`, o
nome que a regra V3 da Voz dá ao recolhido.

### Tokens que a spec não nomeia

A tabela da spec cobre a cor. O que os componentes pediram além dela entrou em
`tokens.css` com o nome da família a que pertence, e não como valor solto:
`--veio-danger-ink` (o texto sobre o perigo preenchido, irmão de
`accent-ink`), `--veio-scrim` e `--veio-sombra` (as camadas que flutuam),
`--veio-brilho` (o fio de luz do botão primário), `--veio-sombra-ilha` (a
sombra suave das ilhas do Painel, que não flutuam), `--veio-destaque` (o
~1,4 s da borda ouro do card aberto por endereço), `--veio-tam-tecla` e
`--veio-tam-micro` (os dois degraus abaixo de `legenda`, para a tecla e o
rótulo do chip), `--veio-raio-tecla`, `--veio-esqueleto` e `--veio-peso-rotulo` (o peso dos
rótulos da navegação do Painel; `peso-num` fica só para números).

### Diferenças conhecidas do protótipo

Os espaçamentos seguem o protótipo F; os tamanhos de texto vêm da escala de
tipo de `tokens.css`, que vale sobre os do protótipo. O que ainda difere dele, e
por quê:

- **Estado vazio sem título.** O protótipo tem um `h5` acima do texto; a Voz
  (C2) dá ao vazio uma frase só, com a ação, e a spec da superfície vale sobre
  o protótipo.
- **Chip da Palavra sem ×.** O × de tirar a Palavra precisa de um rótulo para o
  leitor de tela, e o catálogo da Voz ainda não tem esse estado. Ele entra
  quando a cópia for aprovada.

O toggle é `border-box` no próprio trilho: sem isso, uma página em `content-box`
deixaria o botão ligado a 4 px da borda em vez de 2.

## Vitrine

A página que mostra os tokens, a escala de tipo, os raios, uma frase em russo e **todos os
componentes**, nos dois temas e nos estados normal, foco, desabilitado e erro, fica na pasta de
testes, em [`e2e/vitrine/vitrine.html`](../e2e/vitrine/vitrine.html). Ela é servida pelo próprio
seam (`cd e2e && npm test`, ou o servidor de fixtures) para carregar os mesmos tokens, as mesmas
fontes, os mesmos componentes e o mesmo catálogo da Voz que a extensão carrega.

Cada componente aparece nos estados que ele tem: botão e campo têm foco e
desabilitado (e o campo, erro); um selo ou um `kbd` só têm o normal. A linha
“foco” é pintada com `demo-de-foco`, uma classe da própria vitrine — sem o
prefixo `veio-`, porque não é componente —, e um teste compara esse anel parado
com o anel que o foco de verdade desenha, para a referência não passar a mentir.

A galeria é montada por [`componentes-da-vitrine.js`](../e2e/vitrine/componentes-da-vitrine.js),
uma vez por tema, pela mesma função: as duas colunas nunca divergem. A cópia das amostras vem do
catálogo por ID (a lista está em `CATALOGO_DA_VITRINE`), e o teste confere que o que está na tela é
o que `textoDaVoz` devolve. O que é rótulo da própria vitrine — “Botões”, “desabilitado”, “Mostrar
o toast” — fica marcado com `data-vitrine-chrome`, porque é andaime da página de referência, não
cópia de uma tela do produto.

Depois da revisão do dono, a vitrine é **a referência visual**: uma mudança de componente se vê
primeiro aqui.

## Fontes: licença

Manrope e JetBrains Mono são SIL Open Font License 1.1. Os textos das licenças estão em
`fontes/OFL-Manrope.txt` e `fontes/OFL-JetBrainsMono.txt`. Os arquivos são os subsets latin e
cyrillic publicados pelo Google Fonts (Manrope v20, JetBrains Mono v24), em formato variável: um
arquivo por subset cobre toda a escala de pesos.
