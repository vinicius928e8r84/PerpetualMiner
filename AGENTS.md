# Repository Guidelines

## Project Structure & Module Organization

This repository contains a Chrome extension plus a local Python bridge for Anki integration.

- Root extension files: `manifest.json`, `background.js`, `content.js`, `popup.*`, `painel.*`, `bookreader.*`, and `tombstone.js` (shared by the service worker and the panel).
- Shared extension modules live in `lib/`: `lib/voz/` (the Voice catalog and `textoDaVoz`) and `lib/idioma.js` (`detectarIdioma`). Every surface loads them before its own script. Vendor browser libraries live in `lib/firebase/`.
- New or rewritten UI copy comes from the Voice catalog by ID, never from a literal in the surface. The surfaces still hold their old literals; each redesign step moves the surface it rebuilds. See the shared base section of `CLAUDE.md`.
- The local bridge lives in `bridge/`: `server.py` exposes the HTTP API, `run_bridge.py` starts it, and `install_autostart.py` / `uninstall_autostart.py` manage Windows startup.
- Bridge tests are in `bridge/test_anki_launcher.py`; root-level tests cover panel and sync behavior.
- `e2e/` holds the Playwright suite that runs the unpacked extension in Chromium, with its own `package.json` so the extension root stays free of Node files.
- `bridge/runtime/` contains generated logs, queues, screenshots, job state, audio, images, and card output. Treat it as runtime data, not source.
- Design notes are under `docs/superpowers/specs/`.
- `preview/` builds the static site Vercel publishes for each branch (`node preview/montar.mjs --servir` runs it locally). It only ever copies files into `preview/dist`; never edit an extension file to make the preview work.

## Build, Test, and Development Commands

- `python bridge\server.py`: run the bridge manually for debugging.
- `python bridge\run_bridge.py`: start the bridge using the same launcher used by autostart.
- `python bridge\install_autostart.py`: install/update Windows autostart for the bridge.
- `python bridge\test_anki_launcher.py`: run bridge launcher and Anki repair tests.
- `python -m py_compile bridge\server.py bridge\test_anki_launcher.py`: check Python syntax.
- `node --check painel.js`: check panel JavaScript syntax.
- `node test_auto_keyword.js`: run keyword extraction tests.
- `node test_sync.js`: run local sync/tombstone tests.
- `python test_panel_russian_style.py`: run Russian panel style tests.
- `cd e2e && npm test`: run the Playwright suite against the unpacked extension in Chromium (first time: `npm ci` and `npm run setup`). See the Testing section of `CLAUDE.md`.

## Coding Style & Naming Conventions

Use 4-space indentation in Python and 2-space indentation in JavaScript/CSS/HTML when editing existing files. Keep Python names `snake_case`, JavaScript functions/variables `camelCase`, constants `UPPER_SNAKE_CASE`, and DOM IDs/classes consistent with existing Portuguese UI naming. Prefer small, explicit helpers over broad refactors. Avoid changing generated files in `bridge/runtime/`.

## Testing Guidelines

Add or update focused tests when touching bridge launch, Anki repair, sync, or panel logic. Python tests use `unittest`; legacy JavaScript tests are plain Node scripts; new extension behavior is tested in `e2e/` through the real extension (assert what the person sees and what gets stored, not internal functions; the two narrow exceptions, for the native context menu and for catalog states no surface shows yet, are in the Testing section of `CLAUDE.md`). Name new tests by behavior, for example `test_anki_launch_omits_profile_when_last_loaded_matches_config`.

## Commit & Pull Request Guidelines

No Git history is available in this working copy, so use clear imperative commit messages such as `Fix Anki profile launch`. Pull requests should include a short problem summary, changed files, test commands run, and screenshots only for visible UI changes.

## Security & Configuration Tips

Keep local paths and Anki settings in `bridge/config.json`. Do not commit secrets, API keys, browser profile data, or generated job artifacts. When debugging Anki, prefer `/health`, `/anki/status`, and `/anki/repair` before manually killing processes.
