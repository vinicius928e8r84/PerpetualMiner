'use strict';

// O registro que o portão exige de toda PR (.github/workflows/registro-da-pr.yml), lido do GitHub na hora, no head exato:
//   1. o corpo segue o modelo do /pr (as seções Summary, Evidence e Merge Danger) e tem a linha "Atenção:" com BAIXA, MÉDIA ou ALTA;
//   2. um comentário ou revisão da PR é o registro do /code-review deste head: "Veredito: CLEAN", o SHA inteiro do head e
//      um "Revisor:" diferente do "Autor:";
//   3. com atenção ALTA (ou o rótulo `risco:alto`), o corpo tem a seção "Prova real" com a linha PROVADO 100% REAL e o SHA
//      inteiro do head.
// Um commit novo muda o head: o registro e a prova do commit anterior deixam de valer. O formato: .github/PULL_REQUEST_TEMPLATE.md.
// O limite: confere o artefato e o SHA, não que a revisão ou a prova aconteceram; autor e revisor são os que o registro declara.
// Uso: GITHUB_TOKEN=… GITHUB_REPOSITORY=<dono/repo> PR=<número> HEAD=<SHA do head> node scripts/ci/registro-da-pr.js

const SECOES_DO_MODELO = ['Summary', 'Evidence', 'Merge Danger'];
const ATENCOES = ['BAIXA', 'MÉDIA', 'ALTA'];
const ROTULO_DE_RISCO_ALTO = 'risco:alto';
const SECAO_DA_PROVA = 'Prova real';
const FRASE = 'PROVADO 100% REAL';
const VEREDITO_LIMPO = 'CLEAN';
// Num repositório público qualquer pessoa comenta: só vale o registro de quem pode escrever no repositório.
const QUEM_REGISTRA = ['OWNER', 'MEMBER', 'COLLABORATOR'];
const MODELO = '.github/PULL_REQUEST_TEMPLATE.md';

const SHA_INTEIRO = /^[0-9a-f]{40}$/;
const TITULO = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const CERCA = /^ {0,3}(`{3,}|~{3,})/;

const semMarcacao = texto => texto.replace(/[*_`]/g, '').replace(/^[\s>-]+|[\s.!]+$/g, '');
const semCaixaNemAcento = texto => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const igual = (a, b) => semCaixaNemAcento(a) === semCaixaNemAcento(b);

/**
 * As linhas que valem de um texto em Markdown: [{ texto, nivel }], o texto sem a marcação em volta e o nível quando a
 * linha é um título. O que está em comentário de HTML (o modelo da PR traz o formato dentro de um) ou em bloco de
 * código (um exemplo do formato, um `# comentário` de shell) não conta.
 */
function linhasQueValem(markdown) {
  const saida = [];
  let cerca = null;
  for (const linha of String(markdown || '').replace(/<!--[^]*?(?:-->|$)/g, '').split(/\r?\n/)) {
    const abre = CERCA.exec(linha);
    if (abre && !cerca) cerca = abre[1];
    else if (abre && abre[1][0] === cerca[0] && abre[1].length >= cerca.length && linha.trim() === abre[1]) cerca = null;
    else if (!cerca) {
      const titulo = TITULO.exec(linha);
      saida.push({ texto: semMarcacao(titulo ? titulo[2] : linha), nivel: titulo ? titulo[1].length : 0 });
    }
  }
  return saida;
}

/** Os textos da seção de título `nome`, até o próximo título do mesmo nível ou acima; null sem a seção. */
function secao(linhas, nome) {
  const inicio = linhas.findIndex(linha => linha.nivel && igual(linha.texto, nome));
  if (inicio < 0) return null;
  const resto = linhas.slice(inicio + 1);
  const fim = resto.findIndex(linha => linha.nivel && linha.nivel <= linhas[inicio].nivel);
  return (fim < 0 ? resto : resto.slice(0, fim)).map(linha => linha.texto);
}

/** O que as linhas "Campo: valor" dizem (a caixa e o acento do nome do campo não contam). */
const valoresDe = (textos, campo) => textos.filter(texto => texto.includes(':'))
  .map(texto => [texto.slice(0, texto.indexOf(':')), texto.slice(texto.indexOf(':') + 1).trim()])
  .filter(([nome, valor]) => valor && igual(nome, campo)).map(([, valor]) => valor);

const hexasDe = textos => textos.join('\n').toLowerCase().match(/[0-9a-f]+/g) || [];

/** Por que os textos não citam o head, ou null: só vale o SHA inteiro, e o de outro commit diz que o head mudou. */
function faltaDoHead(textos, head, oQue) {
  const hexas = hexasDe(textos);
  if (hexas.includes(head)) return null;
  const outro = hexas.find(hexa => SHA_INTEIRO.test(hexa));
  if (outro) return `${oQue} é do commit ${outro}, que não é o head (o head mudou: o que valia para o commit anterior não vale)`;
  if (hexas.some(hexa => hexa.length >= 7 && head.startsWith(hexa))) return `${oQue} tem o SHA do head abreviado; escreva os 40 caracteres`;
  return `${oQue} não tem o SHA do head`;
}

/** A atenção do corpo ('BAIXA', 'MÉDIA', 'ALTA') ou a falta: sem o campo preenchido, ou com dois valores. */
function atencaoDe(textos) {
  const ditas = [...new Set(valoresDe(textos, 'Atenção').map(valor => ATENCOES.find(atencao => igual(atencao, valor))).filter(Boolean))];
  if (ditas.length === 1) return { atencao: ditas[0] };
  return { falta: ditas.length ? `o corpo diz mais de uma atenção (${ditas.join(' e ')})` : `o corpo não tem o campo de atenção preenchido (uma linha "Atenção: ${ATENCOES.join('", "Atenção: ')}")` };
}

/** Por que não há registro do /code-review que valha para o head, ou null. Vale o mais recente que cita o head. */
function faltaDaRevisao(registros, head) {
  const todos = registros.map(linhasQueValem).map(linhas => linhas.map(linha => linha.texto)).filter(textos => valoresDe(textos, 'Veredito').length);
  const doHead = todos.filter(textos => hexasDe(textos).includes(head)).pop();
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

/** Por que a prova real não vale para o head, ou null. */
function faltaDaProva(linhas, head) {
  const prova = secao(linhas, SECAO_DA_PROVA);
  if (!prova) return `atenção ALTA: o corpo não tem a seção "${SECAO_DA_PROVA}"`;
  if (!prova.includes(FRASE)) return `atenção ALTA: a seção "${SECAO_DA_PROVA}" não tem a linha ${FRASE} (a frase sozinha na linha)`;
  const semHead = faltaDoHead(prova, head, `a seção "${SECAO_DA_PROVA}"`);
  return semHead && `atenção ALTA: ${semHead}`;
}

/**
 * { ok, mensagem }: se a PR pode passar, e o que o check mostra. `registros` são os comentários e as revisões da PR,
 * do mais antigo ao mais recente.
 */
function conferir({ corpo, rotulos, registros, head }) {
  const linhas = linhasQueValem(corpo);
  const textos = linhas.map(linha => linha.texto);
  const semSecao = SECOES_DO_MODELO.filter(nome => !secao(linhas, nome));
  const { atencao, falta: semAtencao } = atencaoDe(textos);
  const alta = atencao === 'ALTA' || rotulos.some(rotulo => igual(String(rotulo), ROTULO_DE_RISCO_ALTO));
  const faltas = [
    semSecao.length && `o corpo não segue o modelo do /pr: falta a seção ${semSecao.join(', ')}`,
    semAtencao,
    faltaDaRevisao(registros, head),
    alta && faltaDaProva(linhas, head),
  ].filter(Boolean);
  if (!faltas.length) return { ok: true, mensagem: `registro da PR ok no head ${head}: atenção ${atencao}, /code-review ${VEREDITO_LIMPO}${alta ? `, ${FRASE}` : ''}` };
  return {
    ok: false,
    mensagem: [
      `✗ O registro da PR não vale para o head ${head}:`,
      ...faltas.map(falta => `    - ${falta}`),
      `  Conserto: o formato de cada parte está em ${MODELO}. O que está em comentário de HTML ou em bloco de código não conta.`,
    ].join('\n'),
  };
}

/** O corpo, os rótulos e os registros (comentários e revisões de quem pode escrever, por data) da PR, lidos do GitHub. */
async function lerDoGitHub(env) {
  const ler = async caminho => {
    const resposta = await fetch(`${env.GITHUB_API_URL || 'https://api.github.com'}/repos/${env.GITHUB_REPOSITORY}/${caminho}`, {
      headers: { accept: 'application/vnd.github+json', ...(env.GITHUB_TOKEN ? { authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}) },
    });
    if (!resposta.ok) throw new Error(`o GitHub respondeu ${resposta.status} a ${caminho}`);
    return resposta.json();
  };
  const todas = async caminho => {
    const itens = [];
    for (let pagina = 1; ; pagina++) {
      const lote = await ler(`${caminho}?per_page=100&page=${pagina}`);
      itens.push(...lote);
      if (lote.length < 100) return itens;
    }
  };
  const pr = await ler(`pulls/${env.PR}`);
  const registros = [...await todas(`issues/${env.PR}/comments`), ...await todas(`pulls/${env.PR}/reviews`)]
    .filter(registro => QUEM_REGISTRA.includes(registro.author_association))
    .map(registro => ({ corpo: registro.body || '', quando: registro.submitted_at || registro.created_at || '' }))
    .sort((a, b) => a.quando.localeCompare(b.quando)).map(registro => registro.corpo);
  return { corpo: pr.body, rotulos: pr.labels.map(rotulo => rotulo.name), registros };
}

async function main(env) {
  const head = String(env.HEAD || '').trim().toLowerCase();
  if (!env.GITHUB_REPOSITORY || !/^\d+$/.test(env.PR || '') || !SHA_INTEIRO.test(head)) {
    console.log('uso: GITHUB_TOKEN=… GITHUB_REPOSITORY=<dono/repo> PR=<número> HEAD=<SHA inteiro do head> node scripts/ci/registro-da-pr.js');
    return 2;
  }
  let lido;
  try {
    lido = await lerDoGitHub(env);
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

module.exports = { FRASE, ROTULO_DE_RISCO_ALTO, conferir };
