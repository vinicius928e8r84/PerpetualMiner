#!/usr/bin/env bash
# Runs Playwright specs from e2e/ in an isolated run directory and keeps the evidence.
#   <run-dir>/evidence/   screenshots + state JSON the specs write (PM_EVIDENCE_DIR), report.json, run.log, exit-code
#   <run-dir>/tmp/        TMPDIR for the run: the Chromium profiles and the fake login's certificate live here
#   <run-dir>/drive.pid   this script's identity and its job's process group, so cleanup.sh stops only what this run started
# <run-dir> = ${PM_VERIFY_ROOT:-/tmp/pm-verify}/<run-id>.
#
# Usage: drive.sh <run-id> <playwright test args...>
#   drive.sh c1-selecao mineracao-unica.spec -g "mesma Fonte"
#   HEADED=1 drive.sh c1-foto minerar-foto.spec -g "uma foto: prévia"
# Heavy: use PM_HEAVY_RUN=<limiter> to prefix it (default: /tmp/fm-heavy-run.sh when that file is executable).
# Workers: 2 unless PM_WORKERS says otherwise (a --workers in the arguments loses: the script's own comes last).
# Exit code = Playwright's (also written to evidence/exit-code); 1 if the job left processes that could not be stopped.
# Whatever the job leaves running in its process group is stopped when it ends. Refuses a bad or symlinked run-id/run dir.
# A run ID is single-use: one whose evidence/ already holds files is refused, so proof is never overwritten.
# Pick a new ID for every drive (c1-selecao, c1-selecao-2, ...).
set -u
[ $# -ge 2 ] || { echo 'usage: drive.sh <run-id> <playwright test args...>' >&2; exit 2; }
ID="$1"; shift

AQUI="$(cd "$(dirname "$0")" && pwd -P)"
# shellcheck source=lib.sh
. "$AQUI/lib.sh"
RUN="$(pm_pasta_da_execucao "$ID")" || exit 2
RAIZ="$(git -C "$AQUI" rev-parse --show-toplevel)"

if pm_dono_confere "$RUN" "$ID" "$AQUI/drive.sh"; then
  echo "run $ID is still running (pid $(sed -n 1p "$RUN/drive.pid"))" >&2; exit 2
fi
if [ -n "$(ls -A "$RUN/evidence" 2>/dev/null)" ]; then
  echo "run $ID already holds evidence in $RUN/evidence: refused, it would be overwritten. Use a new run-id." >&2; exit 2
fi
mkdir -p "$RUN/evidence" "$RUN/tmp"
pm_registrar_dono "$RUN" $$ "$AQUI/drive.sh"

LIMITADOR="${PM_HEAVY_RUN:-}"
[ -z "$LIMITADOR" ] && [ -x /tmp/fm-heavy-run.sh ] && LIMITADOR=/tmp/fm-heavy-run.sh

cd "$RAIZ/e2e" || exit 2
export PM_EVIDENCE_DIR="$RUN/evidence" TMPDIR="$RUN/tmp" PLAYWRIGHT_JSON_OUTPUT_NAME="$RUN/evidence/report.json"
{
  echo "run $ID  commit $(git rev-parse --short HEAD)  $(date -u +%FT%TZ)"
  echo "args: $*"
} > "$RUN/evidence/run.log"

# The job runs in its own process group (job control), so cleanup.sh can stop it even if this script dies first.
# --output is outside evidence/: Playwright empties it at the start of every run.
set -m
# The job writes its own group id first thing: asking ps about the pipeline afterwards races with a job that ends at once.
( ps -o pgid= -p "$BASHPID" | tr -d ' ' > "$RUN/tmp/pgid"
  $LIMITADOR npx --no-install playwright test "$@" --workers="${PM_WORKERS:-2}" --reporter=list,json --output="$RUN/pw-output" 2>&1
  echo $? > "$RUN/tmp/exit-code" ) < /dev/null | tee -a "$RUN/evidence/run.log" &
for _ in $(seq 100); do [ -s "$RUN/tmp/pgid" ] && break; sleep 0.05; done
GRUPO="$(cat "$RUN/tmp/pgid" 2>/dev/null)"
pm_registrar_grupo "$RUN" "$GRUPO"
parar() { kill -TERM -- "-$GRUPO" 2>/dev/null; exit "$1"; }
trap 'parar 130' INT
trap 'parar 143' TERM HUP
wait
rc="$(cat "$RUN/tmp/exit-code" 2>/dev/null || echo 1)"
# The job is over, but it may have left processes behind in its group (a browser, a worker). Stop them now. The record
# is deleted only once the group is empty: while anything is alive, cleanup.sh must still be able to find it.
if pm_encerrar_grupo "$RUN" "$AQUI/drive.sh"; then
  rm -f "$RUN/drive.pid"
else
  echo "FAILED: processes of this run are still alive after SIGKILL (group $GRUPO); drive.pid kept, run cleanup.sh $ID" >&2
  [ "$rc" -eq 0 ] && rc=1
fi
echo "$rc" > "$RUN/evidence/exit-code"
echo "evidence: $RUN/evidence (exit $rc)"
exit "$rc"
