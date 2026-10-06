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

/** Transforma o texto do workflow em objetos e listas; cada mapa guarda a linha de cada chave. */
function lerYaml(texto) {
  const linhas = texto.split('\n').map((conteudo, i) => ({ conteudo, numero: i + 1 }));
  let posicao = 0;
  const util = linha => linha.conteudo.trim() !== '' && !linha.conteudo.trim().startsWith('#');
  const proxima = () => {
    while (posicao < linhas.length && !util(linhas[posicao])) posicao++;
    return posicao < linhas.length ? linhas[posicao] : null;
  };

  function blocoDeTexto(recuoDaChave) {
    const pedacos = [];
    while (posicao < linhas.length) {
      const linha = linhas[posicao];
      if (linha.conteudo.trim() !== '' && recuo(linha.conteudo) <= recuoDaChave) break;
      pedacos.push(linha);
      posicao++;
    }
    return { texto: pedacos.map(l => l.conteudo.trim()).join('\n'), linhas: pedacos.map(l => l.numero) };
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
        const bloco = blocoDeTexto(nivel);
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

const FALSO = /^(?:\$\{\{\s*)?(?:false|0|''|"")(?:\s*\}\})?$/i;

/** Por que um `if:` impede de rodar num pull request (ou null se pode rodar). */
function motivoDoIf(condicao) {
  if (condicao === undefined || condicao === null) return null;
  const texto = String(condicao).trim();
  if (FALSO.test(texto)) return `if: ${texto} nunca é verdade`;
  if (/github\.event_name/.test(texto) && !/pull_request/.test(texto)) return `if: ${texto} não vale no pull request`;
  return null;
}

const verdadeiro = valor => /^(?:\$\{\{\s*)?true(?:\s*\}\})?$/i.test(String(valor ?? '').trim());

// Um comando que só imprime ou que engole a falha não barra nada.
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
    const doJob = motivoDoIf(job.if) || (verdadeiro(job['continue-on-error']) ? 'continue-on-error: true no job: a falha não barra' : null);
    for (const passo of Array.isArray(job.steps) ? job.steps : []) {
      if (!passo || typeof passo !== 'object' || passo.run === undefined || passo.run === null) continue;
      const doPasso = doJob || motivoDoIf(passo.if) || (verdadeiro(passo['continue-on-error']) ? 'continue-on-error: true no passo: a falha não barra' : null);
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
