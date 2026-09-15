# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PerpetualMiner** (v5.0) is a Chrome browser extension (Manifest V3) that captures text from multiple sources — streaming subtitles, selected text on any page, and physical book photos — into a study history. No build step required — pure vanilla JavaScript.

## Loading the Extension

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory
4. After any code change, click the reload icon on the extension card in `chrome://extensions/`

## Architecture

### Files

| File | Role |
|------|------|
| `manifest.json` | Permissions, content script registration |
| `content.js` | Injected into all pages; mines subtitles, injects floating button |
| `background.js` | Service worker; handles `SALVAR_HISTORICO` messages and context menu clicks; writes to `chrome.storage.local` and syncs to Firestore |
| `popup.html/js/css` | Quick-access popup showing last 5 phrases |
| `painel.html/js/css` | Full dashboard to view, copy, and delete all saved phrases; Google login and Firestore sync |
| `bookreader.html/js/css` | BookReader page: upload a book photo → Gemini Vision extracts marked passages |
| `lib/firebase/` | Firebase compat SDK bundles (app, auth, firestore) — loaded only by painel.html |
| `test_gemini.js` | Standalone Node.js script to list available Gemini models (not part of the extension) |
| `e2e/` | Playwright suite that runs the unpacked extension in Chromium (own `package.json`; see Testing) |

### Data Flow

```
1. Streaming subtitles
   Video page → content.js (Alt+S) → background.js → chrome.storage.local["frases"]
                                                     └→ Firestore (if logged in)

2. Selected text (any page/PDF)
   User right-clicks → context menu "Enviar para o PerpetualMiner"
   → background.js (contextMenus listener) → chrome.storage.local["frases"]
                                           └→ Firestore (if logged in)

3. Physical book photos
   bookreader.html → user uploads photo → Gemini Vision API (gemini-3-flash-preview)
   → parsed passages → chrome.storage.local["frases"]
                     └→ Firestore (if logged in)
```

### Firebase / Firestore Sync

Phrases are synced to Firestore under `usuarios/{uid}/frases/{frase.id}` when the user is logged in. Both `background.js` and `painel.js` use the **Firestore REST API directly** (no SDK) to avoid CSP violations in MV3.

Authentication uses `chrome.identity.launchWebAuthFlow` (OAuth2 with Google) — **no Firebase Auth SDK**. Tokens are stored in `chrome.storage.local` under `pm_firebase_auth` and refreshed automatically via the Firebase token endpoint.

Pending sync queue: if a Firestore write fails (offline/error), the phrase `id` is added to `pm_pending_sync` in local storage and retried on next panel load.

Deleting (panel or popup) writes a tombstone so the next panel sync doesn't bring the phrase back from the cloud or from another computer: `pm_del_{id}` in `chrome.storage.sync`, the id in local `pm_deleted_ids` (retry of the Firestore DELETE), and, when logged in, the field ``ids.`{id}` `` in `usuarios/{uid}/meta/deleted`. The popup asks the service worker to delete (`APAGAR_FRASES`); the panel does it itself (`removerFrasesFirestore`), but writes the unquoted path `ids.{id}`, which Firestore rejects because a simple field name can't start with a digit — the e2e Firestore fake enforces that rule. "Apagar tudo" (`apagarTudoFirestore`) awaits that write, so it never reaches the cloud DELETE.

### Storage Schema

Each entry in `chrome.storage.local["frases"]` (unlimited, newest first):
```js
{
  texto:     string,
  data:      string,          // "dd/mm/yyyy" (pt-BR locale)
  streaming: string,          // platform name, 'web', 'pdf', or 'livro'
  id:        number,          // max(Date.now(), highest stored id + 1), assigned inside naFilaDeGravacao
  idioma:    string,          // 'Inglês' or 'Russo' (detected by Cyrillic check)
  contexto?: {                // optional; added for web/pdf/book sources
    fonte:   string,
    titulo:  string,
    detalhe: string,
  }
}
```

Other storage keys:
- `geminiApiKey`, `bookTitleDefault` — BookReader settings
- `pm_firebase_auth` — `{ uid, idToken, refreshToken, expiresAt }` — Firebase auth session
- `pm_user_info` — `{ uid, email, displayName, photoURL }` — Google user profile
- `pm_pending_sync` — `string[]` of phrase IDs awaiting Firestore retry
- `pm_deleted_ids` — `string[]` of deleted phrase IDs whose Firestore DELETE hasn't succeeded yet

### Platform-Specific Subtitle Selectors (content.js)

- **Netflix**: `.player-timedtext-text-container`
- **YouTube**: `.ytp-caption-segment`
- **Amazon Prime**: `.atvwebplayersdk-captions-text` (with extra filtering for non-Latin chars and UI strings)
- **Generic**: `.jw-text-track-cue`, `.vjs-text-track-cue`

### Cross-Frame Communication

`content.js` uses `window.postMessage()` to handle clipboard writes across iframes (avoids cross-origin restrictions). It listens for `COPIAR_PARA_CLIPBOARD` and `COPIAR_E_SALVAR` events and falls back to the parent frame when clipboard access fails.

### Write Serialization (background.js)

Every read-modify-write of `frases`, `pm_pending_sync` and `pm_deleted_ids` in the service worker goes through `naFilaDeGravacao`, so concurrent saves (e.g. BookReader saving many passages at once) never overwrite each other. Deleting from the popup goes through it too. Phrase ids are assigned inside that queue and are unique even within the same millisecond.

Not covered by the queue:
- The auto-miner duplicate check reads `frases` outside the queue before calling `salvarFrase`, so two identical auto candidates arriving together can both be saved (a duplicate, never a lost phrase).
- `painel.js` rewrites `frases` (and `pm_deleted_ids`) directly, outside the service worker, so editing or deleting in the panel during a photo save can still lose phrases.

## Testing

The extension is tested for real in Chromium via Playwright, from `e2e/` (its own `package.json`, so the unpacked root stays free of Node files):

```bash
cd e2e
npm ci           # once
npm run setup    # once: downloads Playwright's Chromium
npm test         # launches Chromium with the unpacked extension and runs the suite
```

On Linux/WSL, Chromium also needs system libraries (NSS, ALSA…): `sudo npx playwright install-deps chromium`, once.

- `e2e/fixtures.js` launches a fresh Chromium profile per test with the repo root loaded as an unpacked extension, fakes the network at the HTTP boundary and blocks every other external request. It gives tests `extensao` (id, service worker, `url()`, `lerStorage`/`gravarStorage`, `frases()`, `semearSessao()`), `fakes` and `paginas`.
- `e2e/fakes/`: the Anki connection (`127.0.0.1:8766`), Gemini, and Firestore/Google (in-memory documents, token refresh). `semearSessao()` writes an account session to storage, skipping the real login.
- `e2e/pages/`: local fixture pages where the content script is injected: `player.html` (fake player with a caption), `texto.html` (plain text to select), `sem-video.html`.
- `HEADED=1 npm test` shows the browser.
- Tests assert what the person sees and what ends up stored, never internal functions.

The legacy tests keep running: `node test_sync.js`, `node test_bridge_panel.js`, `node test_auto_keyword.js`, `python test_panel_russian_style.py` and the bridge tests in `bridge/test_*.py`.

## Key Constants

- `ATALHO_TECLA = 'KeyS'` in `content.js` — keyboard shortcut is **Alt+S**
- `COR_ICONE = '#00ff88'` in `content.js` — UI highlight color
- `SENTINEL_VAZIO = 'NENHUM_TRECHO'` in `bookreader.js` — returned by Gemini when no marked passages found
- `FIREBASE_PROJECT = 'perpetualminer-4c219'` in `background.js`
- Firestore path pattern: `usuarios/{uid}/frases/{frase.id}`

## Permissions

- `storage`, `unlimitedStorage`, `activeTab`, `tabs`, `contextMenus`, `identity`
- `host_permissions`: Gemini API, Firestore, Google OAuth, Firebase token endpoints
- Content scripts inject into all URLs with `all_frames: true`
- `painel.html` and `bookreader.html` declared as `web_accessible_resources`
