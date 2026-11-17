'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { lerYaml } = require('../yaml-de-workflow');

const RAIZ = path.resolve(__dirname, '..', '..');
require(path.join(RAIZ, 'lib', 'arquivos-da-extensao.js'));
const { arquivosDaExtensao } = globalThis.PerpetualMiner;

const lerTexto = arquivo => fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');

function aRegra(glob) {
  const fonte = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0001').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0001/g, '(?:.*/)?').replace(/\u0000/g, '.*');
  return new RegExp(`^${fonte}$`);
}

function filtro(caminhos) {
  const positivos = caminhos.filter(c => !c.startsWith('!')).map(aRegra);
  const negativos = caminhos.filter(c => c.startsWith('!')).map(c => aRegra(c.slice(1)));
  return arquivo => positivos.some(r => r.test(arquivo)) && !negativos.some(r => r.test(arquivo));
}

function andar(pasta) {
  return fs.readdirSync(path.join(RAIZ, pasta), { withFileTypes: true }).flatMap(item => {
    const alvo = `${pasta}/${item.name}`;
    return item.isDirectory() ? andar(alvo) : [alvo];
  });
}

const workflow = lerYaml(lerTexto('.github/workflows/vitrine.yml'));
const gatilhos = workflow.on;
const doPR = gatilhos.pull_request.paths;
const daMain = gatilhos.push.paths;

assert(Array.isArray(doPR) && doPR.length, 'o preview de PR só sai quando a PR muda algo que ele mostra');
assert.deepStrictEqual(daMain, doPR, 'a produção sai pelos mesmos caminhos que o preview de PR');
assert.strictEqual(gatilhos.push.branches, '[main]', 'a produção sai só da main');
const mudaAVitrine = filtro(doPR);

(async () => {
  const mostrados = new Set(await arquivosDaExtensao(async arquivo => lerTexto(arquivo)));
  for (const pasta of ['conexao', 'veio', 'lib', 'docs/design', 'e2e/vitrine', 'preview']) {
    for (const arquivo of andar(pasta)) if (!arquivo.startsWith('preview/dist/')) mostrados.add(arquivo);
  }
  mostrados.add('vercel.json');
  mostrados.add('.github/workflows/vitrine.yml');
  assert(mostrados.size > 100, 'a lista do que o preview mostra veio vazia');
  const esquecidos = [...mostrados].filter(arquivo => !mudaAVitrine(arquivo));
  assert.deepStrictEqual(esquecidos, [], `o preview mostra arquivos que a lista de caminhos do vitrine.yml não pega: ${esquecidos.join(', ')}`);

  for (const arquivo of [
    'complemento/servidor.py', 'engine/CLAUDE.md', 'e2e/tests/popup.spec.js', 'e2e/fixtures.js', 'test_voz.js',
    'scripts/ci/test_vitrine.js', 'scripts/testes.json', 'docs/arquivos/testes-e-ferramentas.md', 'AGENTS.md',
    'glossary.md', '.agents/skills/popup/SKILL.md', '.github/workflows/testes.yml',
  ]) assert(!mudaAVitrine(arquivo), `${arquivo} não aparece no preview e não devia gerar deploy`);

  const vercel = JSON.parse(lerTexto('vercel.json'));
  assert.strictEqual(vercel.git && vercel.git.deploymentEnabled, false, 'o Vercel não cria deploy sozinho: o vitrine.yml publica');
  assert(!('ignoreCommand' in vercel), 'build pulado por ignoreCommand ainda conta como deployment');

  const passos = Object.values(workflow.jobs).flatMap(job => job.steps.map(passo => String(passo.run || '')));
  const publicar = passos.filter(texto => /vercel deploy/.test(texto));
  assert.strictEqual(publicar.length, 1, 'um passo só publica');
  assert(/--prebuilt/.test(publicar[0]) && /--prod/.test(publicar[0]) && /github\.event_name/.test(lerTexto('.github/workflows/vitrine.yml')),
    'a produção (--prod) e o preview saem do mesmo passo, escolhidos pelo evento');
  assert(!/(^|\n)\s+run:.*\$\{\{\s*secrets\./.test(lerTexto('.github/workflows/vitrine.yml')), 'o segredo vai por env, não dentro do comando');
  console.log('ok: vitrine.yml cobre o que o preview mostra e o Vercel não faz deploy sozinho');
})().catch(erro => { console.error(erro); process.exit(1); });
