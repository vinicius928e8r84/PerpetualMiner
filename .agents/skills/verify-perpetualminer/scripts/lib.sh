#!/usr/bin/env bash
# Shared by drive.sh and cleanup.sh (sourced, not run). Everything that deletes or kills goes through these checks.

PM_ROOT_CONFIGURADA="${PM_VERIFY_ROOT:-/tmp/pm-verify}"

# A run ID is one path segment: starts alphanumeric, then letters, digits, . _ - (max 64). No slash, no leading dash or dot.
pm_id_valido() { [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]]; }

# pm_pasta_da_execucao <id>: prints the canonical run directory, or prints why not to stderr and returns 1.
# The directory must sit directly under the verification root, must be a real directory (not a symlink), and
# every directory this tooling creates or removes inside it (evidence, tmp, pw-output) must not be a symlink.
pm_pasta_da_execucao() {
  local id="$1" raiz run sub
  pm_id_valido "$id" || { echo "run-id '$id' refused: use one segment of letters, digits, . _ - (starts with a letter or digit)" >&2; return 1; }
  mkdir -p "$PM_ROOT_CONFIGURADA" || return 1
  raiz="$(realpath "$PM_ROOT_CONFIGURADA")" || return 1
  [ -O "$raiz" ] || { echo "verification root $raiz is not owned by you: refused" >&2; return 1; }
  run="$raiz/$id"
  [ ! -L "$run" ] || { echo "$run is a symlink: refused" >&2; return 1; }
  if [ -e "$run" ]; then
    [ -d "$run" ] && [ "$(realpath "$run")" = "$run" ] || { echo "$run is not a plain directory under $raiz: refused" >&2; return 1; }
    for sub in evidence tmp pw-output drive.pid; do
      [ ! -L "$run/$sub" ] || { echo "$run/$sub is a symlink: refused" >&2; return 1; }
    done
  fi
  printf '%s\n' "$run"
}

# The identity of a process: when it started and its command line. A pid alone proves nothing (pids are reused).
pm_inicio_do_processo() { ps -o lstart= -p "$1" 2>/dev/null | tr -s ' ' | sed 's/^ //; s/ $//'; }
pm_comando_do_processo() { ps -o args= -p "$1" 2>/dev/null; }

# pm_registrar_dono <run-dir> <pid>: writes "pid" and "start time" (two lines) to drive.pid.
pm_registrar_dono() { { echo "$2"; pm_inicio_do_processo "$2"; } > "$1/drive.pid"; }

# pm_dono_confere <run-dir> <id>: true only when drive.pid names a live process that started at the recorded time
# and whose command line is this skill's drive.sh for this run ID.
pm_dono_confere() {
  local pidfile="$1/drive.pid" pid inicio atual comando
  [ -f "$pidfile" ] || return 1
  pid="$(sed -n 1p "$pidfile")"; inicio="$(sed -n 2p "$pidfile")"
  [[ "$pid" =~ ^[0-9]+$ ]] && [ -n "$inicio" ] || return 1
  atual="$(pm_inicio_do_processo "$pid")"
  [ -n "$atual" ] && [ "$atual" = "$inicio" ] || return 1
  comando="$(pm_comando_do_processo "$pid")"
  [[ "$comando" == *drive.sh* && " $comando " == *" $2 "* ]]
}
