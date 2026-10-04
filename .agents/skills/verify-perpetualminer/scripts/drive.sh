#!/usr/bin/env bash
# Runs Playwright specs from e2e/ in an isolated run directory and keeps the evidence.
#   <run-dir>/evidence/   screenshots + state JSON the specs write (PM_EVIDENCE_DIR), report.json, run.log, exit-code
#   <run-dir>/tmp/        TMPDIR for the run: the Chromium profiles and the fake login's certificate live here
#   <run-dir>/drive.pid   this script's pid, so cleanup.sh stops only what this run started
# <run-dir> = ${PM_VERIFY_ROOT:-/tmp/pm-verify}/<run-id>.
#
# Usage: drive.sh <run-id> <playwright test args...>
#   drive.sh c1-selecao mineracao-unica -g "mesma Fonte"
#   HEADED=1 drive.sh c1-foto minerar-foto -g "uma foto: prévia"
# Heavy: use PM_HEAVY_RUN=<limiter> to prefix it (default: /tmp/fm-heavy-run.sh when that file is executable).
# Exit code = Playwright's (also written to evidence/exit-code).
set -u
[ $# -ge 2 ] || { echo 'usage: drive.sh <run-id> <playwright test args...>' >&2; exit 2; }
ID="$1"; shift
case "$ID" in *[!A-Za-z0-9._-]*|'') echo 'run-id: letters, digits, . _ - only' >&2; exit 2;; esac

RAIZ="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
RUN="${PM_VERIFY_ROOT:-/tmp/pm-verify}/$ID"
[ -e "$RUN/drive.pid" ] && kill -0 "$(cat "$RUN/drive.pid")" 2>/dev/null && { echo "run $ID is still running (pid $(cat "$RUN/drive.pid"))" >&2; exit 2; }
mkdir -p "$RUN/evidence" "$RUN/tmp"
echo $$ > "$RUN/drive.pid"

LIMITADOR="${PM_HEAVY_RUN:-}"
[ -z "$LIMITADOR" ] && [ -x /tmp/fm-heavy-run.sh ] && LIMITADOR=/tmp/fm-heavy-run.sh

cd "$RAIZ/e2e" || exit 2
export PM_EVIDENCE_DIR="$RUN/evidence" TMPDIR="$RUN/tmp" PLAYWRIGHT_JSON_OUTPUT_NAME="$RUN/evidence/report.json"
{
  echo "run $ID  commit $(git rev-parse --short HEAD)  $(date -u +%FT%TZ)"
  echo "args: $*"
} > "$RUN/evidence/run.log"
# --output is outside evidence/: Playwright empties it at the start of every run.
$LIMITADOR npx --no-install playwright test "$@" --workers=2 --reporter=list,json --output="$RUN/pw-output" 2>&1 | tee -a "$RUN/evidence/run.log"
rc=${PIPESTATUS[0]}
echo "$rc" > "$RUN/evidence/exit-code"
rm -f "$RUN/drive.pid"
echo "evidence: $RUN/evidence (exit $rc)"
exit "$rc"
