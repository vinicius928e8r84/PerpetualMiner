'use strict';

// O programa do abridor de mentira (e2e/fakes/abridor.js), que o Chromium roda como host de Native
// Messaging: `node abridor-host.js <pasta do fake> <origem>`. Lê uma mensagem (4 bytes de tamanho +
// JSON), anota-a em `<pasta>/pedidos.jsonl` e responde pelo exemplo do contrato da situação do fake
// (`<pasta>/situacao.json`). Sem exemplo para a mensagem, sai sem responder, como um host quebrado:
// o fake nunca inventa uma resposta.

const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('util');

const [pasta, origem] = process.argv.slice(2);
let entrada = Buffer.alloc(0);

function responder(resposta) {
  const corpo = Buffer.from(JSON.stringify(resposta));
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32LE(corpo.length);
  process.stdout.write(Buffer.concat([tamanho, corpo]), () => process.exit(0));
}

function aoReceber(mensagem) {
  fs.appendFileSync(path.join(pasta, 'pedidos.jsonl'), `${JSON.stringify({ mensagem, origem })}\n`);
  const { situacao, exemplos } = JSON.parse(fs.readFileSync(path.join(pasta, 'situacao.json'), 'utf8'));
  if (situacao === 'sem_resposta') return; // fica quieto até o Chrome fechar a entrada
  const exemplo = exemplos.find(e => isDeepStrictEqual(e.mensagem, mensagem));
  if (!exemplo) process.exit(1);
  responder(exemplo.resposta);
}

process.stdin.on('data', dados => {
  entrada = Buffer.concat([entrada, dados]);
  if (entrada.length < 4) return;
  const tamanho = entrada.readUInt32LE(0);
  if (entrada.length < 4 + tamanho) return;
  const mensagem = JSON.parse(entrada.subarray(4, 4 + tamanho).toString('utf8'));
  entrada = Buffer.alloc(0);
  aoReceber(mensagem);
});
// Sem o Chrome do outro lado, o host sai: nunca fica um processo sobrando depois do teste.
process.stdin.on('end', () => process.exit(0));
