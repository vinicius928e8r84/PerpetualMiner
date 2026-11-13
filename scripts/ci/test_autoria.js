'use strict';

// A autoria dos commits (scripts/ci/autoria.js), que o workflow Regras confere em todo PR e o gancho pre-push antes de o
// push sair: autor, committer e co-autores de cada commit, a mensagem do erro e o comando de conserto que ela dá.

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EMAIL_DO_DONO, coautoresDeFora, semCoautoresDeFora, commitsForaDaRegra, mensagem } = require('./autoria.js');

const linha = (sha, autor, committer, assunto = 'x') => [sha, autor, committer, assunto].join('\t');
assert.deepStrictEqual(commitsForaDaRegra([linha('a1', EMAIL_DO_DONO, EMAIL_DO_DONO), '']), [], 'autor e committer do dono');
assert.deepStrictEqual(commitsForaDaRegra([linha('a2', EMAIL_DO_DONO, 'noreply@github.com')]), [], 'o committer GitHub dos merges do site');
assert.deepStrictEqual(commitsForaDaRegra([linha('a3', 'agente@exemplo.com', EMAIL_DO_DONO)]).map(c => c.sha), ['a3'], 'autor de outra pessoa');
assert.deepStrictEqual(commitsForaDaRegra([linha('a4', EMAIL_DO_DONO, 'agente@exemplo.com')]).map(c => c.sha), ['a4'], 'committer de outra pessoa');
assert.deepStrictEqual(commitsForaDaRegra([linha('a5', 'noreply@github.com', EMAIL_DO_DONO)]).map(c => c.sha), ['a5'], 'o autor não tem a exceção do GitHub');
assert.deepStrictEqual(commitsForaDaRegra([linha('a6', EMAIL_DO_DONO, EMAIL_DO_DONO, 'com\ttabulação')]), [], 'tabulação no assunto');
assert.match(mensagem(commitsForaDaRegra([linha('abcdef0123', 'agente@exemplo.com', EMAIL_DO_DONO, 'um assunto')]), 'origin/main'),
  /abcdef0 um assunto[^]*git rebase --rebase-merges --exec 'git commit --amend --no-edit --reset-author' origin\/main/, 'a mensagem dá o comando');

// O co-autor (#425): uma linha `Co-authored-by:` com outro e-mail também tira o commit do dono, com autor e committer certos.
const comMensagem = (sha, mensagemDoCommit) => `${linha(sha, EMAIL_DO_DONO, EMAIL_DO_DONO, 'um assunto')}\x1f${mensagemDoCommit}`;
const DO_AGENTE = 'Co-Authored-By: Claude <noreply@anthropic.com>';
assert.deepStrictEqual(commitsForaDaRegra([comMensagem('b1', 'um assunto\n\ncorpo\n')]), [], 'mensagem sem co-autor');
assert.deepStrictEqual(commitsForaDaRegra([comMensagem('b2', `um assunto\n\n${DO_AGENTE}\n`)]).map(c => [c.sha, c.coautores]),
  [['b2', ['Claude <noreply@anthropic.com>']]], 'o trailer do agente barra, com autor e committer do dono');
assert.deepStrictEqual(commitsForaDaRegra([comMensagem('b3', `um assunto\n\nCo-authored-by: vinicius928e8r84 <${EMAIL_DO_DONO}>\n`)]), [], 'o dono como co-autor passa');
assert.deepStrictEqual(coautoresDeFora(`a\n\nco-authored-by: Um <um@exemplo.com>\r\nCO-AUTHORED-BY : dois@exemplo.com\n\nmais texto\nCo-authored-by: n <${EMAIL_DO_DONO}>\n`),
  ['Um <um@exemplo.com>', 'dois@exemplo.com'], 'qualquer caixa, CRLF, sem colchetes e fora do último parágrafo; o do dono fica de fora');
assert.deepStrictEqual(coautoresDeFora(`a\n\nCo-authored-by: Claude <noreply@anthropic.com> <${EMAIL_DO_DONO}>\n`), [`Claude <noreply@anthropic.com> <${EMAIL_DO_DONO}>`],
  'o e-mail do dono ao lado de outro não livra a linha');
assert.deepStrictEqual(coautoresDeFora('a\n\ntexto colado\u2028Co-authored-by: Um <um@exemplo.com>\ntexto\rCo-authored-by: Dois <dois@exemplo.com>\n'), [],
  'só \\n separa as linhas: depois de um U+2028 ou de um \\r solto não começa outra');
assert.deepStrictEqual(coautoresDeFora('a\n\nCo-authored-by: Um <um@exemplo.com>\u2028resto\n'), ['Um <um@exemplo.com>\u2028resto'],
  'a linha que começa com Co-authored-by conta inteira, com o que vier depois de um U+2028');
assert.deepStrictEqual(coautoresDeFora('Co-authored-by: Um <um@exemplo.com>\n\ncorpo\n'), [], 'a primeira linha é o assunto, não um trailer');
assert.deepStrictEqual(coautoresDeFora('assunto\nCo-authored-by: Um <um@exemplo.com>\n'), ['Um <um@exemplo.com>'], 'da segunda linha em diante conta');
assert.deepStrictEqual(coautoresDeFora(`a\n\nCo-authored-by: <${EMAIL_DO_DONO}>\n <um@exemplo.com>\nCo-authored-by: Dois\n\t<dois@exemplo.com>\n \nfim\n`),
  [`<${EMAIL_DO_DONO}> <um@exemplo.com>`, 'Dois <dois@exemplo.com>'], 'a linha de continuação (começa com espaço ou tabulação) entra no valor, como no git');
// O filtro do conserto tira o que a conferência acusa, com as linhas de continuação, e mais nada.
{
  const comTudo = `Co-authored-by: Assunto <a@exemplo.com>\n\ncorpo\r\n#1\nCo-authored-by em prosa\n  Co-authored-by: recuado <r@exemplo.com>\n\n`
    + `Co-Authored-By: Um <um@exemplo.com>\nCo-authored-by: n <${EMAIL_DO_DONO}>\nco-authored-by : Dois\n <dois@exemplo.com>\n\tmais\nfim\u2028Co-authored-by: Tres <t@exemplo.com>\n`;
  const limpa = semCoautoresDeFora(comTudo);
  assert.strictEqual(limpa, `Co-authored-by: Assunto <a@exemplo.com>\n\ncorpo\r\n#1\nCo-authored-by em prosa\n  Co-authored-by: recuado <r@exemplo.com>\n\n`
    + `Co-authored-by: n <${EMAIL_DO_DONO}>\nfim\u2028Co-authored-by: Tres <t@exemplo.com>\n`, 'saem só os co-autores de fora; o assunto, o corpo, a prosa e o do dono ficam');
  assert.deepStrictEqual(coautoresDeFora(comTudo), ['Um <um@exemplo.com>', 'Dois <dois@exemplo.com> mais'], 'os que a conferência acusa nessa mensagem');
  assert.deepStrictEqual(coautoresDeFora(limpa), [], 'depois do filtro a conferência não acusa nada');
  // Pela linha de comando, como o conserto chama: os bytes que não são da linha tirada saem como entraram (aqui, um latin1 que não é UTF-8).
  const bytes = Buffer.concat([Buffer.from('assunto\n\nsa\xfade\n', 'latin1'), Buffer.from('Co-Authored-By: Zé <ze@exemplo.com>\n continua\nação\n', 'utf8')]);
  const filtro = spawnSync('node', [path.join(__dirname, 'sem-coautor.js')], { input: bytes });
  assert.strictEqual(filtro.status, 0, String(filtro.stderr));
  assert.deepStrictEqual(filtro.stdout, Buffer.concat([Buffer.from('assunto\n\nsa\xfade\n', 'latin1'), Buffer.from('ação\n', 'utf8')]), 'o filtro não mexe nos outros bytes');
}
assert.deepStrictEqual(coautoresDeFora('Tira o Co-authored-by: Claude <noreply@anthropic.com> das mensagens\n\n  Co-authored-by: citado <c@exemplo.com>\n'), [],
  'só a linha que começa com Co-authored-by conta');
{
  const texto = mensagem(commitsForaDaRegra([comMensagem('abcdef0123', `um assunto\n\n${DO_AGENTE}\n`)]), 'origin/main');
  assert.match(texto, /abcdef0 um assunto \(autor [^,]+, committer [^,]+, co-autor Claude <noreply@anthropic\.com>\)/, 'a mensagem nomeia o commit e o co-autor');
  assert(texto.includes("git -c commit.cleanup=whitespace rebase --rebase-merges --exec 'git log -1 --no-show-signature --format=%B | node scripts/ci/sem-coautor.js | git commit --amend --reset-author -F -' origin/main"),
    'com co-autor, o comando também tira as linhas dele');
}

// Sobre um repositório de verdade, pelo mesmo comando que o workflow roda.
{
  const repoDeAutoria = fs.mkdtempSync(path.join(os.tmpdir(), 'autoria-'));
  const gitA = (autor, ...args) => execFileSync('git', args, {
    cwd: repoDeAutoria, encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'n', GIT_AUTHOR_EMAIL: autor, GIT_COMMITTER_NAME: 'n', GIT_COMMITTER_EMAIL: autor },
  });
  const rodarAutoria = () => spawnSync('node', [path.join(__dirname, 'autoria.js'), 'main', 'HEAD'], { cwd: repoDeAutoria, encoding: 'utf8' });
  const commitar = (autor, assunto, arquivo = 'arquivo.txt') => {
    fs.writeFileSync(path.join(repoDeAutoria, arquivo), `${assunto}\n`);
    gitA(autor, 'add', '-A');
    gitA(autor, 'commit', '-q', '-m', assunto);
  };
  gitA(EMAIL_DO_DONO, 'init', '-q', '-b', 'main');
  commitar(EMAIL_DO_DONO, 'base');
  gitA(EMAIL_DO_DONO, 'checkout', '-q', '-b', 'ramo');
  commitar(EMAIL_DO_DONO, 'feito certo');
  assert.strictEqual(rodarAutoria().status, 0, 'só commits do dono');
  commitar('agente@exemplo.com', 'do agente');
  const falha = rodarAutoria();
  assert.strictEqual(falha.status, 1, 'um commit de outro e-mail barra');
  assert(falha.stdout.includes('do agente') && !falha.stdout.includes('feito certo'), 'a mensagem nomeia só o commit errado');
  execFileSync('git', ['rebase', '-q', '--rebase-merges', '--exec', 'git commit --amend --no-edit --reset-author', 'main'], {
    cwd: repoDeAutoria,
    env: { ...process.env, GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'user.email', GIT_CONFIG_VALUE_0: EMAIL_DO_DONO, GIT_CONFIG_KEY_1: 'user.name', GIT_CONFIG_VALUE_1: 'n' },
  });
  assert.strictEqual(rodarAutoria().status, 0, 'o comando da mensagem refaz a autoria');
  // Com um merge no meio: o comando refaz a autoria dos dois lados e do próprio merge.
  gitA(EMAIL_DO_DONO, 'checkout', '-q', '-b', 'lateral', 'main');
  commitar('agente@exemplo.com', 'lateral do agente', 'lateral.txt');
  gitA(EMAIL_DO_DONO, 'checkout', '-q', 'ramo');
  gitA('agente@exemplo.com', 'merge', '-q', '--no-ff', '--no-edit', 'lateral');
  const comMerge = rodarAutoria();
  assert.strictEqual(comMerge.status, 1, 'o merge e o lado de outro e-mail barram');
  assert(comMerge.stdout.includes('lateral do agente') && /Merge branch/.test(comMerge.stdout), 'a mensagem nomeia o commit do lado e o merge');
  execFileSync('git', ['rebase', '-q', '--rebase-merges', '--exec', 'git commit --amend --no-edit --reset-author', 'main'], {
    cwd: repoDeAutoria,
    env: { ...process.env, GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'user.email', GIT_CONFIG_VALUE_0: EMAIL_DO_DONO, GIT_CONFIG_KEY_1: 'user.name', GIT_CONFIG_VALUE_1: 'n' },
  });
  assert.strictEqual(rodarAutoria().status, 0, 'o comando da mensagem refaz a autoria também com merge');
  assert(gitA(EMAIL_DO_DONO, 'log', '--merges', '--format=%H', 'main..HEAD').trim(), 'o merge continua no histórico');

  // Daqui em diante os commits são assinados e o clone tem log.showSignature ligado: o git log põe a linha da assinatura
  // antes de cada commit, e nem a conferência nem o comando do conserto a leem.
  const chave = path.join(repoDeAutoria, '.git', 'chave-de-teste');
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', '', '-f', chave]);
  fs.writeFileSync(`${chave}.permitidos`, `${EMAIL_DO_DONO} ${fs.readFileSync(`${chave}.pub`, 'utf8')}`);
  for (const [nome, valor] of [['gpg.format', 'ssh'], ['user.signingkey', `${chave}.pub`], ['gpg.ssh.allowedSignersFile', `${chave}.permitidos`],
    ['commit.gpgsign', 'true'], ['log.showSignature', 'true']]) {
    gitA(EMAIL_DO_DONO, 'config', nome, valor);
  }
  commitar(EMAIL_DO_DONO, 'Co-authored-by: No assunto <assunto@exemplo.com>', 'antes.txt');
  assert.match(gitA(EMAIL_DO_DONO, 'log', '-1', '--format=%s'), /signature/i, 'o git log deste clone mostra a linha da assinatura');
  const assinado = rodarAutoria();
  assert.strictEqual(assinado.status, 0, `a linha da assinatura não entra na conta: ${assinado.stdout}`);

  // Autor e committer do dono e co-autores de outro e-mail na mensagem (um deles em duas linhas): barra, e o comando que a mensagem dá tira só essas linhas.
  // (Os co-autores são de exemplo.com porque um gancho commit-msg da máquina pode tirar o trailer de um agente conhecido antes de o commit existir.)
  fs.writeFileSync(path.join(repoDeAutoria, 'coautor.txt'), 'x\n');
  gitA(EMAIL_DO_DONO, 'add', '-A');
  gitA(EMAIL_DO_DONO, 'commit', '-q', '-m', 'com co-autor', '-m', 'O corpo fica.\n#425 também fica.\nCo-authored-by em prosa também fica.',
    '-m', `Co-Authored-By: Agente <agente@exemplo.com>\nCo-authored-by: n <${EMAIL_DO_DONO}>\nco-authored-by : Outra\n <outra@exemplo.com>`);
  const comCoautor = rodarAutoria();
  assert.strictEqual(comCoautor.status, 1, `um co-autor de outro e-mail barra: ${comCoautor.stdout}`);
  assert(/com co-autor \(.*, co-autor Agente <agente@exemplo\.com>, co-autor Outra <outra@exemplo\.com>\)/.test(comCoautor.stdout)
    && !comCoautor.stdout.includes('No assunto'), `a mensagem nomeia só o commit dos co-autores: ${comCoautor.stdout}`);
  assert(comCoautor.stdout.includes(`\n    ${gitA(EMAIL_DO_DONO, 'rev-parse', 'HEAD').slice(0, 7)} com co-autor (`), `a linha da assinatura não entra no sha: ${comCoautor.stdout}`);
  const [, opcoes, refazer] = /git (-c \S+ )rebase --rebase-merges --exec '([^']+)' main/.exec(comCoautor.stdout);
  // Quem roda o conserto tem commit.cleanup=strip, que tira de uma mensagem regravada as linhas que começam com #.
  gitA(EMAIL_DO_DONO, 'config', 'commit.cleanup', 'strip');
  const rodarConserto = () => spawnSync('git', [...opcoes.trim().split(' '), 'rebase', '-q', '--rebase-merges', '--exec', refazer, 'main'], {
    cwd: repoDeAutoria, encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'user.email', GIT_CONFIG_VALUE_0: EMAIL_DO_DONO, GIT_CONFIG_KEY_1: 'user.name', GIT_CONFIG_VALUE_1: 'n' },
  });
  // Numa base que ainda não tem o scripts/ci/sem-coautor.js, o conserto para no primeiro commit e nenhuma mensagem muda.
  const pontaBarrada = gitA(EMAIL_DO_DONO, 'rev-parse', 'HEAD');
  assert.notStrictEqual(rodarConserto().status, 0, 'sem o filtro na base, o rebase para');
  gitA(EMAIL_DO_DONO, 'rebase', '--abort');
  assert.strictEqual(gitA(EMAIL_DO_DONO, 'rev-parse', 'HEAD'), pontaBarrada, 'e a branch fica como estava');
  // Com a base em dia (a main traz a conferência e o filtro), o comando conserta.
  gitA(EMAIL_DO_DONO, 'checkout', '-q', 'main');
  fs.mkdirSync(path.join(repoDeAutoria, 'scripts', 'ci'), { recursive: true });
  for (const arquivo of ['autoria.js', 'sem-coautor.js']) fs.copyFileSync(path.join(__dirname, arquivo), path.join(repoDeAutoria, 'scripts', 'ci', arquivo));
  gitA(EMAIL_DO_DONO, 'add', '-A');
  gitA(EMAIL_DO_DONO, 'commit', '-q', '-m', 'a conferência e o filtro');
  gitA(EMAIL_DO_DONO, 'checkout', '-q', 'ramo');
  const conserto = rodarConserto();
  assert.strictEqual(conserto.status, 0, `o comando da mensagem roda até o fim: ${conserto.stderr}`);
  assert.strictEqual(rodarAutoria().status, 0, 'o comando da mensagem tira os co-autores');
  assert.strictEqual(gitA(EMAIL_DO_DONO, 'log', '-1', '--no-show-signature', '--format=%B').trim(),
    `com co-autor\n\nO corpo fica.\n#425 também fica.\nCo-authored-by em prosa também fica.\n\nCo-authored-by: n <${EMAIL_DO_DONO}>`,
    'o assunto, o corpo, a linha com #, a prosa e o dono como co-autor ficam; a linha da assinatura não entra na mensagem');
  assert.strictEqual(gitA(EMAIL_DO_DONO, 'log', '-1', '--no-show-signature', '--format=%s', 'HEAD~1').trim(), 'Co-authored-by: No assunto <assunto@exemplo.com>',
    'o assunto de um commit nunca é tirado');
  assert(gitA(EMAIL_DO_DONO, 'log', '--merges', '--no-show-signature', '--format=%H', 'main..HEAD').trim(), 'o merge continua no histórico');
  // As mensagens somadas passam de 1 MB (o teto de saída padrão do Node): a conferência lê tudo e responde.
  fs.writeFileSync(path.join(repoDeAutoria, 'longa.txt'), `mensagem longa\n\n${`${'x'.repeat(100000)}\n`.repeat(12)}`);
  gitA(EMAIL_DO_DONO, 'commit', '-q', '--allow-empty', '-F', 'longa.txt');
  const comLonga = rodarAutoria();
  assert.strictEqual(comLonga.status, 0, `mensagens de mais de 1 MB não derrubam a conferência: ${comLonga.stderr.slice(0, 300)}`);

  // Uma ponta que o clone não tem (checkout raso): uma mensagem que manda conferir o fetch-depth, não o stack do Node.
  const semPonta = spawnSync('node', [path.join(__dirname, 'autoria.js'), 'origin/main', 'HEAD'], { cwd: repoDeAutoria, encoding: 'utf8' });
  assert.strictEqual(semPonta.status, 2, 'ponta ausente é erro de uso');
  assert(/origin\/main/.test(semPonta.stdout) && /fetch-depth/.test(semPonta.stdout), 'a mensagem nomeia a ponta e o fetch-depth');
  assert(!/at |node:internal/.test(semPonta.stderr), 'sem stack do Node');
  fs.rmSync(repoDeAutoria, { recursive: true, force: true });
}

// O passo de autoria roda mesmo quando um passo anterior falha, para o erro dela aparecer na mesma rodada.
{
  const regrasYml = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'regras.yml'), 'utf8');
  const passo = regrasYml.split('- name: Autoria dos commits')[1].split('run:')[0];
  assert(/if: \$\{\{ !cancelled\(\) && /.test(passo), 'o passo de autoria tem !cancelled()');
}

console.log('autoria ok');
