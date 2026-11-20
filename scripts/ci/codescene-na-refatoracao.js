'use strict';

const { execFileSync } = require('child_process');

const NOME_DO_CHECK = 'CodeScene Code Health Review (main)';
const PRIMEIRA_PR_COBRADA = 639;
const ROTULO_DE_REFATORACAO = 'refatoracao';
const TITULO_DE_REFATORACAO = /codescene|refatora/i;
const PRAZO_PADRAO_S = 600;
const INTERVALO_S = 20;

const AJUDA = `uso: PR_NUMERO=… PR_TITULO=… PR_ROTULOS='["…"]' PR_HEAD=<sha> GITHUB_REPOSITORY=dono/repo GH_TOKEN=… node scripts/ci/codescene-na-refatoracao.js

O passo "CodeScene na refatoração" do job "Regras de revisão": uma PR de número ${PRIMEIRA_PR_COBRADA} ou maior que é de
refatoração (o título cita "CodeScene" ou "refatora", ou a PR tem o rótulo ${ROTULO_DE_REFATORACAO}) só passa com o check
"${NOME_DO_CHECK}" do head em success. As PRs anteriores à #${PRIMEIRA_PR_COBRADA} ficam isentas.

O job pode rodar antes de o CodeScene reportar: o passo espera o check terminar, conferindo a cada ${INTERVALO_S} s, por até
PM_PRAZO_CODESCENE_S segundos (padrão ${PRAZO_PADRAO_S}). Sem o check terminado no prazo, falha dizendo isso: nunca passa sem
o check, e nunca espera para sempre. Para conferir de novo, rode o job outra vez (ou edite o corpo da PR, que o dispara).`;

function ehDeRefatoracao({ titulo, rotulos }) {
  if (rotulos.includes(ROTULO_DE_REFATORACAO)) return true;
  return TITULO_DE_REFATORACAO.test(titulo);
}

function cobranca(pr) {
  if (pr.numero < PRIMEIRA_PR_COBRADA) return { cobra: false, motivo: `a PR #${pr.numero} é anterior à #${PRIMEIRA_PR_COBRADA}: isenta` };
  if (!ehDeRefatoracao(pr)) {
    return { cobra: false, motivo: `a PR #${pr.numero} não é de refatoração (o título não cita "CodeScene" nem "refatora", e falta o rótulo ${ROTULO_DE_REFATORACAO})` };
  }
  return { cobra: true, motivo: `a PR #${pr.numero} é de refatoração` };
}

function situacaoDoCheck(checkRuns) {
  const doCheck = checkRuns.filter(check => check.name === NOME_DO_CHECK).sort((a, b) => b.id - a.id);
  if (!doCheck.length) return { estado: 'ausente' };
  const [ultimo] = doCheck;
  if (ultimo.status !== 'completed') return { estado: 'rodando' };
  return { estado: ultimo.conclusion === 'success' ? 'passou' : 'reprovou', conclusao: ultimo.conclusion };
}

const SEM_RESPOSTA = {
  ausente: 'ainda não reportou',
  rodando: 'ainda não terminou',
};

function veredito(situacao, pr) {
  if (situacao.estado === 'passou') return { ok: true, mensagem: `✓ ${NOME_DO_CHECK}: success no head ${pr.head.slice(0, 7)} da PR #${pr.numero}` };
  return {
    ok: false,
    mensagem: `✗ a PR #${pr.numero} é de refatoração e o check "${NOME_DO_CHECK}" do head ${pr.head.slice(0, 7)} está em ${situacao.conclusao}, não em success. `
      + 'Conserto: refatore até a nota de cada arquivo tocado não cair (o check diz qual); nunca desligue o gate.',
  };
}

function semResposta(situacao, pr, prazoS) {
  return {
    ok: false,
    mensagem: `✗ o check "${NOME_DO_CHECK}" do head ${pr.head.slice(0, 7)} da PR #${pr.numero} ${SEM_RESPOSTA[situacao.estado]} em ${prazoS} s. `
      + 'Uma PR de refatoração não passa sem ele. Quando o CodeScene reportar, rode este job de novo (ou edite o corpo da PR); '
      + 'com o CodeScene fora do ar, o desvio é do dono, anotado no corpo da PR.',
  };
}

async function conferir(pr, portas, prazoS = PRAZO_PADRAO_S) {
  const { cobra, motivo } = cobranca(pr);
  if (!cobra) return { ok: true, mensagem: `${motivo}; o check do CodeScene não é exigido aqui` };
  const limite = portas.agora() + prazoS * 1000;
  for (;;) {
    const situacao = situacaoDoCheck(await portas.lerChecks(pr.head));
    if (!(situacao.estado in SEM_RESPOSTA)) return veredito(situacao, pr);
    if (portas.agora() >= limite) return semResposta(situacao, pr, prazoS);
    portas.avisar(`${NOME_DO_CHECK} ${SEM_RESPOSTA[situacao.estado]}; confiro de novo em ${INTERVALO_S} s`);
    await portas.dormir(INTERVALO_S);
  }
}

function lerChecksPeloGh(repo) {
  return sha => execFileSync('gh', ['api', `repos/${repo}/commits/${sha}/check-runs?check_name=${encodeURIComponent(NOME_DO_CHECK)}&per_page=100`,
    '--jq', '.check_runs[] | {id, name, status, conclusion}'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').filter(Boolean).map(linha => JSON.parse(linha));
}

function prDoAmbiente(env) {
  const pr = { numero: Number(env.PR_NUMERO), titulo: env.PR_TITULO || '', rotulos: JSON.parse(env.PR_ROTULOS || '[]'), head: env.PR_HEAD || '' };
  if (!Number.isInteger(pr.numero) || pr.numero <= 0) throw new Error(`PR_NUMERO inválido: ${env.PR_NUMERO}`);
  if (!/^[0-9a-f]{40}$/.test(pr.head)) throw new Error(`PR_HEAD não é um SHA inteiro: ${env.PR_HEAD}`);
  if (!env.GITHUB_REPOSITORY) throw new Error('falta GITHUB_REPOSITORY');
  return pr;
}

async function principal(argv, env) {
  if (argv.includes('--help')) {
    console.log(AJUDA);
    return 0;
  }
  const pr = prDoAmbiente(env);
  const portas = {
    lerChecks: lerChecksPeloGh(env.GITHUB_REPOSITORY),
    dormir: segundos => new Promise(resolver => setTimeout(resolver, segundos * 1000)),
    agora: () => Date.now(),
    avisar: texto => console.log(texto),
  };
  const { ok, mensagem } = await conferir(pr, portas, Number(env.PM_PRAZO_CODESCENE_S || PRAZO_PADRAO_S));
  console.log(mensagem);
  return ok ? 0 : 1;
}

module.exports = { NOME_DO_CHECK, PRIMEIRA_PR_COBRADA, cobranca, situacaoDoCheck, conferir };

if (require.main === module) {
  principal(process.argv.slice(2), process.env).then(codigo => process.exit(codigo), erro => {
    console.log(`error: ${erro.message}\nhelp: node scripts/ci/codescene-na-refatoracao.js --help`);
    process.exit(1);
  });
}
