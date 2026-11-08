'use strict';

// Os textos de erro do gancho do tamanho dos arquivos (limite-de-tokens.js): o que fazer para dividir
// um arquivo grande e o que desfazer numa linha de base afrouxada. Só monta texto; não lê o git.

const path = require('path');

const tokensDe = (bytes, bytesPorToken = 4) => Math.ceil(bytes / bytesPorToken);

// --- A mensagem de erro ---

const PASSOS_COMUNS = [
  'Cada arquivo novo fica abaixo do limite (confira com `git show :<arquivo> | wc -c`).',
  'Atualize os imports e os links que apontavam para o arquivo antigo, rode os testes do que mexeu e dê `git add` no arquivo antigo e nos novos.',
];

const PASSOS_POR_TIPO = {
  teste: ['Divida por unidade ou cenário sob teste: um arquivo de teste por cenário (ou por função testada), com o mesmo prefixo no nome.',
    'Leve o que é repetido (montagem, fakes, dados de exemplo) para um arquivo de apoio ao lado e importe dele nos testes.',
    'Registre cada arquivo de teste novo onde os testes são listados (scripts/testes.json) para o CI continuar rodando todos.'],
  doc: ['Divida por seção de primeiro nível (`##`): um arquivo por seção, com o título da seção como nome.',
    'Deixe o arquivo antigo como índice: o título, um parágrafo e um link para cada arquivo novo.',
    'Procure no repositório os links para o arquivo e para as âncoras que mudaram de arquivo e corrija (`grep -rn "<nome-do-arquivo>" .`).'],
  html: ['Tire o CSS e o JavaScript embutidos para arquivos irmãos (`<nome>.css`, `<nome>.js`) e ligue com `<link>` e `<script src>`.',
    'Se o HTML ainda passar do limite, divida em uma página por seção e deixe uma página de índice com os links.',
    'Corrija os links que apontam para o arquivo antigo.'],
  dado: ['Divida por coleção: um arquivo por chave de primeiro nível (ou por grupo de registros), com o nome da chave no nome do arquivo.',
    'Leia o conjunto nos pontos que carregam o arquivo (junte os arquivos novos no código ou liste-os num índice).'],
  css: ['Divida por componente ou por tela: um arquivo CSS por responsabilidade, com o nome do componente.',
    'Mova as variáveis e os tokens compartilhados para o próprio arquivo e carregue os novos onde o antigo era carregado (`<link>`, `@import`, lista de arquivos do pacote).'],
  python: ['Divida por responsabilidade em módulos irmãos: um módulo por responsabilidade (entrada/saída, regras, modelos), com o nome dela.',
    'Mova tipos, constantes e dados de exemplo para o seu próprio módulo.',
    'Deixe no arquivo antigo só a montagem (reexportando o que outros módulos importam, se preciso) e corrija os `import` dos chamadores.'],
  codigo: ['Divida por responsabilidade em módulos irmãos: um módulo por responsabilidade, com o nome dela.',
    'Mova tipos, constantes e dados para o seu próprio arquivo.',
    'Deixe no arquivo antigo só a montagem e corrija os imports/`<script>`/`importScripts`/`manifest` que o carregam (arquivo novo precisa ser carregado onde o antigo era).'],
  outro: ['Divida por responsabilidade: um arquivo por responsabilidade, com o nome dela, ao lado do arquivo antigo.',
    'Mova constantes, tipos e dados de exemplo para o seu próprio arquivo.'],
};

function tipoDe(caminho) {
  const nome = path.posix.basename(caminho);
  const extensao = path.posix.extname(nome).toLowerCase();
  if (/^test_|_test\.|\.(test|spec)\./.test(nome) || /(^|\/)(tests?|__tests__)\//.test(caminho)) return 'teste';
  if (['.md', '.mdx', '.txt', '.rst'].includes(extensao)) return 'doc';
  if (['.html', '.htm'].includes(extensao)) return 'html';
  if (['.json', '.yaml', '.yml', '.csv', '.toml'].includes(extensao)) return 'dado';
  if (['.css', '.scss'].includes(extensao)) return 'css';
  if (extensao === '.py') return 'python';
  if (['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.sh'].includes(extensao)) return 'codigo';
  return 'outro';
}

function mensagemDeAfrouxamento(achado, baseDoHead, config) {
  const motivo = achado.permitido !== null
    ? `o permitido é ${achado.permitido} bytes (o da linha de base do último commit${baseDoHead ? '' : ', o tamanho dele'})`
    : baseDoHead
      ? 'ele não estava na linha de base do último commit'
      : 'ele não passava do limite no último commit';
  return `✗ ${achado.caminho}: linha de base afrouxada. Entrada preparada: ${achado.valor} bytes, mas ${motivo}. `
    + `A linha de base só desce. Desfaça: git restore --source=HEAD --staged --worktree -- ${config.linhaDeBase}; `
    + `e divida o arquivo em vez de afrouxar a base (arquivo gerado por ferramenta: acrescente o glob em "ignorar" de scripts/ganchos/limite-de-tokens.json).`;
}

function mensagemDeErro(achado, config) {
  const { caminho, tamanho, limite } = achado;
  const bytesPorToken = config.bytesPorToken || 4;
  const cabecalho = achado.estado === 'cresceu'
    ? `✗ ${caminho}: ${tamanho} bytes (~${tokensDe(tamanho, bytesPorToken)} tokens). Ele já passava do limite (${limite} bytes = ${tokensDe(limite, bytesPorToken)} tokens) e está na linha de base; o máximo para ele é ${achado.naBase} bytes (o menor entre a linha de base e o tamanho no último commit); cresceu ${tamanho - achado.naBase} bytes. Um arquivo da linha de base não pode crescer: ponha o que você acrescentou (ou parte do que já havia) em um arquivo novo ao lado.`
    : `✗ ${caminho}: ${tamanho} bytes (~${tokensDe(tamanho, bytesPorToken)} tokens), acima do limite de ${limite} bytes (${tokensDe(limite, bytesPorToken)} tokens).`;
  const passos = [...PASSOS_POR_TIPO[tipoDe(caminho)], ...PASSOS_COMUNS].map((p, i) => `    ${i + 1}. ${p}`);
  const fim = achado.estado === 'cresceu'
    ? [`  Depois de dividir ${caminho}, baixe a linha de base: node scripts/ganchos/limite-de-tokens.js --atualizar-linha-de-base && git add ${config.linhaDeBase}`]
    : [`  Não ponha ${caminho} na linha de base (${config.linhaDeBase}): arquivo novo precisa caber no limite.`,
      `  Se ele é gerado por uma ferramenta (ninguém o edita à mão), acrescente o glob dele em "ignorar" de scripts/ganchos/limite-de-tokens.json em vez de dividir.`];
  return [cabecalho, '  Como dividir:', ...passos, ...fim].join('\n');
}

module.exports = { mensagemDeAfrouxamento, mensagemDeErro, tokensDe };
