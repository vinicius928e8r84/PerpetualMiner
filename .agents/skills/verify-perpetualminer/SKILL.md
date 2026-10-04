---
name: verify-perpetualminer
description: "Drive and prove PerpetualMiner (Chrome MV3 extension, plain JS, plus the local Python Anki bridge/engine) the way a user does. Primary surface: the unpacked extension running in real Chromium through the repo's Playwright e2e harness (e2e/), with its fake Anki connection, Gemini and Google. Use when you must show a mining, panel, Anki-send, onboarding or photo-mining change actually works, capture screenshots/state as evidence, or check whether a feature still behaves after a change."
---

# Verify PerpetualMiner

Read cold, mid-task. Everything here was run on this repo; if a command disagrees with reality, the repo wins: fix this file in the same PR.

## What there is to drive

| Surface | What the user touches | How you drive it | Covered here |
|---|---|---|---|
| **Chrome extension** (root: `manifest.json`, `background.js`, `content.js`, `popup.*`, `painel.*`, `bookreader.*`) | The popup, the panel (`painel.html#frases`, `#anki/…`, `#configuracoes/…`, `#boas-vindas/…`), the in-page overlay on video/text pages, `bookreader.html` | Playwright specs in `e2e/tests/` against real Chromium with the repo root loaded unpacked | **Primary.** Launch/Doctor/Drive/Evidence/Cleanup below |
| **Python bridge** (`bridge/`, Flask on `127.0.0.1:8766`) and **engine** (`engine/`) | Nothing directly; the panel talks to the bridge's HTTP routes | `python3 bridge/test_envio.py` (43 tests, no Flask needed), the other `bridge/test_*.py` and `engine/test_*.py` (need `scripts/preparar-python.sh` → `.venv`) | Listed in `features/README.md` § Other surfaces. Do not start the real bridge: it launches Anki Desktop and reads `bridge/config.json` (Windows paths) |
| **Anki add-on "Conexão" (`complemento/`)** | Runs inside Anki; plain stdlib HTTP on `127.0.0.1:8766` | Its own `python3 complemento/test_*.py` | **Not on the default branch yet** (this checkout's `complemento/` holds only ignored `__pycache__`; the source is on `origin/fm/pm-i139`). Map it when it merges |

The extension never reaches a real Anki, Gemini or Google in the harness: the fixture fakes those at the HTTP boundary and blocks every other external request. So a pass proves the extension's behavior against the documented contracts, **not** the real bridge or a real Anki. Say so in any proof.

## Launch

There is no long-lived server. The fixture (`e2e/fixtures.js`) starts a fresh Chromium with a throwaway profile per test, loads the repo root as the unpacked extension, serves the fixture pages from `e2e/pages/` on a random local port, and tears all of it down when the test ends.

One-time setup per checkout (skip if the Doctor is green):

```bash
(cd e2e && npm ci && npm run setup)    # npm run setup = playwright install chromium
# Linux/WSL only, if Chromium fails to start for missing libraries:
(cd e2e && sudo npx playwright install-deps chromium)
```

Ready = Doctor prints `doctor: worth driving`. Teardown = Cleanup below (nothing else stays running).

Every command in this file is meant to run from the repository root, and each snippet that changes directory does it in a subshell, so the next step starts from the root again.

Runs are isolated: every `drive.sh` run gets its own `TMPDIR` (so its Chromium profiles and the fake Google login's certificate never mix with another run's) and its own evidence directory. Two runs side by side are fine with distinct run IDs; the host's heavy-run limit applies (at most 3 heavy runs per host: `drive.sh` uses `/tmp/fm-heavy-run.sh` automatically when it exists, or whatever `PM_HEAVY_RUN` names).

## Doctor

```bash
.agents/skills/verify-perpetualminer/scripts/doctor.sh
```

Read-only. Prints repo, commit (and whether there are uncommitted changes), the manifest version, Node, Playwright, the Chromium binary, that the extension root has its manifest, that the suite is collectable (`playwright test --list`, ~700 tests), and whether something already listens on `127.0.0.1:8766`. A real bridge there does not disturb the run (the Anki fake answers inside Chromium and never opens the port), but the note stops anyone confusing the two. Exit 0 = drive; exit 1 = a `FAIL` line names the fix. Run it first whenever anything looks off.

## Drive

Always through a run directory, so the evidence survives:

```bash
.agents/skills/verify-perpetualminer/scripts/drive.sh <run-id> <playwright test args…>
# e.g.
.agents/skills/verify-perpetualminer/scripts/drive.sh c1-selecao mineracao-unica -g "mesma Fonte"
HEADED=1 .agents/skills/verify-perpetualminer/scripts/drive.sh c1-foto minerar-foto -g "uma foto: prévia"   # needs a display
```

`<playwright test args>` are the normal ones (spec file name filter, `-g "<title substring>"`, `--list`). `-g` is a regex: escape `+`, `(`, `?` (`-g "Alt\+S num player"`); the positional arguments are regexes on the file path, so `painel-anki` also selects `painel-anki-baralhos`; write `painel-anki.spec` to pin one file. The script runs from `e2e/`, with 2 workers, the `list` + `json` reporters, and exports `PM_EVIDENCE_DIR` for the specs. Exit code = Playwright's.

Which spec and which `-g` prove which feature is in `features/<feature>.md`; the index is `features/README.md`. **Read the matching feature file before driving.** Rules of the road:

- **Existing behavior:** run the mapped specs as written. They assert what a person sees and what ends up in `chrome.storage.local`, which is the proof standard below.
- **New or changed behavior:** write the spec (AGENTS.md requires it: new extension behavior is tested in `e2e/`). Import `test, expect` from `../fixtures`; use the fixtures `page`, `extensao` (`id`, `url('painel.html#frases')`, `gravarStorage`, `lerStorage`, `frases()`, `semearSessao()`), `fakes` (`anki`, `gemini`, `google`), `paginas` (`url('player.html')`, `url('texto.html')`); `fixtures.js` also exports `botaoFlutuante(page)` and `tocarVideo(page)`. Locate by role and accessible name (`getByRole('button', { name: 'Enviar ao Anki' })`), as the existing specs do. Copy is Portuguese from the Voice catalog (`lib/voz/catalogo.js`): read the name from there, never invent it.
- **Throwaway exploration:** put a scratch spec at `e2e/tests/zz-scratch-<run-id>.spec.js`, drive it, and delete it before committing.
- **Evidence from a spec:** `const { fotografar, registrarEstado } = require('../evidencias-mineracao');` then `await fotografar(page, '<feature>-<state>.png')` and `await registrarEstado(extensao, '<feature>-<state>.json')`. Both write into `PM_EVIDENCE_DIR` and do nothing without it, so they are safe to leave in committed specs.
- **Time-dependent screens** (Frases dates, "há 5 min"): the specs freeze the clock with `page.clock.setFixedTime(new Date('2026-09-18T12:00:00'))` and `fakes.anki.usarRelogio(() => AGORA)`. Do the same.
- **Native Chrome UI** the harness cannot click (context menu, toolbar badge, alarms): the documented exception in `CLAUDE.md` § Testing. Call the function Chrome would call from the service worker (`minerarSelecaoDoMenu`) and assert what is stored or shown. Say in the proof that the native part was simulated.
- **Visual specs** (`*-visual.spec.js`) compare against committed Linux baselines. Run them to check for regressions, but never pass `--update-snapshots`: a new baseline needs the owner's approval (`CODING_STANDARDS.md` rule 10).
- **Fast, non-browser checks** worth running alongside: `node test_auto_keyword.js && node test_sync.js && node test_empacotar.js` (from the repo root).

## Evidence

`drive.sh` writes to `${PM_VERIFY_ROOT:-/tmp/pm-verify}/<run-id>/evidence/`:

| File | What it is |
|---|---|
| `run.log` | Commit, arguments, and the Playwright `list` output (test names, pass/fail, timings, failure messages) |
| `report.json` | Playwright's JSON report: per-test status, duration, errors |
| `exit-code` | The exit code |
| `*.png`, `*.json` | What the specs wrote with `fotografar` / `registrarEstado`: the screen the person saw, and the stored state (`frases`, the automatic-mining keys, the toolbar badge/tooltip/alarm) |

Proof standards:

1. **Exercise the real user path.** Press the shortcut, click the button, type in the field. Never set storage to fake a result; seeding the *starting* state (`gravarStorage({ frases })`) is fine, asserting the *end* state that way is not.
2. **Capture the action and the resulting state**, not just the last screen: the screenshot of what the person sees plus the stored value behind it (`registrarEstado`, or `extensao.frases()` in the assertion).
3. **Verify side effects next to what is visible**: what reached the Anki fake (`fakes.anki.envios[…]`), what reached Gemini (`fakes.gemini.chamadas`), what was written to storage.
4. **Mocks only at the production boundary**, which the fixture already provides (Anki connection, Gemini, Firestore/Google). Do not stub extension code.
5. **A test that passes is not enough**: open the PNG and read it. Check the evidence names the feature and shows the state you claim.
6. **Report what you did not prove**: real Anki/bridge, native Chrome menus, Windows. Do not report a skipped entry point (say, the context menu) as verified through a different one (the shortcut).

For the PR body, quote the `drive.sh` command, the `run.log` summary line (`N passed`), and the evidence paths.

## Cleanup

```bash
.agents/skills/verify-perpetualminer/scripts/cleanup.sh <run-id>
```

Stops what `drive.sh` started for that run and removes the run's scratch (`tmp/`, `pw-output/`). It **keeps `evidence/`** and prints how many files remain; confirm they are still there (`ls <run-dir>/evidence`). A normal finished run leaves nothing running; the fixture already removes each test's profile. Also delete any `zz-scratch-*.spec.js` you made and leave `git status` showing only intended changes (`e2e/test-results/` is git-ignored). Run Cleanup after a failed or interrupted run too.

Safety rules the script enforces, so you can rely on them: the run ID must be one plain segment (letters, digits, `. _ -`, starting with a letter or digit); the run directory must be a real directory directly under the verification root, with no symlink among `evidence`, `tmp`, `pw-output`, `drive.pid`; otherwise it refuses (exit 2) and deletes nothing. A process is signalled only when `drive.pid` holds its pid **and** the start time recorded with it **and** its command line is this run's `drive.sh`; a stale or reused pid is reported and left alone, never killed by pid alone and never by name. Cleanup is safe to run again: if it was interrupted (or the run is already clean), run the same command; it re-checks, finishes the removal and reports the evidence it kept.

To throw the evidence away as well when you no longer need it: `rm -rf "${PM_VERIFY_ROOT:-/tmp/pm-verify}/<run-id>"`.

## Helpers

| Script | Invocation | Does |
|---|---|---|
| `scripts/doctor.sh` | `.agents/skills/verify-perpetualminer/scripts/doctor.sh` | Read-only readiness check, exit 0/1 |
| `scripts/drive.sh` | `…/drive.sh <run-id> <playwright test args…>` | Runs specs isolated, writes evidence, records its pid |
| `scripts/cleanup.sh` | `…/cleanup.sh <run-id>` | Stops that run's processes (identity-checked), removes scratch, keeps evidence; re-runnable |
| `scripts/lib.sh` | sourced by the two above | Run-id and path-containment checks, process identity |
| `scripts/test_helpers.sh` | `.agents/skills/verify-perpetualminer/scripts/test_helpers.sh` | Tests the safety rules above (refusals, symlinks, stale pids, re-run); no browser, a few seconds. Run it after touching any script |

Env knobs: `PM_VERIFY_ROOT` (default `/tmp/pm-verify`), `PM_HEAVY_RUN` (limiter command prefix), `HEADED=1` (show the browser; needs a display).

## Keeping the feature map honest

`features/` is the maintained record of what can be verified and how. **Any PR that changes a user-facing feature or command updates its file in `features/` (add the sub-feature ID, the driving step, the proof), or says "feature map unchanged" in the PR body.** User-facing means anything a person sees or presses: panel areas and addresses, popup, overlay, shortcuts, onboarding steps, Anki send/connection screens, photo mining, bridge routes the panel calls. Reviewers check for one or the other. For a periodic audit use `/maintain-verification-skill`.

## Known limits

- The harness fakes Anki, Gemini and Google; nothing here talks to a real bridge, Anki Desktop, Gemini or Firestore.
- The context menu, toolbar badge, midnight alarm and extension update are simulated by calling the function Chrome would call.
- Evidence screenshots exist only where a spec calls `fotografar`; other specs leave `run.log` and `report.json`.
- Windows is the owner's runtime for the bridge; this skill was proven on Linux headless Chromium. `.claude/skills/verify-perpetualminer` is a symlink to this directory (one canonical copy); a Windows checkout without symlink support sees a plain file there, so open `.agents/skills/verify-perpetualminer/` directly.
- The Anki add-on (`complemento/`) is not on this branch and is not mapped yet.
- The upkeep rule above is a documented convention, not enforced in CI: the default branch has no CI workflow and no rule runner (`scripts/regras/` exists only on the unmerged branch `origin/fm/correct-pm`). When a rule runner lands on the default branch, add one check there: fail when a PR touches `manifest.json`, `popup.*`, `painel*.{html,js}`, `bookreader.*`, `overlay.*`, `content.js`, `background.js` or `bridge/server.py` without touching `.agents/skills/verify-perpetualminer/features/` or saying "feature map unchanged" in the PR body.
