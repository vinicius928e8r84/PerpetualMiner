'use strict';

// Referência visual de Minerar de uma foto · Fotos × frases (#36).
//
// O dono revisa estas telas lado a lado com o protótipo travado
// (docs/design/foto/prototipo-bookreader.html?variant=C). Depois de aprovadas,
// elas são a referência: uma mudança visual faz o teste falhar até alguém
// olhar e atualizar:
//
//   cd e2e && npx playwright test minerar-foto-visual --update-snapshots
//
// A foto é sempre a mesma página marcada (pages/pagina-marcada.png), e o
// Gemini falso devolve as frases do protótipo. O toast some sozinho, então
// fica mascarado.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../fixtures');

const PAGINA = fs.readFileSync(path.join(__dirname, '..', 'pages', 'pagina-marcada.png'));
const foto = nome => ({ name: nome, mimeType: 'image/png', buffer: PAGINA });

const LIVRO = 'The Brothers Karamazov';
const FRASES_1 = [
  'Above all, don’t lie to yourself.',
  'The mystery of human existence lies not in just staying alive, but in finding something to live for.',
  'Love in action is a harsh and dreadful thing compared with love in dreams.',
];
const FRASES_2 = [
  'Нет ничего обольстительнее для человека, как свобода его совести.',
  'If you want to be respected by others, the great thing is to respect yourself.',
];

async function abrir(page, extensao, { chave = 'chave-de-teste', largura = 1280 } = {}) {
  await extensao.gravarStorage({ bookTitleDefault: LIVRO, ...(chave ? { geminiApiKey: chave } : {}) });
  await page.setViewportSize({ width: largura, height: 800 });
  await page.goto(extensao.url('bookreader.html'));
  await expect(page.getByRole('heading', { name: 'Minerar de uma foto' })).toBeVisible();
  await expect(page.getByLabel('Livro')).toHaveValue(LIVRO);
  await page.evaluate(() => document.fonts.ready);
}

const enviar = (page, ...fotos) => page.locator('#foto-arquivo').setInputFiles(fotos);
const fotoNaFila = (page, nome) => page.getByRole('list', { name: 'Fotos' }).getByRole('listitem').filter({ hasText: nome });

async function comDuasFotosLidas(page, fakes) {
  fakes.gemini.responderFrases(FRASES_1);
  fakes.gemini.responderFrases(FRASES_2);
  await enviar(page, foto('IMG_2041.jpg'), foto('IMG_2042.jpg'));
  await expect(fotoNaFila(page, 'IMG_2042.jpg')).toContainText('2 frases');
}

const referencia = (page, nome) => expect(page).toHaveScreenshot(`${nome}.png`, {
  fullPage: true,
  mask: [page.locator('.veio-toasts')],
});

test('sem chave do Gemini', async ({ page, extensao }) => {
  await abrir(page, extensao, { chave: null });
  await referencia(page, 'foto-sem-chave');
});

test('início, sem fotos', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await referencia(page, 'foto-inicio');
});

test('prévia de uma foto', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await enviar(page, foto('IMG_2041.jpg'));
  await expect(page.getByRole('button', { name: 'Ler marcações' })).toBeVisible();
  await page.locator('.foto-previa__imagem').evaluate(img => img.decode());
  await referencia(page, 'foto-previa');
});

test('lendo um lote: uma lida, uma lendo, uma na fila', async ({ page, extensao, fakes }) => {
  await abrir(page, extensao);
  fakes.gemini.responderFrases(FRASES_1);
  const soltar = fakes.gemini.segurarFrases(FRASES_2);
  await enviar(page, foto('IMG_2041.jpg'), foto('IMG_2042.jpg'), foto('IMG_2043.jpg'));
  await expect(fotoNaFila(page, 'IMG_2042.jpg')).toContainText('Lendo…');
  await referencia(page, 'foto-lendo');
  soltar();
});

test('frases de duas fotos, uma desmarcada', async ({ page, extensao, fakes }) => {
  await abrir(page, extensao);
  await comDuasFotosLidas(page, fakes);
  await page.getByRole('checkbox', { name: FRASES_1[1], exact: true }).uncheck();
  await referencia(page, 'foto-frases');
});

test('frases mineradas', async ({ page, extensao, fakes }) => {
  await abrir(page, extensao);
  await comDuasFotosLidas(page, fakes);
  await page.getByRole('checkbox', { name: FRASES_2[0], exact: true }).uncheck();
  await page.locator('#foto-minerar').click();
  await expect(page.locator('.foto-frase__minerada:visible')).toHaveCount(4);
  await referencia(page, 'foto-mineradas');
});

test('uma foto falhou, a outra foi lida', async ({ page, extensao, fakes }) => {
  await abrir(page, extensao);
  fakes.gemini.responderFrases(FRASES_1);
  fakes.gemini.falhar(429, 'Resource has been exhausted (e.g. check quota).');
  await enviar(page, foto('IMG_2041.jpg'), foto('IMG_2042.jpg'));
  await expect(fotoNaFila(page, 'IMG_2042.jpg')).toContainText('Falhou');
  await referencia(page, 'foto-uma-falhou');
});

test('todas as fotos falharam, com a chave recusada', async ({ page, extensao, fakes }) => {
  await abrir(page, extensao);
  fakes.gemini.falhar(400, 'API key not valid. Please pass a valid API key.');
  fakes.gemini.falhar(400, 'API key not valid. Please pass a valid API key.');
  await enviar(page, foto('IMG_2041.jpg'), foto('IMG_2042.jpg'));
  await expect(fotoNaFila(page, 'IMG_2042.jpg')).toContainText('Falhou');
  await referencia(page, 'foto-todas-falharam');
});

test('nenhuma marcação encontrada', async ({ page, extensao, fakes }) => {
  await abrir(page, extensao);
  fakes.gemini.responderFrases([]);
  await enviar(page, foto('IMG_2041.jpg'));
  await page.getByRole('button', { name: 'Ler marcações' }).click();
  await expect(fotoNaFila(page, 'IMG_2041.jpg')).toContainText('Sem marcações');
  await referencia(page, 'foto-sem-marcacoes');
});

test('janela estreita: a fila sobe para cima das frases', async ({ page, extensao, fakes }) => {
  await abrir(page, extensao, { largura: 720 });
  await comDuasFotosLidas(page, fakes);
  await referencia(page, 'foto-estreita');
});

test('tema claro', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ pm_tema: 'claro' });
  await abrir(page, extensao);
  await comDuasFotosLidas(page, fakes);
  await referencia(page, 'foto-claro');
});
