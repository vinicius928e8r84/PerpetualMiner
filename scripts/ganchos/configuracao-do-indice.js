'use strict';

// A configuração do gancho de tamanho (limite-de-tokens.json) vale pelo índice, o que será commitado,
// nunca pela cópia de trabalho; e só aperta em relação ao HEAD, como a linha de base: subir o limite,
// ou acrescentar glob em `ignorar` ou marca em `marcasDeGerado`, afrouxaria o limite para todos sem
// aparecer como violação, então barra o commit.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { ErroDeEntrada, lerConfiguracaoDoTexto } = require('./entrada-do-gancho.js');

const ARQUIVO_DA_CONFIGURACAO = path.join(__dirname, 'limite-de-tokens.json');
const CAMINHO_NO_REPOSITORIO = 'scripts/ganchos/limite-de-tokens.json';

/** A cópia da configuração ao lado do gancho; ilegível ou inválida lança ErroDeEntrada (barra o commit). */
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

/** A configuração de uma versão do git (`:caminho` = índice, `HEAD:caminho`); `null` se o arquivo não existe nela; inválida lança ErroDeEntrada. */
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

/** O que a configuração preparada afrouxa em relação à do HEAD (lista de textos, vazia se nada). */
function afrouxamentosDaConfiguracao(preparada, doHead) {
  const achados = [];
  for (const campo of ['limiteDeBytes', 'linhasDoCabecalho']) {
    if (preparada[campo] > doHead[campo]) achados.push(`"${campo}" subiu de ${doHead[campo]} para ${preparada[campo]}`);
  }
  if (preparada.linhaDeBase !== doHead.linhaDeBase) achados.push(`"linhaDeBase" mudou de ${doHead.linhaDeBase} para ${preparada.linhaDeBase}`);
  const globsDoHead = globsDe(doHead);
  for (const glob of globsDe(preparada)) {
    if (!globsDoHead.includes(glob)) achados.push(`"ignorar" ganhou o glob ${JSON.stringify(glob)}`);
  }
  for (const marca of marcasDe(preparada)) {
    if (!marcasDe(doHead).includes(marca)) achados.push(`"marcasDeGerado" ganhou ${JSON.stringify(marca)}`);
  }
  return achados;
}

/**
 * A configuração a valer: a do índice (a cópia do gancho, `padrao`, se o repositório não tem o arquivo) e o
 * que ela afrouxa em relação ao HEAD. Sem a do HEAD (a primeira) não há o que comparar.
 * Um JSON quebrado no índice não pode desligar o gancho: vira problema, e vale `padrao`.
 */
function carregarConfiguracao(raiz, padrao) {
  let doIndice;
  try {
    doIndice = lerConfiguracaoDaVersao(raiz, '');
  } catch (erro) {
    if (!(erro instanceof ErroDeEntrada)) throw erro;
    return { config: padrao, problemas: [`o arquivo preparado: ${erro.detalhe}`] };
  }
  if (!doIndice) return { config: padrao, problemas: [] };
  let doHead = null;
  try {
    doHead = lerConfiguracaoDaVersao(raiz, 'HEAD');
  } catch {
    // um HEAD quebrado não tem o que comparar: vale a do índice
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
