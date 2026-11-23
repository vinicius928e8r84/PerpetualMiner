'use strict';

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { repositorioDeTestes } = require('./apoio-de-testes');

const REGRA = require('./verificar').REGRAS.find(regra => regra.id === 'glossario-so-linguagem');
const RAIZ = path.resolve(__dirname, '..', '..');

let total = 0;
function acusa(fonte, quantas, porque) {
  const achados = REGRA.verificar('glossary.md', fonte, RAIZ);
  assert.strictEqual(achados.length, quantas, `${REGRA.id}: ${porque}\n${JSON.stringify(achados, null, 2)}`);
  total++;
  return achados;
}

acusa('**Frase**:\nO texto minerado.\n_Nome no código_: `frases`, `texto`\n_Avoid_: Trecho\n', 2, 'a linha de nome no código acusa a crase e a linha: duas acusações, uma por motivo');
acusa('**Histórico**:\nO conjunto das Frases mineradas.\n_Nome no código_: sem crase aqui\n_Avoid_: Coleção\n', 1, 'a linha de nome no código sem crase');
acusa('**Termo**:\nO que o Cartão ensina, com `uma` palavra.\n_Avoid_: keyword\n', 1, 'crase no meio da definição');
acusa('Veja `glossary.md`.\n', 1, 'crase fora de uma definição');
acusa('```text\nFonte → Minerar\n```\n', 2, 'a cerca de código também é crase');
acusa('**Minerar**:\nPôr um texto no Histórico. Vale para qualquer Fonte. Mesmo na Mineração automática.\n_Avoid_: Capturar\n', 1, 'três frases');
acusa('**Minerar**:\nPôr um texto no Histórico.\nVale para qualquer Fonte.\nMesmo na Mineração automática.\n_Avoid_: Capturar\n', 1, 'três frases em três linhas');
acusa('**Frase**:\nPrimeira! Segunda? Terceira.\n', 1, 'ponto de exclamação e de interrogação fecham a frase');
acusa('**Frase**:\nPrimeira. “Segunda.” Terceira.\n', 1, 'o ponto antes da aspa que fecha conta');
acusa('**Idioma**:\nO idioma da Frase: Inglês ou Russo. Cada Idioma tem os seus Ajustes de envio.\n_Avoid_: Língua\n', 0, 'duas frases passam');
acusa('**Novo, Recente, Maduro**:\nO ponto em que o Anki tem um Cartão: Novo (nunca estudado), Recente (21 dias ou menos) e Maduro (21 dias ou mais). No Vocabulário, o que mistura pontos é Misto.\n_Avoid_: Young\n', 0, 'dois pontos e parênteses não fecham frase');
acusa('**Baralho**:\nO baralho do Anki. Cada parte depois de “::” é um sub-baralho: em “Inglês::Mineradas”, Inglês é o Baralho.\n_Avoid_: Deck\n', 0, 'aspas e dois-pontos duplos dentro da frase');
acusa('**Termo**:\nO que o Cartão ensina… com uma ou mais palavras (“take it for granted”). Cada Termo vira um Cartão.\n', 0, 'reticências não fecham frase');
acusa('**Frase**:\nUma. Duas.\n_Avoid_: Trecho. Sentença. Item.\n', 0, 'a linha _Avoid_ não é definição');
acusa('**Frase**:\nUma. Duas.\n\nTexto solto. Com. Várias. Frases.\n', 0, 'o que vem depois de uma linha em branco não é definição');
acusa('## Ambiguidades resolvidas\n\n- **cartão**: só o item do Anki. Um bloco de tela não é cartão. Nem o da IA.\n', 0, 'um item de lista não é definição');
acusa('**Frase**:\r\nUma. Duas. Três.\r\n_Avoid_: x\r\n', 1, 'CRLF (o clone do Windows com autocrlf)');
acusa('# PerpetualMiner\n\nUma. Duas. Três. Quatro.\n', 0, 'o texto de abertura não é definição');

const [achado] = acusa('# G\n\n**Minerar**:\nUm. Dois. Três.\n_Avoid_: x\n', 1, 'a linha acusada é a do termo');
assert.strictEqual(achado.linha, 3);
assert.match(achado.detalhe, /definição com 3 frases \(o máximo é 2\): \*\*Minerar\*\*:/);
total += 2;

assert.strictEqual(REGRA.seAplica('glossary.md'), true);
for (const arquivo of ['docs/glossary.md', 'docs/adr/0001-nome-novo-segue-o-glossario.md', 'README.md', 'AGENTS.md', 'CODING_STANDARDS.md', 'docs/agents/domain.md', '.claude/skills/domain-modeling/CONTEXT-FORMAT.md']) {
  assert.strictEqual(REGRA.seAplica(arquivo), false, `${arquivo} não é o glossário`);
}
total += 8;

const glossarioDeVerdade = fs.readFileSync(path.join(RAIZ, 'glossary.md'), 'utf8');
acusa(glossarioDeVerdade, 0, 'o glossary.md do repositório');

const velho = '**Frase**:\nA unidade de estudo guardada no histórico.\n_Nome no código_: `frases`\n_Avoid_: Trecho\n';
const tmp = repositorioDeTestes({
  'glossary.md': velho,
  'scripts/regras/linha-de-base.json': `${JSON.stringify({ 'glossario-so-linguagem': {} }, null, 2)}\n`,
});
execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-q', '-m', 'x'], { cwd: tmp, stdio: 'pipe' });
const verificar = () => spawnSync('node', [path.join(__dirname, 'verificar.js'), '--raiz', tmp, '--base', 'HEAD'], { cwd: tmp, encoding: 'utf8' });
let r = verificar();
assert.strictEqual(r.status, 1, r.stdout);
assert.match(r.stdout, /✗ glossario-so-linguagem — glossary\.md: 2 ocorrência\(s\)/);
assert.match(r.stdout, /glossary\.md:3: linha "_Nome no código_" no glossário/);
assert.match(r.stdout, /Conserto: O glossary\.md fala só de linguagem/);
fs.writeFileSync(path.join(tmp, 'glossary.md'), '**Frase**:\nO texto que a pessoa minerou.\n_Avoid_: Trecho\n');
r = verificar();
assert.strictEqual(r.status, 0, r.stdout);
assert.match(r.stdout, /glossario-so-linguagem 0/);
total += 6;

console.log(`glossario-so-linguagem: ${total} provas passaram`);
