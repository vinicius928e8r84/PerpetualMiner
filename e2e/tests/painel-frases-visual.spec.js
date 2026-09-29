'use strict';

// Referência visual da lista de Frases (#29), da seleção, das ações do cartão
// e dos modais (#30) e do Minerar frases (#31), no layout A · Cartões do
// protótipo travado (docs/design/painel/frases/prototipo-frases.html?variant=A).
// O dono revisa estas telas lado a lado com o protótipo; depois de aprovadas,
// qualquer mudança visual na lista faz o teste falhar até alguém olhar e
// atualizar a referência:
//
//   cd e2e && npx playwright test painel-frases-visual --update-snapshots
//
// A sidebar e a ilha do conteúdo têm a altura da janela e começam e terminam
// juntas; a lista rola dentro da ilha. Por isso a lista é capturada duas
// vezes: o topo, e a ilha rolada até a paginação. O que ainda for de hoje
// (.conteudo-de-hoje) fica coberto; em Frases já não sobra nada dele.

const { test, expect } = require('../fixtures');

// O cabeçalho de data sai do relógio: ele fica parado no dia das frases.
const AGORA = new Date('2026-09-18T12:00:00');

const FRASES = [
  { id: 12, texto: 'I never take it for granted.', data: '18/09/2026', streaming: 'netflix', idioma: 'Inglês', keywords: ['granted@10'], status: 'exported', contexto: { fonte: 'netflix', titulo: 'Dark', detalhe: 'T1E3' } },
  { id: 11, texto: 'She was reluctant to say anything.', data: '18/09/2026', streaming: 'youtube', idioma: 'Inglês', keywords: ['reluctant@4'], autoKeyword: true, contexto: { fonte: 'youtube', titulo: 'Vsauce', detalhe: '' } },
  { id: 10, texto: 'Он так и не сказал спасибо.', data: '18/09/2026', streaming: 'livro', idioma: 'Russo', keywords: ['спасибо@10'], contexto: { fonte: 'livro', titulo: 'Мастер и Маргарита', detalhe: 'cap. 3' } },
  { id: 9, texto: 'The meeting was put off until next week.', data: '17/09/2026', streaming: 'web', idioma: 'Inglês', keywords: ['put@6', 'off@8'], contexto: { fonte: 'web', titulo: 'The Guardian', detalhe: '' } },
  { id: 8, texto: 'Don’t beat around the bush.', data: '17/09/2026', streaming: 'pdf', idioma: 'Inglês', contexto: { fonte: 'pdf', titulo: 'Atomic Habits', detalhe: 'cap. 2' } },
  { id: 7, texto: 'You cannot have your cake and eat it.', data: '15/09/2026', streaming: 'manual', idioma: 'Inglês', keywords: ['cake@8', '|', 'eat@12'], contexto: { fonte: 'manual', titulo: '', detalhe: '' } },
  { id: 6, texto: 'Let us call it a day.', data: '15/09/2026', streaming: 'youtube', idioma: 'Inglês', status: 'exported', contexto: { fonte: 'youtube', titulo: 'Veritasium', detalhe: '' } },
  { id: 5, texto: 'He has been under the weather lately.', data: '15/09/2026', streaming: 'netflix', idioma: 'Inglês', contexto: { fonte: 'netflix', titulo: 'The Bear', detalhe: 'T2E3' } },
  { id: 4, texto: 'Мне всё равно.', data: '15/09/2026', streaming: 'youtube', idioma: 'Russo', contexto: { fonte: 'youtube', titulo: 'Russian with Max', detalhe: '' } },
  { id: 3, texto: 'The plan backfired spectacularly.', data: '15/09/2026', streaming: 'web', idioma: 'Inglês', contexto: { fonte: 'web', titulo: 'Wikipedia', detalhe: '' } },
  { id: 2, texto: 'Keep me posted.', data: '13/09/2026', streaming: 'netflix', idioma: 'Inglês', contexto: { fonte: 'netflix', titulo: 'Succession', detalhe: 'T2E4' } },
  { id: 1, texto: 'That ship has sailed.', data: '13/09/2026', streaming: 'netflix', idioma: 'Inglês', contexto: { fonte: 'netflix', titulo: 'Succession', detalhe: 'T2E1' } },
];

const paginaInteira = page => ({ fullPage: true, mask: [page.locator('.conteudo-de-hoje')] });
const naJanela = page => ({ mask: [page.locator('.conteudo-de-hoje')] });

/** O topo da lista e o fim dela, rolada até a paginação. */
async function capturarTopoEFim(page, nome) {
  await expect(page).toHaveScreenshot(`${nome}.png`, naJanela(page));
  await page.locator('.shell-conteudo').evaluate(ilha => ilha.scrollTo(0, ilha.scrollHeight));
  await expect(page.getByRole('navigation', { name: 'Páginas' })).toBeInViewport();
  await expect(page).toHaveScreenshot(`${nome}-fim.png`, naJanela(page));
}

async function abrirFrases(page, extensao, largura = 1280) {
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: largura, height: 1100 });
  await page.goto(extensao.url('painel.html#frases'));
  await expect(page.getByRole('navigation', { name: 'Navegação do painel' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test('a lista em cartões, com a sidebar larga: o topo e o fim, com a sidebar grudada', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await abrirFrases(page, extensao);
  await expect(page.locator('#frases-lista .veio-frase')).toHaveCount(10);

  await capturarTopoEFim(page, 'frases-lista');
});

test('a lista em cartões, com a sidebar em trilho: o topo e o fim', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await abrirFrases(page, extensao, 900);
  await expect(page.locator('#frases-lista .veio-frase')).toHaveCount(10);

  await capturarTopoEFim(page, 'frases-lista-trilho');
});

test('carregando (PAI-01): 5 cartões-esqueleto', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual' });
  fakes.google.segurarLeituras();
  await abrirFrases(page, extensao);
  await expect(page.locator('.veio-frase-esqueleto')).toHaveCount(5);

  await expect(page).toHaveScreenshot('frases-carregando.png', paginaInteira(page));
});

test('primeiro uso (PAI-02)', async ({ page, extensao }) => {
  await abrirFrases(page, extensao);
  await expect(page.locator('#frases-lista .veio-vazio')).toBeVisible();

  await expect(page).toHaveScreenshot('frases-primeiro-uso.png', paginaInteira(page));
});

test('filtros esconderam tudo (PAI-03)', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES.filter(f => f.status === 'exported') });
  await abrirFrases(page, extensao);
  await page.locator('.veio-toggle').getByText('Ocultar enviadas e exportadas').click();
  await expect(page.locator('#frases-lista .veio-vazio')).toBeVisible();

  await expect(page).toHaveScreenshot('frases-filtros-vazios.png', paginaInteira(page));
});

test('busca sem resultado com filtro ligado (PAI-04)', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await abrirFrases(page, extensao);
  await page.getByRole('combobox', { name: 'Idioma', exact: true }).selectOption({ label: 'Russo' });
  await page.getByRole('searchbox', { name: 'Buscar nas frases' }).fill('zebra');
  await expect(page.locator('#frases-lista .veio-vazio')).toBeVisible();

  await expect(page).toHaveScreenshot('frases-busca-vazia.png', paginaInteira(page));
});

// ─── Seleção, ações do cartão e modais (#30) ─────────────────────────────────

const primeiroCartao = page => page.locator('#frases-lista .veio-frase').first();

test('a barra contextual da seleção, com o cartão selecionado', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await abrirFrases(page, extensao);
  await primeiroCartao(page).getByRole('checkbox', { name: 'Selecionar frase' }).check();
  await expect(page.locator('#frases-barra')).toBeVisible();

  await expect(page).toHaveScreenshot('frases-barra-selecao.png', naJanela(page));
});

test('a barra com a página inteira marcada, oferecendo todas as frases', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await abrirFrases(page, extensao);
  await page.getByRole('checkbox', { name: 'Selecionar página' }).check();
  await expect(page.getByRole('button', { name: 'Selecionar todas as 12 frases' })).toBeVisible();

  await expect(page).toHaveScreenshot('frases-barra-todas.png', naJanela(page));
});

test('as 4 ações do cartão, à vista no hover', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await abrirFrases(page, extensao);
  await primeiroCartao(page).hover();
  await expect(primeiroCartao(page).getByRole('button', { name: 'Copiar frase' })).toBeVisible();

  await expect(primeiroCartao(page)).toHaveScreenshot('frases-acoes-do-cartao.png');
});

test('Editar texto no lugar (PAI-33)', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await abrirFrases(page, extensao);
  await primeiroCartao(page).getByRole('button', { name: 'Editar texto' }).click();
  await expect(page.getByRole('textbox', { name: 'Texto da frase' })).toBeVisible();

  await expect(primeiroCartao(page)).toHaveScreenshot('frases-editar-texto.png');
});

test('o modal Apagar, para 1 frase (PAI-12)', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await abrirFrases(page, extensao);
  await primeiroCartao(page).getByRole('button', { name: 'Apagar frase' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await expect(page).toHaveScreenshot('frases-modal-apagar.png', naJanela(page));
});

test('o modal Editar contexto, para a seleção (PAI-20)', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await abrirFrases(page, extensao);
  await page.getByRole('checkbox', { name: 'Selecionar página' }).check();
  await page.locator('#frases-barra').getByRole('button', { name: 'Editar contexto' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await expect(page).toHaveScreenshot('frases-modal-contexto.png', naJanela(page));
});

// ─── Minerar frases (#31) ────────────────────────────────────────────────────

const modalDeMinerar = page => page.getByRole('dialog', { name: 'Minerar frases' });

async function abrirModoDeMinerar(page, modo) {
  await page.getByRole('button', { name: 'Minerar frases' }).first().click();
  await page.getByRole('menuitem', { name: modo }).click();
  await expect(modalDeMinerar(page)).toBeVisible();
}

/** Segura a detecção da Palavra (vocabulário da Conexão com o Anki): a primeira gravação fica esperando. */
function segurarGravacoes(fakes) {
  let soltar;
  const segurada = new Promise(resolve => { soltar = resolve; });
  fakes.anki.responder('GET', '/anki/vocabulary', async () => { await segurada; return { json: { words: [] } }; });
  return soltar;
}

async function escolherArquivo(page, conteudo) {
  const [seletor] = await Promise.all([
    page.waitForEvent('filechooser'),
    modalDeMinerar(page).getByRole('button', { name: 'Escolher arquivo' }).click(),
  ]);
  await seletor.setFiles({ name: 'frases.txt', mimeType: 'text/plain', buffer: Buffer.from(conteudo, 'utf8') });
}

test('o menu Minerar frases aberto: Colar · Arquivo .txt · Foto', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await abrirFrases(page, extensao);
  await page.getByRole('button', { name: 'Minerar frases' }).first().click();
  await expect(page.getByRole('menu', { name: 'Minerar frases' })).toBeVisible();

  await expect(page).toHaveScreenshot('frases-minerar-menu.png', naJanela(page));
});

test('o modal Minerar frases em Colar, com 3 frases, Fonte e Título', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await abrirFrases(page, extensao);
  await abrirModoDeMinerar(page, /^Colar/);
  await modalDeMinerar(page).getByRole('textbox', { name: 'Frases' }).fill('Break a leg.\nKeep me posted.\nThat ship has sailed.');
  await modalDeMinerar(page).getByRole('textbox', { name: 'Fonte' }).fill('livro');
  await modalDeMinerar(page).getByRole('textbox', { name: 'Título' }).fill('Atomic Habits');

  await expect(page).toHaveScreenshot('frases-minerar-colar.png', naJanela(page));
});

test('Colar vazio (ADD-03): o erro no campo', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await abrirFrases(page, extensao);
  await abrirModoDeMinerar(page, /^Colar/);
  await modalDeMinerar(page).getByRole('button', { name: 'Minerar frases' }).click();
  await expect(modalDeMinerar(page).getByText('Cole pelo menos uma frase.')).toBeVisible();

  await expect(page).toHaveScreenshot('frases-minerar-colar-vazio.png', naJanela(page));
});

test('minerando (ADD-04): o progresso no próprio modal', async ({ page, extensao, fakes }) => {
  const soltar = segurarGravacoes(fakes);
  await extensao.gravarStorage({ frases: FRASES });
  await abrirFrases(page, extensao);
  await abrirModoDeMinerar(page, /^Colar/);
  await modalDeMinerar(page).getByRole('textbox', { name: 'Frases' }).fill('Break a leg.\nKeep me posted.\nThat ship has sailed.');
  await modalDeMinerar(page).getByRole('button', { name: 'Minerar 3 frases' }).click();
  await expect(modalDeMinerar(page).getByText('Minerando 0 de 3…')).toBeVisible();

  await expect(page).toHaveScreenshot('frases-minerar-progresso.png', naJanela(page));
  soltar();
});

test('o modal Minerar frases em Arquivo .txt', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await abrirFrases(page, extensao);
  await abrirModoDeMinerar(page, /^Arquivo/);

  await expect(page).toHaveScreenshot('frases-minerar-arquivo.png', naJanela(page));
});

test('nada novo no arquivo (ADD-09), com Fechar', async ({ page, extensao }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await abrirFrases(page, extensao);
  await abrirModoDeMinerar(page, /^Arquivo/);
  await escolherArquivo(page, 'Keep me posted.\nThat ship has sailed.\n');
  await expect(modalDeMinerar(page).locator('.minerar-resultado')).toBeVisible();

  await expect(page).toHaveScreenshot('frases-minerar-nada-novo.png', naJanela(page));
});

test('a nuvem falhou (ADD-06): o aviso persistente no topo de Frases', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: FRASES });
  await extensao.semearSessao({ uid: 'uid-visual' });
  await abrirFrases(page, extensao);
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado');
  fakes.google.recusarEscritas();
  await abrirModoDeMinerar(page, /^Colar/);
  await modalDeMinerar(page).getByRole('textbox', { name: 'Frases' }).fill('Break a leg.\nKeep me posted.');
  await modalDeMinerar(page).getByRole('button', { name: 'Minerar 2 frases' }).click();
  await expect(page.locator('#frases-avisos').getByRole('alert')).toBeVisible();

  await expect(page).toHaveScreenshot('frases-minerar-nuvem-falhou.png', {
    ...naJanela(page),
    // A lista ganha as frases coladas com o id da hora: ela já tem a própria referência.
    mask: [page.locator('#frases-lista, #frases-paginas')],
  });
});

// O lembrete “Configuração pela metade” (ONB-15, #44): a faixa ouro no topo de
// Frases, com o anel, Ocultar e Continuar configuração; na janela estreita ela
// quebra em linhas. As frases e a Conexão respondendo são 2 dos 6 passos.
test.describe('configuração pela metade (ONB-15)', () => {
  test.use({ lembreteDaConfiguracao: true });

  const faixa = page => page.getByRole('complementary', { name: /A configuração ficou pela metade: 2 de 6 passos/ });

  test('a faixa no topo de Frases', async ({ page, extensao }) => {
    await extensao.gravarStorage({ frases: FRASES });
    await abrirFrases(page, extensao);
    await expect(faixa(page)).toBeVisible();
    await expect(page.locator('#frases-lista .veio-frase')).toHaveCount(10);
    await expect(page).toHaveScreenshot('frases-configuracao-pela-metade.png', naJanela(page));
  });

  test('a faixa na janela estreita, com a sidebar em trilho', async ({ page, extensao }) => {
    await extensao.gravarStorage({ frases: FRASES });
    await abrirFrases(page, extensao, 720);
    await expect(faixa(page)).toBeVisible();
    await expect(page.locator('#frases-lista .veio-frase')).toHaveCount(10);
    await expect(page).toHaveScreenshot('frases-configuracao-pela-metade-estreita.png', naJanela(page));
  });
});
