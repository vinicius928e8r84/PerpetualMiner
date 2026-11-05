'use strict';

// Conexão com o Anki · a frente do Cartão nos Ajustes de envio (#166, Estilo do cartão › Frente): cada idioma tem a sua, Frase com áudio (o padrão),
// Ouvir primeiro, Lacuna ou Criação (#168). Salvar ajustes guarda a escolha e pede à Conexão `POST /anki/card-front`, que só reescreve o modelo de Cartão do tipo de
// nota do idioma: nenhuma nota nova, nenhum custo. A frente Imagem primeiro não entra.
//
// A Conexão com o Anki é falsificada na fronteira HTTP (e2e/fakes/anki.js, o contrato `exemplos-da-frente.json`); o teste confere o que a pessoa vê,
// o que ficou gravado (`ankiBridgePresets`, a frente que a Conexão guardou) e o que atravessou o HTTP.

const { test, expect } = require('../fixtures');
const { estadoFinal, estadoFinalEm } = require('../estado-final');
const { AGORA } = require('../apoio-do-envio');

const CHAVE = 'ankiBridgePresets';
const CAMINHO = '/anki/card-front';
const AJUSTES = {
  en: { deckName: 'Inglês', imageSource: '1', ttsWordTld: 'com', ttsPhraseTld: 'co.uk' },
  ru: { deckName: 'Русский', imageSource: '1', ttsWordTld: 'ru', ttsPhraseTld: 'ru' },
};

const formulario = (page, idioma) => page.getByRole('form', { name: idioma ? `Ajustes de envio · ${idioma}` : /^Ajustes de envio · / });
const frente = (page, idioma) => formulario(page, idioma).getByRole('radiogroup', { name: 'Frente' });
const opcao = (page, nome, idioma) => frente(page, idioma).getByRole('radio', { name: nome });
// O radio do controle segmentado é invisível: a pessoa clica no rótulo.
const escolher = (page, nome, idioma) => frente(page, idioma).locator('label', { hasText: nome }).click();
const salvar = (page, idioma) => formulario(page, idioma).getByRole('button', { name: 'Salvar ajustes' });
const situacao = (page, idioma) => formulario(page, idioma).getByRole('status');
const cabeca = (page, idioma) => page.locator('#ajustes-cards').getByRole('button', { name: idioma, exact: true });
const aviso = page => page.locator('#ajustes-aviso');
const notaDoCelular = page => formulario(page).getByText('No AnkiMobile e no AnkiDroid só o “✓ usou a palavra” funciona: a frase que você escreve não fica guardada na nota');
const pedidosDaFrente = fakes => fakes.anki.requisicoes.filter(r => r.caminho === CAMINHO).map(r => r.dados);

async function abrirAjustes(page, extensao, { gravado = {} } = {}) {
  await extensao.gravarStorage({ pm_anki_ja_conectou: true, ...gravado });
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#anki/ajustes'));
  await expect(formulario(page)).toBeVisible();
}

// Exceção de teste: sem-estado-guardado — só mostra a frente padrão e o texto dela; nada é gravado nem pedido.
test('sem nada gravado, o inglês está na Frase com áudio e as seis frentes se escolhem; Imagem primeiro não existe', async ({ page, extensao, fakes }) => {
  await abrirAjustes(page, extensao);

  await expect(frente(page)).toBeVisible();
  await expect(opcao(page, 'Frase com áudio')).toBeChecked();
  await expect(frente(page).getByRole('radio')).toHaveCount(6);
  for (const nome of ['Frase com áudio', 'Ouvir primeiro', 'Lacuna', 'Produção', 'Ditado', 'Criação']) await expect(opcao(page, nome)).toBeEnabled();
  await expect(frente(page)).toHaveAccessibleDescription('A frase e o áudio na frente');
  await expect(formulario(page)).toContainText('Todos os cartões em inglês mudam na hora, sem custo');
  await expect(situacao(page)).toHaveText('Salvo');
  await expect(notaDoCelular(page)).toBeHidden();
  expect(pedidosDaFrente(fakes)).toEqual([]);
});

test('escolher a Criação avisa que no AnkiMobile e no AnkiDroid só o “✓ usou a palavra” funciona, e o aviso some ao voltar', async ({ page, extensao, fakes }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });

  await escolher(page, 'Criação');
  await expect(opcao(page, 'Criação')).toBeChecked();
  await expect(frente(page)).toHaveAccessibleDescription('Você escreve uma frase sua com a palavra e vê, no verso, o que escreveu');
  await expect(notaDoCelular(page)).toBeVisible();
  await escolher(page, 'Lacuna');
  await expect(notaDoCelular(page)).toBeHidden();

  await escolher(page, 'Criação');
  await salvar(page).click();
  await expect(situacao(page)).toHaveText('Salvo');
  expect(pedidosDaFrente(fakes)).toEqual([{ lang: 'en', frente: 'criacao' }]);
  await estadoFinal(extensao, { [CHAVE]: { en: { frente: 'criacao', versao: 1 }, ru: { versao: 0 } } });
  await estadoFinalEm('a frente do inglês na Conexão', () => fakes.anki.frente.guardadas(), { en: 'criacao' });
});

test('escolher a Lacuna muda o texto e só vai à Conexão e ao storage em Salvar ajustes', async ({ page, extensao, fakes }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });

  await escolher(page, 'Lacuna');
  await expect(opcao(page, 'Lacuna')).toBeChecked();
  await expect(frente(page)).toHaveAccessibleDescription('A frase sem a palavra, com uma dica e sem áudio');
  await expect(situacao(page)).toHaveText('Alterações não salvas');
  expect(pedidosDaFrente(fakes)).toEqual([]);
  expect((await extensao.lerStorage(CHAVE))[CHAVE].en.frente).toBeUndefined();

  await salvar(page).click();
  await expect(situacao(page)).toHaveText('Salvo');
  expect(pedidosDaFrente(fakes)).toEqual([{ lang: 'en', frente: 'lacuna' }]);
  await estadoFinal(extensao, { [CHAVE]: { en: { frente: 'lacuna', versao: 1 }, ru: { versao: 0 } } });
  await estadoFinalEm('a frente do inglês na Conexão', () => fakes.anki.frente.guardadas(), { en: 'lacuna' });
});

for (const [nome, id, texto] of [
  ['Produção', 'producao', 'A frase em português na frente: escreva no idioma e o Anki compara'],
  ['Ditado', 'ditado', 'Só o botão de tocar e um campo: escreva o que ouviu e o Anki mostra o que errou'],
]) {
  test(`escolher ${nome} mostra o texto dele e só vai à Conexão e ao storage em Salvar ajustes`, async ({ page, extensao, fakes }) => {
    await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });

    await escolher(page, nome);
    await expect(opcao(page, nome)).toBeChecked();
    await expect(frente(page)).toHaveAccessibleDescription(texto);
    expect(pedidosDaFrente(fakes)).toEqual([]);

    await salvar(page).click();
    await expect(situacao(page)).toHaveText('Salvo');
    expect(pedidosDaFrente(fakes)).toEqual([{ lang: 'en', frente: id }]);
    await estadoFinal(extensao, { [CHAVE]: { en: { frente: id, versao: 1 }, ru: { versao: 0 } } });
    await estadoFinalEm('a frente do inglês na Conexão', () => fakes.anki.frente.guardadas(), { en: id });
  });
}

test('cada idioma tem a sua frente: Lacuna no inglês e Ouvir primeiro no russo, cada uma pedida uma vez', async ({ page, extensao, fakes }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });

  await escolher(page, 'Lacuna', 'Inglês');
  await salvar(page, 'Inglês').click();
  await expect(situacao(page, 'Inglês')).toHaveText('Salvo');
  await cabeca(page, 'Russo').click();
  await escolher(page, 'Ouvir primeiro', 'Russo');
  await expect(opcao(page, 'Ouvir primeiro', 'Russo')).toBeChecked();
  await salvar(page, 'Russo').click();
  await expect(situacao(page, 'Russo')).toHaveText('Salvo');

  expect(pedidosDaFrente(fakes)).toEqual([{ lang: 'en', frente: 'lacuna' }, { lang: 'ru', frente: 'ouvir_primeiro' }]);
  await estadoFinal(extensao, { [CHAVE]: { en: { frente: 'lacuna', versao: 1 }, ru: { frente: 'ouvir_primeiro', versao: 1 } } });
  await estadoFinalEm('a frente de cada idioma na Conexão', () => fakes.anki.frente.guardadas(), { en: 'lacuna', ru: 'ouvir_primeiro' });
});

test('salvar sem mudar a frente não pede nada à Conexão, e a frente salva fica depois de recarregar', async ({ page, extensao, fakes }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: { ...AJUSTES, en: { ...AJUSTES.en, frente: 'ouvir_primeiro', versao: 2 } } } });
  await expect(opcao(page, 'Ouvir primeiro')).toBeChecked();

  await formulario(page).getByLabel('Baralho').fill('Inglês::Séries');
  await salvar(page).click();
  await expect(situacao(page)).toHaveText('Salvo');

  expect(pedidosDaFrente(fakes)).toEqual([]);
  await estadoFinal(extensao, { [CHAVE]: { en: { deckName: 'Inglês::Séries', frente: 'ouvir_primeiro', versao: 3 } } });
  await page.reload();
  await expect(opcao(page, 'Ouvir primeiro')).toBeChecked();
});

test('voltar à Frase com áudio também é uma troca: a Conexão põe o modelo de volta', async ({ page, extensao, fakes }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: { ...AJUSTES, en: { ...AJUSTES.en, frente: 'lacuna', versao: 1 } } } });

  await escolher(page, 'Frase com áudio');
  await salvar(page).click();
  await expect(situacao(page)).toHaveText('Salvo');

  expect(pedidosDaFrente(fakes)).toEqual([{ lang: 'en', frente: 'frase_com_audio' }]);
  await estadoFinal(extensao, { [CHAVE]: { en: { frente: 'frase_com_audio', versao: 2 } } });
  await estadoFinalEm('a frente do inglês na Conexão', () => fakes.anki.frente.guardadas(), { en: 'frase_com_audio' });
});

test.describe('quando a Conexão não troca a frente', () => {
  test('com a Conexão desligada o resto é salvo, a frente fica a de antes e a escolha continua na tela até dar certo', async ({ page, extensao, fakes }) => {
    await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });
    fakes.anki.desligar();

    await escolher(page, 'Lacuna');
    await formulario(page).getByLabel('Baralho').fill('Inglês::Séries');
    await salvar(page).click();

    await expect(aviso(page)).toContainText('Os outros ajustes foram salvos, mas a frente não mudou: a Conexão com o Anki está desligada.');
    await expect(situacao(page)).toHaveText('Alterações não salvas');
    await expect(opcao(page, 'Lacuna')).toBeChecked();
    await estadoFinal(extensao, { [CHAVE]: { en: { deckName: 'Inglês::Séries', frente: 'frase_com_audio', versao: 1 } } });

    fakes.anki.ligar();
    await aviso(page).getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(situacao(page)).toHaveText('Salvo');
    await expect(aviso(page)).toBeEmpty();
    await estadoFinal(extensao, { [CHAVE]: { en: { deckName: 'Inglês::Séries', frente: 'lacuna', versao: 2 } } });
    await estadoFinalEm('a frente do inglês na Conexão', () => fakes.anki.frente.guardadas(), { en: 'lacuna' });
  });

  test('com o Anki sem perfil aberto a tela diz que o Anki não está pronto e nada muda na Conexão', async ({ page, extensao, fakes }) => {
    await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });
    fakes.anki.abrirColecao(null);

    await escolher(page, 'Lacuna');
    await salvar(page).click();

    await expect(aviso(page)).toContainText('o Anki não está pronto (sem perfil aberto, em outro perfil ou sincronizando)');
    await estadoFinal(extensao, { [CHAVE]: { en: { frente: 'frase_com_audio', versao: 1 } } });
    expect(fakes.anki.frente.guardadas()).toEqual({});
  });

  test('um tipo de nota que a pessoa mexeu no Anki não é regravado, e a tela diz o idioma', async ({ page, extensao, fakes }) => {
    await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });
    fakes.anki.frente.mexerNoTipoDeNota('en');

    await escolher(page, 'Lacuna');
    await salvar(page).click();

    await expect(aviso(page)).toContainText('o tipo de nota em inglês foi alterado no Anki e a Conexão não mexe nele');
    await estadoFinal(extensao, { [CHAVE]: { en: { frente: 'frase_com_audio', versao: 1 } } });
    expect(fakes.anki.frente.guardadas()).toEqual({});
  });
});
