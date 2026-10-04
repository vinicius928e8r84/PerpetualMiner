# Boas-vindas (first run)

Installing the extension opens `painel.html#boas-vindas`, a page without the panel's sidebar. It lists 6 steps (3 optional) and walks a person through them one card at a time: mine a first phrase, choose the selection shortcut, sign in with Google, connect Anki, turn on automatic mining, add the Gemini key. A step is done by the real stored state. "Tudo pronto" summarizes and Abrir painel goes to Frases.

## Sub-features

- `bv-install` installing opens the tab on Boas-vindas without the sidebar; an update opens nothing.
- `bv-list` the opening lists the 6 steps ("opcional" on 3, 8 items on the side list) and Começar goes to step 1.
- `bv-skip` Pular a configuração opens Frases with the sidebar.
- `bv-step1` mine the first phrase in the quick field: stored as Fonte Manual, step marked done.
- `bv-step2` record the selection shortcut (same recorder as Configurações › Atalhos).
- `bv-steps3-6` account, Anki connection (Verificar de novo), automatic mining (switches + daily limit), Gemini key; each marks by real state.
- `bv-agora-nao` "Agora não" on an optional step is remembered and shown in the summary.
- `bv-done` Tudo pronto lists each step with its value or "falta"; Abrir painel stores `concluida` and goes to `#frases`.

## How to get to it (user POV)

- Install the extension: Chrome opens the tab by itself.
- Popup › the "Configuração pela metade" card (**Continuar configuração**), or the strip above Frases, while setup is unfinished.
- Open `chrome-extension://<id>/painel.html#boas-vindas[/minerar|atalho|conta|anki|automatica|chave|pronto]`.

## Driving it with the Playwright e2e harness

Preconditions:

- `doctor.sh` green. The fixture normally closes the install tab; the install specs set `test.use({ manterAbaDaInstalacao: true })` to keep it.

- **Install (`bv-install`).** Run `drive.sh bv-instalar boas-vindas.spec -g "instalar a extensão abre uma aba"`. Observable: a tab whose URL starts `…/painel.html#boas-vindas` with no sidebar. `-g "atualizar a extensão não abre aba nenhuma"` proves the update case.
- **Opening (`bv-list`).** `drive.sh bv-abertura boas-vindas.spec -g "a abertura lista os 6 passos"`. Observable: overline `Boas-vindas`, the six items in order (`Minerar a primeira frase`, `Escolher o atalho de Minerar seleção`, `Entrar com Google` + `opcional`, `Ligar a Conexão com o Anki`, `Ligar a mineração automática` + `opcional`, `Adicionar a chave do Gemini` + `opcional`); Começar leads to `#boas-vindas/minerar`, overline `Passo 1 de 6`, the title focused.
- **Step 1 (`bv-step1`).** `drive.sh bv-passo1 boas-vindas.spec -g "passo 1: minerar a primeira frase pelo campo"`. Observable: card shows `Num vídeo com legenda, aperte Alt+S.` and the `Alt+S` kbd; after typing `Break a leg` + Enter the field is empty, the list item's accessible name ends `feito`, storage has the phrase with `contexto { fonte: 'manual' }`. Evidence: `c1-boas-vindas-minerada.png`, `c1-boas-vindas-minerada.json`.
- **Skip (`bv-skip`).** `drive.sh bv-pular boas-vindas.spec -g "Pular a configuração abre o painel"`. Observable: `#frases` with the sidebar.
- **Entry from the popup.** `drive.sh bv-popup lembrete-configuracao.spec -g "Continuar configuração no popup abre o painel"`; strip in Frases: `-g "Continuar configuração em Frases cai no primeiro passo"`. Observable: the panel opens at the first missing step.
- **Entry by address.** Every recipe here opens `#boas-vindas[/<step>]` directly; that is the address entry.
- **Shortcut (`bv-step2`).** `drive.sh bv-passo2 boas-vindas.spec -g "passo 2: o gravador é o de Configurações"`.
- **Steps 3–6 (`bv-steps3-6`).** `-g "passo 3: o Entrar com Google"` (sign in marks the step, the card shows the account), `-g "passo 4: desligada"` (Anki off › Verificar de novo; turn the fake on and verify again marks the step), `-g "passo 5: os switches EN/RU"`, `-g "passo 6: o campo de Configurações"`.
- **Finish (`bv-done`, `bv-agora-nao`).** `-g "Tudo pronto resume cada passo"`, `-g "num opcional fica gravado"`.

## Gotchas

- The fixture removes `pm_boas_vindas` after install so every other spec starts without the reminder. A Boas-vindas or reminder proof must opt in with the `test.use` options, otherwise it sees a finished setup.
- "Continuar" on a required step moves on without marking it; Tudo pronto then says "falta". Do not read the screen as done.
- The Envio summary does not open over Boas-vindas; it waits until a panel area is entered.
- Steps are done by real state (a phrase stored, `pm_atalho`, `pm_user_info` + `pm_firebase_auth`, the Conexão on, a language of automatic mining on, `geminiApiKey`); seed those, never `pm_boas_vindas` alone.
