'use strict';

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

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

const rotaParaAConexaoReal = conexao => async route => {
  const url = new URL(route.request().url());
  url.port = String(conexao.porta);
  try {
    const resposta = await route.fetch({ url: url.toString() });
    await route.fulfill({ response: resposta });
  } catch (erro) {
    if (!/closed|disposed|aborted/i.test(erro.message)) throw erro;
  }
};

module.exports = { modoReal, subir, rotaParaAConexaoReal };
