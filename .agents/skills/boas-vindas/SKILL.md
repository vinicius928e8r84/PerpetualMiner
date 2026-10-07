---
name: boas-vindas
description: "Use when changing or reviewing the Boas-vindas (`painel-boas-vindas.js`) or the “Configuração pela metade” reminder (`lib/configuracao.js`, `painel-lembrete.js`). Reviewers: open it when the PR touches that surface. It holds the architecture notes moved out of CLAUDE.md for it (what it shows, the IDs it implements, its storage and its tests)."
---

# Boas-vindas and Configuração pela metade

Notes moved unchanged from `CLAUDE.md` § Architecture. `CLAUDE.md` keeps the file table and the rules that cross surfaces.

### Boas-vindas (`painel-boas-vindas.js`, docs/design/painel/boas-vindas/, variant C)

`chrome.runtime.onInstalled` with `reason === 'install'` writes `pm_boas_vindas` (the setup has started) and opens a
tab at `painel.html#boas-vindas` (an update does neither; the context menu is created as always). `#boas-vindas` is a page of the panel without the sidebar: the shell
hides `.shell` and shows `#boas-vindas`. Addresses: `#boas-vindas` (the opening: ONB-01, the 7 steps with “opcional”,
Pular a configuração → `#frases` · Começar), `#boas-vindas/minerar|atalho|conta|anki|ia|automatica|chave` and
`#boas-vindas/pronto` (Tudo pronto). Left, the list of the 9 items (`nav` named ONB-03.lista; every item a button,
the current one `aria-current="step"`), each with its mark: the number, the gold ✓ when done, dashed for “agora não”;
the item's name ends in “, feito” / “, agora não” for the screen reader. Right, the card: the overline (ONB-03), the
title (focused on each step change), the step and Voltar · Agora não (optional steps only, while not done) · Continuar.
The card is at least as tall as the list and its footer sits at the bottom, so the buttons stay in the same place on a
short step.

A step is done by its real state: a phrase in the stored history, `pm_atalho` recorded, an account
(`pm_user_info` + `pm_firebase_auth`), the Conexão com o Anki being on (`ConexaoAnki`), the OpenAI key checked
(`pm_chave_openai`), a language of the
automatic mining on, `geminiApiKey` saved. Done wins over “agora não”. Only “agora não” and whether the person reached
Abrir painel belong to the page, in `pm_boas_vindas`. `lib/configuracao.js` owns these rules and that key; the page
only adds each step's value and screen. “Continuar” on a required step moves on without marking it:
Tudo pronto says “falta”. Tudo pronto lists each step with its value when done (ONB-13: “1 frase”, “Alt+Q”, the
account's name, “ligada”, “salva” (the OpenAI key), “Inglês · Russo”, “salva” (the Gemini key)), “agora não” or “falta”; Abrir painel stores `concluida` and goes
to `#frases`.

Step 1: ONB-05 with the recorded caption shortcut in a `kbd` (none → GLB-02 “Sem atalho” and Definir atalho, which goes
to step 2 of this page), the static illustration of a marked caption (`escreverFrase` + `montarChipDaPalavra`, dark in
both themes, `aria-hidden`) and the popup's quick mining (`lib/mineracao.js`; success is silent,
POP-05; failure is POP-06 under the field, text kept). Step 2: ONB-06 and the same recorder as Configurações
(`GravadorDeAtalhos.montar(…, { prefixo: 'bv', lugar })`: `lugar` is what hides when the person leaves, which cancels
a recording): same storage, same refusal of a repeated shortcut. Nothing of the panel opens over the page: the Envio
summary waits and opens once the person enters one of `Shell.AREAS_DO_PAINEL`. Step 3 mounts the Conta & sync body
(`Conta.montarCartao`) shared with Configurações. Step 4 is `ONB-08.corpo` and the steps component of `painel-conexao-passos.js` (`PassosDaConexao`, the same one as the ONB-16 card, with the list above the step card and no Voltar · Continuar of its own; see “Conexão com o Anki” in the `painel-anki` skill), described in
[Boas-vindas § F1](../../../docs/design/painel/boas-vindas/README.md#conexão-com-o-anki-como-ligar-f1). Step 5 (“Configurar a IA dos cartões”, optional, after the Conexão because the Conexão checks the key) mounts the IA dos cartões card with `CartaoDaIA.montar(…, { prefixo: 'bv' })` (see the `configuracoes` skill); step 6 shares
the popup's automatic-mining messages and daily-limit field through `lib/mineracao-automatica.js`, following
`pm_auto_miner_state_view`. Step 7 mounts the Chave do Gemini card with `ChaveDoGemini.montar(…, { prefixo: 'bv' })`.
For the step-specific labels, controls and visible states, see the [Boas-vindas spec](../../../docs/design/painel/boas-vindas/README.md#os-passos).
The reminder (item 9) is below, in “Configuração pela metade”.

### Configuração pela metade (`lib/configuracao.js`, `painel-lembrete.js`, item 9 of the closed list)

While `pm_boas_vindas` exists (the install wrote it), `concluida` is false (Abrir painel in Tudo pronto was never
pressed) and `lembreteOculto` is not set, the popup shows the ONB-14 card above Abrir painel and Frases the ONB-15
strip above the avisos, each with the progress ring (`Veio.montarAnelDeProgresso`, drawing only; the number is in the
text). Someone who updated from a version without the Boas-vindas has no `pm_boas_vindas` and never sees it. The count
is the prototype's: steps done or answered “agora não”, of 7, the same the Boas-vindas marks. Both wait for the first
`/health` (it counts the Anki step; `Configuracao` follows `ConexaoAnki` itself, and `conectando` means not known yet), so the number never jumps on screen. **Continuar configuração** (the whole popup
card is the button) goes to `#boas-vindas/<first step still missing>`, or `#boas-vindas/pronto` when none is missing;
the popup focuses the panel tab already open, like Abrir painel. **Ocultar** is only in Frases: it writes
`lembreteOculto: true`, both places hide at once (through `chrome.storage.onChanged`) and focus goes to Minerar
frases. The e2e fixture removes `pm_boas_vindas` after the install, so every test starts without the reminder;
`test.use({ lembreteDaConfiguracao: true })` keeps it.
