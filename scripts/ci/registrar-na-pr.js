#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const {
  ATENCOES, FRASE, SECAO_DA_PROVA, conferir, faltaDaProva, faltaDaRevisao, indicesForaDoCodigo, lerDoGitHub, semCaixaNemAcento,
} = require('./registro-da-pr.js');

const WORKFLOW = 'registro-da-pr.yml';
const PROVA_BLOQUEADA = 'BLOQUEADA-Mac-Windows';

const AJUDA = `uso: node scripts/ci/registrar-na-pr.js <comando> --pr <número> [opções]

  conferir   diz o que o check "Registro da PR" diria agora, e se ele já rodou no head
  revisao    publica o registro do /code-review num comentário e roda o check de novo
               --head <SHA revisado> --autor <quem escreveu> --revisor <quem revisou> --risco baixa|media|alta
               [--veredito CLEAN] [--nota <arquivo>]
  prova      escreve (ou troca) a seção "${SECAO_DA_PROVA}" do corpo, com o head
               --head <SHA provado> --cobertura total|parcial --nota <arquivo com o que foi provado no produto de verdade e como>

  --risco      o risco que o revisor viu; o check pede a prova real quando ele ou a atenção do corpo é ALTA
  --cobertura  total escreve ${FRASE}; parcial escreve ${PROVA_BLOQUEADA}, e o check não passa com ALTA

  --head       o SHA inteiro do commit que foi revisado ou provado; se não for o head da PR agora, nada é publicado
  --nota       um arquivo de Markdown que entra depois das linhas do registro (na revisão, os achados)
  --publicar   escreve no GitHub; sem ela é um ensaio: mostra o texto e o que o check diria depois
  --repo       <dono/repo> (padrão: $GITHUB_REPOSITORY, senão o remoto origin)

O token vem de $GITHUB_TOKEN, de $GH_TOKEN ou de \`gh auth token\`. Sai com 0 quando o check passaria, 1 quando não
(ou quando recusou publicar) e 2 no erro de uso ou do GitHub.`;

class ErroDeUso extends Error {}

const SHA_INTEIRO = /^[0-9a-f]{40}$/;
const TITULO = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const nomeDoTitulo = texto => texto.replace(/[*_`]/g, '').trim().toLowerCase();

const OPCOES_PEDIDAS = { conferir: [], revisao: ['head', 'autor', 'revisor', 'risco'], prova: ['head', 'cobertura', 'nota'] };
const OPCOES_COM_VALOR = ['pr', 'head', 'veredito', 'autor', 'revisor', 'risco', 'cobertura', 'nota', 'repo'];
const ESCOLHAS = {
  risco: Object.fromEntries(ATENCOES.map(risco => [semCaixaNemAcento(risco), risco])),
  cobertura: { total: FRASE, parcial: PROVA_BLOQUEADA },
};

function pedeAjuda(comando, resto) {
  if (!comando) return true;
  return ['--help', '-h'].includes(comando) || resto.includes('--help');
}

function ehOpcaoComValor(argumento) {
  return argumento.startsWith('--') && OPCOES_COM_VALOR.includes(argumento.slice(2));
}

function valorDaOpcao(argumento, valor) {
  if (valor === undefined || valor.startsWith('--')) throw new ErroDeUso(`${argumento} precisa de um valor`);
  return valor;
}

function lerOpcoes(comando, resto) {
  const opcoes = { comando, veredito: 'CLEAN', publicar: false };
  for (let i = 0; i < resto.length; i++) {
    const argumento = resto[i];
    if (argumento === '--publicar') opcoes.publicar = true;
    else if (ehOpcaoComValor(argumento)) opcoes[argumento.slice(2)] = valorDaOpcao(argumento, resto[++i]);
    else throw new ErroDeUso(`opção desconhecida: ${argumento}`);
  }
  return opcoes;
}

function exigirAsOpcoesDoComando(opcoes) {
  if (!/^\d+$/.test(opcoes.pr || '')) throw new ErroDeUso('--pr <número> é obrigatório');
  const faltam = OPCOES_PEDIDAS[opcoes.comando].filter(nome => !String(opcoes[nome] || '').trim());
  if (faltam.length) throw new ErroDeUso(`${opcoes.comando} pede ${faltam.map(nome => `--${nome}`).join(', ')}`);
}

function escolhaDe(nome, valor) {
  const aceitos = ESCOLHAS[nome];
  const chave = semCaixaNemAcento(valor);
  if (!Object.hasOwn(aceitos, chave)) throw new ErroDeUso(`--${nome} é ${Object.keys(aceitos).join(', ')}; veio "${valor}"`);
  return aceitos[chave];
}

function lerAsEscolhas(opcoes) {
  Object.keys(ESCOLHAS).filter(nome => opcoes[nome] !== undefined).forEach(nome => { opcoes[nome] = escolhaDe(nome, opcoes[nome]); });
}

function lerArgumentos(argv) {
  const [comando, ...resto] = argv;
  if (pedeAjuda(comando, resto)) return { ajuda: true };
  if (!Object.hasOwn(OPCOES_PEDIDAS, comando)) throw new ErroDeUso(`comando desconhecido: ${comando}`);
  const opcoes = lerOpcoes(comando, resto);
  exigirAsOpcoesDoComando(opcoes);
  lerAsEscolhas(opcoes);
  if (opcoes.head) opcoes.head = opcoes.head.trim().toLowerCase();
  return opcoes;
}

const registroDaRevisao = ({ veredito, head, autor, revisor, risco }, nota) => [
  'Registro do /code-review', '', `Veredito: ${veredito}`, `Head: ${head}`, `Autor: ${autor}`, `Revisor: ${revisor}`, `Risco: ${risco}`,
  ...(nota ? ['', nota.trim()] : []),
].join('\n');

const secaoDaProva = (head, nota, cobertura = FRASE) => [`## ${SECAO_DA_PROVA}`, '', cobertura, `Head: ${head}`, ...(nota ? ['', nota.trim()] : [])].join('\n');

function titulosForaDoCodigo(linhas) {
  return indicesForaDoCodigo(linhas)
    .map(indice => ({ indice, titulo: TITULO.exec(linhas[indice]) }))
    .filter(({ titulo }) => titulo)
    .map(({ indice, titulo }) => ({ indice, nivel: titulo[1].length, nome: nomeDoTitulo(titulo[2]) }));
}

function trechoDaProva(titulos, total) {
  const inicio = titulos.findIndex(({ nome }) => nome === SECAO_DA_PROVA.toLowerCase());
  if (inicio < 0) return null;
  const seguinte = titulos.slice(inicio + 1).find(({ nivel }) => nivel <= titulos[inicio].nivel);
  return { inicio: titulos[inicio].indice, fim: seguinte ? seguinte.indice : total };
}

function corpoComAProva(corpo, secao) {
  const linhas = String(corpo || '').split(/\r?\n/);
  const visiveis = linhas.join('\n').replace(/<!--[^]*?(?:-->|$)/g, trecho => trecho.replace(/[^\n]/g, ' ')).split('\n');
  const trecho = trechoDaProva(titulosForaDoCodigo(visiveis), linhas.length);
  if (!trecho) return `${linhas.join('\n').replace(/\s+$/, '')}\n\n${secao}\n`;
  return [...linhas.slice(0, trecho.inicio), secao, '', ...linhas.slice(trecho.fim)].join('\n');
}

function faltaDoHeadInformado(informado, head, oQue) {
  if (informado === head) return null;
  if (!SHA_INTEIRO.test(informado)) return `--head pede o SHA inteiro, de 40 caracteres (\`git rev-parse HEAD\`); veio "${informado}"`;
  return `${oQue} é do commit ${informado}, e o head da PR agora é ${head}: um commit novo muda o head, e o que valia para o anterior não vale. `
    + `${oQue === 'a revisão' ? 'Revise' : 'Prove'} o head novo (\`git diff ${informado.slice(0, 8)}..${head.slice(0, 8)}\` mostra o que mudou).`;
}

function planoDaRevisao(opcoes, pr, nota) {
  const { head } = pr;
  const comentario = registroDaRevisao({ ...opcoes, head }, nota);
  const registros = [...pr.registros, comentario];
  const limpo = opcoes.veredito === 'CLEAN';
  const falta = limpo && faltaDaRevisao(registros, head);
  if (falta) return { recusa: `o check não aceitaria este registro: ${falta}` };
  return { comentario, depois: conferir({ ...pr, registros, head }) };
}

function planoDaProva(opcoes, pr, nota) {
  const { head } = pr;
  const secao = secaoDaProva(head, nota, opcoes.cobertura);
  const corpo = corpoComAProva(pr.corpo, secao);
  const falta = opcoes.cobertura === FRASE && faltaDaProva(corpo, head);
  if (falta) return { recusa: `o check não aceitaria esta prova: ${falta}` };
  return { corpo, secao, depois: conferir({ ...pr, corpo, head }) };
}

function planejar(opcoes, pr, nota) {
  const { head } = pr;
  if (opcoes.comando === 'conferir') return { depois: conferir({ ...pr, head }) };
  const foraDoHead = faltaDoHeadInformado(opcoes.head, head, opcoes.comando === 'revisao' ? 'a revisão' : 'a prova');
  if (foraDoHead) return { recusa: foraDoHead };
  return opcoes.comando === 'revisao' ? planoDaRevisao(opcoes, pr, nota) : planoDaProva(opcoes, pr, nota);
}

function cliente(env) {
  return async (metodo, caminho, corpo) => {
    const resposta = await fetch(`${env.GITHUB_API_URL || 'https://api.github.com'}/repos/${env.GITHUB_REPOSITORY}/${caminho}`, {
      method: metodo,
      headers: { accept: 'application/vnd.github+json', 'content-type': 'application/json', ...(env.GITHUB_TOKEN ? { authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    if (!resposta.ok) throw new Error(`o GitHub respondeu ${resposta.status} a ${metodo} ${caminho}`);
    const texto = await resposta.text();
    return texto ? JSON.parse(texto) : null;
  };
}

/** A execução mais recente do check no head, ou null: sem ela o check obrigatório fica esperando para sempre. */
async function execucaoDoCheck(pedir, head) {
  const { workflow_runs: execucoes } = await pedir('GET', `actions/workflows/${WORKFLOW}/runs?head_sha=${head}&per_page=20`);
  return execucoes.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null;
}

const semExecucao = ({ numero, repo }) => '  O check "Registro da PR" não tem execução neste head, e um comentário não cria uma. Se a PR acabou de receber '
  + 'um commit ou uma edição, espere um minuto e confira de novo. Senão (a PR é de antes de o check existir na main), feche e reabra a PR: o head não muda, '
  + `e a revisão e a prova continuam valendo: gh pr close ${numero} -R ${repo} && gh pr reopen ${numero} -R ${repo}`;

/** Roda o check de novo no head (um comentário não dispara o workflow) e diz o que fez. */
async function rodarDeNovo(pedir, pr, qual) {
  const execucao = await execucaoDoCheck(pedir, pr.head);
  if (!execucao) return semExecucao(qual);
  if (execucao.status !== 'completed') return `  O check já está rodando neste head (execução ${execucao.id}).`;
  await pedir('POST', `actions/runs/${execucao.id}/rerun`);
  return `  Check rodando de novo (execução ${execucao.id}): ${execucao.html_url || ''}`.trimEnd();
}

function saidaDoComando(comando, args) {
  try { return execFileSync(comando, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
}

function repositorioDoOrigin() {
  return (/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(saidaDoComando('git', ['remote', 'get-url', 'origin'])) || [])[1];
}

function tokenDoGitHub(env) {
  return env.GITHUB_TOKEN || env.GH_TOKEN || saidaDoComando('gh', ['auth', 'token']);
}

function ambiente(env, opcoes) {
  const repo = opcoes.repo || env.GITHUB_REPOSITORY || repositorioDoOrigin();
  if (!repo) throw new ErroDeUso('não sei qual é o repositório: passe --repo <dono/repo>');
  return { ...env, GITHUB_REPOSITORY: repo, PR: opcoes.pr, GITHUB_TOKEN: tokenDoGitHub(env) };
}

const PUBLICACOES = {
  revisao: {
    onde: 'O comentário',
    texto: plano => plano.comentario,
    gravar: (pedir, numero, plano) => pedir('POST', `issues/${numero}/comments`, { body: plano.comentario }),
    gravada: 'Registro publicado.',
  },
  prova: {
    onde: 'A seção que entra no corpo',
    texto: plano => plano.secao,
    gravar: (pedir, numero, plano) => pedir('PATCH', `pulls/${numero}`, { body: plano.corpo }),
    gravada: 'Corpo gravado (a edição do corpo dispara o check).',
  },
};

async function publicar(publicacao, pedir, opcoes, plano) {
  const ensaio = opcoes.publicar ? '' : ' (ensaio: nada foi publicado; repita com --publicar)';
  console.log(`${publicacao.onde} da PR ${opcoes.pr}${ensaio}:\n\n${publicacao.texto(plano).replace(/^/gm, '    ')}\n`);
  if (!opcoes.publicar) return;
  await publicacao.gravar(pedir, opcoes.pr, plano);
  console.log(publicacao.gravada);
}

function passoDoCheck(opcoes) {
  if (opcoes.comando === 'prova') return 'aEdicaoDoCorpoDispara';
  return opcoes.comando === 'revisao' && opcoes.publicar ? 'rodarDeNovo' : 'avisarSemExecucao';
}

const PASSOS_DO_CHECK = {
  aEdicaoDoCorpoDispara: async () => null,
  rodarDeNovo,
  avisarSemExecucao: async (pedir, pr, qual) => (await execucaoDoCheck(pedir, pr.head) ? null : semExecucao(qual)),
};

async function executar(opcoes, env) {
  const nota = opcoes.nota ? fs.readFileSync(opcoes.nota, 'utf8') : '';
  const pedir = cliente(env);
  const pr = await lerDoGitHub(env);
  const plano = planejar(opcoes, pr, nota);
  if (plano.recusa) { console.log(`✗ Nada foi publicado na PR ${opcoes.pr}: ${plano.recusa}`); return 1; }
  const publicacao = PUBLICACOES[opcoes.comando];
  if (publicacao) await publicar(publicacao, pedir, opcoes, plano);
  console.log(`${publicacao ? 'Com isso publicado, o check diz:\n' : ''}${plano.depois.mensagem}`);
  const aviso = await PASSOS_DO_CHECK[passoDoCheck(opcoes)](pedir, pr, { numero: opcoes.pr, repo: env.GITHUB_REPOSITORY });
  if (aviso) console.log(aviso);
  return plano.depois.ok ? 0 : 1;
}

function pedidoDaLinhaDeComando(argv, env) {
  try {
    const opcoes = lerArgumentos(argv);
    return opcoes.ajuda ? { ajuda: true } : { opcoes, env: ambiente(env, opcoes) };
  } catch (erro) {
    if (!(erro instanceof ErroDeUso)) throw erro;
    return { erroDeUso: erro.message };
  }
}

async function main(argv, env) {
  const pedido = pedidoDaLinhaDeComando(argv, env);
  if (pedido.ajuda) { console.log(AJUDA); return 0; }
  if (pedido.erroDeUso) { console.log(`${pedido.erroDeUso}\n\n${AJUDA}`); return 2; }
  try {
    return await executar(pedido.opcoes, pedido.env);
  } catch (erro) {
    console.log(`✗ ${erro.message}`);
    return 2;
  }
}

if (require.main === module) main(process.argv.slice(2), process.env).then(codigo => { process.exitCode = codigo; });

module.exports = { PROVA_BLOQUEADA, corpoComAProva, planejar, secaoDaProva };
