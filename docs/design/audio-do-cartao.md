# O áudio do Cartão na Conexão com o Anki (#143, #174)

Continuação de [envio-no-complemento.md](envio-no-complemento.md) (#142). Fatia fechada: o código é `complemento/voz.py`, `audio_do_cartao.py`, `voz_da_openai.py` e `rotas_da_voz.py`, e o contrato é [`complemento/contrato/voz.md`](../../complemento/contrato/voz.md); esta página guarda só as decisões e os limites. Nenhum pedido nem resposta entre a extensão e a Conexão mudou: o `POST /jobs` já leva `tts: { wordTld, phraseTld }`, e a etapa `generate_audio` já é uma etapa que o painel sabe dizer.

## Decisões

- **A voz padrão é a do Google Tradutor, pedida só com a biblioteca padrão** (sem gTTS): o mesmo pedido que o gTTS 2.5 faz, com o texto quebrado em pedaços de até 100 letras. O sotaque do pedido (`wordTld`, `phraseTld`) vale sobre o do `engine/config.json`; um sotaque que não é de um endereço do Google é ignorado.
- **O áudio nunca é gravado em `user_files`**: vai do Google à coleção na mesma volta, **junto com a nota nova** e na mesma função da thread principal (nada a limpar no Apagar tudo, nada no pacote de diagnóstico). Duplicata e `guid` repetido não gravam mídia.
- **O Cartão não entra mudo.** A pessoa pediu um Cartão com áudio, e dizer “Enviado” seria falso (regra de status verdadeiro): o Cartão fica `failed` com um código, sem nota, e o Tentar de novo o refaz sem pagar o texto de novo. O código vai para o Detalhes, e o log nunca leva o que o Google respondeu nem a Palavra ou a Frase.

| código | quando | tenta de novo sozinho |
|---|---|---|
| `tts_unreachable` | sem rede, ou o Google com 429 ou 5xx | sim, nas mesmas esperas da OpenAI (`esperas_da_openai`) |
| `tts_rejected` | o Google recusou o pedido (4xx) | não |
| `tts_empty` | resposta boa, sem áudio dentro | não |

- **A reserva é uma lista de provedores** (`tts.reserva` no pedido do Envio; sem ela vale `["openai"]`, `[]` é sem reserva), tentada na ordem depois de o Google esgotar as esperas ou ser recusado. Hoje só existe a `openai` (`tts-1`, voz `alloy`), **pela chave**: o plano do ChatGPT não cobre voz, e sem a chave a reserva é pulada. Cada Palavra e cada Frase cai sozinha; se todas falham, o Cartão falha com o código do Google. A voz da reserva entra nos custos do Envio (`type: tts`, US$ 0,015 por mil letras, na linha `otherUsd` da aba Custos); o Google é de graça e não anota nada. A voz do Anki (`{{tts}}`) não entra.
- **O Ouvir** (`POST /voz/ouvir`) fala uma frase de amostra por idioma com a voz que está na tela, salva ou não, e não grava nada. O pedido do Envio só leva `reserva` quando a pessoa mudou o padrão. No Avançado dos Ajustes de envio a seção é “voz e sotaque do áudio” (BRG-07).

## Limites aceitos

- **Risco 11:** a voz da Palavra por `translate.google.com` (sotaque `com`) deu 400 só no Mac do dono. Sem reserva isso é `tts_rejected`; com a reserva, o Cartão entra com a voz da OpenAI.
- **Duplicata gasta a voz:** o Cartão que acaba `duplicate` já pediu o áudio antes de a coleção dizer que a frente existia (a busca da duplicata e a gravação são uma função só). A voz é de graça.
- **Mesmo endereço do gTTS, mesma exposição:** o Google pode mudar o pedido e quebrar o gTTS e a Conexão juntos; a reserva cobre a falha.
- **O Anki de verdade:** `col.media.write_data` (Anki 2.1.50 ou mais novo) só foi conferido contra um `mw` de mentira; o ensaio do dono no Mac é o #269.
- A Conexão de hoje (`bridge/`) não tem a rota nem a reserva.
