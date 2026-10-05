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
pm_vivo() { local estado; estado="$(ps -o stat= -p "$1" 2>/dev/null)"; [ -n "$estado" ] && [[ "$estado" != Z* ]]; }

# drive.pid, one value per line: 1 drive.sh pid, 2 its start time, 3 its exact command line, 4 the canonical path of
# the drive.sh that wrote it, 5 the process group drive.sh gave the Playwright job, 6 that group leader's start time.

# pm_registrar_dono <run-dir> <pid> <canonical drive.sh path>
pm_registrar_dono() { { echo "$2"; pm_inicio_do_processo "$2"; pm_comando_do_processo "$2"; echo "$3"; } > "$1/drive.pid"; }

# pm_registrar_grupo <run-dir> <pgid>: the job runs in its own process group, so its processes stay findable by group
# even after drive.sh itself is gone.
pm_registrar_grupo() { { echo "$2"; pm_inicio_do_processo "$2"; } >> "$1/drive.pid"; }

# pm_dono_confere <run-dir> <id> <canonical drive.sh path of this checkout>: true only when drive.pid names a live
# process that started at the recorded time, whose command line is still the recorded one, is shaped
# "<interpreter> <...>/drive.sh <id> ..." (a command that merely mentions drive.sh does not count), and whose
# drive.sh is this checkout's.
pm_dono_confere() {
  local pidfile="$1/drive.pid" pid inicio comando gravado script palavras i
  [ -f "$pidfile" ] || return 1
  pid="$(sed -n 1p "$pidfile")"; inicio="$(sed -n 2p "$pidfile")"; gravado="$(sed -n 3p "$pidfile")"; script="$(sed -n 4p "$pidfile")"
  [[ "$pid" =~ ^[0-9]+$ ]] && [ -n "$inicio" ] && [ -n "$gravado" ] && [ "$script" = "$3" ] || return 1
  [ "$(pm_inicio_do_processo "$pid")" = "$inicio" ] || return 1
  comando="$(pm_comando_do_processo "$pid")"
  [ "$comando" = "$gravado" ] || return 1
  read -r -a palavras <<< "$comando"
  for i in 0 1 2; do
    [ "$(basename "${palavras[$i]:-}")" = drive.sh ] && [ "${palavras[$((i + 1))]:-}" = "$2" ] && return 0
  done
  return 1
}

# pm_membros_do_grupo <pgid>: pids in that process group.
pm_membros_do_grupo() { ps -axo pid=,pgid= 2>/dev/null | awk -v g="$1" -v eu="$$" '$2 == g && $1 != eu { print $1 }'; }

# pm_grupo_confere <run-dir> <canonical drive.sh path of this checkout>: true when drive.pid was written by this
# checkout's drive.sh and records a group that still has members and is still the recorded one. A group id cannot be reused while any member lives; if its leader pid is alive again with another start time,
# the recorded group is gone and the number belongs to something else.
pm_grupo_confere() {
  local pidfile="$1/drive.pid" pgid inicio atual
  [ -f "$pidfile" ] || return 1
  pgid="$(sed -n 5p "$pidfile")"; inicio="$(sed -n 6p "$pidfile")"
  [[ "$pgid" =~ ^[0-9]+$ ]] && [ "$pgid" -gt 1 ] && [ "$(sed -n 4p "$pidfile")" = "$2" ] || return 1
  atual="$(pm_inicio_do_processo "$pgid")"
  [ -z "$atual" ] || [ "$atual" = "$inicio" ] || return 1
  [ -n "$(pm_membros_do_grupo "$pgid")" ]
}

# pm_de_outro_checkout <run-dir> <canonical drive.sh path of this checkout>: true when drive.pid was written by another
# checkout's drive.sh and something it started may still be alive (its owner by start time, or its group). Such a run
# is not ours to stop or to clean up.
pm_de_outro_checkout() {
  local pidfile="$1/drive.pid" pid pgid
  [ -f "$pidfile" ] && [ "$(sed -n 4p "$pidfile")" != "$2" ] || return 1
  pid="$(sed -n 1p "$pidfile")"; pgid="$(sed -n 5p "$pidfile")"
  [[ "$pid" =~ ^[0-9]+$ ]] && [ "$(pm_inicio_do_processo "$pid")" = "$(sed -n 2p "$pidfile")" ] && return 0
  [[ "$pgid" =~ ^[0-9]+$ ]] && [ "$pgid" -gt 1 ] && [ -n "$(pm_membros_do_grupo "$pgid")" ]
}

pm_descendentes() { local f; for f in $(pgrep -P "$1" 2>/dev/null); do pm_descendentes "$f"; echo "$f"; done; }

# pm_alvos <run-dir> <id> <canonical drive.sh path>: "pid|start time" for everything this run started that is still
# alive: drive.sh, the processes of its job's group, and all their descendants.
pm_alvos() {
  local run="$1" raiz p
  raiz="$({
    pm_dono_confere "$run" "$2" "$3" && sed -n 1p "$run/drive.pid"
    pm_grupo_confere "$run" "$3" && pm_membros_do_grupo "$(sed -n 5p "$run/drive.pid")"
  } | sort -u)"
  for p in $raiz; do pm_descendentes "$p"; echo "$p"; done | sort -un | while read -r p; do
    pm_vivo "$p" && echo "$p|$(pm_inicio_do_processo "$p")"
  done
}

# pm_sinalizar <signal> <alvo>...: signals a target only while it is still the process that was collected.
pm_sinalizar() {
  local sinal="$1" alvo; shift
  for alvo in "$@"; do
    [ "$(pm_inicio_do_processo "${alvo%%|*}")" = "${alvo#*|}" ] && kill "-$sinal" "${alvo%%|*}" 2>/dev/null
  done
  return 0
}

# pm_sobreviventes <alvo>...: prints the targets that are still alive and still the collected process.
pm_sobreviventes() {
  local alvo
  for alvo in "$@"; do
    pm_vivo "${alvo%%|*}" && [ "$(pm_inicio_do_processo "${alvo%%|*}")" = "${alvo#*|}" ] && echo "$alvo"
  done
}
