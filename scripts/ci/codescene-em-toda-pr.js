'use strict';

const { execFileSync } = require('child_process');

const NOME_DO_CHECK = 'CodeScene Code Health Review (main)';
const PRIMEIRA_PR_COBRADA = 639;
const LIBERACAO_DO_DONO = 'Liberação do dono (CodeScene)';
const PRAZO_PADRAO_S = 600;
const INTERVALO_S = 20;

const AJUDA = `uso: PR_NUMERO=… PR_CORPO=… PR_HEAD=<sha> GITHUB_REPOSITORY=dono/repo GH_TOKEN=… node scripts/ci/codescene-em-toda-pr.js

O passo "CodeScene em toda PR" do job "Regras de revisão": toda PR de número ${PRIMEIRA_PR_COBRADA} ou maior só passa com o check
"${NOME_DO_CHECK}" do head em success, seja qual for o título ou o rótulo. As PRs anteriores à #${PRIMEIRA_PR_COBRADA} ficam isentas.
Há dois apps do CodeScene com esse check (o da nuvem e o do servidor local): vale a rodada mais nova de cada um, e todas têm de
estar em success.

O job pode rodar antes de o CodeScene reportar: o passo espera o check terminar, conferindo a cada ${INTERVALO_S} s, por até
PM_PRAZO_CODESCENE_S segundos (padrão ${PRAZO_PADRAO_S}). Sem o check terminado no prazo, falha dizendo isso: nunca passa sem
o check, e nunca espera para sempre. Para conferir de novo, rode o job outra vez (ou edite o corpo da PR, que o dispara).

A liberação do dono vale para uma PR e um head: uma linha do corpo da PR, começando por "${LIBERACAO_DO_DONO}:" e seguida do head
(7 a 40 dígitos), isenta a PR enquanto esse head for o dela. Um push novo muda o head e a perde.`;

function liberacaoDoDono(corpo, head) {
  const linha = new RegExp(`^[ \\t]*${LIBERACAO_DO_DONO.replace(/[()]/g, '\\$&')}:[ \\t]*([0-9a-f]{7,40})\\b`, 'gim');
  return [...corpo.matchAll(linha)].some(achado => head.startsWith(achado[1].toLowerCase()));
}

function cobranca(pr) {
  if (pr.numero < PRIMEIRA_PR_COBRADA) return { cobra: false, motivo: `a PR #${pr.numero} é anterior à #${PRIMEIRA_PR_COBRADA}: isenta` };
  if (liberacaoDoDono(pr.corpo, pr.head)) return { cobra: false, motivo: `liberação do dono para o head ${pr.head.slice(0, 7)} da PR #${pr.numero}, anotada no corpo da PR` };
  return { cobra: true, motivo: `a PR #${pr.numero} é cobrada` };
}

function ultimaRodadaPorApp(checkRuns) {
  const ultimas = new Map();
  for (const check of checkRuns.filter(c => c.name === NOME_DO_CHECK).sort((a, b) => a.id - b.id)) ultimas.set(check.app, check);
  return [...ultimas.values()];
}

function situacaoDoCheck(checkRuns) {
  const ultimas = ultimaRodadaPorApp(checkRuns);
  if (!ultimas.length) return { estado: 'ausente' };
  if (ultimas.some(check => check.status !== 'completed')) return { estado: 'rodando' };
  const reprovada = ultimas.find(check => check.conclusion !== 'success');
  return reprovada ? { estado: 'reprovou', conclusao: reprovada.conclusion } : { estado: 'passou', conclusao: 'success' };
}

const SEM_RESPOSTA = {
  ausente: 'ainda não reportou',
  rodando: 'ainda não terminou',
};

function veredito(situacao, pr) {
  if (situacao.estado === 'passou') return { ok: true, mensagem: `✓ ${NOME_DO_CHECK}: success no head ${pr.head.slice(0, 7)} da PR #${pr.numero}` };
  return {
    ok: false,
    mensagem: `✗ a PR #${pr.numero} é cobrada e o check "${NOME_DO_CHECK}" do head ${pr.head.slice(0, 7)} está em ${situacao.conclusao}, não em success. `
      + 'Conserto: refatore até a nota de cada arquivo tocado não cair (o check diz qual); nunca desligue o gate.',
  };
}

function semResposta(situacao, pr, prazoS) {
  return {
    ok: false,
    mensagem: `✗ o check "${NOME_DO_CHECK}" do head ${pr.head.slice(0, 7)} da PR #${pr.numero} ${SEM_RESPOSTA[situacao.estado]} em ${prazoS} s. `
      + 'Nenhuma PR passa sem ele. Quando o CodeScene reportar, rode este job de novo (ou edite o corpo da PR); '
      + `com o CodeScene fora do ar, o desvio é do dono: a linha "${LIBERACAO_DO_DONO}: <head>" no corpo da PR.`,
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
    '--jq', '.check_runs[] | {id, name, status, conclusion, app: .app.slug}'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').filter(Boolean).map(linha => JSON.parse(linha));
}

function problemaDoAmbiente(env) {
  if (!/^[1-9][0-9]*$/.test(env.PR_NUMERO || '')) return `PR_NUMERO inválido: ${env.PR_NUMERO}`;
  if (!/^[0-9a-f]{40}$/.test(env.PR_HEAD || '')) return `PR_HEAD não é um SHA inteiro: ${env.PR_HEAD}`;
  return env.GITHUB_REPOSITORY ? null : 'falta GITHUB_REPOSITORY';
}

function prDoAmbiente(env) {
  const problema = problemaDoAmbiente(env);
  if (problema) throw new Error(problema);
  return { numero: Number(env.PR_NUMERO), corpo: env.PR_CORPO || '', head: env.PR_HEAD };
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

module.exports = { NOME_DO_CHECK, PRIMEIRA_PR_COBRADA, cobranca, liberacaoDoDono, situacaoDoCheck, conferir };

if (require.main === module) {
  principal(process.argv.slice(2), process.env).then(codigo => process.exit(codigo), erro => {
    console.log(`error: ${erro.message}\nhelp: node scripts/ci/codescene-em-toda-pr.js --help`);
    process.exit(1);
  });
}
