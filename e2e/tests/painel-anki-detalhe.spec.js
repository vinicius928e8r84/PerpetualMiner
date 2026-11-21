'use strict';

const { test, expect } = require('../fixtures');
const { estadoFinal, estadoFinalEm } = require('../estado-final');
const { ENVIOS, custos, azulejos, listaDeEnvios, detalheDoEnvio, abrirAnki } = require('../apoio-dos-custos');

const camadaPrincipal = page => page.locator('#anki-custos-azulejos, #anki-custos-corpo');

async function usarChave(page, nome, ligada) {
  await page.getByText(nome, { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: nome })).toBeChecked({ checked: ligada });
}

async function statusGuardado(extensao, jobId) {
  const { pm_anki_custos: guardado } = await extensao.lerStorage(['pm_anki_custos']);
  return guardado?.envios.find(envio => envio.jobId === jobId)?.status;
}

test.beforeEach(({ fakes }) => {
  fakes.anki.definirCustos(ENVIOS);
});

test('lista × detalhe: o envio em parte mostra o que não entrou, Detalhes e Continuar envio, que retoma', async ({ page, extensao, fakes }) => {
  await abrirAnki(page, extensao);

  const opcoes = listaDeEnvios(page).getByRole('option');
  await expect(opcoes.first()).toHaveAttribute('aria-selected', 'true');
  await expect(opcoes.filter({ hasText: 'Envio em inglês · 6 frases' })).toContainText('há 10 min');
  await expect(opcoes.filter({ hasText: 'Envio em inglês · 3 frases' })).toContainText('ontem');

  await opcoes.filter({ hasText: 'Envio em russo' }).click();
  const detalhe = detalheDoEnvio(page, 'Envio em russo · 4 frases');
  await expect(detalhe).toContainText('Concluído em parte · 3 de 4 frases');
  await expect(detalhe).toContainText('1 não entrou');
  await detalhe.getByText('Detalhes').click();
  await expect(detalhe.locator('pre')).toContainText('collection is not available');

  await detalhe.getByRole('button', { name: 'Continuar envio' }).click();
  await expect(page.getByText('Envio retomado')).toBeVisible();
  expect(fakes.anki.requisicoes.filter(r => r.caminho === '/jobs/retry' && r.dados?.jobId === 'job-ru-parte')).toHaveLength(1);
  await estadoFinalEm('o envio retomado em pm_anki_custos', () => statusGuardado(extensao, 'job-ru-parte'), 'queued');
});

test('Continuar envio que falha: ENV-14 no detalhe, com a causa em Detalhes, sem toast', async ({ page, extensao, fakes }) => {
  fakes.anki.responder('POST', '/jobs/retry', () => ({ status: 500, json: { error: 'retry_failed' } }));
  await abrirAnki(page, extensao);
  await listaDeEnvios(page).getByRole('option', { name: /Envio em russo/ }).click();
  const detalhe = detalheDoEnvio(page, 'Envio em russo · 4 frases');

  await detalhe.getByRole('button', { name: 'Continuar envio' }).click();

  await expect(detalhe).toContainText('Não deu para retomar o envio. Confira se a Conexão com o Anki está ligada.');
  await detalhe.getByText('Detalhes', { exact: true }).click();
  await expect(detalhe.locator('pre')).toContainText('HTTP 500');
  await expect(detalhe.locator('pre')).toContainText('collection is not available');
  await expect(page.locator('.veio-toast')).toHaveCount(0);
  expect(await statusGuardado(extensao, 'job-ru-parte')).toBe('partial');
});

// Exceção de teste: sem-estado-guardado — escolher um envio na lista só troca o detalhe na tela; nada é gravado.
test('só o envio em parte ou que não concluiu tem Continuar envio; o em andamento diz a etapa', async ({ page, extensao }) => {
  await abrirAnki(page, extensao);
  const opcoes = listaDeEnvios(page).getByRole('option');

  await opcoes.filter({ hasText: 'Envio em inglês · 6 frases' }).click();
  const andando = detalheDoEnvio(page, 'Envio em inglês · 6 frases');
  await expect(andando).toContainText('Enviando… · Escolhendo imagens');
  await expect(andando.getByRole('button', { name: 'Continuar envio' })).toHaveCount(0);

  await opcoes.filter({ hasText: 'Envio em inglês · 12 frases' }).click();
  const concluido = detalheDoEnvio(page, 'Envio em inglês · 12 frases');
  await expect(concluido).toContainText('Concluído');
  await expect(concluido.getByRole('button', { name: 'Continuar envio' })).toHaveCount(0);

  await opcoes.filter({ hasText: 'Envio em inglês · 3 frases' }).click();
  const falhou = detalheDoEnvio(page, 'Envio em inglês · 3 frases');
  await expect(falhou).toContainText('Não concluído');
  await expect(falhou.getByRole('button', { name: 'Continuar envio' })).toBeVisible();
});

// Exceção de teste: sem-estado-guardado — escolher um envio na lista só troca o detalhe na tela; nada é gravado.
test('o total do envio bate com a soma das partes, inclusive os outros custos (#9)', async ({ page, extensao }) => {
  await abrirAnki(page, extensao, { gravado: { pm_anki_quatro_casas: true } });
  await listaDeEnvios(page).getByRole('option', { name: /Envio em russo/ }).click();

  const detalhe = detalheDoEnvio(page, 'Envio em russo · 4 frases');
  const partes = detalhe.locator('dl');
  await expect(partes).toContainText('Outros custos');
  const valores = await partes.locator('dd').allTextContents();
  const numero = texto => Number(texto.replace('US$', '').replace(/\s/g, '').replace(',', '.'));
  const [total, ...resto] = valores.map(numero).reverse();
  expect(total).toBeCloseTo(0.0452, 4);
  expect(resto.reduce((a, b) => a + b, 0)).toBeCloseTo(total, 4);
});

test('dinheiro com 2 casas e “< US$ 0,01”; a chave 4 casas passa tudo a 4 casas, e fica lembrada', async ({ page, extensao }) => {
  await abrirAnki(page, extensao);
  await listaDeEnvios(page).getByRole('option', { name: /Envio em russo/ }).click();
  const detalhe = detalheDoEnvio(page, 'Envio em russo · 4 frases');
  await expect(detalhe.locator('dl')).toContainText('Escolha e triagem< US$ 0,01');
  for (const parte of await camadaPrincipal(page).all()) await expect(parte).not.toContainText(/US\$ \d+,\d{4}/);

  await custos(page).getByText('Avançado').click();
  await expect(page.getByRole('checkbox', { name: 'Mostrar custos com 4 casas' })).not.toBeChecked();
  await usarChave(page, 'Mostrar custos com 4 casas', true);

  await expect(azulejos(page)).toContainText('US$ 0,1545');
  await expect(detalhe.locator('dl')).toContainText('Escolha e triagemUS$ 0,0012');
  await expect(page.locator('#anki-custos-faixa')).toContainText('US$ 0,1331');
  await expect(custos(page)).not.toContainText('< US$ 0,01');
  await expect.poll(async () => (await extensao.lerStorage('pm_anki_quatro_casas')).pm_anki_quatro_casas).toBe(true);

  await page.reload();
  await expect(azulejos(page)).toContainText('US$ 0,1545');

  await custos(page).getByText('Avançado').click();
  await usarChave(page, 'Mostrar custos com 4 casas', false);
  await expect(azulejos(page)).toContainText('US$ 0,15');
  await expect(azulejos(page)).not.toContainText('US$ 0,1545');
  await estadoFinal(extensao, { pm_anki_quatro_casas: false });
});

test('os IDs dos envios só aparecem com a chave ligada, e ela fica lembrada', async ({ page, extensao }) => {
  await abrirAnki(page, extensao);
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(4);
  await expect(listaDeEnvios(page)).not.toContainText('job-ru-parte');

  await custos(page).getByText('Avançado').click();
  await usarChave(page, 'Mostrar IDs dos envios', true);
  await expect(listaDeEnvios(page)).toContainText('job-ru-parte');
  await expect.poll(async () => (await extensao.lerStorage('pm_anki_ids_dos_envios')).pm_anki_ids_dos_envios).toBe(true);

  await page.reload();
  await expect(listaDeEnvios(page)).toContainText('job-ru-parte');
});

// Exceção de teste: sem-estado-guardado — abrir o Avançado e baixar o diagnóstico não gravam nada na extensão.
test('o Avançado mostra escolha e triagem com 4 casas e baixa o diagnóstico de um envio', async ({ page, extensao }) => {
  await abrirAnki(page, extensao);
  await custos(page).getByText('Avançado').click();
  const avancado = page.locator('#anki-custos-avancado');
  await expect(avancado).toContainText('Escolha de imagemUS$ 0,0029');
  await expect(avancado).toContainText('Triagem de imagemUS$ 0,0015');
  await expect(avancado).toContainText('Total com 4 casasUS$ 0,1545');

  const baixando = page.waitForEvent('download');
  await avancado.getByRole('row', { name: /Envio em russo/ }).getByRole('button', { name: 'Baixar diagnóstico' }).click();
  const download = await baixando;
  expect(download.suggestedFilename()).toBe('diagnostico-job-ru-parte.json');
  await expect(page.locator('.veio-toast')).toHaveCount(0);
});

test('com 4 casas, um valor abaixo de US$ 0,0001 diz “< US$ 0,0001”, nunca “US$ 0,0000”', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos([{
    jobId: 'job-minimo', lang: 'en', createdAt: '2026-09-18T11:00:00', status: 'completed', pedidas: 2,
    custos: { cartoes: 0.0200, triagem: 0.00003 },
  }]);
  await abrirAnki(page, extensao, { gravado: { pm_anki_quatro_casas: true } });

  const detalhe = detalheDoEnvio(page, 'Envio em inglês · 2 frases');
  await expect(detalhe.locator('dl')).toContainText('Escolha e triagem< US$ 0,0001');
  await expect(detalhe.locator('dl')).toContainText('Imagens geradasUS$ 0,0000');
  await expect(detalhe.locator('dl')).toContainText('TotalUS$ 0,0200');
});
