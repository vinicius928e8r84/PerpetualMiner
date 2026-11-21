'use strict';

const assert = require('assert');

const { NAVEGADORES, assinaturaDoPedido, provaDaResposta, provaDoServidor, provaDaRevogacao } = require('../e2e/pareamento-de-teste');
const { ENDERECO, criarConexao, resposta, carregarAPagina, igual, parearComChaveGuardada } = require('../e2e/pagina-de-mentira-do-pareamento');

const { cliente: CLIENTE, segredo: SEGREDO } = NAVEGADORES.primeiro;
const SESSAO = 'f'.repeat(32);
const OUTRO_SEGREDO = NAVEGADORES.segundo.segredo;
const PROVA_FALSA = 'AAAA'.repeat(10) + 'AAA=';
const semRede = () => { throw new TypeError('Failed to fetch'); };
const texto = (status, corpo) => new Response(corpo, { status });

const sessaoProvada = (segredo, sessao = SESSAO) => ({ desafio }) => resposta(200, { sessao, prova: provaDoServidor(segredo, desafio, sessao) });
const revogada = segredo => ({ desafio }) => resposta(401, { error: 'pairing_revoked', prova: provaDaRevogacao(segredo, desafio) });

const CONFERENCIAS = [
  ['a Conexão antiga', () => resposta(404, { error: 'not_found' }), { estado: 'antiga', credencialFica: true }],
  ['a revogação provada', revogada(SEGREDO), { estado: 'a_parear', credencialFica: false }],
  ['a revogação com a prova de outro segredo', revogada(OUTRO_SEGREDO), { estado: 'nao_confirmada', credencialFica: true }],
  ['a revogação com a prova que não é texto', () => resposta(401, { error: 'pairing_revoked', prova: 7 }), { estado: 'nao_confirmada', credencialFica: true }],
  ['a revogação provada num 403', ({ desafio }) => resposta(403, { error: 'pairing_revoked', prova: provaDaRevogacao(SEGREDO, desafio) }), { estado: 'nao_confirmada', credencialFica: true }],
  ['o pareamento pedido', () => resposta(401, { error: 'pairing_required' }), { estado: 'a_parear', credencialFica: true }],
  ['o pareamento pedido num 403', () => resposta(403, { error: 'pairing_required' }), { estado: 'nao_confirmada', credencialFica: true }],
  ['outra recusa', () => resposta(401, { error: 'pairing_invalid' }), { estado: 'nao_confirmada', credencialFica: true }],
  ['um 401 sem JSON', () => texto(401, 'não'), { estado: 'nao_confirmada', credencialFica: true }],
  ['a sessão provada', sessaoProvada(SEGREDO), { estado: 'pareada', credencialFica: true, sessao: SESSAO, cliente: CLIENTE }],
  ['a sessão provada com outro segredo', sessaoProvada(OUTRO_SEGREDO), { estado: 'nao_confirmada', credencialFica: true }],
  ['a sessão provada num 500', ({ desafio }) => resposta(500, { sessao: SESSAO, prova: provaDoServidor(SEGREDO, desafio, SESSAO) }), { estado: 'nao_confirmada', credencialFica: true }],
  ['a sessão que não é texto', ({ desafio }) => resposta(200, { sessao: 5, prova: provaDoServidor(SEGREDO, desafio, '5') }), { estado: 'nao_confirmada', credencialFica: true }],
  ['a sessão sem a prova', () => resposta(200, { sessao: SESSAO }), { estado: 'nao_confirmada', credencialFica: true }],
  ['um 200 sem JSON', () => texto(200, 'ok'), { estado: 'nao_confirmada', credencialFica: true }],
  ['um 200 com JSON nulo', () => resposta(200, null), { estado: 'nao_confirmada', credencialFica: true }],
];

const SEM_CREDENCIAL = [
  ['a Conexão antiga', () => resposta(404, { error: 'not_found' }), { estado: 'antiga', credencialFica: false }],
  ['o pareamento pedido', () => resposta(401, { error: 'pairing_required' }), { estado: 'a_parear', credencialFica: false }],
  ['uma sessão provada', sessaoProvada(SEGREDO), { estado: 'a_parear', credencialFica: false }],
  ['a rede caída', semRede, { estado: 'a_parear', credencialFica: false }],
];

function paginaDaConexao(responder) {
  const conexao = criarConexao({ impostor: async ({ caminho, corpo }) => responder(JSON.parse(corpo), caminho) });
  return { conexao, pagina: carregarAPagina(conexao) };
}

async function provarCom(responder, comCredencial) {
  const { pagina } = paginaDaConexao(responder);
  if (comCredencial) await parearComChaveGuardada(pagina);
  const ouvidos = [];
  pagina.Pareamento.aoMudar(estado => ouvidos.push(estado));
  const provado = await pagina.Pareamento.provar(ENDERECO);
  const obtido = { estado: provado.estado, credencialFica: Boolean(await pagina.Pareamento.lerACredencial()) };
  if (provado.sessao) Object.assign(obtido, { sessao: provado.sessao, cliente: provado.credencial.cliente });
  return { obtido, ouvidos, registrado: pagina.Pareamento.estado() };
}

async function conferirCadaResposta() {
  for (const [lista, comCredencial] of [[CONFERENCIAS, true], [SEM_CREDENCIAL, false]]) {
    for (const [nome, responder, esperado] of lista) {
      const { obtido, ouvidos, registrado } = await provarCom(responder, comCredencial);
      igual([obtido, ouvidos, registrado], [esperado, [esperado.estado], esperado.estado], `${nome} (com credencial: ${comCredencial})`);
    }
  }
}

async function conferirARedeCaidaComCredencial() {
  const { pagina } = paginaDaConexao(semRede);
  await parearComChaveGuardada(pagina);
  await assert.rejects(pagina.Pareamento.provar(ENDERECO), /Failed to fetch/);
  igual([pagina.Pareamento.estado(), Boolean(await pagina.Pareamento.lerACredencial())], [null, true]);
}

const SEGREDO_CURTO = Buffer.alloc(16, 1).toString('base64');
const doCliente = (status, segredo) => ({ cliente }) => resposta(status, { cliente, segredo });

const CONCLUSOES = [
  ['a rede caída', semRede, { erro: 'falhou' }, 'o mesmo'],
  ['o código errado', () => resposta(401, { error: 'pairing_code_wrong', restam: 3 }), { erro: 'errado', restam: 3 }, 'o mesmo'],
  ['o código errado sem o que resta', () => resposta(401, { error: 'pairing_code_wrong' }), { erro: 'falhou' }, 'o mesmo'],
  ['o código errado com o que resta em texto', () => resposta(401, { error: 'pairing_code_wrong', restam: '3' }), { erro: 'falhou' }, 'o mesmo'],
  ['o código errado num 400', () => resposta(400, { error: 'pairing_code_wrong', restam: 3 }), { erro: 'falhou' }, 'o mesmo'],
  ['o código vencido', () => resposta(410, { error: 'pairing_code_expired' }), { erro: 'venceu' }, 'outro'],
  ['o código usado', () => resposta(409, { error: 'pairing_code_used' }), { erro: 'venceu' }, 'outro'],
  ['o código usado num 410', () => resposta(410, { error: 'pairing_code_used' }), { erro: 'falhou' }, 'o mesmo'],
  ['o código vencido num 409', () => resposta(409, { error: 'pairing_code_expired' }), { erro: 'falhou' }, 'o mesmo'],
  ['um 410 sem JSON', () => texto(410, 'x'), { erro: 'falhou' }, 'o mesmo'],
  ['o segredo de outro cliente', () => resposta(200, { cliente: CLIENTE, segredo: SEGREDO }), { erro: 'falhou' }, 'o mesmo'],
  ['o segredo que não é texto', ({ cliente }) => resposta(200, { cliente, segredo: 32 }), { erro: 'falhou' }, 'o mesmo'],
  ['o segredo curto', doCliente(200, SEGREDO_CURTO), { erro: 'falhou' }, 'o mesmo'],
  ['o segredo num 201', doCliente(201, SEGREDO), { erro: 'falhou' }, 'o mesmo'],
  ['um 200 sem JSON', () => texto(200, 'ok'), { erro: 'falhou' }, 'o mesmo'],
  ['o segredo do cliente', doCliente(200, SEGREDO), { ok: true }, 'outro'],
];

function conclusoesVistas(conexao) {
  return conexao.vistos.filter(visto => visto.caminho === '/pareamento/concluir').map(visto => JSON.parse(visto.corpo));
}

async function concluirCom(responder) {
  const respostas = [responder, () => resposta(401, { error: 'pairing_code_wrong', restam: 1 })];
  const { conexao, pagina } = paginaDaConexao(corpo => respostas.shift()(corpo));
  const desfecho = await pagina.Pareamento.concluir(ENDERECO, 'K7M-4PX');
  const guardada = await pagina.Pareamento.lerACredencial();
  await pagina.Pareamento.concluir(ENDERECO, 'K7M-4PX');
  const [primeiro, segundo] = conclusoesVistas(conexao);
  const proximo = primeiro.cliente === segundo.cliente ? 'o mesmo' : 'outro';
  return { desfecho, proximo, pedido: primeiro, guardada: guardada?.cliente === primeiro.cliente };
}

async function conferirCadaConclusao() {
  for (const [nome, responder, desfecho, proximo] of CONCLUSOES) {
    const obtido = await concluirCom(responder);
    const guardada = 'ok' in desfecho;
    igual([obtido.desfecho, obtido.proximo, obtido.guardada], [desfecho, proximo, guardada], nome);
    igual([obtido.pedido.codigo, obtido.pedido.nome, typeof obtido.pedido.cliente], ['K7M-4PX', 'Google Chrome', 'string'], nome);
  }
}

async function clienteDepoisDaConferencia(conferir) {
  const respostas = { '/pareamento/concluir': semRede, '/pareamento/conferir': conferir };
  const { conexao, pagina } = paginaDaConexao((corpo, caminho) => respostas[caminho](corpo));
  await parearComChaveGuardada(pagina);
  await pagina.Pareamento.concluir(ENDERECO, 'K7M-4PX');
  await pagina.Pareamento.provar(ENDERECO);
  await pagina.Pareamento.concluir(ENDERECO, 'K7M-4PX');
  const [primeiro, segundo] = conclusoesVistas(conexao);
  return primeiro.cliente === segundo.cliente ? 'o mesmo' : 'outro';
}

async function conferirOClienteQueARevogacaoEsquece() {
  igual(await clienteDepoisDaConferencia(revogada(SEGREDO)), 'outro', 'a revogação provada esquece o navegador que estava a parear');
  igual(await clienteDepoisDaConferencia(() => resposta(401, { error: 'pairing_required' })), 'o mesmo', 'o pareamento pedido não o esquece');
  igual(await clienteDepoisDaConferencia(revogada(OUTRO_SEGREDO)), 'o mesmo', 'a revogação sem prova não o esquece');
}

const GUARDADAS = [
  ['nada', undefined, false],
  ['um texto', 'credencial', false],
  ['sem a chave', { cliente: CLIENTE }, false],
  ['a chave vazia', { cliente: CLIENTE, chave: '' }, false],
  ['o cliente que não é texto', { cliente: 7, chave: 'k' }, false],
  ['o cliente e a chave', { cliente: CLIENTE, chave: 'k' }, true],
  ['o cliente vazio e a chave', { cliente: '', chave: 'k' }, true],
];

async function conferirACredencialLida() {
  for (const [nome, guardada, aceita] of GUARDADAS) {
    const { pagina } = paginaDaConexao(semRede);
    await parearComChaveGuardada(pagina);
    pagina.indexedDB.bancos.get('pm-pareamento').get('conexao').set('credencial', guardada);
    const lida = await pagina.Pareamento.lerACredencial();
    igual([lida === null, lida === guardada], [!aceita, aceita], nome);
  }
}

const NONCE = 'X-PerpetualMiner-Nonce';
const COM_CORPO = Object.freeze({ metodo: 'POST', caminho: '/ia/estado', corpo: { pergunta: 'ação' } });
const SEM_CORPO = Object.freeze({ metodo: 'GET', caminho: '/ia/estado' });
const SEM_PROVA_DA_RESPOSTA = { erro: 'a resposta da Conexão não trouxe a prova de quem tem o segredo deste navegador', semProva: true };
const SEM_PROVA_DO_SERVIDOR = { erro: 'a Conexão não provou ter o segredo deste navegador', semProva: true };

function provada(status, corpo, { statusDaProva = status, corpoDaProva = corpo } = {}) {
  return cabecalhos => {
    const prova = provaDaResposta(SEGREDO, { sessao: SESSAO, nonce: cabecalhos[NONCE], status: statusDaProva, corpo: Buffer.from(JSON.stringify(corpoDaProva)) });
    return new Response(JSON.stringify(corpo), { status, headers: { 'X-PerpetualMiner-Prova': prova } });
  };
}

const recusada = erro => () => resposta(401, { error: erro });
const emSequencia = (...respostas) => corpo => respostas.shift()(corpo);
const devolvida = (status, corpo) => ({ status, texto: JSON.stringify(corpo) });

const PEDIDOS_ASSINADOS = [
  ['aceito', { respostas: [provada(200, { ok: true })] }, { desfecho: devolvida(200, { ok: true }), saidas: 1, conferencias: 1, registrado: 'pareada' }],
  ['aceito sem corpo', { pedido: SEM_CORPO, respostas: [provada(200, { ok: true })] }, { desfecho: devolvida(200, { ok: true }), saidas: 1, conferencias: 1, registrado: 'pareada' }],
  ['um 500 provado', { respostas: [provada(500, { error: 'x' })] }, { desfecho: devolvida(500, { error: 'x' }), saidas: 1, conferencias: 1, registrado: 'pareada' }],
  ['a sessão vencida e depois aceito', { respostas: [recusada('session_expired'), provada(200, { ok: true })] }, { desfecho: devolvida(200, { ok: true }), saidas: 2, conferencias: 2, registrado: 'pareada' }],
  ['a sessão vencida duas vezes', { respostas: [recusada('session_expired'), recusada('session_expired')] }, { desfecho: devolvida(401, { error: 'session_expired' }), saidas: 2, conferencias: 2, registrado: 'pareada' }],
  ['a sessão vencida e depois o pareamento pedido', { respostas: [recusada('session_expired'), recusada('pairing_required')] }, { desfecho: devolvida(401, { error: 'pairing_required' }), saidas: 2, conferencias: 2, registrado: 'nao_confirmada' }],
  ['a sessão vencida e depois sem a prova', { respostas: [recusada('session_expired'), () => resposta(200, { ok: true })] }, { desfecho: SEM_PROVA_DA_RESPOSTA, saidas: 2, conferencias: 2, registrado: 'nao_confirmada' }],
  ['o pareamento pedido', { respostas: [recusada('pairing_required')] }, { desfecho: devolvida(401, { error: 'pairing_required' }), saidas: 1, conferencias: 1, registrado: 'nao_confirmada' }],
  ['outra recusa', { respostas: [recusada('pairing_invalid')] }, { desfecho: devolvida(401, { error: 'pairing_invalid' }), saidas: 1, conferencias: 1, registrado: 'pareada' }],
  ['um 401 sem JSON', { respostas: [() => texto(401, 'não')] }, { desfecho: { status: 401, texto: 'não' }, saidas: 1, conferencias: 1, registrado: 'pareada' }],
  ['um 401 com JSON nulo', { respostas: [() => resposta(401, null)] }, { desfecho: devolvida(401, null), saidas: 1, conferencias: 1, registrado: 'pareada' }],
  ['sem a prova', { respostas: [() => resposta(200, { ok: true })] }, { desfecho: SEM_PROVA_DA_RESPOSTA, saidas: 1, conferencias: 1, registrado: 'nao_confirmada' }],
  ['um 403 sem a prova', { respostas: [() => resposta(403, { error: 'x' })] }, { desfecho: SEM_PROVA_DA_RESPOSTA, saidas: 1, conferencias: 1, registrado: 'nao_confirmada' }],
  ['a prova de outro corpo', { respostas: [provada(200, { ok: true }, { corpoDaProva: { ok: false } })] }, { desfecho: SEM_PROVA_DA_RESPOSTA, saidas: 1, conferencias: 1, registrado: 'nao_confirmada' }],
  ['a prova de outro status', { respostas: [provada(500, { ok: true }, { statusDaProva: 200 })] }, { desfecho: SEM_PROVA_DA_RESPOSTA, saidas: 1, conferencias: 1, registrado: 'nao_confirmada' }],
  ['a Conexão antiga', { conferir: () => resposta(404, { error: 'not_found' }), respostas: [] }, { desfecho: { pareamento: 'antiga' }, saidas: 0, conferencias: 1, registrado: 'antiga' }],
  ['a parear', { conferir: recusada('pairing_required'), respostas: [] }, { desfecho: { pareamento: 'a_parear' }, saidas: 0, conferencias: 1, registrado: 'a_parear' }],
  ['o servidor sem a prova', { conferir: sessaoProvada(OUTRO_SEGREDO), respostas: [] }, { desfecho: SEM_PROVA_DO_SERVIDOR, saidas: 0, conferencias: 1, registrado: 'nao_confirmada' }],
  ['a sessão vencida e depois o servidor sem a prova', { conferir: emSequencia(sessaoProvada(SEGREDO), sessaoProvada(OUTRO_SEGREDO)), respostas: [recusada('session_expired')] }, { desfecho: SEM_PROVA_DO_SERVIDOR, saidas: 1, conferencias: 2, registrado: 'nao_confirmada' }],
  ['a sessão vencida e depois a parear', { conferir: emSequencia(sessaoProvada(SEGREDO), recusada('pairing_required')), respostas: [recusada('session_expired')] }, { desfecho: { pareamento: 'a_parear' }, saidas: 1, conferencias: 2, registrado: 'a_parear' }],
];

function resumoDaSaida({ pedido, opcoes }, argumentos) {
  const [endereco, pedidoQueSai, corpoEmTexto, opcoesQueSaem, cabecalhos] = argumentos;
  const corpo = corpoEmTexto ?? '';
  const assinatura = assinaturaDoPedido(SEGREDO, { sessao: SESSAO, nonce: cabecalhos[NONCE], metodo: pedido.metodo, caminho: pedido.caminho, corpo });
  return {
    argumentos: argumentos.length, endereco, mesmoPedido: pedidoQueSai === pedido, mesmasOpcoes: opcoesQueSaem === opcoes, corpoEmTexto: String(corpoEmTexto),
    nomes: Object.keys(cabecalhos), cliente: cabecalhos['X-PerpetualMiner-Cliente'], sessao: cabecalhos['X-PerpetualMiner-Sessao'],
    assinaturaCerta: cabecalhos['X-PerpetualMiner-Assinatura'] === assinatura, nonce: /^[0-9a-f]{32}$/.test(cabecalhos[NONCE]),
  };
}

const saidaEsperada = pedido => ({
  argumentos: 5, endereco: ENDERECO, mesmoPedido: true, mesmasOpcoes: true, corpoEmTexto: String(pedido.corpo && JSON.stringify(pedido.corpo)),
  nomes: ['X-PerpetualMiner-Cliente', 'X-PerpetualMiner-Sessao', 'X-PerpetualMiner-Nonce', 'X-PerpetualMiner-Assinatura'],
  cliente: CLIENTE, sessao: SESSAO, assinaturaCerta: true, nonce: true,
});

async function pedirAssinadoNo(cenario) {
  const { conexao, pagina } = paginaDaConexao(cenario.conferir || sessaoProvada(SEGREDO));
  await parearComChaveGuardada(pagina);
  const saidas = [];
  const enviar = (...argumentos) => {
    saidas.push(argumentos);
    return cenario.respostas[saidas.length - 1](argumentos[4]);
  };
  const desfecho = await pagina.Pareamento.pedirAssinado(ENDERECO, cenario.pedido, cenario.opcoes, enviar)
    .catch(erro => ({ erro: erro.message, semProva: erro.semProva }));
  return { desfecho, saidas: saidas.map(saida => resumoDaSaida(cenario, saida)), conferencias: conexao.vistos.length, registrado: pagina.Pareamento.estado() };
}

async function conferirCadaPedidoAssinado() {
  for (const [nome, cenario, esperado] of PEDIDOS_ASSINADOS) {
    const pedido = cenario.pedido || COM_CORPO;
    const obtido = await pedirAssinadoNo({ ...cenario, pedido, opcoes: { signal: null } });
    igual(obtido, { ...esperado, saidas: Array(esperado.saidas).fill(saidaEsperada(pedido)) }, nome);
  }
}

const esperar = ms => new Promise(resolver => setTimeout(resolver, ms));

async function filaDeDoisPedidos(respostaAoPrimeiro) {
  let primeiroConferindo;
  const chegou = new Promise(resolver => { primeiroConferindo = resolver; });
  const atrasada = async corpo => { primeiroConferindo(); await esperar(30); return respostaAoPrimeiro(corpo); };
  const conferencias = [atrasada, sessaoProvada(SEGREDO)];
  const { pagina } = paginaDaConexao(corpo => conferencias.shift()(corpo));
  await parearComChaveGuardada(pagina);
  const ordem = [];
  const enviarComo = quem => async (...argumentos) => {
    ordem.push(`${quem} sai`);
    await esperar(20);
    ordem.push(`${quem} volta`);
    return provada(200, { quem })(argumentos[4]);
  };
  const pedir = quem => pagina.Pareamento.pedirAssinado(ENDERECO, COM_CORPO, {}, enviarComo(quem)).catch(erro => ({ erro: erro.message }));
  const primeiro = pedir('A');
  await chegou;
  const desfechos = await Promise.all([primeiro, pedir('B')]);
  return { ordem, desfechos };
}

async function conferirAFilaDeSaida() {
  igual(await filaDeDoisPedidos(sessaoProvada(SEGREDO)), {
    ordem: ['A sai', 'B sai', 'A volta', 'B volta'],
    desfechos: [devolvida(200, { quem: 'A' }), devolvida(200, { quem: 'B' })],
  }, 'o segundo pedido sai depois do primeiro sair, sem esperar a volta dele');
  igual(await filaDeDoisPedidos(sessaoProvada(OUTRO_SEGREDO)), {
    ordem: ['B sai', 'B volta'],
    desfechos: [{ erro: SEM_PROVA_DO_SERVIDOR.erro }, devolvida(200, { quem: 'B' })],
  }, 'o primeiro que não sai libera a fila');
}

async function main() {
  const casos = [
    conferirCadaResposta, conferirARedeCaidaComCredencial, conferirCadaConclusao, conferirOClienteQueARevogacaoEsquece,
    conferirACredencialLida, conferirCadaPedidoAssinado, conferirAFilaDeSaida,
  ];
  for (const caso of casos) await caso();
  console.log('pareamento desfechos tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });
