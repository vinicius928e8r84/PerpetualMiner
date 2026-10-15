'use strict';

const { test, expect } = require('../fixtures');

const LEGENDA = 'The quiet harbor woke before the gulls did.';
const TRECHO = 'Every lantern along the pier flickered in the salt wind.';

const ALT_S = { type: 'keyboard', code: 'KeyS', altKey: true, ctrlKey: false, shiftKey: false };
const SELECAO_NO_BOTAO_VOLTAR_EM_INGLES = {
  type: 'mouse', button: 3, code: null, altKey: true, ctrlKey: false, shiftKey: false, label: 'Alt+Mouse Back',
};

async function abrirAtalhos(page, extensao) {
  await page.goto(extensao.url('painel.html#configuracoes/atalhos'));
  await expect(page.getByRole('button', { name: 'Atalhos', exact: true })).toHaveAttribute('aria-expanded', 'true');
}

const cardDeAtalhos = page => page.locator('#cfg-atalhos');
const linha = (page, nome) => cardDeAtalhos(page).getByRole('group', { name: nome });
const tecla = (page, nome) => linha(page, nome).locator('kbd, .cfg-gravando');
const gravar = (page, nome) => linha(page, nome).getByRole('button', { name: 'Gravar atalho' });
const cancelar = (page, nome) => linha(page, nome).getByRole('button', { name: 'Cancelar' });
const restaurar = page => cardDeAtalhos(page).getByRole('button', { name: 'Restaurar atalhos padrão' });

async function atalhosGravados(extensao) {
  return extensao.lerStorage(['pm_atalho', 'pm_atalho_legenda']);
}

/** Aperta um botão do mouse pelo protocolo do Chromium: o Playwright só tem esquerdo, direito e do meio. */
async function apertarBotaoDoMouse(page, botao, { alt = false } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const BOTOES = { back: 8, forward: 16 };
  const base = { x: 400, y: 20, button: botao, clickCount: 1, modifiers: alt ? 1 : 0 };
  await cdp.send('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: BOTOES[botao] });
  await cdp.send('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 });
  await cdp.detach();
}

test('aberto, o card mostra a descrição e as duas linhas com o padrão: Alt+S e “Sem atalho” tracejado', async ({ page, extensao }) => {
  await abrirAtalhos(page, extensao);

  await expect(cardDeAtalhos(page).locator('.cfg-descricao')).toHaveText(
    'Vale para qualquer página aberta no Chrome. Grave uma combinação de teclas ou um botão extra do mouse.');
  await expect(linha(page, 'Minerar legenda')).toContainText('Minera a legenda que está na tela do vídeo.');
  await expect(linha(page, 'Minerar seleção')).toContainText('Minera o texto que você selecionou na página.');
  await expect(tecla(page, 'Minerar legenda')).toHaveText('Alt+S');
  await expect(tecla(page, 'Minerar seleção')).toHaveText('Sem atalho');
  await expect(tecla(page, 'Minerar seleção')).toHaveClass(/veio-kbd--sem-atalho/);
  await expect(gravar(page, 'Minerar legenda')).toBeVisible();
  await expect(gravar(page, 'Minerar seleção')).toBeVisible();

  // Com tudo no padrão, não há o que restaurar.
  await expect(restaurar(page)).toHaveCount(0);
});

test('um atalho gravado em inglês aparece em PT-BR na linha', async ({ page, extensao }) => {
  await extensao.gravarStorage({ pm_atalho: SELECAO_NO_BOTAO_VOLTAR_EM_INGLES });
  await abrirAtalhos(page, extensao);

  await expect(tecla(page, 'Minerar seleção')).toHaveText('Alt+Botão voltar');
});

test('gravar Ctrl+Shift+K para Minerar legenda: no player, Ctrl+Shift+K minera e Alt+S não', async ({ page, context, paginas, extensao }) => {
  // O player já está aberto: o content script segue o atalho novo sem recarregar.
  const player = await context.newPage();
  await player.goto(paginas.url('player.html'));
  await expect(player.getByRole('button', { name: /^Minerar legenda/ })).toBeVisible();

  await abrirAtalhos(page, extensao);
  await gravar(page, 'Minerar legenda').click();
  await page.keyboard.press('Control+Shift+KeyK');

  await expect(tecla(page, 'Minerar legenda')).toHaveText('Ctrl+Shift+K');
  await expect(gravar(page, 'Minerar legenda')).toBeFocused();
  expect((await atalhosGravados(extensao)).pm_atalho_legenda).toMatchObject({
    type: 'keyboard', code: 'KeyK', ctrlKey: true, shiftKey: true, altKey: false,
  });
  // O resumo da linha fechada acompanha.
  await page.getByRole('button', { name: 'Atalhos', exact: true }).click();
  await expect(cardDeAtalhos(page).locator('.cfg-resumo > span')).toHaveText(['Legenda Ctrl+Shift+K', 'Seleção Sem atalho']);

  await player.bringToFront();
  await player.keyboard.press('Alt+KeyS');
  await player.waitForTimeout(800);
  expect(await extensao.frases()).toEqual([]);

  await player.keyboard.press('Control+Shift+KeyK');
  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([LEGENDA]);
});

test('gravando: a tecla vira a pílula ouro, o botão vira Cancelar e o da outra linha fica indisponível', async ({ page, extensao }) => {
  await abrirAtalhos(page, extensao);
  await gravar(page, 'Minerar legenda').click();

  await expect(tecla(page, 'Minerar legenda')).toHaveText('Pressione as teclas ou um botão extra do mouse…');
  await expect(cancelar(page, 'Minerar legenda')).toBeVisible();
  await expect(gravar(page, 'Minerar seleção')).toBeDisabled();

  // Cancelar volta a linha como estava, sem gravar nada.
  await cancelar(page, 'Minerar legenda').click();
  await expect(tecla(page, 'Minerar legenda')).toHaveText('Alt+S');
  await expect(gravar(page, 'Minerar seleção')).toBeEnabled();
  expect(await atalhosGravados(extensao)).toEqual({});
});

test('Esc sem modificador cancela; só as teclas modificadoras não gravam', async ({ page, extensao }) => {
  await abrirAtalhos(page, extensao);
  await gravar(page, 'Minerar legenda').click();

  await page.keyboard.press('Shift');
  await page.keyboard.press('Control');
  await expect(cancelar(page, 'Minerar legenda')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(tecla(page, 'Minerar legenda')).toHaveText('Alt+S');
  await expect(gravar(page, 'Minerar legenda')).toBeFocused();
  expect(await atalhosGravados(extensao)).toEqual({});
});

test('uma tecla sem Ctrl, Alt nem Shift não grava, nem com Meta: a gravação continua', async ({ page, extensao }) => {
  await abrirAtalhos(page, extensao);
  await gravar(page, 'Minerar legenda').click();

  // Um “K” sozinho tomaria a letra de todo campo de texto de toda página.
  await page.keyboard.press('KeyK');
  await page.keyboard.press('F2');
  await page.keyboard.press('Meta+KeyK');

  await expect(tecla(page, 'Minerar legenda')).toHaveText('Pressione as teclas ou um botão extra do mouse…');
  expect(await atalhosGravados(extensao)).toEqual({});
});

test('sair do card cancela a gravação: a tecla digitada lá fora não vira atalho', async ({ page, extensao }) => {
  await abrirAtalhos(page, extensao);

  // Indo a outra área.
  await gravar(page, 'Minerar legenda').click();
  await page.locator('a.shell-item[data-area="frases"]').click();
  await expect(page).toHaveURL(/#frases$/);
  // O endereço muda antes de o painel reagir a ele (o hashchange vem depois, e uma tecla pode passar na frente):
  // só com a área de Frases na tela a gravação já foi cancelada.
  await expect(page.getByRole('heading', { name: 'Frases mineradas' })).toBeVisible();
  await page.keyboard.press('Alt+KeyE');

  // Fechando o card.
  await abrirAtalhos(page, extensao);
  await gravar(page, 'Minerar seleção').click();
  await page.getByRole('button', { name: 'Atalhos', exact: true }).click();
  await expect(page.locator('#cfg-atalhos-corpo')).toBeHidden();
  await page.keyboard.press('Alt+KeyD');

  expect(await atalhosGravados(extensao)).toEqual({});
  await page.getByRole('button', { name: 'Atalhos', exact: true }).click();
  await expect(tecla(page, 'Minerar legenda')).toHaveText('Alt+S');
  await expect(tecla(page, 'Minerar seleção')).toHaveText('Sem atalho');
  await expect(gravar(page, 'Minerar legenda')).toBeEnabled();
});

test('clique esquerdo e direito não gravam: a gravação continua', async ({ page, extensao }) => {
  await abrirAtalhos(page, extensao);
  await gravar(page, 'Minerar seleção').click();

  await page.locator('#titulo-configuracoes').click();
  await page.locator('#titulo-configuracoes').click({ button: 'right' });

  await expect(tecla(page, 'Minerar seleção')).toHaveText('Pressione as teclas ou um botão extra do mouse…');
  expect(await atalhosGravados(extensao)).toEqual({});
});

test('gravar o botão voltar do mouse funciona e não navega enquanto grava', async ({ page, extensao }) => {
  // Há para onde voltar: sem a gravação, o botão voltar levaria a #frases.
  await page.goto(extensao.url('painel.html#frases'));
  await abrirAtalhos(page, extensao);

  await gravar(page, 'Minerar seleção').click();
  await apertarBotaoDoMouse(page, 'back', { alt: true });

  await expect(tecla(page, 'Minerar seleção')).toHaveText('Alt+Botão voltar');
  expect((await atalhosGravados(extensao)).pm_atalho).toMatchObject({ type: 'mouse', button: 3, altKey: true });
  await page.waitForTimeout(300);
  expect(new URL(page.url()).hash).toBe('#configuracoes/atalhos');
});

test('o atalho de seleção gravado aqui minera o texto selecionado, como hoje', async ({ page, context, paginas, extensao }) => {
  await abrirAtalhos(page, extensao);
  await gravar(page, 'Minerar seleção').click();
  await page.keyboard.press('Alt+KeyE');
  await expect(tecla(page, 'Minerar seleção')).toHaveText('Alt+E');

  const texto = await context.newPage();
  await texto.goto(paginas.url('texto.html'));
  await texto.locator('#trecho').selectText();
  await texto.keyboard.press('Alt+KeyE');

  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([TRECHO]);
});

test('sem atalho de legenda gravado, Alt+S não minera no player', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({ pm_atalho_legenda: null });
  await page.goto(paginas.url('player.html'));
  await expect(page.getByRole('button', { name: /^Minerar legenda/ })).toBeVisible();

  await page.keyboard.press('Alt+KeyS');
  await page.waitForTimeout(800);
  expect(await extensao.frases()).toEqual([]);
});

test('um atalho repetido é recusado com aviso, e nada muda até sair uma combinação livre', async ({ page, extensao }) => {
  await abrirAtalhos(page, extensao);
  await gravar(page, 'Minerar seleção').click();
  await page.keyboard.press('Alt+KeyS');

  const aviso = linha(page, 'Minerar seleção').getByText('Esse atalho já é do Minerar legenda. Grave outro.');
  await expect(aviso).toBeVisible();
  // O aviso é danger e a gravação continua.
  const corDoPerigo = await page.evaluate(() => {
    const amostra = document.createElement('span');
    amostra.style.color = 'var(--veio-danger)';
    document.body.append(amostra);
    return getComputedStyle(amostra).color;
  });
  expect(await aviso.evaluate(el => getComputedStyle(el).color)).toBe(corDoPerigo);
  await expect(tecla(page, 'Minerar seleção')).toHaveText('Pressione as teclas ou um botão extra do mouse…');
  expect(await atalhosGravados(extensao)).toEqual({});

  await page.keyboard.press('Alt+KeyD');
  await expect(tecla(page, 'Minerar seleção')).toHaveText('Alt+D');
  await expect(aviso).toHaveCount(0);
  expect((await atalhosGravados(extensao)).pm_atalho).toMatchObject({ type: 'keyboard', code: 'KeyD', altKey: true });
});

test('o repetido vale também para o botão do mouse, pelo nome do outro atalho', async ({ page, extensao }) => {
  await extensao.gravarStorage({ pm_atalho: SELECAO_NO_BOTAO_VOLTAR_EM_INGLES });
  await abrirAtalhos(page, extensao);

  await gravar(page, 'Minerar legenda').click();
  await apertarBotaoDoMouse(page, 'back', { alt: true });

  await expect(linha(page, 'Minerar legenda').getByText('Esse atalho já é do Minerar seleção. Grave outro.')).toBeVisible();
  await expect(tecla(page, 'Minerar legenda')).toHaveText('Pressione as teclas ou um botão extra do mouse…');
  expect((await atalhosGravados(extensao)).pm_atalho_legenda).toBeUndefined();
});

test('Restaurar atalhos padrão só aparece fora do padrão e grava {legenda: Alt+S, seleção: nenhum} na hora', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    pm_atalho: SELECAO_NO_BOTAO_VOLTAR_EM_INGLES,
    pm_atalho_legenda: { type: 'keyboard', code: 'KeyK', altKey: false, ctrlKey: true, shiftKey: true },
  });
  await page.addInitScript(() => {
    window.__confirmacoes = 0;
    window.confirm = () => { window.__confirmacoes += 1; return true; };
  });
  await abrirAtalhos(page, extensao);

  await expect(cardDeAtalhos(page)).toContainText('Padrão: Minerar legenda em Alt+S, Minerar seleção sem atalho.');
  await restaurar(page).click();

  await expect(tecla(page, 'Minerar legenda')).toHaveText('Alt+S');
  await expect(tecla(page, 'Minerar seleção')).toHaveText('Sem atalho');
  await expect(restaurar(page)).toHaveCount(0);
  const gravados = await atalhosGravados(extensao);
  expect(gravados.pm_atalho).toBeNull();
  expect(gravados.pm_atalho_legenda).toMatchObject(ALT_S);
  // Sem confirmação, sem modal e sem toast.
  expect(await page.evaluate(() => window.__confirmacoes)).toBe(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.veio-toast')).toHaveCount(0);
  // O foco não se perde com o botão que sumiu.
  await expect(gravar(page, 'Minerar legenda')).toBeFocused();
});

test('Restaurar aparece assim que um atalho deixa o padrão', async ({ page, extensao }) => {
  await abrirAtalhos(page, extensao);
  await expect(restaurar(page)).toHaveCount(0);

  await gravar(page, 'Minerar seleção').click();
  await page.keyboard.press('Alt+KeyE');

  await expect(restaurar(page)).toBeVisible();
});

test('pelo teclado: Tab chega ao Gravar atalho, Enter grava e o foco aparece', async ({ page, extensao }) => {
  await abrirAtalhos(page, extensao);
  await gravar(page, 'Minerar legenda').focus();
  await expect(gravar(page, 'Minerar legenda')).toBeFocused();
  const anel = await gravar(page, 'Minerar legenda').evaluate(el => getComputedStyle(el).outlineStyle);
  expect(anel).not.toBe('none');

  await page.keyboard.press('Enter');
  await expect(cancelar(page, 'Minerar legenda')).toBeFocused();
  await page.keyboard.press('Control+Shift+KeyK');
  await expect(tecla(page, 'Minerar legenda')).toHaveText('Ctrl+Shift+K');
});

test('o leitor de tela ouve a gravação, o aviso de repetido e o nome da ação de cada botão', async ({ page, extensao }) => {
  await abrirAtalhos(page, extensao);

  // Cada Gravar atalho diz de qual ação é.
  await expect(gravar(page, 'Minerar legenda')).toHaveAccessibleDescription('Minerar legenda');
  // A região que anuncia já está na linha antes de gravar, vazia: o leitor de
  // tela só lê o que muda numa região que já existe.
  await expect(linha(page, 'Minerar seleção').getByRole('status')).toHaveText('');
  await gravar(page, 'Minerar seleção').click();
  await expect(linha(page, 'Minerar seleção').getByRole('status')).toHaveText('Pressione as teclas ou um botão extra do mouse…');
  await page.keyboard.press('Alt+KeyS');
  await expect(linha(page, 'Minerar seleção').getByRole('alert')).toHaveText('Esse atalho já é do Minerar legenda. Grave outro.');
});

test('com movimento reduzido, a pílula de gravação não pulsa', async ({ page, extensao }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await abrirAtalhos(page, extensao);
  await gravar(page, 'Minerar legenda').click();

  const pilula = tecla(page, 'Minerar legenda');
  const animacao = await pilula.evaluate(el => {
    const estilo = getComputedStyle(el);
    return { nome: estilo.animationName, repeticoes: estilo.animationIterationCount };
  });
  expect(animacao.nome).toBe('none');
});

test('com movimento reduzido, a tecla nova não pisca', async ({ page, extensao }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await abrirAtalhos(page, extensao);
  await gravar(page, 'Minerar legenda').click();
  await page.keyboard.press('Control+Shift+KeyK');

  const kbd = tecla(page, 'Minerar legenda');
  await expect(kbd).toHaveText('Ctrl+Shift+K');
  expect(await kbd.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
});

test('sem movimento reduzido, a pílula de gravação pulsa', async ({ page, extensao }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await abrirAtalhos(page, extensao);
  await gravar(page, 'Minerar legenda').click();

  const repeticoes = await tecla(page, 'Minerar legenda').evaluate(el => getComputedStyle(el).animationIterationCount);
  expect(repeticoes).toBe('infinite');
});

test('com o botão voltar gravado para a legenda, minerar não leva a página de volta', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({
    pm_atalho_legenda: { type: 'mouse', button: 3, code: null, altKey: true, ctrlKey: false, shiftKey: false },
  });
  // Há para onde voltar: sem a extensão, o botão voltar sairia do player.
  await page.goto(paginas.url('sem-video.html'));
  await page.goto(paginas.url('player.html'));
  await expect(page.getByRole('button', { name: /^Minerar legenda/ })).toBeVisible();

  await apertarBotaoDoMouse(page, 'back', { alt: true });

  await expect.poll(async () => (await extensao.frases()).map(f => f.texto)).toEqual([LEGENDA]);
  expect(page.url()).toContain('player.html');
});
