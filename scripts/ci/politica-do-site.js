'use strict';

const { execFileSync } = require('child_process');
const { linhasQueValem } = require('./registro-da-pr.js');

const PATHSPEC_DO_CODIGO = ['--', 'manifest.json', '*.js', '*.py', ':!e2e', ':!scripts', ':!preview', ':!docs', ':!.agents', ':!**/test_*', ':!test_*', ':!**/contrato/**'];
const ARQUIVO_DE_REGRA = /^(docs\/seguranca\/.*\.rules|complemento\/(retencao_dos_envios|pasta_de_dados|nuvem_da_chave|chaves)\.py)$/;
const ENDERECO_DE_FORA = /https?:\/\/[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
const ENDERECO_QUE_NAO_CONTA = /\/\/(www\.w3\.org|127\.0\.0\.1|localhost)/;
const API_DE_DADOS = /chrome\.(?:storage\.sync|identity|cookies|history|webRequest)/g;
const PR_DO_SITE = /^politica:\s*(?:\[[^\]]*\]\(|<)?https:\/\/github\.com\/vinicius928e8r84\/perpetualminer-site\/pull\/\d+(?:[/?#][^\s)>]*)?[)>]?$/;
const SEM_MUDANCA_COM_MOTIVO = /^politica:\s*sem mudanca:\s*\S/;

const semAcento = texto => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const diferenca = (a, b) => [...a].filter(item => !b.has(item)).sort();

function git(raiz, ...args) {
  return execFileSync('git', args, { cwd: raiz, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function linhasDoDiff(diff) {
  const entram = [];
  const saem = [];
  let noTrecho = false;
  for (const linha of diff.split('\n')) {
    if (linha.startsWith('diff --git')) noTrecho = false;
    else if (linha.startsWith('@@')) noTrecho = true;
    else if (noTrecho && linha[0] === '+') entram.push(linha.slice(1));
    else if (noTrecho && linha[0] === '-') saem.push(linha.slice(1));
  }
  return { entram, saem };
}

const achados = (linhas, padrao, descarta) => new Set(linhas.flatMap(linha => linha.match(padrao) || []).filter(item => !descarta || !descarta.test(item)));

function camposDoManifest(raiz, ref) {
  let manifest = {};
  try {
    manifest = JSON.parse(git(raiz, 'show', `${ref}:manifest.json`));
  } catch {
    manifest = {};
  }
  return JSON.stringify([manifest.permissions, manifest.optional_permissions, manifest.host_permissions, manifest.oauth2, (manifest.content_scripts || []).map(script => script.matches)]);
}

function sinaisDeDados(raiz, base, ponta) {
  const { entram, saem } = linhasDoDiff(git(raiz, 'diff', '-U0', `${base}...${ponta}`, ...PATHSPEC_DO_CODIGO));
  const enderecosQueEntram = achados(entram, ENDERECO_DE_FORA, ENDERECO_QUE_NAO_CONTA);
  const enderecosQueSaem = achados(saem, ENDERECO_DE_FORA, ENDERECO_QUE_NAO_CONTA);
  const apisQueEntram = achados(entram, API_DE_DADOS);
  const apisQueSaem = achados(saem, API_DE_DADOS);
  const regras = git(raiz, 'diff', '--name-only', `${base}...${ponta}`).split('\n').filter(arquivo => ARQUIVO_DE_REGRA.test(arquivo));
  const novos = diferenca(enderecosQueEntram, enderecosQueSaem);
  const idos = diferenca(enderecosQueSaem, enderecosQueEntram);
  const novas = diferenca(apisQueEntram, apisQueSaem);
  const origem = git(raiz, 'merge-base', base, ponta).trim();
  return [
    novos.length && `endereço de fora novo: ${novos.join(' ')}`,
    idos.length && `endereço de fora que saiu: ${idos.join(' ')}`,
    novas.length && `uso novo de: ${novas.join(' ')}`,
    camposDoManifest(raiz, origem) !== camposDoManifest(raiz, ponta) && 'manifest.json: permissões, hosts ou sites dos scripts mudaram',
    regras.length && `arquivo de regra de dados: ${regras.join(' ')}`,
  ].filter(Boolean);
}

function declaracaoDoCorpo(corpo) {
  const linhas = linhasQueValem(corpo).filter(linha => linha.nivel === 0).map(linha => semAcento(linha.texto));
  if (linhas.some(linha => PR_DO_SITE.test(linha))) return 'traz a PR da política';
  if (linhas.some(linha => SEM_MUDANCA_COM_MOTIVO.test(linha))) return 'declara a política sem mudança, com motivo';
  return null;
}

function conferir({ raiz, base, ponta, corpo }) {
  const sinais = sinaisDeDados(raiz, base, ponta);
  if (!sinais.length) return { codigo: 0, mensagem: 'política do site: nenhum sinal de dados mudou' };
  const declaracao = declaracaoDoCorpo(corpo);
  if (declaracao) return { codigo: 0, mensagem: `política do site: sinal de dados, e o corpo ${declaracao}` };
  return {
    codigo: 1,
    mensagem: [
      'política do site: esta PR muda o que o produto faz com dados:',
      ...sinais.map(sinal => `  ${sinal}`),
      'Abra a PR da política em vinicius928e8r84/perpetualminer-site e ponha o link na linha "Política:" do corpo,',
      'ou escreva "Política: sem mudança: <motivo>" (editar o corpo roda o check de novo).',
    ].join('\n'),
  };
}

function main(argv, env, raiz) {
  const [base, ponta = 'HEAD'] = argv;
  if (!base) {
    console.error('uso: PR_BODY=... node scripts/ci/politica-do-site.js <base> [<ponta>]     ex.: origin/main');
    return 2;
  }
  try {
    for (const ref of [base, ponta]) git(raiz, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
  } catch {
    console.error(`política do site: a base "${base}" ou a ponta "${ponta}" não existe neste repositório`);
    return 2;
  }
  let feito;
  try {
    feito = conferir({ raiz, base, ponta, corpo: env.PR_BODY || '' });
  } catch (erro) {
    console.error(`política do site: não consegui ler o diff: ${erro.message}`);
    return 2;
  }
  (feito.codigo ? console.error : console.log)(feito.mensagem);
  return feito.codigo;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2), process.env, process.cwd());

module.exports = { conferir, declaracaoDoCorpo, sinaisDeDados };
