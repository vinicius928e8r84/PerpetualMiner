'use strict';

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');
const HOJE = '18/09/2026';

function frase(id, texto, extras = {}) {
  return { id, texto, data: HOJE, streaming: 'netflix', idioma: 'Inglês', ...extras };
}

const INGLESAS = [
  frase(1_700_000_000_005, 'She hit the sack early.', { keywords: ['sack@3'] }),
  frase(1_700_000_000_004, 'It costs an arm and a leg.'),
  frase(1_700_000_000_003, 'Better late than never.'),
];
const RUSSA = frase(1_700_000_000_002, 'Я улыбаюсь каждое утро.', { idioma: 'Russo' });
const [SACK, ARM, LATE] = INGLESAS;

async function abrirPainel(page, extensao, endereco = '#frases') {
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url(`painel.html${endereco}`));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

const cartao = (page, texto) => page.locator('#frases-lista .veio-frase').filter({ hasText: texto });
const marcar = (page, texto) => cartao(page, texto).getByRole('checkbox', { name: 'Selecionar frase' });
const enviarAoAnki = page => page.locator('#frases-barra').getByRole('button', { name: 'Enviar ao Anki', exact: true });
const progresso = page => page.getByRole('dialog', { name: 'Enviando ao Anki…' });
const resumo = page => page.getByRole('dialog', { name: /^Envio concluído/ });
const envio = (page, nome) => progresso(page).getByRole('group', { name: nome });
/** O bloco de um idioma no resumo: “+N cartões”, o baralho, o que já estava e o que não entrou. */
const baralho = (page, idioma) => resumo(page).getByRole('group', { name: idioma });
const toasts = page => page.locator('.veio-toast');

async function pedirConferenciaDaConexao(page) {
  await page.locator('#shell-tentar-de-novo').evaluate(el => el.click());
}

async function transicaoCurta(locator) {
  await expect(locator).toBeAttached();
  await expect.poll(() => locator.evaluate(el => parseFloat(getComputedStyle(el).transitionDuration)))
    .toBeLessThanOrEqual(0.01);
}

async function marcarEEnviar(page, textos) {
  for (const texto of textos) await marcar(page, texto).check();
  await enviarAoAnki(page).click();
}

/** Espera o painel criar os Envios na Conexão falsa. */
async function enviosCriados(fakes, n) {
  await expect.poll(() => fakes.anki.envios.length).toBe(n);
  return fakes.anki.envios;
}

test.beforeEach(({ fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
});

test('Enviar ao Anki abre o progresso na hora, com um cartão por idioma, e sem toast', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  await abrirPainel(page, extensao);

  await marcarEEnviar(page, [SACK.texto, ARM.texto, RUSSA.texto]);

  await expect(progresso(page)).toBeVisible();
  await expect(progresso(page)).toContainText('2 envios · inglês e russo');
  await expect(envio(page, 'Envio em inglês · 2 frases')).toBeVisible();
  await expect(envio(page, 'Envio em russo · 1 frase')).toBeVisible();
  await expect(progresso(page)).toContainText('Pode fechar: o resumo abre quando o envio terminar.');
  // ENV-05 é silêncio: o modal aberto já é a resposta. Nada de “Atualizar status”.
  await expect(toasts(page)).toHaveCount(0);
  await expect(progresso(page).getByRole('button', { name: /Atualizar/ })).toHaveCount(0);

  // O que foi para a Conexão: um Envio por idioma, com as linhas de sempre.
  const [ingles, russo] = await enviosCriados(fakes, 2);
  expect(ingles.lang).toBe('en');
  expect(ingles.entries.map(e => e.phraseId)).toEqual([SACK.id, ARM.id]);
  expect(ingles.entries[0].line).toBe('sack : She hit the sack early. [Contexto: netflix - Desconhecido - Desconhecido]');
  expect(ingles.corpo.deckName).toBeTruthy();
  expect(russo.lang).toBe('ru');
  expect(russo.entries.map(e => e.phraseId)).toEqual([RUSSA.id]);
  // Enviar não regrava os ajustes de envio (o “Presets salvos” de hoje sai).
  expect((await extensao.lerStorage('ankiBridgePresets')).ankiBridgePresets).toBeUndefined();

  await expect(envio(page, 'Envio em inglês · 2 frases')).toContainText('Na fila');
  await expect(envio(page, 'Envio em inglês · 2 frases')).toContainText('atualizado agora');
});

test('o cartão mostra a etapa com nome de gente, a barra, “atualizado há 1 min” e o técnico em Detalhes', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto]);
  const [job] = await enviosCriados(fakes, 1);

  fakes.anki.moverEnvio(job.jobId, {
    stage: 'generate_audio',
    progress: { done: 1, total: 2 },
    atualizadoEm: new Date(AGORA.getTime() - 60_000),
  });

  const cartaoDoEnvio = envio(page, 'Envio em inglês · 1 frase');
  await expect(cartaoDoEnvio).toContainText('Gerando áudio', { timeout: 10_000 });
  await expect(cartaoDoEnvio).toContainText('atualizado há 1 min');
  // As 7 etapas do caminho, em segmentos: diz quanto falta.
  await expect(cartaoDoEnvio).toContainText('etapa 4 de 7');
  await expect(cartaoDoEnvio.locator('.envio-cartao__etapas > i')).toHaveCount(7);
  // O nome cru da etapa só existe dentro do Detalhes recolhido.
  await expect(cartaoDoEnvio.getByText(/generate_audio/)).toBeHidden();
  const barra = cartaoDoEnvio.getByRole('progressbar');
  // Etapa 4 de 7 pela metade: nem a barra falsa de hoje, nem 0 nem 100.
  const valor = Number(await barra.getAttribute('aria-valuenow'));
  expect(valor).toBeGreaterThan(40);
  expect(valor).toBeLessThan(60);

  // Detalhes: o jobId, o stage cru e a hora ISO, recolhidos.
  const detalhes = cartaoDoEnvio.locator('details');
  await expect(detalhes.locator('pre')).toBeHidden();
  await detalhes.getByText('Detalhes').click();
  await expect(detalhes.locator('pre')).toContainText(job.jobId);
  await expect(detalhes.locator('pre')).toContainText('generate_audio');
  await expect(detalhes.locator('pre')).toContainText('2026-09-18T');
});

test('um Envio na fila sem hora da Conexão ainda mostra a hora ISO em Detalhes', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  fakes.anki.responder('GET', '/jobs', () => ({
    json: { jobs: fakes.anki.envios.map(e => ({ jobId: e.jobId, lang: e.lang, status: 'queued', state: { status: 'queued', stage: 'queued' } })) },
  }));
  await marcarEEnviar(page, [SACK.texto]);
  const [job] = await enviosCriados(fakes, 1);

  const detalhes = envio(page, 'Envio em inglês · 1 frase').locator('details');
  await detalhes.getByText('Detalhes').click();
  await expect(detalhes.locator('pre')).toContainText(job.jobId);
  await expect(detalhes.locator('pre')).toContainText(AGORA.toISOString());
});

test('sem notícia da Conexão durante o envio, o modal diz que está tentando de novo, e volta quando ela responde', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto]);
  const [job] = await enviosCriados(fakes, 1);

  fakes.anki.responder('GET', '/jobs', async () => ({ status: 503, json: {} }));
  await expect(progresso(page)).toContainText('Sem resposta da conexão com o Anki. Tentando de novo…', { timeout: 10_000 });

  fakes.anki.pararDeResponder('GET', '/jobs');
  fakes.anki.moverEnvio(job.jobId, { stage: 'send_to_anki' });
  await expect(envio(page, 'Envio em inglês · 1 frase')).toContainText('Enviando ao Anki', { timeout: 10_000 });
  await expect(progresso(page).getByText('Sem resposta da conexão com o Anki. Tentando de novo…')).toBeHidden();
});

test('um Envio que fica em parte enquanto o outro anda mostra Continuar envio, que o retoma', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, ARM.texto, RUSSA.texto]);
  const [ingles, russo] = await enviosCriados(fakes, 2);

  fakes.anki.moverEnvio(russo.jobId, { stage: 'generate_cards' });
  fakes.anki.concluirEnvio(ingles.jobId, { falhas: [ARM.id] });

  const cartaoIngles = envio(page, 'Envio em inglês · 2 frases');
  await expect(cartaoIngles).toContainText('Concluído em parte', { timeout: 10_000 });
  await cartaoIngles.getByRole('button', { name: 'Continuar envio' }).click();

  await expect.poll(() => fakes.anki.requisicoes.some(r => r.metodo === 'POST' && r.caminho === `/jobs/${ingles.jobId}/retry`)).toBe(true);
  await expect(cartaoIngles).toContainText('Na fila');
  await expect(cartaoIngles.getByRole('button', { name: 'Continuar envio' })).toHaveCount(0);
  await expect(toasts(page)).toHaveText('Envio retomado');
});

test('um Envio parado porque o Windows não deixou fechar o Anki diz o que fazer, com Continuar envio', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, RUSSA.texto]);
  const [ingles, russo] = await enviosCriados(fakes, 2);

  fakes.anki.moverEnvio(russo.jobId, { stage: 'generate_cards' });
  fakes.anki.concluirEnvio(ingles.jobId, { erro: 'AnkiRepairBlockedError', ankiError: 'repair_access_denied' });

  const cartaoIngles = envio(page, 'Envio em inglês · 1 frase');
  await expect(cartaoIngles).toContainText('Não concluído', { timeout: 10_000 });
  // O cartão diz o que fazer numa frase curta, sem caixa de erro, e a ação vem logo embaixo.
  await expect(cartaoIngles).toContainText('O Windows não deixou fechar o Anki. Feche o Anki pelo Gerenciador de Tarefas');
  await expect(cartaoIngles.getByRole('alert')).toHaveCount(0);
  await expect(cartaoIngles.getByRole('button', { name: 'Continuar envio' })).toHaveCount(1);
  // A próxima leitura da Conexão demora: o aviso sai na hora do Continuar envio, não nela.
  fakes.anki.responder('GET', '/jobs', () => new Promise(() => {}));
  await cartaoIngles.getByRole('button', { name: 'Continuar envio' }).click();
  await expect.poll(() => fakes.anki.requisicoes.some(r => r.metodo === 'POST' && r.caminho === `/jobs/${ingles.jobId}/retry`)).toBe(true);
  await expect(cartaoIngles).toContainText('Na fila');
  await expect(cartaoIngles).not.toContainText('O Windows não deixou fechar o Anki');
});

test('bug #9: o POST do envio caindo na rede mostra o erro com Tentar de novo, e EN ok + RU falho mostra cada Envio', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  fakes.anki.recusarEnvios('ru', { rede: true });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, RUSSA.texto]);

  // O inglês começou e aparece; o russo não começou e diz por quê, no próprio cartão.
  const cartaoIngles = envio(page, 'Envio em inglês · 1 frase');
  const cartaoRusso = envio(page, 'Envio em russo · 1 frase');
  await expect(cartaoIngles).toContainText('Na fila');
  await expect(cartaoRusso).toContainText('Não começou');
  await expect(cartaoRusso).toContainText('Não começou');
  await expect(cartaoRusso).toContainText('A conexão com o Anki não respondeu. Confira se ela está ligada.');
  expect(fakes.anki.enviosEm('en')).toHaveLength(1);
  expect(fakes.anki.enviosEm('ru')).toHaveLength(0);

  fakes.anki.aceitarEnvios('ru');
  await cartaoRusso.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect.poll(() => fakes.anki.enviosEm('ru').length).toBe(1);
  await expect(cartaoRusso).toContainText('Na fila');
  await expect(cartaoRusso).not.toContainText('Não começou');
  // O inglês não foi mandado de novo.
  expect(fakes.anki.enviosEm('en')).toHaveLength(1);
});

test('se a leitura dos ajustes falha, o envio não começa e Tentar de novo o cria uma vez', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [SACK], ankiBridgePresets: { en: { deckName: 'Especial' } } });
  await abrirPainel(page, extensao);
  await page.evaluate(() => {
    const ler = chrome.storage.local.get.bind(chrome.storage.local);
    let falhou = false;
    chrome.storage.local.get = (chaves, callback) => {
      if (!falhou && chaves && typeof chaves === 'object' && 'ankiBridgePresets' in chaves) {
        falhou = true;
        Object.defineProperty(chrome.runtime, 'lastError', { configurable: true, value: { message: 'Falha de leitura' } });
        try { callback(undefined); } finally { delete chrome.runtime.lastError; }
        return;
      }
      return ler(chaves, callback);
    };
  });

  await marcarEEnviar(page, [SACK.texto]);
  const cartaoIngles = envio(page, 'Envio em inglês · 1 frase');
  await expect(cartaoIngles).toContainText('Não começou');
  await expect(cartaoIngles).toContainText('Não deu para ler os ajustes de envio. Tente de novo.');
  await cartaoIngles.locator('details').getByText('Detalhes').click();
  await expect(cartaoIngles.locator('details pre')).toContainText('Falha de leitura');
  expect(fakes.anki.envios).toHaveLength(0);
  await expect.poll(async () => (await extensao.lerStorage('pm_envio')).pm_envio?.envios?.[0]?.falhaAoCriar?.causa).toBe('Falha de leitura');

  await cartaoIngles.getByRole('button', { name: 'Tentar de novo' }).click();
  const [job] = await enviosCriados(fakes, 1);
  await expect(cartaoIngles).toContainText('Na fila');
  expect(job.corpo.deckName).toBe('Especial');
  expect(fakes.anki.requisicoes.filter(r => r.metodo === 'POST' && r.caminho === '/jobs')).toHaveLength(1);
});

test('a Conexão respondendo com erro ao criar o envio mostra ENV-03, com o status em Detalhes', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  fakes.anki.recusarEnvios('en', { status: 500, erro: 'deck_missing' });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto]);

  const cartaoIngles = envio(page, 'Envio em inglês · 1 frase');
  await expect(cartaoIngles).toContainText('Não começou');
  await expect(cartaoIngles).toContainText('A conexão com o Anki respondeu com erro.');
  await cartaoIngles.locator('details').getByText('Detalhes').click();
  await expect(cartaoIngles.locator('details pre')).toContainText('500');
  await expect(cartaoIngles.locator('details pre')).toContainText('deck_missing');
  await expect(toasts(page)).toHaveCount(0);

  // Fechar um envio que nunca começou não deixa nada acompanhado para depois.
  await progresso(page).getByRole('button', { name: 'Fechar' }).click();
  await expect(progresso(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(cartao(page, SACK.texto)).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('EN termina com o RU sem começar: o progresso volta com o ENV-03, e o resumo só abre depois de fechá-lo', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  fakes.anki.recusarEnvios('ru');
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, RUSSA.texto]);
  const [ingles] = await enviosCriados(fakes, 1);
  await progresso(page).getByRole('button', { name: 'Fechar' }).click();

  fakes.anki.concluirEnvio(ingles.jobId);
  // O russo que não começou não some dentro do resumo: o progresso reabre com ele.
  await expect(envio(page, 'Envio em russo · 1 frase')).toContainText('A conexão com o Anki respondeu com erro.', { timeout: 10_000 });
  await expect(envio(page, 'Envio em inglês · 1 frase')).toContainText('Concluído');
  await page.waitForTimeout(2500);
  await expect(resumo(page)).toHaveCount(0);

  await progresso(page).getByRole('button', { name: 'Fechar' }).click();
  await expect(resumo(page)).toHaveAccessibleName('Envio concluído em parte', { timeout: 10_000 });
  await expect(baralho(page, 'Russo')).toContainText('1 não entrou');
});

test('enviar de novo as frases de um Envio que não começou não cria um Envio a mais', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  fakes.anki.recusarEnvios('ru');
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, RUSSA.texto]);
  await enviosCriados(fakes, 1);
  await progresso(page).getByRole('button', { name: 'Fechar' }).click();

  await enviarAoAnki(page).click();
  await expect(progresso(page).getByRole('group', { name: /^Envio em/ })).toHaveCount(2);
  await page.waitForTimeout(500);
  expect(fakes.anki.requisicoes.filter(r => r.metodo === 'POST' && r.caminho === '/jobs')).toHaveLength(2);
});

test('uma frase em cirílico gravada sem idioma vai no Envio em russo, como a lista a mostra', async ({ page, extensao, fakes }) => {
  const semIdioma = { ...RUSSA, idioma: undefined };
  await extensao.gravarStorage({ frases: [SACK, semIdioma] });
  await abrirPainel(page, extensao);

  await marcarEEnviar(page, [SACK.texto, RUSSA.texto]);

  await expect(envio(page, 'Envio em russo · 1 frase')).toBeVisible();
  const [, russo] = await enviosCriados(fakes, 2);
  expect(russo.lang).toBe('ru');
  expect(russo.entries.map(e => e.phraseId)).toEqual([RUSSA.id]);
});

test('bug #9: duplo clique em Enviar ao Anki cria um Envio por idioma, não dois', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  await abrirPainel(page, extensao);
  await marcar(page, SACK.texto).check();
  await marcar(page, RUSSA.texto).check();

  await enviarAoAnki(page).dblclick();

  await expect(progresso(page)).toBeVisible();
  await enviosCriados(fakes, 2);
  await page.waitForTimeout(500);
  expect(fakes.anki.enviosEm('en')).toHaveLength(1);
  expect(fakes.anki.enviosEm('ru')).toHaveLength(1);
});

test('enviar de novo as mesmas frases enquanto o Envio anda só reabre o progresso', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto]);
  await enviosCriados(fakes, 1);

  await progresso(page).getByRole('button', { name: 'Fechar' }).click();
  await enviarAoAnki(page).click();
  await expect(progresso(page)).toBeVisible();
  await page.waitForTimeout(500);
  expect(fakes.anki.envios).toHaveLength(1);
});

test('bug #9: as duplicatas do Anki aparecem como “já estavam no Anki”, não como enviadas', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, INGLESAS.map(f => f.texto));
  const [job] = await enviosCriados(fakes, 1);

  fakes.anki.concluirEnvio(job.jobId, { duplicadas: [LATE.id] });

  await expect(resumo(page)).toBeVisible({ timeout: 10_000 });
  await expect(resumo(page)).toHaveAccessibleName('Envio concluído');
  await expect(resumo(page)).toContainText('3 frases · 1 baralho');
  await expect(baralho(page, 'Inglês')).toContainText('+2 cartões');
  await expect(baralho(page, 'Inglês')).toContainText('no baralho CIMV');
  await expect(baralho(page, 'Inglês')).toContainText('1 já estava lá');
  await expect(baralho(page, 'Inglês')).not.toContainText('não entr');
  await expect(resumo(page)).toContainText('Tirar as 2 enviadas do histórico?');
  await expect(resumo(page)).toContainText('Elas já estão no Anki. Manter deixa no histórico, marcadas como enviadas.');
  await expect(resumo(page).getByRole('button', { name: 'Tirar do histórico' })).toBeFocused();
});

test('Apagar as N enviadas apaga só as que viraram cartão agora, marca as que já estavam, e dá o toast ENV-11', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, INGLESAS.map(f => f.texto));
  const [job] = await enviosCriados(fakes, 1);

  fakes.anki.concluirEnvio(job.jobId, { duplicadas: [LATE.id] });
  await resumo(page).getByRole('button', { name: 'Tirar do histórico' }).click({ timeout: 10_000 });

  await expect(resumo(page)).toHaveCount(0);
  await expect(toasts(page)).toHaveText('2 frases apagadas');
  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([LATE.texto, RUSSA.texto]);
  const gravadas = await extensao.frases();
  expect(gravadas.find(f => f.id === LATE.id).status).toBe('enviadaAoAnki');
  expect(gravadas.find(f => f.id === RUSSA.id).status).toBeUndefined();
  await expect(cartao(page, LATE.texto)).toContainText('Enviada ao Anki');
  // Apagadas pelo caminho de sempre: o tombstone impede que voltem pela nuvem.
  const tombstones = await page.evaluate(() => new Promise(r => chrome.storage.sync.get(null, r)));
  expect(Object.keys(tombstones)).toEqual(expect.arrayContaining([`pm_del_${SACK.id}`, `pm_del_${ARM.id}`]));
});

test('uma frase que a Conexão dá como enviada e como falha conta como falha, e Apagar a deixa no histórico com as palavras', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, INGLESAS.map(f => f.texto));
  const [job] = await enviosCriados(fakes, 1);

  // A Conexão responde a frase nas duas listas: a falha vale, ela não é apagada.
  fakes.anki.concluirEnvio(job.jobId);
  fakes.anki.responder('GET', '/jobs', () => ({
    json: {
      jobs: fakes.anki.envios.map(e => ({
        jobId: e.jobId,
        lang: e.lang,
        status: 'partial',
        state: { ...e.state, status: 'partial', stage: 'partial', failedPhraseIds: [SACK.id] },
      })),
    },
  }));

  await expect(resumo(page)).toHaveAccessibleName('Envio concluído em parte', { timeout: 10_000 });
  await expect(baralho(page, 'Inglês')).toContainText('+2 cartões');
  await expect(baralho(page, 'Inglês')).toContainText('1 não entrou');
  await expect(resumo(page)).toContainText('Tirar as 2 enviadas do histórico?');
  await resumo(page).getByRole('button', { name: 'Tirar do histórico' }).click();

  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([SACK.texto]);
  expect((await extensao.frases())[0].keywords).toEqual(['sack@3']);
});

test('a única enviada apagada no meio do envio: nada para tirar do histórico, o resumo diz por quê, e não há toast de 0 apagadas', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto]);
  const [job] = await enviosCriados(fakes, 1);
  await page.keyboard.press('Escape');
  await expect(progresso(page)).toHaveCount(0);

  await cartao(page, SACK.texto).getByRole('button', { name: 'Apagar frase', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar frase' }).click();
  await expect(cartao(page, SACK.texto)).toHaveCount(0);

  fakes.anki.concluirEnvio(job.jobId);
  await expect(resumo(page)).toBeVisible({ timeout: 10_000 });
  await expect(baralho(page, 'Inglês')).toContainText('+1 cartão');
  await expect(resumo(page)).toContainText('Nada para tirar do histórico.');
  await expect(resumo(page)).toContainText('1 enviada você já tinha apagado.');
  await expect(resumo(page).getByRole('button', { name: 'Tirar do histórico' })).toHaveCount(0);
  await expect(resumo(page).getByRole('button', { name: 'Pronto' })).toBeFocused();
  await resumo(page).getByRole('button', { name: 'Pronto' }).click();
  await expect(resumo(page)).toHaveCount(0);
  await expect(toasts(page)).toHaveCount(0);
});

test('com uma das enviadas apagada no meio, o resumo oferece tirar a que sobrou e conta a que você já tinha apagado', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, ARM.texto]);
  const [job] = await enviosCriados(fakes, 1);
  await page.keyboard.press('Escape');
  await cartao(page, SACK.texto).getByRole('button', { name: 'Apagar frase', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar frase' }).click();
  await expect(cartao(page, SACK.texto)).toHaveCount(0);

  fakes.anki.concluirEnvio(job.jobId);
  await expect(resumo(page)).toContainText('Tirar a enviada do histórico?', { timeout: 10_000 });
  await expect(resumo(page)).toContainText('Ela já está no Anki. Manter deixa no histórico, marcada como enviada.');
  await expect(resumo(page)).toContainText('1 enviada você já tinha apagado.');
  await resumo(page).getByRole('button', { name: 'Tirar do histórico' }).click();

  await expect(toasts(page)).toHaveText('1 frase apagada');
  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([LATE.texto]);
});

test('o bloco do idioma mostra o baralho com os níveis separados por ›, nunca o :: do Anki', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({
    frases: INGLESAS,
    ankiBridgePresets: { en: { deckName: 'Inglês::Mineradas', imageSource: '1', ttsWordTld: 'com', ttsPhraseTld: 'co.uk' }, ru: { deckName: 'RUSSIAN', imageSource: '1', ttsWordTld: 'ru', ttsPhraseTld: 'ru' } },
  });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto]);
  const [job] = await enviosCriados(fakes, 1);
  expect(job.corpo.deckName).toBe('Inglês::Mineradas');

  fakes.anki.concluirEnvio(job.jobId);
  await expect(baralho(page, 'Inglês')).toContainText('no baralho Inglês › Mineradas', { timeout: 10_000 });
  await expect(resumo(page)).not.toContainText('::');
});

test('Manter marca as enviadas e as que já estavam como Enviada ao Anki, sem toast, e não limpa a seleção', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [...INGLESAS.map(f => f.texto), RUSSA.texto]);
  const [ingles, russo] = await enviosCriados(fakes, 2);

  fakes.anki.concluirEnvio(ingles.jobId, { duplicadas: [LATE.id], falhas: [ARM.id] });
  fakes.anki.concluirEnvio(russo.jobId);

  await expect(resumo(page)).toHaveAccessibleName('Envio concluído em parte', { timeout: 10_000 });
  await expect(baralho(page, 'Inglês')).toContainText('+1 cartão');
  await expect(baralho(page, 'Inglês')).toContainText('1 já estava lá');
  await expect(baralho(page, 'Inglês')).toContainText('1 não entrou');
  await expect(baralho(page, 'Russo')).toContainText('+1 cartão');
  await expect(baralho(page, 'Russo')).not.toContainText('não entr');
  await expect(baralho(page, 'Russo').getByRole('button', { name: 'Tentar de novo' })).toHaveCount(0);
  await resumo(page).getByRole('button', { name: 'Manter' }).click();

  await expect(resumo(page)).toHaveCount(0);
  await expect.poll(async () => (await extensao.frases()).filter(f => f.status === 'enviadaAoAnki').map(f => f.id).sort())
    .toEqual([SACK.id, LATE.id, RUSSA.id].sort());
  expect((await extensao.frases()).find(f => f.id === ARM.id).status).toBeUndefined();
  await expect(toasts(page)).toHaveCount(0);
  // bug #9: a conclusão do envio limpava a seleção.
  await expect(page.locator('#frases-barra')).toContainText('4 selecionadas');
});

test('fechar o resumo pelo × é o mesmo que Manter', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto]);
  const [job] = await enviosCriados(fakes, 1);
  fakes.anki.concluirEnvio(job.jobId);

  await expect(resumo(page)).toContainText('Tirar a enviada do histórico?', { timeout: 10_000 });
  await expect(resumo(page).getByRole('button', { name: 'Tirar do histórico' })).toBeVisible();
  await resumo(page).getByRole('button', { name: 'Fechar' }).click();

  await expect.poll(async () => (await extensao.frases()).find(f => f.id === SACK.id).status).toBe('enviadaAoAnki');
  await expect(toasts(page)).toHaveCount(0);
  // O resumo já foi respondido: recarregar não o traz de volta.
  await page.reload();
  await expect(cartao(page, SACK.texto)).toContainText('Enviada ao Anki');
  await page.waitForTimeout(2500);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Tentar de novo no bloco do idioma retoma só aquele Envio, e o resumo seguinte conta o que virou cartão', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, RUSSA.texto]);
  const [ingles, russo] = await enviosCriados(fakes, 2);
  fakes.anki.concluirEnvio(ingles.jobId);
  fakes.anki.concluirEnvio(russo.jobId, { erro: 'anki_timeout' });

  await expect(baralho(page, 'Russo')).toContainText('1 não entrou', { timeout: 10_000 });
  await expect(baralho(page, 'Inglês').getByRole('button', { name: 'Tentar de novo' })).toHaveCount(0);
  await baralho(page, 'Russo').getByRole('button', { name: 'Tentar de novo' }).click();

  await expect(progresso(page)).toBeVisible();
  await expect.poll(() => fakes.anki.requisicoes.some(r => r.caminho === `/jobs/${russo.jobId}/retry`)).toBe(true);
  // O inglês, que deu certo, não é retomado.
  expect(fakes.anki.requisicoes.some(r => r.caminho === `/jobs/${ingles.jobId}/retry`)).toBe(false);
  await expect(envio(page, 'Envio em russo · 1 frase')).toContainText('Na fila');

  fakes.anki.concluirEnvio(russo.jobId);
  await expect(resumo(page)).toHaveAccessibleName('Envio concluído', { timeout: 10_000 });
  await expect(baralho(page, 'Inglês')).toContainText('+1 cartão');
  await expect(baralho(page, 'Russo')).toContainText('+1 cartão');
  await expect(resumo(page)).toContainText('Tirar as 2 enviadas do histórico?');
});

test('o resumo espera o outro modal aberto fechar', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto]);
  const [job] = await enviosCriados(fakes, 1);
  await progresso(page).getByRole('button', { name: 'Fechar' }).click();

  // Outro modal aberto (Editar contexto) quando o envio termina.
  await cartao(page, ARM.texto).hover();
  await cartao(page, ARM.texto).getByRole('button', { name: 'Editar contexto' }).click();
  const contexto = page.getByRole('dialog', { name: 'Editar contexto' });
  await expect(contexto).toBeVisible();
  const leituras = () => fakes.anki.requisicoes.filter(r => r.metodo === 'GET' && r.caminho === '/jobs').length;
  const antes = leituras();
  fakes.anki.concluirEnvio(job.jobId);
  // O painel já leu o fim do envio, e o resumo continua esperando.
  await expect.poll(leituras, { timeout: 10_000 }).toBeGreaterThan(antes);
  await page.waitForTimeout(2500);
  await expect(resumo(page)).toHaveCount(0);
  await expect(contexto).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(resumo(page)).toBeVisible();
});

test('bug #9: recarregar com um Envio em andamento não o perde, e o resumo abre em Configurações', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, RUSSA.texto]);
  const [ingles, russo] = await enviosCriados(fakes, 2);
  fakes.anki.concluirEnvio(ingles.jobId);

  await page.reload();
  await page.goto(extensao.url('painel.html#configuracoes'));
  await expect(page.getByRole('heading', { level: 1, name: 'Configurações' })).toBeVisible();
  // Recarregar não reabre o progresso: o acompanhamento segue sem modal.
  await expect(progresso(page)).toHaveCount(0);

  fakes.anki.concluirEnvio(russo.jobId, { duplicadas: [RUSSA.id] });
  await expect(resumo(page)).toBeVisible({ timeout: 10_000 });
  await expect(baralho(page, 'Inglês')).toContainText('+1 cartão');
  await expect(baralho(page, 'Russo')).toContainText('1 já estava lá');
  await resumo(page).getByRole('button', { name: 'Manter' }).click();
  await expect.poll(async () => (await extensao.frases()).filter(f => f.status === 'enviadaAoAnki').length).toBe(2);
});

test('na Boas-vindas o resumo espera: ele abre quando a pessoa vai ao painel', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto]);
  const [job] = await enviosCriados(fakes, 1);
  await progresso(page).getByRole('button', { name: 'Fechar' }).click();

  await page.goto(extensao.url('painel.html#boas-vindas'));
  await expect(page.locator('.bv-card h2')).toHaveText('Boas-vindas ao PerpetualMiner');
  const leiturasDosEnvios = () => fakes.anki.requisicoes.filter(r => r.caminho === '/jobs').length;
  const antes = leiturasDosEnvios();
  fakes.anki.concluirEnvio(job.jobId);
  // A volta do acompanhamento que vê o Envio terminado, e a seguinte, sem o
  // resumo por cima da página.
  await expect.poll(leiturasDosEnvios, { timeout: 10_000 }).toBeGreaterThan(antes);
  await page.waitForTimeout(2500);
  await expect(resumo(page)).toHaveCount(0);
  await expect(progresso(page)).toHaveCount(0);

  await page.locator('.bv-card').getByRole('button', { name: 'Pular a configuração' }).click();
  await expect(resumo(page)).toBeVisible({ timeout: 10_000 });
});

test('o resumo abre na área da Conexão com o Anki também', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto]);
  const [job] = await enviosCriados(fakes, 1);
  await progresso(page).getByRole('button', { name: 'Fechar' }).click();
  await page.locator('.shell-item[data-area="anki"]').click();

  fakes.anki.concluirEnvio(job.jobId);
  await expect(resumo(page)).toBeVisible({ timeout: 10_000 });
});

test('com a Conexão desligada, Enviar ao Anki fica indisponível e o tooltip diz por quê', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: INGLESAS });
  fakes.anki.desligar();
  await abrirPainel(page, extensao);
  await marcar(page, SACK.texto).check();

  const botao = enviarAoAnki(page);
  await expect(botao).toHaveAttribute('aria-disabled', 'true');
  // Discreto: nada fica na barra o tempo todo; o porquê só aparece ao passar o mouse (ou com o foco).
  await expect(page.getByRole('tooltip')).toBeHidden();
  await expect(page.locator('#frases-barra')).not.toContainText('Conexão desligada');
  const porque = 'Indisponível: a conexão com o Anki está desligada. Ligue-a neste computador para enviar.';
  await expect(botao).toHaveAccessibleDescription(porque);
  await botao.hover();
  await expect(page.getByRole('tooltip')).toHaveText(porque);
  // aria-disabled: o Playwright esperaria o botão “habilitar”; o clique de verdade acontece.
  await botao.click({ force: true });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // O clique não deixa o tooltip preso: com o mouse fora, ele some.
  await page.mouse.move(0, 0);
  await expect(page.getByRole('tooltip')).toBeHidden();
  // Continua focável (aria-disabled, não disabled), e o tooltip aparece no foco pelo teclado também.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(botao).toBeFocused();
  await expect(page.getByRole('tooltip')).toBeVisible();
  expect(fakes.anki.requisicoes.filter(r => r.caminho === '/jobs')).toHaveLength(0);

  // A Conexão volta: o botão volta junto, sem recarregar.
  fakes.anki.ligar();
  await pedirConferenciaDaConexao(page);
  await expect(botao).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('os modais do envio têm nome, foco dentro e foco visível; Esc fecha o progresso', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  fakes.anki.recusarEnvios('ru');
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, RUSSA.texto]);

  await expect(progresso(page)).toHaveAttribute('aria-modal', 'true');
  const focoAparece = async controle => {
    await controle.focus();
    const contorno = await controle.evaluate(el => {
      const estilo = getComputedStyle(el);
      return (estilo.outlineStyle !== 'none' && parseFloat(estilo.outlineWidth) > 0) || estilo.boxShadow !== 'none';
    });
    expect(contorno, await controle.evaluate(el => el.outerHTML.slice(0, 80))).toBe(true);
  };
  await page.keyboard.press('Tab');
  await focoAparece(envio(page, 'Envio em russo · 1 frase').getByRole('button', { name: 'Tentar de novo' }));
  await focoAparece(progresso(page).getByRole('button', { name: 'Fechar' }));
  await focoAparece(envio(page, 'Envio em inglês · 1 frase').locator('summary'));

  await page.keyboard.press('Escape');
  await expect(progresso(page)).toHaveCount(0);
  await expect(enviarAoAnki(page)).toBeFocused();

  const [job] = fakes.anki.envios;
  fakes.anki.concluirEnvio(job.jobId);
  // O russo não começou: o progresso volta com ele; fechar abre o resumo.
  await expect(progresso(page)).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');
  await expect(resumo(page)).toBeVisible({ timeout: 10_000 });
  await expect(resumo(page)).toHaveAttribute('aria-modal', 'true');
  for (const nome of ['Manter', 'Tirar do histórico', 'Tentar de novo']) {
    await focoAparece(resumo(page).getByRole('button', { name: nome }));
  }
});

test('com movimento reduzido, as etapas do envio andam sem animação', async ({ page, extensao, fakes }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await extensao.gravarStorage({ frases: INGLESAS });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto]);
  await enviosCriados(fakes, 1);

  const preenchimento = envio(page, 'Envio em inglês · 1 frase').locator('.envio-cartao__etapas > i > b');
  await transicaoCurta(preenchimento);
});
