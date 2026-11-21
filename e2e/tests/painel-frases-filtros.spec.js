'use strict';

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');
const HOJE = '18/09/2026';

function frase(id, texto, extras = {}) {
  return { id, texto, data: HOJE, streaming: 'netflix', idioma: 'Inglês', ...extras };
}

async function abrirFrases(page, extensao) {
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#frases'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Frases mineradas');
}

const lista = page => page.locator('#frases-lista');
const cartoes = page => lista(page).locator('.veio-frase');
const cartao = (page, texto) => cartoes(page).filter({ hasText: texto });
const busca = page => page.getByRole('searchbox', { name: 'Buscar nas frases' });
const filtro = (page, nome) => page.getByRole('combobox', { name: nome, exact: true });
const ocultar = page => page.getByRole('switch', { name: 'Ocultar enviadas e exportadas' });
async function ligarOcultar(page) {
  await page.locator('.veio-toggle').getByText('Ocultar enviadas e exportadas').click();
  await expect(ocultar(page)).toBeChecked();
}
const palavra = (page, textoDaFrase, nome) =>
  cartao(page, textoDaFrase).getByRole('button', { name: nome, exact: true });

const PARA_FILTRAR = [
  frase(4, 'That was a close call.', { streaming: 'netflix', contexto: { fonte: 'netflix', titulo: 'The Bear', detalhe: 'T2E1' } }),
  frase(3, 'Я тебе потом перезвоню.', { streaming: 'youtube', idioma: 'Russo', contexto: { fonte: 'youtube', titulo: 'Russian with Max', detalhe: '' } }),
  frase(2, 'It is a long shot, but worth trying.', { streaming: 'netflix', status: 'exported', contexto: { fonte: 'netflix', titulo: 'Ted Lasso', detalhe: 'T1E5' } }),
  frase(1, 'Let us call it a day.', { streaming: 'youtube', contexto: { fonte: 'youtube', titulo: 'Veritasium', detalhe: '' } }),
];

// Exceção de teste: sem-estado-guardado — a busca só filtra a tela; nada é gravado.
test('a busca acha pelo texto e pelo Título, e o × limpa', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: PARA_FILTRAR });
  await abrirFrases(page, extensao);
  const limpar = page.locator('.veio-busca').getByRole('button', { name: 'Limpar busca' });
  await expect(limpar).toBeHidden();

  await busca(page).fill('CALL');
  await expect(cartoes(page)).toHaveText([/close call/, /call it a day/]);
  await expect(limpar).toBeVisible();

  await busca(page).fill('ted lasso');
  await expect(cartoes(page)).toHaveText([/long shot/]);

  await limpar.click();
  await expect(busca(page)).toHaveValue('');
  await expect(cartoes(page)).toHaveCount(4);
  await expect(limpar).toBeHidden();
});

// Exceção de teste: sem-estado-guardado — a busca e os filtros só mudam a tela; nada é gravado.
test('busca sem resultado mostra PAI-04 com Limpar busca, e Limpar filtros só se houver filtro', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: PARA_FILTRAR });
  await abrirFrases(page, extensao);
  const vazio = lista(page).locator('.veio-vazio');

  await busca(page).fill('zebra');
  await expect(vazio).toContainText('Nenhuma frase com “zebra”.');
  await expect(vazio.getByRole('button', { name: 'Limpar busca' })).toBeVisible();
  await expect(vazio.getByRole('button', { name: 'Limpar filtros' })).toHaveCount(0);

  await filtro(page, 'Idioma').selectOption({ label: 'Russo' });
  await expect(vazio.getByRole('button', { name: 'Limpar filtros' })).toBeVisible();

  await vazio.getByRole('button', { name: 'Limpar busca' }).click();
  await expect(busca(page)).toHaveValue('');
  await expect(cartoes(page)).toHaveText([/перезвоню/]);
});

// Exceção de teste: sem-estado-guardado — os filtros e a ordem só mudam a tela; nada é gravado.
test('Fonte, idioma, ordem e “Ocultar enviadas e exportadas” filtram a lista', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: PARA_FILTRAR });
  await abrirFrases(page, extensao);

  await expect(filtro(page, 'Fonte').locator('option')).toHaveText(['Todas as fontes', 'Netflix', 'YouTube']);
  await filtro(page, 'Fonte').selectOption({ label: 'YouTube' });
  await expect(cartoes(page)).toHaveText([/перезвоню/, /call it a day/]);

  await filtro(page, 'Idioma').selectOption({ label: 'Inglês' });
  await expect(cartoes(page)).toHaveText([/call it a day/]);

  await filtro(page, 'Fonte').selectOption({ label: 'Todas as fontes' });
  await filtro(page, 'Ordem').selectOption({ label: 'Mais antigas primeiro' });
  await expect(cartoes(page)).toHaveText([/call it a day/, /long shot/, /close call/]);

  await ligarOcultar(page);
  await expect(cartoes(page)).toHaveText([/call it a day/, /close call/]);
});

// Exceção de teste: sem-estado-guardado — o filtro de Fonte só muda a tela; nada é gravado.
test('o filtro de Fonte escolhe pela mesma Fonte que o selo do cartão mostra', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    frases: [
      frase(3, 'Nothing ventured, nothing gained.', { streaming: 'youtube', contexto: { fonte: 'youtube', titulo: 'Veritasium', detalhe: '' } }),
      frase(2, 'We are on a roll.', { streaming: 'amazon' }),
      frase(1, 'Break a leg tonight.', { streaming: 'primevideo', contexto: { fonte: 'primevideo', titulo: 'Fleabag', detalhe: '' } }),
    ],
  });
  await abrirFrases(page, extensao);

  await expect(cartao(page, 'on a roll').locator('.veio-selo').first()).toHaveText('Prime Video');
  await expect(filtro(page, 'Fonte').locator('option')).toHaveText(['Todas as fontes', 'YouTube', 'Prime Video']);

  await filtro(page, 'Fonte').selectOption({ label: 'Prime Video' });
  await expect(cartoes(page)).toHaveText([/on a roll/, /Break a leg/]);
});

// Exceção de teste: sem-estado-guardado — os filtros só mudam a tela; nada é gravado.
test('filtros escondendo tudo mostram PAI-03, e Limpar filtros traz a lista de volta', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: [PARA_FILTRAR[2]] });
  await abrirFrases(page, extensao);

  await ligarOcultar(page);
  const vazio = lista(page).locator('.veio-vazio');
  await expect(vazio).toContainText('Nenhuma frase com estes filtros.');
  await vazio.getByRole('button', { name: 'Limpar filtros' }).click();

  await expect(ocultar(page)).not.toBeChecked();
  await expect(cartoes(page)).toHaveText([/long shot/]);
});

// Exceção de teste: sem-estado-guardado — o foco do teclado não grava nada.
test('os controles da lista têm nome, e o foco do teclado aparece', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: PARA_FILTRAR });
  await abrirFrases(page, extensao);

  await expect(filtro(page, 'Fonte')).toBeVisible();
  await expect(filtro(page, 'Idioma')).toBeVisible();
  await expect(filtro(page, 'Ordem')).toBeVisible();
  await expect(busca(page)).toBeVisible();
  await expect(ocultar(page)).toBeVisible();

  const focoAparece = async locator => {
    await locator.focus();
    return locator.evaluate(el => {
      const alvo = el.closest('.veio-toggle')?.querySelector('.veio-toggle__trilho') || el;
      const estilo = getComputedStyle(alvo);
      return estilo.outlineStyle === 'solid' || estilo.boxShadow !== 'none';
    });
  };
  await page.keyboard.press('Tab');
  for (const controle of [filtro(page, 'Fonte'), busca(page), ocultar(page), palavra(page, 'close call', 'That')]) {
    expect(await focoAparece(controle), await controle.evaluate(el => el.outerHTML.slice(0, 80))).toBe(true);
  }
});
