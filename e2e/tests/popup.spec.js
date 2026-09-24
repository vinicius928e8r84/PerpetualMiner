'use strict';

// Popup · Cockpit (#38): o popup refeito na Veio, variante A do protótipo
// travado (docs/design/popup/prototipo-popup.html?variant=A).
//
// O popup abre aqui como uma aba (`popup.html`), a mesma página que o Chrome põe
// no balão do ícone. Os testes afirmam o que a pessoa vê e o que fica gravado.

const { test, expect } = require('../fixtures');

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

// ─── Abrir painel ─────────────────────────────────────────────────────────────

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

// ─── Mineração rápida ─────────────────────────────────────────────────────────

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
});

test('mineração rápida em russo grava o idioma pelo detector único', async ({ page, extensao }) => {
  await page.goto(extensao.url('popup.html'));
  await campoRapido(page).fill('Тише едешь — дальше будешь.');
  await page.getByRole('button', { name: 'Minerar', exact: true }).click();

  await expect(campoRapido(page)).toHaveValue('');
  expect((await extensao.frases())[0]).toMatchObject({ idioma: 'Russo' });
});

test('mineração rápida com o service worker falhando: POP-06 com Detalhes, e o texto continua no campo', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: SETE_FRASES });
  await page.goto(extensao.url('popup.html'));
  await expect(ultimas(page)).toHaveCount(5);

  // O disco recusa a gravação: é a fronteira de armazenamento do service
  // worker, e o que a pessoa veria com o perfil cheio ou corrompido.
  await extensao.serviceWorker.evaluate(() => {
    globalThis.gravarDeVerdade = chrome.storage.local.set.bind(chrome.storage.local);
    chrome.storage.local.set = () => { throw new Error('QUOTA_BYTES quota exceeded'); };
  });

  await campoRapido(page).fill('Break a leg');
  await campoRapido(page).press('Enter');

  const erro = page.getByRole('alert');
  await expect(erro).toContainText('Não deu para minerar a frase. Tente de novo.');
  await erro.getByText('Detalhes').click();
  await expect(erro).toContainText('QUOTA_BYTES quota exceeded');
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

// ─── Últimas mineradas ────────────────────────────────────────────────────────

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
  // Segura a leitura das frases, como um disco lento.
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
  await expect(vazio).toHaveText('Nenhuma frase ainda. Aperte Ctrl+Shift+L num vídeo com legenda para minerar a primeira.');
  await expect(vazio.locator('kbd')).toHaveText('Ctrl+Shift+L');
  await expect(page.getByRole('button', { name: 'Ver todas' })).toHaveCount(0);
});

test('vazio sem atalho gravado: “Sem atalho” e Definir atalho, que abre Configurações › Atalhos', async ({ page, context, extensao }) => {
  await extensao.gravarStorage({ pm_atalho_legenda: null });
  await page.goto(extensao.url('popup.html'));

  const vazio = page.locator('#ultimas');
  await expect(vazio.locator('kbd')).toHaveText('Sem atalho');

  const nova = context.waitForEvent('page');
  await vazio.getByRole('button', { name: 'Definir atalho' }).click();
  const painel = await nova;
  await expect(painel).toHaveURL(extensao.url('painel.html#configuracoes/atalhos'));
});

// ─── Rodapé ───────────────────────────────────────────────────────────────────

test('o rodapé mostra o atalho de legenda gravado, e acompanha a mudança feita em Configurações', async ({ page, extensao }) => {
  await page.goto(extensao.url('popup.html'));
  const rodape = page.getByRole('contentinfo');
  await expect(rodape).toContainText('Alt+S minera a legenda do vídeo');
  await expect(rodape.locator('kbd')).toHaveText('Alt+S');

  await extensao.gravarStorage({ pm_atalho_legenda: CTRL_SHIFT_L });
  await expect(rodape.locator('kbd')).toHaveText('Ctrl+Shift+L');
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

// ─── Mineração automática ─────────────────────────────────────────────────────

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
});

test('limite de hoje atingido: “Limite de hoje atingido · 20 de 20” no lugar do campo', async ({ page, extensao }) => {
  await semearMineracaoAutomatica(extensao, {
    en: { ligado: true, limite: 20, hoje: 20 },
    ru: { ligado: true, limite: 15, hoje: 4 },
  });
  await page.goto(extensao.url('popup.html'));

  const en = page.locator('.popup-azulejo[data-idioma="en"]');
  await expect(en).toContainText('Limite de hoje atingido · 20 de 20');
  await expect(page.getByRole('spinbutton', { name: 'Limite por dia em inglês' })).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: 'Limite por dia em russo' })).toHaveValue('15');
});

test('com a Conexão com o Anki desligada, a nota ONB-10 aparece sob os azulejos', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await page.goto(extensao.url('popup.html'));
  await expect(page.getByText('Nada é minerado com a Conexão com o Anki desligada: é ela que diz quais palavras você já conhece.')).toBeVisible();
});

test('com a Conexão com o Anki ligada, não há nota', async ({ page, extensao, fakes }) => {
  await page.goto(extensao.url('popup.html'));
  await expect.poll(() => fakes.anki.requisicoes.some(r => r.caminho === '/health')).toBe(true);
  await expect(page.getByText(/Nada é minerado com a Conexão/)).toBeHidden();
});

// ─── Acessibilidade e movimento ───────────────────────────────────────────────

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
