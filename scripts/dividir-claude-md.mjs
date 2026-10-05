#!/usr/bin/env node
// Refaz a divisão do CLAUDE.md em skills, de forma determinística: o mesmo CLAUDE.md inteiro
// dá sempre o mesmo CLAUDE.md enxuto e as mesmas nove skills.
//
//   node scripts/dividir-claude-md.mjs <CLAUDE.md inteiro> [--raiz <pasta>]
//
// Só serve quando entra um CLAUDE.md ainda inteiro (um merge com a `main` que o alterou
// antes desta divisão): pegue o CLAUDE.md da `main` (`git show origin/main:CLAUDE.md > /tmp/inteiro.md`),
// rode este comando e confira com `node scripts/verificar-divisao-do-claude-md.mjs --original /tmp/inteiro.md`.
// Escreve `CLAUDE.md` e `.agents/skills/<nome>/SKILL.md` (a cópia canônica) e deixa
// `.claude/skills/<nome>` como link para ela. Recusa um CLAUDE.md que já foi dividido.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dividir } from './divisao-do-claude-md.mjs';

const USO = 'usage: node scripts/dividir-claude-md.mjs <whole CLAUDE.md> [--raiz <folder>]   (see the header of the script)';
const args = process.argv.slice(2);
const iRaiz = args.indexOf('--raiz');
const raiz = path.resolve(iRaiz >= 0 ? args[iRaiz + 1] || '' : path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const posicionais = args.filter((a, i) => a !== '--raiz' && args[i - 1] !== '--raiz' && a !== '--help');
if (args.includes('--help') || posicionais.length !== 1 || (iRaiz >= 0 && !args[iRaiz + 1])) {
  console.log(USO);
  process.exit(args.includes('--help') ? 0 : 2);
}

let resultado;
try {
  resultado = dividir(fs.readFileSync(posicionais[0], 'utf8'));
} catch (erro) {
  console.error(`error: ${erro.message}`);
  process.exit(erro.code === 'ENOENT' ? 2 : 1);
}

fs.writeFileSync(path.join(raiz, 'CLAUDE.md'), resultado.claude);
for (const [nome, texto] of Object.entries(resultado.skills)) {
  const pasta = path.join(raiz, '.agents/skills', nome);
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, 'SKILL.md'), texto);
  const elo = path.join(raiz, '.claude/skills', nome);
  fs.mkdirSync(path.dirname(elo), { recursive: true });
  fs.rmSync(elo, { recursive: true, force: true });
  fs.symlinkSync(`../../.agents/skills/${nome}`, elo);
}
console.log(`CLAUDE.md: ${Buffer.byteLength(resultado.claude)} B; skills: ${Object.keys(resultado.skills).join(', ')}`);
