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

const usaADocstring = fonte => /__doc__/.test(fonte);

function trocarPorPass(fonte, trechos) {
  return [...trechos].sort((a, b) => b[0] - a[0]).reduce((texto, [de, ate]) => `${texto.slice(0, de)}pass${texto.slice(ate)}`, fonte);
}

function semAProsa(arquivo, fonte) {
  const comDiretivasCurtas = encurtarDiretivas(arquivo, fonte);
  const docstrings = usaADocstring(comDiretivasCurtas) ? [] : trechosDeDocstring(arquivo, comDiretivasCurtas);
  const sozinhas = docstrings.filter(([, , sozinha]) => sozinha);
  const comPass = trocarPorPass(comDiretivasCurtas, sozinhas);
  const restantes = usaADocstring(comPass) ? [] : trechosDeDocstring(arquivo, comPass).map(([de, ate]) => [de, ate]);
  const prosa = trechosComProsa(arquivo, comPass);
  return semOsComentarios(comPass, [...prosa, ...restantes]);
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
