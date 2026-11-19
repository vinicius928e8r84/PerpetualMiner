# Coding Standards

What the reviewer enforces on a change. Each rule points to where it is explained; read that section only if the rule is not enough. Anything not listed here follows the surrounding code.

## Open the surface's skill first

The rules that cross surfaces are in `docs/arquitetura.md` and the role of each file in `docs/arquivos/`; the architecture of each surface lives in a project skill (`.claude/skills/<name>/SKILL.md`). When the diff touches a surface, open its skill before you review or change it, even if you are not "changing" the surface itself (a rename in a shared file, a copy edit, a test): the skill says what the surface shows, the IDs it implements, what it stores and which test holds its visual reference.

| The diff touches | Open |
|------|------|
| `painel/painel-boas-vindas.js`, `lib/configuracao.js`, `painel/painel-lembrete.js` | `boas-vindas` |
| `painel/painel-ia.js`, `lib/chave-da-openai.js`, `painel/painel-chave.js`, `painel/painel-perigo.js`, `painel/painel-atalhos.js`, `lib/atalhos.js`, `painel/painel-conta.js`, `painel/painel-abrir-anki.js` | `configuracoes` |
| `popup.html/js/css` | `popup` |
| `painel/painel.js`, `painel/painel.css` (Frases list, Minerar frases) | `painel-frases` |
| `painel/painel-anki*.js`, `painel/painel-ajustes.js`, `painel/painel-envio.js`, `lib/ajustes-de-envio.js` | `painel-anki` |
| `bookreader.html/js/css` | `minerar-foto` |
| `veio/componentes.css`, `veio/componentes.js` | `veio-componentes` |
| `overlay.js`, `overlay.css`, `content.js` (the caption and selection capture and the answer on screen) | `overlay` |
| `e2e/fixtures.js`, `e2e/fakes/`, `e2e/pages/`, `e2e/vitrine/`, `e2e/tests/*-visual.spec.js` | `e2e-suite` |

A surface not in this table (the panel shell, sync, storage, the service worker) is still described in `docs/arquitetura.md` itself.

## UI copy and look

1. **UI copy comes from the Voice catalog by ID** (`textoDaVoz('MIN-08')`), for new or rewritten copy. The only literals a surface may write are `palavra:`, `auto:` and `Detalhes`, which the base components write themselves. Source: `docs/arquitetura.md` § Shared base and the `veio-componentes` skill ("Copy does not live in the components").
2. **Colors, font sizes, radii and durations are tokens**, used as `var(--veio-…)` from `veio/tokens.css`; a new value becomes a token there. The exceptions (the icon SVGs, the badge colors in `background.js`, and the size and radius of the toolbar-badge imitation in the showcase) are the ones documented in `veio/README.md` § Como usar; no others.
3. **Each component exists once** (`veio/componentes.css` + `veio/componentes.js`): the toast is for success only; an error that asks for an action is `montarAviso` with Detalhes; danger has two variants (`--perigo` opens the modal, `--perigo-cheio` confirms inside it); the browser's `confirm()`, `alert()` and `prompt()` fail rule `dialogo-nativo`. Two approved exceptions stay: FOT-18 in Minerar de uma foto (Descartar confirms inside the modal with contour, `confirmarComContorno: true`) and ADD-06 (an aviso with an action and no Detalhes, by the owner's decision; the cause is in the Conta & sync card). Source: the `veio-componentes` skill (danger variants) and the `painel-frases` skill (§ Minerar frases, ADD-06).
4. **The DOM is built with nodes, and text from the page or the phrase goes in as text, never as HTML** (`escreverFrase`, `textContent`); rule `html-cru` fails `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `createContextualFragment` and `document.write` in the extension's JS. Source: the `veio-componentes` skill ("The highlighted Word").
5. **Language is compared with `PerpetualMiner.IDIOMAS` and detected with `detectarIdioma`**, never with a loose `'Russo'`/`'Inglês'` string or a new detector. Source: `docs/arquitetura.md` § Shared base.
6. **Status on screen says the true current state** (rule C8 of the Voice); a doc or a test must not pin a state that contradicts it. Source: `docs/design/voz/README.md` (C8).

## Storage

7. **Reading and rewriting `frases`:** every write goes through an operation of `PerpetualMiner.Historico` (`lib/historico.js`), in the service worker, on a page and in `lib/`; a missing operation is added there, and it reads `frases` again inside the lock and changes only what was asked (source: `docs/arquitetura.md` § Write Serialization). Never write back a snapshot taken before an upload or a call to the Conexão: a stale snapshot loses phrases.

## Tests

8. **e2e tests check the screen and what ends up stored**, in every variant the test adds. The three exceptions (native Chrome UI or clock, catalog states no surface shows yet, base-component guarantees with no on-screen trigger) carry a comment that names them. What ends up stored is read after the test's last action and compared with a concrete value (a read nobody compares does not count) (`estadoFinal` in `e2e/estado-final.js`, `extensao.lerStorage`, `extensao.frases()`, what the fake kept); a photo or a text on screen is not enough (#189, #190). A test that stores nothing (a filter, a tab) says so: `// Exceção de teste: sem-estado-guardado — <reason>`. A test of time stops the clock through the `relogioParado` fixture (`e2e/relogio-parado.js`; rule `relogio-fora-da-fixture` refuses `clock.install`/`pauseAt`, an alias or destructuring of `page.clock`, bracket access and the exported `montarRelogio` anywhere else; only `e2e/tests/relogio-parado.spec.js` calls `montarRelogio`) and moves it with `relogio.avancar`; a timing flake is never fixed with a larger timeout or a retry (#209). Source: `docs/testes.md`.
9. **A new Python test exercises the route or the function**, never the source text of the code (`complemento/test_servidor.py` and `complemento/test_envio.py` are the model: the route over HTTP, the function with fakes at the borders).
10. **A new visual reference** (`--update-snapshots`) only goes in after the owner approves the look, and the approval is recorded in `e2e/aprovados-visuais.json` (rule `aprovacao-visual`). Source: the header comment of each `e2e/tests/*-visual.spec.js`, the `e2e-suite` skill (the list of visual references) and `docs/testes.md`.

## New files

11. **A new file gets its row in a table of `docs/arquivos/` and is loaded where it is used**: `content_scripts` in `manifest.json`, `importScripts` in `background.js`, and a `<script>` in each page. `scripts/arquivos-do-pacote.js` and `lib/arquivos-da-extensao.js` decide what ships in the Chrome Web Store package. Source: `docs/arquivos/` and `docs/arquitetura.md` § Shared base.

## The gate

12. **Every test file belongs to a group in `scripts/testes.json`, and CI runs the groups only through `node scripts/testar.mjs <group>`**: a test that no job runs proves nothing on the PR (#185 left the add-on and fake tests out; #188 left the tooling tests out). A file that has a test's name and is not one goes in `fora` with the reason. Source: `docs/testes.md`.
13. **The extension asks the Conexão com o Anki only through `PedidoAoAnki`, and `complemento/contrato/exemplos.json` has an example of every request it builds and every status the add-on answers to a route**: a request typed by hand, or a state with no example, is how #190's Atualizar (two Baralhos, the contract only had one) and #185's health `500` got through. A new route gets its builder and its examples before the extension asks for it. Source: `complemento/contrato/LEIA-ME.md`.
14. **A change adds no code comment** (JS, Python, HTML/CSS, shell, workflow YAML; not `docs/`): a comment ages on its own, and the next agent copies a decision made for one case as a rule for all. What the code does goes into the name of the function or variable; why it was decided goes into the PR body, `docs/` or `glossary.md`. Only the lines the diff adds count (rule `sem-comentario-novo`): a comment the diff leaves untouched does not block, but one on a line the diff changes, re-indents or moves counts as new, so delete it. What passes is closed: the `#!` of line 1, tool directives (`eslint-disable`, `@ts-*`, `noqa`, `type: ignore`, `istanbul ignore`, `prettier-ignore`, `coding:`), a license header, and the marks another rule reads (`exceção <rule> até …`, `Exceção de teste: …`, `@estado-guardado`). Anything else carries `exceção sem-comentario-novo até AAAA-MM-DD, aprovada por <person>: <reason>` on its own line.
15. **A PR body says its issue, and `Closes` closes it**: one line `Closes https://github.com/<owner>/<repo>/issues/<N>` per issue (the full URL; a bare `#N` does not count), so the issue closes by itself at the merge. A PR whose real proof is still pending (rule R10) also uses `Closes`, and the body says what is missing on a line `Prova que falta: <text>`. `Refs <URL>` is for a PR that is one step of a series: the issue stays open, and the body says what is still missing on the same `Prova que falta:` line. A PR with no issue says `Sem issue` alone on its line. Enforced by the `Registro da PR` check (`scripts/ci/registro-da-pr.js`; format in `.github/PULL_REQUEST_TEMPLATE.md`).

## What blocks a merge

A review verdict has three levels. Only the first stops the merge.

- **Blocks:** a finding rated HIGH (ALTA), or a regression against `main` (something that worked on `main` and does not on the branch).
- **Fix if cheap:** a new MEDIUM (MÉDIA) finding that this diff brings. Fix it in the PR when the fix is small; otherwise it goes to the next level.
- **Becomes an issue:** everything else (a MEDIUM that was already on `main`, LOW findings, style, a limit the owner has accepted and named). Open an issue and link it; do not hold the PR for it.
