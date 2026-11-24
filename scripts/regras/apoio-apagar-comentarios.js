'use strict';

const fs = require('fs');
const path = require('path');

const semComentario = require('./sem-comentario');
const semComentarioNovo = require('./sem-comentario-novo');
const { arquivosDoRepositorio, linhaDe, trechosDeComentario } = require('./comum');
const { trechosDeDocstring } = require('./apoio-docstrings');
const { semOsComentarios, confereOArquivo } = require('../ci/so-tira-comentario');

const MARCA_DE_LINHA = /^(#+|\/\/+)\s*([^]*)$/;
const FIM_DA_DIRETIVA = /\s{2,}|\s[-—–(]\s?|\s*\(/;

function diretivaNoComeco(arquivo, texto) {
  const marca = MARCA_DE_LINHA.exec(texto);
  if (!marca || texto.includes('\n')) return null;
  const cabeca = marca[2].split(FIM_DA_DIRETIVA)[0].trim();
  return cabeca !== marca[2].trim() && semComentarioNovo.ehDiretiva(arquivo, cabeca) ? `${marca[1]} ${cabeca}` : null;
}

const MARCA_DE_TESTE = /^(\s*)\/\/\s*Exceção de teste(?::\s*(chrome-nativo|catálogo|componente-base|sem-estado-guardado)\b|\s*\(([^)]*)\))/;
const LINHA_DE_COMENTARIO = /^(\s*)\/\/(?!\/)/;
const JSDOC_DO_FAKE = /\/\*\*[^\S\n]*\n[^]*?\*\//g;

function nomeDaExcecao(marca) {
  if (marca[2]) return marca[2];
  return /chrome/i.test(marca[3]) ? 'chrome-nativo' : null;
}

function continuaOBloco(linha, indentacao) {
  const comentario = LINHA_DE_COMENTARIO.exec(linha || '');
  return Boolean(comentario) && comentario[1] === indentacao;
}

function reduzirAMarca(linhas, de, indentacao, nome) {
  let ate = de + 1;
  while (continuaOBloco(linhas[ate], indentacao)) ate++;
  if (ate === de + 1) return linhas;
  const texto = nome === 'sem-estado-guardado' ? `${indentacao}// Exceção de teste: ${nome}` : `${indentacao}// Exceção de teste: ${nome} (docs/testes.md).`;
  return [...linhas.slice(0, de), texto, ...linhas.slice(ate)];
}

function reduzirMarcasDeTeste(arquivo, fonte) {
  if (!/^e2e\/tests\/.+\.spec\.js$/.test(arquivo)) return fonte;
  let linhas = fonte.split('\n');
  for (let i = 0; i < linhas.length; i++) {
    const marca = MARCA_DE_TESTE.exec(linhas[i]);
    const nome = marca && nomeDaExcecao(marca);
    if (nome) linhas = reduzirAMarca(linhas, i, marca[1], nome);
  }
  return linhas.join('\n');
}

function reduzirMarcasDeFake(arquivo, fonte) {
  if (!/^e2e\/fakes\/.+\.js$/.test(arquivo)) return fonte;
  return fonte.replace(JSDOC_DO_FAKE, bloco => (/^\/\*\*[^\n]*\n\s*\*?\s*@estado-guardado\b/.test(bloco) ? '/** @estado-guardado */' : bloco));
}

const MARCA_SEM_TEXTO = /^(?:\/\/+|#+)\s*$/;

function semLinhasDeMarcaVazia(arquivo, fonte) {
  const vazias = trechosDeComentario(arquivo, fonte).filter(([de, ate]) => MARCA_SEM_TEXTO.test(fonte.slice(de, ate)));
  return vazias.reverse().reduce((texto, [de, ate]) => {
    const inicio = texto.lastIndexOf('\n', de - 1) + 1;
    const fim = texto.indexOf('\n', ate);
    const sozinha = texto.slice(inicio, de).trim() === '' && texto.slice(ate, fim < 0 ? texto.length : fim).trim() === '';
    return sozinha ? texto.slice(0, inicio) + texto.slice(fim < 0 ? texto.length : fim + 1) : texto;
  }, fonte);
}

function encurtarDiretivas(arquivo, fonte) {
  const trocas = trechosDeComentario(arquivo, fonte)
    .map(([de, ate]) => ({ de, ate, novo: diretivaNoComeco(arquivo, fonte.slice(de, ate)) }))
    .filter(troca => troca.novo);
  return trocas.reverse().reduce((texto, { de, ate, novo }) => texto.slice(0, de) + novo + texto.slice(ate), fonte);
}

function trechosComProsa(arquivo, fonte) {
  const contadas = new Set(semComentario.linhasDeComentario(arquivo, fonte).map(l => l.linha));
  return trechosDeComentario(arquivo, fonte).filter(([de, ate]) => {
    for (let linha = linhaDe(fonte, de); linha <= linhaDe(fonte, ate); linha++) if (contadas.has(linha)) return true;
    return false;
  });
}

const usaADocstring = fonte => /__doc__/.test(fonte);

function trocarPorPass(fonte, trechos) {
  return [...trechos].sort((a, b) => b[0] - a[0]).reduce((texto, [de, ate]) => `${texto.slice(0, de)}pass${texto.slice(ate)}`, fonte);
}

function semAProsa(arquivo, fonte) {
  const comMarcasCurtas = reduzirMarcasDeFake(arquivo, reduzirMarcasDeTeste(arquivo, fonte));
  const comDiretivasCurtas = encurtarDiretivas(arquivo, comMarcasCurtas);
  const docstrings = usaADocstring(comDiretivasCurtas) ? [] : trechosDeDocstring(arquivo, comDiretivasCurtas);
  const sozinhas = docstrings.filter(([, , sozinha]) => sozinha);
  const comPass = trocarPorPass(comDiretivasCurtas, sozinhas);
  const restantes = usaADocstring(comPass) ? [] : trechosDeDocstring(arquivo, comPass).map(([de, ate]) => [de, ate]);
  const prosa = trechosComProsa(arquivo, comPass);
  return semBrancoSobrando(arquivo, fonte, semLinhasDeMarcaVazia(arquivo, semOsComentarios(comPass, [...prosa, ...restantes])));
}

const DOIS_BRANCOS = /\n{3,}/g;

function semBrancoSobrando(arquivo, antes, depois) {
  if (antes.includes('\n\n\n')) return depois;
  const menos = depois.replace(DOIS_BRANCOS, '\n\n');
  return confereOArquivo(arquivo, antes, menos) ? depois : menos;
}

function apagar(raiz, filtro) {
  const relatorio = [];
  for (const arquivo of arquivosDoRepositorio(raiz).filter(semComentario.seAplica).filter(a => filtro.test(a))) {
    const fonte = fs.readFileSync(path.join(raiz, arquivo), 'utf8').replace(/\r\n/g, '\n');
    const depois = semAProsa(arquivo, fonte);
    if (depois === fonte) continue;
    const falta = confereOArquivo(arquivo, fonte, depois);
    if (falta) relatorio.push({ arquivo, falta });
    else fs.writeFileSync(path.join(raiz, arquivo), depois);
  }
  return relatorio;
}

if (require.main === module) {
  const falhas = apagar(process.cwd(), new RegExp(process.argv[2] || '(?!)'));
  for (const { arquivo, falta } of falhas) console.log(`não mexi em ${falta}`);
  console.log(`${falhas.length} arquivo(s) ficaram como estavam; os outros perderam a prosa dos comentários e das docstrings`);
}

module.exports = { semAProsa, apagar };
