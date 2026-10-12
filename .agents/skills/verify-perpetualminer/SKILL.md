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
| **Python bridge** (`bridge/`, Flask on `127.0.0.1:8766`) and **engine** (`engine/`) | Nothing directly; the panel talks to the bridge's HTTP routes | `python3 bridge/test_envio.py` (no Flask needed), the other `bridge/test_*.py` and `engine/test_*.py` (need `scripts/preparar-python.sh` → `.venv`) | Listed in `features/README.md` § Other surfaces. Do not start the real bridge: it launches Anki Desktop and reads `bridge/config.json` (Windows paths) |
| **Anki add-on "Conexão" (`complemento/`)** | Runs inside Anki; plain stdlib HTTP on `127.0.0.1:8766`: `GET /health`; `POST /anki/decks`, `/anki/stats/decks`, `/anki/vocabulary`; `/abrir-com-o-computador[/estado]`; `/ia/estado`, `/ia/openai/chave`, `/ia/openai/chave/apagar`, `/ia/openai/sincronizar`, `/ia/openai/legado` (the list is `ROTAS` in `complemento/servidor.py`; the bridge in `bridge/` still does the Envio) | Its own `python3.9 complemento/test_servidor.py` (also `test_inicio.py`, `test_no_anki.py`, `test_colecao_em_memoria.py`, `test_item_de_login.py`, `test_chave_da_openai.py`, `test_pacote.py`; each also with `python3.13`), and the extension side of the same contract, `e2e/tests/contrato-da-conexao.spec.js` | See `features/README.md` § Other surfaces. It runs outside Anki for a drive (§ Driving against the real Conexão); a real Anki is the owner's rehearsal, and the e2e Anki fake answers its contract in the ordinary specs. Do not install it into a real Anki from here. Its OpenAI key routes are driven through the AI card (`features/ia.md`) |

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

Runs are isolated: every `drive.sh` run gets its own `TMPDIR` (so its Chromium profiles and the fake Google login's certificate never mix with another run's) and its own evidence directory. Two runs side by side are fine with distinct run IDs; the host's heavy-run limit applies (at most 3 heavy runs per host). Heavy runs: set `PM_HEAVY_RUN` to the host's limiter, e.g. `PM_HEAVY_RUN="flock /tmp/pm-heavy.lock nice -n 10"` (word-split on purpose); `drive.sh` falls back to `/tmp/fm-heavy-run.sh` when that exists and `PM_HEAVY_RUN` is empty.

## Doctor

```bash
.agents/skills/verify-perpetualminer/scripts/doctor.sh
```

Read-only. Prints repo, commit (and whether there are uncommitted changes), the manifest version, Node, Playwright, the Chromium binary, that the extension root has its manifest, that the suite is collectable (`playwright test --list`; the count it prints is the suite's), and whether something already listens on `127.0.0.1:8766`. A real bridge there does not disturb the run (the Anki fake answers inside Chromium and never opens the port), but the note stops anyone confusing the two. Exit 0 = drive; exit 1 = a `FAIL` line names the fix. Run it first whenever anything looks off.

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
- **New or changed behavior:** write the spec (AGENTS.md requires it: new extension behavior is tested in `e2e/`). Import `test, expect` from `../fixtures`; use the fixtures `page`, `extensao` (`id`, `url('painel.html#frases')`, `gravarStorage`, `lerStorage`, `frases()`, `semearSessao()`), `fakes` (`anki`, `gemini`, `google`), `paginas` (`url('player.html')`, `url('texto.html')`); `fixtures.js` also exports `botaoFlutuante(page)` and `tocarVideo(page)`. Locate by role and accessible name (`getByRole('button', { name: 'Enviar ao Anki' })`), as the existing specs do. Copy is Portuguese from the Voice catalog (`lib/voz/catalogo.js`): read the name from there, never invent it.
- **Throwaway exploration:** put a scratch spec at `e2e/tests/zz-scratch-<run-id>.spec.js`, drive it, and delete it before committing.
- **Evidence from a spec:** `const { fotografar, registrarEstado } = require('../evidencias-mineracao');` then `await fotografar(page, '<feature>-<state>.png')` and `await registrarEstado(extensao, '<feature>-<state>.json')`. Both write into `PM_EVIDENCE_DIR` and do nothing without it, so they are safe to leave in committed specs.
- **Time-dependent screens** (Frases dates, "há 5 min"): the specs freeze the clock with `page.clock.setFixedTime(new Date('2026-09-18T12:00:00'))` and `fakes.anki.usarRelogio(() => AGORA)`. Do the same.
- **Native Chrome UI** the harness cannot click (context menu, toolbar badge, alarms): the documented exception in `CLAUDE.md` § Testing. Call the function Chrome would call from the service worker (`minerarSelecaoDoMenu`) and assert what is stored or shown. Say in the proof that the native part was simulated.
- **Visual specs** (`*-visual.spec.js`) compare against committed Linux baselines. Run them to check for regressions, but never pass `--update-snapshots`: a new baseline needs the owner's approval (`CODING_STANDARDS.md` rule 10).
- **Fast, non-browser checks** worth running alongside: `node scripts/testar.mjs node regras ferramentas` (from the repo root; the groups are listed in `scripts/testes.json`).

## Driving against the real Conexão

The ordinary specs talk to `fakes.anki`, a JavaScript copy of the Conexão. For a change to the key, the account or any route that carries state, also drive the real Python owner and its HTTP, outside Anki. `scripts/conexao-real.py` starts `complemento.servidor.Conexao` on a free port with the repo's fake OpenAI and Firestore, and writes `{porta, pasta}` to the file you name. It proves the real Python owner and HTTP, not Anki, OpenAI or Firestore.

```bash
PRONTO=/tmp/conexao-<run-id>.json    # outside the run directory: drive.sh refuses a run ID that already holds files
python3.9 .agents/skills/verify-perpetualminer/scripts/conexao-real.py "$PWD" "$PRONTO" &   # also python3.13
until [ -s "$PRONTO" ]; do sleep 0.2; done
PM_CONEXAO_REAL="$PRONTO" .agents/skills/verify-perpetualminer/scripts/drive.sh <run-id> zz-scratch-<run-id>.spec
kill %1; rm -rf "$PRONTO"    # the script's scratch folder (`conexao-real-*` in the temp dir) stays: remove it too
```

The spec is a scratch one (`e2e/tests/zz-scratch-<run-id>.spec.js`, delete it before committing); it sends the panel's `127.0.0.1:8766` requests to that port:

```js
const fs = require('fs'), path = require('path');
const { test, expect } = require('../fixtures');
const { fotografar } = require('../evidencias-mineracao');
const { porta, pasta } = JSON.parse(fs.readFileSync(process.env.PM_CONEXAO_REAL, 'utf8'));
test('real Conexão: colar a chave grava o dono no cofre real, com conta vazia e revisão 1', async ({ page, context, extensao }) => {
  await context.route(/^http:\/\/(127\.0\.0\.1|localhost):8766\//,
    route => route.continue({ url: route.request().url().replace(/:8766\//, `:${porta}/`) }));
  await page.goto(extensao.url('painel.html#configuracoes/ia'));
  const card = page.locator('#cfg-ia');
  await card.getByRole('textbox', { name: 'Chave da OpenAI' }).fill('sk-proj-chave-de-exemplo-9f3a');
  await card.getByRole('button', { name: 'Conferir e salvar' }).click();
  await expect(card.locator('.cfg-resumo')).toHaveText('••••••••9f3a');
  await fotografar(page, 'conexao-real-colar.png');
  const dono = JSON.parse(fs.readFileSync(path.join(pasta, 'chaves', 'openai.json'), 'utf8'));
  expect({ conta: dono.conta, versao: dono.versao, naoEnviada: dono.naoEnviada, fim: dono.chave.slice(-4) })
    .toEqual({ conta: '', versao: 1, naoEnviada: true, fim: '9f3a' });
  expect((fs.statSync(path.join(pasta, 'chaves', 'openai.json')).mode & 0o777).toString(8)).toBe('600');
});
```

A second Chromium profile (the `K1:` test in `chave-autoridade.spec.js` launches one) needs the same `route` on its own context. For a rest check, read the key file's `versao` every few seconds for 60 s with both profiles open: against the real Conexão it moved once (B's sign-in took the owner from a synced A: 1 → 2) and then stayed.

Traps the hand-made harnesses fell into:

- **`pasta_de_dados.preparar`** must run before the Conexão starts: without it the key folder is missing and every save is a 500 (`FileNotFoundError: …/chaves/openai.json.novo`, and the screen says "Sem chave"). The script does it.
- **The fakes answer only inside the `with`** (`OpenAIDeMentira`, `FirestoreDeMentira`); a Conexão started after the block ends gets connection refused.
- **Seed old-store state through the service worker before opening the panel**, never with the panel already open: the panel reads it when it loads.
- **A reload is `page.reload()`**: `page.goto` to the same `#` address does not reload.
- **Read the key file only by its last 4 characters** (`dono.chave.slice(-4)`), and never print or save the whole value.
- **Fake keys only.** The fake OpenAI accepts any well-formed one; a real key must never reach this script.

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

Safety rules the script enforces, so you can rely on them:

- **Paths.** The run ID must be one plain segment (letters, digits, `. _ -`, starting with a letter or digit); the run directory must be a real directory directly under the verification root, with no symlink among `evidence`, `tmp`, `pw-output`, `drive.pid`; otherwise it refuses (exit 2) and deletes nothing.
- **What gets stopped.** `drive.sh` runs Playwright as a job in its own process group and records the group in `drive.pid`. Cleanup stops drive.sh (only when pid, start time, exact command line and this checkout's `drive.sh` path all match the record, and the command is shaped `<interpreter> …/drive.sh <run-id> …`; a command that merely mentions `drive.sh` does not count), every process of that group, and their descendants, so it still works after drive.sh was killed or the terminal closed and the browser was left behind. Each process is signalled only while it is still the one that was collected (same start time); TERM first, then KILL for what ignores it. A stale or reused pid is reported and left alone, never killed by pid alone and never by name. A run recorded by another checkout's `drive.sh` is refused (exit 2) with nothing touched: use that checkout's `cleanup.sh`.
- **A failed job leaves nothing behind.** When the Playwright job ends (pass or fail), `drive.sh` stops whatever it left running in its group (TERM, then KILL) before it returns, and deletes `drive.pid` only once the group is empty. If something survives KILL, `drive.sh` exits 1 and keeps `drive.pid`, so Cleanup can still find it.
- **Survivors fail loudly.** If anything is still alive after KILL, Cleanup exits 1, names it, and keeps `drive.pid` and the scratch so a re-run retries.
- **Re-runnable.** If Cleanup was interrupted (or the run is already clean), run the same command; it re-checks, finishes the removal and reports the evidence it kept.

To throw the evidence away as well when you no longer need it: `rm -rf "${PM_VERIFY_ROOT:-/tmp/pm-verify}/<run-id>"`.

## Helpers

| Script | Invocation | Does |
|---|---|---|
| `scripts/doctor.sh` | `.agents/skills/verify-perpetualminer/scripts/doctor.sh` | Read-only readiness check, exit 0/1 |
| `scripts/drive.sh` | `…/drive.sh <run-id> <playwright test args…>` | Runs specs isolated (own process group), writes evidence, refuses a used run ID, records its identity |
| `scripts/cleanup.sh` | `…/cleanup.sh <run-id>` | Stops that run's processes (drive.sh, its job's group, descendants; identity-checked), removes scratch, keeps evidence; re-runnable; exit 1 if something survives |
| `scripts/mapa-de-features.sh` | `PR_BODY=… …/mapa-de-features.sh origin/main` | The CI ratchet described below (§ Keeping the feature map honest); run it locally before opening a PR (exit 1 names the surfaces) |
| `scripts/conexao-real.py` | `python3.9 …/conexao-real.py "$PWD" "$PRONTO" &` | Starts the real Conexão outside Anki on a free port (§ Driving against the real Conexão); runs until killed |
| `scripts/lib.sh` | sourced by `drive.sh` and `cleanup.sh` | Run-id and path-containment checks, process and process-group identity |
| `scripts/test_helpers.sh` | `.agents/skills/verify-perpetualminer/scripts/test_helpers.sh` | Tests the safety rules above and the `PM_WORKERS` count (refusals, symlinks, forged records, evidence reuse, a TERM-resistant child, a failed job that leaves a child, the feature-map ratchet, an orphaned child after `kill -9` of drive.sh, an interrupted cleanup run again, another checkout's run, re-run) with the real scripts and a stand-in for `npx`; no browser, ~60 s. Run it after touching any script |

Env knobs: `PM_VERIFY_ROOT` (default `/tmp/pm-verify`; keep it short: Chromium's profile socket path must stay under ~100 characters, and a deep root fails with `Socket path too long`), `PM_HEAVY_RUN` (limiter command prefix), `PM_WORKERS` (Playwright workers, default 2; use 1 on a loaded host), `HEADED=1` (show the browser; needs a display).

## Keeping the feature map honest

`features/` is the maintained record of what can be verified and how. **Any PR that changes a user-facing feature or command updates its file in `features/` (add the sub-feature ID, the driving step, the proof), or says "feature map unchanged" in the PR body.** User-facing means anything a person sees or presses: panel areas and addresses, popup, overlay, shortcuts, onboarding steps, Anki send/connection screens, photo mining, bridge routes the panel calls. CI enforces it: the `Regras` workflow runs `scripts/mapa-de-features.sh` on every PR and fails when `manifest.json`, any `*.html` in the repo root, `popup.js`, `painel*.js`, `bookreader.js`, `overlay.js`, `content.js`, `background.js`, `bridge/server.py`, `complemento/servidor.py` or `lib/voz/catalogo.js` changed and neither `features/` was touched nor the PR body says "feature map unchanged" (editing the body re-runs the check). A change that is not in that file list (another `lib/` module, a `popup.css` rule) is still covered by the rule above, by review. For a periodic audit use `/maintain-verification-skill`.

## Platforms

| | Linux (this skill) | Mac | Windows |
|---|---|---|---|
| Extension in Chromium | e2e harness, headless | owner | owner (Chrome 153 has no `--load-extension`: load the folder in chrome://extensions) |
| Conexão (Python) | `scripts/conexao-real.py`, outside Anki | inside Anki (owner) | inside Anki (owner); port 8766 is held by the bridge on the owner's PC, so the real Conexão does not start there until the bridge stops (owner's call) |
| Opener (Native Messaging, `anki-open-alone`) | none: `abridor.deste_computador` returns None; the e2e uses a fake host | registered in Chrome's host folder only | registered in HKCU\Software\Google\Chrome; found by Chrome 153 and Opera GX 136 |
| Login item (`anki-no-login`) | none: `/abrir-com-o-computador` answers 501 `login_item_unsupported` | LaunchAgent | Startup-folder shortcut |
| Key file mode | 0600 | 0600 | inherits the folder ACL (no 0600; see `docs/seguranca/chave-da-openai.md`) |

A proof says which column it ran in. Only the Linux column is proven by this skill: the 501 above was read from the real Conexão with `conexao-real.py` (Python 3.9 and 3.13). The Mac and Windows columns are facts cited from `complemento/LEIA-ME.md` and the owner's Windows run of PR 205, not something a drive here proves. Owner steps for Mac/Windows: `complemento/LEIA-ME.md`.

## Known limits

- The harness fakes Anki, Gemini and Google; nothing here talks to a real bridge, Anki Desktop, Gemini or Firestore.
- The context menu, toolbar badge, midnight alarm and extension update are simulated by calling the function Chrome would call.
- Evidence screenshots exist only where a spec calls `fotografar`; other specs leave `run.log` and `report.json`.
- Windows is the owner's runtime for the bridge; this skill was proven on Linux headless Chromium. `.claude/skills/verify-perpetualminer` is a symlink to this directory (one canonical copy); a Windows checkout without symlink support sees a plain file there, so open `.agents/skills/verify-perpetualminer/` directly.
- The Anki add-on (`complemento/`) is mapped in `features/ia.md` (the key), `features/anki-no-login.md` (the login item) and `features/anki.md` › `anki-open-alone` (the opener); its own tests run with `PYTHON=python3.9|python3.13 node scripts/testar.mjs complemento`. The screens that show what it reads (Baralhos e termos, Vocabulário) are not mapped yet.
- The add-on's read side (the Anki adapter) is proven only against a fake `mw`; a real Anki is the owner's rehearsal.
- The OpenAI key was never checked against the real OpenAI: its provider and Firestore are the repo's fakes, even in the real Conexão drive.
- The helpers have no `--help`/`--version` of their own and no machine-readable output: usage is in each script's header comment and `drive.sh`'s Playwright output goes to the terminal as is (an AXI-style polish, not a safety issue).
- Process ownership is proven by pid + start time + command line + process group, not by a secret token; a record forged by hand with a real process's own identity would pass. The threat model is stale or reused pids and mistakes, not an adversary writing `drive.pid`. Reuse of a pid by an unrelated process is not simulated in the tests.
- Several checkouts sharing one `PM_VERIFY_ROOT` and one run ID collide by design (the second is refused); use distinct IDs.
- `drive.sh` does not stop a Playwright job that moved itself out of its process group (`setsid`); Cleanup still reaches it as a descendant while a parent is alive.
- The `--update-snapshots` rule is stated in the Drive section and in `features/README.md`; `CODING_STANDARDS.md` rule 10 owns it.
- Known gaps from the last review, none a safety hole in normal use: a recorded process group whose leader died is accepted without a second proof, so a stale `drive.pid` plus real pid reuse could signal an unrelated group; the group id is read from the job with a 5 s wait that is not an error when it expires; `drive.sh` waits for the whole pipeline, so a child holding the job's stdout delays the post-job stop until it exits; the `setsid`-ed Chromium that Playwright launches (`detached`) is outside the group and found only as a descendant while its parent lives (a `--user-data-dir=<run>/tmp/` match would close that, not done); two `drive.sh` with the same run ID started together can both pass the single-use check; `drive.sh` exits 1 for leftover processes only when the job itself had passed; `test_helpers.sh` cases 8 and 11 use their own copy of the scripts, so `PM_SCRIPTS_DIR` does not apply to them; the feature-map step accepts the phrase "feature map unchanged" anywhere in the body and does not see a `git mv` of `bridge/server.py` (rename detection).
- The upkeep ratchet is path-based: it cannot tell a user-visible change in a file outside its list (a `lib/` module, the Voice catalog, `popup.css`) from a refactor, and a PR that only declares "feature map unchanged" is trusted. It lives in the `Regras` workflow as a step, not as a rule in `scripts/regras/` (those scan file contents against a baseline; this one reads the PR's diff and body).
