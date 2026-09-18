'use strict';

// Referência visual da lista de Frases (#29), no layout A · Cartões do
// protótipo travado (docs/design/painel/frases/prototipo-frases.html?variant=A).
// O dono revisa estas telas lado a lado com o protótipo; depois de aprovadas,
// qualquer mudança visual na lista faz o teste falhar até alguém olhar e
// atualizar a referência:
//
//   cd e2e && npx playwright test painel-frases-visual --update-snapshots
//
// As ações de hoje (.conteudo-de-hoje) ficam cobertas: elas são reconstruídas
// no #30, no #31 e no #32.

const { test, expect } = require('../fixtures');

// O cabeçalho de data sai do relógio: ele fica parado no dia das frases.
const AGORA = new Date('2026-09-18T12:00:00');

const FRASES = [
  { id: 12, texto: 'I never take it for granted.', data: '18/09/2026', streaming: 'netflix', idioma: 'Inglês', keywords: ['granted@10'], status: 'exported', contexto: { fonte: 'netflix', titulo: 'Dark', detalhe: 'T1E3' } },
  { id: 11, texto: 'She was reluctant to say anything.', data: '18/09/2026', streaming: 'youtube', idioma: 'Inglês', keywords: ['reluctant@4'], autoKeyword: true, contexto: { fonte: 'youtube', titulo: 'Vsauce', detalhe: '' } },
  { id: 10, texto: 'Он так и не сказал спасибо.', data: '18/09/2026', streaming: 'livro', idioma: 'Russo', keywords: ['спасибо@10'], contexto: { fonte: 'livro', titulo: 'Мастер и Маргарита', detalhe: 'cap. 3' } },
  { id: 9, texto: 'The meeting was put off until next week.', data: '17/09/2026', streaming: 'web', idioma: 'Inglês', keywords: ['put@6', 'off@8'], contexto: { fonte: 'web', titulo: 'The Guardian', detalhe: '' } },
  { id: 8, texto: 'Don’t beat around the bush.', data: '17/09/2026', streaming: 'pdf', idioma: 'Inglês', contexto: { fonte: 'pdf', titulo: 'Atomic Habits', detalhe: 'cap. 2' } },
  { id: 7, texto: 'You cannot have your cake and eat it.', data: '15/09/2026', streaming: 'manual', idioma: 'Inglês', keywords: ['cake@8', '|', 'eat@12'], contexto: { fonte: 'manual', titulo: '', detalhe: '' } },
  { id: 6, texto: 'Let us call it a day.', data: '15/09/2026', streaming: 'youtube', idioma: 'Inglês', status: 'exported', contexto: { fonte: 'youtube', titulo: 'Veritasium', detalhe: '' } },
  { id: 5, texto: 'He has been under the weather lately.', data: '15/09/2026', streaming: 'netflix', idioma: 'Inglês', contexto: { fonte: 'netflix', titulo: 'The Bear', detalhe: 'T2E3' } },
  { id: 4, texto: 'Мне всё равно.', data: '15/09/2026', streaming: 'youtube', idioma: 'Russo', contexto: { fonte: 'youtube', titulo: 'Russian with Max', detalhe: '' } },
  { id: 3, texto: 'The plan backfired spectacularly.', data: '15/09/2026', streaming: 'web', idioma: 'Inglês', contexto: { fonte: 'web', titulo: 'Wikipedia', detalhe: '' } },
  { id: 2, texto: 'Keep me posted.', data: '13/09/2026', streaming: 'netflix', idioma: 'Inglês', contexto: { fonte: 'netflix', titulo: 'Succession', detalhe: 'T2E4' } },
  { id: 1, texto: 'That ship has sailed.', data: '13/09/2026', streaming: 'netflix', idioma: 'Inglês', contexto: { fonte: 'netflix', titulo: 'Succession', detalhe: 'T2E1' } },
];

const semAsAcoesDeHoje = page => ({ mask: [page.locator('.conteudo-de-hoje')] });

async function abrirFrases(page, extensao, largura = 1280) {
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: largura, height: 1100 });
  await page.goto(extensao.url('painel.html#frases'));
  await expect(page.getByRole('navigation', { name: 'Navegação do painel' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test('a lista em cartões, com a sidebar larga', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await abrirFrases(page, extensao);
  await expect(page.locator('#frases-lista .veio-frase')).toHaveCount(10);

  await expect(page).toHaveScreenshot('frases-lista.png', semAsAcoesDeHoje(page));
});

test('a lista em cartões, com a sidebar em trilho', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await abrirFrases(page, extensao, 900);
  await expect(page.locator('#frases-lista .veio-frase')).toHaveCount(10);

  await expect(page).toHaveScreenshot('frases-lista-trilho.png', semAsAcoesDeHoje(page));
});

test('carregando (PAI-01): 5 cartões-esqueleto', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual' });
  fakes.google.segurarLeituras();
  await abrirFrases(page, extensao);
  await expect(page.locator('.veio-frase-esqueleto')).toHaveCount(5);

  await expect(page.locator('#frases-lista')).toHaveScreenshot('frases-carregando.png');
});

test('primeiro uso (PAI-02)', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await expect(page.locator('#frases-lista .veio-vazio')).toBeVisible();

  await expect(page.locator('#frases-lista')).toHaveScreenshot('frases-primeiro-uso.png');
});

test('filtros esconderam tudo (PAI-03)', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES.filter(f => f.status === 'exported') });
  await abrirFrases(page, extensao);
  await page.locator('.veio-toggle').getByText('Ocultar enviadas e exportadas').click();
  await expect(page.locator('#frases-lista .veio-vazio')).toBeVisible();

  await expect(page.locator('.shell-area[data-area="frases"]')).toHaveScreenshot('frases-filtros-vazios.png', semAsAcoesDeHoje(page));
});

test('busca sem resultado com filtro ligado (PAI-04)', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await abrirFrases(page, extensao);
  await page.getByRole('combobox', { name: 'Idioma', exact: true }).selectOption({ label: 'Russo' });
  await page.getByRole('searchbox', { name: 'Buscar nas frases' }).fill('zebra');
  await expect(page.locator('#frases-lista .veio-vazio')).toBeVisible();

  await expect(page.locator('.shell-area[data-area="frases"]')).toHaveScreenshot('frases-busca-vazia.png', semAsAcoesDeHoje(page));
});
