'use strict';

// Tombstone de frase apagada, o mesmo para o service worker (popup) e o painel:
// pm_del_{id} no chrome.storage.sync e, com a conta, um campo por frase no mapa
// `ids` de usuarios/{uid}/meta/deleted.

const TOMB_PREFIX = 'pm_del_';

/** Chaves do chrome.storage.sync que marcam as frases como apagadas. */
function tombstonesSync(ids, apagadasEm) {
  return Object.fromEntries(ids.map(id => [`${TOMB_PREFIX}${id}`, apagadasEm]));
}

/**
 * Query e corpo do PATCH em meta/deleted. updateMask por campo: dois computadores
 * gravam ao mesmo tempo sem conflito. O id começa com dígito, então o caminho do
 * campo vai entre crases (ids.`123`), como a API REST exige.
 */
function tombstoneFirestore(ids, apagadasEm) {
  const caminho = id => `ids.\`${String(id).replace(/[`\\]/g, '\\$&')}\``;
  return {
    mascara: ids.map(id => `updateMask.fieldPaths=${encodeURIComponent(caminho(id))}`).join('&'),
    corpo: { fields: { ids: { mapValue: { fields: Object.fromEntries(
      ids.map(id => [id, { integerValue: String(apagadasEm) }]),
    ) } } } },
  };
}
