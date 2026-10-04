#!/usr/bin/env bash
# Tears down one run: stops what drive.sh started for it and removes its scratch (profiles, Playwright output).
# Evidence is never touched. Safe to run again after an interruption: every step checks before it acts, and a
# second run on an already-clean directory only reports what is kept.
#
# Safety: the run ID must be one plain segment, the run directory a real directory directly under the verification
# root (no symlink anywhere in what gets removed), and a process is signalled only when drive.pid's pid still has
# the start time recorded there and a command line that is this run's drive.sh. A pid alone is never enough.
# Usage: cleanup.sh <run-id>
set -u
[ $# -eq 1 ] || { echo 'usage: cleanup.sh <run-id>' >&2; exit 2; }
ID="$1"
AQUI="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$AQUI/lib.sh"
RUN="$(pm_pasta_da_execucao "$ID")" || exit 2
[ -d "$RUN" ] || { echo "no such run: $RUN" >&2; exit 2; }

descendentes() { local f; for f in $(pgrep -P "$1" 2>/dev/null); do descendentes "$f"; echo "$f"; done; }

if [ -f "$RUN/drive.pid" ]; then
  if pm_dono_confere "$RUN" "$ID"; then
    pid="$(sed -n 1p "$RUN/drive.pid")"
    alvos="$(descendentes "$pid") $pid"
    # shellcheck disable=SC2086
    kill $alvos 2>/dev/null
    sleep 2
    # Re-check identity before the hard kill: the process may have exited and its pid been reused.
    if pm_dono_confere "$RUN" "$ID"; then
      # shellcheck disable=SC2086
      kill -9 $alvos 2>/dev/null
    fi
    echo "stopped pid(s): $alvos"
  else
    echo "drive.pid does not match a live drive.sh for run $ID (stale or reused pid): nothing signalled"
  fi
  rm -f "$RUN/drive.pid"
fi

rm -rf "$RUN/tmp" "$RUN/pw-output"
if [ -d "$RUN/evidence" ]; then
  echo "evidence kept: $RUN/evidence ($(find "$RUN/evidence" -type f | wc -l) files)"
else
  echo "warning: $RUN/evidence does not exist"
fi
