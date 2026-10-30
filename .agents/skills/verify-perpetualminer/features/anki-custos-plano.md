# The Custos tab with the key and with the plan

The Custos tab (Conexão com o Anki › Custos) reads the costs from the Conexão's data folder (#159). With the key it shows in US$ what the person spent. When the period has Cartões made through the ChatGPT plan it also shows the card **Plano do ChatGPT**: the Cartões made, “Você economizou US$ X” (what they would have cost on the key, an estimate) and **Gerenciar uso ↗**. The Envio never shows a value or an estimate.

## Sub-features

- `custos-chave` with the key the summary strip and the tiles show the US$ spent; no plan card, no Gerenciar uso.
- `custos-plano` an Envio whose Cartões the plan wrote adds the card `Plano do ChatGPT` above the summary: `N cartões feitos pelo plano`, `Você economizou US$ X` (`< US$ 0,01` under a cent), the note `É uma estimativa do que esses cartões teriam custado na chave.` and the link `Gerenciar uso ↗` (opens `chatgpt.com/settings/usage` in a new tab).
- `custos-plano-idioma` the language tile filters the plan card too.
- `custos-envio-sem-valor` the progress modal and the summary of the Envio show no US$, no “economizou” and ask nothing of `/analytics/jobs`.

## How to get to it (user POV)

- Sidebar › **Conexão com o Anki** › **Custos** (`painel.html#anki/custos`); **Enviar ao Anki** in Frases for the Envio screens.

## Driving it with the Playwright e2e harness

Preconditions: `doctor.sh` green. The Anki fake serves the lines of `POST /analytics/jobs` that the test defines (`fakes.anki.definirCustos([{ …, plano: { cartoes, economia } }])`, the line gets `plan: { cards, wouldCostUsd }` as in `complemento/contrato/exemplos-dos-custos.json`) or those of a contract queue (`definirFila('um Envio de dois Cartões feitos pelo plano do ChatGPT')`).

- **Key and plan views (`custos-chave`, `custos-plano`, `custos-plano-idioma`).** `drive.sh custos-plano painel-custos-plano.spec`. Observable: the region `Plano do ChatGPT` and its text, the `href` and `target` of `Gerenciar uso ↗`, the faixa `Criação de cartões US$ 0,00` (the plan costs nothing per Cartão).
- **The Envio shows no value (`custos-envio-sem-valor`).** `drive.sh custos-envio painel-custos-plano.spec -g "o Envio não mostra valor"`. Observable: no `US$` in the progress modal or in the summary, and no `/analytics/jobs` request in `fakes.anki.requisicoes`.
- **The add-on side.** `python3.9 complemento/test_plano_do_chatgpt.py OsCustosDoPlano`: the real server and a fake ChatGPT; a plan Envio writes `plan_tokens` records and `/analytics/jobs` answers `plan`.

## Gotchas

- The “Você economizou” value is priced from the plan's token usage at the key model's list price (`openai.chat_model`, `engine/cost_tracker.py`), not what OpenAI charged: the plan has no US$ price. Which computer counted it matters: each computer counts its own Cartões (risk 14 of #138, the owner has not confirmed it).
- The visual references are `test.fixme` (`painel-custos-plano-visual.spec.js`, no PNG) until the owner compares them with the approved prototype.
- If OpenAI starts sending the quota %, the bar goes in the plan card (out of #159).
