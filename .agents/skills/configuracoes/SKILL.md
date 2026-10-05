---
name: configuracoes
description: "Use when changing or reviewing the Configurações area of the panel: IA dos cartões (the OpenAI key), Chave do Gemini, Zona de perigo, Atalhos and Conta & sync (`painel-ia.js`, `lib/chave-da-openai.js`, `painel-chave.js`, `painel-perigo.js`, `painel-atalhos.js`, `lib/atalhos.js`, `painel-conta.js`). Reviewers: open it when the PR touches that surface. It holds the architecture notes moved out of CLAUDE.md for it (what it shows, the IDs it implements, its storage and its tests)."
---

# Configurações

Notes moved unchanged from `CLAUDE.md` § Architecture. `CLAUDE.md` keeps the file table and the rules that cross surfaces.

### IA dos cartões (`painel-ia.js`, `lib/chave-da-openai.js`)

Ticket #140, design A of #101: the two entries of the AI in **two equal columns**, the **Chave da OpenAI** (works) and
the **Conta do ChatGPT** (the “Plus ou Pro” badge, a disabled “Continuar com o ChatGPT” and “Ainda não dá para entrar…”;
the login is #155), then the line that generated images always go through the key. Below ~620 px of card width the columns
become rows (a container query on `.ia-cartao`, the worker's proposal). The card is mountable
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

Where the key lives (`lib/chave-da-openai.js`; `confirmar` is the only way in): the whole key in the **extension's IndexedDB**
(`pm-segredos` › `chaves` › `openai`), which a content script and the overlay cannot open (they run in the page, whose
IndexedDB is the site's; `chrome.storage.local` would not do: the content script reads that area and `setAccessLevel` would
close all of it); `{ ultimos4 }` in `chrome.storage.local` as `pm_chave_openai`, which the summary, the Boas-vindas step and the
reminder read; and the Conexão's own copy in `user_files/chaves` (see `complemento/`). When the Conexão answers again after being
off, the card asks `POST /ia/estado` and, if the copy is missing or has another ending, delivers the key again by itself;
“A Conexão com o Anki tem uma cópia da chave” / “…ainda não tem a cópia” says the true state, and with the Conexão off the card
says nothing about the copy. “Fica neste computador” is the true text of today: following the Google account is #154, and that
text changes with it. Tests: `e2e/tests/configuracoes-ia.spec.js` (including a CDP check from the content script's isolated
world), the visual references `ia-*.png` in `configuracoes-visual.spec.js`, `complemento/test_chave_da_openai.py` for the
Conexão's side, and the contract examples both read (`complemento/contrato/exemplos.json`).

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
`PRIMEIRA_SUBIDA_FALHOU` (CFG-09), `SINCRONIZADO` (CFG-02), `SEM_SINCRONIZAR` (CFG-03), `PARCIAL` (CFG-05, counting
this computer's phrases, not the whole cloud collection), `RECUSADO` (CFG-04) and `EXPIROU` (CFG-08); with no profile
name the account is “Conta Google” (CFG-10).

A sync problem shows **only** in the card and the chip — never a toast or a strip in another area. The one exception is
the spec's own PAI-15: when a delete reaches this computer but not the cloud, Frases also shows the persistent aviso
saying those phrases may come back, with “Tentar de novo”; the card and the chip still say the computer is out of sync. `painel.js` maps the cloud module's failure `motivo` to the account's situation through
`situacaoDoErro` (see “Firebase / Firestore Sync” in `CLAUDE.md`), and the raw message goes to the card's collapsed “Detalhes”. Closing Google's login window is not an
error and shows nothing; a login that fails shows CFG-07 in the card with “Tentar de novo”.
