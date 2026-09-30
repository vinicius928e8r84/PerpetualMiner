'use strict';

// Passo 8 do redesign: a Boas-vindas (#42, docs/design/painel/boas-vindas/,
// variante C; item 8 da lista fechada).
//
// Instalar a extensão abre `painel.html#boas-vindas`: uma página sem sidebar,
// com a lista dos 8 itens à esquerda e um passo por vez no card. Os passos se
// marcam pelo estado real (a frase no histórico, o atalho gravado, a conta, a
// Conexão com o Anki, a mineração automática, a chave); “Agora não” fica gravado
// neste computador. O passo 1 tem a mineração rápida do popup, o 2 o gravador
// de Configurações › Atalhos; Tudo pronto resume cada passo e abre o painel.
//
// Os testes afirmam o que a pessoa vê e o que fica gravado, nunca funções
// internas. A exceção é a atualização da extensão, que o Chromium do Playwright
// não sabe fazer (recarregar uma extensão desempacotada a desliga): o teste
// chama o ouvinte do `onInstalled` como o Chrome chamaria, com `update`.

const { test, expect } = require('../fixtures');

const lista = page => page.getByRole('navigation', { name: 'Passos da configuração' });
const itemDaLista = (page, nome) => lista(page).getByRole('button', { name: new RegExp(`^${nome}`) });
const card = page => page.locator('.bv-card');
const tituloDoCard = page => card(page).getByRole('heading', { level: 2 });
const sobretitulo = page => card(page).locator('.bv-sobretitulo');
const botaoDoCard = (page, nome) => card(page).getByRole('button', { name: nome, exact: true });
const campoRapido = page => card(page).getByRole('textbox', { name: 'Cole ou escreva uma frase' });

async function abrirBoasVindas(page, extensao, passo = '') {
  await page.goto(extensao.url(`painel.html#boas-vindas${passo && `/${passo}`}`));
  await expect(tituloDoCard(page)).toBeVisible();
}

// ─── Na instalação ───────────────────────────────────────────────────────────

test.describe('na instalação', () => {
  test.use({ manterAbaDaInstalacao: true });

  test('instalar a extensão abre uma aba na Boas-vindas, sem a sidebar do painel', async ({ extensao }) => {
    const aba = extensao.abaDaInstalacao;
    expect(aba.url()).toBe(extensao.url('painel.html#boas-vindas'));

    await expect(tituloDoCard(aba)).toHaveText('Boas-vindas ao PerpetualMiner');
    await expect(aba.getByRole('navigation', { name: 'Navegação do painel' })).toBeHidden();
    await expect(lista(aba)).toBeVisible();
  });
});

test('atualizar a extensão não abre aba nenhuma', async ({ context, extensao }) => {
  const abasAntes = context.pages().length;

  // O Chrome chama o ouvinte do onInstalled com `update` depois de atualizar.
  await extensao.serviceWorker.evaluate(() => aoInstalar({ reason: 'update', previousVersion: '4.9' }));

  await new Promise(resolve => setTimeout(resolve, 500));
  expect(context.pages()).toHaveLength(abasAntes);
  const abas = await extensao.serviceWorker.evaluate(() => chrome.tabs.query({}));
  expect(abas.map(a => a.url).filter(url => url.includes('painel.html'))).toEqual([]);
});

// ─── A abertura ──────────────────────────────────────────────────────────────

test('a abertura lista os 6 passos com “opcional” e leva ao passo 1 com Começar', async ({ page, extensao }) => {
  await abrirBoasVindas(page, extensao);

  await expect(sobretitulo(page)).toHaveText('Boas-vindas');
  await expect(card(page)).toContainText('Minere frases de vídeos, páginas e fotos de livros, e envie ao Anki como cartões.');
  const passos = card(page).getByRole('listitem');
  await expect(passos).toHaveText([
    'Minerar a primeira frase',
    'Escolher o atalho de Minerar seleção',
    /^Entrar com Google\s*opcional$/,
    'Ligar a Conexão com o Anki',
    /^Ligar a mineração automática\s*opcional$/,
    /^Adicionar a chave do Gemini\s*opcional$/,
  ]);
  // A lista ao lado: os 8 itens, o atual marcado.
  await expect(lista(page).getByRole('button')).toHaveCount(8);
  await expect(itemDaLista(page, 'Boas-vindas')).toHaveAttribute('aria-current', 'step');

  await botaoDoCard(page, 'Começar').click();
  await expect(page).toHaveURL(/#boas-vindas\/minerar$/);
  await expect(sobretitulo(page)).toHaveText('Passo 1 de 6');
  await expect(tituloDoCard(page)).toHaveText('Minerar a primeira frase');
  await expect(tituloDoCard(page)).toBeFocused();
  await expect(itemDaLista(page, 'Minerar a primeira frase')).toHaveAttribute('aria-current', 'step');
});

test('Pular a configuração abre o painel em Frases, com a sidebar', async ({ page, extensao }) => {
  await abrirBoasVindas(page, extensao);
  await botaoDoCard(page, 'Pular a configuração').click();

  await expect(page).toHaveURL(/#frases$/);
  await expect(page.getByRole('navigation', { name: 'Navegação do painel' })).toBeVisible();
  await expect(card(page)).toBeHidden();
  expect((await extensao.lerStorage('pm_boas_vindas')).pm_boas_vindas?.concluida).toBeFalsy();
});

test('qualquer item da lista abre o seu passo; o opcional diz “opcional” no sobretítulo', async ({ page, extensao }) => {
  await abrirBoasVindas(page, extensao);
  await itemDaLista(page, 'Ligar a mineração automática').click();

  await expect(page).toHaveURL(/#boas-vindas\/automatica$/);
  await expect(sobretitulo(page)).toHaveText('Passo 5 de 6 · opcional');
  await expect(tituloDoCard(page)).toHaveText('Ligar a mineração automática');
  await expect(botaoDoCard(page, 'Agora não')).toBeVisible();
});

// ─── Passo 1 ─────────────────────────────────────────────────────────────────

test('passo 1: minerar a primeira frase pelo campo grava a frase e o passo fica feito', async ({ page, extensao }) => {
  await abrirBoasVindas(page, extensao, 'minerar');
  await expect(itemDaLista(page, 'Minerar a primeira frase')).not.toHaveAccessibleName(/feito/);
  await expect(card(page)).toContainText('Num vídeo com legenda, aperte Alt+S.');
  await expect(card(page).locator('kbd').filter({ visible: true })).toHaveText('Alt+S');
  await expect(botaoDoCard(page, 'Agora não')).toHaveCount(0);

  await campoRapido(page).fill('Break a leg');
  await campoRapido(page).press('Enter');

  await expect(campoRapido(page)).toHaveValue('');
  await expect(itemDaLista(page, 'Minerar a primeira frase')).toHaveAccessibleName(/feito$/);
  const [frase] = await extensao.frases();
  expect(frase.texto).toBe('Break a leg');
  expect(frase.contexto).toEqual({ fonte: 'manual', titulo: '', detalhe: '' });
});

test('passo 1: com uma frase já no histórico, ele já aparece feito', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: [{ id: 1, texto: 'Old news', data: '01/09/2026', streaming: 'web', idioma: 'Inglês' }] });
  await abrirBoasVindas(page, extensao);

  await expect(itemDaLista(page, 'Minerar a primeira frase')).toHaveAccessibleName(/feito$/);
});

test('passo 1: com o disco recusando, POP-06 aparece e o texto fica no campo', async ({ page, extensao }) => {
  await abrirBoasVindas(page, extensao, 'minerar');
  // O disco recusa a gravação: a fronteira de armazenamento do service worker,
  // como no teste do popup.
  await extensao.serviceWorker.evaluate(() => {
    globalThis.gravarDeVerdade = chrome.storage.local.set.bind(chrome.storage.local);
    chrome.storage.local.set = () => { throw new Error('QUOTA_BYTES quota exceeded'); };
  });

  await campoRapido(page).fill('Break a leg');
  await botaoDoCard(page, 'Minerar').click();

  await expect(card(page).getByRole('alert')).toHaveText('Não deu para minerar a frase. Tente de novo.');
  await expect(campoRapido(page)).toHaveValue('Break a leg');
  await expect(campoRapido(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(itemDaLista(page, 'Minerar a primeira frase')).not.toHaveAccessibleName(/feito/);
  await extensao.serviceWorker.evaluate(() => { chrome.storage.local.set = globalThis.gravarDeVerdade; });
});

test('passo 1 sem atalho de legenda: “Sem atalho” e Definir atalho, que leva ao passo 2', async ({ page, extensao }) => {
  await extensao.gravarStorage({ pm_atalho_legenda: null });
  await abrirBoasVindas(page, extensao, 'minerar');

  await expect(card(page).locator('kbd').filter({ visible: true })).toHaveText('Sem atalho');
  await card(page).getByRole('button', { name: 'Definir atalho' }).click();

  await expect(page).toHaveURL(/#boas-vindas\/atalho$/);
  await expect(tituloDoCard(page)).toHaveText('Escolher o atalho de Minerar seleção');
});

test('passo 1: o foco fica no Definir atalho quando outra coisa muda no armazenamento', async ({ page, extensao }) => {
  await extensao.gravarStorage({ pm_atalho_legenda: null });
  await abrirBoasVindas(page, extensao, 'minerar');
  const definir = card(page).getByRole('button', { name: 'Definir atalho' });
  await definir.focus();

  // Uma gravação qualquer (aqui a chave) redesenha a página.
  await extensao.gravarStorage({ geminiApiKey: 'AIzaSyExemplo1234' });
  await expect(itemDaLista(page, 'Adicionar a chave do Gemini')).toHaveAccessibleName(/feito$/);

  await expect(definir).toBeFocused();
});

test('a conta e uma frase gravadas juntas marcam os dois passos', async ({ page, extensao }) => {
  await abrirBoasVindas(page, extensao);

  // O login e o sync gravam a sessão e as frases numa escrita só.
  await extensao.gravarStorage({
    pm_firebase_auth: { uid: 'uid-teste', idToken: 'token-teste', refreshToken: 'refresh-teste', expiresAt: Date.now() + 60 * 60 * 1000 },
    pm_user_info: { uid: 'uid-teste', email: 'pessoa@teste.dev', displayName: 'Pessoa de Teste', photoURL: '' },
    frases: [{ id: 1, texto: 'Old news', data: '01/09/2026', streaming: 'web', idioma: 'Inglês' }],
  });

  await expect(itemDaLista(page, 'Entrar com Google')).toHaveAccessibleName(/feito$/);
  await expect(itemDaLista(page, 'Minerar a primeira frase')).toHaveAccessibleName(/feito$/);
});

test('o rodapé do card fica no fundo, mesmo num passo curto', async ({ page, extensao }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await abrirBoasVindas(page, extensao, 'conta');

  const caixaDoCard = await card(page).boundingBox();
  const caixaDoContinuar = await botaoDoCard(page, 'Continuar').boundingBox();
  const caixaDaLista = await lista(page).boundingBox();
  // O card vai até o fim da lista, e o Continuar fica perto do fundo dele.
  expect(caixaDoCard.y + caixaDoCard.height).toBeCloseTo(caixaDaLista.y + caixaDaLista.height, 0);
  expect(caixaDoCard.y + caixaDoCard.height - (caixaDoContinuar.y + caixaDoContinuar.height)).toBeLessThan(40);
});

test('“Continuar” num passo obrigatório segue sem marcar; o resumo mostra “falta”', async ({ page, extensao }) => {
  await abrirBoasVindas(page, extensao, 'minerar');
  await botaoDoCard(page, 'Continuar').click();

  await expect(tituloDoCard(page)).toHaveText('Escolher o atalho de Minerar seleção');
  await expect(itemDaLista(page, 'Minerar a primeira frase')).toHaveAccessibleName('Minerar a primeira frase');

  await itemDaLista(page, 'Tudo pronto').click();
  const resumo = card(page).getByRole('listitem');
  await expect(resumo.filter({ hasText: 'Minerar a primeira frase' })).toContainText('falta');
});

// ─── Passo 2 ─────────────────────────────────────────────────────────────────

test('passo 2: o gravador é o de Configurações — grava, recusa o repetido e Configurações mostra o mesmo', async ({ page, extensao }) => {
  await abrirBoasVindas(page, extensao, 'atalho');
  const linhaSelecao = card(page).getByRole('group', { name: 'Minerar seleção' });
  const linhaLegenda = card(page).getByRole('group', { name: 'Minerar legenda' });
  await expect(linhaLegenda.locator('kbd')).toHaveText('Alt+S');
  await expect(linhaSelecao.locator('kbd')).toHaveText('Sem atalho');

  await linhaSelecao.getByRole('button', { name: 'Gravar atalho' }).click();
  await expect(linhaSelecao).toContainText('Pressione as teclas ou um botão extra do mouse…');
  await expect(linhaLegenda.getByRole('button', { name: 'Gravar atalho' })).toBeDisabled();

  // O repetido é recusado e a gravação continua.
  await page.keyboard.press('Alt+KeyS');
  await expect(linhaSelecao.getByRole('alert')).toHaveText('Esse atalho já é do Minerar legenda. Grave outro.');

  await page.keyboard.press('Alt+KeyQ');
  await expect(linhaSelecao.locator('kbd')).toHaveText('Alt+Q');
  await expect(itemDaLista(page, 'Escolher o atalho de Minerar seleção')).toHaveAccessibleName(/feito$/);
  const { pm_atalho } = await extensao.lerStorage('pm_atalho');
  expect(pm_atalho).toMatchObject({ type: 'keyboard', code: 'KeyQ', altKey: true });

  await page.goto(extensao.url('painel.html#configuracoes/atalhos'));
  await expect(page.locator('#cfg-atalhos').getByRole('group', { name: 'Minerar seleção' }).locator('kbd')).toHaveText('Alt+Q');
});

test('passo 2: trocar de passo durante a gravação cancela', async ({ page, extensao }) => {
  await abrirBoasVindas(page, extensao, 'atalho');
  const linhaSelecao = card(page).getByRole('group', { name: 'Minerar seleção' });
  await linhaSelecao.getByRole('button', { name: 'Gravar atalho' }).click();
  await botaoDoCard(page, 'Voltar').click();
  await expect(tituloDoCard(page)).toHaveText('Minerar a primeira frase');

  await page.keyboard.press('Alt+KeyQ');
  expect((await extensao.lerStorage('pm_atalho')).pm_atalho ?? null).toBeNull();
});

// ─── Passos 3 a 6 e o progresso ──────────────────────────────────────────────

test('os passos 3 a 6 se marcam pelo estado real', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({
    geminiApiKey: 'AIzaSyExemplo1234',
    pm_auto_miner_settings: { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } },
  });
  await extensao.semearSessao();
  fakes.anki.ligar();
  await abrirBoasVindas(page, extensao);

  await expect(itemDaLista(page, 'Ligar a Conexão com o Anki')).toHaveAccessibleName(/feito$/);
  await expect(itemDaLista(page, 'Entrar com Google')).toHaveAccessibleName(/feito$/);
  await expect(itemDaLista(page, 'Ligar a mineração automática')).toHaveAccessibleName(/feito$/);
  await expect(itemDaLista(page, 'Adicionar a chave do Gemini')).toHaveAccessibleName(/feito$/);

  await itemDaLista(page, 'Tudo pronto').click();
  const resumo = card(page).getByRole('listitem');
  await expect(resumo.filter({ hasText: 'mineração automática' })).toContainText('Inglês');
  await expect(resumo.filter({ hasText: 'chave do Gemini' })).toContainText('salva');
});

// ─── Passo 3: Entrar com Google ──────────────────────────────────────────────

test('passo 3: o Entrar com Google de Configurações; entrar marca o passo e o card mostra a conta', async ({ page, extensao }) => {
  await abrirBoasVindas(page, extensao, 'conta');
  await expect(card(page)).toContainText('Sem conta, elas ficam só neste computador.');

  await botaoDoCard(page, 'Entrar com Google').click();

  await expect(card(page)).toContainText('Pessoa de Teste');
  await expect(botaoDoCard(page, 'Sair da conta')).toBeVisible();
  // O botão que tinha o foco saiu com o card antigo: o foco fica no card, não cai no fim da página.
  await expect(botaoDoCard(page, 'Sair da conta')).toBeFocused();
  await expect(itemDaLista(page, 'Entrar com Google')).toHaveAccessibleName(/feito$/);
  // Feito, o “Agora não” sai do rodapé.
  await expect(botaoDoCard(page, 'Agora não')).toHaveCount(0);
  expect((await extensao.lerStorage('pm_user_info')).pm_user_info.displayName).toBe('Pessoa de Teste');
});

test('passo 3: um login que falha diz CFG-07 no próprio passo', async ({ page, extensao, fakes }) => {
  fakes.google.proximoLogin('falhar');
  await abrirBoasVindas(page, extensao, 'conta');

  await botaoDoCard(page, 'Entrar com Google').click();

  await expect(card(page).getByText('Não deu para entrar com o Google. Tente de novo.')).toBeVisible();
  await expect(itemDaLista(page, 'Entrar com Google')).not.toHaveAccessibleName(/feito/);
});

// ─── Passo 4: Ligar a Conexão com o Anki ─────────────────────────────────────

test('passo 4: desligada, o status, os 3 passos, Detalhes e Tentar de novo; ligar e tentar de novo marca o passo', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirBoasVindas(page, extensao, 'anki');

  const status = card(page).getByRole('status');
  await expect(status).toHaveText('Conexão com o Anki: desligada');
  await expect(card(page).getByRole('listitem')).toHaveText([
    'Abra o Anki neste computador, com o complemento AnkiConnect.',
    'Instale a Conexão com o Anki uma vez (veja Detalhes). Depois ela liga sozinha com o Windows.',
    'Volte aqui e use Tentar de novo.',
  ]);
  await card(page).getByText('Detalhes', { exact: true }).filter({ visible: true }).click();
  await expect(card(page)).toContainText('pip install -r bridge/requirements.txt');

  await botaoDoCard(page, 'Tentar de novo').click();
  await expect(status).toHaveText('Conexão com o Anki: desligada');

  fakes.anki.ligar();
  await botaoDoCard(page, 'Tentar de novo').click();
  await expect(status).toHaveText('Conexão com o Anki: ligada');
  await expect(itemDaLista(page, 'Ligar a Conexão com o Anki')).toHaveAccessibleName(/feito$/);
  // Ligada, os passos e o Tentar de novo saem: não há mais o que fazer.
  await expect(card(page).getByRole('listitem')).toHaveCount(0);
  await expect(botaoDoCard(page, 'Tentar de novo')).toHaveCount(0);
});

test('passo 4: Copiar põe os comandos no clipboard e diz “Comandos copiados”', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirBoasVindas(page, extensao, 'anki');

  await botaoDoCard(page, 'Copiar').click();
  await expect(page.locator('.veio-toast')).toHaveText('Comandos copiados');
});

// ─── Passo 5: Ligar a mineração automática ───────────────────────────────────

test('passo 5: os switches EN/RU e o limite por dia gravam o mesmo que o popup', async ({ page, extensao, fakes }) => {
  fakes.anki.ligar();
  await abrirBoasVindas(page, extensao, 'automatica');
  await expect(card(page).getByText('Conexão com o Anki: ligada')).toBeAttached();
  // Ligada, a nota de dependência não aparece.
  await expect(card(page).getByText(/Nada é minerado com a Conexão com o Anki desligada/)).toBeHidden();

  const ingles = card(page).getByRole('switch', { name: 'Mineração automática em inglês' });
  await expect(ingles).not.toBeChecked();
  // A pessoa clica no desenho do switch (ou no nome do idioma, que é o rótulo dele).
  await card(page).getByText('Inglês', { exact: true }).click();

  await expect(ingles).toBeChecked();
  await expect(itemDaLista(page, 'Ligar a mineração automática')).toHaveAccessibleName(/feito$/);
  await expect.poll(async () => (await extensao.lerStorage('pm_auto_miner_settings')).pm_auto_miner_settings?.en?.enabled).toBe(true);

  const limite = card(page).getByRole('spinbutton', { name: 'Limite por dia em russo' });
  await limite.fill('35');
  await limite.press('Enter');
  await expect.poll(async () => (await extensao.lerStorage('pm_auto_miner_settings')).pm_auto_miner_settings?.ru?.dailyLimit).toBe(35);
  await expect(limite).toBeFocused();
  await expect(card(page)).toContainText('Os mesmos botões ficam no popup, pelo ícone da extensão.');
});

test('passo 5: com a Conexão desligada, a nota de dependência (ONB-10)', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirBoasVindas(page, extensao, 'automatica');

  await expect(card(page)).toContainText('Nada é minerado com a Conexão com o Anki desligada: é ela que diz quais palavras você já conhece.');
  // Dá para ligar mesmo assim, com o status honesto.
  await card(page).getByText('Russo', { exact: true }).click();
  await expect(card(page).getByRole('switch', { name: 'Mineração automática em russo' })).toBeChecked();
  await expect(itemDaLista(page, 'Ligar a mineração automática')).toHaveAccessibleName(/feito$/);
});

test('passo 5: com o disco recusando, POP-16 pede para tentar de novo e o switch volta ao gravado', async ({ page, extensao }) => {
  await abrirBoasVindas(page, extensao, 'automatica');
  const ingles = card(page).getByRole('switch', { name: 'Mineração automática em inglês' });
  await expect(ingles).toBeEnabled();
  // O disco recusa a gravação, na fronteira de armazenamento do service worker (como no popup).
  await extensao.serviceWorker.evaluate(() => {
    globalThis.gravarDeVerdade = chrome.storage.local.set.bind(chrome.storage.local);
    chrome.storage.local.set = () => { throw new Error('QUOTA_BYTES quota exceeded'); };
  });

  await card(page).getByText('Inglês', { exact: true }).click();

  await expect(card(page).getByRole('alert')).toHaveText('Não deu para salvar a mudança. Tente de novo.');
  await expect(ingles).not.toBeChecked();
  await expect(itemDaLista(page, 'Ligar a mineração automática')).not.toHaveAccessibleName(/feito/);
  await extensao.serviceWorker.evaluate(() => { chrome.storage.local.set = globalThis.gravarDeVerdade; });
});

// ─── Passo 6: Adicionar a chave do Gemini ────────────────────────────────────

test('passo 6: o campo de Configurações › Chave do Gemini; salvar grava a chave e marca o passo', async ({ page, extensao }) => {
  await abrirBoasVindas(page, extensao, 'chave');
  const campo = card(page).getByRole('textbox', { name: 'Chave do Gemini' });

  await botaoDoCard(page, 'Salvar chave').click();
  await expect(campo).toHaveAttribute('aria-invalid', 'true');
  await expect(card(page)).toContainText('Cole a chave antes de salvar');

  await card(page).getByText('Detalhes', { exact: true }).filter({ visible: true }).click();
  await expect(card(page)).toContainText('No Google AI Studio, em “Get API key”.');

  await campo.fill('  AIzaSyExemplo1234  ');
  await campo.press('Enter');

  await expect(card(page)).toContainText('Chave salva');
  await expect(page.locator('.veio-toast')).toHaveText('Chave do Gemini salva');
  await expect(itemDaLista(page, 'Adicionar a chave do Gemini')).toHaveAccessibleName(/feito$/);
  expect((await extensao.lerStorage('geminiApiKey')).geminiApiKey).toBe('AIzaSyExemplo1234');

  // Configurações mostra a mesma chave, mascarada.
  await page.goto(extensao.url('painel.html#configuracoes/chave'));
  await expect(page.locator('#cfg-chave-corpo')).toContainText('Chave salva');
});

test('“Agora não” num opcional fica gravado neste computador e aparece no resumo', async ({ page, extensao }) => {
  await abrirBoasVindas(page, extensao, 'conta');
  await botaoDoCard(page, 'Agora não').click();

  await expect(tituloDoCard(page)).toHaveText('Ligar a Conexão com o Anki');
  await expect(itemDaLista(page, 'Entrar com Google')).toHaveAccessibleName(/agora não$/);
  expect((await extensao.lerStorage('pm_boas_vindas')).pm_boas_vindas.agoraNao).toEqual(['conta']);

  await page.reload();
  await expect(itemDaLista(page, 'Entrar com Google')).toHaveAccessibleName(/agora não$/);
  await itemDaLista(page, 'Tudo pronto').click();
  await expect(card(page).getByRole('listitem').filter({ hasText: 'Entrar com Google' })).toContainText('agora não');
});

// ─── Tudo pronto ─────────────────────────────────────────────────────────────

test('Tudo pronto resume cada passo e Abrir painel leva a Frases', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await extensao.gravarStorage({
    frases: [{ id: 1, texto: 'Old news', data: '01/09/2026', streaming: 'web', idioma: 'Inglês' }],
    pm_atalho: { type: 'keyboard', code: 'KeyQ', button: null, altKey: true, ctrlKey: false, shiftKey: false, label: 'Alt+Q' },
  });
  await abrirBoasVindas(page, extensao, 'pronto');

  await expect(sobretitulo(page)).toHaveText('Pronto');
  await expect(tituloDoCard(page)).toHaveText('Tudo pronto');
  const resumo = card(page).getByRole('listitem');
  await expect(resumo).toHaveCount(6);
  await expect(resumo.nth(0)).toContainText('1 frase');
  await expect(resumo.nth(1)).toContainText('Alt+Q');
  await expect(resumo.nth(3)).toContainText('falta');

  await botaoDoCard(page, 'Abrir painel').click();
  await expect(page).toHaveURL(/#frases$/);
  await expect(page.getByRole('navigation', { name: 'Navegação do painel' })).toBeVisible();
  expect((await extensao.lerStorage('pm_boas_vindas')).pm_boas_vindas.concluida).toBe(true);
});
