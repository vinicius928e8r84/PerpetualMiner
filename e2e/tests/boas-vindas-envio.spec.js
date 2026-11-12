'use strict';

// Boas-vindas · o primeiro Envio (#173, ONB-23): ao chegar ao último passo o Envio começa sozinho, com 1 Cartão (a Frase minerada mais recente, ou uma Frase de
// teste do idioma), e a tela mostra só “Enviando…” e depois o Cartão enviado, como o Anki o mostra, com o Baralho, Abrir no Anki e Concluir; na falha,
// “Este cartão não foi”, o motivo, Tentar de novo e Trocar a chave. A configuração só termina quando o Cartão chega ao Anki. A Conexão com o Anki é
// falsificada na fronteira HTTP (e2e/fakes/anki.js; o contrato `exemplos.json`, `exemplos-da-previa.json` e `exemplos-do-navegador.json`).

const { test, expect } = require('../fixtures');
const { estadoFinal } = require('../estado-final');
const { INGLESAS, RUSSA, enviosCriados } = require('../apoio-do-envio');

const SO_O_INGLES = { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } };
const SO_O_RUSSO = { en: { enabled: false, dailyLimit: 20 }, ru: { enabled: true, dailyLimit: 20 } };
const [MAIS_RECENTE] = INGLESAS;

const lista = page => page.getByRole('navigation', { name: 'Passos da configuração' });
const card = page => page.locator('.bv-card');
// O texto do passo (o card guarda o de todos os passos, escondidos).
const passo = page => page.locator('.bv-envio');
const botao = (page, nome) => card(page).getByRole('button', { name: nome, exact: true });
const cartao = page => passo(page).locator('.previa').frameLocator('iframe').locator('body');
const RUSSA_MAIS_NOVA = { ...RUSSA, id: MAIS_RECENTE.id + 10 };
const idDoCartao = envio => `${envio.entries[0].phraseId}-0`;

async function abrirOEnvio(page, extensao, { frases = [], automatica = SO_O_INGLES, gravado = {} } = {}) {
  await extensao.gravarStorage({ frases, pm_auto_miner_settings: automatica, ...gravado });
  await page.goto(extensao.url('painel.html#boas-vindas/envio'));
  await expect(card(page).getByRole('heading', { level: 2 })).toHaveText('Enviar o primeiro cartão');
}

/** A Conexão grava o Cartão: o Envio anda e termina com ele no Anki. */
function chegarAoAnki(fakes, envio) {
  fakes.anki.moverEnvio(envio.jobId, { stage: 'send_to_anki', cartoes: { [idDoCartao(envio)]: 'added' } });
  fakes.anki.concluirEnvio(envio.jobId);
}

test('com uma Frase minerada, o Envio começa sozinho com a mais recente e a tela só diz “Enviando…”, sem etapas, custo nem estimativa', async ({ page, extensao, fakes }) => {
  await abrirOEnvio(page, extensao, { frases: [INGLESAS[2], MAIS_RECENTE, INGLESAS[1]] });

  const [envio] = await enviosCriados(fakes, 1);
  expect(envio.entries).toEqual([{ phraseId: MAIS_RECENTE.id, line: 'sack : She hit the sack early. [Contexto: netflix - Desconhecido - Desconhecido]' }]);
  expect(envio.corpo.teste).toBeUndefined();
  await expect(passo(page)).toContainText('Enviando…');
  await expect(passo(page)).not.toContainText(/etapa|US\$|custo|estimativa|Criando cartões/i);
  await expect(botao(page, 'Continuar')).toHaveCount(0);
  // O pedido fica congelado: é ele que um passo repetido manda de novo.
  await estadoFinal(extensao, { pm_boas_vindas: { primeiroEnvio: { corpo: { jobId: envio.jobId, lang: 'en', entries: [{ phraseId: MAIS_RECENTE.id }] } } } });
});

test('o Cartão chega ao Anki: “Cartão enviado ao Anki”, o Cartão como o Anki o mostra, o Baralho, e a configuração fica com o passo feito', async ({ page, extensao, fakes }) => {
  await abrirOEnvio(page, extensao, { frases: [MAIS_RECENTE] });
  const [envio] = await enviosCriados(fakes, 1);

  chegarAoAnki(fakes, envio);

  await expect(passo(page)).toContainText('Cartão enviado ao Anki');
  await expect(passo(page).locator('.bv-envio__baralho')).toHaveText('CIMV');
  await expect(passo(page).locator('.previa')).toContainText('O seu cartão, como o Anki mostra.');
  await expect(cartao(page)).toContainText('She gave up smoking');
  await expect(passo(page)).not.toContainText('cartão de teste');
  await expect(botao(page, 'Abrir no Anki')).toBeVisible();
  await expect(lista(page).getByRole('button', { name: /^Enviar o primeiro cartão/ })).toHaveAccessibleName(/feito$/);
  const guid = (await fakes.anki.requisicoes.filter(r => r.caminho === '/anki/card-preview').at(-1)).dados.guid;
  expect(guid).toMatch(/^pm/);
  await estadoFinal(extensao, { pm_boas_vindas: { primeiroEnvio: { chegou: true, guid } } });
});

test('Abrir no Anki pede à Conexão o navegador do Anki na nota do Cartão', async ({ page, extensao, fakes }) => {
  await abrirOEnvio(page, extensao, { frases: [MAIS_RECENTE] });
  const [envio] = await enviosCriados(fakes, 1);
  chegarAoAnki(fakes, envio);
  await expect(botao(page, 'Abrir no Anki')).toBeVisible();

  await botao(page, 'Abrir no Anki').click();

  await expect.poll(() => fakes.anki.abertosNoAnki()).toHaveLength(1);
  const { guid } = (await extensao.lerStorage('pm_boas_vindas')).pm_boas_vindas.primeiroEnvio;
  expect(fakes.anki.abertosNoAnki()).toEqual([guid]);
  await expect(passo(page).getByRole('alert')).toBeHidden();
  await estadoFinal(extensao, { pm_boas_vindas: { primeiroEnvio: { chegou: true, guid } } });
});

test('Abrir no Anki que não abre diz o que houve e deixa tentar de novo', async ({ page, extensao, fakes }) => {
  await abrirOEnvio(page, extensao, { frases: [MAIS_RECENTE] });
  const [envio] = await enviosCriados(fakes, 1);
  chegarAoAnki(fakes, envio);
  await expect(botao(page, 'Abrir no Anki')).toBeVisible();
  fakes.anki.responder('POST', '/anki/browse', () => ({ status: 404, json: { error: 'note_not_found' } }));

  await botao(page, 'Abrir no Anki').click();

  await expect(passo(page).getByRole('alert')).toContainText('Não deu para abrir o Anki. Tente de novo.');
  expect(fakes.anki.abertosNoAnki()).toEqual([]);
  await expect(botao(page, 'Abrir no Anki')).toBeEnabled();
  await estadoFinal(extensao, { pm_boas_vindas: { primeiroEnvio: { chegou: true } } });
});

test('Tudo pronto diz o primeiro cartão como “falta” antes de chegar e “enviado” depois; Concluir leva até lá', async ({ page, extensao, fakes }) => {
  await abrirOEnvio(page, extensao, { frases: [MAIS_RECENTE] });
  const [envio] = await enviosCriados(fakes, 1);
  chegarAoAnki(fakes, envio);

  await botao(page, 'Concluir').click();

  await expect(page).toHaveURL(/#boas-vindas\/pronto$/);
  await expect(card(page).getByRole('listitem').filter({ hasText: 'Enviar o primeiro cartão' })).toContainText('enviado');
  await estadoFinal(extensao, { pm_boas_vindas: { primeiroEnvio: { chegou: true } } });
});

test('sem nenhuma Frase minerada, o Envio é uma Frase de teste do idioma ligado, com o aviso da etiqueta', async ({ page, extensao, fakes }) => {
  await abrirOEnvio(page, extensao, { frases: [], automatica: SO_O_RUSSO });

  const [envio] = await enviosCriados(fakes, 1);
  expect(envio.corpo).toMatchObject({ lang: 'ru', teste: true });
  expect(envio.entries).toHaveLength(1);
  expect(envio.entries[0].line).toBe('приходила : Она приходила вчера. [Contexto: Teste - Boas-vindas - Primeiro cartão]');
  chegarAoAnki(fakes, envio);

  await expect(passo(page)).toContainText('Cartão enviado ao Anki');
  await expect(passo(page)).toContainText('este é um cartão de teste. Ele tem a etiqueta perpetualminer-teste no Anki, para você apagá-lo quando quiser.');
  await estadoFinal(extensao, { pm_boas_vindas: { primeiroEnvio: { chegou: true, corpo: { lang: 'ru', teste: true } } } });
});

test('sem Frase minerada nem idioma ligado, a Frase de teste é em inglês', async ({ page, extensao, fakes }) => {
  await abrirOEnvio(page, extensao, { frases: [], automatica: { en: { enabled: false, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } } });

  const [envio] = await enviosCriados(fakes, 1);
  expect(envio.corpo).toMatchObject({ lang: 'en', teste: true });
  expect(envio.entries[0].line).toBe('give up : She gave up smoking last year. [Contexto: Teste - Boas-vindas - Primeiro cartão]');
  await estadoFinal(extensao, { pm_boas_vindas: { primeiroEnvio: { corpo: { lang: 'en', teste: true } } } });
});

test('a Frase mais recente em inglês sem Palavra não serve: o Envio usa a mais recente que vira Cartão', async ({ page, extensao, fakes }) => {
  const semPalavra = { ...INGLESAS[1], id: MAIS_RECENTE.id + 20, keywords: [] };
  await abrirOEnvio(page, extensao, { frases: [MAIS_RECENTE, semPalavra] });

  const [envio] = await enviosCriados(fakes, 1);
  expect(envio.entries.map(entrada => entrada.phraseId)).toEqual([MAIS_RECENTE.id]);
  expect(envio.entries[0].line).toMatch(/^sack : /);
  await estadoFinal(extensao, { pm_boas_vindas: { primeiroEnvio: { corpo: { jobId: envio.jobId } } } });
});

test('só Frases em inglês sem Palavra: o Envio é a Frase de teste', async ({ page, extensao, fakes }) => {
  await abrirOEnvio(page, extensao, { frases: [INGLESAS[1], INGLESAS[2]] });

  const [envio] = await enviosCriados(fakes, 1);
  expect(envio.corpo).toMatchObject({ lang: 'en', teste: true });
  expect(envio.entries[0].line).toMatch(/^give up : /);
  chegarAoAnki(fakes, envio);

  await expect(passo(page)).toContainText('A sua frase ainda não tem a Palavra marcada, então este é um cartão de teste.');
  await expect(passo(page)).not.toContainText('Você ainda não minerou nenhuma frase');
  await estadoFinal(extensao, { pm_boas_vindas: { primeiroEnvio: { corpo: { teste: true } } } });
});

test('um Envio sem Cartão nenhum solta o pedido congelado: Tentar de novo monta outro', async ({ page, extensao, fakes }) => {
  await abrirOEnvio(page, extensao, { frases: [MAIS_RECENTE] });
  const [envio] = await enviosCriados(fakes, 1);
  fakes.anki.concluirEnvio(envio.jobId, { erro: 'cards_failed' });
  await expect(passo(page).getByRole('alert')).toContainText('Este cartão não foi');
  await estadoFinal(extensao, { pm_boas_vindas: { primeiroEnvio: { corpo: null } } });

  await botao(page, 'Tentar de novo').click();

  await expect.poll(() => fakes.anki.envios.length).toBe(2);
  expect(fakes.anki.envios[1].jobId).not.toBe(envio.jobId);
});

test('a Frase minerada em russo manda o Envio em russo', async ({ page, extensao, fakes }) => {
  await abrirOEnvio(page, extensao, { frases: [INGLESAS[2], RUSSA_MAIS_NOVA] });

  const [envio] = await enviosCriados(fakes, 1);
  expect(envio.corpo).toMatchObject({ lang: 'ru' });
  expect(envio.entries[0].phraseId).toBe(RUSSA_MAIS_NOVA.id);
  await estadoFinal(extensao, { pm_boas_vindas: { primeiroEnvio: { corpo: { lang: 'ru' } } } });
});

test('o Cartão que não foi por falta de chave diz “Este cartão não foi”, o motivo, e deixa Tentar de novo ou Trocar a chave', async ({ page, extensao, fakes }) => {
  await abrirOEnvio(page, extensao, { frases: [MAIS_RECENTE] });
  const [envio] = await enviosCriados(fakes, 1);

  fakes.anki.moverEnvio(envio.jobId, { stage: 'generate_cards', cartoes: { [idDoCartao(envio)]: { status: 'failed', error: 'openai_key_missing' } } });
  fakes.anki.concluirEnvio(envio.jobId, { erro: 'openai_key_missing' });

  await expect(passo(page).getByRole('alert')).toContainText('Este cartão não foi');
  await expect(passo(page).getByRole('alert')).toContainText('Falta a chave da OpenAI.');
  await expect(botao(page, 'Tentar de novo')).toBeVisible();
  await expect(botao(page, 'Trocar a chave')).toBeVisible();
  await expect(lista(page).getByRole('button', { name: /^Enviar o primeiro cartão/ })).not.toHaveAccessibleName(/feito/);
  await estadoFinal(extensao, { pm_boas_vindas: { primeiroEnvio: { corpo: { jobId: envio.jobId } } } });
  expect((await extensao.lerStorage('pm_boas_vindas')).pm_boas_vindas.primeiroEnvio.chegou).toBeUndefined();
});

test('Tentar de novo refaz o mesmo Envio, sem criar outro, e o Cartão chega', async ({ page, extensao, fakes }) => {
  await abrirOEnvio(page, extensao, { frases: [MAIS_RECENTE] });
  const [envio] = await enviosCriados(fakes, 1);
  fakes.anki.moverEnvio(envio.jobId, { stage: 'generate_cards', cartoes: { [idDoCartao(envio)]: { status: 'failed', error: 'openai_key_rejected' } } });
  fakes.anki.concluirEnvio(envio.jobId, { erro: 'openai_key_rejected' });
  await expect(passo(page)).toContainText('A OpenAI não aceitou a chave.');

  await botao(page, 'Tentar de novo').click();

  await expect(passo(page)).toContainText('Enviando…');
  await expect.poll(() => fakes.anki.requisicoes.filter(r => r.caminho === '/jobs/retry').length).toBe(1);
  chegarAoAnki(fakes, envio);
  await expect(passo(page)).toContainText('Cartão enviado ao Anki');
  expect(fakes.anki.envios).toHaveLength(1);
  await estadoFinal(extensao, { pm_boas_vindas: { primeiroEnvio: { chegou: true, corpo: { jobId: envio.jobId } } } });
});

test('Trocar a chave leva ao passo da IA; voltar ao último passo pede o mesmo Envio e o refaz', async ({ page, extensao, fakes }) => {
  await abrirOEnvio(page, extensao, { frases: [MAIS_RECENTE] });
  const [envio] = await enviosCriados(fakes, 1);
  fakes.anki.moverEnvio(envio.jobId, { stage: 'generate_cards', cartoes: { [idDoCartao(envio)]: { status: 'failed', error: 'openai_no_credit' } } });
  fakes.anki.concluirEnvio(envio.jobId, { erro: 'openai_no_credit' });
  await expect(passo(page)).toContainText('A conta da OpenAI está sem crédito.');

  await botao(page, 'Trocar a chave').click();
  await expect(page).toHaveURL(/#boas-vindas\/ia$/);
  await expect(card(page).getByRole('heading', { level: 2 })).toHaveText('Configurar a IA dos cartões');

  await lista(page).getByRole('button', { name: /^Enviar o primeiro cartão/ }).click();

  await expect.poll(() => fakes.anki.requisicoes.filter(r => r.caminho === '/jobs/retry').length).toBe(1);
  expect(fakes.anki.envios).toHaveLength(1);
  chegarAoAnki(fakes, envio);
  await expect(passo(page)).toContainText('Cartão enviado ao Anki');
  await estadoFinal(extensao, { pm_boas_vindas: { primeiroEnvio: { chegou: true, corpo: { jobId: envio.jobId } } } });
});

test('repetir o passo depois de o Cartão chegar não cria outro Envio nem outro Cartão', async ({ page, extensao, fakes }) => {
  await abrirOEnvio(page, extensao, { frases: [MAIS_RECENTE] });
  const [envio] = await enviosCriados(fakes, 1);
  chegarAoAnki(fakes, envio);
  await expect(passo(page)).toContainText('Cartão enviado ao Anki');
  const pedidosAntes = fakes.anki.requisicoes.filter(r => r.caminho === '/jobs').length;

  await page.reload();
  await expect(passo(page)).toContainText('Cartão enviado ao Anki');
  await page.goto(extensao.url('painel.html#boas-vindas/pronto'));
  await lista(page).getByRole('button', { name: /^Enviar o primeiro cartão/ }).click();

  await expect(passo(page)).toContainText('Cartão enviado ao Anki');
  expect(fakes.anki.requisicoes.filter(r => r.caminho === '/jobs')).toHaveLength(pedidosAntes);
  expect(fakes.anki.envios).toHaveLength(1);
  await estadoFinal(extensao, { pm_boas_vindas: { primeiroEnvio: { chegou: true, corpo: { jobId: envio.jobId } } } });
});

test('a página recarregada no meio manda o mesmo pedido congelado, e a Conexão não cria outro Envio', async ({ page, extensao, fakes }) => {
  await abrirOEnvio(page, extensao, { frases: [MAIS_RECENTE] });
  const [envio] = await enviosCriados(fakes, 1);

  await extensao.gravarStorage({ frases: [INGLESAS[2]] });   // uma Frase mais nova não muda o pedido que já foi
  await page.reload();

  await expect.poll(() => fakes.anki.requisicoes.filter(r => r.caminho === '/jobs').length).toBe(2);
  expect(fakes.anki.envios).toHaveLength(1);
  expect(fakes.anki.envios[0].entries[0].phraseId).toBe(MAIS_RECENTE.id);
  chegarAoAnki(fakes, envio);
  await expect(passo(page)).toContainText('Cartão enviado ao Anki');
  await estadoFinal(extensao, { pm_boas_vindas: { primeiroEnvio: { chegou: true, corpo: { jobId: envio.jobId } } } });
});

test('com a Conexão fora do ar, o Cartão não foi: o motivo é a Conexão, e Trocar a chave não é oferecido', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirOEnvio(page, extensao, { frases: [MAIS_RECENTE] });

  await expect(passo(page).getByRole('alert')).toContainText('Este cartão não foi');
  await expect(passo(page).getByRole('alert')).toContainText('A Conexão com o Anki não respondeu. Confira se ela está ligada.');
  await expect(botao(page, 'Tentar de novo')).toBeVisible();
  await expect(botao(page, 'Trocar a chave')).toHaveCount(0);
  await estadoFinal(extensao, { pm_boas_vindas: { primeiroEnvio: { corpo: { lang: 'en' } } } });
});

test('as outras Frases esperam no Envio: só o Cartão da mais recente vai', async ({ page, extensao, fakes }) => {
  await abrirOEnvio(page, extensao, { frases: INGLESAS });
  const [envio] = await enviosCriados(fakes, 1);
  chegarAoAnki(fakes, envio);
  await expect(passo(page)).toContainText('Cartão enviado ao Anki');

  expect(envio.entries).toHaveLength(1);
  expect((await extensao.frases()).map(frase => frase.id)).toEqual(INGLESAS.map(frase => frase.id));
  await estadoFinal(extensao, { pm_boas_vindas: { primeiroEnvio: { chegou: true } } });
});
