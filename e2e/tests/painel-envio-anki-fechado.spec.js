'use strict';

// O Envio com o Anki fechado (#150, histórias 82, 88 e 93): apertar Enviar ao Anki chama o abridor da Conexão
// (o host de mentira do fixture, e2e/fakes/abridor.js) quando a pessoa deu a permissão, e a faixa conta o que
// acontece até o Anki responder. Sem a permissão, a faixa pede que a pessoa abra o Anki e tem o botão que a pede.
// O aviso do Chrome que pede a permissão é nativo e o Playwright não o alcança (como em abrir-o-anki-sozinho.spec.js):
// a permissão dada vem do fixture (`permissaoDoAbridor`), e o teste do pedido confere o botão enquanto o aviso espera.

const { test, expect } = require('../fixtures');
const { estadoFinal, estadoFinalEm } = require('../estado-final');
const contrato = require('../../complemento/contrato/exemplos.json');
const { AGORA, INGLESAS, SACK, abrirPainel, marcar, enviarAoAnki, progresso, enviosCriados } = require('../apoio-do-envio');

/** As mensagens `abrir` que o abridor recebeu (o passo Abrir o Anki sozinho também manda `conferir`, que nada abre). */
const aberturas = fakes => fakes.abridor.pedidos().filter(p => p.mensagem.acao === 'abrir');
const ABRIR = { mensagem: { acao: 'abrir' }, origem: `${contrato.origemDaExtensao}/` };

const faixa = page => page.locator('#frases-avisos [data-aviso="envio-anki-fechado"]');
const abrirSozinho = page => faixa(page).getByRole('button', { name: 'Abrir o Anki sozinho' });
const pedidosAoJobs = fakes => fakes.anki.requisicoes.filter(r => r.caminho.startsWith('/jobs'));

test.beforeEach(({ fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
});

/** O Anki fechado numa computador onde a Conexão já respondeu uma vez, e uma Frase marcada. */
async function prepararComOAnkiFechado(page, extensao, fakes) {
  await extensao.gravarStorage({ frases: INGLESAS, pm_anki_ja_conectou: true });
  fakes.anki.desligar();
  await abrirPainel(page, extensao);
  await marcar(page, SACK.texto).check();
}

test.describe('com a permissão do abridor', () => {
  test.use({ permissaoDoAbridor: true });

  test('Enviar com o Anki fechado chama o abridor, a faixa conta, e as Frases saem quando o Anki responde', async ({ page, extensao, fakes }) => {
    await prepararComOAnkiFechado(page, extensao, fakes);

    await enviarAoAnki(page).click();

    await expect(faixa(page)).toHaveText('Abrindo o Anki para enviar…');
    await expect.poll(() => aberturas(fakes)).toEqual([ABRIR]);
    // Nada sai antes de o Anki responder, e o progresso ainda não abriu.
    expect(pedidosAoJobs(fakes)).toHaveLength(0);
    await expect(progresso(page)).toBeHidden();

    fakes.anki.ligar();
    await expect(faixa(page)).toBeHidden({ timeout: 10_000 });
    const [job] = await enviosCriados(fakes, 1);
    expect(job.entries.map(e => e.phraseId)).toEqual([SACK.id]);
    await expect(progresso(page)).toBeVisible();
    // O abridor foi chamado uma vez só: o Envio não o chama de novo com o Anki respondendo.
    expect(aberturas(fakes)).toEqual([ABRIR]);
    await estadoFinal(extensao, { pm_envio: { envios: [{ ids: [SACK.id], jobId: job.jobId }] } });
  });

  test('Tentar de novo num Envio que não começou, com o Anki já fechado, chama o abridor e reenvia o mesmo pedido', async ({ page, extensao, fakes }) => {
    await extensao.gravarStorage({ frases: INGLESAS, pm_anki_ja_conectou: true });
    fakes.anki.recusarEnvios('en', { rede: true });
    await abrirPainel(page, extensao);
    await marcar(page, SACK.texto).check();
    await enviarAoAnki(page).click();
    const cartao = progresso(page).getByRole('group', { name: /^Envio em inglês/ });
    await expect(cartao).toContainText('Não começou');
    expect(aberturas(fakes)).toEqual([]);
    const { pm_envio: antes } = await extensao.lerStorage('pm_envio');
    const primeiro = antes.envios[0];

    // O Anki fechou sem o painel ter visto: o Tentar de novo confere a Conexão e chama o abridor.
    fakes.anki.desligar();
    await cartao.getByRole('button', { name: 'Tentar de novo' }).click();
    await expect.poll(() => aberturas(fakes)).toEqual([ABRIR]);

    fakes.anki.aceitarEnvios('en');
    fakes.anki.ligar();
    const [job] = await enviosCriados(fakes, 1);
    expect(job.entries.map(e => e.phraseId)).toEqual([SACK.id]);
    expect(job.jobId).toBe(primeiro.id);
    expect(job.corpo).toEqual(primeiro.corpo);
    await expect(faixa(page)).toBeHidden({ timeout: 10_000 });
    await estadoFinal(extensao, { pm_envio: { envios: [{ id: primeiro.id, ids: [SACK.id], jobId: primeiro.id }] } });
  });

  test('o abridor que não consegue abrir o Anki deixa a faixa “Abra o Anki para enviar”, e abrir à mão envia', async ({ page, extensao, fakes }) => {
    fakes.abridor.definir('achei_sem_abrir');
    await prepararComOAnkiFechado(page, extensao, fakes);

    await enviarAoAnki(page).click();

    await expect(faixa(page)).toContainText('Abra o Anki para enviar');
    await expect(abrirSozinho(page)).toHaveCount(0);
    await faixa(page).getByText('Detalhes').click();
    await expect(faixa(page)).toContainText('nao_abriu');
    expect(aberturas(fakes)).toEqual([ABRIR]);
    expect(pedidosAoJobs(fakes)).toHaveLength(0);

    // A pessoa abre o Anki por conta própria: o Envio que ela pediu sai.
    fakes.anki.ligar();
    await expect(faixa(page)).toBeHidden({ timeout: 10_000 });
    const [job] = await enviosCriados(fakes, 1);
    expect(job.entries.map(e => e.phraseId)).toEqual([SACK.id]);
    await estadoFinal(extensao, { pm_envio: { envios: [{ ids: [SACK.id], jobId: job.jobId }] } });
  });

  test('nunca conectada, Enviar ao Anki segue indisponível e o abridor não é chamado', async ({ page, extensao, fakes }) => {
    await extensao.gravarStorage({ frases: INGLESAS });
    fakes.anki.desligar();
    await abrirPainel(page, extensao);
    await marcar(page, SACK.texto).check();

    await expect(enviarAoAnki(page)).toHaveAttribute('aria-disabled', 'true');
    await enviarAoAnki(page).click({ force: true });

    await expect(faixa(page)).toHaveCount(0);
    expect(aberturas(fakes)).toEqual([]);
    expect(pedidosAoJobs(fakes)).toHaveLength(0);
    await estadoFinal(extensao, { pm_envio: null });
  });

  test('o Anki nunca abre só para ler o vocabulário: entrar nas áreas, esperar e Atualizar com o Anki fechado não chamam o abridor', async ({ page, extensao, fakes }) => {
    await extensao.gravarStorage({ pm_anki_ja_conectou: true });
    fakes.anki.desligar();
    await page.goto(extensao.url('painel.html#anki/baralhos'));
    await expect(page.locator('.shell-aba[data-aba="baralhos"]')).toContainText('— esperando o Anki');
    await page.locator('label.veio-segmentado__opcao').filter({ hasText: /^Vocabulário$/ }).click();
    await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await page.goto(extensao.url('popup.html'));
    await expect(page.locator('#azulejos')).toBeVisible();
    // Uma conferência do /health inteira, e a do popup, passam sem abrir nada.
    await page.waitForTimeout(3_500);

    expect(aberturas(fakes)).toEqual([]);
    await estadoFinalEm('as mensagens que o abridor recebeu', () => aberturas(fakes), []);
  });
});

test.describe('sem a permissão do abridor', () => {
  test('Enviar com o Anki fechado mostra “Abra o Anki para enviar” com o botão que pede a permissão, e abrir à mão envia', async ({ page, extensao, fakes }) => {
    await prepararComOAnkiFechado(page, extensao, fakes);

    await enviarAoAnki(page).click();

    await expect(faixa(page)).toContainText('Abra o Anki para enviar');
    await expect(abrirSozinho(page)).toBeVisible();
    expect(await extensao.permissaoDoAbridor()).toBe(false);
    expect(aberturas(fakes)).toEqual([]);
    expect(pedidosAoJobs(fakes)).toHaveLength(0);

    // O botão pede a permissão ao Chrome: o aviso dele espera a resposta, e nada chega ao abridor.
    await abrirSozinho(page).click();
    await expect(abrirSozinho(page)).toHaveAttribute('aria-disabled', 'true');
    expect(aberturas(fakes)).toEqual([]);
    await estadoFinalEm('a permissão nativeMessaging no Chrome', () => extensao.permissaoDoAbridor(), false);

    // A pessoa abre o Anki por conta própria: o Envio que ela pediu sai.
    fakes.anki.ligar();
    await expect(faixa(page)).toBeHidden({ timeout: 10_000 });
    const [job] = await enviosCriados(fakes, 1);
    expect(job.entries.map(e => e.phraseId)).toEqual([SACK.id]);
    await estadoFinal(extensao, { pm_envio: { envios: [{ ids: [SACK.id], jobId: job.jobId }] } });
  });
});
