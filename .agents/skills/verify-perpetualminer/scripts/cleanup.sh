#!/usr/bin/env bash
# Tears down one run: stops what drive.sh started for it (by the pid it recorded, never by name) and
# removes its scratch (profiles, Playwright output). Evidence is never touched.
# Usage: cleanup.sh <run-id>
set -u
[ $# -eq 1 ] || { echo 'usage: cleanup.sh <run-id>' >&2; exit 2; }
RUN="${PM_VERIFY_ROOT:-/tmp/pm-verify}/$1"
[ -d "$RUN" ] || { echo "no such run: $RUN" >&2; exit 2; }

descendentes() { local f; for f in $(pgrep -P "$1" 2>/dev/null); do descendentes "$f"; echo "$f"; done; }

if [ -f "$RUN/drive.pid" ]; then
  pid="$(cat "$RUN/drive.pid")"
  if kill -0 "$pid" 2>/dev/null; then
    alvos="$(descendentes "$pid") $pid"
    # shellcheck disable=SC2086
    kill $alvos 2>/dev/null
    sleep 2
    # shellcheck disable=SC2086
    kill -9 $alvos 2>/dev/null
    echo "stopped pid(s): $alvos"
  fi
  rm -f "$RUN/drive.pid"
fi

rm -rf "$RUN/tmp" "$RUN/pw-output"
if [ -d "$RUN/evidence" ]; then
  echo "evidence kept: $RUN/evidence ($(find "$RUN/evidence" -type f | wc -l) files)"
else
  echo "warning: $RUN/evidence does not exist"
fi
