'use strict';

const { isDeepStrictEqual } = require('util');
const contrato = require('../../complemento/contrato/carregar');

function exemploDaExtensao(exemplo) {
  return exemplo.daExtensao === true;
}

function erroDoContrato(caminho, erro) {
  const exemplo = contrato.exemplos.find(e => e.pedido.caminho === caminho && e.resposta.json?.error === erro);
  if (!exemplo) throw new Error(`O contrato não tem o erro ${erro} de POST ${caminho}; escreva o exemplo antes de o fake responder.`);
  return { status: exemplo.resposta.status, json: exemplo.resposta.json };
}

const ultimos4 = chave => (chave ? chave.slice(-4) : null);

function criarRespostaDoContrato({ estado, chatgpt, voz, grupos }) {
  function comOAgora(valor) {
    if (valor === '<agora>') return estado.agora().toISOString();
    if (Array.isArray(valor)) return valor.map(comOAgora);
    if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, comOAgora(item)]));
    return valor;
  }

  function contextoDeAgora() {
    return { ...estado.contexto, chaveNaConexao: ultimos4(estado.chaveDaOpenAI), chatgpt: chatgpt.situacao(), voz: voz.situacao() };
  }

  function exemploServe(exemplo, contexto) {
    const doExemplo = exemplo.contexto;
    return (doExemplo.perfil === undefined
        || (doExemplo.perfil === contexto.perfil && Boolean(doExemplo.falhaNoPerfil) === Boolean(contexto.falhaNoPerfil)))
      && (doExemplo.itemDeLogin === undefined || doExemplo.itemDeLogin === contexto.itemDeLogin)
      && (!('colecao' in doExemplo) || doExemplo.colecao === contexto.colecao)
      && (!('openai' in doExemplo) || doExemplo.openai === contexto.openai)
      && (!('chaveNaConexao' in doExemplo) || (doExemplo.chaveNaConexao === null) === (contexto.chaveNaConexao === null))
      && ['firebase', 'cofre', 'chatgpt', 'voz'].every(campo => !(campo in doExemplo) || doExemplo[campo] === contexto[campo])
      && (exemplo.pedido.caminho !== '/health' || (doExemplo.atualizacao ?? null) === (contexto.atualizacao ?? null))
      && (!exemplo.pedido.caminho.startsWith('/atualizacao/') || (doExemplo.ankiweb ?? null) === (contexto.ankiweb ?? null));
  }

  function respostaDoContrato(metodo, caminho, corpo) {
    const doPerfil = grupos().reduce((achou, rotas) => achou || rotas.responder(metodo, caminho, corpo), null);
    if (doPerfil) return doPerfil;
    const contexto = contextoDeAgora();
    const candidatos = contrato.exemplos.filter(e =>
      exemploDaExtensao(e) && e.pedido.metodo === metodo && e.pedido.caminho === caminho && exemploServe(e, contexto));
    const exato = candidatos.find(e => e.pedido.corpo === undefined || isDeepStrictEqual(e.pedido.corpo, corpo));
    const exemplo = exato || (['/ia/openai/chave', '/ia/openai/chave/apagar', '/ia/openai/sincronizar'].includes(caminho) ? candidatos[0] : undefined);
    if (!exemplo) {
      throw new Error(`O contrato (complemento/contrato/exemplos.json) não tem exemplo de ${metodo} ${caminho}`
        + `${corpo === undefined ? '' : ` com o corpo ${JSON.stringify(corpo)}`} `
        + `com o contexto ${JSON.stringify(contexto)}; escreva-o lá antes de o fake responder.`);
    }
    const json = comOAgora(exemplo.resposta.json);
    if (json.ultimos4 && typeof corpo?.chave === 'string') json.ultimos4 = ultimos4(corpo.chave.trim());
    if (json.openai) json.openai = { configurada: !!estado.chaveDaOpenAI,
      ...(estado.chaveDaOpenAI && { ultimos4: ultimos4(estado.chaveDaOpenAI) }),
      conta: estado.contaDaChave, versao: estado.versaoDaChave, naoEnviada: estado.chaveNaoEnviada };
    return { status: exemplo.resposta.status, json };
  }

  return { contextoDeAgora, respostaDoContrato };
}

module.exports = { criarRespostaDoContrato, erroDoContrato, exemploDaExtensao, ultimos4 };
