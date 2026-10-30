'use strict';

// Fake do Ouvir dos Ajustes de envio (#174), do lado da Conexão com o Anki: `POST /voz/ouvir` responde pelos exemplos do contrato
// (`complemento/contrato/exemplos-da-voz.json`), no contexto `voz` de agora: `aceita` (o padrão), `recusada` (o Google dá 400),
// `fora_do_ar`, `chave_recusada` ou `sem_credito` (a OpenAI). O `<áudio>` do contrato vira um MP3 de verdade, de 0,2 s de silêncio,
// que o Chromium toca.

const MP3_DE_MENTIRA = 'SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYyLjMuMTAwAAAAAAAAAAAAAAD/4zjAAAAAAAAAAAAASW5mbwAAAA8AAAAFAAACQACAgICAgICAgICAgICAgICAgICAoKCg'
  + 'oKCgoKCgoKCgoKCgoKCgoKCgoKDAwMDAwMDAwMDAwMDAwMDAwMDAwODg4ODg4ODg4ODg4ODg4ODg4ODg//////////////////////////8AAAAATGF2YzYyLjExAAAAAAAAAAAAAAAAJALAAAAAAAAA'
  + 'AkCzYEFYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/4xjEAAAAA0gAAAAATEFNRTMuMTAxIChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMSAo'
  + 'YmV0YSAzKVX/4xjEOwAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/4xjEdgAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV'
  + 'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/4xjEsQAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/4xjExAAAA0gAAAAAVVVVVVVVVVVV'
  + 'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';

function criarFakeVoz() {
  const estado = { situacao: 'aceita' };

  /**
   * A resposta do contrato ao Ouvir. O exemplo diz um idioma e um sotaque, e a pessoa escolhe qualquer um dos de Ajustes de
   * envio: a escolha é a mesma pelo provedor, então o pedido vai ao contrato como o do inglês, que é o que ele escreve.
   */
  function naConexao(corpo, respostaDoContrato) {
    const doContrato = { lang: 'en', provedor: corpo.provedor, ...(corpo.provedor === 'google' && { sotaque: 'co.uk' }) };
    const { status, json } = respostaDoContrato('POST', '/voz/ouvir', doContrato);
    return { status, json: json.audio === '<áudio>' ? { audio: MP3_DE_MENTIRA } : json };
  }

  return {
    naConexao,
    /** O contexto `voz` dos exemplos: como o Google e a OpenAI respondem a quem pede uma voz. */
    definir(situacao) { estado.situacao = situacao; },
    situacao() { return estado.situacao; },
  };
}

module.exports = { criarFakeVoz, MP3_DE_MENTIRA };
