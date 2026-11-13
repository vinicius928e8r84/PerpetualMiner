'use strict';

// Lê o que um workflow do GitHub Actions faz de fato, sem biblioteca (o repositório não tem dependências de
// Node): o YAML de `.github/workflows/` é só mapas, listas, textos e blocos `|`. `rodaNoPR` diz se ele roda
// em pull_request e `comandos` lista cada linha de `run:` com o job e o passo em que está e se ela executa:
// um job ou passo com `if` que nunca é verdade ou que só vale fora do PR, `continue-on-error: true` (o passo
// pode falhar sem barrar), um comando que só imprime (`echo …`) ou que engole a falha (`|| true`) não executa nada.
// Quem usa: a regra `testes-no-portao` (scripts/regras/).

const LINHA = Symbol('linha');
const LINHAS_DAS_CHAVES = Symbol('linhasDasChaves');

const recuo = texto => texto.length - texto.trimStart().length;

/** O texto de um valor escalar: sem comentário no fim e sem aspas. */
function escalar(texto) {
  let valor = texto.trim();
  const aspas = /^(['"])(.*)\1$/.exec(valor);
  if (aspas) return aspas[2];
  valor = valor.replace(/\s+#.*$/, '');
  return valor.trim();
}

/**
 * Transforma o texto do workflow em objetos e listas; cada mapa guarda a linha de cada chave.
 * O fim de linha pode ser CRLF: é como o arquivo chega num clone com `core.autocrlf=true`, o padrão do Git for Windows.
 */
function lerYaml(texto) {
  const linhas = texto.split(/\r?\n/).map((conteudo, i) => ({ conteudo, numero: i + 1 }));
  let posicao = 0;
  const util = linha => linha.conteudo.trim() !== '' && !linha.conteudo.trim().startsWith('#');
  const proxima = () => {
    while (posicao < linhas.length && !util(linhas[posicao])) posicao++;
    return posicao < linhas.length ? linhas[posicao] : null;
  };

  // Um bloco `|` guarda as linhas como estão; um `>` as dobra: linhas seguidas viram uma só, separadas por espaço.
  function blocoDeTexto(recuoDaChave, dobrado) {
    const pedacos = [];
    while (posicao < linhas.length) {
      const linha = linhas[posicao];
      if (linha.conteudo.trim() !== '' && recuo(linha.conteudo) <= recuoDaChave) break;
      pedacos.push(linha);
      posicao++;
    }
    if (!dobrado) return { texto: pedacos.map(l => l.conteudo.trim()).join('\n'), linhas: pedacos.map(l => l.numero) };
    const grupos = [];
    let aberto = false;
    for (const linha of pedacos) {
      if (linha.conteudo.trim() === '') { aberto = false; continue; }
      if (aberto) grupos[grupos.length - 1].texto += ` ${linha.conteudo.trim()}`;
      else grupos.push({ texto: linha.conteudo.trim(), numero: linha.numero });
      aberto = true;
    }
    return { texto: grupos.map(g => g.texto).join('\n'), linhas: grupos.map(g => g.numero) };
  }

  function mapa(nivel) {
    const objeto = {};
    objeto[LINHAS_DAS_CHAVES] = {};
    for (let linha = proxima(); linha && recuo(linha.conteudo) === nivel && !linha.conteudo.trim().startsWith('- '); linha = proxima()) {
      const m = /^(\s*)([^:#][^:]*?)\s*:(?:\s+(.*))?$/.exec(linha.conteudo);
      if (!m) { posicao++; continue; }
      posicao++;
      const chave = m[2].replace(/^(['"])(.*)\1$/, '$2');
      objeto[LINHAS_DAS_CHAVES][chave] = linha.numero;
      const valor = (m[3] || '').trim();
      if (/^[|>][+-]?$/.test(valor)) {
        const bloco = blocoDeTexto(nivel, valor.startsWith('>'));
        objeto[chave] = bloco.texto;
        objeto[`${chave}$linhas`] = bloco.linhas;
      } else if (valor === '' || valor.startsWith('#')) {
        const seguinte = proxima();
        const filho = seguinte && (recuo(seguinte.conteudo) > nivel || (seguinte.conteudo.trim().startsWith('- ') && recuo(seguinte.conteudo) === nivel));
        objeto[chave] = filho ? bloco(recuo(seguinte.conteudo)) : null;
      } else {
        objeto[chave] = escalar(valor);
      }
    }
    return objeto;
  }

  function lista(nivel) {
    const itens = [];
    for (let linha = proxima(); linha && recuo(linha.conteudo) === nivel && linha.conteudo.trim().startsWith('- '); linha = proxima()) {
      const resto = linha.conteudo.trim().slice(2);
      if (/^[^:#'"[{][^:]*:(\s|$)/.test(resto)) {
        // `- chave: valor`: o item é um mapa cujas chaves ficam alinhadas com a primeira.
        linha.conteudo = `${' '.repeat(nivel + 2)}${resto}`;
        const item = mapa(nivel + 2);
        item[LINHA] = linha.numero;
        itens.push(item);
      } else {
        posicao++;
        itens.push(escalar(resto));
      }
    }
    return itens;
  }

  function bloco(nivel) {
    const linha = proxima();
    if (!linha) return null;
    return linha.conteudo.trim().startsWith('- ') ? lista(nivel) : mapa(nivel);
  }

  const primeira = proxima();
  return primeira ? bloco(recuo(primeira.conteudo)) : {};
}

// O valor de uma condição `if:` num pull request: true, false, ou null quando o leitor não sabe interpretá-la.
// Entendidas: true/false, always(), success(), `github.event_name ==|!= 'evento'`, `env.NOME ==|!= 'true'|'false'` e `&&` / `||`
// entre elas. Um `env.NOME` que o job define com uma saída de outro job (`${{ needs.x.outputs.y … }}`) é decidido por esse job
// (a e2e que só roda quando a PR não é só documentação): no pull request conta como verdadeiro; o valor fixo vale pelo que é.
function valorDoIf(condicao, env = {}) {
  const texto = String(condicao).trim().replace(/^\$\{\{\s*([^]*?)\s*\}\}$/, '$1').trim();
  const atomo = parte => {
    const a = parte.trim();
    if (/^true$|^always\(\)$|^success\(\)$/i.test(a)) return true;
    if (/^false$|^0$|^''$|^""$/i.test(a)) return false;
    const evento = /^github\.event_name\s*(==|!=)\s*['"]([a-z_]+)['"]$/.exec(a);
    if (evento) return (evento[2] === 'pull_request') === (evento[1] === '==');
    const variavel = /^env\.([A-Za-z_][A-Za-z0-9_]*)\s*(==|!=)\s*['"](true|false)['"]$/.exec(a);
    if (variavel && env[variavel[1]] !== undefined) {
      const definicao = String(env[variavel[1]]).trim();
      if (/\$\{\{[^}]*\bneeds\./.test(definicao)) return variavel[2] === '==' ? variavel[3] === 'true' : variavel[3] === 'false';
      if (/^(true|false)$/i.test(definicao)) return (definicao.toLowerCase() === variavel[3]) === (variavel[2] === '==');
    }
    return null;
  };
  const ou = texto.split('||').map(termo => {
    const valores = termo.split('&&').map(atomo);
    if (valores.includes(false)) return false;
    return valores.includes(null) ? null : true;
  });
  if (ou.includes(true)) return true;
  return ou.includes(null) ? null : false;
}

/** Por que um `if:` impede de contar como portão do pull request (ou null se roda nele). */
function motivoDoIf(condicao, env) {
  if (condicao === undefined || condicao === null) return null;
  const valor = valorDoIf(condicao, env);
  if (valor === true) return null;
  const texto = String(condicao).trim();
  return valor === false
    ? `if: ${texto} não é verdade no pull request`
    : `if: ${texto} é uma condição que o leitor não sabe interpretar (use true/false, github.event_name ==/!= 'evento' ou env.NOME ==/!= 'true' com NOME definido no job); não conta como portão`;
}

const verdadeiro = valor => /^(?:\$\{\{\s*)?true(?:\s*\}\})?$/i.test(String(valor ?? '').trim());

const NAO_EXECUTA = [
  [/^\s*(?:echo|printf|:|true)\b/, 'só imprime, não executa'],
  [/\|\|\s*(?:true|:|exit\s+0)\b/, 'a falha é engolida por `|| true`'],
];

function rodaNoPR(workflow) {
  const gatilho = workflow && workflow.on !== undefined ? workflow.on : workflow && workflow.true;
  if (gatilho === null || gatilho === undefined) return false;
  if (typeof gatilho === 'string') return /\bpull_request\b/.test(gatilho);
  if (Array.isArray(gatilho)) return gatilho.includes('pull_request');
  return Object.keys(gatilho).includes('pull_request');
}

/** Cada linha de `run:` do workflow: { job, passo, linha, texto, executa, motivo }. */
function comandos(workflow) {
  const saida = [];
  for (const [nomeDoJob, job] of Object.entries((workflow && workflow.jobs) || {})) {
    if (!job || typeof job !== 'object') continue;
    const env = { ...((workflow && workflow.env) || {}), ...(job.env || {}) };
    const doJob = motivoDoIf(job.if, env) || (verdadeiro(job['continue-on-error']) ? 'continue-on-error: true no job: a falha não barra' : null);
    for (const passo of Array.isArray(job.steps) ? job.steps : []) {
      if (!passo || typeof passo !== 'object' || passo.run === undefined || passo.run === null) continue;
      const doPasso = doJob || motivoDoIf(passo.if, env) || (verdadeiro(passo['continue-on-error']) ? 'continue-on-error: true no passo: a falha não barra' : null);
      const textos = String(passo.run).split('\n');
      const numeros = passo['run$linhas'] || textos.map(() => (passo[LINHAS_DAS_CHAVES] || {}).run || passo[LINHA]);
      textos.forEach((texto, i) => {
        if (texto.trim() === '' || texto.trim().startsWith('#')) return;
        const nao = NAO_EXECUTA.find(([padrao]) => padrao.test(texto));
        saida.push({
          job: nomeDoJob, passo: passo.name || passo.run, linha: numeros[i] || (passo[LINHAS_DAS_CHAVES] || {}).run || passo[LINHA],
          texto, executa: !doPasso && !nao, motivo: doPasso || (nao && nao[1]) || null,
        });
      });
    }
  }
  return saida;
}

module.exports = { lerYaml, rodaNoPR, comandos, motivoDoIf };
