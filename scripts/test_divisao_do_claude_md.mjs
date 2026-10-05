// Testa a divisão do CLAUDE.md em skills (scripts/dividir-claude-md.mjs) e a sua verificação
// (scripts/verificar-divisao-do-claude-md.mjs) sobre um CLAUDE.md pequeno montado aqui.
// Precisa de python3 com PyYAML (engine/requirements.txt). Uso: node scripts/test_divisao_do_claude_md.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKILLS } from './divisao-do-claude-md.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const DIVIDIR = path.join(aqui, 'dividir-claude-md.mjs');
const VERIFICAR = path.join(aqui, 'verificar-divisao-do-claude-md.mjs');

const rodar = (script, ...args) => spawnSync('node', [script, ...args], { encoding: 'utf8' });
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'divisao-'));

/** Um CLAUDE.md inteiro, com uma seção para cada título que vai para uma skill. */
function inteiro({ naSecao = {}, bulletE2e = '', secaoSolta = '', trocar = [] } = {}) {
  const secoes = SKILLS.flatMap(s => s.secoes).map(prefixo => {
    const linhas = [`${prefixo} (modulo.js)`, '', `Texto de ${prefixo}.`, ...(naSecao[prefixo] || [])];
    return linhas.join('\n') + '\n';
  });
  const texto = [
    '# CLAUDE.md', '', '## Architecture', '', '### Files', '',
    '| File | Role |', '|------|------|',
    '| `overlay.js` | A sobreposição. See “Overlay” below |',
    '| `popup.html` | O popup. See “Popup (Cockpit)” below |',
    '| `scripts/` | As ferramentas |', '',
    '### Data Flow', '', 'O caminho do texto.', '',
    ...secoes.flatMap(s => [s]),
    '### Firebase / Firestore Sync', '', 'Sincroniza.', '',
    '### Cross-Frame Communication', '', 'Entre frames.', '',
    ...(secaoSolta ? [secaoSolta, ''] : []),
    '## Testing', '', 'Roda no Chromium.', '',
    '- `e2e/fixtures.js` abre o Chromium.',
    '- `e2e/fakes/` finge a rede.',
    ...(bulletE2e ? [bulletE2e] : []),
    '- `HEADED=1 npm test` mostra o navegador.', '',
    '## Key Constants', '', '- `A` — um.', '',
  ].join('\n');
  return trocar.reduce((t, [de, para]) => t.replace(de, para), texto);
}
const DESTINOS = {
  '### Overlay': ['a frame without a video asks the others first (`HA_VIDEO_EM_OUTRO_FRAME`, see Cross-Frame Communication), so'],
  '### Chave do Gemini': ['`situacaoDoErro` (see “Firebase / Firestore Sync”), and the raw message goes to the card.'],
  '### Minerar de uma foto': ['the one exception to the danger rule below, through `confirmarComContorno`).'],
  '### Boas-vindas': ['Veja a [especificação](docs/design/painel/boas-vindas/README.md#os-passos) do passo.'],
};

function montarRaiz(opcoes) {
  const raiz = temp();
  const original = path.join(raiz, 'inteiro.md');
  fs.mkdirSync(path.join(raiz, 'docs/design/painel/boas-vindas'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'docs/design/painel/boas-vindas/README.md'), '# Boas-vindas\n');
  fs.writeFileSync(original, inteiro({ naSecao: DESTINOS, ...opcoes }));
  return { raiz, original };
}
const dividirEm = ({ raiz, original }) => rodar(DIVIDIR, original, '--raiz', raiz);
const verificar = ({ raiz, original }) => rodar(VERIFICAR, '--original', original, '--raiz', raiz);
const ler = (raiz, ...partes) => fs.readFileSync(path.join(raiz, ...partes), 'utf8');
const tudo = raiz => Object.fromEntries(
  ['CLAUDE.md', ...SKILLS.map(s => `.agents/skills/${s.nome}/SKILL.md`), '.agents/skills/e2e-suite/SKILL.md']
    .map(arquivo => [arquivo, ler(raiz, arquivo)]));

let falhas = 0;
function teste(nome, corpo) {
  try {
    corpo();
    console.log(`ok   ${nome}`);
  } catch (erro) {
    falhas++;
    console.log(`FAIL ${nome}\n     ${String(erro.message).split('\n').join('\n     ')}`);
  }
}

teste('a divisão de um CLAUDE.md inteiro passa na verificação: texto, YAML, links', () => {
  const m = montarRaiz();
  const d = dividirEm(m);
  assert.equal(d.status, 0, d.stderr);
  const v = verificar(m);
  assert.equal(v.status, 0, v.stdout);
  assert.match(v.stdout, /9 skills have valid YAML frontmatter/);
});

teste('o cabeçalho de cada skill é YAML válido: uma descrição com “: ” sem aspas é recusada', () => {
  const m = montarRaiz();
  dividirEm(m);
  const arquivo = path.join(m.raiz, '.agents/skills/popup/SKILL.md');
  const sem = fs.readFileSync(arquivo, 'utf8').replace(/^description: (".*")$/m, (_, json) => `description: ${JSON.parse(json)}`);
  assert.match(sem, /^description: Use when .*Reviewers: open it/m, 'a fixture should have the colon unquoted');
  fs.writeFileSync(arquivo, sem);
  const v = verificar(m);
  assert.equal(v.status, 1);
  assert.match(v.stdout, /FAIL popup: invalid YAML/);
});

teste('um name que não é o da pasta, ou sem descrição, é recusado', () => {
  const m = montarRaiz();
  dividirEm(m);
  const arquivo = path.join(m.raiz, '.agents/skills/overlay/SKILL.md');
  fs.writeFileSync(arquivo, fs.readFileSync(arquivo, 'utf8').replace(/^name: overlay$/m, 'name: outro').replace(/^description: .*\n/m, ''));
  const v = verificar(m);
  assert.equal(v.status, 1);
  assert.match(v.stdout, /FAIL overlay: frontmatter name is "outro"/);
  assert.match(v.stdout, /FAIL overlay: description must be a string/);
});

teste('refazer a divisão duas vezes dá os mesmos arquivos, e o que entrou nas seções vai para a skill certa', () => {
  const opcoes = {
    naSecao: {
      ...DESTINOS,
      '### Popup (Cockpit)': ['POP-17 escreve a descrição nova.'],
    },
    bulletE2e: '- `e2e/fakes/novo.js` é um fake que a 184 acrescentou.',
    secaoSolta: '### Uma seção nova que cruza superfícies\n\nFica no CLAUDE.md.',
  };
  const a = montarRaiz(opcoes);
  const b = montarRaiz(opcoes);
  assert.equal(dividirEm(a).status, 0);
  assert.equal(dividirEm(b).status, 0);
  assert.deepEqual(tudo(a.raiz), tudo(b.raiz), 'two runs on the same input must write the same files');
  assert.equal(dividirEm(a).status, 0, 'a second run over the same folder');
  assert.deepEqual(tudo(a.raiz), tudo(b.raiz), 'a run over an already written folder must write the same files');
  assert.match(ler(a.raiz, '.agents/skills/popup/SKILL.md'), /POP-17 escreve a descrição nova\./);
  assert.match(ler(a.raiz, '.agents/skills/e2e-suite/SKILL.md'), /e2e\/fakes\/novo\.js/);
  assert.doesNotMatch(ler(a.raiz, 'CLAUDE.md'), /POP-17|e2e\/fakes\/novo\.js/);
  assert.match(ler(a.raiz, 'CLAUDE.md'), /### Uma seção nova que cruza superfícies/);
  assert.equal(verificar(a).status, 0);
});

teste('só há uma cópia: .claude/skills/<nome> é um link para .agents/skills/<nome>', () => {
  const m = montarRaiz();
  dividirEm(m);
  for (const { nome } of [...SKILLS, { nome: 'e2e-suite' }]) {
    const elo = path.join(m.raiz, '.claude/skills', nome);
    assert.ok(fs.lstatSync(elo).isSymbolicLink(), `${nome} must be a symlink`);
    assert.equal(fs.readlinkSync(elo), `../../.agents/skills/${nome}`);
    assert.ok(fs.lstatSync(path.join(m.raiz, '.agents/skills', nome, 'SKILL.md')).isFile());
    assert.equal(fs.realpathSync(path.join(elo, 'SKILL.md')), fs.realpathSync(path.join(m.raiz, '.agents/skills', nome, 'SKILL.md')));
  }
});

teste('as referências a outra seção ganham destino explícito', () => {
  const m = montarRaiz();
  dividirEm(m);
  assert.match(ler(m.raiz, '.agents/skills/minerar-foto/SKILL.md'), /the danger rule in the `veio-componentes` skill, through/);
  assert.match(ler(m.raiz, '.agents/skills/configuracoes/SKILL.md'), /see “Firebase \/ Firestore Sync” in `CLAUDE\.md`\)/);
  assert.match(ler(m.raiz, '.agents/skills/overlay/SKILL.md'), /see Cross-Frame Communication in `CLAUDE\.md`\)/);
  assert.match(ler(m.raiz, 'CLAUDE.md'), /See “Overlay” in the `overlay` skill \|/);
  assert.equal(verificar(m).status, 0, 'the verifier must accept these pointer fixes');
});

teste('os links Markdown relativos das skills apontam para a raiz e existem; um link quebrado é recusado', () => {
  const m = montarRaiz();
  dividirEm(m);
  assert.match(ler(m.raiz, '.agents/skills/boas-vindas/SKILL.md'), /\]\(\.\.\/\.\.\/\.\.\/docs\/design\/painel\/boas-vindas\/README\.md#os-passos\)/);
  const arquivo = path.join(m.raiz, '.agents/skills/boas-vindas/SKILL.md');
  fs.writeFileSync(arquivo, fs.readFileSync(arquivo, 'utf8').replace('](../../../docs/', '](docs/'));
  const v = verificar(m);
  assert.equal(v.status, 1);
  assert.match(v.stdout, /FAIL boas-vindas: broken link \(docs\/design\/painel\/boas-vindas\/README\.md\)/);
});

teste('a verificação pega uma linha perdida, uma repetida em outra skill e uma inventada', () => {
  const casos = {
    perdida: [(t) => t.replace('Texto de ### Popup (Cockpit).\n', ''), 'popup', /LOST/],
    repetida: [(t) => `${t}Texto de ### Overlay.\n`, 'popup', /IN 2 SKILLS|NOT FROM CLAUDE/],
    inventada: [(t) => `${t}Uma linha inventada.\n`, 'popup', /NOT FROM CLAUDE\.md/],
  };
  for (const [nome, [mudar, skill, esperado]] of Object.entries(casos)) {
    const m = montarRaiz();
    dividirEm(m);
    const arquivo = path.join(m.raiz, '.agents/skills', skill, 'SKILL.md');
    fs.writeFileSync(arquivo, mudar(fs.readFileSync(arquivo, 'utf8')));
    const v = verificar(m);
    assert.equal(v.status, 1, `${nome}: ${v.stdout}`);
    assert.match(v.stdout, esperado, nome);
  }
});

teste('um CLAUDE.md já dividido é recusado; um ponteiro que mudou de texto avisa em vez de ficar sem destino', () => {
  const m = montarRaiz();
  assert.equal(dividirEm(m).status, 0);
  const jaDividido = rodar(DIVIDIR, path.join(m.raiz, 'CLAUDE.md'), '--raiz', m.raiz);
  assert.equal(jaDividido.status, 1);
  assert.match(jaDividido.stderr, /already split/);

  const mudou = montarRaiz({ trocar: [['the danger rule below,', 'the danger rule further down,']] });
  const r = dividirEm(mudou);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /pointer not found, update REESCRITAS_FIXAS/);
  assert.equal(fs.existsSync(path.join(mudou.raiz, 'CLAUDE.md')), false, 'nothing is written when the split fails');
});

teste('uso errado sai com 2 e mostra o uso', () => {
  assert.equal(rodar(DIVIDIR).status, 2);
  assert.equal(rodar(VERIFICAR, '--nao-existe').status, 2);
  assert.match(rodar(VERIFICAR, '--base', 'a', '--original', 'b').stdout, /usage:/);
});

if (falhas) {
  console.log(`divisao tests: ${falhas} failed`);
  process.exit(1);
}
console.log('divisao tests passed');
