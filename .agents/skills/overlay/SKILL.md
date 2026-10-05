---
name: overlay
description: "Use when changing or reviewing the in-page overlay and what drives it from the page: `overlay.js`, `overlay.css` (the floating button and the feedback pill) and `content.js` (reading the caption and the selection, and the answer on screen). Reviewers: open it when the PR touches that surface. It holds the architecture notes moved out of CLAUDE.md for it (what it shows, the IDs it implements, its storage and its tests)."
---

# Overlay

Notes moved unchanged from `CLAUDE.md` § Architecture. `CLAUDE.md` keeps the file table and the rules that cross surfaces.

### Overlay (`overlay.js`, `overlay.css`, docs/design/overlay/, M1)

The overlay is one component in Shadow DOM. The only node it adds to the site's DOM is the host,
`<perpetualminer-overlay>` (its position rules are inline and `!important`, so the site's CSS cannot hide or
move it); everything else — the button, the pill and the three stylesheets (`veio/tokens.css`,
`veio/componentes.css`, `overlay.css`, loaded as `<link>`s inside the shadow and declared in
`web_accessible_resources`) — lives in the shadow. Its root is `.pm` with `data-tema="escuro"` and `all: initial`: always the dark
tokens, whatever theme the extension pages use, and nothing the site sets on the host reaches it. Chrome
ignores `@font-face` inside a shadow root, so `overlay.js` registers the packaged fonts on the site's document
through the `FontFace` API, as bytes it fetches itself (a `url()` would go through the site's `font-src`), under
names only the overlay uses (`PerpetualMiner Manrope`, `PerpetualMiner JetBrains Mono`), which `overlay.css`
points the font tokens to: the site never asks for them, and a site's own Manrope keeps its look. The mouse
is the site's: the host and the `.pm` root have `pointer-events: none`, and only the pill takes it back (not
the free pill once closed, so the empty corner never swallows a click). The shadow is open, so
the tests (and a page) can reach it; a page still cannot mine, since the shortcuts and the button only
take trusted events.

- **Button:** the Veio tile (`veio/icones/icone.svg`) in a 46 px circle (the prototype's size), 16 px from the
  right and 96 px from the bottom of the player (the prototype's corner, a little higher and further right), a real `<button>` whose `aria-label` is MIN-07 with the recorded caption shortcut (“Minerar legenda
  (Alt+S)”, or “Minerar legenda” with none). At rest it is half faded (opacity .55); hover, keyboard focus and
  an open pill bring it to 100%. Hover and keyboard focus also show the prototype's label to its left
  (`.pm-dica`, the owner's review of PR #72, which reverses #66's “no visible label”): “Minerar legenda” with the
  recorded shortcut in a `kbd` (`Veio.montarTecla`; no shortcut → the name alone) and, with the automatic mining on
  for the caption's language, the day's count below it in `muted` without the language (`MIN-11.etiqueta`, “Mineração
  automática: 8 de 15 hoje”; the screen reader still hears MIN-11 with it). It is `aria-hidden` — the screen reader already hears the
  same through the button's name and description — and never shows over an open pill. It lives in the player's container (so it stays in full screen) and only
  exists where there is a video.
- **Mark (D of M1, #41):** one rule — the feedback marks the text where it is; when it can't, the button
  speaks (the pill). On a success whose text is still on screen, the overlay draws, over the site's text and
  without touching its DOM (its own elements, positioned from `Range.getClientRects()` relative to the host,
  `pointer-events: none`): a 3 px gold line under each line of the captured text, the Palavra's `kw-bg` band
  (50%–94% of the line) over each of its words, and the chip above the text (below it when there is no room):
  icon · title · `auto:`/`palavra:` (`montarChipDaPalavra`, from `autoKeyword`) · meta. The scraping returns
  `{ texto, elementos }` (`lerLegenda`; `obterLegendaAtual` is its text); `lugarDaLegenda` and
  `lugarDaSelecao` hand the overlay a function that gives a `Range` only while those elements (or that
  selection) still say the captured text. The mark follows it every frame and leaves at once when it changes.
  A caption that changed before the answer, a selection inside an `input`/`textarea` (no range over the
  page's text), a text outside the player the overlay lives in, and every failure go to the pill. The screen
  reader hears the chip and the phrase (visually hidden) in the `role="status"` region; the line and the band
  are `aria-hidden`. The automatic mining uses the same mark, fainter (`pm--apagada`), with the Palavra saved
  with the phrase, or — Russian is saved without one — the i+1 item (`evaluation.keywords`) that made it
  accept the phrase. With `prefers-reduced-motion` the mark appears with no animation.
- **Pill (the reserve C of M1, kept minimal after the owner's review):** the button stretches left into icon ·
  title · a second line · the meta in mono. On a success the second line is the phrase with the Palavra
  highlighted (`escreverFrase`; a long phrase starts near the Palavra, so it is never cut); on a failure it is
  the catalog's `dica`. The meta is the capture's language code on a caption (`EN`, `RU`), the Fonte “Web”
  (`PAI-29.web`) on a selection, and the language with the day's counter on the automatic mining (`RU 5/20`),
  as in the prototype — the chip carries the same meta. Without a player it appears alone in the window's bottom-right corner, with the tile
  as a plain mark at its end (not a button: `aria-hidden`, out of the Tab order; no mark on a failure), and
  disappears entirely. The content sits in a `role="status"` region. One at a time: a new feedback replaces
  the previous one. Every feedback — success or failure, mark or pill — leaves after ~3.5 s, as in the prototype; Esc
  closes a failure sooner. There is no × and no “Tentar de novo”. The automatic mining's MIN-06 never takes
  a failure off the screen.
- **Counter:** the gold mono pill in the button's corner is the automatic mining's `n/limite` **of the caption's
  language** (the one on screen, read on every automatic-mining pass, or the last capture's; before any
  caption, the only enabled language), not the toolbar badge's sum. At the limit it becomes a gold outline;
  with that language's automatic mining off it disappears. The screen reader hears it as the button's
  description (MIN-11).
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
  a frame without a video asks the others first (`HA_VIDEO_EM_OUTRO_FRAME`, see Cross-Frame Communication in `CLAUDE.md`), so
  a player in a cross-origin iframe never gets a false MIN-10 from the top frame.
- **Typing is the person's:** neither shortcut fires while typing in an `input`, `textarea`, `select` or
  `contenteditable` (`Atalhos.digitandoNumCampo`, through the event's composed path; inside a *closed* shadow
  root the event reaches the content script retargeted to the host, so it opens the root with
  `chrome.dom.openOrClosedShadowRoot` and looks at the focus inside). An Esc typed in a site's field stays the
  site's too, even with a failure open.
