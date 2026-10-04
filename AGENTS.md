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

- Fast checks: `node test_auto_keyword.js && node test_sync.js && node test_empacotar.js`.
- Add-on: `python3.9 complemento/test_servidor.py`, `test_inicio.py` and `test_pacote.py`, also with `python3.13` (`uv python install 3.9 3.13` if missing).
- Bridge: `python3 bridge/test_envio.py` (no Flask needed); `bridge/test_anki_launcher.py` and `bridge/test_envio_api.py` need `pip install -r bridge/requirements.txt`. Engine: `cd engine && python3 -m unittest discover -p "test_*.py"` (needs `engine/requirements.txt`).
- e2e: `cd e2e && npx playwright test <specs> --workers=2`; the whole suite with `npm test` (first time: `npm ci` and `npm run setup`; see `CLAUDE.md` § Testing).
- Running and installing the bridge on Windows, and its routes: `bridge/README.md`. When debugging Anki, try `/health`, `/anki/status` and `/anki/repair` before killing processes.

Add or update focused tests when touching bridge launch, Anki repair, sync, or panel logic. New extension behavior is tested in `e2e/`. Name Python tests by behavior, for example `test_anki_launch_omits_profile_when_last_loaded_matches_config`.

## Security & Configuration

Keep local paths and Anki settings in `bridge/config.json`. Do not commit secrets, API keys, browser profile data, or generated job artifacts.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
