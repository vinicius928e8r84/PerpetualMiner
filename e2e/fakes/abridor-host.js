'use strict';

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
  const { situacao, exemplos, atrasoMs } = JSON.parse(fs.readFileSync(path.join(pasta, 'situacao.json'), 'utf8'));
  if (situacao === 'sem_resposta') return;
  const exemplo = exemplos.find(e => isDeepStrictEqual(e.mensagem, mensagem));
  if (!exemplo) process.exit(1);
  if (mensagem.acao === 'consertar' && atrasoMs) setTimeout(() => responder(exemplo.resposta), atrasoMs);
  else responder(exemplo.resposta);
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
process.stdin.on('end', () => process.exit(0));
