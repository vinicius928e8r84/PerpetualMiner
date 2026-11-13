'use strict';

// A autoria que o portão confere em todo PR (.github/workflows/regras.yml) e o gancho pre-push antes de o push sair:
// cada commit de base..head tem como autor e committer o e-mail do dono, e nenhuma linha `Co-authored-by:` da
// mensagem, abaixo do assunto, dá o commit a outro e-mail. O committer `GitHub <noreply@github.com>` (o que o site põe no que edita ou
// mescla) passa em qualquer commit. Uso: node scripts/ci/autoria.js <base> <head>

const { execFileSync, spawnSync } = require('child_process');

const EMAIL_DO_DONO = '48294278+vinicius928e8r84@users.noreply.github.com';
const EMAIL_DO_GITHUB = 'noreply@github.com';
// Um registro por commit (`git log -z`): sha, autor, committer e assunto separados por tabulação; depois de \x1f, a mensagem inteira.
const FORMATO_DO_LOG = '%H%x09%ae%x09%ce%x09%s%x1f%B';
const REFAZER_A_AUTORIA = 'git commit --amend --no-edit --reset-author';
// Refaz a autoria e regrava a mensagem sem os co-autores de fora, tirados por scripts/ci/sem-coautor.js com as funções
// daqui, para o conserto tirar exatamente o que a conferência acusa. Sem aspas por dentro, para o comando da mensagem
// valer igual no sh, no Git Bash e no PowerShell.
const REFAZER_SEM_COAUTOR = 'git log -1 --no-show-signature --format=%B | node scripts/ci/sem-coautor.js | git commit --amend --reset-author -F -';
// O rebase que regrava mensagens: com o commit.cleanup=strip de quem roda, as linhas que começam com # sairiam delas.
const REBASE_QUE_REGRAVA = 'git -c commit.cleanup=whitespace rebase';

// Só ASCII nas expressões daqui para baixo: a mensagem lida como UTF-8 (a conferência) e byte a byte (o sem-coautor.js) dá o mesmo.
const aparar = texto => texto.replace(/^[ \t\r]+|[ \t\r]+$/g, '');

/**
 * As linhas de co-autor da mensagem, [{ de, ate, valor }] (índices em `linhas`): cada `Co-authored-by: valor`, em
 * qualquer caixa, com as linhas de continuação (as seguintes que começam com espaço ou tabulação, que o git junta ao
 * valor). A primeira linha é o assunto e não conta (para o git o título nunca é trailer). Linha é o que \n separa:
 * um \r solto ou um U+2028 no meio do texto não começam outra.
 */
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

/** O valor traz algum e-mail (`<…>`; sem nenhum, o valor inteiro) que não é o do dono. */
function deFora({ valor }) {
  const emails = [...valor.matchAll(/<([^<>]*)>/g)].map(([, email]) => aparar(email));
  return (emails.length ? emails : [valor]).some(email => email !== EMAIL_DO_DONO);
}

/** Os co-autores de fora: o valor de cada linha de co-autor da mensagem com algum e-mail que não é o do dono. */
function coautoresDeFora(mensagem) {
  return linhasDeCoautor(mensagem.split('\n')).filter(deFora).map(({ valor }) => valor);
}

/** A mensagem sem as linhas dos co-autores de fora (com as de continuação); o resto fica como está. */
function semCoautoresDeFora(mensagem) {
  const linhas = mensagem.split('\n');
  for (const { de, ate } of linhasDeCoautor(linhas).filter(deFora).reverse()) linhas.splice(de, ate - de);
  return linhas.join('\n');
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

module.exports = { EMAIL_DO_DONO, coautoresDeFora, semCoautoresDeFora, commitsForaDaRegra, mensagem };
