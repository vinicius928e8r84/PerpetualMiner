'use strict';

// Quem regrava `frases` fora da fila de gravação do service
// worker pode escrever por cima de uma frase salva no meio do caminho
// (CODING_STANDARDS.md regra 7; CLAUDE.md § Write Serialization). Foi o assunto
// de quatro rodadas de revisão na B1 (#116), do lote que descartava chaves em
// 58ef837, e a B2 (#126) levou quatro escritas novas para fora da fila em
// lib/sincronizacao.js. Cada lugar novo que grava essa chave fora da fila
// é acusado aqui.

const { ehJsDaExtensao, fechamento, linhaDe, semComentariosJs } = require('./comum');

const id = 'gravacao-de-frases';

const conserto = 'Não abra um lugar novo que grava `frases`. No service worker, faça a leitura '
  + 'e a escrita dentro de `naFilaDeGravacao(async () => …)` (background.js), como `salvarFrase`. Numa página, peça a '
  + 'gravação ao service worker (`SALVAR_HISTORICO`, via `PerpetualMiner.Mineracao` em lib/mineracao.js) ou reuse um '
  + 'dos lugares que já gravam; nunca grave de volta uma cópia lida antes de um `await` (CODING_STANDARDS.md regra 7).';

const CHAVES = /(?:^|[{,\s])(?:frases|['"]frases['"])\s*(?::|,|\})/;

const seAplica = ehJsDaExtensao;

// Os trechos que rodam dentro da fila: o argumento de cada `naFilaDeGravacao(…)`.
function trechosNaFila(codigo) {
  const trechos = [];
  for (const m of codigo.matchAll(/\bnaFilaDeGravacao\s*\(/g)) {
    const abre = m.index + m[0].length - 1;
    const fecha = fechamento(codigo, abre);
    if (fecha > 0 && !/function\s*$/.test(codigo.slice(0, m.index))) trechos.push([abre, fecha]);
  }
  return trechos;
}

function verificar(arquivo, fonte) {
  const codigo = semComentariosJs(fonte);
  const naFila = trechosNaFila(codigo);
  const achados = [];
  // `.set({ … })`, `chromeSet({ … })` e `.remove('frases')`/`.remove(['frases'])`.
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
    if (naFila.some(([de, ate]) => m.index > de && m.index < ate)) continue;
    const linha = linhaDe(codigo, m.index);
    achados.push({ linha, detalhe: `grava fora da fila: ${fonte.split('\n')[linha - 1].trim().slice(0, 100)}` });
  }
  return achados;
}

module.exports = { id, conserto, seAplica, verificar };
