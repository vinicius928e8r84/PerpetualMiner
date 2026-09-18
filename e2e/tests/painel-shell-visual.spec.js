'use strict';

// Referência visual do shell “Ilhas” (#25). O dono aprovou as telas lado a lado
// com o protótipo B; estas capturas são essas telas, e qualquer mudança visual
// no shell faz o teste falhar até alguém olhar e atualizar a referência:
//
//   cd e2e && npx playwright test painel-shell-visual --update-snapshots
//
// O conteúdo de hoje (a lista de frases, custos, baralhos…) ainda vai ser
// reconstruído, cada área no seu ticket, então fica coberto: o que a captura
// guarda é o shell — a sidebar, os indicadores, as ilhas, a faixa F1 e o chip.

const { test, expect } = require('../fixtures');

const FRASES = [
  { id: 1_700_000_000_003, texto: 'The harbour was quiet before the storm.', data: '18/09/2026', streaming: 'netflix', idioma: 'Inglês' },
  { id: 1_700_000_000_002, texto: 'She kept the letter in her coat pocket.', data: '18/09/2026', streaming: 'youtube', idioma: 'Inglês' },
  { id: 1_700_000_000_001, texto: 'Я долго думал об этом.', data: '17/09/2026', streaming: 'netflix', idioma: 'Russo' },
];

// “(hoje)”, “(ontem)” e “Sincronizado agora” saem do relógio: ele fica parado
// no dia das frases de exemplo.
const AGORA = new Date('2026-09-18T12:00:00');

const semOConteudoDeHoje = page => ({ mask: [page.locator('.conteudo-de-hoje')] });

async function abrirPainel(page, extensao, endereco, largura = 1280) {
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: largura, height: 800 });
  await page.goto(extensao.url(`painel.html${endereco}`));
  await expect(page.getByRole('navigation', { name: 'Navegação do painel' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test('Frases, com a sidebar larga', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await abrirPainel(page, extensao, '#frases');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');
  await expect(page.locator('.shell-contador')).toHaveText('3');

  await expect(page).toHaveScreenshot('frases-larga.png', semOConteudoDeHoje(page));
});

test('primeira execução: Frases 0, Conexão desligada e sem conta', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirPainel(page, extensao, '');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'desligada');
  await expect(page.locator('.shell-contador')).toHaveText('0');

  await expect(page).toHaveScreenshot('primeira-execucao.png', semOConteudoDeHoje(page));
});

test('Frases, com a sidebar em trilho', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await abrirPainel(page, extensao, '#frases', 900);
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');
  await expect(page.locator('.shell-contador')).toHaveText('3');

  await expect(page).toHaveScreenshot('frases-trilho.png', semOConteudoDeHoje(page));
});

test('Conexão com o Anki desligada, com a faixa F1', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirPainel(page, extensao, '#anki/custos');
  await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeEnabled();

  await expect(page).toHaveScreenshot('anki-desligada.png', semOConteudoDeHoje(page));
});

test('Configurações, com a conta sincronizada', async ({ page, extensao }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await abrirPainel(page, extensao, '#configuracoes');
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado agora');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('configuracoes.png');
});
