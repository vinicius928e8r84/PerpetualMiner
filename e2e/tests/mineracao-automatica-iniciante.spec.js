'use strict';

const { test, expect, botaoFlutuante, tocarVideo } = require('../fixtures');
const { estadoFinal } = require('../estado-final');

const PALAVRAS_DA_LINHA_CURTA = 3;
const PALAVRAS_CONHECIDAS_DA_LINHA_NORMAL = 200;

const CURTA = 'I love you';
const COM_PALAVRA_INCOMUM = 'I see zebra';
const DE_SEIS = 'The old man left the house';
const OUTRA_DE_SEIS = 'The old man left the old house';
const NOVA = palavra => ({ word: palavra, type: 'word', novos: 1 });
const conhecidas = (...palavras) => palavras;
const outrasConhecidas = total => Array.from({ length: total }, (_, i) => `conhecida${i}`);

const hoje = () => {
  const agora = new Date();
  return [agora.getFullYear(), String(agora.getMonth() + 1).padStart(2, '0'), String(agora.getDate()).padStart(2, '0')].join('-');
};

async function prepararAba({ page, paginas, extensao, fakes }, { vocabulario, nivel }) {
  fakes.anki.definirVocabulario('en', vocabulario);
  await extensao.gravarStorage({
    pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } },
    pm_auto_miner_daily: { date: hoje(), en: { count: 0 }, ru: { count: 0 } },
    ankiBridgePresets: { en: { nivel } },
  });
  await page.goto(paginas.url('player.html'));
  await expect(botaoFlutuante(page)).toBeVisible();
}

const legenda = (page, texto) => page.locator('#legenda').evaluate((no, valor) => { no.textContent = valor; }, texto);

async function legendaTocando(contexto, configuracao, texto) {
  await prepararAba(contexto, configuracao);
  await legenda(contexto.page, texto);
  await tocarVideo(contexto.page);
}

test('o Iniciante com pouco Vocabulário mineira a linha curta com uma palavra comum nova', async ({ page, paginas, extensao, fakes }) => {
  expect(CURTA.split(' ')).toHaveLength(PALAVRAS_DA_LINHA_CURTA);
  await legendaTocando({ page, paginas, extensao, fakes }, { vocabulario: [], nivel: 'iniciante' }, CURTA);

  await expect.poll(async () => (await extensao.frases()).map(frase => frase.texto)).toEqual([CURTA]);
  const [frase] = await extensao.frases();
  expect(frase.keywords).toEqual(['love@2']);
  await estadoFinal(extensao, {
    pm_auto_miner_last_event: { action: 'saved', reason: 'en_new_item', phraseId: frase.id },
    pm_auto_miner_daily: { en: { count: 1 } },
  });
});

test('o Iniciante com pouco Vocabulário não mineira a linha de seis palavras em que só falta uma', async ({ page, paginas, extensao, fakes }) => {
  const vocabulario = [...conhecidas('old', 'man', 'left'), NOVA('house')];
  await legendaTocando({ page, paginas, extensao, fakes }, { vocabulario, nivel: 'iniciante' }, DE_SEIS);

  await estadoFinal(extensao, {
    pm_auto_miner_last_event: { action: 'skip', reason: 'linha_longa', texto: DE_SEIS },
    pm_auto_miner_daily: { en: { count: 0 } },
  });
  expect(await extensao.frases()).toEqual([]);
});

test('o Iniciante com o Vocabulário da linha normal mineira a linha de seis palavras em que só falta uma', async ({ page, paginas, extensao, fakes }) => {
  const vocabulario = [...conhecidas('old', 'man', 'left'), ...outrasConhecidas(PALAVRAS_CONHECIDAS_DA_LINHA_NORMAL - 3)];
  await legendaTocando({ page, paginas, extensao, fakes }, { vocabulario, nivel: 'iniciante' }, DE_SEIS);

  await expect.poll(async () => (await extensao.frases()).map(frase => frase.texto)).toEqual([DE_SEIS]);
  const [frase] = await extensao.frases();
  expect(frase.keywords).toEqual(['house@10']);
  await estadoFinal(extensao, {
    pm_auto_miner_last_event: { action: 'saved', reason: 'en_new_item', phraseId: frase.id },
    pm_auto_miner_daily: { en: { count: 1 } },
  });
});

test('o Iniciante não mineira a palavra nova que não é comum', async ({ page, paginas, extensao, fakes }) => {
  await legendaTocando({ page, paginas, extensao, fakes }, { vocabulario: conhecidas('see'), nivel: 'iniciante' }, COM_PALAVRA_INCOMUM);

  await estadoFinal(extensao, {
    pm_auto_miner_last_event: { action: 'skip', reason: 'fora_do_nivel', texto: COM_PALAVRA_INCOMUM },
    pm_auto_miner_daily: { en: { count: 0 } },
  });
  expect(await extensao.frases()).toEqual([]);
});

for (const nivel of ['intermediario', 'avancado']) {
  test(`o ${nivel} mineira a palavra nova incomum numa linha de seis palavras`, async ({ page, paginas, extensao, fakes }) => {
    const linha = 'The old man left the zebra';
    await legendaTocando({ page, paginas, extensao, fakes }, { vocabulario: conhecidas('old', 'man', 'left'), nivel }, linha);

    await expect.poll(async () => (await extensao.frases()).map(frase => frase.texto)).toEqual([linha]);
    await estadoFinal(extensao, {
      pm_auto_miner_last_event: { action: 'saved', reason: 'en_new_item' },
      pm_auto_miner_daily: { en: { count: 1 } },
    });
  });
}

test('trocar o Nível nos Ajustes de envio muda a próxima linha, sem recarregar a aba', async ({ page, paginas, extensao, fakes }) => {
  const vocabulario = [...conhecidas('old', 'man', 'left'), NOVA('house')];
  await legendaTocando({ page, paginas, extensao, fakes }, { vocabulario, nivel: 'iniciante' }, DE_SEIS);
  await estadoFinal(extensao, { pm_auto_miner_last_event: { action: 'skip', reason: 'linha_longa', texto: DE_SEIS } });

  await extensao.gravarStorage({ ankiBridgePresets: { en: { nivel: 'intermediario' } } });
  await legenda(page, OUTRA_DE_SEIS);

  await expect.poll(async () => (await extensao.frases()).map(frase => frase.texto)).toEqual([OUTRA_DE_SEIS]);
  await estadoFinal(extensao, {
    pm_auto_miner_last_event: { action: 'saved', reason: 'en_new_item', texto: OUTRA_DE_SEIS },
    pm_auto_miner_daily: { en: { count: 1 } },
  });
});
