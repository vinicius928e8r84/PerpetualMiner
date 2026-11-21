'use strict';

const assert = require('assert');
const fs = require('fs');
const { repositorioDeTestes } = require('./apoio-de-testes');

const regra = require('./verificar').REGRAS.find(r => r.id === 'link-de-doc');

const raiz = repositorioDeTestes({
  'README.md': '# Raiz\n',
  'popup.js': 'popup();\n',
  'docs/guia.md': [
    '# Guia',
    '',
    'Primeira parte',
    '=============',
    '',
    'texto',
    'Segunda parte',
    '-------------',
    '',
    '- item da lista',
    '---',
    '> citação',
    '===',
    '| a | b |',
    '---',
    '',
    '---',
    '## Envio ao Anki',
    '## Envio ao Anki',
    '### O `Fila.mudar` portão ###',
    '## [Link](x.md) no título',
    '```',
    '## fora do título',
    '```',
    '~~~~',
    '## fora também',
    '~~~',
    '## ainda fora',
    '~~~~',
    '<a name="Nome"></a> <span id=\'Outro\'></span>',
    '`<a id="no-codigo"></a>`',
  ].join('\n'),
  'docs/pasta/LEIA-ME.md': '# Pasta\n',
  'docs/espaco no nome.md': '# Com espaço\n',
  'docs/topo.md': 'Logo no topo\n===\n',
  'docs/notas.txt': '# Notas\n',
});

const CASOS = [
  {
    porque: 'arquivo que falta, relativo à raiz e a uma pasta',
    arquivo: 'README.md',
    fonte: '[a](nada.md) [b](docs/nada.md#x) [c](/docs/guia.md) [d](docs/guia.md#guia)\n[e](docs/pasta/)\n',
    esperado: [
      { linha: 1, detalhe: 'o link [a](nada.md) (relativo a `./`) aponta para `nada.md`, que não existe; conserte o link em README.md' },
      { linha: 1, detalhe: 'o link [b](docs/nada.md#x) (relativo a `./`) aponta para `docs/nada.md`, que não existe; conserte o link em README.md' },
    ],
  },
  {
    porque: 'fora do repositório e a pasta do arquivo na mensagem',
    arquivo: 'docs/pasta/LEIA-ME.md',
    fonte: '[sobe](../../../fora.md) [falta](irmao.md) [certo](../guia.md#envio-ao-anki-1)\n',
    esperado: [
      { linha: 1, detalhe: 'o link [sobe](../../../fora.md) (relativo a `docs/pasta/`) aponta para `../../../fora.md`, que está fora do repositório; conserte o link em docs/pasta/LEIA-ME.md' },
      { linha: 1, detalhe: 'o link [falta](irmao.md) (relativo a `docs/pasta/`) aponta para `docs/pasta/irmao.md`, que não existe; conserte o link em docs/pasta/LEIA-ME.md' },
    ],
  },
  {
    porque: 'as âncoras do outro arquivo: setext, repetidas, código em linha, link no título, id e name',
    arquivo: 'docs/x.md',
    fonte: [
      '[1](guia.md#primeira-parte) [2](guia.md#segunda-parte) [3](guia.md#envio-ao-anki) [4](guia.md#envio-ao-anki-1)',
      '[5](guia.md#o-filamudar-portão) [6](guia.md#link-no-título) [7](guia.md#nome) [8](guia.md#outro) [9](guia.md#GUIA)',
      '[10](guia.md#item-da-lista) [11](guia.md#citação) [12](guia.md#a--b-) [13](guia.md#fora-do-título)',
      '[14](guia.md#fora-também) [15](guia.md#ainda-fora) [16](guia.md#no-codigo) [17](guia.md#envio)',
      '[18](guia.md#envio-ao-anki-2) [19](guia.md#zzz)',
    ].join('\n'),
    esperado: [
      { linha: 3, detalhe: 'o link [10](guia.md#item-da-lista) aponta para a âncora `#item-da-lista`, que `docs/guia.md` não tem; conserte o link em docs/x.md' },
      { linha: 3, detalhe: 'o link [11](guia.md#citação) aponta para a âncora `#citação`, que `docs/guia.md` não tem; conserte o link em docs/x.md' },
      { linha: 3, detalhe: 'o link [12](guia.md#a--b-) aponta para a âncora `#a--b-`, que `docs/guia.md` não tem; conserte o link em docs/x.md' },
      { linha: 3, detalhe: 'o link [13](guia.md#fora-do-título) aponta para a âncora `#fora-do-título`, que `docs/guia.md` não tem; conserte o link em docs/x.md' },
      { linha: 4, detalhe: 'o link [14](guia.md#fora-também) aponta para a âncora `#fora-também`, que `docs/guia.md` não tem; conserte o link em docs/x.md' },
      { linha: 4, detalhe: 'o link [15](guia.md#ainda-fora) aponta para a âncora `#ainda-fora`, que `docs/guia.md` não tem; conserte o link em docs/x.md' },
      { linha: 4, detalhe: 'o link [16](guia.md#no-codigo) aponta para a âncora `#no-codigo`, que `docs/guia.md` não tem; conserte o link em docs/x.md' },
      { linha: 4, detalhe: 'o link [17](guia.md#envio) aponta para a âncora `#envio`, que `docs/guia.md` não tem (títulos parecidos: #envio-ao-anki, #envio-ao-anki-1); conserte o link em docs/x.md' },
      { linha: 5, detalhe: 'o link [18](guia.md#envio-ao-anki-2) aponta para a âncora `#envio-ao-anki-2`, que `docs/guia.md` não tem (títulos parecidos: #envio-ao-anki); conserte o link em docs/x.md' },
      { linha: 5, detalhe: 'o link [19](guia.md#zzz) aponta para a âncora `#zzz`, que `docs/guia.md` não tem; conserte o link em docs/x.md' },
    ],
  },
  {
    porque: 'o que não se confere: esquema, linha do GitHub, destino que não é .md, pasta com âncora',
    arquivo: 'docs/x.md',
    fonte: [
      '[web](https://a.b/c.md#x) [mail](mailto:a@b) [proto](//a.b/x.md) [linha](../popup.js#L1-L9) [js](../popup.js#qualquer)',
      '[pasta](pasta#x) [consulta](guia.md?plain=1#guia) [codificado](espaco%20no%20nome.md#com-espaço) [ruim](guia.md#%E0%A4%A)',
      '[sem ancora](guia.md#) [vazio]() [ang](<espaco no nome.md>)',
      '[topo](topo.md#logo-no-topo) [txt](notas.txt#qualquer)',
    ].join('\n'),
    esperado: [
      { linha: 2, detalhe: 'o link [ruim](guia.md#%E0%A4%A) aponta para a âncora `#%e0%a4%a`, que `docs/guia.md` não tem; conserte o link em docs/x.md' },
    ],
  },
  {
    porque: 'a âncora no próprio arquivo, a definição, o HTML, o código e o CRLF',
    arquivo: 'docs/proprio.md',
    fonte: [
      '# Próprio título',
      '[ok](#próprio-título) [falta](#próprio) [def]: #outro-titulo',
      '[ref]: <nada.md>',
      '<a href="nada2.md">x</a> <img src=\'#próprio-título\'>',
      '`[em código](nada3.md)` e ``[duplo](nada4.md)``',
      '```',
      '[cercado](nada5.md)',
      '```',
    ].join('\r\n'),
    esperado: [
      { linha: 2, detalhe: 'o link [falta](#próprio) aponta para a âncora `#próprio`, que este arquivo não tem (títulos parecidos: #próprio-título); conserte o link em docs/proprio.md' },
      { linha: 3, detalhe: 'o link [ref]: <nada.md> (relativo a `docs/`) aponta para `docs/nada.md`, que não existe; conserte o link em docs/proprio.md' },
      { linha: 4, detalhe: 'o link <a href="nada2.md" (relativo a `docs/`) aponta para `docs/nada2.md`, que não existe; conserte o link em docs/proprio.md' },
    ],
  },
];

let total = 0;
try {
  for (const { porque, arquivo, fonte, esperado } of CASOS) {
    assert.deepStrictEqual(regra.verificar(arquivo, fonte, raiz), esperado, porque);
    total++;
  }
} finally {
  fs.rmSync(raiz, { recursive: true, force: true });
}

console.log(`link-de-doc (mensagens): ${total} provas passaram`);
