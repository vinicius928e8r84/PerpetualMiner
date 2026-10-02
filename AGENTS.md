# Repository Guidelines

## Project Structure & Module Organization

This repository contains a Chrome extension plus a local Python bridge for Anki integration.

- Root extension files: `manifest.json`, `background.js`, `content.js` (with `overlay.js` + `overlay.css`, the in-page overlay in Shadow DOM), `popup.*`, `painel.*` (with `painel-shell.js`, the panel's shell: addresses, sidebar, rail and the Configurações cards; `painel-conta.js`, the account shown in the Conta & sync card and the sidebar chip; `painel-chave.js`, the Chave do Gemini card; `painel-perigo.js`, the Zona de perigo card and its Apagar tudo modal; `painel-envio.js`, the Envio ao Anki with its progress and summary modals; and `painel-atalhos.js`, the shortcut recorder in the Atalhos card), and `bookreader.*`.
- `veio/` holds the shared Veio identity: `tokens.css` (the only place colors, type, radii and motion are defined), `tema.js` (the chosen theme, applied before the first paint), the packaged `.woff2` fonts and the toolbar icons. Every extension page includes `veio/tokens.css` before its own stylesheet; see `veio/README.md`.
- Shared extension modules live in `lib/`: `lib/voz/` (the Voice catalog and `textoDaVoz`), `lib/idioma.js` (`detectarIdioma`), `lib/contexto.js` (the Fonte's name and the phrase's day, shared by the panel and the popup), `lib/conexao-anki.js` (the shared Anki Connection; see `CLAUDE.md` § Architecture), `lib/atalhos.js` (the recorded shortcuts: storage, PT-BR labels, matching), and `lib/sincronizacao.js` (cloud sync; see `CLAUDE.md` § Firebase / Firestore Sync). Pages load the shared modules they use before their own scripts. Vendor browser libraries live in `lib/firebase/`.
- New or rewritten UI copy comes from the Voice catalog by ID, never from a literal in the surface. The only literals are the three pattern names the base components write themselves (`palavra:`, `auto:`, `Detalhes`), fixed by the glossary and the Voice rules rather than by any screen state. The surfaces still hold their old literals; each redesign step moves the surface it rebuilds. See the shared base section of `CLAUDE.md`.
- The local bridge lives in `bridge/`: `server.py` exposes the HTTP API, `run_bridge.py` starts it, and `install_autostart.py` / `uninstall_autostart.py` manage Windows startup. For the Envio state machine's persistence, adapters and resume contract, read `bridge/envio.py`'s module docstring.
- Bridge tests are in `bridge/test_anki_launcher.py` (launcher, Anki repair, routes), `bridge/test_envio.py` (the Envio through its interface, with a fake engine; no Flask needed), `bridge/test_analytics.py` and `bridge/test_card_normalization.py`; root-level tests cover panel and sync behavior.
- `scripts/` holds the device and store tooling: `atualizar-extensao.sh` (+ launchd example) keeps a clone up to date, `empacotar-extensao.mjs` builds the Chrome Web Store zip and `arquivos-do-pacote.js` says which files are run-time; the unpacked extension reloads itself through `lib/auto-recarregar.js`. See `docs/instalar-extensao.md` and `docs/publicar-chrome-web-store.md`.
- `e2e/` holds the Playwright suite that runs the unpacked extension in Chromium, with its own `package.json` so the extension root stays free of Node files.
- `bridge/runtime/` contains generated logs, queues, screenshots, job state, audio, images, and card output. Treat it as runtime data, not source.
- Design notes are under `docs/superpowers/specs/`.
- `preview/` builds the static site Vercel publishes for each branch (`node preview/montar.mjs --servir` runs it locally). It only ever copies files into `preview/dist`; never edit an extension file to make the preview work.

## Build, Test, and Development Commands

- `python bridge\server.py`: run the bridge manually for debugging.
- `python bridge\run_bridge.py`: start the bridge using the same launcher used by autostart.
- `python bridge\install_autostart.py`: install/update Windows autostart for the bridge.
- `python bridge\test_anki_launcher.py`: run bridge launcher and Anki repair tests.
- `python bridge\test_envio.py`: run the Envio state machine tests.
- `python -m py_compile bridge\server.py bridge\envio.py bridge\test_anki_launcher.py bridge\test_envio.py`: check Python syntax.
- `node --check painel.js`: check panel JavaScript syntax.
- `node test_auto_keyword.js`: run keyword extraction tests.
- `node test_sync.js`: run the cloud sync tests; see `CLAUDE.md` § Testing.
- `node test_empacotar.js`: check the Chrome Web Store package contents.
- `cd e2e && npm test`: run the Playwright suite against the unpacked extension in Chromium (first time: `npm ci` and `npm run setup`). See the Testing section of `CLAUDE.md`.

## Coding Style & Naming Conventions

New colors, font sizes, radii and durations go into `veio/tokens.css` as tokens and are used through `var(--veio-…)`; do not write a new literal color anywhere else. Use 4-space indentation in Python and 2-space indentation in JavaScript/CSS/HTML when editing existing files. Keep Python names `snake_case`, JavaScript functions/variables `camelCase`, constants `UPPER_SNAKE_CASE`, and DOM IDs/classes consistent with existing Portuguese UI naming. Prefer small, explicit helpers over broad refactors. Avoid changing generated files in `bridge/runtime/`.

## Testing Guidelines

Add or update focused tests when touching bridge launch, Anki repair, sync, or panel logic. Python tests use `unittest`; legacy JavaScript tests are plain Node scripts; new extension behavior is tested in `e2e/` through the real extension (assert what the person sees and what gets stored, not internal functions; the three narrow exceptions, for native Chrome UI and clock the test cannot drive (context menu, toolbar badge, midnight alarm), for catalog states no surface shows yet, and for base-component guarantees with no on-screen trigger, are in the Testing section of `CLAUDE.md`). Name new tests by behavior, for example `test_anki_launch_omits_profile_when_last_loaded_matches_config`.

## Commit & Pull Request Guidelines

Use clear imperative commit messages such as `Fix Anki profile launch`. Pull requests should include a short problem summary, changed files, test commands run, and screenshots only for visible UI changes.

## Security & Configuration Tips

Keep local paths and Anki settings in `bridge/config.json`. Do not commit secrets, API keys, browser profile data, or generated job artifacts. When debugging Anki, prefer `/health`, `/anki/status`, and `/anki/repair` before manually killing processes.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
