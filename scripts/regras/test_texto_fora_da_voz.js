'use strict';

const assert = require('assert');
const path = require('path');

const { REGRAS } = require('./verificar');

const regras = Object.fromEntries(REGRAS.map(regra => [regra.id, regra]));
const RAIZ = path.resolve(__dirname, '..', '..');

let total = 0;
function textoForaDaVoz(arquivo, fonte, quantas, porque) {
  const achados = regras['texto-fora-da-voz'].verificar(arquivo, fonte, RAIZ);
  assert.strictEqual(achados.length, quantas, `texto-fora-da-voz em ${arquivo}: ${porque}\n${JSON.stringify(achados, null, 2)}`);
  total++;
}

textoForaDaVoz('painel/painel.js', "botao.textContent = 'Salvar';\ncampo.innerText = \"Olá\";\nlinha.title = 'Fechar';\n", 3, 'literal em textContent, innerText e title');
textoForaDaVoz('popup/popup.js', 'campo.placeholder = `Buscar ${n} frases`;\nbotao.ariaLabel = \'Fechar\';\n', 2, 'template e ariaLabel');
textoForaDaVoz('popup/popup.js', "no.setAttribute('aria-label', 'Fechar');\nno.setAttribute(\"title\", \"Fechar\");\nno.setAttribute('placeholder', `Buscar`);\n", 3,
  'setAttribute com aria-label, title e placeholder');
textoForaDaVoz('overlay/overlay.js', "pilula.textContent = 'Привет';\nrotulo.textContent += 'Mais';\n", 2, 'letra de outro alfabeto e o +=');
textoForaDaVoz('painel/painel-novo.js', "x.textContent = 'Detalhes da frase';\ny.textContent = 'palavra: x';\n", 2, 'só o literal inteiro dos componentes passa');
textoForaDaVoz('painel/painel.js', [
  "titulo.textContent = textoDaVoz('PAI-04.acao');",
  "card.uso.textContent = `· ${textoDaVoz('BRG-41.uso', { gasto: 1 })}`;",
  "document.title = `${textoDaVoz('FOT-01.titulo')} · PerpetualMiner`;",
  "botao.setAttribute('aria-label', textoDaVoz('PAI-34'));",
  "campo.placeholder = textoDaVoz('PAI-04.busca');",
].join('\n'), 0, 'o texto que vem do textoDaVoz');
textoForaDaVoz('veio/componentes.js', "a.textContent = 'palavra:';\nb.textContent = \"auto:\";\nc.textContent = 'Detalhes';\n", 0, 'os três literais que os componentes base escrevem');
textoForaDaVoz('painel/painel.js', "x.textContent = '';\ny.textContent = '?';\nz.title = '· ' + total;\nif (no.title === 'Salvar') return;\n", 0,
  'vazio, símbolo, comparação e o que não começa com letra');
textoForaDaVoz('painel/painel.js', "// x.textContent = 'Salvar';\n/* y.title = 'Fechar'; */\n", 0, 'um comentário não conta');
for (const arquivo of ['popup/popup.js', 'painel/painel.js', 'bookreader/bookreader.js', 'overlay/overlay.js', 'content.js', 'lib/idioma.js', 'veio/componentes.js']) {
  assert.strictEqual(regras['texto-fora-da-voz'].seAplica(arquivo), true, `${arquivo} está no escopo`);
}
for (const arquivo of ['e2e/tests/popup.spec.js', 'testes/test_texto_da_voz.js', 'background.js', 'abridor/abridor.js', 'popup/popup.css', 'scripts/testar.mjs']) {
  assert.strictEqual(regras['texto-fora-da-voz'].seAplica(arquivo), false, `${arquivo} está fora do escopo`);
}
total += 13;

console.log(`texto-fora-da-voz: ${total} provas passaram`);
