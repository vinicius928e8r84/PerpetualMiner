'use strict';

// Popup · Cockpit (#38): o popup refeito na Veio, variante A do protótipo
// travado (docs/design/popup/prototipo-popup.html?variant=A).
//
// O popup abre aqui como aba (`popup.html`), a página do balão do ícone.
// Os testes afirmam o que se vê e o que fica gravado.

const { test, expect } = require('../fixtures');
const DEN = 'PerpetualMiner::Inglês', DRU = 'PerpetualMiner::Russo';
const { fotografar, registrarEstado } = require('../evidencias-mineracao');
const { leituraDoVocabulario: leitura } = require('../leitura-do-vocabulario');

const HOJE = new Date().toLocaleDateString('pt-BR');

const frase = (id, texto, extras = {}) => ({
  id, texto, data: HOJE, streaming: 'netflix', idioma: 'Inglês',
  contexto: { fonte: 'netflix', titulo: 'The Bear', detalhe: 'T2 · E7' }, ...extras,
});

const SETE_FRASES = [
  frase(7, 'I’m not saying it’s your fault, I’m saying it’s your responsibility.', { keywords: ['responsibility@9'] }),
  frase(6, 'Мы с тобой одной крови — ты и я.', { idioma: 'Russo', streaming: 'livro', keywords: ['крови@4'], contexto: { fonte: 'livro', titulo: 'Маугли', detalhe: 'cap. 3' } }),
  frase(5, 'The devil is in the details.', { streaming: 'web', contexto: { fonte: 'web', titulo: 'The Atlantic', detalhe: '' } }),
  frase(4, 'We were on a break!'),
  frase(3, 'Let’s call it a day.', { streaming: 'youtube', contexto: { fonte: 'youtube', titulo: 'Veritasium', detalhe: '' } }),
  frase(2, 'Keep me posted.'),
  frase(1, 'That ship has sailed.'),
];

const ALT_S = { type: 'keyboard', code: 'KeyS', altKey: true, ctrlKey: false, shiftKey: false, label: 'Alt+S' };
const CTRL_SHIFT_L = { type: 'keyboard', code: 'KeyL', altKey: false, ctrlKey: true, shiftKey: true, label: 'Ctrl+Shift+L' };

const ultimas = page => page.locator('#ultimas li');
const campoRapido = page => page.getByRole('textbox', { name: 'Cole ou escreva uma frase' });

async function semearMineracaoAutomatica(extensao, { en, ru }) {
  const hoje = new Date();
  const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  await extensao.gravarStorage({
    pm_auto_miner_settings: {
      en: { enabled: en.ligado, dailyLimit: en.limite },
      ru: { enabled: ru.ligado, dailyLimit: ru.limite },
    },
    pm_auto_miner_daily: { date: dia, en: { count: en.hoje }, ru: { count: ru.hoje } },
  });
}

/** A aba que o Chrome diz estar ativa, como o service worker a vê. */
async function abaAtiva(extensao) {
  return extensao.serviceWorker.evaluate(async () => {
    const [aba] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return aba?.url || '';
  });
}

const abasDoPainel = (context, extensao) =>
  context.pages().filter(p => p.url().startsWith(extensao.url('painel.html')));

test('com o painel já aberto, Abrir painel foca a aba existente, sem abrir outra nem mudar o endereço', async ({ page, context, extensao }) => {
  const painel = await context.newPage();
  await painel.goto(extensao.url('painel.html#configuracoes'));
  await page.bringToFront();
  await page.goto(extensao.url('popup.html'));
  await expect.poll(() => abaAtiva(extensao)).toContain('popup.html');

  await page.getByRole('button', { name: 'Abrir painel' }).click();

  await expect.poll(() => abaAtiva(extensao)).toBe(extensao.url('painel.html#configuracoes'));
  expect(abasDoPainel(context, extensao)).toHaveLength(1);
});

test('sem painel aberto, Abrir painel abre uma aba nova do painel', async ({ page, context, extensao }) => {
  await page.goto(extensao.url('popup.html'));

  const nova = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Abrir painel' }).click();
  await (await nova).waitForLoadState();

  expect(abasDoPainel(context, extensao)).toHaveLength(1);
  await expect.poll(() => abaAtiva(extensao)).toContain('painel.html');
});

test('Ver todas leva a aba do painel já aberta para Frases', async ({ page, context, extensao }) => {
  await extensao.gravarStorage({ frases: SETE_FRASES });
  const painel = await context.newPage();
  await painel.goto(extensao.url('painel.html#configuracoes'));
  await page.bringToFront();
  await page.goto(extensao.url('popup.html'));

  await page.getByRole('button', { name: 'Ver todas' }).click();

  await expect.poll(() => abaAtiva(extensao)).toBe(extensao.url('painel.html#frases'));
  await expect(painel.locator('#frases-lista .veio-frase').first()).toBeVisible();
  expect(abasDoPainel(context, extensao)).toHaveLength(1);
});

test('mineração rápida: Minerar só com texto; Enter minera, o campo limpa e a frase entra no topo, sem toast', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: SETE_FRASES });
  await page.goto(extensao.url('popup.html'));
  await expect(ultimas(page)).toHaveCount(5);

  const minerar = page.getByRole('button', { name: 'Minerar', exact: true });
  await expect(minerar).toBeDisabled();
  await campoRapido(page).fill('   ');
  await expect(minerar).toBeDisabled();

  // Shift+Enter quebra a linha, não minera.
  await campoRapido(page).fill('Break a leg');
  await campoRapido(page).press('Shift+Enter');
  await expect(campoRapido(page)).toHaveValue('Break a leg\n');
  await expect(minerar).toBeEnabled();
  await campoRapido(page).press('Enter');

  await expect(campoRapido(page)).toHaveValue('');
  await expect(minerar).toBeDisabled();
  await expect(ultimas(page)).toHaveCount(5);
  await expect(ultimas(page).first()).toContainText('Break a leg');
  await expect(ultimas(page).first()).toContainText('Manual · hoje');
  await expect(page.locator('.veio-toast')).toHaveCount(0);
  await expect(page.locator('#erro-rapida')).toBeEmpty();

  const [gravada] = await extensao.frases();
  expect(gravada).toMatchObject({ texto: 'Break a leg', streaming: 'manual', idioma: 'Inglês', contexto: { fonte: 'manual', titulo: '', detalhe: '' } });
  await fotografar(page.locator('body'), 'c1-popup-minerada.png');
  await registrarEstado(extensao, 'c1-popup-minerada.json');
});

test('mineração rápida em russo grava o idioma pelo detector único', async ({ page, extensao }) => {
  await page.goto(extensao.url('popup.html'));
  await campoRapido(page).fill('Тише едешь — дальше будешь.');
  await page.getByRole('button', { name: 'Minerar', exact: true }).click();

  await expect(campoRapido(page)).toHaveValue('');
  expect((await extensao.frases())[0]).toMatchObject({ idioma: 'Russo' });
});

test('mineração rápida com o service worker falhando: POP-06 com o alerta, sem Detalhes, e o texto continua no campo', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: SETE_FRASES });
  await page.goto(extensao.url('popup.html'));
  await expect(ultimas(page)).toHaveCount(5);

  // O disco recusa a gravação. Nenhuma rota HTTP chega a esta falha: o
  // teste troca o `chrome.storage.local.set` do service worker, que é a
  // fronteira de armazenamento dele, e afirma o que a pessoa vê e o que
  // fica gravado, como veria com o perfil cheio ou corrompido.
  await extensao.serviceWorker.evaluate(() => {
    globalThis.gravarDeVerdade = chrome.storage.local.set.bind(chrome.storage.local);
    chrome.storage.local.set = () => { throw new Error('QUOTA_BYTES quota exceeded'); };
  });

  await campoRapido(page).fill('Break a leg');
  await campoRapido(page).press('Enter');

  const erro = page.getByRole('alert');
  await expect(erro).toContainText('Não deu para minerar a frase. Tente de novo.');
  await expect(erro.locator('svg')).toHaveCount(1);
  await expect(erro).not.toContainText('Detalhes');
  await expect(erro).not.toContainText('QUOTA_BYTES');
  await expect(campoRapido(page)).toHaveValue('Break a leg');
  await expect(campoRapido(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(ultimas(page).first()).not.toContainText('Break a leg');
  expect((await extensao.frases()).map(f => f.texto)).not.toContain('Break a leg');

  // O disco volta: tentar de novo com o mesmo texto minera, e o erro sai.
  await extensao.serviceWorker.evaluate(() => { chrome.storage.local.set = globalThis.gravarDeVerdade; });
  await page.getByRole('button', { name: 'Minerar', exact: true }).click();
  await expect(campoRapido(page)).toHaveValue('');
  await expect(page.locator('#erro-rapida')).toBeEmpty();
  await expect(campoRapido(page)).not.toHaveAttribute('aria-invalid', 'true');
  await expect(ultimas(page).first()).toContainText('Break a leg');
});

test('as 5 últimas, só leitura: a Palavra grifada e o Contexto; sem checkbox, Deletar, ↻ nem Tudo', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: SETE_FRASES });
  await page.goto(extensao.url('popup.html'));

  await expect(ultimas(page)).toHaveCount(5);
  await expect(ultimas(page).nth(0).locator('mark')).toHaveText('responsibility');
  await expect(ultimas(page).nth(0)).toContainText('Netflix · The Bear · T2 · E7 · hoje');
  await expect(ultimas(page).nth(1).locator('mark')).toHaveText('крови');
  await expect(ultimas(page).nth(1)).toContainText('Livro · Маугли · cap. 3 · hoje');
  await expect(ultimas(page).nth(2)).toContainText('Web · The Atlantic · hoje');
  await expect(page.getByText('Keep me posted.')).toHaveCount(0);

  await expect(page.locator('#ultimas').locator('input, button')).toHaveCount(0);
  for (const nome of ['Deletar', 'Tudo', '↻', 'Adicionar']) {
    await expect(page.getByRole('button', { name: nome })).toHaveCount(0);
  }
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  // O gravador de atalho saiu para Configurações › Atalhos.
  await expect(page.getByText('Clique aqui para gravar atalho')).toHaveCount(0);
});

test('a frase minerada em outra aba aparece no topo na hora', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: SETE_FRASES });
  await page.goto(extensao.url('popup.html'));
  await expect(ultimas(page)).toHaveCount(5);

  await extensao.gravarStorage({ frases: [frase(8, 'Hold your horses.'), ...SETE_FRASES] });

  await expect(ultimas(page).first()).toContainText('Hold your horses.');
  await expect(ultimas(page)).toHaveCount(5);
});

test('carregando (POP-01): só esqueleto, sem texto', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: SETE_FRASES });
  // Segura a leitura das frases, como um disco lento. Como na falha de
  // gravação acima, o falso fica na fronteira de armazenamento (o
  // `chrome.storage.local.get` da página), não numa função do popup.
  await page.addInitScript(() => {
    const ler = chrome.storage.local.get.bind(chrome.storage.local);
    chrome.storage.local.get = (chaves, callback) => {
      if (chaves && typeof chaves === 'object' && 'frases' in chaves) {
        window.soltarLeitura = () => ler(chaves, callback);
        return undefined;
      }
      return ler(chaves, callback);
    };
  });
  await page.goto(extensao.url('popup.html'));

  await expect(page.locator('#ultimas .veio-esqueleto')).not.toHaveCount(0);
  await expect(page.locator('#ultimas')).toHaveText('');
  await expect(page.getByRole('button', { name: 'Ver todas' })).toHaveCount(0);

  await page.evaluate(() => window.soltarLeitura());
  await expect(ultimas(page)).toHaveCount(5);
  await expect(page.locator('#ultimas .veio-esqueleto')).toHaveCount(0);
});

test('vazio (POP-02) ensina o atalho de legenda gravado', async ({ page, extensao }) => {
  await extensao.gravarStorage({ pm_atalho_legenda: CTRL_SHIFT_L });
  await page.goto(extensao.url('popup.html'));

  const vazio = page.locator('#ultimas');
  await expect(vazio.locator('.veio-vazio__titulo')).toHaveText('Nenhuma frase ainda');
  await expect(vazio.locator('.veio-vazio__texto')).toHaveText('Aperte Ctrl+Shift+L num vídeo com legenda para minerar a primeira.');
  await expect(vazio.locator('kbd')).toHaveText(['Ctrl', 'Shift', 'L']);
  await expect(vazio.locator('svg')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Ver todas' })).toHaveCount(0);
});

test('vazio sem atalho gravado: “Defina um atalho…” e Definir atalho, que abre Configurações › Atalhos', async ({ page, context, extensao }) => {
  await extensao.gravarStorage({ pm_atalho_legenda: null });
  await page.goto(extensao.url('popup.html'));

  const vazio = page.locator('#ultimas');
  await expect(vazio.locator('.veio-vazio__titulo')).toHaveText('Nenhuma frase ainda');
  await expect(vazio.locator('.veio-vazio__texto')).toHaveText('Defina um atalho para minerar legendas de vídeo.');
  await expect(vazio.locator('kbd')).toHaveCount(0);

  const nova = context.waitForEvent('page');
  await vazio.getByRole('button', { name: 'Definir atalho' }).click();
  const painel = await nova;
  await expect(painel).toHaveURL(extensao.url('painel.html#configuracoes/atalhos'));
});

test('o rodapé mostra o atalho de legenda gravado, e acompanha a mudança feita em Configurações', async ({ page, extensao }) => {
  await page.goto(extensao.url('popup.html'));
  const rodape = page.getByRole('contentinfo');
  await expect(rodape).toContainText('Alt+S minera a legenda do vídeo');
  await expect(rodape.locator('kbd')).toHaveText(['Alt', 'S']);

  await extensao.gravarStorage({ pm_atalho_legenda: CTRL_SHIFT_L });
  await expect(rodape.locator('kbd')).toHaveText(['Ctrl', 'Shift', 'L']);
  await expect(rodape).toContainText('Ctrl+Shift+L minera a legenda do vídeo');
});

test('Mudar atalho leva a aba do painel já aberta a Configurações › Atalhos', async ({ page, context, extensao }) => {
  await extensao.gravarStorage({ pm_atalho_legenda: ALT_S });
  const painel = await context.newPage();
  await painel.goto(extensao.url('painel.html#frases'));
  await page.bringToFront();
  await page.goto(extensao.url('popup.html'));

  await page.getByRole('contentinfo').getByRole('button', { name: 'Mudar atalho' }).click();

  await expect.poll(() => abaAtiva(extensao)).toBe(extensao.url('painel.html#configuracoes/atalhos'));
  await expect(painel.getByRole('button', { name: 'Atalhos' })).toHaveAttribute('aria-expanded', 'true');
  expect(abasDoPainel(context, extensao)).toHaveLength(1);
});

test('sem atalho gravado, o rodapé diz “Sem atalho” e Definir atalho abre Configurações › Atalhos', async ({ page, context, extensao }) => {
  await extensao.gravarStorage({ pm_atalho_legenda: null });
  await page.goto(extensao.url('popup.html'));
  const rodape = page.getByRole('contentinfo');
  await expect(rodape.locator('kbd')).toHaveText('Sem atalho');
  await expect(rodape).not.toContainText('minera a legenda');

  const nova = context.waitForEvent('page');
  await rodape.getByRole('button', { name: 'Definir atalho' }).click();
  await expect(await nova).toHaveURL(extensao.url('painel.html#configuracoes/atalhos'));
});

test('os azulejos Inglês | Russo mostram o dia, e o toggle e o limite gravam', async ({ page, extensao }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 12 },
    ru: { ligado: false, limite: 15, hoje: 0 },
  });
  await page.goto(extensao.url('popup.html'));

  await expect(page.getByRole('heading', { name: 'Mineração automática por dia' })).toBeVisible();
  const en = page.locator('.popup-azulejo[data-idioma="en"]');
  const ru = page.locator('.popup-azulejo[data-idioma="ru"]');
  await expect(en).toContainText('EN');
  await expect(en).toContainText('12 de 20 hoje');
  await expect(ru).toContainText('0 de 15 hoje');
  await expect(page.getByRole('switch', { name: 'Mineração automática em inglês' })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Mineração automática em russo' })).not.toBeChecked();

  await ru.locator('.veio-toggle__trilho').click();
  await expect(page.getByRole('switch', { name: 'Mineração automática em russo' })).toBeChecked();
  await expect.poll(async () => (await extensao.lerStorage('pm_auto_miner_settings')).pm_auto_miner_settings.ru.enabled).toBe(true);

  const limite = page.getByRole('spinbutton', { name: 'Limite por dia em russo' });
  await limite.fill('30');
  await limite.press('Enter');
  await expect(ru).toContainText('0 de 30 hoje');
  await expect.poll(async () => (await extensao.lerStorage('pm_auto_miner_settings')).pm_auto_miner_settings.ru.dailyLimit).toBe(30);

  // O limite vai de 1 a 100.
  await limite.fill('150');
  await limite.press('Enter');
  await expect(ru).toContainText('0 de 100 hoje');
  await expect(limite).toHaveValue('100');
  await limite.fill('-5');
  await limite.press('Enter');
  await expect(ru).toContainText('0 de 1 hoje');
  await expect(limite).toHaveValue('1');
  expect((await extensao.lerStorage('pm_auto_miner_settings')).pm_auto_miner_settings.ru.dailyLimit).toBe(1);
});

test('Enter no limite grava e o foco do teclado fica no campo', async ({ page, extensao }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 12 },
    ru: { ligado: true, limite: 15, hoje: 0 },
  });
  await page.goto(extensao.url('popup.html'));

  const limite = page.getByRole('spinbutton', { name: 'Limite por dia em russo' });
  await limite.fill('30');
  await limite.press('Enter');
  await expect(page.locator('.popup-azulejo[data-idioma="ru"]')).toContainText('0 de 30 hoje');
  await expect(limite).toBeFocused();

  // Baixar o limite até a contagem troca o campo por POP-08 (o service worker
  // prende a contagem no limite novo): o foco vai ao toggle do idioma.
  const limiteEn = page.getByRole('spinbutton', { name: 'Limite por dia em inglês' });
  await limiteEn.fill('10');
  await limiteEn.press('Enter');
  await expect(page.locator('.popup-azulejo[data-idioma="en"] .popup-azulejo__no-limite')).toHaveText('Limite de hoje atingido');
  await expect(page.getByRole('switch', { name: 'Mineração automática em inglês' })).toBeFocused();
});

test('o limite atingido enquanto a pessoa está no campo troca o campo por POP-08', async ({ page, extensao }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 19 },
    ru: { ligado: true, limite: 15, hoje: 4 },
  });
  await page.goto(extensao.url('popup.html'));
  const en = page.locator('.popup-azulejo[data-idioma="en"]');
  await expect(en).toContainText('19 de 20 hoje');
  await page.getByRole('spinbutton', { name: 'Limite por dia em russo' }).focus();
  await page.getByRole('spinbutton', { name: 'Limite por dia em inglês' }).focus();

  // A mineração automática chega ao limite do inglês com o campo em foco.
  const estado = await extensao.serviceWorker.evaluate(async () => {
    const { pm_auto_miner_state_view: visto } = await chrome.storage.local.get('pm_auto_miner_state_view');
    return visto;
  });
  const settings = estado?.settings || { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: true, dailyLimit: 15 } };
  const daily = { ...(estado?.daily || {}), en: { count: 20 }, ru: { count: 4 } };
  await extensao.gravarStorage({ pm_auto_miner_state_view: { settings, daily, updatedAt: Date.now() } });

  await expect(en.locator('.popup-azulejo__no-limite')).toHaveText('Limite de hoje atingido');
  await expect(page.getByRole('spinbutton', { name: 'Limite por dia em inglês' })).toHaveCount(0);
});

test('mineração automática carregando: esqueleto nos azulejos, sem texto', async ({ page, extensao }) => {
  // Segura a leitura do estado no service worker, como um disco lento. Como na
  // falha da mineração rápida, o falso fica na fronteira de armazenamento do
  // service worker (`chrome.storage.local.get`), não numa função da extensão.
  await extensao.serviceWorker.evaluate(() => {
    const ler = chrome.storage.local.get.bind(chrome.storage.local);
    chrome.storage.local.get = (chaves, callback) => {
      if (chaves && typeof chaves === 'object' && 'pm_auto_miner_settings' in chaves) {
        globalThis.soltarLeitura = () => ler(chaves, callback);
        return undefined;
      }
      return ler(chaves, callback);
    };
  });
  await page.goto(extensao.url('popup.html'));

  const azulejos = page.locator('#azulejos');
  await expect(azulejos.locator('.veio-esqueleto')).not.toHaveCount(0);
  await expect(azulejos).toHaveText('');
  await expect(azulejos).toHaveAttribute('aria-busy', 'true');

  await extensao.serviceWorker.evaluate(() => globalThis.soltarLeitura());
  await expect(page.locator('.popup-azulejo')).toHaveCount(2);
  await expect(azulejos.locator('.veio-esqueleto')).toHaveCount(0);
  await expect(azulejos).not.toHaveAttribute('aria-busy', 'true');
});

test('mineração automática sem o estado do service worker: POP-16 diz o que fazer, sem botão nem Detalhes', async ({ page, extensao }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 3 },
    ru: { ligado: false, limite: 20, hoje: 0 },
  });
  // O disco recusa a leitura do estado, na fronteira de armazenamento do service worker.
  await extensao.serviceWorker.evaluate(() => {
    globalThis.lerDeVerdade = chrome.storage.local.get.bind(chrome.storage.local);
    chrome.storage.local.get = (chaves, callback) => {
      if (chaves && typeof chaves === 'object' && 'pm_auto_miner_settings' in chaves) {
        throw new Error('IO error: disco ilegível');
      }
      return globalThis.lerDeVerdade(chaves, callback);
    };
  });
  await page.goto(extensao.url('popup.html'));

  const erro = page.locator('#azulejos').getByRole('alert');
  await expect(erro).toHaveText('Não deu para carregar a mineração automática. Feche e abra o popup de novo.');
  await expect(erro.getByRole('button')).toHaveCount(0);
  await expect(erro).not.toContainText('IO error');

  // Fechar e abrir o popup de novo, com o disco de volta, traz os azulejos.
  await extensao.serviceWorker.evaluate(() => { chrome.storage.local.get = globalThis.lerDeVerdade; });
  await page.reload();
  await expect(page.locator('.popup-azulejo[data-idioma="en"]')).toContainText('3 de 20 hoje');
  await expect(page.locator('#azulejos').getByRole('alert')).toHaveCount(0);
});

test('gravar a mineração automática falhando: o toggle volta ao gravado e POP-16 pede para tentar de novo', async ({ page, extensao }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 3 },
    ru: { ligado: false, limite: 15, hoje: 0 },
  });
  await page.goto(extensao.url('popup.html'));
  const russo = page.getByRole('switch', { name: 'Mineração automática em russo' });
  await expect(russo).not.toBeChecked();

  // O disco recusa a gravação, na fronteira de armazenamento do service worker.
  await extensao.serviceWorker.evaluate(() => {
    globalThis.gravarDeVerdade = chrome.storage.local.set.bind(chrome.storage.local);
    chrome.storage.local.set = () => { throw new Error('QUOTA_BYTES quota exceeded'); };
  });
  await page.locator('.popup-azulejo[data-idioma="ru"] .veio-toggle__trilho').click();

  const erro = page.locator('#azulejos').getByRole('alert');
  await expect(erro).toHaveText('Não deu para salvar a mudança. Tente de novo.');
  await expect(erro.getByRole('button')).toHaveCount(0);
  await expect(russo).not.toBeChecked();
  await expect(page.locator('.popup-azulejo')).toHaveCount(2);

  // O disco volta: ligar de novo grava, e a linha sai.
  await extensao.serviceWorker.evaluate(() => { chrome.storage.local.set = globalThis.gravarDeVerdade; });
  await page.locator('.popup-azulejo[data-idioma="ru"] .veio-toggle__trilho').click();
  await expect(russo).toBeChecked();
  await expect(page.locator('#azulejos').getByRole('alert')).toHaveCount(0);
  await expect.poll(async () => (await extensao.lerStorage('pm_auto_miner_settings')).pm_auto_miner_settings.ru.enabled).toBe(true);
});

test('limite de hoje atingido: “Limite de hoje atingido” no lugar do campo, sem repetir a contagem', async ({ page, extensao }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 20 },
    ru: { ligado: true, limite: 15, hoje: 4 },
  });
  await page.goto(extensao.url('popup.html'));

  const en = page.locator('.popup-azulejo[data-idioma="en"]');
  await expect(en.locator('.popup-azulejo__no-limite')).toHaveText('Limite de hoje atingido');
  await expect(page.getByRole('spinbutton', { name: 'Limite por dia em inglês' })).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: 'Limite por dia em russo' })).toHaveValue('15');
  // O leitor de tela ouve POP-08 ao chegar no toggle do idioma.
  await expect(page.getByRole('switch', { name: 'Mineração automática em inglês' }))
    .toHaveAccessibleDescription('Limite de hoje atingido');
  // A contagem fica só no contador: “20/20” na tela.
  await expect(en.locator('.popup-azulejo__contador [aria-hidden="true"]')).toHaveText('20/20');
});

test('o contador mostra “12/20” como no protótipo, e o leitor de tela ouve “12 de 20 hoje”', async ({ page, extensao }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 12 },
    ru: { ligado: false, limite: 15, hoje: 0 },
  });
  await page.goto(extensao.url('popup.html'));

  const contador = page.locator('.popup-azulejo[data-idioma="en"] .popup-azulejo__contador');
  await expect(contador.locator('[aria-hidden="true"]')).toHaveText('12/20');
  await expect(contador.locator('b')).toHaveText('12');
  await expect(contador.locator('small')).toHaveText('/20');
  await expect(contador.locator('.veio-so-leitor')).toHaveText('12 de 20 hoje');
});

test('no campo de limite, clicar seleciona o número: digitar troca o limite inteiro', async ({ page, extensao }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 2 },
    ru: { ligado: false, limite: 15, hoje: 0 },
  });
  await page.goto(extensao.url('popup.html'));

  const limite = page.getByRole('spinbutton', { name: 'Limite por dia em inglês' });
  await limite.click();
  await page.keyboard.type('35');
  await page.keyboard.press('Enter');
  await expect(page.locator('.popup-azulejo[data-idioma="en"]')).toContainText('2 de 35 hoje');
  await expect.poll(async () => (await extensao.lerStorage('pm_auto_miner_settings')).pm_auto_miner_settings.en.dailyLimit).toBe(35);
});

/** Um momento de ontem às 14:02, a hora local: o selo diz “Vocabulário de ontem, 14:02”. */
function ontemAs1402() {
  const quando = new Date();
  quando.setDate(quando.getDate() - 1);
  quando.setHours(14, 2, 0, 0);
  return quando.getTime();
}

const selo = page => page.getByText(/^Vocabulário de /);
const esperando = (page, chave) => page.locator(`.popup-azulejo[data-idioma="${chave}"]`).getByText('— esperando o Anki');

test('com a Conexão desligada e uma leitura de ontem, o azulejo segue contando e o selo diz “Vocabulário de ontem, 14:02”', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 12 },
    ru: { ligado: false, limite: 15, hoje: 0 },
  });
  await extensao.gravarStorage({ pm_auto_keyword_vocab_en: leitura(DEN, ontemAs1402()) });
  await page.goto(extensao.url('popup.html'));

  await expect(selo(page)).toHaveText('Vocabulário de ontem, 14:02');
  await expect(page.locator('.popup-azulejo[data-idioma="en"]')).toContainText('12 de 20 hoje');
  await expect(page.locator('.popup-azulejo__espera:visible')).toHaveCount(0);
  await expect(page.getByText(/Nada é minerado com a Conexão/)).toBeHidden();
});

test('o selo do popup diz o dia e a hora da leitura mais antiga entre os idiomas ligados', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 1 },
    ru: { ligado: true, limite: 15, hoje: 1 },
  });
  await extensao.gravarStorage({
    pm_auto_keyword_vocab_en: leitura(DEN, Date.now() - 60_000),
    pm_auto_keyword_vocab_ru: leitura(DRU, ontemAs1402()),
  });
  await page.goto(extensao.url('popup.html'));
  await expect(selo(page)).toHaveText('Vocabulário de ontem, 14:02');

  // A leitura de um idioma desligado não conta: ele não mineraria com ela.
  await extensao.gravarStorage({ pm_auto_miner_settings: {
    en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 15 },
  } });
  await page.reload();
  await expect(selo(page)).toHaveText(/^Vocabulário de hoje, \d{2}:\d{2}$/);
});

test('com a Conexão respondendo e o Anki aberto, nem o selo nem o esperando aparecem', async ({ page, extensao, fakes }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 2 },
    ru: { ligado: true, limite: 15, hoje: 0 },
  });
  await extensao.gravarStorage({ pm_auto_keyword_vocab_en: leitura(DEN, ontemAs1402(), { source: 'ankiconnect' }) });
  await page.goto(extensao.url('popup.html'));
  await expect.poll(() => fakes.anki.requisicoes.some(r => r.caminho === '/health')).toBe(true);
  await expect(page.locator('.popup-azulejo')).toHaveCount(2);

  await expect(selo(page)).toBeHidden();
  await expect(page.locator('.popup-azulejo__espera:visible')).toHaveCount(0);
});

test('com a Conexão respondendo mas o Anki fechado (leitura do arquivo), o selo diz o dia e a hora dos dados, não o da leitura', async ({ page, extensao, fakes }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 12 },
    ru: { ligado: false, limite: 15, hoje: 0 },
  });
  // Lida agora do arquivo, mas com os dados de ontem às 14:02: a leitura de antes de o Anki fechar.
  await extensao.gravarStorage({
    pm_auto_keyword_vocab_en: leitura(DEN, Date.now() - 60_000, { source: 'collection.anki2', dadosDe: ontemAs1402(), ankiFechado: true }),
  });
  const gravada = (await extensao.lerStorage('pm_auto_keyword_vocab_en')).pm_auto_keyword_vocab_en;
  await page.goto(extensao.url('popup.html'));
  await expect.poll(() => fakes.anki.requisicoes.some(r => r.caminho === '/health')).toBe(true);

  await expect(selo(page)).toHaveText('Vocabulário de ontem, 14:02');
  await expect(page.locator('.popup-azulejo[data-idioma="en"]')).toContainText('12 de 20 hoje');
  // O popup só lê: a leitura guardada segue como estava.
  expect((await extensao.lerStorage('pm_auto_keyword_vocab_en')).pm_auto_keyword_vocab_en).toEqual(gravada);
  // A Conexão responde e já leu o arquivo: o azulejo não está esperando nada.
  await expect(page.locator('.popup-azulejo__espera:visible')).toHaveCount(0);
});

test('o Anki abre de novo: a leitura passa a ser do Anki e o selo some', async ({ page, extensao, fakes }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 1 },
    ru: { ligado: false, limite: 15, hoje: 0 },
  });
  await extensao.gravarStorage({
    pm_auto_keyword_vocab_en: leitura(DEN, Date.now() - 60_000, { source: 'collection.anki2', dadosDe: ontemAs1402(), ankiFechado: true }),
  });
  await page.goto(extensao.url('popup.html'));
  await expect(selo(page)).toHaveText('Vocabulário de ontem, 14:02');

  await extensao.gravarStorage({ pm_auto_keyword_vocab_en: leitura(DEN, Date.now(), { source: 'ankiconnect' }) });
  await expect(selo(page)).toBeHidden();
});

test('com a Conexão respondendo e o Anki aberto sem o AnkiConnect (leitura do arquivo), o popup não diz que o Anki está fechado', async ({ page, extensao, fakes }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 3 },
    ru: { ligado: false, limite: 15, hoje: 0 },
  });
  await extensao.gravarStorage({
    pm_auto_keyword_vocab_en: leitura(DEN, Date.now() - 60_000, { source: 'collection.anki2', dadosDe: ontemAs1402(), ankiFechado: false }),
  });
  await page.goto(extensao.url('popup.html'));
  await expect.poll(() => fakes.anki.requisicoes.some(r => r.caminho === '/health')).toBe(true);
  await expect(page.locator('.popup-azulejo')).toHaveCount(2);

  await expect(selo(page)).toBeHidden();
});

test('o selo do popup usa a leitura mais antiga dos idiomas ligados, mesmo a de um idioma lido com o Anki aberto', async ({ page, extensao, fakes }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 1 },
    ru: { ligado: true, limite: 15, hoje: 1 },
  });
  const anteontem = new Date(ontemAs1402());
  anteontem.setDate(anteontem.getDate() - 1);
  await extensao.gravarStorage({
    pm_auto_keyword_vocab_en: leitura(DEN, anteontem.getTime(), { source: 'ankiconnect' }),
    pm_auto_keyword_vocab_ru: leitura(DRU, Date.now() - 60_000, { source: 'collection.anki2', dadosDe: ontemAs1402(), ankiFechado: true }),
  });
  await page.goto(extensao.url('popup.html'));
  await expect.poll(() => fakes.anki.requisicoes.some(r => r.caminho === '/health')).toBe(true);

  await expect(selo(page)).toHaveText('Vocabulário de há 2 dias, 14:02');
});

test('com a Conexão desligada e nenhuma leitura, o azulejo ligado diz “— esperando o Anki” e quando começa; o desligado, nada', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 0 },
    ru: { ligado: false, limite: 15, hoje: 0 },
  });
  await page.goto(extensao.url('popup.html'));

  await expect(esperando(page, 'en')).toBeVisible();
  await expect(page.locator('.popup-azulejo[data-idioma="en"]')).toContainText('Começa depois que o Anki abrir uma vez.');
  await expect(esperando(page, 'ru')).toBeHidden();
  await expect(selo(page)).toBeHidden();
});

test('uma leitura de outro Baralho não vale: o azulejo espera o Anki, e a leitura do Baralho certo faz o selo aparecer', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 3 },
    ru: { ligado: false, limite: 15, hoje: 0 },
  });
  await extensao.gravarStorage({ pm_auto_keyword_vocab_en: leitura('Outro baralho', ontemAs1402()) });
  await page.goto(extensao.url('popup.html'));
  await expect(esperando(page, 'en')).toBeVisible();
  await expect(selo(page)).toBeHidden();

  await extensao.gravarStorage({ pm_auto_keyword_vocab_en: leitura(DEN, ontemAs1402()) });
  await expect(selo(page)).toHaveText('Vocabulário de ontem, 14:02');
  await expect(esperando(page, 'en')).toBeHidden();
});

test('com movimento reduzido, a frase que chega não pisca', async ({ page, extensao }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await extensao.gravarStorage({ frases: SETE_FRASES });
  await page.goto(extensao.url('popup.html'));
  await expect(ultimas(page)).toHaveCount(5);

  await campoRapido(page).fill('Break a leg');
  await campoRapido(page).press('Enter');
  await expect(ultimas(page).first()).toContainText('Break a leg');

  const emMovimento = await page.evaluate(() => document.getAnimations()
    .filter(a => a.playState === 'running' && a.effect.getComputedTiming().activeDuration > 1)
    .map(a => a.animationName));
  expect(emMovimento).toEqual([]);
});

test('sem movimento reduzido, a frase que chega ganha o realce breve', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: SETE_FRASES });
  await page.goto(extensao.url('popup.html'));
  await expect(ultimas(page)).toHaveCount(5);
  await expect(page.locator('.popup-ultima--nova')).toHaveCount(0);

  await campoRapido(page).fill('Break a leg');
  await campoRapido(page).press('Enter');
  await expect(ultimas(page).first()).toHaveClass(/popup-ultima--nova/);
});

test('todo controle do popup tem nome para o leitor de tela', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: SETE_FRASES });
  await page.goto(extensao.url('popup.html'));
  await expect(ultimas(page)).toHaveCount(5);

  const semNome = await page.evaluate(() => [...document.querySelectorAll('button, input, textarea, a[href]')]
    .filter(no => {
      const nome = no.getAttribute('aria-label') || no.textContent.trim()
        || [...(no.labels || [])].map(l => l.textContent.trim()).join('');
      return !nome;
    })
    .map(no => no.outerHTML));
  expect(semNome).toEqual([]);
});

test('o Tab passa por todos os controles do popup, em ordem, e cada um mostra o foco', async ({ page, extensao }) => {
  // Sem transição, o estilo lido é o final, não um quadro do meio do anel.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 12 },
    ru: { ligado: false, limite: 15, hoje: 0 },
  });
  await extensao.gravarStorage({ frases: SETE_FRASES, pm_atalho_legenda: ALT_S });
  await page.goto(extensao.url('popup.html'));
  await expect(ultimas(page)).toHaveCount(5);
  await expect(page.locator('.popup-azulejo')).toHaveCount(2);
  await campoRapido(page).fill('Break a leg');
  // Volta pelo teclado até o primeiro controle, para cada parada chegar pelo Tab.
  const abrir = page.getByRole('button', { name: 'Abrir painel' });
  for (let i = 0; i < 12 && !(await abrir.evaluate(no => no === document.activeElement)); i++) {
    await page.keyboard.press('Shift+Tab');
  }

  // O foco que se vê: o contorno ou a sombra do controle com o foco, comparados
  // com os dele sem o foco (o botão primário já tem sombra). No toggle, o que
  // aparece é o trilho, não o checkbox.
  const aparencia = () => page.evaluate(() => {
    const no = document.activeElement;
    if (!no || no === document.body) return null;
    const alvo = no.getAttribute('role') === 'switch' ? no.nextElementSibling : no;
    const { outlineStyle, outlineWidth, boxShadow } = getComputedStyle(alvo);
    return { nome: no.getAttribute('aria-label') || no.textContent.trim(), visual: `${outlineStyle} ${outlineWidth} ${boxShadow}` };
  });

  const paradas = [];
  for (let i = 0; i < 12; i++) {
    if (i > 0) await page.keyboard.press('Tab');
    const parada = await aparencia();
    if (!parada || paradas.some(p => p.nome === parada.nome)) break;
    paradas.push(parada);
  }
  const semFoco = await page.evaluate(nomes => {
    document.activeElement.blur();
    const controles = [...document.querySelectorAll('button, input, textarea')];
    return nomes.map(nome => {
      const no = controles.find(c => (c.getAttribute('aria-label') || c.textContent.trim()) === nome);
      const alvo = no.getAttribute('role') === 'switch' ? no.nextElementSibling : no;
      const { outlineStyle, outlineWidth, boxShadow } = getComputedStyle(alvo);
      return `${outlineStyle} ${outlineWidth} ${boxShadow}`;
    });
  }, paradas.map(p => p.nome));

  expect(paradas.map(p => p.nome)).toEqual([
    'Abrir painel',
    'Mineração automática em inglês',
    'Limite por dia em inglês',
    'Mineração automática em russo',
    'Limite por dia em russo',
    'Cole ou escreva uma frase',
    'Minerar',
    'Ver todas',
    'Mudar atalho',
  ]);
  expect(paradas.filter((p, i) => p.visual === semFoco[i]).map(p => p.nome)).toEqual([]);
});
