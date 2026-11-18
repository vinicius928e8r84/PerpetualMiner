#!/usr/bin/env bash
set -u
AQUI="$(cd "$(dirname "$0")" && pwd -P)"
. "$AQUI/lib.sh"
USO='usage: no-mac.sh <run-id> [--commit <ref>] [--trazer <path>] -- <command...>'
[ $# -ge 3 ] || { echo "$USO" >&2; exit 2; }
ID="$1"; shift; REF=HEAD; TRAZER=""
while [ $# -gt 0 ] && [ "$1" != -- ]; do
  case "$1" in
    --commit) REF="${2:?$USO}"; shift 2 ;;
    --trazer) TRAZER="${2:?$USO}"; shift 2 ;;
    *) echo "$USO" >&2; exit 2 ;;
  esac
done
[ "${1:-}" = -- ] && [ $# -ge 2 ] || { echo "$USO" >&2; exit 2; }
shift
RUN="$(pm_pasta_da_execucao "$ID")" || exit 2
[ -z "$(ls -A "$RUN/evidence" 2>/dev/null)" ] || { echo "run $ID already holds evidence in $RUN/evidence: refused. Use a new run-id." >&2; exit 2; }
RAIZ="$(git -C "$AQUI" rev-parse --show-toplevel)"
COMMIT="$(git -C "$RAIZ" rev-parse --verify "$REF^{commit}")" || exit 2
HOST="${PM_MAC_SSH:-fm-mac}"; BASE="${PM_MAC_TMP:-/private/tmp}"
MAC=(ssh -o BatchMode=yes -o ConnectTimeout=15 "$HOST")
mkdir -p "$RUN/evidence"

LIMPAR='P=$1; D=$(printf %s "$P" | tr -d "[]"); case "$D" in "$2"/pm-*-??????) ;; *) echo "refused to clean $D" >&2; exit 2 ;; esac
G=$(cat "$D/.grupo" 2>/dev/null); case "$G" in ""|*[!0-9]*|0|1) G= ;; esac; [ -n "$G" ] && kill -TERM -- "-$G" 2>/dev/null
pkill -TERM -f "$P" 2>/dev/null; sleep 1; [ -n "$G" ] && kill -KILL -- "-$G" 2>/dev/null; pkill -KILL -f "$P" 2>/dev/null
rm -rf "$D"; [ ! -e "$D" ] && echo "deleted on the Mac: $D"'

D="$("${MAC[@]}" "mktemp -d '$BASE/pm-$ID-XXXXXX'" </dev/null)" && [ -n "$D" ] || { echo "the Mac ($HOST) did not answer" >&2; echo 3 > "$RUN/evidence/exit-code"; exit 3; }
limpar() { "${MAC[@]}" "bash -c $(printf %q "$LIMPAR") limpar '${D%?}[${D: -1}]' '$BASE'" </dev/null >> "$RUN/evidence/remoto.log" 2>&1; }
trap 'limpar; exit 130' INT TERM HUP

if ! git -C "$RAIZ" archive "$COMMIT" | "${MAC[@]}" "mkdir '$D/repo' '$D/tmp' && tar -x -C '$D/repo' && cd '$D/repo' && git init -q && git add -A && git -c user.name=no-mac -c user.email=no-mac@localhost commit -qm $COMMIT"; then
  limpar; echo "copying $COMMIT to the Mac failed" >&2; echo 3 > "$RUN/evidence/exit-code"; exit 3
fi
echo "run $ID  commit $COMMIT  on $HOST:$D  $(date -u +%FT%TZ)" > "$RUN/evidence/remoto.log"
COMANDO="$(printf '%q ' "$@")"
"${MAC[@]}" "bash -s" <<REMOTO 2>&1 | tee -a "$RUN/evidence/remoto.log"
{
  set -m; cd '$D' || exit 3
  TMPDIR='$D/tmp' "\${SHELL:-/bin/sh}" -lc $(printf %q "cd '$D/repo' && $COMANDO") </dev/null &
  G=\$!; echo \$G > .grupo; wait \$G; echo "exit \$?" > .rc
  kill -TERM -- -\$G 2>/dev/null; pkill -TERM -f '${D%?}[${D: -1}]' 2>/dev/null; sleep 1
  kill -KILL -- -\$G 2>/dev/null; pkill -KILL -f '${D%?}[${D: -1}]' 2>/dev/null; true
}
REMOTO
RC="$("${MAC[@]}" "cat '$D/.rc' 2>/dev/null" </dev/null | sed -n 's/^exit //p')"
[ -n "$RC" ] || RC=3
if [ -n "$TRAZER" ]; then
  mkdir -p "$RUN/evidence/trazido"
  "${MAC[@]}" "tar -c -C '$D/repo' $(printf %q "$TRAZER")" </dev/null | tar -x -C "$RUN/evidence/trazido" || echo "could not bring $TRAZER back" >&2
fi
trap - INT TERM HUP
limpar
echo "$RC" > "$RUN/evidence/exit-code"
echo "evidence: $RUN/evidence (exit $RC)"
exit "$RC"
