'use strict';

const assert = require('assert');

globalThis.PerpetualMiner = {};
globalThis.chrome = { storage: { local: { get: async () => ({}) }, onChanged: { addListener() {} } } };
require('../lib/pedido-ao-anki.js');
require('../lib/conexao-anki.js');
require('../lib/configuracao.js');
require('../painel/painel-anki-primeira-conexao-estado.js');
require('../painel/painel-conexao-passos-estado.js');
delete globalThis.chrome;
const { RetratoDosPassos, ConexaoAnki, Configuracao, ConversaComOAbridor } = globalThis.PerpetualMiner;
const { PASSO, PASSOS, SEM_RESPOSTA_MS, cartaoAberto, marcasDosPassos, statusDaConexao, abridorNoCard, espera } = RetratoDosPassos;
const { LIGADA, CONECTANDO, DESLIGADA } = ConexaoAnki.SITUACAO;
const { FEITO, AGORA_NAO } = Configuracao.SITUACAO;
const { FASE } = ConversaComOAbridor;

const passo = id => PASSOS.find(cada => cada.id === id);
const conversa = (fase, mais = {}) => ({ ...ConversaComOAbridor.inicial(), fase, ...mais });
const conferirCasos = casos => casos.forEach(([nome, visto, esperado]) => assert.deepStrictEqual(visto, esperado, nome));

conferirCasos([
  ['a ordem dos passos', PASSOS.map(cada => cada.id), [PASSO.ANKI, PASSO.ARQUIVO, PASSO.TENTAR, PASSO.ABRIDOR]],
  ['o título de cada passo', PASSOS.map(cada => cada.titulo), ['ONB-18.titulo', 'ONB-16.passo1Titulo', 'ONB-16.passo2Titulo', 'ONB-17.titulo']],
  ['a espera sem resposta é de 2 minutos', SEM_RESPOSTA_MS, 2 * 60 * 1000],
]);

const aberto = mais => cartaoAberto({ pronto: false, escolha: null, situacao: DESLIGADA, ligou: false, jaConectou: false, ...mais });
const no = (i, id) => ({ aberto: i, passo: passo(id) });
conferirCasos([
  ['pronto mostra o card do abridor, sem passo aberto', aberto({ pronto: true }), no(-1, PASSO.ABRIDOR)],
  ['pronto vale mais que a escolha', aberto({ pronto: true, escolha: PASSO.ANKI }), no(-1, PASSO.ABRIDOR)],
  ['a escolha da pessoa vale mais que a conexão', aberto({ escolha: PASSO.ARQUIVO, situacao: LIGADA }), no(1, PASSO.ARQUIVO)],
  ['ligada abre o abridor', aberto({ situacao: LIGADA }), no(3, PASSO.ABRIDOR)],
  ['conectando abre o tentar de novo', aberto({ situacao: CONECTANDO }), no(2, PASSO.TENTAR)],
  ['desligada pela primeira vez abre o Ter o Anki', aberto({}), no(0, PASSO.ANKI)],
  ['desligada depois de ligar nesta tela abre o tentar de novo', aberto({ ligou: true }), no(2, PASSO.TENTAR)],
  ['desligada depois de já ter conectado abre o tentar de novo', aberto({ jaConectou: true }), no(2, PASSO.TENTAR)],
]);

const marcas = mais => marcasDosPassos({ aberto: 0, pronto: false, situacao: DESLIGADA, conversa: conversa(FASE.ANTES), ...mais })
  .map(({ situacao, atual, leitor }) => [situacao, atual, leitor]);
const FEITA = [FEITO, false, 'ONB-13.feito'];
const VAZIA = ['', false, null];
conferirCasos([
  ['sem conexão nada está feito e o primeiro é o atual', marcas({}), [['', true, null], VAZIA, VAZIA, VAZIA]],
  ['ligada marca os três primeiros', marcas({ aberto: 3, situacao: LIGADA }), [FEITA, FEITA, FEITA, ['', true, null]]],
  ['pronto com o abridor achado marca todos', marcas({ aberto: -1, pronto: true, conversa: conversa(FASE.ACHOU) }), [FEITA, FEITA, FEITA, FEITA]],
  ['o agora não do abridor', marcas({ conversa: conversa(FASE.PEDIR, { agoraNao: true }) })[3], [AGORA_NAO, false, 'ONB-13.agoraNao']],
  ['achou vale mais que o agora não', marcas({ conversa: conversa(FASE.ACHOU, { agoraNao: true }) })[3], FEITA],
]);

const status = (id, mais = {}) => statusDaConexao({ pronto: false, situacao: DESLIGADA, conferindo: false, passo: passo(id), ...mais });
const STATUS_DESLIGADA = { esperando: false, exibida: DESLIGADA, mostrada: DESLIGADA, tentarSai: false };
conferirCasos([
  ['no passo do arquivo, desligada é a espera', status(PASSO.ARQUIVO), { ...STATUS_DESLIGADA, esperando: true, tentarSai: true }],
  ['conectando não é a espera', status(PASSO.ARQUIVO, { situacao: CONECTANDO }).esperando, false],
  ['pronto não é a espera', status(PASSO.ARQUIVO, { pronto: true }).esperando, false],
  ['conferindo no tentar de novo mostra conectando', status(PASSO.TENTAR, { conferindo: true }), { ...STATUS_DESLIGADA, exibida: CONECTANDO, mostrada: CONECTANDO }],
  ['conferindo fora do tentar de novo mostra a situação', status(PASSO.ARQUIVO, { conferindo: true }).exibida, DESLIGADA],
  ['conferindo com a conexão ligada mostra ligada', status(PASSO.TENTAR, { conferindo: true, situacao: LIGADA }).exibida, LIGADA],
  ['no tentar de novo desligada, o botão fica', status(PASSO.TENTAR), STATUS_DESLIGADA],
  ['ligada, o tentar de novo sai', status(PASSO.TENTAR, { situacao: LIGADA }).tentarSai, true],
  ['pronto, o tentar de novo sai', status(PASSO.TENTAR, { pronto: true }).tentarSai, true],
  ['pronto mostra ligada', status(PASSO.ABRIDOR, { pronto: true }), { ...STATUS_DESLIGADA, mostrada: LIGADA, tentarSai: true }],
  ['pronto mas conectando mostra conectando', status(PASSO.ABRIDOR, { pronto: true, situacao: CONECTANDO }).mostrada, CONECTANDO],
]);

const noCard = (fase, mais = {}, tela = {}) => abridorNoCard(conversa(fase, mais), { passo: passo(PASSO.ABRIDOR), pronto: false, situacao: LIGADA, ...tela });
const visto = card => [card.texto, card.falado, card.ponto, card.causa];
const NENHUM_BOTAO = { permitir: false, ocupado: false, tentar: false, agoraNao: false };
conferirCasos([
  ['antes de ligar, o bloco não aparece', noCard(FASE.ANTES).escondido, true],
  ['lendo a permissão, o bloco não aparece', noCard(FASE.LENDO).escondido, true],
  ['pedindo a permissão com a conexão ligada, aparece', noCard(FASE.PEDIR).escondido, false],
  ['com a conexão desligada, não aparece', noCard(FASE.PEDIR, {}, { situacao: DESLIGADA }).escondido, true],
  ['pronto, aparece mesmo desligada', noCard(FASE.PEDIR, {}, { situacao: DESLIGADA, pronto: true }).escondido, false],
  ['fora do passo do abridor, não aparece', noCard(FASE.PEDIR, {}, { passo: passo(PASSO.TENTAR) }).escondido, true],
  ['pedir: Permitir e Agora não, sem texto', noCard(FASE.PEDIR), {
    escondido: false, texto: null, falado: null, ponto: '', causa: '', botoes: { ...NENHUM_BOTAO, permitir: true, agoraNao: true },
  }],
  ['pedir depois de recusada', visto(noCard(FASE.PEDIR, { recusada: true })), ['ONB-17.semPermissao', 'ONB-17.semPermissao', '', '']],
  ['pedir depois do agora não, sem o Agora não', noCard(FASE.PEDIR, { agoraNao: true }).botoes, { ...NENHUM_BOTAO, permitir: true }],
  ['pedindo', [visto(noCard(FASE.PEDINDO)), noCard(FASE.PEDINDO).botoes.ocupado], [['ONB-17.pedindo', 'ONB-17.pedindo', CONECTANDO, ''], true]],
  ['procurando', visto(noCard(FASE.PROCURANDO)), ['ONB-17.procurando', 'ONB-17.procurando', CONECTANDO, '']],
  ['achou', visto(noCard(FASE.ACHOU)), ['ONB-17.achou', 'ONB-17.achou', LIGADA, '']],
  ['não achou: o aviso com a causa fixa', visto(noCard(FASE.NAO_ACHOU, { detalhe: 'ignorado' })), ['ONB-17.naoAchou', null, DESLIGADA, '{"achou":false}']],
  ['não achou: Tentar de novo e Agora não', noCard(FASE.NAO_ACHOU).botoes, { ...NENHUM_BOTAO, tentar: true, agoraNao: true }],
  ['sem abridor: o aviso com o detalhe', visto(noCard(FASE.SEM_ABRIDOR, { detalhe: 'host_not_found' })), ['ONB-17.semAbridor', null, DESLIGADA, 'host_not_found']],
  ['pronto, sem aviso', noCard(FASE.SEM_ABRIDOR, { detalhe: 'x' }, { pronto: true }).causa, ''],
  ['pronto, sem botões no problema', noCard(FASE.NAO_ACHOU, {}, { pronto: true }).botoes, NENHUM_BOTAO],
  ['pronto, sem botões no pedir', noCard(FASE.PEDIR, {}, { pronto: true }).botoes, NENHUM_BOTAO],
]);

const AGORA = 1_000_000;
const QUASE = AGORA - SEM_RESPOSTA_MS + 1;
const PASSOU = AGORA - SEM_RESPOSTA_MS;
const esperando = (mais = {}, ligada = false) => espera({ esperandoDesde: null, semResposta: false, visivel: true, pronto: false, ...mais }, { ligada, agora: AGORA });
conferirCasos([
  ['à vista, a espera começa agora', esperando(), { esperandoDesde: AGORA, semResposta: false, escondida: true }],
  ['fora da vista, não começa', esperando({ visivel: false }), { esperandoDesde: null, semResposta: false, escondida: true }],
  ['um instante antes dos 2 minutos', esperando({ esperandoDesde: QUASE }), { esperandoDesde: QUASE, semResposta: false, escondida: true }],
  ['aos 2 minutos, sem resposta', esperando({ esperandoDesde: PASSOU }), { esperandoDesde: PASSOU, semResposta: true, escondida: false }],
  ['fora da vista, a espera já começada conta', esperando({ esperandoDesde: PASSOU, visivel: false }).semResposta, true],
  ['sem resposta fica', esperando({ semResposta: true }), { esperandoDesde: AGORA, semResposta: true, escondida: false }],
  ['pronto esconde o sem resposta', esperando({ semResposta: true, pronto: true }).escondida, true],
  ['ligada zera a espera', esperando({ esperandoDesde: 5, semResposta: true }, true), { esperandoDesde: null, semResposta: false, escondida: true }],
]);

console.log('test_retrato_dos_passos: ok');
