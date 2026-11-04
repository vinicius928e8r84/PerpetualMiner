---
name: configuracoes
description: "Use when changing or reviewing the Configurações area of the panel: IA dos cartões (the OpenAI key), Chave do Gemini, Zona de perigo, Atalhos, Conta & sync and Conexão com o Anki (`painel-ia.js`, `lib/chave-da-openai.js`, `painel-chave.js`, `painel-perigo.js`, `painel-atalhos.js`, `lib/atalhos.js`, `painel-conta.js`, `painel-abrir-anki.js`). Reviewers: open it when the PR touches that surface. It holds the architecture notes moved out of CLAUDE.md for it (what it shows, the IDs it implements, its storage and its tests)."
---

# Configurações

Notes moved unchanged from `CLAUDE.md` § Architecture. `CLAUDE.md` keeps the file table and the rules that cross surfaces.

### IA dos cartões (`painel-ia.js`, `lib/chave-da-openai.js`)

Ticket #140, design A of #101: the two entries of the AI in **two equal columns**, the **Chave da OpenAI** (works) and
the **Conta do ChatGPT** (the “Plus ou Pro” badge and “Continuar com o ChatGPT”, `painel-ia-chatgpt.js`, below), then the line that
generated images always go through the key. Below ~620 px of card width (560 px of body)
the columns become rows (a container query on `.ia-cartao`, the worker's proposal); the Boas-vindas step body is ~595 px, so
there design A is two columns too. The card is mountable
(`CartaoDaIA.montar(corpo, { prefixo })`): Configurações and step 5 of the Boas-vindas draw the same card, each with its own
Trocar chave, typed text and error. The closed-row summary (`••••••••9f3a`, or “Sem chave” in `danger`) is drawn by the card,
from `pm_chave_openai`. `#configuracoes/ia` with no key focuses the field. Copy: CFG-35.

The key is pasted, **checked by the Conexão com o Anki** (the extension has no host permission for OpenAI, and the Conexão is
who spends the key) and only then stored. While it checks, the button says “Conferindo a chave…” and stays focusable without
repeating the request, and the field keeps what was pasted. Saved, the card shows “Chave conferida” with the key masked: the
screen only knows `ultimos4` (it never reads the key, which is why a stale screen cannot leak it), and Trocar chave opens an
*empty* field. A rejected key never replaces the stored one. Errors are one strip across the card, under the columns, with
“Chave da OpenAI” in bold (which entry it belongs to), what to do and Detalhes (`HTTP 402 · openai_no_credit`): chave recusada
(Trocar chave), sem crédito (Adicionar crédito, new tab), organização não verificada (Verificar organização), the OpenAI
fora do ar, the Conexão sem responder or answering something outside the contract (Tentar de novo, which sends what is still in
the field). The strip leaves when the person types.

**Option B owner (#154 / PR #204):** the Conexão's `user_files/chaves/openai.json` is the only local secret owner, `{ chave, conta, versao, em, naoEnviada }`. The extension has one public `pm_chave_openai` cache (mask/UID/revision/flag), no secret vault or pending changes by UID. Firebase tokens still live in extension-origin IndexedDB `pm-sessao`, not readable Chrome storage.

The client sends the revision it observed; only accepted owner mutations increment it. Refused confirmation does not reserve anything (N1). Identical value/UID replay with the acceptance's base revision is a stored success without another OpenAI check or write, including after restart (R1). Opening/reopening and each completed health check read `/ia/estado`, even without Google or reconnection, not suffix equality or a restored old key. Download from the account does not validate again against OpenAI (L1). A key's refused upload stays in its sole UID-bound owner; another account cannot receive or silently replace that unsent key (P1). CFG-42 asks to finish in the original account before switching. A key with `conta: ''` also cannot bind/upload to the first requesting UID: paste/check again in the chosen account. For main upgrades the CFG-42 action opens `CartaoDaIA.trocarChave()` (empty field, focused). Passive owner reads of other accounts do not notify sync; only current-session unsent changes do. A 0.1.0 unversioned state requires update before mutation or legacy/cache deletion, with `CartaoDaIA.baixarConexao()` delivering the 0.2.0 add-on. Today's bridge (404 state) receives no bearer; without pending changes it is not a key sync failure, with them it requires update. Only a complete versioned state permits bearer delivery, not listener authentication (#192). After sync, another account's older cloud key can replace the owner.

`POST /ia/openai/sincronizar` uses captured UID/token transiently; the add-on talks to Firestore. Empty value is deletion, replicated only to the authenticated operation's account. There are no per-UID deletion marks (J1). A key bound to a different signed-in account has no Apagar chave button. Signed out, even a linked key can be deleted only from this computer (`conta: ''`); the cloud is untouched and login can bring its key back. The note distinguishes linked from never-linked keys. A fresh owner read/CAS refuses a foreign owner with a current account, including partial Apagar tudo, without creating that account's tombstone. That refusal has its own CFG-35 copy and Trocar chave action, never futile retry. The wipe modal names the protected key instead of promising deletion. For an eligible owner, explicit Apagar chave and Apagar tudo clear divergent legacy and all old `conta:<uid>` secrets too, with no replacement queue (F4). Legacy UID/time migration requires exact proof of the key already stored; an unbound legacy secret cannot be exported to the first requesting account. Unavailable Conexão prevents a claim of completed save/wipe. Persistent failures/retry/partial wipe are retained. With no pending change or deletion (including a replicated key), unavailable optional Conexão is not a key sync failure; connected, it still receives cloud arrival. Phrase outcomes are separate from key sync; CFG-41 is neutral failure-to-check copy and CFG-04/08 still classify authentication failures.

Tests: `e2e/tests/chave-autoridade.spec.js`, `configuracoes-ia.spec.js` (including content-script isolated-world CDP), real HTTP owner tests in `complemento/test_chave_da_openai.py` and shared `complemento/contrato/exemplos.json`. Old generation/vault-only Node tests were removed; phrase tests remain in `test_sync.js`. Native wipe/fault setup must await preceding Save completion, not only a click. Visual references remain `test.fixme`, pending owner approval. Full invariants/limitations/P6: `docs/seguranca/chave-da-openai.md`.

**Conta do ChatGPT (#155, `painel-ia-chatgpt.js`, design: `docs/design/login-do-chatgpt.md`).** The column asks the Conexão
(`PedidoAoAnki.estadoDoChatGPT/entrarComOChatGPT/sairDoChatGPT`) and stores nothing in the browser: the tokens live only in the
Conexão's `user_files/chaves/chatgpt.json`. The button gets the authorize URL (opened with `chrome.tabs.create`, only if it starts
with `https://auth.openai.com/api/accounts/authorize?`), then “Esperando o ChatGPT…” (Cancelar stops waiting) re-reads the state every
2 s and on window focus; logged in, “Usando o plano do ChatGPT · Gerenciar uso” (`chatgpt.com/settings/usage`) and Sair do ChatGPT.
Failures are their own strip under the columns, opened by “Conta do ChatGPT:”, with the code in Detalhes. The column is redrawn in
place (`ColunaDoChatGPT.coluna/faixa(lugar)`), so a key being typed is not lost. Tests: `e2e/tests/configuracoes-chatgpt.spec.js`
(auth.openai.com is mapped to the local fake server: the extension's tab escapes `context.route` on its first navigation), the
fixme reference in `configuracoes-chatgpt-visual.spec.js`, and `complemento/test_login_do_chatgpt.py`, `test_plano_do_chatgpt.py`.

**The rest of the plan (#156, design: `docs/design/imagem-pelo-plano.md`).** The first time the column reads the login as connected, a Veio modal (CFG-35.planoTitulo…planoEntendi, built in `painel-ia-chatgpt.js` on `Veio.abrirModal`) says the plan is in use; Entendi, Esc and a click outside store `pm_plano_do_chatgpt_avisado: true` in `chrome.storage.local` (this computer only) and it never returns. Connected with no stored key (`CartaoDaIA.temChave()`), the column adds CFG-35.semChave (photo or no generated image). The strip for `chatgpt_not_eligible` (the second `invalid_grant` in a row, or the Envio's code) says the plan does not serve a free or Go account, with Usar a chave (focus on the key field). Tests: `configuracoes-chatgpt-plano.spec.js`, fixme references in `configuracoes-chatgpt-visual.spec.js`.

**Modelo dos cartões (#157, `painel-ia-modelo.js` + `painel-ia-modelo.css`, design: `docs/design/modelo-dos-cartoes.md`).** The card's Avançado
(`details.ia-avancado`, CFG-44; the label is BRG-32.titulo) is a select of the account's models, Automático by default, over
`PedidoAoAnki.estadoDoModelo/escolherOModelo`; nothing is stored in the browser. Without key and login, or with the Conexão off or
old (404), there is no Avançado (nothing is claimed). Below the select: “Pago pela sua chave”, or the plan line of the ChatGPT column
(`ColunaDoChatGPT.linhaDoPlano`). Before a chosen model leaves: the amber aviso (`tom: 'info'` plus `ia-modelo__aviso`, tokens only) with
the date, Trocar agora (chooses Automático) and Escolher outro (focuses the select); after the Envio swaps on the day, or when the model
leaves the account, the green line. The Conexão owns everything: choice, list, swap (`complemento/modelo_dos_cartoes.py`; reading never
writes, the Envio does) and the dates (`complemento/modelos_da_ia.json`, none yet). Tests: `e2e/tests/configuracoes-modelo.spec.js`
(`fakes.anki.modelo`, `relogioParado`), the fixme references in `configuracoes-modelo-visual.spec.js`, `complemento/test_modelo_dos_cartoes.py`.

### Chave do Gemini and Zona de perigo (`painel-chave.js`, `painel-perigo.js`)

The Chave do Gemini card owns `geminiApiKey` (the same key the Minerar de uma foto reads) straight from
`chrome.storage.local`. It is mountable (`ChaveDoGemini.montar(corpo, { prefixo })`): Configurações and step 6 of the
Boas-vindas draw the same card, each with its own Trocar chave state. Saved, it shows “Chave salva” and the key masked as in the summary (`Shell.mascararChave`), with
Trocar chave, which opens an *empty* field with Salvar chave and Cancelar, so the old key never reaches the screen.
Empty, the field stays open with the note. The field is a `<form>`, so Enter saves like the button; an empty (or blank)
save sets `aria-invalid` and the CFG-16 line linked by `aria-describedby`, and typing clears it. Saving trims the key,
shows the CFG-16 toast and goes back to the summary. `#configuracoes/chave` with the key empty focuses the field. The key
is not validated.

The Zona de perigo card is drawn from what `painel.js` reports through `PerpetualMiner.Perigo`: `mostrarTotal(n)`,
`mostrarConta(comConta)` and `aoApagarTudo(apagar)`. The outline danger button only opens the Veio modal (CFG-17:
Cancelar has the initial focus, Esc and a click outside close it); only the filled button inside it calls
`apagarTudo()`, which clears the history, and with an account the cloud, then shows the CFG-18 toast — only once the
cloud is empty too; a cloud failure shows in the Conta & sync card and the chip instead (Q4). The description (CFG-32),
the reach line and the modal body say “all computers of your account” only with an account. Until the total arrives,
the entry row stays hidden, so it never shows “Nenhuma frase para apagar” while the list is still loading. No `confirm()`.
Before it deletes anything the confirmation checks the Conexão com o Anki now (`ConexaoAnki.conferir()`): if it does not answer, the
Apagar tudo is refused whether or not an Envio exists. Nothing is deleted or marked; a notice (CFG-17.conexaoNaoResponde: open the Anki
and try again) with Tentar de novo and Detalhes stays in the card until the Conexão answers again. Why, and the Envio side: the
`painel-anki` skill, `apagar-tudo.md`.

### Conexão com o Anki: Abrir o Anki com o computador (`painel-abrir-anki.js`)

One switch (CFG-36…40), off by default. The login item lives in the Conexão (a LaunchAgent on the Mac, a shortcut in the Startup
folder on Windows; `complemento/item_de_login.py`), so nothing is stored in `chrome.storage`: the switch shows what
`POST /abrir-com-o-computador/estado` says (read when the Conexão comes on and on entering Configurações) and changes only after
`POST /abrir-com-o-computador` `{ ligado }` answers. While it works the switch is disabled and still shows the real state. With
the Conexão off it is unavailable (the note CFG-38 and the row “Indisponível agora”); so it is when the Conexão answers the read with 404 (an add-on version without the route: `CFG-38.antiga`) or fails it (`CFG-38.falhou`), never an endless “Conferindo…”. A refused write (`anki_not_found`, `login_item_failed`, `login_item_unsupported`) leaves the item as it was and shows the persistent
aviso CFG-39 with the code in Detalhes; a write with no usable answer (connection lost, the 3 s limit, a body with no boolean `ligado`) is *uncertain*:
the aviso says so (`CFG-39.incerta`), the switch is unavailable, and `/estado` is read until it confirms (then the aviso goes, or says what
happened). Only what the Conexão confirmed is shown: any failed or invalid read, even after a good one, makes the switch unavailable. It never
opens the Anki, only writes or deletes the item. `#configuracoes/anki` opens the card. Tests: `e2e/tests/configuracoes-abrir-anki.spec.js`
(the fake follows `complemento/contrato/exemplos.json`), the visual reference in `configuracoes-visual.spec.js`.

#### The “Perfil do Anki ▾” row (CFG-43, #149; same file and card)

The fixed profile lives in the Conexão (`complemento/perfil.py`, `user_files/perfil.json`: the profile open on the first connection), so
nothing is stored in `chrome.storage`. The row reads `POST /anki/profiles` (`{ profiles, marked, open }`) when the Conexão comes on, on
entering Configurações and after each pick, and exists only with 2 or more profiles **or** a marked one the Anki no longer has (then also
with one profile left: a red non-closable aviso, `CFG-43.sumiu`, and a list with nothing selected). With one profile nothing about profiles
shows. Picking posts `POST /anki/profile` `{ profile }`; the list is redrawn from a fresh read, so it shows what the Conexão kept, and a
refused pick shows `CFG-43.falha` with Detalhes. The row is rebuilt only when what it shows changes (an open list survives the 15 s
checks). Picking never opens or closes anything in the Anki: only the Envio card's “Abrir <perfil>” does (`painel-envio-cartao.js`).
Tests: `e2e/tests/configuracoes-perfil.spec.js`, `painel-envio-perfil.spec.js` (the fake is `e2e/fakes/perfis.js`); the visual reference of
both screens is `fixme` in `perfil-fixo-visual.spec.js` until the owner approves it.

### Shortcuts (`painel-atalhos.js`, `lib/atalhos.js`)

Two recorded shortcuts, each recorded in its own row of the Configurações › Atalhos card: **Minerar legenda**
(`pm_atalho_legenda`, default Alt+S) and **Minerar seleção** (today's `pm_atalho`, default none). A shortcut is a
key with at least one of Ctrl/Alt/Shift (a bare key would take that letter from every text field) or an extra mouse
button (middle, back, forward, others as “Botão N do mouse”), also with modifiers. Meta is never recorded, and an
event with Meta never matches. While recording (CFG-13) the row's key becomes a pulsing gold pill and its button Cancelar; the other
row's button is disabled; Esc without a modifier cancels, and so does leaving the card (closing it, another address
or area); left and right clicks do not record, so Cancelar stays
clickable; back and forward do not navigate. A combination that already
belongs to the other shortcut is refused with CFG-19 in `danger` and recording goes on. A saved key flashes once, no
toast. “Restaurar atalhos padrão” (CFG-21/22) shows only when something differs from the defaults and writes
`{legenda: Alt+S, seleção: null}` at once, with no confirmation and no toast.

`lib/atalhos.js` is the one owner of the stored shape, the defaults, the PT-BR label (`rotuloDoAtalho`, rebuilt from
the fields, so a label stored in English shows in PT-BR) and matching (`mesmoAtalho`, `correspondeAoAtalho`).
`content.js`, the shell's closed-row summary and the Frases empty state (PAI-02) read it through
`acompanharAtalhos`, so a new shortcut applies at once, without reloading. The manifest declares no `commands`: a
recorded shortcut can be a mouse button, which `chrome.commands` cannot take, so it lives only in the content script.
A mouse caption shortcut takes the button only when there is a caption to mine; elsewhere the button does what it
always did. Back and forward navigate on the *release*, not on `mousedown`, so `lib/atalhos.js` also holds that
release (`guardarSolturaDoBotao` after a shortcut fires, `guardarTodasAsSolturas` while recording) — otherwise the
page would leave while mining or recording.

Configurações › Atalhos is the only recorder: the popup only shows the Minerar legenda shortcut in its footer. The `kbd`
itself is the base component `Veio.montarTecla(rotulo, { seVazia })` (or `Veio.montarTeclas`, one key per `kbd`, as the
popup draws it); the caller passes the “Sem atalho” copy (CFG-12 or GLB-02).

### Account (`painel-conta.js`)

One account state, drawn in three places that always agree: the open Conta & sync card, its closed-row summary
(“Nome · <chip state>”, CFG-27) and the sidebar chip, which links to `#configuracoes/conta`. `painel.js` reports to it
through `PerpetualMiner.Conta`: `mostrarConta(usuario)`, `mostrarSincronizacao(situacao, { n, total, detalhes })`,
`mostrarFalhaNoLogin(detalhes)` and `aoPedir({ entrar, sair, tentarDeNovo })`; `montarCartao(lugar)` draws the card's body in
one more place (step 3 of the Boas-vindas), kept in step with Configurações. The situations are the spec's states,
named by `Conta.SITUACOES` (never a loose string): `SINCRONIZANDO` (CFG-01), `PRIMEIRA_SUBIDA` and
`PRIMEIRA_SUBIDA_FALHOU` (CFG-09), `SINCRONIZADO` (CFG-02), `SEM_SINCRONIZAR` (CFG-03), `CHAVE_PENDENTE` (CFG-41, key-only failure without claiming synced phrases are local), `PARCIAL` (CFG-05, counting
this computer's phrases, not the whole cloud collection), `RECUSADO` (CFG-04) and `EXPIROU` (CFG-08); with no profile
name the account is “Conta Google” (CFG-10).

The panel retains phrase and key outcomes separately: phrase failure/partial/loading is not overwritten by a transient key-only retry; CFG-41 applies with a local key/deletion and phrases synced, using neutral “não deu para conferir” wording for either read or upload failure (not claiming an already uploaded key never arrived). A key failure classified as access refusal or session expiry still uses CFG-04/CFG-08, even with no local key.

A sync problem shows **only** in the card and the chip — never a toast or a strip in another area. The one exception is
the spec's own PAI-15: when a delete reaches this computer but not the cloud, Frases also shows the persistent aviso
saying those phrases may come back, with “Tentar de novo”; the card and the chip still say the computer is out of sync. `painel.js` maps the cloud module's failure `motivo` to the account's situation through
`situacaoDoErro` (see “Firebase / Firestore Sync” in `CLAUDE.md`), and the raw message goes to the card's collapsed “Detalhes”. Closing Google's login window is not an
error and shows nothing; a login that fails shows CFG-07 in the card with “Tentar de novo”.
