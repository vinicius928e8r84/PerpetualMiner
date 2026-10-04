#!/usr/bin/env bash
# Tests for drive.sh / cleanup.sh safety: what they refuse, what they never kill or delete, and re-runnability.
# No browser, no Playwright: every case is refused (or acts) before Playwright would start.
# Usage: test_helpers.sh            (tests the scripts next to it)
#        PM_SCRIPTS_DIR=<dir> test_helpers.sh   (tests another copy, e.g. an older revision, to see it fail)
set -u
AQUI="$(cd "$(dirname "$0")" && pwd)"
SCRIPTS="${PM_SCRIPTS_DIR:-$AQUI}"
TMP="$(mktemp -d)"
export PM_VERIFY_ROOT="$TMP/root" PM_HEAVY_RUN=env   # env: a no-op prefix, so an old drive.sh never waits for a heavy slot
mkdir -p "$PM_VERIFY_ROOT"
falhas=0; extras=()
trap 'for p in "${extras[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; rm -rf "$TMP"' EXIT
passou() { echo "ok    $1"; }
falhou() { echo "FAIL  $1"; falhas=$((falhas + 1)); }

# 1. Bad run IDs are refused by both scripts.
for id in '../escape' 'a/b' '.' '..' '-rf' '.hidden' ''; do
  "$SCRIPTS/cleanup.sh" "$id" >/dev/null 2>&1 && falhou "cleanup accepted run-id '$id'" || passou "cleanup refuses run-id '$id'"
  "$SCRIPTS/drive.sh" "$id" --list >/dev/null 2>&1 && falhou "drive accepted run-id '$id'" || passou "drive refuses run-id '$id'"
done

# 2. A run dir that is a symlink to a directory outside the root: refused, and the outside directory is untouched.
vitima="$TMP/vitima"; mkdir -p "$vitima/tmp" "$vitima/pw-output" "$vitima/evidence"
echo keep > "$vitima/tmp/a"; echo keep > "$vitima/pw-output/b"; echo keep > "$vitima/evidence/c"
ln -s "$vitima" "$PM_VERIFY_ROOT/fora"
"$SCRIPTS/cleanup.sh" fora >/dev/null 2>&1 && falhou "cleanup accepted a symlinked run dir" || passou "cleanup refuses a symlinked run dir"
[ -f "$vitima/tmp/a" ] && [ -f "$vitima/pw-output/b" ] && [ -f "$vitima/evidence/c" ] && passou "outside directory untouched by cleanup" || falhou "cleanup deleted files OUTSIDE the verification root"
"$SCRIPTS/drive.sh" fora --list >/dev/null 2>&1 && falhou "drive accepted a symlinked run dir" || passou "drive refuses a symlinked run dir"
[ ! -e "$vitima/drive.pid" ] && [ ! -e "$vitima/evidence/run.log" ] && passou "outside directory untouched by drive" || falhou "drive wrote OUTSIDE the verification root"

# 3. A symlinked tmp inside a real run dir: refused, target intact.
mkdir -p "$PM_VERIFY_ROOT/ligado/evidence" "$TMP/alvo"; echo keep > "$TMP/alvo/x"
ln -s "$TMP/alvo" "$PM_VERIFY_ROOT/ligado/tmp"
"$SCRIPTS/cleanup.sh" ligado >/dev/null 2>&1 && falhou "cleanup accepted a symlinked tmp" || passou "cleanup refuses a symlinked tmp"
[ -f "$TMP/alvo/x" ] && passou "symlink target intact" || falhou "symlink target deleted"

# 4. A stale drive.pid naming an unrelated live process: never killed (pid-only file, and pid + wrong start time).
mkdir -p "$PM_VERIFY_ROOT/velho/evidence" "$PM_VERIFY_ROOT/velho/tmp"
sleep 300 & inocente=$!; extras+=("$inocente")
echo "$inocente" > "$PM_VERIFY_ROOT/velho/drive.pid"
"$SCRIPTS/cleanup.sh" velho >/dev/null 2>&1
kill -0 "$inocente" 2>/dev/null && passou "unrelated process survives a pid-only drive.pid" || falhou "cleanup killed an unrelated process named by a pid-only file"
sleep 300 & inocente2=$!; extras+=("$inocente2")
printf '%s\nMon Jan  1 00:00:00 2001\n' "$inocente2" > "$PM_VERIFY_ROOT/velho/drive.pid"
"$SCRIPTS/cleanup.sh" velho >/dev/null 2>&1
kill -0 "$inocente2" 2>/dev/null && passou "unrelated process survives a drive.pid with the wrong start time" || falhou "cleanup killed an unrelated process"
# Right start time but not a drive.sh command line: still not ours.
sleep 300 & inocente3=$!; extras+=("$inocente3")
{ echo "$inocente3"; ps -o lstart= -p "$inocente3" | tr -s ' ' | sed 's/^ //; s/ $//'; } > "$PM_VERIFY_ROOT/velho/drive.pid"
"$SCRIPTS/cleanup.sh" velho >/dev/null 2>&1
kill -0 "$inocente3" 2>/dev/null && passou "unrelated process survives even with the right start time" || falhou "cleanup killed a process that is not this run's drive.sh"

# 5. A genuine owner (command line has drive.sh and the run id, start time matches) is stopped.
mkdir -p "$PM_VERIFY_ROOT/vivo/evidence" "$PM_VERIFY_ROOT/vivo/tmp"
bash -c 'sleep 300; :' drive.sh vivo & dono=$!; extras+=("$dono")
sleep 0.3
{ echo "$dono"; ps -o lstart= -p "$dono" | tr -s ' ' | sed 's/^ //; s/ $//'; } > "$PM_VERIFY_ROOT/vivo/drive.pid"
echo proof > "$PM_VERIFY_ROOT/vivo/evidence/proof.txt"
"$SCRIPTS/cleanup.sh" vivo >/dev/null 2>&1
sleep 0.3
kill -0 "$dono" 2>/dev/null && falhou "cleanup did not stop the run's own drive.sh" || passou "cleanup stops the run's own drive.sh"
[ -f "$PM_VERIFY_ROOT/vivo/evidence/proof.txt" ] && [ ! -e "$PM_VERIFY_ROOT/vivo/tmp" ] && passou "scratch removed, evidence kept" || falhou "scratch/evidence state wrong after cleanup"

# 6. Re-running cleanup (an interrupted one is re-run the same way) succeeds and changes nothing more.
"$SCRIPTS/cleanup.sh" vivo >/dev/null 2>&1 && [ -f "$PM_VERIFY_ROOT/vivo/evidence/proof.txt" ] && passou "cleanup is re-runnable" || falhou "second cleanup failed or lost evidence"

[ "$falhas" -eq 0 ] && echo "test_helpers: all passed" || echo "test_helpers: $falhas failed"
exit $([ "$falhas" -eq 0 ] && echo 0 || echo 1)
