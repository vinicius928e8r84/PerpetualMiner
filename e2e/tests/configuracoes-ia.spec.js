'use strict';

// O card IA dos cartões de Configurações (#140, docs/design/painel/configuracoes/): as duas entradas em
// colunas do mesmo tamanho, a coluna da Chave da OpenAI funcionando e a do ChatGPT ainda sem login.
//
// A pessoa cola a chave; a Conexão com o Anki (o fake do e2e, que fala o contrato de
// complemento/contrato/exemplos.json) a confere na OpenAI e guarda a cópia dela; a tela mostra a chave
// mascarada. O segredo local fica só na Conexão; `chrome.storage.local` só tem
// máscara/UID/revisão/flag. O banco antigo da extensão fica sem segredos.
//
// Os testes afirmam o que a pessoa vê e o que fica gravado, nunca funções internas. Ler o IndexedDB da
// extensão é ler o que ficou guardado, como `lerStorage`.

const { test, expect } = require('../fixtures');
const { fotografar } = require('../evidencias-mineracao');

const CHAVE = 'sk-proj-chave-de-exemplo-9f3a';
const OUTRA_CHAVE = 'sk-proj-OutraChaveDoTeste0987654321-wxyz';
const MASCARADA = '••••••••9f3a';

async function abrirPainel(page, extensao, endereco) {
  await page.goto(extensao.url(`painel.html${endereco}`));
  await expect(page.getByRole('navigation', { name: 'Navegação do painel' })).toBeVisible();
}

const card = page => page.locator('#cfg-ia');
const corpo = page => card(page).locator('.cfg-corpo');
const campo = page => card(page).getByRole('textbox', { name: 'Chave da OpenAI' });
const conferir = page => card(page).getByRole('button', { name: 'Conferir e salvar' });
const erro = page => card(page).getByRole('alert');

/** Prova negativa: o cofre antigo da extensão não guarda mais a chave. */
const chaveNoBancoDaExtensao = page => page.evaluate(() => new Promise((resolver, rejeitar) => {
  const pedido = indexedDB.open('pm-segredos', 1);
  pedido.onupgradeneeded = () => pedido.result.createObjectStore('chaves');
  pedido.onerror = () => rejeitar(pedido.error);
  pedido.onsuccess = () => {
    const leitura = pedido.result.transaction('chaves').objectStore('chaves').get('openai');
    leitura.onsuccess = () => resolver(leitura.result || '');
  };
}));

async function colarEConferir(page, chave = CHAVE) {
  await campo(page).fill(chave);
  await conferir(page).click();
}

test('N2: sem chave e sem Conexão opcional, só as frases sincronizam; ligar depois recebe a chave da conta', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await extensao.semearSessao({ uid: 'A' });
  await abrirPainel(page, extensao, '#configuracoes/conta');
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado agora');
  await expect(page.locator('#cfg-conta')).not.toContainText('Não deu para conferir a sincronização da chave');
  expect(fakes.google.chaveDaOpenAIDe('A')).toBeNull();
  expect(fakes.anki.estadoDaChave()).toEqual({ versao: 0, conta: '', em: 0, naoEnviada: false });
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai?.ultimos4 || '').toBe('');
  fakes.google.gravarChaveDaOpenAI('A', { chave: CHAVE, em: 100 });
  fakes.anki.ligar();
  await page.reload();
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado agora');
  expect(fakes.anki.chaveNaConexao() === CHAVE).toBe(true);
  expect(fakes.anki.estadoDaChave().conta).toBe('A');
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai.ultimos4).toBe('9f3a');
});

test('sem chave: as duas entradas aparecem em colunas do mesmo tamanho e nada fica guardado', async ({ page, extensao }) => {
  await abrirPainel(page, extensao, '#configuracoes/ia');

  await expect(card(page).getByRole('button', { name: 'IA dos cartões' })).toHaveAttribute('aria-expanded', 'true');
  await expect(card(page).locator('.cfg-resumo')).toHaveText('Sem chave');
  const colunaDaChave = card(page).getByRole('region', { name: 'Chave da OpenAI' });
  const colunaDoChatGPT = card(page).getByRole('region', { name: /Conta do ChatGPT/ });
  await expect(colunaDaChave).toBeVisible();
  await expect(colunaDoChatGPT).toContainText('Plus ou Pro');
  const [a, b] = [await colunaDaChave.boundingBox(), await colunaDoChatGPT.boundingBox()];
  expect(Math.abs(a.width - b.width)).toBeLessThan(1);
  expect(Math.abs(a.y - b.y)).toBeLessThan(1);
  expect(b.x).toBeGreaterThan(a.x + a.width - 1);

  // O que cada coluna diz: a chave é paga à parte e vale criá-la num projeto com limite de gasto; o ChatGPT ainda não entra.
  await expect(colunaDaChave).toContainText('Você paga à OpenAI pelo uso, direto na sua conta.');
  await expect(colunaDaChave).toContainText('Crie a chave num projeto próprio da OpenAI, com limite de gasto por mês. Para desligar de verdade, revogue a chave na OpenAI.');
  await expect(colunaDaChave.getByRole('link', { name: 'Onde criar a chave' })).toHaveAttribute('href', 'https://platform.openai.com/api-keys');
  await expect(colunaDoChatGPT.getByRole('button', { name: 'Continuar com o ChatGPT' })).toBeDisabled();
  await expect(colunaDoChatGPT).toContainText('Ainda não dá para entrar com o ChatGPT. Por enquanto, use a chave.');
  await expect(corpo(page)).toContainText('A imagem gerada por IA sempre sai pela chave, mesmo com o plano do ChatGPT.');
  await expect(campo(page)).toHaveAttribute('placeholder', 'Cole a chave (começa com sk-)');

  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai?.ultimos4 || '').toBe('');
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
});

test('colar a chave: a Conexão a confere e guarda a cópia, a tela mostra só a máscara e só os 4 últimos ficam no storage', async ({ page, extensao, fakes }) => {
  await abrirPainel(page, extensao, '#configuracoes/ia');

  await colarEConferir(page);

  await expect(page.locator('.veio-toast', { hasText: 'Chave da OpenAI conferida e salva' })).toBeVisible();
  await expect(corpo(page).getByText('Chave conferida', { exact: true })).toBeVisible();
  await expect(corpo(page).getByText(MASCARADA)).toBeVisible();
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);
  // Sem conta, a chave fica neste computador: a tela diz o estado verdadeiro (C8).
  await expect(corpo(page)).toContainText('Fica neste computador, na Conexão com o Anki. Com a conta Google, ela vai junto para os seus outros computadores.');
  await expect(corpo(page)).not.toContainText('vai junto com a sua conta Google');
  await expect(corpo(page)).toContainText('A Conexão com o Anki guarda a chave.');
  await expect(campo(page)).toHaveCount(0);
  await expect(page.getByText(CHAVE)).toHaveCount(0);
  await expect(page.getByText('sk-proj-chave-de-exemplo')).toHaveCount(0);

  // O que atravessou: a chave foi ao complemento, que a guarda (o fake faz como ele).
  expect(fakes.anki.chaveNaConexao()).toBe(CHAVE);
  // O que ficou: a chave inteira só no banco da extensão; no storage, só o fim dela.
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  expect(await extensao.lerStorage('pm_chave_openai')).toMatchObject({ pm_chave_openai: { ultimos4: '9f3a' } });
  expect(JSON.stringify(await extensao.lerStorage(null))).not.toContain('sk-proj-chave-de-exemplo');
});

test('Enter no campo confere, como o botão', async ({ page, extensao, fakes }) => {
  await abrirPainel(page, extensao, '#configuracoes/ia');

  await campo(page).fill(CHAVE);
  await campo(page).press('Enter');

  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);
  expect(fakes.anki.chaveNaConexao()).toBe(CHAVE);
});

test('conferir com o campo vazio é recusado no campo e nada vai à Conexão', async ({ page, extensao, fakes }) => {
  await abrirPainel(page, extensao, '#configuracoes/ia');

  await conferir(page).click();

  await expect(campo(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(card(page).getByText('Cole a chave antes de conferir')).toBeVisible();
  await expect(campo(page)).toBeFocused();
  await campo(page).fill('s');
  await expect(campo(page)).not.toHaveAttribute('aria-invalid', 'true');
  expect(fakes.anki.requisicoes.filter(r => r.caminho === '/ia/openai/chave')).toEqual([]);
  // Nada foi guardado: nem no banco da extensão, nem no storage, nem na cópia da Conexão.
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai?.ultimos4 || '').toBe('');
  expect(fakes.anki.chaveNaConexao()).toBeNull();
});

test('enquanto a Conexão confere, o campo guarda o que foi colado e o botão não repete o pedido', async ({ page, extensao, fakes }) => {
  let liberar;
  fakes.anki.responder('POST', '/ia/openai/chave', req => new Promise(resolver => {
    liberar = () => {
      fakes.anki.guardarChaveNaConexao('9f3a', req.postDataJSON().versao);
      resolver({ status: 200, json: { ok: true, ultimos4: '9f3a' } });
    };
  }));
  await abrirPainel(page, extensao, '#configuracoes/ia');

  await colarEConferir(page);

  await expect(card(page).getByRole('button', { name: 'Conferindo a chave…' })).toHaveAttribute('aria-disabled', 'true');
  await expect(campo(page)).toBeDisabled();
  await expect(campo(page)).toHaveValue(CHAVE);
  await card(page).getByRole('button', { name: 'Conferindo a chave…' }).click({ force: true });
  liberar();
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);
  expect(fakes.anki.requisicoes.filter(r => r.caminho === '/ia/openai/chave')).toHaveLength(1);
  // Depois da resposta, a chave inteira só no banco da extensão e, no storage, só o fim dela.
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  expect(await extensao.lerStorage('pm_chave_openai')).toMatchObject({ pm_chave_openai: { ultimos4: '9f3a' } });
  expect(JSON.stringify(await extensao.lerStorage(null))).not.toContain('sk-proj-chave-de-exemplo');
});

for (const { comportamento, texto, acao, detalhes } of [
  { comportamento: 'recusa', texto: 'A OpenAI recusou a chave. Confira se ela está inteira e cole de novo.', acao: 'Trocar chave', detalhes: 'HTTP 401 · openai_key_rejected' },
  { comportamento: 'sem_credito', texto: 'A conta da OpenAI está sem crédito. Adicione crédito e confira de novo.', acao: 'Adicionar crédito', detalhes: 'HTTP 402 · openai_no_credit' },
  { comportamento: 'limite_de_uso', texto: 'A conta da OpenAI está sem crédito. Adicione crédito e confira de novo.', acao: 'Adicionar crédito', detalhes: 'HTTP 402 · openai_no_credit' },
  { comportamento: 'limite_so_no_pago', texto: 'A conta da OpenAI está sem crédito. Adicione crédito e confira de novo.', acao: 'Adicionar crédito', detalhes: 'HTTP 402 · openai_no_credit' },
  { comportamento: 'org_nao_verificada', texto: 'A OpenAI pede para verificar a sua organização antes de gerar imagens. Verifique-a e confira de novo.', acao: 'Verificar organização', detalhes: 'HTTP 403 · openai_org_not_verified' },
  { comportamento: 'fora_do_ar', texto: 'Não deu para falar com a OpenAI. Tente de novo daqui a pouco.', acao: 'Tentar de novo', detalhes: 'HTTP 502 · openai_unreachable' },
]) {
  test(`a OpenAI responde “${comportamento}”: a faixa diz a qual entrada pertence e o que fazer, e nada é guardado`, async ({ page, extensao, fakes }) => {
    fakes.anki.responderOpenAI(comportamento);
    await abrirPainel(page, extensao, '#configuracoes/ia');

    await colarEConferir(page);

    await expect(erro(page)).toContainText('Chave da OpenAI');
    await expect(erro(page)).toContainText(texto);
    await expect(erro(page).getByRole('button', { name: acao })).toBeVisible();
    await erro(page).getByText('Detalhes').click();
    await expect(erro(page)).toContainText(detalhes);
    // A faixa atravessa o card, abaixo das duas colunas.
    const faixa = await erro(page).boundingBox();
    const colunas = await card(page).locator('.ia-colunas').boundingBox();
    expect(faixa.y).toBeGreaterThan(colunas.y + colunas.height - 1);
    // O campo volta com o que foi colado, para a pessoa corrigir; a chave não foi guardada em lugar nenhum.
    await expect(campo(page)).toHaveValue(CHAVE);
    await expect(card(page).locator('.cfg-resumo')).toHaveText('Sem chave');
    expect(fakes.anki.chaveNaConexao()).toBeNull();
    expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai?.ultimos4 || '').toBe('');
    expect(await chaveNoBancoDaExtensao(page)).toBe('');
  });
}

test('chave recusada: Trocar chave limpa o campo; digitar tira a faixa; uma chave aceita depois a substitui', async ({ page, extensao, fakes }) => {
  fakes.anki.responderOpenAI('recusa');
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect(erro(page)).toBeVisible();

  await erro(page).getByRole('button', { name: 'Trocar chave' }).click();
  await expect(erro(page)).toHaveCount(0);
  await expect(campo(page)).toHaveValue('');
  await expect(campo(page)).toBeFocused();

  fakes.anki.responderOpenAI('aceita');
  await colarEConferir(page, OUTRA_CHAVE);
  await expect(card(page).locator('.cfg-resumo')).toHaveText('••••••••wxyz');
  expect(fakes.anki.chaveNaConexao()).toBe(OUTRA_CHAVE);
});

test('chave sem crédito: Adicionar crédito abre a OpenAI numa aba nova', async ({ page, extensao, fakes, context }) => {
  fakes.anki.responderOpenAI('sem_credito');
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);

  // A rede é bloqueada no e2e: o que se confere é o pedido que a aba nova fez.
  const [pedido] = await Promise.all([
    context.waitForEvent('request', r => r.url().startsWith('https://platform.openai.com/')),
    erro(page).getByRole('button', { name: 'Adicionar crédito' }).click(),
  ]);

  expect(pedido.url()).toBe('https://platform.openai.com/settings/organization/billing/overview');
  // A chave sem crédito não foi guardada em lugar nenhum, nem depois de abrir a OpenAI.
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai?.ultimos4 || '').toBe('');
  expect(fakes.anki.chaveNaConexao()).toBeNull();
});

test('a OpenAI fora do ar: Tentar de novo manda a mesma chave e, aceita, a faixa some', async ({ page, extensao, fakes }) => {
  fakes.anki.responderOpenAI('fora_do_ar');
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect(erro(page)).toContainText('Não deu para falar com a OpenAI.');

  fakes.anki.responderOpenAI('aceita');
  await erro(page).getByRole('button', { name: 'Tentar de novo' }).click();

  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);
  await expect(erro(page)).toHaveCount(0);
  expect(fakes.anki.chaveNaConexao()).toBe(CHAVE);
});

test('com a Conexão desligada, a faixa diz que é ela quem confere; ligada, Tentar de novo conclui', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);

  await expect(erro(page)).toContainText('Chave da OpenAI');
  await expect(erro(page)).toContainText('A Conexão com o Anki não respondeu, e é ela que confere a chave. Ligue-a e tente de novo.');
  await expect(card(page).locator('.cfg-resumo')).toHaveText('Sem chave');
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai?.ultimos4 || '').toBe('');

  fakes.anki.ligar();
  await erro(page).getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);
  expect(fakes.anki.chaveNaConexao()).toBe(CHAVE);
});

test('Trocar chave abre o campo vazio, Cancelar volta sem mudar nada, e uma chave recusada deixa a guardada como estava', async ({ page, extensao, fakes }) => {
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);

  await card(page).getByRole('button', { name: 'Trocar chave' }).click();
  await expect(campo(page)).toBeFocused();
  await expect(campo(page)).toHaveValue('');
  await campo(page).fill(OUTRA_CHAVE);
  await card(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(card(page).getByRole('button', { name: 'Trocar chave' })).toBeFocused();
  await expect(corpo(page).getByText(MASCARADA)).toBeVisible();

  fakes.anki.responderOpenAI('recusa');
  await card(page).getByRole('button', { name: 'Trocar chave' }).click();
  await colarEConferir(page, OUTRA_CHAVE);
  await expect(erro(page)).toContainText('A OpenAI recusou a chave.');
  expect(fakes.anki.chaveNaConexao()).toBe(CHAVE);
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  expect(await extensao.lerStorage('pm_chave_openai')).toMatchObject({ pm_chave_openai: { ultimos4: '9f3a' } });
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);
});

test('com a Conexão desligada o card não afirma nada sobre a cópia', async ({ page, extensao, fakes }) => {
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);

  fakes.anki.desligar();
  await page.reload();

  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);
  await expect(corpo(page)).not.toContainText('cópia da chave');
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  expect(await extensao.lerStorage('pm_chave_openai')).toMatchObject({ pm_chave_openai: { ultimos4: '9f3a' } });
  expect(JSON.stringify(await extensao.lerStorage(null))).not.toContain('sk-proj-chave-de-exemplo');
});

test('o content script e o overlay não alcançam a chave: ela não está no storage que eles leem nem no banco que eles abrem', async ({ page, extensao, context, paginas, fakes }) => {
  // Upgrade from the old readable storage must migrate both tokens to restricted origin storage.
  await extensao.gravarStorage({
    pm_user_info: { uid: 'uid-isolamento', displayName: 'Pessoa de Teste' },
    pm_firebase_auth: { uid: 'uid-isolamento', idToken: 'token-teste', refreshToken: 'refresh-teste', expiresAt: Date.now() + 3600000 },
  });
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);

  await expect.poll(() => Boolean(fakes.google.chaveDaOpenAIDe('uid-isolamento'))).toBe(true);

  // O mundo isolado do content script numa página comum: é de onde o content script e o overlay leem.
  const pagina = await context.newPage();
  await pagina.goto(paginas.url('texto.html'));
  const cdp = await context.newCDPSession(pagina);
  const contextos = [];
  cdp.on('Runtime.executionContextCreated', ({ context: c }) => contextos.push(c));
  await cdp.send('Runtime.enable');
  const doContentScript = contextos.find(c => c.origin === `chrome-extension://${extensao.id}`);
  expect(doContentScript, 'o content script devia ter um mundo isolado nesta página').toBeTruthy();

  const { result } = await cdp.send('Runtime.evaluate', {
    contextId: doContentScript.id,
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => ({
      storage: JSON.stringify(await chrome.storage.local.get(null)),
      bancos: (await indexedDB.databases()).map(banco => banco.name),
      temToken: Boolean((await chrome.storage.local.get('pm_firebase_auth')).pm_firebase_auth),
    }))()`,
  });

  expect(result.value.storage).toContain('pm_chave_openai');
  expect(result.value.storage).not.toContain('sk-proj-chave-de-exemplo');
  expect(result.value.bancos).not.toContain('pm-segredos');
  expect(result.value.bancos).not.toContain('pm-sessao');
  expect(result.value.storage).not.toContain('token-teste');
  expect(result.value.storage).not.toContain('refresh-teste');
  expect(result.value.temToken).toBe(false);
  expect(await extensao.lerStorage('pm_firebase_auth')).toEqual({});
  expect(fakes.google.chaveDaOpenAIDe('uid-isolamento').chave === CHAVE).toBe(true);

  // O content script também não pode usar o exportador do dono com um token
  // próprio: Chromium manda a origem do site, que o servidor real recusa
  // (matriz HTTP de complemento/test_servidor.py), não a origem da extensão.
  const origemDoSite = new URL(pagina.url()).origin;
  const origens = [];
  await context.route('**/ia/openai/sincronizar', async route => {
    const cabecalhos = { 'Access-Control-Allow-Origin': origemDoSite,
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cabecalhos });
    origens.push(route.request().headers().origin);
    await route.fulfill({ status: 403, headers: cabecalhos, json: { error: 'origin_not_allowed' } });
  });
  const negado = await cdp.send('Runtime.evaluate', {
    contextId: doContentScript.id, awaitPromise: true, returnByValue: true,
    expression: `(async () => (await fetch('http://127.0.0.1:8766/ia/openai/sincronizar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: 'B', token: 'token-ficticio-B', versao: 1 })
    })).status)()`,
  });
  expect(negado.result.value).toBe(403);
  expect(origens).toEqual([origemDoSite]);
  expect(origens).not.toContain(`chrome-extension://${extensao.id}`);
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai.conta).toBe('uid-isolamento');
  expect(fakes.google.chaveDaOpenAIDe('B')).toBeNull();
});

test('a chave colada num lugar do card e confirmada no outro nunca volta à tela em Trocar chave', async ({ page, extensao, fakes }) => {
  await abrirPainel(page, extensao, '#configuracoes/ia');
  // Colada em Configurações, sem conferir: fica como rascunho do card daqui.
  await campo(page).fill(CHAVE);

  // Conferida no passo da Boas-vindas, que é o mesmo card em outro lugar.
  await page.goto(extensao.url('painel.html#boas-vindas/ia'));
  const passo = page.locator('.bv-card');
  await passo.getByRole('textbox', { name: 'Chave da OpenAI' }).fill(OUTRA_CHAVE);
  await passo.getByRole('button', { name: 'Conferir e salvar' }).click();
  await expect(passo.getByText('Chave conferida', { exact: true })).toBeVisible();

  await page.goto(extensao.url('painel.html#configuracoes/ia'));
  await expect(corpo(page).getByText('••••••••wxyz')).toBeVisible();
  await card(page).getByRole('button', { name: 'Trocar chave' }).click();

  await expect(campo(page)).toHaveValue('');
  await expect(page.getByText(CHAVE)).toHaveCount(0);

  // O que ficou guardado: a chave confirmada, inteira só no banco da extensão e na cópia da Conexão.
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  expect(fakes.anki.chaveNaConexao()).toBe(OUTRA_CHAVE);
  expect(await extensao.lerStorage('pm_chave_openai')).toMatchObject({ pm_chave_openai: { ultimos4: 'wxyz' } });
  const tudo = JSON.stringify(await extensao.lerStorage(null));
  expect(tudo).not.toContain(CHAVE);
  expect(tudo).not.toContain(OUTRA_CHAVE);
});

test('Trocar chave aberto num lugar, com um erro e a chave colada, é reposto quando o outro lugar confirma uma chave', async ({ page, extensao, fakes }) => {
  const TERCEIRA_CHAVE = 'sk-proj-TerceiraChaveDoTeste5555-mnop';
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await card(page).getByRole('button', { name: 'Trocar chave' }).click();
  fakes.anki.responderOpenAI('fora_do_ar');
  await colarEConferir(page, OUTRA_CHAVE);
  await expect(erro(page).getByRole('button', { name: 'Tentar de novo' })).toBeVisible();

  // No passo da Boas-vindas, o mesmo card confirma outra chave.
  fakes.anki.responderOpenAI('aceita');
  await page.goto(extensao.url('painel.html#boas-vindas/ia'));
  const passo = page.locator('.bv-card');
  await passo.getByRole('button', { name: 'Trocar chave' }).click();
  await passo.getByRole('textbox', { name: 'Chave da OpenAI' }).fill(TERCEIRA_CHAVE);
  await passo.getByRole('button', { name: 'Conferir e salvar' }).click();
  await expect(passo.getByText('••••••••mnop')).toBeVisible();

  // De volta a Configurações o card mostra a chave confirmada, sem campo, sem faixa e sem um Tentar de novo que não manda nada.
  await page.goto(extensao.url('painel.html#configuracoes/ia'));
  await expect(corpo(page).getByText('••••••••mnop')).toBeVisible();
  await expect(campo(page)).toHaveCount(0);
  await expect(erro(page)).toHaveCount(0);

  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  expect(fakes.anki.chaveNaConexao()).toBe(TERCEIRA_CHAVE);
  expect(await extensao.lerStorage('pm_chave_openai')).toMatchObject({ pm_chave_openai: { ultimos4: 'mnop' } });
});

test('com a Conexão desligada depois de conferir, o card deixa de dizer que ela tem a cópia, sem recarregar', async ({ page, extensao, fakes }) => {
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect(corpo(page)).toContainText('A Conexão com o Anki guarda a chave.');

  fakes.anki.desligar();

  // A Conexão é conferida a cada 15 s.
  await expect(corpo(page)).not.toContainText('cópia da chave', { timeout: 25_000 });
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);

  // Desligar a Conexão não mexe no que está guardado: a mesma chave, e nenhuma chave inteira no storage.
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  expect(await extensao.lerStorage('pm_chave_openai')).toMatchObject({ pm_chave_openai: { ultimos4: '9f3a' } });
  expect(JSON.stringify(await extensao.lerStorage(null))).not.toContain('sk-proj-chave-de-exemplo');
});

test('abaixo de ~620 px de largura do card, as colunas viram linhas', async ({ page, extensao }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await abrirPainel(page, extensao, '#configuracoes/ia');
  const lado = async () => ({
    chave: await card(page).getByRole('region', { name: 'Chave da OpenAI' }).boundingBox(),
    chatgpt: await card(page).getByRole('region', { name: /Conta do ChatGPT/ }).boundingBox(),
  });

  const larga = await lado();
  expect(larga.chatgpt.x).toBeGreaterThan(larga.chave.x + larga.chave.width - 1);

  await page.setViewportSize({ width: 760, height: 900 });
  const estreita = await lado();
  expect(Math.abs(estreita.chatgpt.x - estreita.chave.x)).toBeLessThan(1);
  expect(estreita.chatgpt.y).toBeGreaterThan(estreita.chave.y + estreita.chave.height - 1);
  expect(Math.abs(estreita.chatgpt.width - estreita.chave.width)).toBeLessThan(1);
});

// ─── A chave acompanha a conta Google (#154) ───────────────────────────────────
//
// A Conexão é o único dono local; a nuvem replica o valor. A extensão só
// guarda o resumo público. As chaves são fictícias; os provedores são fronteiras.

const UID = 'uid-da-chave';
const modal = page => page.getByRole('dialog');

for (const comChave of [false, true]) {
  test(`N2: voltar à aba não esconde a falha das frases — ${comChave ? 'com chave pendente' : 'sem chave'}`, async ({ page, extensao, fakes }) => {
    const frase = { id: 77, texto: 'This phrase is only on this computer.', data: '09/10/2026', idioma: 'Inglês', streaming: 'web' };
    await extensao.semearSessao({ uid: UID });
    await extensao.gravarStorage({ frases: [frase], pm_migrated: UID });
    fakes.google.ficarForaDoAr();
    await abrirPainel(page, extensao, '#configuracoes/conta');
    const conta = page.locator('#cfg-conta');
    await expect(conta).toContainText('as frases estão só neste computador');
    if (comChave) {
      await page.goto(extensao.url('painel.html#configuracoes/ia'));
      await colarEConferir(page);
      await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);
      await expect(campo(page)).toHaveCount(0);
      await page.goto(extensao.url('painel.html#configuracoes/conta'));
      await expect(conta).toContainText('as frases estão só neste computador');
    }
    const resposta = page.waitForResponse(r => r.url().includes('/ia/openai/sincronizar') && r.status() === 503);
    // Exceção de teste: chrome-nativo — simula a volta à aba, sem chamar funções do painel.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await (await resposta).finished();
    // O evento nativo foi simulado; aguarda a resposta e o próximo desenho, não chama sync por dentro.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(conta).toContainText('as frases estão só neste computador');
    await expect(conta).not.toContainText('Não deu para conferir a sincronização da chave da OpenAI.');
    await fotografar(conta, comChave ? 'conta-frases-e-chave-pendentes.png' : 'conta-frases-sem-chave.png');
    expect(await extensao.frases()).toEqual([frase]);
    expect(fakes.google.frasesDe(UID)).toEqual([]);
    expect(await chaveNoBancoDaExtensao(page)).toBe('');
    expect(fakes.anki.chaveNaConexao() === CHAVE).toBe(comChave);
    expect(fakes.google.chaveDaOpenAIDe(UID)).toBeNull();
  });
}

for (const falha of ['acesso recusado', 'token recusado', 'renovação recusada']) {
  for (const comChave of [false, true]) {
    test(`N3: ${falha} no sync da chave pede autenticação, não retry — ${comChave ? 'com chave' : 'sem chave'}`, async ({ page, extensao, fakes }) => {
      const frase = { id: 78, texto: 'This phrase is already in the cloud.', data: '09/10/2026', idioma: 'Inglês', streaming: 'web' };
      await extensao.semearSessao({ uid: UID });
      await extensao.gravarStorage({ frases: [frase], pm_migrated: UID });
      fakes.google.gravarFrases(UID, [frase]);
      // A sessão captura Date.now ao nascer; instala o relógio antes de abrir,
      // para avançar depois o mesmo relógio usado na verificação de validade.
      await page.clock.setFixedTime(new Date());
      await abrirPainel(page, extensao, '#configuracoes/ia');
      await expect(page.locator('#shell-chip')).toContainText('Sincronizado', { timeout: 45000 });
      if (comChave) {
        await colarEConferir(page);
        await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);
        await expect.poll(() => fakes.google.chaveDaOpenAIDe(UID)?.chave === CHAVE).toBe(true);
        await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
      }
      await page.locator('#shell-chip').click();
      if (falha === 'acesso recusado') fakes.google.recusarAcesso();
      else if (falha === 'token recusado') {
        fakes.anki.responderFirebase(401);
      } else {
        fakes.google.expirarSessao();
        await page.clock.setFixedTime(new Date(Date.now() + 2 * 60 * 60 * 1000));
      }
      // Exceção de teste: chrome-nativo — simula a volta à aba para tentar o sync novamente.
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      const conta = page.locator('#cfg-conta');
      await expect(conta).toContainText(falha === 'acesso recusado'
        ? 'A nuvem recusou o acesso. Saia da conta e entre de novo.'
        : 'Sua sessão expirou. Entre de novo para sincronizar.');
      await expect(conta).not.toContainText('Não deu para conferir a sincronização da chave da OpenAI.');
      await expect(conta.getByRole('button', { name: 'Tentar de novo' })).toHaveCount(0);
      if (comChave) await fotografar(conta, `conta-chave-${falha.replaceAll(' ', '-')}.png`);
      expect(await chaveNoBancoDaExtensao(page)).toBe('');
    expect(fakes.anki.chaveNaConexao() === CHAVE).toBe(comChave);
      expect(fakes.google.frasesDe(UID)).toEqual([frase]);
      expect(fakes.google.chaveDaOpenAIDe(UID)?.chave === CHAVE).toBe(comChave);
      expect(await extensao.frases()).toEqual([frase]);
    });
  }
}

test('R2: falha ao ler uma chave já na nuvem não diz que ela ainda não chegou', async ({ page, extensao, fakes }) => {
  const frase = { id: 79, texto: 'This phrase is already synchronized.', data: '09/10/2026', idioma: 'Inglês', streaming: 'web' };
  await extensao.semearSessao({ uid: UID });
  await extensao.gravarStorage({ frases: [frase], pm_migrated: UID });
  fakes.google.gravarFrases(UID, [frase]);
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);
  await expect.poll(() => fakes.google.chaveDaOpenAIDe(UID)?.chave === CHAVE).toBe(true);
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
  await page.locator('#shell-chip').click();
  fakes.anki.responderFirebase(503);
  // Exceção de teste: chrome-nativo — simula voltar à aba para tentar a leitura da nuvem.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const conta = page.locator('#cfg-conta');
  await expect(conta).toContainText('Não deu para conferir a sincronização da chave da OpenAI.');
  await expect(conta).not.toContainText('ainda não chegou');
  await expect(conta).not.toContainText('as frases estão só neste computador');
  await fotografar(conta, 'conta-chave-leitura-falhou.png');
  expect(fakes.google.chaveDaOpenAIDe(UID)?.chave === CHAVE).toBe(true);
  expect(fakes.google.frasesDe(UID)).toEqual([frase]);
  fakes.anki.responderFirebase(0);
  await conta.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  expect(fakes.anki.chaveNaConexao() === CHAVE).toBe(true);
  expect(fakes.google.chaveDaOpenAIDe(UID)?.chave === CHAVE).toBe(true);
  expect(await extensao.frases()).toEqual([frase]);
});

test('F1: só a chave falha no upload; a Conta não diz que frases já sincronizadas estão só aqui', async ({ page, extensao, fakes }) => {
  const frase = { id: 42, texto: 'The fake phrase is in the cloud.', data: '09/10/2026', idioma: 'Inglês', streaming: 'web' };
  await extensao.semearSessao({ uid: UID });
  await extensao.gravarStorage({ frases: [frase], pm_migrated: UID });
  fakes.google.gravarFrases(UID, [frase]);
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado', { timeout: 45000 });
  fakes.google.recusarEscritas();
  await colarEConferir(page);
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);
  await page.locator('#shell-chip').click();
  const conta = page.locator('#cfg-conta');
  await expect(conta).toContainText('Não deu para conferir a sincronização da chave da OpenAI.');
  await expect(conta).not.toContainText('as frases estão só neste computador');
  await conta.getByText('Detalhes').click();
  await expect(conta).toContainText('OpenAI sync');
  await fotografar(conta, 'conta-chave-pendente.png');
  expect(fakes.google.frasesDe(UID)).toEqual([frase]);
  fakes.google.recusarEscritas(false);
  await conta.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
  expect(fakes.google.chaveDaOpenAIDe(UID)?.chave === CHAVE).toBe(true);
  expect(fakes.google.frasesDe(UID)).toEqual([frase]);
});

test('S1: falha ao sincronizar apagamento permanece na Conta e Tentar de novo envia o valor vazio', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: UID });
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect.poll(() => Boolean(fakes.google.chaveDaOpenAIDe(UID))).toBe(true);
  fakes.google.recusarEscritas();
  await card(page).getByRole('button', { name: 'Apagar chave' }).click();
  await modal(page).getByRole('button', { name: 'Apagar chave' }).click();
  await expect(card(page).locator('.cfg-resumo')).toHaveText('Sem chave');
  await page.reload();
  await expect(page.locator('#shell-chip')).toContainText('Sem sincronizar', { timeout: 45000 });
  await page.locator('#shell-chip').click();
  await expect(page.locator('#cfg-conta').getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  fakes.google.recusarEscritas(false);
  await page.locator('#cfg-conta').getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
  expect(fakes.google.chaveDaOpenAIDe(UID)?.chave).toBe('');
  expect(fakes.anki.chaveNaConexao()).toBeNull();
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
});


const chaveDeOutroComputador = (fakes, chave, atrasMs = 0) => fakes.google.gravarChaveDaOpenAI(UID, { chave, em: Date.now() + atrasMs });

test('PATCH recusado: a chave colada em A nunca sobe para B e a nota não promete sync com B', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: UID });
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
  fakes.google.recusarEscritas();
  await colarEConferir(page);
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);
  await expect.poll(() => fakes.google.requisicoes.filter(r => r.metodo === 'PATCH' && r.url.includes('/segredos/')).length).toBeGreaterThan(0);
  // A recusa terminou antes de trocar o UID; não deixa outro retry de A em voo.
  await expect(page.locator('#shell-chip')).toContainText('Sem sincronizar');
  expect(fakes.anki.estadoDaChave().naoEnviada).toBe(true);
  fakes.google.recusarEscritas(false);
  await extensao.semearSessao({ uid: 'uid-B' });
  await page.reload();
  await expect(page.locator('#shell-chip')).toContainText('Sem sincronizar');
  expect(fakes.google.chaveDaOpenAIDe('uid-B')).toBeNull();
  expect(fakes.anki.chaveNaConexao() === CHAVE).toBe(true);
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  await expect(corpo(page)).not.toContainText('Vai junto com a sua conta Google');
  await fotografar(page, 'ia-outra-conta.png');
});

test('trocar para B com chave mais antiga entrega a chave de B, sem reutilizar a versão HTTP de A', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: UID });
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect.poll(() => Boolean(fakes.google.chaveDaOpenAIDe(UID))).toBe(true);
  fakes.google.gravarChaveDaOpenAI('uid-B-antiga', { chave: OUTRA_CHAVE, em: Date.now() - 60000 });
  await extensao.semearSessao({ uid: 'uid-B-antiga' });
  await page.reload();
  await expect(card(page).locator('.cfg-resumo')).toHaveText('••••••••wxyz');
  await expect(corpo(page)).toContainText('A Conexão com o Anki guarda a chave.');
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  expect(fakes.anki.chaveNaConexao() === OUTRA_CHAVE).toBe(true);
});

test('a chave de uma conta Google não sobe para outra conta que entra no mesmo computador', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: UID });
  chaveDeOutroComputador(fakes, OUTRA_CHAVE, 60_000);
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await expect(card(page).locator('.cfg-resumo')).toHaveText('••••••••wxyz');

  // A pessoa sai e entra com outra conta, que nunca teve chave.
  await extensao.semearSessao({ uid: 'uid-de-outra-pessoa', email: 'outra@teste.dev', displayName: 'Outra Pessoa' });
  await page.reload();
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
  // O sync da chave roda ao abrir o painel; a volta à aba (visibilitychange) o roda de novo, e ele termina antes da leitura.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => fakes.google.requisicoes.filter(r => r.url.includes('uid-de-outra-pessoa/segredos')).length).toBeGreaterThan(1);

  expect(fakes.google.chaveDaOpenAIDe('uid-de-outra-pessoa')).toBeNull();
  expect(fakes.google.chaveDaOpenAIDe(UID).chave).toBe(OUTRA_CHAVE);
});

async function falharBanco(page) {
  await page.evaluate(() => {
    window.abrirBancoAntesDoTeste = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      if (args[0] === 'pm-segredos') throw new DOMException('storage_unavailable', 'StorageUnavailable');
      return window.abrirBancoAntesDoTeste(...args);
    };
  });
}
async function restaurarBanco(page) {
  await page.evaluate(() => { indexedDB.open = window.abrirBancoAntesDoTeste; });
}

test('S4: apagamento aceito com falha no cache mostra resultado incerto, Detalhes e repetição', async ({ page, extensao, fakes }) => {
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);
  await expect(campo(page)).toHaveCount(0);
  // Exceção de teste: chrome-nativo — falha só a escrita do cache público,
  // não o cofre legado que já foi removido nem uma função interna do produto.
  await page.evaluate(() => {
    window.gravarAntesDoTeste = chrome.storage.local.set.bind(chrome.storage.local);
    chrome.storage.local.set = valores => {
      if ('pm_chave_openai' in valores) throw new DOMException('cache_unavailable', 'StorageUnavailable');
      return window.gravarAntesDoTeste(valores);
    };
  });
  await card(page).getByRole('button', { name: 'Apagar chave' }).click();
  await modal(page).getByRole('button', { name: 'Apagar chave' }).click();
  await expect(erro(page)).toContainText('Não deu para confirmar o apagamento da chave neste computador.');
  await erro(page).getByText('Detalhes').click();
  await expect(erro(page)).toContainText('StorageUnavailable');
  await fotografar(card(page), 'ia-apagar-falhou.png');
  expect(fakes.anki.chaveNaConexao()).toBeNull(); // não repõe o segredo a partir do cache
  await expect(card(page)).not.toContainText('A Conexão com o Anki guarda a chave.');
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai.ultimos4).toBe('9f3a');
  // Exceção de teste: chrome-nativo — restaura a API de armazenamento na fronteira.
  await page.evaluate(() => { chrome.storage.local.set = window.gravarAntesDoTeste; });
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  await erro(page).getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(card(page).locator('.cfg-resumo')).toHaveText('Sem chave');
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  await expect.poll(() => fakes.anki.chaveNaConexao() === null).toBe(true);
});

test('S4: Apagar tudo comunica resultado parcial se o cofre local falha', async ({ page, extensao, fakes, context }) => {
  let liberar;
  const resposta = new Promise(resolve => { liberar = resolve; });
  await context.route('**/ia/openai/chave', async route => { await resposta; await route.fallback(); });
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  // goto below changes only the hash, not the document. Without this completion
  // barrier, the DB fault hits the PREVIOUS save continuation, not Apagar tudo.
  liberar();
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);
  await expect(campo(page)).toHaveCount(0);
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  await extensao.gravarStorage({ frases: [{ id: 1, texto: 'fake phrase', data: '01/01/2026', idioma: 'Inglês', streaming: 'web' }] });
  await page.goto(extensao.url('painel.html#configuracoes/perigo'));
  await falharBanco(page);
  await page.locator('#btn-apagar-tudo').click();
  await modal(page).locator('.veio-botao--perigo-cheio').click();
  await expect(page.getByRole('alert')).toContainText('As frases foram apagadas, mas não deu para conferir o apagamento da chave da OpenAI.');
  await fotografar(page.locator('#cfg-perigo'), 'ia-apagar-tudo-parcial.png');
  await restaurarBanco(page);
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  expect(await extensao.frases()).toEqual([]);
  await page.getByRole('alert').getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  expect(fakes.anki.chaveNaConexao()).toBeNull();
});
