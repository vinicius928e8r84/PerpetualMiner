# Coding Standards

What the reviewer enforces on a change. Each rule points to where it is explained; read that section only if the rule is not enough. Anything not listed here follows the surrounding code.

## Open the surface's skill first

`CLAUDE.md` keeps the file table and the rules that cross surfaces; the architecture of each surface lives in a project skill (`.claude/skills/<name>/SKILL.md`). When the diff touches a surface, open its skill before you review or change it, even if you are not "changing" the surface itself (a rename in a shared file, a copy edit, a test): the skill says what the surface shows, the IDs it implements, what it stores and which test holds its visual reference.

| The diff touches | Open |
|------|------|
| `painel-boas-vindas.js`, `lib/configuracao.js`, `painel-lembrete.js` | `boas-vindas` |
| `painel-chave.js`, `painel-perigo.js`, `painel-atalhos.js`, `lib/atalhos.js`, `painel-conta.js`, `painel-abrir-anki.js` | `configuracoes` |
| `popup.html/js/css` | `popup` |
| `painel.js`, `painel.css` (Frases list, Minerar frases) | `painel-frases` |
| `painel-anki*.js`, `painel-ajustes.js`, `painel-envio.js`, `lib/ajustes-de-envio.js` | `painel-anki` |
| `bookreader.html/js/css` | `minerar-foto` |
| `veio/componentes.css`, `veio/componentes.js` | `veio-componentes` |
| `overlay.js`, `overlay.css`, `content.js` (the caption and selection capture and the answer on screen) | `overlay` |
| `e2e/fixtures.js`, `e2e/fakes/`, `e2e/pages/`, `e2e/vitrine/`, `e2e/tests/*-visual.spec.js` | `e2e-suite` |

A surface not in this table (the panel shell, sync, storage, the service worker) is still described in `CLAUDE.md` itself.

## UI copy and look

1. **UI copy comes from the Voice catalog by ID** (`textoDaVoz('MIN-08')`), for new or rewritten copy. The only literals a surface may write are `palavra:`, `auto:` and `Detalhes`, which the base components write themselves. Source: `CLAUDE.md` § Shared base and the `veio-componentes` skill ("Copy does not live in the components").
2. **Colors, font sizes, radii and durations are tokens**, used as `var(--veio-…)` from `veio/tokens.css`; a new value becomes a token there. The exceptions (the icon SVGs, the badge colors in `background.js`, and the size and radius of the toolbar-badge imitation in the showcase) are the ones documented in `veio/README.md` § Como usar; no others.
3. **Each component exists once** (`veio/componentes.css` + `veio/componentes.js`): the toast is for success only; an error that asks for an action is `montarAviso` with Detalhes; danger has two variants (`--perigo` opens the modal, `--perigo-cheio` confirms inside it); no `confirm()`. Two approved exceptions stay: FOT-18 in Minerar de uma foto (Descartar confirms inside the modal with contour, `confirmarComContorno: true`) and ADD-06 (an aviso with an action and no Detalhes, by the owner's decision; the cause is in the Conta & sync card). Source: the `veio-componentes` skill (danger variants) and the `painel-frases` skill (§ Minerar frases, ADD-06).
4. **The DOM is built with nodes, and text from the page or the phrase goes in as text, never as HTML** (`escreverFrase`, `textContent`; no `innerHTML` with that text). Source: the `veio-componentes` skill ("The highlighted Word").
5. **Language is compared with `PerpetualMiner.IDIOMAS` and detected with `detectarIdioma`**, never with a loose `'Russo'`/`'Inglês'` string or a new detector. Source: `CLAUDE.md` § Shared base.
6. **Status on screen says the true current state** (rule C8 of the Voice); a doc or a test must not pin a state that contradicts it. Source: `docs/design/voz/README.md` (C8).

## Storage

7. **Reading and rewriting `frases` or `pm_pending_sync`:** in the service worker, always through `naFilaDeGravacao` (source: `CLAUDE.md` § Write Serialization). On a page, read the current state again after every `await`, before writing; never write back a snapshot taken before an upload or a call to the Conexão. The page half is a reviewer rule, not written in `CLAUDE.md`; its motivation is the same section's "Not covered by the queue" (the panel and `lib/sincronizacao.js` write outside the queue, so a stale snapshot loses phrases).

## Tests

8. **e2e tests check the screen and what ends up stored**, in every variant the test adds. The three exceptions (native Chrome UI or clock, catalog states no surface shows yet, base-component guarantees with no on-screen trigger) carry a comment that names them. What ends up stored is read after the test's last action and compared with a concrete value (a read nobody compares does not count) (`estadoFinal` in `e2e/estado-final.js`, `extensao.lerStorage`, `extensao.frases()`, what the fake kept); a photo or a text on screen is not enough (#189, #190). A test that stores nothing (a filter, a tab) says so: `// Exceção de teste: sem-estado-guardado — <reason>`. A test of time stops the clock through the `relogioParado` fixture (`e2e/relogio-parado.js`; rule `relogio-fora-da-fixture` refuses `clock.install`/`pauseAt` anywhere else) and moves it with `relogio.avancar`; a timing flake is never fixed with a larger timeout or a retry (#209). Source: `CLAUDE.md` § Testing.
9. **A new Python test exercises the route or the function**, never the source text of the code (`complemento/test_servidor.py` and `complemento/test_envio.py` are the model: the route over HTTP, the function with fakes at the borders).
10. **A new visual reference** (`--update-snapshots`) only goes in after the owner approves the look, and the approval is recorded in `e2e/aprovados-visuais.json` (rule `aprovacao-visual`). Source: the header comment of each `e2e/tests/*-visual.spec.js`, the `e2e-suite` skill (the list of visual references) and `CLAUDE.md` § Testing.

## New files

11. **A new file gets its row in `CLAUDE.md` § Architecture › Files and is loaded where it is used**: `content_scripts` in `manifest.json`, `importScripts` in `background.js`, and a `<script>` in each page. `scripts/arquivos-do-pacote.js` and `lib/arquivos-da-extensao.js` decide what ships in the Chrome Web Store package. Source: `CLAUDE.md` § Files and § Shared base.

## The gate

12. **Every test file belongs to a group in `scripts/testes.json`, and CI runs the groups only through `node scripts/testar.mjs <group>`**: a test that no job runs proves nothing on the PR (#185 left the add-on and fake tests out; #188 left the tooling tests out). A file that has a test's name and is not one goes in `fora` with the reason. Source: `CLAUDE.md` § Testing.
13. **The extension asks the Conexão com o Anki only through `PedidoAoAnki`, and `complemento/contrato/exemplos.json` has an example of every request it builds and every status the add-on answers to a route**: a request typed by hand, or a state with no example, is how #190's Atualizar (two Baralhos, the contract only had one) and #185's health `500` got through. A new route gets its builder and its examples before the extension asks for it. Source: `complemento/contrato/LEIA-ME.md`.

## What blocks a merge

A review verdict has three levels. Only the first stops the merge.

- **Blocks:** a finding rated HIGH (ALTA), or a regression against `main` (something that worked on `main` and does not on the branch).
- **Fix if cheap:** a new MEDIUM (MÉDIA) finding that this diff brings. Fix it in the PR when the fix is small; otherwise it goes to the next level.
- **Becomes an issue:** everything else (a MEDIUM that was already on `main`, LOW findings, style, a limit the owner has accepted and named). Open an issue and link it; do not hold the PR for it.
