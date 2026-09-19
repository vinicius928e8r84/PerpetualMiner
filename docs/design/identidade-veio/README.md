# Identidade visual “Veio” e design system base

Resolução do ticket [Identidade visual própria & design system base](https://github.com/vinicius928e8r84/PerpetualMiner/issues/3) do mapa [Redesign do front-end do PerpetualMiner](https://github.com/vinicius928e8r84/PerpetualMiner/issues/1). Todo protótipo de tela deste mapa herda o que está aqui.

- Protótipo: [`prototipo-identidade.html`](prototipo-identidade.html). Abra com `python3 -m http.server` nesta pasta. `?variant=F` mostra a fundação travada; `A`–`D` são as 4 direções avaliadas; `Z` mostra as quatro lado a lado. As setas ← → trocam a tela e **T** alterna o tema.
- Assets: [`assets/icone.svg`](assets/icone.svg) e `assets/icone-{16,32,48,128}.png`, que são os ícones do manifest.

## Decisão

Quatro direções foram avaliadas: A Veio (grafite + ouro), B Caderno (papel + tinta), C Sinal (preto + menta) e D Aurora (índigo + violeta). O dono escolheu:

- **Base A · Veio.**
- **Tema escuro como padrão, claro opcional.**
- **Da B:** a marcação, isto é, a palavra grifada com marca-texto.
- **Da C:** a animaçãozinha, o cursor piscando no fim do nome.
- **Da D:** os arredondamentos: pílulas, toggles redondos e cantos generosos.

## Marca

- **Símbolo:** um cristal de quartzo, cortado por um *veio* horizontal: a linha de legenda de onde a frase é minerada. Três faces em tons de ouro sobre um azulejo grafite `#1B1A17`, com raio de 28 no grid de 128.
- **O azulejo é sempre escuro,** nos dois temas e nas duas toolbars do Chrome. É isso que faz o ícone ler em 16 px.
- **Nome:** `Perpetual` em peso 500 + `Miner` em 800 (Manrope), seguido de um cursor ouro que pisca (ver [Movimento](#movimento)).
- **Some o legado:** raio ciano, bolha gradiente, balão verde, livro roxo e “P” genérico. O `icon.svg` da raiz é substituído por `assets/icone.svg`.
- **Badge da toolbar** (contador da mineração automática): fundo `#F5B83D`, texto `#1A1204` (10,4:1). Vai em `setBadgeBackgroundColor` / `setBadgeTextColor`.

## Tema e tokens

O escuro é o padrão; o claro é opcional. O overlay in-page usa **sempre os tokens escuros**, porque vive em cima de páginas de terceiros.

| token | escuro (padrão) | claro | uso |
|---|---|---|---|
| `bg` | `#121110` | `#F7F4EE` | fundo da página |
| `surface` | `#1B1A17` | `#FFFFFF` | cards, popup, modal |
| `surface-2` | `#262420` | `#F0EBE1` | preenchimento secundário, estatísticas |
| `border` | `#302D27` | `#E4DCCD` | divisórias decorativas |
| `border-strong` | `#736B5D` | `#968C79` | borda de controle (≥ 3:1) |
| `text` | `#F2EEE6` | `#1C1A16` | texto |
| `muted` | `#A89F90` | `#625B4F` | texto secundário |
| `accent` | `#F5B83D` | `#F0AE2E` | preenchimento de botão primário, toggle ligado, cursor |
| `accent-ink` | `#1A1204` | `#1A1204` | texto sobre `accent` |
| `accent-text` | `#F5B83D` | `#855608` | acento usado como texto/link |
| `kw-bg` | `rgba(245,184,61,.40)` | `rgba(240,174,46,.45)` | faixa do marca-texto da palavra |
| `kw-fg` | `#F2EEE6` | `#1C1A16` | texto da palavra grifada |
| `success` | `#6FCF8E` | `#1F7A45` | Enviada ao Anki, Bridge online |
| `danger` | `#FF7A66` | `#B42318` | apagar, falha, Bridge offline |
| `info` | `#86BDF2` | `#1D5FA8` | Exportada; segunda série em gráficos (ver abaixo) |

Os fundos suaves de estado (`*-soft`) são o próprio token entre 8% e 18% de opacidade.

**Um só acento.** O ouro é o único acento. Verde, vermelho e azul são semânticos (estado), nunca decoração.

**Exceção de dataviz.** Em gráficos (barras, anel), ouro e `info` marcam séries: ouro = foto real / maduros; `info` = gerada por IA / recentes (`muted` e `danger` completam: sem imagem / novos e falhou). A exceção vale só dentro do gráfico e da legenda dele. Fora de gráficos, o ouro segue só para ação primária e seleção.

**Contraste (WCAG AA):**
- texto ≥ 4,5:1;
- bordas de controle e ícones ≥ 3:1.

Todos os 16 pares da tabela de contraste do protótipo passam nos dois temas. Ela é calculada ao vivo com os valores acima.

## Tipografia

**Famílias** (as duas têm cirílico, verificado na API do Google Fonts):
- **Manrope** para interface, títulos e frases.
- **JetBrains Mono** para números, contadores, atalhos (`kbd`) e custos.

**Escala:**

| papel | tamanho / peso |
|---|---|
| display | 32 / 800, tracking −0,02em |
| título de hero | 24 / 800 (Boas-vindas) |
| título de página | 22 / 700 (cabeçalho de área do painel) |
| título de modal | 20 / 700 |
| título de card | 15 / 700 (cards de Configurações) |
| frase | 15 / 400, altura 1,5 |
| corpo | 13,5 / 400 |
| legenda | 11,5 / 600–800, maiúsculas com tracking 0,12–0,16em nos títulos de seção |
| número | mono 600 |

**Nota para a construção:** empacotar os `.woff2` na extensão, com os subsets latin + cyrillic. Não usar a CDN. No `content.js`, carregar via `web_accessible_resources` ou cair para `system-ui` dentro do Shadow DOM.

## Forma (da D)

**Raios:**

| raio | uso |
|---|---|
| 10 | ícone pequeno, menu |
| 12 | inputs |
| 14 | cards, linhas de frase, estatísticas |
| 20 | painéis e modal |
| 22 | barra contextual de seleção |
| 999 | botões, badges, chips e o botão flutuante (círculo) |

- Botões só-ícone são circulares.
- Toggle: trilho de 40×24 com botão redondo. Ligado = trilho `accent` e botão `accent-ink`.
- Inputs mantêm a borda `border-strong`, que é o que garante 3:1. Nada de input sem borda.
- **Seleção não usa barra lateral:** o card selecionado ganha borda `accent` a 45% + fundo com 5% de acento.

## Palavra grifada (da B)

A palavra que o cartão ensina é **grifada**: uma faixa `kw-bg` cobre de 50% a 94% da altura da linha, atrás do texto em `kw-fg`, sem raio. Nos dois chips, `palavra: …` (você escolheu) e `auto: …` (foi detectada), o rótulo fica em mono. “keyword” é só o nome técnico no código e nos tokens, nunca na tela.

## Movimento (da C)

- **A única animação ambiente da identidade** é o cursor ouro depois do nome: pisca a cada 1,1 s, em `steps(1)`. Aparece no cabeçalho do popup e do painel.
- **Sinais de estado** podem pulsar ou piscar enquanto o estado dura: a pílula do gravador de atalho pulsando, o ponto de “Sincronizando…” piscando, o flash de ~1,4 s na borda do card aberto por endereço em Configurações. Só isso; nada se move sem estar dizendo algo.
- Com `prefers-reduced-motion: reduce`, o cursor fica parado e os sinais de estado ficam estáticos (a pílula, o ponto e a borda aparecem, sem pulsar nem piscar).
- Nenhuma outra animação ambiente. Transições de estado ficam em ≤ 150 ms.

## Componentes base

Todos estão desenhados no protótipo (`?variant=F`, seção Componentes):

- **Botões:** primário (ouro), secundário, fantasma, perigo, só-ícone. O perigo tem duas variantes:
  - **contorno vermelho:** a entrada que abre o modal destrutivo (ex.: “Apagar tudo…”);
  - **preenchido vermelho:** só o botão que confirma dentro do modal destrutivo (ex.: “Apagar 12 frases”).
- **Campos:** busca com ícone, select, textarea, número (limite diário).
- **Toggle** (mineração automática EN/RU) e **checkbox** desenhado como no protótipo de Frases: quadrado de raio 6 e borda forte, cheio de acento com o visto quando marcado, e um traço no estado misto.
- **Badges de Fonte** (Netflix, YouTube, Web, PDF, Livro, Manual): neutros, com ícone. Sem cor de marca de terceiros.
- **Badges de estado:** Enviada ao Anki (`success`), Exportada (`info`), Bridge online/offline (ponto colorido); `kbd` para atalhos.
- **Linha de frase:** checkbox, texto com a palavra grifada, linha de Contexto (Fonte · Título · Detalhe), chip de palavra (`palavra:` / `auto:`), estado e 4 ações só-ícone. Agrupada sob cabeçalhos de data em maiúsculas.
- **Barra contextual de seleção:** pílula de raio 22 que só aparece com seleção. O “Enviar ao Anki” é o primário.
- **Modal:** o fim do Envio ao Anki, com o resumo enviadas · duplicadas · falhas e as ações “Apagar as N enviadas” / “Manter”, com a nota sob os botões “Manter deixa as frases no histórico, marcadas como enviadas ao Anki.” (ENV-10).
- **Estados vazios:** os três da regra C2 da [Voz](../voz/README.md) (primeiro uso, filtro sem resultado e falha, que é erro e não vazio) mais a busca sem resultado (PAI-04), com “Limpar busca”.
- **Feedback in-page:** um único componente com variantes legenda · seleção · mineração automática. Ícone circular em ouro, prévia da frase em 2 linhas e meta em mono.
- **Iconografia:** traço de 2 px num grid de 24, cantos redondos (o estilo que o painel já usa).

## Fica para outros tickets

- **Redação:** o texto do protótipo é provisório; a cópia vale pelo catálogo de [Voz, tom & catálogo de mensagens/estados](../voz/README.md) ([ticket](https://github.com/vinicius928e8r84/PerpetualMiner/issues/4)). O BookReader passa a se chamar “Minerar de uma foto” (V9), e o popup não tem subtítulo: só a marca Veio + “PerpetualMiner”. A frase descritiva fica para a Boas-vindas e a loja.
- **Layout de cada tela** e a posição exata do feedback in-page ficam com os tickets de protótipo de cada superfície e com [Painel — arquitetura de informação & shell](https://github.com/vinicius928e8r84/PerpetualMiner/issues/6).
