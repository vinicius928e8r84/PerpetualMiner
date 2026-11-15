'use strict';

// As tabelas de docs/arquivos/ são o índice de quem faz o quê (lidas sob demanda, não em toda sessão): um arquivo novo
// sem linha ali, ou uma linha que aponta para um arquivo que já não existe, deixa o agente seguinte
// sem mapa (as omissões do #183 e do #187). Esta regra acusa:
//   - um arquivo da raiz, de lib/, veio/ ou do topo de scripts/ que as tabelas não citam
//     (o caminho inteiro, ou só o nome quando o arquivo é da raiz da
//     pasta citada na linha: `popup.html/js/css` vale para os três);
//   - uma linha de tabela cuja primeira coluna cita um caminho que não existe;
//   - duas linhas da tabela com a mesma primeira coluna no mesmo arquivo: o `merge=union` do .gitattributes junta duas
//     inserções no mesmo ponto sem conflito, e se as duas descreviam o mesmo arquivo a duplicata passaria calada.
// Teste de arquivo (test_*), Markdown e arquivo oculto não precisam de linha.

const fs = require('fs');
const path = require('path');

const id = 'indice-de-arquivos';

const conserto = 'Acrescente uma linha (ou cite o arquivo numa linha que já o explica) numa tabela de '
  + '`docs/arquivos/*.md`, com o caminho entre crases; uma linha cujo arquivo foi removido ou renomeado sai ou segue o novo nome.';

const PASTA_DO_INDICE = 'docs/arquivos';
const ehDoIndice = arquivo => arquivo.startsWith(`${PASTA_DO_INDICE}/`) && /^[^/]+\.md$/.test(arquivo.slice(PASTA_DO_INDICE.length + 1));
const NO_ESCOPO = /^(?:[^/]+|(?:lib|veio|scripts)\/[^/]+)$/;

const noEscopo = arquivo => NO_ESCOPO.test(arquivo)
  && !arquivo.startsWith('.')
  && !/\.md$/.test(arquivo)
  && !/(^|\/)test_[^/]*$/.test(arquivo);

const seAplica = arquivo => ehDoIndice(arquivo) || noEscopo(arquivo);

/** `popup.html/js/css` vira popup.html, popup.js e popup.css; o resto fica como está. */
function expandir(item) {
  const m = /^(.*?[^/.]\.)([a-z0-9]+(?:\/[a-z0-9]+)+)$/i.exec(item);
  return m ? m[2].split('/').map(extensao => m[1] + extensao) : [item];
}

const itensDe = texto => [...texto.matchAll(/`([^`]+)`/g)]
  .flatMap(m => m[1].split(/[\s,]+/).filter(Boolean))
  .flatMap(expandir);

/** As linhas de tabela de um índice: { linha, primeiraColuna, texto }. */
function linhasDaTabela(fonte) {
  const saida = [];
  fonte.split('\n').forEach((texto, i) => {
    if (texto.startsWith('|')) saida.push({ linha: i + 1, primeiraColuna: texto.split('|')[1] || '', texto });
  });
  return saida;
}

function verificar(arquivo, fonte, raiz) {
  if (ehDoIndice(arquivo)) {
    const achados = [];
    const vistas = new Map();
    for (const { linha, primeiraColuna, texto } of linhasDaTabela(fonte)) {
      const chave = primeiraColuna.trim();
      if (!/^[\s:-]*$/.test(chave)) {
        if (vistas.has(chave)) achados.push({ linha, detalhe: `a linha repete a primeira coluna da linha ${vistas.get(chave)} (duplicata, talvez de um merge=union): deixe uma só` });
        else vistas.set(chave, linha);
      }
      for (const item of itensDe(primeiraColuna).filter(i => /\/|\.[a-z0-9]+$/i.test(i))) {
        if (!fs.existsSync(path.join(raiz, item))) {
          achados.push({ linha, detalhe: `a linha cita \`${item}\`, que não existe` });
        }
      }
    }
    return achados;
  }
  const pasta = path.join(raiz, PASTA_DO_INDICE);
  if (!fs.existsSync(pasta)) return [];
  const citados = new Set(fs.readdirSync(pasta).filter(nomeDoArquivo => ehDoIndice(`${PASTA_DO_INDICE}/${nomeDoArquivo}`))
    .flatMap(nomeDoArquivo => linhasDaTabela(fs.readFileSync(path.join(pasta, nomeDoArquivo), 'utf8')).flatMap(l => itensDe(l.texto))));
  const nome = path.posix.basename(arquivo);
  if (citados.has(arquivo) || citados.has(nome)) return [];
  return [{ linha: 1, detalhe: `${arquivo} não está em nenhuma tabela de ${PASTA_DO_INDICE}/` }];
}

module.exports = { id, conserto, seAplica, verificar };
