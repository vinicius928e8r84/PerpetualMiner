'use strict';

// A autoria que o portão confere em todo PR (.github/workflows/regras.yml) e o gancho pre-push antes de o push sair:
// cada commit de base..head tem como autor e committer o e-mail do dono, e nenhuma linha `Co-authored-by:` da
// mensagem dá o commit a outro e-mail. O committer `GitHub <noreply@github.com>` (o que o site põe no que edita ou
// mescla) passa em qualquer commit. Uso: node scripts/ci/autoria.js <base> <head>

const { execFileSync, spawnSync } = require('child_process');

const EMAIL_DO_DONO = '48294278+vinicius928e8r84@users.noreply.github.com';
const EMAIL_DO_GITHUB = 'noreply@github.com';
// Um registro por commit (`git log -z`): sha, autor, committer e assunto separados por tabulação; depois de \x1f, a mensagem inteira.
const FORMATO_DO_LOG = '%H%x09%ae%x09%ce%x09%s%x1f%B';
const REFAZER_A_AUTORIA = 'git commit --amend --no-edit --reset-author';
// Refaz a autoria e regrava a mensagem sem as linhas de co-autor (as mesmas que coautoresDeFora lê). Sem aspas por dentro,
// para o comando da mensagem valer igual no sh, no Git Bash e no PowerShell.
const REFAZER_SEM_COAUTOR = 'git log -1 --no-show-signature --format=%B | grep -vi ^co-authored-by[[:blank:]]*: | git commit --amend --reset-author -F -';

/**
 * Os co-autores de fora: o valor de cada linha `Co-authored-by: Nome <e-mail>` (em qualquer caixa) com algum e-mail
 * que não é o do dono. Sem `<…>`, o valor inteiro é o e-mail.
 */
function coautoresDeFora(mensagem) {
  return [...mensagem.matchAll(/^co-authored-by[ \t]*:(.*)$/gim)]
    .map(([, valor]) => valor.trim())
    .filter(valor => {
      const emails = [...valor.matchAll(/<([^<>]*)>/g)].map(([, email]) => email.trim());
      return (emails.length ? emails : [valor]).some(email => email !== EMAIL_DO_DONO);
    });
}

/** Os commits fora da regra: [{ sha, assunto, autor, committer, coautores }], de registros no FORMATO_DO_LOG (a mensagem é opcional). */
function commitsForaDaRegra(registros) {
  return registros.filter(Boolean).map(registro => {
    const fim = registro.indexOf('\x1f');
    const [sha, autor, committer, ...assunto] = (fim < 0 ? registro : registro.slice(0, fim)).split('\t');
    return { sha, autor, committer, assunto: assunto.join('\t'), coautores: fim < 0 ? [] : coautoresDeFora(registro.slice(fim + 1)) };
  }).filter(({ autor, committer, coautores }) => autor !== EMAIL_DO_DONO || ![EMAIL_DO_DONO, EMAIL_DO_GITHUB].includes(committer) || coautores.length > 0);
}

/** A mensagem do erro: os commits e o comando que refaz a autoria (e tira as linhas de co-autor, quando são elas que barram). */
function mensagem(fora, base) {
  const refazer = fora.some(({ coautores }) => coautores.length > 0) ? REFAZER_SEM_COAUTOR : REFAZER_A_AUTORIA;
  return [
    `✗ ${fora.length} commit(s) sem a autoria do dono (autor, committer e todo Co-authored-by ${EMAIL_DO_DONO}):`,
    ...fora.map(({ sha, autor, committer, assunto, coautores }) =>
      `    ${sha.slice(0, 7)} ${assunto} (autor ${autor}, committer ${committer}${coautores.map(coautor => `, co-autor ${coautor}`).join('')})`),
    '  Conserto: refaça a autoria da branch e envie de novo:',
    `    git config user.email ${EMAIL_DO_DONO}`,
    `    git rebase --rebase-merges --exec '${refazer}' ${base}`,
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
  // Sem teto de saída: as mensagens inteiras de uma branch longa passam do 1 MB que o Node dá por padrão.
  // --no-show-signature: com log.showSignature ligado, a linha da assinatura viria antes de cada registro.
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

module.exports = { EMAIL_DO_DONO, coautoresDeFora, commitsForaDaRegra, mensagem };
