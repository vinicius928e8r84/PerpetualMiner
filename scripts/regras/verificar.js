#!/usr/bin/env node
'use strict';

// As regras que a revisão cobrava à mão, conferidas por máquina. O mesmo comando
// roda aqui e no CI (.github/workflows/regras.yml):
//
//   node scripts/regras/verificar.js              confere o repositório
//   node scripts/regras/verificar.js --atualizar  baixa a linha de base depois de um conserto
//   node scripts/regras/test_regras.js            prova cada regra com os erros reais que ela pega
//
// O que já existia antes de cada regra está em linha-de-base.json, contado por
// arquivo: a verificação só falha quando um arquivo passa a ter MAIS ocorrências
// do que lá (catraca). A linha de base só desce: comparada com a da main, o total
// de uma regra nunca pode subir. A saída de emergência é uma exceção na própria
// linha, num comentário, com motivo, validade e quem aprovou:
//
//   exceção <regra> até AAAA-MM-DD, aprovada por <pessoa>: <motivo>
//
// Uma exceção vencida ou mal escrita também falha.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { arquivosDoRepositorio } = require('./comum');

const REGRAS = [
  require('./tokens-veio'),
];

const ARQUIVO_DA_LINHA_DE_BASE = 'scripts/regras/linha-de-base.json';

const EXCECAO = /exce[çc][ãa]o\s+([a-z0-9-]+)\b(.*)$/i;
const EXCECAO_COMPLETA = /^\s+at[ée]\s+(\d{4}-\d{2}-\d{2})\s*,\s*aprovad[ao]\s+por\s+([^:]+?)\s*:\s*(.+)$/i;

function git(raiz, args) {
  try {
    return execFileSync('git', args, { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// A exceção escrita na linha, se houver: { valida, regra, erro }.
function excecaoNaLinha(texto, hoje) {
  const m = EXCECAO.exec(texto);
  if (!m || !REGRAS.some(regra => regra.id === m[1])) return null;
  const resto = m[2].replace(/\s*(\*\/|-->)\s*$/, '');
  const completa = EXCECAO_COMPLETA.exec(resto);
  if (!completa) {
    return { regra: m[1], erro: 'exceção sem o formato `exceção <regra> até AAAA-MM-DD, aprovada por <pessoa>: <motivo>`' };
  }
  const [, validade, quem, motivo] = completa;
  if (Number.isNaN(Date.parse(validade))) return { regra: m[1], erro: `data inválida: ${validade}` };
  if (validade < hoje) return { regra: m[1], erro: `exceção vencida em ${validade}: conserte a linha ou renove com a aprovação de alguém` };
  if (!quem.trim() || !motivo.trim()) return { regra: m[1], erro: 'exceção sem quem aprovou ou sem motivo' };
  return { regra: m[1], valida: true };
}

/** Os achados de todas as regras: { [regra]: { [arquivo]: [{ linha, detalhe }] } } e os erros de exceção. */
function coletar(raiz, hoje) {
  const arquivos = arquivosDoRepositorio(raiz);
  const porRegra = {};
  const errosDeExcecao = [];
  const acusadas = new Set(); // `regra arquivo:linha` de todo achado, com ou sem exceção
  const textos = new Map();
  const ler = arquivo => {
    if (!textos.has(arquivo)) textos.set(arquivo, fs.readFileSync(path.join(raiz, arquivo), 'utf8'));
    return textos.get(arquivo);
  };
  for (const regra of REGRAS) {
    porRegra[regra.id] = {};
    for (const arquivo of arquivos.filter(regra.seAplica)) {
      const linhas = ler(arquivo).split('\n');
      const achados = regra.verificar(arquivo, ler(arquivo), raiz).filter(achado => {
        acusadas.add(`${regra.id} ${arquivo}:${achado.linha}`);
        const excecao = excecaoNaLinha(linhas[achado.linha - 1] || '', hoje);
        return !(excecao && excecao.regra === regra.id && excecao.valida);
      });
      if (achados.length) porRegra[regra.id][arquivo] = achados;
    }
  }
  // Toda exceção escrita é conferida: mal escrita, vencida, ou numa linha que a
  // regra não acusa (ficou para trás depois de um conserto).
  for (const arquivo of arquivos.filter(a => /\.(js|mjs|css|html|py)$/.test(a))) {
    ler(arquivo).split('\n').forEach((texto, i) => {
      const excecao = excecaoNaLinha(texto, hoje);
      if (!excecao || !REGRAS.find(regra => regra.id === excecao.regra).seAplica(arquivo)) return;
      if (!excecao.valida) errosDeExcecao.push(`${arquivo}:${i + 1}: ${excecao.erro}`);
      else if (!acusadas.has(`${excecao.regra} ${arquivo}:${i + 1}`)) {
        errosDeExcecao.push(`${arquivo}:${i + 1}: exceção de ${excecao.regra} numa linha que a regra não acusa; tire-a`);
      }
    });
  }
  return { porRegra, errosDeExcecao };
}

function contagens(porRegra) {
  const saida = {};
  for (const [regra, porArquivo] of Object.entries(porRegra)) {
    saida[regra] = {};
    for (const [arquivo, achados] of Object.entries(porArquivo)) saida[regra][arquivo] = achados.length;
  }
  return saida;
}

const total = porArquivo => Object.values(porArquivo || {}).reduce((soma, n) => soma + n, 0);

// As linhas que a mudança acrescentou em `arquivo`, comparadas com `base`; null sem git.
function linhasNovas(raiz, base, arquivo) {
  if (!base) return null;
  const diff = git(raiz, ['diff', '-U0', base, '--', arquivo]);
  if (diff === null) return null;
  if (diff === '' && git(raiz, ['cat-file', '-e', `${base}:${arquivo}`]) === null) return null;
  const novas = new Set();
  for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const inicio = Number(m[1]);
    const quantas = m[2] === undefined ? 1 : Number(m[2]);
    for (let i = 0; i < quantas; i++) novas.add(inicio + i);
  }
  return novas;
}

// A base de comparação: REGRAS_BASE, ou onde este ramo saiu da origin/main.
function baseDeComparacao(raiz) {
  const pedida = process.env.REGRAS_BASE || 'origin/main';
  if (git(raiz, ['rev-parse', '--verify', '--quiet', `${pedida}^{commit}`]) === null) return null;
  return git(raiz, ['merge-base', 'HEAD', pedida]);
}

function main() {
  const pedida = process.argv.indexOf('--raiz');
  const raiz = pedida > 0 ? path.resolve(process.argv[pedida + 1]) : path.resolve(__dirname, '..', '..');
  const atualizar = process.argv.includes('--atualizar');
  const criar = process.argv.includes('--criar-linha-de-base');
  const hoje = new Date().toISOString().slice(0, 10);
  const caminhoDaBase = path.join(raiz, ARQUIVO_DA_LINHA_DE_BASE);

  const { porRegra, errosDeExcecao } = coletar(raiz, hoje);
  const agora = contagens(porRegra);

  if (criar) {
    if (fs.existsSync(caminhoDaBase)) {
      console.error(`${ARQUIVO_DA_LINHA_DE_BASE} já existe; a linha de base só desce (--atualizar).`);
      process.exit(1);
    }
    fs.writeFileSync(caminhoDaBase, `${JSON.stringify(agora, null, 2)}\n`);
    console.log(`Linha de base criada em ${ARQUIVO_DA_LINHA_DE_BASE}.`);
    return;
  }

  if (!fs.existsSync(caminhoDaBase)) {
    console.error(`Falta ${ARQUIVO_DA_LINHA_DE_BASE}; ela é versionada com as regras.`);
    process.exit(1);
  }
  const linhaDeBase = JSON.parse(fs.readFileSync(caminhoDaBase, 'utf8'));
  const erros = [...errosDeExcecao];
  const podeBaixar = [];
  const base = baseDeComparacao(raiz);

  for (const regra of REGRAS) {
    const permitido = linhaDeBase[regra.id] || {};
    const arquivos = new Set([...Object.keys(agora[regra.id]), ...Object.keys(permitido)]);
    for (const arquivo of [...arquivos].sort()) {
      const tem = agora[regra.id][arquivo] || 0;
      const pode = permitido[arquivo] || 0;
      if (tem < pode) podeBaixar.push(`${regra.id} ${arquivo}: ${pode} → ${tem}`);
      if (tem <= pode) continue;
      const achados = porRegra[regra.id][arquivo];
      const novas = linhasNovas(raiz, base, arquivo);
      const nasNovas = novas ? achados.filter(a => novas.has(a.linha)) : [];
      const mostrar = (nasNovas.length ? nasNovas : achados).slice(0, 12);
      erros.push([
        `✗ ${regra.id} — ${arquivo}: ${tem} ocorrência(s); a linha de base permite ${pode}.`,
        ...mostrar.map(a => `    ${arquivo}:${a.linha}: ${a.detalhe}`),
        ...(nasNovas.length || achados.length <= 12 ? [] : [`    … e mais ${achados.length - 12}`]),
        `  Conserto: ${regra.conserto}`,
      ].join('\n'));
    }
  }

  // A linha de base só desce: o total de cada regra não passa o da base de comparação.
  if (base) {
    const anterior = git(raiz, ['show', `${base}:${ARQUIVO_DA_LINHA_DE_BASE}`]);
    if (anterior) {
      const antes = JSON.parse(anterior);
      for (const regra of REGRAS) {
        if (total(linhaDeBase[regra.id]) > total(antes[regra.id])) {
          erros.push(`✗ ${ARQUIVO_DA_LINHA_DE_BASE}: ${regra.id} subiu de ${total(antes[regra.id])} para `
            + `${total(linhaDeBase[regra.id])}. A linha de base só desce; um caso que precisa ficar leva uma exceção `
            + 'na própria linha (`exceção <regra> até AAAA-MM-DD, aprovada por <pessoa>: <motivo>`).');
        }
      }
    }
  }

  if (atualizar) {
    if (erros.length) {
      console.error(`${erros.join('\n\n')}\n\nNada atualizado: --atualizar só baixa a linha de base, e há erros acima.`);
      process.exit(1);
    }
    const nova = {};
    for (const regra of REGRAS) {
      nova[regra.id] = {};
      for (const [arquivo, n] of Object.entries(agora[regra.id]).sort()) nova[regra.id][arquivo] = n;
    }
    fs.writeFileSync(caminhoDaBase, `${JSON.stringify(nova, null, 2)}\n`);
    console.log(podeBaixar.length ? `Linha de base baixada:\n  ${podeBaixar.join('\n  ')}` : 'A linha de base já estava em dia.');
    return;
  }

  if (erros.length) {
    console.error(`${erros.join('\n\n')}\n\nRegras: ${erros.length} problema(s). As regras e o que as confere: AGENTS.md § Rules and what enforces them.`);
    process.exit(1);
  }
  const resumo = REGRAS.map(regra => `${regra.id} ${total(agora[regra.id])}`).join(', ');
  console.log(`regras ok (na linha de base: ${resumo})`);
  if (podeBaixar.length) {
    console.log(`A linha de base pode descer (rode com --atualizar e versione):\n  ${podeBaixar.join('\n  ')}`);
  }
}

if (require.main === module) main();

module.exports = { REGRAS, coletar, excecaoNaLinha };
