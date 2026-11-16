'use strict';

const fs = require('fs');
const path = require('path');

const PASTA_DA_SPEC = path.join(__dirname, '..', 'docs', 'design', 'voz');
const CAMINHO_DA_SPEC = path.join(PASTA_DA_SPEC, 'README.md');
const NOMES_DA_SPEC = ['README.md', 'catalogo-popup-e-pagina.md', 'catalogo-foto.md', 'catalogo-painel-frases.md', 'catalogo-envio.md',
  'catalogo-painel-anki.md', 'catalogo-configuracoes.md', 'catalogo-boas-vindas.md', 'catalogo-global.md', 'catalogo-nivel.md'];
const CAMINHOS_DA_SPEC = NOMES_DA_SPEC.map(nome => path.join(PASTA_DA_SPEC, nome));
const lerASpec = () => CAMINHOS_DA_SPEC.map(caminho => fs.readFileSync(caminho, 'utf8')).join('\n');

function celulasDaLinha(linha) {
  const celulas = [];
  let atual = '';
  for (let i = 1; i < linha.length; i++) {
    if (linha[i] === '\\' && linha[i + 1] === '|') { atual += '|'; i++; continue; }
    if (linha[i] === '|') { celulas.push(atual.trim()); atual = ''; continue; }
    atual += linha[i];
  }
  return celulas;
}

function textoDaCelula(celula) {
  if (celula === '_(sem texto)_') return '';
  return celula.replace(/\*\*/g, '');
}

function linhasDaSpec(spec = lerASpec()) {
  const catalogo = spec.slice(spec.indexOf('## 3. Catálogo de estados-chave'));
  const linhas = [];
  let secao = '';
  for (const linha of catalogo.split('\n')) {
    if (linha.startsWith('### ')) secao = linha.slice(4).trim();
    if (!/^\| [A-Z]{3}-\d{2} \|/.test(linha)) continue;
    const [id, estadoCru, categoria, hoje, copia, nota = ''] = celulasDaLinha(linha);
    const marca = /\*\*\((novo|some)\)\*\*/.exec(estadoCru)?.[1] ?? '';
    const estado = estadoCru.replace(/\s*\*\*\((?:novo|some)\)\*\*/, '');
    linhas.push({ secao, id, estado: textoDaCelula(estado), categoria, hoje: textoDaCelula(hoje), copia: textoDaCelula(copia), nota: textoDaCelula(nota), marca });
  }
  return linhas;
}

const CAMINHO_DO_HTML = path.join(__dirname, '..', 'docs', 'design', 'voz', 'catalogo.html');
const MARCA_INICIAL = '// ─── gerado por scripts/gerar-catalogo-da-voz.js a partir de README.md: não edite à mão ───';
const MARCA_FINAL = '// ─── fim do gerado ───';

const escaparParaInnerHtml = texto => texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function tabelaDoHtml(linhas) {
  const secoes = [];
  for (const linha of linhas) {
    if (secoes.at(-1)?.secao !== linha.secao) secoes.push({ secao: linha.secao, linhas: [] });
    secoes.at(-1).linhas.push(linha);
  }
  const texto = valor => JSON.stringify(escaparParaInnerHtml(valor));
  const dados = secoes.map(({ secao, linhas: doGrupo }) => {
    const linhasDoGrupo = doGrupo.map(l =>
      `  [${[l.id, l.estado, l.categoria, l.hoje, l.copia, l.nota].map(texto).join(', ')}${l.marca ? `, ${JSON.stringify(l.marca)}` : ''}],`);
    return ` {s:${JSON.stringify(secao)}, rows:[\n${linhasDoGrupo.join('\n')}\n ]},`;
  });
  return `${MARCA_INICIAL}\n// [id, estado/gatilho, categoria, hoje, proposto, nota, marca]\nconst CAT = [\n${dados.join('\n')}\n];\n${MARCA_FINAL}`;
}

function htmlDoCatalogo(html = fs.readFileSync(CAMINHO_DO_HTML, 'utf8'), linhas = linhasDaSpec()) {
  const tabela = tabelaDoHtml(linhas);
  const comMarcas = new RegExp(`${escapar(MARCA_INICIAL)}[\\s\\S]*?${escapar(MARCA_FINAL)}`);
  if (comMarcas.test(html)) return html.replace(comMarcas, () => tabela);
  const aMao = /\/\/ \[id, estado\/gatilho[^\n]*\nconst CAT = \[[\s\S]*?\n\];/;
  if (!aMao.test(html)) throw new Error('catalogo.html: não achei a tabela `const CAT` para trocar');
  return html.replace(aMao, () => tabela);
}

const escapar = texto => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { CAMINHO_DA_SPEC, CAMINHOS_DA_SPEC, NOMES_DA_SPEC, CAMINHO_DO_HTML, linhasDaSpec, htmlDoCatalogo };
