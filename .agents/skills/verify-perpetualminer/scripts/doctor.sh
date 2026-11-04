#!/usr/bin/env bash
# Read-only: is this checkout ready to be driven through the e2e harness?
# Changes nothing, starts nothing. Exit 0 = worth driving; exit 1 = a line says what is missing.
# Usage: .agents/skills/verify-perpetualminer/scripts/doctor.sh
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

# The fixture loads the repo root as the unpacked extension; a root without its manifest cannot load.
[ -f "$RAIZ/manifest.json" ] && [ -f "$RAIZ/background.js" ] && ok 'extension root loads (manifest.json + background.js)' || nok 'manifest.json or background.js missing at the repo root'

# The suite must be collectable; a syntax error in a spec or fixture shows here, without opening a browser.
if [ -d "$E2E/node_modules/@playwright/test" ]; then
  n="$(cd "$E2E" && npx --no-install playwright test --list 2>/dev/null | grep -c '›')"
  [ "$n" -gt 0 ] && ok "$n tests collected" || nok 'playwright test --list collected nothing: run it by hand to see the error'
fi

# The Anki fake lives in the browser's routing, not on the port, so a real Conexão on 8766 does not
# interfere. Report it so nobody mistakes a live Conexão for the fake.
if (exec 3<>/dev/tcp/127.0.0.1/8766) 2>/dev/null; then
  printf 'note  something listens on 127.0.0.1:8766 (a real Conexão?). The e2e fake answers inside Chromium and never reaches it.\n'
else
  ok '127.0.0.1:8766 free (nothing to confuse with the fake)'
fi

[ "$falhas" -eq 0 ] && echo 'doctor: worth driving' || echo "doctor: $falhas problem(s)"
exit $([ "$falhas" -eq 0 ] && echo 0 || echo 1)
