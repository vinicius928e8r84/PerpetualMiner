'use strict';

// A aba Custos com a chave e com o plano do ChatGPT (#159, histórias 110 e 111): com a chave, o que a pessoa gastou em US$; com o
// plano, os Cartões feitos, o que teriam custado na chave (“Você economizou”) e Gerenciar uso ↗. O Envio nunca mostra valor.
// A Conexão é o fake da fronteira HTTP (fakes/anki.js); as linhas de Custos têm a forma do contrato (`exemplos-dos-custos.json`).

const { test, expect } = require('../fixtures');
const { estadoFinal } = require('../estado-final');
const { AGORA, INGLESAS, SACK, abrirPainel, marcarEEnviar, enviosCriados, progresso, resumo } = require('../apoio-do-envio');

const PELA_CHAVE = [
  { jobId: 'job-en-chave', lang: 'en', createdAt: '2026-09-18T11:00:00', status: 'completed', pedidas: 12, custos: { cartoes: 0.081 } },
];
const PELO_PLANO = [
  { jobId: 'job-en-plano', lang: 'en', createdAt: '2026-09-18T10:00:00', status: 'completed', pedidas: 12, plano: { cartoes: 12, economia: 0.054 } },
  { jobId: 'job-ru-plano', lang: 'ru', createdAt: '2026-09-18T09:00:00', status: 'completed', pedidas: 4, plano: { cartoes: 4, economia: 0.018 } },
];

const custos = page => page.locator('#anki-custos');
const plano = page => custos(page).getByRole('region', { name: 'Plano do ChatGPT' });

async function abrirCustos(page, extensao) {
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#anki/custos'));
}

test('com a chave, a aba Custos mostra em US$ o que a pessoa gastou e nada do plano', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos(PELA_CHAVE);
  await abrirCustos(page, extensao);

  await expect(custos(page).locator('#anki-custos-faixa')).toContainText('Criação de cartões US$ 0,08');
  await expect(plano(page)).toHaveCount(0);
  await expect(custos(page)).not.toContainText('economizou');
  await expect(custos(page).getByRole('link', { name: /Gerenciar uso/ })).toHaveCount(0);
});

test('com o plano, a aba Custos mostra os Cartões feitos, o que teriam custado na chave e Gerenciar uso', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos(PELO_PLANO);
  await abrirCustos(page, extensao);

  await expect(plano(page)).toContainText('16 cartões feitos pelo plano');
  await expect(plano(page)).toContainText('Você economizou US$ 0,07');
  await expect(plano(page)).toContainText('É uma estimativa do que esses cartões teriam custado na chave.');
  const gerenciar = plano(page).getByRole('link', { name: 'Gerenciar uso ↗' });
  await expect(gerenciar).toHaveAttribute('href', 'https://chatgpt.com/settings/usage');
  await expect(gerenciar).toHaveAttribute('target', '_blank');
  // O plano não cobra por Cartão: o que se gastou na chave continua zerado.
  await expect(custos(page).locator('#anki-custos-faixa')).toContainText('Criação de cartões US$ 0,00');
});

test('cada computador conta os seus Cartões: o que a Conexão deste computador deu fica guardado neste navegador', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos(PELO_PLANO);
  await abrirCustos(page, extensao);
  await expect(plano(page)).toContainText('16 cartões feitos pelo plano');

  await estadoFinal(extensao, { pm_anki_custos: { envios: [{ jobId: 'job-en-plano', plan: { cards: 12 } }, { jobId: 'job-ru-plano', plan: { cards: 4 } }] } });
});

// Exceção de teste: sem-estado-guardado — o azulejo só muda o que a aba mostra
test('o azulejo de um idioma conta só os Cartões do plano desse idioma', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos(PELO_PLANO);
  await abrirCustos(page, extensao);
  await expect(plano(page)).toContainText('16 cartões feitos pelo plano');

  await page.getByRole('group', { name: 'Idioma dos custos' }).getByRole('button', { name: /Russo/ }).click();
  await expect(plano(page)).toContainText('4 cartões feitos pelo plano');
  await expect(plano(page)).toContainText('Você economizou US$ 0,02');

  await page.getByRole('group', { name: 'Idioma dos custos' }).getByRole('button', { name: /Inglês/ }).click();
  await expect(plano(page)).toContainText('12 cartões feitos pelo plano');
});

test('na mesma aba, quem usou a chave e o plano vê o US$ gasto e o card do plano', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos([...PELA_CHAVE, PELO_PLANO[0]]);
  await abrirCustos(page, extensao);

  await expect(custos(page).locator('#anki-custos-faixa')).toContainText('Criação de cartões US$ 0,08');
  await expect(plano(page)).toContainText('12 cartões feitos pelo plano');
});

test('um cartão só do plano diz “1 cartão feito pelo plano”', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos([{ jobId: 'job-um', lang: 'en', createdAt: '2026-09-18T10:00:00', status: 'completed', pedidas: 1, plano: { cartoes: 1, economia: 0.0045 } }]);
  await abrirCustos(page, extensao);

  await expect(plano(page)).toContainText('1 cartão feito pelo plano');
  await expect(plano(page)).toContainText('Você economizou < US$ 0,01');
});

for (const [nome, linhas] of [['com a chave', PELA_CHAVE], ['com o plano', PELO_PLANO]]) {
  test(`${nome}, o Envio não mostra valor nem estimativa e não pede os custos`, async ({ page, extensao, fakes }) => {
    fakes.anki.usarRelogio(() => AGORA);
    fakes.anki.definirCustos(linhas);
    await extensao.gravarStorage({ frases: INGLESAS });
    await abrirPainel(page, extensao);

    await marcarEEnviar(page, [SACK.texto]);
    await expect(progresso(page)).toBeVisible();
    await expect(progresso(page)).not.toContainText(/US\$|econom|custo/i);
    const [job] = await enviosCriados(fakes, 1);
    fakes.anki.concluirEnvio(job.jobId);

    await expect(resumo(page)).toBeVisible();
    await expect(resumo(page)).not.toContainText(/US\$|econom|custo/i);
    expect(fakes.anki.requisicoes.filter(r => r.caminho === '/analytics/jobs')).toHaveLength(0);
  });
}
