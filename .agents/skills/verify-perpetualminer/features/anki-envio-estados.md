# The states of the Envio's card

What the card of an Envio says in the corners: the request with no answer, the key refused, the Frases wiped in the Conexão by another browser. The states, the phases and the table of reasons are in `painel-anki/envio-estados.md`.

## Sub-features

- `envio-pedindo` while `POST /jobs` has no answer the card says `Enviando o pedido`, with no `etapa` and no `Na fila`; after 10 s it is `Não começou` with `A Conexão com o Anki não respondeu. Confira se ela está ligada.` and **Tentar de novo**; Enviar ao Anki with another Frase still works.
- `envio-motivo` an Envio that ended on `openai_key_rejected` says `A OpenAI não aceitou a chave.` with **Trocar a chave**, on the card (another Envio still running) and in the summary block (with **Tentar de novo**).
- `envio-login-acabou` an Envio that ended on `chatgpt_signed_out` says `O login do ChatGPT acabou. Entre de novo ou use a chave: o Envio não troca sozinho.` with **Abrir IA dos cartões** (no Tentar de novo on the card); the AI card then shows the ended login (`ia-chatgpt-acabou` in [ia.md](./ia.md)).
- `envio-apagado` an Envio the Conexão stopped with `frases_apagadas` says `As frases deste Envio foram apagadas da Conexão com o Anki.` with only **Esquecer**; no `POST /jobs/retry` leaves, no summary opens for it.

## How to get to it (user POV)

- **Frases** › tick a Frase › **Enviar ao Anki**: the progress modal, one card per language.

## Driving it with the Playwright e2e harness

Preconditions: `doctor.sh` green. `fakes.anki.silenciar('/jobs')` makes only that route accept and never answer (`voltarAFalar()` undoes it); `concluirEnvio(jobId, { erro: 'openai_key_rejected' })` ends an Envio with a reason; `apagarAsFrases()` is the Apagar tudo of another browser.

- **All three.** `drive.sh envio-estados painel-envio-estados.spec`. Observable: the card's text and buttons, `fakes.anki.requisicoes` (no `/jobs/retry`), `pm_envio` at the end.
- **The machines, no browser.** `node test_estado_do_envio.js` (prints `estado do envio ok`): a line per state, per reason code, per phase transition and per stored value.

## Gotchas

- `Enviando o pedido` and the wiped-Frases sentence are ENV-24, and the ended-login sentences are CFG-46: copy still to be approved by the owner.
- The step bar still follows `stage`, recorded per Cartão: it goes back on each Cartão. Changing it changes approved visual references.
