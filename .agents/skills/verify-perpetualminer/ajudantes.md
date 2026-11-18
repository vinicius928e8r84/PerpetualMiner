# The helper scripts

Part of [`SKILL.md`](./SKILL.md). Read it before changing a script in `scripts/`, and when Cleanup refuses (exit 2) or exits 1.

## The scripts

| Script | Invocation | Does |
|---|---|---|
| `scripts/doctor.sh` | `.agents/skills/verify-perpetualminer/scripts/doctor.sh` | Read-only readiness check, exit 0/1 |
| `scripts/drive.sh` | `…/drive.sh <run-id> <playwright test args…>` | Runs specs isolated (own process group), writes evidence, refuses a used run ID, records its identity |
| `scripts/cleanup.sh` | `…/cleanup.sh <run-id>` | Stops that run's processes (drive.sh, its job's group, descendants; identity-checked), removes scratch, keeps evidence; re-runnable; exit 1 if something survives |
| `scripts/mapa-de-features.sh` | `PR_BODY=… …/mapa-de-features.sh origin/main` | The CI ratchet in [`mapa-de-features.md`](./mapa-de-features.md); run it locally before opening a PR (exit 1 names the surfaces) |
| `scripts/conexao-real.py` | `python3.9 …/conexao-real.py "$PWD" "$PRONTO" &` | Starts the real Conexão outside Anki on a free port (SKILL.md § Driving against the real Conexão); runs until killed |
| `scripts/lib.sh` | sourced by `drive.sh` and `cleanup.sh` | Run-id and path-containment checks, process and process-group identity |
| `scripts/test_helpers.sh` | `.agents/skills/verify-perpetualminer/scripts/test_helpers.sh` | Tests the safety rules below and the `PM_WORKERS` count (refusals, symlinks, forged records, evidence reuse, a TERM-resistant child, a failed job that leaves a child, the feature-map ratchet, an orphaned child after `kill -9` of drive.sh, an interrupted cleanup run again, another checkout's run, re-run) with the real scripts and a stand-in for `npx`; no browser, ~60 s. Run it after touching any script |

## Cleanup's safety rules

The rules `cleanup.sh` and `drive.sh` enforce, so you can rely on them:

- **Paths.** The run ID must be one plain segment (letters, digits, `. _ -`, starting with a letter or digit); the run directory must be a real directory directly under the verification root, with no symlink among `evidence`, `tmp`, `pw-output`, `drive.pid`; otherwise it refuses (exit 2) and deletes nothing.
- **What gets stopped.** `drive.sh` runs Playwright as a job in its own process group and records the group in `drive.pid`. Cleanup stops drive.sh (only when pid, start time, exact command line and this checkout's `drive.sh` path all match the record, and the command is shaped `<interpreter> …/drive.sh <run-id> …`; a command that merely mentions `drive.sh` does not count), every process of that group, and their descendants, so it still works after drive.sh was killed or the terminal closed and the browser was left behind. Each process is signalled only while it is still the one that was collected (same start time); TERM first, then KILL for what ignores it. A stale or reused pid is reported and left alone, never killed by pid alone and never by name. A run recorded by another checkout's `drive.sh` is refused (exit 2) with nothing touched: use that checkout's `cleanup.sh`.
- **A failed job leaves nothing behind.** When the Playwright job ends (pass or fail), `drive.sh` stops whatever it left running in its group (TERM, then KILL) before it returns, and deletes `drive.pid` only once the group is empty. If something survives KILL, `drive.sh` exits 1 and keeps `drive.pid`, so Cleanup can still find it.
- **Survivors fail loudly.** If anything is still alive after KILL, Cleanup exits 1, names it, and keeps `drive.pid` and the scratch so a re-run retries.
- **Re-runnable.** If Cleanup was interrupted (or the run is already clean), run the same command; it re-checks, finishes the removal and reports the evidence it kept.

## Known gaps

- The helpers have no `--help`/`--version` of their own and no machine-readable output: usage is in each script's header comment and `drive.sh`'s Playwright output goes to the terminal as is (an AXI-style polish, not a safety issue).
- Process ownership is proven by pid + start time + command line + process group, not by a secret token; a record forged by hand with a real process's own identity would pass. The threat model is stale or reused pids and mistakes, not an adversary writing `drive.pid`. Reuse of a pid by an unrelated process is not simulated in the tests.
- Several checkouts sharing one `PM_VERIFY_ROOT` and one run ID collide by design (the second is refused); use distinct IDs.
- `drive.sh` does not stop a Playwright job that moved itself out of its process group (`setsid`); Cleanup still reaches it as a descendant while a parent is alive.
- Known gaps from the last review, none a safety hole in normal use: a recorded process group whose leader died is accepted without a second proof, so a stale `drive.pid` plus real pid reuse could signal an unrelated group; the group id is read from the job with a 5 s wait that is not an error when it expires; `drive.sh` waits for the whole pipeline, so a child holding the job's stdout delays the post-job stop until it exits; the `setsid`-ed Chromium that Playwright launches (`detached`) is outside the group and found only as a descendant while its parent lives (a `--user-data-dir=<run>/tmp/` match would close that, not done); two `drive.sh` with the same run ID started together can both pass the single-use check; `drive.sh` exits 1 for leftover processes only when the job itself had passed; `test_helpers.sh` cases 8 and 11 use their own copy of the scripts, so `PM_SCRIPTS_DIR` does not apply to them; the feature-map step accepts the phrase "feature map unchanged" anywhere in the body and does not see a `git mv` of `complemento/servidor.py` (rename detection).
