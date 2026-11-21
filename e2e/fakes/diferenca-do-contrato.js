'use strict';

const URL_DE_AUTORIZACAO = 'https://auth.openai.com/api/accounts/authorize?client_id=dynamic_agent_client&';

const BASE64_DE_32_BYTES = { aceita: texto => /^[A-Za-z0-9+/]{43}=$/.test(texto), falha: 'não são 32 bytes em base64' };

const MARCADORES = {
  '<segredo>': BASE64_DE_32_BYTES,
  '<prova>': BASE64_DE_32_BYTES,
  '<sessão>': { aceita: texto => /^[0-9a-f]{32}$/.test(texto), falha: 'não é uma sessão' },
  '<url de autorização>': { aceita: texto => texto.startsWith(URL_DE_AUTORIZACAO), falha: 'não é a URL de autorização' },
  '<áudio>': { aceita: texto => /^[A-Za-z0-9+/]+={0,2}$/.test(texto), falha: 'não é um áudio em base64' },
  '<agora>': { aceita: texto => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(texto), falha: 'não é um instante', naRaiz: true },
};

const marcadorDe = esperado => (typeof esperado === 'string' && Object.hasOwn(MARCADORES, esperado) ? MARCADORES[esperado] : null);

const ehComposto = valor => Boolean(valor) && typeof valor === 'object';

const mesmoFormato = (obtido, esperado) => ehComposto(obtido) && Array.isArray(obtido) === Array.isArray(esperado);

const ondeNaRaiz = caminho => caminho || '/';

function diferencaDoMarcador(obtido, marcador, caminho) {
  if (typeof obtido === 'string' && marcador.aceita(obtido)) return null;
  return `${marcador.naRaiz ? ondeNaRaiz(caminho) : caminho}: ${JSON.stringify(obtido)} ${marcador.falha}`;
}

function chaveQueSobraOuFalta(obtido, esperado, chave) {
  if (!(chave in obtido)) return 'falta';
  if (!(chave in esperado)) return 'sobra';
  return null;
}

function diferencaDaChave(obtido, esperado, chave, caminho) {
  const onde = `${caminho}/${chave}`;
  const sobraOuFalta = chaveQueSobraOuFalta(obtido, esperado, chave);
  if (sobraOuFalta) return `${onde}: ${sobraOuFalta}`;
  return diferencaDoContrato(obtido[chave], esperado[chave], onde);
}

function diferencaDoComposto(obtido, esperado, caminho) {
  if (!mesmoFormato(obtido, esperado)) return `${ondeNaRaiz(caminho)}: ${JSON.stringify(obtido)} não é ${JSON.stringify(esperado)}`;
  const chaves = new Set([...Object.keys(esperado), ...Object.keys(obtido)]);
  for (const chave of chaves) {
    const diferenca = diferencaDaChave(obtido, esperado, chave, caminho);
    if (diferenca) return diferenca;
  }
  return null;
}

function diferencaDoContrato(obtido, esperado, caminho = '') {
  const marcador = marcadorDe(esperado);
  if (marcador) return diferencaDoMarcador(obtido, marcador, caminho);
  if (ehComposto(esperado)) return diferencaDoComposto(obtido, esperado, caminho);
  return obtido === esperado ? null : `${ondeNaRaiz(caminho)}: ${JSON.stringify(obtido)} em vez de ${JSON.stringify(esperado)}`;
}

module.exports = { diferencaDoContrato };
