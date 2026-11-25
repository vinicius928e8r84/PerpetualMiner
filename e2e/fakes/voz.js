'use strict';

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
