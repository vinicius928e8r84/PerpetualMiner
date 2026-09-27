# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PerpetualMiner** (v5.0) is a Chrome browser extension (Manifest V3) that captures text from multiple sources — streaming subtitles, selected text on any page, and physical book photos — into a study history. No build step required — pure vanilla JavaScript.

## Loading the Extension

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory
4. After any code change, click the reload icon on the extension card in `chrome://extensions/`

## Architecture

### Files

| File | Role |
|------|------|
| `manifest.json` | Permissions, content script registration |
| `content.js` | Injected into all pages; mines subtitles, injects floating button |
| `background.js` | Service worker; handles `SALVAR_HISTORICO` messages and context menu clicks; writes to `chrome.storage.local` and syncs to Firestore |
| `tombstone.js` | Tombstone of a deleted phrase (`chrome.storage.sync` keys and the Firestore `meta/deleted` PATCH), shared by `background.js` (`importScripts`) and `painel.html` |
| `popup.html/js/css` | Quick-access popup showing last 5 phrases |
| `painel.html/js/css` | Full dashboard to view, copy, and delete all saved phrases; Google login and Firestore sync |
| `painel-shell.js` | The panel's “Ilhas” shell: one page, one area per address (`#frases`, `#anki/<aba>`, `#configuracoes[/<seção>]`), the sidebar indicators (phrase total, Conexão com o Anki dot), the rail below ~1000 px, the F1 strip and the Configurações cards opening and closing. See “Panel shell” below |
| `painel-conta.js` | The account in the panel: one state drawn in the Configurações › Conta & sync card, its closed-row summary and the sidebar chip (CFG-01…10). See “Account (Conta & sync)” below |
| `painel-atalhos.js` | The Configurações › Atalhos card: records “Minerar legenda” and “Minerar seleção” in their own row (CFG-11…14, 19, 21, 22, 33, 34). See “Shortcuts (Atalhos)” below |
| `lib/atalhos.js` | `PerpetualMiner.Atalhos` — the recorded shortcuts in one place: where they are stored, the defaults, the PT-BR label, “same shortcut” and event matching. Loaded by the content script and the panel |
| `painel-chave.js` | The Configurações › Chave do Gemini card: the saved key masked, with Trocar chave; the empty key's field; `geminiApiKey`. See “Chave do Gemini and Zona de perigo” below |
| `painel-perigo.js` | The Configurações › Zona de perigo card: the Apagar tudo entry, its reach with and without an account, and the Veio confirmation modal (CFG-17). See “Chave do Gemini and Zona de perigo” below |
| `painel-envio.js` | The Envio ao Anki: Enviar ao Anki in the Frases bar, the progress modal (one card per Envio), the tracking saved in `pm_envio` and the summary (ENV-03…15) that opens by itself in any area. See “Envio ao Anki” below |
| `bookreader.html/js/css` | BookReader page: upload a book photo → Gemini Vision extracts marked passages |
| `veio/` | Shared Veio identity: `tokens.css` (color/type/radius/motion tokens + the mark's blinking cursor), `tema.js` (the chosen theme, applied before the first paint on every page), `componentes.css` + `componentes.js` (the base components, defined once), `fontes/` (packaged Manrope and JetBrains Mono `.woff2`, latin + cyrillic), `icones/` (the toolbar PNGs, the SVG mark and `icone-claro.svg`, which `.veio-marca` swaps in on the light theme through `--veio-marca`). See `veio/README.md` |
| `lib/voz/catalogo.js` | The Voice catalog as data: the 189 approved copy states from `docs/design/voz/` |
| `lib/voz/texto.js` | `textoDaVoz(id, valores)` — looks a state up by ID and fills its templates |
| `lib/idioma.js` | `detectarIdioma(texto)` — the single language detector (Cyrillic → Russo, else Inglês) |
| `lib/firebase/` | Firebase compat SDK bundles (app, auth, firestore) — loaded only by painel.html |
| `test_gemini.js` | Standalone Node.js script to list available Gemini models (not part of the extension) |
| `e2e/` | Playwright suite that runs the unpacked extension in Chromium (own `package.json`; see Testing) |
| `preview/` | The static site Vercel publishes per branch, so a visual change can be looked at in a browser: `montar.mjs` assembles it, `chrome-simulado.js` fakes `chrome.*` with sample data inside the copied pages. See `preview/README.md` |

### Data Flow

```
1. Streaming subtitles
   Video page → content.js (recorded caption shortcut, default Alt+S) → background.js → chrome.storage.local["frases"]
                                                     └→ Firestore (if logged in)

2. Selected text (any page/PDF)
   User right-clicks → context menu "Minerar com PerpetualMiner" (MIN-08, from the catalog)
   → background.js (contextMenus listener) → chrome.storage.local["frases"]
                                           └→ Firestore (if logged in)

3. Physical book photos
   bookreader.html → user uploads photo → Gemini Vision API (gemini-3-flash-preview)
   → parsed passages → chrome.storage.local["frases"]
                     └→ Firestore (if logged in)
```

### Shared base (`lib/`)

`lib/voz/catalogo.js`, `lib/voz/texto.js` and `lib/idioma.js` are plain scripts (no build) that
every surface loads before its own script: the three pages via `<script src>`, the service worker
via `importScripts`, and the content script via the `js` array in `manifest.json`. They attach to
the `PerpetualMiner` global, so each consumer starts with
`const { detectarIdioma } = PerpetualMiner;`.

Code that compares a language uses `PerpetualMiner.IDIOMAS` (`IDIOMAS.RUSSO`, `IDIOMAS.INGLES`),
not a loose `'Russo'`/`'Inglês'` string.

**New or rewritten copy comes from the catalog, never from a literal.** The surfaces still hold
their old literals; each redesign step moves the surface it rebuilds (today only the context menu
reads from the catalog). `textoDaVoz('MIN-08')` returns the approved
string for that state; `textoDaVoz('PAI-12.titulo')` reaches a part of a state that has several
(modal title, body, buttons). Templates:

- `{nome}` — substituted. A `number` is formatted pt-BR (`1284` → `1.284`); a string goes in as is.
- `{n|singular|plural}` — picks by the value of `n` (`|n| === 1` → singular).

The function is named `textoDaVoz`, not `texto`, because `texto` is the phrase text all over the
codebase and a global by that name would be shadowed inside almost every function.

An unknown ID, a part that does not exist and a missing template value all throw right away, so a
state never renders as an empty string by accident. Only the entries the catalog marks as deliberate
silence (`POP-01`, `POP-05`, `PAI-16`…) are `''`.

Money (`BRG-03`, `BRG-26`) takes an already-formatted `{valor}`: how many decimals to show is an
Advanced preference that belongs to the panel, not to the catalog.

The content script loads the whole catalog into every frame even though it only needs
`detectarIdioma` today. That is deliberate: the overlay step rebuilds its feedback component from
`MIN-01`…`MIN-11`, and the design spec has the content script reading its copy from the catalog like
every other surface.

### Panel shell (`painel-shell.js`)

`painel.html` is one page with three areas; the shell (`docs/design/painel/shell/`, variant B) only swaps the view, so
nothing reloads when switching areas — filters, page, selection, sync and the Envio tracking in `painel-envio.js` stay as
they are. Addresses: `#frases` (default, and anything unknown), `#anki/custos|baralhos|vocabulario|ajustes`
(`#anki` alone opens Custos; the sidebar link reopens the last tab seen), `#configuracoes[/conta|atalhos|chave|aparencia|perigo]`
(opens the card, scrolls to it and flashes its border; bare `#configuracoes` shows every card closed). The Anki tabs are the Veio segmented control; picking one sets the hash,
so the browser's back button walks through areas and tabs.

The shell owns the sidebar and `painel.js` reports to it through `PerpetualMiner.Shell`:
`mostrarTotalDeFrases(n)`, `aoEntrarNaArea(area, fn)` (the Anki area refreshes its data on entry), `areaAtual()` and `aoMudarAConexao(fn)` (the Conexão state now and on every change: `'conectando' | 'ligada' | 'desligada'`). The shell polls
`/health` of the Conexão com o Anki itself every 15 s: the dot (BRG-01/BRG-02, in the tooltip and as the link's
accessible description) and, while it is off, the F1 strip (ENV-01) with “Tentar de novo” at the top of the Anki area.

The shell's fixed copy comes from the catalog through `data-voz`, `data-voz-aria` and `data-voz-title` attributes in
`painel.html`, which `painel-shell.js` fills on load. The sidebar and the content island are both the height of the window
and start and end together; the content scrolls inside its island (entering an area scrolls it back to the top). Below 1000 px the sidebar becomes a 76 px rail: labels leave
the screen but stay as the links' names (visually hidden, not `display: none`) and become tooltips.

Until an area is rebuilt, today's content lives inside the shell in `.conteudo-de-hoje` blocks marked
`data-tema="claro"`: its CSS was drawn for a light background. In Frases that block holds only today's bulk actions
(select page/all, edit, delete, export, send to Anki, import, bulk add) until #30, #31 and #32 rebuild them.

Configurações is the “summary first” variant C (`docs/design/painel/configuracoes/`): each of the five cards (Conta & sync ·
Atalhos · Chave do Gemini · Aparência · Zona de perigo) is one closed row — icon tile, title, a summary of its state, chevron — and
opens in place; several can be open at once. The whole row toggles, and the title's `<button aria-expanded>` inside the
`<h2>` is the control for the keyboard and the screen reader. The cards live in a size container: below ~560 px of
content the summary leaves the row and the body loses its 62 px indent. Aparência holds the theme selector
(CFG-29…31), a segmented control whose choice `veio/tema.js` stores and every open page follows through
`chrome.storage.onChanged`, with no reload and no toast. The closed-row summaries of Atalhos,
Chave do Gemini and Zona de perigo (CFG-28) are drawn by the shell from what is already stored: both recorded
shortcuts relabelled in PT-BR (`lib/atalhos.js`), `geminiApiKey` masked to its first and last 4 characters (or “Sem chave” in
`danger`), and the phrase total (“1.284 frases”, “Nenhuma frase”); they follow `chrome.storage.onChanged`.
`#configuracoes/<seção>` also tells whoever asked through `Shell.aoAbrirASecao(secao, fn)`, with the card already open.

### Chave do Gemini and Zona de perigo (`painel-chave.js`, `painel-perigo.js`)

The Chave do Gemini card owns `geminiApiKey` (the same key the Minerar de uma foto reads) straight from
`chrome.storage.local`. Saved, it shows “Chave salva” and the key masked as in the summary (`Shell.mascararChave`), with
Trocar chave, which opens an *empty* field with Salvar chave and Cancelar, so the old key never reaches the screen.
Empty, the field stays open with the note. The field is a `<form>`, so Enter saves like the button; an empty (or blank)
save sets `aria-invalid` and the CFG-16 line linked by `aria-describedby`, and typing clears it. Saving trims the key,
shows the CFG-16 toast and goes back to the summary. `#configuracoes/chave` with the key empty focuses the field. The key
is not validated.

The Zona de perigo card is drawn from what `painel.js` reports through `PerpetualMiner.Perigo`: `mostrarTotal(n)`,
`mostrarConta(comConta)` and `aoApagarTudo(apagar)`. The outline danger button only opens the Veio modal (CFG-17:
Cancelar has the initial focus, Esc and a click outside close it); only the filled button inside it calls
`apagarTudo()`, which clears the history, and with an account the cloud, then shows the CFG-18 toast — only once the
cloud is empty too; a cloud failure shows in the Conta & sync card and the chip instead (Q4). The description (CFG-32),
the reach line and the modal body say “all computers of your account” only with an account. Until the total arrives,
the entry row stays hidden, so it never shows “Nenhuma frase para apagar” while the list is still loading. No `confirm()`.

### Shortcuts (`painel-atalhos.js`, `lib/atalhos.js`)

Two recorded shortcuts, each recorded in its own row of the Configurações › Atalhos card: **Minerar legenda**
(`pm_atalho_legenda`, default Alt+S) and **Minerar seleção** (today's `pm_atalho`, default none). A shortcut is a
key with at least one of Ctrl/Alt/Shift (a bare key would take that letter from every text field) or an extra mouse
button (middle, back, forward, others as “Botão N do mouse”), also with modifiers. Meta is never recorded, and an
event with Meta never matches. While recording (CFG-13) the row's key becomes a pulsing gold pill and its button Cancelar; the other
row's button is disabled; Esc without a modifier cancels, and so does leaving the card (closing it, another address
or area); left and right clicks do not record, so Cancelar stays
clickable; back and forward do not navigate. A combination that already
belongs to the other shortcut is refused with CFG-19 in `danger` and recording goes on. A saved key flashes once, no
toast. “Restaurar atalhos padrão” (CFG-21/22) shows only when something differs from the defaults and writes
`{legenda: Alt+S, seleção: null}` at once, with no confirmation and no toast.

`lib/atalhos.js` is the one owner of the stored shape, the defaults, the PT-BR label (`rotuloDoAtalho`, rebuilt from
the fields, so a label stored in English shows in PT-BR) and matching (`mesmoAtalho`, `correspondeAoAtalho`).
`content.js`, the shell's closed-row summary and the Frases empty state (PAI-02) read it through
`acompanharAtalhos`, so a new shortcut applies at once, without reloading. The manifest declares no `commands`: a
recorded shortcut can be a mouse button, which `chrome.commands` cannot take, so it lives only in the content script.
A mouse caption shortcut takes the button only when there is a caption to mine; elsewhere the button does what it
always did. Back and forward navigate on the *release*, not on `mousedown`, so `lib/atalhos.js` also holds that
release (`guardarSolturaDoBotao` after a shortcut fires, `guardarTodasAsSolturas` while recording) — otherwise the
page would leave while mining or recording.

The popup still has its own old recorder for `pm_atalho` until the popup step (#6 of the build order) rebuilds it, but it
records through `lib/atalhos.js` with the same rules: a key needs a modifier, and the Minerar legenda combination is
refused with CFG-19 in its hint while recording goes on (otherwise one key would mine twice). The `kbd` itself is the
base component `Veio.montarTecla(rotulo, { seVazia })`; the caller passes the “Sem atalho” copy (CFG-12 or GLB-02).

### Account (`painel-conta.js`)

One account state, drawn in three places that always agree: the open Conta & sync card, its closed-row summary
(“Nome · <chip state>”, CFG-27) and the sidebar chip, which links to `#configuracoes/conta`. `painel.js` reports to it
through `PerpetualMiner.Conta`: `mostrarConta(usuario)`, `mostrarSincronizacao(situacao, { n, total, detalhes })`,
`mostrarFalhaNoLogin(detalhes)` and `aoPedir({ entrar, sair, tentarDeNovo })`. The situations are the spec's states,
named by `Conta.SITUACOES` (never a loose string): `SINCRONIZANDO` (CFG-01), `PRIMEIRA_SUBIDA` and
`PRIMEIRA_SUBIDA_FALHOU` (CFG-09), `SINCRONIZADO` (CFG-02), `SEM_SINCRONIZAR` (CFG-03), `PARCIAL` (CFG-05, counting
this computer's phrases, not the whole cloud collection), `RECUSADO` (CFG-04) and `EXPIROU` (CFG-08); with no profile
name the account is “Conta Google” (CFG-10).

A sync problem shows **only** in the card and the chip — never a toast or a strip in another area. The one exception is
the spec's own PAI-15: when a delete reaches this computer but not the cloud, Frases also shows the persistent aviso
saying those phrases may come back, with “Tentar de novo”; the card and the chip still say the computer is out of sync. `painel.js` tags a
cloud error with its situation (`erroDaResposta`: HTTP 401 → `EXPIROU`, 403/PERMISSION_DENIED → `RECUSADO`, the rest
`SEM_SINCRONIZAR`, or `PRIMEIRA_SUBIDA_FALHOU` when the first upload reached nothing) and the raw message goes to the card's collapsed “Detalhes”. Closing Google's login window is not an
error and shows nothing; a login that fails shows CFG-07 in the card with “Tentar de novo”.

### Frases list (`painel.js`, docs/design/painel/frases/, variant A)

Each phrase is a `.veio-frase` card under a date header (PAI-11: hoje · ontem · há N dias), 10 per page. The card
writes the text word by word with `escreverFraseClicavel` (a `.veio-frase--na-ilha` card: `bg` inside the `surface`
island): each word is a `role="button"` with `aria-pressed`; clicking it (or Enter/Space) picks or
unpicks the Palavra, stored as `keywords` (`word@tokenIndex`, `|` between groups) with `autoKeyword: false`. The phrase
is a single Tab stop and the arrow keys move between its words (`andarEntrePalavras`). The chip below says `palavra:` or `auto:`
(`montarChipDaPalavra`) with × (clear) and + (another group). The Contexto line has the Fonte badge (PAI-29 names;
an unknown Fonte shows its stored name; `fonteDaFrase` reads `contexto.fonte`, else `streaming`, for both the badge and
the Fonte filter), Título · Detalhe and the state badge (PAI-08).

The area header carries **Minerar frases** (ADD-01), which opens today's bulk add until #31 brings its menu. The filter
row: one Fonte select (the Fontes in the history), language, order, the search (text and Título, with ×)
and the “Ocultar enviadas e exportadas” toggle. Below it, the **Selecionar página** checkbox (PAI-31) marks the whole
page, and shows the mixed state when part of it is selected (`refletirSelecao`). Changing a filter or the search clears
the selection, so no action lands on a phrase that is not on screen; reordering keeps it.

With a selection, that same row becomes the **contextual bar** (PAI-32), sticky at the top of the island: × Desmarcar
todas, the count (PAI-06), “Selecionar todas as N frases” once the whole page is marked (N is what the filters show,
across pages), and Editar contexto · Exportar .txt · Apagar · Enviar ao Anki. The page checkbox stays at its start,
with its label only for the screen reader.

The card's four icon actions (PAI-30) appear on hover and on focus. **Editar texto** swaps the text for a field in
place (PAI-33: Enter saves, Esc cancels, Cancelar · Salvar texto, no toast — the change is on screen, PAI-16);
`edicaoDeTexto` holds the phrase and the draft, so a redraw does not lose it. **Editar contexto** opens the same modal
for 1 phrase (fields filled, no toast) and for N (fields blank stay as they are, toast PAI-22). **Apagar** opens one
modal for 1 phrase (PAI-12, no toast) and for the selection (PAI-13, toast PAI-14); the body only mentions the other
computers when an account is connected. Both modals are the Veio modal, driven by `abrirModal`. The list states: 5 skeleton cards until the first load finishes
(PAI-01), first run (PAI-02: its `titulo` in bold above the text, with the recorded caption shortcut in a `kbd`, or, with none, the dashed “Sem atalho” `kbd` and a Definir atalho link to `#configuracoes/atalhos`, GLB-02), filters hid everything (PAI-03) and search without
result (PAI-04, plus Limpar filtros when a filter is on). Everything is built with DOM nodes, never HTML strings.

Two marks, never the same one: `status: 'exported'` is **Enviada ao Anki** (the phrase went into a completed Envio;
the field keeps its pre-glossary name), and `exportadaTxt` is **Exportada** (it was written to a .txt). Exporting never
writes the Envio's mark, a phrase that has both says Enviada ao Anki, and “Ocultar enviadas e exportadas” hides either.
Both marks travel to the cloud and merge on load in the same place (`carregarFrasesFirestore`).

### Envio ao Anki (`painel-envio.js`)

The Envio is its own module; `painel.js` hands it, once the first read of the history finishes (`Envio.usar`), only
what it does with phrases: the selection, the mining line, the send settings, `apagar(ids)` (the usual delete, with
tombstones, no toast) and `marcarComoEnviadas(ids)` (`status: 'exported'`, no toast, the selection untouched).

**Enviar ao Anki** opens the progress modal at once (ENV-05 is silence), with one card per Envio — one per language:
“Envio em inglês · 12 frases”, the stage in people's words (ENV-07, from the bridge `stage`), the 7 stages as segments
(the done ones full, the current one filling by its `done/total`; all in the outcome's color at the end), “etapa 4 de 7 ·
atualizado há 1 min” (ENV-08) and a collapsed Detalhes with jobId, raw stage, ISO
time (the bridge's `updatedAt`, or when the Envio was created) and `lastError`. A card that needs the person has no error box: its stage and segments turn calm (muted), the reason is one short
sentence and the action is a gold link below it (`pedidoDoCartao`). An Envio that ended partial or failed while another
still runs gets **Continuar envio →** (`POST /jobs/<id>/retry`, toast ENV-14); when the bridge says Windows would not let
it close a stuck Anki (`ankiError: 'repair_access_denied'`), the reason is BRG-18. Phrases go to the Envio of their language by `ehRussa` (`lib/idioma.js`), the same rule
the list uses: the stored `idioma`, or the text when it is missing. A `POST /jobs` that fails does not hide the Envio: its card says “Não começou”
with the ENV-03 reason (`motivoSemResposta` when the request never got an answer), its cause in Detalhes, and
**Tentar de novo →**, which re-creates only that language. While such an error is on a card (or a Continuar envio that failed, ENV-14), the summary
waits: the progress modal comes back with it, and the summary opens once the person closes it, counting those phrases
as failed. `pm_envio` is written after each `POST /jobs`. The footer is ENV-15. `GET /jobs` runs every 2 s while something is running; when it fails the modal says
ENV-09 and keeps trying. Phrases already in a running Envio are not sent twice (a second click only reopens the modal),
and the Veio modal ignores the second press of a double click, so it does not close the modal the first press opened.

The tracked Envios live in `pm_envio`, so reloading the panel keeps them (without reopening the modal). When nothing is
running and at least one Envio started, the **summary** (ENV-10) opens by itself in whatever area is on screen, once no
other modal is open. It has one block per language: `+N cartões` (sent now), `no baralho <deck>` (the deck saved on the
Envio when it was created, its `::` levels shown as ›), `N já estava lá` (the bridge's `duplicatePhraseIds`, never counted
as sent) and `N não entrou` (what did not become a card, including an Envio that never started; a phrase the bridge lists
both in `successfulPhraseIds` and `failedPhraseIds` counts as failed, so it is never deleted) with **Tentar de novo**,
which redoes only that language. Below the blocks, the history question: “Tirar as N enviadas do histórico?” with
**Manter** and **Tirar do histórico**; N counts only the sent phrases still in the history, the ones deleted meanwhile
are named (“1 enviada você já tinha apagado.”), and with none left it says “Nada para tirar do histórico.” with **Pronto**.
**Manter** — and Pronto, ×, Esc, a click outside — marks the sent and the duplicates Enviada ao Anki, no toast (ENV-12).
**Tirar do histórico** deletes only the ones sent now, marks the duplicates, and shows the ENV-11 toast. Either answer
clears `pm_envio`. With the Conexão off (from the shell), Enviar ao Anki has `aria-disabled` (not `disabled`), the fixed
“Conexão desligada” badge beside it (`PAI-32.conexaoDesligada`), `aria-describedby` and a tooltip on hover and focus
(`PAI-32.enviarIndisponivel`).

### Base components (`veio/componentes.css` + `veio/componentes.js`)

A component exists **once**. A surface that needs a button uses `.veio-botao`; it does not redraw
its own. The three pages load both files right after `tokens.css` / `lib/voz/texto.js`, so a
rebuilt surface starts from the shared classes and `PerpetualMiner.Veio`:

```js
const { abrirModal, mostrarToastDeSucesso, escreverFrase } = PerpetualMiner.Veio;
```

The rules the components encode, so a surface does not have to re-decide them:

- **Danger has two variants:** `--perigo` (outline) is the entry that opens the destructive modal;
  `--perigo-cheio` is only the button that confirms inside it.
- **Modal:** `abrirModal(scrim)` puts the initial focus on the *safe* button (`[data-foco-seguro]`,
  else the first one not painted as danger), traps focus, closes on Esc and on a click outside,
  returns focus to whoever opened it, and marks the rest of the page `inert`. The second press of a
  double click is not a click outside: it is the end of the click that opened the modal.
- **Toast is success-only** and short: it disappears on its own after 2.6 s plus reading time. It
  lives inside `dentroDe` (the page's `body` by default), so it uses that element's theme.
  Every error that asks for an action is `montarAviso(…)` instead — it stays in the place of the
  problem until closed, with the action beside it and the technical cause in a collapsed
  “Detalhes” (V3 of the Voice). An aviso that *is* a state (a failed sync) passes `fechavel: false`:
  no ×, it leaves when the problem does. `montarDetalhes(causa)` is that same “Detalhes” alone, for
  when the screen's state already says what happened (the cloud refused, the session expired).
- **Error on a field** is said by `aria-invalid="true"`, not by a class, so the screen reader hears
  it too.
- **The highlighted Word** is drawn by `escreverFrase(no, texto, palavra)`: a `kw-bg` band from 50%
  to 94% of the line, no radius. The phrase text always goes in as text, never as HTML. Where the
  person picks the Word in the phrase itself, `escreverFraseClicavel(no, trechos)` writes each word as
  a `role="button"` with the same band on the picked ones, one Tab stop per phrase, and
  `andarEntrePalavras(evento)` / `focarPalavra(palavra)` move the focus with the arrow keys.
- **Copy does not live in the components.** The caller passes the string it already looked up:
  `textoDaVoz('PAI-13.titulo', { n })` — `montarAviso` even refuses to build a closable aviso without the close
  label. The only three words the base writes itself are in `ROTULOS_DO_PADRAO`, because they are
  no screen's state and so have no ID: `palavra:` and `auto:` (fixed by the glossary) and
  `Detalhes` (the name rule V3 of the Voice gives the collapsed cause).

The legacy surfaces still carry their own CSS; each redesign step moves the surface it rebuilds
onto these classes. Loading the files everywhere now is deliberate — the classes are prefixed
`veio-`, so nothing collides with what is already there.

### Firebase / Firestore Sync

Phrases are synced to Firestore under `usuarios/{uid}/frases/{frase.id}` when the user is logged in. Both `background.js` and `painel.js` use the **Firestore REST API directly** (no SDK) to avoid CSP violations in MV3.

Authentication uses `chrome.identity.launchWebAuthFlow` (OAuth2 with Google) — **no Firebase Auth SDK**. Tokens are stored in `chrome.storage.local` under `pm_firebase_auth` and refreshed automatically via the Firebase token endpoint.

Pending sync queue: if a Firestore write fails (offline/error), the phrase `id` is added to `pm_pending_sync` in local storage and retried on next panel load.

Deleting (panel or popup) writes a tombstone so the next panel sync doesn't bring the phrase back from the cloud or from another computer: `pm_del_{id}` in `chrome.storage.sync`, the id in local `pm_deleted_ids` (retry of the Firestore DELETE), and, when logged in, the field ``ids.`{id}` `` in `usuarios/{uid}/meta/deleted`. The popup asks the service worker to delete (`APAGAR_FRASES`); the panel does it itself (`removerFrasesFirestore`, `apagarTudoFirestore`). Apagar tudo tombstones this computer's phrases before it reads the cloud, so a cloud that is down cannot bring them back on the next sync. Until the cloud confirms, it also keeps `pm_apagar_tudo` (`{ uid, ate }`): the first sync of that account that reaches the cloud tombstones and deletes every cloud phrase whose id (its save time) is up to `ate` — phrases another computer saved before the wipe that this one never saw — and keeps what was mined after. Both build the tombstone with `tombstone.js`: a phrase id starts with a digit, so its field path must be backquoted, and Firestore (and the e2e fake) rejects the bare `ids.{id}`.

### Storage Schema

Each entry in `chrome.storage.local["frases"]` (unlimited, newest first):
```js
{
  texto:     string,
  data:      string,          // "dd/mm/yyyy" (pt-BR locale)
  streaming: string,          // platform name, 'web', 'pdf', or 'livro'
  id:        number,          // max(Date.now(), highest stored id + 1), assigned inside naFilaDeGravacao
  idioma:    string,          // 'Inglês' or 'Russo' (lib/idioma.js: Cyrillic → Russo, else Inglês)
  contexto?: {                // optional; added for web/pdf/book sources
    fonte:   string,
    titulo:  string,
    detalhe: string,
  }
}
```

Other storage keys:
- `geminiApiKey`, `bookTitleDefault` — BookReader settings
- `pm_tema` — `'escuro'` (the default, and what an absent key means) or `'claro'`: the theme chosen on this computer. It is local on purpose and never syncs, so each computer opens in the theme picked on it. `veio/tema.js` mirrors it into `localStorage` under the same name, which is read before the first paint so a light page never flashes dark; `chrome.storage` stays the truth and corrects the mirror
- `pm_firebase_auth` — `{ uid, idToken, refreshToken, expiresAt }` — Firebase auth session
- `pm_user_info` — `{ uid, email, displayName, photoURL }` — Google user profile
- `pm_pending_sync` — `string[]` of phrase IDs awaiting Firestore retry
- `pm_deleted_ids` — `string[]` of deleted phrase IDs whose Firestore DELETE hasn't succeeded yet
- `pm_atalho_legenda` — the “Minerar legenda” shortcut. Absent → the default Alt+S; `null` → no caption shortcut
- `pm_atalho` — the “Minerar seleção” shortcut; `null` or absent → none (the default). Both use `{ type: 'keyboard'|'mouse', code, button, altKey, ctrlKey, shiftKey, label }`
- `pm_apagar_tudo` — `{ uid, ate }` while an Apagar tudo hasn't reached the cloud; see the tombstone paragraph above
- `pm_envio` — `{ envios: [{ id, lang, ids, baralho, jobId, criadoEm, falhaAoCriar }] }` (`id` is a `crypto.randomUUID()` that keys the Envio's card; `baralho` is the deck it was sent to): the Envios the panel is tracking until the summary is answered; see “Envio ao Anki”

### Platform-Specific Subtitle Selectors (content.js)

- **Netflix**: `.player-timedtext-text-container`
- **YouTube**: `.ytp-caption-segment`
- **Amazon Prime**: `.atvwebplayersdk-captions-text` (with extra filtering for non-Latin chars and UI strings)
- **Generic**: `.jw-text-track-cue`, `.vjs-text-track-cue`

### Cross-Frame Communication

`content.js` never uses `window.postMessage()`: the page shares the window with the content script and sees messages between frames, so it could forge them (inject phrases, overwrite the clipboard). Each frame saves its own phrase with `SALVAR_HISTORICO`. When the clipboard write fails inside an iframe (e.g. a cross-origin player without `clipboard-write`), the frame sends `COPIAR_NO_FRAME_DE_CIMA` to the service worker, which checks the sender and the text and relays `COPIAR_PARA_CLIPBOARD` to the tab's top frame only (`frameId: 0`). Web pages cannot reach `chrome.runtime` messaging.

The capture shortcuts and the floating button only react to trusted events (`event.isTrusted`), so a page cannot mine by dispatching a synthetic keydown or click.

### Write Serialization (background.js)

Every read-modify-write of `frases`, `pm_pending_sync` and `pm_deleted_ids` in the service worker goes through `naFilaDeGravacao`, so concurrent saves (e.g. BookReader saving many passages at once) never overwrite each other. Deleting from the popup goes through it too. Phrase ids are assigned inside that queue and are unique even within the same millisecond.

Not covered by the queue:
- The auto-miner duplicate check reads `frases` outside the queue before calling `salvarFrase`, so two identical auto candidates arriving together can both be saved (a duplicate, never a lost phrase).
- `painel.js` rewrites `frases` (and `pm_deleted_ids`) directly, outside the service worker, so editing or deleting in the panel during a photo save can still lose phrases.

### Toolbar Badge (background.js)

The badge on the extension icon is the auto-miner's counter for today (`MIN-09`): the **sum of the enabled languages only**, in the Veio colors (`#F5B83D` on `#1A1204`). Both languages off → no badge at all, and the tooltip goes back to the extension's name. Tooltip otherwise: “Mineração automática: N hoje”, or “…: limite de hoje atingido” when every enabled language has hit its own `dailyLimit` (one language at its limit and another below still shows the counter).

Storage is what drives it, not the caller: the service worker watches `pm_auto_miner_settings` and `pm_auto_miner_daily` through `chrome.storage.onChanged`, so toggling a language in the popup and each automatic mining both land on the same path (`atualizarBadgeDaToolbar`).

The two colors are the only ones written outside `veio/tokens.css` — `chrome.action` takes a color, not CSS — and that exception is registered in `veio/README.md`. They travel as a pair: `setBadgeTextColor` needs Chrome 110+, so `manifest.json` declares `minimum_chrome_version: 110` rather than letting the text color fall back and lose the 10.4:1 contrast.

The day rollover writes nothing on its own — `getAutoMinerState` already returns zeroed counts once the stored `date` isn't today's — so a one-shot `chrome.alarms` alarm (`pm-virada-do-dia`, just after the next local midnight) asks for the badge again and re-arms itself for the following midnight. It is one-shot on purpose: a fixed 24 h period would slip an hour for good at the first daylight-saving change. The service worker also refreshes the badge whenever it wakes, and listens to `runtime.onStartup` so Chrome starting wakes it, since the badge sitting in the toolbar may be yesterday's.

## Testing

The extension is tested for real in Chromium via Playwright, from `e2e/` (its own `package.json`, so the unpacked root stays free of Node files):

```bash
cd e2e
npm ci           # once
npm run setup    # once: downloads Playwright's Chromium
npm test         # launches Chromium with the unpacked extension and runs the suite
```

On Linux/WSL, Chromium also needs system libraries (NSS, ALSA…): `sudo npx playwright install-deps chromium`, once.

- `e2e/fixtures.js` launches a fresh Chromium profile per test with the repo root loaded as an unpacked extension, fakes the network at the HTTP boundary and blocks every other external request. It gives tests `extensao` (id, service worker, `url()`, `lerStorage`/`gravarStorage`, `frases()`, `semearSessao()`), `fakes` and `paginas`.
- `e2e/fakes/`: the Anki connection (`127.0.0.1:8766`, with a stateful Envio queue following `bridge/server.py`: `moverEnvio`, `concluirEnvio({ duplicadas, falhas, erro })`, `recusarEnvios(lang, { status } | { rede: true })`), Gemini, and Firestore/Google (in-memory documents, token refresh; `ficarForaDoAr()`, `recusarAcesso()`, `recusarEscritas()`, `expirarSessao()`, `gravarFrases(uid, frases)`, `usarPerfil({ name, email, picture })`, the profile the Google login returns). `semearSessao({ expirada })` writes an account session to storage, skipping the real login.
- **The real Google login runs offline.** The `chrome.identity.launchWebAuthFlow` window loads outside Playwright's routing (a `context.route` never sees it), so the fixture maps `accounts.google.com` to a local HTTPS server (`fakes/login-google.js`, self-signed certificate made with `openssl` per worker, `--host-resolver-rules` + `--ignore-certificate-errors`). `fakes.google.proximoLogin('entrar'|'janela'|'falhar')` picks what the window does: return with tokens, stay open (the test closes it: cancelling), or fail to load. This also keeps Chromium's own background calls to that host off the internet.
- `e2e/pages/`: local fixture pages where the content script is injected: `player.html` (fake player with a caption), `texto.html` (plain text to select), `sem-video.html`, `player-em-iframe.html?player=<url>` (embeds the player from another origin, e.g. `paginas.urlCruzada('player.html')`), `hostil.html` + `hostil-filho.html` (a page that tries to drive the extension by itself), and `player-marcacao.html` / `texto-marcacao.html` (caption, title and selectable text carrying markup as text, to prove the content script always inserts page text as text, never as HTML).
- `e2e/vitrine/`: the Veio showcase — tokens, type scale, radii, a Russian phrase and **every base component**, in both themes and in the states each component actually has (button and field: focus and disabled, plus error on the field; a badge only has normal). `componentes-da-vitrine.js` builds the gallery once per theme with the same function, so the two columns never diverge; its sample copy comes from the Voice catalog by ID (`CATALOGO_DA_VITRINE`), and anything that is showcase scaffolding is marked `data-vitrine-chrome`. The fixture server also serves `/veio/…` and `/lib/…` from the extension root, so the showcase loads the same tokens, fonts, components and catalog the extension pages load. After the owner's review it is **the visual reference**.
- The showcase also carries a **mock of the toolbar badge** in its three states, outside the two theme columns — Chrome draws the real badge on the browser toolbar, which no static page (and so no Vercel preview) can show. The mock reads its colors from the tokens, and the badge test asserts those tokens match what the service worker hands Chrome, so the copy in `background.js` can't drift.
- `tests/painel-frases-visual.spec.js` holds the **visual reference of the Frases list** (cards wide and as a rail, each at the top and with the island scrolled to the pagination; loading, first run, filters and search with no result as the full page), in the same way: `npx playwright test painel-frases-visual --update-snapshots` after the owner approves a new look. Today's bulk actions (`.conteudo-de-hoje`) are masked.
- `tests/painel-envio-visual.spec.js` holds the **visual reference of the Envio ao Anki**: the progress with one Envio running and one that did not start, a partial Envio with Continuar envio, the summary partial and complete (opened in Configurações), and Enviar ao Anki unavailable with its badge and tooltip.
- `tests/painel-shell-visual.spec.js` holds the **visual reference of the panel shell**: its approved states (Frases wide and as a rail, first run, the Conexão off with F1, Configurações with an account) as `toHaveScreenshot` baselines in `painel-shell-visual.spec.js-snapshots/` (taken on Linux, with the clock frozen on the day of the sample phrases). A visual change to the shell fails them; after the owner approves the new look, `npx playwright test painel-shell-visual --update-snapshots` replaces the reference. The content inside each area (`.conteudo-de-hoje`, and the Frases list, which has its own reference) is masked: the reference is the shell around it.
- `tests/configuracoes-visual.spec.js` does the same for Configurações (cards closed; Conta & sync synced, not synced, logged out after a failed login; Chave do Gemini saved and refused empty; Zona de perigo with an account and its modal; Atalhos open, recording and with a repeated shortcut refused; the narrow window; Aparência open in dark and in light), compared by the owner side by side with the locked prototype (`?variant=C`).
- `HEADED=1 npm test` shows the browser.
- Tests assert what the person sees and what ends up stored, never internal functions. Three narrow exceptions, each named in the test's own comment:
  - Where Chromium gives Playwright no way to drive the native UI or clock (the context menu, the toolbar badge, the midnight alarm), a test does what Chrome would do — calls the function Chrome would call (`minerarSelecaoDoMenu`, `registrarMenuDeContexto`) or fires the alarm early under its own name — and asserts what gets stored or what is handed to Chrome (`chrome.action.getBadgeText`, `getTitle`, the next alarm's time).
  - Until a surface shows a catalog state, the catalog's own guarantees (every ID present, pt-BR numbers) are asserted through `PerpetualMiner.textoDaVoz`, inside an extension page. These move to the screen when the surface is rebuilt.
  - Two guarantees of the base components have no on-screen trigger of their own, so the test calls the component's own function and still asserts the visible result: how long a toast of a given length *stays on screen* (`mostrarToastDeSucesso`), and that a phrase carrying markup is written as text (`escreverFrase`). The surfaces that call them assert the same thing through the screen once they are rebuilt.

The legacy tests keep running: `node test_sync.js`, `node test_bridge_panel.js`, `node test_auto_keyword.js` and the bridge tests in `bridge/test_*.py`.

## Key Constants

- `ATALHOS_PADRAO` in `lib/atalhos.js` — the factory shortcuts: Minerar legenda on **Alt+S**, Minerar seleção with none
- `COR_ICONE = '#00ff88'` in `content.js` — UI highlight color
- `SENTINEL_VAZIO = 'NENHUM_TRECHO'` in `bookreader.js` — returned by Gemini when no marked passages found
- `FIREBASE_PROJECT = 'perpetualminer-4c219'` in `background.js`
- `BADGE_COR_DE_FUNDO = '#F5B83D'` / `BADGE_COR_DO_TEXTO = '#1A1204'` in `background.js` — the toolbar badge's Veio colors
- `ALARME_VIRADA_DO_DIA = 'pm-virada-do-dia'` in `background.js` — the alarm that resets the badge at midnight
- Firestore path pattern: `usuarios/{uid}/frases/{frase.id}`

## Permissions

- `alarms`, `storage`, `unlimitedStorage`, `activeTab`, `tabs`, `contextMenus`, `identity` (`alarms` is the toolbar badge's day rollover)
- `host_permissions`: Gemini API, Firestore, Google OAuth, Firebase token endpoints
- Content scripts inject into all URLs with `all_frames: true`
- `painel.html`, `bookreader.html`, `veio/tokens.css` and `veio/fontes/*.woff2` declared as `web_accessible_resources`. The tokens and the fonts are exposed so the in-page overlay can load them inside its Shadow DOM; `content.js` does not read them yet — that lands with the overlay rebuild
