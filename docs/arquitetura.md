# Arquitetura da extensão

Lido sob demanda (não entra em toda sessão). O papel de cada arquivo está em `docs/arquivos/`; o esquema do storage, em `docs/armazenamento.md`; os testes e o dispositivo, em `docs/testes.md`. O que cada superfície mostra está na skill dela (`.agents/skills/`).

## Project Overview

**PerpetualMiner** is a Chrome browser extension (Manifest V3) that captures text from multiple sources — streaming subtitles, selected text on any page, and physical book photos — into a study history. No build step required — pure vanilla JavaScript.

## Loading the Extension

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory
4. After any code change, click the reload icon on the extension card in `chrome://extensions/`

## Architecture

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
   bookreader/bookreader.html → user uploads photo → Gemini Vision API (gemini-3-flash-preview)
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

### Panel shell (`painel/painel-shell.js`)

`painel/painel.html` is one page with three areas (plus the Boas-vindas, `#boas-vindas`, which hides the whole shell); the shell (`docs/design/painel/shell/`, variant B) only swaps the view, so
nothing reloads when switching areas — filters, page, selection, sync and the Envio tracking in `painel/painel-envio.js` stay as
they are. Addresses: `#frases` (default, and anything unknown), `#anki/custos|baralhos|vocabulario|ajustes`
(`#anki` alone opens Custos; the sidebar link reopens the last tab seen), `#configuracoes[/conta|atalhos|ia|chave|anki|aparencia|perigo]`
(opens the card, scrolls to it and flashes its border; bare `#configuracoes` shows every card closed). The Anki tabs are the Veio segmented control; picking one sets the hash,
so the browser's back button walks through areas and tabs.

The shell owns the sidebar and `painel/painel.js` reports to it through `PerpetualMiner.Shell`:
`mostrarTotalDeFrases(n)`, `aoEntrarNaArea(area, fn)` (the Anki area refreshes on entry), `areaAtual()`, `AREAS_DO_PAINEL` (the areas with the sidebar). The shell starts the 15 s `/health` checks and uses `ConexaoNaTela` for the sidebar indicator and the F1 retry at the top of the Anki area. Edge cases: [shell](design/painel/shell/README.md#casos-de-borda); the common retry: [Boas-vindas § F1](design/painel/boas-vindas/README.md#conexão-com-o-anki-como-ligar-f1). Others listen to `ConexaoAnki` directly.

The shell's fixed copy comes from the catalog through `data-voz`, `data-voz-aria` and `data-voz-title` attributes in
`painel/painel.html`, which `painel/painel-shell.js` fills on load. The sidebar and the content island are both the height of the window
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
- e2e fixtures, fakes, test pages and visual references: `.claude/skills/e2e-suite/SKILL.md` (see `docs/testes.md`)

### Firebase / Firestore Sync

Phrases are synced to Firestore under `usuarios/{uid}/frases/{frase.id}` when the user is logged in. `lib/sincronizacao.js` owns the shared session implementation, Firestore codec and merge logic, using the **Firestore REST API directly** (no SDK: MV3 CSP). The panel loads it before `painel/painel.js`; the service worker, with `importScripts`. For the `nuvem` seam and the sync API, read the module's doc comments.

Authentication in `painel/painel.js` uses `chrome.identity.launchWebAuthFlow` (OAuth2 with Google) — **no Firebase Auth SDK**. Stored credentials are described under Firebase auth session in `docs/armazenamento.md`; see `criarSessao`'s doc comment for token renewal and revocation.

A capture is saved locally, then sent by `salvarFrase` / `sincronizarComFirestore` in `background.js`; a failed upload leaves no record. There is no retry queue: `carregar` in `lib/sincronizacao.js` uploads the local phrases the cloud lacks.

`criarSincronizacao` owns deletion, tombstones and a pending Apagar tudo; the panel clears its visible/local history and delegates cloud work to the module, while the popup does not delete. For tombstone storage and the offline wipe's account/cutoff rules, read the module's doc comments. The Firestore field-path escaping requirement is documented at `tombstoneFirestore`. A `404` on `meta/deleted` means no tombstones yet; any other failure to read it makes `carregar` reject before it uploads or removes anything, as a failed listing does, and the next opening retries.

The OpenAI key follows the account (#154): the versioned Conexão owner replicates `usuarios/{uid}/segredos/openai` (`{ chave, em }`, empty value for deletion). The extension sends transient UID/token requests on opening/login/visibility/key changes and reads only the owner's public summary. Invariants, legacy migration, ordering limits and P6 owner rule-publication gate: `docs/seguranca/chave-da-openai.md`.

### Platform-Specific Subtitle Selectors (content.js)

- **Netflix**: `.player-timedtext-text-container`
- **YouTube**: `.ytp-caption-segment`
- **Amazon Prime**: `.atvwebplayersdk-captions-text` (with extra filtering for non-Latin chars and UI strings)
- **Max / HBO Max**: the visible `TextCue-Fuse-Web-Play…` cues (`lerLegendaDaMax`); the player's context block (`Title-`, `SeasonEpisode-`, `Subtitle-Fuse-Web-Play…`, where “Subtitle” is the episode name, and the hidden screen-reader label) is never a caption, and the Max branch does not fall through to the generic selectors. Classes are matched at the start of a token because the styled-components hash changes
- **Generic**: `.jw-text-track-cue`, `.vjs-text-track-cue`

### Cross-Frame Communication

`content.js` never uses `window.postMessage()`: the page could forge it. Each frame saves its own phrase (`SALVAR_HISTORICO`). When the clipboard write fails in an iframe, it sends `COPIAR_NO_FRAME_DE_CIMA` to the service worker, which relays `COPIAR_PARA_CLIPBOARD` to the top frame only (`frameId: 0`), whose `{ ok }` is what makes the overlay say “copiada”. Before saying a page has no video (MIN-10), a frame without one sends `HA_VIDEO_EM_OUTRO_FRAME`; the worker asks every frame (`TEM_VIDEO_NESTE_FRAME`) and no answer means no video.

The capture shortcuts and the floating button only react to trusted events (`event.isTrusted`), so a page cannot mine by dispatching a synthetic keydown or click.

### Write Serialization (lib/historico.js)

`PerpetualMiner.Historico` owns the writes of `frases`. Each operation (`acrescentar`, `editar`, `editarVarias`, `marcarEnviadas`, `marcarExportadas`, `apagar`) takes the Web Lock `pm-historico`, reads `frases` again inside it, changes only what was asked and writes; the lock is the same for the service worker and every extension page, so a save in one never overwrites a change from another. The service worker's `salvarFrase` goes through `acrescentar` (e.g. BookReader saving many passages at once), and phrase ids are assigned inside the lock, unique even within the same millisecond. In the panel, Apagar (one phrase, the selection, or Tirar do histórico after an Envio) goes through `apagar`; marking a Palavra, Editar texto and Editar contexto (one phrase or the selection) go through `editar` and `editarVarias`, which write only the fields the person changed; Exportar .txt and the Enviada ao Anki mark at the end of an Envio go through `marcarExportadas` and `marcarEnviadas`. Apagar tudo goes through `apagar` with the ids of the phrases the confirmation counted, taken when the dialog opens (`painel/painel-perigo.js`); with a Conta, `sincronizacao.apagarTudo(ids, em)` deletes from the cloud those ids (with a tombstone even if their upload has not arrived yet) and every phrase with an id up to that moment (also the cutoff `ate` of a pending wipe), so a phrase mined after the dialog opened stays, here and in the cloud, with no tombstone. The cutoff compares ids, which are the clock of the computer that mined them: a computer with its clock far ahead or behind can fall on the wrong side.

When the panel loads with a Conta, `lib/sincronizacao.js` drops the phrases deleted on another computer through `apagar` (the tombstone ids) and copies the Enviada/Exportada marks from the cloud through `editarVarias`.

Not covered by the lock:
- The auto-miner duplicate check reads `frases` outside the lock before calling `salvarFrase`, so two identical auto candidates arriving together can both be saved (a duplicate, never a lost phrase).
- Nothing else: Minerar frases (Colar and Arquivo .txt) saves through the service worker, and the rule `gravacao-de-frases` refuses any write of `frases` outside `lib/historico.js`.

### Toolbar Badge (background.js)

The badge on the extension icon is the auto-miner's counter for today (`MIN-09`): the **sum of the enabled languages only**, in the Veio colors (`#F5B83D` on `#1A1204`). Both languages off → no badge, and the tooltip is the extension's name. Tooltip otherwise: “Mineração automática: N hoje”, or “…: limite de hoje atingido” when every enabled language has hit its own `dailyLimit`.

Storage is what drives it, not the caller: the service worker watches `pm_auto_miner_settings` and `pm_auto_miner_daily` through `chrome.storage.onChanged`, so toggling a language in the popup and each automatic mining both land on the same path (`atualizarBadgeDaToolbar`).

The two colors are the only ones written outside `veio/tokens.css` — `chrome.action` takes a color, not CSS — and that exception is registered in `veio/README.md`. They travel as a pair: `setBadgeTextColor` needs Chrome 110+, so `manifest.json` declares `minimum_chrome_version: 110` rather than letting the text color fall back and lose the 10.4:1 contrast.

For the day rollover's scheduling and persistence contract, see `agendarViradaDoDia` in `background.js`; state publication is owned by `publicarEstadoDaAutomatica` there. The user-visible rollover behavior is in [the popup spec](design/popup/README.md). The service worker also refreshes the badge whenever it wakes, and listens to `runtime.onStartup`, since the badge may be yesterday's.

## Key Constants

- `ATALHOS_PADRAO` in `lib/atalhos.js` — the factory shortcuts: Minerar legenda on **Alt+S**, Minerar seleção with none
- `SENTINEL_VAZIO = 'NENHUM_TRECHO'` in `bookreader/leitura-do-gemini.js` — returned by Gemini when no marked passages found (the photo is “Sem marcações”, FOT-10)
- Firebase configuration and Firestore paths: see `lib/sincronizacao.js`
- `BADGE_COR_DE_FUNDO = '#F5B83D'` / `BADGE_COR_DO_TEXTO = '#1A1204'` in `background.js` — the toolbar badge's Veio colors
- `ALARME_VIRADA_DO_DIA` in `background.js` — see `agendarViradaDoDia` for the rollover contract

## Permissions

- `optional_permissions`: only `nativeMessaging` (#147), asked when the person presses Permitir abrir o Anki and never at install, so an update never disables the extension of who already has it (`node testes/test_empacotar.js` checks it; justified in the store guide)
- `alarms`, `storage`, `unlimitedStorage`, `activeTab`, `tabs`, `contextMenus`, `identity` (for the `alarms` rationale, see [the store guide](publicar-chrome-web-store.md#justificativa-de-cada-permissão); the unpacked-folder auto-reload also uses it)
- `host_permissions`: the Conexão com o Anki (127.0.0.1/localhost:8766), Gemini API, Firestore, Google OAuth, Firebase token endpoints. No `*.firebaseio.com`/`*.firebaseapp.com` (nothing calls them); `testes/test_empacotar.js` checks that the "Host permission use" block of `docs/publicar-chrome-web-store.md` lists exactly these
- Content scripts inject into all URLs with `all_frames: true`
- `painel/painel.html`, `bookreader/bookreader.html`, `veio/tokens.css`, `veio/componentes.css`, `overlay/overlay.css`, `veio/icones/icone.svg` and `veio/fontes/*.woff2` declared as `web_accessible_resources`: the stylesheets, the tile and the fonts are what the in-page overlay loads inside its Shadow DOM
