---
name: verify-perpetualminer
description: "Drive and prove PerpetualMiner (Chrome MV3 extension, plain JS, plus the Anki add-on `complemento/` and the engine it runs) the way a user does. Primary surface: the unpacked extension running in real Chromium through the repo's Playwright e2e harness (e2e/), with its fake Anki connection, Gemini and Google. Use when you must show a mining, panel, Anki-send, onboarding or photo-mining change actually works, capture screenshots/state as evidence, or check whether a feature still behaves after a change."
---

# Verify PerpetualMiner

Read cold, mid-task. Everything here was run on this repo; if a command disagrees with reality, the repo wins: fix this file in the same PR.

## What there is to drive

| Surface | What the user touches | How you drive it | Covered here |
|---|---|---|---|
| **Chrome extension** (root: `manifest.json`, `background.js`, `content.js`, `popup/`, `painel/`, `bookreader/`) | The popup, the panel (`painel/painel.html#frases`, `#anki/…`, `#configuracoes/…`, `#boas-vindas/…`), the in-page overlay on video/text pages, `bookreader/bookreader.html` | Playwright specs in `e2e/tests/` against real Chromium with the repo root loaded unpacked | **Primary.** Launch/Doctor/Drive/Evidence/Cleanup below |
| **Engine** (`engine/`) | Nothing directly; the add-on runs it for the Envio | `engine/test_*.py` (`node scripts/testar.mjs engine`; needs `scripts/preparar-python.sh` → `.venv`) | Listed in `features/README.md` § Other surfaces |
| **Anki add-on "Conexão" (`complemento/`)** | Runs inside Anki; plain stdlib HTTP on `127.0.0.1:8766`: `GET /health`; `POST /anki/decks`, `/anki/stats/decks`, `/anki/vocabulary`; `/abrir-com-o-computador[/estado]`; `/ia/estado`, `/ia/openai/chave`, `/ia/openai/chave/apagar`, `/ia/openai/sincronizar`, `/ia/openai/legado`; the Envio, `/jobs`, `/jobs/list`, `/jobs/get`, `/jobs/retry`, `/jobs/debug-bundle`, `/analytics/jobs` (#142: each Frase becomes a text Card in the collection) (the list is `ROTAS` in `complemento/servidor.py`) | Its own tests, every `complemento/test_*.py` (`PYTHON=python3.9 node scripts/testar.mjs complemento`, also with `python3.13`), and the extension side of the same contract, `e2e/tests/contrato-da-conexao.spec.js` | See `features/README.md` § Other surfaces. It runs outside Anki for a drive (§ Driving against the real Conexão); a real Anki is the owner's rehearsal, and the e2e Anki fake answers its contract in the ordinary specs. Do not install it into a real Anki from here. Its OpenAI key routes are driven through the AI card (`features/ia.md`) |

The extension never reaches a real Anki, Gemini or Google in the harness: the fixture fakes those at the HTTP boundary and blocks every other external request. A request Playwright's routing does not see (the ChatGPT login's return tab, `http://127.0.0.1:8766/auth/callback`, #551) does not reach the computer's port 8766 either: the test Chromium maps `127.0.0.1:8766` and `localhost:8766` to the test Conexão's port (`e2e/fakes/porta-da-conexao.js`), so the specs run the same with an Anki open on 8766. So a pass proves the extension's behavior against the documented contracts, **not** a real Anki. Say so in any proof.

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

Runs are isolated: every `drive.sh` run gets its own `TMPDIR` (so its Chromium profiles and the fake Google login's certificate never mix with another run's) and its own evidence directory. Two runs side by side are fine with distinct run IDs; the host's heavy-run limit applies (at most 3 heavy runs per host). Heavy runs: set `PM_HEAVY_RUN` to the host's limiter, e.g. `PM_HEAVY_RUN="flock /tmp/pm-heavy.lock nice -n 10"` (word-split on purpose); `drive.sh` falls back to `/tmp/fm-heavy-run.sh` when that is executable and `PM_HEAVY_RUN` is empty.

## Doctor

```bash
.agents/skills/verify-perpetualminer/scripts/doctor.sh
```

Read-only. Prints repo, commit (and whether there are uncommitted changes), the manifest version, Node, Playwright, the Chromium binary, that the extension root has its manifest, that the suite is collectable (`playwright test --list`; the count it prints is the suite's), and whether something already listens on `127.0.0.1:8766`. The Anki fake answers the extension's requests inside Chromium and never opens the port, and the test Chromium maps 8766 to the test port (above), so a listener there changes no spec and receives nothing; the note says so. Exit 0 = drive; exit 1 = a `FAIL` line names the fix. Run it first whenever anything looks off.

## Drive

Always through a run directory, so the evidence survives:

```bash
.agents/skills/verify-perpetualminer/scripts/drive.sh <run-id> <playwright test args…>
# e.g.
.agents/skills/verify-perpetualminer/scripts/drive.sh c1-selecao mineracao-unica -g "mesma Fonte"
HEADED=1 .agents/skills/verify-perpetualminer/scripts/drive.sh c1-foto minerar-foto -g "uma foto: prévia"   # needs a display
```

**A run ID is single-use.** `drive.sh` refuses an ID whose `evidence/` already holds files (exit 2), so earlier proof is never overwritten, and evidence is only ever written into a directory it just verified is empty. Give every drive its own ID (`c1-selecao`, then `c1-selecao-2`), including after a failure or a Cleanup.

`<playwright test args>` are the normal ones (spec file name filter, `-g "<title substring>"`, `--list`). `-g` is a regex: escape `+`, `(`, `?` (`-g "Alt\+S num player"`); the positional arguments are regexes on the file path, so `painel-anki` also selects `painel-anki-baralhos`; write `painel-anki.spec` to pin one file. The script runs from `e2e/`, with 2 workers (`PM_WORKERS=1` for one: a `--workers=1` among the arguments loses, the script's own flag comes last), the `list` + `json` reporters, and exports `PM_EVIDENCE_DIR` for the specs. Exit code = Playwright's.

Which spec and which `-g` prove which feature is in `features/<feature>.md`; the index is `features/README.md`. **Read the matching feature file before driving.** Rules of the road:

- **Existing behavior:** run the mapped specs as written. They assert what a person sees and what ends up in `chrome.storage.local`, which is the proof standard below.
- **New or changed behavior:** write the spec (AGENTS.md requires it: new extension behavior is tested in `e2e/`). Import `test, expect` from `../fixtures`; use the fixtures `page`, `extensao` (`id`, `url('painel/painel.html#frases')`, `gravarStorage`, `lerStorage`, `frases()`, `semearSessao()`), `fakes` (`anki`, `gemini`, `google`), `paginas` (`url('player.html')`, `url('texto.html')`); `fixtures.js` also exports `botaoFlutuante(page)` and `tocarVideo(page)`. Locate by role and accessible name (`getByRole('button', { name: 'Enviar ao Anki' })`), as the existing specs do. Copy is Portuguese from the Voice catalog (`lib/voz/catalogo.js`): read the name from there, never invent it.
- **Throwaway exploration:** put a scratch spec at `e2e/tests/zz-scratch-<run-id>.spec.js`, drive it, and delete it before committing.
- **Evidence from a spec:** `const { fotografar, registrarEstado } = require('../evidencias-mineracao');` then `await fotografar(page, '<feature>-<state>.png')` and `await registrarEstado(extensao, '<feature>-<state>.json')`. Both write into `PM_EVIDENCE_DIR` and do nothing without it, so they are safe to leave in committed specs.
- **Time-dependent screens** (Frases dates, "há 5 min"): the specs freeze the clock with `page.clock.setFixedTime(new Date('2026-09-18T12:00:00'))` and `fakes.anki.usarRelogio(() => AGORA)`. Do the same.
- **Native Chrome UI** the harness cannot click (context menu, toolbar badge, alarms): the documented exception in `docs/testes.md`. Call the function Chrome would call from the service worker (`minerarSelecaoDoMenu`) and assert what is stored or shown. Say in the proof that the native part was simulated.
- **Visual specs** (`*-visual.spec.js`) compare against committed Linux baselines. Run them to check for regressions, but never pass `--update-snapshots`: a new baseline needs the owner's approval (rule `aprovacao-visual`).
- **Fast, non-browser checks** worth running alongside: `node scripts/testar.mjs node regras ferramentas` (from the repo root; the groups are listed in `scripts/testes.json`).

Env knobs: `PM_VERIFY_ROOT` (default `/tmp/pm-verify`; keep it short: Chromium's profile socket path must stay under ~100 characters, and a deep root fails with `Socket path too long`), `PM_HEAVY_RUN` (limiter command prefix), `PM_WORKERS` (Playwright workers, default 2; use 1 on a loaded host), `HEADED=1` (show the browser; needs a display).

## Driving against the real Conexão

The ordinary specs talk to `fakes.anki`, a JavaScript copy of the Conexão. For a change to the key, the account or any route that carries state, also drive the real Python owner and its HTTP, outside Anki, with `scripts/conexao-real.py` and a scratch spec: the procedure, the spec and the traps are in [`conexao-real.md`](./conexao-real.md). The e2e also has a mode for whole specs, `PM_CONEXAO=real` (fixture `conexaoDoTeste`; `.agents/skills/e2e-suite/SKILL.md`).

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
6. **Report what you did not prove**: real Anki, native Chrome menus, Windows. Do not report a skipped entry point (say, the context menu) as verified through a different one (the shortcut).

For the PR body, quote the `drive.sh` command, the `run.log` summary line (`N passed`), and the evidence paths.

## Cleanup

```bash
.agents/skills/verify-perpetualminer/scripts/cleanup.sh <run-id>
```

Stops what `drive.sh` started for that run and removes the run's scratch (`tmp/`, `pw-output/`). It **keeps `evidence/`** and prints how many files remain; confirm they are still there (`ls <run-dir>/evidence`). A normal finished run leaves nothing running; the fixture already removes each test's profile. Also delete any `zz-scratch-*.spec.js` you made and leave `git status` showing only intended changes (`e2e/test-results/` is git-ignored). Run Cleanup after a failed or interrupted run too.

To throw the evidence away as well when you no longer need it: `rm -rf "${PM_VERIFY_ROOT:-/tmp/pm-verify}/<run-id>"`.

## Branches

- **A slice that touches the Conexão com o Anki**, or a proof that names its system: [`variantes-e-plataformas.md`](./variantes-e-plataformas.md) (the 8 variants such a slice is proven in; what Linux, Mac and Windows each prove).
- **A PR that changes a user-facing feature or command**: [`mapa-de-features.md`](./mapa-de-features.md) (update `features/` or say "feature map unchanged"; the CI step that checks it).
- **Changing a script in `scripts/`, or a Cleanup that refused or exited 1**: [`ajudantes.md`](./ajudantes.md) (each script, the safety rules, the known gaps).
- **Running a heavy suite or a proof on the Mac or the Windows PC**: `scripts/no-mac.sh` and `scripts/no-pc.sh`, in [`ajudantes.md`](./ajudantes.md).
- **Writing what a proof does not cover**: [`limites.md`](./limites.md).
