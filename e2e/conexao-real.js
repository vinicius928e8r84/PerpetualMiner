'use strict';

// O modo `PM_CONEXAO=real` do e2e: no lugar do fake de JavaScript (fakes/anki.js), a 8766 da extensão vai para a
// Conexão de verdade, o complemento do repositório (`complemento/servidor.py`), subido por conexao-real/servir.py numa
// porta livre, com a coleção em memória e a OpenAI e o Firestore de mentira dos testes do complemento. Serve para
// pegar o que um fake de JavaScript esconde (o fake que dizia 200 onde o servidor diz 409). Sem a variável, `subir`
// devolve null e nenhum Python roda.

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

const SERVIDOR = path.join(__dirname, 'conexao-real', 'servir.py');

const modoReal = () => process.env.PM_CONEXAO === 'real';

/** Sobe o servidor Python e devolve { porta, enviar(comando), fechar() }. */
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
    /** Um comando de conexao-real/servir.py (`{ openai }`, `{ colecao }`, `{ estado: true }`) e a resposta dele. */
    enviar: async comando => { filho.stdin.write(`${JSON.stringify(comando)}\n`); return proxima(); },
    fechar: async () => {
      filho.stdin.end();
      await new Promise(resolve => (filho.exitCode !== null ? resolve() : filho.once('exit', resolve)));
    },
  };
}

/** A rota que manda a 8766 da extensão para a Conexão real, com o `Origin` que o Chromium pôs. */
const rotaParaAConexaoReal = conexao => async route => {
  const url = new URL(route.request().url());
  url.port = String(conexao.porta);
  // Um pedido ainda em voo quando o teste acaba (a saúde de 15 s) perde a página: não é erro da Conexão.
  try {
    const resposta = await route.fetch({ url: url.toString() });
    await route.fulfill({ response: resposta });
  } catch (erro) {
    if (!/closed|disposed|aborted/i.test(erro.message)) throw erro;
  }
};

module.exports = { modoReal, subir, rotaParaAConexaoReal };
