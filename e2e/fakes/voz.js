'use strict';

// Fake do Ouvir dos Ajustes de envio (#174) e da fala do quiz de nível (#170, `POST /voz/falar`, `exemplos-do-quiz.json`), do lado da Conexão com o Anki: `POST /voz/ouvir` responde pelos exemplos do contrato
// (`complemento/contrato/exemplos-da-voz.json`), no contexto `voz` de agora: `aceita` (o padrão), `recusada` (o Google dá 400),
// `fora_do_ar`, `chave_recusada` ou `sem_credito` (a OpenAI). O `<áudio>` do contrato vira um MP3 de verdade, de pouco mais de 0,2 s de silêncio,
// que o Chromium decodifica e toca (MPEG-2, 24 kHz, sem etiqueta ID3 nem quadro Xing: o MP3 anterior, com os dois, dava
// `NotSupportedError` no `play()` e Ouvir mostrava o erro do toque).

const MP3_DE_MENTIRA = '//MkxAAAAANIAAAAAExBTUUzLjEwMSAoYmV0YSAzKVVVVVVVVVVMQU1FMy4xMDEg//MkxCMAAANIAAAAAChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDEg//MkxEYAAANIAAAAAChiZXRhIDMpVVVV'
  + 'VVVVVVVVVVVVVVVVVVVMQU1FMy4xMDEg//MkxGkAAANIAAAAAChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDEg//MkxIwAAANIAAAAAChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV'
  + '//MkxK8AAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxNIAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxNwAAANIAAAAAFVVVVVVVVVVVVVV'
  + 'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxNwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxNwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV'
  + '//MkxNwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

const FRASE_DO_CONTRATO = 'Could you tell me where the nearest pharmacy is?';

function criarFakeVoz() {
  const estado = { situacao: 'aceita' };

  function naConexao(corpo, respostaDoContrato, caminho = '/voz/ouvir') {
    const doContrato = caminho === '/voz/falar' ? { lang: 'en', sotaque: 'co.uk', texto: FRASE_DO_CONTRATO }
      : { lang: 'en', provedor: corpo.provedor, ...(corpo.provedor === 'google' && { sotaque: 'co.uk' }) };
    const { status, json } = respostaDoContrato('POST', caminho, doContrato);
    return { status, json: json.audio === '<áudio>' ? { audio: MP3_DE_MENTIRA } : json };
  }

  return {
    naConexao,
    definir(situacao) { estado.situacao = situacao; },
    situacao() { return estado.situacao; },
  };
}

module.exports = { criarFakeVoz, MP3_DE_MENTIRA };
