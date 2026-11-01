# The monthly cap (teto do mês)

The cap on what the key spends per month comes on by default at US$ 10 and is per computer (the Conexão com o Anki keeps it, #160). At 80% a warning sits at the top of the Painel; at 100% the Envio pauses before the next Cartão and its card says “Envio pausado: o teto do mês chegou” with **Ver Custos**, and never a value. The person raises the cap in Custos, or the month turns, and the Envio goes on by itself.

## Sub-features

- `teto-aviso` at 80% a warning `Você já usou N% do teto do mês…` with **Ajustar teto** (goes to Custos and focuses the field); at 100% `O teto do mês chegou…`; below 80% or with the Conexão off, nothing.
- `teto-custos` the card `Teto do mês` in Custos: `US$ X de US$ Y este mês`, the field `Teto do mês em dólares` (starts at 10), **Salvar teto** (`Teto salvo`, `Digite um valor maior que zero.`, `Não deu para salvar o teto. Tente de novo.`).
- `teto-envio-pausado` the Envio card shows the pause text, `Quando você subir o teto ou o mês virar, o Envio continua sozinho.` and **Ver Custos**; no `US$` or `%`.

## How to get to it (user POV)

- Sidebar › **Conexão com o Anki** › **Custos** (`painel.html#anki/custos`) for the card; the warning shows in every area; **Enviar ao Anki** in Frases for the Envio card.

## Driving it with the Playwright e2e harness

Preconditions: `doctor.sh` green. The Anki fake answers `POST /custos/teto` and `/custos/teto/definir` (`fakes.anki.teto.definir({ limite, gasto })`, `passarOTempoAte(dia)`, `guardado()`); the pause is `fakes.anki.moverEnvio(jobId, { …, esperando: { reason: 'monthly_cap' } })`.

- **Warning, card and Envio card.** `drive.sh teto painel-teto.spec`. Observable: `#painel-teto-aviso`, the region `Teto do mês`, the Envio group's text, `fakes.anki.teto.guardado()`.
- **The add-on side.** `python3.9 complemento/test_teto_do_mes.py`: the real server; the pause before the next Cartão, the resume on raising the cap and on the month turning.

## Gotchas

- The cap is per computer (risk 14 of #138, **not confirmed by the owner**): the spend is the sum of this computer's costs.
- It counts what the key spends, including the generated image when the text goes through the plan; the plan's own Cartões count 0.
- The visual references are `test.fixme` (`painel-teto-visual.spec.js`, no PNG) until the owner compares them.
