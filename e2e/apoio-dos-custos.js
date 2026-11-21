'use strict';

const AGORA = new Date('2026-09-18T12:00:00');

const ENVIOS = [
  {
    jobId: 'job-en-concluido', lang: 'en', createdAt: '2026-09-18T11:00:00', status: 'completed', pedidas: 12,
    custos: { cartoes: 0.0810, escolha: 0.0021, triagem: 0.0011 }, imagens: { real: 11, sem: 1 }, economia: 0.15,
  },
  {
    jobId: 'job-ru-parte', lang: 'ru', createdAt: '2026-09-18T09:00:00', status: 'partial', pedidas: 4, enviadas: 3,
    custos: { cartoes: 0.0270, geradas: 0.0120, escolha: 0.0008, triagem: 0.0004, outros: 0.0050 },
    imagens: { real: 1, geradas: 2, falhas: 1 },
    lastError: 'HTTP 502 · AnkiConnect: collection is not available',
  },
  {
    jobId: 'job-en-andando', lang: 'en', createdAt: '2026-09-18T11:50:00', status: 'running', stage: 'generate_images', pedidas: 6,
    custos: { cartoes: 0.0141 }, imagens: { real: 2 },
  },
  {
    jobId: 'job-en-falhou', lang: 'en', createdAt: '2026-09-17T20:00:00', status: 'failed', pedidas: 3,
    custos: { cartoes: 0.0110 }, lastError: 'HTTP 500 · Falha ao criar job EN',
  },
  {
    jobId: 'job-ru-julho', lang: 'ru', createdAt: '2026-07-10T10:00:00', status: 'completed', pedidas: 20,
    custos: { cartoes: 0.1130 }, imagens: { real: 12 },
  },
];

const custos = page => page.locator('#anki-custos');
const azulejos = page => page.getByRole('group', { name: 'Idioma dos custos' });
const listaDeEnvios = page => page.getByRole('listbox', { name: 'Envios recentes' });
const detalheDoEnvio = (page, titulo) => page.getByRole('region', { name: titulo });

async function abrirAnki(page, extensao, { hash = '#anki/custos', jaConectou = true, gravado = {} } = {}) {
  if (jaConectou) await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  if (Object.keys(gravado).length) await extensao.gravarStorage(gravado);
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url(`painel.html${hash}`));
}

module.exports = { AGORA, ENVIOS, custos, azulejos, listaDeEnvios, detalheDoEnvio, abrirAnki };
