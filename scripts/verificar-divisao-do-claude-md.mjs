#!/usr/bin/env node
// Prova que dividir o CLAUDE.md em skills não perdeu texto e que as skills carregam.
//
//   node scripts/verificar-divisao-do-claude-md.mjs [--base <ref> | --original <arquivo>] [--raiz <pasta>]
//
// <ref> é o commit com o CLAUDE.md inteiro (padrão: origin/main); --original dá o arquivo no
// lugar do commit; --raiz confere outra pasta que não este repositório.
//
// Para cada linha que saiu do CLAUDE.md (comparação normalizada, em multiconjunto), exige que
// ela esteja em exatamente um SKILL.md apontado pelo CLAUDE.md novo; e que o corpo dos SKILL.md
// não tenha nenhuma linha que não tenha saído de lá. A única diferença aceita no texto é um
// ponteiro corrigido (a lista está em `divisao-do-claude-md.mjs`).
//
// Confere também que o cabeçalho de cada SKILL.md é YAML válido, lido por um parser de verdade
// (PyYAML, o mesmo de `engine/requirements.txt`), com `name` e `description`; e que os links
// Markdown relativos do corpo apontam para arquivos que existem.
//
// Sai com 1 se alguma linha se perdeu, apareceu em duas skills ou foi inventada, ou se uma skill
// não carrega; com 2 se o uso estiver errado ou faltar python3 com PyYAML.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARCA_DO_CORPO, normalizar } from './divisao-do-claude-md.mjs';

const USO = 'usage: node scripts/verificar-divisao-do-claude-md.mjs [--base <ref> | --original <file>] [--raiz <folder>]';
const args = process.argv.slice(2);
const conhecidas = ['--base', '--original', '--raiz'];
const valor = nome => {
  const i = args.indexOf(nome);
  return i < 0 ? undefined : (args[i + 1] ?? '');
};
const sobras = args.filter((a, i) => !conhecidas.includes(a) && !conhecidas.includes(args[i - 1]) && a !== '--help');
if (args.includes('--help') || sobras.length || conhecidas.some(c => valor(c) === '') || (valor('--base') && valor('--original'))) {
  console.log(USO);
  process.exit(args.includes('--help') ? 0 : 2);
}
const raiz = path.resolve(valor('--raiz') ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const base = valor('--base') ?? 'origin/main';
const rotuloDaBase = valor('--original') ?? base;

const trivial = linha => /^[`|:\- ]*$/.test(linha);
const contar = linhas => {
  const mapa = new Map();
  for (const l of linhas.map(normalizar).filter(l => l !== '')) mapa.set(l, (mapa.get(l) || 0) + 1);
  return mapa;
};

const antes = valor('--original')
  ? fs.readFileSync(valor('--original'), 'utf8')
  : execFileSync('git', ['show', `${base}:CLAUDE.md`], { cwd: raiz, encoding: 'utf8', maxBuffer: 1 << 26 });
const depois = fs.readFileSync(path.join(raiz, 'CLAUDE.md'), 'utf8');
const nomes = [...new Set([...depois.matchAll(/\.claude\/skills\/([a-z0-9-]+)\/SKILL\.md/g)].map(m => m[1]))];

const falhas = [];
if (nomes.length === 0) falhas.push('CLAUDE.md does not point at any skill');

// o cabeçalho de uma skill, lido por um parser YAML de verdade
const LER_YAML = 'import sys, json, yaml; print(json.dumps(yaml.safe_load(sys.stdin.read())))';
function cabecalhoDe(texto) {
  const m = texto.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { erro: 'no frontmatter between two --- lines' };
  const r = spawnSync('python3', ['-c', LER_YAML], { input: m[1], encoding: 'utf8' });
  if (r.error || /No module named/.test(r.stderr || '')) {
    console.log("python3 with PyYAML is needed to read the skills' frontmatter (pip install -r engine/requirements.txt)");
    process.exit(2);
  }
  if (r.status !== 0) {
    const linhasDoErro = (r.stderr || '').trim().split('\n');
    return { erro: `invalid YAML: ${linhasDoErro.find(l => /^yaml\./.test(l)) ?? linhasDoErro.pop()}` };
  }
  return { dados: JSON.parse(r.stdout) };
}

// as skills, lidas pelo caminho que o agente abre (.claude/skills, um link para .agents/skills)
const skills = nomes.map(nome => {
  const arquivo = path.join(raiz, '.claude/skills', nome, 'SKILL.md');
  let texto = '';
  try {
    texto = fs.readFileSync(arquivo, 'utf8');
  } catch {
    falhas.push(`${nome}: ${arquivo} cannot be read`);
  }
  const { dados, erro } = cabecalhoDe(texto);
  let descricao = '';
  if (erro) falhas.push(`${nome}: ${erro}`);
  else {
    if (dados?.name !== nome || !/^[a-z0-9-]{1,64}$/.test(nome)) falhas.push(`${nome}: frontmatter name is ${JSON.stringify(dados?.name)}, expected "${nome}"`);
    descricao = typeof dados?.description === 'string' ? dados.description : '';
    if (!descricao || descricao.length > 1024) falhas.push(`${nome}: description must be a string of 1 to 1024 characters`);
    else if (!/^Use when changing or reviewing /.test(descricao) || !/Reviewers: open it when the PR touches/.test(descricao)) {
      falhas.push(`${nome}: the description must say "Use when changing or reviewing …" and tell reviewers to open it`);
    }
  }
  const linhas = texto.split('\n');
  const inicio = linhas.findIndex(l => l.startsWith(MARCA_DO_CORPO));
  if (inicio < 0) falhas.push(`${nome}: no "${MARCA_DO_CORPO}" line, cannot tell the generated header from the body`);
  const corpo = linhas.slice(inicio + 1);
  // os links relativos do corpo apontam para arquivos que existem (a partir da pasta real da skill)
  if (fs.existsSync(arquivo)) {
    const pastaReal = path.dirname(fs.realpathSync(arquivo));
    for (const l of corpo) {
      for (const [, alvo] of l.matchAll(/\]\((?!https?:|mailto:|#)([^)\s#]+)(?:#[^)\s]*)?\)/g)) {
        if (!fs.existsSync(path.resolve(pastaReal, alvo))) falhas.push(`${nome}: broken link (${alvo})`);
      }
    }
  }
  return { nome, descricao, corpo };
});

// o que saiu = o CLAUDE.md antigo menos o novo (multiconjunto, normalizado)
const saiu = contar(antes.split('\n'));
for (const [linha, n] of contar(depois.split('\n'))) {
  if (saiu.has(linha)) saiu.set(linha, saiu.get(linha) - n);
}
for (const [linha, n] of [...saiu]) if (n <= 0) saiu.delete(linha);

const nasSkills = skills.map(s => ({ nome: s.nome, linhas: contar(s.corpo) }));
let linhasQueSairam = 0;
let triviais = 0;
for (const [linha, n] of saiu) {
  linhasQueSairam += n;
  const onde = nasSkills.filter(s => s.linhas.has(linha));
  const total = onde.reduce((soma, s) => soma + s.linhas.get(linha), 0);
  if (total < n) falhas.push(`LOST (${n} removed, ${total} in skills): ${linha.slice(0, 110)}`);
  else if (trivial(linha)) triviais += n; // “```”, “|---|”: pode estar em mais de uma skill
  else if (onde.length > 1) falhas.push(`IN ${onde.length} SKILLS (${onde.map(s => s.nome).join(', ')}): ${linha.slice(0, 110)}`);
}
// nada inventado: toda linha do corpo de uma skill saiu do CLAUDE.md
let linhasNasSkills = 0;
const somaPorLinha = new Map();
for (const s of nasSkills) {
  for (const [linha, n] of s.linhas) {
    linhasNasSkills += n;
    somaPorLinha.set(linha, (somaPorLinha.get(linha) || 0) + n);
  }
}
for (const [linha, n] of somaPorLinha) {
  if ((saiu.get(linha) || 0) < n) falhas.push(`NOT FROM CLAUDE.md (${n} in skills, ${saiu.get(linha) || 0} removed): ${linha.slice(0, 110)}`);
}

// ponteiros corrigidos (a linha existia antes, só o ponteiro mudou), para o revisor ler
const linhasDeAntes = new Set(antes.split('\n').map(l => l.trim()));
const saiuOuFicou = new Set(antes.split('\n').map(normalizar));
const corrigidas = [...depois.split('\n'), ...skills.flatMap(s => s.corpo)]
  .filter(l => !linhasDeAntes.has(l.trim()) && saiuOuFicou.has(normalizar(l)));

const tokens = bytes => Math.round(bytes / 4);
const bytesAntes = Buffer.byteLength(antes);
const bytesDepois = Buffer.byteLength(depois);
const bytesDescricoes = skills.reduce((soma, s) => soma + Buffer.byteLength(`name: ${s.nome}\ndescription: ${s.descricao}\n`), 0);
console.log(`base: ${rotuloDaBase}`);
console.log(`skills read through .claude/skills: ${nomes.join(', ')}`);
console.log(`lines removed from CLAUDE.md: ${linhasQueSairam} (${triviais} of them code-fence or table-rule lines)`);
console.log(`lines in the skills' bodies:   ${linhasNasSkills}`);
console.log(`pointers fixed (${corrigidas.length}):`);
for (const l of corrigidas) console.log(`  ${l.trim().slice(0, 150)}`);
console.log('always loaded (bytes; tokens estimated as bytes / 4):');
console.log(`  before: CLAUDE.md ${bytesAntes} B (~${tokens(bytesAntes)} tokens)`);
console.log(`  after:  CLAUDE.md ${bytesDepois} B + ${skills.length} skill descriptions ${bytesDescricoes} B = ${bytesDepois + bytesDescricoes} B (~${tokens(bytesDepois + bytesDescricoes)} tokens)`);
if (falhas.length) {
  for (const f of falhas) console.log(`FAIL ${f}`);
  console.log(`divisao: ${falhas.length} problem(s)`);
  process.exit(1);
}
console.log(`divisao: lossless (every removed line is in exactly one SKILL.md, nothing added to the bodies); ${skills.length} skills have valid YAML frontmatter with name and description, and no broken link`);
