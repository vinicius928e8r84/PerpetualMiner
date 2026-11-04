# The voice and accent of the audio

In **Ajustes de envio**, the card **Avançado · voz e sotaque do áudio** (#174, #107) holds the two accents of the Google voice (the default; **Sotaque da palavra**, **Sotaque da frase**), the **Voz de reserva** and an **Ouvir** button beside each select. The reserve is a list open to other providers that starts with OpenAI, by the key (`OpenAI, pela chave`; `Sem reserva` turns it off); the Conexão uses it when the Google voice fails. The Anki's own voice (`{{tts}}`) is not in the list. Ouvir has the Conexão speak a sample sentence with the voice on screen (saved or not) and plays it; it saves nothing.

## Sub-features

- `voz-seletores` the Avançado shows the two accents, the Voz de reserva (default `OpenAI, pela chave`) and three Ouvir buttons; the reserve list has only `OpenAI, pela chave` and `Sem reserva`.
- `voz-ouvir` Ouvir asks the Conexão (`POST /voz/ouvir`, `{ lang, provedor: 'google', sotaque }` or `{ lang, provedor: 'openai' }`) and plays the MP3 it returns; Russian speaks Russian. It fails on screen when the Conexão is off, the Google voice is refused, or the OpenAI key is missing (`A voz da OpenAI usa a chave. Ponha-a no card da IA dos cartões.`).
- `voz-reserva-salva` `Sem reserva` is saved by Salvar ajustes (`ttsReserva`), comes back on reopening and turns off the Ouvir of the reserve; a stored value the extension does not know falls back to the default.
- `voz-reserva-no-envio` the Envio request carries `tts.reserva` only when the person changed it (`[]` for `Sem reserva`); without it the Conexão uses OpenAI.
- `voz-reserva-cartao` the Conexão falls back to the reserve voice when Google fails (the 400 of risk 11), only with the OpenAI key (the ChatGPT plan does not cover voice), and writes the cost in the Envio's costs.

## How to get to it (user POV)

- Sidebar › **Conexão com o Anki** › **Ajustes de envio** (`painel.html#anki/ajustes`), a language card, **Avançado**. The reserve at work is visible only in the Card: the audio of a Cartão sent while Google fails.

## Driving it with the Playwright e2e harness

Preconditions: `doctor.sh` green. The voice lives in the Anki fake (`fakes.anki.voz.definir('recusada' | 'fora_do_ar' | 'chave_recusada' | 'sem_credito' | 'aceita')`; the key is `fakes.anki.guardarChaveNaConexao('9f3a')`); it answers by the contract `complemento/contrato/exemplos-da-voz.json` with a 0,2 s MP3 that Chromium plays. It is the extension against the contract, **not** the real Google or OpenAI voice.

- **Selects, Ouvir, saved state (`voz-seletores` … `voz-reserva-no-envio`).** `drive.sh voz painel-ajustes-voz.spec`. Observable: the comboboxes and `Ouvir · …` buttons, the `POST /voz/ouvir` bodies (`fakes.anki.requisicoes`), what the page played, `ankiBridgePresets` and `fakes.anki.envios[0].corpo.tts`.
- **The fallback (`voz-reserva-cartao`).** `python3.9 complemento/test_voz_de_reserva.py` and `test_ouvir_a_voz.py` (the real server, the Google and OpenAI voices faked at the HTTP edge, in-memory collection).

## Gotchas

- The visual references of the Ajustes screens are `test.fixme` (no PNG) until the owner approves them against prototype P9 of #107 (`painel-ajustes-voz-visual.spec.js`, `painel-anki-visual.spec.js`).
- Not provable here: the real Google voice from the owner's Mac (risk 11) and the real OpenAI voice; the owner's rehearsal.
