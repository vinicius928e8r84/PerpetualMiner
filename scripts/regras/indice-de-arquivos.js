'use strict';

// A tabela "Files" do CLAUDE.md é o índice de quem faz o quê: um arquivo novo sem linha
// ali, ou uma linha que aponta para um arquivo que já não existe, deixa o agente seguinte
// sem mapa (as omissões do #183 e do #187). Esta regra acusa:
//   - um arquivo da raiz, de lib/, veio/ ou do topo de scripts/ que a seção
//     "Files" não cita (o caminho inteiro, ou só o nome quando o arquivo é da raiz da
//     pasta citada na linha: `popup.html/js/css` vale para os três);
//   - uma linha da tabela cuja primeira coluna cita um caminho que não existe.
// Teste de arquivo (test_*), Markdown e arquivo oculto não precisam de linha.

const fs = require('fs');
const path = require('path');

const id = 'indice-de-arquivos';

const conserto = 'Acrescente uma linha (ou cite o arquivo numa linha que já o explica) na tabela `### Files` de '
  + 'CLAUDE.md, com o caminho entre crases; uma linha cujo arquivo foi removido ou renomeado sai ou segue o novo nome.';

const ARQUIVO_DO_INDICE = 'CLAUDE.md';
const NO_ESCOPO = /^(?:[^/]+|(?:lib|veio|scripts)\/[^/]+)$/;

const noEscopo = arquivo => NO_ESCOPO.test(arquivo)
  && !arquivo.startsWith('.')
  && !/\.md$/.test(arquivo)
  && !/(^|\/)test_[^/]*$/.test(arquivo);

const seAplica = arquivo => arquivo === ARQUIVO_DO_INDICE || noEscopo(arquivo);

/** `popup.html/js/css` vira popup.html, popup.js e popup.css; o resto fica como está. */
function expandir(item) {
  const m = /^(.*?[^/.]\.)([a-z0-9]+(?:\/[a-z0-9]+)+)$/i.exec(item);
  return m ? m[2].split('/').map(extensao => m[1] + extensao) : [item];
}

const itensDe = texto => [...texto.matchAll(/`([^`]+)`/g)]
  .flatMap(m => m[1].split(/[\s,]+/).filter(Boolean))
  .flatMap(expandir);

/** As linhas da seção "Files": { linha, primeiraColuna, texto }. */
function secaoFiles(fonte) {
  const linhas = fonte.split('\n');
  const inicio = linhas.findIndex(l => /^###\s+Files\s*$/.test(l));
  if (inicio < 0) return [];
  const saida = [];
  for (let i = inicio + 1; i < linhas.length && !/^#{1,3}\s/.test(linhas[i]); i++) {
    if (!linhas[i].startsWith('|')) continue;
    saida.push({ linha: i + 1, primeiraColuna: linhas[i].split('|')[1] || '', texto: linhas[i] });
  }
  return saida;
}

function verificar(arquivo, fonte, raiz) {
  if (arquivo === ARQUIVO_DO_INDICE) {
    const achados = [];
    for (const { linha, primeiraColuna } of secaoFiles(fonte)) {
      for (const item of itensDe(primeiraColuna).filter(i => /\/|\.[a-z0-9]+$/i.test(i))) {
        if (!fs.existsSync(path.join(raiz, item))) {
          achados.push({ linha, detalhe: `a linha cita \`${item}\`, que não existe` });
        }
      }
    }
    return achados;
  }
  const indice = path.join(raiz, ARQUIVO_DO_INDICE);
  if (!fs.existsSync(indice)) return [];
  const citados = new Set(secaoFiles(fs.readFileSync(indice, 'utf8')).flatMap(l => itensDe(l.texto)));
  const nome = path.posix.basename(arquivo);
  if (citados.has(arquivo) || citados.has(nome)) return [];
  return [{ linha: 1, detalhe: `${arquivo} não está na tabela "Files" de ${ARQUIVO_DO_INDICE}` }];
}

module.exports = { id, conserto, seAplica, verificar };
