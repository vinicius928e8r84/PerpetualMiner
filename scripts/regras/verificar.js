#!/usr/bin/env node
'use strict';

// As regras que a revisão cobrava à mão, conferidas por máquina. O mesmo comando
// roda aqui e no CI (.github/workflows/regras.yml); o uso e o funcionamento
// estão em AJUDA, logo abaixo (`node scripts/regras/verificar.js --help`).

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { arquivosDoRepositorio, comentariosPorLinha } = require('./comum');

const REGRAS = [
  require('./tokens-veio'),
  require('./gravacao-de-frases'),
  require('./idioma-solto'),
  require('./teste-le-codigo'),
  require('./e2e-funcao-interna'),
  require('./testes-no-portao'),
  require('./contrato-fechado'),
  require('./e2e-estado-final'),
];

const ARQUIVO_DA_LINHA_DE_BASE = 'scripts/regras/linha-de-base.json';

const AJUDA = `uso: node scripts/regras/verificar.js [--raiz <pasta>] [--base <ref>] [--atualizar | --criar-linha-de-base]

Confere as regras de revisão de scripts/regras/ (uma por arquivo; a tabela regra → quem confere
está em AGENTS.md § Rules and what enforces them).

  (sem bandeira)          confere o repositório; sai com 1 se alguma regra falhar
  --atualizar             depois de um conserto, baixa scripts/regras/linha-de-base.json (nunca sobe)
  --criar-linha-de-base   cria a linha de base quando ela ainda não existe
  --raiz <pasta>          confere outro repositório (os testes usam)
  --base <ref>            o commit cuja linha de base é o teto (padrão: $REGRAS_BASE, senão origin/main);
                          uma base pedida que não existe é erro
  --help                  esta ajuda

Catraca: cada arquivo pode ter no máximo as ocorrências que a linha de base registra; uma a mais falha,
com as linhas novas e o que usar no lugar. O total de cada regra não pode passar o da linha de base da
--base (no PR, a ponta da branch-alvo; no push, o commit anterior), então a linha de base só desce.
Uma ocorrência que precisa ficar leva, num comentário na própria linha:
  exceção <regra> até AAAA-MM-DD, aprovada por <pessoa>: <motivo>
Uma exceção vencida, mal escrita ou numa linha que a regra não acusa também falha.

Prova de cada regra com os erros reais que ela pega: node scripts/regras/test_regras.js`;

// Erros de uso (bandeira desconhecida, valor faltando): stdout, código 2.
class ErroDeUso extends Error {}

function lerArgumentos(argv) {
  const opcoes = { atualizar: false, criar: false, raiz: null, base: null, ajuda: false };
  const comValor = new Map([['--raiz', 'raiz'], ['--base', 'base']]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opcoes.ajuda = true;
    else if (arg === '--atualizar') opcoes.atualizar = true;
    else if (arg === '--criar-linha-de-base') opcoes.criar = true;
    else if (comValor.has(arg)) {
      const valor = argv[i + 1];
      if (valor === undefined || valor.startsWith('--')) throw new ErroDeUso(`${arg} precisa de um valor`);
      opcoes[comValor.get(arg)] = valor;
      i++;
    } else {
      throw new ErroDeUso(`bandeira desconhecida: ${arg}`);
    }
  }
  if (opcoes.atualizar && opcoes.criar) throw new ErroDeUso('--atualizar e --criar-linha-de-base não andam juntas');
  if (opcoes.raiz !== null && !(fs.existsSync(opcoes.raiz) && fs.statSync(opcoes.raiz).isDirectory())) {
    throw new ErroDeUso(`--raiz ${opcoes.raiz}: não é uma pasta`);
  }
  return opcoes;
}

const EXCECAO = /exce[çc][ãa]o\s+([a-z0-9-]+)\b(.*)$/i;
const EXCECAO_COMPLETA = /^\s+at[ée]\s+(\d{4}-\d{2}-\d{2})\s*,\s*aprovad[ao]\s+por\s+([^:]+?)\s*:\s*(.+)$/i;

function git(raiz, args) {
  try {
    return execFileSync('git', args, { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// A exceção escrita na linha, se houver: { valida, regra, erro }.
function excecaoNaLinha(texto, hoje) {
  const m = EXCECAO.exec(texto);
  if (!m || !REGRAS.some(regra => regra.id === m[1])) return null;
  const resto = m[2].replace(/\s*(\*\/|-->)\s*$/, '');
  const completa = EXCECAO_COMPLETA.exec(resto);
  if (!completa) {
    return { regra: m[1], erro: 'exceção sem o formato `exceção <regra> até AAAA-MM-DD, aprovada por <pessoa>: <motivo>`' };
  }
  const [, validade, quem, motivo] = completa;
  if (Number.isNaN(Date.parse(validade))) return { regra: m[1], erro: `data inválida: ${validade}` };
  if (validade < hoje) return { regra: m[1], erro: `exceção vencida em ${validade}: conserte a linha ou renove com a aprovação de alguém` };
  if (!quem.trim() || !motivo.trim()) return { regra: m[1], erro: 'exceção sem quem aprovou ou sem motivo' };
  return { regra: m[1], valida: true };
}

/** Os achados de todas as regras: { [regra]: { [arquivo]: [{ linha, detalhe }] } } e os erros de exceção. */
function coletar(raiz, hoje) {
  const arquivos = arquivosDoRepositorio(raiz);
  const porRegra = {};
  const errosDeExcecao = [];
  const acusadas = new Set(); // `regra arquivo:linha` de todo achado, com ou sem exceção
  const textos = new Map();
  const ler = arquivo => {
    if (!textos.has(arquivo)) textos.set(arquivo, fs.readFileSync(path.join(raiz, arquivo), 'utf8'));
    return textos.get(arquivo);
  };
  const comentarios = new Map();
  const comentariosDe = arquivo => {
    if (!comentarios.has(arquivo)) comentarios.set(arquivo, comentariosPorLinha(arquivo, ler(arquivo)));
    return comentarios.get(arquivo);
  };
  for (const regra of REGRAS) {
    porRegra[regra.id] = {};
    for (const arquivo of arquivos.filter(regra.seAplica)) {
      const achados = regra.verificar(arquivo, ler(arquivo), raiz).filter(achado => {
        acusadas.add(`${regra.id} ${arquivo}:${achado.linha}`);
        const excecao = excecaoNaLinha(comentariosDe(arquivo).get(achado.linha) || '', hoje);
        return !(excecao && excecao.regra === regra.id && excecao.valida);
      });
      if (achados.length) porRegra[regra.id][arquivo] = achados;
    }
  }
  // Toda exceção escrita num comentário é conferida: mal escrita, vencida, ou numa
  // linha que a regra não acusa (ficou para trás depois de um conserto).
  for (const arquivo of arquivos.filter(a => /\.(js|mjs|css|html|py)$/.test(a))) {
    for (const [linha, texto] of comentariosDe(arquivo)) {
      const excecao = excecaoNaLinha(texto, hoje);
      if (!excecao || !REGRAS.find(regra => regra.id === excecao.regra).seAplica(arquivo)) continue;
      if (!excecao.valida) errosDeExcecao.push(`${arquivo}:${linha}: ${excecao.erro}`);
      else if (!acusadas.has(`${excecao.regra} ${arquivo}:${linha}`)) {
        errosDeExcecao.push(`${arquivo}:${linha}: exceção de ${excecao.regra} numa linha que a regra não acusa; tire-a`);
      }
    }
  }
  return { porRegra, errosDeExcecao };
}

function contagens(porRegra) {
  const saida = {};
  for (const [regra, porArquivo] of Object.entries(porRegra)) {
    saida[regra] = {};
    for (const [arquivo, achados] of Object.entries(porArquivo)) saida[regra][arquivo] = achados.length;
  }
  return saida;
}

const total = porArquivo => Object.values(porArquivo || {}).reduce((soma, n) => soma + n, 0);

// As linhas que a mudança acrescentou em `arquivo`, comparadas com `base`; null sem git.
function linhasNovas(raiz, base, arquivo) {
  if (!base) return null;
  const diff = git(raiz, ['diff', '-U0', base, '--', arquivo]);
  if (diff === null) return null;
  if (diff === '' && git(raiz, ['cat-file', '-e', `${base}:${arquivo}`]) === null) return null;
  const novas = new Set();
  for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const inicio = Number(m[1]);
    const quantas = m[2] === undefined ? 1 : Number(m[2]);
    for (let i = 0; i < quantas; i++) novas.add(inicio + i);
  }
  return novas;
}

const COMMIT_VAZIO = /^0+$/;

// O teto da linha de base: a ponta da --base (REGRAS_BASE no CI: no PR, a branch-alvo;
// no push, o commit anterior), sem passar pelo merge-base, para uma permissão que a
// main já tirou não voltar por um ramo antigo. O merge-base só serve para achar as
// linhas que a mudança acrescentou. null quando não há base: o primeiro push de um
// ramo (commit vazio) ou, sem --base nem REGRAS_BASE, um clone sem origin/main. Uma
// base pedida que não resolve é erro, não um verde sem comparação.
function baseDeComparacao(raiz, pedida) {
  const doAmbiente = process.env.REGRAS_BASE || null;
  const ref = pedida || doAmbiente || 'origin/main';
  if (COMMIT_VAZIO.test(ref)) return null;
  const teto = git(raiz, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  if (teto) return { ref, teto, desde: git(raiz, ['merge-base', 'HEAD', teto]) };
  if (pedida) throw new ErroDeUso(`--base ${pedida}: não é um commit deste repositório`);
  if (doAmbiente) {
    throw new Error(`REGRAS_BASE=${doAmbiente} não é um commit deste repositório; no CI, confira o fetch-depth `
      + 'e o REGRAS_BASE de .github/workflows/regras.yml');
  }
  return null;
}

const lerJson = (texto, origem) => {
  try {
    return JSON.parse(texto);
  } catch (erro) {
    throw new Error(`${origem} não é um JSON válido (${erro.message}); conserte o arquivo ou restaure-o da main`);
  }
};

function main(argv) {
  const opcoes = lerArgumentos(argv);
  if (opcoes.ajuda) {
    console.log(AJUDA);
    return 0;
  }
  const raiz = opcoes.raiz ? path.resolve(opcoes.raiz) : path.resolve(__dirname, '..', '..');
  if (git(raiz, ['rev-parse', '--show-toplevel']) === null) throw new Error(`${raiz} não é um repositório git`);
  const base = baseDeComparacao(raiz, opcoes.base);
  const hoje = new Date().toISOString().slice(0, 10);
  const caminhoDaBase = path.join(raiz, ARQUIVO_DA_LINHA_DE_BASE);

  const { porRegra, errosDeExcecao } = coletar(raiz, hoje);
  const agora = contagens(porRegra);

  if (opcoes.criar) {
    if (fs.existsSync(caminhoDaBase)) {
      throw new Error(`${ARQUIVO_DA_LINHA_DE_BASE} já existe; a linha de base só desce (--atualizar)`);
    }
    fs.writeFileSync(caminhoDaBase, `${JSON.stringify(agora, null, 2)}\n`);
    console.log(`linha de base criada em ${ARQUIVO_DA_LINHA_DE_BASE}`);
    return 0;
  }

  if (!fs.existsSync(caminhoDaBase)) {
    throw new Error(`falta ${ARQUIVO_DA_LINHA_DE_BASE}; ela é versionada com as regras (crie com --criar-linha-de-base)`);
  }
  const linhaDeBase = lerJson(fs.readFileSync(caminhoDaBase, 'utf8'), ARQUIVO_DA_LINHA_DE_BASE);
  const erros = [...errosDeExcecao];
  const avisos = [];
  const podeBaixar = [];

  for (const regra of REGRAS) {
    const permitido = linhaDeBase[regra.id] || {};
    const arquivos = new Set([...Object.keys(agora[regra.id]), ...Object.keys(permitido)]);
    for (const arquivo of [...arquivos].sort()) {
      const tem = agora[regra.id][arquivo] || 0;
      const pode = permitido[arquivo] || 0;
      if (tem < pode) podeBaixar.push(`${regra.id} ${arquivo}: ${pode} → ${tem}`);
      if (tem <= pode) continue;
      const achados = porRegra[regra.id][arquivo];
      const novas = base && base.desde ? linhasNovas(raiz, base.desde, arquivo) : null;
      const nasNovas = novas ? achados.filter(a => novas.has(a.linha)) : [];
      const mostrar = (nasNovas.length ? nasNovas : achados).slice(0, 12);
      erros.push([
        `✗ ${regra.id} — ${arquivo}: ${tem} ocorrência(s); a linha de base permite ${pode}.`,
        ...mostrar.map(a => `    ${arquivo}:${a.linha}: ${a.detalhe}`),
        ...(nasNovas.length || achados.length <= 12 ? [] : [`    … e mais ${achados.length - 12}`]),
        `  Conserto: ${regra.conserto}`,
      ].join('\n'));
    }
  }

  // A linha de base só desce: o total de cada regra não passa o da linha de base do teto.
  if (!base) {
    avisos.push('sem base de comparação (primeiro push, ou nem --base, nem REGRAS_BASE, nem origin/main): '
      + 'a linha de base não foi comparada');
  } else {
    const anterior = git(raiz, ['show', `${base.teto}:${ARQUIVO_DA_LINHA_DE_BASE}`]);
    if (anterior === null) {
      avisos.push(`${base.ref} ainda não tem ${ARQUIVO_DA_LINHA_DE_BASE}: esta é a primeira linha de base, nada a comparar`);
    } else {
      const antes = lerJson(anterior, `${base.ref}:${ARQUIVO_DA_LINHA_DE_BASE}`);
      for (const regra of REGRAS) {
        // Uma regra que a base ainda não tem entra com a primeira linha de base dela: não há teto a comparar.
        if (!(regra.id in antes)) {
          avisos.push(`${base.ref} ainda não tem a regra ${regra.id}: esta é a primeira linha de base dela (${total(linhaDeBase[regra.id])})`);
          continue;
        }
        if (total(linhaDeBase[regra.id]) > total(antes[regra.id])) {
          erros.push(`✗ ${ARQUIVO_DA_LINHA_DE_BASE}: ${regra.id} tem ${total(linhaDeBase[regra.id])}, mais que os `
            + `${total(antes[regra.id])} de ${base.ref}. A linha de base só desce: se ${base.ref} baixou depois que este ramo `
            + 'saiu dele, traga-o para cá (merge); um caso que precisa ficar leva uma exceção na própria linha '
            + '(`exceção <regra> até AAAA-MM-DD, aprovada por <pessoa>: <motivo>`).');
        }
      }
    }
  }

  if (opcoes.atualizar) {
    if (erros.length) {
      console.log(`${erros.join('\n\n')}\n\nerror: nada atualizado; --atualizar só baixa a linha de base, e há erros acima`);
      return 1;
    }
    const nova = {};
    for (const regra of REGRAS) {
      nova[regra.id] = {};
      for (const [arquivo, n] of Object.entries(agora[regra.id]).sort()) nova[regra.id][arquivo] = n;
    }
    fs.writeFileSync(caminhoDaBase, `${JSON.stringify(nova, null, 2)}\n`);
    console.log(podeBaixar.length ? `linha de base baixada:\n  ${podeBaixar.join('\n  ')}` : 'a linha de base já estava em dia');
    return 0;
  }

  for (const aviso of avisos) console.log(`aviso: ${aviso}`);
  if (erros.length) {
    console.log(`${erros.join('\n\n')}\n\nerror: ${erros.length} problema(s) nas regras`
      + '\nhelp: conserte como cada "Conserto" diz; as regras e quem as confere: AGENTS.md § Rules and what enforces them');
    return 1;
  }
  const resumo = REGRAS.map(regra => `${regra.id} ${total(agora[regra.id])}`).join(', ');
  console.log(`regras ok (na linha de base: ${resumo})`);
  if (podeBaixar.length) {
    console.log(`a linha de base pode descer (rode com --atualizar e versione):\n  ${podeBaixar.join('\n  ')}`);
  }
  return 0;
}

function rodar(argv) {
  try {
    return main(argv);
  } catch (erro) {
    if (erro instanceof ErroDeUso) {
      console.log(`error: ${erro.message}\nhelp: node scripts/regras/verificar.js --help\n\n${AJUDA}`);
      return 2;
    }
    console.log(`error: ${erro.message}\nhelp: node scripts/regras/verificar.js --help`);
    return 1;
  }
}

if (require.main === module) process.exitCode = rodar(process.argv.slice(2));

module.exports = { REGRAS, coletar, excecaoNaLinha };
