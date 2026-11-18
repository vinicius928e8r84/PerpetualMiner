#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const { FRASE, MODELO, SECAO_DA_PROVA, conferir, faltaDaProva, faltaDaRevisao, faltasDoCorpo, lerDoGitHub, linhasQueValem } = require('./registro-da-pr.js');

const WORKFLOW = 'registro-da-pr.yml';

const AJUDA = `uso: node scripts/ci/registrar-na-pr.js <comando> --pr <número> [opções]

  corpo      diz o que o check "Registro da PR" diria de um corpo que ainda está num arquivo, antes de abrir ou
             editar a PR; não pede --pr e não fala com o GitHub
               --arquivo <corpo.md>
  conferir   diz o que o check "Registro da PR" diria agora, e se ele já rodou no head
  revisao    publica o registro do /code-review num comentário e roda o check de novo
               --head <SHA revisado> --autor <quem escreveu> --revisor <quem revisou> [--veredito CLEAN] [--nota <arquivo>]
  prova      escreve (ou troca) a seção "${SECAO_DA_PROVA}" do corpo, com ${FRASE} e o head
               --head <SHA provado> --nota <arquivo com o que foi provado no produto de verdade e como>

  --head       o SHA inteiro do commit que foi revisado ou provado; se não for o head da PR agora, nada é publicado
  --nota       um arquivo de Markdown que entra depois das linhas do registro (na revisão, os achados)
  --publicar   escreve no GitHub; sem ela é um ensaio: mostra o texto e o que o check diria depois
  --repo       <dono/repo> (padrão: $GITHUB_REPOSITORY, senão o remoto origin)

O token vem de $GITHUB_TOKEN, de $GH_TOKEN ou de \`gh auth token\`. Sai com 0 quando o check passaria, 1 quando não
(ou quando recusou publicar) e 2 no erro de uso ou do GitHub.`;

class ErroDeUso extends Error {}

const SHA_INTEIRO = /^[0-9a-f]{40}$/;
const TITULO = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const CERCA = /^ {0,3}(`{3,}|~{3,})/;
const nomeDoTitulo = texto => texto.replace(/[*_`]/g, '').trim().toLowerCase();

function lerArgumentos(argv) {
  const [comando, ...resto] = argv;
  if (!comando || comando === '--help' || comando === '-h' || resto.includes('--help')) return { ajuda: true };
  if (!['corpo', 'conferir', 'revisao', 'prova'].includes(comando)) throw new ErroDeUso(`comando desconhecido: ${comando}`);
  const opcoes = { comando, veredito: 'CLEAN', publicar: false };
  const comValor = ['pr', 'head', 'veredito', 'autor', 'revisor', 'nota', 'repo', 'arquivo'];
  for (let i = 0; i < resto.length; i++) {
    const nome = resto[i].replace(/^--/, '');
    if (resto[i] === '--publicar') opcoes.publicar = true;
    else if (resto[i].startsWith('--') && comValor.includes(nome)) {
      if (resto[i + 1] === undefined || resto[i + 1].startsWith('--')) throw new ErroDeUso(`${resto[i]} precisa de um valor`);
      opcoes[nome] = resto[++i];
    } else throw new ErroDeUso(`opção desconhecida: ${resto[i]}`);
  }
  if (comando !== 'corpo' && !/^\d+$/.test(opcoes.pr || '')) throw new ErroDeUso('--pr <número> é obrigatório');
  const pedidas = { corpo: ['arquivo'], conferir: [], revisao: ['head', 'autor', 'revisor'], prova: ['head', 'nota'] }[comando];
  const faltam = pedidas.filter(nome => !String(opcoes[nome] || '').trim());
  if (faltam.length) throw new ErroDeUso(`${comando} pede ${faltam.map(nome => `--${nome}`).join(', ')}`);
  if (opcoes.head) opcoes.head = opcoes.head.trim().toLowerCase();
  return opcoes;
}

const registroDaRevisao = ({ veredito, head, autor, revisor }, nota) => [
  'Registro do /code-review', '', `Veredito: ${veredito}`, `Head: ${head}`, `Autor: ${autor}`, `Revisor: ${revisor}`,
  ...(nota ? ['', nota.trim()] : []),
].join('\n');

const secaoDaProva = (head, nota) => [`## ${SECAO_DA_PROVA}`, '', FRASE, `Head: ${head}`, ...(nota ? ['', nota.trim()] : [])].join('\n');

function corpoComAProva(corpo, secao) {
  const linhas = String(corpo || '').split(/\r?\n/);
  const visiveis = linhas.join('\n').replace(/<!--[^]*?(?:-->|$)/g, trecho => trecho.replace(/[^\n]/g, ' ')).split('\n');
  let cerca = null;
  let inicio = -1;
  let fim = linhas.length;
  for (let i = 0; i < visiveis.length; i++) {
    const abre = CERCA.exec(visiveis[i]);
    if (abre && !cerca) cerca = abre[1];
    else if (abre && abre[1][0] === cerca[0] && abre[1].length >= cerca.length && visiveis[i].trim() === abre[1]) cerca = null;
    const titulo = !cerca && !abre && TITULO.exec(visiveis[i]);
    if (!titulo) continue;
    if (inicio < 0 && nomeDoTitulo(titulo[2]) === SECAO_DA_PROVA.toLowerCase()) inicio = i;
    else if (inicio >= 0 && titulo[1].length <= TITULO.exec(visiveis[inicio])[1].length) { fim = i; break; }
  }
  if (inicio < 0) return `${linhas.join('\n').replace(/\s+$/, '')}\n\n${secao}\n`;
  return [...linhas.slice(0, inicio), secao, '', ...linhas.slice(fim)].join('\n');
}

function conferirCorpo(corpo, repositorio) {
  const { atencao, faltas } = faltasDoCorpo({ corpo, repositorio });
  if (faltas.length) {
    return {
      ok: false,
      mensagem: [
        '✗ O check "Registro da PR" recusaria este corpo:',
        ...faltas.map(falta => `    - ${falta}`),
        `  Conserto: o formato de cada parte está em ${MODELO}. O que está em comentário de HTML, em bloco de código ou em citação não conta.`,
      ].join('\n'),
    };
  }
  const depois = atencao === 'ALTA' ? `o registro do /code-review e a seção "${SECAO_DA_PROVA}", os dois do head` : 'o registro do /code-review do head';
  return { ok: true, mensagem: `corpo ok para o check "Registro da PR": atenção ${atencao}, issue dita. Com a PR aberta falta ${depois}.` };
}

function faltaDoHeadInformado(informado, head, oQue) {
  if (informado === head) return null;
  if (!SHA_INTEIRO.test(informado)) return `--head pede o SHA inteiro, de 40 caracteres (\`git rev-parse HEAD\`); veio "${informado}"`;
  return `${oQue} é do commit ${informado}, e o head da PR agora é ${head}: um commit novo muda o head, e o que valia para o anterior não vale. `
    + `${oQue === 'a revisão' ? 'Revise' : 'Prove'} o head novo (\`git diff ${informado.slice(0, 8)}..${head.slice(0, 8)}\` mostra o que mudou).`;
}

function planejar(opcoes, pr, nota) {
  const { head } = pr;
  if (opcoes.comando === 'conferir') return { depois: conferir({ ...pr, head }) };
  const foraDoHead = faltaDoHeadInformado(opcoes.head, head, opcoes.comando === 'revisao' ? 'a revisão' : 'a prova');
  if (foraDoHead) return { recusa: foraDoHead };
  if (opcoes.comando === 'revisao') {
    const comentario = registroDaRevisao({ ...opcoes, head }, nota);
    const registros = [...pr.registros, comentario];
    const limpo = opcoes.veredito === 'CLEAN';
    const falta = limpo && faltaDaRevisao(registros, head);
    if (falta) return { recusa: `o check não aceitaria este registro: ${falta}` };
    return { comentario, depois: conferir({ ...pr, registros, head }) };
  }
  const secao = secaoDaProva(head, nota);
  const corpo = corpoComAProva(pr.corpo, secao);
  const falta = faltaDaProva(linhasQueValem(corpo), head);
  if (falta) return { recusa: `o check não aceitaria esta prova: ${falta.replace(/^atenção ALTA: /, '')}` };
  return { corpo, secao, depois: conferir({ ...pr, corpo, head }) };
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

function ambiente(env, opcoes) {
  const tentar = (comando, args) => {
    try { return execFileSync(comando, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
  };
  const doRemoto = () => (/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(tentar('git', ['remote', 'get-url', 'origin'])) || [])[1];
  const repo = opcoes.repo || env.GITHUB_REPOSITORY || doRemoto();
  if (opcoes.comando === 'corpo') return { ...env, GITHUB_REPOSITORY: repo };
  if (!repo) throw new ErroDeUso('não sei qual é o repositório: passe --repo <dono/repo>');
  return { ...env, GITHUB_REPOSITORY: repo, PR: opcoes.pr, GITHUB_TOKEN: env.GITHUB_TOKEN || env.GH_TOKEN || tentar('gh', ['auth', 'token']) };
}

async function main(argv, env) {
  let opcoes;
  try {
    opcoes = lerArgumentos(argv);
    if (opcoes.ajuda) { console.log(AJUDA); return 0; }
    env = ambiente(env, opcoes);
  } catch (erro) {
    if (!(erro instanceof ErroDeUso)) throw erro;
    console.log(`${erro.message}\n\n${AJUDA}`);
    return 2;
  }
  try {
    if (opcoes.comando === 'corpo') {
      const { ok, mensagem } = conferirCorpo(fs.readFileSync(opcoes.arquivo, 'utf8'), env.GITHUB_REPOSITORY);
      console.log(mensagem);
      return ok ? 0 : 1;
    }
    const nota = opcoes.nota ? fs.readFileSync(opcoes.nota, 'utf8') : '';
    const pedir = cliente(env);
    const pr = await lerDoGitHub(env);
    const plano = planejar(opcoes, pr, nota);
    if (plano.recusa) { console.log(`✗ Nada foi publicado na PR ${opcoes.pr}: ${plano.recusa}`); return 1; }
    const qual = { numero: opcoes.pr, repo: env.GITHUB_REPOSITORY };
    const texto = plano.comentario || plano.secao;
    if (texto) {
      const onde = plano.comentario ? 'O comentário' : 'A seção que entra no corpo';
      console.log(`${onde} da PR ${opcoes.pr}${opcoes.publicar ? '' : ' (ensaio: nada foi publicado; repita com --publicar)'}:\n\n${texto.replace(/^/gm, '    ')}\n`);
    }
    if (texto && opcoes.publicar) {
      if (plano.comentario) await pedir('POST', `issues/${opcoes.pr}/comments`, { body: plano.comentario });
      else await pedir('PATCH', `pulls/${opcoes.pr}`, { body: plano.corpo });
      console.log(plano.comentario ? 'Registro publicado.' : 'Corpo gravado (a edição do corpo dispara o check).');
    }
    console.log(`${texto ? 'Com isso publicado, o check diz:\n' : ''}${plano.depois.mensagem}`);
    // A edição do corpo dispara o check sozinha; o comentário não, e sem execução no head ele nunca fica verde.
    if (plano.comentario && opcoes.publicar) console.log(await rodarDeNovo(pedir, pr, qual));
    else if (!plano.corpo && !await execucaoDoCheck(pedir, pr.head)) console.log(semExecucao(qual));
    return plano.depois.ok ? 0 : 1;
  } catch (erro) {
    console.log(`✗ ${erro.message}`);
    return 2;
  }
}

if (require.main === module) main(process.argv.slice(2), process.env).then(codigo => { process.exitCode = codigo; });

module.exports = { conferirCorpo, corpoComAProva, planejar, registroDaRevisao, secaoDaProva };
