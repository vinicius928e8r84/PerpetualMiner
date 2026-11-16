'use strict';

const fs = require('fs');
const path = require('path');

const PASTA_DA_VOZ = path.join(__dirname, '..', 'docs', 'design', 'voz');
const CAMINHO_DO_HTML = path.join(PASTA_DA_VOZ, 'catalogo.html');
const AREAS = {
  'popup-e-pagina': 'Popup e página', foto: 'Minerar de uma foto', 'painel-frases': 'Painel · Frases', envio: 'Envio ao Anki',
  'painel-anki': 'Painel · Conexão com o Anki', configuracoes: 'Configurações', 'boas-vindas': 'Boas-vindas (primeira execução)', global: 'Global',
  nivel: 'Boas-vindas e Ajustes de envio: o nível, a prévia do Cartão e o quiz',
};

const lerNotas = nome => JSON.parse(fs.readFileSync(path.join(PASTA_DA_VOZ, nome), 'utf8'));
const NOTAS_POR_AREA = Object.fromEntries(fs.readdirSync(PASTA_DA_VOZ).filter(nome => /^notas-.*\.json$/.test(nome))
  .map(nome => [nome.replace(/^notas-|\.json$/g, ''), lerNotas(nome)]));

let catalogoCarregado;
function carregarCatalogo() {
  if (catalogoCarregado) return catalogoCarregado;
  globalThis.PerpetualMiner = {};
  require('../lib/voz/catalogo.js');
  require('../lib/voz/catalogo-nivel.js');
  catalogoCarregado = globalThis.PerpetualMiner.CATALOGO_DA_VOZ;
  return catalogoCarregado;
}

const MARCA_INICIAL = '// ─── gerado por scripts/gerar-catalogo-da-voz.js a partir de lib/voz/catalogo.js e notas-<área>.json: não edite à mão ───';
const MARCA_FINAL = '// ─── fim do gerado ───';

const escaparParaInnerHtml = texto => texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const desfazerEscape = texto => texto.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const textoDaEntrada = entrada => typeof entrada === 'string' ? entrada
  : Object.entries(entrada).filter(([, modelo]) => modelo !== '').map(([parte, modelo]) => `${parte}: ${modelo}`).join('\n');

function tabelaDoHtml(catalogo, notasPorArea) {
  const areasSemTitulo = Object.keys(notasPorArea).filter(area => !(area in AREAS));
  if (areasSemTitulo.length) throw new Error(`voz-do-catalogo.js: falta o título de notas-${areasSemTitulo[0]}.json em AREAS`);
  const texto = valor => JSON.stringify(escaparParaInnerHtml(valor));
  const dados = Object.keys(AREAS).filter(area => area in notasPorArea).map(area => {
    const linhas = Object.keys(notasPorArea[area]).map(id => {
      if (!(id in catalogo)) throw new Error(`voz-do-catalogo.js: ${id} tem nota em notas-${area}.json e não está no catálogo`);
      return `  [${[id, textoDaEntrada(catalogo[id]), notasPorArea[area][id]].map(texto).join(', ')}],`;
    });
    return ` {s:${JSON.stringify(AREAS[area])}, rows:[\n${linhas.join('\n')}\n ]},`;
  });
  return `${MARCA_INICIAL}\n// [id, proposto (texto do catalogo.js, uma parte por linha), nota (notas-<área>.json)]\nconst CAT = [\n${dados.join('\n')}\n];\n${MARCA_FINAL}`;
}

const DO_GERADO = /\/\/ ─── gerado por scripts\/gerar-catalogo-da-voz\.js[^\n]*\n[\s\S]*?\n\/\/ ─── fim do gerado ───/;

function htmlDoCatalogo(html = fs.readFileSync(CAMINHO_DO_HTML, 'utf8'), catalogo = carregarCatalogo(), notasPorArea = NOTAS_POR_AREA) {
  const tabela = tabelaDoHtml(catalogo, notasPorArea);
  if (!DO_GERADO.test(html)) throw new Error('catalogo.html: não achei a tabela `const CAT` para trocar');
  return html.replace(DO_GERADO, () => tabela);
}

function linhasDoHtml(html) {
  const gerado = DO_GERADO.exec(html)?.[0];
  if (!gerado) throw new Error('catalogo.html: não achei a tabela gerada');
  return gerado.split('\n').filter(linha => linha.startsWith('  [')).map(linha => {
    const [id, texto, nota] = JSON.parse(linha.trim().replace(/,$/, ''));
    return { id, texto: desfazerEscape(texto), nota: desfazerEscape(nota) };
  });
}

module.exports = { CAMINHO_DO_HTML, NOTAS_POR_AREA, carregarCatalogo, htmlDoCatalogo, linhasDoHtml };
