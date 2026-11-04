# The Estilo do cartão: the level and the front of each language

In **Ajustes de envio** (`painel.html#anki/ajustes`), every language card has **Estilo do cartão** after the Imagens (#162, BRG-42): a segmented control **Iniciante · Intermediário · Avançado**, and under the chosen level its text (the ones of the level quiz of #134, with the language: “Entendo o inglês explicado em inglês”). It only writes on **Salvar ajustes**, and the next Envio asks the Conexão for the saved level. Under the level there is **Frente** (#166, BRG-43): **Frase com áudio · Ouvir primeiro · Lacuna** per language, with its text under it (“A frase sem a palavra, com uma dica e sem áudio”). On **Salvar ajustes** a changed front is asked of the Conexão (`POST /anki/card-front`), which only rewrites the Card model of the language's note type. What the Card looks like in the Anki is `features/anki-cartao.md`.

## Sub-features

- `estilo-default` a language with nothing saved is on Iniciante, with “Não entendo nada ou só algumas palavras” under the control.
- `estilo-pick` choosing Intermediário or Avançado changes the text under the control and the status to “Alterações não salvas”; nothing is stored until Salvar ajustes, which stores `nivel` of that language only (`ankiBridgePresets`). The other language is not touched.
- `estilo-russian` the Russian card enables only Iniciante (Intermediário and Avançado are disabled, with “No russo, por enquanto só o Iniciante.”) until the Russian levels (#163); a stored level the language does not have reads as Iniciante.
- `estilo-envio` the Envio's `POST /jobs` carries `nivel` (`intermediario`, `avancado`) only off the Iniciante, which is what the Conexão does without it; an Envio already created keeps the level it was born with. The Conexão refuses a level the language does not have (`400 invalid_level`).

- `frente-default` a language with nothing saved is on Frase com áudio, with “A frase e o áudio na frente do cartão” under the control; there are three fronts (no Imagem primeiro).
- `frente-pick` choosing a front changes the text under the control and the status to “Alterações não salvas”; nothing is stored and nothing is asked of the Conexão until Salvar ajustes. Saving a changed front stores `frente` of that language only (`ankiBridgePresets`) and sends `{ lang, frente }` to `POST /anki/card-front`; saving without changing it sends nothing. Each language keeps its own (Lacuna in English and Ouvir primeiro in Russian).
- `frente-fails` if the Conexão is off, the Anki is not ready (no profile open, another profile, syncing) or the person changed the note type in the Anki, the other settings are saved, the stored front stays the one the Anki has, the choice stays on the screen as unsaved, and the warning says why with **Tentar de novo**.

## How to get to it (user POV)

- Sidebar › **Conexão com o Anki** › **Ajustes de envio** (`painel.html#anki/ajustes`), a language card, **Estilo do cartão**. Then Frases › tick a phrase › **Enviar ao Anki**.

## Driving it with the Playwright e2e harness

- `node scripts/testar.mjs e2e -- painel-ajustes-estilo --workers=2` (the fake Conexão is `e2e/fakes/anki.js`, the contract `complemento/contrato/exemplos-do-nivel.json`). Observable: the radios of the `radiogroup` “Estilo do cartão”, the stored `ankiBridgePresets` and `pm_envio`, and `fakes.anki.envios[n].corpo.nivel`.
- `node scripts/testar.mjs e2e -- painel-ajustes-frente --workers=2` for the front (the contract is `complemento/contrato/exemplos-da-frente.json`). Observable: the radios of the `radiogroup` “Frente”, the stored `ankiBridgePresets`, the requests to `/anki/card-front` and `fakes.anki.frente.guardadas()`; `fakes.anki.frente.mexerNoTipoDeNota('en')` makes the Conexão refuse (`409 note_type_changed`).
- The visual proposals are in `e2e/tests/painel-ajustes-estilo-visual.spec.js` and `e2e/tests/painel-ajustes-frente-visual.spec.js` (`test.fixme` until the owner approves).

## Gotchas

- The front is **not** in the Envio's `POST /jobs`: the Conexão rewrites the model in the Anki when the person saves, so every Card of the language (also the ones already sent) changes at once, with no new note and no cost. A Card made before #166 has no `Frase com lacuna`, so on Lacuna it shows its Frase; a Card without the phrase audio is blank on Ouvir primeiro.
- The level is per language and per saved Ajustes; the Envio reads it when it is created, so changing it afterwards does not change an Envio that already left.
- There is no proof here of the model's text: the real prompts are only checked by the contract tests (`engine/test_prompt_contracts.py`) and by a fake OpenAI; the Card from a real OpenAI at each level is the owner's rehearsal.
