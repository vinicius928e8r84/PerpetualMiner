'use strict';

const VERSAO_DOS_EXEMPLOS_NO_DISCO = '9.9.9';

function criarAtualizacao({ contextoDeAgora, mudarContexto, desligar, ligar, silencioMs = 4000 }) {
  const estado = { versao: null, versaoNova: null, reinicios: 0 };

  const nova = () => estado.versaoNova || VERSAO_DOS_EXEMPLOS_NO_DISCO;

  function noDisco(atualizacao) {
    return atualizacao.estado === 'instalada' ? { ...atualizacao, versao: nova() } : atualizacao;
  }

  return {
    definir({ versao = null, versaoNova = null } = {}) { Object.assign(estado, { versao, versaoNova }); },
    saudeCom(resposta) {
      if (!resposta.json.atualizacao && !estado.versao) return resposta;
      const { atualizacao } = resposta.json;
      const rodando = estado.versao || resposta.json.versao;
      return { ...resposta, json: {
        ...resposta.json,
        versao: rodando,
        ...(atualizacao && { atualizacao: { ...noDisco(atualizacao), ...(atualizacao.estado !== 'instalada' && { versao: rodando }), ...(atualizacao.atualizada && { atualizada: rodando }) } }),
      } };
    },
    agoraCom(resposta) {
      const { json } = resposta;
      mudarContexto({ atualizacao: { instalada: 'instalada', falhou: 'falhou' }[json.estado] });
      return { ...resposta, json: json.estado === 'instalada' ? noDisco(json) : { ...json, versao: estado.versao || json.versao } };
    },
    reiniciar() {
      estado.reinicios += 1;
      setTimeout(desligar, 500).unref();
      setTimeout(() => {
        estado.versao = nova();
        mudarContexto({ atualizacao: 'atualizada' });
        ligar();
      }, silencioMs).unref();
    },
    /** @estado-guardado Quantas vezes a Conexão fechou o Anki a pedido da extensão. */
    reinicios: () => estado.reinicios,
    contexto: contextoDeAgora,
  };
}

module.exports = { criarAtualizacao };
