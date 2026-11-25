#!/usr/bin/env bash

PM_ROOT_CONFIGURADA="${PM_VERIFY_ROOT:-/tmp/pm-verify}"

pm_id_valido() { [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]]; }

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

pm_inicio_do_processo() { ps -o lstart= -p "$1" 2>/dev/null | tr -s ' ' | sed 's/^ //; s/ $//'; }
pm_comando_do_processo() { ps -o args= -p "$1" 2>/dev/null; }
pm_vivo() { local estado; estado="$(ps -o stat= -p "$1" 2>/dev/null)"; [ -n "$estado" ] && [[ "$estado" != Z* ]]; }

pm_registrar_dono() { { echo "$2"; pm_inicio_do_processo "$2"; pm_comando_do_processo "$2"; echo "$3"; } > "$1/drive.pid"; }

pm_registrar_grupo() { { echo "$2"; pm_inicio_do_processo "$2"; } >> "$1/drive.pid"; }

pm_dono_confere() {
  local pidfile="$1/drive.pid" pid inicio comando gravado script palavras i
  [ -f "$pidfile" ] || return 1
  pid="$(sed -n 1p "$pidfile")"; inicio="$(sed -n 2p "$pidfile")"; gravado="$(sed -n 3p "$pidfile")"; script="$(sed -n 4p "$pidfile")"
  [[ "$pid" =~ ^[0-9]+$ ]] && [ -n "$inicio" ] && [ -n "$gravado" ] && [ "$script" = "$3" ] || return 1
  [ "$(pm_inicio_do_processo "$pid")" = "$inicio" ] || return 1
  comando="$(pm_comando_do_processo "$pid")"
  [ "$comando" = "$gravado" ] || return 1
  IFS=$' \t\n' read -r -a palavras <<< "$comando"
  for i in 0 1 2; do
    [ "$(basename "${palavras[$i]:-}")" = drive.sh ] && [ "${palavras[$((i + 1))]:-}" = "$2" ] && return 0
  done
  return 1
}

pm_membros_do_grupo() { ps -axo pid=,pgid=,stat= 2>/dev/null | awk -v g="$1" -v eu="$$" '$2 == g && $1 != eu && $3 !~ /^Z/ { print $1 }'; }

pm_grupo_confere() {
  local pidfile="$1/drive.pid" pgid inicio atual
  [ -f "$pidfile" ] || return 1
  pgid="$(sed -n 5p "$pidfile")"; inicio="$(sed -n 6p "$pidfile")"
  [[ "$pgid" =~ ^[0-9]+$ ]] && [ "$pgid" -gt 1 ] && [ "$(sed -n 4p "$pidfile")" = "$2" ] || return 1
  atual="$(pm_inicio_do_processo "$pgid")"
  [ -z "$atual" ] || [ "$atual" = "$inicio" ] || return 1
  [ -n "$(pm_membros_do_grupo "$pgid")" ]
}

pm_de_outro_checkout() {
  local pidfile="$1/drive.pid" pid pgid
  [ -f "$pidfile" ] && [ "$(sed -n 4p "$pidfile")" != "$2" ] || return 1
  pid="$(sed -n 1p "$pidfile")"; pgid="$(sed -n 5p "$pidfile")"
  [[ "$pid" =~ ^[0-9]+$ ]] && [ "$(pm_inicio_do_processo "$pid")" = "$(sed -n 2p "$pidfile")" ] && return 0
  [[ "$pgid" =~ ^[0-9]+$ ]] && [ "$pgid" -gt 1 ] && [ -n "$(pm_membros_do_grupo "$pgid")" ]
}

pm_descendentes() { local f; for f in $(pgrep -P "$1" 2>/dev/null); do pm_descendentes "$f"; echo "$f"; done; }

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

pm_sinalizar() {
  local sinal="$1" alvo; shift
  for alvo in "$@"; do
    [ "$(pm_inicio_do_processo "${alvo%%|*}")" = "${alvo#*|}" ] && kill "-$sinal" "${alvo%%|*}" 2>/dev/null
  done
  return 0
}

pm_sobreviventes() {
  local alvo
  for alvo in "$@"; do
    pm_vivo "${alvo%%|*}" && [ "$(pm_inicio_do_processo "${alvo%%|*}")" = "${alvo#*|}" ] && echo "$alvo"
  done
}

pm_encerrar_grupo() {
  local pgid i
  pm_grupo_confere "$1" "$2" || return 0
  pgid="$(sed -n 5p "$1/drive.pid")"
  kill -TERM -- "-$pgid" 2>/dev/null
  for i in 1 2 3 4 5 6; do [ -z "$(pm_membros_do_grupo "$pgid")" ] && return 0; sleep 0.5; done
  pm_grupo_confere "$1" "$2" && kill -KILL -- "-$pgid" 2>/dev/null
  sleep 0.5
  [ -z "$(pm_membros_do_grupo "$pgid")" ]
}
