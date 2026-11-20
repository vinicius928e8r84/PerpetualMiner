'use strict';

const { spawn } = require('child_process');

function rodarGuardandoASaida({ comando, argumentos, cwd, env }) {
  return new Promise(resolve => {
    const filho = spawn(comando, argumentos, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = '';
    const guardar = pedaco => { saida += pedaco; };
    filho.stdout.on('data', guardar);
    filho.stderr.on('data', guardar);
    filho.on('error', error => resolve({ error, saida }));
    filho.on('close', status => resolve({ status, saida }));
  });
}

async function rodarArquivosEmParalelo({ nome, comandos, trabalhadores, escrever = pedaco => process.stdout.write(pedaco) }) {
  const fila = [...comandos];
  const vermelhos = [];
  const trabalhador = async () => {
    while (fila.length) {
      const comando = fila.shift();
      const resultado = await rodarGuardandoASaida(comando);
      escrever(`\n▶ ${nome}: ${[comando.comando, ...comando.argumentos].join(' ')}\n${resultado.saida}`);
      if (resultado.error) escrever(`✗ ${nome}: não consegui rodar ${comando.comando} (${resultado.error.message})\n`);
      if (resultado.error || resultado.status !== 0) vermelhos.push(comando.argumentos.join(' '));
    }
  };
  await Promise.all(Array.from({ length: trabalhadores }, trabalhador));
  escrever(`\n${nome}: ${comandos.length} arquivos, ${trabalhadores} em paralelo; ${vermelhos.length ? `falharam: ${vermelhos.sort().join(', ')}` : 'ok'}\n`);
  return vermelhos;
}

module.exports = { rodarArquivosEmParalelo };
