'use strict';

// O modelo dos cartões (#157, docs/design/modelo-dos-cartoes.md): no Avançado do card IA dos cartões, o seletor “Modelo dos cartões”
// com a lista da conta (Automático por padrão), o aviso âmbar antes da saída de um modelo, a troca para o Automático no dia e a linha
// verde que conta o que trocou. A Conexão com o Anki é o fake do e2e, que guarda a escolha e responde pelo contrato
// (complemento/contrato/exemplos-do-modelo.json); o que fica guardado é o que a Conexão guardou (`fakes.anki.modelo.guardado()`).
// Quem troca o modelo no dia do Envio, de verdade, é provado em complemento/test_modelo_dos_cartoes.py.

const { test, expect } = require('../fixtures');
const { estadoFinalEm } = require('../estado-final');
const { INGLESAS, SACK, marcarEEnviar, enviosCriados } = require('../apoio-do-envio');

const card = page => page.locator('#cfg-ia');
const avancado = page => card(page).locator('details.ia-avancado');
const seletor = page => card(page).getByRole('combobox', { name: 'Modelo dos cartões' });
const aviso = page => card(page).getByRole('status').filter({ hasText: 'sai do ar em' });
const linhaVerde = page => card(page).getByText(/saiu do ar\. O Envio passou para o Automático\./);
const opcoes = page => seletor(page).locator('option').allTextContents();

const AUTOMATICO = { escolha: 'automatico', trocou: null };

/** Abre Configurações › IA com a Conexão ligada; `abrir` deixa o Avançado aberto. */
async function abrirIA(page, extensao, { abrir = true } = {}) {
  await page.goto(extensao.url('painel.html#configuracoes/ia'));
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');
  if (abrir) await avancado(page).locator('summary').click();
}

/** A pessoa já tem a chave guardada na Conexão (e o resumo dela no navegador). */
async function comAChave(extensao, fakes) {
  fakes.anki.guardarChaveNaConexao('9f3a');
  await extensao.gravarStorage({ pm_chave_openai: { ultimos4: '9f3a' } });
}

test('sem chave e sem login, o card não oferece escolher o modelo', async ({ page, extensao, fakes }) => {
  await abrirIA(page, extensao, { abrir: false });
  await expect(card(page).getByRole('region', { name: 'Chave da OpenAI' })).toBeVisible();
  await expect(avancado(page)).toHaveCount(0);

  await estadoFinalEm('o modelo dos cartões na Conexão', () => fakes.anki.modelo.guardado(), AUTOMATICO);
});

test('com a chave, o Avançado traz o Modelo dos cartões em Automático, só com modelos de texto que veem foto, e diz que a chave paga', async ({ page, extensao, fakes }) => {
  await comAChave(extensao, fakes);
  await abrirIA(page, extensao, { abrir: false });
  await expect(avancado(page)).not.toHaveAttribute('open', '');
  await avancado(page).locator('summary').click();

  await expect(avancado(page)).toContainText('Avançado');
  await expect(seletor(page)).toHaveValue('automatico');
  expect(await opcoes(page)).toEqual(['Automático', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini']);
  await expect(avancado(page)).toContainText('Pago pela sua chave');
  await expect(avancado(page)).not.toContainText('Usando o plano do ChatGPT');
  await expect(aviso(page)).toHaveCount(0);
  await expect(linhaVerde(page)).toHaveCount(0);

  await estadoFinalEm('o modelo dos cartões na Conexão', () => fakes.anki.modelo.guardado(), AUTOMATICO);
});

test('com o login do ChatGPT, a lista é a do plano e a linha de baixo diz Usando o plano do ChatGPT · Gerenciar uso', async ({ page, extensao, fakes }) => {
  fakes.anki.chatgpt.definir('conectada');
  await extensao.gravarStorage({ pm_plano_do_chatgpt_avisado: true }); // o modal da primeira vez já foi dado (configuracoes-chatgpt-plano.spec.js)
  await abrirIA(page, extensao);

  await expect(seletor(page)).toHaveValue('automatico');
  expect(await opcoes(page)).toEqual(['Automático', 'gpt-6-luna', 'gpt-6-sol']);
  await expect(avancado(page)).toContainText('Usando o plano do ChatGPT');
  await expect(avancado(page).getByRole('link', { name: 'Gerenciar uso' })).toHaveAttribute('href', 'https://chatgpt.com/settings/usage');
  await expect(avancado(page)).not.toContainText('Pago pela sua chave');

  await estadoFinalEm('o modelo dos cartões na Conexão', () => fakes.anki.modelo.guardado(), AUTOMATICO);
});

test('escolher outro modelo da lista fica guardado na Conexão e continua escolhido ao reabrir', async ({ page, extensao, fakes }) => {
  await comAChave(extensao, fakes);
  await abrirIA(page, extensao);

  await seletor(page).selectOption('gpt-4.1-mini');
  await expect(seletor(page)).toHaveValue('gpt-4.1-mini');
  await estadoFinalEm('o modelo dos cartões na Conexão', () => fakes.anki.modelo.guardado(), { escolha: 'gpt-4.1-mini', trocou: null });

  await page.reload();
  await avancado(page).locator('summary').click();
  await expect(seletor(page)).toHaveValue('gpt-4.1-mini');
  await estadoFinalEm('o modelo dos cartões na Conexão depois de reabrir', () => fakes.anki.modelo.guardado(), { escolha: 'gpt-4.1-mini', trocou: null });
});

test('antes da saída, o aviso âmbar diz a data, com Trocar agora e Escolher outro', async ({ page, extensao, fakes, relogioParado }) => {
  await relogioParado({ em: new Date('2026-11-01T12:00:00') });
  await comAChave(extensao, fakes);
  fakes.anki.modelo.definir('gpt-4.1-mini sai em 20/11');
  await abrirIA(page, extensao, { abrir: false });

  await expect(avancado(page)).toHaveAttribute('open', '');
  await expect(aviso(page)).toContainText('gpt-4.1-mini sai do ar em 20 de novembro. No dia, o Envio passa sozinho para o Automático.');
  await expect(aviso(page).getByRole('button', { name: 'Trocar agora' })).toBeVisible();
  await expect(aviso(page).getByRole('button', { name: 'Escolher outro' })).toBeVisible();
  await expect(seletor(page)).toHaveValue('gpt-4.1-mini');
  await expect(linhaVerde(page)).toHaveCount(0);

  await estadoFinalEm('o modelo dos cartões na Conexão', () => fakes.anki.modelo.guardado(), { escolha: 'gpt-4.1-mini', trocou: null });
});

test('Trocar agora passa para o Automático e o aviso some', async ({ page, extensao, fakes, relogioParado }) => {
  await relogioParado({ em: new Date('2026-11-01T12:00:00') });
  await comAChave(extensao, fakes);
  fakes.anki.modelo.definir('gpt-4.1-mini sai em 20/11');
  await abrirIA(page, extensao, { abrir: false });

  await aviso(page).getByRole('button', { name: 'Trocar agora' }).click();
  await expect(aviso(page)).toHaveCount(0);
  await expect(seletor(page)).toHaveValue('automatico');

  await estadoFinalEm('o modelo dos cartões na Conexão', () => fakes.anki.modelo.guardado(), AUTOMATICO);
});

test('Escolher outro leva ao seletor, e escolher um modelo tira o aviso', async ({ page, extensao, fakes, relogioParado }) => {
  await relogioParado({ em: new Date('2026-11-01T12:00:00') });
  await comAChave(extensao, fakes);
  fakes.anki.modelo.definir('gpt-4.1-mini sai em 20/11');
  await abrirIA(page, extensao, { abrir: false });

  await aviso(page).getByRole('button', { name: 'Escolher outro' }).click();
  await expect(seletor(page)).toBeFocused();
  await seletor(page).selectOption('gpt-4o');
  await expect(aviso(page)).toHaveCount(0);

  await estadoFinalEm('o modelo dos cartões na Conexão', () => fakes.anki.modelo.guardado(), { escolha: 'gpt-4o', trocou: null });
});

for (const [cenario, de] of [['gpt-4.1-mini sai em 20/11', 'gpt-4.1-mini'], ['gpt-4.1 sumiu da conta', 'gpt-4.1']]) {
  test(`${de}: no dia da saída (ou quando some da conta) o Envio passa sozinho para o Automático, não para, e a linha verde conta o que trocou`, async ({ page, extensao, fakes, relogioParado }) => {
    await relogioParado({ em: new Date('2026-11-20T12:00:00') });
    await comAChave(extensao, fakes);
    fakes.anki.modelo.definir(cenario);
    fakes.anki.modelo.passarOTempoAte('2026-11-20');
    await extensao.gravarStorage({ frases: INGLESAS });
    await page.goto(extensao.url('painel.html#frases'));
    await marcarEEnviar(page, [SACK.texto]);

    const [job] = await enviosCriados(fakes, 1);
    expect(job.state.status).not.toBe('failed');
    await abrirIA(page, extensao, { abrir: false });
    await expect(linhaVerde(page)).toContainText(`O ${de} saiu do ar. O Envio passou para o Automático.`);
    await expect(aviso(page)).toHaveCount(0);
    await expect(avancado(page)).toHaveAttribute('open', '');
    await expect(seletor(page)).toHaveValue('automatico');

    await estadoFinalEm('o modelo dos cartões na Conexão', () => fakes.anki.modelo.guardado(), { escolha: 'automatico', trocou: { de } });
  });
}

test('a troca de quem paga tem a sua linha verde: não diz que o modelo saiu do ar', async ({ page, extensao, fakes }) => {
  await comAChave(extensao, fakes);
  fakes.anki.modelo.definir('gpt-6-sol ficou sem lugar na troca de pagador');
  await abrirIA(page, extensao, { abrir: false });

  await expect(card(page).getByText('A forma de pagar mudou e a nova não tem o gpt-6-sol. O Envio passou para o Automático.')).toBeVisible();
  await expect(linhaVerde(page)).toHaveCount(0);
  await expect(avancado(page)).toHaveAttribute('open', '');

  await estadoFinalEm('o modelo dos cartões na Conexão', () => fakes.anki.modelo.guardado(), { escolha: 'automatico', trocou: { de: 'gpt-6-sol', porque: 'pagador' } });
});

test('escolher outro modelo depois da troca apaga a linha verde', async ({ page, extensao, fakes }) => {
  await comAChave(extensao, fakes);
  fakes.anki.modelo.definir('gpt-4.1 sumiu da conta');
  await abrirIA(page, extensao, { abrir: false });
  await expect(linhaVerde(page)).toBeVisible();

  await seletor(page).selectOption('gpt-4o');
  await expect(linhaVerde(page)).toHaveCount(0);

  await estadoFinalEm('o modelo dos cartões na Conexão', () => fakes.anki.modelo.guardado(), { escolha: 'gpt-4o', trocou: null });
});

test('com a OpenAI fora do ar, o Avançado diz que não deu para ler os modelos da conta e nada se afirma da lista', async ({ page, extensao, fakes }) => {
  await comAChave(extensao, fakes);
  fakes.anki.responderOpenAI('fora_do_ar');
  await abrirIA(page, extensao);

  await expect(avancado(page)).toContainText('Não deu para ler os modelos da sua conta. Tente de novo.');
  await expect(seletor(page)).toHaveCount(0);
  await expect(avancado(page)).not.toContainText('Pago pela sua chave');

  await estadoFinalEm('o modelo dos cartões na Conexão', () => fakes.anki.modelo.guardado(), AUTOMATICO);
});

test('com uma Conexão antiga, sem as rotas do modelo, o card não mostra o Avançado', async ({ page, extensao, fakes }) => {
  await comAChave(extensao, fakes);
  for (const rota of ['/ia/modelo/estado', '/ia/modelo/escolher']) fakes.anki.responder('POST', rota, () => ({ status: 404, json: { error: 'not_found' } }));
  await abrirIA(page, extensao, { abrir: false });
  await expect(card(page).getByRole('region', { name: 'Chave da OpenAI' })).toBeVisible();
  await expect(avancado(page)).toHaveCount(0);

  await estadoFinalEm('o modelo dos cartões na Conexão', () => fakes.anki.modelo.guardado(), AUTOMATICO);
});
