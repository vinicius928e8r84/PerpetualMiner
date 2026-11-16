'use strict';

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { conferir: conferirNoCodigo } = require('./politica-do-site.js');
const { lerYaml, rodaNoPR, comandos } = require('../yaml-de-workflow');

const RAIZ = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(__dirname, 'politica-do-site.js');
const LINK = 'https://github.com/vinicius928e8r84/perpetualminer-site/pull/41';

const MANIFEST = {
  manifest_version: 3,
  version: '5.0.1',
  permissions: ['storage', 'tabs'],
  host_permissions: ['https://firestore.googleapis.com/*'],
  content_scripts: [{ matches: ['<all_urls>'], js: ['content.js'] }],
  oauth2: { client_id: 'abc', scopes: ['email'] },
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'politica-do-site-'));
let contador = 0;
const git = (pasta, ...args) => execFileSync('git', ['-c', `core.hooksPath=${os.devNull}`, '-c', 'commit.gpgsign=false', ...args], { cwd: pasta, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function escrever(pasta, arquivo, conteudo) {
  const alvo = path.join(pasta, arquivo);
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  fs.writeFileSync(alvo, typeof conteudo === 'string' ? conteudo : `${JSON.stringify(conteudo, null, 2)}\n`);
}

function iniciar(nome) {
  const pasta = path.join(tmp, nome);
  fs.mkdirSync(pasta);
  git(pasta, 'init', '-q', '-b', 'main');
  git(pasta, 'config', 'user.email', 'a@exemplo.com');
  git(pasta, 'config', 'user.name', 'a');
  escrever(pasta, 'manifest.json', MANIFEST);
  escrever(pasta, 'popup.js', "const API = 'https://api.exemplo.com/v1';\nconst gravar = chrome.storage.local.set;\n");
  escrever(pasta, 'lib/outro.js', 'chrome.identity.getAuthToken({});\n');
  escrever(pasta, 'docs/leia-me.md', 'um texto\n');
  escrever(pasta, 'docs/seguranca/firestore.rules', 'rules_version = "2";\n');
  escrever(pasta, 'complemento/chaves.py', 'X = 1\n');
  git(pasta, 'add', '-A');
  git(pasta, 'commit', '-q', '-m', 'base');
  return pasta;
}

const BASE = iniciar('base');

function repositorio(mudar) {
  const ramo = `caso-${contador++}`;
  git(BASE, 'checkout', '-q', '-B', ramo, 'main');
  mudar(BASE);
  git(BASE, 'add', '-A');
  git(BASE, 'commit', '-q', '-m', ramo);
  return ramo;
}

const rodar = (ramo, corpo, args) => spawnSync('node', [SCRIPT, ...args], { cwd: BASE, encoding: 'utf8', env: { PATH: process.env.PATH, PR_BODY: corpo } });
const conferir = (ramo, corpo, args = ['main', ramo]) => {
  const { status, stdout, stderr } = rodar(ramo, corpo, args);
  return { status, saida: stdout + stderr };
};
const espera = (caso, ramo, corpo, status, padrao) => {
  const feito = conferirNoCodigo({ raiz: BASE, base: 'main', ponta: ramo, corpo });
  assert.strictEqual(feito.codigo, status, `${caso}: saiu ${feito.codigo}\n${feito.mensagem}`);
  if (padrao) assert.match(feito.mensagem, padrao, caso);
  return feito;
};
const corpoCom = linha => `## Summary\n\nx\n\n## Merge Danger\n\n**Door:** two-way\n\n**Blast Radius:** CI\n\n**Atenção:** BAIXA\n\n${linha}\n`;

const comEnderecoNovo = repositorio(pasta => escrever(pasta, 'popup.js', "const API = 'https://api.exemplo.com/v1';\nconst NOVA = 'https://nuvem.nova.com/enviar';\n"));
const pelaLinhaDeComando = conferir(comEnderecoNovo, corpoCom(`**Política:** ${LINK}`));
assert.strictEqual(pelaLinhaDeComando.status, 0, `pela linha de comando, com o corpo no ambiente: ${pelaLinhaDeComando.saida}`);
assert.strictEqual(conferir(comEnderecoNovo, '').status, 1, 'pela linha de comando, sem a linha');
espera('sinal, corpo vazio', comEnderecoNovo, '', 1, /endereço de fora novo: https:\/\/nuvem\.nova\.com[^]*Política:/);
espera('sinal, corpo sem a linha', comEnderecoNovo, corpoCom(''), 1);
espera('sinal, link na linha Política', comEnderecoNovo, corpoCom(`**Política:** ${LINK}`), 0, /traz a PR da política/);
espera('sinal, o link com o texto do markdown', comEnderecoNovo, corpoCom(`Política: [PR da política](${LINK})`), 0);
espera('sinal, o link com o fim da página', comEnderecoNovo, corpoCom(`Política: ${LINK}/files`), 0);
espera('sinal, link só dentro de comentário HTML', comEnderecoNovo, corpoCom(`<!-- Política: ${LINK} -->\n**Política:**`), 1);
espera('sinal, link em bloco de código', comEnderecoNovo, corpoCom(`\`\`\`\nPolítica: ${LINK}\n\`\`\``), 1);
espera('sinal, link em citação', comEnderecoNovo, corpoCom(`> Política: ${LINK}`), 1);
espera('sinal, link fora da linha Política', comEnderecoNovo, corpoCom(`**Política:**\n\nVeja ${LINK}`), 1);
espera('sinal, PR de outro repositório', comEnderecoNovo, corpoCom('Política: https://github.com/vinicius928e8r84/PerpetualMiner/pull/41'), 1);
espera('sinal, link que não é de PR', comEnderecoNovo, corpoCom('Política: https://github.com/vinicius928e8r84/perpetualminer-site/issues/41'), 1);
espera('sinal, sem mudança sem motivo', comEnderecoNovo, corpoCom('**Política:** sem mudança'), 1);
espera('sinal, sem mudança com os dois pontos e sem motivo', comEnderecoNovo, corpoCom('**Política:** sem mudança:  '), 1);
espera('sinal, sem mudança com motivo', comEnderecoNovo, corpoCom('**Política:** sem mudança: o endereço é o mesmo serviço da política'), 0, /declara a política sem mudança, com motivo/);
espera('sinal, sem mudança com motivo, sem acento e em minúsculas', comEnderecoNovo, corpoCom('politica: SEM MUDANCA: motivo'), 0);
espera('sinal, sem corpo nenhum (a PR sem descrição)', comEnderecoNovo, undefined, 1);

const soDocumentacao = repositorio(pasta => escrever(pasta, 'docs/leia-me.md', 'um texto novo https://exemplo.org/doc\n'));
espera('sem sinal, corpo vazio', soDocumentacao, '', 0, /nenhum sinal de dados mudou/);
espera('sem sinal, sem mudança', soDocumentacao, corpoCom('**Política:** sem mudança'), 0);

const semSinal = (caso, mudar) => espera(caso, repositorio(mudar), '', 0, /nenhum sinal/);
const comSinal = (caso, mudar, padrao) => espera(caso, repositorio(mudar), '', 1, padrao);

semSinal('um endereço que só mudou de arquivo', pasta => {
  escrever(pasta, 'popup.js', 'const gravar = chrome.storage.local.set;\n');
  escrever(pasta, 'lib/outro.js', "const API = 'https://api.exemplo.com/v1';\n");
});
semSinal('o mesmo endereço com outro caminho', pasta => escrever(pasta, 'popup.js', "const API = 'https://api.exemplo.com/v2/outra';\nconst gravar = chrome.storage.local.set;\n"));
semSinal('um endereço novo só num teste', pasta => escrever(pasta, 'test_popup.js', "const API = 'https://so-de-teste.com/x';\n"));
semSinal('um endereço novo só nos testes de uma pasta', pasta => escrever(pasta, 'lib/test_outro.js', "const API = 'https://so-de-teste.com/x';\n"));
semSinal('um endereço novo no e2e, nos scripts, no preview e nos docs', pasta => {
  for (const arquivo of ['e2e/fakes/a.js', 'scripts/b.js', 'preview/c.js', 'docs/d.js', '.agents/e.js']) escrever(pasta, arquivo, "const A = 'https://so-de-fora.com/x';\n");
});
semSinal('um endereço novo no contrato de exemplos', pasta => escrever(pasta, 'complemento/contrato/exemplos.py', "A = 'https://so-no-contrato.com/x'\n"));
semSinal('o endereço local e o da W3C', pasta => escrever(pasta, 'lib/outro.js', "const A = 'http://127.0.0.1:8766/x';\nconst B = 'http://localhost:1/x';\nconst C = 'http://www.w3.org/2000/svg';\n"));
semSinal('só a versão do manifest mudou', pasta => escrever(pasta, 'manifest.json', { ...MANIFEST, version: '5.0.2' }));
semSinal('só a ordem dos campos do manifest mudou', pasta => escrever(pasta, 'manifest.json', Object.fromEntries(Object.entries(MANIFEST).reverse())));
semSinal('o uso de chrome.storage.local', pasta => escrever(pasta, 'lib/outro.js', 'chrome.storage.local.get(1);\n'));
semSinal('o uso de chrome.identity que só mudou de arquivo', pasta => {
  escrever(pasta, 'popup.js', "const API = 'https://api.exemplo.com/v1';\nchrome.identity.getAuthToken({});\n");
  escrever(pasta, 'lib/outro.js', 'module.exports = {};\n');
});

comSinal('um endereço que saiu', pasta => escrever(pasta, 'popup.js', 'const gravar = chrome.storage.local.set;\n'), /endereço de fora que saiu: https:\/\/api\.exemplo\.com/);
comSinal('chrome.storage.sync novo', pasta => escrever(pasta, 'lib/outro.js', 'chrome.storage.sync.set({});\n'), /uso novo de: chrome\.storage\.sync/);
for (const api of ['identity', 'cookies', 'history', 'webRequest']) {
  comSinal(`chrome.${api} novo`, pasta => escrever(pasta, 'popup.js', `chrome.${api}.getAuthToken();\n`), new RegExp(`uso novo de: chrome\\.${api}`));
}
comSinal('uma permissão nova no manifest', pasta => escrever(pasta, 'manifest.json', { ...MANIFEST, permissions: [...MANIFEST.permissions, 'cookies'] }), /manifest\.json: permissões/);
comSinal('um host novo no manifest', pasta => escrever(pasta, 'manifest.json', { ...MANIFEST, host_permissions: [...MANIFEST.host_permissions, 'https://x.com/*'] }), /manifest\.json: permissões/);
comSinal('uma permissão opcional no manifest', pasta => escrever(pasta, 'manifest.json', { ...MANIFEST, optional_permissions: ['nativeMessaging'] }), /manifest\.json/);
comSinal('o oauth2 do manifest', pasta => escrever(pasta, 'manifest.json', { ...MANIFEST, oauth2: { ...MANIFEST.oauth2, scopes: ['email', 'profile'] } }), /manifest\.json/);
comSinal('os sites dos scripts de conteúdo', pasta => escrever(pasta, 'manifest.json', { ...MANIFEST, content_scripts: [{ matches: ['https://*.youtube.com/*'], js: ['content.js'] }] }), /manifest\.json/);
comSinal('as regras do Firestore', pasta => escrever(pasta, 'docs/seguranca/firestore.rules', 'rules_version = "3";\n'), /arquivo de regra de dados: docs\/seguranca\/firestore\.rules/);
comSinal('um arquivo de regra de dados da Conexão', pasta => escrever(pasta, 'complemento/chaves.py', 'X = 2\n'), /arquivo de regra de dados: complemento\/chaves\.py/);
for (const arquivo of ['retencao_dos_envios', 'pasta_de_dados', 'nuvem_da_chave']) {
  comSinal(`complemento/${arquivo}.py`, pasta => escrever(pasta, `complemento/${arquivo}.py`, 'X = 1\n'), new RegExp(`complemento/${arquivo}\\.py`));
}

const ramoComDois = repositorio(pasta => {
  escrever(pasta, 'popup.js', "const NOVA = 'https://nuvem.nova.com/enviar';\n");
  escrever(pasta, 'lib/outro.js', 'chrome.cookies.getAll({});\n');
});
espera('os sinais são todos ditos', ramoComDois, '', 1, /endereço de fora novo: https:\/\/nuvem\.nova\.com[^]*uso novo de: chrome\.cookies/);

const aposAMain = iniciar('depois');
git(aposAMain, 'checkout', '-q', '-b', 'pr');
escrever(aposAMain, 'lib/outro.js', "const A = 'https://so-na-pr.com/x';\n");
git(aposAMain, 'commit', '-q', '-am', 'pr');
git(aposAMain, 'checkout', '-q', 'main');
escrever(aposAMain, 'lib/outro.js', "const A = 'https://so-na-main.com/x';\n");
git(aposAMain, 'commit', '-q', '-am', 'a main andou');
const depois = spawnSync('node', [SCRIPT, 'main', 'pr'], { cwd: aposAMain, encoding: 'utf8', env: { PATH: process.env.PATH, PR_BODY: '' } });
assert.strictEqual(depois.status, 1, 'a mudança da PR é a que vale');
assert(depois.stderr.includes('so-na-pr.com') && !depois.stderr.includes('so-na-main.com'), `a mudança da main depois do ramo não é da PR: ${depois.stderr}`);

const dois = repositorio(pasta => escrever(pasta, 'popup.js', "const NOVA = 'https://nuvem.nova.com/enviar';\n"));
assert.strictEqual(conferir(dois, '', [dois, 'main']).status, 0, 'de volta à main não há o que a PR mude');
assert.strictEqual(conferir(dois, '', ['main', dois]).status, 1, 'a ponta pode ser dita');
assert.strictEqual(conferir(dois, '', ['main']).status, 1, 'sem a ponta vale o HEAD, que aqui é o ramo da PR');
assert.strictEqual(conferir(dois, '', []).status, 2, 'sem a base');
const semBase = conferir(dois, '', ['origin/nao-existe']);
assert.strictEqual(semBase.status, 2, 'base que não existe');
assert.match(semBase.saida, /origin\/nao-existe/);
assert.strictEqual(conferir(dois, '', ['main', 'nao-existe']).status, 2, 'ponta que não existe');
assert.strictEqual(spawnSync('node', [SCRIPT, 'main'], { cwd: tmp, encoding: 'utf8', env: { PATH: process.env.PATH } }).status, 2, 'fora de um repositório');

{
  const workflow = lerYaml(fs.readFileSync(path.join(RAIZ, '.github', 'workflows', 'regras.yml'), 'utf8'));
  assert(rodaNoPR(workflow), 'o workflow roda em pull_request');
  assert(workflow.on.pull_request.types.includes('edited'), 'editar o corpo roda o check de novo');
  const passo = workflow.jobs.regras.steps.find(p => p.name === 'Política do site');
  assert(passo, 'o passo "Política do site"');
  assert(/github\.event_name == 'pull_request'/.test(passo.if), 'só em PR');
  assert.strictEqual(passo.run, 'node scripts/ci/politica-do-site.js "origin/${{ github.base_ref }}"', 'a base é a da PR');
  assert.deepStrictEqual(Object.fromEntries(Object.entries(passo.env)), { PR_BODY: '${{ github.event.pull_request.body }}' }, 'o corpo vai pelo ambiente, nunca dentro do comando');
  assert(comandos(workflow).some(comando => /scripts\/ci\/politica-do-site\.js/.test(comando.texto) && comando.executa), 'o passo executa de verdade');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('test_politica_do_site: ok');
