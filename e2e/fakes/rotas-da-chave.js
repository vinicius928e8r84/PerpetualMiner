'use strict';

const { rota } = require('./rota');
const { ultimos4 } = require('./resposta-do-contrato');
const { legadoRecusado } = require('./legado-da-chave');

const erro = (status, error) => ({ status, json: { error } });
const falhaDaNuvem = status => ({ status, json: { error: 'cloud_sync_failed', status } });
const versaoVencida = () => erro(409, 'stale_key_version');

function naFilaDaChave(estado, fazer) {
  const vez = estado.filaDaChave.then(fazer);
  estado.filaDaChave = vez.catch(() => {});
  return vez;
}

function mudarChave(estado, { chave, conta, em, naoEnviada = true }) {
  estado.chaveDaOpenAI = chave || null;
  estado.contaDaChave = conta;
  estado.versaoDaChave += 1;
  estado.horaDaChave = em ?? Math.max(estado.agora().getTime(), estado.horaDaChave + 1);
  estado.chaveNaoEnviada = naoEnviada;
}

const versaoAtualOuAnterior = (estado, versao) => versao === estado.versaoDaChave - 1 || versao === estado.versaoDaChave;

function ehAChaveJaGuardada(estado, { versao, conta, chave }) {
  return versaoAtualOuAnterior(estado, versao) && chave === estado.chaveDaOpenAI && conta === estado.contaDaChave;
}

function guardarAgora({ estado, respostaDoContrato }, corpo) {
  const pedido = { versao: corpo.versao || 0, conta: corpo.conta || '', chave: corpo.chave.trim() };
  if (ehAChaveJaGuardada(estado, pedido)) return { status: 200, json: { ok: true, ultimos4: ultimos4(pedido.chave) } };
  if (pedido.versao !== estado.versaoDaChave) return versaoVencida();
  const resposta = respostaDoContrato('POST', '/ia/openai/chave', corpo);
  if (resposta.status === 200) mudarChave(estado, { chave: pedido.chave, conta: pedido.conta });
  return resposta;
}

function ehARemocaoJaFeita(estado, { versao, conta }) {
  return versao === estado.versaoDaChave - 1 && !estado.chaveDaOpenAI && conta === estado.contaDaChave;
}

function apagarAgora({ estado, respostaDoContrato }, corpo) {
  const pedido = { versao: corpo.versao || 0, conta: corpo.conta || '' };
  if (ehARemocaoJaFeita(estado, pedido)) return { status: 200, json: { ok: true } };
  if (pedido.versao !== estado.versaoDaChave) return versaoVencida();
  const resposta = respostaDoContrato('POST', '/ia/openai/chave/apagar', corpo);
  if (resposta.status === 200) mudarChave(estado, { chave: '', conta: pedido.conta });
  return resposta;
}

const guardarChave = (dono, req) => naFilaDaChave(dono.estado, () => guardarAgora(dono, JSON.parse(req.postData())));
const apagarChave = (dono, req) => naFilaDaChave(dono.estado, () => apagarAgora(dono, JSON.parse(req.postData() || '{}')));

const outraContaComChaveNaoEnviada = (estado, uid) => estado.contaDaChave && estado.contaDaChave !== uid && estado.chaveNaoEnviada;

const RECUSAS_DA_SINCRONIZACAO = [
  { vale: (estado, { versao }) => versao !== estado.versaoDaChave, resposta: versaoVencida },
  { vale: estado => estado.chaveDaOpenAI && !estado.contaDaChave, resposta: () => erro(409, 'legacy_key_unbound') },
  { vale: (estado, { uid }) => outraContaComChaveNaoEnviada(estado, uid), resposta: () => erro(409, 'other_account_unsent') },
  { vale: estado => estado.contexto.cofre === 'sem_escrita', resposta: () => erro(500, 'internal_error') },
  { vale: estado => estado.contexto.firebase, resposta: estado => falhaDaNuvem(estado.contexto.firebase) },
];

function chaveDosCampos(fields) {
  if (fields.apagada?.booleanValue) return '';
  return fields.chave?.stringValue || '';
}

function chaveNaNuvem(resposta) {
  const fields = resposta.json?.fields || {};
  const chave = chaveDosCampos(fields);
  return { status: resposta.status, chave, hora: Number(fields.em?.integerValue) || (chave ? 1 : 0) };
}

async function lerChaveDaNuvem(estado, { uid, token }) {
  const resposta = estado.google ? await estado.google.pedidoDaConexao('GET', uid, token) : { status: 404 };
  return chaveNaNuvem(resposta);
}

async function escreverChaveNaNuvem(estado, { uid, token }) {
  if (!estado.google) return 200;
  const fields = { chave: { stringValue: estado.chaveDaOpenAI || '' }, em: { integerValue: String(estado.horaDaChave) } };
  return (await estado.google.pedidoDaConexao('PATCH', uid, token, fields)).status;
}

const leituraDaNuvemServe = ({ status }) => status === 200 || status === 404;
const nadaGuardadoEmLugarNenhum = (estado, nuvem) => nuvem.status === 404 && !estado.chaveDaOpenAI && !estado.horaDaChave;

function empatouComOutraChave(estado, nuvem) {
  return nuvem.status === 200 && nuvem.hora === estado.horaDaChave && nuvem.chave !== (estado.chaveDaOpenAI || '');
}

function aNuvemVence(estado, uid, nuvem) {
  if (estado.contaDaChave !== uid || nuvem.hora > estado.horaDaChave) return true;
  return empatouComOutraChave(estado, nuvem) && !estado.chaveNaoEnviada;
}

function aConexaoVence(estado, nuvem) {
  if (estado.horaDaChave > nuvem.hora) return true;
  return empatouComOutraChave(estado, nuvem) && estado.chaveNaoEnviada;
}

function trazerDaNuvem(estado, uid, nuvem) {
  const anterior = estado.chaveDaOpenAI;
  mudarChave(estado, { chave: nuvem.chave, conta: uid, em: nuvem.hora, naoEnviada: false });
  if (nuvem.chave) return 'chegou';
  return anterior ? 'apagada' : null;
}

async function reconciliarComANuvem(estado, pedido, nuvem) {
  if (nadaGuardadoEmLugarNenhum(estado, nuvem)) return { resultado: null };
  if (aNuvemVence(estado, pedido.uid, nuvem)) return { resultado: trazerDaNuvem(estado, pedido.uid, nuvem) };
  if (!aConexaoVence(estado, nuvem)) return { resultado: null };
  const status = await escreverChaveNaNuvem(estado, pedido);
  return status === 200 ? { resultado: 'subiu' } : { falha: falhaDaNuvem(status) };
}

async function sincronizarAgora(estado, { uid, token, versao = 0 }) {
  const pedido = { uid, token, versao };
  const recusa = RECUSAS_DA_SINCRONIZACAO.find(({ vale }) => vale(estado, pedido));
  if (recusa) return recusa.resposta(estado);
  const nuvem = await lerChaveDaNuvem(estado, pedido);
  if (!leituraDaNuvemServe(nuvem)) return falhaDaNuvem(nuvem.status);
  const { resultado, falha } = await reconciliarComANuvem(estado, pedido, nuvem);
  if (falha) return falha;
  estado.chaveNaoEnviada = false;
  return { status: 200, json: { ok: true, resultado, versao: estado.versaoDaChave } };
}

const sincronizarChave = ({ estado }, req) => naFilaDaChave(estado, () => sincronizarAgora(estado, JSON.parse(req.postData())));

const semChaveCompleta = estado => estado.contaDaChave === null || estado.chaveDaOpenAI === null;
const adotaOLegado = (estado, conta) => semChaveCompleta(estado) && estado.contaDaChave !== conta;

function receberLegado({ estado }, req) {
  const { chave, conta, em, versao } = JSON.parse(req.postData());
  if (estado.contexto.cofre === 'sem_escrita') return erro(500, 'internal_error');
  if (legadoRecusado(estado, { chave, conta, versao })) return erro(409, 'legacy_key_mismatch');
  if (adotaOLegado(estado, conta)) mudarChave(estado, { chave, conta, em });
  return { status: 200, json: { ok: true } };
}

function documentoParaAReal({ chave, versao, conta, em, naoEnviada }) {
  if (conta !== null) return { chave, versao, conta, em, naoEnviada };
  return versao ? { versao, chave } : { chave };
}

function criarRotasDaChave(dono) {
  const { estado } = dono;
  const responderCom = fazer => async ({ req, responder }) => {
    const { status, json } = await fazer(dono, req);
    return responder(status, json);
  };

  const rotas = [
    rota('POST', '/ia/openai/chave', responderCom(guardarChave)),
    rota('POST', '/ia/openai/chave/apagar', responderCom(apagarChave)),
    rota('POST', '/ia/openai/legado', ({ req, responder }) => {
      const { status, json } = receberLegado(dono, req);
      return responder(status, json);
    }),
    rota('POST', '/ia/openai/sincronizar', responderCom(sincronizarChave)),
  ];

  const paraAReal = documento => estado.paraAReal.push({ chave: documento });
  const api = {
    guardarChaveNaConexao(finalDaChave, versao = 0, conta = null, em = 0, naoEnviada = true) {
      const chave = `sk-proj-guardada-antes-${finalDaChave}`;
      Object.assign(estado, { chaveDaOpenAI: chave, versaoDaChave: versao, contaDaChave: conta, horaDaChave: em, chaveNaoEnviada: naoEnviada });
      paraAReal(documentoParaAReal({ chave, versao, conta, em, naoEnviada }));
    },
    esquecerAChave() {
      Object.assign(estado, { chaveDaOpenAI: null, versaoDaChave: 0, contaDaChave: '', horaDaChave: 0 });
      paraAReal(null);
    },
    guardarRemocaoNaConexao(versao) {
      Object.assign(estado, { chaveDaOpenAI: null, versaoDaChave: versao, contaDaChave: '', horaDaChave: 0 });
      paraAReal({ versao, chave: '' });
    },
    espelharChave(documento) {
      const { chave = null, versao = 0, conta = '', em = 0, naoEnviada = false } = documento || {};
      Object.assign(estado, { chaveDaOpenAI: chave || null, versaoDaChave: versao, contaDaChave: conta, horaDaChave: em, chaveNaoEnviada: naoEnviada });
    },
    sincronizarCom(google) { estado.google = google; },
    responderFirebase(status) { estado.contexto.firebase = status; },
    falharGravacaoDaChave() { estado.contexto.cofre = 'sem_escrita'; },
    /** @estado-guardado A única revisão/conta/hora que o dono guarda. */
    estadoDaChave() { return { versao: estado.versaoDaChave, conta: estado.contaDaChave, em: estado.horaDaChave, naoEnviada: estado.chaveNaoEnviada }; },
    /** @estado-guardado A cópia da chave da OpenAI que a Conexão guarda, ou null: o que o teste confere que chegou. */
    chaveNaConexao() { return estado.chaveDaOpenAI; },
  };

  return { rotas, api };
}

module.exports = { criarRotasDaChave };
