'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const raiz = { textoDaVoz: chave => chave, Veio: { elemento: () => ({}) }, ConversaComOAnki: { MOTIVO: {} }, PedidoAoAnki: {}, IDIOMAS: {} };
const contexto = vm.createContext({});
contexto.globalThis = contexto;
contexto.PerpetualMiner = raiz;
vm.runInContext(fs.readFileSync('painel/painel-anki-previa.js', 'utf8'), contexto);
const { documentoDoQuadro } = raiz.PreviaDoCartao;

const SCRIPT_DA_CRIACAO = '<script>\n(function () { var caixa = document.getElementById("perpetualminer-escrita"); caixa.focus(); })();\n</script>';

function testar(nome, prova) {
  prova();
  console.log(`ok - ${nome}`);
}

testar('o documento da prévia não leva <script>, que o sandbox do quadro bloquearia', () => {
  const html = '<div class="palavra">give up</div>\n<textarea id="perpetualminer-escrita" rows="3"></textarea>\n' + SCRIPT_DA_CRIACAO;
  assert(!/<script/i.test(documentoDoQuadro('.card { color: red; }', html)));
});

testar('tira o <script> em qualquer caixa, com atributos, mais de um e sem fechar', () => {
  for (const script of ['<SCRIPT type="text/javascript">alert(1)</SCRIPT>', '<script src="x.js"></script >', '<script>um</script>texto<script>dois</script>', '<script>sem fim']) {
    assert(!/<script/i.test(documentoDoQuadro('', `antes${script}`)), script);
  }
});

testar('o resto do cartão fica igual: o HTML, o CSS, a política e o que vem depois do script', () => {
  const html = '<div class="frase">She <b>gave up</b> smoking</div>';
  const documento = documentoDoQuadro('.frase { color: red; }', `${html}${SCRIPT_DA_CRIACAO}<span id="depois">fim</span>`);
  assert(documento.includes(`<div class="card">${html}<span id="depois">fim</span></div>`));
  assert(documento.includes('.frase { color: red; }'));
  assert(documento.includes("Content-Security-Policy"));
});

testar('um cartão sem script sai exatamente como antes', () => {
  const html = '<div class="frase">Ela parou de fumar.</div>\n<span class="pm-tocar" aria-hidden="true">▶</span>';
  assert.strictEqual(
    documentoDoQuadro('.x{}', html),
    `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">`
      + `<style>html { min-height: 100%; } body { margin: 0; } .card { min-height: 100vh; box-sizing: border-box; padding: 16px; } .x{}</style><div class="card">${html}</div>`,
  );
});
