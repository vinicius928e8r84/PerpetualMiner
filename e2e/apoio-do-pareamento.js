'use strict';

// O que as specs do pareamento (#192: pareamento.spec.js, pareamento-ataques.spec.js) repetem: a faixa do Painel, o código que o Anki mostra, quantos navegadores a
// Conexão tem pareados e o que a extensão guardou. No modo `PM_CONEXAO=real` o código e a contagem vêm do complemento de verdade (`conexaoDoTeste`).

const { expect } = require('@playwright/test');

const faixa = page => page.locator('#painel-pareamento');
const conectar = page => faixa(page).getByRole('button', { name: 'Conectar' });
const campo = page => page.getByRole('textbox', { name: 'Digite o código que apareceu no Anki' });
const confirmar = page => faixa(page).getByRole('button', { name: 'Confirmar' });
const toasts = page => page.locator('.veio-toast');
const ponto = page => page.locator('.shell-ponto');

/** O código que o Anki mostra agora: na janela de mentira do fake, ou na do complemento real. */
const codigoNoAnki = async (fakes, conexaoDoTeste) => (conexaoDoTeste ? (await conexaoDoTeste.enviar({ pareamento: 'codigo' })).codigo : fakes.anki.pareamento.codigoNoAnki());
const quantosPareados = async (fakes, conexaoDoTeste) => (conexaoDoTeste ? (await conexaoDoTeste.enviar({ pareamento: 'navegadores' })).navegadores : fakes.anki.pareamento.pareados().size);
const desconectarNoAnki = async (fakes, conexaoDoTeste) => (conexaoDoTeste ? conexaoDoTeste.enviar({ pareamento: 'desconectar' }) : fakes.anki.pareamento.desconectar());

/** O que a extensão guardou do pareamento no IndexedDB do service worker: o navegador e se a chave deixa ler os bytes. */
const credencialGuardada = extensao => extensao.serviceWorker.evaluate(() => new Promise((resolver, rejeitar) => {
  const abertura = indexedDB.open('pm-pareamento', 1);
  abertura.onerror = () => rejeitar(abertura.error);
  abertura.onsuccess = () => {
    const banco = abertura.result;
    if (!banco.objectStoreNames.contains('conexao')) { banco.close(); return resolver(null); }
    const leitura = banco.transaction('conexao', 'readonly').objectStore('conexao').get('credencial');
    leitura.onsuccess = () => {
      banco.close();
      const guardada = leitura.result;
      resolver(guardada ? { cliente: guardada.cliente, extraivel: guardada.chave.extractable, usos: guardada.chave.usages } : null);
    };
  };
}));

async function parearPelaTela(page, fakes, conexaoDoTeste) {
  await conectar(page).click();
  await expect(campo(page)).toBeVisible();
  const codigo = await codigoNoAnki(fakes, conexaoDoTeste);
  await campo(page).fill(codigo.toLowerCase());
  await confirmar(page).click();
  await expect(faixa(page)).toHaveCount(0);
}


module.exports = { faixa, conectar, campo, confirmar, toasts, ponto, codigoNoAnki, quantosPareados, desconectarNoAnki, credencialGuardada, parearPelaTela };
