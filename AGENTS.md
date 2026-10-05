# Repository Guidelines

## Project Structure & Module Organization

A Chrome extension (Manifest V3, plain JavaScript, no build) plus a local Python bridge (`bridge/`, Flask) that runs the card pipeline in `engine/` (`bridge/config.json` › `automatic_anki_path`).

- **Files:** the role of every root file and every `lib/` module is in the table of `CLAUDE.md` § Architecture › Files; a new file gets its row there, not here.
- **Design specs and prototypes:** `docs/design/README.md` (index); `docs/superpowers/specs/` holds three old bridge notes (June). Domain glossary: `CONTEXT.md`.
- **Veio identity:** `veio/README.md`. **Envio state machine:** `bridge/envio.py`'s docstring. **Engine:** `engine/CLAUDE.md`. **Device and store tooling:** `scripts/`, `docs/instalar-extensao.md`, `docs/publicar-chrome-web-store.md`.
- **Tests:** `e2e/` (see `CLAUDE.md` § Testing), root `test_*.js`, `bridge/test_*.py`, `engine/test_*.py`.
- `bridge/runtime/` is runtime data, not source. `preview/` only copies files into `preview/dist`; never edit an extension file to make the preview work.
- **Conexão com o Anki as an Anki add-on:** `complemento/` (standard library only, Python 3.9 and 3.13); its HTTP contract with the extension is `complemento/contrato/exemplos.json`, and `complemento/contrato/LEIA-ME.md` says how a new route enters. The bridge in `bridge/` stays until the add-on replaces it.

## Standards

What the reviewer enforces (Voice catalog copy, Veio tokens, base components, storage writes, tests): `CODING_STANDARDS.md`.

## Commands

- All tests: `node scripts/testar.mjs [<grupo>]` is the command CI runs for every job; the groups, and which files each one runs, are in `scripts/testes.json` (`--listar` shows them; no group runs the light ones; `-- <args>` reaches unittest/Playwright, e.g. `node scripts/testar.mjs e2e -- popup --workers=2`; `PYTHON=` picks the interpreter). A new test file joins a group there, or `testes-no-portao` fails.
- Fast checks: `node scripts/testar.mjs node regras ferramentas` (the Node tests, the rule proofs, the tooling).
- Add-on: `PYTHON=python3.9 node scripts/testar.mjs complemento`, also with `python3.13` (`uv python install 3.9 3.13` if missing).
- Bridge: `node scripts/testar.mjs bridge` (needs `pip install -r bridge/requirements.txt`; `python3 bridge/test_envio.py` alone needs no Flask); engine: `node scripts/testar.mjs engine` (needs `engine/requirements.txt`). `scripts/preparar-python.sh` makes the venv.
- e2e: `node scripts/testar.mjs e2e -- <specs> --workers=2` (the same as `cd e2e && npx playwright test <specs> --workers=2`); the whole suite with `npm test` in `e2e/` (first time: `npm ci` and `npm run setup`; see `CLAUDE.md` § Testing).
- Proving a change by driving the extension (launch, doctor, evidence, cleanup, feature map): `.agents/skills/verify-perpetualminer/SKILL.md` (also linked from `.claude/skills/`).
- Running and installing the bridge on Windows, and its routes: `bridge/README.md`. When debugging Anki, try `/health`, `/anki/status` and `/anki/repair` before killing processes.

Add or update focused tests when touching bridge launch, Anki repair, sync, or panel logic. New extension behavior is tested in `e2e/`. Name Python tests by behavior, for example `test_anki_launch_omits_profile_when_last_loaded_matches_config`.

## Security & Configuration

Keep local paths and Anki settings in `bridge/config.json`. Do not commit secrets, API keys, browser profile data, or generated job artifacts.

## Rules and what enforces them

`node scripts/regras/verificar.js` checks what a script can see, the same in CI; how its baseline and line exceptions work: `--help`.

| Rule (`CODING_STANDARDS.md`) | Enforced by |
|---|---|
| 1 Voice catalog | review; `e2e/tests/catalogo-da-voz.spec.js` |
| 2 Veio tokens | `tokens-veio` |
| 3 Components | review |
| 4 Page text as text | `e2e/tests/texto-literal.spec.js`; review |
| 5 Language | `idioma-solto` |
| 6 True status | review |
| 7 Storage writes | `gravacao-de-frases` (new write sites); a stale copy in an existing one: review |
| 8 e2e tests | `e2e-funcao-interna` (unnamed exceptions); screen check per variant: review |
| 9 Python tests | `teste-le-codigo` |
| 12 Every test runs in CI | `testes-no-portao` |
| 10 Visual references | review |
| 11 New files | review; `test_empacotar.js` |

A PR that changes a user-facing file (`popup.*`, `painel*`, `manifest.json`, `bridge/server.py`, …) also needs `.agents/skills/verify-perpetualminer/features/` updated or "feature map unchanged" in its body: the `Mapa de features` step of `.github/workflows/regras.yml` (PRs only).

When the same correction comes up twice, add its rule to `CODING_STANDARDS.md` and this table, enforced at the highest level that works.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
