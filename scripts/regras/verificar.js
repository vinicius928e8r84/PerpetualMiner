#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { arquivosDoRepositorio, comentariosPorLinha, renomeacoes } = require('./comum');
const {
  ARQUIVO_DA_LINHA_DE_BASE, arquivoDe, arquivosDe, lerArquivoDaLinhaDeBase, criarLinhaDeBase, lerLinhaDeBase, atualizarLinhaDeBase,
} = require('./apoio-arquivos-da-linha-de-base');

const REGRAS = [
  require('./tokens-veio'),
  require('./gravacao-de-frases'),
  require('./idioma-solto'),
  require('./teste-le-codigo'),
  require('./e2e-funcao-interna'),
  require('./testes-no-portao'),
  require('./contrato-fechado'),
  require('./e2e-estado-final'),
  require('./doc-datado'),
  require('./indice-de-arquivos'),
  require('./aprovacao-visual'),
  require('./relogio-fora-da-fixture'),
  require('./versoes-publicadas'),
  require('./linha-de-base-no-merge'),
  require('./link-de-doc'),
  require('./limite-de-linhas'),
  require('./sem-comentario-novo'),
  require('./sem-comentario'),
  require('./html-cru'),
  require('./dialogo-nativo'),
  require('./saude-do-codigo'),
  require('./glossario-so-linguagem'),
];

const ARQUIVOS_DA_LINHA_DE_BASE = arquivosDe(REGRAS);

const AJUDA = `uso: node scripts/regras/verificar.js [--raiz <pasta>] [--base <ref>] [--atualizar | --criar-linha-de-base]

Confere as regras de revisão de scripts/regras/ (uma por arquivo; a tabela regra → quem confere
está em AGENTS.md § Rules and what enforces them).

  (sem bandeira)          confere o repositório; sai com 1 se alguma regra falhar
  --atualizar             baixa as linhas de base (scripts/regras/linha-de-base*.json; nunca sobe); quem o roda é baixar-no-merge.js, depois do merge, e não a PR
  --criar-linha-de-base   cria a linha de base das regras que ainda não têm a sua (o arquivo, se ele não existe)
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

class ErroDeUso extends Error {}

const BANDEIRAS_SEM_VALOR = new Map([['--help', 'ajuda'], ['-h', 'ajuda'], ['--atualizar', 'atualizar'], ['--criar-linha-de-base', 'criar']]);
const BANDEIRAS_COM_VALOR = new Map([['--raiz', 'raiz'], ['--base', 'base']]);

function valorDaBandeira(bandeira, valor) {
  if (valor === undefined || valor.startsWith('--')) throw new ErroDeUso(`${bandeira} precisa de um valor`);
  return valor;
}

function ehPasta(caminho) {
  return fs.existsSync(caminho) && fs.statSync(caminho).isDirectory();
}

function conferirOpcoes(opcoes) {
  if (opcoes.atualizar && opcoes.criar) throw new ErroDeUso('--atualizar e --criar-linha-de-base não andam juntas');
  if (opcoes.raiz !== null && !ehPasta(opcoes.raiz)) throw new ErroDeUso(`--raiz ${opcoes.raiz}: não é uma pasta`);
}

function lerArgumentos(argv) {
  const opcoes = { atualizar: false, criar: false, raiz: null, base: null, ajuda: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (BANDEIRAS_SEM_VALOR.has(arg)) opcoes[BANDEIRAS_SEM_VALOR.get(arg)] = true;
    else if (BANDEIRAS_COM_VALOR.has(arg)) {
      opcoes[BANDEIRAS_COM_VALOR.get(arg)] = valorDaBandeira(arg, argv[i + 1]);
      i++;
    } else {
      throw new ErroDeUso(`bandeira desconhecida: ${arg}`);
    }
  }
  conferirOpcoes(opcoes);
  return opcoes;
}

const EXCECAO = /exce[çc][ãa]o\s+([a-z0-9-]+)\b(.*)$/i;
const EXCECAO_COMPLETA = /^\s+at[ée]\s+(\d{4}-\d{2}-\d{2})\s*,\s*aprovad[ao]\s+por\s+([^:]+?)\s*:\s*(.+)$/i;
const FIM_DE_COMENTARIO = /\s*(\*\/|-->)\s*$/;

function git(raiz, args) {
  try {
    return execFileSync('git', args, { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function regraDeId(id) {
  return REGRAS.find(regra => regra.id === id);
}

function erroDaExcecao(resto, hoje) {
  const completa = EXCECAO_COMPLETA.exec(resto.replace(FIM_DE_COMENTARIO, ''));
  if (!completa) return 'exceção sem o formato `exceção <regra> até AAAA-MM-DD, aprovada por <pessoa>: <motivo>`';
  const [, validade, quem, motivo] = completa;
  if (Number.isNaN(Date.parse(validade))) return `data inválida: ${validade}`;
  if (validade < hoje) return `exceção vencida em ${validade}: conserte a linha ou renove com a aprovação de alguém`;
  if (!quem.trim() || !motivo.trim()) return 'exceção sem quem aprovou ou sem motivo';
  return null;
}

function excecaoNaLinha(texto, hoje) {
  const m = EXCECAO.exec(texto);
  if (!m || !regraDeId(m[1])) return null;
  const erro = erroDaExcecao(m[2], hoje);
  return erro ? { regra: m[1], erro } : { regra: m[1], valida: true };
}

function memorizado(calcular) {
  const guardados = new Map();
  return chave => {
    if (!guardados.has(chave)) guardados.set(chave, calcular(chave));
    return guardados.get(chave);
  };
}

const ARQUIVOS_COM_COMENTARIO = /\.(js|mjs|css|html|py|sh|ya?ml)$|^scripts\/ganchos\/[^./]+$/;

const acusacao = (regra, arquivo, linha) => `${regra} ${arquivo}:${linha}`;

class Coleta {
  constructor(raiz, hoje, base) {
    this.raiz = raiz;
    this.hoje = hoje;
    this.base = base;
    this.arquivos = arquivosDoRepositorio(raiz);
    this.acusadas = new Set();
    this.ler = memorizado(arquivo => fs.readFileSync(path.join(raiz, arquivo), 'utf8'));
    this.comentariosDe = memorizado(arquivo => comentariosPorLinha(arquivo, this.ler(arquivo)));
  }

  achadosDaRegra(regra) {
    const porArquivo = {};
    for (const arquivo of this.arquivos.filter(regra.seAplica)) {
      const achados = regra.verificar(arquivo, this.ler(arquivo), this.raiz, this.base)
        .filter(achado => !this.dispensadoPorExcecao(regra, arquivo, achado));
      if (achados.length) porArquivo[arquivo] = achados;
    }
    return porArquivo;
  }

  dispensadoPorExcecao(regra, arquivo, achado) {
    this.acusadas.add(acusacao(regra.id, arquivo, achado.linha));
    const excecao = excecaoNaLinha(this.comentariosDe(arquivo).get(achado.linha) || '', this.hoje);
    return Boolean(excecao && excecao.regra === regra.id && excecao.valida);
  }

  errosDasExcecoes() {
    const erros = [];
    for (const arquivo of this.arquivos.filter(a => ARQUIVOS_COM_COMENTARIO.test(a))) {
      for (const [linha, texto] of this.comentariosDe(arquivo)) {
        const erro = this.erroDaExcecaoNaLinha(arquivo, linha, texto);
        if (erro) erros.push(`${arquivo}:${linha}: ${erro}`);
      }
    }
    return erros;
  }

  erroDaExcecaoNaLinha(arquivo, linha, texto) {
    const excecao = excecaoNaLinha(texto, this.hoje);
    if (!excecao || !regraDeId(excecao.regra).seAplica(arquivo)) return null;
    if (!excecao.valida) return excecao.erro;
    if (this.acusadas.has(acusacao(excecao.regra, arquivo, linha))) return null;
    return `exceção de ${excecao.regra} numa linha que a regra não acusa; tire-a`;
  }
}

function coletar(raiz, hoje, base = null) {
  const coleta = new Coleta(raiz, hoje, base);
  const porRegra = {};
  for (const regra of REGRAS) porRegra[regra.id] = coleta.achadosDaRegra(regra);
  return { porRegra, errosDeExcecao: coleta.errosDasExcecoes() };
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

const CABECALHO_DO_TRECHO = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;

function linhasDoTrecho(cabecalho) {
  const inicio = Number(cabecalho[1]);
  const quantas = cabecalho[2] === undefined ? 1 : Number(cabecalho[2]);
  return Array.from({ length: quantas }, (_, i) => inicio + i);
}

function diffDoArquivo(raiz, base, arquivo) {
  const diff = git(raiz, ['diff', '-U0', base, '--', arquivo]);
  if (diff === '' && git(raiz, ['cat-file', '-e', `${base}:${arquivo}`]) === null) return null;
  return diff;
}

function linhasNovas(raiz, base, arquivo) {
  if (!base) return null;
  const diff = diffDoArquivo(raiz, base, arquivo);
  if (diff === null) return null;
  return new Set([...diff.matchAll(CABECALHO_DO_TRECHO)].flatMap(linhasDoTrecho));
}

const COMMIT_VAZIO = /^0+$/;

function recusarBaseInexistente(pedida, doAmbiente) {
  if (pedida) throw new ErroDeUso(`--base ${pedida}: não é um commit deste repositório`);
  if (doAmbiente) {
    throw new Error(`REGRAS_BASE=${doAmbiente} não é um commit deste repositório; no CI, confira o fetch-depth `
      + 'e o REGRAS_BASE de .github/workflows/regras.yml');
  }
}

function baseDeComparacao(raiz, pedida) {
  const doAmbiente = process.env.REGRAS_BASE || null;
  const ref = pedida || doAmbiente || 'origin/main';
  if (COMMIT_VAZIO.test(ref)) return null;
  const teto = git(raiz, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  if (teto) return { ref, teto, desde: git(raiz, ['merge-base', 'HEAD', teto]) };
  recusarBaseInexistente(pedida, doAmbiente);
  return null;
}

const MOSTRADOS = 12;

function achadosEmDestaque(arquivo, achados, novas) {
  const linha = achado => `    ${arquivo}:${achado.linha}: ${achado.detalhe}`;
  const nasNovas = novas ? achados.filter(achado => novas.has(achado.linha)) : [];
  if (nasNovas.length) return nasNovas.slice(0, MOSTRADOS).map(linha);
  const escondidos = achados.length > MOSTRADOS ? [`    … e mais ${achados.length - MOSTRADOS}`] : [];
  return [...achados.slice(0, MOSTRADOS).map(linha), ...escondidos];
}

function relatorioDoExcesso(regra, { arquivo, tem, pode, achados }, novas) {
  return [
    `✗ ${regra.id} — ${arquivo}: ${tem} ocorrência(s); a linha de base permite ${pode}.`,
    ...achadosEmDestaque(arquivo, achados, novas),
    `  Conserto: ${regra.conserto}`,
  ].join('\n');
}

class Catraca {
  constructor({ raiz, base, atualizar, porRegra, agora, linhaDeBase, errosDeExcecao }) {
    Object.assign(this, { raiz, base, atualizar, porRegra, agora, linhaDeBase });
    this.erros = [...errosDeExcecao];
    this.avisos = [];
    this.podeBaixar = [];
    this.velhoDe = base ? renomeacoes(raiz, base.desde) : {};
  }

  conferir() {
    for (const regra of REGRAS) this.conferirRegra(regra);
    this.compararComABase();
  }

  conferirRegra(regra) {
    const permitido = this.linhaDeBase[regra.id] || {};
    const arquivos = new Set([...Object.keys(this.agora[regra.id]), ...Object.keys(permitido)]);
    for (const arquivo of [...arquivos].sort()) {
      this.conferirArquivo(regra, { arquivo, tem: this.agora[regra.id][arquivo] || 0, pode: this.naBaseDoArquivo(permitido, arquivo) || 0 });
    }
  }

  naBaseDoArquivo(porArquivo, arquivo) {
    if (arquivo in porArquivo) return porArquivo[arquivo];
    return porArquivo[this.velhoDe[arquivo]];
  }

  conferirArquivo(regra, contagem) {
    if (contagem.tem < contagem.pode) this.anotarFolga(regra, contagem);
    if (contagem.tem <= contagem.pode) return;
    this.erros.push(this.mensagemDoExcesso(regra, { ...contagem, achados: this.porRegra[regra.id][contagem.arquivo] }));
  }

  anotarFolga(regra, { arquivo, tem, pode }) {
    this.podeBaixar.push(`${regra.id} ${arquivo}: ${pode} → ${tem}`);
  }

  mensagemDoExcesso(regra, excesso) {
    if (regra.mensagem) return regra.mensagem(excesso);
    const desde = this.base && this.base.desde;
    return relatorioDoExcesso(regra, excesso, desde ? linhasNovas(this.raiz, desde, excesso.arquivo) : null);
  }

  compararComABase() {
    if (!this.base) {
      this.avisos.push('sem base de comparação (primeiro push, ou nem --base, nem REGRAS_BASE, nem origin/main): '
        + 'a linha de base não foi comparada');
      return;
    }
    const principal = this.lerNaBase(ARQUIVO_DA_LINHA_DE_BASE);
    if (principal === null) {
      this.avisos.push(`${this.base.ref} ainda não tem ${ARQUIVO_DA_LINHA_DE_BASE}: esta é a primeira linha de base, nada a comparar`);
      return;
    }
    const antes = { ...principal };
    for (const arquivo of ARQUIVOS_DA_LINHA_DE_BASE) Object.assign(antes, this.lerNaBase(arquivo) || {});
    for (const regra of REGRAS) this.compararRegraComABase(regra, antes);
  }

  lerNaBase(arquivo) {
    const texto = git(this.raiz, ['show', `${this.base.teto}:${arquivo}`]);
    return texto === null ? null : lerArquivoDaLinhaDeBase(texto, `${this.base.ref}:${arquivo}`);
  }

  compararRegraComABase(regra, antes) {
    const { ref } = this.base;
    if (!(regra.id in antes)) {
      this.avisos.push(`${ref} ainda não tem a regra ${regra.id}: esta é a primeira linha de base dela (${total(this.linhaDeBase[regra.id])})`);
      return;
    }
    if (regra.folgaPresaAoArquivo) this.compararArquivosComABase(regra, antes[regra.id] || {});
    if (total(this.linhaDeBase[regra.id]) > total(antes[regra.id])) {
      this.erros.push(`✗ ${arquivoDe(regra)}: ${regra.id} tem ${total(this.linhaDeBase[regra.id])}, mais que os `
        + `${total(antes[regra.id])} de ${ref}. A linha de base só desce: se ${ref} baixou depois que este ramo `
        + 'saiu dele, traga-o para cá (merge); um caso que precisa ficar leva uma exceção na própria linha '
        + '(`exceção <regra> até AAAA-MM-DD, aprovada por <pessoa>: <motivo>`).');
    }
  }

  compararArquivosComABase(regra, anteriores) {
    for (const [arquivo, n] of Object.entries(this.linhaDeBase[regra.id] || {}).sort()) {
      const erro = this.erroDoArquivoNaBase(regra, arquivo, n, this.naBaseDoArquivo(anteriores, arquivo));
      if (erro) this.erros.push(erro);
    }
  }

  erroDoArquivoNaBase(regra, arquivo, n, anterior) {
    const { ref } = this.base;
    if (anterior === undefined) {
      return `✗ ${arquivoDe(regra)}: ${regra.id} ${arquivo} não está na linha de base de ${ref}. A linha de base só desce: `
        + (regra.porQueOArquivoNovoNaoEntra || 'um arquivo que passa do teto agora tem de ser dividido, não entrar na lista.');
    }
    if (n > anterior) {
      return `✗ ${arquivoDe(regra)}: ${regra.id} ${arquivo} tem ${n} na linha de base do ramo, mais que os ${anterior} de ${ref}. `
        + 'A linha de base só desce, arquivo a arquivo: a folga de um não passa para outro.';
    }
    return null;
  }
}

function raizDoRepositorio(pedida) {
  const raiz = pedida ? path.resolve(pedida) : path.resolve(__dirname, '..', '..');
  if (git(raiz, ['rev-parse', '--show-toplevel']) === null) throw new Error(`${raiz} não é um repositório git`);
  return raiz;
}

function relatar({ erros, avisos, podeBaixar }, agora) {
  for (const aviso of avisos) console.log(`aviso: ${aviso}`);
  if (erros.length) {
    console.log(`${erros.join('\n\n')}\n\nerror: ${erros.length} problema(s) nas regras`
      + '\nhelp: conserte como cada "Conserto" diz; as regras e quem as confere: AGENTS.md § Rules and what enforces them');
    return 1;
  }
  const resumo = REGRAS.map(regra => `${regra.id} ${total(agora[regra.id])}`).join(', ');
  console.log(`regras ok (na linha de base: ${resumo})`);
  if (podeBaixar.length) {
    console.log(`a linha de base pode descer: ${podeBaixar.length} entrada(s); ela desce depois do merge, por node scripts/regras/baixar-no-merge.js, e a PR não a edita:\n  ${podeBaixar.join('\n  ')}`);
  }
  return 0;
}

function main(argv) {
  const opcoes = lerArgumentos(argv);
  if (opcoes.ajuda) {
    console.log(AJUDA);
    return 0;
  }
  const raiz = raizDoRepositorio(opcoes.raiz);
  const base = baseDeComparacao(raiz, opcoes.base);
  const hoje = new Date().toISOString().slice(0, 10);

  const { porRegra, errosDeExcecao } = coletar(raiz, hoje, base && base.teto);
  const agora = contagens(porRegra);
  if (opcoes.criar) return criarLinhaDeBase(raiz, REGRAS, agora);

  const linhaDeBase = lerLinhaDeBase(raiz, REGRAS);
  const catraca = new Catraca({ raiz, base, atualizar: opcoes.atualizar, porRegra, agora, linhaDeBase, errosDeExcecao });
  catraca.conferir();
  if (opcoes.atualizar) return atualizarLinhaDeBase(raiz, REGRAS, agora, catraca);
  return relatar(catraca, agora);
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

module.exports = { REGRAS, coletar, excecaoNaLinha, renomeacoes };

if (require.main === module) process.exitCode = rodar(process.argv.slice(2));
