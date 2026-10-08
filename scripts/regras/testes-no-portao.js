'use strict';

// Um teste que existe mas o CI não roda deixa o PR verde sem provar o que ele prova. Foi o #185
// (os testes do complemento e o do fake fora do workflow: uma mutação no servidor passava
// verde) e o #188 (os testes da divisão do CLAUDE.md, assumidos fora). O cadastro único é
// scripts/testes.json (grupos e arquivos), o executor é scripts/testar.mjs, e cada workflow só
// chama `node scripts/testar.mjs <grupo>`. Esta regra acusa:
//   - um arquivo de teste que nenhum grupo roda (nem está em `fora`, com o motivo);
//   - um grupo que nenhum workflow de PR executa de verdade (a chamada num `echo`, num job com `if: false` ou num
//     passo com `continue-on-error` não conta: o workflow é lido como YAML, scripts/yaml-de-workflow.js);
//   - um workflow que roda um teste por fora do executor (a lista dele diverge do cadastro);
//   - um cadastro com um padrão que não casa com nada ou um `fora` sem motivo.

const fs = require('fs');
const path = require('path');
const { arquivosDoRepositorio } = require('./comum');
const { comandos, lerYaml, rodaNoPR } = require('../yaml-de-workflow');
const { ARQUIVO_DO_REGISTRO, arquivosDoGrupo, ehArquivoDeTeste, grupoDoArquivo, lerRegistro } = require('../grupos-de-teste');

const id = 'testes-no-portao';

const conserto = 'Cadastre o teste num grupo de scripts/testes.json (`arquivos` no executor `node`; os de Python e o e2e '
  + 'são descobertos pela pasta e pelo padrão do grupo) e deixe o workflow chamar só `node scripts/testar.mjs <grupo>`; '
  + 'rode o mesmo comando aqui. Um arquivo que não é teste, e tem nome de teste, vai em `fora` com o motivo. '
  + 'Não basta citar o comando no corpo do PR.';

const DIRETORIO_DOS_WORKFLOWS = '.github/workflows';

const seAplica = arquivo => ehArquivoDeTeste(arquivo) || arquivo === ARQUIVO_DO_REGISTRO
  || new RegExp(`^${DIRETORIO_DOS_WORKFLOWS.replace('.', '\\.')}/[^/]+\\.ya?ml$`).test(arquivo);

// O que num workflow é um teste rodado por fora do executor.
const TESTE_POR_FORA = [
  /\bnode\s+(?:\S*\/)?test_\S+/,
  /-m\s+unittest\b/,
  /\bpytest\b/,
  /\bplaywright\s+test\b/,
  /\bbash\s+\S*test_\S+\.sh\b/,
];
const CHAMADA_DO_EXECUTOR = /scripts\/testar\.mjs\s+((?:(?!-)[a-z0-9][a-z0-9-]*\s*)+)/g;
// O comando que de fato roda o executor: só prefixos que não mudam o que roda (xvfb-run, env, nice, sudo, VAR=valor).
const EXECUTA_O_EXECUTOR = /^\s*(?:(?:xvfb-run(?:\s+-{1,2}[\w-]+(?:=\S+)?)*|env|nice(?:\s+-n\s*\d+)?|sudo|[A-Za-z_][A-Za-z0-9_]*=\S+)\s+)*node\s+scripts\/testar\.mjs\s+((?:(?!-)[a-z0-9][a-z0-9-]*\s*)+)/;
const gruposDe = texto => texto.trim().split(/\s+/).filter(Boolean);

const emCache = new Map();
/** Tudo que a regra olha fora do arquivo acusado: o cadastro, os arquivos do repositório e os workflows de PR. */
function contexto(raiz) {
  if (emCache.has(raiz)) return emCache.get(raiz);
  const arquivos = arquivosDoRepositorio(raiz);
  const registro = lerRegistro(raiz);
  const workflows = arquivos.filter(arquivo => new RegExp(`^${DIRETORIO_DOS_WORKFLOWS.replace('.', '\\.')}/[^/]+\\.ya?ml$`).test(arquivo))
    .map(arquivo => ({ arquivo, texto: fs.readFileSync(path.join(raiz, arquivo), 'utf8') }));
  const chamados = new Set();
  for (const { texto } of workflows) {
    const yaml = lerYaml(texto);
    if (!rodaNoPR(yaml)) continue;
    for (const comando of comandos(yaml).filter(c => c.executa)) {
      const chamada = EXECUTA_O_EXECUTOR.exec(comando.texto);
      if (chamada) for (const grupo of gruposDe(chamada[1])) chamados.add(grupo);
    }
  }
  const resultado = { arquivos, registro, chamados };
  emCache.set(raiz, resultado);
  return resultado;
}

/** As linhas de um workflow que não são comentário, com o número. */
function linhasDeComando(texto) {
  return texto.split('\n').map((linha, i) => ({ linha: i + 1, texto: linha })).filter(l => !/^\s*#/.test(l.texto));
}

/** O número da linha em que o cadastro nomeia `chave` (ou 1). */
function linhaDaChave(fonte, chave) {
  const i = fonte.split('\n').findIndex(linha => linha.includes(`"${chave}"`));
  return i < 0 ? 1 : i + 1;
}

function verificar(arquivo, fonte, raiz = process.cwd()) {
  const { arquivos, registro, chamados } = contexto(raiz);

  if (ehArquivoDeTeste(arquivo)) {
    if (grupoDoArquivo(registro, arquivo) || registro.fora.some(f => f.arquivo === arquivo)) return [];
    return [{ linha: 1, detalhe: `${arquivo} é um teste que nenhum grupo de ${ARQUIVO_DO_REGISTRO} roda; o CI não o executa` }];
  }

  if (arquivo === ARQUIVO_DO_REGISTRO) {
    const achados = [];
    for (const [nome, grupo] of Object.entries(registro.grupos)) {
      const linha = linhaDaChave(fonte, nome);
      if (!['node', 'unittest', 'playwright'].includes(grupo.executor)) {
        achados.push({ linha, detalhe: `grupo ${nome}: executor desconhecido (${grupo.executor}); use node, unittest ou playwright` });
      } else if (arquivosDoGrupo(grupo, arquivos).length === 0) {
        achados.push({ linha, detalhe: `grupo ${nome}: nenhum arquivo do repositório casa com ele; tire o grupo ou conserte o padrão` });
      } else if (!chamados.has(nome)) {
        achados.push({ linha, detalhe: `grupo ${nome}: nenhum workflow de PR chama \`node scripts/testar.mjs ${nome}\`; os testes dele não rodam no CI` });
      }
    }
    for (const fora of registro.fora) {
      const linha = linhaDaChave(fonte, fora.arquivo || 'fora');
      if (!fora.arquivo || !arquivos.includes(fora.arquivo)) achados.push({ linha, detalhe: `fora: ${fora.arquivo || '(sem arquivo)'} não existe; tire a entrada` });
      else if (!String(fora.motivo || '').trim()) achados.push({ linha, detalhe: `fora: ${fora.arquivo} sem motivo; diga por que não é um teste do portão` });
    }
    return achados;
  }

  // Um workflow.
  const achados = [];
  for (const { linha, texto } of linhasDeComando(fonte)) {
    if (TESTE_POR_FORA.some(r => r.test(texto))) {
      achados.push({ linha, detalhe: `roda um teste por fora do executor: ${texto.trim().slice(0, 100)}; chame \`node scripts/testar.mjs <grupo>\`` });
    }
    for (const m of texto.matchAll(CHAMADA_DO_EXECUTOR)) {
      for (const grupo of gruposDe(m[1])) {
        if (!registro.grupos[grupo]) achados.push({ linha, detalhe: `chama o grupo ${grupo}, que ${ARQUIVO_DO_REGISTRO} não tem` });
      }
    }
  }
  // O que menciona o executor tem de executá-lo: um `echo`, um job desligado ou um passo que pode falhar não é o portão.
  const yaml = lerYaml(fonte);
  for (const comando of comandos(yaml)) {
    if (!/scripts\/testar\.mjs/.test(comando.texto)) continue;
    if (!comando.executa) {
      achados.push({ linha: comando.linha, detalhe: `${comando.texto.trim().slice(0, 100)} não executa o grupo (${comando.motivo}); o passo precisa rodar \`node scripts/testar.mjs <grupo>\` e poder barrar o PR` });
    } else if (!EXECUTA_O_EXECUTOR.test(comando.texto)) {
      achados.push({ linha: comando.linha, detalhe: `${comando.texto.trim().slice(0, 100)} cita o executor mas não o roda como comando; escreva \`node scripts/testar.mjs <grupo>\` (com xvfb-run, env ou nice na frente, se precisar)` });
    }
  }
  return achados;
}

module.exports = { id, conserto, seAplica, verificar };
