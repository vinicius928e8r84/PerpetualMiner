'use strict';

// Referência visual da Conexão com o Anki (#33, #35): os estados da conexão e as
// abas Custos e Ajustes de envio na arrumação C do protótipo travado
// (docs/design/painel/anki/prototipo-anki.html?variant=C). O dono revisa estas
// telas lado a lado com o protótipo; depois de aprovadas, uma mudança visual faz
// o teste falhar até alguém olhar e atualizar a referência:
//
//   cd e2e && npx playwright test painel-anki-visual --update-snapshots

const { test, expect, comOSistema, SISTEMAS } = require('../fixtures');

// #145: a primeira conexão ganhou os passos do arquivo (sem terminal). As telas abaixo marcadas `test.fixme` são PROPOSTAS: o dono
// ainda não aprovou o novo visual (CODING_STANDARDS regra 10), então as imagens novas não estão na árvore e as antigas estão no commit 59d3d04. Aprovando: tirar o `fixme` e
// `npx playwright test painel-anki-visual --update-snapshots -g "nunca conectada"`.
//
// #160: o card Teto do mês entrou em Custos; as 8 telas de Custos abaixo são `test.fixme` até o dono aprovar.
//
// #147: as telas do passo 3, Abrir o Anki sozinho (ONB-17), também são `test.fixme`.
// Aprovando: tirar o `fixme` e `npx playwright test painel-anki-visual --update-snapshots -g "passo 3"`.
//
// #146: a lista passou a ter 4 passos (Ter o Anki, ONB-18, é o 1º; o de baixar ganhou a animação do aviso, ONB-19). As quatro telas do #146 (o card do passo 1, Não tenho no Mac, a animação do aviso e os
// quadros parados com menos movimento) foram aprovadas pelo dono (#236) e são referência. As outras “nunca conectada”
// (tema claro, conectando, Pronto, Detalhes, dois minutos, janela estreita) seguem propostas do #145.

const AGORA = new Date('2026-09-18T12:00:00');

const ENVIOS = [
  {
    jobId: 'job_8f2c1a', lang: 'en', createdAt: '2026-09-18T11:00:00', status: 'completed', pedidas: 12,
    custos: { cartoes: 0.0810, escolha: 0.0021, triagem: 0.0011 }, imagens: { real: 11, sem: 1 }, economia: 0.15,
  },
  {
    jobId: 'job_7d19e0', lang: 'ru', createdAt: '2026-09-18T09:00:00', status: 'partial', pedidas: 4, enviadas: 3,
    custos: { cartoes: 0.0270, geradas: 0.0120, escolha: 0.0008, triagem: 0.0004 }, imagens: { real: 1, geradas: 2, falhas: 1 },
    lastError: 'HTTP 502 · AnkiConnect: collection is not available',
  },
  {
    jobId: 'job_77b3c9', lang: 'en', createdAt: '2026-09-17T15:00:00', status: 'completed', pedidas: 8,
    custos: { cartoes: 0.0540, geradas: 0.0240, escolha: 0.0013, triagem: 0.0007 }, imagens: { real: 5, geradas: 2, sem: 1 }, economia: 0.07,
  },
  {
    jobId: 'job_6a02ff', lang: 'en', createdAt: '2026-09-17T21:40:00', status: 'failed', pedidas: 3,
    custos: { cartoes: 0.0110 }, lastError: 'HTTP 500 · Falha ao criar job EN',
  },
  {
    jobId: 'job_5c4410', lang: 'en', createdAt: '2026-09-15T10:00:00', status: 'completed', pedidas: 30,
    custos: { cartoes: 0.1720, geradas: 0.0480, escolha: 0.0031, triagem: 0.0015 }, imagens: { real: 24, geradas: 4, sem: 2 }, economia: 0.33,
  },
];

const custos = page => page.locator('#anki-custos');
const listaDeEnvios = page => page.getByRole('listbox', { name: 'Envios recentes' });
// A sidebar é a do shell, que tem a própria referência: aqui só a ilha da área.
const ilha = page => page.locator('.shell-conteudo');

test.beforeEach(({ fakes }) => {
  fakes.anki.definirCustos(ENVIOS);
});

async function abrirAnki(page, extensao, { largura = 1280, jaConectou = true, gravado = {}, hash = '#anki/custos' } = {}) {
  await extensao.gravarStorage({ pm_anki_ja_conectou: jaConectou, ...gravado });
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: largura, height: 1100 });
  await page.goto(extensao.url(`painel.html${hash}`));
  await page.evaluate(() => document.fonts.ready);
}

test.fixme('Custos com a Conexão ligada: período, azulejos, resumo, imagens e lista × detalhe', async ({ page, extensao }) => {
  await abrirAnki(page, extensao);
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(5);

  await expect(ilha(page)).toHaveScreenshot('anki-custos.png');
});

test.fixme('o envio em parte no detalhe, com Detalhes aberto e Continuar envio', async ({ page, extensao }) => {
  await abrirAnki(page, extensao);
  await listaDeEnvios(page).getByRole('option', { name: /Envio em russo/ }).click();
  await custos(page).locator('.anki-detalhe').getByText('Detalhes', { exact: true }).click();

  await expect(ilha(page)).toHaveScreenshot('anki-envio-em-parte.png');
});

test.fixme('o Avançado aberto, com 4 casas e os IDs ligados', async ({ page, extensao }) => {
  await abrirAnki(page, extensao, { gravado: { pm_anki_quatro_casas: true, pm_anki_ids_dos_envios: true } });
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(5);
  await custos(page).getByText('Avançado', { exact: true }).click();
  await custos(page).locator('#anki-custos-avancado').scrollIntoViewIfNeeded();

  await expect(ilha(page)).toHaveScreenshot('anki-avancado.png');
});

test('conectando: a faixa neutra e o esqueleto', async ({ page, extensao, fakes }) => {
  fakes.anki.responder('GET', '/health', () => new Promise(() => {}));
  await abrirAnki(page, extensao);
  await expect(page.locator('#anki-conectando')).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('anki-conectando.png', { animations: 'disabled' });
});

// A primeira conexão (ONB-16, desenho B), comparada pelo dono com o protótipo travado
// (`prototipo-primeira-conexao.html?variant=B`). Substitui `anki-nunca-conectada`.
test('nunca conectada: a F1 e o card do passo 1 (Ter o Anki), com a lista, a pergunta e os dois quadros', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirAnki(page, extensao, { jaConectou: false });
  await expect(page.locator('#anki-primeira-vez')).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('anki-primeira-conexao-escura.png');
});

test.fixme('nunca conectada no tema claro', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirAnki(page, extensao, { jaConectou: false, gravado: { pm_tema: 'claro' } });
  await expect(page.locator('#anki-primeira-vez')).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('anki-primeira-conexao-clara.png');
});

test.fixme('nunca conectada, conectando depois de Tentar de novo: o passo 3 com o botão indisponível', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirAnki(page, extensao, { jaConectou: false });
  await expect(page.locator('#anki-primeira-vez')).toBeVisible();
  fakes.anki.ligar();
  fakes.anki.responder('GET', '/health', () => new Promise(() => {}));
  await page.locator('#shell-tentar-de-novo').click();
  await expect(page.locator('#apv-status')).toHaveText('Conectando ao Anki…');

  await expect(ilha(page)).toHaveScreenshot('anki-primeira-conexao-conectando.png', { animations: 'disabled' });
});

test.fixme('nunca conectada, na primeira resposta: o momento Pronto, com as abas ainda de fora', async ({ page, extensao, fakes, relogioParado }) => {
  fakes.anki.desligar();
  // O relógio da página é do teste: o Pronto fica na tela até ele andar. A pessoa já disse “Agora não” ao passo 3
  // (#147): com ele resolvido, o Pronto vem logo que a Conexão responde.
  await relogioParado({ em: AGORA });
  await extensao.gravarStorage({ pm_anki_ja_conectou: false, pm_abridor: { agoraNao: true } });
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('#anki-primeira-vez')).toBeVisible();
  fakes.anki.ligar();
  await page.locator('#shell-tentar-de-novo').click();
  await expect(page.locator('#apv-status')).toHaveText(/^Achei o Anki · Usuário 1 · versão /);

  await expect(ilha(page)).toHaveScreenshot('anki-primeira-conexao-pronto.png');
});

test('nunca conectada: o passo Ter o Anki com a resposta Não tenho, no Mac', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirAnki(page, extensao, { jaConectou: false });
  await expect(page.locator('#anki-primeira-vez')).toBeVisible();
  await comOSistema(page, SISTEMAS.MAC);
  await page.reload();
  await expect(page.locator('#anki-primeira-vez')).toBeVisible();
  await page.locator('#anki-primeira-vez').getByRole('button', { name: 'Não tenho' }).click();

  await expect(ilha(page)).toHaveScreenshot('anki-primeira-conexao-nao-tenho.png');
});

test('nunca conectada: a animação do aviso do Anki no passo de baixar o arquivo', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirAnki(page, extensao, { jaConectou: false });
  await expect(page.locator('#anki-primeira-vez')).toBeVisible();
  await page.locator('#anki-primeira-vez').getByRole('button', { name: 'Pôr a Conexão no Anki' }).click();

  // A animação fica parada na foto (animations: 'disabled'): o primeiro quadro é o que se vê.
  await expect(ilha(page)).toHaveScreenshot('anki-primeira-conexao-animacao.png', { animations: 'disabled' });
});

test('nunca conectada, com menos movimento: os quadros do aviso parados, lado a lado', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await abrirAnki(page, extensao, { jaConectou: false });
  await expect(page.locator('#anki-primeira-vez')).toBeVisible();
  await page.locator('#anki-primeira-vez').getByRole('button', { name: 'Pôr a Conexão no Anki' }).click();

  await expect(ilha(page)).toHaveScreenshot('anki-primeira-conexao-animacao-parada.png', { animations: 'disabled' });
});

test.fixme('nunca conectada: o Detalhes “O arquivo não abriu?” aberto, com o código do AnkiWeb que vem em breve', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirAnki(page, extensao, { jaConectou: false });
  await expect(page.locator('#anki-primeira-vez')).toBeVisible();
  await page.locator('#anki-primeira-vez').getByRole('button', { name: 'Pôr a Conexão no Anki' }).click();
  await page.locator('#anki-primeira-vez').getByText('O arquivo não abriu?', { exact: true }).click();

  await expect(ilha(page)).toHaveScreenshot('anki-primeira-conexao-detalhes.png');
});

test.fixme('nunca conectada, dois minutos sem resposta: o passo 3 com o checklist e Baixar de novo', async ({ page, extensao, fakes, relogioParado }) => {
  fakes.anki.desligar();
  // O relógio da página é do teste: os 2 minutos passam quando ele anda.
  const relogio = await relogioParado({ em: AGORA });
  await extensao.gravarStorage({ pm_anki_ja_conectou: false });
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto(extensao.url('painel.html#anki/custos'));
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('#anki-primeira-vez')).toBeVisible();
  await page.locator('#anki-primeira-vez').getByRole('button', { name: 'Reiniciar o Anki' }).click();
  await relogio.avancar(125_000);
  await expect(page.locator('#anki-primeira-vez').getByText('A Conexão com o Anki ainda não respondeu. Confira:')).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('anki-primeira-conexao-sem-resposta.png', { animations: 'disabled' });
});

test.fixme('nunca conectada na janela estreita: a lista em cima do card', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirAnki(page, extensao, { jaConectou: false, largura: 760 });
  await expect(page.locator('#anki-primeira-vez')).toBeVisible();

  await expect(page).toHaveScreenshot('anki-primeira-conexao-estreita.png', { fullPage: false });
});

// O passo 3, Abrir o Anki sozinho (#147, ONB-17): logo depois de a Conexão responder pela primeira vez.
async function abrirOPasso3(page, extensao, fakes, { largura = 1280, tema } = {}) {
  fakes.anki.desligar();
  await abrirAnki(page, extensao, { jaConectou: false, largura, gravado: tema ? { pm_tema: tema } : {} });
  await expect(page.locator('#anki-primeira-vez')).toBeVisible();
  fakes.anki.ligar();
  await page.locator('#shell-tentar-de-novo').click();
  await expect(page.locator('#apv-passo-titulo')).toHaveText('Abrir o Anki sozinho');
}

test.fixme('passo 3 da primeira conexão: Abrir o Anki sozinho, com Permitir abrir o Anki e Agora não', async ({ page, extensao, fakes }) => {
  await abrirOPasso3(page, extensao, fakes);
  await expect(ilha(page)).toHaveScreenshot('anki-primeira-conexao-abridor.png');
});

test.fixme('passo 3 esperando o aviso do Chrome', async ({ page, extensao, fakes }) => {
  await abrirOPasso3(page, extensao, fakes);
  await page.getByRole('button', { name: 'Permitir abrir o Anki' }).click();
  await expect(page.locator('#apv-abridor-status')).toHaveText('Responda ao aviso do Chrome.');
  await expect(ilha(page)).toHaveScreenshot('anki-primeira-conexao-abridor-pedindo.png', { animations: 'disabled' });
});

test.fixme('passo 3 no tema claro', async ({ page, extensao, fakes }) => {
  await abrirOPasso3(page, extensao, fakes, { tema: 'claro' });
  await expect(ilha(page)).toHaveScreenshot('anki-primeira-conexao-abridor-clara.png');
});

test.fixme('passo 3 na janela estreita', async ({ page, extensao, fakes }) => {
  await abrirOPasso3(page, extensao, fakes, { largura: 760 });
  await expect(page).toHaveScreenshot('anki-primeira-conexao-abridor-estreita.png', { fullPage: false });
});

test.describe('passo 3 com a permissão dada', () => {
  test.use({ permissaoDoAbridor: true });

  test.fixme('passo 3: o abridor não achou o Anki, com Tentar de novo e Agora não', async ({ page, extensao, fakes }) => {
    fakes.abridor.definir('nao_achei');
    await abrirOPasso3(page, extensao, fakes);
    await expect(page.locator('#apv-abridor-status')).toHaveText(/^O abridor não achou o Anki/);
    await expect(ilha(page)).toHaveScreenshot('anki-primeira-conexao-abridor-nao-achou.png');
  });

  test.fixme('passo 3: o abridor não respondeu, com o Detalhes aberto', async ({ page, extensao, fakes }) => {
    fakes.abridor.desregistrar();
    await abrirOPasso3(page, extensao, fakes);
    await expect(page.locator('#apv-abridor-status')).toHaveText(/^O abridor não respondeu/);
    await page.locator('#apv-passos .pc-abridor').getByText('Detalhes', { exact: true }).click();
    await expect(ilha(page)).toHaveScreenshot('anki-primeira-conexao-abridor-sem-resposta.png');
  });
});

test('desligada: a F1, o último dado com o selo BRG-12 e Continuar envio indisponível, sem a dica aberta', async ({ page, extensao, fakes }) => {
  await abrirAnki(page, extensao);
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(5);
  fakes.anki.desligar();
  await page.clock.setFixedTime(new Date(AGORA.getTime() + 2 * 3600_000));
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(custos(page)).toContainText('Mostrando dados de há 2 h.');
  await listaDeEnvios(page).getByRole('option', { name: /Envio em russo/ }).click();

  await expect(ilha(page)).toHaveScreenshot('anki-desligada.png');
});

test.fixme('erro na leitura: Custo indisponível e BRG-04 com Tentar de novo', async ({ page, extensao, fakes }) => {
  fakes.anki.falharCustos({ status: 503 });
  await abrirAnki(page, extensao);
  await expect(custos(page).getByRole('alert')).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('anki-erro.png');
});

test.fixme('carregando: “Somando os custos…” e o esqueleto', async ({ page, extensao, fakes }) => {
  fakes.anki.responder('POST', '/analytics/jobs', () => new Promise(() => {}));
  await abrirAnki(page, extensao);
  await expect(custos(page).getByText('Somando os custos…')).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('anki-carregando.png', { animations: 'disabled' });
});

test.fixme('vazio: BRG-22 com Ver tudo', async ({ page, extensao, fakes }) => {
  fakes.anki.definirCustos([]);
  await abrirAnki(page, extensao);
  await expect(custos(page)).toContainText('Nenhum envio neste período.');

  await expect(ilha(page)).toHaveScreenshot('anki-vazio.png');
});

test.fixme('janela estreita: tudo numa coluna, o detalhe abaixo da lista', async ({ page, extensao }) => {
  await abrirAnki(page, extensao, { largura: 760 });
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(5);

  await expect(page).toHaveScreenshot('anki-estreita.png', { fullPage: false });
});

test.fixme('o tema claro', async ({ page, extensao }) => {
  await abrirAnki(page, extensao, { gravado: { pm_tema: 'claro' } });
  await expect(listaDeEnvios(page).getByRole('option')).toHaveCount(5);

  await expect(ilha(page)).toHaveScreenshot('anki-claro.png');
});

// Os cards por idioma da variante A do protótipo (docs/design/painel/anki/prototipo-ajustes-envio.html). #174: o Avançado passou a se chamar
// “voz e sotaque do áudio”: estas telas voltam a ser propostas (`test.fixme`, sem PNG) até o dono aprovar (`painel-ajustes-voz-visual.spec.js`).

const AJUSTES = {
  ankiBridgePresets: {
    en: { deckName: 'Inglês::Mineradas', imageSource: '1', ttsWordTld: 'com', ttsPhraseTld: 'co.uk' },
    ru: { deckName: 'RUSSIAN', imageSource: '2', ttsWordTld: 'ru', ttsPhraseTld: 'ru' },
  },
};
const BARALHOS_DO_ANKI = ['CIMV', 'English Mining', 'Inglês::Mineradas', 'RUSSIAN'];
const formularioDeAjustes = page => page.getByRole('form', { name: /^Ajustes de envio · / });
const campoDoBaralho = page => formularioDeAjustes(page).getByRole('textbox', { name: 'Baralho' });
const escolhaDeBaralho = page => formularioDeAjustes(page).getByRole('combobox', { name: 'Baralho' });
const cabecaDoCard = (page, idioma) => page.locator('#ajustes-cards').getByRole('button', { name: idioma, exact: true });

/** Com a lista de baralhos do Anki (a escolha), ou sem ela (o campo de texto). */
async function abrirAjustes(page, extensao, fakes, { comLista = true, ...opcoes } = {}) {
  if (comLista) fakes.anki.definirBaralhosDoAnki(BARALHOS_DO_ANKI);
  await abrirAnki(page, extensao, { hash: '#anki/ajustes', ...opcoes, gravado: { ...AJUSTES, ...opcoes.gravado } });
  await expect(comLista ? escolhaDeBaralho(page) : campoDoBaralho(page)).toBeVisible();
}

test.fixme('Ajustes de envio: os cards e o formulário do inglês, com a escolha de baralho', async ({ page, extensao, fakes }) => {
  await abrirAjustes(page, extensao, fakes);

  await expect(ilha(page)).toHaveScreenshot('anki-ajustes.png');
});

test.fixme('Ajustes de envio: o russo com Gerada por IA e o Avançado aberto', async ({ page, extensao, fakes }) => {
  await abrirAjustes(page, extensao, fakes);
  await cabecaDoCard(page, 'Russo').click();
  await formularioDeAjustes(page).locator('summary').click();

  await expect(ilha(page)).toHaveScreenshot('anki-ajustes-russo-avancado.png');
});

test.fixme('Ajustes de envio: sem a lista do Anki, o campo de texto recusa um nível vazio', async ({ page, extensao, fakes }) => {
  await abrirAjustes(page, extensao, fakes, { comLista: false });
  await campoDoBaralho(page).fill('Inglês::');
  await page.getByRole('button', { name: 'Salvar ajustes' }).click();
  await expect(campoDoBaralho(page)).toHaveAttribute('aria-invalid', 'true');

  await expect(ilha(page)).toHaveScreenshot('anki-ajustes-invalido.png');
});

test.fixme('Ajustes de envio com a Conexão desligada: a F1 e a nota BRG-33', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirAjustes(page, extensao, fakes, { comLista: false });
  await expect(page.locator('#anki-ajustes-nota')).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('anki-ajustes-desligada.png');
});

test.fixme('Ajustes de envio: a aba desatualizada não salva e avisa', async ({ page, extensao, fakes }) => {
  await abrirAjustes(page, extensao, fakes, { comLista: false });
  await campoDoBaralho(page).fill('Da primeira aba');
  // Outra aba salvou o inglês no meio.
  await extensao.gravarStorage({ ankiBridgePresets: { ...AJUSTES.ankiBridgePresets, en: { ...AJUSTES.ankiBridgePresets.en, deckName: 'Da segunda aba', versao: 1 } } });
  await page.getByRole('button', { name: 'Salvar ajustes' }).click();
  await expect(page.locator('#ajustes-aviso').getByRole('alert')).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('anki-ajustes-desatualizada.png');
});

test.fixme('Ajustes de envio na janela estreita', async ({ page, extensao, fakes }) => {
  await abrirAjustes(page, extensao, fakes, { largura: 760 });

  await expect(page).toHaveScreenshot('anki-ajustes-estreita.png', { fullPage: false });
});

test.fixme('Ajustes de envio no tema claro', async ({ page, extensao, fakes }) => {
  await abrirAjustes(page, extensao, fakes, { gravado: { pm_tema: 'claro' } });

  await expect(ilha(page)).toHaveScreenshot('anki-ajustes-claro.png');
});
