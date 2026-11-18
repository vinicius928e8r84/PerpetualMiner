#!/usr/bin/env bash
set -u
AQUI="$(cd "$(dirname "$0")" && pwd -P)"
. "$AQUI/lib.sh"
USO='usage: no-pc.sh <run-id> (<script.ps1> | - | --levar <file>... | --limpar)'
[ $# -ge 2 ] || { echo "$USO" >&2; exit 2; }
ID="$1"; shift
pm_id_valido "$ID" || { echo "run-id '$ID' refused: use one segment of letters, digits, . _ - (starts with a letter or digit)" >&2; exit 2; }
PC=(ssh -o BatchMode=yes -o ConnectTimeout=15 "${PM_PC_SSH:-pc-aux}")
PS="${PM_PC_POWERSHELL:-/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe}"

TEMP_WIN="$("${PC[@]}" "'$PS' -NoProfile -Command '[IO.Path]::GetTempPath()'" </dev/null | tr -d '\r' | sed 's/\\$//')"
[ -n "$TEMP_WIN" ] || { echo "the PC did not answer" >&2; exit 3; }
WIN="$TEMP_WIN\\pm-$ID"
W="$("${PC[@]}" "wslpath -u '$WIN'" </dev/null)"
case "$W" in /*/pm-"$ID") ;; *) echo "unexpected folder on the PC: '$W'" >&2; exit 3 ;; esac

case "$1" in
  --limpar)
    "${PC[@]}" "rm -rf '$W' && echo 'deleted on the PC: $WIN'" </dev/null ;;
  --levar)
    shift; [ $# -ge 1 ] || { echo "$USO" >&2; exit 2; }
    for f in "$@"; do
      "${PC[@]}" "mkdir -p '$W' && cat > '$W/$(basename "$f")'" < "$f" || exit 3
    done ;;
  *)
    ORIGEM="$1"
    [ "$ORIGEM" = - ] || [ -f "$ORIGEM" ] || { echo "no script at $ORIGEM" >&2; exit 2; }
    [ "$ORIGEM" = - ] && ORIGEM=""
    N="${PC_NOME:-ps$$}.ps1"
    { printf '\xEF\xBB\xBF'
      printf "[Console]::OutputEncoding=[Text.Encoding]::UTF8; \$ErrorActionPreference='Continue'; Set-Location '%s'\r\n" "$WIN"
      sed '1s/^\xEF\xBB\xBF//' ${ORIGEM:+"$ORIGEM"}
    } | "${PC[@]}" "mkdir -p '$W/ps' && cat > '$W/ps/$N'" || exit 3
    "${PC[@]}" "'$PS' -NoProfile -ExecutionPolicy Bypass -File '$WIN\\ps\\$N' 2>&1" </dev/null | tr -d '\r'
    exit "${PIPESTATUS[0]}" ;;
esac
