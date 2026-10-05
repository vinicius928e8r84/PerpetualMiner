#!/usr/bin/env bash
# CI ratchet for the feature map (SKILL.md § Keeping the feature map honest). A PR that changes a user-facing surface
# must touch .agents/skills/verify-perpetualminer/features/ or say "feature map unchanged" in its body.
# Usage: PR_BODY="<body>" mapa-de-features.sh <base-ref>        e.g. origin/main
# Exit 0 = fine, 1 = a surface changed and neither happened, 2 = usage.
# Surfaces: manifest.json, popup.html/js, painel*.html/js, bookreader.html/js, overlay.js, content.js, background.js,
# bridge/server.py (the files whose change a person can see or press).
set -u
[ $# -eq 1 ] || { echo 'usage: PR_BODY=... mapa-de-features.sh <base-ref>' >&2; exit 2; }
git rev-parse --verify --quiet "$1^{commit}" >/dev/null || { echo "base ref '$1' not found" >&2; exit 2; }
alterados="$(git diff --name-only "$1"...HEAD)" || exit 2
superficies="$(printf '%s\n' "$alterados" | grep -E '^(manifest\.json|popup\.(html|js)|painel[^/]*\.(html|js)|bookreader\.(html|js)|overlay\.js|content\.js|background\.js|bridge/server\.py)$')"
[ -n "$superficies" ] || { echo "feature map: no user-facing surface changed"; exit 0; }
if printf '%s\n' "$alterados" | grep -q '^\.agents/skills/verify-perpetualminer/features/'; then
  echo "feature map: surfaces changed and features/ was updated"; exit 0
fi
if printf '%s' "${PR_BODY:-}" | grep -qi 'feature map unchanged'; then
  echo "feature map: surfaces changed; the PR body declares the feature map unchanged"; exit 0
fi
{
  echo "feature map: this PR changes user-facing files:"
  printf '  %s\n' $superficies
  echo "Update the matching file in .agents/skills/verify-perpetualminer/features/ (new sub-feature, driving step, proof),"
  echo 'or write "feature map unchanged" in the PR body (then re-run this check: edit the body, which re-triggers it).'
} >&2
exit 1
