'use strict';

const { test, expect, botaoFlutuante, tocarVideo } = require('../fixtures');
const { estadoFinal } = require('../estado-final');

const ELA = "She can't put up with him";
const WALTER = "Tell Walter I'm here";
const CHAVE_DE_EXEMPLO = 'sk-proj-chave-de-exemplo-9f3a';
const CONHECIDAS_DA_ELA = ['she', "can't", 'put', 'up', 'with', 'him'];
const CONHECIDAS_DO_WALTER = ['tell', "i'm", 'here'];
const INICIANTE_QUE_JA_LE_LINHAS_LONGAS = [...CONHECIDAS_DA_ELA, ...Array.from({ length: 200 }, (_, i) => `conhecida${i}`)];

const hoje = () => {
  const agora = new Date();
  return [agora.getFullYear(), String(agora.getMonth() + 1).padStart(2, '0'), String(agora.getDate()).padStart(2, '0')].join('-');
};

const perguntasAIA = fakes => fakes.anki.requisicoes.filter(pedido => pedido.caminho === '/ia/termos');

async function legendaTocando({ page, paginas, extensao, fakes }, { legenda, vocabulario, nivel, chave = CHAVE_DE_EXEMPLO }) {
  fakes.anki.definirVocabulario('en', vocabulario);
  if (chave) fakes.anki.espelharChave({ chave, versao: 1, conta: 'dono', em: 1 });
  await extensao.gravarStorage({
    pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } },
    pm_auto_miner_daily: { date: hoje(), en: { count: 0 }, ru: { count: 0 } },
    ankiBridgePresets: { en: { nivel } },
  });
  await page.goto(paginas.url('player.html'));
  await expect(botaoFlutuante(page)).toBeVisible();
  await page.locator('#legenda').evaluate((no, texto) => { no.textContent = texto; }, legenda);
  await tocarVideo(page);
}

test('com tudo conhecido e o phrasal verb fora do Vocabulário, a IA é perguntada e a linha entra com o phrasal verb inteiro grifado', async ({ page, paginas, extensao, fakes }) => {
  await legendaTocando({ page, paginas, extensao, fakes }, { legenda: ELA, vocabulario: CONHECIDAS_DA_ELA, nivel: 'intermediario' });

  await expect.poll(async () => (await extensao.frases()).map(frase => frase.texto)).toEqual([ELA]);
  const [frase] = await extensao.frases();
  expect(frase.keywords).toEqual(['put@4', 'up@6', 'with@8']);
  await estadoFinal(extensao, {
    pm_auto_miner_last_event: { action: 'saved', reason: 'en_new_item', phraseId: frase.id, evaluation: { iaPerguntada: true } },
    pm_auto_miner_daily: { en: { count: 1 } },
  });
  expect(perguntasAIA(fakes).map(pedido => pedido.dados)).toEqual([{ lang: 'en', texto: ELA }]);
});

test('o phrasal verb já Recente no Vocabulário deixa a linha sem nada novo e ela não entra', async ({ page, paginas, extensao, fakes }) => {
  const vocabulario = [...CONHECIDAS_DA_ELA, { word: 'put up with', type: 'term', recentes: 1 }];
  await legendaTocando({ page, paginas, extensao, fakes }, { legenda: ELA, vocabulario, nivel: 'intermediario' });

  await estadoFinal(extensao, {
    pm_auto_miner_last_event: { action: 'skip', reason: 'nada_novo', texto: ELA, evaluation: { iaPerguntada: true } },
    pm_auto_miner_daily: { en: { count: 0 } },
  });
  expect(await extensao.frases()).toEqual([]);
  expect(perguntasAIA(fakes)).toHaveLength(1);
});

test('o nome que a IA reconhece não entra nem é grifado', async ({ page, paginas, extensao, fakes }) => {
  await legendaTocando({ page, paginas, extensao, fakes }, { legenda: WALTER, vocabulario: CONHECIDAS_DO_WALTER, nivel: 'avancado' });

  await estadoFinal(extensao, {
    pm_auto_miner_last_event: { action: 'skip', reason: 'nada_novo', texto: WALTER, evaluation: { iaPerguntada: true, keywords: [] } },
    pm_auto_miner_daily: { en: { count: 0 } },
  });
  expect(await extensao.frases()).toEqual([]);
  expect(perguntasAIA(fakes)).toHaveLength(1);
});

test('no Iniciante a IA nunca é perguntada: o código decide sozinho e a linha sem palavra nova não entra', async ({ page, paginas, extensao, fakes }) => {
  await legendaTocando({ page, paginas, extensao, fakes }, { legenda: ELA, vocabulario: INICIANTE_QUE_JA_LE_LINHAS_LONGAS, nivel: 'iniciante' });

  await estadoFinal(extensao, {
    pm_auto_miner_last_event: { action: 'skip', reason: 'nada_novo', texto: ELA, evaluation: { iaPerguntada: false } },
    pm_auto_miner_daily: { en: { count: 0 } },
  });
  expect(await extensao.frases()).toEqual([]);
  expect(perguntasAIA(fakes)).toEqual([]);
});

test('sem plano e sem chave a Conexão não tem quem pague: o código decide sozinho e o vídeo segue', async ({ page, paginas, extensao, fakes }) => {
  await legendaTocando({ page, paginas, extensao, fakes }, { legenda: ELA, vocabulario: CONHECIDAS_DA_ELA, nivel: 'intermediario', chave: null });

  await estadoFinal(extensao, {
    pm_auto_miner_last_event: { action: 'skip', reason: 'nada_novo', texto: ELA, evaluation: { iaPerguntada: true } },
    pm_auto_miner_daily: { en: { count: 0 } },
  });
  expect(await extensao.frases()).toEqual([]);
  expect(perguntasAIA(fakes)).toHaveLength(1);
});
