'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { ErroDeEntrada, lerConfiguracaoDoTexto } = require('./entrada-do-gancho.js');

const ARQUIVO_DA_CONFIGURACAO = path.join(__dirname, 'limite-de-tokens.json');
const CAMINHO_NO_REPOSITORIO = 'scripts/ganchos/limite-de-tokens.json';

function lerConfiguracao(arquivo = ARQUIVO_DA_CONFIGURACAO) {
  const onde = `scripts/ganchos/${path.basename(arquivo)}`;
  let texto;
  try {
    texto = fs.readFileSync(arquivo, 'utf8');
  } catch (erro) {
    throw new ErroDeEntrada(onde, `não foi possível ler o arquivo (${erro.code || erro.message})`);
  }
  return lerConfiguracaoDoTexto(texto, onde);
}

function lerConfiguracaoDaVersao(raiz, versao) {
  let texto;
  try {
    texto = execFileSync('git', ['cat-file', 'blob', `${versao}:${CAMINHO_NO_REPOSITORIO}`], { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
  return lerConfiguracaoDoTexto(texto, `${CAMINHO_NO_REPOSITORIO} (${versao === '' ? 'no índice' : `em ${versao}`})`);
}

const globsDe = config => (Array.isArray(config.ignorar) ? config.ignorar : []).map(regra => regra.glob);
const marcasDe = config => (Array.isArray(config.marcasDeGerado) ? config.marcasDeGerado : []);

const CAMPOS_QUE_SO_DESCEM = ['limiteDeBytes', 'linhasDoCabecalho'];

function camposQueSubiram(preparada, doHead) {
  return CAMPOS_QUE_SO_DESCEM.filter(campo => preparada[campo] > doHead[campo])
    .map(campo => `"${campo}" subiu de ${doHead[campo]} para ${preparada[campo]}`);
}

function linhaDeBaseTrocada(preparada, doHead) {
  if (preparada.linhaDeBase === doHead.linhaDeBase) return [];
  return [`"linhaDeBase" mudou de ${doHead.linhaDeBase} para ${preparada.linhaDeBase}`];
}

function entradasNovas(daPreparada, doHead) {
  return daPreparada.filter(entrada => !doHead.includes(entrada));
}

function afrouxamentosDaConfiguracao(preparada, doHead) {
  return [
    ...camposQueSubiram(preparada, doHead),
    ...linhaDeBaseTrocada(preparada, doHead),
    ...entradasNovas(globsDe(preparada), globsDe(doHead)).map(glob => `"ignorar" ganhou o glob ${JSON.stringify(glob)}`),
    ...entradasNovas(marcasDe(preparada), marcasDe(doHead)).map(marca => `"marcasDeGerado" ganhou ${JSON.stringify(marca)}`),
  ];
}

function carregarConfiguracao(raiz, padrao, nova = '', velha = 'HEAD') {
  let doIndice;
  try {
    doIndice = lerConfiguracaoDaVersao(raiz, nova);
  } catch (erro) {
    if (!(erro instanceof ErroDeEntrada)) throw erro;
    return { config: padrao, problemas: [`o arquivo preparado: ${erro.detalhe}`] };
  }
  if (!doIndice) return { config: padrao, problemas: [] };
  let doHead = null;
  try {
    doHead = lerConfiguracaoDaVersao(raiz, velha);
  } catch {
  }
  return { config: doIndice, problemas: doHead ? afrouxamentosDaConfiguracao(doIndice, doHead) : [] };
}

function mensagemDeConfiguracao(problemas) {
  return `✗ ${CAMINHO_NO_REPOSITORIO}: configuração afrouxada. ${problemas.join('; ')}. `
    + 'A configuração só aperta (o limite não sobe; "ignorar" e "marcasDeGerado" não ganham entrada) e é lida do índice. '
    + `Desfaça: git restore --source=HEAD --staged --worktree -- ${CAMINHO_NO_REPOSITORIO}; `
    + 'e divida o arquivo em vez de afrouxar o limite. Afrouxar a configuração é decisão do dono, em PR próprio e revisado.';
}

module.exports = { afrouxamentosDaConfiguracao, carregarConfiguracao, lerConfiguracao, mensagemDeConfiguracao };
