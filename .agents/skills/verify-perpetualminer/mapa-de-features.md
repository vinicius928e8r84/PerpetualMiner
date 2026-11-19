# Keeping the feature map honest

Part of [`SKILL.md`](./SKILL.md). Read it when a PR changes a user-facing feature or command.

`features/` is the maintained record of what can be verified and how. **Any PR that changes a user-facing feature or command updates its file in `features/` (add the sub-feature ID, the driving step, the proof), or says "feature map unchanged" in the PR body.** User-facing means anything a person sees or presses: panel areas and addresses, popup, overlay, shortcuts, onboarding steps, Anki send/connection screens, photo mining, Conexão routes the panel calls. CI enforces it: the `Regras` workflow runs `scripts/mapa-de-features.sh` on every PR and fails when `manifest.json`, any `*.html` in the repo root, `popup.js`, `painel/*.js`, `bookreader/bookreader.js`, `overlay.js`, `content.js`, `background.js`, `complemento/servidor.py` or `lib/voz/catalogo.js` changed and neither `features/` was touched nor the PR body says "feature map unchanged" (editing the body re-runs the check). A change that is not in that file list (another `lib/` module, a `popup.css` rule) is still covered by the rule above, by review. For a periodic audit use `/maintain-verification-skill`.

## Limits

- The upkeep ratchet is path-based: it cannot tell a user-visible change in a file outside its list (a `lib/` module, `popup.css`) from a refactor, and a PR that only declares "feature map unchanged" is trusted. It lives in the `Regras` workflow as a step, not as a rule in `scripts/regras/` (those scan file contents against a baseline; this one reads the PR's diff and body).
