'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { medirJs } = require('./medir-js');

const MEDIDOR_DO_PYTHON = path.join(__dirname, 'medir_py.py');
const ehPython = arquivo => arquivo.endsWith('.py');

function rodarOPython(fontes) {
  const python = process.env.PYTHON || 'python3';
  const resultado = spawnSync(python, ['-I', MEDIDOR_DO_PYTHON], {
    input: JSON.stringify(fontes), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  });
  if (resultado.error) {
    throw new Error(`a regra saude-do-codigo lê o Python com \`${python}\`, que não rodou (${resultado.error.message}); instale o Python 3 ou aponte PYTHON=`);
  }
  if (resultado.status !== 0) throw new Error(`o medidor de Python falhou (${MEDIDOR_DO_PYTHON}):\n${resultado.stderr}`);
  return JSON.parse(resultado.stdout);
}

class MedidorDoRepositorio {
  constructor(raiz, arquivosDoPython) {
    this.raiz = raiz;
    this.arquivosDoPython = arquivosDoPython;
    this.doPython = null;
  }

  medirPythonDoDisco() {
    const fontes = {};
    for (const arquivo of this.arquivosDoPython) fontes[arquivo] = fs.readFileSync(path.join(this.raiz, arquivo), 'utf8');
    const medidas = rodarOPython(fontes);
    this.doPython = new Map(Object.entries(medidas).map(([arquivo, medida]) => [arquivo, { fonte: fontes[arquivo], medida }]));
  }

  medirPython(arquivo, fonte) {
    if (!this.doPython) this.medirPythonDoDisco();
    const guardada = this.doPython.get(arquivo);
    if (guardada && guardada.fonte === fonte) return guardada.medida;
    return rodarOPython({ [arquivo]: fonte })[arquivo];
  }

  medir(arquivo, fonte) {
    return ehPython(arquivo) ? this.medirPython(arquivo, fonte) : medirJs(fonte);
  }
}

module.exports = { MedidorDoRepositorio, rodarOPython, ehPython };
