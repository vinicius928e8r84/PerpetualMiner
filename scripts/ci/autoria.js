'use strict';

// A autoria que o portão confere em todo PR (.github/workflows/regras.yml): cada commit de
// base..head tem como autor e committer o e-mail do dono. O committer `GitHub <noreply@github.com>`
// (o que o site põe no que edita ou mescla) passa em qualquer commit. Uso: node scripts/ci/autoria.js <base> <head>

const { execFileSync, spawnSync } = require('child_process');

const EMAIL_DO_DONO = '48294278+vinicius928e8r84@users.noreply.github.com';
const EMAIL_DO_GITHUB = 'noreply@github.com';

/** Os commits fora da regra: [{ sha, assunto, autor, committer }]. Cada linha: sha, autor, committer e assunto, separados por tabulação. */
function commitsForaDaRegra(linhas) {
  return linhas.filter(Boolean).map(linha => {
    const [sha, autor, committer, ...assunto] = linha.split('\t');
    return { sha, autor, committer, assunto: assunto.join('\t') };
  }).filter(({ autor, committer }) => autor !== EMAIL_DO_DONO || ![EMAIL_DO_DONO, EMAIL_DO_GITHUB].includes(committer));
}

/** A mensagem do erro: os commits e o comando que refaz a autoria. */
function mensagem(fora, base) {
  return [
    `✗ ${fora.length} commit(s) sem a autoria do dono (autor e committer ${EMAIL_DO_DONO}):`,
    ...fora.map(({ sha, autor, committer, assunto }) => `    ${sha.slice(0, 7)} ${assunto} (autor ${autor}, committer ${committer})`),
    '  Conserto: refaça a autoria da branch e envie de novo:',
    `    git config user.email ${EMAIL_DO_DONO}`,
    `    git rebase --rebase-merges --exec 'git commit --amend --no-edit --reset-author' ${base}`,
    '    git push --force-with-lease',
  ].join('\n');
}

/** As pontas que o clone não tem: o checkout raso do CI não traz a base. */
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
  const saida = execFileSync('git', ['log', '--format=%H%x09%ae%x09%ce%x09%s', `${base}..${head}`], { encoding: 'utf8' });
  const fora = commitsForaDaRegra(saida.split('\n'));
  if (fora.length) {
    console.log(mensagem(fora, base));
    return 1;
  }
  console.log(`autoria ok em ${base}..${head}`);
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { EMAIL_DO_DONO, commitsForaDaRegra, mensagem };
