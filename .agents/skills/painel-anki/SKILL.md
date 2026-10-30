---
name: painel-anki
description: "Use when changing or reviewing the Conexão com o Anki area of the panel: Custos, first connection, Baralhos e termos, Vocabulário, the Consertar sozinho, Ajustes de envio and the Envio ao Anki (`painel-anki*.js`, `painel-ajustes.js`, `painel-envio.js`, `lib/ajustes-de-envio.js`). Reviewers: open it when the PR touches that surface. It holds the architecture notes moved out of CLAUDE.md for it (what it shows, the IDs it implements, its storage and its tests)."
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
  1. **Ter o Anki** (#146, ONB-18): the question “Você já tem o Anki?” with the two answers (the choice lives only on
     the screen; it goes back to the question when the Conexão answers). **Não tenho** opens the Anki's download page
     (`https://apps.ankiweb.net/`) in a new tab (`target="_blank"`, so the panel stays on the step; the Anki has no
     fixed installer address: one file per processor, with the version in its name) and says what to do after it by the
     person's system (`navigator.userAgentData?.platform`, else the user agent): the Mac's, Windows' or the general sentence. **Já tenho** asks the Conexão's opener (#147) to open the Anki when the `nativeMessaging`
     permission is already granted (`Abridor.abrirOAnki`: only `{ achou: true, abriu: true }` is `ABRIU`; “O Anki está abrindo…” waits for the Conexão, which the 15 s check finds); without the
     permission, without the opener, or when it does not open, the manual path (“Abra o Anki para continuar.”). Before the Conexão
     the step never says “não encontrado”: not installed, closed and open without it give the same silence.
  2. **Pôr a Conexão no Anki**: baixar › abrir › Sim › reiniciar. **Baixar a Conexão com o Anki** is an `<a download>` of
     `conexao/perpetualminer.ankiaddon` (the add-on file inside the extension package, no permission); above it, the
     ONB-19 animation of the Anki's own warning (#146): two frames alternating by themselves — the warning the Anki
     shows when the file opens, and the same dialog with the Sim marked, where to click; still, side by side, with
     `prefers-reduced-motion: reduce`. The Detalhes “O arquivo não abriu?” (`Veio.montarDetalhes(…, rotulo)`) says the AnkiWeb code to paste in Ferramentas › Complementos ›
     Obter complementos (`PerpetualMiner.CODIGO_DO_ANKIWEB`, none until the first upload, #176) or that it comes soon: never an invented number.
  3. **Reiniciar o Anki**: always there. The extension checks by itself (the shared 15 s `/health`); the status line says Conectando
     and then “Achei o Anki · perfil · versão” from `ConexaoAnki.saude()`; **Tentar de novo** lives here.
  4. **Abrir o Anki sozinho** (#147, ONB-17): when the Conexão answers, the card moves to it by itself (the connection's status line stays).
     **Permitir abrir o Anki** calls `Abridor.pedirPermissao()` inside the click (Chrome's prompt for the optional `nativeMessaging`) and,
     granted, checks the opener (`Abridor.conferirOAnki()`: only “is Anki there?”); with the permission already granted it checks with no
     click. **Agora não** writes `pm_abridor: { agoraNao: true }` and marks the step “agora não” (a later grant writes `false`). Not found or
     no answer (10 s, or the host is not registered: an older Conexão) say what to do, with Tentar de novo and Chrome's message in Detalhes.
     The opener's state is one per page (the Boas-vindas and this card are in the same panel), so it is checked once. In this card the
     **Pronto** moment waits for step 4 to be resolved (found, or Agora não); a stored Agora não goes straight to Pronto.
  The steps are marked by the real state, and before the Conexão the extension sees only the Conexão itself (no AnkiConnect, no new
  permission), so the first three steps say nothing about the Anki until `/health` answers, and turn ✓ together; the fourth, when the
  opener finds Anki. Without a person's choice, the card opens on the first step, or on Reiniciar o Anki while connecting; one that has
  answered ligada once (on this page, or on this computer: `ConexaoAnki.jaConectou()`) falls back to Reiniciar o Anki when the Conexão
  goes off again. After the card's own Tentar de novo it stays on step 3 (the F1's and the Boas-vindas' do not set the person's choice).
  **2 minutes without an answer** (counted from when the person really sees the steps — the host passes the visibility to `mostrar` — or
  from Baixar) show the 3-item checklist and **Baixar de novo** in whatever step is open, while the check keeps going; it leaves when the
  Conexão answers. On step 3 an automatic check in flight over a Conexão that was off shows “Conectando” with no click
  (`ConexaoAnki.conferindo()`, `aoConferir`); one that was on stays on, and a failure goes back to “desligada”. One primary control per
  screen: with the card's own Voltar · Continuar the primary is the step's action (Baixar, Tentar de novo) and Continuar an outline;
  inside the Boas-vindas the card has only outlines and the host's Continuar is the primary. The status is a `role="status"` region that
  stays in the DOM (the 1 s clock only redraws the checklist).
  The Conferência line (“Confere sozinho a cada 15 s · última vez há N s”, “Conferindo agora…” while a check is out) follows the
  shared checks; see the doc comments in `painel-anki-primeira-conexao.js` for its subscription and timer lifecycle. See the
  [Anki area states](../../../docs/design/painel/anki/README.md#estados) for the **Pronto** moment, its status during a new check and focus when the controls or card leave.
  Tests: `e2e/tests/painel-anki-primeira-conexao.spec.js` (behaviour, download, checklist), `ter-o-anki.spec.js` (the first step, the warning animation), `abrir-o-anki-sozinho.spec.js` (the opener step, against the fake opener), `boas-vindas.spec.js` (the same component in step 4),
  `complemento/test_pacote.py` and `test_empacotar.js` (the file inside the package).
- **Desligada** after it answered once: the F1, and Custos shows the last reading (`pm_anki_custos`) with the BRG-12
  selo (“Anki fechado. Mostrando dados de há 2 h.”, with the code in Detalhes) and the period controls set to that reading's
  period and disabled (no other period to read). **Continuar envio**
  gets `aria-disabled` (still in the Tab order) with a `.veio-dica` tooltip (BRG-33) on hover and on keyboard focus (`:focus-visible`);
  a press does nothing. With nothing stored, Custos only says “Custo indisponível” (the why and Tentar de novo are the F1's).
  Ajustes de envio stays editable, with the BRG-33 note that it applies from the next Envio.

**↻ Atualizar** (BRG-24) is one action, owned by `painel-anki.js`: it asks `ConexaoAnki` for `/health` again
(`ConexaoAnki.conferir`) and, with the Conexão on, reads Custos again and calls whoever registered through
`PerpetualMiner.Anki.aoAtualizar(fn)` — `painel-anki-baralhos.js` re-reads the decks there, with `launch=1` (“abre o Anki se precisar”),
and the vocabulary. Only a click asks the Conexão to open the Anki (↻ Atualizar, Tentar de novo): entering the area, a new Baralho or the Conexão coming back read without `launch`.
Off, nothing tries to open the Anki, except the **Abrir o Anki** button (BRG-38, `AbrirOAnki.montarBotao`, #150) in the BRG-12 `anki` selo
and BRG-37 of both tabs, and in the popup (`abrir-o-anki-botao.spec.js`). BRG-04's Tentar de novo only re-reads Custos.

The relative time (PAI-11) is `Contexto.haQuanto` (`lib/contexto.js`), shared by Custos, the Envio cards and the Conta chip (CFG-02).

**Custos** reads `POST /analytics/jobs` (`{ lang: 'all', from?, to? }`, `PedidoAoAnki.custosDosEnvios`) once per period and adds everything up in the panel, so every
total on screen is the sum of the parts on screen — including `otherUsd` (“Outros custos”, shown in the detail only
above zero), which the old screen left out of the parts (#9). Top to bottom: the period (segmented Hoje · Este mês ·
Tudo, default Este mês; De/Até on the right turn the period into a custom range); the tiles Todos os idiomas · Inglês ·
Russo (`aria-pressed`, each with its total and number of Envios), whose choice filters everything below; the **plano card** (BRG-40, `painel-anki-plano.js`: only when the period has Cartões the ChatGPT plan made, #159; its Cartões, “Você economizou” from `plan.wouldCostUsd`, Gerenciar uso ↗; the line has `plan` only then); the summary
strip (BRG-08/29); Origem das imagens of the period (the 4 BRG-09 bars, %, count); **Envios recentes × detalhe**: a
`listbox` (↑ ↓ Home End choose) and the chosen Envio's detail (ENV-08 title, the selo — Concluído, Concluído em parte ·
N de M frases, Não concluído, or Enviando… · the ENV-07 stage —, “N não entrou” and Detalhes with `lastError`, the cost
per part and the total, the Envio's image bar, and Continuar envio only for `partial`/`failed`, which `POST`s
`/jobs/retry` (`{ jobId }`) and shows the ENV-14 toast). States: loading is BRG-25 with the skeleton; an error is **not** the
loading look (#9): “Custo indisponível” (BRG-03) and the persistent BRG-04 aviso with Tentar de novo and Detalhes; empty
is BRG-22 with “Ver tudo” (switches to Tudo).

Money (V7): US$ with 2 decimals, a positive value under 1 cent is “< US$ 0,01” (BRG-26), never “US$ 0,00”; with 4
decimals, under US$ 0,0001 it is “< US$ 0,0001”. The tiles' codes are BRG-28's. The **Avançado** (collapsed, dashed, at the foot)
has Escolha and Triagem de imagem and the total with 4 decimals, the switches “Mostrar custos com 4 casas” (every value on the
tab) and “Mostrar IDs dos envios” (the jobId joins the list, the detail and the diagnostics), both remembered on this computer,
and Baixar diagnóstico per Envio (`POST /jobs/debug-bundle` with `{ jobId }`, saved as `diagnostico-<jobId>.json`; the download
is the feedback, no toast; failure is BRG-23 inline).

### Baralhos e termos and Vocabulário (`painel-anki-baralhos.js`)

The two tabs read the decks of the Ajustes de envio, which `painel.js` reports through
`PerpetualMiner.Baralhos.usarBaralhos({ en, ru })` on load and on every save (a new deck is read again). Both read on
entering the Anki area with the Conexão on, when it comes back, and on ↻ Atualizar, **each on its own**: decks that
fail never hold the vocabulary (it used to stay in “Aguardando…”, #9).

- **Baralhos e termos** reads `POST /anki/stats/decks` with both decks at once (body `{ decks: [{ deckName, lang }, …] }`; `launch: true` on
  ↻ and Tentar de novo only, `refresh: true` on ↻; the add-on ignores both, it never opens the Anki). Reads of the
  person's Anki are POST because the extension's GET carries no `Origin` (`complemento/contrato/LEIA-ME.md`). The tiles Inglês · Russo (`aria-pressed`, group BRG-34.idiomas) say
  “EN · <deck>” and the words (`vocabulary.phraseVocabulary`); a deck the Anki does not have (`missing`) says “—” and
  BRG-27, and its detail is BRG-14 with Abrir Ajustes de envio (→ `#anki/ajustes`). The chosen deck: the maturity ring
  (an SVG `role="img"` named “66% de maturidade”: mature over all cards, recentes = `young + learning`), the big
  number, “palavras diferentes nos cartões” and Cartões · Termos-alvo · Palavra nova por cartão (1 decimal) · Maduros ·
  Recentes · Novos. Ring, bars and legend use the maturity series (ouro · info · muted). Read from the local file
  (`source: 'collection.anki2'`): the BRG-13 note on top; the bridge's own stale cache: the BRG-12 selo “Mostrando dados de … Não deu para atualizar agora.” (`BRG-12.atualizacao`; with the Conexão off, or answering from the file with the Anki confirmed closed (`ankiFechado`), it is `BRG-12.anki`, “Anki fechado. Mostrando dados de {quando}.”, `{quando}` being the stored `dadosDe` (never another Baralho's), and the Abrir o Anki button; off with nothing stored the two tabs say BRG-37, with the same button) (see the
  [design states](../../../docs/design/painel/anki/README.md#estados) for presentation by tab). Loading BRG-10 + skeleton;
  failure is the persistent BRG-11 aviso with Tentar de novo and the cause in Detalhes.
- **Vocabulário** reads `POST /anki/vocabulary` (`{ deck, lang, limit: 10000 }`) of each language whole and filters in the panel, so
  each tile has the language's total and the search never waits for the network. Tipo (Palavras e termos · Só
  palavras · Só termos), Status (Todos · Novos · Recentes · Maduros · Mistos) and the search (with ×), then BRG-21's
  “N itens em inglês · mostrando N” (a polite live region) and the list × detail: a `listbox` (↑ ↓ Home End, at most
  200 items; the filters narrow; the tile's total is the bridge's `totalWords`, which the 10.000 cap does not cut) whose options say “palavra · 4 cartões” and the status selo, and the item's detail
  (Palavra/Termo · language, the maturity bar, Aparece em · Maduros · Recentes · Novos · Status). Nothing matches:
  BRG-21's empty with Limpar busca (clears the search and both filters, focus to the search; only when there is
  something to clear — a language with no items shows the same empty without it). Loading BRG-19 +
  skeleton; failure is the persistent BRG-20 aviso with Tentar de novo.
- **Reparar Anki** left the extension (#152): BRG-11 keeps only Tentar de novo, and Baralhos has no Avançado.

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

The Baralho is a choice among the decks the Anki has: `POST /anki/decks` (the add-on reads the open collection; the Windows bridge asks AnkiConnect, or reads the local
collection when it is down) is read when the Conexão comes on and on entering the Anki area, and the names show with ›
for the `::` levels. A stored deck the Anki does not have (and the Baralho padrão when missing) stays in the list as
“… · não está no Anki”. Without the list (Conexão off, Anki not answering) the Baralho is a text field: blank goes back
to the Baralho padrão (said under it) and a name with an empty level (`Inglês::`) is refused in the field. The audio
accents (Sotaque da palavra · Sotaque da frase) are selects by place name (a stored domain outside the list is kept),
beside the **Voz de reserva** and an **Ouvir** each (#174): `features/anki-voz.md`.

Each language in `ankiBridgePresets` carries a `versao`. The form remembers the version it read; `AjustesDeEnvio.salvar`
refuses when the stored one moved (another tab saved that language meanwhile): nothing is written, and the persistent
aviso (BRG-07.desatualizada, “Mudou em outra aba. Nada foi salvo aqui.”) offers **Ver os novos**, which swaps the draft
for what was saved. A tab without a draft follows another tab's save at once (`acompanhar`). The Envio reads the stored
ajustes when it creates each Envio (never an in-memory copy from when the panel opened) and never writes them; Baralhos e
termos and Vocabulário ask for the same decks (`painel.js` reports them to `Baralhos.usarBaralhos`), and the service
worker's automatic Palavra falls back to the same Baralho padrão. The bridge keeps its own defaults (out of this step).

### Consertar sozinho (`lib/abrir-o-anki.js`, `painel-envio-anki-fechado.js`, #152)

With the Conexão silent, an Enviar the person pressed (or Abrir o Anki) runs `AbrirOAnki.abrirOuConsertar()`: the opener's `consertar` first
(`complemento/conserto_do_anki.py`), `abrir` only if it found the Anki closed from the start, and one more `consertar` if the Conexão stays mute. `fechou` (the person closed it meanwhile) reopens nothing; `falhou`/`conexao_fora` (BRG-39.conexaoFora): the Anki does not own the port, nothing is killed.
The extension sees “Anki fechado” and “complemento desativado” as the same network error; only the opener tells them apart. BRG-39: success is a toast;
`sumiu` (or Chrome's “host not found” once connected) is an aviso with **Instalar de novo** (`ConexaoAnki.esquecerQueConectou()` → `#anki`, the first-connection card);
`falhou` is “Não deu para consertar…” with **Baixar diagnóstico** (`diagnostico-do-conserto.json`). “Conferindo…” shows only past 3 s.
Tests: `painel-conserto.spec.js`, `painel-conserto-visual.spec.js` (`test.fixme`), `test_abrir_o_anki.js`, `complemento/test_conserto*.py`; no real Anki is closed.

### Envio ao Anki (`painel-envio.js`)

The Envio is its own module; `painel.js` hands it, once the first read of the history finishes (`Envio.usar`), only
what it does with phrases: the selection, the mining line, `apagar(ids)` (the usual delete, with
tombstones, no toast) and `marcarComoEnviadas(ids)` (`status: 'exported'`, no toast, the selection untouched).

**Enviar ao Anki** opens the progress modal at once (ENV-05 is silence), with one card per Envio — one per language:
“Envio em inglês · 12 frases”, the stage in people's words (ENV-07, from the bridge `stage`), the 7 stages as segments
(the done ones full, the current one filling by its `done/total`; all in the outcome's color at the end), “etapa 4 de 7 ·
atualizado há 1 min” (ENV-08) and a collapsed Detalhes with jobId, raw stage, ISO
time (`updatedAt`, or creation) and `lastError`. A card that needs the person has no error box: its stage and segments turn muted; the reason is one short
sentence and the action a gold link (`pedidoDoCartao`). One that ended partial or failed gets **Tentar de novo →** (`POST /jobs/retry`, toast ENV-14). Stopped by the ChatGPT plan (#156, `doPlano`): ENV-20 + Gerenciar uso, or the free/Go sentence + Usar a chave, also in the summary block. Anki closed mid-Envio or the plan waiting (#158): `envio-parado.md`. On the fixed profile (`state.waiting`, #149) it is ENV-17: “Abrir <perfil>” or “Escolher perfil”. Phrases go to the Envio of their language by `ehRussa` (`lib/idioma.js`): the stored `idioma`, or the text. A `POST /jobs` that fails does not hide the Envio: its card says “Não começou”
with the ENV-03 reason (`motivoSemResposta` when the request never got an answer), its cause in Detalhes and
**Tentar de novo →** (re-creates only that language). While such an error is on a card (or a Continuar envio that failed, ENV-14), the summary waits: the progress modal comes back and the summary opens once it is closed, counting those phrases as failed. Every request goes through `PedidoAoAnki` (POST). The Envio's request body is built once, with
`jobId` = the Envio's `id` (`crypto.randomUUID()`), and saved in `pm_envio` (`corpo`) **before** the first `POST /jobs`; the ENV-03
Tentar de novo and a panel reopened with an unanswered request send those same bytes, and the Conexão answers with the
Envio it already has (`docs/design/envio-no-complemento.md`).
**Apagar tudo (CFG-17)** reaches the Envio's copy of the Frases (#248): `Envio.apagarTudo()` (called by `painel.js`) ends the panel's tracking and asks the Conexão (`POST /jobs/apagar-frases`); the Zona de perigo refuses it while the Conexão does not answer. Rest: `apagar-tudo.md`.
The footer is ENV-15. `POST /jobs/list` runs every 2 s while something is running; when it fails the modal says
ENV-09 and keeps trying. Phrases already in a running Envio are not sent twice (a second click only reopens the modal),
and the Veio modal ignores the second press of a double click, so it does not close the modal the first press opened.

The tracked Envios live in `pm_envio`, so reloading the panel keeps them (without reopening the modal). When nothing is
running and at least one Envio started, the **summary** (ENV-10) opens by itself in whatever area of the panel is on screen (never over the Boas-vindas: it waits for an area), once no
other modal is open. It has one block per language: `+N cartões` (sent now), `no baralho <deck>` (the deck saved on the
Envio when it was created, its `::` levels shown as ›), `N já estava lá` (the bridge's `duplicatePhraseIds`, never counted
as sent) and `N não entrou` (what did not become a card, including an Envio that never started; a phrase the bridge lists
both in `successfulPhraseIds` and `failedPhraseIds` counts as failed, so it is never deleted) with **Tentar de novo**,
which redoes only that language. Below the blocks, the history question: “Tirar as N enviadas do histórico?” with
**Manter** and **Tirar do histórico**; N counts only the sent phrases still in the history, the ones deleted meanwhile
are named (“1 enviada você já tinha apagado.”), and with none left it says “Nada para tirar do histórico.” with **Pronto**.
**Manter** — and Pronto, ×, Esc, a click outside — marks the sent and the duplicates Enviada ao Anki, no toast (ENV-12).
**Tirar do histórico** deletes only the ones sent now, marks the duplicates, and shows the ENV-11 toast. Either answer
clears `pm_envio`. Off and never connected on this computer (`ConexaoAnki.jaConectou()`), Enviar ao Anki has `aria-disabled` (not `disabled`),
`aria-describedby` and a tooltip on hover and keyboard focus only (`PAI-32.enviarIndisponivel`): there is no opener yet.
**Off after it answered once (the Anki closed)** the button works: `painel-envio-anki-fechado.js` keeps the chosen ids and shows
the ENV-16 notice in `#frases-avisos` — “Abrindo o Anki para enviar…” after `Abridor.abrirOAnki()` (permission already given), or
“Abra o Anki para enviar” (no permission: **Abrir o Anki sozinho** asks it inside the click; the opener did not open: the cause in
Detalhes). `AbrirOAnki.esperarOAnki` checks `/health` every 2 s for 2 min; when the Conexão answers the notice goes and `enviar(ids)`
runs; after 2 min the pending Envio is dropped and the person presses Enviar again. Tests: `painel-envio-anki-fechado.spec.js`.
