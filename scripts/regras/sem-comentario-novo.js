'use strict';

const { execFileSync } = require('child_process');
const { EXCECOES } = require('./e2e-funcao-interna');
const { linhaDe, trechosDeComentario } = require('./comum');

const id = 'sem-comentario-novo';

const conserto = 'Apague o comentário. O que ele explicava sobre o código vai para o nome: renomeie a função ou a variável '
  + 'para carregar a ideia. A decisão (o porquê) vai para o corpo da PR, para docs/ ou, se for vocabulário do domínio, '
  + 'para docs/glossary.md: um comentário envelhece sozinho, e o agente seguinte copia a decisão específica como se fosse regra geral '
  + '(docs/CODING_STANDARDS.md regra 14). Passam só a linha 1 `#!`, as diretivas de ferramenta (`eslint-disable`/`eslint-enable`/`eslint-env`, '
  + '`@ts-*`, `noqa`, `type: ignore`, `istanbul ignore`, `c8 ignore`, `prettier-ignore`, `coding:`), o cabeçalho de licença '
  + '(`SPDX-License-Identifier`, `Copyright`) e as marcas que outra regra lê (`exceção <regra> até …`, `Exceção de teste: …`, '
  + '`@estado-guardado`). Um comentário que já existia numa linha que a mudança tocou, reindentou ou moveu também conta: apague-o. Um caso que precisa ficar leva, na própria linha: '
  + '`exceção sem-comentario-novo até AAAA-MM-DD, aprovada por <pessoa>: <motivo>`.';

const FORA = /^(docs|\.claude)\//;
const CODIGO = /\.(js|mjs|cjs|jsx|ts|tsx|py|css|html|sh)$/;
const GANCHO = /^scripts\/ganchos\/[^./]+$/;
const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;

const seAplica = arquivo => !FORA.test(arquivo) && (CODIGO.test(arquivo) || GANCHO.test(arquivo) || WORKFLOW.test(arquivo));

const DIRETIVAS = [
  /^eslint-(?:disable|enable)(?:-next-line|-line)?(?:\s+[@\w/.-]+(?:\s*,\s*[@\w/.-]+)*)?$/,
  /^eslint-env(?:\s+[\w-]+(?:\s*,\s*[\w-]+)*)?$/,
  /^@ts-(?:ignore|expect-error|nocheck|check)$/,
  /^noqa(?::\s*[A-Z]+\d*(?:\s*,\s*[A-Z]+\d*)*)?$/,
  /^type:\s*ignore(?:\[[\w,\s-]+\])?$/,
  /^istanbul\s+ignore\s+(?:next|if|else|file)$/,
  /^c8\s+ignore\s+(?:next|start|stop|file)(?:\s+\d+)?$/,
  /^prettier-ignore(?:-start|-end)?$/,
];
const DECLARACAO_DE_CODIFICACAO = /^(?:-\*-\s*coding:\s*[\w.-]+\s*-\*-|coding[:=]\s*[\w.-]+)$/;
const LINHAS_DA_LICENCA = [
  /^SPDX-License-Identifier:\s*[\w.+-]+(?:\s+(?:AND|OR|WITH)\s+[\w.+-]+)*$/,
  /^(?:SPDX-FileCopyrightText:\s*)?(?:Copyright(?:\s+\(c\)|\s+©)?|©)\s+\d{4}(?:\s*[-,]\s*\d{4})*\s+[\p{L}.'-]+(?:\s[\p{L}.'-]+){0,3}$/u,
];
const ATE_A_LINHA_DA_LICENCA = 5;
const EXCECAO_PROPRIA = new RegExp(`exce[çc][ãa]o\\s+${id}\\b`, 'i');
const MARCA_DE_TESTE = new RegExp(`^Exceção de teste:\\s*(?:${EXCECOES.join('|')}|sem-estado-guardado)\\b`);
const MARCA_DO_FAKE = /^@estado-guardado\b/;
const ARQUIVO_DE_TESTE = /^e2e\/tests\/.+\.spec\.js$/;
const ARQUIVO_DE_FAKE = /^e2e\/fakes\/.+\.js$/;
const COMECO_DO_COMENTARIO = /^\s*(?:\/\/+|\/\*+|<!--|#+|\*+(?!\/))\s*/;
const FIM_DO_COMENTARIO = /\s*(?:\*\/|-->)\s*$/;

const corpoDe = (texto, primeira, ultima) => {
  const semInicio = primeira ? texto.replace(COMECO_DO_COMENTARIO, '') : texto.replace(/^\s*\*+(?!\/)\s?/, '');
  return (ultima ? semInicio.replace(FIM_DO_COMENTARIO, '') : semInicio).trim();
};

const idsDasOutrasRegras = arquivo => require('./verificar').REGRAS
  .filter(regra => regra.id !== id && regra.seAplica(arquivo))
  .map(regra => regra.id);

function excecaoDeOutraRegra(arquivo) {
  const ids = idsDasOutrasRegras(arquivo);
  if (ids.length === 0) return /(?!)/;
  return new RegExp(`^exce[çc][ãa]o\\s+(?:${ids.join('|')})\\s+at[ée]\\s+\\d{4}-\\d{2}-\\d{2}\\s*,\\s*aprovad[ao]\\s+por\\s+[^:]+:\\s*\\S`, 'i');
}

function git(raiz, args) {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024,
  });
}

function linhasAcrescentadas(texto) {
  const porArquivo = new Map();
  let atual = null;
  let nocabecalho = false;
  for (const linha of texto.split('\n')) {
    if (linha.startsWith('diff --git ')) {
      nocabecalho = true;
      atual = null;
    } else if (nocabecalho && linha.startsWith('+++ ')) {
      const arquivo = /^\+\+\+ b\/(.+)$/.exec(linha);
      atual = arquivo ? new Set() : null;
      if (arquivo) porArquivo.set(arquivo[1], atual);
    } else if (linha.startsWith('@@')) {
      nocabecalho = false;
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(linha);
      if (hunk && atual) {
        const quantas = hunk[2] === undefined ? 1 : Number(hunk[2]);
        for (let i = 0; i < quantas; i++) atual.add(Number(hunk[1]) + i);
      }
    }
  }
  return porArquivo;
}

const mudancas = new Map();

function lerMudancas(raiz, base) {
  let desde;
  try {
    desde = git(raiz, ['merge-base', 'HEAD', base]).trim();
  } catch {
    throw new Error(`${id}: ${base} e o HEAD não têm um ancestral comum; sem ele não há como saber o que a mudança acrescentou`);
  }
  const diff = git(raiz, ['diff', '-U0', '-M', '--no-color', '--no-ext-diff', desde]);
  const novos = git(raiz, ['ls-files', '--others', '--exclude-standard', '-z']);
  return { acrescentadas: linhasAcrescentadas(diff), novos: new Set(novos.split('\0').filter(Boolean)) };
}

function mudancasDesde(raiz, base) {
  const chave = `${raiz}\0${base}`;
  if (!mudancas.has(chave)) mudancas.set(chave, lerMudancas(raiz, base));
  return mudancas.get(chave);
}

function gruposDeComentario(arquivo, fonte) {
  const inicios = [0];
  for (let i = 0; i < fonte.length; i++) if (fonte[i] === '\n') inicios.push(i + 1);
  const trechos = trechosDeComentario(arquivo, fonte).sort((a, b) => a[0] - b[0]);
  const grupos = [];
  for (const [de, ate] of trechos) {
    const linhaInicial = linhaDe(fonte, de);
    const linhas = fonte.slice(de, ate).split('\n').map((texto, i, todas) => ({
      linha: linhaInicial + i,
      corpo: corpoDe(texto, i === 0, i === todas.length - 1),
    }));
    const propria = fonte.slice(inicios[linhaInicial - 1], de).trim() === '';
    const shebang = linhaInicial === 1 && fonte.startsWith('#!');
    const ultimo = grupos[grupos.length - 1];
    if (propria && ultimo && ultimo.propria && !ultimo.shebang && ultimo.linhas[ultimo.linhas.length - 1].linha === linhaInicial - 1) {
      ultimo.linhas.push(...linhas);
    } else {
      grupos.push({ propria, shebang, linhas });
    }
  }
  return grupos;
}

function passa(arquivo, grupo, excecaoDeOutra) {
  const comTexto = grupo.linhas.filter(l => l.corpo);
  if (comTexto.length === 0 || grupo.shebang) return true;
  const primeira = comTexto[0].corpo;
  if (comTexto.every(l => DIRETIVAS.some(d => d.test(l.corpo)) || (arquivo.endsWith('.py') && DECLARACAO_DE_CODIFICACAO.test(l.corpo)))) return true;
  if (grupo.linhas[0].linha <= ATE_A_LINHA_DA_LICENCA && comTexto.every(l => LINHAS_DA_LICENCA.some(e => e.test(l.corpo)))) return true;
  if (comTexto.length > 1) return false;
  if (excecaoDeOutra.test(primeira)) return true;
  if (!grupo.propria) return false;
  if (ARQUIVO_DE_TESTE.test(arquivo) && MARCA_DE_TESTE.test(primeira)) return true;
  return ARQUIVO_DE_FAKE.test(arquivo) && MARCA_DO_FAKE.test(primeira);
}

function verificar(arquivo, fonte, raiz, base) {
  const comExcecaoPropria = EXCECAO_PROPRIA.test(fonte);
  const mudou = base ? mudancasDesde(raiz, base) : null;
  const todas = Boolean(mudou) && mudou.novos.has(arquivo);
  const acrescentadas = mudou && mudou.acrescentadas.get(arquivo);
  if (!comExcecaoPropria && !todas && !acrescentadas) return [];
  const excecaoDeOutra = excecaoDeOutraRegra(arquivo);
  const achados = [];
  for (const grupo of gruposDeComentario(arquivo, fonte)) {
    const livre = passa(arquivo, grupo, excecaoDeOutra);
    for (const { linha, corpo } of grupo.linhas) {
      const nova = !livre && (todas || (acrescentadas && acrescentadas.has(linha)));
      if (!corpo || !(nova || EXCECAO_PROPRIA.test(corpo))) continue;
      achados.push({ linha, detalhe: `comentário novo: “${corpo.length > 70 ? `${corpo.slice(0, 67)}…` : corpo}”` });
    }
  }
  return achados;
}

module.exports = { id, conserto, seAplica, verificar };
