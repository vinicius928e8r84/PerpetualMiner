'use strict';

// O overlay na página (#40): um componente Veio só, em Shadow DOM — o botão
// flutuante e a pílula de feedback, que espera a resposta do service worker e
// só diz o que foi confirmado. A marca sobre o texto (#41) está em overlay-marca.spec.js.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../fixtures');

const LEGENDA = 'The quiet harbor woke before the gulls did.';
const TRECHO = 'Every lantern along the pier flickered in the salt wind.';

// A cópia da Voz. MIN-02 e MIN-05 são o começo de MIN-01, então elas se leem
// pelo título exato; MIN-04 e MIN-10 têm o mesmo título e se leem pela dica.
const MIN_01 = 'Frase minerada e copiada';
const MIN_02 = 'Frase minerada';
const MIN_03 = 'Não deu para minerar';
const MIN_03_DICA = 'Tente de novo.';
const MIN_04 = 'Ligue as legendas do player e tente de novo.';
const MIN_05 = 'Frase minerada';
const MIN_06 = 'Mineração automática';
const MIN_10 = 'Esta página não tem vídeo com legenda.';
const TITULO_SEM_LEGENDA = 'Nenhuma legenda na tela';
const FRASE_RUSSA = 'Я улыбаюсь';

const SELECAO_EM_ALT_E = { type: 'keyboard', code: 'KeyE', altKey: true, ctrlKey: false, shiftKey: false };
const LEGENDA_EM_SHIFT_S = { type: 'keyboard', code: 'KeyS', altKey: false, ctrlKey: false, shiftKey: true };

const botaoFlutuante = (page, nome = 'Minerar legenda (Alt+S)') => page.getByRole('button', { name: nome, exact: true });
const feedback = page => page.getByRole('status');

async function abrirPlayer(page, paginas, pagina = 'player.html') {
  await page.goto(paginas.url(pagina));
  await expect(botaoFlutuante(page)).toBeVisible();
}

async function permitirClipboard(context, paginas) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: paginas.origem });
}

/** Serve `pagina` com uma Permissions-Policy que recusa o clipboard ao documento (o caso real de um site que o bloqueia). */
async function recusarClipboardEm(page, url) {
  await page.route(url, async route => {
    const resposta = await route.fetch();
    await route.fulfill({ response: resposta, headers: { ...resposta.headers(), 'permissions-policy': 'clipboard-write=()' } });
  });
}

// Falhas do armazenamento do service worker. Não há rede entre o service worker e o
// `chrome.storage`, então a falha é injetada na própria fronteira: o `set`
// passa a recusar (ou a segurar) a gravação, e o teste afirma o que a pessoa vê
// e o que fica gravado depois que a fronteira volta ao normal.
const recusarGravacoes = extensao => extensao.serviceWorker.evaluate(() => {
  globalThis.__setOriginal ??= chrome.storage.local.set;
  chrome.storage.local.set = () => { throw new Error('QUOTA_BYTES quota exceeded'); };
});

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

const textosGravados = async extensao => (await extensao.frases()).map(f => f.texto);

/**
 * O `--veio-text` do tema escuro, lido de veio/tokens.css: a cor mora lá, e um
 * valor repetido aqui passaria a mentir no dia em que o token mudasse.
 */
function textoDoEscuro() {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'veio', 'tokens.css'), 'utf8');
  const inicioDoClaro = css.indexOf('[data-tema="claro"]');
  if (inicioDoClaro < 0) throw new Error('o tema claro não foi encontrado em veio/tokens.css');
  const achado = css.slice(0, inicioDoClaro).match(/--veio-text:\s*(#[0-9A-Fa-f]{6})/);
  if (!achado) throw new Error('--veio-text não encontrado no tema escuro de veio/tokens.css');
  const [, r, g, b] = achado[1].match(/#(..)(..)(..)/);
  return `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`;
}

/** A meta da pílula: o idioma da captura, em mono. */
const metaDaPilula = (page, sigla) => feedback(page).getByText(sigla, { exact: true });
/** O título da pílula, pelo texto exato. */
const tituloDaPilula = (page, titulo) => feedback(page).getByText(titulo, { exact: true });

// ─── O botão flutuante ───────────────────────────────────────────────────────

test('o botão flutuante é o azulejo Veio num círculo de 46 px, meio apagado parado e inteiro com o mouse', async ({ page, paginas }) => {
  await abrirPlayer(page, paginas);
  const botao = botaoFlutuante(page);

  const caixa = await botao.boundingBox();
  expect(Math.round(caixa.width)).toBe(46);
  expect(Math.round(caixa.height)).toBe(46);
  expect(await botao.evaluate(no => getComputedStyle(no).borderRadius)).toBe('50%');

  const opacidade = () => botao.evaluate(no => Number(getComputedStyle(no).opacity));
  expect(await opacidade()).toBeLessThan(1);
  await botao.hover();
  await expect.poll(opacidade).toBe(1);
});

test('com o mouse por cima, o botão mostra a etiqueta do protótipo: o nome e o atalho gravado', async ({ page, paginas, extensao }) => {
  await abrirPlayer(page, paginas);
  const botao = botaoFlutuante(page);
  const etiqueta = page.locator('perpetualminer-overlay .pm-dica');

  // Parado, nada por cima do vídeo.
  await expect(etiqueta).toBeHidden();

  await botao.hover();
  await expect(etiqueta).toBeVisible();
  await expect(etiqueta).toHaveText('Minerar legendaAlt+S');
  await expect(etiqueta.locator('kbd')).toHaveText('Alt+S');
  // A etiqueta fica à esquerda do botão, na altura dele.
  const [caixaDoBotao, caixaDaEtiqueta] = [await botao.boundingBox(), await etiqueta.boundingBox()];
  expect(caixaDaEtiqueta.x + caixaDaEtiqueta.width).toBeLessThanOrEqual(caixaDoBotao.x);
  expect(Math.abs((caixaDaEtiqueta.y + caixaDaEtiqueta.height / 2) - (caixaDoBotao.y + caixaDoBotao.height / 2))).toBeLessThan(2);

  // O atalho gravado entra sem recarregar; sem atalho, só o nome.
  await extensao.gravarStorage({ pm_atalho_legenda: { type: 'keyboard', code: 'KeyK', altKey: false, ctrlKey: true, shiftKey: true } });
  await expect(etiqueta.locator('kbd')).toHaveText('Ctrl+Shift+K');
  await extensao.gravarStorage({ pm_atalho_legenda: null });
  await expect(etiqueta).toHaveText('Minerar legenda');
  await expect(etiqueta.locator('kbd')).toHaveCount(0);

  await page.mouse.move(5, 5);
  await expect(etiqueta).toBeHidden();
});

test('a etiqueta traz o contador do dia, sem o idioma (MIN-11), e aparece também com o foco do teclado', async ({ page, paginas, extensao }) => {
  const agora = new Date();
  const hoje = [agora.getFullYear(), String(agora.getMonth() + 1).padStart(2, '0'), String(agora.getDate()).padStart(2, '0')].join('-');
  await extensao.gravarStorage({
    pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 15 }, ru: { enabled: false, dailyLimit: 20 } },
    pm_auto_miner_daily: { date: hoje, en: { count: 8 }, ru: { count: 0 } },
  });
  await abrirPlayer(page, paginas);
  const etiqueta = page.locator('perpetualminer-overlay .pm-dica');

  await botaoFlutuante(page).focus();
  await expect(etiqueta).toBeVisible();
  await expect(etiqueta).toContainText('Mineração automática: 8 de 15 hoje');
  await expect(etiqueta).not.toContainText('Inglês');
  // O leitor de tela continua ouvindo o idioma, pela descrição do botão.
  await expect(botaoFlutuante(page)).toHaveAccessibleDescription('Mineração automática · Inglês: 8 de 15 hoje');
});

test('com a pílula aberta, a etiqueta não aparece por cima dela', async ({ page, paginas }) => {
  await abrirPlayer(page, paginas);
  await page.locator('#legenda').evaluate(no => no.remove());
  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByText('Ligue as legendas do player e tente de novo.')).toBeVisible();
  await botaoFlutuante(page).hover();
  await expect(page.locator('perpetualminer-overlay .pm-dica')).toBeHidden();
});

test('o rótulo do botão acompanha o atalho gravado, sem recarregar', async ({ page, paginas, extensao }) => {
  await abrirPlayer(page, paginas);

  await extensao.gravarStorage({ pm_atalho_legenda: { type: 'keyboard', code: 'KeyK', altKey: false, ctrlKey: true, shiftKey: true } });
  await expect(botaoFlutuante(page, 'Minerar legenda (Ctrl+Shift+K)')).toBeVisible();

  await extensao.gravarStorage({ pm_atalho_legenda: null });
  await expect(botaoFlutuante(page, 'Minerar legenda')).toBeVisible();
});

test('o botão chega pelo teclado, com o foco visível, e Enter minera a legenda', async ({ page, paginas, extensao }) => {
  await abrirPlayer(page, paginas);

  await page.keyboard.press('Tab');
  const botao = botaoFlutuante(page);
  await expect(botao).toBeFocused();
  expect(await botao.evaluate(no => getComputedStyle(no).outlineStyle)).toBe('solid');

  await page.keyboard.press('Enter');
  await expect.poll(() => textosGravados(extensao)).toEqual([LEGENDA]);
  await expect(feedback(page)).toContainText(LEGENDA);
});

// ─── O caminho feliz ─────────────────────────────────────────────────────────

test('Alt+S minera e copia: a pílula diz MIN-01 com a frase e some sozinha em ~3,5 s', async ({ page, context, paginas, extensao }) => {
  await permitirClipboard(context, paginas);
  await abrirPlayer(page, paginas);

  await page.keyboard.press('Alt+KeyS');

  await expect(feedback(page)).toContainText(MIN_01);
  await expect(feedback(page)).toContainText(LEGENDA);
  // A meta: o idioma da captura, em mono, no fim da pílula.
  await expect(metaDaPilula(page, 'EN')).toBeVisible();
  expect(await metaDaPilula(page, 'EN').evaluate(no => getComputedStyle(no).fontFamily)).toMatch(/^"?PerpetualMiner JetBrains Mono/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(LEGENDA);
  expect(await textosGravados(extensao)).toEqual([LEGENDA]);

  // Sucesso some sozinho: ainda está lá aos 2,5 s e já saiu antes dos 5 s.
  await page.waitForTimeout(2500);
  await expect(page.getByText(MIN_01)).toBeVisible();
  await expect(page.getByText(MIN_01)).toBeHidden({ timeout: 2500 });
  // Sem × num sucesso.
  await expect(page.getByRole('button', { name: 'Fechar' })).toHaveCount(0);
});

test('enquanto o service worker não responde, a pílula não afirma nada; quando ele grava, diz MIN-01', async ({ page, context, paginas, extensao }) => {
  await permitirClipboard(context, paginas);
  await abrirPlayer(page, paginas);
  await segurarGravacoes(extensao);

  await page.keyboard.press('Alt+KeyS');
  await page.waitForTimeout(1000);
  await expect(page.getByText(MIN_01)).toHaveCount(0);
  await expect(page.getByText(MIN_03)).toHaveCount(0);

  await voltarGravacoes(extensao);
  await expect(feedback(page)).toContainText(MIN_01);
  expect(await textosGravados(extensao)).toEqual([LEGENDA]);
});

// A Palavra na marca e na pílula, e a seleção (numa página comum e num campo),
// estão em overlay-marca.spec.js.

test('o atalho de seleção sem nada selecionado numa página sem vídeo diz MIN-10 e não grava nada', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({ pm_atalho: SELECAO_EM_ALT_E });
  await page.goto(paginas.url('sem-video.html'));

  await page.keyboard.press('Alt+KeyE');

  await expect(feedback(page)).toContainText(MIN_10);
  await page.waitForTimeout(800);
  expect(await extensao.frases()).toEqual([]);
});

test('o atalho de seleção sem nada selecionado num player não afirma nada', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({ pm_atalho: SELECAO_EM_ALT_E });
  await abrirPlayer(page, paginas);

  await page.keyboard.press('Alt+KeyE');

  await page.waitForTimeout(800);
  await expect(feedback(page)).toHaveText('');
  expect(await extensao.frases()).toEqual([]);
});

test('um player em iframe de outra origem: a cópia pelo frame de cima só é afirmada quando dá certo (MIN-01)', async ({ page, context, paginas, extensao }) => {
  await permitirClipboard(context, paginas);
  await page.goto(paginas.url(`player-em-iframe.html?player=${encodeURIComponent(paginas.urlCruzada('player.html'))}`));
  const player = page.frameLocator('#player');
  await expect(botaoFlutuante(player)).toBeVisible();

  await player.locator('video').click();
  await page.keyboard.press('Alt+KeyS');

  await expect(feedback(player)).toContainText(MIN_01);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(LEGENDA);
  expect(await textosGravados(extensao)).toEqual([LEGENDA]);
});

test('com o foco no frame de cima e o player num iframe de outra origem, Alt+S não diz que a página não tem vídeo', async ({ page, paginas, extensao }) => {
  await page.goto(paginas.url(`player-em-iframe.html?player=${encodeURIComponent(paginas.urlCruzada('player.html'))}`));
  await expect(botaoFlutuante(page.frameLocator('#player'))).toBeVisible();

  await page.keyboard.press('Alt+KeyS');

  await page.waitForTimeout(1000);
  await expect(page.getByText(MIN_10)).toHaveCount(0);
  expect(await extensao.frases()).toEqual([]);
});

test('uma página sem vídeo, nem nos iframes, diz MIN-10 com o foco no frame de cima', async ({ page, paginas, extensao }) => {
  await page.goto(paginas.url(`player-em-iframe.html?player=${encodeURIComponent(paginas.urlCruzada('sem-video.html'))}`));
  await expect(page.frameLocator('#player').getByText('Nothing to watch here')).toBeVisible();

  await page.keyboard.press('Alt+KeyS');

  await expect(feedback(page)).toContainText(MIN_10);
  await page.waitForTimeout(800);
  expect(await extensao.frases()).toEqual([]);
});

test('um vídeo de anúncio escondido num iframe não conta: a página sem player diz MIN-10', async ({ page, paginas, extensao }) => {
  await page.goto(paginas.url(`player-em-iframe.html?player=${encodeURIComponent(paginas.urlCruzada('video-escondido.html'))}`));
  await expect(page.frameLocator('#player').getByText('Sponsored')).toBeVisible();

  await page.keyboard.press('Alt+KeyS');

  await expect(feedback(page)).toContainText(MIN_10);
  expect(await extensao.frases()).toEqual([]);
});

// ─── Os bugs de #9 que este passo fecha ──────────────────────────────────────

test('bug de #9: o atalho de legenda digitado num campo de texto entra no campo e nada é minerado', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({ pm_atalho_legenda: LEGENDA_EM_SHIFT_S });
  await page.goto(paginas.url('player-com-campos.html'));
  await expect(botaoFlutuante(page, 'Minerar legenda (Shift+S)')).toBeVisible();

  for (const campo of ['#campo', '#area', '#editavel']) {
    await page.locator(campo).click();
    await page.keyboard.press('Shift+KeyS');
  }

  await expect(page.locator('#campo')).toHaveValue('S');
  await expect(page.locator('#area')).toHaveValue('S');
  await expect(page.locator('#editavel')).toHaveText('S');
  await page.waitForTimeout(800);
  expect(await extensao.frases()).toEqual([]);
  await expect(feedback(page)).toHaveText('');
});

test('bug de #9: o atalho de legenda num campo dentro de uma sombra fechada também entra no campo', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({ pm_atalho_legenda: LEGENDA_EM_SHIFT_S });
  await page.goto(paginas.url('player-com-campos.html'));
  await expect(botaoFlutuante(page, 'Minerar legenda (Shift+S)')).toBeVisible();

  await page.evaluate(() => window.campoFechado.focus());
  await page.keyboard.press('Shift+KeyS');

  expect(await page.evaluate(() => window.campoFechado.value)).toBe('S');
  await page.waitForTimeout(800);
  expect(await extensao.frases()).toEqual([]);
  await expect(feedback(page)).toHaveText('');
});

test('bug de #9: numa página sem vídeo com legendas de imagem, Alt+S diz MIN-10 e não grava nada', async ({ page, paginas, extensao }) => {
  await page.goto(paginas.url('sem-video-com-imagens.html'));

  await page.keyboard.press('Alt+KeyS');

  await expect(feedback(page)).toContainText(MIN_10);
  await page.waitForTimeout(800);
  expect(await extensao.frases()).toEqual([]);
});

test('bug de #9: com o clipboard negado no frame de cima, a frase fica no histórico uma vez só, com MIN-02', async ({ page, paginas, extensao }) => {
  await recusarClipboardEm(page, paginas.url('player.html'));
  await abrirPlayer(page, paginas);

  await page.keyboard.press('Alt+KeyS');

  // O que importa é ter minerado: a pílula de sucesso, só sem “e copiada”.
  await expect(tituloDaPilula(page, MIN_02)).toBeVisible();
  await expect(page.getByText(MIN_01)).toHaveCount(0);
  await page.waitForTimeout(1000);
  expect(await textosGravados(extensao)).toEqual([LEGENDA]);
});

// ─── As falhas ───────────────────────────────────────────────────────────────

test('o service worker falha ao gravar: MIN-03 com a dica, nada gravado, e a pílula some sozinha', async ({ page, context, paginas, extensao }) => {
  await permitirClipboard(context, paginas);
  await abrirPlayer(page, paginas);
  await recusarGravacoes(extensao);

  await page.keyboard.press('Alt+KeyS');

  await expect(feedback(page)).toContainText(MIN_03);
  await expect(feedback(page)).toContainText(MIN_03_DICA);
  await expect(page.getByText(MIN_01)).toHaveCount(0);
  // Sem × e sem Tentar de novo: a falha some sozinha, como o sucesso.
  await expect(page.getByRole('button', { name: 'Fechar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tentar de novo' })).toHaveCount(0);
  await expect(page.getByText(MIN_03)).toBeHidden({ timeout: 5000 });
  expect(await extensao.frases()).toEqual([]);

  // Com o armazenamento de volta, o próximo Alt+S grava.
  await voltarGravacoes(extensao);
  await page.keyboard.press('Alt+KeyS');
  await expect(feedback(page)).toContainText(MIN_01);
  expect(await textosGravados(extensao)).toEqual([LEGENDA]);
});

test('a falha fecha com Esc e quando a próxima captura a substitui', async ({ page, context, paginas, extensao }) => {
  await permitirClipboard(context, paginas);
  await abrirPlayer(page, paginas);
  await recusarGravacoes(extensao);

  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByText(MIN_03)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText(MIN_03)).toBeHidden();

  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByText(MIN_03)).toBeVisible();
  await voltarGravacoes(extensao);
  await page.keyboard.press('Alt+KeyS');
  // Uma instância por vez: o sucesso toma o lugar da falha.
  await expect(feedback(page)).toContainText(MIN_01);
  await expect(page.getByText(MIN_03)).toHaveCount(0);
  await expect(feedback(page)).toHaveCount(1);
});

test('no player sem legenda na tela, Alt+S diz MIN-04 e não grava nada', async ({ page, paginas, extensao }) => {
  await abrirPlayer(page, paginas);
  await page.locator('#legenda').evaluate(no => no.remove());

  await page.keyboard.press('Alt+KeyS');

  await expect(feedback(page)).toContainText(TITULO_SEM_LEGENDA);
  await expect(feedback(page)).toContainText(MIN_04);
  await page.waitForTimeout(800);
  expect(await extensao.frases()).toEqual([]);
});

// ─── Isolamento: Shadow DOM ──────────────────────────────────────────────────

test('nada do overlay entra no DOM do site fora do host, e os estilos não vazam em nenhum sentido', async ({ page, context, paginas, extensao }) => {
  await permitirClipboard(context, paginas);
  await page.goto(paginas.url('player-estilos-hostis.html'));
  const doSite = page.locator('#do-site');
  const estiloDoSite = () => doSite.evaluate(no => {
    const e = getComputedStyle(no);
    return [e.fontFamily, e.color, e.backgroundColor, e.letterSpacing, e.display].join(' | ');
  });
  const antes = await estiloDoSite();

  await expect(botaoFlutuante(page)).toBeVisible();
  await page.keyboard.press('Alt+KeyS');
  await expect(feedback(page)).toContainText(MIN_01);
  await expect.poll(() => textosGravados(extensao)).toEqual([LEGENDA]);

  // O site: nenhuma folha de estilo nova, nenhum nó novo além do host, e os
  // elementos dele pintados como antes.
  expect(await page.evaluate(() => ({
    folhas: document.styleSheets.length,
    adotadas: document.adoptedStyleSheets.length,
    hosts: [...document.querySelectorAll('*')].filter(no => no.shadowRoot).map(no => no.localName),
    doOverlayNoDom: document.querySelectorAll('[id*="minerador"], [class*="pm-"], [class*="veio-"]').length,
  }))).toEqual({ folhas: 1, adotadas: 0, hosts: ['perpetualminer-overlay'], doOverlayNoDom: 0 });
  expect(await estiloDoSite()).toBe(antes);

  // O overlay: as regras do site não o alcançam — ele usa os tokens escuros e a fonte da Veio.
  const botao = botaoFlutuante(page);
  const estiloDoBotao = await botao.evaluate(no => {
    const e = getComputedStyle(no);
    return { fundo: e.backgroundColor, raio: e.borderRadius };
  });
  expect(estiloDoBotao.fundo).not.toBe('rgb(0, 255, 0)');
  expect(estiloDoBotao.raio).toBe('50%');
  const titulo = page.getByText(MIN_01);
  const estiloDoTitulo = await titulo.evaluate(no => {
    const e = getComputedStyle(no);
    return { fonte: e.fontFamily, cor: e.color, espacamento: e.letterSpacing };
  });
  expect(estiloDoTitulo.fonte).toMatch(/^["']?PerpetualMiner Manrope/);
  expect(estiloDoTitulo.cor).toBe(textoDoEscuro());
  expect(estiloDoTitulo.espacamento).toBe('normal');
  // A Manrope empacotada é a que desenha: a mesma linha na fonte de reserva tem
  // outra largura. As duas cópias ficam do tamanho do texto, sem caixa que as estique.
  await expect.poll(() => titulo.evaluate(no => {
    const largura = fonte => {
      const copia = no.cloneNode(true);
      Object.assign(copia.style, { position: 'fixed', left: '0', top: '0', width: 'max-content' });
      if (fonte) copia.style.fontFamily = fonte;
      no.after(copia);
      const { width } = copia.getBoundingClientRect();
      copia.remove();
      return width;
    };
    return Math.abs(largura() - largura('system-ui, sans-serif'));
  })).toBeGreaterThan(1);
});

test('com o tema claro escolhido, o overlay continua escuro', async ({ page, context, paginas, extensao }) => {
  await permitirClipboard(context, paginas);
  await extensao.gravarStorage({ pm_tema: 'claro' });
  await abrirPlayer(page, paginas);

  await page.keyboard.press('Alt+KeyS');

  const titulo = page.getByText(MIN_01);
  await expect(titulo).toBeVisible();
  expect(await titulo.evaluate(no => getComputedStyle(no).color)).toBe(textoDoEscuro());
});

// ─── Movimento reduzido ──────────────────────────────────────────────────────

test('com prefers-reduced-motion, a pílula abre e fecha sem animação', async ({ page, context, paginas }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await permitirClipboard(context, paginas);
  await abrirPlayer(page, paginas);

  await page.keyboard.press('Alt+KeyS');
  await expect(feedback(page)).toContainText(MIN_01);

  const duracoes = await page.locator('perpetualminer-overlay').evaluate(host =>
    [...host.shadowRoot.querySelectorAll('*')].flatMap(no => {
      const e = getComputedStyle(no);
      return [e.transitionDuration, e.animationDuration].flatMap(v => v.split(',')).map(v => parseFloat(v));
    }));
  expect(Math.max(...duracoes)).toBeLessThanOrEqual(0.001);
});

test('o Esc que fecha uma falha é do overlay: o site não o recebe; sem falha, o Esc é do site', async ({ page, paginas, extensao }) => {
  await abrirPlayer(page, paginas);
  await page.evaluate(() => {
    window.escsDoSite = 0;
    document.addEventListener('keydown', evento => { if (evento.key === 'Escape') window.escsDoSite += 1; });
  });
  await recusarGravacoes(extensao);

  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByText(MIN_03)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText(MIN_03)).toBeHidden();
  expect(await page.evaluate(() => window.escsDoSite)).toBe(0);

  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.escsDoSite)).toBe(1);
});

test('com uma falha aberta, o Esc digitado num campo do site é do site e a falha fica', async ({ page, paginas, extensao }) => {
  await page.goto(paginas.url('player-com-campos.html'));
  await expect(botaoFlutuante(page)).toBeVisible();
  await page.evaluate(() => {
    window.escsDoSite = 0;
    document.addEventListener('keydown', evento => { if (evento.key === 'Escape') window.escsDoSite += 1; });
  });
  await recusarGravacoes(extensao);
  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByText(MIN_03)).toBeVisible();

  await page.locator('#campo').click();
  await page.keyboard.press('Escape');

  expect(await page.evaluate(() => window.escsDoSite)).toBe(1);
  await expect(page.getByText(MIN_03)).toBeVisible();
});

// ─── A mineração automática ──────────────────────────────────────────────────

test('a mineração automática minera uma linha: MIN-06 na pílula, com o idioma e o contador do dia na meta', async ({ page, paginas, extensao }) => {
  await extensao.gravarStorage({
    pm_auto_miner_settings: { en: { enabled: false, dailyLimit: 20 }, ru: { enabled: true, dailyLimit: 20 } },
    pm_auto_miner_daily: { date: hoje(), en: { count: 0 }, ru: { count: 4 } },
    // O vocabulário do Anki em cache, sem nenhuma palavra conhecida: a frase russa
    // tem um item novo só, então a mineração automática a aceita.
    pm_auto_keyword_vocab_ru: {
      cacheVersion: 2, deckName: 'RUSSIAN', createdAt: Date.now(),
      words: [], terms: [], wordInfo: {}, termInfo: {},
    },
  });
  await abrirPlayer(page, paginas);

  await tocarALegenda(page, FRASE_RUSSA);

  await expect(tituloDaPilula(page, MIN_06)).toBeVisible();
  await expect(feedback(page)).toContainText(FRASE_RUSSA);
  // A meta, como no protótipo: o idioma e o contador do dia.
  await expect(metaDaPilula(page, 'RU 5/20')).toBeVisible();
  // O título longo não passa por cima da meta: o texto dele acaba antes de ela começar.
  const fimDoTitulo = await tituloDaPilula(page, MIN_06).evaluate(no => {
    const trecho = document.createRange();
    trecho.selectNodeContents(no);
    return Math.max(...[...trecho.getClientRects()].map(caixa => caixa.right));
  });
  expect(fimDoTitulo).toBeLessThanOrEqual((await metaDaPilula(page, 'RU 5/20').boundingBox()).x);
  expect(await textosGravados(extensao)).toEqual([FRASE_RUSSA]);
  // Sucesso: some sozinho.
  await expect(tituloDaPilula(page, MIN_06)).toBeHidden({ timeout: 5000 });
});

/** Põe `frase` na legenda e faz o vídeo tocar: a mineração automática só olha a legenda de um vídeo que está tocando. */
async function tocarALegenda(page, frase) {
  await page.evaluate(async texto => {
    document.querySelector('#legenda').textContent = texto;
    const tela = document.createElement('canvas');
    tela.getContext('2d').fillRect(0, 0, 1, 1);
    const video = document.querySelector('video');
    video.srcObject = tela.captureStream();
    await video.play();
  }, frase);
}

const DOIS_DIAS = 2 * 24 * 3600_000;

/** O ajuste e o vocabulário (vazio, do Baralho padrão) de uma mineração automática em russo, lido há `idadeMs`. */
const mineracaoEmRussoComVocabulario = idadeMs => ({
  pm_auto_miner_settings: { en: { enabled: false, dailyLimit: 20 }, ru: { enabled: true, dailyLimit: 20 } },
  pm_auto_miner_daily: { date: hoje(), en: { count: 0 }, ru: { count: 0 } },
  pm_auto_keyword_vocab_ru: {
    cacheVersion: 2, deckName: 'RUSSIAN', createdAt: Date.now() - idadeMs,
    words: [], terms: [], wordInfo: {}, termInfo: {},
  },
});

test('com a Conexão desligada, a mineração automática minera pela última leitura do vocabulário, de dois dias atrás', async ({ page, paginas, extensao, fakes }) => {
  fakes.anki.desligar();
  await extensao.gravarStorage(mineracaoEmRussoComVocabulario(DOIS_DIAS));
  await abrirPlayer(page, paginas);

  await tocarALegenda(page, FRASE_RUSSA);

  await expect(tituloDaPilula(page, MIN_06)).toBeVisible();
  expect(await textosGravados(extensao)).toEqual([FRASE_RUSSA]);
  // A leitura guardada segue como estava: com a Conexão muda não há outra para pôr no lugar.
  const { pm_auto_keyword_vocab_ru: leitura } = await extensao.lerStorage('pm_auto_keyword_vocab_ru');
  expect(leitura.createdAt).toBeLessThan(Date.now() - DOIS_DIAS + 60_000);
});

test('com a Conexão desligada e a última leitura de outro Baralho, a mineração automática não minera', async ({ page, paginas, extensao, fakes }) => {
  fakes.anki.desligar();
  const gravado = mineracaoEmRussoComVocabulario(DOIS_DIAS);
  gravado.pm_auto_keyword_vocab_ru.deckName = 'Outro baralho';
  await extensao.gravarStorage(gravado);
  await abrirPlayer(page, paginas);

  await tocarALegenda(page, FRASE_RUSSA);

  await expect.poll(() => fakes.anki.requisicoes.some(r => r.caminho === '/anki/vocabulary')).toBe(true);
  await page.waitForTimeout(1000);
  await expect(tituloDaPilula(page, MIN_06)).toBeHidden();
  expect(await textosGravados(extensao)).toEqual([]);
});

test('com a Conexão respondendo, a leitura vencida (15 min) é lida de novo e a gravada se atualiza', async ({ page, paginas, extensao, fakes }) => {
  fakes.anki.definirVocabulario('ru', [{ word: 'привет', type: 'word', status: 'mature' }]);
  await extensao.gravarStorage(mineracaoEmRussoComVocabulario(16 * 60_000));
  await abrirPlayer(page, paginas);
  const antes = Date.now();

  await tocarALegenda(page, FRASE_RUSSA);

  await expect(tituloDaPilula(page, MIN_06)).toBeVisible();
  expect(fakes.anki.requisicoes.filter(r => r.caminho === '/anki/vocabulary')).toHaveLength(1);
  const { pm_auto_keyword_vocab_ru: leitura } = await extensao.lerStorage('pm_auto_keyword_vocab_ru');
  expect(leitura.createdAt).toBeGreaterThanOrEqual(antes);
  expect(leitura.words).toEqual(['привет']);
});

test('com a Conexão respondendo, a leitura de menos de 15 min não pergunta nada à Conexão', async ({ page, paginas, extensao, fakes }) => {
  await extensao.gravarStorage(mineracaoEmRussoComVocabulario(60_000));
  await abrirPlayer(page, paginas);

  await tocarALegenda(page, FRASE_RUSSA);

  await expect(tituloDaPilula(page, MIN_06)).toBeVisible();
  expect(fakes.anki.requisicoes.filter(r => r.caminho === '/anki/vocabulary')).toHaveLength(0);
});

/** O dia de hoje como a mineração automática o grava (AAAA-MM-DD, hora local). */
function hoje() {
  const agora = new Date();
  return [agora.getFullYear(), String(agora.getMonth() + 1).padStart(2, '0'), String(agora.getDate()).padStart(2, '0')].join('-');
}
