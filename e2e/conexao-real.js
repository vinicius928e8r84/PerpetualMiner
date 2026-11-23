'use strict';

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const { NAVEGADORES, provaDaResposta } = require('./pareamento-de-teste');

const SERVIDOR = path.join(__dirname, 'conexao-real', 'servir.py');

const modoReal = () => process.env.PM_CONEXAO === 'real';

async function subir() {
  const filho = spawn(process.env.PYTHON || 'python3', ['-I', SERVIDOR], { stdio: ['pipe', 'pipe', 'inherit'] });
  const linhas = readline.createInterface({ input: filho.stdout });
  const fila = [];
  const esperando = [];
  linhas.on('line', linha => (esperando.length ? esperando.shift().resolve(JSON.parse(linha)) : fila.push(JSON.parse(linha))));
  filho.on('exit', codigo => { while (esperando.length) esperando.shift().reject(new Error(`a Conexão real saiu (código ${codigo})`)); });
  const proxima = () => new Promise((resolve, reject) => (fila.length ? resolve(fila.shift()) : esperando.push({ resolve, reject })));

  const { porta } = await proxima();
  return {
    porta,
    enviar: async comando => { filho.stdin.write(`${JSON.stringify(comando)}\n`); return proxima(); },
    fechar: async () => {
      filho.stdin.end();
      await new Promise(resolve => (filho.exitCode !== null ? resolve() : filho.once('exit', resolve)));
    },
  };
}

const paginaFechada = erro => /closed|disposed|aborted/i.test(erro.message);

const rotaParaAConexaoReal = (conexao, { depois = async () => {}, perder = false } = {}) => async route => {
  const url = new URL(route.request().url());
  url.port = String(conexao.porta);
  try {
    const resposta = await route.fetch({ url: url.toString() });
    await depois();
    await (perder ? route.abort('connectionreset') : route.fulfill({ response: resposta }));
  } catch (erro) {
    if (!paginaFechada(erro)) throw erro;
  }
};

const navegadorDoCliente = cliente => Object.values(NAVEGADORES).find(navegador => navegador.cliente === cliente);

function cabecalhosDaProva(req, status, corpo) {
  const cabecalho = nome => req.headers()[nome];
  const navegador = navegadorDoCliente(cabecalho('x-perpetualminer-cliente'));
  const [sessao, nonce] = [cabecalho('x-perpetualminer-sessao'), cabecalho('x-perpetualminer-nonce')];
  if (![navegador, sessao, nonce].every(Boolean)) return {};
  return {
    'X-PerpetualMiner-Prova': provaDaResposta(navegador.segredo, { sessao, nonce, status, corpo: Buffer.from(corpo, 'utf8') }),
    'Access-Control-Expose-Headers': 'X-PerpetualMiner-Prova',
  };
}

const espelharOsEnvios = (conexao, anki) => async () => anki.espelharEnvios((await conexao.enviar({ envios: true })).envios);
const espelharOsPerfis = (conexao, anki) => async () => anki.espelharPerfis((await conexao.enviar({ perfis: true })).perfis);
const espelharAChave = (conexao, anki) => async () => anki.espelharChave((await conexao.enviar({ estado: true })).cofre);
const espelharOLogin = (conexao, anki) => async () => anki.chatgpt.espelhar((await conexao.enviar({ login: true })).login);

const ESPELHOS_POR_CAMINHO = [
  { prefixo: '/anki/profile', espelhar: espelharOsPerfis },
  { prefixo: '/ia/openai/', espelhar: espelharAChave },
  { prefixo: '/ia/chatgpt/', espelhar: espelharOLogin },
  { prefixo: '/jobs', espelhar: espelharOsEnvios, perdeAResposta: true },
];

async function aplicarOMundoEAFila(conexao, { mundo, fila = [] }) {
  if (mundo) await conexao.enviar({ mundo });
  for (const comando of fila) {
    const { erro } = await conexao.enviar(comando);
    if (erro) throw new Error(`A fila da Conexão real recusou o que o fake fez com o Envio: ${erro}`);
  }
}

async function responderComORoteiro(route, req, url, roteiro) {
  const { status = 200, json = {} } = await roteiro(req, url);
  const corpo = JSON.stringify(json);
  try {
    return await route.fulfill({ status, contentType: 'application/json', body: corpo, headers: cabecalhosDaProva(req, status, corpo) });
  } catch (erro) {
    if (!paginaFechada(erro)) throw erro;
    return undefined;
  }
}

function rotaParaAConexaoRealQueEspelha(conexao, anki, { url, frente }) {
  const espelho = ESPELHOS_POR_CAMINHO.find(({ prefixo }) => url.pathname.startsWith(prefixo));
  if (!espelho) return rotaParaAConexaoReal(conexao);
  return rotaParaAConexaoReal(conexao, { depois: espelho.espelhar(conexao, anki), perder: Boolean(espelho.perdeAResposta && frente.perder) });
}

const rotaComFalhasNaFrente = (conexao, anki) => {
  let mundoAplicado = Promise.resolve();
  return async route => {
    const req = route.request();
    const url = new URL(req.url());
    const frente = anki.naFrente(req, url);
    if (frente.recusar) return route.abort('connectionrefused');
    if (frente.calar) return new Promise(() => {});
    if (frente.mundo || frente.fila) mundoAplicado = mundoAplicado.then(() => aplicarOMundoEAFila(conexao, frente));
    await mundoAplicado;
    if (frente.perder) anki.perdeuAResposta();
    if (frente.roteiro) return responderComORoteiro(route, req, url, frente.roteiro);
    return rotaParaAConexaoRealQueEspelha(conexao, anki, { url, frente })(route);
  };
};

module.exports = { modoReal, subir, rotaComFalhasNaFrente };
