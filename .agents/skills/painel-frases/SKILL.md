---
name: painel-frases
description: "Use when changing or reviewing the Frases list of the panel or the Minerar frases menu (`painel.js`, `painel.css`). Reviewers: open it when the PR touches that surface. It holds the architecture notes moved out of CLAUDE.md for it (what it shows, the IDs it implements, its storage and its tests)."
---

# Frases list and Minerar frases

Notes moved unchanged from `CLAUDE.md` § Architecture. `CLAUDE.md` keeps the file table and the rules that cross surfaces.

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
For the cloud merge of these marks, see the `carregar` contract in `lib/sincronizacao.js`.

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
