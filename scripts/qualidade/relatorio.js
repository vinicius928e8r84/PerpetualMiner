'use strict';

const { NAS_DUAS } = require('./categorias');
const { ondeMaisDiscordam, somarContagens, somarVereditos } = require('./comparar');

const EXEMPLOS_POR_MOTIVO = 2;
const QUANTOS_NA_LISTA_DOS_QUE_DISCORDAM = 15;
const NOMES = { medidor: 'o medidor', qlty: 'o Qlty' };
const DIVERGEM = new Set(NAS_DUAS.map(categoria => categoria.id));

const celula = texto => String(texto).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const decimal = numero => numero.toFixed(2).replace('.', ',');

function exemplos(onde) {
  if (!onde.length) return '';
  const mais = onde.length > EXEMPLOS_POR_MOTIVO ? `, e mais ${onde.length - EXEMPLOS_POR_MOTIVO}` : '';
  return ` (${onde.slice(0, EXEMPLOS_POR_MOTIVO).join('; ')}${mais})`;
}

function quemNoMotivo({ categoria, quem }) {
  if (categoria === 'codescene') return '';
  return DIVERGEM.has(categoria) ? `, só ${NOMES[quem]} acusa` : `, só ${NOMES[quem]} mede`;
}

const textoDoMotivo = item => `**${item.nome}**${quemNoMotivo(item)}${exemplos(item.onde)}: ${item.porque}`;

function linhaDoArquivo(comparacao) {
  const nota = comparacao.nota === null ? '—' : decimal(comparacao.nota);
  const porque = comparacao.motivos.map(textoDoMotivo).join('<br>') || '—';
  return `| \`${comparacao.arquivo}\` | ${nota} | ${comparacao.pontos} | ${comparacao.achadosDoQlty} | ${comparacao.quemDiscorda} | ${celula(porque)} |`;
}

function tabelaDeArquivos(comparacoes) {
  return [
    '| Arquivo | CodeScene | Medidor (pontos) | Qlty (achados) | Quem discorda | Por quê |',
    '|---|---:|---:|---:|---|---|',
    ...comparacoes.map(linhaDoArquivo),
  ];
}

function secaoDeArquivos(titulo, comparacoes, seVazia) {
  return [`### ${titulo} (${comparacoes.length})`, '', ...(comparacoes.length ? tabelaDeArquivos(comparacoes) : [seVazia]), ''];
}

function secaoDoRepositorio(comparacoes) {
  const vereditos = somarVereditos(comparacoes);
  const contagens = somarContagens(comparacoes);
  const linhaDaMedida = categoria => {
    const contagem = contagens[categoria.id];
    const unidade = categoria.porFuncao ? 'funções' : 'arquivos';
    return `| ${categoria.nome} | ${unidade} | ${contagem.ambos} | ${contagem.soMedidor} | ${contagem.soQlty} | `
      + `${celula(`só o medidor: ${categoria.soMedidor}. Só o Qlty: ${categoria.soQlty}`)} |`;
  };
  return [
    `### No repositório todo (${comparacoes.length} arquivos)`,
    '',
    '| Quem acusa o arquivo | Arquivos |',
    '|---|---:|',
    `| os dois | ${vereditos.ambos} |`,
    `| só o medidor | ${vereditos.soMedidor} |`,
    `| só o Qlty | ${vereditos.soQlty} |`,
    `| nenhum | ${vereditos.nenhum} |`,
    '',
    '| Medida | Contada em | Os dois acusam | Só o medidor | Só o Qlty | Por que discordam |',
    '|---|---|---:|---:|---:|---|',
    ...NAS_DUAS.map(linhaDaMedida),
    '',
  ];
}

function cabecalho({ commit, versaoDoQlty, notas }) {
  return [
    '## Segunda opinião: Qlty × medidor local × CodeScene',
    '',
    `Informativa: não trava a PR. Commit \`${commit}\`. Qlty CLI ${versaoDoQlty} com os limiares de \`.qlty/qlty.toml\`; `
      + 'medidor da regra `saude-do-codigo` (`scripts/regras/analisador/`), em pontos acima dos limites; '
      + `CodeScene: ${notas.fonte} (commit \`${notas.commit}\`). "Quem discorda" compara cada ferramenta com a nota do CodeScene `
      + 'quando o arquivo tem nota; sem nota, compara o medidor com o Qlty.',
    '',
  ];
}

function relatorio({ commit, versaoDoQlty, notas, comparacoes, arquivosDaPr }) {
  const daPr = new Set(arquivosDaPr);
  return [
    ...cabecalho({ commit, versaoDoQlty, notas }),
    ...secaoDeArquivos('Os arquivos desta PR', comparacoes.filter(comparacao => daPr.has(comparacao.arquivo)),
      'A PR não muda nenhum arquivo `.js`, `.mjs`, `.cjs` ou `.py` que as ferramentas medem.'),
    ...secaoDeArquivos('Os arquivos com nota do CodeScene', comparacoes.filter(comparacao => comparacao.nota !== null),
      'Nenhum arquivo medido tem nota do CodeScene na lista.'),
    ...secaoDeArquivos('Onde o medidor e o Qlty mais discordam', ondeMaisDiscordam(comparacoes, QUANTOS_NA_LISTA_DOS_QUE_DISCORDAM),
      'O medidor e o Qlty não discordam em nenhum arquivo.'),
    ...secaoDoRepositorio(comparacoes),
  ].join('\n');
}

module.exports = { relatorio };
