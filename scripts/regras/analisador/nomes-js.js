'use strict';

const CHAMADAS = new Set(['CallExpression', 'NewExpression']);

const nomeDaChave = chave => String(chave.name || chave.value || '(metodo)');

function textoDoAlvo(alvo) {
  if (alvo.type === 'Identifier') return alvo.name;
  if (alvo.type !== 'MemberExpression' || alvo.computed) return null;
  const dono = textoDoAlvo(alvo.object);
  return dono ? `${dono}.${alvo.property.name}` : alvo.property.name;
}

const valorDaChave = (no, pai) => (pai.value === no ? nomeDaChave(pai.key) : null);

function nomeDaPropriedadeAtribuida(no, pai) {
  if (pai.right !== no || no.type !== 'FunctionExpression') return null;
  const alvo = pai.left;
  return alvo.type === 'MemberExpression' && alvo.property.name ? alvo.property.name : null;
}

const variavel = (no, pai) => (pai.init === no && pai.id.type === 'Identifier' ? pai.id.name : null);
const metodo = (no, pai) => nomeDaChave(pai.key);

const NOME_DENTRO_DE_FUNCAO = {
  VariableDeclarator: variavel,
  MethodDefinition: metodo,
  Property: (no, pai) => (pai.method ? valorDaChave(no, pai) : null),
  AssignmentExpression: nomeDaPropriedadeAtribuida,
};

const NOME_FORA_DE_FUNCAO = {
  VariableDeclarator: variavel,
  MethodDefinition: metodo,
  Property: valorDaChave,
  PropertyDefinition: valorDaChave,
  AssignmentExpression: (no, pai) => (pai.right === no ? textoDoAlvo(pai.left) : null),
  ExportDefaultDeclaration: () => 'default',
};

function nomePelaPosicao(tabela, no, pai) {
  const pelaPosicao = pai && tabela[pai.type];
  return pelaPosicao ? pelaPosicao(no, pai) : null;
}

function nomeDoChamado(chamado) {
  if (chamado.type === 'Identifier') return chamado.name;
  if (chamado.type !== 'MemberExpression' || chamado.computed) return '(chamada)';
  return chamado.property.name;
}

function tituloDe(argumento) {
  if (!argumento || argumento.type !== 'Literal') return '…';
  return typeof argumento.value === 'string' ? `'${argumento.value}'` : '…';
}

function ehArgumentoDeChamada(no, pai) {
  if (!pai || !CHAMADAS.has(pai.type)) return false;
  return pai.callee !== no;
}

function nomeDoAnonimo(no, pai) {
  if (!ehArgumentoDeChamada(no, pai)) return `(anônima, linha ${no.loc.start.line})`;
  return `${nomeDoChamado(pai.callee)}(${tituloDe(pai.arguments[0])})`;
}

function nomeDentroDeFuncao(no, pai) {
  if (no.type === 'FunctionDeclaration' && no.id) return { nome: no.id.name, anonima: false };
  return { nome: nomePelaPosicao(NOME_DENTRO_DE_FUNCAO, no, pai), anonima: false };
}

function nomeForaDeFuncao(no, pai) {
  const proprio = no.id ? no.id.name : nomePelaPosicao(NOME_FORA_DE_FUNCAO, no, pai);
  return proprio ? { nome: proprio, anonima: false } : { nome: nomeDoAnonimo(no, pai), anonima: true };
}

const nomeDaUnidade = (no, pai, foraDeFuncaoComNome) => (foraDeFuncaoComNome ? nomeForaDeFuncao : nomeDentroDeFuncao)(no, pai);

module.exports = { nomeDaUnidade };
