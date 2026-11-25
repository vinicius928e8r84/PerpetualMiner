'use strict';

const { execFileSync } = require('child_process');
const { EXCECOES } = require('./e2e-funcao-interna');
const { linhaDe, trechosDeComentario } = require('./comum');

const id = 'sem-comentario-novo';

const conserto = 'Apague o comentário. O que ele explicava sobre o código vai para o nome: renomeie a função ou a variável '
  + 'para carregar a ideia. A decisão (o porquê) vai para o corpo da PR, para docs/ ou, se for vocabulário do domínio, '
  + 'para glossary.md: um comentário envelhece sozinho, e o agente seguinte copia a decisão específica como se fosse regra geral. '
  + 'Passam só a linha 1 `#!`, as diretivas de ferramenta (`eslint-disable`/`eslint-enable`/`eslint-env`, '
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
  /^shellcheck\s+(?:source|disable|enable|shell)=[\w,./-]+$/,
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
const MARCAS_EM_LINHA_PROPRIA = [
  { arquivo: /^e2e\/tests\/.+\.spec\.js$/, marca: MARCA_DE_TESTE },
  { arquivo: /^e2e\/fakes\/.+\.js$/, marca: MARCA_DO_FAKE },
];
const COMECO_DO_COMENTARIO = /^\s*(?:\/\/+|\/\*+|<!--|#+|\*+(?!\/))\s*/;
const FIM_DO_COMENTARIO = /\s*(?:\*\/|-->)\s*$/;
const CABECALHO_DO_ARQUIVO = /^\+\+\+ b\/(.+)$/;
const CABECALHO_DO_HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

const corpoDe = (texto, primeira, ultima) => {
  const semInicio = primeira ? texto.replace(COMECO_DO_COMENTARIO, '') : texto.replace(/^\s*\*+(?!\/)\s?/, '');
  return (ultima ? semInicio.replace(FIM_DO_COMENTARIO, '') : semInicio).trim();
};

const idsDasOutrasRegras = (arquivo, propria) => require('./verificar').REGRAS
  .filter(regra => regra.id !== propria && regra.seAplica(arquivo))
  .map(regra => regra.id);

function excecaoDeOutraRegra(arquivo, propria = id) {
  const ids = idsDasOutrasRegras(arquivo, propria);
  if (ids.length === 0) return /(?!)/;
  return new RegExp(`^exce[çc][ãa]o\\s+(?:${ids.join('|')})\\s+at[ée]\\s+\\d{4}-\\d{2}-\\d{2}\\s*,\\s*aprovad[ao]\\s+por\\s+[^:]+:\\s*\\S`, 'i');
}

function git(raiz, args) {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024,
  });
}

function linhasDoHunk(cabecalho) {
  const hunk = CABECALHO_DO_HUNK.exec(cabecalho);
  if (!hunk) return [];
  const quantas = hunk[2] === undefined ? 1 : Number(hunk[2]);
  return Array.from({ length: quantas }, (_, i) => Number(hunk[1]) + i);
}

class LeitorDoDiff {
  constructor() {
    this.porArquivo = new Map();
    this.atual = null;
    this.noCabecalho = false;
  }

  ler(linha) {
    if (linha.startsWith('diff --git ')) this.abrirArquivo();
    else if (this.noCabecalho && linha.startsWith('+++ ')) this.nomearArquivo(linha);
    else if (linha.startsWith('@@')) this.lerHunk(linha);
  }

  abrirArquivo() {
    this.noCabecalho = true;
    this.atual = null;
  }

  nomearArquivo(linha) {
    const arquivo = CABECALHO_DO_ARQUIVO.exec(linha);
    this.atual = null;
    if (!arquivo) return;
    this.atual = new Set();
    this.porArquivo.set(arquivo[1], this.atual);
  }

  lerHunk(linha) {
    this.noCabecalho = false;
    if (!this.atual) return;
    for (const numero of linhasDoHunk(linha)) this.atual.add(numero);
  }
}

function linhasAcrescentadas(texto) {
  const leitor = new LeitorDoDiff();
  for (const linha of texto.split('\n')) leitor.ler(linha);
  return leitor.porArquivo;
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

const NENHUMA_LINHA = new Set();
const TODAS_AS_LINHAS = { has: () => true };

function linhasNovas(arquivo, raiz, base) {
  if (!base) return NENHUMA_LINHA;
  const mudou = mudancasDesde(raiz, base);
  if (mudou.novos.has(arquivo)) return TODAS_AS_LINHAS;
  return mudou.acrescentadas.get(arquivo) || NENHUMA_LINHA;
}

function iniciosDasLinhas(fonte) {
  const inicios = [0];
  for (let i = 0; i < fonte.length; i++) if (fonte[i] === '\n') inicios.push(i + 1);
  return inicios;
}

function comentarioEm(fonte, [de, ate], inicios) {
  const linhaInicial = linhaDe(fonte, de);
  return {
    propria: fonte.slice(inicios[linhaInicial - 1], de).trim() === '',
    shebang: linhaInicial === 1 && fonte.startsWith('#!'),
    linhas: fonte.slice(de, ate).split('\n').map((texto, i, todas) => ({
      linha: linhaInicial + i,
      corpo: corpoDe(texto, i === 0, i === todas.length - 1),
    })),
  };
}

function ultimaLinhaDe(grupo) {
  return grupo.linhas[grupo.linhas.length - 1].linha;
}

function aceitaContinuacao(grupo) {
  return grupo.propria && !grupo.shebang;
}

function vemLogoDepois(anterior, comentario) {
  return ultimaLinhaDe(anterior) === comentario.linhas[0].linha - 1;
}

function continuaOBloco(anterior, comentario) {
  if (!anterior || !comentario.propria) return false;
  return aceitaContinuacao(anterior) && vemLogoDepois(anterior, comentario);
}

function gruposDeComentario(arquivo, fonte) {
  const inicios = iniciosDasLinhas(fonte);
  const grupos = [];
  for (const trecho of trechosDeComentario(arquivo, fonte).sort((a, b) => a[0] - b[0])) {
    const comentario = comentarioEm(fonte, trecho, inicios);
    const anterior = grupos[grupos.length - 1];
    if (continuaOBloco(anterior, comentario)) anterior.linhas.push(...comentario.linhas);
    else grupos.push(comentario);
  }
  return grupos;
}

function ehDeclaracaoDeCodificacao(arquivo, corpo) {
  return arquivo.endsWith('.py') && DECLARACAO_DE_CODIFICACAO.test(corpo);
}

function ehDiretiva(arquivo, corpo) {
  return DIRETIVAS.some(d => d.test(corpo)) || ehDeclaracaoDeCodificacao(arquivo, corpo);
}

function ehLinhaDaLicenca(corpo) {
  return LINHAS_DA_LICENCA.some(e => e.test(corpo));
}

function semTexto(bloco) {
  return bloco.corpos.length === 0;
}

function ehShebang(bloco) {
  return bloco.shebang;
}

function soDiretivas(bloco) {
  return bloco.corpos.every(corpo => ehDiretiva(bloco.arquivo, corpo));
}

function ehCabecalhoDeLicenca(bloco) {
  return bloco.primeiraLinha <= ATE_A_LINHA_DA_LICENCA && bloco.corpos.every(ehLinhaDaLicenca);
}

function ehExcecaoDeOutraRegra(bloco) {
  return bloco.excecaoDeOutra.test(bloco.corpos[0]);
}

function ehMarcaEmLinhaPropria(bloco) {
  if (!bloco.propria) return false;
  return MARCAS_EM_LINHA_PROPRIA.some(({ arquivo, marca }) => arquivo.test(bloco.arquivo) && marca.test(bloco.corpos[0]));
}

const LIBERAM_UMA_LINHA = [ehExcecaoDeOutraRegra, ehMarcaEmLinhaPropria];

function umaLinhaLiberada(bloco) {
  return bloco.corpos.length === 1 && LIBERAM_UMA_LINHA.some(libera => libera(bloco));
}

const LIBERAM_O_BLOCO = [semTexto, ehShebang, soDiretivas, ehCabecalhoDeLicenca, umaLinhaLiberada];

function passa(arquivo, grupo, excecaoDeOutra) {
  const bloco = {
    arquivo,
    excecaoDeOutra,
    propria: grupo.propria,
    shebang: grupo.shebang,
    primeiraLinha: grupo.linhas[0].linha,
    corpos: grupo.linhas.map(l => l.corpo).filter(Boolean),
  };
  return LIBERAM_O_BLOCO.some(libera => libera(bloco));
}

function resumo(corpo) {
  return corpo.length > 70 ? `${corpo.slice(0, 67)}…` : corpo;
}

function achadosDoGrupo(grupo, acusaveis) {
  const achados = [];
  for (const { linha, corpo } of grupo.linhas.filter(l => l.corpo)) {
    if (acusaveis.has(linha) || EXCECAO_PROPRIA.test(corpo)) achados.push({ linha, detalhe: `comentário novo: “${resumo(corpo)}”` });
  }
  return achados;
}

function verificar(arquivo, fonte, raiz, base) {
  const novas = linhasNovas(arquivo, raiz, base);
  if (novas === NENHUMA_LINHA && !EXCECAO_PROPRIA.test(fonte)) return [];
  const excecaoDeOutra = excecaoDeOutraRegra(arquivo);
  return gruposDeComentario(arquivo, fonte)
    .flatMap(grupo => achadosDoGrupo(grupo, passa(arquivo, grupo, excecaoDeOutra) ? NENHUMA_LINHA : novas));
}

module.exports = { id, conserto, seAplica, verificar, gruposDeComentario, passa, excecaoDeOutraRegra, resumo, ehDiretiva };
