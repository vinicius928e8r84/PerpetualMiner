# Repository Guidelines

## Project Structure & Module Organization

This repository contains a Chrome extension plus a local Python bridge for Anki integration.

- Root extension files: `manifest.json`, `background.js`, `content.js`, `popup.*`, `painel.*`, and `bookreader.*`.
- Vendor browser libraries live in `lib/firebase/`.
- The local bridge lives in `bridge/`: `server.py` exposes the HTTP API, `run_bridge.py` starts it, and `install_autostart.py` / `uninstall_autostart.py` manage Windows startup.
- Bridge tests are in `bridge/test_anki_launcher.py`; root-level tests cover panel and sync behavior.
- `bridge/runtime/` contains generated logs, queues, screenshots, job state, audio, images, and card output. Treat it as runtime data, not source.
- Design notes are under `docs/superpowers/specs/`.

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

## Coding Style & Naming Conventions

Use 4-space indentation in Python and 2-space indentation in JavaScript/CSS/HTML when editing existing files. Keep Python names `snake_case`, JavaScript functions/variables `camelCase`, constants `UPPER_SNAKE_CASE`, and DOM IDs/classes consistent with existing Portuguese UI naming. Prefer small, explicit helpers over broad refactors. Avoid changing generated files in `bridge/runtime/`.

## Testing Guidelines

Add or update focused tests when touching bridge launch, Anki repair, sync, or panel logic. Python tests use `unittest`; JavaScript tests are plain Node scripts. Name new tests by behavior, for example `test_anki_launch_omits_profile_when_last_loaded_matches_config`.

## Commit & Pull Request Guidelines

No Git history is available in this working copy, so use clear imperative commit messages such as `Fix Anki profile launch`. Pull requests should include a short problem summary, changed files, test commands run, and screenshots only for visible UI changes.

## Security & Configuration Tips

Keep local paths and Anki settings in `bridge/config.json`. Do not commit secrets, API keys, browser profile data, or generated job artifacts. When debugging Anki, prefer `/health`, `/anki/status`, and `/anki/repair` before manually killing processes.
