'use strict';

const { spawn } = require('child_process');
const path = require('path');

function modulosDe(arquivos) {
  return arquivos.map(arquivo => path.basename(arquivo).replace(/\.py$/, '')).sort();
}

function ambienteDoModulo(env, pasta, raiz) {
  return { ...env, PYTHONPATH: [path.join(raiz, pasta), env.PYTHONPATH].filter(Boolean).join(path.delimiter) };
}

function rodarUm(python, modulo, cwd, env) {
  return new Promise(resolve => {
    const inicio = Date.now();
    const filho = spawn(python, ['-m', 'unittest', modulo], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = '';
    filho.stdout.on('data', pedaco => { saida += pedaco; });
    filho.stderr.on('data', pedaco => { saida += pedaco; });
    filho.on('error', error => resolve({ modulo, error, saida, segundos: 0 }));
    filho.on('close', status => resolve({ modulo, status, saida, segundos: (Date.now() - inicio) / 1000 }));
  });
}

function passou(resultado) {
  return resultado.status === 0 || (resultado.status === 5 && /NO TESTS RAN/.test(resultado.saida));
}

function testesDe(saida) {
  const achou = /^Ran (\d+) tests? in /m.exec(saida);
  return achou ? Number(achou[1]) : 0;
}

async function rodarEmParalelo({ python, pasta, arquivos, trabalhadores, cwd, env = process.env, escrever = pedaco => process.stdout.write(pedaco), escreverErro = pedaco => process.stderr.write(pedaco) }) {
  const fila = modulosDe(arquivos);
  const ambiente = ambienteDoModulo(env, pasta, cwd);
  const falhas = [];
  let erroDeProcesso = null;
  let stderr = '';
  let total = 0;
  const inicio = Date.now();

  async function trabalhador() {
    while (fila.length) {
      const resultado = await rodarUm(python, fila.shift(), cwd, ambiente);
      if (resultado.error) {
        erroDeProcesso = erroDeProcesso || resultado.error;
        fila.length = 0;
        return;
      }
      total += testesDe(resultado.saida);
      if (passou(resultado)) {
        escrever(`✓ ${resultado.modulo} (${resultado.segundos.toFixed(1)} s)\n`);
      } else {
        falhas.push(resultado.modulo);
        escrever(`✗ ${resultado.modulo} (${resultado.segundos.toFixed(1)} s)\n`);
        escreverErro(resultado.saida);
        stderr += resultado.saida;
      }
    }
  }

  await Promise.all(Array.from({ length: trabalhadores }, trabalhador));
  if (erroDeProcesso) return { error: erroDeProcesso, stderr };
  escrever(`\n${total} testes em ${((Date.now() - inicio) / 1000).toFixed(1)} s, ${trabalhadores} em paralelo; ${falhas.length ? `falharam: ${falhas.sort().join(', ')}` : 'ok'}\n`);
  return { status: falhas.length ? 1 : 0, stderr };
}

module.exports = { modulosDe, passou, rodarEmParalelo, testesDe };
