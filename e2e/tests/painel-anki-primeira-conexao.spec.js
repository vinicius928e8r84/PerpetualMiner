'use strict';

// Conexão com o Anki · primeira conexão no desenho B (#77, ONB-16): o card que
// fica no lugar das abas enquanto a Conexão nunca respondeu neste computador
// (docs/design/painel/anki/prototipo-primeira-conexao.html, variante B). A
// Conexão é o fake da fronteira HTTP (fakes/anki.js). Os testes afirmam o que a
// pessoa vê e o que fica gravado.

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');
const F1 = 'A conexão com o Anki está desligada. Ligue-a neste computador e tente de novo.';

const card = page => page.getByRole('region', { name: 'Ainda não houve conexão neste computador' });
const pronto = page => page.getByRole('region', { name: 'Conexão com o Anki: ligada' });
const lista = page => page.getByRole('navigation', { name: 'Como ligar' });
const itemDaLista = (page, nome) => lista(page).getByRole('button', { name: nome });
const tituloDoPasso = page => page.locator('#apv-passo-titulo');
const status = page => page.locator('#apv-status');
const abas = page => page.getByRole('radiogroup', { name: 'Seções da Conexão com o Anki' });
const tentarDoCard = page => card(page).locator('#apv-tentar');
const tentarDaF1 = page => page.locator('#shell-tentar-de-novo');
const pedidosDeHealth = fakes => fakes.anki.requisicoes.filter(r => r.caminho === '/health');

async function abrir(page, extensao) {
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#anki/custos'));
}

test.beforeEach(({ fakes }) => {
  fakes.anki.desligar();
});

test('nunca conectada: abre no passo 1 esperando a Conexão, com os dois quadros e a F1 em cima', async ({ page, extensao }) => {
  await abrir(page, extensao);

  await expect(page.getByText(F1)).toBeVisible();
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText('A Conexão com o Anki roda neste computador, ao lado do Anki, e é ela que cria os cartões.');
  await expect(abas(page)).toBeHidden();

  // A lista tem os 3 passos, o primeiro é o atual e nenhum está feito.
  await expect(lista(page).getByRole('button')).toHaveText(['Abrir o Anki', 'Instalar a Conexão com o Anki', 'Tentar de novo']);
  await expect(itemDaLista(page, 'Abrir o Anki')).toHaveAttribute('aria-current', 'step');
  await expect(lista(page).locator('[aria-current="step"]')).toHaveCount(1);
  await expect(lista(page).getByRole('button', { name: /feito/ })).toHaveCount(0);

  await expect(card(page)).toContainText('Como ligar · Passo 1 de 3');
  await expect(tituloDoPasso(page)).toHaveText('Abrir o Anki');
  await expect(card(page)).toContainText('Abra o Anki neste computador, com o complemento AnkiConnect.');
  // O AnkiConnect não é lido antes da Conexão: o passo espera, nunca diz “não encontrado”.
  await expect(status(page)).toHaveText('Esperando a Conexão');
  await expect(card(page)).not.toContainText('não encontrado');

  await expect(card(page).getByRole('heading', { name: 'Continua funcionando' })).toBeVisible();
  await expect(card(page)).toContainText('Minerar de vídeos, páginas e fotos.');
  await expect(card(page).getByRole('heading', { name: 'Fica indisponível sem ela' })).toBeVisible();
  await expect(card(page)).toContainText('Enviar ao Anki e a mineração automática.');
});

test('os passos: Continuar, Voltar e a lista andam pelo card, e o foco vai ao título do passo', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Voltar' })).toBeHidden();

  await card(page).getByRole('button', { name: 'Continuar' }).click();
  await expect(itemDaLista(page, 'Instalar a Conexão com o Anki')).toHaveAttribute('aria-current', 'step');
  await expect(card(page)).toContainText('Como ligar · Passo 2 de 3');
  await expect(tituloDoPasso(page)).toHaveText('Instalar a Conexão com o Anki');
  await expect(tituloDoPasso(page)).toBeFocused();
  await expect(status(page)).toHaveText('Conexão com o Anki: desligada');

  await lista(page).getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(card(page)).toContainText('Como ligar · Passo 3 de 3');
  await expect(tentarDoCard(page)).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Continuar' })).toBeHidden();

  await card(page).getByRole('button', { name: 'Voltar' }).click();
  await expect(tituloDoPasso(page)).toHaveText('Instalar a Conexão com o Anki');
  await expect(tituloDoPasso(page)).toBeFocused();
});

test('a lista se anda pelo teclado: Tab chega ao passo e Enter o abre', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  await itemDaLista(page, 'Abrir o Anki').focus();
  await page.keyboard.press('Tab');
  await expect(itemDaLista(page, 'Instalar a Conexão com o Anki')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(itemDaLista(page, 'Instalar a Conexão com o Anki')).toHaveAttribute('aria-current', 'step');
  await expect(tituloDoPasso(page)).toBeFocused();
});

test('o status é uma região que anuncia a mudança', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  await expect(page.getByRole('status').filter({ hasText: 'Esperando a Conexão' })).toHaveCount(1);
  await expect(status(page)).toHaveAttribute('role', 'status');
});

test('Tentar de novo sem resposta: a Conexão continua desligada e o card fica no passo 3', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  await tentarDaF1(page).click();
  await expect(status(page)).toHaveText('Conexão com o Anki: desligada');
  await expect(card(page)).toContainText('Como ligar · Passo 3 de 3');
  await expect(page.getByText(F1)).toBeVisible();
  await expect(card(page)).toBeVisible();
  await expect(abas(page)).toBeHidden();
  await expect(lista(page).getByRole('button', { name: /feito/ })).toHaveCount(0);
  expect((await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou ?? false).toBe(false);

  await tentarDoCard(page).click();
  await expect(status(page)).toHaveText('Conexão com o Anki: desligada');
  await expect(card(page)).toBeVisible();
  await expect(abas(page)).toBeHidden();
});

test('conectando (depois de Tentar de novo): abre no passo 3 com “Conectando ao Anki…” e o botão indisponível', async ({ page, extensao, fakes }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText('Como ligar · Passo 1 de 3');

  let liberar;
  const segurada = new Promise(r => { liberar = r; });
  fakes.anki.responder('GET', '/health', async () => { await segurada; return { status: 503, json: {} }; });
  fakes.anki.ligar();
  await tentarDaF1(page).click();

  await expect(card(page)).toContainText('Como ligar · Passo 3 de 3');
  await expect(status(page)).toHaveText('Conectando ao Anki…');
  await expect(tentarDoCard(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#apv-confere')).toHaveText('Conferindo agora…');
  // Apertar indisponível não pergunta de novo.
  const antes = pedidosDeHealth(fakes).length;
  await tentarDoCard(page).click({ force: true });
  expect(pedidosDeHealth(fakes)).toHaveLength(antes);

  liberar();
  await expect(status(page)).toHaveText('Conexão com o Anki: desligada');
  await expect(tentarDoCard(page)).toHaveAttribute('aria-disabled', 'false');
});

test('a Conexão passa a responder: o momento Pronto, e depois as abas voltam com o toast', async ({ page, extensao, fakes }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  fakes.anki.ligar();
  await tentarDaF1(page).click();

  await expect(pronto(page)).toBeVisible();
  await expect(pronto(page)).toContainText('Pronto');
  await expect(pronto(page)).toContainText('As abas voltam em seguida.');
  await expect(status(page)).toHaveText('Conexão com o Anki: ligada');
  await expect(lista(page).getByRole('button', { name: /feito$/ })).toHaveCount(3);
  await expect(abas(page)).toBeHidden();
  // A chave fica gravada já na primeira resposta.
  await expect.poll(async () => (await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou).toBe(true);

  await expect(abas(page)).toBeVisible();
  await expect(pronto(page)).toBeHidden();
  await expect(page.getByText(F1)).toBeHidden();
  await expect(page.locator('.veio-toast')).toHaveText('Conexão com o Anki: ligada');
});

test('a Conexão liga sozinha, sem ninguém apertar: a conferência de 15 s do shell a encontra', async ({ page, extensao, fakes }) => {
  await page.clock.install({ time: AGORA });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();

  fakes.anki.ligar();
  await page.clock.runFor(15_000);

  await expect(pronto(page)).toBeVisible();
  await expect(abas(page)).toBeVisible();
});

test('a Conexão liga com a pessoa em outra área: as abas já estão lá quando ela chega, sem Pronto nem toast', async ({ page, extensao, fakes }) => {
  await page.clock.install({ time: AGORA });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();
  await page.getByRole('link', { name: 'Frases' }).click();
  await expect(card(page)).toBeHidden();

  fakes.anki.ligar();
  await page.clock.runFor(15_000);
  await expect.poll(async () => (await extensao.lerStorage('pm_anki_ja_conectou')).pm_anki_ja_conectou).toBe(true);

  // O relógio anda o bastante para o Pronto acabar, se ele tivesse começado.
  // (Lida na hora: o toast sai sozinho, então esperar por ele esconderia o erro.)
  await page.clock.runFor(2_000);
  expect(await page.locator('.veio-toast').count()).toBe(0);

  await page.getByRole('link', { name: 'Conexão com o Anki' }).click();
  await expect(abas(page)).toBeVisible();
  expect(await pronto(page).count()).toBe(0);
  await expect(card(page)).toBeHidden();
});

test('“Confere sozinho a cada 15 s” segue a conferência do shell, sem um segundo relógio de rede', async ({ page, extensao, fakes }) => {
  await page.clock.install({ time: AGORA });
  await page.goto(extensao.url('painel.html#anki/custos'));
  const linha = page.locator('#apv-confere');
  await expect(linha).toHaveText('Confere sozinho a cada 15 s · última vez há 0 s');
  expect(pedidosDeHealth(fakes)).toHaveLength(1);

  await page.clock.runFor(5_000);
  await expect(linha).toHaveText('Confere sozinho a cada 15 s · última vez há 5 s');
  expect(pedidosDeHealth(fakes)).toHaveLength(1);

  // A conferência do shell sai aos 15 s: a linha diz que está conferindo, e é uma pergunta só.
  let liberar;
  const segurada = new Promise(r => { liberar = r; });
  fakes.anki.responder('GET', '/health', async () => { await segurada; return { status: 503, json: {} }; });
  fakes.anki.ligar();
  await page.clock.runFor(10_000);
  await expect(linha).toHaveText('Conferindo agora…');
  expect(pedidosDeHealth(fakes)).toHaveLength(2);

  liberar();
  await expect(linha).toHaveText('Confere sozinho a cada 15 s · última vez há 0 s');
  await page.clock.runFor(7_000);
  await expect(linha).toHaveText('Confere sozinho a cada 15 s · última vez há 7 s');
  expect(pedidosDeHealth(fakes)).toHaveLength(2);
});

test('Copiar põe os comandos de instalação no clipboard e diz “Comandos copiados”', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await card(page).getByRole('button', { name: 'Continuar' }).click();

  // Os comandos moram no Detalhes do passo 2, recolhido.
  await card(page).getByText('Detalhes', { exact: true }).click();
  await expect(card(page).locator('pre')).toContainText('python bridge/install_autostart.py');
  await expect(card(page).locator('pre')).toContainText('127.0.0.1:8766');

  await card(page).getByRole('button', { name: 'Copiar', exact: true }).click();
  await expect(page.locator('.veio-toast')).toHaveText('Comandos copiados');
  // O Chromium não dá permissão de ler o clipboard a uma página de extensão: a
  // pessoa cola os comandos num campo, e é isso que o teste confere (o campo é
  // do teste: a área não tem onde colar enquanto o card está na tela).
  await page.evaluate(() => {
    const campo = document.createElement('textarea');
    campo.id = 'onde-colar';
    document.body.append(campo);
  });
  await page.locator('#onde-colar').focus();
  await page.keyboard.press('Control+V');
  await expect(page.locator('#onde-colar')).toHaveValue(/^pip install -r bridge\/requirements\.txt\npython bridge\/install_autostart\.py/);
});

test('se o copiar não vai, a linha diz para selecionar e copiar, sem toast', async ({ page, extensao }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('NotAllowedError: write permission denied')) },
    });
  });
  await abrir(page, extensao);
  await card(page).getByRole('button', { name: 'Continuar' }).click();

  await card(page).getByRole('button', { name: 'Copiar', exact: true }).click();
  await expect(card(page).getByRole('alert')).toHaveText('Não deu para copiar. Selecione o texto e copie.');
  await expect(page.locator('.veio-toast')).toHaveCount(0);
});

test('com a janela estreita (o trilho), a lista fica em cima do card', async ({ page, extensao }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  const daLista = await lista(page).boundingBox();
  const doCard = await page.locator('.apv-card').boundingBox();
  expect(daLista.y + daLista.height).toBeLessThanOrEqual(doCard.y);
});

test('com a janela larga, a lista fica ao lado do card', async ({ page, extensao }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  const daLista = await lista(page).boundingBox();
  const doCard = await page.locator('.apv-card').boundingBox();
  expect(daLista.x + daLista.width).toBeLessThanOrEqual(doCard.x);
});

test('o foco é visível na lista e nos botões, e piscar e pulsar ficam estáticos com movimento reduzido', async ({ page, extensao }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  await itemDaLista(page, 'Abrir o Anki').focus();
  await page.keyboard.press('Tab');
  await expect(itemDaLista(page, 'Instalar a Conexão com o Anki')).toBeFocused();
  await expect(itemDaLista(page, 'Instalar a Conexão com o Anki')).toHaveCSS('outline-style', 'solid');

  // O ponto que pisca da linha da conferência dura 1 ms, uma volta só.
  await expect(page.locator('.apv-confere .anki-ponto')).toHaveCSS('animation-duration', '0.001s');
});

test('nos dois temas o card usa os tokens Veio: o fundo do card e o do controle são os do tema', async ({ page, extensao }) => {
  await abrir(page, extensao);
  await expect(card(page)).toBeVisible();

  const cores = () => page.evaluate(() => {
    const cor = seletor => getComputedStyle(document.querySelector(seletor)).backgroundColor;
    return { card: cor('.apv-card'), controle: cor('.apv-controle') };
  });
  const escuro = await cores();
  await page.evaluate(() => { document.documentElement.dataset.tema = 'claro'; });
  const claro = await cores();
  expect(claro.card).not.toBe(escuro.card);
  expect(claro.controle).not.toBe(escuro.controle);
});
