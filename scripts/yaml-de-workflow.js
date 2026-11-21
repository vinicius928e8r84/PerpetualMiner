'use strict';

const LINHA = Symbol('linha');
const LINHAS_DAS_CHAVES = Symbol('linhasDasChaves');

const recuo = texto => texto.length - texto.trimStart().length;
const temConteudo = texto => texto.trim() !== '' && !texto.trim().startsWith('#');
const ehItemDeLista = texto => texto.trim().startsWith('- ');

function escalar(texto) {
  let valor = texto.trim();
  const aspas = /^(['"])(.*)\1$/.exec(valor);
  if (aspas) return aspas[2];
  valor = valor.replace(/\s+#.*$/, '');
  return valor.trim();
}

const CHAVE = /^(\s*)([^:#][^:]*?)\s*:(?:\s+(.*))?$/;
const ITEM_QUE_ABRE_MAPA = /^[^:#'"[{][^:]*:(\s|$)/;
const MARCA_DE_BLOCO_DE_TEXTO = /^[|>][+-]?$/;

const semAspas = texto => texto.replace(/^(['"])(.*)\1$/, '$2');
const semValorNaLinha = valor => valor === '' || valor.startsWith('#');
const chaveNoNivel = (linha, nivel) => recuo(linha.conteudo) === nivel && !ehItemDeLista(linha.conteudo);
const itemNoNivel = (linha, nivel) => recuo(linha.conteudo) === nivel && ehItemDeLista(linha.conteudo);
const abreFilho = (linha, nivel) => recuo(linha.conteudo) > nivel || itemNoNivel(linha, nivel);
const pertenceAoBloco = (linha, recuoDaChave) => linha.conteudo.trim() === '' || recuo(linha.conteudo) > recuoDaChave;

function textoLiteral(pedacos) {
  return { valor: pedacos.map(l => l.conteudo.trim()).join('\n'), linhas: pedacos.map(l => l.numero) };
}

function textoDobrado(pedacos) {
  const paragrafos = [];
  let aberto = false;
  for (const linha of pedacos) {
    const texto = linha.conteudo.trim();
    if (texto === '') aberto = false;
    else if (aberto) paragrafos[paragrafos.length - 1].texto += ` ${texto}`;
    else {
      paragrafos.push({ texto, numero: linha.numero });
      aberto = true;
    }
  }
  return { valor: paragrafos.map(p => p.texto).join('\n'), linhas: paragrafos.map(p => p.numero) };
}

const LEITURA_DO_BLOCO_DE_TEXTO = { '|': textoLiteral, '>': textoDobrado };

class LeitorDeYaml {
  constructor(texto) {
    this.linhas = texto.split(/\r?\n/).map((conteudo, i) => ({ conteudo, numero: i + 1 }));
    this.posicao = 0;
  }

  proxima() {
    while (this.posicao < this.linhas.length && !temConteudo(this.linhas[this.posicao].conteudo)) this.posicao++;
    return this.linhas[this.posicao] || null;
  }

  proximaNoNivel(nivel, cabe) {
    const linha = this.proxima();
    return linha && cabe(linha, nivel) ? linha : null;
  }

  documento() {
    const primeira = this.proxima();
    return primeira ? this.bloco(recuo(primeira.conteudo)) : {};
  }

  bloco(nivel) {
    const linha = this.proxima();
    if (!linha) return null;
    return ehItemDeLista(linha.conteudo) ? this.lista(nivel) : this.mapa(nivel);
  }

  mapa(nivel) {
    const objeto = { [LINHAS_DAS_CHAVES]: {} };
    for (let linha = this.proximaNoNivel(nivel, chaveNoNivel); linha; linha = this.proximaNoNivel(nivel, chaveNoNivel)) {
      this.posicao++;
      this.lerChave(objeto, linha, nivel);
    }
    return objeto;
  }

  lerChave(objeto, linha, nivel) {
    const m = CHAVE.exec(linha.conteudo);
    if (!m) return;
    const chave = semAspas(m[2]);
    objeto[LINHAS_DAS_CHAVES][chave] = linha.numero;
    const { valor, linhas } = this.valorDaChave((m[3] || '').trim(), nivel);
    objeto[chave] = valor;
    if (linhas) objeto[`${chave}$linhas`] = linhas;
  }

  valorDaChave(valor, nivel) {
    if (MARCA_DE_BLOCO_DE_TEXTO.test(valor)) return LEITURA_DO_BLOCO_DE_TEXTO[valor[0]](this.linhasDoBlocoDeTexto(nivel));
    if (semValorNaLinha(valor)) return { valor: this.filhoDaChave(nivel) };
    return { valor: escalar(valor) };
  }

  linhasDoBlocoDeTexto(recuoDaChave) {
    const pedacos = [];
    while (this.posicao < this.linhas.length && pertenceAoBloco(this.linhas[this.posicao], recuoDaChave)) {
      pedacos.push(this.linhas[this.posicao]);
      this.posicao++;
    }
    return pedacos;
  }

  filhoDaChave(nivel) {
    const seguinte = this.proxima();
    return seguinte && abreFilho(seguinte, nivel) ? this.bloco(recuo(seguinte.conteudo)) : null;
  }

  lista(nivel) {
    const itens = [];
    for (let linha = this.proximaNoNivel(nivel, itemNoNivel); linha; linha = this.proximaNoNivel(nivel, itemNoNivel)) {
      itens.push(this.itemDaLista(linha, nivel));
    }
    return itens;
  }

  itemDaLista(linha, nivel) {
    const resto = linha.conteudo.trim().slice(2);
    if (!ITEM_QUE_ABRE_MAPA.test(resto)) {
      this.posicao++;
      return escalar(resto);
    }
    linha.conteudo = `${' '.repeat(nivel + 2)}${resto}`;
    const item = this.mapa(nivel + 2);
    item[LINHA] = linha.numero;
    return item;
  }
}

const lerYaml = texto => new LeitorDeYaml(texto).documento();

const comparacao = (operador, iguais) => iguais === (operador === '==');

const DEPENDE_DE_OUTRO_JOB = /\$\{\{[^}]*\bneeds\./;

function valorDaVariavel([, nome, operador, esperado], env) {
  if (env[nome] === undefined) return null;
  const definicao = String(env[nome]).trim();
  if (DEPENDE_DE_OUTRO_JOB.test(definicao)) return comparacao(operador, esperado === 'true');
  if (/^(true|false)$/i.test(definicao)) return comparacao(operador, definicao.toLowerCase() === esperado);
  return null;
}

const valorDoEvento = ([, operador, evento]) => comparacao(operador, evento === 'pull_request');

const ATOMOS_DO_IF = [
  { padrao: /^true$|^always\(\)$|^success\(\)$/i, valor: () => true },
  { padrao: /^false$|^0$|^''$|^""$/i, valor: () => false },
  { padrao: /^github\.event_name\s*(==|!=)\s*['"]([a-z_]+)['"]$/, valor: valorDoEvento },
  { padrao: /^env\.([A-Za-z_][A-Za-z0-9_]*)\s*(==|!=)\s*['"](true|false)['"]$/, valor: valorDaVariavel },
];

function valorDoAtomo(parte, env) {
  const atomo = parte.trim();
  for (const { padrao, valor } of ATOMOS_DO_IF) {
    const m = padrao.exec(atomo);
    if (m) return valor(m, env);
  }
  return null;
}

function valorDoE(termo, env) {
  const valores = termo.split('&&').map(parte => valorDoAtomo(parte, env));
  if (valores.includes(false)) return false;
  return valores.includes(null) ? null : true;
}

function valorDoIf(condicao, env = {}) {
  const texto = String(condicao).trim().replace(/^\$\{\{\s*([^]*?)\s*\}\}$/, '$1').trim();
  const termos = texto.split('||').map(termo => valorDoE(termo, env));
  if (termos.includes(true)) return true;
  return termos.includes(null) ? null : false;
}

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

function gatilhoDe(workflow) {
  if (!workflow) return null;
  return workflow.on !== undefined ? workflow.on : workflow.true;
}

function rodaNoPR(workflow) {
  const gatilho = gatilhoDe(workflow);
  if (gatilho === null || gatilho === undefined) return false;
  if (typeof gatilho === 'string') return /\bpull_request\b/.test(gatilho);
  if (Array.isArray(gatilho)) return gatilho.includes('pull_request');
  return Object.keys(gatilho).includes('pull_request');
}

const ehObjeto = valor => Boolean(valor) && typeof valor === 'object';
const temRun = passo => ehObjeto(passo) && passo.run !== undefined && passo.run !== null;

function motivoDoContinueOnError(onde, alvo) {
  return verdadeiro(onde['continue-on-error']) ? `continue-on-error: true no ${alvo}: a falha não barra` : null;
}

function motivoDeNaoExecutar(texto) {
  const regra = NAO_EXECUTA.find(([padrao]) => padrao.test(texto));
  return regra ? regra[1] : null;
}

const linhaDaChaveRun = passo => (passo[LINHAS_DAS_CHAVES] || {}).run || passo[LINHA];

function comandosDoPasso(nomeDoJob, passo, motivoDoPasso) {
  const linhasDoRun = passo['run$linhas'] || [];
  return String(passo.run).split('\n')
    .map((texto, i) => ({ texto, linha: linhasDoRun[i] || linhaDaChaveRun(passo) }))
    .filter(({ texto }) => temConteudo(texto))
    .map(({ texto, linha }) => {
      const motivo = motivoDoPasso || motivoDeNaoExecutar(texto);
      return { job: nomeDoJob, passo: passo.name || passo.run, linha, texto, executa: !motivo, motivo };
    });
}

function comandosDoJob(nomeDoJob, job, envDoWorkflow) {
  const env = { ...envDoWorkflow, ...(job.env || {}) };
  const motivoDoJob = motivoDoIf(job.if, env) || motivoDoContinueOnError(job, 'job');
  const passos = (Array.isArray(job.steps) ? job.steps : []).filter(temRun);
  return passos.flatMap(passo => {
    const motivoDoPasso = motivoDoJob || motivoDoIf(passo.if, env) || motivoDoContinueOnError(passo, 'passo');
    return comandosDoPasso(nomeDoJob, passo, motivoDoPasso);
  });
}

function comandos(workflow) {
  const jobs = Object.entries((workflow && workflow.jobs) || {}).filter(([, job]) => ehObjeto(job));
  const envDoWorkflow = (workflow && workflow.env) || {};
  return jobs.flatMap(([nomeDoJob, job]) => comandosDoJob(nomeDoJob, job, envDoWorkflow));
}

module.exports = { lerYaml, rodaNoPR, comandos };
