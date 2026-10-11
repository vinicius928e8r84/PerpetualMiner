'use strict';

// Passo 2 do redesign: os cards Chave do Gemini e Zona de perigo de
// Configurações (#28, docs/design/painel/configuracoes/).
//
// Chave do Gemini: salva, ela aparece só mascarada (4 primeiros + 4 últimos),
// com Trocar chave; vazia, o campo fica aberto e salvar vazio é recusado. A
// chave é a mesma de sempre: `geminiApiKey` no chrome.storage.local, que o
// Minerar de uma foto lê.
//
// Zona de perigo: o botão de contorno só abre o modal Veio; quem apaga é o botão
// preenchido dentro dele. O alcance muda com a conta: com conta, some também da
// nuvem. Nenhum confirm() do navegador.
//
// Os testes afirmam o que a pessoa vê e o que fica gravado, nunca funções internas.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../fixtures');

const HOJE = new Date().toLocaleDateString('pt-BR');
const CHAVE_DO_GEMINI = 'AIzaSyD4kQ7wL2mXe9pRtB8nVfH0cJ3kQ9';
const OUTRA_CHAVE = 'AIzaSyZ0pQ1rS2tU3vW4xY5zA6bC7dE8fG9h';

function frasesDeExemplo(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: 1_700_000_000_000 + (n - i),
    texto: `Sentence number ${n - i} about the harbour.`,
    data: HOJE,
    streaming: 'netflix',
    idioma: 'Inglês',
  }));
}

/** Abre o painel e falha o teste se algum confirm()/alert() do navegador aparecer. */
async function abrirPainel(page, extensao, endereco) {
  page.on('dialog', dialogo => {
    throw new Error(`o painel abriu um diálogo nativo: ${dialogo.message()}`);
  });
  await page.goto(extensao.url(`painel.html${endereco}`));
  await expect(page.getByRole('navigation', { name: 'Navegação do painel' })).toBeVisible();
}

const card = (page, secao) => page.locator(`#cfg-${secao}`);
const resumo = (page, secao) => card(page, secao).locator('.cfg-resumo');
const campoDaChave = page => card(page, 'chave').getByRole('textbox', { name: 'Chave do Gemini' });
const toast = page => page.locator('.veio-toast');
const toastCom = (page, texto) => page.locator('.veio-toast', { hasText: texto });
const modal = page => page.getByRole('dialog');

// ─── Chave do Gemini ─────────────────────────────────────────────────────────

test('chave salva: “Chave salva”, a chave mascarada e Trocar chave; Cancelar volta sem mudar nada', async ({ page, extensao }) => {
  await extensao.gravarStorage({ geminiApiKey: CHAVE_DO_GEMINI });
  await abrirPainel(page, extensao, '#configuracoes/chave');

  const chave = card(page, 'chave');
  await expect(chave.getByText('Usada para ler fotos em Minerar de uma foto. Fica guardada só neste computador.')).toBeVisible();
  await expect(chave.getByText('Chave salva', { exact: true })).toBeVisible();
  await expect(chave.locator('.cfg-corpo').getByText('AIza••••••••3kQ9')).toBeVisible();
  await expect(page.getByText(CHAVE_DO_GEMINI)).toHaveCount(0);
  await expect(campoDaChave(page)).toHaveCount(0);

  await chave.getByRole('button', { name: 'Trocar chave' }).click();
  // Trocar abre o campo vazio, com o foco nele: a chave antiga nunca vai para a tela.
  await expect(campoDaChave(page)).toBeFocused();
  await expect(campoDaChave(page)).toHaveValue('');
  await expect(campoDaChave(page)).toHaveAttribute('placeholder', 'Cole a chave (começa com AIza)');
  await campoDaChave(page).fill(OUTRA_CHAVE);
  await chave.getByRole('button', { name: 'Cancelar' }).click();

  await expect(campoDaChave(page)).toHaveCount(0);
  await expect(chave.getByRole('button', { name: 'Trocar chave' })).toBeFocused();
  await expect(chave.locator('.cfg-corpo').getByText('AIza••••••••3kQ9')).toBeVisible();
  expect((await extensao.lerStorage('geminiApiKey')).geminiApiKey).toBe(CHAVE_DO_GEMINI);
});

test('trocar a chave com Enter grava a nova, mostra o toast CFG-16 e o card volta ao resumo', async ({ page, extensao }) => {
  await extensao.gravarStorage({ geminiApiKey: CHAVE_DO_GEMINI });
  await abrirPainel(page, extensao, '#configuracoes/chave');

  await card(page, 'chave').getByRole('button', { name: 'Trocar chave' }).click();
  await campoDaChave(page).fill(`  ${OUTRA_CHAVE}  `);
  await campoDaChave(page).press('Enter');

  await expect(toast(page)).toHaveText('Chave do Gemini salva');
  await expect(campoDaChave(page)).toHaveCount(0);
  await expect(card(page, 'chave').locator('.cfg-corpo').getByText('AIza••••••••fG9h')).toBeVisible();
  // A mesma chave de sempre, sem os espaços da colagem: é ela que o Minerar de uma foto lê.
  expect((await extensao.lerStorage('geminiApiKey')).geminiApiKey).toBe(OUTRA_CHAVE);

  await card(page, 'chave').getByRole('button', { name: 'Chave do Gemini', exact: true }).click();
  await expect(resumo(page, 'chave')).toHaveText('AIza••••••••fG9h');
});

test('sem chave: o campo fica aberto; salvar vazio é recusado em danger e salvar pelo botão grava', async ({ page, extensao }) => {
  await abrirPainel(page, extensao, '#configuracoes');
  await card(page, 'chave').getByRole('button', { name: 'Chave do Gemini', exact: true }).click();

  const chave = card(page, 'chave');
  await expect(campoDaChave(page)).toBeVisible();
  await expect(chave.getByText('Sem a chave, Minerar de uma foto não consegue ler as fotos.')).toBeVisible();
  const salvar = chave.getByRole('button', { name: 'Salvar chave' });
  await expect(salvar).toHaveClass(/veio-botao--primario/);
  // Sem chave não há o que cancelar.
  await expect(chave.getByRole('button', { name: 'Cancelar' })).toHaveCount(0);

  // Salvar vazio (ou só espaços) não grava: borda danger e o aviso embaixo.
  await campoDaChave(page).fill('   ');
  await salvar.click();
  await expect(campoDaChave(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(chave.getByText('Cole a chave antes de salvar')).toBeVisible();
  await expect(campoDaChave(page)).toHaveAccessibleDescription('Cole a chave antes de salvar');
  await expect(campoDaChave(page)).toBeFocused();
  const corDoPerigo = await page.evaluate(() => {
    const amostra = document.createElement('span');
    amostra.style.color = 'var(--veio-danger)';
    document.body.append(amostra);
    return getComputedStyle(amostra).color;
  });
  // A borda muda com transição: a cor é conferida depois que ela termina.
  await expect.poll(() => campoDaChave(page).evaluate(el => getComputedStyle(el).borderColor)).toBe(corDoPerigo);
  await expect(toast(page)).toHaveCount(0);
  expect((await extensao.lerStorage({ geminiApiKey: '' })).geminiApiKey).toBe('');

  // Voltar a digitar tira o erro.
  await campoDaChave(page).fill(CHAVE_DO_GEMINI);
  await expect(campoDaChave(page)).not.toHaveAttribute('aria-invalid', 'true');
  await expect(chave.getByText('Cole a chave antes de salvar')).toBeHidden();

  await salvar.click();
  await expect(toast(page)).toHaveText('Chave do Gemini salva');
  await expect(chave.getByText('Chave salva', { exact: true })).toBeVisible();
  expect((await extensao.lerStorage('geminiApiKey')).geminiApiKey).toBe(CHAVE_DO_GEMINI);
});

test('#configuracoes/chave com a chave vazia foca o campo; com a chave salva, não abre campo nenhum', async ({ page, extensao }) => {
  await abrirPainel(page, extensao, '#configuracoes/chave');
  await expect(campoDaChave(page)).toBeFocused();

  await extensao.gravarStorage({ geminiApiKey: CHAVE_DO_GEMINI });
  await page.goto(extensao.url('painel.html#frases'));
  await page.goto(extensao.url('painel.html#configuracoes/chave'));
  await expect(card(page, 'chave').getByRole('button', { name: 'Trocar chave' })).toBeVisible();
  await expect(campoDaChave(page)).toHaveCount(0);
});

test('a chave gravada em outra página aparece no card aberto sem recarregar', async ({ page, extensao }) => {
  await abrirPainel(page, extensao, '#configuracoes/chave');
  await expect(campoDaChave(page)).toBeVisible();

  await extensao.gravarStorage({ geminiApiKey: CHAVE_DO_GEMINI });
  await expect(card(page, 'chave').getByText('Chave salva', { exact: true })).toBeVisible();
  await expect(campoDaChave(page)).toHaveCount(0);
});

// ─── Zona de perigo ──────────────────────────────────────────────────────────

test('sem conta: o alcance é este computador; Cancelar tem o foco, Esc fecha e nada é apagado', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(3) });
  await abrirPainel(page, extensao, '#configuracoes/perigo');

  const perigo = card(page, 'perigo');
  await expect(perigo.getByText('Apagar tudo aqui não dá para desfazer.', { exact: true })).toBeVisible();
  await expect(perigo.getByText('Apagar todas as frases', { exact: true })).toBeVisible();
  await expect(perigo.getByText('3 frases neste computador')).toBeVisible();

  const entrada = perigo.getByRole('button', { name: 'Apagar todas as 3 frases' });
  await expect(entrada).toHaveClass(/veio-botao--perigo(?!-)/);
  await entrada.click();

  await expect(modal(page)).toBeVisible();
  await expect(modal(page)).toHaveAccessibleName('Apagar todas as 3 frases?');
  await expect(modal(page).getByText('Elas somem deste computador.', { exact: true })).toBeVisible();
  await expect(modal(page).getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await expect(modal(page).getByRole('button', { name: 'Apagar 3 frases' })).toHaveClass(/veio-botao--perigo-cheio/);

  await page.keyboard.press('Escape');
  await expect(modal(page)).toBeHidden();
  await expect(entrada).toBeFocused();

  await entrada.click();
  await modal(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(modal(page)).toBeHidden();

  expect(await extensao.frases()).toHaveLength(3);
  await expect(page.locator('#shell-total')).toHaveText('3');
});

test('sem conta: confirmar no modal apaga o histórico, mostra CFG-18 e zera o total da sidebar', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(3) });
  await abrirPainel(page, extensao, '#configuracoes/perigo');

  await card(page, 'perigo').getByRole('button', { name: 'Apagar todas as 3 frases' }).click();
  await modal(page).getByRole('button', { name: 'Apagar 3 frases' }).click();

  await expect(modal(page)).toBeHidden();
  await expect(toast(page)).toHaveText('Todas as frases foram apagadas');
  await expect(page.locator('#shell-total')).toHaveText('0');
  await expect.poll(() => extensao.frases()).toEqual([]);

  // Sem frases, a entrada fica indisponível com CFG-20.
  await expect(card(page, 'perigo').getByRole('button', { name: 'Nenhuma frase para apagar' })).toBeDisabled();
  await expect(card(page, 'perigo').getByText('Nenhuma frase no histórico')).toBeVisible();
  await expect(resumo(page, 'perigo')).toHaveText('Nenhuma frase');
});

test('com 1 frase, a entrada, o título e a confirmação falam no singular', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(1) });
  await abrirPainel(page, extensao, '#configuracoes/perigo');

  await expect(card(page, 'perigo').getByText('1 frase neste computador')).toBeVisible();
  await card(page, 'perigo').getByRole('button', { name: 'Apagar 1 frase' }).click();
  await expect(modal(page)).toHaveAccessibleName('Apagar 1 frase?');
  await expect(modal(page).getByRole('button', { name: 'Apagar 1 frase' })).toBeVisible();
});

test('sem frases, a entrada fica indisponível com “Nenhuma frase para apagar”', async ({ page, extensao }) => {
  await abrirPainel(page, extensao, '#configuracoes/perigo');
  await expect(card(page, 'perigo').getByRole('button', { name: 'Nenhuma frase para apagar' })).toBeDisabled();
  await expect(modal(page)).toHaveCount(0);
});

test('com conta: o alcance é todos os computadores, e confirmar apaga também a nuvem', async ({ page, extensao, fakes }) => {
  // Segura o toast transitório enquanto lê o estado persistido sob carga.
  const instante = new Date();
  await page.clock.install({ time: instante });
  await page.clock.pauseAt(new Date(instante.getTime() + 60_000));
  const frases = frasesDeExemplo(2);
  await extensao.semearSessao({ uid: 'uid-perigo' });
  await extensao.gravarStorage({ frases });
  fakes.google.gravarFrases('uid-perigo', frases);
  await abrirPainel(page, extensao, '#configuracoes/perigo');
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');

  const perigo = card(page, 'perigo');
  await expect(perigo.getByText('Apagar tudo aqui não dá para desfazer, e vale para todos os computadores da sua conta.')).toBeVisible();
  await expect(perigo.getByText('2 frases em todos os computadores da sua conta')).toBeVisible();

  await perigo.getByRole('button', { name: 'Apagar todas as 2 frases' }).click();
  await expect(modal(page).getByText('Elas somem deste computador e de todos os outros conectados à sua conta. Não dá para desfazer.')).toBeVisible();
  await modal(page).getByRole('button', { name: 'Apagar 2 frases' }).click();

  // O toast só vem quando a nuvem já está vazia.
  await expect(toast(page)).toHaveText('Todas as frases foram apagadas');
  expect(fakes.google.frasesDe('uid-perigo')).toEqual([]);
  await expect(page.locator('#shell-total')).toHaveText('0');
  expect(await extensao.frases()).toEqual([]);
});

test('com conta e a chave da OpenAI, Apagar tudo diz que a chave também sai e a tira dos três lugares', async ({ page, extensao, fakes }) => {
  // #154: a chave acompanha a conta, então Apagar tudo a tira da nuvem, da extensão e da Conexão (chave de mentira).
  const chave = 'sk-proj-chave-de-exemplo-9f3a';
  const frases = frasesDeExemplo(2);
  await extensao.semearSessao({ uid: 'uid-perigo' });
  await extensao.gravarStorage({ frases });
  fakes.google.gravarFrases('uid-perigo', frases);
  fakes.google.gravarChaveDaOpenAI('uid-perigo', { chave, em: Date.now() - 60_000 });
  await abrirPainel(page, extensao, '#configuracoes/perigo');
  await expect(card(page, 'ia').locator('.cfg-resumo')).toHaveText('••••••••9f3a');
  await expect.poll(() => fakes.anki.chaveNaConexao()).toBe(chave);

  await card(page, 'perigo').getByRole('button', { name: 'Apagar todas as 2 frases' }).click();
  await expect(modal(page)).toContainText('Elas somem deste computador e de todos os outros conectados à sua conta. Não dá para desfazer. A chave da OpenAI também sai, da sua conta e da Conexão com o Anki.');
  await modal(page).getByRole('button', { name: 'Apagar 2 frases' }).click();

  await expect(toast(page)).toHaveText('Todas as frases foram apagadas');
  await expect(card(page, 'ia').locator('.cfg-resumo')).toHaveText('Sem chave');
  await expect.poll(() => fakes.google.chaveDaOpenAIDe('uid-perigo')).toEqual({ chave: '', em: expect.any(Number) });
  await expect.poll(() => fakes.anki.chaveNaConexao()).toBeNull();
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai?.ultimos4 || '').toBe('');
  expect(fakes.google.frasesDe('uid-perigo')).toEqual([]);
});

test('sem a chave da OpenAI, o modal do Apagar tudo não fala dela', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(1) });
  await abrirPainel(page, extensao, '#configuracoes/perigo');

  await card(page, 'perigo').getByRole('button', { name: 'Apagar 1 frase' }).click();

  await expect(modal(page)).toContainText('Elas somem deste computador.');
  await expect(modal(page)).not.toContainText('chave');
  // Exceção de teste: sem-estado-guardado — o teste só abre o modal e não confirma: nada é apagado nem gravado.
});

test('com conta, enquanto a nuvem não responde, a Zona de perigo não finge que não há frases', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-carregando' });
  await extensao.gravarStorage({ frases: frasesDeExemplo(2) });
  fakes.google.segurarLeituras();
  await abrirPainel(page, extensao, '#configuracoes/perigo');

  const perigo = card(page, 'perigo');
  await expect(perigo.getByText('Apagar tudo aqui não dá para desfazer, e vale para todos os computadores da sua conta.')).toBeVisible();
  await expect(perigo.getByRole('button', { name: /Apagar|Nenhuma/ })).toHaveCount(0);
  await expect(perigo.getByText('Nenhuma frase no histórico')).toHaveCount(0);
});

test('com conta e a nuvem fora do ar, as frases apagadas não voltam quando ela volta', async ({ page, extensao, fakes }) => {
  // Antes, apagar tudo lia a nuvem para saber o que apagar: com ela fora do ar,
  // nada ficava marcado como apagado e o sync seguinte trazia tudo de volta.
  const frases = frasesDeExemplo(2);
  await extensao.semearSessao({ uid: 'uid-fora' });
  await extensao.gravarStorage({ frases });
  fakes.google.gravarFrases('uid-fora', frases);
  await abrirPainel(page, extensao, '#configuracoes/perigo');
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');

  fakes.google.ficarForaDoAr();
  await card(page, 'perigo').getByRole('button', { name: 'Apagar todas as 2 frases' }).click();
  await modal(page).getByRole('button', { name: 'Apagar 2 frases' }).click();
  // A falha aparece no chip; nenhum toast diz que tudo foi apagado (Q4). Conta na
  // hora, sem esperar: o toast antigo nascia junto com o total em 0 e sumia depois.
  const toastsDeApagado = () => toastCom(page, 'Todas as frases foram apagadas').count();
  await expect(page.locator('#shell-total')).toHaveText('0');
  expect(await toastsDeApagado()).toBe(0);
  await expect(page.locator('#shell-chip')).toContainText('Sem sincronizar');
  expect(await toastsDeApagado()).toBe(0);

  fakes.google.ficarForaDoAr(false);
  await page.reload();
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
  await expect.poll(() => fakes.google.frasesDe('uid-fora')).toEqual([]);
  await expect(page.locator('#shell-total')).toHaveText('0');
  expect(await extensao.frases()).toEqual([]);
});

test('com conta e a nuvem fora do ar, o que outro computador gravou antes também não volta; o que veio depois fica', async ({ page, extensao, fakes }) => {
  // Antes, só as frases deste computador ficavam marcadas: uma frase que outro
  // computador pôs na nuvem depois do último sync daqui voltava quando ela voltava.
  const frases = frasesDeExemplo(2);
  await extensao.semearSessao({ uid: 'uid-outro' });
  await extensao.gravarStorage({ frases });
  fakes.google.gravarFrases('uid-outro', frases);
  await abrirPainel(page, extensao, '#configuracoes/perigo');
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');

  const doOutroComputador = { id: Date.now() - 60_000, texto: 'Written on the other computer.', data: HOJE, streaming: 'netflix', idioma: 'Inglês' };
  fakes.google.gravarFrases('uid-outro', [doOutroComputador]);
  const antes = { frasesLocais: await extensao.frases(), frasesNaNuvem: fakes.google.frasesDe('uid-outro') };

  fakes.google.ficarForaDoAr();
  await card(page, 'perigo').getByRole('button', { name: 'Apagar todas as 2 frases' }).click();
  if (process.env.TEST_EVIDENCE_DIR) {
    await page.screenshot({ path: path.join(process.env.TEST_EVIDENCE_DIR, 'apagar-tudo-confirmacao.png'), fullPage: true, animations: 'disabled' });
  }
  await modal(page).getByRole('button', { name: 'Apagar 2 frases' }).click();
  await expect(page.locator('#shell-chip')).toContainText('Sem sincronizar');
  const offline = await extensao.lerStorage(['frases', 'pm_deleted_ids', 'pm_apagar_tudo']);
  expect(offline.frases).toEqual([]);
  expect(offline.pm_apagar_tudo).toMatchObject({ uid: 'uid-outro', ate: expect.any(Number) });
  expect(doOutroComputador.id).toBeLessThanOrEqual(offline.pm_apagar_tudo.ate);
  if (process.env.TEST_EVIDENCE_DIR) {
    await page.screenshot({ path: path.join(process.env.TEST_EVIDENCE_DIR, 'apagar-tudo-offline.png'), fullPage: true, animations: 'disabled' });
  }

  // Minerada em qualquer computador depois de apagar tudo: essa fica.
  const depois = { id: Date.now() + 1_000, texto: 'Mined after the wipe.', data: HOJE, streaming: 'netflix', idioma: 'Inglês' };
  fakes.google.ficarForaDoAr(false);
  fakes.google.gravarFrases('uid-outro', [depois]);
  await page.reload();
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');

  await expect.poll(() => fakes.google.frasesDe('uid-outro').map(f => String(f.id))).toEqual([String(depois.id)]);
  await expect(page.locator('#shell-total')).toHaveText('1');
  // Nenhuma das apagadas volta a este computador (a nova fica na nuvem e na tela).
  expect((await extensao.frases()).filter(f => String(f.id) !== String(depois.id))).toEqual([]);
  expect(await extensao.lerStorage('pm_apagar_tudo')).toEqual({});
  expect(fakes.google.apagadasDe('uid-outro').sort()).toEqual([...frases.map(f => String(f.id)), String(doOutroComputador.id)].sort());
  if (process.env.TEST_EVIDENCE_DIR) {
    await page.locator('a[href="#frases"]').click();
    await expect(page.locator('#frases-lista .veio-frase')).toHaveCount(1);
    await expect(page.locator('#frases-lista .veio-frase')).toContainText(depois.texto);
    await page.screenshot({ path: path.join(process.env.TEST_EVIDENCE_DIR, 'apagar-tudo-recuperado.png'), fullPage: true, animations: 'disabled' });
    fs.writeFileSync(path.join(process.env.TEST_EVIDENCE_DIR, 'apagar-tudo-recuperacao.json'), JSON.stringify({
      antes,
      offline,
      recuperado: {
        armazenamento: await extensao.lerStorage(['frases', 'pm_deleted_ids', 'pm_apagar_tudo']),
        frasesNaNuvem: fakes.google.frasesDe('uid-outro'),
        tombstonesNaNuvem: fakes.google.apagadasDe('uid-outro'),
        conta: await page.locator('#shell-chip').innerText(),
      },
    }, null, 2) + '\n');
  }
});

// ─── Teclado, leitor de tela e movimento ─────────────────────────────────────

test('com movimento reduzido, o flash dos cards novos e o ponto da chave ficam parados', async ({ page, extensao }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // O flash de 1,4 s não é uma barreira de carregamento: pausa antes da navegação.
  const instante = new Date();
  await page.clock.install({ time: instante });
  await page.clock.pauseAt(new Date(instante.getTime() + 60_000));
  await extensao.gravarStorage({ geminiApiKey: CHAVE_DO_GEMINI, frases: frasesDeExemplo(2) });
  await abrirPainel(page, extensao, '#configuracoes/perigo');

  // A borda do destaque aparece, mas não anima; o ponto de “Chave salva” não pisca.
  await expect(card(page, 'perigo')).toHaveClass(/shell-card--destaque/);
  expect(await card(page, 'perigo').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await card(page, 'chave').getByRole('button', { name: 'Chave do Gemini', exact: true }).click();
  expect(await card(page, 'chave').locator('.cfg-ponto').evaluate(el => getComputedStyle(el).animationName)).toBe('none');

  // O modal abre e fecha igual, sem animação.
  await card(page, 'perigo').getByRole('button', { name: 'Apagar todas as 2 frases' }).click();
  await expect(modal(page)).toBeVisible();
  expect(await modal(page).evaluate(el => getComputedStyle(el).animationName)).toBe('none');
});

test('pelo teclado: Trocar chave, digitar e Enter; abrir o modal com Enter e confirmar com Tab', async ({ page, extensao }) => {
  await extensao.gravarStorage({ geminiApiKey: CHAVE_DO_GEMINI, frases: frasesDeExemplo(2) });
  await abrirPainel(page, extensao, '#configuracoes/chave');

  const trocar = card(page, 'chave').getByRole('button', { name: 'Trocar chave' });
  await trocar.focus();
  expect(await trocar.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.keyboard.press('Enter');
  await page.keyboard.type(OUTRA_CHAVE);
  // O campo Veio mostra o foco com o anel ouro (box-shadow), não com outline.
  expect(await campoDaChave(page).evaluate(el => getComputedStyle(el).boxShadow)).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(toast(page)).toHaveText('Chave do Gemini salva');

  await page.goto(extensao.url('painel.html#configuracoes/perigo'));
  const entrada = card(page, 'perigo').getByRole('button', { name: 'Apagar todas as 2 frases' });
  await entrada.focus();
  await page.keyboard.press('Enter');
  await expect(modal(page).getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(modal(page).getByRole('button', { name: 'Apagar 2 frases' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(toastCom(page, 'Todas as frases foram apagadas')).toBeVisible();
  await expect.poll(() => extensao.frases()).toEqual([]);
});
