# Anki connection and send

The panel talks to the local Anki Connection (bridge today, add-on later) on `127.0.0.1:8766`. The **Conexão com o Anki** area (`painel.html#anki/custos|baralhos|vocabulario|ajustes`) shows whether it is on, the costs of each send, decks and vocabulary, and the send settings. **Enviar ao Anki** in the Frases bar sends the selected phrases (one Envio per language) with a progress modal and a summary when it ends.

## Sub-features

- `anki-status` the sidebar dot and the F1 strip say Conectando / ligada / desligada; Tentar de novo rechecks; a silent port counts as off after 3 s.
- `anki-custos` the Custos tab: period, tiles per language, list × detail of Envios, partial Envio with Continuar envio.
- `anki-offline` with the Conexão off the last data stays with the BRG-12 note; Continuar envio and Reparar Anki are unavailable with a tooltip that says why.
- `anki-send-progress` Enviar ao Anki opens the progress modal at once, one card per language Envio, no toast.
- `anki-send-summary` when Envios finish, the summary (`Envio concluído` / `… em parte`) opens in any area: `+N cartões`, the deck, "já estava lá", "não entrou", Tirar do histórico / Manter.
- `anki-send-retry` Tentar de novo / Continuar envio resumes one Envio.
- `anki-first-connection` ONB-16: the "Ainda não houve conexão neste computador" card with its three steps until the first answer.
- `anki-settings` Ajustes de envio: default deck per language, saved only on Salvar ajustes.

## How to get to it (user POV)

- Sidebar › **Conexão com o Anki** (Custos, Baralhos e termos, Vocabulário, Ajustes de envio tabs).
- In **Frases**: tick phrases › **Enviar ao Anki** in the selection bar.
- Boas-vindas step 4 (see [boas-vindas](./boas-vindas.md)).

## Driving it with the Playwright e2e harness

Preconditions:

- `doctor.sh` green. The Anki fake is a stateful queue behind the same HTTP contract as `bridge/server.py`. The specs freeze the clock and call `fakes.anki.usarRelogio(() => AGORA)`.
- The tests, not a human, play the bridge: `fakes.anki.envios` lists created Envios, `moverEnvio(jobId, { stage, progress })` advances one, `concluirEnvio(jobId, { duplicadas, falhas })` ends it.

- **Send and summary (`anki-send-progress`, `anki-send-summary`).** Run `drive.sh anki-envio painel-envio -g "as duplicatas do Anki aparecem"`. The spec seeds 3 English phrases, ticks `Selecionar frase` on each, clicks `Enviar ao Anki` in `#frases-barra`, waits for the fake to hold one Envio, then `concluirEnvio(job.jobId, { duplicadas: [LATE.id] })`. Observable: dialog `Envio concluído` with `3 frases · 1 baralho`, group `Inglês` containing `+2 cartões`, `no baralho CIMV`, `1 já estava lá` and no "não entr"; `Tirar do histórico` focused. Also run `-g "Enviar ao Anki abre o progresso na hora"` for the progress modal (dialog `Enviando ao Anki…`, `Envio em inglês · 2 frases` and `Envio em russo · 1 frase`, and the Envio the fake received: `lang 'en'`, entries in order, line `sack : She hit the sack early. [Contexto: netflix - Desconhecido - Desconhecido]`).
- **Keep or remove (`anki-send-summary`).** `drive.sh anki-manter painel-envio -g "Manter marca as enviadas"`. Observable: after `Manter`, `frases()` has `status: 'exported'` on exactly the sent and already-there phrases; the failed one has no status; no toast; the bar still says `4 selecionadas`.
- **Status and offline (`anki-status`, `anki-offline`).** `drive.sh anki-status conexao-anki -g "com a porta muda"` and `drive.sh anki-offline painel-anki -g "cai depois de responder"`. Observable: F1 text `A conexão com o Anki está desligada. Ligue-a neste computador e tente de novo.`, `Mostrando dados de há 2 h. Não deu para atualizar agora.`, the 4 Envios still listed, `Continuar envio` with `aria-disabled="true"` and its description; after `fakes.anki.ligar()` + `Atualizar` the Reparar Anki button is enabled again.
- **First connection (`anki-first-connection`).** `drive.sh anki-primeira painel-anki-primeira-conexao`. Observable: the first-connection card replaces the tabs until the fake answers `/health`, then the Pronto moment.
- **Proof.** `painel-anki.spec.js` calls `fotografar` in some tests (`c1-…` files); `painel-envio.spec.js` does not. For a send, the strongest evidence is the assertions on `fakes.anki.envios` plus a `fotografar(page, 'anki-envio-resumo.png')` you add in a scratch copy right after the summary appears.

## Gotchas

- This proves the panel against the *contract*, not the bridge or Anki. A green run does not prove the real send. Say so; the bridge side is `bridge/test_envio.py`.
- The bridge's real port is 8766 and the fake never opens it. If `doctor.sh` notes a listener there, it is not part of the run.
- Double-clicking Enviar ao Anki must create one Envio per language, not two (`bug #9: duplo clique`); count `fakes.anki.envios`.
- With the Conexão off, Enviar ao Anki is unavailable and its tooltip explains; do not try to force it.
- The summary waits while another modal is open and opens on its own after a reload (`recarregar com um Envio em andamento`).
- The Windows "could not close Anki" Envio shows its own instruction with Continuar envio (`um Envio parado porque o Windows`).
