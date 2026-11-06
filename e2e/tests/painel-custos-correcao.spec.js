'use strict';

// A correção das frases da Criação na aba Custos (#169, história 114): o que a IA gastou corrigindo o que a pessoa escreveu aparece
// numa linha à parte (“Correção das frases”), na faixa de resumo e no detalhe do Envio, e entra no total. Sem correção no Envio,
// a linha não existe. A Conexão é o fake da fronteira HTTP (fakes/anki.js); a linha de Custos tem a forma do contrato
// (`exemplos-da-correcao.json`, onde o complemento real a confere).

const { test, expect } = require('../fixtures');
const { estadoFinal } = require('../estado-final');

const AGORA = new Date('2026-09-18T12:00:00');

const COM_CORRECAO = [
  { jobId: 'job-en-correcao', lang: 'en', createdAt: '2026-09-18T11:00:00', status: 'completed', pedidas: 5, custos: { cartoes: 0.081, correcao: 0.03 } },
];
const SEM_CORRECAO = [
  { jobId: 'job-en-cartoes', lang: 'en', createdAt: '2026-09-18T11:00:00', status: 'completed', pedidas: 5, custos: { cartoes: 0.081 } },
];

const custos = page => page.locator('#anki-custos');
const faixa = page => custos(page).locator('#anki-custos-faixa');
const detalhe = page => page.getByRole('region', { name: 'Envio em inglês · 5 frases' });

async function abrirCustos(page, extensao) {
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#anki/custos'));
}

test('a faixa de resumo e o detalhe do Envio mostram a correção das frases à parte da criação de cartões, e o total soma as duas', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos(COM_CORRECAO);
  await abrirCustos(page, extensao);

  await expect(faixa(page)).toContainText('Criação de cartões US$ 0,08');
  await expect(faixa(page)).toContainText('Correção das frases US$ 0,03');

  await page.getByRole('listbox', { name: 'Envios recentes' }).getByRole('option', { name: /Envio em inglês/ }).click();
  const partes = detalhe(page).locator('dl');
  await expect(partes).toContainText('Criação de cartõesUS$ 0,08');
  await expect(partes).toContainText('Correção das frasesUS$ 0,03');
  await expect(partes).toContainText('TotalUS$ 0,11');

  await estadoFinal(extensao, { pm_anki_custos: { envios: [{ jobId: 'job-en-correcao', costs: { cardUsd: 0.081, correctionUsd: 0.03, totalUsd: 0.111 } }] } });
});

test('um Envio sem correção não tem a linha da correção, nem na faixa nem no detalhe', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos(SEM_CORRECAO);
  await abrirCustos(page, extensao);

  await expect(faixa(page)).toContainText('Criação de cartões US$ 0,08');
  await page.getByRole('listbox', { name: 'Envios recentes' }).getByRole('option', { name: /Envio em inglês/ }).click();
  await expect(detalhe(page).locator('dl')).toContainText('TotalUS$ 0,08');
  await expect(custos(page)).not.toContainText('Correção das frases');

  await estadoFinal(extensao, { pm_anki_custos: { envios: [{ jobId: 'job-en-cartoes', costs: { cardUsd: 0.081, totalUsd: 0.081 } }] } });
});

// Exceção de teste: sem-estado-guardado — abrir o Avançado só muda o que a aba mostra
test('a correção entra no azulejo do idioma e no total com 4 casas do Avançado', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos(COM_CORRECAO);
  await abrirCustos(page, extensao);

  await expect(page.getByRole('group', { name: 'Idioma dos custos' }).getByRole('button', { name: /Todos/ })).toContainText('US$ 0,11');
  await custos(page).getByText('Avançado').click();
  await expect(custos(page)).toContainText('Total com 4 casas');
  await expect(custos(page)).toContainText('US$ 0,1110');
});
