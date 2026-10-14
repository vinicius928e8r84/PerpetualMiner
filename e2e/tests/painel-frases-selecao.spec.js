'use strict';

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');
const HOJE = '18/09/2026';

function frase(id, texto, extras = {}) {
  return { id, texto, data: HOJE, streaming: 'netflix', idioma: 'Inglês', ...extras };
}

/** `n` frases de hoje, a mais nova primeiro. */
function frasesDeExemplo(n, extras = {}) {
  return Array.from({ length: n }, (_, i) =>
    frase(1_700_000_000_000 + (n - i), `Sentence number ${n - i} about the harbour.`, extras));
}

async function abrirFrases(page, extensao) {
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#frases'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Frases mineradas');
}

async function abrirFrasesSincronizado(page, extensao) {
  await abrirFrases(page, extensao);
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
}

const lista = page => page.locator('#frases-lista');
const cartoes = page => lista(page).locator('.veio-frase');
const cartao = (page, texto) => cartoes(page).filter({ hasText: texto });
const marcar = (page, texto) => cartao(page, texto).getByRole('checkbox', { name: 'Selecionar frase' });
const marcadas = page => lista(page).getByRole('checkbox', { name: 'Selecionar frase', checked: true });
const selecionarPagina = page => page.getByRole('checkbox', { name: 'Selecionar página' });
const barra = page => page.locator('#frases-barra');
const naBarra = (page, nome) => barra(page).getByRole('button', { name: nome, exact: true });
const acao = (page, texto, nome) => cartao(page, texto).getByRole('button', { name: nome, exact: true });
const modal = page => page.getByRole('dialog');
const toasts = page => page.locator('.veio-toast');
const paginas = page => page.getByRole('navigation', { name: 'Páginas' });
const filtro = (page, nome) => page.getByRole('combobox', { name: nome, exact: true });
const busca = page => page.getByRole('searchbox', { name: 'Buscar nas frases' });

test('sem seleção, só “Selecionar página”; ao marcar, a barra mostra a contagem e as ações', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(3) });
  await abrirFrases(page, extensao);

  await expect(selecionarPagina(page)).toBeVisible();
  // O rótulo está escrito à vista, não só no nome do checkbox (PAI-31).
  const rotulo = page.locator('#frases-selecao').getByText('Selecionar página', { exact: true });
  // (O “só para o leitor de tela” conta como visível para o Playwright: 1×1 px.)
  expect((await rotulo.boundingBox()).width).toBeGreaterThan(40);
  await expect(barra(page)).toBeHidden();

  await marcar(page, 'Sentence number 2 ').check();
  await expect(barra(page)).toBeVisible();
  // Na barra, o checkbox fica só com o nome para o leitor de tela.
  expect(await rotulo.boundingBox()).toMatchObject({ width: 1, height: 1 });
  await expect(barra(page)).toContainText('1 selecionada');
  for (const nome of ['Desmarcar todas', 'Editar contexto', 'Exportar .txt', 'Apagar', 'Enviar ao Anki']) {
    await expect(naBarra(page, nome)).toBeVisible();
  }
  // A página inteira não está marcada: a oferta de todas ainda não aparece.
  await expect(barra(page).getByRole('button', { name: /Selecionar todas/ })).toHaveCount(0);

  await marcar(page, 'Sentence number 3 ').check();
  await expect(barra(page)).toContainText('2 selecionadas');
  expect(await selecionarPagina(page).evaluate(el => el.indeterminate)).toBe(true);

  await naBarra(page, 'Desmarcar todas').click();
  await expect(barra(page)).toBeHidden();
  await expect(marcadas(page)).toHaveCount(0);
  await expect(selecionarPagina(page)).not.toBeChecked();
});

test('com a página inteira marcada, a barra oferece “Selecionar todas as N frases” e marca as outras páginas', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(12) });
  await abrirFrases(page, extensao);

  await selecionarPagina(page).check();
  await expect(barra(page)).toContainText('10 selecionadas');
  await naBarra(page, 'Selecionar todas as 12 frases').click();

  await expect(barra(page)).toContainText('12 selecionadas');
  await expect(barra(page).getByRole('button', { name: /Selecionar todas/ })).toHaveCount(0);
  await paginas(page).getByRole('button', { name: 'Próxima página' }).click();
  await expect(marcadas(page)).toHaveCount(2);
});

test('“Selecionar todas” conta só as frases dos filtros atuais', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    frases: [
      ...frasesDeExemplo(11),
      ...Array.from({ length: 3 }, (_, i) => frase(1_600_000_000_000 + i, `Я читаю книгу номер ${i}.`, { idioma: 'Russo' })),
    ],
  });
  await abrirFrases(page, extensao);

  await filtro(page, 'Idioma').selectOption({ label: 'Inglês' });
  await selecionarPagina(page).check();
  await naBarra(page, 'Selecionar todas as 11 frases').click();
  await expect(barra(page)).toContainText('11 selecionadas');
});

test('trocar o filtro ou a busca limpa a seleção (bug de #9)', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    frases: [
      frase(3, 'The harbour was quiet.'),
      frase(2, 'The lighthouse was dark.'),
      frase(1, 'Я читаю книгу.', { idioma: 'Russo' }),
    ],
  });
  await abrirFrases(page, extensao);

  await marcar(page, 'harbour').check();
  await expect(barra(page)).toContainText('1 selecionada');
  await filtro(page, 'Idioma').selectOption({ label: 'Inglês' });
  await expect(barra(page)).toBeHidden();
  await expect(marcadas(page)).toHaveCount(0);

  await marcar(page, 'lighthouse').check();
  await busca(page).fill('harbour');
  await expect(barra(page)).toBeHidden();
  await busca(page).fill('');
  await expect(marcadas(page)).toHaveCount(0);
});

test('a Fonte, o toggle de ocultar, Limpar filtros e Limpar busca também limpam a seleção', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    frases: [
      frase(3, 'The harbour was quiet.', { streaming: 'netflix' }),
      frase(2, 'The lighthouse was dark.', { streaming: 'youtube' }),
      frase(1, 'Already exported.', { streaming: 'netflix', exportadaTxt: true }),
    ],
  });
  await abrirFrases(page, extensao);

  await marcar(page, 'harbour').check();
  await filtro(page, 'Fonte').selectOption({ label: 'YouTube' });
  await expect(marcadas(page)).toHaveCount(0);

  // O toggle é o que mais esconde frase selecionada: a exportada sai da lista.
  await filtro(page, 'Fonte').selectOption({ label: 'Todas as fontes' });
  await marcar(page, 'Already exported').check();
  await page.locator('.veio-toggle').getByText('Ocultar enviadas e exportadas').click();
  await expect(barra(page)).toBeHidden();
  await expect(marcadas(page)).toHaveCount(0);

  // Limpar filtros, do vazio PAI-03.
  await filtro(page, 'Idioma').selectOption({ label: 'Russo' });
  await expect(lista(page).locator('.veio-vazio')).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await marcar(page, 'harbour').check();
  await busca(page).fill('zebra');
  // O “Limpar busca” do vazio PAI-04, não o × dentro do campo.
  await lista(page).getByRole('button', { name: 'Limpar busca' }).click();
  await expect(marcadas(page)).toHaveCount(0);
});

test('a barra gruda no topo da ilha ao rolar', async ({ page, extensao }) => {
  await page.setViewportSize({ width: 1280, height: 520 });
  await extensao.gravarStorage({ frases: frasesDeExemplo(10) });
  await abrirFrases(page, extensao);

  await marcar(page, 'Sentence number 10 ').check();
  // A linha de seleção inteira vira a barra: é ela que gruda.
  const linhaDaBarra = page.locator('#frases-selecao');
  await paginas(page).scrollIntoViewIfNeeded();
  await expect(cartao(page, 'Sentence number 10 ')).not.toBeInViewport();
  await expect(linhaDaBarra).toBeInViewport();
  expect(await linhaDaBarra.evaluate(el => getComputedStyle(el).position)).toBe('sticky');
});

test('Exportar .txt baixa as escolhidas e as marca Exportada, nunca Enviada ao Anki (bug de #9)', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(3) });
  await abrirFrases(page, extensao);

  await marcar(page, 'Sentence number 3 ').check();
  await marcar(page, 'Sentence number 1 ').check();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    naBarra(page, 'Exportar .txt').click(),
  ]);
  const conteudo = require('fs').readFileSync(await download.path(), 'utf8');
  expect(conteudo).toContain('Sentence number 3 about the harbour.');
  expect(conteudo).toContain('Sentence number 1 about the harbour.');
  expect(conteudo).not.toContain('Sentence number 2 ');

  await expect(toasts(page)).toHaveText('2 frases exportadas para .txt');
  await expect(barra(page)).toBeHidden();
  const exportada = cartao(page, 'Sentence number 3 ').locator('.veio-frase__contexto');
  await expect(exportada).toContainText('Exportada');
  await expect(exportada).not.toContainText('Enviada ao Anki');
  await expect(cartao(page, 'Sentence number 2 ').locator('.veio-frase__contexto')).not.toContainText('Exportada');

  // O que fica gravado não diz Enviada ao Anki: o `exported` é o do Envio.
  const gravadas = await extensao.frases();
  const porTexto = texto => gravadas.find(f => f.texto.startsWith(texto));
  expect(porTexto('Sentence number 3 ').status).not.toBe('exported');
  expect(porTexto('Sentence number 3 ').exportadaTxt).toBe(true);
  expect(porTexto('Sentence number 2 ').exportadaTxt).toBeUndefined();
});

test('a frase exportada depois de enviada continua Enviada ao Anki, e “Ocultar enviadas e exportadas” esconde as duas', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    frases: [
      frase(3, 'Sent and exported.', { status: 'exported', exportadaTxt: true }),
      frase(2, 'Only exported.', { exportadaTxt: true }),
      frase(1, 'Still waiting.'),
    ],
  });
  await abrirFrases(page, extensao);

  await expect(cartao(page, 'Sent and exported').locator('.veio-frase__contexto')).toContainText('Enviada ao Anki');
  await expect(cartao(page, 'Sent and exported').locator('.veio-frase__contexto')).not.toContainText('Exportada');
  await expect(cartao(page, 'Only exported').locator('.veio-frase__contexto .veio-selo--info')).toHaveText('Exportada');

  await page.locator('.veio-toggle').getByText('Ocultar enviadas e exportadas').click();
  await expect(cartoes(page)).toHaveText([/Still waiting/]);
});

test('com a conta conectada, a marca de Exportada chega à nuvem', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-exporta' });
  fakes.google.gravarFrases('uid-exporta', frasesDeExemplo(2));
  await extensao.gravarStorage({ frases: frasesDeExemplo(2) });
  await abrirFrasesSincronizado(page, extensao);

  await marcar(page, 'Sentence number 2 ').check();
  await Promise.all([page.waitForEvent('download'), naBarra(page, 'Exportar .txt').click()]);

  await expect.poll(() => fakes.google.frasesDe('uid-exporta').find(f => f.texto.startsWith('Sentence number 2 '))?.exportadaTxt).toBe(true);
  expect(fakes.google.frasesDe('uid-exporta').find(f => f.texto.startsWith('Sentence number 2 ')).status).toBeUndefined();
});

test('Apagar 1 frase pede confirmação (PAI-12); Cancelar mantém, confirmar tira sem toast', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(3) });
  await abrirFrases(page, extensao);

  await acao(page, 'Sentence number 2 ', 'Apagar frase').click();
  await expect(modal(page)).toBeVisible();
  await expect(modal(page).getByRole('heading')).toHaveText('Apagar esta frase?');
  // Sem conta, o corpo não fala dos outros computadores.
  await expect(modal(page)).toContainText('Não dá para desfazer.');
  await expect(modal(page)).not.toContainText('outros computadores');
  // O foco entra no botão seguro.
  await expect(modal(page).getByRole('button', { name: 'Cancelar' })).toBeFocused();

  await modal(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(modal(page)).toBeHidden();
  await expect(cartoes(page)).toHaveCount(3);

  await acao(page, 'Sentence number 2 ', 'Apagar frase').click();
  await modal(page).getByRole('button', { name: 'Apagar frase' }).click();
  await expect(modal(page)).toBeHidden();
  await expect(cartoes(page)).toHaveText([/Sentence number 3 /, /Sentence number 1 /]);
  await expect.poll(async () => (await extensao.frases()).map(f => f.texto))
    .toEqual(['Sentence number 3 about the harbour.', 'Sentence number 1 about the harbour.']);
  await expect(toasts(page)).toHaveCount(0);
});

test('Esc fecha o modal Apagar sem apagar nada', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(2) });
  await abrirFrases(page, extensao);

  await acao(page, 'Sentence number 2 ', 'Apagar frase').click();
  await expect(modal(page)).toHaveAttribute('aria-modal', 'true');
  await page.keyboard.press('Escape');
  await expect(modal(page)).toBeHidden();
  await expect(cartoes(page)).toHaveCount(2);
  expect(await extensao.frases()).toHaveLength(2);
});

test('com a conta conectada, o modal diz que a frase some dos outros computadores', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-apaga-um' });
  fakes.google.gravarFrases('uid-apaga-um', frasesDeExemplo(2));
  await extensao.gravarStorage({ frases: frasesDeExemplo(2) });
  await abrirFrasesSincronizado(page, extensao);

  await acao(page, 'Sentence number 2 ', 'Apagar frase').click();
  await expect(modal(page)).toContainText('Ela some também dos outros computadores conectados à sua conta. Não dá para desfazer.');
  await modal(page).getByRole('button', { name: 'Apagar frase' }).click();
  await expect.poll(() => fakes.google.frasesDe('uid-apaga-um').map(f => f.texto)).toEqual(['Sentence number 1 about the harbour.']);
});

test('Apagar a seleção usa o mesmo modal (PAI-13) e dá o toast “N frases apagadas” (PAI-14)', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(12) });
  await abrirFrases(page, extensao);

  await selecionarPagina(page).check();
  await naBarra(page, 'Selecionar todas as 12 frases').click();
  await naBarra(page, 'Apagar').click();
  await expect(modal(page).getByRole('heading')).toHaveText('Apagar 12 frases?');
  await expect(modal(page)).toContainText('Não dá para desfazer.');
  await modal(page).getByRole('button', { name: 'Apagar 12 frases' }).click();

  await expect(toasts(page)).toHaveText('12 frases apagadas');
  await expect(lista(page).locator('.veio-vazio')).toContainText('Alt+S');
  await expect(barra(page)).toBeHidden();
  await expect.poll(async () => (await extensao.frases()).length).toBe(0);
});

test('se a nuvem falha ao apagar, fica o aviso PAI-15 com Tentar de novo, que apaga da nuvem', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-falha' });
  fakes.google.gravarFrases('uid-falha', frasesDeExemplo(3));
  await extensao.gravarStorage({ frases: frasesDeExemplo(3) });
  await abrirFrasesSincronizado(page, extensao);

  fakes.google.ficarForaDoAr();
  await marcar(page, 'Sentence number 3 ').check();
  await marcar(page, 'Sentence number 1 ').check();
  await naBarra(page, 'Apagar').click();
  await modal(page).getByRole('button', { name: 'Apagar 2 frases' }).click();

  const aviso = page.getByRole('alert').filter({ hasText: 'As frases foram apagadas deste computador, mas não da nuvem.' });
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText('Elas podem voltar na próxima sincronização.');
  await expect(aviso.getByText('Detalhes')).toBeVisible();
  await expect(cartoes(page)).toHaveText([/Sentence number 2 /]);
  await expect(page.locator('#shell-chip')).toContainText('Sem sincronizar');
  // Continua depois de um tempo: é persistente, não um toast.
  await page.waitForTimeout(3000);
  await expect(aviso).toBeVisible();

  fakes.google.ficarForaDoAr(false);
  await aviso.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(aviso).toBeHidden();
  // A nuvem respondeu: o chip da conta deixa de dizer que este computador está sem sincronizar.
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
  await expect.poll(() => fakes.google.frasesDe('uid-falha').map(f => f.texto)).toEqual(['Sentence number 2 about the harbour.']);
});

test('a seleção de uma frase só fala como a do cartão: “Apagar esta frase?” e sem toast', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(3) });
  await abrirFrases(page, extensao);

  await marcar(page, 'Sentence number 2 ').check();
  await naBarra(page, 'Apagar').click();
  await expect(modal(page).getByRole('heading')).toHaveText('Apagar esta frase?');
  await modal(page).getByRole('button', { name: 'Apagar frase' }).click();

  await expect(cartoes(page)).toHaveText([/Sentence number 3 /, /Sentence number 1 /]);
  await expect(toasts(page)).toHaveCount(0);
});

test('Editar texto troca o texto por um campo no lugar: Enter salva, sem toast', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(2) });
  await abrirFrases(page, extensao);

  await acao(page, 'Sentence number 2 ', 'Editar texto').click();
  const campo = lista(page).getByRole('textbox', { name: 'Texto da frase' });
  await expect(campo).toBeFocused();
  await expect(campo).toHaveValue('Sentence number 2 about the harbour.');
  await expect(lista(page).getByText('Enter salva · Esc cancela')).toBeVisible();
  await expect(lista(page).getByRole('button', { name: 'Cancelar' })).toBeVisible();
  await expect(lista(page).getByRole('button', { name: 'Salvar texto' })).toBeVisible();

  await campo.fill('The ferry left at dawn.');
  await campo.press('Enter');

  await expect(cartao(page, 'The ferry left at dawn.')).toHaveCount(1);
  await expect(campo).toHaveCount(0);
  await expect.poll(async () => (await extensao.frases()).map(f => f.texto))
    .toEqual(['The ferry left at dawn.', 'Sentence number 1 about the harbour.']);
  await expect(toasts(page)).toHaveCount(0);
});

test('Editar texto: Esc cancela e o botão Cancelar também, sem gravar nada', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(1) });
  await abrirFrases(page, extensao);

  await acao(page, 'Sentence number 1 ', 'Editar texto').click();
  const campo = lista(page).getByRole('textbox', { name: 'Texto da frase' });
  await campo.fill('Something else entirely.');
  await campo.press('Escape');
  await expect(campo).toHaveCount(0);
  await expect(cartoes(page)).toHaveText([/Sentence number 1 about the harbour\./]);

  await acao(page, 'Sentence number 1 ', 'Editar texto').click();
  await campo.fill('Something else entirely.');
  await lista(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(campo).toHaveCount(0);
  await expect(cartoes(page)).toHaveText([/Sentence number 1 about the harbour\./]);
  expect((await extensao.frases())[0].texto).toBe('Sentence number 1 about the harbour.');
});

test('Editar texto: Salvar texto grava pelo mouse', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(1) });
  await abrirFrases(page, extensao);

  await acao(page, 'Sentence number 1 ', 'Editar texto').click();
  await lista(page).getByRole('textbox', { name: 'Texto da frase' }).fill('Saved with the button.');
  await lista(page).getByRole('button', { name: 'Salvar texto' }).click();
  await expect(cartoes(page)).toHaveText([/Saved with the button\./]);
  await expect.poll(async () => (await extensao.frases())[0].texto).toBe('Saved with the button.');
});

test('Editar contexto de 1 frase: o modal traz a frase e o Contexto dela, e salva sem toast', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    frases: [frase(1, 'I never take it for granted.', { contexto: { fonte: 'netflix', titulo: 'Dark', detalhe: 'T1E3' } })],
  });
  await abrirFrases(page, extensao);

  await acao(page, 'take it for granted', 'Editar contexto').click();
  await expect(modal(page).getByRole('heading')).toHaveText('Editar contexto');
  await expect(modal(page)).toContainText('I never take it for granted.');
  await expect(modal(page).getByRole('textbox', { name: 'Fonte' })).toHaveValue('netflix');
  await expect(modal(page).getByRole('textbox', { name: 'Título' })).toHaveValue('Dark');
  await expect(modal(page).getByRole('textbox', { name: 'Detalhe' })).toHaveValue('T1E3');

  await modal(page).getByRole('textbox', { name: 'Detalhe' }).fill('T1E4');
  await modal(page).getByRole('button', { name: 'Salvar contexto' }).click();

  await expect(modal(page)).toBeHidden();
  await expect(cartao(page, 'take it for granted').locator('.veio-frase__contexto')).toContainText('Dark · T1E4');
  await expect.poll(async () => (await extensao.frases())[0].contexto).toEqual({ fonte: 'netflix', titulo: 'Dark', detalhe: 'T1E4' });
  await expect(toasts(page)).toHaveCount(0);
});

test('Editar contexto de N frases: campos em branco ficam como estão, e o toast diz quantas', async ({ page, extensao }) => {
  await extensao.gravarStorage({
    frases: [
      frase(2, 'First of the book.', { streaming: 'livro', contexto: { fonte: 'livro', titulo: 'Atomic Habits', detalhe: 'Cap. 1' } }),
      frase(1, 'Second of the book.', { streaming: 'livro', contexto: { fonte: 'livro', titulo: 'Atomic Habits', detalhe: 'Cap. 2' } }),
    ],
  });
  await abrirFrases(page, extensao);

  await selecionarPagina(page).check();
  await naBarra(page, 'Editar contexto').click();
  await expect(modal(page).getByRole('heading')).toHaveText('Editar contexto de 2 frases');
  await expect(modal(page)).toContainText('Campos em branco ficam como estão');
  await expect(modal(page).getByRole('textbox', { name: 'Título' })).toHaveValue('');

  await modal(page).getByRole('textbox', { name: 'Título' }).fill('Hábitos Atômicos');
  await modal(page).getByRole('button', { name: 'Salvar contexto' }).click();

  await expect(toasts(page)).toHaveText('Contexto de 2 frases atualizado');
  await expect.poll(async () => (await extensao.frases()).map(f => f.contexto)).toEqual([
    { fonte: 'livro', titulo: 'Hábitos Atômicos', detalhe: 'Cap. 1' },
    { fonte: 'livro', titulo: 'Hábitos Atômicos', detalhe: 'Cap. 2' },
  ]);
});

test('Copiar frase põe o texto no clipboard e diz “Frase copiada”', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(2) });
  await abrirFrases(page, extensao);

  await acao(page, 'Sentence number 2 ', 'Copiar frase').click();
  await expect(toasts(page)).toHaveText('Frase copiada');
  // O Chromium não dá permissão de ler o clipboard a uma página de extensão:
  // a pessoa cola a frase na busca, e é isso que o teste confere.
  await busca(page).focus();
  await page.keyboard.press('Control+V');
  await expect(busca(page)).toHaveValue('Sentence number 2 about the harbour.');
});

test('se o copiar não vai, fica o aviso “Não deu para copiar”, com a causa em Detalhes', async ({ page, extensao }) => {
  // O clipboard recusado é o caso real: a permissão negada faz o write falhar.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('NotAllowedError: write permission denied')) },
    });
  });
  await extensao.gravarStorage({ frases: frasesDeExemplo(2) });
  await abrirFrases(page, extensao);

  await acao(page, 'Sentence number 2 ', 'Copiar frase').click();
  const aviso = page.getByRole('alert').filter({ hasText: 'Não deu para copiar' });
  await expect(aviso).toBeVisible();
  await expect(aviso.getByText('Detalhes')).toBeVisible();
  await expect(toasts(page)).toHaveCount(0);

  await aviso.getByRole('button', { name: 'Fechar' }).click();
  await expect(aviso).toHaveCount(0);
});

test('as ações do cartão aparecem ao focar pelo teclado, e os controles da barra e dos modais têm nome e foco visível', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: frasesDeExemplo(2) });
  await abrirFrases(page, extensao);

  const focoAparece = async controle => {
    await controle.focus();
    await expect(controle).toBeVisible();
    const contorno = await controle.evaluate(el => {
      const estilo = getComputedStyle(el);
      return (estilo.outlineStyle !== 'none' && parseFloat(estilo.outlineWidth) > 0) || estilo.boxShadow !== 'none';
    });
    expect(contorno, await controle.evaluate(el => el.outerHTML.slice(0, 80))).toBe(true);
  };

  // O foco pelo teclado (não o do mouse) é o que precisa aparecer.
  await page.keyboard.press('Tab');
  const apagar = acao(page, 'Sentence number 2 ', 'Apagar frase');
  await focoAparece(apagar);

  await marcar(page, 'Sentence number 2 ').check();
  await page.keyboard.press('Tab');
  for (const nome of ['Desmarcar todas', 'Editar contexto', 'Exportar .txt', 'Apagar', 'Enviar ao Anki']) {
    await focoAparece(naBarra(page, nome));
  }

  await naBarra(page, 'Apagar').click();
  await expect(modal(page)).toHaveAttribute('aria-modal', 'true');
  await expect(modal(page)).toHaveAccessibleName('Apagar esta frase?');
  await page.keyboard.press('Tab');
  await focoAparece(modal(page).getByRole('button', { name: 'Apagar frase' }));
  await page.keyboard.press('Escape');

  await naBarra(page, 'Editar contexto').click();
  for (const nome of ['Fonte', 'Título', 'Detalhe']) {
    await focoAparece(modal(page).getByRole('textbox', { name: nome }));
  }
  await focoAparece(modal(page).getByRole('button', { name: 'Salvar contexto' }));
});

test('com movimento reduzido, o toast entra parado', async ({ page, extensao }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await extensao.gravarStorage({ frases: frasesDeExemplo(2) });
  await abrirFrases(page, extensao);

  await selecionarPagina(page).check();
  await naBarra(page, 'Apagar').click();
  await modal(page).getByRole('button', { name: 'Apagar 2 frases' }).click();
  await expect(toasts(page)).toBeVisible();
  expect(await toasts(page).evaluate(el => getComputedStyle(el).animationName)).toBe('none');
});
