# Apagar tudo and the Envio (`painel-envio.js`, `painel-perigo.js`, `lib/apagar-frases-pendente.js`)

The design, with what is left over, is `docs/design/envio-apagar-tudo.md`. Tests: `e2e/tests/painel-envio-apagar.spec.js` (it also holds the service worker's alarm),
`test_apagar_frases_pendente.js`, `complemento/test_envio_apagar.py`.

- **The panel ends the tracking.** `Envio.apagarTudo()` (called by `painel.js` after the Zona de perigo confirmed and the Conexão answered) closes the
  progress and the summary, forgets the remessa and writes `pm_envio` as `{ envios: [], apagarFrases: true }`: the Frases of those Envios are gone,
  so no summary and nothing to resend (Tentar de novo would spend the key on deleted Frases; Continuar envio on an Envio the Conexão stopped does
  nothing). An Enviar still creating stops before the next `POST /jobs`, and an answer that arrives later does not bring its Envio back. Other tabs
  hear the mark through `storage.onChanged` and end their tracking too, writing and sending nothing.
- **The Conexão deletes its own** (`PedidoAoAnki.apagarFrasesDosEnvios`, `POST /jobs/apagar-frases`: the lines of the requests and the generated
  texts go; the Cartões' state and the costs stay) and stops the running Envios. `apagarFrases` leaves `pm_envio` when it confirms. With no answer
  the mark stays, the panel asks again when the Conexão answers, and with every panel closed the service worker asks every 30 s while the mark exists
  (`ApagarFrasesPendente.ligar` in `background.js`; no mark, no alarm). No new copy: the “Falha local” text for this is still to be approved
  (`test.fixme` in `configuracoes-visual.spec.js`).
- **The refusal (CFG-17.conexaoNaoResponde).** Whenever the Conexão does not answer, with or without an Envio, `painel-perigo.js` checks it at the
  click (`ConexaoAnki.conferir()`), deletes nothing and writes no mark; the notice has Tentar de novo (checks again and, with the Conexão back,
  deletes: the confirmation was already given) and Detalhes, and goes away when the Conexão answers. The way out is to open the Anki. Visual
  reference: `configuracoes-perigo-visual.spec.js` (`test.fixme`, no PNG, until the owner approves).
- **After the Anki opens** the Conexão waits up to 60 s for the extension's first `/jobs…` request before resuming a stopped Envio, so the
  `apagar-frases` arrives first (the panel sends it on opening; the alarm with every panel closed). What is left: a Conexão that drops right
  after the click, and no Chrome reaching the Conexão in those 60 s (the Envio then resumes and spends the key).
