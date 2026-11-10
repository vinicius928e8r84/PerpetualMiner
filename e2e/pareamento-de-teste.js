'use strict';

// Os navegadores pareados dos testes (#192): dois, `primeiro` e `segundo`, com o segredo de cada um no contrato
// (complemento/contrato/exemplos-do-pareamento.json), que o complemento também lê. A extensão do teste já nasce pareada: a fixture `extensao`
// guarda a credencial no IndexedDB do service worker, como o pareamento de verdade a guardaria, e o fake da Conexão (ou o complemento real, em
// `PM_CONEXAO=real`) já conhece o navegador. Quem testa o pareamento pede `test.use({ pareada: false })`.

const crypto = require('crypto');
const contrato = require('../complemento/contrato/carregar');

const NAVEGADORES = Object.freeze(contrato.navegadoresDeTeste);

const hmac = (segredoEmBase64, texto) => crypto.createHmac('sha256', Buffer.from(segredoEmBase64, 'base64')).update(texto).digest('base64');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

/** A assinatura de um pedido, a mesma conta de lib/pareamento.js e de complemento/pareamento.py. `corpo` é o texto que segue. */
function assinaturaDoPedido(segredo, { sessao, nonce, metodo, caminho, corpo = '' }) {
  return hmac(segredo, `pm1\npedido\n${sessao}\n${nonce}\n${metodo}\n${caminho}\n${sha256(Buffer.from(corpo, 'utf8'))}`);
}

const provaDaResposta = (segredo, { sessao, nonce, status, corpo }) => hmac(segredo, `pm1\nresposta\n${sessao}\n${nonce}\n${status}\n${sha256(corpo)}`);
const provaDoServidor = (segredo, desafio, sessao) => hmac(segredo, `pm1\nservidor\n${desafio}\n${sessao}`);
const provaDaRevogacao = (segredo, desafio) => hmac(segredo, `pm1\nrevogado\n${desafio}`);

/** Os cabeçalhos com que a extensão assina um pedido de `navegador` à Conexão na `sessao`. */
function cabecalhosAssinados({ sessao, metodo, caminho, corpo = '', navegador = 'primeiro', nonce = crypto.randomBytes(8).toString('hex') }) {
  const { cliente, segredo } = NAVEGADORES[navegador];
  return {
    'X-PerpetualMiner-Cliente': cliente,
    'X-PerpetualMiner-Sessao': sessao,
    'X-PerpetualMiner-Nonce': nonce,
    'X-PerpetualMiner-Assinatura': assinaturaDoPedido(segredo, { sessao, nonce, metodo, caminho, corpo }),
  };
}

/** Guarda a credencial de `navegador` no IndexedDB da extensão (o `sw` é o service worker): a CryptoKey não extraível, como a extensão a guardaria. */
function parearNoServiceWorker(sw, navegador = 'primeiro') {
  const { cliente, segredo } = NAVEGADORES[navegador];
  return sw.evaluate(async ({ cliente: quem, segredo: emBase64 }) => {
    const bytes = Uint8Array.from(atob(emBase64), letra => letra.charCodeAt(0));
    const chave = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const banco = await new Promise((resolver, rejeitar) => {
      const abertura = indexedDB.open('pm-pareamento', 1);
      abertura.onupgradeneeded = () => abertura.result.createObjectStore('conexao');
      abertura.onerror = () => rejeitar(abertura.error);
      abertura.onsuccess = () => resolver(abertura.result);
    });
    await new Promise((resolver, rejeitar) => {
      const transacao = banco.transaction('conexao', 'readwrite');
      transacao.objectStore('conexao').put({ cliente: quem, chave }, 'credencial');
      transacao.oncomplete = resolver;
      transacao.onerror = () => rejeitar(transacao.error);
    });
    banco.close();
  }, { cliente, segredo });
}

/**
 * Um pedido ao 127.0.0.1:8766 feito de uma página da extensão, **assinado como a extensão assina** (o contrato e a Conexão real o exigem):
 * o `conferir` dá a sessão, os cabeçalhos saem daqui e o `fetch` vai da página. A saúde e o pareamento vão sem assinatura, como a Conexão os
 * atende. Devolve `{ status, json }`. Para o teste que confere o servidor contra um exemplo sem passar pelas telas; o pedido de uma tela
 * sai de `PedidoAoAnki.pedir`.
 */
async function pedirDaPagina(page, { metodo, caminho, corpo }, navegador = 'primeiro') {
  const aberto = (metodo === 'GET' && caminho === '/health') || caminho.startsWith('/pareamento/');
  const texto = corpo === undefined ? '' : JSON.stringify(corpo);
  let cabecalhos = {};
  if (!aberto) {
    const desafio = crypto.randomBytes(16).toString('hex');
    const conferido = await pedirDaPagina(page, { metodo: 'POST', caminho: '/pareamento/conferir', corpo: { cliente: NAVEGADORES[navegador].cliente, desafio } });
    cabecalhos = cabecalhosAssinados({ sessao: conferido.json.sessao, metodo, caminho, corpo: texto, navegador });
  }
  return page.evaluate(async ({ metodo: como, caminho: onde, texto: enviado, cabecalhos: assinados }) => {
    const resposta = await fetch(`http://127.0.0.1:8766${onde}`, {
      method: como,
      headers: { ...(enviado !== '' && { 'Content-Type': 'application/json' }), ...assinados },
      ...(enviado !== '' && { body: enviado }),
    });
    return { status: resposta.status, json: await resposta.json() };
  }, { metodo, caminho, texto, cabecalhos });
}

module.exports = { NAVEGADORES, assinaturaDoPedido, provaDaResposta, provaDoServidor, provaDaRevogacao, cabecalhosAssinados, parearNoServiceWorker, pedirDaPagina };
