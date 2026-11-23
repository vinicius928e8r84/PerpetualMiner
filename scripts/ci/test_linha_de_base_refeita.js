'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

const { repositorioDeMentira, linhasDe, ARQUIVO_DAS_REGRAS } = require('../regras/apoio-de-linha-de-base');

const REFAZER = path.join(__dirname, 'linha-de-base-refeita.js');
const refazer = (repo, ...args) => {
  const rodado = spawnSync('node', [REFAZER, ...args], { cwd: repo.raiz, encoding: 'utf8' });
  return { status: rodado.status, saida: `${rodado.stdout}${rodado.stderr}` };
};

let total = 0;
const prova = (achado, esperado, porque) => { assert.deepStrictEqual(achado, esperado, porque); total++; };

function comUmCommitDeLinhaDeBase(caso) {
  const repo = repositorioDeMentira();
  try {
    repo.git('checkout', '-q', '-b', 'pr');
    repo.gravar({ 'grande.js': linhasDe(1000) });
    repo.commit('conserta o arquivo');
    const baixado = repo.baixar();
    assert.strictEqual(baixado.status, 0, baixado.saida);
    caso(repo);
  } finally {
    repo.limpar();
  }
}

comUmCommitDeLinhaDeBase(repo => {
  const r = refazer(repo);
  prova([r.status, /refeito/.test(r.saida)], [0, true], `o commit que o comando deu é refeito igual:\n${r.saida}`);
});

comUmCommitDeLinhaDeBase(repo => {
  const r = refazer(repo, 'HEAD~1');
  prova([r.status, /nada a refazer/.test(r.saida)], [0, true], `um head que não é commit de linha de base não é conferido:\n${r.saida}`);
});

comUmCommitDeLinhaDeBase(repo => {
  repo.editarJson(ARQUIVO_DAS_REGRAS, dados => { dados['limite-de-linhas']['inventado.js'] = 7; });
  repo.git('commit', '-q', '-a', '--amend', '--no-edit');
  const r = refazer(repo);
  prova([r.status, r.saida.includes(ARQUIVO_DAS_REGRAS)], [1, true], `o commit com o assunto certo e o conteúdo mexido à mão reprova, dizendo o arquivo:\n${r.saida}`);
});

comUmCommitDeLinhaDeBase(repo => {
  repo.gravar({ 'pequeno.js': 'x\nx\n' });
  repo.git('add', '-A');
  repo.git('commit', '-q', '--amend', '--no-edit');
  const r = refazer(repo);
  prova([r.status, r.saida.includes('pequeno.js')], [1, true], `um commit de linha de base que leva outro arquivo reprova:\n${r.saida}`);
});

comUmCommitDeLinhaDeBase(repo => {
  repo.editarJson(ARQUIVO_DAS_REGRAS, dados => { dados['limite-de-linhas']['inventado.js'] = 7; });
  repo.git('commit', '-q', '-a', '--amend', '--no-edit');
  repo.gravar({ 'pequeno.js': 'x\nx\n' });
  repo.commit('um commit depois');
  prova(refazer(repo).status, 0, 'sem --desde só o head é conferido');
  const r = refazer(repo, 'HEAD', '--desde', 'main');
  prova([r.status, r.saida.includes(ARQUIVO_DAS_REGRAS)], [1, true], `com --desde, o commit de linha de base mexido que não é o head também reprova:\n${r.saida}`);
});

comUmCommitDeLinhaDeBase(repo => {
  repo.git('checkout', '-q', 'main');
  repo.gravar({ 'outro.js': 'x\n' });
  repo.commit('a main anda');
  repo.git('checkout', '-q', 'pr');
  repo.git('merge', '-q', '--no-edit', 'main');
  const r = refazer(repo, 'HEAD', '--desde', 'main');
  prova([r.status, /refeito/.test(r.saida)], [0, true], `juntar a main depois do commit de linha de base não o desfaz:\n${r.saida}`);
});

comUmCommitDeLinhaDeBase(repo => {
  prova(refazer(repo, 'HEAD', 'sobra').status, 2, 'um argumento a mais é erro de uso');
});

console.log(`linha-de-base-refeita: ${total} provas ok`);
