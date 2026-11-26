'use strict';

const semComentarioNovo = require('./sem-comentario-novo');
const { linhaDe } = require('./comum');
const { trechosDeDocstring } = require('./apoio-docstrings');

const id = 'sem-comentario';

const guarda = 'a catraca dos comentários de prosa, docstrings de Python e protótipos HTML de docs/design: cada arquivo tem um teto em linha-de-base-sem-comentario.json que só desce, e o arquivo que chega a zero não pode ter comentário de novo';
const ARQUIVO_DA_LINHA_DE_BASE = 'scripts/regras/linha-de-base-sem-comentario.json';

const conserto = 'Não volte a pôr comentário: o arquivo só pode ter os comentários de prosa que a linha de base ainda registra para ele, '
  + 'e um arquivo que chegou a zero saiu da lista e não tem mais nenhum. O que o comentário explicava vai para o nome; '
  + 'uma decisão não óbvia vai para um ADR em docs/adr/; um atalho que o comentário desculpava vira issue (skill /delete-comment). '
  + 'Passa o mesmo que passa em sem-comentario-novo (shebang, diretivas de ferramenta, licença, marcas que outra regra lê). '
  + 'A linha de base de quem apagou comentários desce no merge (`node scripts/regras/baixar-no-merge.js`); a PR não a edita.';

const porQueOArquivoNovoNaoEntra = 'um arquivo que não tinha comentário (ou que chegou a zero) não volta a ter; apague o comentário.';

const PROTOTIPO = /^docs\/design\/.*\.html$/;

const seAplica = arquivo => semComentarioNovo.seAplica(arquivo) || PROTOTIPO.test(arquivo);

function linhasDaDocstring(fonte, [de, ate]) {
  const primeira = linhaDe(fonte, de);
  const textos = fonte.slice(de, ate).split('\n');
  return textos.map((texto, i) => {
    let corpo = texto.trim();
    if (i === 0) corpo = corpo.replace(/^[rRbBuU]{0,2}(?:"""|'''|"|')/, '');
    if (i === textos.length - 1) corpo = corpo.replace(/(?:"""|'''|"|')$/, '');
    return { linha: primeira + i, corpo: corpo.trim() };
  }).filter(l => l.corpo);
}

function linhasDeDocstring(arquivo, fonte) {
  return trechosDeDocstring(arquivo, fonte).flatMap(trecho => linhasDaDocstring(fonte, trecho));
}

function linhasDeComentario(arquivo, fonte) {
  const excecaoDeOutra = semComentarioNovo.excecaoDeOutraRegra(arquivo, id);
  return semComentarioNovo.gruposDeComentario(arquivo, fonte)
    .filter(grupo => !semComentarioNovo.passa(arquivo, grupo, excecaoDeOutra))
    .flatMap(grupo => grupo.linhas.filter(l => l.corpo && !semComentarioNovo.passa(arquivo, { ...grupo, linhas: [l] }, excecaoDeOutra)));
}

function verificar(arquivo, fonte) {
  return [...linhasDeComentario(arquivo, fonte), ...linhasDeDocstring(arquivo, fonte)]
    .sort((a, b) => a.linha - b.linha)
    .map(({ linha, corpo }) => ({ linha, detalhe: `comentário: “${semComentarioNovo.resumo(corpo)}”` }));
}

function mensagem({ arquivo, tem, pode, achados }) {
  const teto = pode > 0 ? `a linha de base deixa no máximo ${pode}` : 'ele não está na linha de base, então não pode ter nenhum';
  const mostrados = (achados || []).slice(0, 12).map(a => `    ${arquivo}:${a.linha}: ${a.detalhe}`);
  return [`✗ ${id} — ${arquivo}: ${tem} linha(s) de comentário; ${teto}.`, ...mostrados, `  Conserto: ${conserto}`].join('\n');
}

module.exports = { id, guarda, conserto, arquivoDaLinhaDeBase: ARQUIVO_DA_LINHA_DE_BASE, seAplica, verificar, linhasDeComentario, linhasDeDocstring, mensagem, folgaPresaAoArquivo: true, porQueOArquivoNovoNaoEntra };
