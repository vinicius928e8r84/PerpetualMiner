'use strict';

// Quando a Conexão recusa o `/ia/openai/legado` (409 `legacy_key_mismatch`), do mesmo jeito que `vincular_legado`
// (complemento/chaves.py): a chave não é a guardada, a chave é de outra conta, a base não é a atual nem a anterior, ou a chave
// foi guardada sem conta (`contaDaChave === ''`, colada sem Google) e não vira de nenhuma conta.
function legadoRecusado(estado, { chave, conta, versao }) {
  const guardada = estado.contaDaChave;
  if ((estado.chaveDaOpenAI || '') !== chave) return true;
  if (guardada ? guardada !== conta : guardada === '' && estado.chaveDaOpenAI && conta !== '') return true;
  return versao !== estado.versaoDaChave && !(versao === estado.versaoDaChave - 1 && guardada === conta);
}

module.exports = { legadoRecusado };
