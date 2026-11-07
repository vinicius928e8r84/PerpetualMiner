#!/usr/bin/env node
'use strict';

// O gancho pre-commit do tamanho dos arquivos: um arquivo preparado (staged) com mais de
// 20.000 bytes (5.000 tokens, a 4 bytes por token) barra o commit, para o agente dividir antes de
// o arquivo virar grande demais para ler de uma vez. Lê o conteúdo do índice, não da cópia de trabalho.
//
// Fica de fora (limite-de-tokens.json › ignorar): trava de pacotes, saída gerada, binários, código
// de terceiros e arquivos com a marca das ferramentas de geração (`@generated`, `DO NOT EDIT`). Os
// que já passavam do limite quando o gancho entrou estão em linha-de-base-de-tamanho.json: podem
// ser editados, não podem crescer. A base lida é a do índice, e ela só desce em relação à do HEAD
// (entrada nova ou maior barra o commit); o teto de cada um é o menor entre a base e o tamanho no
// HEAD. Sem o arquivo da base o gancho é estrito (tudo acima do limite barra). Como usar e instalar:
// LEIA-ME.md.
//
//   node scripts/ganchos/limite-de-tokens.js                          confere o que está preparado (o gancho)
//   node scripts/ganchos/limite-de-tokens.js --atualizar-linha-de-base  baixa as entradas que encolheram
//   node scripts/ganchos/limite-de-tokens.js --gerar-linha-de-base      cria a linha de base (só se ainda não existe)

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { ErroDeEntrada, lerConfiguracaoDoTexto, lerLinhaDeBaseDoTexto, mensagemDeEntradaInvalida } = require('./entrada-do-gancho.js');
const { mensagemDeAfrouxamento, mensagemDeErro, tokensDe } = require('./mensagens-de-tamanho.js');

const ARQUIVO_DA_CONFIGURACAO = path.join(__dirname, 'limite-de-tokens.json');
const LIMITE_DE_BYTES = 20000;
const BYTES_LIDOS_PARA_BINARIO = 8000; // a mesma janela que o git usa para decidir se é binário


function lerConfiguracao(arquivo = ARQUIVO_DA_CONFIGURACAO) {
  const onde = `scripts/ganchos/${path.basename(arquivo)}`;
  let texto;
  try {
    texto = fs.readFileSync(arquivo, 'utf8');
  } catch (erro) {
    throw new ErroDeEntrada(onde, `não foi possível ler o arquivo (${erro.code || erro.message})`);
  }
  return lerConfiguracaoDoTexto(texto, onde);
}

// --- Globs: `*.lock` (nome, em qualquer pasta), `dist/` (pasta, em qualquer lugar), `a/b/` (pasta
// na raiz), `a/**/x.json` (caminho a partir da raiz); `{a,b}` vira alternativa. ---

function expandirChaves(glob) {
  const chaves = /\{([^{}]*)\}/.exec(glob);
  if (!chaves) return [glob];
  return chaves[1].split(',').flatMap(opcao => expandirChaves(glob.slice(0, chaves.index) + opcao + glob.slice(chaves.index + chaves[0].length)));
}

function corpoDoGlob(glob) {
  let regex = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { regex += '(?:.*/)?'; i += 2; } else { regex += '.*'; i += 1; }
    } else if (c === '*') regex += '[^/]*';
    else if (c === '?') regex += '[^/]';
    else regex += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return regex;
}

function globParaRegex(glob) {
  const alternativas = expandirChaves(glob).map(g => {
    if (g.endsWith('/')) {
      const pasta = g.slice(0, -1);
      return pasta.includes('/') ? `^${corpoDoGlob(pasta)}/` : `(?:^|/)${corpoDoGlob(pasta)}/`;
    }
    return g.includes('/') ? `^${corpoDoGlob(g)}$` : `(?:^|/)${corpoDoGlob(g)}$`;
  });
  return new RegExp(alternativas.join('|'));
}

const emCache = new WeakMap();
function regrasDeIgnorar(config) {
  if (!emCache.has(config)) emCache.set(config, config.ignorar.map(r => ({ ...r, regex: globParaRegex(r.glob) })));
  return emCache.get(config);
}

function motivoDeIgnorar(caminho, config) {
  const regra = regrasDeIgnorar(config).find(r => r.regex.test(caminho));
  return regra ? regra.motivo : null;
}

function ehBinario(inicio) {
  return inicio.subarray(0, BYTES_LIDOS_PARA_BINARIO).includes(0);
}

function temCabecalhoDeGerado(inicio, config) {
  const cabecalho = inicio.toString('utf8').split('\n').slice(0, config.linhasDoCabecalho).join('\n');
  return config.marcasDeGerado.some(marca => cabecalho.includes(marca)); // texto exato, maiúsculas e minúsculas contam
}

/**
 * Decide o que fazer com um arquivo preparado. `arquivo` = { caminho, tamanho (bytes do índice),
 * inicio() } e `inicio()` só é chamado acima do limite. `linhaDeBase` = { caminho: bytes }.
 * Estados: ok, ignorado, linha-de-base (grande, mas sem crescer), cresceu e excede (os dois barram).
 */
function avaliar(arquivo, config, linhaDeBase) {
  const { caminho, tamanho } = arquivo;
  const limite = config.limiteDeBytes;
  const resultado = (estado, extra) => ({ estado, caminho, tamanho, limite, ...extra });
  const motivo = motivoDeIgnorar(caminho, config);
  if (motivo) return resultado('ignorado', { motivo });
  if (tamanho <= limite) return resultado('ok');
  const inicio = arquivo.inicio();
  if (ehBinario(inicio)) return resultado('ignorado', { motivo: 'binário' });
  if (temCabecalhoDeGerado(inicio, config)) return resultado('ignorado', { motivo: 'cabeçalho de arquivo gerado' });
  const naBase = linhaDeBase[caminho];
  if (naBase === undefined) return resultado('excede');
  return tamanho <= naBase ? resultado('linha-de-base', { naBase }) : resultado('cresceu', { naBase });
}

// --- A linha de base ---

/**
 * A linha de base de uma versão do git (`:caminho` = índice, `HEAD:caminho`); `null` se o arquivo não existe nela.
 * Arquivo que existe e está inválido lança ErroDeEntrada (barra o commit).
 */
function lerLinhaDeBase(raiz, config, versao) {
  let texto;
  try {
    texto = git(raiz, ['cat-file', 'blob', `${versao}:${config.linhaDeBase}`], { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
  return lerLinhaDeBaseDoTexto(texto, `${config.linhaDeBase} (${versao === '' ? 'no índice' : `em ${versao}`})`);
}

/** A base do último commit; se ela está inválida lá, vale como ausente, para o commit que a conserta poder passar. */
function lerLinhaDeBaseDoHead(raiz, config) {
  try {
    return lerLinhaDeBase(raiz, config, 'HEAD');
  } catch (erro) {
    if (erro instanceof ErroDeEntrada) return null;
    throw erro;
  }
}

/** O tamanho de cada caminho no HEAD (só os que existem lá). */
function tamanhosNoHead(raiz, caminhos) {
  const validos = caminhos.filter(c => !c.includes('\n'));
  if (!validos.length) return {};
  const saida = git(raiz, ['cat-file', '--batch-check=%(objectsize)'], { input: `${validos.map(c => `HEAD:${c}`).join('\n')}\n` });
  const tamanhos = {};
  saida.split('\n').forEach((linha, i) => { if (/^\d+$/.test(linha)) tamanhos[validos[i]] = Number(linha); });
  return tamanhos;
}

/** O teto de cada um da base: o menor entre a base e o tamanho no HEAD, e só para quem já passava do limite lá. */
function limitarPeloHead(linhaDeBase, noHead, limite = LIMITE_DE_BYTES) {
  const teto = {};
  for (const [caminho, valor] of Object.entries(linhaDeBase)) {
    if (noHead[caminho] !== undefined && noHead[caminho] > limite) teto[caminho] = Math.min(valor, noHead[caminho]);
  }
  return teto;
}

/**
 * As entradas da base preparada que a afrouxam: arquivo que a do HEAD não tinha, ou com tamanho maior.
 * Sem base no HEAD (a primeira), só vale o arquivo que o HEAD já tinha acima do limite, até o tamanho dele.
 */
function afrouxamentos(preparada, baseDoHead, noHead, limite = LIMITE_DE_BYTES) {
  const achados = [];
  for (const [caminho, valor] of Object.entries(preparada)) {
    let permitido = null;
    if (baseDoHead) permitido = baseDoHead[caminho] === undefined ? null : baseDoHead[caminho];
    else if (noHead[caminho] !== undefined && noHead[caminho] > limite) permitido = noHead[caminho];
    if (permitido === null || valor > permitido) achados.push({ caminho, valor, permitido });
  }
  return achados;
}

/** Só desce: mantém as entradas que ainda passam do limite com o menor tamanho; não acrescenta nem sobe. */
function atualizarLinhaDeBase(linhaDeBase, tamanhosAtuais, limite = LIMITE_DE_BYTES) {
  const nova = {};
  for (const caminho of Object.keys(linhaDeBase).sort()) {
    const atual = tamanhosAtuais[caminho];
    if (atual === undefined || atual <= limite) continue;
    nova[caminho] = Math.min(linhaDeBase[caminho], atual);
  }
  return nova;
}

const DESCRICAO_DA_LINHA_DE_BASE = 'Arquivos que já passavam do limite quando o gancho entrou (caminho: bytes). Cada um pode ser '
  + 'editado, não pode crescer além do tamanho daqui (nem do que tinha no último commit); esta lista só desce: entrada nova ou maior barra o commit. Depois de dividir um deles, rode '
  + '`node scripts/ganchos/limite-de-tokens.js --atualizar-linha-de-base`. Arquivo novo não entra aqui: tem de caber no limite. '
  + 'Apagar este arquivo liga o modo estrito (tudo acima do limite barra o commit).';

function gravarLinhaDeBase(raiz, config, arquivos) {
  const ordenados = Object.fromEntries(Object.entries(arquivos).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const destino = path.join(raiz, config.linhaDeBase);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, `${JSON.stringify({ descricao: DESCRICAO_DA_LINHA_DE_BASE, arquivos: ordenados }, null, 2)}\n`);
}

// --- O git ---

const git = (raiz, args, opcoes = {}) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opcoes });

function tamanhosDosBlobs(raiz, oids) {
  if (!oids.length) return [];
  const saida = git(raiz, ['cat-file', '--batch-check=%(objectsize)'], { input: `${oids.join('\n')}\n` });
  return saida.split('\n').filter(Boolean).map(Number);
}

const lerBlob = (raiz, oid) => git(raiz, ['cat-file', 'blob', oid], { encoding: 'buffer' });

/** Os arquivos preparados (adicionados, copiados, modificados, renomeados), com o tamanho do blob do índice. */
function arquivosPreparados(raiz) {
  const saida = git(raiz, ['diff', '--cached', '--raw', '-z', '--no-abbrev', '--no-renames', '--diff-filter=ACMRT']);
  const pedacos = saida.split('\0');
  const achados = [];
  for (let i = 0; i + 1 < pedacos.length; i += 2) {
    const [, modoNovo, , oid] = pedacos[i].split(' ');
    if (modoNovo === '160000' || modoNovo === '120000') continue; // submódulo e link simbólico
    achados.push({ caminho: pedacos[i + 1], oid });
  }
  const tamanhos = tamanhosDosBlobs(raiz, achados.map(a => a.oid));
  return achados.map((a, i) => ({ caminho: a.caminho, tamanho: tamanhos[i], inicio: () => lerBlob(raiz, a.oid) }));
}

/** Os arquivos do índice inteiro { caminho: bytes }, para gerar e atualizar a linha de base. */
function tamanhosDoIndice(raiz) {
  const entradas = git(raiz, ['ls-files', '--stage', '-z']).split('\0').filter(Boolean).map(linha => {
    const [meta, caminho] = linha.split('\t');
    const [modo, oid] = meta.split(' ');
    return { caminho, modo, oid };
  }).filter(e => e.modo !== '160000' && e.modo !== '120000');
  const tamanhos = tamanhosDosBlobs(raiz, entradas.map(e => e.oid));
  return entradas.map((e, i) => ({ caminho: e.caminho, tamanho: tamanhos[i], inicio: () => lerBlob(raiz, e.oid) }));
}

// --- A linha de comando ---

function conferirPreparados(raiz, config) {
  const preparados = arquivosPreparados(raiz);
  // A base vale pelo índice (o que será commitado), limitada pelo HEAD: nunca pela cópia de trabalho.
  const baseDoIndice = lerLinhaDeBase(raiz, config, '') || {};
  const baseDoHead = lerLinhaDeBaseDoHead(raiz, config);
  const consultar = baseDoHead
    ? preparados.map(a => a.caminho).filter(c => c in baseDoIndice)
    : Object.keys(baseDoIndice);
  const noHead = tamanhosNoHead(raiz, consultar);
  const afrouxadas = afrouxamentos(baseDoIndice, baseDoHead, noHead, config.limiteDeBytes);
  const linhaDeBase = limitarPeloHead(baseDoIndice, noHead, config.limiteDeBytes);
  const falhas = preparados
    .map(arquivo => avaliar(arquivo, config, linhaDeBase))
    .filter(achado => achado.estado === 'excede' || achado.estado === 'cresceu');
  if (!falhas.length && !afrouxadas.length) return 0;
  process.stderr.write(`Commit barrado: ${falhas.length + afrouxadas.length} problema(s) de tamanho (limite ${config.limiteDeBytes} bytes = ${tokensDe(config.limiteDeBytes, config.bytesPorToken)} tokens).\n\n`);
  const mensagens = [...afrouxadas.map(a => mensagemDeAfrouxamento(a, baseDoHead, config)), ...falhas.map(f => mensagemDeErro(f, config))];
  process.stderr.write(`${mensagens.join('\n\n')}\n`);
  return 1;
}

function gerarLinhaDeBase(raiz, config, doIndice) {
  if (lerLinhaDeBase(raiz, config, '') || lerLinhaDeBaseDoHead(raiz, config)) {
    process.stderr.write(`A linha de base já existe (${config.linhaDeBase}) e só desce: ela não é refeita do zero. `
      + 'Depois de dividir um arquivo, rode `node scripts/ganchos/limite-de-tokens.js --atualizar-linha-de-base`.\n');
    return 1;
  }
  const grandes = {};
  for (const arquivo of doIndice) {
    if (arquivo.tamanho > config.limiteDeBytes && avaliar(arquivo, config, {}).estado === 'excede') grandes[arquivo.caminho] = arquivo.tamanho;
  }
  gravarLinhaDeBase(raiz, config, grandes);
  process.stdout.write(`${config.linhaDeBase}: ${Object.keys(grandes).length} arquivo(s); só entra o que o último commit já tinha acima do limite\n`);
  return 0;
}

function atualizarLinhaDeBaseDoIndice(raiz, config, doIndice) {
  const antes = lerLinhaDeBase(raiz, config, '');
  if (!antes) {
    process.stdout.write(`${config.linhaDeBase} não existe: modo estrito, nada a atualizar\n`);
    return 0;
  }
  const atuais = {};
  for (const arquivo of doIndice) {
    if (avaliar(arquivo, config, {}).estado !== 'ignorado') atuais[arquivo.caminho] = arquivo.tamanho;
  }
  const depois = atualizarLinhaDeBase(antes, atuais, config.limiteDeBytes);
  gravarLinhaDeBase(raiz, config, depois);
  process.stdout.write(`${config.linhaDeBase}: ${Object.keys(antes).length} -> ${Object.keys(depois).length} arquivo(s); `
    + `dê \`git add ${config.linhaDeBase}\`\n`);
  return 0;
}

function principal(argumentos) {
  const config = lerConfiguracao();
  const raiz = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  if (argumentos.includes('--gerar-linha-de-base')) return gerarLinhaDeBase(raiz, config, tamanhosDoIndice(raiz));
  if (argumentos.includes('--atualizar-linha-de-base')) return atualizarLinhaDeBaseDoIndice(raiz, config, tamanhosDoIndice(raiz));
  return conferirPreparados(raiz, config);
}

if (require.main === module) {
  // Entrada inválida (configuração ou linha de base) barra o commit; uma pane do ambiente ou do próprio
  // gancho não pode travar o commit de ninguém: avisa e deixa passar.
  try {
    process.exit(principal(process.argv.slice(2)));
  } catch (erro) {
    if (erro instanceof ErroDeEntrada) {
      process.stderr.write(mensagemDeEntradaInvalida(erro));
      process.exit(1);
    }
    process.stderr.write(`aviso: a conferência de tamanho (scripts/ganchos/limite-de-tokens.js) falhou e foi pulada: ${erro.message}\n`);
    process.exit(0);
  }
}

module.exports = {
  LIMITE_DE_BYTES, afrouxamentos, atualizarLinhaDeBase, avaliar, globParaRegex, lerConfiguracao, limitarPeloHead, mensagemDeErro, tokensDe,
};
