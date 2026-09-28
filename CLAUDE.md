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
| `content.js` | Injected into all pages; mines subtitles and selections, and drives the overlay |
| `overlay.js` + `overlay.css` | `PerpetualMiner.Overlay` — the in-page overlay: one Veio component in an open Shadow DOM (the floating button and the feedback pill). See “Overlay” below |
| `background.js` | Service worker; handles `SALVAR_HISTORICO` messages and context menu clicks; writes to `chrome.storage.local` and syncs to Firestore |
| `tombstone.js` | Tombstone of a deleted phrase (`chrome.storage.sync` keys and the Firestore `meta/deleted` PATCH), loaded by `painel.html` |
| `popup.html/js/css` | The “Cockpit” popup (docs/design/popup/, variant A): Abrir painel, the Mineração automática tiles, quick mining and the last 5 phrases, read-only. See “Popup (Cockpit)” below |
| `painel.html/js/css` | Full dashboard to view, copy, and delete all saved phrases; Google login and Firestore sync |
| `painel-shell.js` | The panel's “Ilhas” shell: one page, one area per address (`#frases`, `#anki/<aba>`, `#configuracoes[/<seção>]`), the sidebar indicators (phrase total, Conexão com o Anki dot), the rail below ~1000 px, the F1 strip and the Configurações cards opening and closing. See “Panel shell” below |
| `painel-conta.js` | The account in the panel: one state drawn in the Configurações › Conta & sync card, its closed-row summary and the sidebar chip (CFG-01…10). See “Account (Conta & sync)” below |
| `painel-atalhos.js` | The Configurações › Atalhos card: records “Minerar legenda” and “Minerar seleção” in their own row (CFG-11…14, 19, 21, 22, 33, 34). See “Shortcuts (Atalhos)” below |
| `lib/atalhos.js` | `PerpetualMiner.Atalhos` — the recorded shortcuts in one place: where they are stored, the defaults, the PT-BR label, “same shortcut” and event matching, and `digitandoNumCampo` (the key belongs to a text field). Loaded by the content script, the panel and the popup |
| `painel-chave.js` | The Configurações › Chave do Gemini card: the saved key masked, with Trocar chave; the empty key's field; `geminiApiKey`. See “Chave do Gemini and Zona de perigo” below |
| `painel-perigo.js` | The Configurações › Zona de perigo card: the Apagar tudo entry, its reach with and without an account, and the Veio confirmation modal (CFG-17). See “Chave do Gemini and Zona de perigo” below |
| `painel-envio.js` | The Envio ao Anki: Enviar ao Anki in the Frases bar, the progress modal (one card per Envio), the tracking saved in `pm_envio` and the summary (ENV-03…15) that opens by itself in any area. See “Envio ao Anki” below |
| `bookreader.html/js/css` | Minerar de uma foto (ex-BookReader): photos of marked book pages → Gemini Vision reads the marked passages → the person picks which phrases to mine. See “Minerar de uma foto” below |
| `veio/` | Shared Veio identity: `tokens.css` (color/type/radius/motion tokens + the mark's blinking cursor), `tema.js` (the chosen theme, applied before the first paint on every page), `componentes.css` + `componentes.js` (the base components, defined once), `fontes/` (packaged Manrope and JetBrains Mono `.woff2`, latin + cyrillic), `icones/` (the toolbar PNGs, the SVG mark and `icone-claro.svg`, which `.veio-marca` swaps in on the light theme through `--veio-marca`). See `veio/README.md` |
| `lib/voz/catalogo.js` | The Voice catalog as data: the 198 approved copy states from `docs/design/voz/` |
| `lib/voz/texto.js` | `textoDaVoz(id, valores)` — looks a state up by ID and fills its templates |
| `lib/idioma.js` | `detectarIdioma(texto)` — the single language detector (Cyrillic → Russo, else Inglês) |
| `lib/contexto.js` | `PerpetualMiner.Contexto` — the Contexto as the screen says it: the Fonte's name (PAI-29, `fonteDaFrase`, `nomeDaFonte`) and the phrase's day (PAI-11, `rotuloDoDia`). Loaded by the panel and the popup, so a phrase never has two names |
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

The content script loads the whole catalog into every frame: the overlay reads its copy from it
(`MIN-01`…`MIN-10`, and `PAI-29.web` for the selection's meta) like every other surface.

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
`data-tema="claro"`: its CSS was drawn for a light background. Frases has none left: #30 and #31 rebuilt its bulk
actions.

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

Configurações › Atalhos is the only recorder: the popup only shows the Minerar legenda shortcut in its footer. The `kbd`
itself is the base component `Veio.montarTecla(rotulo, { seVazia })` (or `Veio.montarTeclas`, one key per `kbd`, as the
popup draws it); the caller passes the “Sem atalho” copy (CFG-12 or GLB-02).

### Popup (Cockpit) (`popup.html/js/css`)

The popup is the “Cockpit” variant A (`docs/design/popup/`), 340 px wide with a 600 px ceiling, built on the Veio
components and following the chosen theme. Top to bottom: the mark with no subtitle (POP-12); **Abrir painel** (POP-09),
which focuses the panel tab that is already open (`chrome.tabs.query` ignores the `#address`, so the tab keeps the area
the person left it on) or opens one; the **Mineração automática** tiles, Inglês | Russo (POP-10, POP-14, POP-15): a switch,
the counter as the prototype draws it (“12/20”, the number large; the screen reader hears POP-07 “12 de 20 hoje”), a meter
and the 1–100 daily limit, which gives way to “Limite de hoje atingido” (POP-08, also the switch's accessible
description) once an enabled language hits it, even while the limit field has focus. The limit field has no spin
arrows: focusing it selects the number, typing replaces it, ↑ ↓ still step it, and Enter saves and keeps focus there; a
redraw puts focus back on the same control (the switch, once the field gave way to POP-08). The ONB-10 note shows while
the Conexão com o Anki does not answer `/health` *and* nothing was mined automatically today (a count above 0 means the
Conexão worked today). The tiles show a skeleton until the service worker answers `AUTO_MINER_GET_STATE` (a
`pm_auto_miner_state_view` that arrives first wins); if it fails, POP-16 says what to do in one line with the alert icon
(close and reopen the popup), and if a save (`AUTO_MINER_SET_SETTINGS`) fails, the tiles go back to what is stored and
POP-16 asks to try again. No button and no Detalhes: the next published state clears the line. **Quick mining**
(POP-03/04): Enter or Minerar sends `SALVAR_HISTORICO` with Fonte `manual` and an empty Título; success has no text
(POP-05: the field clears and the phrase enters the top with a brief highlight), failure shows POP-06 under the field
with the alert icon and keeps the text; the **last 5**, read-only (POP-13), each the phrase with the Palavra (the first
`keywords` group) highlighted and the Contexto line “Fonte · Título · Detalhe · dia”; skeleton while loading (POP-01) and
the POP-02 empty state: the pickaxe, “Nenhuma frase ainda” in bold and the text below with the recorded shortcut, one key
per `kbd` (`Veio.montarTeclas`); with no shortcut, `POP-02.semAtalho` and Definir atalho. The footer shows the recorded
Minerar legenda shortcut (POP-11, one key per `kbd`) with Mudar atalho, or “Sem atalho” and Definir atalho (GLB-02);
both, and Definir atalho in the empty state, take the panel tab to `#configuracoes/atalhos`, and “Ver todas” to `#frases`.
The popup does not delete, select or record anything.

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

The area header carries **Minerar frases ▾** (ADD-01; see “Minerar frases” below). The filter
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
clears `pm_envio`. With the Conexão off (from the shell), Enviar ao Anki has `aria-disabled` (not `disabled`), `aria-describedby` and a
tooltip on hover and focus only (`PAI-32.enviarIndisponivel`): nothing stays on the bar while the Conexão is off, which
can be for days before the Anki is set up.

### Minerar frases (`painel.js`, ADD-01…12)

The header's **Minerar frases ▾** is a menu button (`aria-haspopup="menu"`): Colar · Arquivo .txt · Foto, each with its
ADD-11 line. Arrows (wrapping), Home/End move inside it; Esc returns focus to the button; Tab and a click outside
close it. Colar and Arquivo .txt open one Veio modal (`#modal-minerar`) on the right option of its segmented control
(radios, like the Anki tabs); **Foto ↗** sits beside it as a plain button, because it is not a view: it closes the modal
and opens `bookreader.html` in a new tab, as the menu's Foto does. The PAI-02 empty state's button opens the modal on Colar.

- **Colar:** the textarea (ADD-02 as placeholder), Fonte and Título (PAI-21 labels), the live count in mono (PAI-05) and
  “Minerar N frases” (ADD-12, “Minerar frases” with none). Empty: ADD-03 under the field, `aria-invalid`, linked by
  `aria-describedby`. No Fonte → `manual`. Pasted phrases get the detected Palavra, as before.
- **Arquivo .txt:** imports as soon as a file is chosen. UTF-8 that does not decode (or has NUL) is ADD-07, no
  non-blank line is ADD-08, nothing new is ADD-09 in the modal with Fechar in place of Cancelar (only the part that happened: `soRepetidas`, `soIlegiveis` or `ambas`, never “0 linhas”). Repeated phrases
  (against the history and inside the file, case- and whitespace-insensitive) stay out; the toast is ADD-10 with
  repeated ones, ADD-05 without.
- **Progress (ADD-04)** replaces the options and fields inside the modal. Each phrase is sent to the service worker
  (`SALVAR_HISTORICO`) one at a time, so it goes through `naFilaDeGravacao`, and the count moves only when that save
  comes back confirmed; the list shows each one through `chrome.storage.onChanged`. `umaMineracaoPorVez` makes a second
  click (the double click of #9) do nothing — and so does Minerar in Colar while a chosen .txt is still being read.
- **Cloud:** the panel sends `semNuvem: true` and uploads the new phrases in one `batchWrite` at the end, then removes
  them from `pm_pending_sync`. If that fails, the persistent aviso ADD-06 stays in Frases with Tentar de novo (which
  repeats the upload) and no Detalhes (the owner's call: the cause goes to the Conta & sync card's Detalhes), and the card and the chip say the computer is out of sync — the same exception to
  the “sync problems only in the card” rule as PAI-15. Closing the aviso leaves them in `pm_pending_sync` for the next load.

**The .txt line** is `palavra : texto [Contexto: fonte - título - detalhe]` (`linhaDoTxt`; empty fields as
`Desconhecido`, Palavra groups joined by ` | `, word positions dropped). A phrase with no Palavra whose text has ` : `
(or ends in ` :`) is written with an empty prefix (`: texto`), so the text comes back whole. A Palavra group that is
no longer in the text (the text was edited after it was picked) is left out of the line, and the other groups stay:
read back, it would stick to the start of the text. The Anki Bridge gets the same line without either rule
(`linhaParaOAnki`), because its parser does not know the empty prefix. Reading (`lerLinhaDoTxt`): a line in that
format brings its Contexto and its Palavras back (`palavrasNoTexto` finds each word's position again; a word repeated in
the text comes back at its first occurrence after the previous one of its group) and skips the automatic Palavra; the
prefix before the first ` : ` only counts as the Palavra when all its words are in the text after it, which keeps
older exports like `Note : this matters` whole. A Título with ` - ` comes back whole (Fonte is the first part, Detalhe
the last). A plain line is a phrase with Fonte `importado` and the detected Palavra.

`SALVAR_HISTORICO` takes two optional fields for this: `palavras` (an array, possibly empty: the Palavra is stored as
given with `autoKeyword: false`, and detection is skipped) and `semNuvem` (the service worker does not sync the phrase
itself). Every other sender is unchanged.

### Minerar de uma foto (`bookreader.*`, docs/design/foto/, variant C)

Two columns under a top bar (Veio mark, FOT-01 name, the **Livro** field and “Voltar ao painel”). Left, the photo
queue: the drop area (the whole page takes a drop; “Escolher” opens the picker), the progress (FOT-20, counting
neither the preview nor the cancelled photos) and Cancelar while reading,
and one card per photo with its thumbnail and status (FOT-19: Pronta · Na fila · Lendo… · N frases · Sem marcações ·
Falhou + the cause and Tentar de novo · Cancelada), with the “Marcações que o Gemini lê” legend (FOT-24) at the foot. Right, the phrases grouped by
photo (“Foto N · name”), with the single “Selecionar todas” checkbox (mixed with part marked), the count (FOT-09) and
the sticky “Minerar N frases” (FOT-12; nothing marked → disabled with FOT-13). One photo stops at the preview
(FOT-03, “Ler marcações”); several go straight to reading, one at a time, in order. Each phrase is editable in place
(a `role="textbox"` named PAI-33.campo); its checkbox is named by the phrase.

The page only states what it confirmed. A reading that worked with nothing marked is “Sem marcações” and the FOT-10
empty state; a failed API call is “Falhou” with FOT-11's cause (429 → limit, 401/403/“API key” → key, with “Abrir
Configurações”, no network → network, else GLB-01) — it never blames the markings. As in the prototype, failures are
said once: with phrases on screen, one aviso for all failed photos (the danger icon, “Não deu para ler a foto 2.” or
“…3 fotos.” in bold and the first one's cause on one line), rebuilt only when another photo fails, so once closed it
does not come back with a photo that was read; with no phrase, the phrases column itself is the failure
(FOT-11.titulo “Não deu para ler a foto / as fotos”, the cause, “Abrir Configurações” for a refused key) and there is
no aviso. By the owner's call on this page, a reading failure has no “Detalhes” (an exception to V3): the cause is
already in the person's terms. A 200 with no text (a blocked request, a cut-off answer) is a failure too: only the
`NENHUM_TRECHO` sentinel means “Sem marcações”, and FOT-10 (its title singular or plural by the photos read, in bold
over the how-to-mark text) shows only when no photo failed. The formats (FOT-02) sit at the end of the “Fotos” title
row until the first photo, so the drop area keeps its height. A mined phrase shows the `--ok` selo “Minerada”, its checkbox is disabled and it leaves the button, so a second
click or a new photo never saves it twice; the click is ignored while a save is in flight. All saved → toast FOT-14;
part or none → aviso FOT-15/16 whose “Tentar de novo” mines again exactly the phrases that failed. Photo status changes are announced (the queue is a polite live region).

Formats: the picker's `accept` and the check take JPG, PNG, WEBP and HEIC — exactly what FOT-02 announces — by type or, with no type (HEIC on
Windows), by extension, and send Gemini the real MIME type; a file that is not a photo gets the FOT-04 aviso. A HEIC
thumbnail Chrome cannot draw falls back to the photo icon. The key lives only in Configurações: with none, the FOT-05
card, whose button (like the key-refused aviso) opens `painel.html#configuracoes/chave`, and a key saved there frees
the page through `chrome.storage.onChanged`. “Voltar ao painel” and that button focus the panel tab already open
(any hash), moving it to the address when there is one, and only open a new tab when there is none. A panel already
at that address gets no `hashchange`, so the page sends `PAINEL_REAPLICAR_ENDERECO` and `painel-shell.js` applies the
address again (focusing the key field).

**Cancelar** (FOT-06, in the “Fotos” title row while a photo is being read or waits in the queue) abandons the
Gemini request in flight (`AbortController`, and whatever still arrives is dropped), marks the photo being read
and the queued ones **Cancelada** and keeps the phrases of the photos already read; FOT-21 says so as an info
aviso over the phrases, or, when no photo was read, the phrases column itself says “Leitura cancelada.” and
“Nenhuma foto chegou a ser lida.” (`FOT-21.nenhumaLida`, the prototype's copy). Focus goes to Escolher.
**Recomeçar** (FOT-17: in the list header, the preview and the failed / no-marking / cancelled empties) clears
the photos, the phrases and the avisos — and abandons the reading in flight, so no phantom phrase arrives later
(bug of #9); the Livro stays. With phrases not yet mined (checked or not) it first asks in the Veio modal FOT-18
(Cancelar is the safe focus). A failed photo's card has **Tentar de novo** (FOT-19), which puts only that photo
back in the queue; focus stays on its card.

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
- **Modal:** `abrirConfirmacao({ id, titulo, corpo, cancelar, confirmar, aoConfirmar })` builds and opens the whole
  destructive confirmation (the fantasma Cancelar as the safe focus, the `--perigo-cheio` button, the aria wiring),
  removes it on close and calls `aoConfirmar` after the focus went back; Zona de perigo and Recomeçar use it.
  `abrirModal(scrim)`, under it, puts the initial focus on the *safe* button (`[data-foco-seguro]`,
  else the first one not painted as danger), traps focus, closes on Esc and on a click outside,
  returns focus to whoever opened it, and marks the rest of the page `inert`. The second press of a
  double click is not a click outside: it is the end of the click that opened the modal.
- **Toast is success-only** and short: it disappears on its own after 2.6 s plus reading time. It
  lives inside `dentroDe` (the page's `body` by default), so it uses that element's theme.
  Every error that asks for an action is `montarAviso(…)` instead — it stays in the place of the
  problem until closed, with the action beside it and the technical cause in a collapsed
  “Detalhes” (V3 of the Voice). `abertura` puts the state's first sentence in bold before the text, `icone` a Base
  icon at its start, and `tom: 'info'` makes an aviso that only informs (FOT-21's cancelled reading): neutral
  colours and `role="status"` instead of the danger `alert`. An aviso that *is* a state (a failed sync) passes `fechavel: false`:
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

### Overlay (`overlay.js`, `overlay.css`, docs/design/overlay/, M1)

The overlay is one component in Shadow DOM. The only node it adds to the site's DOM is the host,
`<perpetualminer-overlay>` (its position rules are inline and `!important`, so the site's CSS cannot hide or
move it); everything else — the button, the pill and the three stylesheets (`veio/tokens.css`,
`veio/componentes.css`, `overlay.css`, loaded as `<link>`s inside the shadow and declared in
`web_accessible_resources`) — lives in the shadow. Its root is `.pm` with `data-tema="escuro"` and `all: initial`: always the dark
tokens, whatever theme the extension pages use, and nothing the site sets on the host reaches it. The
packaged fonts load from the `@font-face` rules of `tokens.css` inside the shadow. The shadow is open, so
the tests (and a page) can reach it; a page still cannot mine, since the shortcuts and the button only
take trusted events.

- **Button:** the Veio tile (`veio/icones/icone.svg`) in a 46 px circle (the prototype's size), 16 px from the
  right and 96 px from the bottom of the player (the prototype's corner, a little higher and further right), a real `<button>` whose `aria-label` is MIN-07 with the recorded caption shortcut (“Minerar legenda
  (Alt+S)”, or “Minerar legenda” with none). At rest it is half faded (opacity .55); hover, keyboard focus and
  an open pill bring it to 100%. There is no visible label (the owner's review of PR #66): the name with the
  shortcut is for the screen reader. It lives in the player's container (so it stays in full screen) and only
  exists where there is a video.
- **Pill (the reserve C of M1, kept minimal after the owner's review):** the button stretches left into icon ·
  title · a second line · the meta in mono. On a success the second line is the phrase with the Palavra
  highlighted (`escreverFrase`; a long phrase starts near the Palavra, so it is never cut); on a failure it is
  the catalog's `dica`. The meta is the capture's language code on a caption (`EN`, `RU`), the Fonte “Web”
  (`PAI-29.web`) on a selection, and the language with the day's counter on the automatic mining (`RU 5/20`),
  as in the prototype. Without a player it appears alone in the window's bottom-right corner, with the tile
  as a plain mark at its end (not a button: `aria-hidden`, out of the Tab order; no mark on a failure), and
  disappears entirely. The content sits in a `role="status"` region. One at a time: a new feedback replaces
  the previous one. Every feedback — success or failure — leaves after ~3.5 s, as in the prototype; Esc
  closes a failure sooner. There is no × and no “Tentar de novo”. The automatic mining's MIN-06 never takes
  a failure off the screen.
- **Honest:** `content.js` waits for the service worker's `SALVAR_HISTORICO` answer (`{ ok, frase }`) and for
  the clipboard before it says anything: MIN-01 (“Frase minerada e copiada”) only when both happened, MIN-02
  (“Frase minerada”, the same success pill) when the phrase was saved but not copied, MIN-03 when the save
  failed. `chromeSet` in `background.js` rejects on
  `chrome.runtime.lastError`, so a refused write reaches the overlay as a failure. The phrase is saved once,
  whatever the clipboard does.
- **Nothing to mine:** the caption shortcut on a page without a video says MIN-10 and mines nothing — without a
  video, elements named “caption”/“subtitle” are image captions, so `obterLegendaAtual` returns nothing there;
  with a video and no caption on screen it says MIN-04. The keyboard selection shortcut with nothing selected says
  MIN-10 on a page without a video, and nothing on a page with one; a mouse selection shortcut with nothing
  selected leaves the button to do what it always did (back, forward), so it says nothing. “Without a video” means no frame of the tab has one:
  a frame without a video asks the others first (`HA_VIDEO_EM_OUTRO_FRAME`, see Cross-Frame Communication), so
  a player in a cross-origin iframe never gets a false MIN-10 from the top frame.
- **Typing is the person's:** neither shortcut fires while typing in an `input`, `textarea`, `select` or
  `contenteditable` (`Atalhos.digitandoNumCampo`, through the event's composed path; inside a *closed* shadow
  root the event reaches the content script retargeted to the host, so it opens the root with
  `chrome.dom.openOrClosedShadowRoot` and looks at the focus inside). An Esc typed in a site's field stays the
  site's too, even with a failure open.
- The gold line under the captured text, the highlight on the site's text and the per-language counter are
  #41. Until then the counter in the button's corner still sums the enabled languages.

### Firebase / Firestore Sync

Phrases are synced to Firestore under `usuarios/{uid}/frases/{frase.id}` when the user is logged in. Both `background.js` and `painel.js` use the **Firestore REST API directly** (no SDK) to avoid CSP violations in MV3.

Authentication uses `chrome.identity.launchWebAuthFlow` (OAuth2 with Google) — **no Firebase Auth SDK**. Tokens are stored in `chrome.storage.local` under `pm_firebase_auth` and refreshed automatically via the Firebase token endpoint.

Pending sync queue: if a Firestore write fails (offline/error), the phrase `id` is added to `pm_pending_sync` in local storage and retried on next panel load.

Deleting in the panel writes a tombstone so the next panel sync doesn't bring the phrase back from the cloud or from another computer: `pm_del_{id}` in `chrome.storage.sync`, the id in local `pm_deleted_ids` (retry of the Firestore DELETE), and, when logged in, the field ``ids.`{id}` `` in `usuarios/{uid}/meta/deleted`. The panel does it itself (`removerFrasesFirestore`, `apagarTudoFirestore`); the popup does not delete. Apagar tudo tombstones this computer's phrases before it reads the cloud, so a cloud that is down cannot bring them back on the next sync. Until the cloud confirms, it also keeps `pm_apagar_tudo` (`{ uid, ate }`): the first sync of that account that reaches the cloud tombstones and deletes every cloud phrase whose id (its save time) is up to `ate` — phrases another computer saved before the wipe that this one never saw — and keeps what was mined after. It builds the tombstone with `tombstone.js`: a phrase id starts with a digit, so its field path must be backquoted, and Firestore (and the e2e fake) rejects the bare `ids.{id}`.

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
- `geminiApiKey` — the Gemini key, written only by Configurações › Chave do Gemini and read by Minerar de uma foto
- `bookTitleDefault` — the Livro (Título) last typed in Minerar de uma foto, filled back on the next visit
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

`content.js` never uses `window.postMessage()`: the page shares the window with the content script and sees messages between frames, so it could forge them (inject phrases, overwrite the clipboard). Each frame saves its own phrase with `SALVAR_HISTORICO`. When the clipboard write fails inside an iframe (e.g. a cross-origin player without `clipboard-write`), the frame sends `COPIAR_NO_FRAME_DE_CIMA` to the service worker, which checks the sender and the text and relays `COPIAR_PARA_CLIPBOARD` to the tab's top frame only (`frameId: 0`); the top frame answers `{ ok }` and the service worker passes it back, so the iframe's overlay only says “copiada” when the copy happened. Before saying a page has no video (MIN-10), a frame without one sends `HA_VIDEO_EM_OUTRO_FRAME`; the service worker asks every frame of the tab (`TEM_VIDEO_NESTE_FRAME`), only a frame with a player-sized video on screen answers (a hidden 1 px ad video does not count), and no answer means no video. Web pages cannot reach `chrome.runtime` messaging.

The capture shortcuts and the floating button only react to trusted events (`event.isTrusted`), so a page cannot mine by dispatching a synthetic keydown or click.

### Write Serialization (background.js)

Every read-modify-write of `frases`, `pm_pending_sync` and `pm_deleted_ids` in the service worker goes through `naFilaDeGravacao`, so concurrent saves (e.g. BookReader saving many passages at once) never overwrite each other. Phrase ids are assigned inside that queue and are unique even within the same millisecond.

Not covered by the queue:
- The auto-miner duplicate check reads `frases` outside the queue before calling `salvarFrase`, so two identical auto candidates arriving together can both be saved (a duplicate, never a lost phrase).
- `painel.js` rewrites `frases` (and `pm_deleted_ids`) directly, outside the service worker, so editing or deleting in the panel during a photo save can still lose phrases. Minerar frases (Colar and Arquivo .txt) is not in this list: it saves through the service worker.

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
- `e2e/fakes/`: the Anki connection (`127.0.0.1:8766`, with a stateful Envio queue following `bridge/server.py`: `moverEnvio`, `concluirEnvio({ duplicadas, falhas, erro, ankiError })`, `recusarEnvios(lang, { status } | { rede: true })`), Gemini (`responderFrases(frases)`, `falhar(status, mensagem)`, `ficarSemRede()`, `bloquear(motivo)` — a 200 with no text, the `promptFeedback.blockReason` —, `segurarFrases(frases)` — holds the photo in “Lendo…” until the returned function is called, which resolves once the answer went out (or the page had already given up on the request) — and `chamadas`, with the key and MIME type of each read), and Firestore/Google (in-memory documents, token refresh; `ficarForaDoAr()`, `recusarAcesso()`, `recusarEscritas()`, `expirarSessao()`, `gravarFrases(uid, frases)`, `usarPerfil({ name, email, picture })`, the profile the Google login returns). `semearSessao({ expirada })` writes an account session to storage, skipping the real login.
- **The real Google login runs offline.** The `chrome.identity.launchWebAuthFlow` window loads outside Playwright's routing (a `context.route` never sees it), so the fixture maps `accounts.google.com` to a local HTTPS server (`fakes/login-google.js`, self-signed certificate made with `openssl` per worker, `--host-resolver-rules` + `--ignore-certificate-errors`). `fakes.google.proximoLogin('entrar'|'janela'|'falhar')` picks what the window does: return with tokens, stay open (the test closes it: cancelling), or fail to load. This also keeps Chromium's own background calls to that host off the internet.
- `e2e/pages/`: local fixture pages where the content script is injected: `player.html` (fake player with a caption), `texto.html` (plain text to select), `sem-video.html`, `player-em-iframe.html?player=<url>` (embeds the player from another origin, e.g. `paginas.urlCruzada('player.html')`), `hostil.html` + `hostil-filho.html` (a page that tries to drive the extension by itself), `player-marcacao.html` / `texto-marcacao.html` (caption, title and selectable text carrying markup as text, to prove the content script always inserts page text as text, never as HTML), `player-com-campos.html` (a player with an input, a textarea, a contenteditable and an input inside a closed shadow root, which the page keeps as `window.campoFechado`), `video-escondido.html` (an ad frame whose only video is 1 px, embedded through `player-em-iframe.html`), `sem-video-com-imagens.html` (image captions with the classes the generic caption selectors look for, and no video) and `player-estilos-hostis.html` (a page whose CSS paints everything, to prove the overlay's styles and the site's never cross).
- `tests/overlay-visual.spec.js` is the **visual reference of the overlay**, taken in the fake player resized to the prototype's player (1118 × 630), so the owner compares it with `docs/design/overlay/prototipo-overlay.html?variant=M1` at the same scale.
- `tests/overlay.spec.js` fails the service worker's storage on purpose (`chrome.storage.local.set` refuses or holds the write) — there is no network between the service worker and the storage, so the fault is injected at that boundary — and serves a page with `Permissions-Policy: clipboard-write=()` to deny the clipboard.
- `e2e/vitrine/`: the Veio showcase — tokens, type scale, radii, a Russian phrase and **every base component**, in both themes and in the states each component actually has (button and field: focus and disabled, plus error on the field; a badge only has normal). `componentes-da-vitrine.js` builds the gallery once per theme with the same function, so the two columns never diverge; its sample copy comes from the Voice catalog by ID (`CATALOGO_DA_VITRINE`), and anything that is showcase scaffolding is marked `data-vitrine-chrome`. The fixture server also serves `/veio/…` and `/lib/…` from the extension root, so the showcase loads the same tokens, fonts, components and catalog the extension pages load. After the owner's review it is **the visual reference**.
- The showcase also carries a **mock of the toolbar badge** in its three states, outside the two theme columns — Chrome draws the real badge on the browser toolbar, which no static page (and so no Vercel preview) can show. The mock reads its colors from the tokens, and the badge test asserts those tokens match what the service worker hands Chrome, so the copy in `background.js` can't drift.
- `tests/painel-frases-visual.spec.js` holds the **visual reference of the Frases list** (cards wide and as a rail, each at the top and with the island scrolled to the pagination; loading, first run, filters and search with no result as the full page; the selection bar, the card actions and the modals; Minerar frases: the menu, Colar filled and empty, the progress, Arquivo .txt, ADD-09 and the ADD-06 aviso), in the same way: `npx playwright test painel-frases-visual --update-snapshots` after the owner approves a new look.
- `tests/painel-envio-visual.spec.js` holds the **visual reference of the Envio ao Anki**: the progress with one Envio running and one that did not start, a partial Envio with Continuar envio, the summary partial and complete (opened in Configurações), and Enviar ao Anki unavailable with its tooltip.
- `tests/painel-shell-visual.spec.js` holds the **visual reference of the panel shell**: its approved states (Frases wide and as a rail, first run, the Conexão off with F1, Configurações with an account) as `toHaveScreenshot` baselines in `painel-shell-visual.spec.js-snapshots/` (taken on Linux, with the clock frozen on the day of the sample phrases). A visual change to the shell fails them; after the owner approves the new look, `npx playwright test painel-shell-visual --update-snapshots` replaces the reference. The content inside each area (`.conteudo-de-hoje`, and the Frases list, which has its own reference) is masked: the reference is the shell around it.
- `tests/popup-visual.spec.js` holds the **visual reference of the popup** (a normal day, the light theme, first run with and without a shortcut, a limit reached, the Conexão off with nothing mined today, a failed quick mining, loading), at 340×600, compared by the owner side by side with the locked prototype (`?variant=A`).
- `tests/minerar-foto-visual.spec.js` does the same for Minerar de uma foto (no key, start, preview, reading a batch, phrases of two photos, mined, one photo failed, cancelled halfway, the Recomeçar modal, no markings, the narrow window, the light theme), with the same marked page (`pages/pagina-marcada.png`) in every photo; compared by the owner with the locked prototype (`docs/design/foto/prototipo-bookreader.html?variant=C`). The toast is masked.
- `tests/configuracoes-visual.spec.js` does the same for Configurações (cards closed; Conta & sync synced, not synced, logged out after a failed login; Chave do Gemini saved and refused empty; Zona de perigo with an account and its modal; Atalhos open, recording and with a repeated shortcut refused; the narrow window; Aparência open in dark and in light), compared by the owner side by side with the locked prototype (`?variant=C`).
- `HEADED=1 npm test` shows the browser.
- Tests assert what the person sees and what ends up stored, never internal functions. Three narrow exceptions, each named in the test's own comment:
  - Where Chromium gives Playwright no way to drive the native UI or clock (the context menu, the toolbar badge, the midnight alarm), a test does what Chrome would do — calls the function Chrome would call (`minerarSelecaoDoMenu`, `registrarMenuDeContexto`) or fires the alarm early under its own name — and asserts what gets stored or what is handed to Chrome (`chrome.action.getBadgeText`, `getTitle`, the next alarm's time).
  - Until a surface shows a catalog state, the catalog's own guarantees (every ID present, pt-BR numbers) are asserted through `PerpetualMiner.textoDaVoz`, inside an extension page. These move to the screen when the surface is rebuilt.
  - Two guarantees of the base components have no on-screen trigger of their own, so the test calls the component's own function and still asserts the visible result: how long a toast of a given length *stays on screen* (`mostrarToastDeSucesso`), and that a phrase carrying markup is written as text (`escreverFrase`). The surfaces that call them assert the same thing through the screen once they are rebuilt.

The legacy tests keep running: `node test_sync.js`, `node test_bridge_panel.js`, `node test_auto_keyword.js` and the bridge tests in `bridge/test_*.py`.

## Key Constants

- `ATALHOS_PADRAO` in `lib/atalhos.js` — the factory shortcuts: Minerar legenda on **Alt+S**, Minerar seleção with none
- `SENTINEL_VAZIO = 'NENHUM_TRECHO'` in `bookreader.js` — returned by Gemini when no marked passages found (the photo is “Sem marcações”, FOT-10)
- `FIREBASE_PROJECT = 'perpetualminer-4c219'` in `background.js`
- `BADGE_COR_DE_FUNDO = '#F5B83D'` / `BADGE_COR_DO_TEXTO = '#1A1204'` in `background.js` — the toolbar badge's Veio colors
- `ALARME_VIRADA_DO_DIA = 'pm-virada-do-dia'` in `background.js` — the alarm that resets the badge at midnight
- Firestore path pattern: `usuarios/{uid}/frases/{frase.id}`

## Permissions

- `alarms`, `storage`, `unlimitedStorage`, `activeTab`, `tabs`, `contextMenus`, `identity` (`alarms` is the toolbar badge's day rollover)
- `host_permissions`: Gemini API, Firestore, Google OAuth, Firebase token endpoints
- Content scripts inject into all URLs with `all_frames: true`
- `painel.html`, `bookreader.html`, `veio/tokens.css`, `veio/componentes.css`, `overlay.css`, `veio/icones/icone.svg` and `veio/fontes/*.woff2` declared as `web_accessible_resources`: the stylesheets, the tile and the fonts are what the in-page overlay loads inside its Shadow DOM

## Agent skills

The engineering skills (`/implement`, `/tdd`, `/code-review`, `/to-spec`, `/to-tickets`, `/triage`, `/wayfinder`, …) live in `.claude/skills/`, so they also run in Claude Code on the web.

### Issue tracker

Issues and specs are GitHub issues on this repo, handled with `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
