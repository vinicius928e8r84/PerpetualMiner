'use strict';

const { arquivoCriado, linhasNovas } = require('./apoio-linhas-novas');

const id = 'sem-segredo-novo';

const conserto = 'Tire o segredo do arquivo e leia-o do ambiente, do cofre da Conexão ou de uma pasta fora do repositório; num teste, use um valor '
  + 'que se denuncie como falso (`sk-proj-chave-de-teste-0000`) e que não tenha o tamanho de uma chave de verdade. Este repositório é público: '
  + 'se o segredo já foi para uma branch, considere-o vazado, revogue-o e troque a chave, porque apagar o commit depois não o recupera. '
  + 'Um caso que precisa ficar leva, na própria linha: `exceção sem-segredo-novo até AAAA-MM-DD, aprovada por <pessoa>: <motivo>`.';

const SEM_TEXTO = /\.(?:png|webp|woff2?|ico|jpe?g|gif|ankiaddon)$|(?:^|\/)package-lock\.json$/;

const seAplica = arquivo => !SEM_TEXTO.test(arquivo);

const ARQUIVO_DE_SEGREDO = new RegExp('(?:^|/)(?:\\.env(?:\\..+)?|\\.npmrc|\\.netrc|id_(?:rsa|ed25519|ecdsa)|credentials\\.json'
  + '|service-account[^/]*\\.json|secret_key\\.json|[^/]*_key\\.json|[^/]+\\.(?:pem|p12|pfx|keystore|jks|kdbx))$');
const MODELO_DE_ENV = /(?:^|\/)\.env\.(?:example|sample|exemplo)$/;

const PADROES = [
  ['chave privada', /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----/],
  ['chave de acesso da AWS', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['chave de API do Google', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['token do GitHub', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ['token do Slack', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['chave de API (sk-)', /\bsk-(?:ant-|proj-|svcacct-|admin-)?[A-Za-z0-9_-]{40,}/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ['token de bot do Telegram', /(?:\b|(?<=bot))\d{8,10}:[A-Za-z0-9_-]{35}\b/],
];

const URL_COM_SENHA = /[a-z][a-z0-9+.-]{1,20}:\/\/[^\s/:@'"]{1,100}:([^\s/@'"]{4,200})@([^\s/?#'"]{1,200})/gi;
const HOST_DE_EXEMPLO = /^(?:[\w-]+\.)*(?:exemplo|example)\.(?:com|net|org)(?::\d+)?$/i;
const SENHA_DE_EXEMPLO = /^(?:senha|password|passwd|pass|pwd|secret|segredo|x+|\*+|<[^>]*>|\{[^}]*\}|\$\{?\w*\}?|%\w*|\.\.\.)$/i;

const ATRIBUICAO = /(?:secret|passwd|password|senha|api[_-]?key|apikey|token|private[_-]?key|auth[_-]?key|access[_-]?key)[\w.-]{0,60}['"]?\s{0,5}[:=]\s{0,5}['"]([^'"\s]{16,512})/i;
const PLACEHOLDER = /x{4,}|\*{3,}|example|exemplo|sample|your|seu[_-]|changeme|placeholder|dummy|fake|falso|teste|test|mock|mentira|fict[ií]cio|0{4}|1234|abcd|<[^>]*>|\$\{|%\(|\{\{|process\.env|os\.environ|\.\.\./i;
const CLASSES = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/];

const TAMANHO_DA_JANELA = 2000;
const SOBRA_ENTRE_JANELAS = 200;

function parecePar(valor) {
  if (PLACEHOLDER.test(valor)) return false;
  if (/^[0-9a-f]{32,}$/i.test(valor)) return true;
  return CLASSES.filter(classe => classe.test(valor)).length >= 3 && new Set(valor).size >= 8;
}

function urlComSenhaReal(achado) {
  const [, senha, host] = achado;
  return !HOST_DE_EXEMPLO.test(host) && !SENHA_DE_EXEMPLO.test(senha);
}

function nomeNaJanela(texto) {
  const padrao = PADROES.find(([, regex]) => regex.test(texto));
  if (padrao) return padrao[0];
  if ([...texto.matchAll(URL_COM_SENHA)].some(urlComSenhaReal)) return 'URL com usuário e senha';
  const atribuicao = ATRIBUICAO.exec(texto);
  return atribuicao && parecePar(atribuicao[1]) ? 'valor literal em campo de segredo' : null;
}

function segredoNaLinha(texto) {
  const passo = TAMANHO_DA_JANELA - SOBRA_ENTRE_JANELAS;
  for (let inicio = 0; inicio < texto.length; inicio += passo) {
    const nome = nomeNaJanela(texto.slice(inicio, inicio + TAMANHO_DA_JANELA));
    if (nome) return nome;
  }
  return null;
}

function achadoDoNome(arquivo, raiz, base) {
  const proibido = ARQUIVO_DE_SEGREDO.test(arquivo) && !MODELO_DE_ENV.test(arquivo);
  if (!proibido || !arquivoCriado(arquivo, raiz, base)) return [];
  return [{ linha: 1, detalhe: 'arquivo de segredo, chave ou sessão não entra no repositório' }];
}

function achadosDasLinhas(fonte, novas) {
  const achados = [];
  fonte.split('\n').forEach((texto, indice) => {
    const nome = novas.has(indice + 1) ? segredoNaLinha(texto) : null;
    if (nome) achados.push({ linha: indice + 1, detalhe: `parece ${nome} (o valor não é mostrado)` });
  });
  return achados;
}

function verificar(arquivo, fonte, raiz, base) {
  return [...achadoDoNome(arquivo, raiz, base), ...achadosDasLinhas(fonte, linhasNovas(arquivo, raiz, base))];
}

module.exports = { id, conserto, seAplica, verificar, segredoNaLinha };
