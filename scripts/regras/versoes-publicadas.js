'use strict';

// `complemento/versoes.json` guarda o hash das fontes do pacote por `VERSAO` (complemento/test_pacote.py). O
// teste só compara o hash da VERSAO de hoje com o de hoje: reescrever o hash da 0.2.0 em vez de subir a versão
// também passa nele, e a Conexão que o dono já instalou como 0.2.0 deixa de ser a que o arquivo diz. Esta
// regra compara com a base (a ponta da branch-alvo): uma versão que a base já registra não muda de hash nem
// some; só entra versão nova.

const { execFileSync } = require('child_process');

const id = 'versoes-publicadas';

const ARQUIVO = 'complemento/versoes.json';

const conserto = 'Volte o hash da versão publicada como está na base; mudou o código do complemento, suba a `VERSAO` em '
  + `complemento/configuracao.py e registre o hash novo numa chave nova em ${ARQUIVO}.`;

const seAplica = arquivo => arquivo === ARQUIVO;

function daBase(raiz, base) {
  try {
    const texto = execFileSync('git', ['show', `${base}:${ARQUIVO}`], { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(texto);
  } catch {
    return null; // a base ainda não tem o arquivo (ou ele não é JSON): não há o que comparar
  }
}

const linhaDaChave = (fonte, chave) => {
  const indice = fonte.indexOf(`${JSON.stringify(chave)}:`);
  return indice < 0 ? 1 : fonte.slice(0, indice).split('\n').length;
};

function verificar(arquivo, fonte, raiz, base) {
  if (!base) return [];
  const publicadas = daBase(raiz, base);
  if (!publicadas) return [];
  let hoje;
  try {
    hoje = JSON.parse(fonte);
  } catch {
    return [{ linha: 1, detalhe: `${ARQUIVO} não é um JSON válido` }];
  }
  const achados = [];
  for (const [versao, hash] of Object.entries(publicadas)) {
    if (!(versao in hoje)) {
      achados.push({ linha: 1, detalhe: `a versão ${versao} já estava registrada na base e sumiu do arquivo` });
    } else if (hoje[versao] !== hash) {
      achados.push({ linha: linhaDaChave(fonte, versao), detalhe: `o hash da versão ${versao}, já registrado na base, foi reescrito` });
    }
  }
  return achados;
}

module.exports = { id, conserto, seAplica, verificar };
