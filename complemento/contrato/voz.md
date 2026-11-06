# A voz e o sotaque do áudio (#174)

Exemplos: `exemplos-da-voz.json`. A voz padrão do Cartão é a do Google; a reserva é uma **lista** de provedores, aberta a outros, que a Conexão tenta na ordem quando o Google falha (`docs/design/audio-do-cartao.md`).

## No pedido do Envio

`POST /jobs` leva `tts: { wordTld, phraseTld, reserva? }`. `reserva` é uma lista de até 8 nomes de provedor (`[a-z0-9_-]`, até 32 letras); sem ela vale `["openai"]`, e `[]` é sem reserva. Um nome que a Conexão não conhece é pulado. Uma `reserva` que não é uma lista de nomes é `400 invalid_request`. A extensão só a manda quando a pessoa a mudou. Hoje só `openai` existe, e só com a chave (o plano do ChatGPT não cobre voz); sem a chave, a reserva é pulada. Se todas falham, o Cartão falha com o código do Google (`tts_rejected`, `tts_unreachable`, `tts_empty`).

## O Ouvir

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /voz/ouvir` | `{ lang, provedor: 'google', sotaque }` ou `{ lang, provedor: 'openai' }` | `200 { audio }`: um MP3 em base64 de uma frase de amostra (uma por idioma, da Conexão). `400 invalid_request` (idioma fora de `en`/`ru`, provedor desconhecido, sotaque que não é de um endereço do Google); `409 openai_key_missing`; `502` com o código da voz: `tts_rejected`, `tts_unreachable`, `tts_empty`, `openai_key_rejected` ou `openai_no_credit` |

Nada é guardado. O contexto `voz` dos exemplos diz como as vozes respondem: `aceita`, `recusada` (o Google dá 400), `fora_do_ar`, `chave_recusada` ou `sem_credito` (a OpenAI). O `<áudio>` do exemplo é qualquer MP3 em base64 não vazio.

## A fala do quiz de nível (#170)

Exemplos: `exemplos-do-quiz.json`.

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /voz/falar` | `{ lang, sotaque, texto }` | `200 { audio }`: o MP3 em base64 de `texto` (de 1 a 200 letras) dito com a voz do Google, no `sotaque`. `400 invalid_request` (idioma fora de `en`/`ru`, sotaque que não é de um endereço do Google, `texto` que não é uma frase de até 200 letras); `502` com o código da voz: `tts_rejected`, `tts_unreachable` ou `tts_empty` |

É uma rota à parte do `Ouvir`: uma Conexão antiga responde `404` e a extensão pede para atualizá-la, em vez de tocar a frase de amostra no lugar da pergunta. Só o Google (de graça); a OpenAI não fala o quiz. Nada é guardado, e o log não leva a frase.
