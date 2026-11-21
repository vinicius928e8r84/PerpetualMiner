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

const CAMPOS_IGUAIS = ['colecao', 'openai', 'firebase', 'cofre', 'chatgpt', 'voz'];
const CAMINHOS_DA_CHAVE = ['/ia/openai/chave', '/ia/openai/chave/apagar', '/ia/openai/sincronizar'];

const opcionalIgual = (doExemplo, contexto, campo) => (doExemplo[campo] ?? null) === (contexto[campo] ?? null);

function servePeloPerfil(doExemplo, contexto) {
  if (doExemplo.perfil === undefined) return true;
  return doExemplo.perfil === contexto.perfil && Boolean(doExemplo.falhaNoPerfil) === Boolean(contexto.falhaNoPerfil);
}

const servePeloLogin = (doExemplo, contexto) => doExemplo.itemDeLogin === undefined || doExemplo.itemDeLogin === contexto.itemDeLogin;

const servePelosCampos = (doExemplo, contexto) => CAMPOS_IGUAIS.every(campo => !(campo in doExemplo) || doExemplo[campo] === contexto[campo]);

function servePelaChave(doExemplo, contexto) {
  if (!('chaveNaConexao' in doExemplo)) return true;
  return (doExemplo.chaveNaConexao === null) === (contexto.chaveNaConexao === null);
}

function servePeloCaminho(exemplo, contexto) {
  const { caminho } = exemplo.pedido;
  if (caminho === '/health') return opcionalIgual(exemplo.contexto, contexto, 'atualizacao');
  if (caminho.startsWith('/atualizacao/')) return opcionalIgual(exemplo.contexto, contexto, 'ankiweb');
  return true;
}

const PARTES_DO_CONTEXTO = [servePeloPerfil, servePeloLogin, servePelosCampos, servePelaChave];

function exemploServe(exemplo, contexto) {
  return PARTES_DO_CONTEXTO.every(serve => serve(exemplo.contexto, contexto)) && servePeloCaminho(exemplo, contexto);
}

const doPedido = ({ metodo, caminho }) => exemplo => exemploDaExtensao(exemplo) && exemplo.pedido.metodo === metodo && exemplo.pedido.caminho === caminho;

const corpoBate = (exemplo, corpo) => exemplo.pedido.corpo === undefined || isDeepStrictEqual(exemplo.pedido.corpo, corpo);

function exemploDoPedido(pedido, contexto) {
  const candidatos = contrato.exemplos.filter(doPedido(pedido)).filter(exemplo => exemploServe(exemplo, contexto));
  const exato = candidatos.find(exemplo => corpoBate(exemplo, pedido.corpo));
  if (exato) return exato;
  return CAMINHOS_DA_CHAVE.includes(pedido.caminho) ? candidatos[0] : undefined;
}

function semExemplo({ metodo, caminho, corpo }, contexto) {
  const comOCorpo = corpo === undefined ? '' : ` com o corpo ${JSON.stringify(corpo)}`;
  return `O contrato (complemento/contrato/exemplos.json) não tem exemplo de ${metodo} ${caminho}${comOCorpo} `
    + `com o contexto ${JSON.stringify(contexto)}; escreva-o lá antes de o fake responder.`;
}

const respostaDosGrupos = (grupos, { metodo, caminho, corpo }) => grupos.reduce((achou, rotas) => achou || rotas.responder(metodo, caminho, corpo), null);

function chaveDaOpenAIGuardada(estado) {
  return {
    configurada: !!estado.chaveDaOpenAI,
    ...(estado.chaveDaOpenAI && { ultimos4: ultimos4(estado.chaveDaOpenAI) }),
    conta: estado.contaDaChave, versao: estado.versaoDaChave, naoEnviada: estado.chaveNaoEnviada,
  };
}

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

  function respostaDoContrato(metodo, caminho, corpo) {
    const doPerfil = respostaDosGrupos(grupos(), { metodo, caminho, corpo });
    if (doPerfil) return doPerfil;
    const contexto = contextoDeAgora();
    const exemplo = exemploDoPedido({ metodo, caminho, corpo }, contexto);
    if (!exemplo) throw new Error(semExemplo({ metodo, caminho, corpo }, contexto));
    const json = comOAgora(exemplo.resposta.json);
    if (json.ultimos4 && typeof corpo?.chave === 'string') json.ultimos4 = ultimos4(corpo.chave.trim());
    if (json.openai) json.openai = chaveDaOpenAIGuardada(estado);
    return { status: exemplo.resposta.status, json };
  }

  return { contextoDeAgora, respostaDoContrato };
}

module.exports = { criarRespostaDoContrato, erroDoContrato, exemploDaExtensao, ultimos4 };
