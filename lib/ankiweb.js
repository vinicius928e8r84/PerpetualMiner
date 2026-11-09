'use strict';

// O que o AnkiWeb dá à Conexão com o Anki depois do primeiro upload (#176): o código da página
// (o número que a pessoa cola em Ferramentas › Extensões › Obter extensões), o da
// página https://ankiweb.net/shared/info/1108882947. Sem código (`null`), a tela diz que ele vem
// em breve, nunca um número inventado.
//
// O mesmo número é o `package` de `complemento/manifest.json`: `complemento/test_pacote.py` os confere.
// Quem publica troca os dois e refaz `conexao/perpetualminer.ankiaddon` (`docs/ankiweb/LEIA-ME.md`).

(function (raiz) {
  raiz.AnkiWeb = { codigo: '1108882947' };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
