# Coding Standards

What the reviewer enforces on a change. Each rule points to where it is explained; read that section only if the rule is not enough. Anything not listed here follows the surrounding code.

## UI copy and look

1. **UI copy comes from the Voice catalog by ID** (`textoDaVoz('MIN-08')`), for new or rewritten copy. The only literals a surface may write are `palavra:`, `auto:` and `Detalhes`, which the base components write themselves. Source: `CLAUDE.md` § Shared base and § Base components ("Copy does not live in the components").
2. **Colors, font sizes, radii and durations are tokens**, used as `var(--veio-…)` from `veio/tokens.css`; a new value becomes a token there. The exceptions (the icon SVGs, the badge colors in `background.js`, and the size and radius of the toolbar-badge imitation in the showcase) are the ones documented in `veio/README.md` § Como usar; no others.
3. **Each component exists once** (`veio/componentes.css` + `veio/componentes.js`): the toast is for success only; an error that asks for an action is `montarAviso` with Detalhes; danger has two variants (`--perigo` opens the modal, `--perigo-cheio` confirms inside it); no `confirm()`. Two approved exceptions stay: FOT-18 in Minerar de uma foto (Descartar confirms inside the modal with contour, `confirmarComContorno: true`) and ADD-06 (an aviso with an action and no Detalhes, by the owner's decision; the cause is in the Conta & sync card). Source: `CLAUDE.md` § Base components (danger variants) and § Minerar frases (ADD-06).
4. **The DOM is built with nodes, and text from the page or the phrase goes in as text, never as HTML** (`escreverFrase`, `textContent`; no `innerHTML` with that text). Source: `CLAUDE.md` § Base components ("The highlighted Word").
5. **Language is compared with `PerpetualMiner.IDIOMAS` and detected with `detectarIdioma`**, never with a loose `'Russo'`/`'Inglês'` string or a new detector. Source: `CLAUDE.md` § Shared base.
6. **Status on screen says the true current state** (rule C8 of the Voice); a doc or a test must not pin a state that contradicts it. Source: `docs/design/voz/README.md` (C8).

## Storage

7. **Reading and rewriting `frases` or `pm_pending_sync`:** in the service worker, always through `naFilaDeGravacao` (source: `CLAUDE.md` § Write Serialization). On a page, read the current state again after every `await`, before writing; never write back a snapshot taken before an upload or a bridge call. The page half is a reviewer rule, not written in `CLAUDE.md`; its motivation is the same section's "Not covered by the queue" (the panel and `lib/sincronizacao.js` write outside the queue, so a stale snapshot loses phrases).

## Tests

8. **e2e tests check the screen and what ends up stored**, in every variant the test adds. The three exceptions (native Chrome UI or clock, catalog states no surface shows yet, base-component guarantees with no on-screen trigger) carry a comment that names them. Source: `CLAUDE.md` § Testing.
9. **A new Python test exercises the route or the function**, never the source text of the code (`_function_source` in `bridge/test_anki_launcher.py` is the old way; `bridge/test_envio.py` is the model).
10. **A new visual reference** (`--update-snapshots`) only goes in after the owner approves the look. Source: the header comment of each `e2e/tests/*-visual.spec.js` and `CLAUDE.md` § Testing.

## New files

11. **A new file gets its row in `CLAUDE.md` § Architecture › Files and is loaded where it is used**: `content_scripts` in `manifest.json`, `importScripts` in `background.js`, and a `<script>` in each page. `scripts/arquivos-do-pacote.js` and `lib/arquivos-da-extensao.js` decide what ships in the Chrome Web Store package. Source: `CLAUDE.md` § Files and § Shared base.
