'use strict';

const SECOES_DO_MODELO = ['Summary', 'Evidence', 'Merge Danger'];
const CAMPOS_DO_MODELO = ['Door', 'Blast Radius', 'Política'];
const ATENCOES = ['BAIXA', 'MÉDIA', 'ALTA'];
const ROTULO_DE_RISCO_ALTO = 'risco:alto';
const SECAO_DA_PROVA = 'Prova real';
const FRASE = 'PROVADO 100% REAL';
const VEREDITO_LIMPO = 'CLEAN';
// Num repositório público qualquer pessoa comenta: só vale o registro de quem pode escrever no repositório.
const QUEM_REGISTRA = ['OWNER', 'MEMBER', 'COLLABORATOR'];
const MODELO = '.github/PULL_REQUEST_TEMPLATE.md';
const { soMergesLimposDaMain } = require('./so-merge-da-main.js');
const PUBLICADOR = 'scripts/ci/registrar-na-pr.js';
const CONFERIDOR_DO_CORPO = 'scripts/ci/corpo-da-pr.js';

const urlDaIssue = repositorio => new RegExp(`^https://github\\.com/${repositorio ? repositorio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '[\\w.-]+/[\\w.-]+'}/issues/\\d+$`, 'i');
const TEXTO_PURO = /^(?! {4}|\t)[^`]*$/;
const LINHA_DE_FECHAMENTO = /^(closes|refs)\s+(\S.*)$/i;
const SEM_ISSUE = 'Sem issue';
const PROVA_QUE_FALTA = 'Prova que falta';

const SHA_INTEIRO = /^[0-9a-f]{40}$/;
const TITULO = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const CERCA = /^ {0,3}(`{3,}|~{3,})/;
const CITACAO = /^ {0,3}>/;

const semMarcacao = texto => texto.replace(/[*_`]/g, '').replace(/^[\s-]+|[\s.!]+$/g, '');
const semCaixaNemAcento = texto => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const igual = (a, b) => semCaixaNemAcento(a) === semCaixaNemAcento(b);

function marcaDaCerca(linha) {
  const abre = CERCA.exec(linha);
  return abre ? abre[1] : null;
}

function marcaQueFecha(marca, cerca) {
  return marca[0] === cerca[0] && marca.length >= cerca.length;
}

function fechaACerca(linha, marca, cerca) {
  return marcaQueFecha(marca, cerca) && linha.trim() === marca;
}

function cercaDepoisDa(linha, cerca) {
  const marca = marcaDaCerca(linha);
  if (!marca) return cerca;
  if (!cerca) return marca;
  return fechaACerca(linha, marca, cerca) ? null : cerca;
}

function indicesForaDoCodigo(linhas) {
  const fora = [];
  let cerca = null;
  linhas.forEach((linha, indice) => {
    if (!cerca && !marcaDaCerca(linha)) fora.push(indice);
    cerca = cercaDepoisDa(linha, cerca);
  });
  return fora;
}

function linhaQueVale(linha) {
  const titulo = TITULO.exec(linha);
  return { texto: semMarcacao(titulo ? titulo[2] : linha), nivel: titulo ? titulo[1].length : 0, puro: TEXTO_PURO.test(linha) };
}

function linhasQueValem(markdown) {
  const linhas = String(markdown || '').replace(/<!--[^]*?(?:-->|$)/g, '').split(/\r?\n/);
  return indicesForaDoCodigo(linhas).map(indice => linhas[indice]).filter(linha => !CITACAO.test(linha)).map(linhaQueVale);
}

function secao(linhas, nome) {
  const inicio = linhas.findIndex(linha => linha.nivel && igual(linha.texto, nome));
  if (inicio < 0) return null;
  const resto = linhas.slice(inicio + 1);
  const fim = resto.findIndex(linha => linha.nivel && linha.nivel <= linhas[inicio].nivel);
  return (fim < 0 ? resto : resto.slice(0, fim)).map(linha => linha.texto);
}

const valoresDe = (textos, campo) => textos.filter(texto => texto.includes(':'))
  .map(texto => [texto.slice(0, texto.indexOf(':')), texto.slice(texto.indexOf(':') + 1).trim()])
  .filter(([nome, valor]) => valor && igual(nome, campo)).map(([, valor]) => valor);

const hexasDe = textos => textos.join('\n').toLowerCase().match(/[0-9a-f]+/g) || [];

function faltaDoHead(textos, head, oQue) {
  const hexas = hexasDe(valoresDe(textos, 'Head'));
  if (hexas.includes(head)) return null;
  const outro = hexas.find(hexa => SHA_INTEIRO.test(hexa));
  if (outro) return `${oQue} é do commit ${outro}, que não é o head (o head mudou: o que valia para o commit anterior não vale)`;
  if (hexas.some(hexa => hexa.length >= 7 && head.startsWith(hexa))) return `${oQue} tem o SHA do head abreviado; escreva os 40 caracteres`;
  return `${oQue} não tem a linha "Head:" com o SHA do head`;
}

function atencaoDe(textos) {
  const ditas = [...new Set(valoresDe(textos, 'Atenção').map(valor => ATENCOES.find(atencao => igual(atencao, valor)) || valor))];
  if (ditas.length === 1 && ATENCOES.includes(ditas[0])) return { atencao: ditas[0] };
  if (!ditas.length) return { falta: `o corpo não tem o campo de atenção preenchido (uma linha "Atenção: ${ATENCOES.join('", "Atenção: ')}")` };
  if (ditas.length > 1) return { falta: `o corpo diz mais de uma atenção (${ditas.join(' e ')})` };
  return { falta: `a atenção "${ditas[0]}" do corpo não é ${ATENCOES.join(' nem ')} (o valor sozinho na linha)` };
}

function registroQueVale(registros, head, equivalentes = []) {
  const todos = registros.map(linhasQueValem).map(linhas => linhas.map(linha => linha.texto)).filter(textos => valoresDe(textos, 'Veredito').length);
  const aceitos = [head, ...equivalentes];
  const doHead = todos.filter(textos => aceitos.some(aceito => !faltaDoHead(textos, aceito))).pop();
  return { todos, doHead, headDoRegistro: doHead && aceitos.find(aceito => !faltaDoHead(doHead, aceito)) };
}

function faltaDaRevisao(registros, head, equivalentes = []) {
  const { todos, doHead } = registroQueVale(registros, head, equivalentes);
  if (!doHead) {
    return todos.length ? faltaDoHead(todos[todos.length - 1], head, 'o registro do /code-review mais recente')
      : 'nenhum comentário ou revisão da PR é o registro do /code-review (as linhas "Veredito: CLEAN", "Head: <SHA>", "Autor:" e "Revisor:")';
  }
  const vereditos = valoresDe(doHead, 'Veredito');
  if (!vereditos.every(veredito => veredito === VEREDITO_LIMPO)) return `o veredito do registro mais recente do /code-review deste head é ${vereditos.join(' e ')}, não ${VEREDITO_LIMPO}`;
  const [autor] = valoresDe(doHead, 'Autor');
  const [revisor] = valoresDe(doHead, 'Revisor');
  if (!autor || !revisor) return 'o registro do /code-review não diz quem é o autor e quem é o revisor (as linhas "Autor:" e "Revisor:")';
  if (igual(autor, revisor)) return `o revisor do registro do /code-review é o próprio autor (${autor})`;
  return null;
}

function headsSoComMergeDaMain(registros, head, base, raiz) {
  const citados = registros.map(linhasQueValem).map(linhas => linhas.map(linha => linha.texto)).filter(textos => valoresDe(textos, 'Veredito').length)
    .flatMap(textos => hexasDe(valoresDe(textos, 'Head'))).filter(hexa => SHA_INTEIRO.test(hexa) && hexa !== head);
  return [...new Set(citados)].filter(de => soMergesLimposDaMain({ de, ate: head, base, raiz }));
}

function faltasDaIssue(linhas, repositorio) {
  const textos = linhas.map(linha => linha.texto);
  const puros = linhas.filter(linha => linha.puro).map(linha => linha.texto);
  const url = urlDaIssue(repositorio);
  const citadas = puros.map(texto => LINHA_DE_FECHAMENTO.exec(texto)).filter(Boolean);
  const semUrl = citadas.filter(([, , alvo]) => !url.test(alvo));
  const refs = citadas.filter(([, palavra, alvo]) => /^refs$/i.test(palavra) && url.test(alvo));
  const faltas = semUrl.map(([linha]) => `a linha "${linha}" não tem a URL completa da issue (https://github.com/${repositorio || '<dono>/<repo>'}/issues/<N>; o número solto e a issue de outro repositório não valem)`);
  if (refs.length && !valoresDe(textos, PROVA_QUE_FALTA).length) faltas.push(`"Refs" sem a linha "${PROVA_QUE_FALTA}: <texto>" (a issue fica aberta e o corpo diz a prova que falta)`);
  const diz = citadas.length || puros.some(texto => igual(texto, SEM_ISSUE));
  if (!diz) faltas.push(`o corpo não diz a issue: uma linha "Closes <URL completa da issue>" por issue, "Refs <URL>" com "${PROVA_QUE_FALTA}: <texto>", ou "${SEM_ISSUE}" sozinho na linha`);
  return faltas;
}

function faltaDaProva(linhas, head) {
  const prova = secao(linhas, SECAO_DA_PROVA);
  if (!prova) return `atenção ALTA: o corpo não tem a seção "${SECAO_DA_PROVA}"`;
  if (!prova.includes(FRASE)) return `atenção ALTA: a seção "${SECAO_DA_PROVA}" não tem a linha ${FRASE} (a frase sozinha na linha)`;
  const semHead = faltaDoHead(prova, head, `a seção "${SECAO_DA_PROVA}"`);
  return semHead && `atenção ALTA: ${semHead}`;
}

function partesDoCorpo({ corpo, rotulos, head, repositorio }) {
  const linhas = linhasQueValem(corpo);
  const textos = linhas.map(linha => linha.texto);
  const foraDoModelo = [
    ...SECOES_DO_MODELO.filter(nome => !secao(linhas, nome)).map(nome => `a seção ${nome}`),
    ...CAMPOS_DO_MODELO.filter(campo => !valoresDe(textos, campo).length).map(campo => `o campo "${campo}:" preenchido`),
  ];
  const { atencao, falta: semAtencao } = atencaoDe(textos);
  const alta = atencao === 'ALTA' || rotulos.some(rotulo => igual(String(rotulo), ROTULO_DE_RISCO_ALTO));
  return {
    atencao,
    alta,
    doModelo: [
      foraDoModelo.length && `o corpo não segue o modelo do /pr: falta ${foraDoModelo.join(', ')}`,
      semAtencao,
      ...faltasDaIssue(linhas, repositorio),
    ].filter(Boolean),
    daProva: alta && faltaDaProva(linhas, head),
  };
}

function faltasDoCorpo(pr) {
  const { doModelo, daProva } = partesDoCorpo(pr);
  return [...doModelo, daProva].filter(Boolean);
}

function conferir({ corpo, rotulos, registros, head, repositorio, headsEquivalentes = [] }) {
  const { atencao, alta, doModelo, daProva } = partesDoCorpo({ corpo, rotulos, head, repositorio });
  const faltas = [...doModelo, faltaDaRevisao(registros, head, headsEquivalentes), daProva].filter(Boolean);
  if (!faltas.length) {
    const { headDoRegistro } = registroQueVale(registros, head, headsEquivalentes);
    const viaMerge = headDoRegistro !== head ? ` (registro do head ${headDoRegistro}; daí até este head só há merges limpos da main)` : '';
    return { ok: true, mensagem: `registro da PR ok no head ${head}: atenção ${atencao}, /code-review ${VEREDITO_LIMPO}${viaMerge}${alta ? `, ${FRASE}` : ''}` };
  }
  return {
    ok: false,
    mensagem: [
      `✗ O registro da PR não vale para o head ${head}:`,
      ...faltas.map(falta => `    - ${falta}`),
      `  Conserto: o formato de cada parte está em ${MODELO}. O que está em comentário de HTML, em bloco de código ou em citação não conta.`,
      `  O corpo se confere antes de abrir a PR ou de editá-lo, sem o GitHub: node ${CONFERIDOR_DO_CORPO} <arquivo do corpo>`,
      `  O registro do /code-review e a prova com o head lido do GitHub (e o check rodando de novo): node ${PUBLICADOR} --help`,
    ].join('\n'),
  };
}

async function lerDaApi(env, caminho) {
  const resposta = await fetch(`${env.GITHUB_API_URL || 'https://api.github.com'}/repos/${env.GITHUB_REPOSITORY}/${caminho}`, {
    headers: { accept: 'application/vnd.github+json', ...(env.GITHUB_TOKEN ? { authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}) },
  });
  if (!resposta.ok) throw new Error(`o GitHub respondeu ${resposta.status} a ${caminho}`);
  return resposta.json();
}

async function lerTodasAsPaginas(env, caminho) {
  const itens = [];
  for (let pagina = 1; ; pagina++) {
    const lote = await lerDaApi(env, `${caminho}?per_page=100&page=${pagina}`);
    itens.push(...lote);
    if (lote.length < 100) return itens;
  }
}

function registroDatado(registro) {
  return { corpo: registro.body || '', quando: registro.submitted_at || registro.created_at || '' };
}

function registrosPorData(comentariosERevisoes) {
  return comentariosERevisoes
    .filter(registro => QUEM_REGISTRA.includes(registro.author_association))
    .map(registroDatado)
    .sort((a, b) => a.quando.localeCompare(b.quando)).map(registro => registro.corpo);
}

async function lerDoGitHub(env, headConferido) {
  const pr = await lerDaApi(env, `pulls/${env.PR}`);
  const registros = registrosPorData([...await lerTodasAsPaginas(env, `issues/${env.PR}/comments`), ...await lerTodasAsPaginas(env, `pulls/${env.PR}/reviews`)]);
  const headsEquivalentes = headsSoComMergeDaMain(registros, headConferido || pr.head.sha, pr.base && pr.base.ref, env.RAIZ_DO_GIT || process.cwd());
  return { corpo: pr.body, rotulos: pr.labels.map(rotulo => rotulo.name), registros, head: pr.head.sha, repositorio: env.GITHUB_REPOSITORY, headsEquivalentes };
}

function headDoAmbiente(env) {
  return String(env.HEAD || '').trim().toLowerCase();
}

function ambienteDizAPr(env) {
  return Boolean(env.GITHUB_REPOSITORY) && /^\d+$/.test(env.PR || '');
}

async function main(env) {
  const head = headDoAmbiente(env);
  if (!ambienteDizAPr(env) || !SHA_INTEIRO.test(head)) {
    console.log('uso: GITHUB_TOKEN=… GITHUB_REPOSITORY=<dono/repo> PR=<número> HEAD=<SHA inteiro do head> node scripts/ci/registro-da-pr.js');
    return 2;
  }
  let lido;
  try {
    lido = await lerDoGitHub(env, head);
  } catch (erro) {
    console.log(`✗ Não consegui ler a PR ${env.PR} no GitHub: ${erro.message}`);
    return 2;
  }
  const { ok, mensagem } = conferir({ ...lido, head });
  console.log(mensagem);
  // Um comentário não dispara o workflow: quem publica o registro do /code-review roda o check de novo.
  if (!ok && env.GITHUB_RUN_ID) console.log(`  Publicou o registro do /code-review? Rode de novo: gh run rerun ${env.GITHUB_RUN_ID} --failed -R ${env.GITHUB_REPOSITORY}`);
  return ok ? 0 : 1;
}

if (require.main === module) main(process.env).then(codigo => { process.exitCode = codigo; });

module.exports = { FRASE, ROTULO_DE_RISCO_ALTO, SECAO_DA_PROVA, conferir, faltaDaProva, faltaDaRevisao, faltasDoCorpo, indicesForaDoCodigo, lerDoGitHub, linhasQueValem };
