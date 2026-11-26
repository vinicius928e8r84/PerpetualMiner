'use strict';

const fs = require('fs');
const path = require('path');
const { arquivosDoRepositorio } = require('./comum');
const { comandos, lerYaml, rodaNoPR } = require('../yaml-de-workflow');
const { ARQUIVO_DO_REGISTRO, arquivosDoGrupo, ehArquivoDeTeste, grupoDoArquivo, lerRegistro } = require('../grupos-de-teste');

const id = 'testes-no-portao';

const guarda = 'todo teste roda no CI, cadastrado num grupo de scripts/testes.json';

const conserto = 'Cadastre o teste num grupo de scripts/testes.json (`arquivos` no executor `node`; os de Python e o e2e '
  + 'são descobertos pela pasta e pelo padrão do grupo) e deixe o workflow chamar só `node scripts/testar.mjs <grupo>`; '
  + 'rode o mesmo comando aqui. Um arquivo que não é teste, e tem nome de teste, vai em `fora` com o motivo. '
  + 'Não basta citar o comando no corpo do PR.';

const DIRETORIO_DOS_WORKFLOWS = '.github/workflows';

const WORKFLOW = new RegExp(`^${DIRETORIO_DOS_WORKFLOWS.replace('.', '\\.')}/[^/]+\\.ya?ml$`);
const ehWorkflow = arquivo => WORKFLOW.test(arquivo);

const seAplica = arquivo => ehArquivoDeTeste(arquivo) || arquivo === ARQUIVO_DO_REGISTRO || ehWorkflow(arquivo);

const TESTE_POR_FORA = [
  /\bnode\s+(?:\S*\/)?test_\S+/,
  /-m\s+unittest\b/,
  /\bpytest\b/,
  /\bplaywright\s+test\b/,
  /\bbash\s+\S*test_\S+\.sh\b/,
];
const CHAMADA_DO_EXECUTOR = /scripts\/testar\.mjs\s+((?:(?!-)[a-z0-9][a-z0-9-]*\s*)+)/g;
const EXECUTA_O_EXECUTOR = /^\s*(?:(?:xvfb-run(?:\s+-{1,2}[\w-]+(?:=\S+)?)*|env|nice(?:\s+-n\s*\d+)?|sudo|[A-Za-z_][A-Za-z0-9_]*=\S+)\s+)*node\s+scripts\/testar\.mjs\s+((?:(?!-)[a-z0-9][a-z0-9-]*\s*)+)/;
const gruposDe = texto => texto.trim().split(/\s+/).filter(Boolean);

const CITA_O_EXECUTOR = /scripts\/testar\.mjs/;
const EXECUTORES = ['node', 'unittest', 'playwright'];

function gruposQueOComandoRoda(comando) {
  const chamada = EXECUTA_O_EXECUTOR.exec(comando.texto);
  return chamada ? gruposDe(chamada[1]) : [];
}

function gruposChamadosNoPR(texto) {
  const yaml = lerYaml(texto);
  if (!rodaNoPR(yaml)) return [];
  return comandos(yaml).filter(c => c.executa).flatMap(gruposQueOComandoRoda);
}

function lerContexto(raiz) {
  const arquivos = arquivosDoRepositorio(raiz);
  const registro = lerRegistro(raiz);
  const textosDosWorkflows = arquivos.filter(ehWorkflow).map(arquivo => fs.readFileSync(path.join(raiz, arquivo), 'utf8'));
  return { arquivos, registro, chamados: new Set(textosDosWorkflows.flatMap(gruposChamadosNoPR)) };
}

const emCache = new Map();
function contexto(raiz) {
  if (!emCache.has(raiz)) emCache.set(raiz, lerContexto(raiz));
  return emCache.get(raiz);
}

function linhasDeComando(texto) {
  return texto.split('\n').map((linha, i) => ({ linha: i + 1, texto: linha })).filter(l => !/^\s*#/.test(l.texto));
}

function linhaDaChave(fonte, chave) {
  const i = fonte.split('\n').findIndex(linha => linha.includes(`"${chave}"`));
  return i < 0 ? 1 : i + 1;
}

function estaNoPortao(registro, arquivo) {
  return Boolean(grupoDoArquivo(registro, arquivo)) || registro.fora.some(f => f.arquivo === arquivo);
}

function achadosDoTeste(arquivo, registro) {
  if (estaNoPortao(registro, arquivo)) return [];
  return [{ linha: 1, detalhe: `${arquivo} é um teste que nenhum grupo de ${ARQUIVO_DO_REGISTRO} roda; o CI não o executa` }];
}

function problemaDoGrupo(nome, grupo, { arquivos, chamados }) {
  if (!EXECUTORES.includes(grupo.executor)) return `grupo ${nome}: executor desconhecido (${grupo.executor}); use node, unittest ou playwright`;
  if (arquivosDoGrupo(grupo, arquivos).length === 0) return `grupo ${nome}: nenhum arquivo do repositório casa com ele; tire o grupo ou conserte o padrão`;
  if (!chamados.has(nome)) return `grupo ${nome}: nenhum workflow de PR chama \`node scripts/testar.mjs ${nome}\`; os testes dele não rodam no CI`;
  return null;
}

function problemaDaEntradaDeFora(fora, arquivos) {
  if (!fora.arquivo || !arquivos.includes(fora.arquivo)) return `fora: ${fora.arquivo || '(sem arquivo)'} não existe; tire a entrada`;
  if (!String(fora.motivo || '').trim()) return `fora: ${fora.arquivo} sem motivo; diga por que não é um teste do portão`;
  return null;
}

function achadosDoRegistro(fonte, portao) {
  const dosGrupos = Object.entries(portao.registro.grupos)
    .map(([nome, grupo]) => ({ linha: linhaDaChave(fonte, nome), detalhe: problemaDoGrupo(nome, grupo, portao) }));
  const doFora = portao.registro.fora
    .map(fora => ({ linha: linhaDaChave(fonte, fora.arquivo || 'fora'), detalhe: problemaDaEntradaDeFora(fora, portao.arquivos) }));
  return [...dosGrupos, ...doFora].filter(achado => achado.detalhe);
}

function testePorFora(texto) {
  if (!TESTE_POR_FORA.some(r => r.test(texto))) return [];
  return [`roda um teste por fora do executor: ${texto.trim().slice(0, 100)}; chame \`node scripts/testar.mjs <grupo>\``];
}

function gruposQueORegistroNaoTem(texto, registro) {
  return [...texto.matchAll(CHAMADA_DO_EXECUTOR)].flatMap(m => gruposDe(m[1]))
    .filter(grupo => !registro.grupos[grupo])
    .map(grupo => `chama o grupo ${grupo}, que ${ARQUIVO_DO_REGISTRO} não tem`);
}

function achadosDasLinhas(fonte, registro) {
  return linhasDeComando(fonte).flatMap(({ linha, texto }) => [...testePorFora(texto), ...gruposQueORegistroNaoTem(texto, registro)]
    .map(detalhe => ({ linha, detalhe })));
}

function problemaDoPasso(comando) {
  const citado = comando.texto.trim().slice(0, 100);
  if (!comando.executa) {
    return `${citado} não executa o grupo (${comando.motivo}); o passo precisa rodar \`node scripts/testar.mjs <grupo>\` e poder barrar o PR`;
  }
  if (!EXECUTA_O_EXECUTOR.test(comando.texto)) {
    return `${citado} cita o executor mas não o roda como comando; escreva \`node scripts/testar.mjs <grupo>\` (com xvfb-run, env ou nice na frente, se precisar)`;
  }
  return null;
}

function achadosDosPassos(fonte) {
  return comandos(lerYaml(fonte)).filter(comando => CITA_O_EXECUTOR.test(comando.texto))
    .map(comando => ({ linha: comando.linha, detalhe: problemaDoPasso(comando) }))
    .filter(achado => achado.detalhe);
}

function verificar(arquivo, fonte, raiz = process.cwd()) {
  const portao = contexto(raiz);
  if (ehArquivoDeTeste(arquivo)) return achadosDoTeste(arquivo, portao.registro);
  if (arquivo === ARQUIVO_DO_REGISTRO) return achadosDoRegistro(fonte, portao);
  return [...achadosDasLinhas(fonte, portao.registro), ...achadosDosPassos(fonte)];
}

module.exports = { id, guarda, conserto, seAplica, verificar };
