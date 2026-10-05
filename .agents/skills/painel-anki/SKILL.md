---
name: painel-anki
description: "Use when changing or reviewing the Conexão com o Anki area of the panel: Custos, first connection, Baralhos e termos, Vocabulário, Reparar Anki, Ajustes de envio and the Envio ao Anki (`painel-anki*.js`, `painel-ajustes.js`, `painel-envio.js`, `lib/ajustes-de-envio.js`). Reviewers: open it when the PR touches that surface. It holds the architecture notes moved out of CLAUDE.md for it (what it shows, the IDs it implements, its storage and its tests)."
---

# Conexão com o Anki area

Notes moved unchanged from `CLAUDE.md` § Architecture. `CLAUDE.md` keeps the file table and the rules that cross surfaces.

### Conexão com o Anki (`painel-anki.js`, docs/design/painel/anki/, variant C)

The area follows the Conexão state `ConexaoAnki` reports (`acompanhar`):

- **Conectando** (the first `/health` has not come back): the neutral strip “Conectando ao Anki…” (BRG-02) and a
  skeleton in place of Custos.
- **Nunca conectada** (off, and `pm_anki_ja_conectou` was never written on this computer): the ONB-16 card
  (`painel-anki-primeira-conexao.js`, design B “Igual às Boas-vindas”, docs/design/painel/anki/prototipo-primeira-conexao.html)
  takes the place of the tabs, under the shell's F1: the title and `ONB-16.apoio`; the **steps component**
  (`painel-conexao-passos.js`, `PerpetualMiner.PassosDaConexao`, the same one step 4 of the Boas-vindas mounts: #99, #145) with the list of steps beside the step
  card (“Como ligar · Passo N de 2”, the Boas-vindas marks, `aria-current="step"`, Voltar · Continuar); and, across the
  bottom, the Conferência line and the two boxes “Continua funcionando” / “Fica indisponível sem ela”.
  The steps, with no terminal command (`pip`, `python`, Detalhes with commands and Copiar are gone):
  1. **Pôr a Conexão no Anki**: baixar › abrir › Sim › reiniciar. **Baixar a Conexão com o Anki** is an `<a download>` of
     `conexao/perpetualminer.ankiaddon` (the add-on file inside the extension package, no permission); the Detalhes
     “O arquivo não abriu?” (`Veio.montarDetalhes(…, rotulo)`) says the AnkiWeb code to paste in Ferramentas › Complementos ›
     Obter complementos (`PerpetualMiner.CODIGO_DO_ANKIWEB`, none until the first upload, #176) or that it comes soon: never an invented number.
  2. **Reiniciar o Anki**: always there. The extension checks by itself (the shared 15 s `/health`); the status line says Conectando
     and then “Achei o Anki · perfil · versão” from `ConexaoAnki.saude()`; **Tentar de novo** lives here.
  The steps are marked by the real state, and the only thing the extension sees before the Conexão is the Conexão itself (the
  AnkiConnect is not read: no new permission), so the first step says “Esperando a Conexão” and every step turns ✓ together when `/health`
  answers successfully. Without a person's choice, the card opens on the first step, or on the last while connecting; after the card's own Tentar de novo
  it stays on step 2 (the F1's and the Boas-vindas' do not set the person's choice). **2 minutes without an answer** (counted from the first time the person
  sees the steps, or from Baixar) show the 3-item checklist and **Baixar de novo** in whatever step is open, while the check keeps going alone; it leaves when the Conexão answers.
  The status is a `role="status"` region that stays in the DOM (the 1 s clock only redraws the checklist, never the status).
  The Conferência line (“Confere sozinho a cada 15 s · última vez há N s”, “Conferindo agora…” while a check is out) follows the
  shared checks; see the doc comments in `painel-anki-primeira-conexao.js` for its subscription and timer lifecycle. See the
  [Anki area states](../../../docs/design/painel/anki/README.md#estados) for the **Pronto** moment, its status during a new check and focus when the controls or card leave.
  Tests: `e2e/tests/painel-anki-primeira-conexao.spec.js` (behaviour, download, checklist), `boas-vindas.spec.js` (the same component in step 4 and “the same step in both places”),
  `complemento/test_pacote.py` and `test_empacotar.js` (the file inside the package).
- **Desligada** after it answered once: the F1, and Custos shows the last reading (`pm_anki_custos`) with the BRG-12
  selo (“Anki fechado. Mostrando dados de há 2 h.”, with the code in Detalhes) and the period controls set to that reading's
  period and disabled (another period would have nowhere to come from). **Continuar envio** and
  **Reparar Anki** get `aria-disabled` (still in the Tab order) with a `.veio-dica` tooltip (BRG-33) on hover and on keyboard focus (`:focus-visible`, so a click never leaves it open);
  a press does nothing. With the Conexão off and nothing stored, Custos only says “Custo indisponível”:
  the why and Tentar de novo are the F1's.
  Ajustes de envio stays editable, with the BRG-33 note that it applies from the next Envio.

**↻ Atualizar** (BRG-24) is one action, owned by `painel-anki.js`: it asks `ConexaoAnki` for `/health` again
(`ConexaoAnki.conferir`) and, only with the Conexão on, reads Custos again and calls whoever registered through
`PerpetualMiner.Anki.aoAtualizar(fn)` — `painel-anki-baralhos.js` re-reads the decks there, with `launch=1` (“abre o Anki se precisar”),
and the vocabulary. Only a click asks the Conexão to open the Anki (↻ Atualizar, Tentar de novo): entering the area, a new Baralho or the Conexão coming back read without `launch`. `Anki.atualizar()` is the same action for whoever needs it (BRG-17's Atualizar).
Off, nothing tries to open the Anki. BRG-04's Tentar de novo only re-reads Custos.

The relative time (“agora”, “há 5 min”, “há 2 h”, then the PAI-11 day: ontem · há 3 dias) is `Contexto.haQuanto`
(`lib/contexto.js`), shared by Custos, the Envio cards and the Conta chip (CFG-02).

**Custos** reads `GET /analytics/jobs?lang=all[&from&to]` once per period and adds everything up in the panel, so every
total on screen is the sum of the parts on screen — including `otherUsd` (“Outros custos”, shown in the detail only
above zero), which the old screen left out of the parts (#9). Top to bottom: the period (segmented Hoje · Este mês ·
Tudo, default Este mês; De/Até on the right turn the period into a custom range); the tiles Todos os idiomas · Inglês ·
Russo (`aria-pressed`, each with its total and number of Envios), whose choice filters everything below; the summary
strip (BRG-08/29); Origem das imagens of the period (the 4 BRG-09 bars, %, count); **Envios recentes × detalhe**: a
`listbox` (↑ ↓ Home End choose) and the chosen Envio's detail (ENV-08 title, the selo — Concluído, Concluído em parte ·
N de M frases, Não concluído, or Enviando… · the ENV-07 stage —, “N não entrou” and Detalhes with `lastError`, the cost
per part and the total, the Envio's image bar, and Continuar envio only for `partial`/`failed`, which `POST`s
`/jobs/<id>/retry` and shows the ENV-14 toast). States: loading is BRG-25 with the skeleton; an error is **not** the
loading look (#9): “Custo indisponível” (BRG-03) and the persistent BRG-04 aviso with Tentar de novo and Detalhes; empty
is BRG-22 with “Ver tudo” (switches to Tudo).

Money (V7): US$ with 2 decimals, a positive value under 1 cent is “< US$ 0,01” (BRG-26, `< US$ {valor}`), never
“US$ 0,00”; with 4 decimals, under US$ 0,0001 it is “< US$ 0,0001”. The tiles' codes (EN + RU · EN · RU) are BRG-28's. The
**Avançado** (collapsed, dashed, at the foot) has Escolha and Triagem de imagem and the total with 4 decimals, the
switches “Mostrar custos com 4 casas” (every value on the tab goes to 4 decimals) and “Mostrar IDs dos envios” (the
jobId joins the list, the detail and the diagnostics), both remembered on this computer, and Baixar diagnóstico per
Envio (`GET /jobs/<id>/debug-bundle` saved as `diagnostico-<jobId>.json`; the download is the feedback, no toast;
failure is BRG-23 inline).

### Baralhos e termos, Vocabulário and Reparar Anki (`painel-anki-baralhos.js`)

The two tabs read the decks of the Ajustes de envio, which `painel.js` reports through
`PerpetualMiner.Baralhos.usarBaralhos({ en, ru })` on load and on every save (a new deck is read again). Both read on
entering the Anki area with the Conexão on, when it comes back, and on ↻ Atualizar, **each on its own**: decks that
fail never hold the vocabulary (it used to stay in “Aguardando…”, #9).

- **Baralhos e termos** reads `GET /anki/stats/decks` with both decks at once (`deck`/`lang` repeated; `launch=1` on
  ↻ and Tentar de novo only, `refresh=1` on ↻ and after a repair). The tiles Inglês · Russo (`aria-pressed`, group BRG-34.idiomas) say
  “EN · <deck>” and the words (`vocabulary.phraseVocabulary`); a deck the Anki does not have (`missing`) says “—” and
  BRG-27, and its detail is BRG-14 with Abrir Ajustes de envio (→ `#anki/ajustes`). The chosen deck: the maturity ring
  (an SVG `role="img"` named “66% de maturidade”: mature over all cards, recentes = `young + learning`), the big
  number, “palavras diferentes nos cartões” and Cartões · Termos-alvo · Palavra nova por cartão (1 decimal) · Maduros ·
  Recentes · Novos. Ring, bars and legend use the maturity series (ouro · info · muted). Read from the local file
  (`source: 'collection.anki2'`): the BRG-13 note on top; the bridge's own stale cache: the BRG-12 selo “Mostrando dados de … Não deu para atualizar agora.” (`BRG-12.atualizacao`; with the Conexão off, or answering from the file with the Anki confirmed closed (`ankiFechado`), it is `BRG-12.anki`, “Anki fechado. Mostrando dados de {quando}.”, with `{quando}` the stored `dadosDe` (never another Baralho's; the selo's text is redrawn on every read); with the Conexão off and nothing stored the two tabs say BRG-37 instead of staying empty) (see the
  [design states](../../../docs/design/painel/anki/README.md#estados) for presentation by tab). Loading BRG-10 + skeleton;
  failure is the persistent BRG-11 aviso with Reparar Anki, Tentar de
  novo and the cause in Detalhes.
- **Vocabulário** reads `GET /anki/vocabulary` of each language whole (`limit=10000`) and filters in the panel, so
  each tile has the language's total and the search never waits for the network. Tipo (Palavras e termos · Só
  palavras · Só termos), Status (Todos · Novos · Recentes · Maduros · Mistos) and the search (with ×), then BRG-21's
  “N itens em inglês · mostrando N” (a polite live region) and the list × detail: a `listbox` (↑ ↓ Home End, at most
  200 items; the filters narrow; the tile's total is the bridge's `totalWords`, which the 10.000 cap does not cut) whose options say “palavra · 4 cartões” and the status selo, and the item's detail
  (Palavra/Termo · language, the maturity bar, Aparece em · Maduros · Recentes · Novos · Status). Nothing matches:
  BRG-21's empty with Limpar busca (clears the search and both filters, focus to the search; only when there is
  something to clear — a language with no items shows the same empty without it). Loading BRG-19 +
  skeleton; failure is the persistent BRG-20 aviso with Tentar de novo.
- **Reparar Anki** lives in Baralhos' Avançado (dashed, collapsed, “reparar Anki”, BRG-36) and in BRG-11 and BRG-18.
  It `POST`s `/anki/repair` and **waits for the real repair** — the bridge closes the Anki and waits up to 90 s
  (~110 s in all); the old 45 s abort said a working repair had failed (#9). `LIMITE_DO_REPARO_MS` (180 s) only
  guards against a Conexão that never answers. While it runs `#anki-reparando` receives focus; see the
  [design states](../../../docs/design/painel/anki/README.md#estados) for the visible repair state. `ok` or
  `after.collectionReady` → the BRG-16 toast and both tabs read again (`refresh=1`). `devolverOFoco` and
  `focarAzulejo` restore focus for the Avançado and BRG-11 entry points, respectively. Windows refused to close it (`accessDenied`,
  `anki_repair_access_denied`) → BRG-18, persistent, with Reparar Anki again and the PIDs in Detalhes; the repair ran
  (the answer has `after`) and the Anki did not come back, or the panel's limit ran out → BRG-17 with Atualizar
  (`Anki.atualizar()`); any other failure (already repairing, no answer) → GLB-01 with Reparar Anki. All keep the
  cause in Detalhes and close with ×.

A node that stays on screen across redraws (an aviso, the selo, the deck's detail) is reused while its input is the
same (`oMesmo`), so focus and an open Detalhes survive the other tab's reading.

### Ajustes de envio (`painel-ajustes.js`, `lib/ajustes-de-envio.js`)

The `#anki/ajustes` tab is variant A · Cartões of `docs/design/painel/anki/prototipo-ajustes-envio.html` (the owner
picked it over the locked C): one card per language, closed or open like the Configurações cards (one open at a time,
the English one first; the header button `aria-expanded` is the control). A closed card says what is *stored* — the deck,
its `::` levels as ›, and “· foto real” / “· gerada por IA”. Open, it holds the language's form: **Baralho**, **Imagens**
(a segmented control, Foto real (Google) · Gerada por IA, with the cost note under it), the dashed Avançado with the audio
accents, and **Salvar ajustes** with a status beside it (“Salvo”, or “Alterações não salvas” with Salvar in gold).
Nothing is written until Salvar ajustes; saving writes only the language of that card and shows the BRG-07 toast. Each
language's draft survives opening and closing the cards. With the Conexão off the tab stays editable, with the BRG-33
note (drawn by `painel-anki.js`).

The Baralho is a choice among the decks the Anki has: `GET /anki/decks` (the bridge asks AnkiConnect, or reads the local
collection when it is down) is read when the Conexão comes on and on entering the Anki area, and the names show with ›
for the `::` levels. A stored deck the Anki does not have (and the Baralho padrão when missing) stays in the list as
“… · não está no Anki”. Without the list (Conexão off, Anki not answering) the Baralho is a text field: blank goes back
to the Baralho padrão (said under it) and a name with an empty level (`Inglês::`) is refused in the field. The audio
accents (Sotaque da palavra · Sotaque da frase) are selects by place name (Estados Unidos, Reino Unido, Austrália…; the
Google domain stays behind them, and a stored domain outside the list is kept as its own option).

Each language in `ankiBridgePresets` carries a `versao`. The form remembers the version it read; `AjustesDeEnvio.salvar`
refuses when the stored one moved (another tab saved that language meanwhile): nothing is written, and the persistent
aviso (BRG-07.desatualizada, “Mudou em outra aba. Nada foi salvo aqui.”) offers **Ver os novos**, which swaps the draft
for what was saved. A tab without a draft follows another tab's save at once (`acompanhar`). The Envio reads the stored
ajustes when it creates each Envio (never an in-memory copy from when the panel opened) and never writes them; Baralhos e
termos and Vocabulário ask for the same decks (`painel.js` reports them to `Baralhos.usarBaralhos`), and the service
worker's automatic Palavra falls back to the same Baralho padrão. The bridge keeps its own defaults (out of this step).

### Envio ao Anki (`painel-envio.js`)

The Envio is its own module; `painel.js` hands it, once the first read of the history finishes (`Envio.usar`), only
what it does with phrases: the selection, the mining line, `apagar(ids)` (the usual delete, with
tombstones, no toast) and `marcarComoEnviadas(ids)` (`status: 'exported'`, no toast, the selection untouched).

**Enviar ao Anki** opens the progress modal at once (ENV-05 is silence), with one card per Envio — one per language:
“Envio em inglês · 12 frases”, the stage in people's words (ENV-07, from the bridge `stage`), the 7 stages as segments
(the done ones full, the current one filling by its `done/total`; all in the outcome's color at the end), “etapa 4 de 7 ·
atualizado há 1 min” (ENV-08) and a collapsed Detalhes with jobId, raw stage, ISO
time (the bridge's `updatedAt`, or when the Envio was created) and `lastError`. A card that needs the person has no error box: its stage and segments turn calm (muted), the reason is one short
sentence and the action is a gold link below it (`pedidoDoCartao`). An Envio that ended partial or failed while another
still runs gets **Continuar envio →** (`POST /jobs/<id>/retry`, toast ENV-14); when the bridge says Windows would not let
it close a stuck Anki (`ankiError: 'repair_access_denied'`), the reason is BRG-18. Phrases go to the Envio of their language by `ehRussa` (`lib/idioma.js`), the same rule
the list uses: the stored `idioma`, or the text when it is missing. A `POST /jobs` that fails does not hide the Envio: its card says “Não começou”
with the ENV-03 reason (`motivoSemResposta` when the request never got an answer), its cause in Detalhes, and
**Tentar de novo →**, which re-creates only that language. While such an error is on a card (or a Continuar envio that failed, ENV-14), the summary
waits: the progress modal comes back with it, and the summary opens once the person closes it, counting those phrases
as failed. `pm_envio` is written after each `POST /jobs`. The footer is ENV-15. `GET /jobs` runs every 2 s while something is running; when it fails the modal says
ENV-09 and keeps trying. Phrases already in a running Envio are not sent twice (a second click only reopens the modal),
and the Veio modal ignores the second press of a double click, so it does not close the modal the first press opened.

The tracked Envios live in `pm_envio`, so reloading the panel keeps them (without reopening the modal). When nothing is
running and at least one Envio started, the **summary** (ENV-10) opens by itself in whatever area of the panel is on screen (never over the Boas-vindas: it waits for the person to enter an area), once no
other modal is open. It has one block per language: `+N cartões` (sent now), `no baralho <deck>` (the deck saved on the
Envio when it was created, its `::` levels shown as ›), `N já estava lá` (the bridge's `duplicatePhraseIds`, never counted
as sent) and `N não entrou` (what did not become a card, including an Envio that never started; a phrase the bridge lists
both in `successfulPhraseIds` and `failedPhraseIds` counts as failed, so it is never deleted) with **Tentar de novo**,
which redoes only that language. Below the blocks, the history question: “Tirar as N enviadas do histórico?” with
**Manter** and **Tirar do histórico**; N counts only the sent phrases still in the history, the ones deleted meanwhile
are named (“1 enviada você já tinha apagado.”), and with none left it says “Nada para tirar do histórico.” with **Pronto**.
**Manter** — and Pronto, ×, Esc, a click outside — marks the sent and the duplicates Enviada ao Anki, no toast (ENV-12).
**Tirar do histórico** deletes only the ones sent now, marks the duplicates, and shows the ENV-11 toast. Either answer
clears `pm_envio`. With the Conexão off (from `ConexaoAnki`), Enviar ao Anki has `aria-disabled` (not `disabled`), `aria-describedby` and a
tooltip on hover and keyboard focus only (`PAI-32.enviarIndisponivel`): nothing stays on the bar while the Conexão is off, which
can be for days before the Anki is set up.
