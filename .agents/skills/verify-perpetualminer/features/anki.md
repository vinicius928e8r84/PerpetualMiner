# Anki connection and send

The panel talks to the local Anki Connection (the bridge today; the add-on in `complemento/` answers `/health` and the three collection reads behind Baralhos e termos and Vocabulário, not the Envio) on `127.0.0.1:8766`. The **Conexão com o Anki** area (`painel.html#anki/custos|baralhos|vocabulario|ajustes`) shows whether it is on, the costs of each send, decks and vocabulary, and the send settings. **Enviar ao Anki** in the Frases bar sends the selected phrases (one Envio per language) with a progress modal and a summary when it ends.

## Sub-features

- `anki-status` the sidebar dot and the F1 strip say Conectando / ligada / desligada; Tentar de novo rechecks; a silent port counts as off after 3 s.
- `anki-custos` the Custos tab: period, tiles per language, list × detail of Envios, partial Envio with Continuar envio.
- `anki-offline` with the Conexão off the last data stays with the BRG-12 note (`Anki fechado. Mostrando dados de {quando}.`); Continuar envio and Reparar Anki are unavailable with a tooltip that says why.
- `anki-send-progress` Enviar ao Anki opens the progress modal at once, one card per language Envio, no toast.
- `anki-send-summary` when Envios finish, the summary (`Envio concluído` / `… em parte`) opens in any area: `+N cartões`, the deck, "já estava lá", "não entrou", Tirar do histórico / Manter.
- `anki-send-retry` Tentar de novo / Continuar envio resumes one Envio.
- `anki-first-connection` ONB-16: the "Ainda não houve conexão neste computador" card with its two steps (Pôr a Conexão no Anki: Baixar a Conexão com o Anki, the "O arquivo não abriu?" Detalhes; Reiniciar o Anki: Conectando, also on the automatic 15 s check with no click › "Achei o Anki · perfil · versão") until the first answer; two minutes without one, counted from when the steps are on screen, show the 3-item checklist and Baixar de novo. No terminal command anywhere.
- `anki-settings` Ajustes de envio: default deck per language, saved only on Salvar ajustes.

## How to get to it (user POV)

- Sidebar › **Conexão com o Anki** (Custos, Baralhos e termos, Vocabulário, Ajustes de envio tabs).
- In **Frases**: tick phrases › **Enviar ao Anki** in the selection bar.
- Boas-vindas step 4 (recipe `bv-steps3-6` in [boas-vindas](./boas-vindas.md)).

## Driving it with the Playwright e2e harness

Preconditions:

- `doctor.sh` green. The Anki fake is a stateful queue behind the same HTTP contract as `bridge/server.py`. The specs freeze the clock and call `fakes.anki.usarRelogio(() => AGORA)`.
- The tests, not a human, play the bridge: `fakes.anki.envios` lists created Envios, `moverEnvio(jobId, { stage, progress })` advances one, `concluirEnvio(jobId, { duplicadas, falhas })` ends it.

- **Send and summary (`anki-send-progress`, `anki-send-summary`).** Run `drive.sh anki-envio painel-envio.spec -g "as duplicatas do Anki aparecem"`. The spec seeds 3 English phrases, ticks `Selecionar frase` on each, clicks `Enviar ao Anki` in `#frases-barra`, waits for the fake to hold one Envio, then `concluirEnvio(job.jobId, { duplicadas: [LATE.id] })`. Observable: dialog `Envio concluído` with `3 frases · 1 baralho`, group `Inglês` containing `+2 cartões`, `no baralho CIMV`, `1 já estava lá` and no "não entr"; `Tirar do histórico` focused. Also run `-g "Enviar ao Anki abre o progresso na hora"` for the progress modal (dialog `Enviando ao Anki…`, `Envio em inglês · 2 frases` and `Envio em russo · 1 frase`, and the Envio the fake received: `lang 'en'`, entries in order, line `sack : She hit the sack early. [Contexto: netflix - Desconhecido - Desconhecido]`).
- **Keep or remove (`anki-send-summary`).** `drive.sh anki-manter painel-envio.spec -g "Manter marca as enviadas"`. Observable: after `Manter`, `frases()` has `status: 'exported'` on exactly the sent and already-there phrases; the failed one has no status; no toast; the bar still says `4 selecionadas`.
- **Status (`anki-status`).** Run `drive.sh anki-status conexao-anki.spec -g "com a porta muda"`. The spec turns the fake off, opens `painel.html#anki/custos` (sidebar dot `data-estado="desligada"`), turns it on but silent (`fakes.anki.silenciar()`), clicks `Tentar de novo`. Observable: the dot goes `conectando`, then `desligada` within 3 s, then `ligada` after `voltarAFalar()` and another `Tentar de novo`, with the F1 strip hidden. Evidence: `painel-tentando-conectar.png`, `painel-conexao-ligada.png`.
- **Offline with last data (`anki-offline`).** `drive.sh anki-offline painel-anki.spec -g "cai depois de responder"`. Observable: F1 text `A conexão com o Anki está desligada. Ligue-a neste computador e tente de novo.`, `Anki fechado. Mostrando dados de há 2 h.` (BRG-12, the `anki` form; the catalog also has an `atualizacao` form, `Mostrando dados de {quando}. Não deu para atualizar agora.`, this recipe does not show), the 4 Envios still listed, `Continuar envio` with `aria-disabled="true"` and its description; after `fakes.anki.ligar()` + `Atualizar` the Reparar Anki button is enabled again.
- **Custos tiles (`anki-custos`).** `drive.sh anki-custos painel-anki.spec -g "azulejos por idioma"`. Observable: one tile per language with total and Envios; picking one filters the summary, images and list.
- **Custos period (`anki-custos`).** `drive.sh anki-periodo painel-anki.spec -g "o período abre em Este mês"`. Observable: `Este mês` checked and the fake's last costs request asks `from=2026-09-01&to=2026-09-18`; `Hoje` asks `from=2026-09-18&to=2026-09-18` and lists 3 Envios; filling `De` with `2026-07-01` asks `from=2026-07-01` and unchecks `Hoje`.
- **Custos list × detail, Continuar envio (`anki-custos`).** `drive.sh anki-detalhe painel-anki.spec -g "lista × detalhe"`. Observable: the first Envio selected, `Envio em inglês · 6 frases` with `há 10 min`; picking `Envio em russo` shows `Concluído em parte · 3 de 4 frases` and `1 não entrou`, `Detalhes` shows `collection is not available`, and `Continuar envio` shows `Envio retomado` and makes exactly one `POST /jobs/job-ru-parte/retry` reach the fake.
- **Retry one Envio (`anki-send-retry`).** `drive.sh anki-retry painel-envio.spec -g "Tentar de novo no bloco do idioma"`. Observable: only that language's Envio is retried and the next summary counts what became a card.
- **Settings (`anki-settings`).** `drive.sh anki-ajustes painel-ajustes.spec -g "mexer no formulário não grava nada"`. Observable: editing writes nothing; `Salvar ajustes` stores only the open language and shows toast BRG-07.
- **First connection (`anki-first-connection`).** `drive.sh anki-primeira painel-anki-primeira-conexao.spec`. Observable: the first-connection card replaces the tabs until the fake answers `/health`, then the Pronto moment. `-g "Baixar a Conexão com o Anki entrega"` clicks the link and checks the downloaded `perpetualminer.ankiaddon` is the file in `conexao/`; `-g "dois minutos sem resposta"` runs the page clock 2 min and shows the checklist (the fake never opens Anki, so what happens when the person opens the file in a real Anki is the owner's rehearsal).
- **Proof.** `painel-anki.spec.js` calls `fotografar` in some tests (`c1-…` files); `painel-envio.spec.js` does not. For a send, the strongest evidence is the assertions on `fakes.anki.envios` plus a `fotografar(page, 'anki-envio-resumo.png')` you add in a scratch copy right after the summary appears.

## Gotchas

- This proves the panel against the *contract*, not the bridge or Anki. A green run does not prove the real send. Say so; the bridge side is `bridge/test_envio.py`.
- The bridge's real port is 8766 and the fake never opens it. If `doctor.sh` notes a listener there, it is not part of the run.
- Double-clicking Enviar ao Anki must create one Envio per language, not two (`bug #9: duplo clique`); count `fakes.anki.envios`.
- With the Conexão off, Enviar ao Anki is unavailable and its tooltip explains; do not try to force it.
- The summary waits while another modal is open and opens on its own after a reload (`recarregar com um Envio em andamento`).
- The Windows "could not close Anki" Envio shows its own instruction with Continuar envio (`um Envio parado porque o Windows`).
