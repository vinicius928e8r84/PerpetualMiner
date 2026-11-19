---
name: popup
description: "Use when changing or reviewing the toolbar popup (`popup/popup.html/js/css`). Reviewers: open it when the PR touches that surface. It holds the architecture notes moved out of CLAUDE.md for it (what it shows, the IDs it implements, its storage and its tests)."
---

# Popup (Cockpit)

Notes from the old `CLAUDE.md` § Architecture. Cross-surface rules: `docs/arquitetura.md`; files: `docs/arquivos/`.

### Popup (Cockpit) (`popup/popup.html/js/css`)

The popup is the “Cockpit” variant A (`docs/design/popup/`), 340 px wide with a 600 px ceiling, built on the Veio
components and following the chosen theme. Top to bottom: the mark with no subtitle (POP-12); the ONB-14 card while the setup is half done (see “Configuração pela metade” in the `boas-vindas` skill); **Abrir painel** (POP-09),
which focuses the panel tab that is already open (`chrome.tabs.query` ignores the `#address`, so the tab keeps the area
the person left it on) or opens one; the **Mineração automática** tiles, Inglês | Russo (POP-10, POP-14, POP-15): a switch,
the counter as the prototype draws it (“12/20”, the number large; the screen reader hears POP-07 “12 de 20 hoje”), a meter
and the 1–100 daily limit, which gives way to “Limite de hoje atingido” (POP-08, also the switch's accessible
description) once an enabled language hits it, even while the limit field has focus. The limit field has no spin
arrows: focusing it selects the number, typing replaces it, ↑ ↓ still step it, and Enter saves and keeps focus there; a
redraw puts focus back on the same control (the switch, once the field gave way to POP-08). With the Conexão off (the popup's single `/health` check on opening fails) the Mineração automática keeps going from the last vocabulary reading of the Baralho (`VocabularioDaMineracao`, no expiry), so the tiles and the toolbar badge keep counting and the popup says how old the data is: the POP-17 selo under the tiles, “Vocabulário de ontem, 14:02” (`Contexto.diaEHora`), from the *oldest* `createdAt` among the enabled languages that have a reading. The Anki counts as closed when the Conexão is off; the popup shows the selo then, if any enabled language has a reading. An enabled language with no reading of its Baralho at all shows BRG-37 inside its tile (“— esperando o Anki”, “Começa depois que o Anki abrir uma vez.”). With the Conexão answering neither shows. (ONB-10 is no longer in the popup; step 5 of the Boas-vindas still shows it.) The **Abrir o Anki** button (BRG-38, `AbrirOAnki.montarBotao`) sits in the POP-17 selo (after a “·”) and in each BRG-37 tile; only a click calls the opener (`lib/abridor.js`, with the hidden `abridor-ponte` frame of `popup/popup.html`), and the Conexão answering removes the selo and the button. The tiles show a skeleton until the service worker answers `AUTO_MINER_GET_STATE` (a
`pm_auto_miner_state_view` that arrives first wins); if it fails, POP-16 says what to do in one line with the alert icon
(close and reopen the popup), and if a save (`AUTO_MINER_SET_SETTINGS`) fails, the tiles go back to what is stored and
POP-16 asks to try again. No button and no Detalhes: the next published state clears the line. **Quick mining**
(POP-03/04): Enter or Minerar sends `SALVAR_HISTORICO` with Fonte `manual` and an empty Título; success has no text
(POP-05: the field clears and the phrase enters the top with a brief highlight), failure shows POP-06 under the field
with the alert icon and keeps the text; the **last 5**, read-only (POP-13), each the phrase with the Palavra (the first
`keywords` group) highlighted and the Contexto line “Fonte · Título · Detalhe · dia”; skeleton while loading (POP-01) and
the POP-02 empty state: the pickaxe, “Nenhuma frase ainda” in bold and the text below with the recorded shortcut, one key
per `kbd` (`Veio.montarTeclas`); with no shortcut, `POP-02.semAtalho` and Definir atalho. The footer shows the recorded
Minerar legenda shortcut (POP-11, one key per `kbd`) with Mudar atalho, or “Sem atalho” and Definir atalho (GLB-02);
both, and Definir atalho in the empty state, take the panel tab to `#configuracoes/atalhos`, and “Ver todas” to `#frases`.
The popup does not delete, select or record anything.
