'use strict';

const { execFileSync } = require('child_process');

const PASTAS_SENSIVEIS = ['.github/', 'scripts/regras/', 'scripts/ci/', 'scripts/ganchos/', '.claude/', '.agents/'];
const ARQUIVOS_SENSIVEIS = ['AGENTS.md', 'CLAUDE.md'];

const ehSensivel = caminho => PASTAS_SENSIVEIS.some(pasta => caminho.startsWith(pasta))
  || ARQUIVOS_SENSIVEIS.some(arquivo => caminho === arquivo || caminho.endsWith(`/${arquivo}`));

const caminhosSensiveisDe = caminhos => [...new Set(caminhos.filter(ehSensivel))].sort();

function caminhosDaPrNoGit({ raiz, base, head = 'HEAD' }) {
  const saida = execFileSync('git', ['-c', 'core.quotepath=false', 'diff', '--name-only', '--no-renames', '-z', `${base}...${head}`], {
    cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
  });
  return caminhosSensiveisDe(saida.split('\0').filter(Boolean));
}

const caminhosDaApi = arquivos => caminhosSensiveisDe(arquivos.flatMap(arquivo => [arquivo.filename, arquivo.previous_filename].filter(Boolean)));

const quemSobeAAtencao = (risco, caminhos) => (caminhos.length && risco !== 'ALTA' ? `mexe em ${caminhos.slice(0, 3).join(', ')}` : `o revisor ${risco}`);

module.exports = { PASTAS_SENSIVEIS, ARQUIVOS_SENSIVEIS, caminhosDaApi, caminhosDaPrNoGit, caminhosSensiveisDe, quemSobeAAtencao };
