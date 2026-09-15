# Identidade visual “Veio” e design system base

Resolução do ticket [Identidade visual própria & design system base](https://github.com/vinicius928e8r84/PerpetualMiner/issues/3) do mapa [Redesign do front-end do PerpetualMiner](https://github.com/vinicius928e8r84/PerpetualMiner/issues/1). Todo protótipo de tela deste mapa herda o que está aqui.

- Protótipo: [`prototipo-identidade.html`](prototipo-identidade.html). Abra com `python3 -m http.server` nesta pasta. `?variant=F` mostra a fundação travada; `A`–`D` são as 4 direções avaliadas; `Z` mostra as quatro lado a lado. As setas ← → trocam a tela e **T** alterna o tema.
- Assets: [`assets/icone.svg`](assets/icone.svg) e `assets/icone-{16,32,48,128}.png`, que são os ícones do manifest.

## Decisão

Quatro direções foram avaliadas: A Veio (grafite + ouro), B Caderno (papel + tinta), C Sinal (preto + menta) e D Aurora (índigo + violeta). O dono escolheu:

- **Base A · Veio.**
- **Tema escuro como padrão, claro opcional.**
- **Da B:** a marcação, isto é, a keyword grifada com marca-texto.
- **Da C:** a animaçãozinha, o cursor piscando no fim do nome.
- **Da D:** os arredondamentos: pílulas, toggles redondos e cantos generosos.

## Marca

- **Símbolo:** um cristal de quartzo, cortado por um *veio* horizontal: a linha de legenda de onde a frase é minerada. Três faces em tons de ouro sobre um azulejo grafite `#1B1A17`, com raio de 28 no grid de 128.
- **O azulejo é sempre escuro,** nos dois temas e nas duas toolbars do Chrome. É isso que faz o ícone ler em 16 px.
- **Nome:** `Perpetual` em peso 500 + `Miner` em 800 (Manrope), seguido de um cursor ouro que pisca (ver [Movimento](#movimento)).
- **Some o legado:** raio ciano, bolha gradiente, balão verde, livro roxo e “P” genérico. O `icon.svg` da raiz é substituído por `assets/icone.svg`.
- **Badge da toolbar** (contador do Auto Miner): fundo `#F5B83D`, texto `#1A1204` (10,4:1). Vai em `setBadgeBackgroundColor` / `setBadgeTextColor`.

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
| `kw-bg` | `rgba(245,184,61,.40)` | `rgba(240,174,46,.45)` | faixa do marca-texto da keyword |
| `kw-fg` | `#F2EEE6` | `#1C1A16` | texto da keyword |
| `success` | `#6FCF8E` | `#1F7A45` | Enviada ao Anki, Bridge online |
| `danger` | `#FF7A66` | `#B42318` | apagar, falha, Bridge offline |
| `info` | `#86BDF2` | `#1D5FA8` | Exportada |

Os fundos suaves de estado (`*-soft`) são o próprio token entre 8% e 18% de opacidade.

**Um só acento.** O ouro é o único acento. Verde, vermelho e azul são semânticos (estado), nunca decoração.

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
| título | 20 / 700 |
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
| 999 | botões, badges, chips e o botão flutuante (círculo) |

- Botões só-ícone são circulares.
- Toggle: trilho de 40×24 com botão redondo. Ligado = trilho `accent` e botão `accent-ink`.
- Inputs mantêm a borda `border-strong`, que é o que garante 3:1. Nada de input sem borda.
- **Seleção não usa barra lateral:** o card selecionado ganha borda `accent` a 45% + fundo com 5% de acento.

## Keyword (da B)

A keyword ativa é **grifada**: uma faixa `kw-bg` cobre de 50% a 94% da altura da linha, atrás do texto em `kw-fg`, sem raio. Nas duas cores de chip, `keyword` e `auto`, o rótulo fica em mono.

## Movimento (da C)

- **A única animação da identidade** é o cursor ouro depois do nome: pisca a cada 1,1 s, em `steps(1)`. Aparece no cabeçalho do popup e do painel.
- Com `prefers-reduced-motion: reduce`, o cursor fica parado.
- Nenhuma outra animação ambiente. Transições de estado ficam em ≤ 150 ms.

## Componentes base

Todos estão desenhados no protótipo (`?variant=F`, seção Componentes):

- **Botões:** primário (ouro), secundário, fantasma, perigo (contorno vermelho), só-ícone.
- **Campos:** busca com ícone, select, textarea, número (limite diário).
- **Toggle** (Auto Miner EN/RU) e **checkbox** (`accent-color`).
- **Badges de Fonte** (Netflix, YouTube, Web, PDF, Livro, Manual): neutros, com ícone. Sem cor de marca de terceiros.
- **Badges de estado:** Enviada ao Anki (`success`), Exportada (`info`), Bridge online/offline (ponto colorido); `kbd` para atalhos.
- **Linha de frase:** checkbox, texto com keywords grifadas, linha de Contexto (Fonte · Título · Detalhe), chip de keyword, estado e 4 ações só-ícone. Agrupada sob cabeçalhos de data em maiúsculas.
- **Barra contextual de seleção:** pílula de raio 22 que só aparece com seleção. O “Enviar ao Anki” é o primário.
- **Modal:** o fim do Envio ao Anki, com o resumo enviadas · duplicadas · falhas e as ações “Manter e marcar como enviadas” / “Apagar as N enviadas”.
- **Estados vazios:** dois, “sem frases” e “filtro escondeu tudo”.
- **Feedback in-page:** um único componente com variantes legenda · seleção · Auto Miner. Ícone circular em ouro, prévia da frase em 2 linhas e meta em mono.
- **Iconografia:** traço de 2 px num grid de 24, cantos redondos (o estilo que o painel já usa).

## Fica para outros tickets

- **Redação:** todo texto do protótipo é provisório e é decidido em [Voz, tom & catálogo de mensagens/estados](https://github.com/vinicius928e8r84/PerpetualMiner/issues/4). Isso inclui o nome do BookReader e o subtítulo “Minerador de frases para o Anki”.
- **Layout de cada tela** e a posição exata do feedback in-page ficam com os tickets de protótipo de cada superfície e com [Painel — arquitetura de informação & shell](https://github.com/vinicius928e8r84/PerpetualMiner/issues/6).
