'use strict';

const crypto = require('crypto');
const { assinaturaDoPedido, provaDaResposta, provaDoServidor, provaDaRevogacao, NAVEGADORES } = require('../pareamento-de-teste');

const TENTATIVAS = 5;
const VALIDADE_MS = 5 * 60 * 1000;
const ESGOTADOS_PARA_BLOQUEAR = 3;
const BLOQUEIO_MS = 15 * 60 * 1000;
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CLIENTE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NONCE = /^[A-Za-z0-9_-]{8,64}$/;
const DESAFIO = /^[A-Za-z0-9_+/=-]{16,128}$/;

const erro = (status, error) => ({ status, json: { error } });
const sortearCodigoNovo = () => Array.from({ length: 6 }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join('');
const soOCodigo = texto => String(texto).toUpperCase().replace(/[^A-Z0-9]/g, '');
const mostrar = codigo => `${codigo.slice(0, 3)}-${codigo.slice(3)}`;
const agoraMs = estado => estado.agora().getTime();
const emDia = (estado, alvo) => alvo && alvo.vence.getTime() > agoraMs(estado);

function estadoInicial(agora) {
  return {
    agora,
    navegadores: new Map(),
    sessao: crypto.randomBytes(16).toString('hex'),
    nonces: new Set(),
    mostrados: [],
    recebidos: [],
    tentados: [],
    revogados: new Map(),
    pendente: null,
    esgotados: 0,
    bloqueadoAte: null,
    concluido: null,
    semJanela: false,
    antigo: false,
    sortearDe: sortearCodigoNovo,
  };
}

function criarPareamento({ agora }) {
  const estado = estadoInicial(agora);
  return {
    responder: (metodo, caminho, corpo) => responder(estado, metodo, caminho, corpo),
    verificar: (req, caminho) => verificar(estado, req, caminho),
    comProva: (route, verificado) => comProva(estado, route, verificado),
    definirContexto: contexto => definirContexto(estado, contexto),
    parear: (navegador = 'primeiro') => estado.navegadores.set(NAVEGADORES[navegador].cliente, NAVEGADORES[navegador].segredo),
    /** @estado-guardado Os navegadores que a Conexão tem pareados (`cliente` → segredo em base64): o que `pareamento.json` guardaria. */
    pareados: () => new Map(estado.navegadores),
    desconectar: () => { desconectar(estado); },
    perderOsNavegadores: () => { perderOsNavegadores(estado); },
    /** @estado-guardado O código que o Anki mostra agora (com o hífen, `K7M-4PX`), ou null: o que a pessoa lê na tela do Anki. */
    codigoNoAnki: () => (codigoAindaPendente(estado) ? mostrar(estado.pendente.codigo) : null),
    /** @estado-guardado Os códigos que o Anki mostrou até agora, na ordem. */
    codigosMostrados: () => [...estado.mostrados],
    sortearCodigo: codigo => { estado.sortearDe = () => codigo; },
    vencerOCodigo: () => { vencerOCodigo(estado); },
    cancelarNoAnki: () => { estado.pendente = null; },
    antigo: () => { estado.antigo = true; },
    semJanelaDoAnki: () => { estado.semJanela = true; },
    tentou: caminho => { estado.tentados.push(caminho); },
    /** @estado-guardado Os caminhos do pareamento que a extensão tentou, a Conexão ligada ou não (o `conferir` que antecede todo pedido privado). */
    tentativas: () => [...estado.tentados],
    /** @estado-guardado Cada pedido de pareamento que chegou: `{ caminho, corpo }`. */
    recebidos: () => estado.recebidos.map(({ caminho, corpo }) => ({ caminho, corpo })),
    sessao: () => estado.sessao,
  };
}

const codigoAindaValido = (estado, codigo) => emDia(estado, codigo) && codigo.tentativas < TENTATIVAS;

function codigoAindaPendente(estado) {
  if (estado.pendente && !codigoAindaValido(estado, estado.pendente)) estado.pendente = null;
  return estado.pendente;
}

const estaBloqueado = estado => estado.bloqueadoAte && agoraMs(estado) < estado.bloqueadoAte;

function abrirCodigoNovo(estado) {
  estado.concluido = null;
  estado.pendente = { codigo: estado.sortearDe(), vence: new Date(agoraMs(estado) + VALIDADE_MS), tentativas: 0 };
}

function comecar(estado) {
  if (estado.semJanela) return erro(503, 'pairing_unavailable');
  if (!codigoAindaPendente(estado) && estaBloqueado(estado)) return erro(429, 'pairing_locked');
  if (!estado.pendente) abrirCodigoNovo(estado);
  estado.mostrados.push(mostrar(estado.pendente.codigo));
  return { status: 200, json: { ok: true } };
}

const codigoDigitadoValido = codigo => typeof codigo === 'string' && codigo.length > 0 && codigo.length <= 32;
const nomeDoNavegadorValido = nome => typeof nome === 'string' && nome.length <= 60;

function pedidoDeConclusaoValido({ codigo, cliente, nome = '' }) {
  return codigoDigitadoValido(codigo) && CLIENTE.test(cliente || '') && nomeDoNavegadorValido(nome);
}

function respostaDaConclusaoRepetida(estado, digitado, cliente) {
  const { concluido } = estado;
  if (!emDia(estado, concluido) || concluido.codigo !== digitado) return null;
  if (concluido.cliente !== cliente) return erro(409, 'pairing_code_used');
  if (estado.navegadores.get(cliente) === concluido.segredo) return { status: 200, json: { cliente, segredo: concluido.segredo } };
  return null;
}

function esgotarOCodigo(estado) {
  estado.pendente = null;
  estado.esgotados += 1;
  if (estado.esgotados >= ESGOTADOS_PARA_BLOQUEAR) [estado.esgotados, estado.bloqueadoAte] = [0, agoraMs(estado) + BLOQUEIO_MS];
}

function errarOCodigo(estado, vivo) {
  vivo.tentativas += 1;
  if (vivo.tentativas < TENTATIVAS) return { status: 401, json: { error: 'pairing_code_wrong', restam: TENTATIVAS - vivo.tentativas } };
  esgotarOCodigo(estado);
  return erro(410, 'pairing_code_expired');
}

function parearPeloCodigo(estado, vivo, cliente) {
  const segredo = crypto.randomBytes(32).toString('base64');
  estado.navegadores.set(cliente, segredo);
  estado.revogados.delete(cliente);
  Object.assign(estado, { esgotados: 0, bloqueadoAte: null, concluido: { codigo: vivo.codigo, cliente, segredo, vence: vivo.vence }, pendente: null });
  return { status: 200, json: { cliente, segredo } };
}

function concluir(estado, corpo) {
  const pedido = corpo || {};
  if (!pedidoDeConclusaoValido(pedido)) return erro(400, 'invalid_request');
  const digitado = soOCodigo(pedido.codigo);
  const repetida = respostaDaConclusaoRepetida(estado, digitado, pedido.cliente);
  if (repetida) return repetida;
  const vivo = codigoAindaPendente(estado);
  if (!vivo) return erro(410, 'pairing_code_expired');
  if (vivo.codigo !== digitado) return errarOCodigo(estado, vivo);
  return parearPeloCodigo(estado, vivo, pedido.cliente);
}

const pedidoDeConferenciaValido = ({ cliente, desafio }) => typeof cliente === 'string' && CLIENTE.test(cliente) && typeof desafio === 'string' && DESAFIO.test(desafio);

function conferir(estado, corpo) {
  const { cliente, desafio } = corpo || {};
  if (!pedidoDeConferenciaValido({ cliente, desafio })) return erro(400, 'invalid_request');
  if (estado.revogados.has(cliente)) return { status: 401, json: { error: 'pairing_revoked', prova: provaDaRevogacao(estado.revogados.get(cliente), desafio) } };
  if (!estado.navegadores.has(cliente)) return erro(401, 'pairing_required');
  return { status: 200, json: { sessao: estado.sessao, prova: provaDoServidor(estado.navegadores.get(cliente), desafio, estado.sessao) } };
}

const ROTAS_DO_PAREAMENTO = new Map([
  ['/pareamento/comecar', comecar],
  ['/pareamento/concluir', concluir],
  ['/pareamento/conferir', conferir],
]);

const ehPedidoDePareamento = (metodo, caminho) => caminho.startsWith('/pareamento/') && metodo === 'POST';

function responder(estado, metodo, caminho, corpo) {
  if (!ehPedidoDePareamento(metodo, caminho)) return null;
  estado.recebidos.push({ caminho, corpo });
  const rota = ROTAS_DO_PAREAMENTO.get(caminho);
  if (estado.antigo || !rota) return erro(404, 'not_found');
  return rota(estado, corpo);
}

function pedidoAssinado(req, caminho) {
  const cabecalho = nome => req.headers()[nome.toLowerCase()];
  return {
    cliente: cabecalho('X-PerpetualMiner-Cliente'),
    assinatura: cabecalho('X-PerpetualMiner-Assinatura'),
    sessao: cabecalho('X-PerpetualMiner-Sessao'),
    nonce: cabecalho('X-PerpetualMiner-Nonce'),
    metodo: req.method(),
    caminho,
    corpo: req.postData() || '',
  };
}

const segredoDoNavegador = (estado, { cliente, assinatura }) => (cliente && assinatura ? estado.navegadores.get(cliente) : undefined);
const chaveDoNonce = ({ cliente, nonce }) => `${cliente} ${nonce}`;

function assinaturaNovaEValida(estado, segredo, pedido) {
  if (!NONCE.test(pedido.nonce || '')) return false;
  const { nonce, metodo, caminho, corpo } = pedido;
  const esperada = assinaturaDoPedido(segredo, { sessao: estado.sessao, nonce, metodo, caminho, corpo });
  return esperada === pedido.assinatura && !estado.nonces.has(chaveDoNonce(pedido));
}

function verificar(estado, req, caminho) {
  if (estado.antigo) return { antigo: true };
  const pedido = pedidoAssinado(req, caminho);
  const segredo = segredoDoNavegador(estado, pedido);
  if (!segredo) return { erro: 'pairing_required' };
  if (pedido.sessao !== estado.sessao) return { erro: 'session_expired' };
  if (!assinaturaNovaEValida(estado, segredo, pedido)) return { erro: 'pairing_invalid' };
  estado.nonces.add(chaveDoNonce(pedido));
  return { segredo, nonce: pedido.nonce };
}

function comProva(estado, route, { segredo, nonce, antigo: semProva }) {
  if (semProva) return route;
  return {
    request: () => route.request(),
    abort: codigo => route.abort(codigo),
    fulfill: opcoes => {
      const corpo = Buffer.from(opcoes.body ?? '', 'utf8');
      const prova = provaDaResposta(segredo, { sessao: estado.sessao, nonce, status: opcoes.status ?? 200, corpo });
      return route.fulfill({ ...opcoes, headers: { ...opcoes.headers, 'X-PerpetualMiner-Prova': prova, 'Access-Control-Expose-Headers': 'X-PerpetualMiner-Prova' } });
    },
  };
}

function perderOsNavegadores(estado) {
  estado.navegadores.clear();
  estado.concluido = null;
}

function desconectar(estado) {
  for (const [cliente, segredo] of estado.navegadores) estado.revogados.set(cliente, segredo);
  perderOsNavegadores(estado);
}

function vencerOCodigo(estado) {
  if (estado.pendente) estado.pendente.vence = new Date(agoraMs(estado) - 1);
}

function mostrarOCodigoSorteado(estado, codigo) {
  estado.sortearDe = () => codigo;
  comecar(estado);
}

function gastarAsTentativasDeUmCodigo(estado) {
  comecar(estado);
  for (let t = 0; t < TENTATIVAS; t += 1) concluir(estado, { codigo: 'AAA-AAA', cliente: NAVEGADORES.segundo.cliente });
}

function bloquearPorCodigosEsgotados(estado) {
  for (let n = 0; n < ESGOTADOS_PARA_BLOQUEAR; n += 1) gastarAsTentativasDeUmCodigo(estado);
}

function definirContexto(estado, { pareado = true, desconectado = false, semTela = false, codigoPendente, codigoUsadoPor, bloqueado = false } = {}) {
  if (!pareado) perderOsNavegadores(estado);
  if (desconectado) desconectar(estado);
  if (semTela) estado.semJanela = true;
  if (codigoPendente) mostrarOCodigoSorteado(estado, codigoPendente);
  if (codigoUsadoPor) concluir(estado, { codigo: mostrar(estado.pendente.codigo), cliente: codigoUsadoPor, nome: 'Outro' });
  if (bloqueado) bloquearPorCodigosEsgotados(estado);
}

module.exports = { criarPareamento };
