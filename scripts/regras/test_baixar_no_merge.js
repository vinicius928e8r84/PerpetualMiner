'use strict';

const assert = require('assert');
const fs = require('fs');

const { EMAIL_DO_DONO } = require('../ci/autoria');
const { ARQUIVOS, ASSUNTO } = require('./linha-de-base-no-merge');
const { repositorioDeMentira, linhasDe, bytesDe } = require('./apoio-de-linha-de-base');

let total = 0;
const prova = (achado, esperado, porque) => { assert.deepStrictEqual(achado, esperado, porque); total++; };

function naoHaNadaParaBaixar() {
  const repo = repositorioDeMentira();
  try {
    const antes = repo.git('rev-parse', 'HEAD');
    const r = repo.baixar();
    prova([r.status, /nada desceu/.test(r.saida)], [0, true], `sem nada que tenha descido, sai 0 dizendo isso:\n${r.saida}`);
    prova(repo.git('rev-parse', 'HEAD'), antes, 'sem nada que tenha descido, não faz commit');
  } finally {
    repo.limpar();
  }
}

function umCommitSoComAutoriaDoDono() {
  const repo = repositorioDeMentira();
  try {
    repo.gravar({ 'grande.js': linhasDe(1010), 'volumoso.txt': bytesDe(20500) });
    repo.commit('conserta');
    const antes = repo.git('rev-list', '--count', 'HEAD');
    const r = repo.baixar();
    prova(r.status, 0, r.saida);
    prova(Number(repo.git('rev-list', '--count', 'HEAD')) - Number(antes), 1, 'desceu: um commit só');
    prova(repo.git('log', '-1', '--format=%s'), ASSUNTO, 'o assunto é fixo');
    prova(repo.git('show', '--name-only', '--format=', 'HEAD').split('\n').sort(), [...ARQUIVOS].sort(), 'o commit toca só os dois arquivos');
    prova(repo.git('log', '-1', '--format=%ae %ce'), `${EMAIL_DO_DONO} ${EMAIL_DO_DONO}`, 'a autoria é a do dono');
    prova(repo.lerLinhaDeBase()['limite-de-linhas'], { 'grande.js': 10 }, 'a linha de base das regras desceu para o que a árvore mede');
    prova(repo.lerTamanho().arquivos, { 'volumoso.txt': 20500 }, 'a de tamanho também');
    prova(repo.git('status', '--porcelain'), '', 'a árvore fica limpa');
  } finally {
    repo.limpar();
  }
}

function naoEmpurra() {
  const repo = repositorioDeMentira();
  const remoto = `${repo.raiz}-remoto`;
  try {
    repo.git('init', '-q', '--bare', remoto);
    repo.git('remote', 'add', 'origin', remoto);
    repo.git('push', '-q', 'origin', 'main');
    const noRemoto = repo.git('ls-remote', 'origin');
    repo.gravar({ 'grande.js': linhasDe(1000) });
    repo.commit('conserta');
    repo.git('push', '-q', 'origin', 'main');
    const empurrado = repo.git('ls-remote', 'origin');
    prova(repo.baixar().status, 0, 'baixa');
    prova(repo.git('ls-remote', 'origin'), empurrado, 'o remoto fica como estava: o comando não empurra');
    assert.notStrictEqual(empurrado, noRemoto);
    total++;
  } finally {
    fs.rmSync(remoto, { recursive: true, force: true });
    repo.limpar();
  }
}

function umaRodadaBaixaTudoOQueEntrouDesdeAUltima() {
  const deUmaVez = repositorioDeMentira();
  const umaPorVez = repositorioDeMentira();
  try {
    for (const repo of [deUmaVez, umaPorVez]) {
      repo.gravar({ 'grande.js': linhasDe(1010) });
      repo.commit('primeiro conserto');
    }
    prova(umaPorVez.baixar().status, 0, 'a primeira rodada');
    for (const repo of [deUmaVez, umaPorVez]) {
      repo.gravar({ 'volumoso.txt': bytesDe(100) });
      repo.commit('segundo conserto');
    }
    prova(umaPorVez.baixar().status, 0, 'a segunda rodada');
    prova(deUmaVez.baixar().status, 0, 'uma rodada só, esquecida a primeira');
    prova([deUmaVez.lerLinhaDeBase(), deUmaVez.lerTamanho()], [umaPorVez.lerLinhaDeBase(), umaPorVez.lerTamanho()],
      'esquecer uma rodada dá no mesmo: o comando lê a árvore e escreve o que ela mede');
    prova(Number(deUmaVez.git('rev-list', '--count', 'HEAD')) + 1, Number(umaPorVez.git('rev-list', '--count', 'HEAD')), 'uma rodada, um commit');
    const depois = deUmaVez.git('rev-parse', 'HEAD');
    deUmaVez.baixar();
    prova(deUmaVez.git('rev-parse', 'HEAD'), depois, 'rodar de novo não faz commit');
  } finally {
    deUmaVez.limpar();
    umaPorVez.limpar();
  }
}

function recusaOQueNaoPodeBaixar() {
  const suja = repositorioDeMentira();
  const piorou = repositorioDeMentira();
  try {
    suja.gravar({ 'grande.js': linhasDe(1000) });
    const antes = suja.git('rev-parse', 'HEAD');
    let r = suja.baixar();
    prova([r.status, /não está limpa/.test(r.saida)], [1, true], `árvore suja: recusa dizendo isso\n${r.saida}`);
    prova([suja.git('rev-parse', 'HEAD'), suja.lerLinhaDeBase()['limite-de-linhas']], [antes, { 'grande.js': 20 }], 'árvore suja: nada muda');

    piorou.gravar({ 'grande.js': linhasDe(1030) });
    piorou.commit('piora');
    const depoisDaPiora = piorou.git('rev-parse', 'HEAD');
    r = piorou.baixar();
    prova(r.status, 1, `um arquivo acima do que a linha de base permite: a linha de base não sobe\n${r.saida}`);
    prova([piorou.git('rev-parse', 'HEAD'), piorou.git('status', '--porcelain'), piorou.lerLinhaDeBase()['limite-de-linhas']], [depoisDaPiora, '', { 'grande.js': 20 }],
      'o que não baixou deixa a árvore como estava e sem commit');
  } finally {
    suja.limpar();
    piorou.limpar();
  }
}

for (const caso of [naoHaNadaParaBaixar, umCommitSoComAutoriaDoDono, naoEmpurra, umaRodadaBaixaTudoOQueEntrouDesdeAUltima, recusaOQueNaoPodeBaixar]) caso();

console.log(`baixar-no-merge: ${total} provas ok`);
