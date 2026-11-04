# The Estilo do cartão: the level of each language

In **Ajustes de envio** (`painel.html#anki/ajustes`), every language card has **Estilo do cartão** after the Imagens (#162, BRG-42): a segmented control **Iniciante · Intermediário · Avançado**, and under the chosen level its text (the ones of the level quiz of #134, with the language: “Entendo o inglês explicado em inglês”). It only writes on **Salvar ajustes**, and the next Envio asks the Conexão for the saved level. What the Card looks like in the Anki is `features/anki-cartao.md`.

## Sub-features

- `estilo-default` a language with nothing saved is on Iniciante, with “Não entendo nada ou só algumas palavras” under the control.
- `estilo-pick` choosing Intermediário or Avançado changes the text under the control and the status to “Alterações não salvas”; nothing is stored until Salvar ajustes, which stores `nivel` of that language only (`ankiBridgePresets`). The other language is not touched.
- `estilo-russian` the Russian card enables only Iniciante (Intermediário and Avançado are disabled, with “No russo, por enquanto só o Iniciante.”) until the Russian levels (#163); a stored level the language does not have reads as Iniciante.
- `estilo-envio` the Envio's `POST /jobs` carries `nivel` (`intermediario`, `avancado`) only off the Iniciante, which is what the Conexão does without it; an Envio already created keeps the level it was born with. The Conexão refuses a level the language does not have (`400 invalid_level`).

## How to get to it (user POV)

- Sidebar › **Conexão com o Anki** › **Ajustes de envio** (`painel.html#anki/ajustes`), a language card, **Estilo do cartão**. Then Frases › tick a phrase › **Enviar ao Anki**.

## Driving it with the Playwright e2e harness

- `node scripts/testar.mjs e2e -- painel-ajustes-estilo --workers=2` (the fake Conexão is `e2e/fakes/anki.js`, the contract `complemento/contrato/exemplos-do-nivel.json`). Observable: the radios of the `radiogroup` “Estilo do cartão”, the stored `ankiBridgePresets` and `pm_envio`, and `fakes.anki.envios[n].corpo.nivel`.
- The visual proposals are in `e2e/tests/painel-ajustes-estilo-visual.spec.js` (`test.fixme` until the owner approves).

## Gotchas

- The level is per language and per saved Ajustes; the Envio reads it when it is created, so changing it afterwards does not change an Envio that already left.
- There is no proof here of the model's text: the real prompts are only checked by the contract tests (`engine/test_prompt_contracts.py`) and by a fake OpenAI; the Card from a real OpenAI at each level is the owner's rehearsal.
