'use strict';

// A marca no texto capturado (#41): a linha ouro de 3 px sob o texto, a Palavra
// grifada por cima dele e o chip (título · auto:/palavra: · meta). Quando não dá
// para marcar — a legenda já trocou, a seleção não tem retângulo —, a pílula fala.
// A mineração automática usa a mesma marca, mais apagada, e o contador do botão
// é o do idioma da captura.

const { test, expect } = require('../fixtures');

const LEGENDA = 'The quiet harbor woke before the gulls did.';
const OUTRA_LEGENDA = 'A second line arrives on screen.';
const TRECHO = 'Every lantern along the pier flickered in the salt wind.';
const FRASE_RUSSA = 'Я улыбаюсь';

const MIN_01 = 'Frase minerada e copiada';
const MIN_05 = 'Frase minerada';
const MIN_06 = 'Mineração automática';

const SELECAO_EM_ALT_E = { type: 'keyboard', code: 'KeyE', altKey: true, ctrlKey: false, shiftKey: false };
// O botão “voltar” do mouse: um atalho de seleção que vale com o foco num campo.
const SELECAO_NO_BOTAO_VOLTAR = { type: 'mouse', button: 3, altKey: false, ctrlKey: false, shiftKey: false };

const botaoFlutuante = page => page.getByRole('button', { name: /^Minerar legenda/ });
const feedback = page => page.getByRole('status');
// A linha e o grifo são desenho, não texto: moram na sombra do overlay, fora da
// árvore de acessibilidade, e se acham pelo que são na tela.
const linhas = page => page.locator('perpetualminer-overlay .pm-linha');
const grifos = page => page.locator('perpetualminer-overlay .pm-grifo');
const chip = page => page.locator('perpetualminer-overlay .pm-chip');
const pilulaAberta = page => page.locator('perpetualminer-overlay .pm-pilula--aberta');

/** A caixa de um desenho da marca depois da entrada (a linha cresce da esquerda em 150 ms). */
async function caixaParada(locator) {
  await locator.evaluate(no => Promise.all(no.getAnimations().map(animacao => animacao.finished)));
  return locator.boundingBox();
}

async function abrirPlayer(page, context, paginas) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: paginas.origem });
  await page.goto(paginas.url('player.html'));
  await expect(botaoFlutuante(page)).toBeVisible();
}

/** Onde uma palavra do texto do site está na tela: o retângulo dela, medido na própria página. */
function caixaDaPalavra(page, seletor, palavra) {
  return page.locator(seletor).evaluate((no, palavra) => {
    const texto = no.firstChild;
    const inicio = texto.textContent.indexOf(palavra);
    const trecho = document.createRange();
    trecho.setStart(texto, inicio);
    trecho.setEnd(texto, inicio + palavra.length);
    const { x, y, width, height } = trecho.getBoundingClientRect();
    return { x, y, width, height };
  }, palavra);
}

/** O retângulo do texto (sem o padding do elemento), como a pessoa o lê. */
function caixaDoTexto(page, seletor) {
  return page.locator(seletor).evaluate(no => {
    const trecho = document.createRange();
    trecho.selectNodeContents(no);
    const { x, y, width, height } = trecho.getBoundingClientRect();
    return { x, y, width, height };
  });
}

// As falhas do armazenamento do service worker, injetadas na fronteira (ver overlay.spec.js).
const segurarGravacoes = extensao => extensao.serviceWorker.evaluate(() => {
  globalThis.__setOriginal ??= chrome.storage.local.set;
  globalThis.__seguradas = [];
  chrome.storage.local.set = (valores, callback) => new Promise(resolve => {
    globalThis.__seguradas.push(() => globalThis.__setOriginal.call(chrome.storage.local, valores)
      .then(() => { callback?.(); resolve(); }));
  });
});

const voltarGravacoes = extensao => extensao.serviceWorker.evaluate(() => {
  if (globalThis.__setOriginal) chrome.storage.local.set = globalThis.__setOriginal;
  for (const soltar of globalThis.__seguradas || []) soltar();
  globalThis.__seguradas = [];
});

// ─── A legenda ───────────────────────────────────────────────────────────────

test('Alt+S num player com legenda: a linha fica sob a legenda e o grifo sobre a Palavra que o service worker devolveu', async ({ page, context, paginas, fakes, extensao }) => {
  fakes.anki.definirVocabulario('en', ['quiet', 'harbor', 'woke']);
  await abrirPlayer(page, context, paginas);

  await page.keyboard.press('Alt+KeyS');

  // O chip: o título, a Palavra detectada e o idioma.
  await expect(chip(page)).toBeVisible();
  await expect(chip(page)).toContainText(MIN_01);
  await expect(chip(page)).toContainText('auto:');
  await expect(chip(page)).toContainText('gulls');
  await expect(chip(page).getByText('EN', { exact: true })).toBeVisible();
  // O leitor de tela ouve o feedback inteiro, com a frase.
  await expect(feedback(page)).toContainText(MIN_01);
  await expect(feedback(page)).toContainText(LEGENDA);

  // A linha: 3 px, logo abaixo do texto da legenda e da largura dele.
  const texto = await caixaDoTexto(page, '#legenda');
  await expect(linhas(page)).toHaveCount(1);
  const linha = await caixaParada(linhas(page));
  expect(Math.round(linha.height)).toBe(3);
  expect(linha.y).toBeGreaterThanOrEqual(texto.y + texto.height);
  expect(linha.y).toBeLessThanOrEqual(texto.y + texto.height + 6);
  expect(Math.abs(linha.x - texto.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(linha.width - texto.width)).toBeLessThanOrEqual(1);

  // O grifo: a faixa de marca-texto sobre “gulls”, na metade de baixo da linha.
  const palavra = await caixaDaPalavra(page, '#legenda', 'gulls');
  await expect(grifos(page)).toHaveCount(1);
  const grifo = await caixaParada(grifos(page));
  expect(Math.abs(grifo.x - palavra.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(grifo.width - palavra.width)).toBeLessThanOrEqual(3);
  expect(grifo.y).toBeGreaterThanOrEqual(palavra.y + palavra.height * 0.4);
  expect(grifo.y + grifo.height).toBeLessThanOrEqual(palavra.y + palavra.height + 1);

  // O chip fica acima da legenda; a pílula não abre.
  expect((await chip(page).boundingBox()).y + (await chip(page).boundingBox()).height).toBeLessThanOrEqual(texto.y);
  await expect(pilulaAberta(page)).toHaveCount(0);
  // Nada do site foi tocado: a legenda continua com o texto e os nós de antes.
  expect(await page.locator('#legenda').evaluate(no => no.childNodes.length)).toBe(1);
  expect((await extensao.frases()).map(f => f.texto)).toEqual([LEGENDA]);

  // Sucesso some sozinho, com a marca inteira.
  await expect(chip(page)).toBeHidden({ timeout: 5000 });
  await expect(linhas(page)).toHaveCount(0);
  await expect(grifos(page)).toHaveCount(0);
});

test('a legenda troca antes da resposta: a pílula fala, com a frase e a Palavra, e não há linha', async ({ page, context, paginas, fakes, extensao }) => {
  fakes.anki.definirVocabulario('en', ['quiet', 'harbor', 'woke']);
  await abrirPlayer(page, context, paginas);
  await segurarGravacoes(extensao);

  await page.keyboard.press('Alt+KeyS');
  await page.waitForTimeout(500);
  await page.locator('#legenda').evaluate((no, texto) => { no.textContent = texto; }, OUTRA_LEGENDA);
  await voltarGravacoes(extensao);

  await expect(pilulaAberta(page)).toHaveCount(1);
  await expect(feedback(page)).toContainText(MIN_01);
  // A prévia começa perto da Palavra, que a pílula nunca corta.
  await expect(feedback(page)).toContainText('before the gulls did.');
  await expect(feedback(page).locator('mark')).toHaveText('gulls');
  await expect(feedback(page).getByText('EN', { exact: true })).toBeVisible();
  await expect(linhas(page)).toHaveCount(0);
  await expect(grifos(page)).toHaveCount(0);
  await expect(chip(page)).toHaveCount(0);
  expect((await extensao.frases()).map(f => f.texto)).toEqual([LEGENDA]);
});

test('a legenda troca com a marca na tela: linha, grifo e chip saem na hora', async ({ page, context, paginas, fakes }) => {
  fakes.anki.definirVocabulario('en', ['quiet', 'harbor', 'woke']);
  await abrirPlayer(page, context, paginas);

  await page.keyboard.press('Alt+KeyS');
  await expect(chip(page)).toBeVisible();
  await expect(linhas(page)).toHaveCount(1);

  await page.locator('#legenda').evaluate((no, texto) => { no.textContent = texto; }, OUTRA_LEGENDA);

  // Bem antes dos ~3,5 s do sucesso: a marca não fica sobre um texto que já não é o dela.
  await expect(linhas(page)).toHaveCount(0, { timeout: 500 });
  await expect(grifos(page)).toHaveCount(0);
  await expect(chip(page)).toHaveCount(0);
  await expect(feedback(page)).toHaveText('');
});

test('enquanto o service worker não responde, não há marca: ela só aparece com a frase gravada', async ({ page, context, paginas, extensao }) => {
  await abrirPlayer(page, context, paginas);
  await segurarGravacoes(extensao);

  await page.keyboard.press('Alt+KeyS');
  await page.waitForTimeout(800);
  await expect(linhas(page)).toHaveCount(0);
  await expect(chip(page)).toHaveCount(0);

  await voltarGravacoes(extensao);
  await expect(linhas(page)).toHaveCount(1);
  await expect(chip(page)).toContainText(MIN_01);
});

// ─── A seleção ───────────────────────────────────────────────────────────────

test('seleção numa página comum: a linha sob o trecho, o grifo na Palavra gravada e o chip com “Web”', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({ pm_atalho: SELECAO_EM_ALT_E });
  await page.goto(paginas.url('texto.html'));

  await page.locator('#trecho').selectText();
  await page.keyboard.press('Alt+KeyE');

  await expect(chip(page)).toBeVisible();
  await expect(chip(page).getByText(MIN_05, { exact: true })).toBeVisible();
  await expect(chip(page).getByText('Web', { exact: true })).toBeVisible();
  await expect(feedback(page)).toContainText(TRECHO);
  await expect(pilulaAberta(page)).toHaveCount(0);

  // O grifo cai sobre a Palavra que ficou gravada com a frase.
  const [gravada] = await extensao.frases();
  expect(gravada.texto).toBe(TRECHO);
  const palavra = String(gravada.keywords.find(k => k && k !== '|')).split('@')[0];
  await expect(chip(page)).toContainText('auto:');
  await expect(chip(page)).toContainText(palavra);
  const caixa = await caixaDaPalavra(page, '#trecho', palavra);
  const grifo = await caixaParada(grifos(page).first());
  expect(Math.abs(grifo.x - caixa.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(grifo.width - caixa.width)).toBeLessThanOrEqual(3);

  // A linha fica sob o trecho selecionado.
  const texto = await caixaDoTexto(page, '#trecho');
  const linha = await caixaParada(linhas(page).first());
  expect(Math.round(linha.height)).toBe(3);
  expect(linha.y).toBeGreaterThanOrEqual(texto.y + texto.height);
  expect(linha.y).toBeLessThanOrEqual(texto.y + texto.height + 6);
  expect(Math.abs(linha.x - texto.x)).toBeLessThanOrEqual(1);
});

test('seleção dentro de um textarea: sem retângulo do texto, a pílula livre fala no canto', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({ pm_atalho: SELECAO_NO_BOTAO_VOLTAR });
  await page.goto(paginas.url('texto.html'));
  const area = await page.evaluateHandle(texto => {
    const campo = document.createElement('textarea');
    campo.cols = 60;
    campo.value = texto;
    document.body.append(campo);
    return campo;
  }, TRECHO);
  await area.asElement().focus();
  await area.evaluate(campo => campo.select());

  await apertarVoltar(page);

  await expect(pilulaAberta(page)).toHaveCount(1);
  await expect(feedback(page).getByText(MIN_05, { exact: true })).toBeVisible();
  await expect(feedback(page).getByText('Web', { exact: true })).toBeVisible();
  // A pílula nunca corta a Palavra grifada: a prévia começa perto dela.
  const palavraNaPilula = await feedback(page).locator('mark').textContent();
  expect(TRECHO).toContain(palavraNaPilula);
  await expect(linhas(page)).toHaveCount(0);
  await expect(grifos(page)).toHaveCount(0);
  await expect(chip(page)).toHaveCount(0);
  expect((await extensao.frases()).map(f => f.texto)).toEqual([TRECHO]);

  // Sem vídeo, a pílula livre fica no canto inferior direito e some por inteiro.
  const caixa = await feedback(page).boundingBox();
  const janela = page.viewportSize();
  expect(caixa.x + caixa.width).toBeGreaterThan(janela.width - 120);
  expect(caixa.y + caixa.height).toBeGreaterThan(janela.height - 120);
  await expect(page.getByRole('button', { name: /^Minerar legenda/ })).toHaveCount(0);
  await expect(pilulaAberta(page)).toHaveCount(0, { timeout: 5000 });
  // Fechada, ela não pega o clique do site no canto em que estava (nem onde ficava o azulejo).
  const cantos = await page.locator('perpetualminer-overlay').evaluate(host => {
    const { left, top, right, bottom } = host.getBoundingClientRect();
    return [[(left + right) / 2, (top + bottom) / 2], [right - 4, bottom - 4]];
  });
  for (const [x, y] of cantos) {
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.localName, [x, y])).not.toBe('perpetualminer-overlay');
  }
});

// ─── O contador do botão ─────────────────────────────────────────────────────

/** Uma legenda nova no player, como a de um vídeo tocando. */
const trocarLegenda = (page, texto) => page.locator('#legenda').evaluate((no, texto) => { no.textContent = texto; }, texto);
const contador = page => page.locator('perpetualminer-overlay .pm-contador');

test('RU desligado: o contador do botão é o do inglês da legenda, não a soma dos idiomas', async ({ page, context, paginas, extensao }) => {
  await extensao.gravarStorage({
    pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 15 } },
    pm_auto_miner_daily: { date: hoje(), en: { count: 3 }, ru: { count: 7 } },
  });
  await abrirPlayer(page, context, paginas);

  // Antes, “10/20”: EN + RU, mesmo com o RU desligado.
  await expect(contador(page)).toHaveText('3/20');
  await expect(botaoFlutuante(page)).toHaveAccessibleDescription('Mineração automática · Inglês: 3 de 20 hoje');
  await expect(contador(page)).not.toHaveClass(/pm-contador--limite/);

  // Uma legenda russa com o RU desligado: o contador some.
  await trocarLegenda(page, FRASE_RUSSA);
  await expect(contador(page)).toBeHidden();
  await expect(botaoFlutuante(page)).toHaveAccessibleDescription('');
});

test('o contador do idioma da legenda: no limite vira contorno e o leitor de tela ouve o limite', async ({ page, context, paginas, extensao }) => {
  await extensao.gravarStorage({
    pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: true, dailyLimit: 15 } },
    pm_auto_miner_daily: { date: hoje(), en: { count: 4 }, ru: { count: 15 } },
  });
  await abrirPlayer(page, context, paginas);

  await expect(contador(page)).toHaveText('4/20');
  await trocarLegenda(page, FRASE_RUSSA);
  await expect(contador(page)).toHaveText('15/15');
  await expect(contador(page)).toHaveClass(/pm-contador--limite/);
  await expect(botaoFlutuante(page)).toHaveAccessibleDescription('Mineração automática · Russo: limite de hoje atingido');
  // A pessoa desliga o russo no popup com o contador dele na tela: ele some na hora.
  const popup = await context.newPage();
  await popup.goto(extensao.url('popup.html'));
  // O trilho é o que a pessoa vê e clica (como em popup.spec.js).
  await popup.locator('.popup-azulejo[data-idioma="ru"] .veio-toggle__trilho').click();
  await expect(popup.getByRole('switch', { name: 'Mineração automática em russo' })).not.toBeChecked();
  await expect(contador(page)).toBeHidden();
  await expect(botaoFlutuante(page)).toHaveAccessibleDescription('');
});

// ─── A mineração automática ──────────────────────────────────────────────────

async function tocarVideoComLegenda(page, texto) {
  // A mineração automática só olha a legenda de um vídeo que está tocando.
  await page.evaluate(async texto => {
    document.querySelector('#legenda').textContent = texto;
    const tela = document.createElement('canvas');
    tela.getContext('2d').fillRect(0, 0, 1, 1);
    const video = document.querySelector('video');
    video.srcObject = tela.captureStream();
    await video.play();
  }, texto);
}

const MINERACAO_AUTOMATICA_EM_RU = {
  pm_auto_miner_settings: { en: { enabled: false, dailyLimit: 20 }, ru: { enabled: true, dailyLimit: 20 } },
  // O vocabulário do Anki em cache, sem nenhuma palavra conhecida: a frase russa
  // tem um item novo só, então a mineração automática a aceita.
  pm_auto_keyword_vocab_ru: {
    cacheVersion: 2, deckName: 'RUSSIAN', createdAt: Date.now(),
    words: [], terms: [], wordInfo: {}, termInfo: {},
  },
};

test('a mineração automática usa a mesma marca, mais apagada, com auto: e o contador do idioma', async ({ page, context, paginas, extensao }) => {
  await extensao.gravarStorage({ ...MINERACAO_AUTOMATICA_EM_RU, pm_auto_miner_daily: { date: hoje(), en: { count: 9 }, ru: { count: 4 } } });
  await abrirPlayer(page, context, paginas);

  await tocarVideoComLegenda(page, FRASE_RUSSA);

  await expect(chip(page)).toBeVisible();
  await expect(chip(page).getByText(MIN_06, { exact: true })).toBeVisible();
  await expect(chip(page).getByText('RU 5/20', { exact: true })).toBeVisible();
  await expect(chip(page)).toContainText('auto:');
  await expect(feedback(page)).toContainText(FRASE_RUSSA);
  await expect(pilulaAberta(page)).toHaveCount(0);
  await expect(linhas(page)).toHaveCount(1);
  await expect(grifos(page)).toHaveCount(1);

  // Mais apagada que a marca de uma captura: a linha e o grifo ficam translúcidos.
  const opacidade = async locator => Number(await locator.evaluate(no => getComputedStyle(no).opacity));
  expect(await opacidade(linhas(page))).toBeLessThan(1);
  expect(await opacidade(grifos(page))).toBeLessThan(1);
  // O contador do botão é o do russo (o inglês está desligado e tem 9).
  await expect(contador(page)).toHaveText('5/20');
  expect((await extensao.frases()).map(f => f.texto)).toEqual([FRASE_RUSSA]);
});

test('a mineração automática com a legenda já trocada: a pílula, sem linha', async ({ page, context, paginas, extensao }) => {
  await extensao.gravarStorage({ ...MINERACAO_AUTOMATICA_EM_RU, pm_auto_miner_daily: { date: hoje(), en: { count: 0 }, ru: { count: 4 } } });
  await abrirPlayer(page, context, paginas);
  await segurarGravacoes(extensao);

  await tocarVideoComLegenda(page, FRASE_RUSSA);
  await expect.poll(() => extensao.serviceWorker.evaluate(() => globalThis.__seguradas.length), { timeout: 5000 }).toBeGreaterThan(0);
  await trocarLegenda(page, OUTRA_LEGENDA);
  await voltarGravacoes(extensao);

  await expect(pilulaAberta(page)).toHaveCount(1);
  await expect(feedback(page).getByText(MIN_06, { exact: true })).toBeVisible();
  await expect(feedback(page).getByText('RU 5/20', { exact: true })).toBeVisible();
  await expect(linhas(page)).toHaveCount(0);
  await expect(chip(page)).toHaveCount(0);
});

test('com prefers-reduced-motion, a linha, o grifo e o chip aparecem sem animação', async ({ page, context, paginas, fakes }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  fakes.anki.definirVocabulario('en', ['quiet', 'harbor', 'woke']);
  await abrirPlayer(page, context, paginas);

  await page.keyboard.press('Alt+KeyS');
  await expect(chip(page)).toBeVisible();
  await expect(linhas(page)).toHaveCount(1);

  for (const desenho of [linhas(page), grifos(page), chip(page)]) {
    expect(await desenho.evaluate(no => no.getAnimations().length)).toBe(0);
  }
});

/** O botão “voltar” do mouse, pelo protocolo do Chromium: o Playwright só tem esquerdo, direito e do meio. */
async function apertarVoltar(page) {
  const cdp = await page.context().newCDPSession(page);
  const base = { x: 5, y: 5, button: 'back', clickCount: 1 };
  await cdp.send('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: 8 });
  await cdp.send('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 });
  await cdp.detach();
}

/** O dia de hoje como a mineração automática o grava (AAAA-MM-DD, hora local). */
function hoje() {
  const agora = new Date();
  return [agora.getFullYear(), String(agora.getMonth() + 1).padStart(2, '0'), String(agora.getDate()).padStart(2, '0')].join('-');
}
