#!/bin/sh
# Decide se as fatias e2e têm o que rodar e grava RODAR=true|false em $GITHUB_ENV, para os passos seguintes
# do job (`if: env.RODAR == 'true'`). Cada job e2e chama este script no começo, em vez de esperar o job que
# classificava por todos (workflow Testes). Numa PR, só se ela muda mais que documentação (so-documentacao.js,
# sobre HEAD^1..HEAD: o commit de merge da PR e a ponta da branch-alvo); no push na main, nunca; em qualquer
# outro evento, sempre. Se não der para ver o que mudou, a suíte roda.
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
