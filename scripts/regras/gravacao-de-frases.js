'use strict';

const { ehJsDaExtensao, fechamento, linhaDe, semComentariosJs } = require('./comum');

const id = 'gravacao-de-frases';

const guarda = 'toda gravação de `frases` passa por lib/historico.js';

const conserto = 'Não grave `frases` fora de `PerpetualMiner.Historico` (lib/historico.js), que lê de novo dentro da '
  + 'tranca `pm-historico` e muda só o que pediram. No service worker, nas páginas e em lib/, chame uma operação dele '
  + '(`acrescentar`, `editar`, `editarVarias`, `marcarEnviadas`, `marcarExportadas`, `apagar`); falta uma? Ela entra em '
  + 'lib/historico.js. Nunca grave de volta uma cópia lida antes de um `await`.';

const CHAVES = /(?:^|[{,\s])(?:frases|['"]frases['"])\s*(?::|,|\})/;

const DONO = 'lib/historico.js';

const seAplica = arquivo => ehJsDaExtensao(arquivo) && arquivo !== DONO;

function verificar(arquivo, fonte) {
  const codigo = semComentariosJs(fonte);
  const achados = [];
  for (const m of codigo.matchAll(/(?:\.set|\bchromeSet|\.remove)\s*\(/g)) {
    const abre = m.index + m[0].length - 1;
    const fecha = fechamento(codigo, abre);
    if (fecha < 0) continue;
    const argumentos = codigo.slice(abre + 1, fecha);
    const primeiro = argumentos.trimStart();
    const gravaAsChaves = primeiro.startsWith('{')
      ? CHAVES.test(argumentos.slice(0, fechamento(argumentos, argumentos.indexOf('{')) + 1))
      : /^\[?\s*['"]frases['"]/.test(primeiro);
    if (!gravaAsChaves) continue;
    const linha = linhaDe(codigo, m.index);
    achados.push({ linha, detalhe: `grava fora do Historico: ${fonte.split('\n')[linha - 1].trim().slice(0, 100)}` });
  }
  return achados;
}

module.exports = { id, guarda, conserto, seAplica, verificar };
