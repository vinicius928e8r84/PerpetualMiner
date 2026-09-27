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
  await expect(feedback(page)).toContainText(LEGENDA);
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
