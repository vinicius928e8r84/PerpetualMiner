# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PerpetualMiner** is a Chrome browser extension (Manifest V3) that captures text from multiple sources — streaming subtitles, selected text on any page, and physical book photos — into a study history. No build step required — pure vanilla JavaScript.

## Loading the Extension

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory
4. After any code change, click the reload icon on the extension card in `chrome://extensions/`

## Architecture

### Files

The role of every file is in `docs/arquivos/` (read on demand): `extensao.md` for the extension and `testes-e-ferramentas.md` for the tests, `scripts/`, the add-on, the CI and the preview. A new file gets its row there.

### Data Flow

```
1. Streaming subtitles
   Video page → content.js (recorded caption shortcut, default Alt+S)
   → Mineracao.gravar → SALVAR_HISTORICO

2. Selected text (any page/PDF)
   Recorded selection shortcut → content.js → Mineracao.gravar → SALVAR_HISTORICO
   User right-clicks → context menu "Minerar com PerpetualMiner" (MIN-08, from the catalog)
   → background.js (contextMenus listener) → salvarFrase

3. Physical book photos
   bookreader.html → user uploads photo → Gemini Vision API (gemini-3-flash-preview)
   → parsed passages → Mineracao.gravar → SALVAR_HISTORICO

SALVAR_HISTORICO → background.js → salvarFrase → chrome.storage.local["frases"]
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

**New or rewritten copy comes from the catalog, never from a literal.** Legacy surfaces still hold
some literals; each redesign step moves the surface it rebuilds. `textoDaVoz('MIN-08')` returns the approved
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

The content script loads the whole catalog into every frame: the overlay reads its copy from it
(`MIN-01`…`MIN-10`, and `PAI-29.web` for the selection's meta) like every other surface.

### Panel shell (`painel-shell.js`)

`painel.html` is one page with three areas (plus the Boas-vindas, `#boas-vindas`, which hides the whole shell); the shell (`docs/design/painel/shell/`, variant B) only swaps the view, so
nothing reloads when switching areas — filters, page, selection, sync and the Envio tracking in `painel-envio.js` stay as
they are. Addresses: `#frases` (default, and anything unknown), `#anki/custos|baralhos|vocabulario|ajustes`
(`#anki` alone opens Custos; the sidebar link reopens the last tab seen), `#configuracoes[/conta|atalhos|ia|chave|anki|aparencia|perigo]`
(opens the card, scrolls to it and flashes its border; bare `#configuracoes` shows every card closed). The Anki tabs are the Veio segmented control; picking one sets the hash,
so the browser's back button walks through areas and tabs.

The shell owns the sidebar and `painel.js` reports to it through `PerpetualMiner.Shell`:
`mostrarTotalDeFrases(n)`, `aoEntrarNaArea(area, fn)` (the Anki area refreshes on entry), `areaAtual()`, `AREAS_DO_PAINEL` (the areas with the sidebar). The shell starts the 15 s `/health` checks and uses `ConexaoNaTela` for the sidebar indicator and the F1 retry at the top of the Anki area. Edge cases: [shell](docs/design/painel/shell/README.md#casos-de-borda); the common retry: [Boas-vindas § F1](docs/design/painel/boas-vindas/README.md#conexão-com-o-anki-como-ligar-f1). Others listen to `ConexaoAnki` directly.

The shell's fixed copy comes from the catalog through `data-voz`, `data-voz-aria` and `data-voz-title` attributes in
`painel.html`, which `painel-shell.js` fills on load. The sidebar and the content island are both the height of the window
and start and end together; the content scrolls inside its island (entering an area scrolls it back to the top). Below 1000 px the sidebar becomes a 76 px rail: labels leave
the screen but stay as the links' names (visually hidden, not `display: none`) and become tooltips.

Configurações is the “summary first” variant C (`docs/design/painel/configuracoes/`): each of the seven cards (one per
`#configuracoes/<seção>` address above) is one closed row — icon tile, title, a summary of its state, chevron — and
opens in place; several can be open at once. The whole row toggles, and the title's `<button aria-expanded>` inside the
`<h2>` is the control for the keyboard and the screen reader. The cards live in a size container: below ~560 px of
content the summary leaves the row and the body loses its 62 px indent. Aparência holds the theme selector
(CFG-29…31), a segmented control whose choice `veio/tema.js` stores and every open page follows through
`chrome.storage.onChanged`, with no reload and no toast. The closed-row summaries of Atalhos,
Chave do Gemini and Zona de perigo (CFG-28) are drawn by the shell from what is already stored: both recorded
shortcuts relabelled in PT-BR (`lib/atalhos.js`), `geminiApiKey` masked to its first and last 4 characters (or “Sem chave” in
`danger`), and the phrase total (“1.284 frases”, “Nenhuma frase”); they follow `chrome.storage.onChanged`.
`#configuracoes/<seção>` also tells whoever asked through `Shell.aoAbrirASecao(secao, fn)`, with the card already open.

### Surfaces: one skill each

The architecture of each surface lives in a project skill, not here. **Open the skill when your change touches that surface, and when you review a diff that does** (`CODING_STANDARDS.md` says so too).

- Boas-vindas and Configuração pela metade: `.claude/skills/boas-vindas/SKILL.md`
- Configurações: `.claude/skills/configuracoes/SKILL.md`
- Popup (Cockpit): `.claude/skills/popup/SKILL.md`
- Frases list and Minerar frases: `.claude/skills/painel-frases/SKILL.md`
- Conexão com o Anki area: `.claude/skills/painel-anki/SKILL.md`
- Minerar de uma foto: `.claude/skills/minerar-foto/SKILL.md`
- Veio base components: `.claude/skills/veio-componentes/SKILL.md`
- Overlay: `.claude/skills/overlay/SKILL.md`
- e2e fixtures, fakes, test pages and visual references: `.claude/skills/e2e-suite/SKILL.md` (see Testing below)

### Firebase / Firestore Sync

Phrases are synced to Firestore under `usuarios/{uid}/frases/{frase.id}` when the user is logged in. `lib/sincronizacao.js` owns the shared session implementation, Firestore codec and merge logic, using the **Firestore REST API directly** (no SDK: MV3 CSP). The panel loads it before `painel.js`; the service worker, with `importScripts`. For the `nuvem` seam and the sync API, read the module's doc comments.

Authentication in `painel.js` uses `chrome.identity.launchWebAuthFlow` (OAuth2 with Google) — **no Firebase Auth SDK**. Stored credentials are described under Firebase auth session in Storage Schema; see `criarSessao`'s doc comment for token renewal and revocation.

A capture is saved locally, then sent by `salvarFrase` / `sincronizarComFirestore` in `background.js`; a failed upload leaves no record. There is no retry queue: `carregar` in `lib/sincronizacao.js` uploads the local phrases the cloud lacks.

`criarSincronizacao` owns deletion, tombstones and a pending Apagar tudo; the panel clears its visible/local history and delegates cloud work to the module, while the popup does not delete. For tombstone storage and the offline wipe's account/cutoff rules, read the module's doc comments. The Firestore field-path escaping requirement is documented at `tombstoneFirestore`.

The OpenAI key follows the account (#154): the versioned Conexão owner replicates `usuarios/{uid}/segredos/openai` (`{ chave, em }`, empty value for deletion). The extension sends transient UID/token requests on opening/login/visibility/key changes and reads only the owner's public summary. Invariants, legacy migration, ordering limits and P6 owner rule-publication gate: `docs/seguranca/chave-da-openai.md`.

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
- `ankiBridgePresets` — the Ajustes de envio: `{ en, ru }`, each `{ deckName, imageSource: '1' (Foto real) | '2' (Gerada por IA), nivel: 'iniciante' | 'intermediario' | 'avancado', ttsWordTld, ttsPhraseTld, versao }`; written only by Salvar ajustes (`lib/ajustes-de-envio.js`), a missing or blank field reads as the language's default
- `geminiApiKey` — the Gemini key, written only by Configurações › Chave do Gemini and read by Minerar de uma foto
- `pm_chave_openai` — public cache `{ ultimos4, conta, versao, naoEnviada }` read from the Conexão, written by `lib/chave-da-openai.js`. The only local whole key is in the Conexão's owner; with an account it replicates to Firestore (#154). The extension's old `pm-segredos` store is cleared during exact-proof migration/wipe; `pm_chave_openai_versao` and every client generation/per-UID secret/removal record are gone.
- `bookTitleDefault` — the Livro (Título) last typed in Minerar de uma foto, filled back on the next visit
- `pm_tema` — `'escuro'` (the default, and what an absent key means) or `'claro'`: the theme chosen on this computer. It is local on purpose and never syncs. `veio/tema.js` mirrors it into `localStorage` under the same name, which is read before the first paint so a light page never flashes dark; `chrome.storage` stays the truth and corrects the mirror
- Firebase auth session — `{ uid, idToken, refreshToken, expiresAt }` in extension-origin IndexedDB `pm-sessao` › `sessao` › `firebase`, outside the content scripts' reach. `pm_firebase_auth` in `chrome.storage.local` is legacy only: migrated and removed by the service worker/panel
- `pm_user_info` — `{ uid, email, displayName, photoURL }` — Google user profile
- `pm_pending_sync` — gone (old versions wrote phrase IDs nobody read); `aoInstalar` removes it
- `pm_deleted_ids` — `string[]` of deleted phrase IDs whose Firestore DELETE hasn't succeeded yet
- `pm_atalho_legenda` — the “Minerar legenda” shortcut. Absent → the default Alt+S; `null` → no caption shortcut
- `pm_atalho` — the “Minerar seleção” shortcut; `null` or absent → none (the default). Both use `{ type: 'keyboard'|'mouse', code, button, altKey, ctrlKey, shiftKey, label }`
- `pm_apagar_tudo` — pending Apagar tudo; shape, account matching and cutoff are documented in `lib/sincronizacao.js`
- `pm_anki_ja_conectou` — stored first-success fact; `lib/conexao-anki.js` owns its lifecycle
- `pm_auto_keyword_vocab_en` / `pm_auto_keyword_vocab_ru` — the last vocabulary reading the Mineração automática uses `{ cacheVersion, deckName, createdAt, source, dadosDe, ankiFechado, words, terms, wordInfo, termInfo }`; no expiry, owned by `lib/vocabulario-da-mineracao.js` (the popup says its age with the Conexão off)
- `pm_anki_custos` — `{ quando, periodo, de, ate, envios }`, the last Custos reading (the `/analytics/jobs` rows), shown with BRG-12 while the Conexão is off
- `pm_anki_baralhos` — `{ quando, dadosDe, ankiFechado, nomes, dados }`, the last `POST /anki/stats/decks`; `pm_anki_vocabulario` — `{ quando, dadosDe, ankiFechado, nomes, dados: { en, ru } }` (each `{ deckName, itens, total, source }`), the last vocabulary. Both show with BRG-12 while the Conexão is off
- `pm_anki_quatro_casas` / `pm_anki_ids_dos_envios` — the Avançado switches “Mostrar custos com 4 casas” and “Mostrar IDs dos envios” (local on purpose: remembered on this computer)
- `pm_boas_vindas` — `{ agoraNao: string[], concluida: boolean, lembreteOculto?: true }`: written by the install; the steps the person answered “Agora não” to, whether they reached Abrir painel in the Boas-vindas and whether they hid the “Configuração pela metade” reminder; everything else about a step is read from its real state. Absent (an update, not an install) → no reminder
- `pm_abridor` — `{ agoraNao: boolean }`: the answer to step 3 of the first connection, Abrir o Anki sozinho (#147). `true` after Agora não; `false` once the extension finds the optional `nativeMessaging` granted (the permission itself is Chrome's, not stored here). Absent → never answered. Written only by `lib/abridor.js`
- `pm_envio` — `{ envios: [{ id, lang, ids, baralho, jobId, criadoEm, falhaAoCriar, corpo }], apagarFrases?: true }` (`id`: a `crypto.randomUUID()`, the card's key and `jobId`; `corpo`: the `POST /jobs` body, saved before the first request, resent unchanged until answered; `apagarFrases`: an Apagar tudo not yet confirmed by `POST /jobs/apagar-frases`, resent until it is, also every 30 s by the worker): the Envios tracked until the summary is answered; see “Envio ao Anki” in the `painel-anki` skill

### Platform-Specific Subtitle Selectors (content.js)

- **Netflix**: `.player-timedtext-text-container`
- **YouTube**: `.ytp-caption-segment`
- **Amazon Prime**: `.atvwebplayersdk-captions-text` (with extra filtering for non-Latin chars and UI strings)
- **Max / HBO Max**: the visible `TextCue-Fuse-Web-Play…` cues (`lerLegendaDaMax`); the player's context block (`Title-`, `SeasonEpisode-`, `Subtitle-Fuse-Web-Play…`, where “Subtitle” is the episode name, and the hidden screen-reader label) is never a caption, and the Max branch does not fall through to the generic selectors. Classes are matched at the start of a token because the styled-components hash changes
- **Generic**: `.jw-text-track-cue`, `.vjs-text-track-cue`

### Cross-Frame Communication

`content.js` never uses `window.postMessage()`: the page could forge it. Each frame saves its own phrase (`SALVAR_HISTORICO`). When the clipboard write fails in an iframe, it sends `COPIAR_NO_FRAME_DE_CIMA` to the service worker, which relays `COPIAR_PARA_CLIPBOARD` to the top frame only (`frameId: 0`), whose `{ ok }` is what makes the overlay say “copiada”. Before saying a page has no video (MIN-10), a frame without one sends `HA_VIDEO_EM_OUTRO_FRAME`; the worker asks every frame (`TEM_VIDEO_NESTE_FRAME`) and no answer means no video.

The capture shortcuts and the floating button only react to trusted events (`event.isTrusted`), so a page cannot mine by dispatching a synthetic keydown or click.

### Write Serialization (background.js)

Every read-modify-write of `frases` in the service worker goes through `naFilaDeGravacao`, so concurrent saves (e.g. BookReader saving many passages at once) never overwrite each other. Phrase ids are assigned inside that queue and are unique even within the same millisecond.

Not covered by the queue:
- The auto-miner duplicate check reads `frases` outside the queue before calling `salvarFrase`, so two identical auto candidates arriving together can both be saved (a duplicate, never a lost phrase).
- `painel.js` rewrites `frases`, and `lib/sincronizacao.js` writes local sync state, outside the service worker's queue, so editing or deleting in the panel during a photo save can still lose phrases. Minerar frases (Colar and Arquivo .txt) is not in this list: it saves through the service worker.

### Toolbar Badge (background.js)

The badge on the extension icon is the auto-miner's counter for today (`MIN-09`): the **sum of the enabled languages only**, in the Veio colors (`#F5B83D` on `#1A1204`). Both languages off → no badge, and the tooltip is the extension's name. Tooltip otherwise: “Mineração automática: N hoje”, or “…: limite de hoje atingido” when every enabled language has hit its own `dailyLimit`.

Storage is what drives it, not the caller: the service worker watches `pm_auto_miner_settings` and `pm_auto_miner_daily` through `chrome.storage.onChanged`, so toggling a language in the popup and each automatic mining both land on the same path (`atualizarBadgeDaToolbar`).

The two colors are the only ones written outside `veio/tokens.css` — `chrome.action` takes a color, not CSS — and that exception is registered in `veio/README.md`. They travel as a pair: `setBadgeTextColor` needs Chrome 110+, so `manifest.json` declares `minimum_chrome_version: 110` rather than letting the text color fall back and lose the 10.4:1 contrast.

For the day rollover's scheduling and persistence contract, see `agendarViradaDoDia` in `background.js`; state publication is owned by `publicarEstadoDaAutomatica` there. The user-visible rollover behavior is in [the popup spec](docs/design/popup/README.md). The service worker also refreshes the badge whenever it wakes, and listens to `runtime.onStartup`, since the badge may be yesterday's.

## Testing

The extension is tested for real in Chromium via Playwright, from `e2e/` (its own `package.json`, so the unpacked root stays free of Node files):

```bash
cd e2e
npm ci           # once
npm run setup    # once: downloads Playwright's Chromium
npm test         # launches Chromium with the unpacked extension and runs the suite
```

On Linux/WSL, Chromium also needs system libraries (NSS, ALSA…): `sudo npx playwright install-deps chromium`, once.

The browser sees only the DejaVu fonts (`e2e/fontconfig/fonts.conf`, set as `FONTCONFIG_FILE` by `e2e/fixtures.js`; Debian/Ubuntu package `fonts-dejavu-core`; the machine's own fontconfig, `50-user.conf` and `51-local.conf`, is left out on purpose), so the host pages' fallback fonts and symbol glyphs are the same on a dev machine and on the CI runner, and the `-linux` visual references hold on both.

- The fixtures (`e2e/fixtures.js`), the fakes (`e2e/fakes/`), the local test pages (`e2e/pages/`), the Veio showcase (`e2e/vitrine/`) and the list of visual references (`tests/*-visual.spec.js`) are described in the `e2e-suite` skill: `.claude/skills/e2e-suite/SKILL.md`. Open it before adding or changing an e2e test.
- `HEADED=1 npm test` shows the browser.
- While working, run only the specs of the area you changed (`npx playwright test <specs> --workers=2`); the whole suite runs in CI (`.github/workflows/testes.yml`, with the Node, engine and add-on tests), not on your machine. A test that also fails on `main` has an open issue: do not prove it again.
- Tests assert what the person sees and what ends up stored, never internal functions. A test that acts reads the stored state afterwards and compares it with a concrete value (`e2e/estado-final.js`; rule `e2e-estado-final`); the read comes after the last action and reaches an `expect`; a fake's reader of what it kept is declared `@estado-guardado`; one that stores nothing says `// Exceção de teste: sem-estado-guardado — <reason>`. Three narrow exceptions, each named in the test's comment:
  - Where Chromium gives Playwright no way to drive the native UI or clock (the context menu, the toolbar badge, the midnight alarm, an extension update), a test does what Chrome would do — calls the function Chrome would call (`minerarSelecaoDoMenu`, `registrarMenuDeContexto`, `aoInstalar({ reason: 'update' })`) or fires the alarm early under its own name — and asserts what gets stored or what is handed to Chrome (`chrome.action.getBadgeText`, `getTitle`, the next alarm's time).
  - Until a surface shows a catalog state, the catalog's own guarantees (every ID present, pt-BR numbers) are asserted through `PerpetualMiner.textoDaVoz`, inside an extension page. These move to the screen when the surface is rebuilt.
  - Two guarantees of the base components have no on-screen trigger of their own, so the test calls the component's own function and still asserts the visible result: how long a toast of a given length *stays on screen* (`mostrarToastDeSucesso`), and that a phrase carrying markup is written as text (`escreverFrase`). The surfaces that call them assert the same thing through the screen once they are rebuilt.

The add-on's contract with the extension is tested from both sides on the same examples: `complemento/test_servidor.py` (the real server over an in-memory collection) and `e2e/tests/contrato-da-conexao.spec.js` (the fake, which answers from `complemento/contrato/exemplos.json`; a context such as `fakes.anki.abrirColecao(nome)`, `abrirPerfil(perfil)` or `definirItemDeLogin(situacao)` needs an example, which `node test_fake_anki.js` checks).

The legacy tests keep running: `node test_sync.js` (loads `lib/sincronizacao.js` for real, two computers over a memory cloud, plus the HTTP adapter over a fake `fetch`), `node test_auto_keyword.js`.

**Every test runs in the gate.** The groups of `scripts/testes.json` are the one list of what runs: a workflow job only calls `node scripts/testar.mjs <group>`. `node scripts/regras/verificar.js` (rule `testes-no-portao`) fails on a test file no group runs, a group no PR workflow calls, and a workflow that runs a test by hand. Still outside the gate, on the rule's baseline: `.agents/skills/verify-perpetualminer/scripts/test_helpers.sh` (minutes long, sends signals).

## Key Constants

- `ATALHOS_PADRAO` in `lib/atalhos.js` — the factory shortcuts: Minerar legenda on **Alt+S**, Minerar seleção with none
- `SENTINEL_VAZIO = 'NENHUM_TRECHO'` in `bookreader.js` — returned by Gemini when no marked passages found (the photo is “Sem marcações”, FOT-10)
- Firebase configuration and Firestore paths: see `lib/sincronizacao.js`
- `BADGE_COR_DE_FUNDO = '#F5B83D'` / `BADGE_COR_DO_TEXTO = '#1A1204'` in `background.js` — the toolbar badge's Veio colors
- `ALARME_VIRADA_DO_DIA` in `background.js` — see `agendarViradaDoDia` for the rollover contract

## Permissions

- `optional_permissions`: only `nativeMessaging` (#147), asked when the person presses Permitir abrir o Anki and never at install, so an update never disables the extension of who already has it (`node test_empacotar.js` checks it; justified in the store guide)
- `alarms`, `storage`, `unlimitedStorage`, `activeTab`, `tabs`, `contextMenus`, `identity` (for the `alarms` rationale, see [the store guide](docs/publicar-chrome-web-store.md#justificativa-de-cada-permissão); the unpacked-folder auto-reload also uses it)
- `host_permissions`: the Conexão com o Anki (127.0.0.1/localhost:8766), Gemini API, Firestore, Google OAuth, Firebase token endpoints. No `*.firebaseio.com`/`*.firebaseapp.com` (nothing calls them); `test_empacotar.js` checks that the "Host permission use" block of `docs/publicar-chrome-web-store.md` lists exactly these
- Content scripts inject into all URLs with `all_frames: true`
- `painel.html`, `bookreader.html`, `veio/tokens.css`, `veio/componentes.css`, `overlay.css`, `veio/icones/icone.svg` and `veio/fontes/*.woff2` declared as `web_accessible_resources`: the stylesheets, the tile and the fonts are what the in-page overlay loads inside its Shadow DOM

## Testing on devices and the Chrome Web Store

- `lib/auto-recarregar.js` (started by `background.js`): only when `chrome.management.getSelf()` says `installType === "development"`, a 1-minute alarm hashes the files `PerpetualMiner.arquivosDaExtensao` lists and calls `chrome.runtime.reload()` when they change (confirmed after 4 s, so a half-finished `git pull` never reloads). Store installs do nothing. Test: `e2e/tests/atualizacao-automatica.spec.js`, on a temp copy of the extension.
- `scripts/atualizar-extensao.sh` (+ `scripts/com.perpetualminer.atualizar.plist.exemplo`) keeps a clone on `main` up to date with `git pull --ff-only`; see `docs/instalar-extensao.md`.
- `node scripts/empacotar-extensao.mjs` writes `dist/perpetualminer-<version>.zip` (runtime files only, manifest validated; `node test_empacotar.js` checks it); see `docs/publicar-chrome-web-store.md`, which ends with the manifest permissions the store may question.

## Agent skills

The engineering skills (`/implement`, `/tdd`, `/code-review`, `/to-spec`, `/to-tickets`, `/triage`, `/wayfinder`, …) live in `.claude/skills/`, so they also run in Claude Code on the web.

`/verify-perpetualminer` (canonical copy in `.agents/skills/verify-perpetualminer/`, symlinked from `.claude/skills/`) drives the extension through the e2e harness and keeps the feature map in `features/`.

### Issue tracker

Issues and specs are GitHub issues on this repo, handled with `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `glossary.md` at the root; `docs/adr/` does not exist yet (created with the first recorded decision). See `docs/agents/domain.md`.
