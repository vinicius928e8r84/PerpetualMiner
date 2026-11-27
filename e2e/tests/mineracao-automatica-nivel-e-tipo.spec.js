'use strict';

const { test, expect, botaoFlutuante, tocarVideo } = require('../fixtures');
const { estadoFinal } = require('../estado-final');

const CHAVE_DE_EXEMPLO = 'sk-proj-chave-de-exemplo-9f3a';

const COMUM = { texto: "She can't put up with him", conhecidas: ['she', "can't", 'put', 'up', 'with', 'him'], keywords: ['put@4', 'up@6', 'with@8'] };
const INCOMUM = { texto: 'They had to rustle up some food', conhecidas: ['they', 'had', 'to', 'rustle', 'up', 'some', 'food'], keywords: ['rustle@6', 'up@8'] };
const GIRIA = { texto: 'She threw shade at him', conhecidas: ['she', 'threw', 'shade', 'at', 'him'], keywords: ['threw@2', 'shade@4'] };
const EXPRESSAO_INCOMUM = { texto: 'He had a bee in his bonnet', conhecidas: ['he', 'had', 'a', 'bee', 'in', 'his', 'bonnet'], keywords: ['bee@6', 'in@8', 'his@10', 'bonnet@12'] };

const hoje = () => {
  const agora = new Date();
  return [agora.getFullYear(), String(agora.getMonth() + 1).padStart(2, '0'), String(agora.getDate()).padStart(2, '0')].join('-');
};

const perguntasAIA = fakes => fakes.anki.requisicoes.filter(pedido => pedido.caminho === '/ia/termos');
const legenda = (page, texto) => page.locator('#legenda').evaluate((no, valor) => { no.textContent = valor; }, texto);

async function prepararAba({ page, paginas, extensao, fakes }, { linhas, nivel }) {
  fakes.anki.definirVocabulario('en', [...new Set(linhas.flatMap(linha => linha.conhecidas))]);
  fakes.anki.espelharChave({ chave: CHAVE_DE_EXEMPLO, versao: 1, conta: 'dono', em: 1 });
  await extensao.gravarStorage({
    pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } },
    pm_auto_miner_daily: { date: hoje(), en: { count: 0 }, ru: { count: 0 } },
    ankiBridgePresets: { en: { nivel } },
  });
  await page.goto(paginas.url('player.html'));
  await expect(botaoFlutuante(page)).toBeVisible();
}

async function tocarALinha(contexto, { linhas, nivel }) {
  await prepararAba(contexto, { linhas, nivel });
  await legenda(contexto.page, linhas[0].texto);
  await tocarVideo(contexto.page);
}

async function mineradaComo(extensao, { texto, keywords }, contagem = 1) {
  await expect.poll(async () => (await extensao.frases()).map(frase => frase.texto)).toContain(texto);
  const frase = (await extensao.frases()).find(umaFrase => umaFrase.texto === texto);
  expect(frase.keywords).toEqual(keywords);
  await estadoFinal(extensao, {
    pm_auto_miner_last_event: { action: 'saved', reason: 'en_new_item', texto, phraseId: frase.id, evaluation: { iaPerguntada: true, keywords } },
    pm_auto_miner_daily: { en: { count: contagem } },
  });
}

async function foraDoNivel(extensao, { texto }) {
  await estadoFinal(extensao, {
    pm_auto_miner_last_event: { action: 'skip', reason: 'fora_do_nivel', texto, evaluation: { accept: false, iaPerguntada: true } },
    pm_auto_miner_daily: { en: { count: 0 } },
  });
  expect(await extensao.frases()).toEqual([]);
}

test('o Intermediário minera o phrasal verb comum que a IA acha', async ({ page, paginas, extensao, fakes }) => {
  await tocarALinha({ page, paginas, extensao, fakes }, { linhas: [COMUM], nivel: 'intermediario' });
  await mineradaComo(extensao, COMUM);
  expect(perguntasAIA(fakes).map(pedido => pedido.dados)).toEqual([{ lang: 'en', texto: COMUM.texto }]);
});

test('o Intermediário não minera o phrasal verb incomum: fora_do_nivel', async ({ page, paginas, extensao, fakes }) => {
  await tocarALinha({ page, paginas, extensao, fakes }, { linhas: [INCOMUM], nivel: 'intermediario' });
  await foraDoNivel(extensao, INCOMUM);
  expect(perguntasAIA(fakes)).toHaveLength(1);
});

test('o Intermediário não minera a gíria: fora_do_nivel', async ({ page, paginas, extensao, fakes }) => {
  await tocarALinha({ page, paginas, extensao, fakes }, { linhas: [GIRIA], nivel: 'intermediario' });
  await foraDoNivel(extensao, GIRIA);
});

test('o Avançado minera o phrasal verb incomum com o phrasal verb inteiro grifado', async ({ page, paginas, extensao, fakes }) => {
  await tocarALinha({ page, paginas, extensao, fakes }, { linhas: [INCOMUM], nivel: 'avancado' });
  await mineradaComo(extensao, INCOMUM);
  expect(perguntasAIA(fakes)).toHaveLength(1);
});

test('o Avançado minera a gíria', async ({ page, paginas, extensao, fakes }) => {
  await tocarALinha({ page, paginas, extensao, fakes }, { linhas: [GIRIA], nivel: 'avancado' });
  await mineradaComo(extensao, GIRIA);
});

test('trocar o Nível muda a próxima linha, sem recarregar a aba: a expressão incomum recusada no Intermediário entra no Avançado', async ({ page, paginas, extensao, fakes }) => {
  await tocarALinha({ page, paginas, extensao, fakes }, { linhas: [GIRIA, EXPRESSAO_INCOMUM], nivel: 'intermediario' });
  await foraDoNivel(extensao, GIRIA);

  await extensao.gravarStorage({ ankiBridgePresets: { en: { nivel: 'avancado' } } });
  await legenda(page, EXPRESSAO_INCOMUM.texto);
  await mineradaComo(extensao, EXPRESSAO_INCOMUM);
});
