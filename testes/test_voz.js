'use strict';

const assert = require('assert');
const fs = require('fs');

const path = require('path');
const { CAMINHO_DO_HTML, NOTAS_POR_AREA, carregarCatalogo, htmlDoCatalogo, linhasDoHtml } = require('../scripts/voz-do-catalogo.js');
const { CAMINHO_DO_RETRATO, problemasDaVoz, retratoDoCatalogo, textosDoCatalogo } = require('../scripts/conferir-voz.js');

const CATALOGO_DA_VOZ = carregarCatalogo();
const retrato = JSON.parse(fs.readFileSync(CAMINHO_DO_RETRATO, 'utf8'));

const decisoes = Object.assign({}, ...Object.values(NOTAS_POR_AREA));
const idsSemEntrada = Object.keys(CATALOGO_DA_VOZ).filter(id => typeof decisoes[id] !== 'object');
assert.deepStrictEqual(idsSemEntrada, [], 'um ID do catálogo não tem entrada em docs/design/voz/notas-<área>.json');
const vazio = campo => Object.keys(CATALOGO_DA_VOZ).filter(id => typeof decisoes[id]?.[campo] !== 'string' || (campo !== 'nota' && decisoes[id][campo] === ''));
assert.deepStrictEqual(vazio('estado'), [], 'um ID do catálogo não tem o estado em docs/design/voz/notas-<área>.json');
assert.deepStrictEqual(vazio('categoria'), [], 'um ID do catálogo não tem a categoria em docs/design/voz/notas-<área>.json');
assert.deepStrictEqual(vazio('hoje'), [], 'um ID do catálogo não tem o “hoje” em docs/design/voz/notas-<área>.json');
assert.deepStrictEqual(vazio('nota'), [], 'um ID do catálogo não tem a nota em docs/design/voz/notas-<área>.json (sem nota é "")');
assert.deepStrictEqual(Object.keys(decisoes).filter(id => ![undefined, 'novo', 'some'].includes(decisoes[id].marca)), [], 'a marca de um ID é novo ou some, ou não existe');
assert.deepStrictEqual(Object.keys(decisoes).filter(id => !(id in CATALOGO_DA_VOZ)), [], 'uma entrada em docs/design/voz/notas-<área>.json é de um ID que não está no catálogo');
assert.strictEqual(Object.values(NOTAS_POR_AREA).reduce((soma, doArea) => soma + Object.keys(doArea).length, 0), Object.keys(decisoes).length, 'um ID tem entrada em duas áreas');

const conferir = catalogo => problemasDaVoz({ catalogo, retrato });

assert(Object.keys(CATALOGO_DA_VOZ).length > 0, 'não li nenhum ID do catálogo');
assert.deepStrictEqual(conferir(CATALOGO_DA_VOZ), [],
  'lib/voz/catalogo.js não bate com o retrato catalogo-textos.json. Mudou um texto de propósito? Rode: node scripts/gerar-catalogo-da-voz.js e confira o diff do retrato');

assert.strictEqual(fs.readFileSync(CAMINHO_DO_HTML, 'utf8'), htmlDoCatalogo(),
  'docs/design/voz/catalogo.html não bate com o catálogo. Rode: node scripts/gerar-catalogo-da-voz.js');

const noHtml = linhasDoHtml(fs.readFileSync(CAMINHO_DO_HTML, 'utf8'));
assert.deepStrictEqual(noHtml.map(l => l.id).sort(), Object.keys(CATALOGO_DA_VOZ).sort(), 'o catalogo.html não tem os mesmos IDs do catálogo');
for (const { id, texto, estado, categoria, hoje, nota, marca } of noHtml) {
  const { estado: doEstado, categoria: daCategoria, hoje: doHoje, nota: daNota, marca: daMarca = '' } = decisoes[id];
  assert.deepStrictEqual({ estado, categoria, hoje, nota, marca }, { estado: doEstado, categoria: daCategoria, hoje: doHoje, nota: daNota, marca: daMarca }, `${id}: o catalogo.html não traz o estado, a categoria, o “hoje”, a nota e a marca de notas-<área>.json`);
  for (const { nome, modelo } of textosDoCatalogo({ [id]: CATALOGO_DA_VOZ[id] })) assert(texto.includes(modelo), `${nome}: o texto do catalogo.html não traz o do catálogo`);
}

const PASTA_DA_VOZ = path.dirname(CAMINHO_DO_HTML);
const mdComTabelaDeTextos = fs.readdirSync(PASTA_DA_VOZ).filter(nome => nome.endsWith('.md')
  && /^\| [A-Z]{3}-\d+ \|/m.test(fs.readFileSync(path.join(PASTA_DA_VOZ, nome), 'utf8')));
assert.deepStrictEqual(mdComTabelaDeTextos, [], 'a tabela de textos não mora em docs/design/voz/*.md: o texto é do catalogo.js e se vê no catalogo.html');

function comMudanca(mudar) {
  const copia = JSON.parse(JSON.stringify(CATALOGO_DA_VOZ));
  mudar(copia);
  return copia;
}
const aponta = (problemas, nome) => problemas.some(p => p.startsWith(`${nome}:`));

const comONomeMinusculo = Object.entries(retratoDoCatalogo(CATALOGO_DA_VOZ)).filter(([, texto]) => /conexão com o Anki/.test(texto)).map(([nome]) => nome);
assert.deepStrictEqual(comONomeMinusculo, [], 'o nome é “Conexão com o Anki”, com C maiúsculo, em todo texto da Voz');

const textoDe = retratoDoCatalogo(CATALOGO_DA_VOZ);
const textoDeTela = (...nomes) => nomes.map(nome => textoDe[nome]).join('\n');
assert.strictEqual(textoDe['PAI-27.remover'], 'Remover o termo');
assert.strictEqual(textoDe['PAI-27.outroGrupo'], 'Adicionar outro termo');
assert.doesNotMatch(textoDeTela('ONB-23.testeSemPalavra', 'ONB-23.motivoSemPalavra'), /Palavra/, 'ONB-23: o que o Cartão ensina é o Termo');
assert.match(textoDeTela('ONB-23.testeSemPalavra'), /o Termo marcado/);
assert.match(textoDeTela('ONB-23.motivoSemPalavra'), /Falta marcar o Termo/);
assert.strictEqual(textoDe['BRG-45.palavra'], 'Termo');
assert.strictEqual(textoDe['BRG-45.audioDaPalavra'], 'Áudio do termo');
assert.strictEqual(textoDe['BRG-21.soPalavras'], 'Só palavras', 'BRG-21: a palavra solta continua palavra');
assert.strictEqual(textoDe['BRG-42.titulo'], 'Nível');
assert.strictEqual(textoDe['ONB-22.usar'], 'Usar este nível');
assert.strictEqual(textoDe['ONB-22.depois'], 'Dá para trocar depois em Ajustes de envio › Nível.');
assert.strictEqual(textoDe['ONB-22.escutaNota'], 'A escuta aparece aqui, mas não muda o nível.');
assert.strictEqual(textoDe['SHL-04.conta'], 'Conta e sincronização');
assert.strictEqual(textoDe['ONB-24.semConta'], 'Entre com a conta Google, em Conta e sincronização, para ver o ranking do grupo.');
assert.doesNotMatch(textoDe['BRG-07.ouvirSemChave'], /card/i, 'BRG-07: o bloco de tela não é card');
assert.strictEqual(textoDe['BRG-07.nivelVazio'], 'Tem um sub-baralho vazio. Exemplo: Inglês::Mineradas');
assert.doesNotMatch(textoDeTela('FOT-01.subtitulo', 'FOT-06.detalhe', 'ONB-11.corpo'), /trechos? marcados?/, 'o texto marcado no livro é Marcação');
assert.match(textoDeTela('FOT-01.subtitulo'), /Marcações/);
assert.match(textoDeTela('FOT-06.detalhe'), /Marcações/);
assert.match(textoDeTela('ONB-11.corpo'), /Marcações/);

assert(aponta(conferir(comMudanca(c => { c['POP-04'] = 'Min'; })), 'POP-04'), 'POP-04 cortado devia ficar vermelho');
assert(aponta(conferir(comMudanca(c => { delete c['FOT-11'].causaChave; })), 'FOT-11.causaChave'), 'parte apagada devia ficar vermelha');
assert(aponta(conferir(comMudanca(c => { c['FOT-11'].causaRede = 'TEXTO DIFERENTE NO CATALOGO'; })), 'FOT-11.causaRede'), 'texto trocado sem regravar o retrato devia ficar vermelho');
assert(aponta(conferir(comMudanca(c => { c['FOT-11'].nova = 'Parte nova'; })), 'FOT-11.nova'), 'parte nova devia ficar vermelha');
assert(aponta(conferir(comMudanca(c => { delete c['POP-04']; })), 'POP-04'), 'ID apagado devia ficar vermelho');
assert(aponta(conferir(comMudanca(c => { c['XXX-01'] = 'Inventado'; })), 'XXX-01'), 'ID inventado devia ficar vermelho');
assert(aponta(conferir(comMudanca(c => { c['POP-04'] = 'Cole ou escrev'; })), 'POP-04'));

console.log(`ok: ${Object.keys(CATALOGO_DA_VOZ).length} IDs, ${Object.keys(retrato).length} textos e partes conferidos com o retrato`);
