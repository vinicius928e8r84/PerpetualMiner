#!/usr/bin/env node
// Prova que dividir o CLAUDE.md em skills não perdeu texto.
//
//   node scripts/verificar-divisao-do-claude-md.mjs [--base <ref>]
//
// <ref> é o commit com o CLAUDE.md inteiro (padrão: origin/main). Para cada linha
// que saiu do CLAUDE.md (comparação normalizada, em multiconjunto), exige que ela
// esteja em exatamente um SKILL.md apontado pelo CLAUDE.md novo; e que o corpo dos
// SKILL.md não tenha nenhuma linha que não tenha saído de lá. A única diferença
// aceita no texto é um ponteiro corrigido: “Veja “X” abaixo” → “see “X” in the `skill` skill”.
// Sai com 1 se alguma linha se perdeu, apareceu em duas skills ou foi inventada.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const iBase = args.indexOf('--base');
const base = iBase >= 0 ? args[iBase + 1] : 'origin/main';
if (args.some((a, i) => a !== '--base' && i !== iBase + 1) || !base) {
  console.log('usage: node scripts/verificar-divisao-do-claude-md.mjs [--base <ref>]');
  process.exit(2);
}

// um ponteiro corrigido não conta como mudança de texto
const normalizar = linha => linha.trim().replace(/\s+/g, ' ')
  .replace(/ in the `[a-z0-9-]+` skill/g, '')
  .replace(/([Ss]ee “[^”]+”) below/g, '$1');
const trivial = linha => /^[`|:\- ]*$/.test(linha);
const contar = linhas => {
  const mapa = new Map();
  for (const l of linhas.map(normalizar).filter(l => l !== '')) mapa.set(l, (mapa.get(l) || 0) + 1);
  return mapa;
};

const antes = execFileSync('git', ['show', `${base}:CLAUDE.md`], { cwd: raiz, encoding: 'utf8', maxBuffer: 1 << 26 });
const depois = fs.readFileSync(path.join(raiz, 'CLAUDE.md'), 'utf8');
const nomes = [...new Set([...depois.matchAll(/\.claude\/skills\/([a-z0-9-]+)\/SKILL\.md/g)].map(m => m[1]))];

const falhas = [];
if (nomes.length === 0) falhas.push('CLAUDE.md does not point at any skill');

// as skills, lidas pelo caminho que o agente abre (.claude/skills, um link para .agents/skills)
const skills = nomes.map(nome => {
  const arquivo = path.join(raiz, '.claude/skills', nome, 'SKILL.md');
  const texto = fs.readFileSync(arquivo, 'utf8');
  const descricao = (texto.match(/^description: (.*)$/m) || [])[1] || '';
  if (!new RegExp(`^name: ${nome}$`, 'm').test(texto)) falhas.push(`${nome}: frontmatter name is not "${nome}"`);
  if (!/^Use when changing or reviewing /.test(descricao) || !/Reviewers: open it when the PR touches/.test(descricao)) {
    falhas.push(`${nome}: the description must say "Use when changing or reviewing …" and tell reviewers to open it`);
  }
  const linhas = texto.split('\n');
  const inicio = linhas.findIndex(l => l.startsWith('Notes moved unchanged from'));
  if (inicio < 0) falhas.push(`${nome}: no "Notes moved unchanged from" line, cannot tell the generated header from the body`);
  return { nome, descricao, corpo: linhas.slice(inicio + 1) };
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
for (const s of nasSkills) for (const [linha, n] of s.linhas) {
  linhasNasSkills += n;
  somaPorLinha.set(linha, (somaPorLinha.get(linha) || 0) + n);
}
for (const [linha, n] of somaPorLinha) {
  if ((saiu.get(linha) || 0) < n) falhas.push(`NOT FROM CLAUDE.md (${n} in skills, ${saiu.get(linha) || 0} removed): ${linha.slice(0, 110)}`);
}

// ponteiros corrigidos (a linha existia antes, só o ponteiro mudou), para o revisor ler
const saiuOuFicou = new Set(antes.split('\n').map(normalizar));
const linhasDeAntes = new Set(antes.split('\n').map(l => l.trim()));
const corrigidas = [...depois.split('\n'), ...skills.flatMap(s => s.corpo)]
  .filter(l => / in the `[a-z0-9-]+` skill/.test(l) && !linhasDeAntes.has(l.trim()) && saiuOuFicou.has(normalizar(l)));

const tokens = bytes => Math.round(bytes / 4);
const bytesAntes = Buffer.byteLength(antes);
const bytesDepois = Buffer.byteLength(depois);
const bytesDescricoes = skills.reduce((soma, s) => soma + Buffer.byteLength(`name: ${s.nome}\ndescription: ${s.descricao}\n`), 0);
console.log(`base: ${base}`);
console.log(`skills read through .claude/skills: ${nomes.join(', ')}`);
console.log(`lines removed from CLAUDE.md: ${linhasQueSairam} (${triviais} are code fences / table rules)`);
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
console.log('divisao: lossless (every removed line is in exactly one SKILL.md, nothing added to the bodies)');
