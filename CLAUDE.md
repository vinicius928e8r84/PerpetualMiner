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

### Storage Schema

Each entry in `chrome.storage.local["frases"]` (unlimited, newest first):
```js
{
  texto:     string,
  data:      string,          // "dd/mm/yyyy" (pt-BR locale)
  streaming: string,          // platform name, 'web', 'pdf', or 'livro'
  id:        number,          // Date.now()
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

### Platform-Specific Subtitle Selectors (content.js)

- **Netflix**: `.player-timedtext-text-container`
- **YouTube**: `.ytp-caption-segment`
- **Amazon Prime**: `.atvwebplayersdk-captions-text` (with extra filtering for non-Latin chars and UI strings)
- **Generic**: `.jw-text-track-cue`, `.vjs-text-track-cue`

### Cross-Frame Communication

`content.js` uses `window.postMessage()` to handle clipboard writes across iframes (avoids cross-origin restrictions). It listens for `COPIAR_PARA_CLIPBOARD` and `COPIAR_E_SALVAR` events and falls back to the parent frame when clipboard access fails.

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
