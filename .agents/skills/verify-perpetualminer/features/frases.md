# Frases list in the panel

The panel's default area (`painel.html#frases`, "Frases mineradas") lists every mined phrase as a card under its day heading, with the Palavra highlighted and a Contexto line (Fonte badge, Título · Detalhe, status badge). A person searches and filters, selects phrases, and deletes, edits or exports them.

## Sub-features

- `frases-cards` cards grouped under day headings (hoje · ontem · há 3 dias) with the `palavra:`/`auto:` chip and the Contexto line.
- `frases-word` clicking a word sets the Palavra (chip `palavra:`), and it stays highlighted after reload; × removes it.
- `frases-search` the `Buscar nas frases` searchbox matches text and Título; × clears.
- `frases-filters` Fonte, idioma, ordem and `Ocultar enviadas e exportadas` filter the list; `Limpar filtros` restores it.
- `frases-paging` 10 per page, "1–10 de 24", numbers in pt-BR.
- `frases-select` `Selecionar página`, the selection bar (count, Desmarcar todas, Editar contexto, Exportar .txt, Apagar, Enviar ao Anki).
- `frases-edit` Editar texto swaps the text for a field in place: Enter saves, Esc/Cancelar discards, no toast.
- `frases-export` Exportar .txt downloads the chosen phrases and marks them Exportada, never Enviada ao Anki.
- `frases-delete` Apagar asks "Apagar esta frase?" (PAI-12), Cancelar keeps, confirming removes without a toast.
- `frases-empty` first-run empty state teaches the caption shortcut (Alt+S) with Minerar frases.

## How to get to it (user POV)

- Toolbar popup › **Abrir painel** or **Ver todas**.
- Open `chrome-extension://<id>/painel.html#frases` (also what an empty or unknown address opens).
- Sidebar link **Frases** from any other panel area.

## Driving it with the Playwright e2e harness

Preconditions:

- `doctor.sh` green. The specs seed `frases` with `extensao.gravarStorage({ frases })` and freeze the clock at `2026-09-18T12:00:00`.

- **Search (`frases-search`).** Run `drive.sh frases-busca painel-frases.spec -g "a busca acha pelo texto"`. The spec fills the `Buscar nas frases` searchbox with `CALL` (cards `close call`, `call it a day`), then `ted lasso` (Título match), then clicks `Limpar busca`. Observable: card counts 2 → 1 → 4 and the searchbox empty.
- **Filters (`frases-filters`).** Run `drive.sh frases-filtros painel-frases.spec -g "filtram a lista"`. Observable: the Fonte/idioma/ordem comboboxes and the `Ocultar enviadas e exportadas` switch change the visible cards.
- **Paging (`frases-paging`).** Run `drive.sh frases-pag painel-frases.spec -g "10 por página"`. Observable: `1–10 de 24`, ‹ › walk the pages.
- **Cards and Palavra (`frases-cards`, `frases-word`).** Run `drive.sh frases-cartoes painel-frases.spec -g "cada frase é um cartão"` and `-g "clicar numa palavra grava a Palavra"`. Observable: day headings and, after the click, `palavra:` chip and a highlighted word that survives `page.reload()`.
- **Selection and delete (`frases-select`, `frases-delete`).** Run `drive.sh frases-selecao painel-frases-selecao.spec -g "Apagar 1 frase pede confirmação"` and `-g "sem seleção, só"`. Observable: modal `Apagar esta frase?` with Cancelar focused and no mention of "outros computadores" (no account); Cancelar leaves 3 cards; confirming leaves 2 and `frases()` has exactly those 2 texts; no `.veio-toast`.
- **Edit (`frases-edit`).** `drive.sh frases-editar painel-frases-selecao.spec -g "Editar texto troca o texto"`. Observable: a field replaces the text, Enter saves, the card shows the new text, no toast.
- **Export (`frases-export`).** `drive.sh frases-exportar painel-frases-selecao.spec -g "Exportar .txt baixa"`. Observable: a download of the chosen phrases; stored `status` is `exported` on them and nothing is marked sent to Anki.
- **Entry from the popup.** `drive.sh frases-popup popup.spec -g "Ver todas leva"` (the open panel tab goes to Frases) and `-g "sem painel aberto, Abrir painel"` (a new panel tab opens).
- **Entry by address and sidebar.** `drive.sh frases-endereco painel-shell.spec -g "sem endereço, o painel abre em Frases"` and `-g "um endereço desconhecido abre Frases"`. Observable: heading `Frases mineradas`, sidebar with Frases and the Conexão on top, Configurações at the foot.
- **Empty (`frases-empty`).** Run `drive.sh frases-vazio painel-frases.spec -g "primeiro uso: PAI-02"`. Observable: the empty state shows `Alt+S` and Minerar frases.
- **Proof.** These specs write no PNG. For a screenshot, copy the spec to `e2e/tests/zz-scratch-<run-id>.spec.js`, add `await fotografar(page, 'frases-<state>.png')` before the final assertion and run it with `drive.sh`. The approved pictures are the committed baselines of `painel-frases-visual.spec.js`.

## Gotchas

- Without the frozen clock the day headings ("hoje") drift; do not drop `page.clock.setFixedTime`.
- Changing a filter or the search clears the selection (a fixed bug of #9); assert the bar disappears, do not re-select silently.
- Delete with an account (`extensao.semearSessao()`) also says the phrase leaves the other computers; cloud failure shows PAI-15 with Tentar de novo.
- Frases text is inserted as text, never HTML (`uma frase com marcação aparece literal`).
- Write to `frases` only through the harness helpers; the real service worker serializes writes (`CLAUDE.md` § Write Serialization).
