'use strict';

// O teto do mês (#160, histórias 112 e 113): vem ligado com US$ 10; aos 80% o Painel avisa; aos 100% o Envio pausa antes do próximo
// Cartão (“Envio pausado: o teto do mês chegou” e Ver Custos, sem valor no Envio); a pessoa ajusta o teto em Custos e o Envio volta.
// A Conexão é o fake da fronteira HTTP (fakes.anki): o teto e o gasto são os dela, `fakes.anki.teto.guardado()` é o que ela guardou neste
// computador, e a pausa é o `waiting: { reason: 'monthly_cap' }` que o teste põe no Envio (`moverEnvio`). O lado da Conexão está em
// `complemento/test_teto_do_mes.py`; as respostas são as de `complemento/contrato/exemplos-do-teto.json`.

const { test, expect } = require('../fixtures');
const { estadoFinalEm } = require('../estado-final');
const { AGORA, INGLESAS, abrirPainel, cartoesDe, envio, marcarEEnviar, enviosCriados, umaVoltaDoEnvio } = require('../apoio-do-envio');

const CARTAO = 'Envio em inglês · 3 frases';
const NO_TETO = { reason: 'monthly_cap' };
const aviso = page => page.locator('#painel-teto-aviso');
const card = page => page.locator('#anki-custos').getByRole('region', { name: 'Teto do mês' });
const campo = page => card(page).getByRole('spinbutton', { name: 'Teto do mês em dólares' });
const ligada = page => expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

test.beforeEach(({ fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
});

test('abaixo de 80% do teto o Painel não avisa nada', async ({ page, extensao, fakes }) => {
  fakes.anki.teto.definir({ gasto: 7.9 });
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await abrirPainel(page, extensao);

  await ligada(page);
  await expect(aviso(page)).toHaveCount(0);
});

test('aos 80% do teto o Painel avisa e Ajustar teto leva a Custos, ao campo do teto', async ({ page, extensao, fakes }) => {
  fakes.anki.teto.definir({ gasto: 8.5 });
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await abrirPainel(page, extensao);

  await expect(aviso(page)).toContainText('Você já usou 85% do teto do mês. Aos 100%, o Envio pausa antes do próximo cartão.');
  await aviso(page).getByRole('button', { name: 'Ajustar teto' }).click();

  await expect(page).toHaveURL(/#anki\/custos$/);
  await expect(campo(page)).toBeFocused();
  await estadoFinalEm('o teto escolhido na Conexão (nenhum: nada foi mudado)', () => fakes.anki.teto.guardado(), null);
});

test('aos 100% o Painel diz que o teto do mês chegou', async ({ page, extensao, fakes }) => {
  fakes.anki.teto.definir({ gasto: 10 });
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await abrirPainel(page, extensao);

  await expect(aviso(page)).toContainText('O teto do mês chegou. O Envio fica pausado até você subir o teto ou o mês virar.');
});

test('a aba Custos mostra o teto de US$ 10 que já vem ligado e quanto do mês a chave gastou', async ({ page, extensao, fakes }) => {
  fakes.anki.teto.definir({ gasto: 3.25 });
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await abrirPainel(page, extensao, '#anki/custos');

  await expect(card(page)).toContainText('US$ 3,25 de US$ 10,00 este mês');
  await expect(card(page)).toContainText('Vale só neste computador.');
  await expect(campo(page)).toHaveValue('10');
});

test('ajustar o teto em Custos guarda o valor na Conexão, tira o aviso e mostra o novo teto', async ({ page, extensao, fakes }) => {
  fakes.anki.teto.definir({ gasto: 8.5 });
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await abrirPainel(page, extensao, '#anki/custos');
  await expect(aviso(page)).toBeVisible();

  await campo(page).fill('15');
  await card(page).getByRole('button', { name: 'Salvar teto' }).click();

  await expect(card(page)).toContainText('Teto salvo');
  await expect(card(page)).toContainText('US$ 8,50 de US$ 15,00 este mês');
  await expect(aviso(page)).toHaveCount(0);
  await estadoFinalEm('o teto escolhido na Conexão', () => fakes.anki.teto.guardado(), 15);
});

test('um valor que não é maior que zero não é enviado e o teto guardado não muda', async ({ page, extensao, fakes }) => {
  fakes.anki.teto.definir({ limite: 12, gasto: 1 });
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await abrirPainel(page, extensao, '#anki/custos');

  await campo(page).fill('0');
  await card(page).getByRole('button', { name: 'Salvar teto' }).click();

  await expect(card(page)).toContainText('Digite um valor maior que zero.');
  expect(fakes.anki.requisicoes.filter(r => r.caminho === '/custos/teto/definir')).toHaveLength(0);
  await estadoFinalEm('o teto escolhido na Conexão', () => fakes.anki.teto.guardado(), 12);
});

test('a Conexão que não guardou o teto diz que não deu e o campo fica como a pessoa digitou', async ({ page, extensao, fakes }) => {
  fakes.anki.teto.definir({ gasto: 1 });
  fakes.anki.responder('POST', '/custos/teto/definir', () => ({ status: 500, json: { error: 'internal_error' } }));
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await abrirPainel(page, extensao, '#anki/custos');

  await campo(page).fill('20');
  await card(page).getByRole('button', { name: 'Salvar teto' }).click();

  await expect(card(page)).toContainText('Não deu para salvar o teto. Tente de novo.');
  await expect(campo(page)).toHaveValue('20');
  await estadoFinalEm('o teto escolhido na Conexão', () => fakes.anki.teto.guardado(), null);
});

test('com a Conexão desligada o Painel não mostra aviso nem card do teto', async ({ page, extensao, fakes }) => {
  fakes.anki.teto.definir({ gasto: 9 });
  fakes.anki.desligar();
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await abrirPainel(page, extensao, '#anki/custos');

  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'desligada');
  await expect(aviso(page)).toHaveCount(0);
  await expect(card(page)).toHaveCount(0);
});

/** Três Frases enviadas e o Envio pausado pelo teto com 3 de 10 Cartões no Anki. */
async function envioNoTeto(page, extensao, fakes) {
  fakes.anki.teto.definir({ gasto: 10 });
  await extensao.gravarStorage({ frases: INGLESAS, pm_anki_ja_conectou: true });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, INGLESAS.map(f => f.texto));
  const [job] = await enviosCriados(fakes, 1);
  fakes.anki.moverEnvio(job.jobId, { stage: 'generate_cards', progress: { done: 3, total: 10 }, cartoes: cartoesDe(3), esperando: NO_TETO });
  return job;
}

test('no teto o Envio pausa e o cartão diz “Envio pausado: o teto do mês chegou” com Ver Custos, sem valor', async ({ page, extensao, fakes }) => {
  const job = await envioNoTeto(page, extensao, fakes);
  const cartao = envio(page, CARTAO);

  await expect(cartao).toContainText('Envio pausado: o teto do mês chegou', { timeout: 20_000 });
  await expect(cartao).toContainText('Quando você subir o teto ou o mês virar, o Envio continua sozinho.');
  await expect(cartao.getByRole('button', { name: 'Ver Custos' })).toBeVisible();
  await expect(cartao).not.toContainText(/US\$|%/);
  // Nada foi refeito nem retomado pelo cartão: a Conexão é quem continua sozinha.
  await umaVoltaDoEnvio(page);
  expect(['/jobs/retry', '/jobs/usar-a-chave'].flatMap(c => fakes.anki.requisicoes.filter(r => r.caminho === c))).toEqual([]);
  await estadoFinalEm('o Envio pausado na Conexão', () => fakes.anki.envios.map(e => [e.jobId, e.state.status, e.state.waiting]), [[job.jobId, 'running', NO_TETO]]);
});

test('Ver Custos fecha o progresso e leva à aba Custos, onde o teto se ajusta', async ({ page, extensao, fakes }) => {
  await envioNoTeto(page, extensao, fakes);

  await envio(page, CARTAO).getByRole('button', { name: 'Ver Custos' }).click({ timeout: 20_000 });

  await expect(page).toHaveURL(/#anki\/custos$/);
  await expect(card(page)).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Enviando ao Anki…' })).toBeHidden();
  await estadoFinalEm('o teto escolhido na Conexão', () => fakes.anki.teto.guardado(), null);
});
