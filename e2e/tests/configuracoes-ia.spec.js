'use strict';

// O card IA dos cartões de Configurações (#140, docs/design/painel/configuracoes/): as duas entradas em
// colunas do mesmo tamanho, a coluna da Chave da OpenAI funcionando e a do ChatGPT ainda sem login.
//
// A pessoa cola a chave; a Conexão com o Anki (o fake do e2e, que fala o contrato de
// complemento/contrato/exemplos.json) a confere na OpenAI e guarda a cópia dela; a tela mostra a chave
// mascarada. O que fica guardado: a chave inteira só no IndexedDB da extensão e na cópia da Conexão, e no
// `chrome.storage.local` só os 4 últimos caracteres.
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

/** A chave inteira como o IndexedDB da extensão a guarda ('' sem chave). */
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

  expect(await extensao.lerStorage('pm_chave_openai')).toEqual({});
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
  await expect(corpo(page)).toContainText('Fica neste computador, na extensão e numa cópia da Conexão com o Anki. Com a conta Google, ela vai junto para os seus outros computadores.');
  await expect(corpo(page)).not.toContainText('vai junto com a sua conta Google');
  await expect(corpo(page)).toContainText('A Conexão com o Anki tem uma cópia da chave.');
  await expect(campo(page)).toHaveCount(0);
  await expect(page.getByText(CHAVE)).toHaveCount(0);
  await expect(page.getByText('sk-proj-chave-de-exemplo')).toHaveCount(0);

  // O que atravessou: a chave foi ao complemento, que a guarda (o fake faz como ele).
  expect(fakes.anki.chaveNaConexao()).toBe(CHAVE);
  // O que ficou: a chave inteira só no banco da extensão; no storage, só o fim dela.
  expect(await chaveNoBancoDaExtensao(page)).toBe(CHAVE);
  expect(await extensao.lerStorage('pm_chave_openai')).toEqual({ pm_chave_openai: { ultimos4: '9f3a' } });
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
  expect(await extensao.lerStorage('pm_chave_openai')).toEqual({});
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
  expect(await chaveNoBancoDaExtensao(page)).toBe(CHAVE);
  expect(await extensao.lerStorage('pm_chave_openai')).toEqual({ pm_chave_openai: { ultimos4: '9f3a' } });
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
    expect(await extensao.lerStorage('pm_chave_openai')).toEqual({});
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
  expect(await extensao.lerStorage('pm_chave_openai')).toEqual({});
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
  expect(await extensao.lerStorage('pm_chave_openai')).toEqual({});

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
  expect(await chaveNoBancoDaExtensao(page)).toBe(CHAVE);
  expect(await extensao.lerStorage('pm_chave_openai')).toEqual({ pm_chave_openai: { ultimos4: '9f3a' } });
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);
});

test('a chave guardada na extensão volta à Conexão que ficou sem a cópia', async ({ page, extensao, fakes }) => {
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);

  // O Anki foi reinstalado: a Conexão voltou sem nenhuma chave.
  fakes.anki.esquecerAChave();
  await page.reload();

  await expect(corpo(page)).toContainText('A Conexão com o Anki tem uma cópia da chave.');
  expect(fakes.anki.chaveNaConexao()).toBe(CHAVE);
});

test('se a Conexão sem a cópia recusa a chave, o card diz que ela ainda não tem a cópia', async ({ page, extensao, fakes }) => {
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);

  fakes.anki.esquecerAChave();
  fakes.anki.responderOpenAI('sem_credito');
  await page.reload();

  await expect(corpo(page)).toContainText('A Conexão com o Anki ainda não tem a cópia da chave. Ela a recebe quando responder.');
  expect(fakes.anki.chaveNaConexao()).toBeNull();
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
  expect(await chaveNoBancoDaExtensao(page)).toBe(CHAVE);
  expect(await extensao.lerStorage('pm_chave_openai')).toEqual({ pm_chave_openai: { ultimos4: '9f3a' } });
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
  expect(result.value.temToken).toBe(false);
  expect(await extensao.lerStorage('pm_firebase_auth')).toEqual({});
  expect(fakes.google.chaveDaOpenAIDe('uid-isolamento').chave === CHAVE).toBe(true);
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
  expect(await chaveNoBancoDaExtensao(page)).toBe(OUTRA_CHAVE);
  expect(fakes.anki.chaveNaConexao()).toBe(OUTRA_CHAVE);
  expect(await extensao.lerStorage('pm_chave_openai')).toEqual({ pm_chave_openai: { ultimos4: 'wxyz' } });
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

  expect(await chaveNoBancoDaExtensao(page)).toBe(TERCEIRA_CHAVE);
  expect(fakes.anki.chaveNaConexao()).toBe(TERCEIRA_CHAVE);
  expect(await extensao.lerStorage('pm_chave_openai')).toEqual({ pm_chave_openai: { ultimos4: 'mnop' } });
});

test('com a Conexão desligada depois de conferir, o card deixa de dizer que ela tem a cópia, sem recarregar', async ({ page, extensao, fakes }) => {
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect(corpo(page)).toContainText('A Conexão com o Anki tem uma cópia da chave.');

  fakes.anki.desligar();

  // A Conexão é conferida a cada 15 s.
  await expect(corpo(page)).not.toContainText('cópia da chave', { timeout: 25_000 });
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);

  // Desligar a Conexão não mexe no que está guardado: a mesma chave, e nenhuma chave inteira no storage.
  expect(await chaveNoBancoDaExtensao(page)).toBe(CHAVE);
  expect(await extensao.lerStorage('pm_chave_openai')).toEqual({ pm_chave_openai: { ultimos4: '9f3a' } });
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
// A chave vive em três lugares: na nuvem da conta (o Firestore falso, `usuarios/{uid}/segredos/openai`), na
// extensão (o IndexedDB) e na cópia da Conexão de cada computador. Trocar, Apagar e Apagar tudo limpam os três
// e deixam o tombstone na nuvem, para a cópia velha não voltar. As chaves são de mentira.

const UID = 'uid-da-chave';
const modal = page => page.getByRole('dialog');

/** Outro computador da conta já deixou esta chave na nuvem, `atrasMs` atrás. */
const chaveDeOutroComputador = (fakes, chave, atrasMs = 0) =>
  fakes.google.gravarChaveDaOpenAI(UID, { chave, em: Date.now() - atrasMs });

test('com conta, colar a chave a leva à nuvem da conta, e o card diz que ela vai junto com a conta Google', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: UID });
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');

  await colarEConferir(page);

  await expect(corpo(page)).toContainText('Vai junto com a sua conta Google: chega sozinha aos seus outros computadores, na extensão e numa cópia da Conexão com o Anki de cada um.');
  await expect(corpo(page)).not.toContainText('Fica neste computador');
  await expect.poll(() => fakes.google.chaveDaOpenAIDe(UID)?.chave).toBe(CHAVE);
  expect(fakes.google.chaveDaOpenAIDe(UID)).toEqual({ chave: CHAVE, em: expect.any(Number) });
  expect(fakes.anki.chaveNaConexao()).toBe(CHAVE);
  expect(await chaveNoBancoDaExtensao(page)).toBe(CHAVE);
});

test('a chave colada em outro computador da conta chega sozinha: na extensão e na cópia da Conexão daqui', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: UID });
  chaveDeOutroComputador(fakes, OUTRA_CHAVE, 60_000);

  await abrirPainel(page, extensao, '#configuracoes/ia');

  await expect(card(page).locator('.cfg-resumo')).toHaveText('••••••••wxyz');
  await expect(corpo(page).getByText('Chave conferida', { exact: true })).toBeVisible();
  await expect(corpo(page)).toContainText('A Conexão com o Anki tem uma cópia da chave.');
  await expect(page.getByText(OUTRA_CHAVE)).toHaveCount(0);
  expect(fakes.anki.chaveNaConexao()).toBe(OUTRA_CHAVE);
  expect(await chaveNoBancoDaExtensao(page)).toBe(OUTRA_CHAVE);
  expect(await extensao.lerStorage('pm_chave_openai')).toEqual({ pm_chave_openai: { ultimos4: 'wxyz' } });
  expect(JSON.stringify(await extensao.lerStorage(null))).not.toContain(OUTRA_CHAVE);
  expect(fakes.google.chaveDaOpenAIDe(UID).chave).toBe(OUTRA_CHAVE);
});

test('P4: uma chave remota com o mesmo final troca a cópia da Conexão por versão', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: UID });
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect.poll(() => Boolean(fakes.google.chaveDaOpenAIDe(UID))).toBe(true);
  const outra = 'sk-fake-outra-versao-9f3a';
  chaveDeOutroComputador(fakes, outra, -1000);
  await page.reload();
  await expect(corpo(page)).toContainText('A Conexão com o Anki tem uma cópia da chave.');
  await expect.poll(() => fakes.anki.chaveNaConexao() === outra).toBe(true);
  expect((await chaveNoBancoDaExtensao(page)) === outra).toBe(true);
});

test('S3: chegada remota invalida a confirmação anterior da cópia antes de conferir', async ({ page, extensao, fakes, context }) => {
  await extensao.semearSessao({ uid: UID });
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect(corpo(page)).toContainText('A Conexão com o Anki tem uma cópia da chave.');
  await expect.poll(() => Boolean(fakes.google.chaveDaOpenAIDe(UID))).toBe(true);
  const liberadores = [];
  let recusar = false;
  const recusada = { status: 401, json: { error: 'openai_key_rejected' } };
  fakes.anki.responder('POST', '/ia/openai/chave', () => recusar ? recusada : new Promise(resolve => {
    liberadores.push(() => resolve(recusada));
  }));
  chaveDeOutroComputador(fakes, OUTRA_CHAVE, -1000);
  const outraAba = await context.newPage();
  await outraAba.goto(extensao.url('painel.html#configuracoes/ia'));
  await page.bringToFront();
  await expect(card(page).locator('.cfg-resumo')).toHaveText('••••••••wxyz');
  await expect(corpo(page)).not.toContainText('A Conexão com o Anki tem uma cópia da chave.');
  recusar = true;
  for (const liberar of liberadores) liberar();
  await expect(corpo(page)).toContainText('A Conexão com o Anki ainda não tem a cópia');
  expect(fakes.anki.chaveNaConexao() === CHAVE).toBe(true);
  expect((await chaveNoBancoDaExtensao(page)) === OUTRA_CHAVE).toBe(true);
});

test('com conta, Trocar chave troca nos três lugares: a velha sai da nuvem, da extensão e da Conexão', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: UID });
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect.poll(() => fakes.google.chaveDaOpenAIDe(UID)?.chave).toBe(CHAVE);

  await card(page).getByRole('button', { name: 'Trocar chave' }).click();
  await colarEConferir(page, OUTRA_CHAVE);

  await expect(card(page).locator('.cfg-resumo')).toHaveText('••••••••wxyz');
  await expect.poll(() => fakes.google.chaveDaOpenAIDe(UID)?.chave).toBe(OUTRA_CHAVE);
  expect(fakes.anki.chaveNaConexao()).toBe(OUTRA_CHAVE);
  expect(await chaveNoBancoDaExtensao(page)).toBe(OUTRA_CHAVE);
});

test('com conta, Apagar chave pede confirmação e tira a chave dos três lugares, deixando o tombstone na nuvem', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: UID });
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect.poll(() => fakes.google.chaveDaOpenAIDe(UID)?.chave).toBe(CHAVE);

  await card(page).getByRole('button', { name: 'Apagar chave' }).click();
  await expect(modal(page)).toHaveAccessibleName('Apagar a chave da OpenAI?');
  await expect(modal(page)).toContainText('Ela sai da extensão, da Conexão com o Anki e da sua conta Google, em todos os seus computadores. Para desligar de verdade, revogue a chave na OpenAI.');
  await expect(modal(page).getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await modal(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(modal(page)).toHaveCount(0);
  expect(await chaveNoBancoDaExtensao(page)).toBe(CHAVE);

  await card(page).getByRole('button', { name: 'Apagar chave' }).click();
  await modal(page).getByRole('button', { name: 'Apagar chave' }).click();

  await expect(page.locator('.veio-toast', { hasText: 'Chave da OpenAI apagada' })).toBeVisible();
  await expect(card(page).locator('.cfg-resumo')).toHaveText('Sem chave');
  await expect(campo(page)).toHaveValue('');
  await expect.poll(() => fakes.google.chaveDaOpenAIDe(UID)).toEqual({ apagada: true, em: expect.any(Number) });
  expect(fakes.anki.chaveNaConexao()).toBeNull();
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  expect(await extensao.lerStorage('pm_chave_openai')).toEqual({});
});

test('sem conta, Apagar chave tira a chave da extensão e da Conexão, e nada vai à nuvem', async ({ page, extensao, fakes }) => {
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);

  await card(page).getByRole('button', { name: 'Apagar chave' }).click();
  await expect(modal(page)).toContainText('Ela sai da extensão e da Conexão com o Anki deste computador. Para desligar de verdade, revogue a chave na OpenAI.');
  await modal(page).getByRole('button', { name: 'Apagar chave' }).click();

  await expect(card(page).locator('.cfg-resumo')).toHaveText('Sem chave');
  await expect.poll(() => fakes.anki.chaveNaConexao()).toBeNull();
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  expect(await extensao.lerStorage('pm_chave_openai')).toEqual({});
  expect(fakes.google.requisicoes.filter(r => r.url.includes('segredos'))).toEqual([]);
});

test('apagada com a Conexão desligada, a cópia dela sai quando ela volta a responder', async ({ page, extensao, fakes }) => {
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);
  fakes.anki.desligar();

  await card(page).getByRole('button', { name: 'Apagar chave' }).click();
  await modal(page).getByRole('button', { name: 'Apagar chave' }).click();
  await expect(card(page).locator('.cfg-resumo')).toHaveText('Sem chave');
  expect(fakes.anki.chaveNaConexao()).toBe(CHAVE);

  fakes.anki.ligar();
  await page.reload();

  await expect.poll(() => fakes.anki.chaveNaConexao()).toBeNull();
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
});

test('a chave apagada em outro computador da conta sai daqui também, e a cópia velha não volta à nuvem', async ({ page, extensao, fakes }) => {
  // Este computador tinha a chave (colada antes de entrar na conta); outro computador a apagou depois.
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);
  fakes.google.gravarChaveDaOpenAI(UID, { apagada: true, em: Date.now() + 1000 });
  await extensao.semearSessao({ uid: UID });

  await page.reload();

  await expect(card(page).locator('.cfg-resumo')).toHaveText('Sem chave');
  await expect.poll(() => fakes.anki.chaveNaConexao()).toBeNull();
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  expect(await extensao.lerStorage('pm_chave_openai')).toEqual({});
  expect(fakes.google.chaveDaOpenAIDe(UID)).toEqual({ apagada: true, em: expect.any(Number) });
});

test('S1: falha ao sincronizar apagamento permanece na Conta e Tentar de novo envia o tombstone', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: UID });
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect.poll(() => Boolean(fakes.google.chaveDaOpenAIDe(UID))).toBe(true);
  fakes.google.recusarEscritas();
  await card(page).getByRole('button', { name: 'Apagar chave' }).click();
  await modal(page).getByRole('button', { name: 'Apagar chave' }).click();
  await expect(card(page).locator('.cfg-resumo')).toHaveText('Sem chave');
  await page.reload();
  await expect(page.locator('#shell-chip')).toContainText('Sem sincronizar');
  await page.locator('#shell-chip').click();
  await expect(page.locator('#cfg-conta').getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  fakes.google.recusarEscritas(false);
  await page.locator('#cfg-conta').getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
  expect(fakes.google.chaveDaOpenAIDe(UID)?.apagada).toBe(true);
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
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

test('S4: apagar chave com falha local mostra aviso persistente, Detalhes e repetição', async ({ page, extensao, fakes }) => {
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);
  await falharBanco(page);
  await card(page).getByRole('button', { name: 'Apagar chave' }).click();
  await modal(page).getByRole('button', { name: 'Apagar chave' }).click();
  await expect(erro(page)).toContainText('Não deu para apagar a chave neste computador.');
  await erro(page).getByText('Detalhes').click();
  await expect(erro(page)).toContainText('StorageUnavailable');
  await fotografar(card(page), 'ia-apagar-falhou.png');
  await restaurarBanco(page);
  expect((await chaveNoBancoDaExtensao(page)) === CHAVE).toBe(true);
  await erro(page).getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(card(page).locator('.cfg-resumo')).toHaveText('Sem chave');
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  await expect.poll(() => fakes.anki.chaveNaConexao() === null).toBe(true);
});

test('S4: Apagar tudo comunica resultado parcial se o cofre local falha', async ({ page, extensao, fakes }) => {
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await extensao.gravarStorage({ frases: [{ id: 1, texto: 'fake phrase', data: '01/01/2026', idioma: 'Inglês', streaming: 'web' }] });
  await page.goto(extensao.url('painel.html#configuracoes/perigo'));
  await falharBanco(page);
  await page.locator('#btn-apagar-tudo').click();
  await modal(page).locator('.veio-botao--perigo-cheio').click();
  await expect(page.getByRole('alert')).toContainText('As frases foram apagadas, mas a chave da OpenAI continua neste computador.');
  await fotografar(page.locator('#cfg-perigo'), 'ia-apagar-tudo-parcial.png');
  await restaurarBanco(page);
  expect((await chaveNoBancoDaExtensao(page)) === CHAVE).toBe(true);
  expect(await extensao.frases()).toEqual([]);
  await page.getByRole('alert').getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await chaveNoBancoDaExtensao(page)).toBe('');
  expect(fakes.anki.chaveNaConexao()).toBeNull();
});

test('PATCH recusado: a chave colada em A nunca sobe para B e a nota não promete sync com B', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: UID });
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
  fakes.google.recusarEscritas();
  await colarEConferir(page);
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);
  await expect.poll(() => fakes.google.requisicoes.filter(r => r.metodo === 'PATCH' && r.url.includes('/segredos/')).length).toBeGreaterThan(0);
  fakes.google.recusarEscritas(false);
  await extensao.semearSessao({ uid: 'uid-B' });
  await page.reload();
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
  expect(fakes.google.chaveDaOpenAIDe('uid-B')).toBeNull();
  expect(await chaveNoBancoDaExtensao(page)).toBe(CHAVE);
  await expect(corpo(page)).not.toContainText('Vai junto com a sua conta Google');
  await fotografar(page, 'ia-outra-conta.png');
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
