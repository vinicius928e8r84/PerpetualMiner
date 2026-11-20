'use strict';

const LACOS = ['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement'];
const FUNCOES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const ANINHADORES = new Set(['IfStatement', 'SwitchStatement', ...LACOS]);
const DESVIOS = new Set(['IfStatement', 'ConditionalExpression', 'CatchClause', 'LogicalExpression', ...LACOS]);
const COM_CONDICAO = new Set(['IfStatement', 'WhileStatement', 'DoWhileStatement', 'ForStatement', 'ConditionalExpression']);
const ENCADEAVEIS = new Set(['MemberExpression', 'CallExpression']);
const MANTEM_O_TOPO = new Set(['Program', 'ExpressionStatement', 'CallExpression', 'UnaryExpression', 'BlockStatement']);
const EMBRULHOS_DE_IIFE = new Set(['ExpressionStatement', 'UnaryExpression']);
const E_OU = new Set(['&&', '||']);
const ATRIBUICOES_LOGICAS = new Set(['||=', '&&=', '??=']);
const FORA_DA_ARVORE = new Set(['loc', 'start', 'end']);

const { nomeDaUnidade } = require('./nomes-js');

const COMO_INSTALAR = 'npm ci --prefix scripts/regras/analisador';

function carregarAcorn() {
  try {
    return require('acorn');
  } catch {
    throw new Error(`a regra saude-do-codigo lê o JavaScript com o acorn, que não está instalado; rode \`${COMO_INSTALAR}\``);
  }
}

const ehNo = valor => Boolean(valor) && typeof valor.type === 'string';

function filhosDe(no) {
  const filhos = [];
  for (const [chave, valor] of Object.entries(no)) {
    if (FORA_DA_ARVORE.has(chave)) continue;
    for (const filho of [].concat(valor)) if (ehNo(filho)) filhos.push({ chave, filho });
  }
  return filhos;
}

function operadoresLogicos(no) {
  if (!ehNo(no) || FUNCOES.has(no.type)) return 0;
  const proprio = no.type === 'LogicalExpression' && E_OU.has(no.operator) ? 1 : 0;
  return filhosDe(no).reduce((soma, { filho }) => soma + operadoresLogicos(filho), proprio);
}

function contaComoDesvio(no) {
  if (DESVIOS.has(no.type)) return true;
  if (no.type === 'SwitchCase') return Boolean(no.test);
  if (no.type === 'AssignmentExpression') return ATRIBUICOES_LOGICAS.has(no.operator);
  return ENCADEAVEIS.has(no.type) && no.optional === true;
}

const ehSetaDeUmaLinha = no => no.type === 'ArrowFunctionExpression'
  && no.body.type !== 'BlockStatement'
  && no.loc.end.line - no.loc.start.line < 2;

function viraUnidade(no, { nome, anonima }, foraDeFuncaoComNome) {
  if (!nome) return false;
  if (!ehSetaDeUmaLinha(no)) return true;
  return foraDeFuncaoComNome && !anonima;
}

function ehChamadaDireta(no, pai) {
  if (!pai || pai.type !== 'CallExpression') return false;
  return pai.callee === no;
}

function ehIifeDoModulo(no, { pai, avo }) {
  if (!ehChamadaDireta(no, pai)) return false;
  return Boolean(avo) && EMBRULHOS_DE_IIFE.has(avo.type);
}

function ehSenaoSe(no, pai) {
  if (no.type !== 'IfStatement' || !pai) return false;
  return pai.type === 'IfStatement' && pai.alternate === no;
}

function novaUnidade(nome, no, anonima) {
  return {
    nome, anonima, linha: no.loc.start.line, total: no.loc.end.line - no.loc.start.line + 1,
    argumentos: no.params.length, cc: 1, aninhamento: 0, blocos: 0, condicoes: [], aninhadas: 0,
  };
}

function marcarBloco(unidade, bloco) {
  if (!bloco || bloco.marcado) return;
  bloco.marcado = true;
  unidade.blocos++;
}

function aninhar(unidade, senaoSe, { prof, bloco }) {
  const dentro = senaoSe ? prof : prof + 1;
  unidade.aninhamento = Math.max(unidade.aninhamento, dentro);
  const novoBloco = dentro === 1 && !senaoSe ? { marcado: false } : bloco;
  if (dentro >= 2) marcarBloco(unidade, novoBloco);
  return { prof: dentro, bloco: novoBloco };
}

function medirNo(no, posicao) {
  const { unidade } = posicao;
  if (contaComoDesvio(no)) unidade.cc++;
  if (COM_CONDICAO.has(no.type)) {
    const operadores = operadoresLogicos(no.test);
    if (operadores >= 2) unidade.condicoes.push(operadores);
  }
  if (!ANINHADORES.has(no.type)) return { prof: posicao.prof, bloco: posicao.bloco };
  return aninhar(unidade, ehSenaoSe(no, posicao.pai), posicao);
}

class Medicao {
  constructor() {
    this.unidades = [];
    this.global = { nome: '(topo do arquivo)', linha: 1, cc: 1, aninhamento: 0, blocos: 0, condicoes: [], aninhadas: 0, anonima: true };
  }

  visitar(no, posicao) {
    if (FUNCOES.has(no.type)) {
      this.visitarFuncao(no, posicao);
      return;
    }
    const medida = medirNo(no, posicao);
    const topo = posicao.topo && MANTEM_O_TOPO.has(no.type);
    const profDaCondicao = ANINHADORES.has(no.type) ? posicao.prof : medida.prof;
    for (const { chave, filho } of filhosDe(no)) {
      const prof = chave === 'test' ? profDaCondicao : medida.prof;
      this.visitar(filho, { ...posicao, pai: no, avo: posicao.pai, prof, bloco: medida.bloco, topo });
    }
  }

  visitarDentroDaFuncao(no, posicao) {
    const abaixo = { ...posicao, pai: no, avo: posicao.pai, topo: false };
    for (const parametro of no.params) this.visitar(parametro, abaixo);
    this.visitar(no.body, abaixo);
  }

  visitarFuncao(no, posicao) {
    if (posicao.topo && ehIifeDoModulo(no, posicao)) {
      for (const { filho } of filhosDe(no.body)) this.visitar(filho, { ...posicao, pai: no.body, avo: no });
      return;
    }
    const { nome, anonima } = nomeDaUnidade(no, posicao.pai, posicao.unidade.anonima);
    if (!viraUnidade(no, { nome, anonima }, posicao.unidade.anonima)) {
      this.visitarDentroDaFuncao(no, posicao);
      return;
    }
    const unidade = novaUnidade(nome, no, anonima);
    this.unidades.push(unidade);
    if (posicao.unidade !== this.global) posicao.unidade.aninhadas += unidade.total;
    this.visitarDentroDaFuncao(no, { unidade, prof: 0, bloco: null, topo: false });
  }
}

function lerArvore(fonte) {
  const acorn = carregarAcorn();
  const opcoes = { ecmaVersion: 'latest', locations: true, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true };
  try {
    return acorn.parse(fonte, { ...opcoes, sourceType: 'module' });
  } catch {
    return acorn.parse(fonte, { ...opcoes, sourceType: 'script' });
  }
}

function medirJs(fonte) {
  let arvore;
  try {
    arvore = lerArvore(fonte);
  } catch (erro) {
    if (erro instanceof SyntaxError) return { erro: erro.message };
    throw erro;
  }
  const medicao = new Medicao();
  medicao.visitar(arvore, { pai: null, avo: null, unidade: medicao.global, prof: 0, bloco: null, topo: true });
  const unidades = medicao.unidades.map(({ total, aninhadas, anonima, ...medidas }) => ({ ...medidas, linhas: total - aninhadas }));
  const { nome, linha, cc, aninhamento, blocos, condicoes } = medicao.global;
  return { unidades, topo: { nome, linha, cc, aninhamento, blocos, condicoes } };
}

module.exports = { medirJs, COMO_INSTALAR };
