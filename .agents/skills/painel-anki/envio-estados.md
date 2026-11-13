# The Envio's state machines (`painel-envio-estado.js`, `lib/envio-gravado.js`)

Three pure pieces, no screen, proven without a browser by `node test_estado_do_envio.js`; on screen by `e2e/tests/painel-envio-estados.spec.js`.

- **What one Envio is now: `SituacaoDoEnvio.situacaoDoEnvio(envio, job, { desconhecido, ankiFechado, agora })`.** One state from a closed list, in
  this order of precedence: `criando` (the `POST /jobs` has no answer yet: the card says “Enviando o pedido”, ENV-24, with no “etapa N de 7”,
  never “Na fila”), `naoComecou` (`causa`: `ajustes`, `semResposta`, `erro`), `desconhecido` (#245), `apagado` (`lastError: frases_apagadas`: the
  Apagar tudo of another browser stopped it in the Conexão; ENV-24 and only **Esquecer**, never Tentar de novo), `concluido`, `emParte` and
  `naoConcluido` (with `motivo`, the `lastError`), `parado` (Anki closed, #151), `esperando` (`espera`: plan, cap, other profile, missing profile, the
  Anki after 5 min), `naFila`, `andando`. `painel-envio-cartao.js` only draws the state (`pedidoDoCartao` is a `switch` on it); `painel-envio.js`
  asks it `terminou`, `retomavel` and `foraDoResumo`. A new state enters there, with its line in the test, not as one more `if` in the card.
- **Why an Envio did not conclude: `SituacaoDoEnvio.doCodigo(lastError)`.** One table for the card, the summary block and the Boas-vindas
  (`painel-boas-vindas-envio.js`): the sentence (`fala`; `noPainel` when the panel says it differently, `null` when it says nothing) and the help
  (`AJUDA`: Tentar de novo, Trocar a chave, Usar a chave, Gerenciar uso). A code the Conexão starts sending gets its line there.
- **What the remessa is doing: `FaseDaRemessa.proxima(fase, evento)`.** `parada → criando → acompanhando → resumo → parada`; Apagar tudo takes any
  phase to `parada`; an event the phase does not accept changes nothing (`aceita`). Every request of the remessa (`POST /jobs`, `/jobs/retry`,
  `/jobs/list`) has `PRAZO_DO_PEDIDO_MS`: a Conexão that accepts and never answers ends in “Não começou” with Tentar de novo, and Enviar ao
  Anki keeps working.
- **What is stored: `EnvioGravado` (`lib/envio-gravado.js`).** The only writer of `pm_envio`, for the panel and the service worker:
  `proximo(gravado, evento)` over `acompanhar`, `esquecer`, `apagarTudo`, `confirmou`. `confirmou` reads again after the Conexão answered, so
  an Envio created while the Apagar tudo waited stays.

Left as it was: the 7-segment bar still reads the Envio's `stage`, which the Conexão records per Cartão (the bar goes back to stage 2 on each
Cartão). Showing `n de total` Cartões changes the approved visual references, so it waits for the owner.
