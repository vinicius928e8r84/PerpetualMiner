'use strict';

// O pareamento (#192) do fake da Conexão com o Anki: os navegadores pareados, o código que o "Anki" mostra, a conferência da assinatura de cada pedido
// e a prova que cada resposta leva. É o mesmo desenho de complemento/pareamento.py, na fronteira HTTP do Playwright, e os exemplos de
// complemento/contrato/exemplos-do-pareamento.json são o que os dois dizem em comum (test_fake_anki.js, contrato-da-conexao.spec.js).
//
// O teste lê o código que apareceu no Anki com `codigoNoAnki()` e pode vencê-lo (`vencerOCodigo`), cancelá-lo (`cancelarNoAnki`) ou desconectar os
// navegadores (`desconectar`), como a pessoa faria na janela do Anki. `recebidos` guarda cada pedido de pareamento que chegou e `vistosPelaPorta`
// o que um impostor na porta teria visto: nada além de assinaturas.

const crypto = require('crypto');
const { assinaturaDoPedido, provaDaResposta, provaDoServidor, NAVEGADORES } = require('../pareamento-de-teste');

const TENTATIVAS = 5;
const VALIDADE_MS = 5 * 60 * 1000;
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CLIENTE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NONCE = /^[A-Za-z0-9_-]{8,64}$/;

function criarPareamento({ agora }) {
  const navegadores = new Map();   // cliente → segredo em base64
  const sessao = crypto.randomBytes(16).toString('hex');
  const nonces = new Set();
  const mostrados = [];            // os códigos que o Anki mostrou, na ordem (com o hífen)
  const recebidos = [];            // cada pedido de pareamento: { caminho, corpo }
  const tentados = [];             // cada caminho do pareamento que a extensão tentou, até com o Anki desligado
  let pendente = null;             // { codigo, vence, tentativas }
  let concluido = null;            // { codigo, cliente, segredo, vence }
  let semJanela = false;
  let antigo = false;
  let sortearDe = () => Array.from({ length: 6 }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join('');

  const soOCodigo = texto => String(texto).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const mostrar = codigo => `${codigo.slice(0, 3)}-${codigo.slice(3)}`;
  const emDia = alvo => alvo && alvo.vence.getTime() > agora().getTime();

  function codigoPendente() {
    if (pendente && (!emDia(pendente) || pendente.tentativas >= TENTATIVAS)) pendente = null;
    return pendente;
  }

  function comecar() {
    if (semJanela) return { status: 503, json: { error: 'pairing_unavailable' } };
    if (!codigoPendente()) {
      concluido = null;
      pendente = { codigo: sortearDe(), vence: new Date(agora().getTime() + VALIDADE_MS), tentativas: 0 };
    }
    mostrados.push(mostrar(pendente.codigo));
    return { status: 200, json: { ok: true } };
  }

  function concluir(corpo) {
    const { codigo, cliente, nome = '' } = corpo || {};
    if (typeof codigo !== 'string' || !codigo || codigo.length > 32 || !CLIENTE.test(cliente || '') || typeof nome !== 'string' || nome.length > 60) {
      return { status: 400, json: { error: 'invalid_request' } };
    }
    const digitado = soOCodigo(codigo);
    if (emDia(concluido) && concluido.codigo === digitado) {
      if (concluido.cliente !== cliente) return { status: 409, json: { error: 'pairing_code_used' } };
      if (navegadores.get(cliente) === concluido.segredo) return { status: 200, json: { cliente, segredo: concluido.segredo } };
    }
    const vivo = codigoPendente();
    if (!vivo) return { status: 410, json: { error: 'pairing_code_expired' } };
    if (vivo.codigo !== digitado) {
      vivo.tentativas += 1;
      if (vivo.tentativas >= TENTATIVAS) {
        pendente = null;
        return { status: 410, json: { error: 'pairing_code_expired' } };
      }
      return { status: 401, json: { error: 'pairing_code_wrong', restam: TENTATIVAS - vivo.tentativas } };
    }
    const segredo = crypto.randomBytes(32).toString('base64');
    navegadores.set(cliente, segredo);
    concluido = { codigo: vivo.codigo, cliente, segredo, vence: vivo.vence };
    pendente = null;
    return { status: 200, json: { cliente, segredo } };
  }

  function conferir(corpo) {
    const { cliente, desafio } = corpo || {};
    if (typeof cliente !== 'string' || !CLIENTE.test(cliente) || typeof desafio !== 'string' || !/^[A-Za-z0-9_+/=-]{16,128}$/.test(desafio)) {
      return { status: 400, json: { error: 'invalid_request' } };
    }
    if (!navegadores.has(cliente)) return { status: 401, json: { error: 'pairing_required' } };
    return { status: 200, json: { sessao, prova: provaDoServidor(navegadores.get(cliente), desafio, sessao) } };
  }

  /** O pedido de pareamento (`/pareamento/…`): sem assinatura. `null` se o caminho não é do pareamento. */
  function responder(metodo, caminho, corpo) {
    if (!caminho.startsWith('/pareamento/') || metodo !== 'POST') return null;
    recebidos.push({ caminho, corpo });
    if (antigo) return { status: 404, json: { error: 'not_found' } };
    const rotas = { '/pareamento/comecar': comecar, '/pareamento/concluir': () => concluir(corpo), '/pareamento/conferir': () => conferir(corpo) };
    return rotas[caminho]?.() ?? { status: 404, json: { error: 'not_found' } };
  }

  /** O porteiro (`_pedido_aceito`): `{ erro }` (401), ou `{ segredo, nonce }` do navegador que assinou. */
  function verificar(req, caminho) {
    if (antigo) return { antigo: true };   // a Conexão de antes do pareamento atende pela origem, sem assinar
    const cabecalho = nome => req.headers()[nome.toLowerCase()];
    const cliente = cabecalho('X-PerpetualMiner-Cliente');
    const assinatura = cabecalho('X-PerpetualMiner-Assinatura');
    const segredo = cliente && assinatura ? navegadores.get(cliente) : undefined;
    if (!segredo) return { erro: 'pairing_required' };
    if (cabecalho('X-PerpetualMiner-Sessao') !== sessao) return { erro: 'session_expired' };
    const nonce = cabecalho('X-PerpetualMiner-Nonce');
    if (!NONCE.test(nonce || '')) return { erro: 'pairing_invalid' };
    const esperada = assinaturaDoPedido(segredo, { sessao, nonce, metodo: req.method(), caminho, corpo: req.postData() || '' });
    if (esperada !== assinatura || nonces.has(`${cliente} ${nonce}`)) return { erro: 'pairing_invalid' };
    nonces.add(`${cliente} ${nonce}`);
    return { segredo, nonce };
  }

  /** A mesma `route` com a prova da resposta: cada `fulfill` leva `X-PerpetualMiner-Prova` (status e corpo), como a Conexão responde. */
  function comProva(route, { segredo, nonce, antigo: semProva }) {
    if (semProva) return route;
    return {
      request: () => route.request(),
      abort: codigo => route.abort(codigo),
      fulfill: opcoes => {
        const corpo = Buffer.from(opcoes.body ?? '', 'utf8');
        const prova = provaDaResposta(segredo, { sessao, nonce, status: opcoes.status ?? 200, corpo });
        return route.fulfill({ ...opcoes, headers: { ...opcoes.headers, 'X-PerpetualMiner-Prova': prova, 'Access-Control-Expose-Headers': 'X-PerpetualMiner-Prova' } });
      },
    };
  }

  return {
    responder, verificar, comProva,
    /** O `contexto` de um exemplo do contrato: `pareado: false` (a Conexão não conhece nenhum navegador), `semTela`, `codigoPendente` (o Anki está mostrando
     * este código) e `codigoUsadoPor` (outro navegador já o usou). */
    definirContexto({ pareado = true, semTela = false, codigoPendente, codigoUsadoPor } = {}) {
      if (!pareado) { navegadores.clear(); concluido = null; }
      if (semTela) semJanela = true;
      if (codigoPendente) { sortearDe = () => codigoPendente; comecar(); }
      if (codigoUsadoPor) concluir({ codigo: mostrar(pendente.codigo), cliente: codigoUsadoPor, nome: 'Outro' });
    },
    /** O navegador já está pareado com esta Conexão (o segredo vem do contrato ou do pareamento que o teste fez). */
    parear: (navegador = 'primeiro') => navegadores.set(NAVEGADORES[navegador].cliente, NAVEGADORES[navegador].segredo),
    /** @estado-guardado Os navegadores que a Conexão tem pareados (`cliente` → segredo em base64): o que `pareamento.json` guardaria. */
    pareados: () => new Map(navegadores),
    /** "Desconectar navegadores" na janela do Anki: a lista esvazia, e cada navegador pede o código de novo. */
    desconectar: () => { navegadores.clear(); concluido = null; },
    /** @estado-guardado O código que o Anki mostra agora (com o hífen, `K7M-4PX`), ou null: o que a pessoa lê na tela do Anki. */
    codigoNoAnki: () => (codigoPendente() ? mostrar(pendente.codigo) : null),
    /** @estado-guardado Os códigos que o Anki mostrou até agora, na ordem. */
    codigosMostrados: () => [...mostrados],
    /** O código que o próximo `comecar` sorteia (o contrato tem exemplos de um código conhecido). */
    sortearCodigo: codigo => { sortearDe = () => codigo; },
    /** O código passou dos 5 minutos sem ser digitado. */
    vencerOCodigo: () => { if (pendente) pendente.vence = new Date(agora().getTime() - 1); },
    /** A pessoa apertou Cancelar no diálogo do Anki. */
    cancelarNoAnki: () => { pendente = null; },
    /** A Conexão é a de antes do pareamento: as rotas dele respondem 404. */
    antigo: () => { antigo = true; },
    /** O Anki não consegue abrir o diálogo (o Qt mudou): `comecar` responde `pairing_unavailable`. */
    semJanelaDoAnki: () => { semJanela = true; },
    tentou: caminho => { tentados.push(caminho); },
    /** @estado-guardado Os caminhos do pareamento que a extensão tentou, a Conexão ligada ou não (o `conferir` que antecede todo pedido privado). */
    tentativas: () => [...tentados],
    /** @estado-guardado Cada pedido de pareamento que chegou: `{ caminho, corpo }`. */
    recebidos: () => recebidos.map(({ caminho, corpo }) => ({ caminho, corpo })),
    sessao: () => sessao,
  };
}

module.exports = { criarPareamento };
