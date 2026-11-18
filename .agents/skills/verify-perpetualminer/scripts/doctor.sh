#!/usr/bin/env bash
set -u
RAIZ="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
E2E="$RAIZ/e2e"
falhas=0
ok()  { printf 'ok    %s\n' "$*"; }
nok() { printf 'FAIL  %s\n' "$*"; falhas=$((falhas + 1)); }

printf 'repo     %s\n' "$RAIZ"
printf 'commit   %s%s\n' "$(git -C "$RAIZ" rev-parse --short HEAD)" \
  "$([ -n "$(git -C "$RAIZ" status --porcelain)" ] && echo ' (+ uncommitted changes)')"
printf 'version  %s (manifest.json)\n' "$(node -p "require('$RAIZ/manifest.json').version")"

command -v node >/dev/null && ok "node $(node --version)" || nok 'node not on PATH'

if [ -d "$E2E/node_modules/@playwright/test" ]; then
  ok "playwright $(cd "$E2E" && npx --no-install playwright --version)"
else
  nok "e2e dependencies missing: cd e2e && npm ci"
fi

chromium="$(cd "$E2E" && node -e "const { chromium } = require('@playwright/test'); process.stdout.write(chromium.executablePath())" 2>/dev/null)"
if [ -n "$chromium" ] && [ -x "$chromium" ]; then
  ok "chromium $chromium"
else
  nok "Playwright's Chromium is not downloaded: cd e2e && npm run setup (on Linux also: sudo npx playwright install-deps chromium)"
fi

[ -f "$RAIZ/manifest.json" ] && [ -f "$RAIZ/background.js" ] && ok 'extension root loads (manifest.json + background.js)' || nok 'manifest.json or background.js missing at the repo root'

if [ -d "$E2E/node_modules/@playwright/test" ]; then
  n="$(cd "$E2E" && npx --no-install playwright test --list 2>/dev/null | grep -c '›')"
  [ "$n" -gt 0 ] && ok "$n tests collected" || nok 'playwright test --list collected nothing: run it by hand to see the error'
fi

if (exec 3<>/dev/tcp/127.0.0.1/8766) 2>/dev/null; then
  printf 'note  something listens on 127.0.0.1:8766 (a real Conexão?). The test Chromium never reaches it: the fixture maps that port to the test one (e2e/fakes/porta-da-conexao.js), and the e2e fake answers the extension.\n'
else
  ok '127.0.0.1:8766 free (nothing to confuse with the fake)'
fi

[ "$falhas" -eq 0 ] && echo 'doctor: worth driving' || echo "doctor: $falhas problem(s)"
exit $([ "$falhas" -eq 0 ] && echo 0 || echo 1)
