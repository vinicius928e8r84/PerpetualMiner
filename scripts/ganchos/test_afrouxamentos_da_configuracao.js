'use strict';

const assert = require('assert');
const { afrouxamentosDaConfiguracao, mensagemDeConfiguracao } = require('./configuracao-do-indice.js');

const DO_HEAD = {
  limiteDeBytes: 20000, linhaDeBase: 'b.json', linhasDoCabecalho: 5, marcasDeGerado: ['@generated'], ignorar: [{ glob: '*.lock', motivo: 'trava' }],
};
const com = mudancas => ({ ...DO_HEAD, ...mudancas });

const CASOS = [
  [com({}), DO_HEAD, []],
  [com({ limiteDeBytes: 20000, linhasDoCabecalho: 5 }), DO_HEAD, []],
  [com({ limiteDeBytes: 1, linhasDoCabecalho: 0 }), DO_HEAD, []],
  [
    com({
      ignorar: [{ glob: 'b/', motivo: 'x' }, { glob: '*.lock', motivo: 'outro' }, { glob: 'a/', motivo: 'y' }],
      marcasDeGerado: ['AUTO', '@generated', 'GERADO'],
      linhasDoCabecalho: 6,
      linhaDeBase: 'outra.json',
      limiteDeBytes: 20001,
    }),
    DO_HEAD,
    [
      '"limiteDeBytes" subiu de 20000 para 20001',
      '"linhasDoCabecalho" subiu de 5 para 6',
      '"linhaDeBase" mudou de b.json para outra.json',
      '"ignorar" ganhou o glob "b/"',
      '"ignorar" ganhou o glob "a/"',
      '"marcasDeGerado" ganhou "AUTO"',
      '"marcasDeGerado" ganhou "GERADO"',
    ],
  ],
  [com({ ignorar: [{ glob: 'a/', motivo: 'x' }, { glob: 'a/', motivo: 'y' }] }), DO_HEAD, ['"ignorar" ganhou o glob "a/"', '"ignorar" ganhou o glob "a/"']],
  [com({ marcasDeGerado: ['AUTO', 'AUTO'] }), DO_HEAD, ['"marcasDeGerado" ganhou "AUTO"', '"marcasDeGerado" ganhou "AUTO"']],
  [com({ ignorar: [{ glob: '*.lock', motivo: 'x' }], marcasDeGerado: ['@generated'] }), { ...DO_HEAD, ignorar: undefined, marcasDeGerado: 'x' },
    ['"ignorar" ganhou o glob "*.lock"', '"marcasDeGerado" ganhou "@generated"']],
  [com({ ignorar: {}, marcasDeGerado: null }), DO_HEAD, []],
  [com({ ignorar: [{ glob: 'x"y', motivo: 'm' }], marcasDeGerado: ['a"b'] }), DO_HEAD,
    ['"ignorar" ganhou o glob "x\\"y"', '"marcasDeGerado" ganhou "a\\"b"']],
  [com({ linhaDeBase: undefined }), DO_HEAD, ['"linhaDeBase" mudou de b.json para undefined']],
  [com({ limiteDeBytes: '30000' }), DO_HEAD, ['"limiteDeBytes" subiu de 20000 para 30000']],
  [com({ limiteDeBytes: undefined, linhasDoCabecalho: null }), DO_HEAD, []],
];
for (const [preparada, doHead, achados] of CASOS) {
  assert.deepStrictEqual(afrouxamentosDaConfiguracao(preparada, doHead), achados, JSON.stringify(preparada));
}

assert.strictEqual(mensagemDeConfiguracao(['um', 'dois']),
  '✗ scripts/ganchos/limite-de-tokens.json: configuração afrouxada. um; dois. '
  + 'A configuração só aperta (o limite não sobe; "ignorar" e "marcasDeGerado" não ganham entrada) e é lida do índice. '
  + 'Desfaça: git restore --source=HEAD --staged --worktree -- scripts/ganchos/limite-de-tokens.json; '
  + 'e divida o arquivo em vez de afrouxar o limite. Afrouxar a configuração é decisão do dono, em PR próprio e revisado.');

console.log('afrouxamentos da configuração ok');
