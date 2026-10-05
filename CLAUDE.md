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

| File | Role |
|------|------|
| `manifest.json` | Permissions, content script registration |
| `content.js` | Injected into all pages; mines subtitles and selections, and drives the overlay. See “Overlay” in the `overlay` skill |
| `overlay.js` + `overlay.css` | `PerpetualMiner.Overlay` — the in-page overlay: one Veio component in an open Shadow DOM (the floating button and the feedback pill). See “Overlay” in the `overlay` skill |
| `background.js` | Service worker; handles `SALVAR_HISTORICO` messages and context menu clicks; writes to `chrome.storage.local` and syncs to Firestore |
| `lib/sincronizacao.js` | `PerpetualMiner.Sincronizacao` — shared cloud sync. See “Firebase / Firestore Sync” below and the module's doc comments for its API contract |
| `popup.html/js/css` | The “Cockpit” popup (docs/design/popup/, variant A): the “Configuração pela metade” card (ONB-14), Abrir painel, the Mineração automática tiles, quick mining and the last 5 phrases, read-only. See “Popup (Cockpit)” in the `popup` skill |
| `painel.html/js/css` | Full dashboard to view, copy, and delete all saved phrases; Google login and Firestore sync |
| `painel-shell.js` | The panel's “Ilhas” shell: one page, one area per address (`#frases`, `#anki/<aba>`, `#configuracoes[/<seção>]`), the sidebar indicators (phrase total, Conexão com o Anki dot), the rail below ~1000 px, the F1 strip and the Configurações cards opening and closing. See “Panel shell” below |
| `painel-conta.js` | The account in the panel: one state drawn in the Configurações › Conta & sync card, its closed-row summary and the sidebar chip (CFG-01…10). See “Account (Conta & sync)” in the `configuracoes` skill |
| `painel-atalhos.js` | The shortcut recorder (`PerpetualMiner.GravadorDeAtalhos.montar`): records “Minerar legenda” and “Minerar seleção” in their own row (CFG-11…14, 19, 21, 22, 33, 34), mounted in Configurações › Atalhos and in step 2 of the Boas-vindas. See “Shortcuts (Atalhos)” in the `configuracoes` skill |
| `painel-boas-vindas.js` | The Boas-vindas (`#boas-vindas[/<passo>]`, no sidebar), which installing the extension opens: the list of 8 items, one step per card (step 4 mounts `PassosDaConexao`), progress in `pm_boas_vindas` (ONB-01…05, 12, 13). See “Boas-vindas” in the `boas-vindas` skill |
| `lib/atalhos.js` | `PerpetualMiner.Atalhos` — the recorded shortcuts in one place: where they are stored, the defaults, the PT-BR label, “same shortcut” and event matching, and `digitandoNumCampo` (the key belongs to a text field). Loaded by the content script, the panel and the popup |
| `painel-chave.js` | The Configurações › Chave do Gemini card: the saved key masked, with Trocar chave; the empty key's field; `geminiApiKey`. See “Chave do Gemini and Zona de perigo” in the `configuracoes` skill |
| `painel-perigo.js` | The Configurações › Zona de perigo card: the Apagar tudo entry, its reach with and without an account, and the Veio confirmation modal (CFG-17). See “Chave do Gemini and Zona de perigo” in the `configuracoes` skill |
| `painel-anki.js` | The Custos tab (BRG-03…04, 12, 22, 25…33), the area's initial Conectando strip and the Ajustes de envio offline note; mounts `PrimeiraConexao` without deciding its view. See “Conexão com o Anki” in the `painel-anki` skill |
| `painel-anki-primeira-conexao.js` | `PerpetualMiner.PrimeiraConexao` — the ONB-16 flow of the first connection (design B, #77): when the card covers the tabs (it toggles `anki--primeira-vez` itself; `painel-anki.js` asks nothing), the Conferência line, the two boxes, and the Pronto moment with its toast and focus; the steps are `PassosDaConexao`. See “Conexão com o Anki” in the `painel-anki` skill |
| `painel-conexao-passos.js` | `PerpetualMiner.PassosDaConexao` — the list of steps and the step card for putting the Conexão com o Anki in the Anki (#99, #145), one component for step 4 of the Boas-vindas and the ONB-16 card: Pôr a Conexão no Anki (the `.ankiaddon` download, the “O arquivo não abriu?” Detalhes) and Reiniciar o Anki (Conectando › “Achei o Anki · perfil · versão”; after 2 min without an answer the 3-item checklist and Baixar de novo). See “Conexão com o Anki” in the `painel-anki` skill |
| `conexao/perpetualminer.ankiaddon` | The Conexão com o Anki as the file the person downloads and opens (a link of `PassosDaConexao`, no permission), shipped in the Web Store package (`scripts/arquivos-do-pacote.js`). Built from `complemento/`: `python3 complemento/empacotar.py conexao/perpetualminer.ankiaddon`; `complemento/test_pacote.py` fails while it is behind the add-on's code, and `test_empacotar.js` checks it inside the store zip |
| `painel-anki-baralhos.js` | `PerpetualMiner.Baralhos` — Baralhos e termos, Vocabulário and Reparar Anki in the Conexão com o Anki area (BRG-10…21, 27, 34…36, GLB-01). See “Baralhos e termos, Vocabulário and Reparar Anki” in the `painel-anki` skill |
| `painel-ajustes.js` | The Conexão com o Anki › Ajustes de envio tab: one card per language whose form saves only on Salvar ajustes, the Baralho picked from the Anki's decks, and the stale-tab refusal (#35). See “Ajustes de envio” in the `painel-anki` skill |
| `painel-envio.js` | The Envio ao Anki: Enviar ao Anki in the Frases bar, the progress modal (one card per Envio), the tracking saved in `pm_envio` and the summary (ENV-03…15) that opens by itself in any area. See “Envio ao Anki” in the `painel-anki` skill |
| `bookreader.html/js/css` | Minerar de uma foto (ex-BookReader): photos of marked book pages → Gemini Vision reads the marked passages → the person picks which phrases to mine. See “Minerar de uma foto” in the `minerar-foto` skill |
| `veio/` | Shared Veio identity: `tokens.css` (color/type/radius/motion tokens + the mark's blinking cursor), `tema.js` (the chosen theme, applied before the first paint on every page), `componentes.css` + `componentes.js` (the base components, defined once), `fontes/` (packaged Manrope and JetBrains Mono `.woff2`, latin + cyrillic), `icones/` (the toolbar PNGs, the SVG mark and `icone-claro.svg`, which `.veio-marca` swaps in on the light theme through `--veio-marca`). See `veio/README.md` |
| `lib/voz/catalogo.js` | The runtime Voice catalog as data; approved copy and voice rules are in `docs/design/voz/README.md` |
| `lib/voz/texto.js` | `textoDaVoz(id, valores)` — looks a state up by ID and fills its templates |
| `lib/idioma.js` | `detectarIdioma(texto)` — the single language detector (Cyrillic → Russo, else Inglês) |
| `lib/contexto.js` | `PerpetualMiner.Contexto` — the Contexto as the screen says it: the Fonte's name (PAI-29, `fonteDaFrase`, `nomeDaFonte`), the phrase's day (PAI-11, `rotuloDoDia`) and how long ago something happened (`haQuanto`: agora · há 5 min · há 2 h · ontem). Loaded by the panel and the popup, so a phrase never has two names |
| `lib/conexao-anki.js` | `PerpetualMiner.ConexaoAnki` — the shared owner of `/health` (and what the last ligada answer said of the Conexão, `saude()`: `{ versao, perfil }`), the connection state and the stored first-success fact across panel and popup. See the module's doc comments for its lifecycle and API contract |
| `lib/conexao-na-tela.js` | `PerpetualMiner.ConexaoNaTela` — the shared presentation of the Conexão in the F1 strip, the ONB-16 card and step 4 of the Boas-vindas. See the module's doc comments for its API and caller responsibilities |
| `lib/configuracao.js` | `PerpetualMiner.Configuracao` — the first-run setup in one place: the 6 steps of the Boas-vindas, when each is done (from what is stored, plus the Conexão it follows from `ConexaoAnki`), “agora não”, `pm_boas_vindas`, and the “Configuração pela metade” reminder (ONB-14, ONB-15). Loaded by the panel and the popup. See “Configuração pela metade” in the `boas-vindas` skill |
| `painel-lembrete.js` | The ONB-15 strip at the top of Frases: the progress ring, “N de 6 passos”, Ocultar and Continuar configuração. See “Configuração pela metade” in the `boas-vindas` skill |
| `lib/ajustes-de-envio.js` | `PerpetualMiner.AjustesDeEnvio` — the Ajustes de envio in one place: the Baralho padrão of each language (CIMV · RUSSIAN), the stored shape of `ankiBridgePresets`, the per-language save that refuses a stale version, and `acompanhar`. Loaded by the panel and the service worker, so the default deck is the same everywhere in the front |
| `lib/mineracao.js` | `PerpetualMiner.Mineracao` and `PerpetualMiner.minerarFraseManual` — shared mining requests and selection context. See the module's doc comments for the API, confirmation and title-compatibility contracts |
| `lib/mineracao-do-dia.js` | `PerpetualMiner.MineracaoDoDia` — shared automatic-mining day rules and storage/message channel names. See the module's doc comments for normalization and the day-query API; see `publicarEstadoDaAutomatica` in `background.js` for state publication |
| `lib/vocabulario-da-mineracao.js` | `PerpetualMiner.VocabularioDaMineracao` — the last vocabulary reading the Mineração automática uses (`pm_auto_keyword_vocab_en` / `_ru`): the key, the format version, whether it is for the Baralho the Ajustes de envio have now, `source`/`dadosDe`/`ankiFechado` (`dadosDe` is the moment of the *data*: with the Conexão answering from the file, `source: 'collection.anki2'`, it stays the last live reading's of the *same Baralho*; `ankiFechado` is true only when `GET /anki/status` confirmed no Anki process, because the file is also read when the Anki is open and the AnkiConnect does not answer), and `lerLeituras()`. **It has no expiry**; `RENOVAR_A_CADA_MS` (15 min) is only how often the service worker tries to read it again while the Conexão answers. Loaded by the service worker, the popup and the panel |
| `lib/mineracao-automatica.js` | `PerpetualMiner.MineracaoAutomatica` — the automatic mining seen from a page: `lerEstado()` / `salvarAjustes(mudanca)` (the `AUTO_MINER_GET_STATE` / `AUTO_MINER_SET_SETTINGS` messages, as promises that reject with the cause) and `ligarCampoDoLimite(campo, { limiteGravado, gravar })`, the 1–100 daily-limit field (`.veio-campo--limite`). Shared by the popup's tiles and step 5 of the Boas-vindas |
| `lib/firebase/` | Firebase compat SDK bundles (app, auth, firestore) — no page loads them today (the panel talks to Firestore over REST), so the Web Store package leaves them out |
| `lib/arquivos-da-extensao.js` | `PerpetualMiner.arquivosDaExtensao(lerTexto)` — the files the extension uses at run time, found from `manifest.json` (service worker and its `importScripts`, content scripts, icons, pages and what they load). Read by `lib/auto-recarregar.js` and by `scripts/empacotar-extensao.mjs`, so the two never disagree |
| `lib/auto-recarregar.js` | `PerpetualMiner.AutoRecarregar.iniciar()` — called at the top of `background.js`; reloads an unpacked (`development`) extension when its files change. See “Testing on devices and the Chrome Web Store” below |
| `scripts/` | `atualizar-extensao.sh` (+ the launchd `.plist` example) keeps a clone on `main` up to date; `empacotar-extensao.mjs` builds the Web Store zip; `arquivos-do-pacote.js` says which repository files are run-time and which never ship (shared by the packager, `test_empacotar.js` and the auto-update e2e). See `docs/instalar-extensao.md` and `docs/publicar-chrome-web-store.md` |
| `scripts/dividir-claude-md.mjs`, `scripts/verificar-divisao-do-claude-md.mjs`, `scripts/divisao-do-claude-md.mjs`, `scripts/test_divisao_do_claude_md.mjs` | The split of this file into the surface skills (`.agents/skills/`, linked from `.claude/skills/`). `node scripts/dividir-claude-md.mjs <CLAUDE.md inteiro>` redoes it (only needed when a merge brings an unsplit `CLAUDE.md`, see `--help`); `node scripts/verificar-divisao-do-claude-md.mjs --base <ref>` proves nothing was lost and that every skill is valid YAML with working links; the `divisao-` module holds the section → skill table both read |
| `complemento/` | The Conexão com o Anki as an Anki add-on (`__init__.py` loads it inside Anki; `inicio.py` prepares `user_files` and starts `servidor.Conexao`, an stdlib HTTP server on `127.0.0.1:8766` in a thread that never touches the Anki process: no proxy, stdout, stderr, `excepthook` or warnings, every error goes to `registro.py`'s logger; with the port busy it stays quiet and logs why). It answers only the extension's `Origin`, except `GET /health` (`{ ok, versao, perfil }`, the only route so far), which is open to any local client because Chrome sends an extension's GET without `Origin`; every other route is POST-only and needs the origin (see `contrato/LEIA-ME.md` § Quem o complemento atende; A-vs-pairing-token is deferred to the first sensitive read route). `contrato/exemplos.json` is the one set of request/response examples that the add-on tests and `e2e/fakes/anki.js` both read. `empacotar.py` builds the `.ankiaddon`. Tests: `python3.9 complemento/test_*.py` and `python3.13 …` |
| `bridge/envio.py` | The bridge's Envio state machine; read its module docstring for persistence, adapters and resume, and `bridge/test_envio.py` for interface tests |
| `test_fake_anki.js` | Node test of the e2e fake of the Conexão com o Anki (`e2e/fakes/anki.js`): it answers `/health` from the contract examples (`complemento/contrato/exemplos.json`) and refuses a context (a profile) the examples do not have |
| `test_empacotar.js` | Node test of the Web Store package contents; also checks that the store guide's "Host permission use" block matches the manifest hosts |
| `test_gemini.js` | Standalone Node.js script to list available Gemini models (not part of the extension) |
| `scripts/regras/` | The review rules a script can check (`verificar.js`, one file per rule, `linha-de-base.json`, proofs in `test_regras.js`), run locally and by `.github/workflows/regras.yml`. See `AGENTS.md` § Rules and what enforces them |
| `e2e/` | Playwright suite that runs the unpacked extension in Chromium (own `package.json`; see Testing) |
| `.agents/skills/verify-perpetualminer/` | The `/verify-perpetualminer` skill: how an agent drives and proves the extension through the e2e harness. `SKILL.md`, the feature map in `features/`, and `scripts/` (`doctor.sh`, `drive.sh`, `cleanup.sh`, `lib.sh`, `mapa-de-features.sh`, `test_helpers.sh`). Dev tooling, never part of the extension package (`test_empacotar.js` checks it). `.claude/skills/verify-perpetualminer` is a symlink to it |
| `e2e/fontconfig/fonts.conf` | The fonts the test Chromium sees: only the DejaVu files, no user or local font config, so the visual references render the same on every machine (loaded by the e2e fixture; see Testing) |
| `.github/workflows/testes.yml` | The PR gate: Node tests (including the e2e fake's), bridge tests, the add-on tests (Python 3.9 and 3.13) and the whole e2e suite (xvfb, sharded) on every PR and on `main`; see Testing |
| `preview/` | The static site Vercel publishes per branch, so a visual change can be looked at in a browser: `montar.mjs` assembles it, `chrome-simulado.js` fakes `chrome.*` with sample data inside the copied pages. See `preview/README.md` |

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
(`#anki` alone opens Custos; the sidebar link reopens the last tab seen), `#configuracoes[/conta|atalhos|chave|aparencia|perigo]`
(opens the card, scrolls to it and flashes its border; bare `#configuracoes` shows every card closed). The Anki tabs are the Veio segmented control; picking one sets the hash,
so the browser's back button walks through areas and tabs.

The shell owns the sidebar and `painel.js` reports to it through `PerpetualMiner.Shell`:
`mostrarTotalDeFrases(n)`, `aoEntrarNaArea(area, fn)` (the Anki area refreshes its data on entry), `areaAtual()`, `AREAS_DO_PAINEL` (the three areas with the sidebar, i.e. not the Boas-vindas). The shell starts `ConexaoAnki`'s 15 s `/health` checks and uses `ConexaoNaTela` for the sidebar indicator (tooltip and accessible description) and the F1 retry at the top of the Anki area. For the strip's visibility and focus destinations, see the [shell's edge cases](docs/design/painel/shell/README.md#casos-de-borda); the [Boas-vindas § F1](docs/design/painel/boas-vindas/README.md#conexão-com-o-anki-como-ligar-f1) owns the common retry behavior. Other surfaces listen to `ConexaoAnki` directly.

The shell's fixed copy comes from the catalog through `data-voz`, `data-voz-aria` and `data-voz-title` attributes in
`painel.html`, which `painel-shell.js` fills on load. The sidebar and the content island are both the height of the window
and start and end together; the content scrolls inside its island (entering an area scrolls it back to the top). Below 1000 px the sidebar becomes a 76 px rail: labels leave
the screen but stay as the links' names (visually hidden, not `display: none`) and become tooltips.

Until an area is rebuilt, today's content lives inside the shell in `.conteudo-de-hoje` blocks marked
`data-tema="claro"`: its CSS was drawn for a light background. Frases has none left: #30 and #31 rebuilt its bulk
actions. In the Anki area Custos (#33), Baralhos e termos and Vocabulário (#34), and Ajustes de envio (#35) are rebuilt.

Configurações is the “summary first” variant C (`docs/design/painel/configuracoes/`): each of the five cards (Conta & sync ·
Atalhos · Chave do Gemini · Aparência · Zona de perigo) is one closed row — icon tile, title, a summary of its state, chevron — and
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

Phrases are synced to Firestore under `usuarios/{uid}/frases/{frase.id}` when the user is logged in. `lib/sincronizacao.js` owns the shared session implementation, Firestore codec and merge logic, using the **Firestore REST API directly** (no SDK) to avoid CSP violations in MV3. The panel loads it before `painel.js`; the service worker loads it with `importScripts`. For the `nuvem` seam and the sync API, read the module's doc comments.

Authentication in `painel.js` uses `chrome.identity.launchWebAuthFlow` (OAuth2 with Google) — **no Firebase Auth SDK**. Stored credentials are described under `pm_firebase_auth` in Storage Schema; see `criarSessao`'s doc comment for token renewal and revocation.

Pending capture uploads (including token-refresh failures) are handled by `salvarFrase` / `sincronizarComFirestore` in `background.js`; see their comments for the save/queue invariant. This queue does not track every panel edit. `carregar` in `lib/sincronizacao.js` owns retries; the queue's stored shape is in Storage Schema.

`criarSincronizacao` owns deletion, tombstones and a pending Apagar tudo; the panel clears its visible/local history and delegates cloud work to the module, while the popup does not delete. For tombstone storage and the offline wipe's account/cutoff rules, read the module's doc comments. The Firestore field-path escaping requirement is documented at `tombstoneFirestore`.

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
- `ankiBridgePresets` — the Ajustes de envio: `{ en, ru }`, each `{ deckName, imageSource: '1' (Foto real) | '2' (Gerada por IA), ttsWordTld, ttsPhraseTld, versao }`; written only by Salvar ajustes (`lib/ajustes-de-envio.js`), a missing or blank field reads as the language's default
- `geminiApiKey` — the Gemini key, written only by Configurações › Chave do Gemini and read by Minerar de uma foto
- `bookTitleDefault` — the Livro (Título) last typed in Minerar de uma foto, filled back on the next visit
- `pm_tema` — `'escuro'` (the default, and what an absent key means) or `'claro'`: the theme chosen on this computer. It is local on purpose and never syncs, so each computer opens in the theme picked on it. `veio/tema.js` mirrors it into `localStorage` under the same name, which is read before the first paint so a light page never flashes dark; `chrome.storage` stays the truth and corrects the mirror
- `pm_firebase_auth` — `{ uid, idToken, refreshToken, expiresAt }` — Firebase auth session
- `pm_user_info` — `{ uid, email, displayName, photoURL }` — Google user profile
- `pm_pending_sync` — `string[]` of phrase IDs awaiting Firestore retry
- `pm_deleted_ids` — `string[]` of deleted phrase IDs whose Firestore DELETE hasn't succeeded yet
- `pm_atalho_legenda` — the “Minerar legenda” shortcut. Absent → the default Alt+S; `null` → no caption shortcut
- `pm_atalho` — the “Minerar seleção” shortcut; `null` or absent → none (the default). Both use `{ type: 'keyboard'|'mouse', code, button, altKey, ctrlKey, shiftKey, label }`
- `pm_apagar_tudo` — pending Apagar tudo; shape, account matching and cutoff are documented in `lib/sincronizacao.js`
- `pm_anki_ja_conectou` — stored first-success fact; `lib/conexao-anki.js` owns its lifecycle
- `pm_auto_keyword_vocab_en` / `pm_auto_keyword_vocab_ru` — the last vocabulary reading the Mineração automática uses `{ cacheVersion, deckName, createdAt, source, dadosDe, ankiFechado, words, terms, wordInfo, termInfo }`; no expiry, owned by `lib/vocabulario-da-mineracao.js` (the popup says its age with the Conexão off)
- `pm_anki_custos` — `{ quando, periodo, de, ate, envios }`, the last Custos reading (the `/analytics/jobs` rows), shown with BRG-12 while the Conexão is off
- `pm_anki_baralhos` — `{ quando, dadosDe, ankiFechado, nomes, dados }`, the last `GET /anki/stats/decks`; `pm_anki_vocabulario` — `{ quando, dadosDe, ankiFechado, nomes, dados: { en, ru } }` (each `{ deckName, itens, total, source }`), the last vocabulary. Both are shown with BRG-12 while the Conexão is off
- `pm_anki_quatro_casas` / `pm_anki_ids_dos_envios` — the Avançado switches “Mostrar custos com 4 casas” and “Mostrar IDs dos envios” (local on purpose: remembered on this computer)
- `pm_boas_vindas` — `{ agoraNao: string[], concluida: boolean, lembreteOculto?: true }`: written by the install; the steps the person answered “Agora não” to, whether they reached Abrir painel in the Boas-vindas and whether they hid the “Configuração pela metade” reminder; everything else about a step is read from its real state. Absent (an update, not an install) → no reminder
- `pm_envio` — `{ envios: [{ id, lang, ids, baralho, jobId, criadoEm, falhaAoCriar }] }` (`id` is a `crypto.randomUUID()` that keys the Envio's card; `baralho` is the deck it was sent to): the Envios the panel is tracking until the summary is answered; see “Envio ao Anki” in the `painel-anki` skill

### Platform-Specific Subtitle Selectors (content.js)

- **Netflix**: `.player-timedtext-text-container`
- **YouTube**: `.ytp-caption-segment`
- **Amazon Prime**: `.atvwebplayersdk-captions-text` (with extra filtering for non-Latin chars and UI strings)
- **Max / HBO Max**: the visible `TextCue-Fuse-Web-Play…` cues (`lerLegendaDaMax`); the player's context block (`Title-`, `SeasonEpisode-`, `Subtitle-Fuse-Web-Play…`, where “Subtitle” is the episode name, and the hidden screen-reader label) is never a caption, and the Max branch does not fall through to the generic selectors. Classes are matched at the start of a token because the styled-components hash changes
- **Generic**: `.jw-text-track-cue`, `.vjs-text-track-cue`

### Cross-Frame Communication

`content.js` never uses `window.postMessage()`: the page shares the window with the content script and sees messages between frames, so it could forge them (inject phrases, overwrite the clipboard). Each frame saves its own phrase with `SALVAR_HISTORICO`. When the clipboard write fails inside an iframe (e.g. a cross-origin player without `clipboard-write`), the frame sends `COPIAR_NO_FRAME_DE_CIMA` to the service worker, which checks the sender and the text and relays `COPIAR_PARA_CLIPBOARD` to the tab's top frame only (`frameId: 0`); the top frame answers `{ ok }` and the service worker passes it back, so the iframe's overlay only says “copiada” when the copy happened. Before saying a page has no video (MIN-10), a frame without one sends `HA_VIDEO_EM_OUTRO_FRAME`; the service worker asks every frame of the tab (`TEM_VIDEO_NESTE_FRAME`), only a frame with a player-sized video on screen answers (a hidden 1 px ad video does not count), and no answer means no video. Web pages cannot reach `chrome.runtime` messaging.

The capture shortcuts and the floating button only react to trusted events (`event.isTrusted`), so a page cannot mine by dispatching a synthetic keydown or click.

### Write Serialization (background.js)

Every read-modify-write of `frases` and `pm_pending_sync` in the service worker goes through `naFilaDeGravacao`, so concurrent saves (e.g. BookReader saving many passages at once) never overwrite each other. Phrase ids are assigned inside that queue and are unique even within the same millisecond.

Not covered by the queue:
- The auto-miner duplicate check reads `frases` outside the queue before calling `salvarFrase`, so two identical auto candidates arriving together can both be saved (a duplicate, never a lost phrase).
- `painel.js` rewrites `frases`, and `lib/sincronizacao.js` writes local sync state, outside the service worker's queue, so editing or deleting in the panel during a photo save can still lose phrases. Minerar frases (Colar and Arquivo .txt) is not in this list: it saves through the service worker.

### Toolbar Badge (background.js)

The badge on the extension icon is the auto-miner's counter for today (`MIN-09`): the **sum of the enabled languages only**, in the Veio colors (`#F5B83D` on `#1A1204`). Both languages off → no badge at all, and the tooltip goes back to the extension's name. Tooltip otherwise: “Mineração automática: N hoje”, or “…: limite de hoje atingido” when every enabled language has hit its own `dailyLimit` (one language at its limit and another below still shows the counter).

Storage is what drives it, not the caller: the service worker watches `pm_auto_miner_settings` and `pm_auto_miner_daily` through `chrome.storage.onChanged`, so toggling a language in the popup and each automatic mining both land on the same path (`atualizarBadgeDaToolbar`).

The two colors are the only ones written outside `veio/tokens.css` — `chrome.action` takes a color, not CSS — and that exception is registered in `veio/README.md`. They travel as a pair: `setBadgeTextColor` needs Chrome 110+, so `manifest.json` declares `minimum_chrome_version: 110` rather than letting the text color fall back and lose the 10.4:1 contrast.

For the day rollover's scheduling and persistence contract, see `agendarViradaDoDia` in `background.js`; state publication is owned by `publicarEstadoDaAutomatica` there. The user-visible rollover behavior is in [the popup spec](docs/design/popup/README.md). The service worker also refreshes the badge whenever it wakes, and listens to `runtime.onStartup` so Chrome starting wakes it, since the badge sitting in the toolbar may be yesterday's.

## Testing

The extension is tested for real in Chromium via Playwright, from `e2e/` (its own `package.json`, so the unpacked root stays free of Node files):

```bash
cd e2e
npm ci           # once
npm run setup    # once: downloads Playwright's Chromium
npm test         # launches Chromium with the unpacked extension and runs the suite
```

On Linux/WSL, Chromium also needs system libraries (NSS, ALSA…): `sudo npx playwright install-deps chromium`, once.

The browser sees only the DejaVu fonts (`e2e/fontconfig/fonts.conf`, set as `FONTCONFIG_FILE` by `e2e/fixtures.js`; Debian/Ubuntu package `fonts-dejavu-core`; the user's and the machine's own fontconfig, `50-user.conf` and `51-local.conf`, are left out on purpose), so the host pages' fallback fonts and symbol glyphs are the same on a dev machine and on the CI runner, and the `-linux` visual references hold on both. A reference taken on a machine without that file would only hold there.

- The fixtures (`e2e/fixtures.js`), the fakes (`e2e/fakes/`), the local test pages (`e2e/pages/`), the Veio showcase (`e2e/vitrine/`) and the list of visual references (`tests/*-visual.spec.js`) are described in the `e2e-suite` skill: `.claude/skills/e2e-suite/SKILL.md`. Open it before adding or changing an e2e test.
- `HEADED=1 npm test` shows the browser.
- While working, run only the specs of the area you changed (`npx playwright test <specs> --workers=2`); the whole suite (about 700 tests) runs in CI (`.github/workflows/testes.yml`, with the Node and bridge tests), not on your machine. A test that also fails on `main` has an open issue: do not prove it again.
- Tests assert what the person sees and what ends up stored, never internal functions. Three narrow exceptions, each named in the test's own comment:
  - Where Chromium gives Playwright no way to drive the native UI or clock (the context menu, the toolbar badge, the midnight alarm, an extension update), a test does what Chrome would do — calls the function Chrome would call (`minerarSelecaoDoMenu`, `registrarMenuDeContexto`, `aoInstalar({ reason: 'update' })`) or fires the alarm early under its own name — and asserts what gets stored or what is handed to Chrome (`chrome.action.getBadgeText`, `getTitle`, the next alarm's time).
  - Until a surface shows a catalog state, the catalog's own guarantees (every ID present, pt-BR numbers) are asserted through `PerpetualMiner.textoDaVoz`, inside an extension page. These move to the screen when the surface is rebuilt.
  - Two guarantees of the base components have no on-screen trigger of their own, so the test calls the component's own function and still asserts the visible result: how long a toast of a given length *stays on screen* (`mostrarToastDeSucesso`), and that a phrase carrying markup is written as text (`escreverFrase`). The surfaces that call them assert the same thing through the screen once they are rebuilt.

The add-on's contract with the extension is tested from both sides on the same examples: `complemento/test_servidor.py` (the real server in the test process) and `e2e/tests/contrato-da-conexao.spec.js` (the fake, whose `/health` answers from `complemento/contrato/exemplos.json`; `fakes.anki.abrirPerfil(perfil)` needs an example for that profile, which `node test_fake_anki.js` checks).

The legacy tests keep running: `node test_sync.js` (loads `lib/sincronizacao.js` for real, two computers over a memory cloud, plus the HTTP adapter over a fake `fetch`), `node test_auto_keyword.js` and the bridge tests in `bridge/test_*.py`.

## Key Constants

- `ATALHOS_PADRAO` in `lib/atalhos.js` — the factory shortcuts: Minerar legenda on **Alt+S**, Minerar seleção with none
- `SENTINEL_VAZIO = 'NENHUM_TRECHO'` in `bookreader.js` — returned by Gemini when no marked passages found (the photo is “Sem marcações”, FOT-10)
- Firebase configuration and Firestore paths: see `lib/sincronizacao.js`
- `BADGE_COR_DE_FUNDO = '#F5B83D'` / `BADGE_COR_DO_TEXTO = '#1A1204'` in `background.js` — the toolbar badge's Veio colors
- `ALARME_VIRADA_DO_DIA` in `background.js` — see `agendarViradaDoDia` for the rollover contract

## Permissions

- `alarms`, `storage`, `unlimitedStorage`, `activeTab`, `tabs`, `contextMenus`, `identity` (for the `alarms` rationale, see [the store guide](docs/publicar-chrome-web-store.md#justificativa-de-cada-permissão); the unpacked-folder auto-reload also uses it)
- `host_permissions`: the Conexão com o Anki (127.0.0.1/localhost:8766), Gemini API, Firestore, Google OAuth, Firebase token endpoints. No `*.firebaseio.com`/`*.firebaseapp.com` (nothing calls them); `test_empacotar.js` checks that the "Host permission use" block of `docs/publicar-chrome-web-store.md` lists exactly these
- Content scripts inject into all URLs with `all_frames: true`
- `painel.html`, `bookreader.html`, `veio/tokens.css`, `veio/componentes.css`, `overlay.css`, `veio/icones/icone.svg` and `veio/fontes/*.woff2` declared as `web_accessible_resources`: the stylesheets, the tile and the fonts are what the in-page overlay loads inside its Shadow DOM

## Testing on devices and the Chrome Web Store

- `lib/auto-recarregar.js` (started by `background.js`): only when `chrome.management.getSelf()` says `installType === "development"`, a 1-minute alarm hashes the files `PerpetualMiner.arquivosDaExtensao` lists and calls `chrome.runtime.reload()` when they change (confirmed after 4 s, so a half-finished `git pull` never reloads). Store installs do nothing. Test: `e2e/tests/atualizacao-automatica.spec.js`, on a temp copy of the extension loaded through the fixture's `pastaDaExtensao`.
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

Single-context: `CONTEXT.md` at the repo root; `docs/adr/` does not exist yet (created with the first recorded decision). See `docs/agents/domain.md`.
