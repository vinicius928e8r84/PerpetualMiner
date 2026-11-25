'use strict';

const assert = require('assert');

const regra = require('./linha-de-base-no-merge');
const { REGRAS } = require('./verificar');
const { repositorioDeMentira, linhasDe, bytesDe, ARQUIVO_DAS_REGRAS, ARQUIVO_DE_TAMANHO, ARQUIVO_DO_SEM_COMENTARIO } = require('./apoio-de-linha-de-base');

let total = 0;
const prova = (achado, esperado, porque) => { assert.deepStrictEqual(achado, esperado, porque); total++; };
const barrada = saida => saida.includes('✗ linha-de-base-no-merge');

prova([REGRAS.includes(regra), regra.seAplica(ARQUIVO_DAS_REGRAS), regra.seAplica(ARQUIVO_DE_TAMANHO), regra.seAplica(ARQUIVO_DO_SEM_COMENTARIO), regra.seAplica('scripts/regras/verificar.js')],
  [true, true, true, true, false], 'a regra está em verificar.js e cobra os três arquivos de linha de base');

function emUmaPr(caso) {
  const repo = repositorioDeMentira();
  try {
    repo.git('checkout', '-q', '-b', 'pr');
    caso(repo);
  } finally {
    repo.limpar();
  }
}

emUmaPr(repo => {
  prova(barrada(repo.conferirComoPr().saida), false, 'sem mexer nos arquivos, a regra passa');
});

emUmaPr(repo => {
  repo.gravar({ 'grande.js': linhasDe(1000) });
  repo.editarJson(ARQUIVO_DAS_REGRAS, dados => { dados['limite-de-linhas'] = {}; });
  repo.commit('conserta e baixa a linha de base à mão');
  const r = repo.conferirComoPr();
  prova([r.status, barrada(r.saida)], [1, true], `um valor das regras editado à mão é barrado:\n${r.saida}`);
  assert.match(r.saida, /limite-de-linhas grande\.js saiu da linha de base, onde a base tem 20/);
  assert.match(r.saida, /git restore --source=origin\/main -- scripts\/regras\/linha-de-base\.json scripts\/ganchos\/linha-de-base-de-tamanho\.json/);
  assert.match(r.saida, /node scripts\/regras\/baixar-no-merge\.js/);
  total += 3;
  prova(barrada(repo.conferirForaDePr().saida), false, 'fora de uma PR (o push da main) a regra não vale');
});

emUmaPr(repo => {
  repo.gravar({ 'volumoso.txt': bytesDe(100) });
  repo.editarJson(ARQUIVO_DE_TAMANHO, dados => { dados.arquivos = {}; });
  repo.commit('conserta e baixa a linha de base de tamanho à mão');
  const r = repo.conferirComoPr();
  prova([r.status, barrada(r.saida)], [1, true], `um valor da linha de base de tamanho editado à mão é barrado:\n${r.saida}`);
  assert.match(r.saida, /volumoso\.txt saiu da linha de base, onde a base tem 21000/);
  total++;
});

emUmaPr(repo => {
  repo.gravar({ 'grande.js': linhasDe(1000) });
  repo.commit('conserta');
  const baixado = repo.baixar();
  prova(baixado.status, 0, baixado.saida);
  const r = repo.conferirComoPr();
  prova([r.status, barrada(r.saida)], [0, false], `o próprio commit de linha de base passa:\n${r.saida}`);
});

emUmaPr(repo => {
  repo.gravar({ 'grande.js': linhasDe(1000) });
  repo.commit('conserta');
  repo.baixar();
  repo.gravar({ 'scripts/regras/outro.json': '{}\n' });
  repo.git('add', '-A');
  repo.git('commit', '-q', '--amend', '--no-edit');
  const r = repo.conferirComoPr();
  prova([r.status, barrada(r.saida)], [1, true], `o commit com o assunto certo que toca outro arquivo não é o commit de linha de base:\n${r.saida}`);
});

emUmaPr(repo => {
  repo.gravar({ 'grande.js': linhasDe(1000) });
  repo.commit('conserta');
  repo.baixar();
  repo.editarJson(ARQUIVO_DAS_REGRAS, dados => { dados['limite-de-linhas']['outro.js'] = 3; });
  repo.commit('mexe de novo à mão');
  const r = repo.conferirComoPr();
  prova([r.status, barrada(r.saida)], [1, true], `um commit à mão depois do de linha de base é barrado:\n${r.saida}`);
});

emUmaPr(repo => {
  repo.git('checkout', '-q', 'main');
  repo.editarJson(ARQUIVO_DAS_REGRAS, dados => { delete dados[regra.id]; });
  repo.commit('a main ainda não tem a regra nova');
  repo.git('checkout', '-q', 'pr');
  repo.git('merge', '-q', '--no-edit', 'main');
  repo.editarJson(ARQUIVO_DAS_REGRAS, dados => { dados[regra.id] = { 'regra-nova.js': 1 }; });
  repo.commit('a regra nova traz a primeira linha de base dela');
  const r = repo.conferirComoPr();
  prova(barrada(r.saida), false, `a PR que cria uma regra e traz a primeira linha de base dela passa:\n${r.saida}`);
});

function renomeadoComAChave(repo, valorNovo) {
  repo.git('mv', 'grande.js', 'maior.js');
  repo.editarJson(ARQUIVO_DAS_REGRAS, dados => {
    delete dados['limite-de-linhas']['grande.js'];
    dados['limite-de-linhas']['maior.js'] = valorNovo;
  });
  repo.commit('renomeia o arquivo da lista');
  return repo.conferirComoPr();
}

emUmaPr(repo => {
  const r = renomeadoComAChave(repo, 20);
  prova([r.status, barrada(r.saida)], [0, false], `a PR que renomeia um arquivo da lista e troca a chave com o mesmo valor passa:\n${r.saida}`);
});

emUmaPr(repo => {
  const r = renomeadoComAChave(repo, 10);
  prova([r.status, barrada(r.saida)], [1, true], `a renomeação que também muda o valor é barrada:\n${r.saida}`);
  assert.match(r.saida, /limite-de-linhas maior\.js foi de 20 para 10|limite-de-linhas maior\.js entrou na linha de base com 10/);
  total++;
});

emUmaPr(repo => {
  repo.git('mv', 'volumoso.txt', 'volumoso-novo.txt');
  repo.editarJson(ARQUIVO_DE_TAMANHO, dados => {
    delete dados.arquivos['volumoso.txt'];
    dados.arquivos['volumoso-novo.txt'] = 21000;
  });
  repo.commit('renomeia o arquivo da lista de tamanho');
  const r = repo.conferirComoPr();
  prova([r.status, barrada(r.saida)], [0, false], `o mesmo vale para a lista de tamanho:\n${r.saida}`);
});

emUmaPr(repo => {
  repo.gravar({ 'comentado.js': 'const a = 1;\n' });
  repo.editarJson(ARQUIVO_DO_SEM_COMENTARIO, dados => { dados['sem-comentario'] = {}; });
  repo.commit('conserta e baixa a linha de base dos comentários à mão');
  const r = repo.conferirComoPr();
  prova([r.status, barrada(r.saida)], [1, true], `um valor da linha de base dos comentários editado à mão é barrado:\n${r.saida}`);
  assert.match(r.saida, /sem-comentario comentado\.js saiu da linha de base, onde a base tem 2/);
  total++;
});

const CRIADO = '{\n  "@generated": "gerado, DO NOT EDIT",\n  "sem-comentario": { "comentado.js": 2 }\n}\n';

emUmaPr(repo => {
  repo.git('checkout', '-q', 'main');
  repo.git('rm', '-q', ARQUIVO_DO_SEM_COMENTARIO);
  repo.commit('antes da regra sem-comentario');
  repo.git('checkout', '-q', '-b', 'cria');
  repo.gravar({ [ARQUIVO_DO_SEM_COMENTARIO]: CRIADO });
  repo.commit('a PR que cria a regra escreve o arquivo');
  const r = repo.conferirComoPr();
  prova(barrada(r.saida), false, `a PR que cria o arquivo da linha de base dos comentários passa:\n${r.saida}`);
});

console.log(`linha-de-base-no-merge: ${total} provas ok`);
