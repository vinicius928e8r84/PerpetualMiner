#!/bin/sh
set -u

base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$base" ]; then
  git fetch --quiet --depth=50 origin main 2>/dev/null || { echo "vitrine: sem a main para comparar, constrói"; exit 1; }
  base=$(git merge-base HEAD FETCH_HEAD 2>/dev/null) || { echo "vitrine: sem ancestral comum com a main, constrói"; exit 1; }
fi

git diff --quiet "$base" HEAD -- \
  ':(glob)*.html' ':(glob)*.css' ':(glob)*.js' ':(exclude,glob)test_*.js' \
  manifest.json lib veio conexao docs/design e2e/vitrine preview vercel.json
resultado=$?

if [ "$resultado" -eq 0 ]; then
  echo "vitrine: nada do que o preview mostra mudou desde $base, pula o build"
  exit 0
fi
exit 1
