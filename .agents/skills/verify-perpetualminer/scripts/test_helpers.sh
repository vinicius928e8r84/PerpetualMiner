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
falhas=0; extras=(); outro=""; outro_id=""
# A stand-in for npx: the real drive.sh runs it instead of Playwright. It ignores TERM, like a stuck browser would.
mkdir -p "$TMP/bin"
cat > "$TMP/bin/npx" <<'STUB'
#!/usr/bin/env bash
trap '' TERM
touch "$PM_STUB_MARCA"
[ "${PM_STUB:-}" = rapido ] && { echo hi; exit 0; }
for _ in $(seq "${PM_STUB_SEGUNDOS:-120}"); do sleep 1; done
STUB
chmod +x "$TMP/bin/npx"
export PATH="$TMP/bin:$PATH" PM_STUB_MARCA="$TMP/stub-iniciou"
esperar() { local i; for i in $(seq 100); do eval "$1" && return 0; sleep 0.1; done; return 1; }
vivo() { kill -0 "$1" 2>/dev/null; }
trap 'for p in "${extras[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; for r in "$PM_VERIFY_ROOT"/*/; do [ -f "$r/drive.pid" ] && "$AQUI/cleanup.sh" "$(basename "$r")" >/dev/null 2>&1; done; [ -n "${outro:-}" ] && "$outro/cleanup.sh" "$outro_id" >/dev/null 2>&1; rm -rf "$TMP"' EXIT
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

# 4. A drive.pid that is not a real drive.sh record never gets a process killed: pid only, wrong start time, right
#    start time but another command, and a fully forged record whose command merely mentions drive.sh and the run id.
mkdir -p "$PM_VERIFY_ROOT/velho/evidence" "$PM_VERIFY_ROOT/velho/tmp"
inicio() { ps -o lstart= -p "$1" | tr -s ' ' | sed 's/^ //; s/ $//'; }
sleep 300 & p1=$!; extras+=("$p1")
echo "$p1" > "$PM_VERIFY_ROOT/velho/drive.pid"
"$SCRIPTS/cleanup.sh" velho >/dev/null 2>&1
vivo "$p1" && passou "unrelated process survives a pid-only drive.pid" || falhou "cleanup killed an unrelated process named by a pid-only file"
sleep 300 & p2=$!; extras+=("$p2")
printf '%s\nMon Jan  1 00:00:00 2001\n' "$p2" > "$PM_VERIFY_ROOT/velho/drive.pid"
"$SCRIPTS/cleanup.sh" velho >/dev/null 2>&1
vivo "$p2" && passou "unrelated process survives a drive.pid with the wrong start time" || falhou "cleanup killed an unrelated process"
sleep 300 & p3=$!; extras+=("$p3")
printf '%s\n%s\n' "$p3" "$(inicio "$p3")" > "$PM_VERIFY_ROOT/velho/drive.pid"
"$SCRIPTS/cleanup.sh" velho >/dev/null 2>&1
vivo "$p3" && passou "unrelated process survives even with the right start time" || falhou "cleanup killed a process that is not this run's drive.sh"
bash -c 'sleep 300; :' innocent-task drive.sh velho & p4=$!; extras+=("$p4")
sleep 0.3
{ echo "$p4"; inicio "$p4"; ps -o args= -p "$p4"; echo "$AQUI/drive.sh"; } > "$PM_VERIFY_ROOT/velho/drive.pid"
"$SCRIPTS/cleanup.sh" velho >/dev/null 2>&1
vivo "$p4" && passou "a command that only mentions drive.sh and the run id is not the owner" || falhou "cleanup killed a command that merely mentions drive.sh"

# 5. Evidence is never overwritten: a used run id is refused, a file symlink inside evidence/ is never written through.
mkdir -p "$PM_VERIFY_ROOT/usado/evidence"; echo FIRST_PROOF > "$PM_VERIFY_ROOT/usado/evidence/run.log"
"$SCRIPTS/drive.sh" usado --list >/dev/null 2>&1 && falhou "drive accepted a run id that already holds evidence" || passou "drive refuses a run id that already holds evidence"
grep -q FIRST_PROOF "$PM_VERIFY_ROOT/usado/evidence/run.log" && passou "earlier evidence intact after the refusal" || falhou "earlier evidence was overwritten"
mkdir -p "$PM_VERIFY_ROOT/elo/evidence"; echo KEEP > "$TMP/dono-de-fora"
ln -s "$TMP/dono-de-fora" "$PM_VERIFY_ROOT/elo/evidence/run.log"; ln -s "$TMP/dono-de-fora" "$PM_VERIFY_ROOT/elo/evidence/exit-code"
"$SCRIPTS/drive.sh" elo --list >/dev/null 2>&1 && falhou "drive accepted evidence files that are symlinks" || passou "drive refuses evidence files that are symlinks"
[ "$(cat "$TMP/dono-de-fora")" = KEEP ] && passou "file outside the root untouched" || falhou "drive wrote through a symlink to a file outside the root"
PM_STUB=rapido "$SCRIPTS/drive.sh" uma-vez --list >/dev/null 2>&1; rc1=$?
PM_STUB=rapido "$SCRIPTS/drive.sh" uma-vez --list >/dev/null 2>&1 && rc2=0 || rc2=$?
[ "$rc1" -eq 0 ] && [ "$rc2" -ne 0 ] && passou "a finished run id cannot be driven again" || falhou "second drive of the same run id was accepted (rc $rc1 then $rc2)"
grep -q 'hi' "$PM_VERIFY_ROOT/uma-vez/evidence/run.log" && [ "$(cat "$PM_VERIFY_ROOT/uma-vez/evidence/exit-code")" = 0 ] && passou "first run's log and exit code kept" || falhou "first run's evidence lost"

# 6. The real drive.sh with a child that ignores TERM: cleanup still stops all of it (SIGKILL after TERM), keeps evidence.
rm -f "$PM_STUB_MARCA"
"$SCRIPTS/drive.sh" preso --list >/dev/null 2>&1 & dono=$!; extras+=("$dono")
esperar '[ -f "$PM_STUB_MARCA" ] && [ "$(wc -l < "$PM_VERIFY_ROOT/preso/drive.pid" 2>/dev/null)" -ge 6 ]' || falhou "drive.sh did not start the stub"
filhos="$(pgrep -f "$TMP/bin/npx" | tr '\n' ' ')"
[ -n "$filhos" ] && passou "stub child is running ($filhos)" || falhou "no stub child to test with"
echo proof > "$PM_VERIFY_ROOT/preso/evidence/proof.txt"
"$SCRIPTS/cleanup.sh" preso >/dev/null 2>&1; rc=$?
sleep 0.3
vivos=""; for p in $filhos "$dono"; do vivo "$p" && ! [ "$(ps -o stat= -p "$p" | cut -c1)" = Z ] && vivos="$vivos $p"; done
[ -z "$vivos" ] && [ "$rc" -eq 0 ] && passou "cleanup stops drive.sh and a child that ignores TERM" || falhou "still running after cleanup:$vivos (rc $rc)"
[ -f "$PM_VERIFY_ROOT/preso/evidence/proof.txt" ] && [ ! -e "$PM_VERIFY_ROOT/preso/tmp" ] && [ ! -e "$PM_VERIFY_ROOT/preso/drive.pid" ] && passou "scratch and record removed, evidence kept" || falhou "scratch/evidence state wrong after cleanup"
"$SCRIPTS/cleanup.sh" preso >/dev/null 2>&1 && [ -f "$PM_VERIFY_ROOT/preso/evidence/proof.txt" ] && passou "cleanup is re-runnable" || falhou "second cleanup failed or lost evidence"

# 7. drive.sh itself killed (an interrupted run): its orphaned child is still found by its process group and stopped.
rm -f "$PM_STUB_MARCA"
"$SCRIPTS/drive.sh" orfao --list >/dev/null 2>&1 & dono=$!; extras+=("$dono")
esperar '[ -f "$PM_STUB_MARCA" ] && [ "$(wc -l < "$PM_VERIFY_ROOT/orfao/drive.pid" 2>/dev/null)" -ge 6 ]' || falhou "drive.sh did not start the stub"
kill -9 "$dono"; wait "$dono" 2>/dev/null
filhos="$(pgrep -f "$TMP/bin/npx" | tr '\n' ' ')"
[ -n "$filhos" ] && passou "child outlived drive.sh ($filhos)" || falhou "no orphan to test with"
"$SCRIPTS/cleanup.sh" orfao >/dev/null 2>&1; rc=$?
sleep 0.3
vivos=""; for p in $filhos; do vivo "$p" && ! [ "$(ps -o stat= -p "$p" | cut -c1)" = Z ] && vivos="$vivos $p"; done
[ -z "$vivos" ] && [ "$rc" -eq 0 ] && passou "cleanup stops the orphaned child after drive.sh died" || falhou "orphan still running:$vivos (rc $rc)"
[ ! -e "$PM_VERIFY_ROOT/orfao/drive.pid" ] && passou "record removed once nothing is left" || falhou "drive.pid kept although everything stopped"

# 8. A run started by another checkout's drive.sh (same run id) is not ours to stop; its own cleanup stops it.
outro="$TMP/outro/.agents/skills/verify-perpetualminer/scripts"; outro_id=alheio
mkdir -p "$outro" "$TMP/outro/e2e"; cp "$AQUI"/lib.sh "$AQUI"/drive.sh "$AQUI"/cleanup.sh "$outro/"
git -C "$TMP/outro" init -q
rm -f "$PM_STUB_MARCA"
"$outro/drive.sh" alheio --list >/dev/null 2>&1 & dono=$!; extras+=("$dono")
esperar '[ -f "$PM_STUB_MARCA" ] && [ "$(wc -l < "$PM_VERIFY_ROOT/alheio/drive.pid" 2>/dev/null)" -ge 6 ]' || falhou "the other checkout's drive.sh did not start the stub"
filhos="$(pgrep -f "$TMP/bin/npx" | tr '\n' ' ')"
"$SCRIPTS/cleanup.sh" alheio >/dev/null 2>&1 && falhou "cleanup accepted another checkout's run" || passou "cleanup refuses another checkout's run"
[ -n "$filhos" ] && vivo "$dono" && vivo "${filhos%% *}" && passou "another checkout's run survives this checkout's cleanup" || falhou "cleanup stopped another checkout's run"
"$outro/cleanup.sh" alheio >/dev/null 2>&1; sleep 0.3
vivo "$dono" && ! [ "$(ps -o stat= -p "$dono" | cut -c1)" = Z ] && falhou "the owning checkout's cleanup did not stop its run" || passou "the owning checkout's cleanup stops it"

[ "$falhas" -eq 0 ] && echo "test_helpers: all passed" || echo "test_helpers: $falhas failed"
exit $([ "$falhas" -eq 0 ] && echo 0 || echo 1)
