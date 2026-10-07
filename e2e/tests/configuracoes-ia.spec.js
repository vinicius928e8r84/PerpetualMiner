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
  await expect(corpo(page)).toContainText('Fica neste computador: na extensão e numa cópia da Conexão com o Anki.');
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
  fakes.anki.responder('POST', '/ia/openai/chave', () => new Promise(resolver => {
    liberar = () => resolver({ status: 200, json: { ok: true, ultimos4: '9f3a' } });
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

test('o content script e o overlay não alcançam a chave: ela não está no storage que eles leem nem no banco que eles abrem', async ({ page, extensao, context, paginas }) => {
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await colarEConferir(page);
  await expect(card(page).locator('.cfg-resumo')).toHaveText(MASCARADA);

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
    }))()`,
  });

  expect(result.value.storage).toContain('pm_chave_openai');
  expect(result.value.storage).not.toContain('sk-proj-chave-de-exemplo');
  expect(result.value.bancos).not.toContain('pm-segredos');
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
