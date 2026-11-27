'use strict';

const PASSA = 200;
const RECUSA = 403;

const valor = x => {
  if (typeof x === 'boolean') return { booleanValue: x };
  if (Number.isInteger(x)) return { integerValue: String(x) };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(valor) } };
  return { stringValue: x };
};
const documento = campos => ({ fields: Object.fromEntries(Object.entries(campos).map(([chave, x]) => [chave, valor(x)])) });
const semOCampo = (campos, nome) => Object.fromEntries(Object.entries(campos).filter(([chave]) => chave !== nome));

const ranking = (uid, mudar = {}) => ({ uid, idioma: 'en', nome: 'Pessoa de teste', foto: '', nivel: 'intermediario', melhorSequencia: 3, nota: 7, acertos: 7, perguntas: 10, grupos: [], topou: true, em: 1760000000000, ...mudar });

const DOCUMENTOS_DO_USUARIO = [
  ['frases', 'usuarios/ana/frases/f1'],
  ['segredos/openai', 'usuarios/ana/segredos/openai'],
  ['meta/deleted', 'usuarios/ana/meta/deleted'],
];

function casosDoUsuario() {
  const corpo = documento({ id: 'f1', texto: 'x' });
  return DOCUMENTOS_DO_USUARIO.flatMap(([nome, caminho]) => [
    [`${nome}: o próprio UID grava`, PASSA, 'ana', 'PATCH', caminho, corpo],
    [`${nome}: o próprio UID lê`, PASSA, 'ana', 'GET', caminho],
    [`${nome}: outro UID lê`, RECUSA, 'beto', 'GET', caminho],
    [`${nome}: outro UID grava`, RECUSA, 'beto', 'PATCH', caminho, corpo],
    [`${nome}: outro UID apaga`, RECUSA, 'beto', 'DELETE', caminho],
    [`${nome}: sem login lê`, RECUSA, null, 'GET', caminho],
    [`${nome}: sem login grava`, RECUSA, null, 'PATCH', caminho, corpo],
    [`${nome}: sem login apaga`, RECUSA, null, 'DELETE', caminho],
  ]).concat([
    ['frases: o próprio UID lista a coleção', PASSA, 'ana', 'GET', 'usuarios/ana/frases?pageSize=5'],
    ['frases: outro UID lista a coleção', RECUSA, 'beto', 'GET', 'usuarios/ana/frases?pageSize=5'],
    ['frases: sem login lista a coleção', RECUSA, null, 'GET', 'usuarios/ana/frases?pageSize=5'],
    ['um caminho que as regras não citam: conta logada grava', RECUSA, 'ana', 'PATCH', 'outros/x', documento({ a: 'b' })],
    ['um caminho que as regras não citam: conta logada lê', RECUSA, 'ana', 'GET', 'outros/x'],
  ]);
}

function casosDoRankingQueGravam() {
  const grava = (nome, esperado, quem, caminho, campos) => [`ranking: ${nome}`, esperado, quem, 'PATCH', caminho, documento(campos)];
  return [
    grava('a pessoa topa (grava o próprio documento)', PASSA, 'ana', 'ranking/en_ana', ranking('ana')),
    grava('sem login grava', RECUSA, null, 'ranking/en_beto', ranking('beto')),
    grava('outra conta grava o documento alheio (uid dele)', RECUSA, 'beto', 'ranking/en_ana', ranking('ana', { nota: 10 })),
    grava('outra conta grava o documento alheio (uid dela)', RECUSA, 'beto', 'ranking/en_ana', ranking('beto')),
    grava('grava o próprio id com o uid de outra conta', RECUSA, 'beto', 'ranking/en_beto', ranking('ana')),
    grava('o idioma do documento não bate com o id', RECUSA, 'ana', 'ranking/ru_ana', ranking('ana')),
    grava('grava com topou false', RECUSA, 'ana', 'ranking/en_ana', ranking('ana', { topou: false })),
    grava('grava com um campo a mais', RECUSA, 'ana', 'ranking/en_ana', { ...ranking('ana'), extra: 'x' }),
    grava('grava com um campo a menos', RECUSA, 'ana', 'ranking/en_ana', semOCampo(ranking('ana'), 'foto')),
    grava('idioma fora de en e ru', RECUSA, 'ana', 'ranking/fr_ana', ranking('ana', { idioma: 'fr' })),
    grava('nível fora da lista', RECUSA, 'ana', 'ranking/en_ana', ranking('ana', { nivel: 'mestre' })),
    grava('melhorSequencia 7 (o máximo é 6)', RECUSA, 'ana', 'ranking/en_ana', ranking('ana', { melhorSequencia: 7 })),
    grava('nome de 101 caracteres', RECUSA, 'ana', 'ranking/en_ana', ranking('ana', { nome: 'n'.repeat(101) })),
    grava('a pessoa atualiza o próprio documento', PASSA, 'ana', 'ranking/en_ana', ranking('ana', { nota: 8, acertos: 8 })),
  ];
}

function casosDoRankingQueLeemEApagam() {
  return [
    ['ranking: outra conta lê o documento de quem topou', PASSA, 'beto', 'GET', 'ranking/en_ana'],
    ['ranking: a consulta topou == true de uma conta logada', PASSA, 'beto', 'CONSULTA', 'ranking'],
    ['ranking: sem login lê o documento', RECUSA, null, 'GET', 'ranking/en_ana'],
    ['ranking: sem login faz a consulta', RECUSA, null, 'CONSULTA', 'ranking'],
    ['ranking: outra conta apaga o documento alheio', RECUSA, 'beto', 'DELETE', 'ranking/en_ana'],
    ['ranking: sem login apaga o documento alheio', RECUSA, null, 'DELETE', 'ranking/en_ana'],
    ['ranking: a pessoa desmarca (apaga o próprio documento)', PASSA, 'ana', 'DELETE', 'ranking/en_ana'],
    ['ranking: depois de apagar, ler o documento que não existe é recusado', RECUSA, 'ana', 'GET', 'ranking/en_ana'],
    ['ranking: apagar um documento que não existe passa para conta logada (resource == null)', PASSA, 'beto', 'DELETE', 'ranking/en_ana'],
    ['ranking: apagar um documento que não existe, sem login, é recusado', RECUSA, null, 'DELETE', 'ranking/en_ana'],
  ];
}

function casosDasRegras() {
  const [topa, ...gravacoes] = casosDoRankingQueGravam();
  const [leitura, consulta, leituraSemLogin, consultaSemLogin, ...resto] = casosDoRankingQueLeemEApagam();
  const [apagaAlheio, apagaAlheioSemLogin, desmarca, ...depoisDeApagar] = resto;
  const [atualiza] = gravacoes.splice(-1);
  return [...casosDoUsuario(), topa, leitura, consulta, leituraSemLogin, consultaSemLogin, ...gravacoes, apagaAlheio, apagaAlheioSemLogin, atualiza, desmarca, ...depoisDeApagar];
}

module.exports = { casosDasRegras, documento };
