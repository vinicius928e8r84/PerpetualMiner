'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PAGINA = path.join(RAIZ, 'painel', 'painel.html');
const PASTA_DO_RETRATO = path.join(__dirname, 'retrato-do-painel');
const BYTES_POR_ARQUIVO = 9000;
const SEM_FILHOS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const TEXTO_CRU = new Set(['script', 'style']);
const MARCACAO = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-z][\w-]*)\s*>|<([a-z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi;
const ATRIBUTO = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const valorDoAtributo = (nome, valor) => {
  if (valor === undefined) return nome;
  return nome === 'class' ? `class="${valor.split(/\s+/).filter(Boolean).sort().join(' ')}"` : `${nome}="${valor}"`;
};

function atributosDe(texto) {
  const achados = [...texto.matchAll(ATRIBUTO)].map(([, nome, aspas, apostrofos, solto]) => valorDoAtributo(nome, aspas ?? apostrofos ?? solto));
  return achados.sort();
}

function textoDaTag(nome, texto) {
  const atributos = atributosDe(texto);
  return atributos.length ? `<${nome} ${atributos.join(' ')}>` : `<${nome}>`;
}

const ultimo = lista => lista[lista.length - 1];

function leitorDaArvore() {
  const linhas = [];
  const abertas = [];
  const escrever = texto => linhas.push({ texto: `${' '.repeat(abertas.length)}${texto}` });
  const escreverTexto = bruto => {
    const texto = bruto.replace(/\s+/g, ' ').trim();
    if (texto) escrever(JSON.stringify(texto));
  };
  const fechar = nome => {
    if (TEXTO_CRU.has(ultimo(abertas)) && ultimo(abertas) !== nome) return;
    assert.strictEqual(abertas.pop(), nome.toLowerCase(), `</${nome}> fecha o que não está aberto`);
  };
  const abrir = (nome, atributos) => {
    escrever(textoDaTag(nome, atributos.replace(/\/\s*$/, '')));
    if (!SEM_FILHOS.has(nome)) abertas.push(nome);
  };
  const dentroDeScriptOuStyle = () => TEXTO_CRU.has(ultimo(abertas));
  return { linhas, abertas, escreverTexto, fechar, abrir, dentroDeScriptOuStyle };
}

function lerUmaMarcacao(leitor, html, [achado, fechada, aberta, atributos = ''], fim) {
  const inicio = html.indexOf(achado, fim);
  if (!leitor.dentroDeScriptOuStyle()) leitor.escreverTexto(html.slice(fim, inicio));
  if (fechada) leitor.fechar(fechada);
  else if (aberta) leitor.abrir(aberta.toLowerCase(), atributos);
  return inicio + achado.length;
}

function arvoreDe(html) {
  const leitor = leitorDaArvore();
  let fim = 0;
  for (const marcacao of html.matchAll(MARCACAO)) fim = lerUmaMarcacao(leitor, html, marcacao, fim);
  assert.deepStrictEqual(leitor.abertas, [], 'o HTML tem tag que não fecha');
  return leitor.linhas;
}

const comecaUmBloco = linha => /^ {1,5}</.test(linha.texto);

function pedacosDe(linhas) {
  const pedacos = [[]];
  let tamanho = 0;
  for (const linha of linhas) {
    const bytes = Buffer.byteLength(linha.texto) + 1;
    if (comecaUmBloco(linha) && tamanho + bytes > BYTES_POR_ARQUIVO) {
      pedacos.push([]);
      tamanho = 0;
    }
    ultimo(pedacos).push(linha.texto);
    tamanho += bytes;
  }
  return pedacos.map(pedaco => `${pedaco.join('\n')}\n`);
}

const nomeDoPedaco = indice => `${String(indice + 1).padStart(2, '0')}.txt`;

function retratoDaPagina() {
  return pedacosDe(arvoreDe(fs.readFileSync(PAGINA, 'utf8')));
}

function gravar(pedacos) {
  fs.mkdirSync(PASTA_DO_RETRATO, { recursive: true });
  for (const nome of fs.readdirSync(PASTA_DO_RETRATO)) fs.rmSync(path.join(PASTA_DO_RETRATO, nome));
  pedacos.forEach((pedaco, indice) => fs.writeFileSync(path.join(PASTA_DO_RETRATO, nomeDoPedaco(indice)), pedaco));
}

function gravados() {
  if (!fs.existsSync(PASTA_DO_RETRATO)) return [];
  return fs.readdirSync(PASTA_DO_RETRATO).sort().map(nome => fs.readFileSync(path.join(PASTA_DO_RETRATO, nome), 'utf8'));
}

function primeiraDiferenca(visto, gravado) {
  const a = visto.split('\n');
  const b = gravado.split('\n');
  const linha = a.findIndex((texto, indice) => texto !== b[indice]);
  return `linha ${linha + 1}: a página tem ${JSON.stringify(a[linha])}, o retrato tem ${JSON.stringify(b[linha])}`;
}

const pedacos = retratoDaPagina();

if (process.argv.includes('--gravar')) {
  gravar(pedacos);
  console.log(`retrato do painel gravado: ${pedacos.length} arquivo(s) em testes/retrato-do-painel/`);
  process.exit(0);
}

const retrato = gravados();
assert.strictEqual(retrato.length, pedacos.length,
  `o retrato tem ${retrato.length} arquivo(s) e a página pede ${pedacos.length}. Mudou a página de propósito? Rode: node testes/test_retrato_do_painel.js --gravar e confira o diff`);
pedacos.forEach((pedaco, indice) => assert.strictEqual(pedaco, retrato[indice],
  `testes/retrato-do-painel/${nomeDoPedaco(indice)} não bate com painel/painel.html (${primeiraDiferenca(pedaco, retrato[indice])}). Mudou a página de propósito? Rode: node testes/test_retrato_do_painel.js --gravar e confira o diff`));

const montada = arvoreDe('<div id="a" class="y x" hidden><input type=text><p>oi  <b>tu</b></p><script>if (1 < 2) {}</script></div>').map(linha => linha.texto);
assert.deepStrictEqual(montada, [
  '<div class="x y" hidden id="a">', ' <input type="text">', ' <p>', '  "oi"', '  <b>', '   "tu"', ' <script>',
], 'a leitura do HTML: classes e atributos em ordem, texto sem o recuo, void sem filho e script sem o código');
assert.throws(() => arvoreDe('<div><p></div>'), /fecha o que não está aberto/);
assert.throws(() => arvoreDe('<div>'), /não fecha/);

console.log(`ok: o retrato da árvore do painel (${pedacos.length} arquivo(s)) bate com painel/painel.html`);
