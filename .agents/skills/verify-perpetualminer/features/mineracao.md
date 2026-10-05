# Mine a phrase

Mining saves a phrase (with its Fonte, Título and detected language) into the history at the top of the Frases list. A person mines the caption of a playing video, a text selection on any page, or types a phrase in the popup. The in-page overlay confirms: the mark under the caption, the highlighted Palavra, a pill with "Frase minerada".

## Sub-features

- `mine-caption-shortcut` Alt+S on a page with a video and a caption saves the caption, draws the line under it and the chip (`Frase minerada e copiada`, `auto:` + the detected Palavra, `EN`).
- `mine-caption-button` the floating `Minerar legenda` button over the player does the same by click.
- `mine-selection-shortcut` the recorded selection shortcut (default none; specs record Alt+E) saves the selected text with Fonte Web.
- `mine-selection-menu` the context-menu entry `Minerar com PerpetualMiner` saves the selection (simulated, see Gotchas).
- `mine-popup-quick` the popup's quick field: type, Enter, the phrase lands first in the popup's last-5 list with Fonte Manual.
- `mine-pdf-source` a selection mined from a PDF address saves Fonte PDF. Covered exactly: (a) the menu callback with `pageUrl` `https://exemplo.dev/livros/ferry.pdf` and tab title `ferry.pdf - Google Chrome` stores `contexto { fonte: 'pdf', titulo: 'ferry.pdf' }`; (b) HTML text served at `…/texto.pdf` and `…/texto.pdf?download=1#page=2`, mined by shortcut and by the menu callback, stores Fonte PDF with the page's title. **Not covered:** Chrome's native PDF viewer (its embedded viewer and real viewer title).

## How to get to it (user POV)

- On a streaming/video page: press **Alt+S** (default), or click the floating **Minerar legenda** button.
- On any page or PDF: select text and press the recorded selection shortcut (Configurações › Atalhos), or right-click › **Minerar com PerpetualMiner**.
- Click the toolbar icon (popup) › type in the quick field › **Minerar** or Enter (Shift+Enter breaks the line).

## Driving it with the Playwright e2e harness

Preconditions:

- `doctor.sh` is green; pick a run ID. Fixture pages are served by the harness; no network.
- Each recipe is one `drive.sh` call; evidence lands in `<run-dir>/evidence/`.

- **Selection, shortcut + menu (`mine-selection-shortcut`, `mine-selection-menu`).** Run `drive.sh mine-sel mineracao-unica.spec -g "mesma Fonte"`. The spec records Alt+E, opens `texto.html`, selects `#trecho` and presses `Alt+KeyE`; then calls the menu callback; then opens `painel.html#frases`. Observable end state: two cards in `#frases-lista`, both with selo `Web` and origem `Página comum · Artigo de teste`; `frases()` has the two texts with equal `contexto` `{ fonte: 'web', titulo: 'Página comum · Artigo de teste', detalhe: '' }`. Evidence: `c1-selecao-web.png`, `c1-selecao-web.json`. (This `-g` also matches the two address tests of `mine-pdf-source`, (b) above.)
- **PDF title (`mine-pdf-source`, (a)).** Run `drive.sh mine-pdf mineracao-unica.spec -g "a seleção de um PDF grava a Fonte PDF"`. The spec calls the menu callback (simulated, see Gotchas), then opens `painel.html#frases`. Observable: one card, selo `PDF`, origem `ferry.pdf`; `frases()` is one phrase with `streaming 'pdf'`. Evidence: `c1-menu-pdf.png`, `c1-menu-pdf.json`.
- **Caption by shortcut (`mine-caption-shortcut`).** Run `drive.sh mine-cap overlay-marca.spec -g "Alt\+S num player com legenda"`. The spec opens `player.html`, waits for the `Minerar legenda` button, presses `Alt+KeyS`. Observable: chip in `perpetualminer-overlay` contains `Frase minerada e copiada`, `auto:`, `gulls`, `EN`; a `status` region reads the phrase; a 3 px line under `#legenda`; the page's own caption node untouched. No screenshot is written by this spec; add `fotografar(page, 'mine-caption-chip.png')` in a scratch copy if you need the picture. `overlay-visual.spec.js` holds the approved pictures.
- **Popup quick mining (`mine-popup-quick`).** Run `drive.sh mine-popup popup.spec -g "mineração rápida: Minerar só com texto"`. The spec opens `popup.html`, fills the quick field with `Break a leg`, Shift+Enter (does not mine), Enter. Observable: field empty, `Minerar` disabled, first of the 5 last phrases reads `Break a leg` and `Manual · hoje`, no toast; storage has `{ texto: 'Break a leg', streaming: 'manual', idioma: 'Inglês' }`. Evidence: `c1-popup-minerada.png`, `c1-popup-minerada.json`.
- **Caption button (`mine-caption-button`).** No committed spec clicks the floating button, so drive it with a scratch spec `e2e/tests/zz-scratch-<run-id>.spec.js` (delete it after): `const { test, expect, botaoFlutuante } = require('../fixtures'); const { fotografar, registrarEstado } = require('../evidencias-mineracao');` then in a test with `{ page, context, paginas, extensao }`: `await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: paginas.origem }); await page.goto(paginas.url('player.html')); await botaoFlutuante(page).click(); await expect.poll(async () => (await extensao.frases()).length).toBe(1); await fotografar(page, 'mine-caption-button.png'); await registrarEstado(extensao, 'mine-caption-button.json');`, run `drive.sh mine-btn zz-scratch-<run-id>.spec`. Observable (run on this checkout): one stored phrase `The quiet harbor woke before the gulls did.`, and the screenshot shows the caption underlined, the highlighted `harbor`, the pill `Frase minerada e copiada` with `auto: harbor` and `EN`, beside the `Minerar legenda Alt+S` button.

## Gotchas

- Playwright cannot open Chrome's native context menu. The menu specs call `minerarSelecaoDoMenu` in the service worker with the `info`/`tab` Chrome would pass; say "simulated" in the proof.
- The caption path reads the Alt+S default from `lib/atalhos.js`; a spec that records another shortcut changes it only in that test's profile.
- The clipboard is only usable after `context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })`; `overlay-marca.spec.js` does it in `abrirPlayer`.
- A caption that changes before the service worker answers gives the pill, not the line (`a legenda troca antes da resposta`).
- Mining confirms only after the service worker confirmed the write; a failing/held storage write shows MIN-03, not success (`overlay.spec.js`, `popup.spec.js` with POP-06).
