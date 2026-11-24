'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const AST_DO_PYTHON = path.join(__dirname, 'analisador', 'docstrings_py.py');

const interpretador = () => process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

function inicioDasLinhas(fonte) {
  const inicios = [0];
  for (let i = 0; i < fonte.length; i++) if (fonte[i] === '\n') inicios.push(i + 1);
  return inicios;
}

function deslocamento(fonte, inicios, linha, colunaEmBytes) {
  const comeco = inicios[linha - 1];
  const fim = inicios[linha] === undefined ? fonte.length : inicios[linha];
  const texto = fonte.slice(comeco, fim);
  return comeco + Buffer.from(texto, 'utf8').subarray(0, colunaEmBytes).toString('utf8').length;
}

function lerDoPython(fonte) {
  const r = spawnSync(interpretador(), ['-I', '-X', 'utf8', AST_DO_PYTHON], { input: Buffer.from(fonte, 'utf8'), maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`o leitor de docstrings do Python falhou: ${String(r.stderr).trim()}`);
  return JSON.parse(r.stdout.toString('ascii'));
}

function trechosDeDocstring(arquivo, fonte) {
  if (!arquivo.endsWith('.py')) return [];
  if (!/^\s*[rRbBuU]{0,2}["']/m.test(fonte)) return [];
  const lido = lerDoPython(fonte);
  if (lido.erro) return [];
  const inicios = inicioDasLinhas(fonte);
  return lido.docstrings.map(([de, colDe, ate, colAte, sozinha]) => [deslocamento(fonte, inicios, de, colDe), deslocamento(fonte, inicios, ate, colAte), sozinha]);
}

module.exports = { trechosDeDocstring };
