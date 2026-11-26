# Repository Guidelines

## Project Structure & Module Organization

A Chrome extension (Manifest V3, plain JavaScript, no build) plus the Conexão com o Anki, an Anki add-on (`complemento/`) that runs the card pipeline of `engine/` inside the Anki.

- **Files:** the role of every root file and every `lib/` module is in the tables of `docs/arquivos/` (read on demand); a new file gets its row there, not here.
- **Decisions:** why a choice was made, with the options dropped and the risks accepted: `docs/adr/`; domain glossary: `glossary.md`; testing the extension: `docs/testes.md`. Design prototypes (`.html`) and the Voice notes (`.json`) are in `docs/design/`.
- **Veio identity:** `veio/README.md`. **Envio state machine:** `complemento/envio.py`'s docstring. **Engine:** `engine/CLAUDE.md`. **Device and store tooling:** `scripts/`; the store texts and images: `docs/loja/`.
- **Tests:** `e2e/` (see `docs/testes.md`), `testes/test_*.js`, `complemento/test_*.py`, `engine/test_*.py`.
- `preview/` only copies files into `preview/dist`; never edit an extension file to make the preview work.
- **Conexão com o Anki as an Anki add-on:** `complemento/` (standard library only, Python 3.9 and 3.13); its HTTP contract with the extension is `complemento/contrato/exemplos.json`, and `complemento/contrato/LEIA-ME.md` says how a new route enters.

## Standards

The mistakes only review catches, and the review verdict: `CODING_STANDARDS.md`. Everything a script can see is a check (the next table).

## Commands

- All tests: `node scripts/testar.mjs [<grupo>]` is the command CI runs for every job; the groups, and which files each one runs, are in `scripts/testes.json` (`--listar` shows them; no group runs the light ones; `-- <args>` reaches unittest/Playwright, e.g. `node scripts/testar.mjs e2e -- popup --workers=2`; `PYTHON=` picks the interpreter). A new test file joins a group there, or `testes-no-portao` fails.
- Fast checks: `node scripts/testar.mjs node regras ferramentas` (the Node tests, the rule proofs, the tooling).
- Add-on: `PYTHON=python3.9 node scripts/testar.mjs complemento`, also with `python3.13` (`uv python install 3.9 3.13` if missing).
- Engine: `node scripts/testar.mjs engine` (needs `engine/requirements.txt`). `scripts/preparar-python.sh` makes the venv.
- e2e: `node scripts/testar.mjs e2e -- <specs> --workers=2` (the same as `cd e2e && npx playwright test <specs> --workers=2`); the whole suite with `npm test` in `e2e/` (first time: `npm ci` and `npm run setup`; see `docs/testes.md`).
- Proving a change by driving the extension (launch, doctor, evidence, cleanup, feature map): `.agents/skills/verify-perpetualminer/SKILL.md` (also linked from `.claude/skills/`).
- Installing and running the Conexão com o Anki: `complemento/LEIA-ME.md`. When debugging Anki, try `GET /health` and the opener's `consertar` (`complemento/conserto_do_anki.py`) before killing processes.

Add or update focused tests when touching the Envio, the opener, the Anki repair, sync, or panel logic. New extension behavior is tested in `e2e/`. Name Python tests by behavior, for example `test_outro_programa_que_nao_e_o_do_anki_nao_e_fechado`.

## Security & Configuration

The Conexão keeps its data in the add-on's `user_files` (`complemento/pasta_de_dados.py`), which the Anki preserves across updates. Do not commit secrets, API keys, browser profile data, or generated job artifacts.

## Checks

`node scripts/regras/verificar.js` checks what a script can see, the same in CI. `node scripts/regras/verificar.js --help` lists every rule with what it guards, the checks outside `scripts/regras/` (the `Registro da PR`, the lint and dependency audit, the spec and contract tests), and how the baseline and the line exceptions work.

A PR that changes a user-facing file (`popup/`, `painel/`, `manifest.json`, `complemento/servidor.py`, …) also needs `.agents/skills/verify-perpetualminer/features/` updated or "feature map unchanged" in its body: the `Mapa de features` step of `.github/workflows/regras.yml` (PRs only).

When the same correction comes up twice, enforce it at the highest level that works: the code itself, then a lint rule, then a check in `scripts/regras/` (with its `guarda`, the line `--help` shows); `CODING_STANDARDS.md` only when no script can see it. Whatever a check enforces leaves `CODING_STANDARDS.md`.

## Agent skills

The engineering skills (`/implement`, `/tdd`, `/code-review`, `/to-spec`, `/to-tickets`, `/triage`, `/wayfinder`, …) live in `.claude/skills/`, so they also run in Claude Code on the web.

`/verify-perpetualminer` (canonical copy in `.agents/skills/verify-perpetualminer/`, symlinked from `.claude/skills/`) drives the extension through the e2e harness and keeps the feature map in `features/`.

### Issue tracker

Issues and specs are GitHub issues on this repo, handled with `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `glossary.md` at the root; the decisions are in `docs/adr/`. See `docs/agents/domain.md`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
