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
| `painel-boas-vindas.js` | The Boas-vindas (`#boas-vindas[/<passo>]`, no sidebar): 11 items, one step per card (step 1 `painel-boas-vindas-minerar.js`, step 4 `PassosDaConexao`; step 7 `painel-boas-vindas-nivel.js` with the level quiz of #170: `lib/quiz-de-nivel.js`, `painel-boas-vindas-quiz.js` + `painel-quiz.css`, its celebration: `lib/festa-do-quiz.js`, `lib/som-do-quiz.js`, `painel-boas-vindas-festa.js`; step 9 `painel-boas-vindas-envio.js`), progress in `pm_boas_vindas`. See the `boas-vindas` skill |
| `lib/ranking.js` | Group ranking of the level quiz (#172); rules: `docs/seguranca/ranking-do-grupo.md` |
| `painel-boas-vindas-ranking.js` | The ranking under the quiz result (ONB-24) |
| `lib/atalhos.js` | `PerpetualMiner.Atalhos` — the recorded shortcuts in one place: where they are stored, the defaults, the PT-BR label, “same shortcut” and event matching, and `digitandoNumCampo` (the key belongs to a text field). Loaded by the content script, the panel and the popup |
| `painel-chave.js` | The Configurações › Chave do Gemini card: the saved key masked, with Trocar chave; the empty key's field; `geminiApiKey`. See “Chave do Gemini and Zona de perigo” in the `configuracoes` skill |
| `painel-ia.js`, `painel-ia-chatgpt.js`, `painel-ia-modelo.js/css` | The Configurações › IA dos cartões card (`PerpetualMiner.CartaoDaIA.montar`, design A of #101): the Chave da OpenAI column (pasted, checked by the Conexão, masked), the Conta do ChatGPT one (login #155), each with its error strip, and the Avançado with the Modelo dos cartões (#157); in Configurações and Boas-vindas. See “IA dos cartões” in the `configuracoes` skill |
| `docs/seguranca/chave-da-openai.md` | Threat model for the account's OpenAI key and the owner-pending Firestore rules |
| `lib/chave-da-openai.js` | `PerpetualMiner.ChaveDaOpenAI` — transient save/delete/sync requests to the sole owner in the Conexão; `pm_chave_openai` caches only mask/UID/revision/unsent flag. No secret vault or per-UID pending work; exact-proof legacy migration clears the old store. See the module header and `docs/seguranca/chave-da-openai.md` |
| `complemento/nuvem_da_chave.py` | Stdlib Firestore adapter used by the Conexão's owner, with a transient bearer credential, fixed project URL and sanitized failures; no key-reading endpoint for the extension |
| `e2e/tests/chave-autoridade.spec.js` | Native Chromium owner regressions of the key (lost reply, late acceptance, same-suffix change, legacy UID, wipe); only external boundaries are faked |
| `painel-perigo.js` | The Configurações › Zona de perigo card: the Apagar tudo entry, its reach with and without an account, and the Veio confirmation modal (CFG-17). See “Chave do Gemini and Zona de perigo” in the `configuracoes` skill |
| `painel-abrir-anki.js` | The Configurações › Conexão com o Anki card: the “Abrir o Anki com o computador” switch (CFG-36…40, off by default) and the “Perfil do Anki ▾” row (CFG-43, #149). See the `configuracoes` skill |
| `painel-anki.js` | The Custos tab (BRG-03…04, 12, 22, 25…33), the area's initial Conectando strip and the Ajustes de envio offline note; mounts `PrimeiraConexao`. See “Conexão com o Anki” in the `painel-anki` skill |
| `painel-anki-primeira-conexao.js` | `PerpetualMiner.PrimeiraConexao` — the ONB-16 flow of the first connection (design B, #77): the card over the tabs (it toggles `anki--primeira-vez`), the Conferência line, the two boxes and the Pronto moment; the steps are `PassosDaConexao`. See “Conexão com o Anki” in the `painel-anki` skill |
| `painel-conexao-passos.js`, `painel-conexao-arraste.js/css` | `PerpetualMiner.PassosDaConexao` — the steps to put the Conexão in the Anki (Boas-vindas step 4, ONB-16; #99, #145); `DesenhoDoArraste`: the Mac drag drawing (#238). See “Conexão com o Anki” in the `painel-anki` skill. AnkiWeb code: `lib/ankiweb.js` |
| `conexao/perpetualminer.ankiaddon` | The Conexão com o Anki as the file the person downloads (a link of `PassosDaConexao`), shipped in the Web Store package (`scripts/arquivos-do-pacote.js`). Built at the merge by `complemento/versao_no_merge.py`, not in a PR; `complemento/test_pacote.py` fails on the main while it is behind; `test_empacotar.js` checks it in the store zip |
| `painel-anki-plano.js` | `PlanoDosCustos` (the Custos card for the ChatGPT plan, BRG-40) and `SomaDosCustos` (the tab's sums: an Envio's cost parts, #169) |
| `painel-anki-baralhos.js` | `PerpetualMiner.Baralhos` — Baralhos e termos and Vocabulário in the Conexão com o Anki area (BRG-10…14, 19…21, 27, 34, 35, GLB-01). See “Baralhos e termos and Vocabulário” in the `painel-anki` skill |
| `painel-ajustes.js` | The Ajustes de envio tab: one card per language, its form saved only on Salvar ajustes, the Baralho picked from the Anki's decks, and the stale-tab refusal (#35). See “Ajustes de envio” in the `painel-anki` skill |
| `painel-anki-estilo.js`, `painel-anki-previa.js`, `painel-anki-tipo-proprio.js`, `painel-previa.css` | Estilo do cartão in Ajustes de envio: level, preview, “Usar um tipo que já tenho” (#162, #164, #165) |
| `painel-envio.js` | The Envio ao Anki: Enviar ao Anki in the Frases bar, the progress modal, the tracking in `pm_envio` and the summary (ENV-03…15). See `painel-anki` skill |
| `painel-envio-anki-fechado.js` | `PerpetualMiner.EnvioComOAnkiFechado` — Enviar ao Anki with the Anki closed (#150): the ENV-16 notice, the pending Envio and the Consertar outcome (BRG-39). See “Envio ao Anki” in the `painel-anki` skill |
| `painel-envio-cartao.js` | `CartaoDoEnvio`: an Envio's card in the progress modal, “Abrir <perfil>” (ENV-17), Esquecer (ENV-23) |
| `painel-envio-apagar.js` | `EnvioApagarFrases`: the Apagar tudo request (CFG-17) |
| `painel-envio-parado.js` | `EnvioParado`: the Envio stopped by a closed Anki (#151): ENV-18, Continuar envio |
| `painel-envio-limite.js` | `EnvioNoLimite`: the Envio waiting for the ChatGPT plan's limit (#158): ENV-19, three actions |
| `painel-teto.js`, `painel-teto.css` | `TetoDoMes` and `EnvioNoTeto`: the monthly cap (#160): the 80% warning, the Custos card, the Envio band (ENV-21) |
| `painel-conexao-versao.js`, `painel-conexao-versao-estado.js` | Painel-top notices: the Conexão version (#177; `AvisoDaVersao`; map `conexao-versao`) and the pairing (#192, BRG-52; map `pareamento`) |
| `bookreader.html/js/css` | Minerar de uma foto (ex-BookReader): book photos → Gemini Vision reads the marked passages → the person picks which phrases to mine. See “Minerar de uma foto” in the `minerar-foto` skill |
| `veio/` | Shared Veio identity: `tokens.css` (color/type/radius/motion tokens, the mark's cursor), `tema.js` (the chosen theme, applied before the first paint on every page), `componentes.css` + `componentes.js` (the base components, defined once), `fontes/` (Manrope and JetBrains Mono `.woff2`), `icones/` (toolbar PNGs, SVG marks). See `veio/README.md` |
| `lib/voz/catalogo.js`, `lib/voz/catalogo-nivel.js` | The runtime Voice catalog as data (the second: BRG-43 to 52, ONB-20 to 25); copy and voice rules: `docs/design/voz/README.md`, its source. `docs/design/voz/catalogo.html` is generated from that README (`node scripts/gerar-catalogo-da-voz.js`; it also rewrites `catalogo-textos.json`) and `node test_voz.js` fails when a copy drifts |
| `lib/voz/texto.js` | `textoDaVoz(id, valores)` — a state by ID, templates filled |
| `lib/idioma.js` | `detectarIdioma(texto)` — the one language detector (Cyrillic → Russo, else Inglês) |
| `lib/contexto.js` | `PerpetualMiner.Contexto` — the Contexto as the screen says it: the Fonte's name (PAI-29, `fonteDaFrase`, `nomeDaFonte`), the phrase's day (PAI-11, `rotuloDoDia`) and how long ago something happened (`haQuanto`: agora · há 5 min · há 2 h · ontem). Loaded by the panel and the popup, so a phrase never has two names |
| `lib/conexao-anki.js` | `PerpetualMiner.ConexaoAnki` — the shared owner of `/health`, the connection state and the stored first-success fact across panel and popup. See the module's doc comments for its lifecycle and API contract |
| `lib/conexao-na-tela.js` | `PerpetualMiner.ConexaoNaTela` — the shared presentation of the Conexão in the F1 strip, the ONB-16 card and step 4 of the Boas-vindas. See the module's doc comments for its API and caller responsibilities |
| `lib/configuracao.js` | `PerpetualMiner.Configuracao` — the first-run setup in one place: the 9 steps of the Boas-vindas, when each is done, “agora não”, `pm_boas_vindas`, and the “Configuração pela metade” reminder (ONB-14, ONB-15). Loaded by the panel and popup. See “Configuração pela metade” in the `boas-vindas` skill |
| `painel-lembrete.js` | The ONB-15 strip at the top of Frases: the progress ring, “N de 9 passos”, Ocultar and Continuar configuração. See “Configuração pela metade” in the `boas-vindas` skill |
| `lib/ajustes-de-envio.js` | `PerpetualMiner.AjustesDeEnvio` — the Ajustes de envio in one place: the Baralho padrão of each language, the stored shape of `ankiBridgePresets`, the per-language save that refuses a stale version, and `acompanhar`. Loaded by the panel and the service worker: one default deck everywhere |
| `lib/mineracao.js` | `PerpetualMiner.Mineracao` and `PerpetualMiner.minerarFraseManual` — shared mining requests and selection context. See the module's doc comments for the API, confirmation and title-compatibility contracts |
| `lib/mineracao-do-dia.js` | `PerpetualMiner.MineracaoDoDia` — shared automatic-mining day rules and storage/message channel names. See the module's doc comments for normalization and the day-query API |
| `lib/apagar-frases-pendente.js` | `PerpetualMiner.ApagarFrasesPendente`: resends a pending Apagar tudo every 30 s |
| `lib/pedido-ao-anki.js` | `PerpetualMiner.PedidoAoAnki` — the only way the extension asks the Conexão com o Anki: one builder per request; `pedir(endereco, pedido, opcoes)` sends only what a builder made and signs it (`lib/pareamento.js`), except `saude` and the pairing. `e2e/variantes-do-pedido-ao-anki.js` lists every request for `node test_contrato_fechado.js`. Loaded by the service worker, the panel and the popup |
| `lib/pareamento.js` | `PerpetualMiner.PareamentoComOAnki` — this browser's pairing with the Conexão (#192): the HMAC credential (non-extractable `CryptoKey`, IndexedDB `pm-pareamento`), the `conferir` proof, request signatures and answer proofs. Design: `docs/design/pareamento-da-conexao.md` |
| `lib/abridor.js` | `PerpetualMiner.Abridor` — the Conexão's opener seen from the extension (#147): the host `com.perpetualminer.abridor`, the optional `nativeMessaging`, `conferirOAnki()`, `abrirOAnki()`, `consertarOAnki()` (#152) and the step's “Agora não” (`pm_abridor`). Results and the hidden `abridor.html` frame: the header comment. Loaded by the panel and the popup |
| `lib/abrir-o-anki.js` | `PerpetualMiner.AbrirOAnki` — opening the Anki on the person's click (#150) and the opener's own repair (#152, BRG-39): `abrirOuConsertar()` (`consertar` first, `abrir` only for a closed Anki), `esperarOAnki()`, the Abrir o Anki button (BRG-38). Loaded by the panel and the popup |
| `abridor.html` | The empty page the panel keeps in a hidden `<iframe id="abridor-ponte">`, for `lib/abridor.js` to borrow a fresh `chrome.runtime` (no script of its own; `test_preview.js` names it as the one page that loads nothing) |
| `lib/vocabulario-da-mineracao.js` | `PerpetualMiner.VocabularioDaMineracao` — the last vocabulary reading the Mineração automática uses (`pm_auto_keyword_vocab_en` / `_ru`) and `lerLeituras()`. **It has no expiry**; fields and closed-Anki cases: the module's header comment |
| `lib/mineracao-automatica.js` | `PerpetualMiner.MineracaoAutomatica` — the automatic mining seen from a page: `lerEstado()` / `salvarAjustes(mudanca)` and `ligarCampoDoLimite(campo, …)`, the 1–100 daily-limit field. Shared by the popup's tiles and step 6 of the Boas-vindas |
| `lib/arquivos-da-extensao.js` | `PerpetualMiner.arquivosDaExtensao(lerTexto)` — the files the extension uses at run time, found from `manifest.json` (service worker and its `importScripts`, content scripts, icons, pages and what they load). Read by `lib/auto-recarregar.js` and by `scripts/empacotar-extensao.mjs`, so the two never disagree |
| `lib/auto-recarregar.js` | `PerpetualMiner.AutoRecarregar.iniciar()` — called at the top of `background.js`; reloads an unpacked (`development`) extension when its files change. See “Testing on devices and the Chrome Web Store” below |
| `scripts/` | `atualizar-extensao.sh` (+ the launchd `.plist` example) keeps a clone on `main` up to date; `empacotar-extensao.mjs` builds the Web Store zip; `arquivos-do-pacote.js` says which files ship; `ci/` holds what `testes.yml` runs as code, among it `checks-obrigatorios.js` + `.json`. See `docs/instalar-extensao.md` and `docs/publicar-chrome-web-store.md` |
| `complemento/` | The Conexão com o Anki as an Anki add-on: an stdlib HTTP server on `127.0.0.1:8766` in an Anki thread, answering only the signed requests of a paired browser (`pareamento.py`, #192; `GET /health` and the pairing routes are open). Modules and write rules: `complemento/LEIA-ME.md`; routes and examples (closed both ways by `test_contrato_fechado.js` and `test_servidor.py`): `complemento/contrato/LEIA-ME.md`. Tests: `python3.9 complemento/test_*.py` and `python3.13 …` |
| `test_fake_anki.js` | Node test of the e2e fake of the Conexão com o Anki (`e2e/fakes/anki.js`): it answers `/health` from the contract examples (`complemento/contrato/exemplos.json`) and refuses a context (a profile) the examples do not have |
| `test_abridor.js` | Node test of `lib/abridor.js` over a test `sendNativeMessage`: each contract answer read on screen, and an answer outside the contract never read as “found” or “opened” |
| `test_abrir_o_anki.js` | Node test of `lib/abrir-o-anki.js`: the permission is asked inside the click, `consertar` before `abrir`, and the wait is limited |
| `test_fake_abridor.js` | Node test of the e2e fake opener (`e2e/fakes/abridor*.js`, the host the fixture registers in each profile): run as Chrome runs it, it answers each `daExtensao` example of the contract's `abridor` and `conserto` sections and refuses a situation the contract lacks |
| `test_contrato_fechado.js` | Node test that the contract has an example of every request the extension makes: it asks `VariantesDoPedidoAoAnki.variantes` (two Baralhos) and requires a `daExtensao` example of each, which the e2e fake then answers (`test_fake_anki.js`). The add-on side is the end of `complemento/test_servidor.py`: each status the server answered needs one too |
| `test_empacotar.js` | Node test of the Web Store package contents and of the store guide's host-permission block |
| `test_quiz_de_nivel.js` | Node tests of the level quiz and, in `test_festa_do_quiz.js`, of its celebration |
| `test_ranking.js` | Node test of `lib/ranking.js` |
| `test_voz.js` | Node test of the Voice catalog vs the README and the snapshot `catalogo-textos.json` (red until `node scripts/gerar-catalogo-da-voz.js`); `scripts/voz-da-spec.js` and `scripts/conferir-voz.js` read and compare |
| `test_ids_da_voz.js` | Node test: no Voice ID is defined twice in `lib/voz/` |
| `test_preview.js` | Node test of the preview: it runs `preview/montar.mjs --saida <tmp>` and checks that every file the extension uses (`arquivosDaExtensao`) and everything each page loads is in the output |
| `scripts/regras/` | The review rules a script can check (`verificar.js`, one file per rule, `linha-de-base.json`, proofs in `test_*.js`), run locally and by `.github/workflows/regras.yml`. See `AGENTS.md` § Rules and what enforces them |
| `scripts/testes.json`, `scripts/testar.mjs`, `scripts/grupos-de-teste.js`, `scripts/test_testar.mjs` | The test groups: `testes.json` says which files each group runs (`fora` lists test-named files that are not tests), `testar.mjs` runs a group (`node scripts/testar.mjs <group> [-- args]`, `--listar`) and is the only command the workflows call, `grupos-de-teste.js` resolves a group to its files, `yaml-de-workflow.js` reads a workflow, `test_testar.mjs` tests them |
| `e2e/` | Playwright suite that runs the unpacked extension in Chromium (own `package.json`; see Testing); `aprovados-visuais.json` is the visual approval book |
| `e2e/estado-final.js` | `estadoFinal`, `estadoFinalEm`, `estadoFinalInalterado`: the e2e checks of what ended up stored after a test acts (storage, a source outside it, "nothing written"); they refuse an empty expectation. Required by the rule `e2e-estado-final`; see the `e2e-suite` skill. Tested by `e2e/tests/estado-final.spec.js` |
| `e2e/relogio-parado.js` | `pararRelogio`: the one place that sets up the test clock (`clock.install` + `pauseAt`, stopped at the asked instant with a margin larger than the test deadline), behind the `relogioParado` fixture of `e2e/fixtures.js`. Required by the rule `relogio-fora-da-fixture`; see the `e2e-suite` skill. Proved by `e2e/tests/relogio-parado.spec.js` |
| `.agents/skills/verify-perpetualminer/` | The `/verify-perpetualminer` skill: how an agent drives and proves the extension through the e2e harness. `SKILL.md`, the feature map in `features/` and `scripts/` (`doctor.sh`, `drive.sh`, `cleanup.sh`, `lib.sh`, `conexao-real.py`, `mapa-de-features.sh`, `test_helpers.sh`). Dev tooling, never packaged. `.claude/skills/` links to it |
| `e2e/fontconfig/fonts.conf` | The fonts the test Chromium sees: only the DejaVu files, no user or local font config, so the visual references render the same on every machine (loaded by the e2e fixture; see Testing) |
| `.github/workflows/testes.yml` | The PR gate on `ubuntu-24.04`, every job calling `node scripts/testar.mjs <group>`: the fast groups in one job “Testes rápidos”, the add-on (Python 3.9 and 3.13) and the whole e2e suite (sharded, rerun once when a test fails; each slice skips itself on a documentation-only PR or a push to `main`, `scripts/ci/classificar.sh`); see Testing |
| `preview/` | The static site Vercel publishes per branch (`montar.mjs` assembles it from `arquivosDaExtensao`; `chrome-simulado.js` fakes `chrome.*` in the copied pages) and `site/`, the public `/sobre/` and `/privacidade/` pages that Google's OAuth consent screen asks for. See `preview/README.md` |

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

Single-context: `CONTEXT.md` at the repo root; `docs/adr/` does not exist yet (created with the first recorded decision). See `docs/agents/domain.md`.
