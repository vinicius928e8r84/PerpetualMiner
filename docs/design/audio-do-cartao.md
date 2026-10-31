# Página de desenho: o áudio do Cartão na Conexão com o Anki (#143)

Continuação de [envio-no-complemento.md](envio-no-complemento.md) (#142): o Cartão que a Conexão grava ganha o áudio da Frase e o da
Palavra, com a voz do Google pedida só com a biblioteca padrão (sem gTTS) e os sotaques de hoje. A imagem segue fora (#144). Nenhum
pedido nem resposta entre a extensão e a Conexão muda: o pedido de `POST /jobs` já leva `tts: { wordTld, phraseTld }` (os Ajustes de
envio), e a etapa `generate_audio` já é uma etapa que o painel sabe dizer (“Gerando áudio”, catálogo da Voz).

## O que acontece

Por Cartão, depois do texto (`estado/<jobId>/<id>.txt`) e antes da nota (`envio.Trabalho`, `audio_do_cartao.py`):

1. O motor diz o que o Cartão fala e com que sotaque: `generate_audio.voices()` (o mesmo que a Conexão de hoje, `bridge/`, usa para o gTTS):
   a Palavra é a do Cartão; a Frase é a da frente do texto gerado (sem `*`, sem `[...]`); o perfil é o do idioma do texto (cirílico →
   russo) e o sotaque do pedido (`wordTld`, `phraseTld`) vale sobre o do `engine/config.json`. Um sotaque que não é de um endereço do
   Google (`com`, `co.uk`, `com.au`, `ru`…) é ignorado, e vale o de `config.json`.
2. A Conexão pede o MP3 de cada um ao Google Tradutor (`voz.py`): o mesmo pedido que o gTTS 2.5 faz (RPC `jQ1olc` em
   `translate.google.<sotaque>`), o texto preparado e quebrado em pedaços de até 100 letras como ele faz, os pedaços colados em ordem.
   Etapa `generate_audio` enquanto isso.
3. A nota é montada com `[sound:<guid>_phrase.mp3]` na frente e `[sound:<guid>_word.mp3]` no verso (`send_to_anki.card_fields`), e
   `gravar_cartao` guarda os dois arquivos na mídia da coleção (`col.media.write_data`) **junto com a nota nova**, na mesma função da
   thread principal. Nota que já estava (`guid`) ou duplicata (a frente já no Baralho): nenhuma mídia é gravada. Se a coleção trocou o
   nome de um arquivo (já havia outro com o mesmo nome e outro conteúdo), a nota cita o nome que ficou.

O áudio nunca é gravado em `user_files`: vai do Google à coleção na mesma volta (nada a limpar no Apagar tudo, nada no pacote de
diagnóstico). Se a gravação da nota é atrasada ou interrompida, a volta seguinte pede o áudio de novo (a voz é de graça; o texto, pago,
não é pedido de novo).

## Quando a voz falha

O Cartão **não** entra mudo: a pessoa pediu um Cartão com áudio, e dizer “Enviado” seria falso (regra de status verdadeiro). O Cartão
fica `failed` com um código, sem nota, e o Tentar de novo o refaz sem pagar o texto:

| código | quando | tenta de novo sozinho |
|---|---|---|
| `tts_unreachable` | sem rede, ou o Google com 429 ou 5xx | sim, nas mesmas esperas da OpenAI (`esperas_da_openai`) |
| `tts_rejected` | o Google recusou o pedido (4xx) | não |
| `tts_empty` | resposta boa, sem áudio dentro | não |

O código vai para o Detalhes, como os outros da §2 de `envio-no-complemento.md` (sem cópia própria nesta fatia: a tela diz “não
entrou”). O log cita o Cartão e o código, nunca o que o Google respondeu nem a Palavra ou a Frase.

**Risco 11:** a voz da Palavra por `translate.google.com` (sotaque `com`) deu 400 só no Mac do dono. Sem reserva, isso é `tts_rejected`
no Cartão; com a reserva (a seção abaixo, #174), o Cartão entra com a voz da OpenAI.

## Limites aceitos

- **Duplicata gasta a voz:** o Cartão que acaba `duplicate` já pediu o áudio antes de a coleção dizer que a frente existia (a busca da
  duplicata e a gravação são uma função só, na thread principal). A voz é de graça.
- **Mesmo endereço do gTTS, mesma exposição:** o Google pode mudar o pedido e quebrar o gTTS e a Conexão juntos; a reserva (#174) cobre a falha.
- **O Anki de verdade:** `col.media.write_data` (Anki 2.1.50 ou mais novo) é conferido só contra um `mw` de mentira; o ensaio do dono no
  Mac é o #269.

## Provas

| o quê | teste |
|---|---|
| a nota cita dois `[sound:…]`, a coleção guarda os dois arquivos, e os bytes são os que a voz de mentira devolveu para o texto e o sotaque certos | `complemento/test_envio_audio.py` (a voz do Google de mentira na fronteira HTTP: `test_voz_de_mentira.py`) |
| os sotaques dos Ajustes de envio (e os de hoje, sem eles; e um sotaque que não é do Google) | `test_envio_audio.py` |
| russo: cirílico, língua `ru` | `test_envio_audio.py` |
| texto comprido: pedaços de até 100 letras, os mesmos que o gTTS pede, e o arquivo toca na ordem; a abreviação perde o ponto | `test_envio_audio.py` |
| 400 da voz: Cartão `failed` com `tts_rejected`, sem nota; o Tentar de novo termina sem pagar o texto de novo | `test_envio_audio.py` |
| voz fora do ar por um momento, para sempre, e resposta sem áudio | `test_envio_audio.py` |
| duplicata e `guid` repetido não gravam mídia; tipo de nota ausente não deixa mídia órfã; nome trocado pela coleção | `test_colecao_em_memoria.py`, `test_no_anki.py` (o mesmo contrato nos dois adaptadores) |
| pelo adaptador do Anki, na thread principal | `test_no_anki_envio.py` |
| o motor de áudio importa no pacote sem gTTS | `test_motor.py`, `test_pacote.py` |
| a Conexão de hoje diz o mesmo texto e sotaque (gTTS trocado na importação) | `engine/test_generate_audio.py` |

## A reserva e o Ouvir (#174)

Contrato: [`complemento/contrato/voz.md`](../../complemento/contrato/voz.md). A voz padrão segue sendo a do Google. A **reserva é uma lista**
de provedores (`tts.reserva` no pedido do Envio; sem ela vale `["openai"]`, `[]` é sem reserva) que a Conexão tenta na ordem **depois** de
o Google esgotar as esperas ou ser recusado (`tts_rejected`, `tts_empty`, `tts_unreachable`). Hoje só existe a `openai` (`voz_da_openai.py`,
`POST /v1/audio/speech`, `tts-1`, voz `alloy`, o mesmo MP3 que entra na nota), **pela chave**: o plano do ChatGPT não cobre voz, e sem a chave
a reserva é pulada. Cada Palavra e cada Frase cai sozinha: o Google pode falar uma e a reserva a outra. Se todas falham, o Cartão falha com o
código do Google. A voz que falou entra nos custos do Envio (`type: tts`, US$ 0,015 por mil letras, na linha `otherUsd` da aba Custos); o
Google é de graça e não anota nada. O log diz o Cartão e o código, nunca o texto nem a chave. A voz do Anki (`{{tts}}` do tipo de nota) não entra.

Na extensão, o Avançado dos Ajustes de envio passa a se chamar “voz e sotaque do áudio” (BRG-07): os dois sotaques do Google, a **Voz de
reserva** (`ttsReserva`: `openai` ou `nenhuma`, padrão `openai`) e um **Ouvir** ao lado de cada seletor. O pedido do Envio só leva `reserva`
quando a pessoa mudou o padrão. O Ouvir é `POST /voz/ouvir`: a Conexão fala uma frase de amostra (uma por idioma) com a voz que está na tela,
salva ou não, e o painel toca o MP3; não grava nada. A Conexão de hoje (`bridge/`) não tem a rota nem a reserva (sai no #179).

| o quê | teste |
|---|---|
| o 400 do Google (risco 11) cai para a OpenAI pela chave, na Palavra e na Frase, e o Cartão entra com os dois áudios | `complemento/test_voz_de_reserva.py` |
| sem chave, só com o login do ChatGPT, sem reserva no pedido ou com a OpenAI recusando: o Cartão falha com o código do Google | `test_voz_de_reserva.py` |
| a lista: nome desconhecido pulado, forma inválida recusada, custo da voz paga nos Custos | `test_voz_de_reserva.py` |
| o Ouvir do Google (sotaque e idioma), da OpenAI, sem chave, recusado, pedido inválido | `complemento/test_ouvir_a_voz.py` e o contrato `exemplos-da-voz.json` |
| os seletores, o Ouvir, o que fica guardado e o que o Envio leva | `e2e/tests/painel-ajustes-voz.spec.js` |
