'use strict';

// A issue única da suíte noturna (.github/workflows/noturna.yml, job "Issue da noturna"). Uso:
//   node scripts/ci/issue-da-noturna.js <url da execução> <resultado das fatias> <resultado da Conexão real>
// Os resultados são os de `needs.<job>.result`. Vermelha (alguma falhou ou foi cortada pelo teto de tempo, `cancelled`): abre a issue com o rótulo `noturna`, ou comenta
// na que já está aberta, para haver uma só enquanto a main não voltar. Verde (todas passaram): comenta e fecha a aberta.
// Pulada ou sem resultado: não mexe em nada. Se o `gh` falha, o passo reprova.

const { execFileSync } = require('child_process');

const ROTULO = 'noturna';
const TITULO = 'Suíte noturna vermelha na main';

/** 'vermelha', 'verde' ou 'nada', pelos resultados dos jobs da noturna. */
function decidir(resultados) {
  // `cancelled` conta como vermelha: o `timeout-minutes` corta o job e ele termina cancelled, que é a travada que a noturna procura.
  // O cancelamento manual da execução não chega aqui (o job do workflow tem `!cancelled()`).
  if (resultados.some(r => r === 'failure' || r === 'timed_out' || r === 'cancelled')) return 'vermelha';
  if (resultados.length > 0 && resultados.every(r => r === 'success')) return 'verde';
  return 'nada';
}

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' });

/** O número da issue aberta da noturna (a mais recente), ou null. */
function issueAberta() {
  const lista = JSON.parse(gh('issue', 'list', '--label', ROTULO, '--state', 'open', '--json', 'number', '--limit', '1'));
  return lista.length ? lista[0].number : null;
}

function relato(url, fatias, conexaoReal) {
  return [`Execução: ${url}`, '', `- as fatias da e2e: ${fatias}`, `- a e2e com a Conexão real: ${conexaoReal}`].join('\n');
}

function principal([url, fatias, conexaoReal]) {
  const decisao = decidir([fatias, conexaoReal]);
  if (decisao === 'nada') {
    console.log(`noturna ${fatias}/${conexaoReal}: nada a fazer`);
    return;
  }
  const aberta = issueAberta();
  if (decisao === 'vermelha') {
    if (aberta) {
      gh('issue', 'comment', String(aberta), '--body', `Continua vermelha.\n\n${relato(url, fatias, conexaoReal)}`);
      console.log(`comentário na issue #${aberta}`);
      return;
    }
    gh('label', 'create', ROTULO, '--description', 'Suíte noturna da main vermelha', '--color', 'B60205', '--force');
    gh('issue', 'create', '--title', TITULO, '--label', ROTULO,
      '--body', `A suíte inteira da main ficou vermelha esta noite. Esta issue fica aberta até a primeira noite verde, que a fecha.\n\n${relato(url, fatias, conexaoReal)}`);
    console.log('issue aberta');
    return;
  }
  if (aberta) {
    gh('issue', 'comment', String(aberta), '--body', `Voltou ao verde.\n\n${relato(url, fatias, conexaoReal)}`);
    gh('issue', 'close', String(aberta));
    console.log(`issue #${aberta} fechada`);
  }
}

module.exports = { decidir };

if (require.main === module) {
  const argumentos = process.argv.slice(2);
  if (argumentos.length !== 3) {
    console.error('uso: node scripts/ci/issue-da-noturna.js <url da execução> <resultado das fatias> <resultado da Conexão real>');
    process.exit(2);
  }
  try {
    principal(argumentos);
  } catch (erro) {
    console.error(`gh falhou: ${erro.message}`);
    process.exit(1);
  }
}
