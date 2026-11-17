#!/bin/sh
evento="${GITHUB_EVENT_NAME:-pull_request}"
tudo="RODAR_E2E=true
RODAR_COMPLEMENTO=true
RODAR_CONEXAO_REAL=true"
case "$evento" in
  push)
    saida="RODAR_E2E=false
RODAR_COMPLEMENTO=true
RODAR_CONEXAO_REAL=false" ;;
  pull_request)
    saida=$(node "$(dirname "$0")/selecao-de-testes.js" HEAD^1 HEAD) || saida="$tudo" ;;
  *) saida="$tudo" ;;
esac
echo "$saida" >> "${GITHUB_ENV:-/dev/null}"
echo "$saida"
