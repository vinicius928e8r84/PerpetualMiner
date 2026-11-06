# Boas-vindas (first run)

Installing the extension opens `painel.html#boas-vindas`, a page without the panel's sidebar. It lists 8 steps (5 optional) and walks a person through them one card at a time: mine a first phrase, choose the selection shortcut, sign in with Google, connect Anki, configure the AI (the OpenAI key), turn on automatic mining, choose the level of each language with the Cartão preview, add the Gemini key. A step is done by the real stored state. "Tudo pronto" summarizes and Abrir painel goes to Frases.

## Sub-features

- `bv-install` installing opens the tab on Boas-vindas without the sidebar; an update opens nothing.
- `bv-list` the opening lists the 8 steps ("opcional" on 5, 10 items on the side list) and Começar goes to step 1.
- `bv-skip` Pular a configuração opens Frases with the sidebar.
- `bv-step1` mine the first phrase in the quick field: stored as Fonte Manual, step marked done.
- `bv-step2` record the selection shortcut (same recorder as Configurações › Atalhos).
- `bv-steps3-7` account, Anki connection (Verificar de novo), the AI card (see [ia.md](./ia.md)), automatic mining (switches + daily limit), Gemini key; each marks by real state.
- `bv-nivel` step 7, “Escolher o nível do cartão” (#164, ONB-20): for each language the mining has on, the Estilo do cartão control and the Cartão preview of the level ([anki-estilo.md](./anki-estilo.md)); choosing saves at once in `ankiBridgePresets` (that language only) and marks the step; with no language on it says where to turn one on; “Mais estilos em Ajustes de envio” leads to `#anki/ajustes`; Tudo pronto says “Inglês: Intermediário”. `drive.sh bv-nivel boas-vindas-nivel.spec`.
- `bv-quiz` “Não sei meu nível, quero descobrir” under a language's level control (#170, ONB-21/22): the level quiz of about 1 min, no AI and no cost. Russian first asks “Você já lê o alfabeto russo?” (“Ainda não” gives the Iniciante with no quiz); then 2 questions about what the person does, then 3 to 6 of 4 choices plus “Não sei” (audio only, the Frase as a caption, the verse test). Two gates: Intermediário = the 2 caption ones right, Avançado = also the 2 verse ones; the listening shows in the result and never changes the level. The next question enters by itself after ~1 s, the audio plays by itself (`POST /voz/falar`), a wrong guess or “Não sei” shows the right one, “Não sei” pauses the streak and a wrong guess zeroes it. The result shows the suggested level with the Cartão preview, “Usar este estilo” (saves `nivel` in `ankiBridgePresets`) or another level there. No celebration (#171). `drive.sh bv-quiz boas-vindas-quiz.spec`
- `bv-ranking` the group ranking under the quiz result (#172, ONB-23): with a Google account, “Você foi melhor que X% de quem fez o quiz”, the checkbox “Aparecer no ranking do grupo” (starts unchecked; checking writes the person's record to the common Firestore collection `ranking`, unchecking deletes it), the list of who opted in (name, photo, level, best streak) and “Chamar um amigo” (copies the invite). Without an account only a notice; nothing of the person goes out without the checkbox. `drive.sh bv-ranking boas-vindas-quiz-ranking.spec`
- `bv-agora-nao` "Agora não" on an optional step is remembered and shown in the summary.
- `bv-done` Tudo pronto lists each step with its value or "falta"; Abrir painel stores `concluida` and goes to `#frases`.

## How to get to it (user POV)

- Install the extension: Chrome opens the tab by itself.
- Popup › the "Configuração pela metade" card (**Continuar configuração**), or the strip above Frases, while setup is unfinished.
- Open `chrome-extension://<id>/painel.html#boas-vindas[/minerar|atalho|conta|anki|ia|automatica|nivel|chave|pronto]`.

## Driving it with the Playwright e2e harness

Preconditions:

- `doctor.sh` green. The fixture normally closes the install tab; the install specs set `test.use({ manterAbaDaInstalacao: true })` to keep it.

- **Install (`bv-install`).** Run `drive.sh bv-instalar boas-vindas.spec -g "instalar a extensão abre uma aba"`. Observable: a tab whose URL starts `…/painel.html#boas-vindas` with no sidebar. `-g "atualizar a extensão não abre aba nenhuma"` proves the update case.
- **Opening (`bv-list`).** `drive.sh bv-abertura boas-vindas.spec -g "a abertura lista os 7 passos"`. Observable: overline `Boas-vindas`, the eight items in order (`Minerar a primeira frase`, `Escolher o atalho de Minerar seleção`, `Entrar com Google` + `opcional`, `Ligar a Conexão com o Anki`, `Configurar a IA dos cartões` + `opcional`, `Ligar a mineração automática` + `opcional`, `Escolher o nível do cartão` + `opcional`, `Adicionar a chave do Gemini` + `opcional`); Começar leads to `#boas-vindas/minerar`, overline `Passo 1 de 8`, the title focused.
- **Step 1 (`bv-step1`).** `drive.sh bv-passo1 boas-vindas.spec -g "passo 1: minerar a primeira frase pelo campo"`. Observable: card shows `Num vídeo com legenda, aperte Alt+S.` and the `Alt+S` kbd; after typing `Break a leg` + Enter the field is empty, the list item's accessible name ends `feito`, storage has the phrase with `contexto { fonte: 'manual' }`. Evidence: `c1-boas-vindas-minerada.png`, `c1-boas-vindas-minerada.json`.
- **Skip (`bv-skip`).** `drive.sh bv-pular boas-vindas.spec -g "Pular a configuração abre o painel"`. Observable: `#frases` with the sidebar.
- **Entry from the popup.** `drive.sh bv-popup lembrete-configuracao.spec -g "Continuar configuração no popup abre o painel"`; strip in Frases: `-g "Continuar configuração em Frases cai no primeiro passo"`. Observable: the panel opens at the first missing step.
- **Entry by address.** Every recipe here opens `#boas-vindas[/<step>]` directly; that is the address entry.
- **Shortcut (`bv-step2`).** `drive.sh bv-passo2 boas-vindas.spec -g "passo 2: o gravador é o de Configurações"`.
- **Steps 3–7 (`bv-steps3-7`).** `-g "passo 3: o Entrar com Google"` (sign in marks the step, the card shows the account), `-g "passo 4: abre em Ter o Anki"` (the question “Você já tem o Anki?”, then the step Pôr a Conexão with Baixar a Conexão com o Anki and no terminal command; the connection's own steps are `ter-o-anki.spec` and `anki-have-anki` in [anki](./anki.md)), `-g "passo 4: reiniciar"` (Reiniciar o Anki › Tentar de novo; turn the fake on and it says "Achei o Anki · perfil · versão" and marks the step), `-g "passo 4: dois minutos"` (the checklist and Baixar de novo), step 4's fourth step Abrir o Anki sozinho (`drive.sh bv-abridor abrir-o-anki-sozinho.spec -g "Boas-vindas"`: Agora não stored in `pm_abridor`, and with `permissaoDoAbridor` the opener checked and the step ✓; see `anki-open-alone` in [anki](./anki.md)), `-g "passo 5: o card IA dos cartões"` (paste a key, the step is done), `-g "passo 6: os switches EN/RU"`, `-g "passo 7: o campo de Configurações"` (the Gemini key, now the last step), and the level step in `boas-vindas-nivel.spec` (`-g "com o inglês ligado"`: the Iniciante preview, choose Intermediário, the stored `ankiBridgePresets` and the preview text change).
- **Level quiz (`bv-quiz`).** `drive.sh bv-quiz boas-vindas-quiz.spec` (the test clock is stopped: the next question enters when the test moves it 1 s). Observable: the progress `Pergunta N de 3|6`, `Sequência: N`, the right answer marked (`data-estado="certa"`) after each answer, the result `Nível sugerido em inglês` with `N de M certas · melhor sequência: S · escuta: A de B`, the `POST /voz/falar` bodies (`fakes.anki.requisicoes`) and the level stored by Usar este estilo (`ankiBridgePresets`). One test per path of the two gates; the visual references are `test.fixme` proposals (`boas-vindas-quiz-visual.spec.js`).
- **Group ranking (`bv-ranking`).** `drive.sh bv-ranking boas-vindas-quiz-ranking.spec` (the fake Firestore keeps the `ranking` collection and applies the rules of `docs/seguranca/ranking-do-grupo.rules`). Observable: the X% line, the checkbox, the list, and what `fakes.google.rankingDe('en')` holds (nothing of the person until the box is checked).
- **Finish (`bv-done`, `bv-agora-nao`).** `-g "Tudo pronto resume cada passo"`, `-g "num opcional fica gravado"`.

## Gotchas

- The fixture removes `pm_boas_vindas` after install so every other spec starts without the reminder. A Boas-vindas or reminder proof must opt in with the `test.use` options, otherwise it sees a finished setup.
- "Continuar" on a required step moves on without marking it; Tudo pronto then says "falta". Do not read the screen as done.
- The Envio summary does not open over Boas-vindas; it waits until a panel area is entered.
- Steps are done by real state (a phrase stored, `pm_atalho`, `pm_user_info` + `pm_firebase_auth`, the Conexão on, the OpenAI key checked (`pm_chave_openai`), a language of automatic mining on, the level of each language it has on saved (`ankiBridgePresets`), `geminiApiKey`); seed those, never `pm_boas_vindas` alone.
