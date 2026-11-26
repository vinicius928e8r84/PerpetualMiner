'use strict';

const { execFileSync } = require('child_process');
const { linhaDe, semComentariosJs } = require('./comum');

const id = 'e2e-prazo-maior';

const guarda = 'um flake de e2e não se conserta com mais tempo: o retries, o timeout e o expect.timeout do playwright.config.js não sobem, e o test.setTimeout, o test.slow() e o { timeout: N } dos testes de e2e/ não aumentam (catraca)';

const conserto = 'Pare o relógio com a fixture `relogioParado` e espere pelo estado na tela (`expect.poll`, locators), não pelo tempo: '
  + 'o `retries`, o `timeout` e o `expect.timeout` de e2e/playwright.config.js e os `test.setTimeout`, `test.slow()` e `{ timeout: N }` dos testes só descem. '
  + 'A PR não edita scripts/regras/linha-de-base.json: o que diminuir é baixado depois do merge, por `node scripts/regras/baixar-no-merge.js`.';

const seAplica = arquivo => /^e2e\/.+\.js$/.test(arquivo);

const ehConfig = arquivo => /(?:^|\/)playwright\.config\.js$/.test(arquivo);

const PADROES_DO_PLAYWRIGHT = { retries: 0, timeout: 30000, 'expect.timeout': 5000 };

const UNIDADES = { retries: '', timeout: ' ms', 'expect.timeout': ' ms' };

const OCORRENCIA = /\b(?:test(?:\s*\.\s*info\s*\(\s*\))?|testInfo)\s*\.\s*(setTimeout|slow)\s*\(|\btimeout:/g;
const NUMEROS = /\d[\d_]*(?:\.\d+)?/g;
const SO_CONTA = /^[\d_.\s*]+$/;
const BLOCO_EXPECT = /\bexpect\s*:\s*\{[^}]*\}/;
const RETRIES = /\bretries\s*:/;
const TIMEOUT = /\btimeout\s*:/;

const ABRE = '([{';
const FECHA = ')]}';
const FIM_DA_EXPRESSAO = ')]},;';

const emBranco = trecho => trecho.replace(/[^\n]/g, ' ');

const numero = texto => Number(texto.replace(/_/g, ''));

const variacaoDeFundo = c => (ABRE.includes(c) ? 1 : -Number(FECHA.includes(c)));

function fimDaExpressao(codigo, inicio) {
  let fundo = 0;
  for (let i = inicio; i < codigo.length; i++) {
    if (fundo === 0 && FIM_DA_EXPRESSAO.includes(codigo[i])) return i;
    fundo += variacaoDeFundo(codigo[i]);
  }
  return codigo.length;
}

function valorDaExpressao(texto) {
  const limpo = texto.trim();
  if (!SO_CONTA.test(limpo)) return Infinity;
  return limpo.split('*').map(numero).reduce((produto, fator) => produto * fator, 1);
}

function valorDoConfig(texto) {
  if (!texto.includes('?')) return valorDaExpressao(texto);
  return Math.max(...(texto.match(NUMEROS) || [Infinity]).map(numero));
}

const expressaoDepois = (codigo, inicio) => codigo.slice(inicio, fimDaExpressao(codigo, inicio));

function fonteDaBase(raiz, base, arquivo) {
  if (!raiz || !base) return null;
  try {
    return execFileSync('git', ['show', `${base}:${arquivo}`], { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

function ocorrencias(codigo) {
  return [...codigo.matchAll(OCORRENCIA)].map(m => ({
    indice: m.index,
    nome: m[1] ? `test.${m[1]}()` : 'timeout:',
    valor: m[1] === 'slow' ? null : valorDaExpressao(expressaoDepois(codigo, m.index + m[0].length)),
  }));
}

const maiorPrimeiro = (a, b) => Number(b.valor > a.valor) - Number(b.valor < a.valor);

const comValor = lista => lista.filter(ocorrencia => ocorrencia.valor !== null).sort(maiorPrimeiro);

const chaveDe = ocorrencia => `${ocorrencia.nome}${ocorrencia.valor}`;

function semOsIguais(agora, antes) {
  const tetos = [...antes];
  const novos = [];
  for (const ocorrencia of agora) {
    const igual = tetos.findIndex(teto => chaveDe(teto) === chaveDe(ocorrencia));
    if (igual >= 0) tetos.splice(igual, 1);
    else novos.push(ocorrencia);
  }
  return { novos, tetos };
}

function prazosQueSubiram(novos, tetos) {
  const tetosComValor = comValor(tetos);
  return comValor(novos).filter((ocorrencia, i) => i < tetosComValor.length && ocorrencia.valor > tetosComValor[i].valor);
}

const legivel = (valor, unidade = ' ms') => (valor === Infinity ? 'um valor calculado' : `${valor}${unidade}`);

const noLugarDe = (ocorrencia, detalhe, codigo) => ({ linha: linhaDe(codigo, ocorrencia.indice), detalhe });

function vagasQueNaoPagamSubida(subiram, tetos, codigo) {
  const sobras = tetos.length - subiram.length;
  if (!subiram.length || sobras <= 0) return [];
  const detalhe = 'um prazo que a base tinha saiu, mas a vaga dele não paga a subida de outro: a subida sempre reprova';
  return Array.from({ length: sobras }, () => noLugarDe(subiram[0], detalhe, codigo));
}

function achadosDoTeste(fonte, daBase) {
  const codigo = semComentariosJs(fonte);
  const agora = ocorrencias(codigo);
  const antes = daBase === null ? [] : ocorrencias(semComentariosJs(daBase));
  const { novos, tetos } = semOsIguais(agora, antes);
  const subiram = prazosQueSubiram(novos, tetos);
  return [
    ...agora.map(ocorrencia => noLugarDe(ocorrencia, `${ocorrencia.nome} é um prazo a mais no teste: mais tempo não conserta um flake`, codigo)),
    ...subiram.map(ocorrencia => noLugarDe(ocorrencia, `${ocorrencia.nome} subiu para ${legivel(ocorrencia.valor)}: o prazo de hoje não pode crescer`, codigo)),
    ...vagasQueNaoPagamSubida(subiram, tetos, codigo),
  ].sort((a, b) => a.linha - b.linha);
}

function lerAjuste(codigo, padrao, deslocamento = 0) {
  const achado = padrao.exec(codigo);
  if (!achado) return null;
  return { indice: achado.index + deslocamento, valor: valorDoConfig(expressaoDepois(codigo, achado.index + achado[0].length)) };
}

function ajustesDoConfig(fonte) {
  const codigo = semComentariosJs(fonte);
  const bloco = BLOCO_EXPECT.exec(codigo);
  const fora = bloco ? codigo.replace(bloco[0], emBranco(bloco[0])) : codigo;
  return {
    codigo,
    retries: lerAjuste(fora, RETRIES),
    timeout: lerAjuste(fora, TIMEOUT),
    'expect.timeout': bloco && lerAjuste(bloco[0], TIMEOUT, bloco.index),
  };
}

function subidaDoAjuste(nome, agora, antes) {
  const novo = agora[nome];
  const teto = antes[nome] ? antes[nome].valor : PADROES_DO_PLAYWRIGHT[nome];
  if (!novo || novo.valor <= teto) return [];
  return [{ linha: linhaDe(agora.codigo, novo.indice), detalhe: `${nome} subiu de ${legivel(teto, UNIDADES[nome])} para ${legivel(novo.valor, UNIDADES[nome])}: o valor de hoje fica, só não sobe` }];
}

function achadosDoConfig(fonte, daBase) {
  if (daBase === null) return [];
  const agora = ajustesDoConfig(fonte);
  const antes = ajustesDoConfig(daBase);
  return Object.keys(PADROES_DO_PLAYWRIGHT).flatMap(nome => subidaDoAjuste(nome, agora, antes));
}

function verificar(arquivo, fonte, raiz, base) {
  const daBase = fonteDaBase(raiz, base, arquivo);
  return ehConfig(arquivo) ? achadosDoConfig(fonte, daBase) : achadosDoTeste(fonte, daBase);
}

module.exports = { id, guarda, conserto, seAplica, verificar };
