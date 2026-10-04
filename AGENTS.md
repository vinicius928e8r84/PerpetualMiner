# Repository Guidelines

## Project Structure & Module Organization

A Chrome extension (Manifest V3, plain JavaScript, no build) plus a local Python bridge (`bridge/`, Flask) that runs the card pipeline in `engine/` (`bridge/config.json` › `automatic_anki_path`).

- **Files:** the role of every root file and every `lib/` module is in the table of `CLAUDE.md` § Architecture › Files; a new file gets its row there, not here.
- **Design specs and prototypes:** `docs/design/README.md` (index); `docs/superpowers/specs/` holds three old bridge notes (June). Domain glossary: `CONTEXT.md`.
- **Veio identity:** `veio/README.md`. **Envio state machine:** `bridge/envio.py`'s docstring. **Engine:** `engine/CLAUDE.md`. **Device and store tooling:** `scripts/`, `docs/instalar-extensao.md`, `docs/publicar-chrome-web-store.md`.
- **Tests:** `e2e/` (see `CLAUDE.md` § Testing), root `test_*.js`, `bridge/test_*.py`, `engine/test_*.py`.
- `bridge/runtime/` is runtime data, not source. `preview/` only copies files into `preview/dist`; never edit an extension file to make the preview work.

## Standards

What the reviewer enforces (Voice catalog copy, Veio tokens, base components, storage writes, tests): `CODING_STANDARDS.md`.

## Commands

- Fast checks: `node test_auto_keyword.js && node test_sync.js && node test_empacotar.js`.
- Bridge: `python3 bridge/test_envio.py` (no Flask needed); `bridge/test_anki_launcher.py` and `bridge/test_envio_api.py` need `pip install -r bridge/requirements.txt`. Engine: `cd engine && python3 -m unittest discover -p "test_*.py"` (needs `engine/requirements.txt`).
- e2e: `cd e2e && npx playwright test <specs> --workers=2`; the whole suite with `npm test` (first time: `npm ci` and `npm run setup`; see `CLAUDE.md` § Testing).
- Running and installing the bridge on Windows, and its routes: `bridge/README.md`. When debugging Anki, try `/health`, `/anki/status` and `/anki/repair` before killing processes.

Add or update focused tests when touching bridge launch, Anki repair, sync, or panel logic. New extension behavior is tested in `e2e/`. Name Python tests by behavior, for example `test_anki_launch_omits_profile_when_last_loaded_matches_config`.

## Security & Configuration

Keep local paths and Anki settings in `bridge/config.json`. Do not commit secrets, API keys, browser profile data, or generated job artifacts.

## Rules and what enforces them

`node scripts/regras/verificar.js` checks what a script can see (same command in CI, `.github/workflows/regras.yml`; its proofs: `node scripts/regras/test_regras.js`). It fails only when a file gets more hits than `scripts/regras/linha-de-base.json` allows, and the error names what to use instead. The baseline only goes down (`--atualizar` after a fix); a hit that must stay takes, on its own line, `exceção <regra> até AAAA-MM-DD, aprovada por <pessoa>: <motivo>`.

| Rule (`CODING_STANDARDS.md`) | Enforced by |
|---|---|
| 1 Copy from the Voice catalog | review; `e2e/tests/catalogo-da-voz.spec.js` keeps the catalog equal to the Voice spec |
| 2 Veio tokens | `tokens-veio` |
| 3 Each component once | review |
| 4 Page text as text | `e2e/tests/texto-literal.spec.js` for the surfaces it covers; review |
| 5 Language through `lib/idioma.js` | `idioma-solto` |
| 6 True status (C8) | review |
| 7 `frases` / `pm_pending_sync` writes | `gravacao-de-frases` (a new write outside `naFilaDeGravacao`); a stale copy written by an existing site: review |
| 8 e2e checks screen and storage | `e2e-funcao-interna` (an `evaluate` that calls extension code names its exception); screen check in every variant: review |
| 9 Python tests exercise behavior | `teste-le-codigo` |
| 10 Visual reference after the owner approves | review |
| 11 New file: Files row, loaded, packaged | review; `test_empacotar.js` for the package |

When the same correction comes up twice, add its rule to `CODING_STANDARDS.md` and this table, enforced at the highest level that works (a rule in `scripts/regras/` for a pattern a script can see).

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
