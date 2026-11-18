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

const rotaParaAConexaoReal = conexao => async route => {
  const url = new URL(route.request().url());
  url.port = String(conexao.porta);
  try {
    const resposta = await route.fetch({ url: url.toString() });
    await route.fulfill({ response: resposta });
  } catch (erro) {
    if (!paginaFechada(erro)) throw erro;
  }
};

function cabecalhosDaProva(req, status, corpo) {
  const cabecalho = nome => req.headers()[nome];
  const navegador = Object.values(NAVEGADORES).find(n => n.cliente === cabecalho('x-perpetualminer-cliente'));
  const [sessao, nonce] = [cabecalho('x-perpetualminer-sessao'), cabecalho('x-perpetualminer-nonce')];
  if (!navegador || !sessao || !nonce) return {};
  return {
    'X-PerpetualMiner-Prova': provaDaResposta(navegador.segredo, { sessao, nonce, status, corpo: Buffer.from(corpo, 'utf8') }),
    'Access-Control-Expose-Headers': 'X-PerpetualMiner-Prova',
  };
}

const rotaComFalhasNaFrente = (conexao, anki) => {
  const adiante = rotaParaAConexaoReal(conexao);
  return async route => {
    const req = route.request();
    const url = new URL(req.url());
    const frente = anki.naFrente(req, url);
    if (frente.recusar) return route.abort('connectionrefused');
    if (frente.calar) return new Promise(() => {});
    if (!frente.roteiro) return adiante(route);
    const { status = 200, json = {} } = await frente.roteiro(req, url);
    const corpo = JSON.stringify(json);
    try {
      return await route.fulfill({ status, contentType: 'application/json', body: corpo, headers: cabecalhosDaProva(req, status, corpo) });
    } catch (erro) {
      if (!paginaFechada(erro)) throw erro;
      return undefined;
    }
  };
};

module.exports = { modoReal, subir, rotaComFalhasNaFrente };
