'use strict';

const { test, expect, botaoFlutuante, tocarVideo } = require('../fixtures');
const { estadoFinal } = require('../estado-final');

const LEGENDA = 'The ferry left the harbour.';
const NOVA = { word: 'harbour', type: 'word', novos: 1 };
const RECENTE = { word: 'harbour', type: 'word', recentes: 1 };
const CONHECIDAS = ['ferry', 'left'];

const hoje = () => {
  const agora = new Date();
  return [agora.getFullYear(), String(agora.getMonth() + 1).padStart(2, '0'), String(agora.getDate()).padStart(2, '0')].join('-');
};

async function legendaTocando({ page, paginas, extensao, fakes }, vocabulario) {
  fakes.anki.definirVocabulario('en', vocabulario);
  await extensao.gravarStorage({
    pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } },
    pm_auto_miner_daily: { date: hoje(), en: { count: 0 }, ru: { count: 0 } },
    ankiBridgePresets: { en: { nivel: 'intermediario' } },
  });
  await page.goto(paginas.url('player.html'));
  await expect(botaoFlutuante(page)).toBeVisible();
  await page.locator('#legenda').evaluate((no, texto) => { no.textContent = texto; }, LEGENDA);
  await tocarVideo(page);
}

test('a legenda com uma palavra Nova e o resto conhecido é minerada com essa palavra grifada', async ({ page, paginas, extensao, fakes }) => {
  await legendaTocando({ page, paginas, extensao, fakes }, [...CONHECIDAS, NOVA]);

  await expect.poll(async () => (await extensao.frases()).map(frase => frase.texto)).toEqual([LEGENDA]);
  const [frase] = await extensao.frases();
  expect(frase.keywords).toEqual(['harbour@8']);
  await estadoFinal(extensao, {
    pm_auto_miner_last_event: { action: 'saved', reason: 'en_new_item', phraseId: frase.id },
    pm_auto_miner_daily: { en: { count: 1 } },
  });
});

test('a mesma palavra já Recente no Baralho deixa a legenda sem nada novo e ela não é minerada', async ({ page, paginas, extensao, fakes }) => {
  await legendaTocando({ page, paginas, extensao, fakes }, [...CONHECIDAS, RECENTE]);

  await estadoFinal(extensao, {
    pm_auto_miner_last_event: { action: 'skip', reason: 'nada_novo', texto: LEGENDA },
    pm_auto_miner_daily: { en: { count: 0 } },
  });
  expect(await extensao.frases()).toEqual([]);
});

test('a legenda com duas palavras desconhecidas não é minerada', async ({ page, paginas, extensao, fakes }) => {
  await legendaTocando({ page, paginas, extensao, fakes }, ['ferry', NOVA]);

  await estadoFinal(extensao, {
    pm_auto_miner_last_event: { action: 'skip', reason: 'nao_e_i_mais_1', texto: LEGENDA },
    pm_auto_miner_daily: { en: { count: 0 } },
  });
  expect(await extensao.frases()).toEqual([]);
});
