#!/usr/bin/env node
'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const USO = `uso: node scripts/ci/pr-de-versao.js [<head>]

Refaz uma PR de versão da Conexão: quando o <head> (padrão: HEAD) é um commit "Conexão X.Y.Z: versão dada no merge", roda o
complemento/versao_no_merge.py do pai numa cópia do pai, com o número da PR e o mod do .ankiaddon dela, e compara a árvore que
ele dá com a do <head>. Sai 0 quando são iguais (ou quando o <head> não é um commit de versão) e 1 quando diferem, com os arquivos.`;
const ASSUNTO = /^Conexão (\d+(?:\.\d+)*): versão dada no merge$/;
const PACOTE = 'conexao/perpetualminer.ankiaddon';
const IDENTIDADE = { GIT_AUTHOR_NAME: 'pr-de-versao', GIT_AUTHOR_EMAIL: 'pr-de-versao@localhost', GIT_COMMITTER_NAME: 'pr-de-versao', GIT_COMMITTER_EMAIL: 'pr-de-versao@localhost' };

const git = (cwd, ...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...IDENTIDADE } }).trim();
const arvore = (cwd, commit) => new Map(git(cwd, 'ls-tree', '-r', commit).split('\n').filter(Boolean).map(linha => {
  const [info, caminho] = linha.split('\t');
  return [caminho, info];
}));

function modDoPacote(raiz, head) {
  const zip = execFileSync('git', ['show', `${head}:${PACOTE}`], { cwd: raiz, maxBuffer: 64 * 1024 * 1024 });
  const lido = spawnSync('python3', ['-c', 'import io, json, sys, zipfile; print(json.loads(zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())).read("manifest.json"))["mod"])'], { input: zip, encoding: 'utf8' });
  if (lido.status !== 0) throw new Error(`não li o mod do ${PACOTE} do head: ${lido.stderr.trim()}`);
  return lido.stdout.trim();
}

function opcoesDoNumero(versao, reservadas) {
  if (reservadas.includes(versao)) return ['--versao', versao];
  const partes = versao.split('.').map(Number);
  if (partes[partes.length - 1] === 0) return [];
  partes[partes.length - 1] -= 1;
  return ['--acima-de', partes.join('.')];
}

function conferir(raiz, head) {
  const commit = git(raiz, 'rev-parse', '--verify', `${head}^{commit}`);
  const assunto = git(raiz, 'log', '-1', '--format=%s', commit);
  const achado = ASSUNTO.exec(assunto);
  if (!achado) return { ok: true, linha: `não é uma PR de versão: o head ${commit.slice(0, 8)} é "${assunto}", não "Conexão X.Y.Z: versão dada no merge"` };
  const pais = git(raiz, 'rev-list', '--parents', '-n', '1', commit).split(' ').slice(1);
  if (pais.length !== 1) return { ok: false, linha: `o commit de versão ${commit.slice(0, 8)} tem ${pais.length} pais; ele sai do versao_no_merge.py com um só` };
  const [pai] = pais;
  const versao = achado[1];
  const mod = modDoPacote(raiz, commit);

  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-de-versao-'));
  try {
    execFileSync('sh', ['-c', 'git -C "$1" archive "$2" | tar -x -C "$3"', 'sh', raiz, pai, pasta]);
    git(pasta, 'init', '-q');
    git(pasta, 'add', '-A');
    git(pasta, 'commit', '-q', '-m', `pai ${pai}`);
    const reservadasDoPai = path.join(pasta, 'complemento', 'versoes-reservadas.json');
    const reservadas = fs.existsSync(reservadasDoPai) ? JSON.parse(fs.readFileSync(reservadasDoPai, 'utf8')) : [];
    const opcoes = opcoesDoNumero(versao, reservadas);
    const rodado = spawnSync('python3', ['complemento/versao_no_merge.py', '--sem-testes', ...opcoes], { cwd: pasta, encoding: 'utf8', env: { ...process.env, ...IDENTIDADE, SOURCE_DATE_EPOCH: mod } });
    const comando = `SOURCE_DATE_EPOCH=${mod} python3 complemento/versao_no_merge.py --sem-testes ${opcoes.join(' ')}`.trim();
    if (rodado.status !== 0) return { ok: false, linha: `no pai ${pai.slice(0, 8)}, \`${comando}\` saiu ${rodado.status}:\n${(rodado.stdout + rodado.stderr).trim()}` };
    if (git(pasta, 'rev-list', '--count', 'HEAD') === '1') return { ok: false, linha: `no pai ${pai.slice(0, 8)}, \`${comando}\` não dá versão nenhuma: ${rodado.stdout.trim()}` };
    const refeita = arvore(pasta, 'HEAD');
    const daPr = arvore(raiz, commit);
    const diferentes = [...new Set([...refeita.keys(), ...daPr.keys()])].filter(caminho => refeita.get(caminho) !== daPr.get(caminho)).sort();
    if (diferentes.length) return { ok: false, linha: `a PR de versão ${versao} não é o que \`${comando}\` dá no pai ${pai.slice(0, 8)}; diferem:\n${diferentes.map(caminho => `  ${caminho}`).join('\n')}` };
    return { ok: true, linha: `PR de versão ${versao} refeita: \`${comando}\` no pai ${pai.slice(0, 8)} dá a árvore do head ${commit.slice(0, 8)} (${git(raiz, 'rev-parse', `${commit}^{tree}`).slice(0, 12)}), com o mod do pacote da PR` };
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}

const pedeAjuda = args => ['--help', '-h'].some(bandeira => args.includes(bandeira));
const temHeadDemais = args => args.length > 1;

if (require.main === module) {
  const args = process.argv.slice(2);
  if (pedeAjuda(args) || temHeadDemais(args)) {
    console.log(USO);
    process.exit(temHeadDemais(args) ? 2 : 0);
  }
  const raiz = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const { ok, linha } = conferir(raiz, args[0] || 'HEAD');
  console.log(linha);
  process.exit(ok ? 0 : 1);
}

module.exports = { conferir, opcoesDoNumero };
