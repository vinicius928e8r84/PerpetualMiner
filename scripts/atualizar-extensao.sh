#!/usr/bin/env bash
# Atualiza o clone do PerpetualMiner que o navegador carrega como pasta
# descompactada. Roda à mão ou pelo launchd (scripts/com.perpetualminer.atualizar.plist.exemplo).
#
# Só faz `git pull --ff-only` da main: nunca sobrescreve mudança local nem cria
# merge. Rodar de novo sem novidade não muda nada. Quando os arquivos mudam, a
# própria extensão se recarrega em até ~1 minuto (lib/auto-recarregar.js).
#
# Autenticação: a do próprio git do clone. Num repositório privado, rode uma vez
# `gh auth login` e `gh auth setup-git`; nenhum token fica neste arquivo.
#
# Uso: scripts/atualizar-extensao.sh [pasta-do-clone]
#      (sem argumento, o clone é a pasta que contém este script)

set -u

# O launchd começa com um PATH mínimo, sem o Homebrew.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

RAMO="${PM_RAMO:-main}"
CLONE="${1:-$(cd "$(dirname "$0")/.." && pwd)}"

if [ "$(uname)" = "Darwin" ]; then
  LOG="${PM_LOG:-$HOME/Library/Logs/perpetualminer-atualizar.log}"
else
  LOG="${PM_LOG:-${XDG_STATE_HOME:-$HOME/.local/state}/perpetualminer-atualizar.log}"
fi
mkdir -p "$(dirname "$LOG")"

# Log com no máximo ~1 MB: passou disso, guarda o anterior como .1 e recomeça.
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 1048576 ]; then
  mv -f "$LOG" "$LOG.1"
fi

registrar() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"; }

# Uma execução por vez (o launchd pode se sobrepor a uma execução manual).
TRAVA="${TMPDIR:-/tmp}/perpetualminer-atualizar.lock"
if ! mkdir "$TRAVA" 2>/dev/null; then
  if [ -n "$(find "$TRAVA" -maxdepth 0 -mmin +10 2>/dev/null)" ]; then
    rmdir "$TRAVA" 2>/dev/null
  fi
  registrar "outra atualização em andamento; saindo"
  exit 0
fi
trap 'rmdir "$TRAVA"' EXIT

if [ ! -d "$CLONE/.git" ] || [ ! -f "$CLONE/manifest.json" ]; then
  registrar "ERRO: $CLONE não é um clone do PerpetualMiner"
  exit 1
fi
cd "$CLONE" || exit 1

atual="$(git rev-parse --abbrev-ref HEAD)"
if [ "$atual" != "$RAMO" ]; then
  registrar "ERRO: o clone está em '$atual', não em '$RAMO'; não atualizei"
  exit 1
fi

antes="$(git rev-parse HEAD)"
if ! saida="$(GIT_TERMINAL_PROMPT=0 git pull --ff-only --quiet origin "$RAMO" 2>&1)"; then
  registrar "ERRO no git pull: $saida"
  exit 1
fi
depois="$(git rev-parse HEAD)"

if [ "$antes" = "$depois" ]; then
  registrar "sem novidade (${depois:0:7})"
else
  versao="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json | head -1)"
  registrar "atualizado ${antes:0:7} -> ${depois:0:7} (versão $versao)"
fi
