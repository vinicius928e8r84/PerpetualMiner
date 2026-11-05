'use strict';

// O que o AnkiWeb dá à Conexão com o Anki depois do primeiro upload (#176): o código da página
// (o número que a pessoa cola em Ferramentas › Complementos › Obter complementos). Não há
// código até o dono subir o arquivo com a conta dele: `null`, e a tela diz que o código vem
// em breve, nunca um número inventado.
//
// O mesmo número é o `package` de `complemento/manifest.json`: `complemento/test_pacote.py` os confere.
// Quem publica troca os dois e refaz `conexao/perpetualminer.ankiaddon` (`docs/ankiweb/LEIA-ME.md`).

(function (raiz) {
  raiz.AnkiWeb = { codigo: null };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
