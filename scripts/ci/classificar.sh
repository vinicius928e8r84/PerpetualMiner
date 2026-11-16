#!/bin/sh
evento="${GITHUB_EVENT_NAME:-pull_request}"
case "$evento" in
  push) rodar=false ;;
  pull_request)
    if so_documentacao=$(node "$(dirname "$0")/so-documentacao.js" HEAD^1 HEAD) && [ "$so_documentacao" = true ]; then
      rodar=false
    else
      rodar=true
    fi ;;
  *) rodar=true ;;
esac
echo "RODAR=$rodar" >> "${GITHUB_ENV:-/dev/null}"
echo "RODAR=$rodar"
