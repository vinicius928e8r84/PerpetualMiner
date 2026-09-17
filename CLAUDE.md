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
| `tombstone.js` | Tombstone of a deleted phrase (`chrome.storage.sync` keys and the Firestore `meta/deleted` PATCH), shared by `background.js` (`importScripts`) and `painel.html` |
| `popup.html/js/css` | Quick-access popup showing last 5 phrases |
| `painel.html/js/css` | Full dashboard to view, copy, and delete all saved phrases; Google login and Firestore sync |
| `bookreader.html/js/css` | BookReader page: upload a book photo → Gemini Vision extracts marked passages |
| `veio/` | Shared Veio identity: `tokens.css` (color/type/radius/motion tokens + the mark's blinking cursor), `fontes/` (packaged Manrope and JetBrains Mono `.woff2`, latin + cyrillic), `icones/` (the toolbar PNGs and the SVG). See `veio/README.md` |
| `lib/voz/catalogo.js` | The Voice catalog as data: the 159 approved copy states from `docs/design/voz/` |
| `lib/voz/texto.js` | `textoDaVoz(id, valores)` — looks a state up by ID and fills its templates |
| `lib/idioma.js` | `detectarIdioma(texto)` — the single language detector (Cyrillic → Russo, else Inglês) |
| `lib/firebase/` | Firebase compat SDK bundles (app, auth, firestore) — loaded only by painel.html |
| `test_gemini.js` | Standalone Node.js script to list available Gemini models (not part of the extension) |
| `e2e/` | Playwright suite that runs the unpacked extension in Chromium (own `package.json`; see Testing) |
| `preview/` | The static site Vercel publishes per branch, so a visual change can be looked at in a browser: `montar.mjs` assembles it, `chrome-simulado.js` fakes `chrome.*` with sample data inside the copied pages. See `preview/README.md` |

### Data Flow

```
1. Streaming subtitles
   Video page → content.js (Alt+S) → background.js → chrome.storage.local["frases"]
                                                     └→ Firestore (if logged in)

2. Selected text (any page/PDF)
   User right-clicks → context menu "Minerar com PerpetualMiner" (MIN-08, from the catalog)
   → background.js (contextMenus listener) → chrome.storage.local["frases"]
                                           └→ Firestore (if logged in)

3. Physical book photos
   bookreader.html → user uploads photo → Gemini Vision API (gemini-3-flash-preview)
   → parsed passages → chrome.storage.local["frases"]
                     └→ Firestore (if logged in)
```

### Shared base (`lib/`)

`lib/voz/catalogo.js`, `lib/voz/texto.js` and `lib/idioma.js` are plain scripts (no build) that
every surface loads before its own script: the three pages via `<script src>`, the service worker
via `importScripts`, and the content script via the `js` array in `manifest.json`. They attach to
the `PerpetualMiner` global, so each consumer starts with
`const { detectarIdioma } = PerpetualMiner;`.

Code that compares a language uses `PerpetualMiner.IDIOMAS` (`IDIOMAS.RUSSO`, `IDIOMAS.INGLES`),
not a loose `'Russo'`/`'Inglês'` string.

**New or rewritten copy comes from the catalog, never from a literal.** The surfaces still hold
their old literals; each redesign step moves the surface it rebuilds (today only the context menu
reads from the catalog). `textoDaVoz('MIN-08')` returns the approved
string for that state; `textoDaVoz('PAI-12.titulo')` reaches a part of a state that has several
(modal title, body, buttons). Templates:

- `{nome}` — substituted. A `number` is formatted pt-BR (`1284` → `1.284`); a string goes in as is.
- `{n|singular|plural}` — picks by the value of `n` (`|n| === 1` → singular).

The function is named `textoDaVoz`, not `texto`, because `texto` is the phrase text all over the
codebase and a global by that name would be shadowed inside almost every function.

An unknown ID, a part that does not exist and a missing template value all throw right away, so a
state never renders as an empty string by accident. Only the entries the catalog marks as deliberate
silence (`POP-01`, `POP-05`, `PAI-16`…) are `''`.

Money (`BRG-03`, `BRG-26`) takes an already-formatted `{valor}`: how many decimals to show is an
Advanced preference that belongs to the panel, not to the catalog.

The content script loads the whole catalog into every frame even though it only needs
`detectarIdioma` today. That is deliberate: the overlay step rebuilds its feedback component from
`MIN-01`…`MIN-11`, and the design spec has the content script reading its copy from the catalog like
every other surface.

### Firebase / Firestore Sync

Phrases are synced to Firestore under `usuarios/{uid}/frases/{frase.id}` when the user is logged in. Both `background.js` and `painel.js` use the **Firestore REST API directly** (no SDK) to avoid CSP violations in MV3.

Authentication uses `chrome.identity.launchWebAuthFlow` (OAuth2 with Google) — **no Firebase Auth SDK**. Tokens are stored in `chrome.storage.local` under `pm_firebase_auth` and refreshed automatically via the Firebase token endpoint.

Pending sync queue: if a Firestore write fails (offline/error), the phrase `id` is added to `pm_pending_sync` in local storage and retried on next panel load.

Deleting (panel or popup) writes a tombstone so the next panel sync doesn't bring the phrase back from the cloud or from another computer: `pm_del_{id}` in `chrome.storage.sync`, the id in local `pm_deleted_ids` (retry of the Firestore DELETE), and, when logged in, the field ``ids.`{id}` `` in `usuarios/{uid}/meta/deleted`. The popup asks the service worker to delete (`APAGAR_FRASES`); the panel does it itself (`removerFrasesFirestore`, `apagarTudoFirestore`). Both build the tombstone with `tombstone.js`: a phrase id starts with a digit, so its field path must be backquoted, and Firestore (and the e2e fake) rejects the bare `ids.{id}`.

### Storage Schema

Each entry in `chrome.storage.local["frases"]` (unlimited, newest first):
```js
{
  texto:     string,
  data:      string,          // "dd/mm/yyyy" (pt-BR locale)
  streaming: string,          // platform name, 'web', 'pdf', or 'livro'
  id:        number,          // max(Date.now(), highest stored id + 1), assigned inside naFilaDeGravacao
  idioma:    string,          // 'Inglês' or 'Russo' (lib/idioma.js: Cyrillic → Russo, else Inglês)
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

`content.js` never uses `window.postMessage()`: the page shares the window with the content script and sees messages between frames, so it could forge them (inject phrases, overwrite the clipboard). Each frame saves its own phrase with `SALVAR_HISTORICO`. When the clipboard write fails inside an iframe (e.g. a cross-origin player without `clipboard-write`), the frame sends `COPIAR_NO_FRAME_DE_CIMA` to the service worker, which checks the sender and the text and relays `COPIAR_PARA_CLIPBOARD` to the tab's top frame only (`frameId: 0`). Web pages cannot reach `chrome.runtime` messaging.

The capture shortcuts and the floating button only react to trusted events (`event.isTrusted`), so a page cannot mine by dispatching a synthetic keydown or click.

### Write Serialization (background.js)

Every read-modify-write of `frases`, `pm_pending_sync` and `pm_deleted_ids` in the service worker goes through `naFilaDeGravacao`, so concurrent saves (e.g. BookReader saving many passages at once) never overwrite each other. Deleting from the popup goes through it too. Phrase ids are assigned inside that queue and are unique even within the same millisecond.

Not covered by the queue:
- The auto-miner duplicate check reads `frases` outside the queue before calling `salvarFrase`, so two identical auto candidates arriving together can both be saved (a duplicate, never a lost phrase).
- `painel.js` rewrites `frases` (and `pm_deleted_ids`) directly, outside the service worker, so editing or deleting in the panel during a photo save can still lose phrases.

### Toolbar Badge (background.js)

The badge on the extension icon is the auto-miner's counter for today (`MIN-09`): the **sum of the enabled languages only**, in the Veio colors (`#F5B83D` on `#1A1204`). Both languages off → no badge at all, and the tooltip goes back to the extension's name. Tooltip otherwise: “Mineração automática: N hoje”, or “…: limite de hoje atingido” when every enabled language has hit its own `dailyLimit` (one language at its limit and another below still shows the counter).

Storage is what drives it, not the caller: the service worker watches `pm_auto_miner_settings` and `pm_auto_miner_daily` through `chrome.storage.onChanged`, so toggling a language in the popup and each automatic mining both land on the same path (`atualizarBadgeDaToolbar`).

The two colors are the only ones written outside `veio/tokens.css` — `chrome.action` takes a color, not CSS — and that exception is registered in `veio/README.md`. They travel as a pair: `setBadgeTextColor` needs Chrome 110+, so `manifest.json` declares `minimum_chrome_version: 110` rather than letting the text color fall back and lose the 10.4:1 contrast.

The day rollover writes nothing on its own — `getAutoMinerState` already returns zeroed counts once the stored `date` isn't today's — so a repeating `chrome.alarms` alarm (`pm-virada-do-dia`, every 24 h, first firing just after midnight) asks for the badge again. The service worker also refreshes the badge whenever it wakes, since the badge sitting in the toolbar may be yesterday's.

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
- `e2e/pages/`: local fixture pages where the content script is injected: `player.html` (fake player with a caption), `texto.html` (plain text to select), `sem-video.html`, `player-em-iframe.html?player=<url>` (embeds the player from another origin, e.g. `paginas.urlCruzada('player.html')`), `hostil.html` + `hostil-filho.html` (a page that tries to drive the extension by itself), and `player-marcacao.html` / `texto-marcacao.html` (caption, title and selectable text carrying markup as text, to prove the content script always inserts page text as text, never as HTML).
- `e2e/vitrine/vitrine.html`: the Veio showcase (tokens, type scale, radii and a Russian phrase, in both themes). The fixture server also serves `/veio/…` from the extension root, so the showcase loads the same tokens and the same packaged fonts the extension pages load.
- `HEADED=1 npm test` shows the browser.
- Tests assert what the person sees and what ends up stored, never internal functions. Two narrow exceptions, each named in the test's own comment:
  - Where Chromium gives Playwright no way to drive the native UI (the context menu, the toolbar badge), a test calls the function Chrome would call (`minerarSelecaoDoMenu`, `registrarMenuDeContexto`, `handleAutoMinerCandidate`) and asserts what gets stored or what is handed to Chrome (`chrome.action.getBadgeText`, `getTitle`).
  - Until a surface shows a catalog state, the catalog's own guarantees (every ID present, pt-BR numbers) are asserted through `PerpetualMiner.textoDaVoz`, inside an extension page. These move to the screen when the surface is rebuilt.

The legacy tests keep running: `node test_sync.js`, `node test_bridge_panel.js`, `node test_auto_keyword.js`, `python test_panel_russian_style.py` and the bridge tests in `bridge/test_*.py`.

## Key Constants

- `ATALHO_TECLA = 'KeyS'` in `content.js` — keyboard shortcut is **Alt+S**
- `COR_ICONE = '#00ff88'` in `content.js` — UI highlight color
- `SENTINEL_VAZIO = 'NENHUM_TRECHO'` in `bookreader.js` — returned by Gemini when no marked passages found
- `FIREBASE_PROJECT = 'perpetualminer-4c219'` in `background.js`
- `BADGE_COR_DE_FUNDO = '#F5B83D'` / `BADGE_COR_DO_TEXTO = '#1A1204'` in `background.js` — the toolbar badge's Veio colors
- `ALARME_VIRADA_DO_DIA = 'pm-virada-do-dia'` in `background.js` — the alarm that resets the badge at midnight
- Firestore path pattern: `usuarios/{uid}/frases/{frase.id}`

## Permissions

- `alarms`, `storage`, `unlimitedStorage`, `activeTab`, `tabs`, `contextMenus`, `identity` (`alarms` is the toolbar badge's day rollover)
- `host_permissions`: Gemini API, Firestore, Google OAuth, Firebase token endpoints
- Content scripts inject into all URLs with `all_frames: true`
- `painel.html`, `bookreader.html`, `veio/tokens.css` and `veio/fontes/*.woff2` declared as `web_accessible_resources`. The tokens and the fonts are exposed so the in-page overlay can load them inside its Shadow DOM; `content.js` does not read them yet — that lands with the overlay rebuild
