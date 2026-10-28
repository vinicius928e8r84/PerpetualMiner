'use strict';

// Conexão com o Anki (#34): Baralhos e termos e Vocabulário, na
// arrumação C · Por idioma (docs/design/painel/anki/). A Conexão é o fake da
// fronteira HTTP (fakes/anki.js), com os baralhos dos Ajustes de envio padrão
// (CIMV em inglês, RUSSIAN em russo). Os testes afirmam o que a pessoa vê e o
// que fica gravado.
//
// Um bug de #9 fecha aqui, com o teste que falhava antes: o Vocabulário ficava preso em “Aguardando…” quando as
// estatísticas falhavam. O Reparar Anki saiu da extensão (#152): quem conserta é o abridor (painel-conserto.spec.js).

const { test, expect } = require('../fixtures');
const { fotografar } = require('../evidencias-mineracao');
const { estadoFinal } = require('../estado-final');

const AGORA = new Date('2026-09-18T12:00:00');
const F1 = 'A Conexão com o Anki está desligada. Ligue-a neste computador e tente de novo.';

const BARALHO_EN = { palavras: 3412, cartoes: 2140, termos: 1870, porCartao: 1.62, novos: 310, aprendendo: 20, recentes: 400, maduros: 1410 };
const BARALHO_RU = { palavras: 612, cartoes: 480, termos: 455, porCartao: 1.27, novos: 120, aprendendo: 4, recentes: 140, maduros: 216 };

const VOCABULARIO_EN = [
  { word: 'take for granted', type: 'term', maduros: 3, recentes: 1 },
  { word: 'barely', maduros: 6 },
  { word: 'reluctant', recentes: 2, novos: 1 },
  { word: 'eerie', novos: 1 },
  { word: 'cut corners', type: 'term', novos: 1 },
];
const VOCABULARIO_RU = [
  { word: 'спасибо', maduros: 5 },
  { word: 'как будто', type: 'term', maduros: 1, novos: 1 },
];

const aba = (page, nome) => page.locator('label.veio-segmentado__opcao').filter({ hasText: new RegExp(`^${nome}$`) });
const baralhos = page => page.locator('.shell-aba[data-aba="baralhos"]');
const vocabulario = page => page.locator('.shell-aba[data-aba="vocabulario"]');
const azulejosDosBaralhos = page => page.getByRole('group', { name: 'Idioma dos baralhos' });
const azulejosDoVocabulario = page => page.getByRole('group', { name: 'Idioma do vocabulário' });
const listaDoVocabulario = page => page.getByRole('listbox', { name: 'Vocabulário' });
const atualizar = page => page.getByRole('button', { name: 'Atualizar', exact: true });
const pedidos = (fakes, caminho) => fakes.anki.requisicoes.filter(r => r.caminho === caminho);

async function abrirAnki(page, extensao, hash, { jaConectou = true } = {}) {
  if (jaConectou) await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url(`painel.html${hash}`));
}

test.beforeEach(({ fakes }) => {
  fakes.anki.definirBaralho('CIMV', BARALHO_EN);
  fakes.anki.definirBaralho('RUSSIAN', BARALHO_RU);
  fakes.anki.definirVocabulario('en', VOCABULARIO_EN);
  fakes.anki.definirVocabulario('ru', VOCABULARIO_RU);
});

test('baralhos: azulejos Inglês · Russo com as palavras; o escolhido mostra o anel de maturidade e os números', async ({ page, extensao, fakes }) => {
  await abrirAnki(page, extensao, '#anki/baralhos');

  const azulejos = azulejosDosBaralhos(page).getByRole('button');
  await expect(azulejos).toHaveCount(2);
  await expect(azulejos.nth(0)).toContainText('EN · CIMV');
  await expect(azulejos.nth(0)).toContainText('Inglês');
  await expect(azulejos.nth(0)).toContainText('3.412 palavras');
  await expect(azulejos.nth(1)).toContainText('RU · RUSSIAN');
  await expect(azulejos.nth(1)).toContainText('612 palavras');
  await expect(azulejos.nth(0)).toHaveAttribute('aria-pressed', 'true');

  // Maduros sobre todos os cartões por maturidade: 1.410 de 2.140 → 66%.
  await expect(baralhos(page).getByRole('img', { name: '66% de maturidade' })).toBeVisible();
  const numeros = baralhos(page).locator('.anki-baralho dl');
  await expect(baralhos(page).locator('.anki-baralho')).toContainText('palavras diferentes nos cartões');
  await expect(numeros).toContainText('Cartões2.140');
  await expect(numeros).toContainText('Termos-alvo1.870');
  await expect(numeros).toContainText('Palavra nova por cartão1,6');
  await expect(numeros).toContainText('Maduros1.410');
  // Recentes junta os que estão aprendendo e os jovens do Anki.
  await expect(numeros).toContainText('Recentes420');
  await expect(numeros).toContainText('Novos310');

  await azulejos.nth(1).click();
  await expect(azulejos.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(azulejos.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await expect(baralhos(page).locator('.anki-baralho')).toContainText('Russo · RUSSIAN');
  await expect(numeros).toContainText('Cartões480');

  // O caminho de hoje: os dois baralhos dos Ajustes de envio numa leitura só. Entrar na área não pede à Conexão que abra o Anki.
  const leitura = pedidos(fakes, '/anki/stats/decks')[0].dados;
  expect(leitura.decks).toEqual([{ deckName: 'CIMV', lang: 'en' }, { deckName: 'RUSSIAN', lang: 'ru' }]);
  expect(leitura).not.toHaveProperty('launch');
  expect(pedidos(fakes, '/anki/vocabulary').every(r => !('launch' in r.dados))).toBe(true);
});

test('baralhos lidos do arquivo local: a nota BRG-13 no topo', async ({ page, extensao, fakes }) => {
  fakes.anki.lerBaralhosDoArquivo();
  await abrirAnki(page, extensao, '#anki/baralhos');

  await expect(baralhos(page).getByText('Números lidos direto do arquivo do Anki. Para enviar, o Anki precisa abrir normalmente.')).toBeVisible();
  await expect(azulejosDosBaralhos(page)).toContainText('3.412 palavras');
});

test('baralho que não existe: “—” e “baralho não encontrado” no azulejo, BRG-14 com Abrir Ajustes de envio', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ ankiBridgePresets: { en: { deckName: 'English Mining' } } });
  await abrirAnki(page, extensao, '#anki/baralhos');

  const ingles = azulejosDosBaralhos(page).getByRole('button').nth(0);
  await expect(ingles).toContainText('EN · English Mining');
  await expect(ingles).toContainText('—');
  await expect(ingles).toContainText('baralho não encontrado');
  await expect(baralhos(page).getByText('O baralho “English Mining” não existe no Anki. Confira o nome em Ajustes de envio.')).toBeVisible();
  await expect(baralhos(page).getByRole('img', { name: /de maturidade/ })).toHaveCount(0);

  await baralhos(page).getByRole('button', { name: 'Abrir Ajustes de envio' }).click();
  await expect(page).toHaveURL(/#anki\/ajustes$/);
  await expect(page.getByRole('radio', { name: 'Ajustes de envio' })).toBeChecked();
});

test('baralhos carregando: BRG-10 com o esqueleto', async ({ page, extensao, fakes }) => {
  let responder;
  const segurada = new Promise(r => { responder = r; });
  fakes.anki.responder('POST', '/anki/stats/decks', async (req, url) => { await segurada; return { json: { decks: [], totals: {} } }; });
  await abrirAnki(page, extensao, '#anki/baralhos');

  await expect(baralhos(page).getByRole('status').filter({ hasText: 'Lendo os baralhos do Anki…' })).toBeVisible();
  await expect(baralhos(page).locator('.veio-esqueleto').first()).toBeVisible();
  responder();
});

test('baralhos que falham: BRG-11 com Tentar de novo e a causa em Detalhes, sem Reparar Anki', async ({ page, extensao, fakes }) => {
  fakes.anki.falharBaralhos({ status: 503 });
  await abrirAnki(page, extensao, '#anki/baralhos');

  const aviso = baralhos(page).getByRole('alert').filter({ hasText: 'Não deu para ler os baralhos do Anki.' });
  await expect(aviso).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reparar Anki' })).toHaveCount(0);
  await aviso.getByText('Detalhes', { exact: true }).click();
  await expect(aviso.locator('pre')).toContainText('POST /anki/stats/decks · HTTP 503');
  await expect(azulejosDosBaralhos(page)).toBeHidden();

  fakes.anki.voltarBaralhos();
  await aviso.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(aviso).toBeHidden();
  await expect(azulejosDosBaralhos(page)).toContainText('3.412 palavras');
});

test('vocabulário: azulejos com o total de itens, lista × detalhe e as setas escolhem', async ({ page, extensao }) => {
  await abrirAnki(page, extensao, '#anki/vocabulario');

  const azulejos = azulejosDoVocabulario(page).getByRole('button');
  await expect(azulejos.nth(0)).toContainText('EN · CIMV');
  await expect(azulejos.nth(0)).toContainText('5 itens');
  await expect(azulejos.nth(1)).toContainText('2 itens');
  await expect(vocabulario(page).getByText('5 itens em inglês · mostrando 5')).toBeVisible();

  const opcoes = listaDoVocabulario(page).getByRole('option');
  await expect(opcoes).toHaveCount(5);
  await expect(opcoes.nth(0)).toContainText('take for granted');
  await expect(opcoes.nth(0)).toContainText('termo · 4 cartões');
  await expect(opcoes.nth(0)).toContainText('Misto');
  await expect(opcoes.nth(1)).toContainText('palavra · 6 cartões');
  await expect(opcoes.nth(1)).toContainText('Maduro');
  await expect(opcoes.nth(0)).toHaveAttribute('aria-selected', 'true');

  const detalhe = vocabulario(page).getByRole('region', { name: 'take for granted' });
  await expect(detalhe).toContainText('Termo · Inglês');
  await expect(detalhe.locator('dl')).toContainText('Aparece em4 cartões');
  await expect(detalhe.locator('dl')).toContainText('Maduros3');
  await expect(detalhe.locator('dl')).toContainText('Recentes1');
  await expect(detalhe.locator('dl')).toContainText('Novos0');
  await expect(detalhe.locator('dl')).toContainText('StatusMisto');

  await opcoes.nth(0).focus();
  await page.keyboard.press('ArrowDown');
  await expect(opcoes.nth(1)).toBeFocused();
  await expect(opcoes.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(vocabulario(page).getByRole('region', { name: 'barely' })).toBeVisible();
  await page.keyboard.press('End');
  await expect(opcoes.nth(4)).toBeFocused();

  await azulejos.nth(1).click();
  await expect(vocabulario(page).getByText('2 itens em russo · mostrando 2')).toBeVisible();
  await expect(listaDoVocabulario(page).getByRole('option').nth(0)).toContainText('спасибо');
});

test('vocabulário: tipo, status e busca filtram a lista; sem resultado, BRG-21 com Limpar busca', async ({ page, extensao }) => {
  await abrirAnki(page, extensao, '#anki/vocabulario');
  const opcoes = listaDoVocabulario(page).getByRole('option');
  await expect(opcoes).toHaveCount(5);

  await page.getByRole('combobox', { name: 'Tipo' }).selectOption({ label: 'Só termos' });
  await expect(opcoes).toHaveCount(2);
  await expect(vocabulario(page).getByText('5 itens em inglês · mostrando 2')).toBeVisible();

  await page.getByRole('combobox', { name: 'Status' }).selectOption({ label: 'Novos' });
  await expect(opcoes).toHaveCount(1);
  await expect(opcoes.first()).toContainText('cut corners');

  await page.getByRole('combobox', { name: 'Tipo' }).selectOption({ label: 'Palavras e termos' });
  await page.getByRole('combobox', { name: 'Status' }).selectOption({ label: 'Todos' });
  await page.getByRole('searchbox', { name: 'Buscar no vocabulário' }).fill('BAR');
  await expect(opcoes).toHaveCount(1);
  await expect(opcoes.first()).toContainText('barely');

  await page.getByRole('searchbox', { name: 'Buscar no vocabulário' }).fill('zzz');
  await expect(listaDoVocabulario(page)).toHaveCount(0);
  const vazio = vocabulario(page).locator('.veio-vazio');
  await expect(vazio).toContainText('Nenhum item com esta busca.');
  await expect(vazio).toContainText('Mude os filtros ou limpe a busca.');

  await vazio.getByRole('button', { name: 'Limpar busca' }).click();
  await expect(opcoes).toHaveCount(5);
  await expect(page.getByRole('searchbox', { name: 'Buscar no vocabulário' })).toHaveValue('');
  await expect(page.getByRole('searchbox', { name: 'Buscar no vocabulário' })).toBeFocused();
});

test('vocabulário carregando: BRG-19 com o esqueleto', async ({ page, extensao, fakes }) => {
  let responder;
  const segurada = new Promise(r => { responder = r; });
  fakes.anki.responder('POST', '/anki/vocabulary', async () => { await segurada; return { json: { words: [] } }; });
  await abrirAnki(page, extensao, '#anki/vocabulario');

  await expect(vocabulario(page).getByRole('status').filter({ hasText: 'Lendo o vocabulário…' })).toBeVisible();
  await expect(vocabulario(page).locator('.veio-esqueleto').first()).toBeVisible();
  responder();
});

test('baralhos que falham não prendem o vocabulário: ele carrega sozinho (#9)', async ({ page, extensao, fakes }) => {
  fakes.anki.falharBaralhos({ status: 503 });
  await abrirAnki(page, extensao, '#anki/vocabulario');

  await expect(listaDoVocabulario(page).getByRole('option')).toHaveCount(5);
  await expect(vocabulario(page)).not.toContainText('Aguardando');
});

test('vocabulário que falha: BRG-20 com Tentar de novo, em vez de ficar em “Aguardando…” (#9)', async ({ page, extensao, fakes }) => {
  fakes.anki.falharBaralhos({ status: 503 });
  fakes.anki.falharVocabulario({ status: 503 });
  await abrirAnki(page, extensao, '#anki/vocabulario');

  const aviso = vocabulario(page).getByRole('alert').filter({ hasText: 'Não deu para carregar o vocabulário.' });
  await expect(aviso).toBeVisible();
  await expect(vocabulario(page)).not.toContainText('Aguardando');
  await aviso.getByText('Detalhes', { exact: true }).click();
  await expect(aviso.locator('pre')).toContainText('POST /anki/vocabulary · HTTP 503');

  fakes.anki.voltarVocabulario();
  await aviso.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(aviso).toBeHidden();
  await expect(listaDoVocabulario(page).getByRole('option')).toHaveCount(5);
});

test('cai depois de responder: baralhos e vocabulário mostram o último dado com BRG-12', async ({ page, extensao, fakes }) => {
  await abrirAnki(page, extensao, '#anki/vocabulario');
  await expect(listaDoVocabulario(page).getByRole('option')).toHaveCount(5);
  await aba(page, 'Baralhos e termos').click();
  await expect(azulejosDosBaralhos(page)).toContainText('3.412 palavras');

  fakes.anki.desligar();
  await page.clock.setFixedTime(new Date(AGORA.getTime() + 2 * 3600_000));
  await page.reload();

  await expect(page.getByText(F1)).toBeVisible();
  await expect(baralhos(page)).toContainText('Anki fechado. Mostrando dados de há 2 h.');
  await expect(baralhos(page)).not.toContainText('Não deu para atualizar agora');
  await expect(azulejosDosBaralhos(page)).toContainText('3.412 palavras');

  await aba(page, 'Vocabulário').click();
  await expect(vocabulario(page)).toContainText('Anki fechado. Mostrando dados de há 2 h.');
  await expect(listaDoVocabulario(page).getByRole('option')).toHaveCount(5);
  // A busca continua valendo sobre o último dado.
  await page.getByRole('searchbox', { name: 'Buscar no vocabulário' }).fill('eerie');
  await expect(listaDoVocabulario(page).getByRole('option')).toHaveCount(1);
});

test('com a Conexão desligada, entrar na área e a Conexão voltar não pedem para abrir o Anki; sem nenhuma leitura, as duas abas esperam o Anki', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirAnki(page, extensao, '#anki/baralhos');

  await expect(page.getByText(F1)).toBeVisible();
  await expect(baralhos(page)).toContainText('— esperando o Anki');
  await expect(baralhos(page)).toContainText('Começa depois que o Anki abrir uma vez.');
  await expect(baralhos(page)).not.toContainText('Mostrando dados');
  await aba(page, 'Vocabulário').click();
  await expect(vocabulario(page)).toContainText('— esperando o Anki');
  await expect(vocabulario(page)).toContainText('Começa depois que o Anki abrir uma vez.');
  await expect(vocabulario(page).getByRole('listbox')).toHaveCount(0);
  expect(pedidos(fakes, '/anki/stats/decks')).toHaveLength(0);

  // A Conexão volta (a F1, Tentar de novo): os dados chegam, e a leitura não pediu para abrir o Anki.
  fakes.anki.ligar();
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(listaDoVocabulario(page).getByRole('option')).toHaveCount(5);
  await expect(vocabulario(page)).not.toContainText('esperando o Anki');
  await expect.poll(() => pedidos(fakes, '/anki/stats/decks').length).toBeGreaterThan(0);
  expect(pedidos(fakes, '/anki/stats/decks').every(r => !('launch' in r.dados))).toBe(true);
});

test('Conexão ligada mas o Anki fechado: baralhos e vocabulário vêm do arquivo, com “Anki fechado” e os dados de antes de ele fechar; abrir o Anki tira o selo', async ({ page, extensao, fakes }) => {
  await abrirAnki(page, extensao, '#anki/baralhos');
  await expect(azulejosDosBaralhos(page)).toContainText('3.412 palavras');
  await aba(page, 'Vocabulário').click();
  await expect(listaDoVocabulario(page).getByRole('option')).toHaveCount(5);
  await expect(page.getByText(/Anki fechado/)).toHaveCount(0);

  // Duas horas depois o Anki está fechado e a Conexão segue ligada: ela lê o arquivo, que ainda é o de 12:00.
  fakes.anki.fecharOAnki();
  await page.clock.setFixedTime(new Date(AGORA.getTime() + 2 * 3600_000));
  await page.reload();

  await expect(page.getByText(F1)).toBeHidden();
  await expect(vocabulario(page)).toContainText('Anki fechado. Mostrando dados de há 2 h.');
  await expect(listaDoVocabulario(page).getByRole('option')).toHaveCount(5);
  await aba(page, 'Baralhos e termos').click();
  await expect(baralhos(page)).toContainText('Números lidos direto do arquivo do Anki.');
  await expect(baralhos(page)).toContainText('Anki fechado. Mostrando dados de há 2 h.');
  await expect(azulejosDosBaralhos(page)).toContainText('3.412 palavras');
  expect(pedidos(fakes, '/anki/stats/decks').slice(1).every(r => !('launch' in r.dados))).toBe(true);

  // O Anki abre e a pessoa aperta Atualizar: a leitura volta a ser do Anki, sem o selo.
  fakes.anki.abrirOAnki();
  await atualizar(page).click();
  await expect(baralhos(page)).not.toContainText('Anki fechado');
  await aba(page, 'Vocabulário').click();
  await expect(vocabulario(page)).not.toContainText('Anki fechado');
});

const lerGravado = async (extensao, chave) => (await extensao.lerStorage(chave))[chave];

test('Conexão ligada com o Anki aberto mas sem o AnkiConnect: o arquivo é lido (BRG-13) e a tela não diz que o Anki está fechado', async ({ page, extensao, fakes }) => {
  fakes.anki.ankiAbertoSemAnkiConnect();
  await abrirAnki(page, extensao, '#anki/baralhos');

  await expect(baralhos(page)).toContainText('Números lidos direto do arquivo do Anki.');
  await expect(azulejosDosBaralhos(page)).toContainText('3.412 palavras');
  await aba(page, 'Vocabulário').click();
  await expect(listaDoVocabulario(page).getByRole('option')).toHaveCount(5);
  await expect(page.getByText(/Anki fechado/)).toHaveCount(0);
  // O que fica guardado diz de onde veio e que o Anki não foi dado como fechado.
  for (const chave of ['pm_anki_baralhos', 'pm_anki_vocabulario']) {
    expect(await lerGravado(extensao, chave)).toMatchObject({ ankiFechado: false });
  }
});

test('Atualizar com o Anki fechado renova a idade dos dados na tela: a leitura de 2 h depois diz “há 2 h” e a de 4 h, “há 4 h”, sem recarregar', async ({ page, extensao, fakes }) => {
  await abrirAnki(page, extensao, '#anki/baralhos');
  await expect(azulejosDosBaralhos(page)).toContainText('3.412 palavras');
  await aba(page, 'Vocabulário').click();
  await expect(listaDoVocabulario(page).getByRole('option')).toHaveCount(5);

  fakes.anki.fecharOAnki();
  await page.clock.setFixedTime(new Date(AGORA.getTime() + 2 * 3600_000));
  await page.reload();
  await expect(vocabulario(page)).toContainText('Anki fechado. Mostrando dados de há 2 h.');
  await aba(page, 'Baralhos e termos').click();
  await expect(baralhos(page)).toContainText('Anki fechado. Mostrando dados de há 2 h.');

  await page.clock.setFixedTime(new Date(AGORA.getTime() + 4 * 3600_000));
  await atualizar(page).click();
  await expect(baralhos(page)).toContainText('Anki fechado. Mostrando dados de há 4 h.');
  await aba(page, 'Vocabulário').click();
  await expect(vocabulario(page)).toContainText('Anki fechado. Mostrando dados de há 4 h.');
  // Lido de novo quatro horas depois, os dados seguem sendo os de 12:00, antes de o Anki fechar.
  for (const chave of ['pm_anki_baralhos', 'pm_anki_vocabulario']) {
    expect(await lerGravado(extensao, chave)).toMatchObject({
      quando: AGORA.getTime() + 4 * 3600_000, dadosDe: AGORA.getTime(), ankiFechado: true,
    });
  }
});

test('trocar o Baralho com o Anki fechado: o Baralho novo não herda a idade do antigo', async ({ page, extensao, fakes }) => {
  fakes.anki.definirBaralho('Mining EN', { ...BARALHO_EN, palavras: 99 });
  await abrirAnki(page, extensao, '#anki/baralhos');
  await expect(azulejosDosBaralhos(page)).toContainText('3.412 palavras');
  await aba(page, 'Vocabulário').click();
  await expect(listaDoVocabulario(page).getByRole('option')).toHaveCount(5);

  fakes.anki.fecharOAnki();
  const duasHorasDepois = new Date(AGORA.getTime() + 2 * 3600_000);
  await page.clock.setFixedTime(duasHorasDepois);
  await page.goto(extensao.url('painel.html#anki/ajustes'));
  await page.getByRole('textbox', { name: 'Baralho' }).fill('Mining EN');
  await page.getByRole('button', { name: 'Salvar ajustes' }).click();

  await aba(page, 'Baralhos e termos').click();
  await expect(azulejosDosBaralhos(page).getByRole('button').nth(0)).toContainText('99 palavras');
  // Nenhuma leitura de “Mining EN” existia: a referência é a deste momento, não a das 12:00 do CIMV.
  await expect(baralhos(page)).toContainText('Anki fechado. Mostrando dados de agora.');
  await aba(page, 'Vocabulário').click();
  await expect(vocabulario(page)).toContainText('Anki fechado. Mostrando dados de agora.');
  for (const chave of ['pm_anki_baralhos', 'pm_anki_vocabulario']) {
    expect(await lerGravado(extensao, chave)).toMatchObject({ dadosDe: duasHorasDepois.getTime(), ankiFechado: true });
  }
  expect((await lerGravado(extensao, 'pm_anki_baralhos')).nomes).toEqual({ en: 'Mining EN', ru: 'RUSSIAN' });
});

test('o último dado que a própria Conexão guardou (stale) segue com “Não deu para atualizar agora”, sem o Anki fechado', async ({ page, extensao, fakes }) => {
  fakes.anki.responder('POST', '/anki/stats/decks', () => ({
    json: {
      generatedAt: new Date(AGORA.getTime() - 3 * 3600_000).toISOString(),
      stale: true,
      source: 'ankiconnect',
      decks: [
        { deckName: 'CIMV', lang: 'en', cards: 10, uniqueTermTokens: 77, vocabulary: { phraseVocabulary: 77 }, new: 1, learning: 0, young: 2, mature: 7 },
        { deckName: 'RUSSIAN', lang: 'ru', cards: 5, uniqueTermTokens: 12, vocabulary: { phraseVocabulary: 12 }, new: 1, learning: 0, young: 1, mature: 3 },
      ],
    },
  }));
  await abrirAnki(page, extensao, '#anki/baralhos');

  await expect(azulejosDosBaralhos(page)).toContainText('77 palavras');
  await expect(baralhos(page)).toContainText('Mostrando dados de há 3 h. Não deu para atualizar agora.');
  await expect(baralhos(page)).not.toContainText('Anki fechado');
});

// O que o complemento do Anki responde (os exemplos de complemento/contrato/exemplos.json, lidos também
// pelos testes do complemento) mostra os dados nas duas abas, sem passar pelos números que os outros testes montam.
test('com a coleção do contrato aberta, Baralhos e termos e Vocabulário mostram o que o complemento leu', async ({ page, extensao, fakes }) => {
  fakes.anki.abrirColecao('inglês com subbaralho');
  await extensao.gravarStorage({ ankiBridgePresets: {
    en: { deckName: 'Inglês', imageSource: '1', ttsWordTld: 'com', ttsPhraseTld: 'co.uk' },
    ru: { deckName: 'Alemão', imageSource: '1', ttsWordTld: 'ru', ttsPhraseTld: 'ru' },
  } });
  await abrirAnki(page, extensao, '#anki/baralhos');

  const azulejos = azulejosDosBaralhos(page).getByRole('button');
  await expect(azulejos.nth(0)).toContainText('EN · Inglês');
  await expect(azulejos.nth(0)).toContainText('11 palavras');
  const numeros = baralhos(page).locator('.anki-baralho dl');
  await expect(numeros).toContainText('Cartões4');
  await expect(numeros).toContainText('Termos-alvo3');
  await expect(numeros).toContainText('Maduros1');
  await expect(numeros).toContainText('Recentes2');
  await expect(numeros).toContainText('Novos1');
  await expect(azulejos.nth(1)).toContainText('baralho não encontrado');
  await fotografar(page, 'baralhos-da-colecao-do-contrato.png');

  await aba(page, 'Vocabulário').click();
  await expect(listaDoVocabulario(page).getByRole('option')).toHaveCount(12);
  await expect(listaDoVocabulario(page).getByRole('option', { name: /^gave up/ })).toBeVisible();
  await expect(vocabulario(page).locator('.shell-aviso')).toHaveCount(0);
  await fotografar(page, 'vocabulario-da-colecao-do-contrato.png');

  // O que fica gravado para as abas seguirem mostrando os dados com a Conexão desligada (BRG-12).
  const gravado = await extensao.lerStorage(['pm_anki_baralhos', 'pm_anki_vocabulario']);
  expect(gravado.pm_anki_baralhos.nomes).toEqual({ en: 'Inglês', ru: 'Alemão' });
  expect(gravado.pm_anki_baralhos.dados.source).toBe('colecao');
  expect(gravado.pm_anki_baralhos.dados.decks.map(({ deckName, cards, missing }) => ({ deckName, cards, missing }))).toEqual([
    { deckName: 'Inglês', cards: 4, missing: undefined },
    { deckName: 'Alemão', cards: 0, missing: true },
  ]);
  expect(gravado.pm_anki_vocabulario.nomes).toEqual({ en: 'Inglês', ru: 'Alemão' });
  expect(gravado.pm_anki_vocabulario.dados.en).toMatchObject({ deckName: 'Inglês', total: 12, source: 'colecao' });
  expect(gravado.pm_anki_vocabulario.dados.en.itens[0]).toMatchObject({ word: 'gave up', type: 'term', status: 'mature' });
  expect(gravado.pm_anki_vocabulario.dados.ru).toMatchObject({ deckName: 'Alemão', total: 0, itens: [] });

  // Atualizar pede de novo os dois Baralhos, com refresh e launch, e a Conexão os lê do mesmo jeito.
  await atualizar(page).click();
  await expect.poll(() => pedidos(fakes, '/anki/stats/decks').at(-1).dados.launch).toBe(true);
  expect(pedidos(fakes, '/anki/stats/decks').at(-1).dados).toEqual({
    decks: [{ deckName: 'Inglês', lang: 'en' }, { deckName: 'Alemão', lang: 'ru' }], refresh: true, launch: true,
  });
  await aba(page, 'Baralhos e termos').click();
  await expect(baralhos(page).locator('.anki-baralho dl')).toContainText('Cartões4');
  await expect(baralhos(page).locator('.shell-aviso')).toHaveCount(0);
  // Depois de Atualizar, o que fica gravado segue sendo a leitura da coleção, com os mesmos Baralhos.
  await estadoFinal(extensao, {
    pm_anki_baralhos: { nomes: { en: 'Inglês', ru: 'Alemão' }, dados: { source: 'colecao', decks: [{ deckName: 'Inglês', cards: 4 }, { deckName: 'Alemão', cards: 0, missing: true }] } },
    pm_anki_vocabulario: { nomes: { en: 'Inglês', ru: 'Alemão' }, dados: { en: { deckName: 'Inglês', total: 12, source: 'colecao' }, ru: { deckName: 'Alemão', total: 0 } } },
  });
});

// A Conexão (o /health) pode responder antes de os Ajustes de envio chegarem do storage: o primeiro
// `usarBaralhos` faz então a primeira leitura. Ela é a leitura comum, sem `refresh` nem `launch`, e não vira BRG-11.
test('a Conexão que responde antes dos Ajustes de envio não impede a primeira leitura dos Baralhos', async ({ page, extensao, fakes }) => {
  // Exceção de teste: chrome-nativo (CLAUDE.md § Testing). A ordem das respostas do storage não tem como ser pedida pela tela.
  await page.addInitScript(() => {
    const ler = chrome.storage.local.get.bind(chrome.storage.local);
    chrome.storage.local.get = (chaves, chamar) => {
      const atrasar = chaves && typeof chaves === 'object' && 'ankiBridgePresets' in chaves;
      const resposta = new Promise(resolve => setTimeout(() => ler(chaves, resolve), atrasar ? 1500 : 0));
      if (typeof chamar === 'function') { resposta.then(chamar); return undefined; }
      return resposta;
    };
  });
  await abrirAnki(page, extensao, '#anki/baralhos');

  await expect(azulejosDosBaralhos(page)).toContainText('3.412 palavras');
  await expect(baralhos(page).locator('.shell-aviso')).toHaveCount(0);
  const leituras = pedidos(fakes, '/anki/stats/decks');
  expect(leituras.map(r => r.dados)).toEqual([{ decks: [{ deckName: 'CIMV', lang: 'en' }, { deckName: 'RUSSIAN', lang: 'ru' }] }]);
  await estadoFinal(extensao, { pm_anki_baralhos: { nomes: { en: 'CIMV', ru: 'RUSSIAN' }, dados: { decks: [{ deckName: 'CIMV', cards: 2140 }, { deckName: 'RUSSIAN', cards: 480 }] } } });
});

test('salvar outro baralho nos Ajustes de envio lê os baralhos e o vocabulário dele', async ({ page, extensao, fakes }) => {
  fakes.anki.definirBaralho('Mining EN', { ...BARALHO_EN, palavras: 99 });
  await abrirAnki(page, extensao, '#anki/ajustes');
  await page.getByRole('textbox', { name: 'Baralho' }).fill('Mining EN');
  await page.getByRole('button', { name: 'Salvar ajustes' }).click();

  await aba(page, 'Baralhos e termos').click();
  await expect(azulejosDosBaralhos(page).getByRole('button').nth(0)).toContainText('EN · Mining EN');
  await expect(azulejosDosBaralhos(page).getByRole('button').nth(0)).toContainText('99 palavras');
  await aba(page, 'Vocabulário').click();
  await expect(azulejosDoVocabulario(page).getByRole('button').nth(0)).toContainText('EN · Mining EN');
  expect(pedidos(fakes, '/anki/vocabulary').some(r => r.dados.deck === 'Mining EN')).toBe(true);
  // O Baralho novo ficou gravado nos Ajustes e nas duas leituras que as abas guardam.
  await estadoFinal(extensao, {
    ankiBridgePresets: { en: { deckName: 'Mining EN' } },
    pm_anki_baralhos: { nomes: { en: 'Mining EN', ru: 'RUSSIAN' }, dados: { decks: [{ deckName: 'Mining EN', cards: 2140, uniqueTermTokens: 99 }, { deckName: 'RUSSIAN', cards: 480 }] } },
    pm_anki_vocabulario: { nomes: { en: 'Mining EN', ru: 'RUSSIAN' } },
  });
});

test('↻ Atualizar lê de novo os baralhos (abrindo o Anki se precisar) e o vocabulário', async ({ page, extensao, fakes }) => {
  await abrirAnki(page, extensao, '#anki/vocabulario');
  await expect(listaDoVocabulario(page).getByRole('option')).toHaveCount(5);
  fakes.anki.definirVocabulario('en', [...VOCABULARIO_EN, 'harbor']);

  await atualizar(page).click();

  await expect(listaDoVocabulario(page).getByRole('option')).toHaveCount(6);
  const ultima = pedidos(fakes, '/anki/stats/decks').at(-1).dados;
  expect(ultima.refresh).toBe(true);
  expect(ultima.launch).toBe(true);
  // A leitura de depois de Atualizar é a que fica gravada: o vocabulário novo, com o baralho de sempre.
  await estadoFinal(extensao, { pm_anki_vocabulario: { nomes: { en: 'CIMV', ru: 'RUSSIAN' }, dados: { en: { deckName: 'CIMV', total: 6 } } } });
});

test('azulejos, filtros e lista têm nome e foco visível', async ({ page, extensao }) => {
  await abrirAnki(page, extensao, '#anki/vocabulario');
  await expect(listaDoVocabulario(page).getByRole('option')).toHaveCount(5);

  const ingles = azulejosDoVocabulario(page).getByRole('button').nth(0);
  await ingles.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(ingles).toBeFocused();
  await expect(ingles).toHaveCSS('outline-style', 'solid');

  const busca = page.getByRole('searchbox', { name: 'Buscar no vocabulário' });
  await busca.focus();
  await expect(busca).toBeFocused();
  const opcao = listaDoVocabulario(page).getByRole('option').first();
  await opcao.focus();
  await expect(opcao).toHaveCSS('outline-style', 'solid');
});

test('um idioma sem nenhum item no vocabulário: BRG-21, sem Limpar busca (não há o que limpar)', async ({ page, extensao, fakes }) => {
  fakes.anki.definirVocabulario('ru', []);
  await abrirAnki(page, extensao, '#anki/vocabulario');
  await expect(listaDoVocabulario(page).getByRole('option')).toHaveCount(5);

  await azulejosDoVocabulario(page).getByRole('button').nth(1).click();
  await expect(vocabulario(page).getByText('0 itens em russo · mostrando 0')).toBeVisible();
  const vazio = vocabulario(page).locator('.veio-vazio');
  await expect(vazio).toContainText('Nenhum item com esta busca.');
  await expect(vazio.getByRole('button', { name: 'Limpar busca' })).toHaveCount(0);
});
