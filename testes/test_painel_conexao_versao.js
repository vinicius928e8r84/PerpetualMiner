'use strict';

const assert = require('assert');

const { prepararAPagina, resumo, esperar } = require('./painel_de_mentira.js');

const { documento, conteudo, raiz } = prepararAPagina();
const textoDaVoz = raiz.textoDaVoz;

let situacao = 'ligada';
let saude = null;
let pareamento = 'pareada';
const seguidores = [];
const chamadas = [];
const respostas = { pedir: [], comecar: null, concluir: null };
const avisosDoPareamento = [];

raiz.ConexaoAnki = {
  SITUACAO: { CONECTANDO: 'conectando', LIGADA: 'ligada', DESLIGADA: 'desligada' },
  ENDERECO: 'http://127.0.0.1:8766',
  situacao: () => situacao,
  saude: () => saude,
  pareamento: () => pareamento,
  acompanhar: seguidor => seguidores.push(seguidor),
  conferir: async () => { seguidores.forEach(seguidor => seguidor()); return situacao; },
  tentarDeNovo: async () => { chamadas.push('tentarDeNovo'); },
};
raiz.ConexaoNaTela = { texto: valor => `na tela: ${valor}` };
raiz.PedidoAoAnki = { atualizarAConexao: () => 'atualizar', reiniciarOAnki: () => 'reiniciar' };
raiz.ConversaComOAnki = { pedir: async (pedido, opcoes) => { chamadas.push(['pedir', pedido, opcoes.prazoMs]); return respostas.pedir.shift(); } };
raiz.Abridor = {
  RESULTADO: { ABRIU: 'abriu' },
  pedirPermissao: async () => true,
  abrirOAnki: async () => { chamadas.push('abrirOAnki'); situacao = 'ligada'; saude = { versao: '0.4.5', atualizacao: null }; return { resultado: 'abriu' }; },
};
raiz.AbrirOAnki = { esperarOAnki: async () => true };
raiz.PareamentoComOAnki = {
  ESTADO: { PAREADA: 'pareada', A_PAREAR: 'a_parear', NAO_CONFIRMADA: 'nao_confirmada', ANTIGA: 'antiga' },
  aoMudar: seguidor => avisosDoPareamento.push(seguidor),
  comecar: async endereco => { chamadas.push(['comecar', endereco]); return respostas.comecar; },
  concluir: async (endereco, codigo) => { chamadas.push(['concluir', endereco, codigo]); return respostas.concluir; },
};
raiz.Veio.mostrarToastDeSucesso = texto => chamadas.push(['toast', texto]);
const armazenado = [];
chrome.storage.local.set = async valores => { armazenado.push(valores); };
const ouvintesDaPagina = [];
globalThis.addEventListener = (tipo, ouvinte) => ouvintesDaPagina.push([tipo, ouvinte]);

require('../painel/painel-conexao-versao-estado.js');
require('../painel/painel-conexao-versao.js');

const lerASaude = () => seguidores[0]();
const desenharOPareamento = () => seguidores[1]();
const doAviso = () => resumo(documento.getElementById('painel-conexao-versao'));
const doPareamento = () => resumo(documento.getElementById('painel-pareamento'));
const botao = no => no.querySelectorAll('button')[0];

const VELHA = { versao: '0.3.9', atualizacao: null };
const NO_DISCO = { versao: '0.3.9', atualizacao: { estado: 'instalada', versao: '0.4.5', atualizada: null } };
const NOVA = { versao: '0.4.5', atualizacao: { estado: null, versao: null, atualizada: '0.4.5' } };

const dispararNoAviso = () => botao(documento.getElementById('painel-conexao-versao')).disparar('click');
const dispararNoPareamento = () => botao(documento.getElementById('painel-pareamento')).disparar('click');
const aoFimDeCadaPedido = async () => { await esperar(); };
const textoComAcao = (fala, acao) => `${fala}${acao}`;

async function oAvisoDaVersao() {
  saude = { versao: '0.4.2', atualizacao: null };
  lerASaude();
  assert.strictEqual(doAviso(), null, 'em dia: sem aviso');

  saude = VELHA;
  lerASaude();
  assert.deepStrictEqual(doAviso(), {
    id: 'painel-conexao-versao', classe: 'veio-aviso', papel: 'alert',
    texto: textoComAcao(textoDaVoz('BRG-50.velha'), textoDaVoz('BRG-50.atualizarAgora')), botoes: [textoDaVoz('BRG-50.atualizarAgora')],
  });
  assert.strictEqual(conteudo.children[0].id, 'painel-conexao-versao', 'o aviso abre o conteúdo');
  lerASaude();
  assert.strictEqual(conteudo.children.length, 1, 'o mesmo estado não desenha de novo');

  respostas.pedir.push({ ok: false });
  dispararNoAviso();
  assert.deepStrictEqual(doAviso(), {
    id: 'painel-conexao-versao', classe: 'veio-aviso veio-aviso--info', papel: 'status', texto: textoDaVoz('BRG-50.atualizando'), botoes: [],
  });
  await aoFimDeCadaPedido();
  assert.deepStrictEqual(chamadas.shift(), ['pedir', 'atualizar', 60000]);
  assert.deepStrictEqual(doAviso(), {
    id: 'painel-conexao-versao', classe: 'veio-aviso', papel: 'alert',
    texto: textoComAcao(textoDaVoz('BRG-50.falhou', { versao: '0.3.9' }), textoDaVoz('BRG-50.tentarDeNovo')), botoes: [textoDaVoz('BRG-50.tentarDeNovo')],
  });

  respostas.pedir.push({ ok: true, dados: { estado: 'instalada', versao: '0.4.5' } });
  dispararNoAviso();
  await aoFimDeCadaPedido();
  chamadas.shift();
  assert.deepStrictEqual(doAviso(), {
    id: 'painel-conexao-versao', classe: 'veio-aviso veio-aviso--info', papel: 'status',
    texto: textoComAcao(textoDaVoz('BRG-50.atualizadaReiniciar', { versao: '0.4.5' }), textoDaVoz('BRG-50.reiniciar')), botoes: [textoDaVoz('BRG-50.reiniciar')],
  });
}

async function oReinicioDoAnki() {
  saude = NO_DISCO;
  lerASaude();
  respostas.pedir.push({ ok: true });
  dispararNoAviso();
  assert.strictEqual(doAviso().texto, textoDaVoz('BRG-50.reiniciando'));
  situacao = 'desligada';
  await new Promise(resolver => setTimeout(resolver, 3300));
  assert.deepStrictEqual(chamadas.splice(0), [['pedir', 'reiniciar', 15000], 'abrirOAnki']);
  assert.strictEqual(doAviso(), null, 'reiniciou: a Conexão voltou em dia');
}

function aConexaoAtualizadaUmaVezPorVersao() {
  saude = NOVA;
  lerASaude();
  assert.deepStrictEqual(armazenado.splice(0), [{ pm_conexao_atualizada_vista: '0.4.5' }]);
  assert.strictEqual(doAviso().texto, textoDaVoz('BRG-50.atualizada', { versao: '0.4.5' }));
  assert.deepStrictEqual(doAviso().botoes, [textoDaVoz('PAI-34')]);
  dispararNoAviso();
  assert.strictEqual(doAviso(), null);
}

function aConexaoAntigaNaoOfereceAAcao() {
  pareamento = 'antiga';
  saude = { versao: '0.4.2', atualizacao: null };
  lerASaude();
  assert.deepStrictEqual(doAviso().botoes, []);
  assert.strictEqual(doAviso().texto, textoDaVoz('BRG-50.velha'));
  pareamento = 'pareada';
  saude = null;
  lerASaude();
  assert.strictEqual(doAviso(), null, 'sem Conexão: sem aviso');
}

async function oPareamentoComecaPeloBotao() {
  pareamento = 'a_parear';
  desenharOPareamento();
  assert.deepStrictEqual(doPareamento(), {
    id: 'painel-pareamento', classe: 'veio-aviso veio-aviso--info', papel: 'status',
    texto: textoComAcao(textoDaVoz('BRG-52.conectar'), textoDaVoz('BRG-52.botao')), botoes: [textoDaVoz('BRG-52.botao')],
  });
  assert.strictEqual(conteudo.children[0].id, 'painel-pareamento');

  respostas.comecar = { ok: false };
  dispararNoPareamento();
  await esperar();
  assert.strictEqual(doPareamento().classe, 'veio-aviso', 'não confirmou: perigo');
  assert.strictEqual(doPareamento().texto, textoComAcao(textoDaVoz('BRG-52.naoConfirmou'), textoDaVoz('BRG-52.botao')));
}

async function oCodigoDoPareamento() {
  respostas.comecar = { ok: true };
  dispararNoPareamento();
  await esperar();
  const codigo = documento.getElementById('painel-pareamento');
  const campo = documento.getElementById('painel-pareamento-campo');
  assert.deepStrictEqual([codigo.localName, codigo.className], ['section', 'anki-cartao painel-pareamento']);
  assert.strictEqual(documento.activeElement, campo, 'o campo do código recebe o foco');
  assert.strictEqual(campo.getAttribute('aria-labelledby'), 'painel-pareamento-pergunta');
  assert.strictEqual(documento.getElementById('painel-pareamento-pergunta').textContent, textoDaVoz('BRG-52.digite'));

  campo.value = '';
  botao(codigo).disparar('click');
  await esperar();
  assert.strictEqual(chamadas.filter(chamada => chamada[0] === 'concluir').length, 0, 'sem código, nada é enviado');
  campo.value = ' 1234 ';
  respostas.concluir = { ok: false, erro: 'errado', restam: 2 };
  campo.disparar('keydown', { key: 'Enter' });
  await esperar();
  assert.deepStrictEqual(chamadas.splice(0).filter(chamada => chamada[0] === 'concluir'), [['concluir', 'http://127.0.0.1:8766', ' 1234 ']]);
  assert.strictEqual(documento.getElementById('painel-pareamento-resposta').textContent, textoDaVoz('BRG-52.errado', { n: 2 }));
  assert.strictEqual(documento.getElementById('painel-pareamento'), codigo, 'a mesma caixa só troca a resposta');
  assert.strictEqual(documento.activeElement, campo);

  respostas.concluir = { ok: false, erro: 'outro' };
  botao(codigo).disparar('click');
  await esperar();
  assert.strictEqual(documento.getElementById('painel-pareamento-resposta').textContent, textoDaVoz('BRG-52.naoConfirmou'));
}

async function oCodigoVenceuEOPareamentoTermina() {
  respostas.concluir = { ok: false, erro: 'venceu' };
  botao(documento.getElementById('painel-pareamento')).disparar('click');
  await esperar();
  assert.strictEqual(doPareamento().texto, textoComAcao(textoDaVoz('BRG-52.venceu'), textoDaVoz('BRG-52.botao')));
  assert.strictEqual(doPareamento().classe, 'veio-aviso');

  respostas.comecar = { ok: true };
  dispararNoPareamento();
  await esperar();
  respostas.concluir = { ok: true };
  documento.getElementById('painel-pareamento-campo').value = '9999';
  dispararNoPareamento();
  await esperar();
  assert.deepStrictEqual(chamadas.splice(0).filter(chamada => !['comecar', 'concluir'].includes(chamada[0])), ['tentarDeNovo', ['toast', 'na tela: ligada']]);
  pareamento = 'pareada';
  desenharOPareamento();
  assert.strictEqual(doPareamento(), null, 'pareada: a caixa some');
}

function oPareamentoNaoConfirmadoEASemConexao() {
  pareamento = 'nao_confirmada';
  desenharOPareamento();
  assert.strictEqual(doPareamento().texto, textoComAcao(textoDaVoz('BRG-52.naoConfirmou'), textoDaVoz('BRG-50.tentarDeNovo')));
  dispararNoPareamento();
  assert.deepStrictEqual(chamadas.splice(0), ['tentarDeNovo']);

  situacao = 'desligada';
  desenharOPareamento();
  assert.strictEqual(doPareamento(), null, 'sem Conexão: sem caixa de pareamento');
  situacao = 'ligada';
}

async function ondeACaixaDoPareamentoFica() {
  const boasVindas = documento.createElement('section');
  boasVindas.id = 'boas-vindas';
  const grade = documento.createElement('div');
  grade.className = 'bv-grade';
  boasVindas.append(grade);
  documento.body.append(boasVindas);
  pareamento = 'a_parear';
  desenharOPareamento();
  assert.deepStrictEqual(boasVindas.children.map(no => no.id || no.className), ['painel-pareamento', 'bv-grade'], 'nas Boas-vindas, antes da grade');
  const vaga = documento.createElement('div');
  vaga.id = 'bv4-pareamento';
  boasVindas.append(vaga);
  pareamento = 'nao_confirmada';
  desenharOPareamento();
  assert.strictEqual(vaga.children[0].id, 'painel-pareamento', 'com o passo 4 à vista, na vaga dele');
  boasVindas.hidden = true;
  ouvintesDaPagina[0][1]();
  await new Promise(resolver => setTimeout(resolver, 5));
  assert.strictEqual(conteudo.children[0].id, 'painel-pareamento', 'com as Boas-vindas escondidas, de volta ao conteúdo');
}

async function conferirTudo() {
  await esperar();
  assert.strictEqual(seguidores.length, 2, 'a tela acompanha a saúde e o pareamento da Conexão');
  assert.strictEqual(avisosDoPareamento.length, 1);
  assert.deepStrictEqual(ouvintesDaPagina.map(([tipo]) => tipo), ['hashchange']);
  await oAvisoDaVersao();
  await oReinicioDoAnki();
  aConexaoAtualizadaUmaVezPorVersao();
  aConexaoAntigaNaoOfereceAAcao();
  await oPareamentoComecaPeloBotao();
  await oCodigoDoPareamento();
  await oCodigoVenceuEOPareamentoTermina();
  oPareamentoNaoConfirmadoEASemConexao();
  await ondeACaixaDoPareamentoFica();
  console.log('painel da versão e do pareamento ok');
}

conferirTudo().catch(erro => { console.error(erro); process.exit(1); });
