'use strict';

const assert = require('assert');

const regras = Object.fromEntries(require('./verificar').REGRAS.map(regra => [regra.id, regra]));

let total = 0;
function acusa(id, arquivo, fonte, esperados, porque) {
  const achados = regras[id].verificar(arquivo, fonte);
  assert.deepStrictEqual(achados.map(achado => achado.linha), esperados, `${id} em ${arquivo}: ${porque}\n${JSON.stringify(achados, null, 2)}`);
  total++;
  return achados;
}

acusa('html-cru', 'content.js', [
  '    aviso.innerHTML = `',
  '        <div style="font-weight:500;line-height:1.4;color:#fff;">',
  '            ${texto}',
  '        </div>',
  '    `;',
  "        const style = document.createElement('style');",
  '        style.innerHTML = `@keyframes slideIn {}`;',
].join('\n'), [1, 7], 'a legenda e a seleção entravam como HTML no aviso (08b73f3b^, #21)');
acusa('html-cru', 'painel.js', "lista.innerHTML += `<li>${frase.texto}</li>`;\ncartao.outerHTML = html;\n", [1, 2], 'o += e o outerHTML');
acusa('html-cru', 'popup.js', "caixa.insertAdjacentHTML('beforeend', html);\ndocument.write(html);\nconst nos = faixa.createContextualFragment(html);\n", [1, 2, 3],
  'as outras portas por onde texto vira HTML');
assert.match(acusa('html-cru', 'lib/mineracao.js', 'no.innerHTML = texto;\n', [1], 'lib/ também é da extensão')[0].detalhe, /innerHTML/);
acusa('html-cru', 'exemplo.js', [
  'no.textContent = texto;',
  "if (no.innerHTML === '') return;",
  'const vazio = no.innerHTML == null;',
  '// no.innerHTML = texto;',
  'Veio.escreverFrase(no, frase.texto, frase.palavra);',
].join('\n'), [], 'ler ou comparar o innerHTML, o comentário e o texto como texto passam');
assert.strictEqual(regras['html-cru'].seAplica('e2e/vitrine/vitrine.js'), false, 'a vitrine do e2e não é a extensão');
assert.strictEqual(regras['html-cru'].seAplica('testes/test_voz.js'), false);
assert.strictEqual(regras['html-cru'].seAplica('veio/componentes.js'), true);
total += 3;

acusa('dialogo-nativo', 'painel.js', [
  "  if (!confirm(`Deseja deletar as ${n} frase${n > 1 ? 's' : ''} selecionadas?\\nEsta ação não pode ser desfeita.`)) return;",
  "  if (!confirm('Apagar TODAS as frases?\\nEsta ação não pode ser desfeita.')) return;",
  '      if (confirm(`Apagar do Perpetual Miner as ${idsExistentes.length} frases enviadas ao Anki?`)) {',
].join('\n'), [1, 2, 3], 'as três confirmações do painel antigo (50f768c4^)');
acusa('dialogo-nativo', 'popup.js', "alert('Erro ao salvar');\nconst nome = window.prompt('Nome');\nif (globalThis.confirm('Sair?')) sair();\n", [1, 2, 3],
  'alert, prompt e a chamada pelo window');
acusa('dialogo-nativo', 'painel-perigo.js', [
  "Veio.abrirConfirmacao({ titulo, confirmar: 'Apagar', aoConfirmar });",
  'function confirmar() {}',
  'aoConfirmar();',
  'modal.confirm(texto);',
  'const { confirm: confirmacao } = opcoes;',
  '// nunca o confirm() do navegador',
].join('\n'), [], 'o componente da Veio, o nome parecido, o método de outro objeto e o comentário passam');
assert.strictEqual(regras['dialogo-nativo'].seAplica('e2e/tests/popup.spec.js'), false, 'o e2e não é a extensão');
total += 1;

console.log(`test_dom_da_extensao: ${total} provas ok`);
