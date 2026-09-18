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
| `veio/` | Shared Veio identity: `tokens.css` (color/type/radius/motion tokens + the mark's blinking cursor), `componentes.css` + `componentes.js` (the base components, defined once), `fontes/` (packaged Manrope and JetBrains Mono `.woff2`, latin + cyrillic), `icones/` (the toolbar PNGs and the SVG). See `veio/README.md` |
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

### Base components (`veio/componentes.css` + `veio/componentes.js`)

A component exists **once**. A surface that needs a button uses `.veio-botao`; it does not redraw
its own. The three pages load both files right after `tokens.css` / `lib/voz/texto.js`, so a
rebuilt surface starts from the shared classes and `PerpetualMiner.Veio`:

```js
const { abrirModal, mostrarToastDeSucesso, escreverFrase } = PerpetualMiner.Veio;
```

The rules the components encode, so a surface does not have to re-decide them:

- **Danger has two variants:** `--perigo` (outline) is the entry that opens the destructive modal;
  `--perigo-cheio` is only the button that confirms inside it.
- **Modal:** `abrirModal(scrim)` puts the initial focus on the *safe* button (`[data-foco-seguro]`,
  else the first one not painted as danger), traps focus, closes on Esc and on a click outside,
  returns focus to whoever opened it, and marks the rest of the page `inert`.
- **Toast is success-only** and short: it disappears on its own after 2.6 s plus reading time. It
  lives inside `dentroDe` (the page's `body` by default), so it uses that element's theme.
  Every error that asks for an action is `montarAviso(…)` instead — it stays in the place of the
  problem until closed, with the action beside it and the technical cause in a collapsed
  “Detalhes” (V3 of the Voice).
- **Error on a field** is said by `aria-invalid="true"`, not by a class, so the screen reader hears
  it too.
- **The highlighted Word** is drawn by `escreverFrase(no, texto, palavra)`: a `kw-bg` band from 50%
  to 94% of the line, no radius. The phrase text always goes in as text, never as HTML.
- **Copy does not live in the components.** The caller passes the string it already looked up:
  `textoDaVoz('PAI-13.titulo', { n })` — `montarAviso` even refuses to build without the close
  label. The only three words the base writes itself are in `ROTULOS_DO_PADRAO`, because they are
  no screen's state and so have no ID: `palavra:` and `auto:` (fixed by the glossary) and
  `Detalhes` (the name rule V3 of the Voice gives the collapsed cause).

The legacy surfaces still carry their own CSS; each redesign step moves the surface it rebuilds
onto these classes. Loading the files everywhere now is deliberate — the classes are prefixed
`veio-`, so nothing collides with what is already there.

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
- `e2e/vitrine/`: the Veio showcase — tokens, type scale, radii, a Russian phrase and **every base component**, in both themes and in the states each component actually has (button and field: focus and disabled, plus error on the field; a badge only has normal). `componentes-da-vitrine.js` builds the gallery once per theme with the same function, so the two columns never diverge; its sample copy comes from the Voice catalog by ID (`CATALOGO_DA_VITRINE`), and anything that is showcase scaffolding is marked `data-vitrine-chrome`. The fixture server also serves `/veio/…` and `/lib/…` from the extension root, so the showcase loads the same tokens, fonts, components and catalog the extension pages load. After the owner's review it is **the visual reference**.
- `HEADED=1 npm test` shows the browser.
- Tests assert what the person sees and what ends up stored, never internal functions. Three narrow exceptions, each named in the test's own comment:
  - Where Chromium gives Playwright no way to drive the native UI (the context menu), a test calls the function Chrome would call (`minerarSelecaoDoMenu`, `registrarMenuDeContexto`) and asserts what gets stored or what is handed to Chrome.
  - Until a surface shows a catalog state, the catalog's own guarantees (every ID present, pt-BR numbers) are asserted through `PerpetualMiner.textoDaVoz`, inside an extension page. These move to the screen when the surface is rebuilt.
  - Two guarantees of the base components have no on-screen trigger of their own, so the test calls the component's own function and still asserts the visible result: how long a toast of a given length *stays on screen* (`mostrarToastDeSucesso`), and that a phrase carrying markup is written as text (`escreverFrase`). The surfaces that call them assert the same thing through the screen once they are rebuilt.

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
- `painel.html`, `bookreader.html`, `veio/tokens.css` and `veio/fontes/*.woff2` declared as `web_accessible_resources`. The tokens and the fonts are exposed so the in-page overlay can load them inside its Shadow DOM; `content.js` does not read them yet — that lands with the overlay rebuild
