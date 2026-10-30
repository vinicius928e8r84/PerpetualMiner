'use strict';

// A conferência de uma resposta contra o exemplo do contrato; `anki.js` a reexporta.

/**
 * O JSON obtido é o do contrato; `"<agora>"` no contrato é qualquer instante ISO 8601 (o que o complemento
 * escreve é UTC com `Z`) e `"<áudio>"`, um áudio em base64 que não é vazio (o do Ouvir, #174). Devolve o que difere, para a mensagem do teste, ou null se iguais.
 */
function diferencaDoContrato(obtido, esperado, caminho = '') {
  if (esperado === '<url de autorização>') {
    return typeof obtido === 'string' && obtido.startsWith('https://auth.openai.com/api/accounts/authorize?client_id=dynamic_agent_client&') ? null : `${caminho}: ${JSON.stringify(obtido)} não é a URL de autorização`;
  }
  if (esperado === '<áudio>') {
    return typeof obtido === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(obtido) ? null : `${caminho}: ${JSON.stringify(obtido)} não é um áudio em base64`;
  }
  if (esperado === '<agora>') {
    return typeof obtido === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(obtido) ? null : `${caminho || '/'}: ${JSON.stringify(obtido)} não é um instante`;
  }
  if (Array.isArray(esperado) || (esperado && typeof esperado === 'object')) {
    if (!obtido || typeof obtido !== 'object' || Array.isArray(obtido) !== Array.isArray(esperado)) return `${caminho || '/'}: ${JSON.stringify(obtido)} não é ${JSON.stringify(esperado)}`;
    const chaves = new Set([...Object.keys(esperado), ...Object.keys(obtido)]);
    for (const chave of chaves) {
      if (!(chave in esperado) || !(chave in obtido)) return `${caminho}/${chave}: ${chave in obtido ? 'sobra' : 'falta'}`;
      const diferenca = diferencaDoContrato(obtido[chave], esperado[chave], `${caminho}/${chave}`);
      if (diferenca) return diferenca;
    }
    return null;
  }
  return obtido === esperado ? null : `${caminho || '/'}: ${JSON.stringify(obtido)} em vez de ${JSON.stringify(esperado)}`;
}

module.exports = { diferencaDoContrato };
