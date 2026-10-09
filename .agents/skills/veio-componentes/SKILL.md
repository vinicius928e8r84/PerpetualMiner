---
name: veio-componentes
description: "Use when changing or reviewing the Veio base components (`veio/componentes.css`, `veio/componentes.js`) or any surface that uses them. Reviewers: open it when the PR touches that surface. It holds the architecture notes moved out of CLAUDE.md for it (what it shows, the IDs it implements, its storage and its tests)."
---

# Veio base components

Notes moved unchanged from `CLAUDE.md` § Architecture. `CLAUDE.md` keeps the file table and the rules that cross surfaces.

### Base components (`veio/componentes.css` + `veio/componentes.js`)

A component exists **once**. A surface that needs a button uses `.veio-botao`; it does not redraw
its own. The three pages load both files right after `tokens.css` / `lib/voz/texto.js`, so a
rebuilt surface starts from the shared classes and `PerpetualMiner.Veio`:

```js
const { abrirModal, mostrarToastDeSucesso, escreverFrase } = PerpetualMiner.Veio;
```

The rules the components encode, so a surface does not have to re-decide them:

- **Danger has two variants:** `--perigo` (outline) is the entry that opens the destructive modal;
  `--perigo-cheio` is only the button that confirms inside it. The single exception is Minerar de uma foto's
  FOT-18 (`abrirConfirmacao({ confirmarComContorno: true })`), approved by the owner to match its prototype.
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
  icon at its start (`'info'`, the “i”, for an informative aviso), and `tom: 'info'` makes an aviso that only informs (FOT-21's cancelled reading): neutral
  colours and `role="status"` instead of the danger `alert`. An aviso that *is* a state (a failed sync) passes `fechavel: false`:
  no ×, it leaves when the problem does. `montarDetalhes(causa, documento, rotulo)` is that same “Detalhes” alone (a screen whose collapsed block has its own name in the Voz, like “O arquivo não abriu?”, passes it as `rotulo`), for
  when the screen's state already says what happened (the cloud refused, the session expired).
  The toast and the aviso **enter with the same short step** (the `veio-entra` keyframe, one
  `--veio-transicao`), so an aviso that appears mid-reading — the F1 strip, the aviso do Anki of
  ONB-16 — does not pop in. Under `prefers-reduced-motion` both are a still frame
  (`animation: none`, next to the skeleton's shimmer and the “Lendo…” dot).
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
