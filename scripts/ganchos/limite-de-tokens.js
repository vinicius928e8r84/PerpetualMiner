#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { ErroDeEntrada, lerLinhaDeBaseDoTexto, mensagemDeEntradaInvalida } = require('./entrada-do-gancho.js');
const { mensagemDeAfrouxamento, mensagemDeErro, tokensDe } = require('./mensagens-de-tamanho.js');
const { globParaRegex } = require('./globs.js');
const { carregarConfiguracao, lerConfiguracao, mensagemDeConfiguracao } = require('./configuracao-do-indice.js');
const LIMITE_DE_BYTES = 20000;
const BYTES_LIDOS_PARA_BINARIO = 8000; // a mesma janela que o git usa para decidir se é binário


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
  return config.marcasDeGerado.some(marca => cabecalho.includes(marca));
}

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

function lerLinhaDeBase(raiz, config, versao) {
  let texto;
  try {
    texto = git(raiz, ['cat-file', 'blob', `${versao}:${config.linhaDeBase}`], { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
  return lerLinhaDeBaseDoTexto(texto, `${config.linhaDeBase} (${versao === '' ? 'no índice' : `em ${versao}`})`);
}

function lerLinhaDeBaseDoHead(raiz, config, ref = 'HEAD') {
  try {
    return lerLinhaDeBase(raiz, config, ref);
  } catch (erro) {
    if (erro instanceof ErroDeEntrada) return null;
    throw erro;
  }
}

function tamanhosNoHead(raiz, caminhos, ref = 'HEAD') {
  const validos = caminhos.filter(c => !c.includes('\n'));
  if (!validos.length) return {};
  const saida = git(raiz, ['cat-file', '--batch-check=%(objectsize)'], { input: `${validos.map(c => `${ref}:${c}`).join('\n')}\n` });
  const tamanhos = {};
  saida.split('\n').forEach((linha, i) => { if (/^\d+$/.test(linha)) tamanhos[validos[i]] = Number(linha); });
  return tamanhos;
}

function limitarPeloHead(linhaDeBase, noHead, limite = LIMITE_DE_BYTES) {
  const teto = {};
  for (const [caminho, valor] of Object.entries(linhaDeBase)) {
    if (noHead[caminho] !== undefined && noHead[caminho] > limite) teto[caminho] = Math.min(valor, noHead[caminho]);
  }
  return teto;
}

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

const git = (raiz, args, opcoes = {}) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opcoes });

function tamanhosDosBlobs(raiz, oids) {
  if (!oids.length) return [];
  const saida = git(raiz, ['cat-file', '--batch-check=%(objectsize)'], { input: `${oids.join('\n')}\n` });
  return saida.split('\n').filter(Boolean).map(Number);
}

const lerBlob = (raiz, oid) => git(raiz, ['cat-file', 'blob', oid], { encoding: 'buffer' });

function arquivosPreparados(raiz, desde = null) {
  const saida = git(raiz, desde
    ? ['diff', '--raw', '-z', '--no-abbrev', '--no-renames', '--diff-filter=ACMRT', desde, 'HEAD']
    : ['diff', '--cached', '--raw', '-z', '--no-abbrev', '--no-renames', '--diff-filter=ACMRT']);
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

function tamanhosDoIndice(raiz) {
  const entradas = git(raiz, ['ls-files', '--stage', '-z']).split('\0').filter(Boolean).map(linha => {
    const [meta, caminho] = linha.split('\t');
    const [modo, oid] = meta.split(' ');
    return { caminho, modo, oid };
  }).filter(e => e.modo !== '160000' && e.modo !== '120000');
  const tamanhos = tamanhosDosBlobs(raiz, entradas.map(e => e.oid));
  return entradas.map((e, i) => ({ caminho: e.caminho, tamanho: tamanhos[i], inicio: () => lerBlob(raiz, e.oid) }));
}

const SIMILARIDADE_DA_RENOMEACAO = '90%';

function renomeacoes(raiz, desde = null) {
  const saida = git(raiz, desde
    ? ['diff', '--name-status', '-z', `-M${SIMILARIDADE_DA_RENOMEACAO}`, '--diff-filter=R', desde, 'HEAD']
    : ['diff', '--cached', '--name-status', '-z', `-M${SIMILARIDADE_DA_RENOMEACAO}`, '--diff-filter=R']);
  const pedacos = saida.split('\0');
  const velhoDe = {};
  for (let i = 0; i + 2 < pedacos.length; i += 3) velhoDe[pedacos[i + 2]] = pedacos[i + 1];
  return velhoDe;
}

const NO_GANCHO = { nova: '', velha: 'HEAD', desde: null, titulo: 'Commit barrado' };

function conferirPreparados(raiz, config, problemasDaConfiguracao, comparacao = NO_GANCHO) {
  const preparados = arquivosPreparados(raiz, comparacao.desde);
  const baseDoIndice = lerLinhaDeBase(raiz, config, comparacao.nova) || {};
  const baseDoHeadPuro = lerLinhaDeBaseDoHead(raiz, config, comparacao.velha);
  const velhoDe = renomeacoes(raiz, comparacao.desde);
  const baseDoHead = baseDoHeadPuro && { ...baseDoHeadPuro };
  if (baseDoHead) for (const [novo, velho] of Object.entries(velhoDe)) if (velho in baseDoHead && !(novo in baseDoHead)) baseDoHead[novo] = baseDoHead[velho];
  const consultar = baseDoHead
    ? preparados.map(a => a.caminho).filter(c => c in baseDoIndice)
    : Object.keys(baseDoIndice);
  const noHeadDosVelhos = tamanhosNoHead(raiz, consultar.map(c => velhoDe[c] || c), comparacao.velha);
  const noHead = {};
  for (const c of consultar) if (noHeadDosVelhos[velhoDe[c] || c] !== undefined) noHead[c] = noHeadDosVelhos[velhoDe[c] || c];
  const afrouxadas = afrouxamentos(baseDoIndice, baseDoHead, noHead, config.limiteDeBytes);
  const linhaDeBase = limitarPeloHead(baseDoIndice, noHead, config.limiteDeBytes);
  const falhas = preparados
    .map(arquivo => avaliar(arquivo, config, linhaDeBase))
    .filter(achado => achado.estado === 'excede' || achado.estado === 'cresceu');
  if (!falhas.length && !afrouxadas.length && !problemasDaConfiguracao.length) return 0;
  process.stderr.write(`${comparacao.titulo}: ${falhas.length + afrouxadas.length + (problemasDaConfiguracao.length ? 1 : 0)} problema(s) de tamanho (limite ${config.limiteDeBytes} bytes = ${tokensDe(config.limiteDeBytes, config.bytesPorToken)} tokens).\n\n`);
  const mensagens = [...(problemasDaConfiguracao.length ? [mensagemDeConfiguracao(problemasDaConfiguracao)] : []), ...afrouxadas.map(a => mensagemDeAfrouxamento(a, baseDoHead, config)), ...falhas.map(f => mensagemDeErro(f, config))];
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

function conferirContraBase(raiz, ref) {
  if (/^0+$/.test(ref)) { // o primeiro push de um ramo: sem base, como em scripts/regras/verificar.js
    process.stdout.write('aviso: sem base de comparação (primeiro push); o limite de tamanho não foi conferido\n');
    return 0;
  }
  const resolver = args => { try { return git(raiz, args, { stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
  const teto = resolver(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  if (!teto) throw new ErroDeEntrada('--base', `${ref} não é um commit deste repositório; no CI, confira o fetch-depth e a base`);
  const desde = resolver(['merge-base', 'HEAD', teto]) || teto;
  const { config, problemas } = carregarConfiguracao(raiz, lerConfiguracao(), 'HEAD', teto);
  return conferirPreparados(raiz, config, problemas, { nova: 'HEAD', velha: teto, desde, titulo: `Tamanho de arquivo acima do limite em relação a ${ref}` });
}

function principal(argumentos) {
  const raiz = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  const i = argumentos.indexOf('--base');
  if (i >= 0) {
    if (!argumentos[i + 1] || argumentos[i + 1].startsWith('--')) throw new ErroDeEntrada('--base', 'precisa de um commit');
    return conferirContraBase(raiz, argumentos[i + 1]);
  }
  const { config, problemas } = carregarConfiguracao(raiz, lerConfiguracao());
  if (argumentos.includes('--gerar-linha-de-base')) return gerarLinhaDeBase(raiz, config, tamanhosDoIndice(raiz));
  if (argumentos.includes('--atualizar-linha-de-base')) return atualizarLinhaDeBaseDoIndice(raiz, config, tamanhosDoIndice(raiz));
  return conferirPreparados(raiz, config, problemas);
}

if (require.main === module) {
  try {
    process.exit(principal(process.argv.slice(2)));
  } catch (erro) {
    if (erro instanceof ErroDeEntrada) {
      process.stderr.write(mensagemDeEntradaInvalida(erro));
      process.exit(1);
    }
    if (process.argv.includes('--base')) {
      process.stderr.write(`erro: a conferência de tamanho falhou: ${erro.message}\n`);
      process.exit(1);
    }
    process.stderr.write(`aviso: a conferência de tamanho (scripts/ganchos/limite-de-tokens.js) falhou e foi pulada: ${erro.message}\n`);
    process.exit(0);
  }
}

module.exports = {
  LIMITE_DE_BYTES, afrouxamentos, atualizarLinhaDeBase, avaliar, globParaRegex, lerConfiguracao, limitarPeloHead, mensagemDeErro, tokensDe,
};
