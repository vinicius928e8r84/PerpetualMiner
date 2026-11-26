# The states of the Envio's card

What the card of an Envio says in the corners: the request with no answer, the key refused, the Frases wiped in the Conexão by another browser, the Envio the Conexão does not know, the Envio whose kept record lost some Frases. The states, the phases and the table of reasons are in `.agents/skills/painel-anki/envio-estados.md`.

## Sub-features

- `envio-pedindo` while `POST /jobs` has no answer the card says `Enviando o pedido`, with no `etapa` and no `Na fila`; after 10 s it is `Não começou` with `A Conexão com o Anki não respondeu. Confira se ela está ligada.` and **Tentar de novo**; Enviar ao Anki with another Frase still works.
- `envio-motivo` an Envio that ended on `openai_key_rejected` says `A OpenAI não aceitou a chave.` with **Trocar a chave**, on the card (another Envio still running) and in the summary block (with **Tentar de novo**).
- `envio-chave-de-outra-conta` (#897) the panel sends the signed-in Account's uid as `conta` in `POST /jobs`; a key saved by another Account is not spent: that Envio ends on `openai_key_missing` (`Falta a chave da OpenAI.`, **Trocar a chave**) with no call to OpenAI, while the Account that owns the key (or a key with no owner) keeps sending. Proof: `python -m unittest complemento.test_envio_de_outra_conta` (two Accounts on one computer) and `testes/test_painel_envio_criar.js`; not driven in e2e (the fake Conexão does not compare Accounts).
- `envio-login-acabou` an Envio that ended on `chatgpt_signed_out` says `O login do ChatGPT acabou. Entre de novo ou use a chave: o Envio não troca sozinho.` with **Abrir IA dos cartões** (no Tentar de novo on the card); the AI card then shows the ended login (`ia-chatgpt-acabou` in [ia.md](./ia.md)).
- `envio-sem-palavra` a Frase sem Palavra marcada (its line goes with no `palavra : `) ends the Envio on `keyword_missing`: the summary block says `1 não entrou` and `Falta marcar a Palavra. Clique na palavra da frase que o cartão vai ensinar e envie de novo.` (with **Tentar de novo**, which fails again until the Palavra is marked; #543).
- `envio-apagado` an Envio the Conexão stopped with `frases_apagadas` says `As frases deste Envio foram apagadas da Conexão com o Anki.` with only **Esquecer**; no `POST /jobs/retry` leaves, no summary opens for it.
- `envio-retomada-recusada` the Conexão refuses to retry a wiped Envio (`409 job_wiped`). The summary's **Tentar de novo** then sends what did not enter in a new Envio; in the Custos tab the detail says the wiped-Frases sentence and loses **Continuar envio** (no `Envio retomado` toast); in the Boas-vindas the frozen request is dropped (`Algo impediu o envio.`) and **Tentar de novo** builds another (`boas-vindas-envio.spec -g "apagadas na Conexão"`).
- `envio-desconhecido` an Envio in `pm_envio` the Conexão does not know (another install, its data deleted): the card says `Não encontrado` and `A Conexão com o Anki não conhece este Envio. Ele pode ser de outra instalação, ou os dados dela foram apagados.`, with **Esquecer** and no **Continuar envio**; no summary decides “não entraram” for it; **Esquecer** drops it from `pm_envio` and keeps the Frases.
- `envio-acompanhado` the Custos tab's **Continuar envio** (C3, `EnvioAcompanhado` in `painel-envio-estado.js`, used by `painel-anki-continuar.js`): after `Envio retomado` the detail follows that Envio by itself, `Na fila` → the stage → `Concluído`, with no Atualizar and no loading look; the `POST /jobs/get` reads stop once it ends. In the progress modal the card's **Tentar de novo** and **Usar a minha chave** go through the same module (step 3): two clicks are one request, a refused retry says `POST /jobs/retry <jobId> · HTTP 500 · internal_error` in Detalhes, and the modal sends no `/jobs/get` (it keeps one `/jobs/list` for all its Envios).
- `envio-retido` an Envio the Conexão kept after its retention with Frases outside the success: the summary says `1 não entrou`, and its **Tentar de novo** makes a new Envio with only those Frases (a new `jobId`).

## How to get to it (user POV)

- **Frases** › tick a Frase › **Enviar ao Anki**: the progress modal, one card per language.

## Driving it with the Playwright e2e harness

Preconditions: `doctor.sh` green. `fakes.anki.silenciar('/jobs')` makes only that route accept and never answer (`voltarAFalar()` undoes it); `concluirEnvio(jobId, { erro: 'openai_key_rejected' })` ends an Envio with a reason; `apagarAsFrases()` is the Apagar tudo of another browser.

- **All of them.** `drive.sh envio-estados painel-envio-estados.spec`. Observable: the card's text and buttons, `fakes.anki.requisicoes` (no `/jobs/retry`), `pm_envio` at the end.
- **Unknown and retained (`envio-desconhecido`, `envio-retido`).** `drive.sh envio-desconhecido painel-envio-desconhecido.spec` (seeds `pm_envio` with a `jobId` the fake never made) and `drive.sh envio-retido painel-envio-retido.spec` (`fakes.anki.responder('POST', '/jobs/list', …)` answers the kept record). Observable: the card text, `pm_envio` at the end, `fakes.anki.envios[1].entries` with only the Frase that did not enter.
- **Followed after Continuar envio (`envio-acompanhado`).** `drive.sh envio-acompanhado painel-anki-continuar.spec`: the contract's queue `um Envio que terminou em parte`, `moverEnvio` and `concluirEnvio` with the frozen clock run 2 s each time. Observable: the detail's selo at each step, the `/jobs/get` count flat after `Concluído`, `pm_anki_custos` with the Envio `completed`. The modal: `drive.sh envio-acompanhado-modal painel-envio-limite.spec -g "Usar a minha chave"` and `painel-envio-estados.spec -g "que a Conexão recusa"` (observable: the `/jobs/usar-a-chave` and `/jobs/retry` counts, none to `/jobs/get`, the Detalhes text). The module alone: `node testes/test_envio_acompanhado.js`.
- **The machines, no browser.** `node testes/test_estado_do_envio.js` (prints `estado do envio ok`): a line per state, per reason code, per phase transition and per stored value. The Conexão's recorded state: `python3.9 complemento/test_estado_do_envio.py` (the table, the single gate, `409 job_wiped` on the retry of a wiped Envio).

## Gotchas

- `Enviando o pedido` and the wiped-Frases sentence are ENV-24, and the ended-login sentences are CFG-46: copy still to be approved by the owner.
- The step bar still follows `stage`, recorded per Cartão: it goes back on each Cartão. Changing it changes approved visual references.
