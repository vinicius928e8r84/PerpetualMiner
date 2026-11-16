#!/usr/bin/env bash
set -u
[ $# -eq 1 ] || { echo 'usage: cleanup.sh <run-id>' >&2; exit 2; }
ID="$1"
AQUI="$(cd "$(dirname "$0")" && pwd -P)"
# shellcheck source=lib.sh
. "$AQUI/lib.sh"
RUN="$(pm_pasta_da_execucao "$ID")" || exit 2
[ -d "$RUN" ] || { echo "no such run: $RUN" >&2; exit 2; }
SCRIPT="$AQUI/drive.sh"

# pm_alvos prints one "pid|start time" per line; start times contain spaces, so split on newlines only.
coletar() { local IFS=$'\n'; set -f; alvos=($(pm_alvos "$RUN" "$ID" "$SCRIPT")); set +f; }

if pm_de_outro_checkout "$RUN" "$SCRIPT"; then
  echo "run $ID was started by another checkout's drive.sh ($(sed -n 4p "$RUN/drive.pid")): refused, nothing signalled or removed. Use that checkout's cleanup.sh." >&2
  exit 2
fi

if [ -f "$RUN/drive.pid" ]; then
  coletar
  if [ "${#alvos[@]}" -eq 0 ]; then
    echo "drive.pid of run $ID names nothing alive that this run started (finished, stale or reused pid): nothing signalled"
  else
    pm_sinalizar TERM "${alvos[@]}"
    for _ in 1 2 3 4 5 6; do
      [ -z "$(pm_sobreviventes "${alvos[@]}")" ] && break
      sleep 0.5
    done
    if [ -n "$(pm_sobreviventes "${alvos[@]}")" ]; then
      primeiros=("${alvos[@]}"); coletar; alvos=("${primeiros[@]}" "${alvos[@]}")
      pm_sinalizar KILL "${alvos[@]}"
      sleep 1
    fi
    vivos="$(pm_sobreviventes "${alvos[@]}")"
    if [ -n "$vivos" ]; then
      echo "FAILED: still running after SIGKILL (pid|start): $(echo "$vivos" | tr '\n' ' ')" >&2
      echo "drive.pid and scratch kept; fix it by hand or run cleanup again" >&2
      exit 1
    fi
    echo "stopped $(printf '%s\n' "${alvos[@]}" | cut -d'|' -f1 | tr '\n' ' ')"
  fi
  rm -f "$RUN/drive.pid"
fi

rm -rf "$RUN/tmp" "$RUN/pw-output"
if [ -d "$RUN/evidence" ]; then
  echo "evidence kept: $RUN/evidence ($(find "$RUN/evidence" -type f | wc -l) files)"
else
  echo "warning: $RUN/evidence does not exist"
fi
