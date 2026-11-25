'use strict';

const { execFileSync, spawnSync } = require('child_process');

const EMAIL_DO_DONO = '48294278+vinicius928e8r84@users.noreply.github.com';
const EMAIL_DO_GITHUB = 'noreply@github.com';
const FORMATO_DO_LOG = '%H%x09%ae%x09%ce%x09%s%x1f%B';
const REFAZER_A_AUTORIA = 'git commit --amend --no-edit --reset-author';
const REFAZER_SEM_COAUTOR = 'git log -1 --no-show-signature --format=%B | node scripts/ci/sem-coautor.js | git commit --amend --reset-author -F -';
const REBASE_QUE_REGRAVA = 'git -c commit.cleanup=whitespace rebase';

const BRANCOS = ' \t\r';
function aparar(texto) {
  let de = 0;
  let ate = texto.length;
  while (de < ate && BRANCOS.includes(texto[de])) de++;
  while (ate > de && BRANCOS.includes(texto[ate - 1])) ate--;
  return texto.slice(de, ate);
}

function linhasDeCoautor(linhas) {
  const achadas = [];
  for (let de = 1; de < linhas.length; de++) {
    const [, primeira] = /^co-authored-by[ \t]*:(.*)$/is.exec(linhas[de]) || [];
    if (primeira === undefined) continue;
    let ate = de + 1;
    while (ate < linhas.length && /^[ \t]+[^ \t\r]/.test(linhas[ate])) ate++;
    achadas.push({ de, ate, valor: aparar([primeira, ...linhas.slice(de + 1, ate)].map(aparar).join(' ')) });
    de = ate - 1;
  }
  return achadas;
}

function deFora({ valor }) {
  const emails = [...valor.matchAll(/<([^<>]*)>/g)].map(([, email]) => aparar(email));
  return (emails.length ? emails : [valor]).some(email => email !== EMAIL_DO_DONO);
}

function coautoresDeFora(mensagem) {
  return linhasDeCoautor(mensagem.split('\n')).filter(deFora).map(({ valor }) => valor);
}

function semCoautoresDeFora(mensagem) {
  const linhas = mensagem.split('\n');
  for (const { de, ate } of linhasDeCoautor(linhas).filter(deFora).reverse()) linhas.splice(de, ate - de);
  return linhas.join('\n');
}

function commitsForaDaRegra(registros) {
  return registros.filter(Boolean).map(registro => {
    const fim = registro.indexOf('\x1f');
    const [sha, autor, committer, ...assunto] = (fim < 0 ? registro : registro.slice(0, fim)).split('\t');
    return { sha, autor, committer, assunto: assunto.join('\t'), coautores: fim < 0 ? [] : coautoresDeFora(registro.slice(fim + 1)) };
  }).filter(({ autor, committer, coautores }) => autor !== EMAIL_DO_DONO || ![EMAIL_DO_DONO, EMAIL_DO_GITHUB].includes(committer) || coautores.length > 0);
}

function mensagem(fora, base) {
  const [rebase, refazer] = fora.some(({ coautores }) => coautores.length > 0)
    ? [REBASE_QUE_REGRAVA, REFAZER_SEM_COAUTOR] : ['git rebase', REFAZER_A_AUTORIA];
  return [
    `✗ ${fora.length} commit(s) sem a autoria do dono (autor, committer e todo Co-authored-by ${EMAIL_DO_DONO}):`,
    ...fora.map(({ sha, autor, committer, assunto, coautores }) =>
      `    ${sha.slice(0, 7)} ${assunto} (autor ${autor}, committer ${committer}${coautores.map(coautor => `, co-autor ${coautor}`).join('')})`),
    '  Conserto: refaça a autoria da branch e envie de novo:',
    `    git config user.email ${EMAIL_DO_DONO}`,
    `    ${rebase} --rebase-merges --exec '${refazer}' ${base}`,
    '    git push --force-with-lease',
  ].join('\n');
}

function pontasAusentes(pontas) {
  return pontas.filter(ponta => spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ponta}^{commit}`], { stdio: 'ignore' }).status !== 0);
}

function main([base, head]) {
  if (!base || !head) {
    console.log('uso: node scripts/ci/autoria.js <base> <head>');
    return 2;
  }
  const ausentes = pontasAusentes([base, head]);
  if (ausentes.length) {
    console.log(`✗ ${ausentes.join(' e ')} não é um commit deste repositório; no CI, confira o fetch-depth do checkout (0 traz o histórico inteiro).`);
    return 2;
  }
  const saida = execFileSync('git', ['log', '-z', '--no-show-signature', `--format=${FORMATO_DO_LOG}`, `${base}..${head}`], { encoding: 'utf8', maxBuffer: Infinity });
  const fora = commitsForaDaRegra(saida.split('\0'));
  if (fora.length) {
    console.log(mensagem(fora, base));
    return 1;
  }
  console.log(`autoria ok em ${base}..${head}`);
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { EMAIL_DO_DONO, coautoresDeFora, semCoautoresDeFora, commitsForaDaRegra, mensagem };
