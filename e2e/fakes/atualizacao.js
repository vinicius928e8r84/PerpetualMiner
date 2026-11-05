'use strict';

// A atualização da Conexão pelo AnkiWeb na Conexão de mentira (#177). As respostas são as de `complemento/contrato/exemplos-da-atualizacao.json`
// (o `atualizacao` e o `ankiweb` do contexto dos exemplos escolhem o exemplo, em `anki.js`); este módulo só põe por cima o que um teste de tela precisa
// e o contrato não tem como dizer: a `versao` que a Conexão roda e a `versaoNova` que o AnkiWeb entrega (os exemplos têm as de uma máquina só).
//
//   definir({ versao, versaoNova })   `versao`: a que a saúde diz (a Conexão velha demais); `versaoNova`: a que o AnkiWeb entrega e a que fica no disco
//   saudeCom(resposta) e agoraCom(resposta)  a resposta do contrato com essas duas versões no lugar da dos exemplos
//   reiniciar(...)                    o Anki fechado e aberto de novo: a Conexão cala por `silencioMs`, volta na `versaoNova` e a saúde passa a dizer `atualizada`

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
      // O que o clique fez fica guardado, como na Conexão: a próxima saúde diz o mesmo.
      mudarContexto({ atualizacao: { instalada: 'instalada', falhou: 'falhou' }[json.estado] });
      return { ...resposta, json: json.estado === 'instalada' ? noDisco(json) : { ...json, versao: estado.versao || json.versao } };
    },
    /** O Anki fecha pelo caminho normal e o abridor o abre: a Conexão cala e volta na versão nova. */
    reiniciar() {
      estado.reinicios += 1;
      // A resposta sai antes de o Anki fechar (a Conexão agenda o fechamento: `atualizacao_do_anki.py`).
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
