'use strict';

// Boas-vindas · o passo do nível do cartão (#164, ONB-20): a pessoa escolhe o nível de cada idioma ligado na mineração automática e vê a prévia do
// Cartão desse nível, desenhada pelo Anki (a Conexão responde o exemplo do estilo). Escolher salva na hora, no mesmo lugar que Ajustes de envio ›
// Estilo do cartão (`ankiBridgePresets`). A Conexão com o Anki é falsificada na fronteira HTTP (e2e/fakes/anki.js, o contrato `exemplos-da-previa.json`).
// Os trechos de cada nível são os do Cartão de exemplo do `engine/estilos.json`.

const { test, expect } = require('../fixtures');
const { estadoFinal } = require('../estado-final');

const CHAVE = 'ankiBridgePresets';
const PREVIA = '/anki/card-preview';
const SO_O_INGLES = { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } };
const OS_DOIS = { en: { enabled: true, dailyLimit: 20 }, ru: { enabled: true, dailyLimit: 20 } };
const INICIANTE = 'Ela parou de fumar ano passado.';
const INTERMEDIARIO = 'Desistir de fazer algo, parar de tentar.';
const AVANCADO = 'To stop doing or trying something';

const lista = page => page.getByRole('navigation', { name: 'Passos da configuração' });
const itemDaLista = (page, nome) => lista(page).getByRole('button', { name: new RegExp(`^${nome}`) });
const card = page => page.locator('.bv-card');
const botaoDoCard = (page, nome) => card(page).getByRole('button', { name: nome, exact: true });
const grupo = (page, idioma) => card(page).getByRole('group', { name: idioma });
const estilo = (page, idioma) => grupo(page, idioma).getByRole('radiogroup', { name: 'Estilo do cartão' });
const nivel = (page, idioma, nome) => estilo(page, idioma).getByRole('radio', { name: nome });
// O radio do controle segmentado é invisível: a pessoa clica no rótulo.
const escolher = (page, idioma, nome) => estilo(page, idioma).locator('label', { hasText: nome }).click();
const previa = (page, idioma) => grupo(page, idioma).locator('.previa');
const cartao = (page, idioma) => previa(page, idioma).frameLocator('iframe').locator('body');
const pedidosDaPrevia = fakes => fakes.anki.requisicoes.filter(r => r.caminho === PREVIA).map(r => r.dados);

async function abrirONivel(page, extensao, { automatica = SO_O_INGLES, gravado = {} } = {}) {
  await extensao.gravarStorage({ pm_auto_miner_settings: automatica, ...gravado });
  await page.goto(extensao.url('painel.html#boas-vindas/nivel'));
  await expect(card(page).getByRole('heading', { level: 2 })).toHaveText('Escolher o nível do cartão');
}

// Exceção de teste: sem-estado-guardado — só mostra o aviso de não haver idioma ligado; nada é gravado.
test('sem idioma ligado, o passo diz onde ligar e leva à mineração automática', async ({ page, extensao }) => {
  await abrirONivel(page, extensao, { automatica: { en: { enabled: false, dailyLimit: 20 }, ru: { enabled: false, dailyLimit: 20 } } });

  await expect(card(page)).toContainText('Nenhum idioma está ligado. Ligue a mineração automática em um idioma para escolher o nível dele aqui');
  await expect(card(page).locator('.previa')).toHaveCount(0);
  await expect(card(page).getByRole('link', { name: 'Mais estilos em Ajustes de envio' })).toBeVisible();
  await botaoDoCard(page, 'Ligar a mineração automática').click();
  await expect(page).toHaveURL(/#boas-vindas\/automatica$/);
});

test('com o inglês ligado, o passo mostra o Iniciante e a prévia do Cartão; escolher o Intermediário salva o nível e troca a prévia', async ({ page, extensao, fakes }) => {
  await abrirONivel(page, extensao);

  await expect(grupo(page, 'Inglês')).toBeVisible();
  await expect(grupo(page, 'Russo')).toHaveCount(0);
  await expect(nivel(page, 'Inglês', 'Iniciante')).toBeChecked();
  await expect(previa(page, 'Inglês')).toContainText('Exemplo do Iniciante em inglês, como o Anki mostra.');
  await expect(cartao(page, 'Inglês')).toContainText(INICIANTE);
  await expect(cartao(page, 'Inglês')).toContainText('She gave up smoking last year.');
  await expect(itemDaLista(page, 'Escolher o nível do cartão')).not.toHaveAccessibleName(/feito/);

  await escolher(page, 'Inglês', 'Intermediário');
  await expect(previa(page, 'Inglês')).toContainText('Exemplo do Intermediário em inglês, como o Anki mostra.');
  await expect(cartao(page, 'Inglês')).toContainText(INTERMEDIARIO);
  await expect(cartao(page, 'Inglês')).not.toContainText(INICIANTE);

  await expect(itemDaLista(page, 'Escolher o nível do cartão')).toHaveAccessibleName(/feito$/);
  expect(pedidosDaPrevia(fakes)).toEqual([{ lang: 'en', nivel: 'iniciante' }, { lang: 'en', nivel: 'intermediario' }]);
  // Só o nível do inglês foi salvo; o russo não foi tocado (versão 0, o Iniciante).
  await estadoFinal(extensao, { [CHAVE]: { en: { nivel: 'intermediario', versao: 1 }, ru: { nivel: 'iniciante', versao: 0 } } });
});

test('a prévia tem as duas faces: a Frente só com a Frase e o botão de áudio, e o Verso com o resto do Cartão', async ({ page, extensao }) => {
  await abrirONivel(page, extensao);

  await expect(cartao(page, 'Inglês')).toContainText(INICIANTE);
  await previa(page, 'Inglês').locator('label', { hasText: 'Frente' }).click();
  await expect(cartao(page, 'Inglês')).toContainText('She gave up smoking last year.');
  await expect(cartao(page, 'Inglês')).not.toContainText(INICIANTE);
  await expect(cartao(page, 'Inglês').locator('.pm-tocar')).toHaveCount(1);
  await previa(page, 'Inglês').locator('label', { hasText: 'Verso' }).click();
  await expect(cartao(page, 'Inglês')).toContainText(INICIANTE);
  await expect(cartao(page, 'Inglês').locator('img')).toHaveAttribute('src', /^data:image\//);
  // Exceção de teste: sem-estado-guardado — só vira a face da prévia; nada é gravado.
  expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();
});

test('o Avançado diz o nome do idioma no texto, e o Cartão dele é monolíngue', async ({ page, extensao }) => {
  await abrirONivel(page, extensao);

  await escolher(page, 'Inglês', 'Avançado');
  await expect(estilo(page, 'Inglês')).toHaveAccessibleDescription('Entendo o inglês explicado em inglês');
  await expect(cartao(page, 'Inglês')).toContainText(AVANCADO);
  await estadoFinal(extensao, { [CHAVE]: { en: { nivel: 'avancado', versao: 1 } } });
});

test('com os dois idiomas ligados, cada um tem o seu nível e a sua prévia', async ({ page, extensao, fakes }) => {
  await abrirONivel(page, extensao, { automatica: OS_DOIS });

  await expect(grupo(page, 'Inglês')).toBeVisible();
  await expect(grupo(page, 'Russo')).toBeVisible();
  await expect(nivel(page, 'Russo', 'Iniciante')).toBeChecked();
  await expect(cartao(page, 'Russo')).toContainText('Я не мальчик!');
  await expect(cartao(page, 'Russo')).toContainText('Eu não sou um menino!');

  await escolher(page, 'Inglês', 'Avançado');
  await expect(cartao(page, 'Inglês')).toContainText(AVANCADO);
  await expect(itemDaLista(page, 'Escolher o nível do cartão')).not.toHaveAccessibleName(/feito/);
  await escolher(page, 'Russo', 'Intermediário');
  // O Cartão do russo no Intermediário: o verso sem a Frase, com a Palavra e a definição em inglês.
  await expect(cartao(page, 'Russo')).toContainText('To come or to arrive on foot');
  await expect(cartao(page, 'Russo')).not.toContainText('Eu não sou um menino!');
  await expect(itemDaLista(page, 'Escolher o nível do cartão')).toHaveAccessibleName(/feito$/);
  expect(pedidosDaPrevia(fakes)).toEqual(expect.arrayContaining([{ lang: 'ru', nivel: 'iniciante' }, { lang: 'en', nivel: 'avancado' }, { lang: 'ru', nivel: 'intermediario' }]));
  await estadoFinal(extensao, { [CHAVE]: { en: { nivel: 'avancado', versao: 1 }, ru: { nivel: 'intermediario', versao: 1 } } });
});

test('Tudo pronto resume o nível de cada idioma ligado', async ({ page, extensao }) => {
  await abrirONivel(page, extensao, { gravado: { [CHAVE]: { en: { nivel: 'intermediario', versao: 2 } } } });
  await expect(nivel(page, 'Inglês', 'Intermediário')).toBeChecked();
  await expect(cartao(page, 'Inglês')).toContainText(INTERMEDIARIO);

  await page.goto(extensao.url('painel.html#boas-vindas/pronto'));
  await expect(card(page).getByRole('listitem').filter({ hasText: 'Escolher o nível do cartão' })).toContainText('Inglês: Intermediário');
  await estadoFinal(extensao, { [CHAVE]: { en: { nivel: 'intermediario', versao: 2 } } });
});

test('Agora não deixa o passo para depois, sem salvar nível nenhum', async ({ page, extensao }) => {
  await abrirONivel(page, extensao);

  await botaoDoCard(page, 'Agora não').click();
  await expect(page).toHaveURL(/#boas-vindas\/chave$/);
  await expect(itemDaLista(page, 'Escolher o nível do cartão')).toHaveAccessibleName(/agora não$/);
  await estadoFinal(extensao, { pm_boas_vindas: { agoraNao: ['nivel'] } });
  expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();
});

test('Mais estilos em Ajustes de envio leva à aba dos Ajustes, onde o nível escolhido está salvo', async ({ page, extensao }) => {
  await abrirONivel(page, extensao);
  await escolher(page, 'Inglês', 'Intermediário');
  await estadoFinal(extensao, { [CHAVE]: { en: { nivel: 'intermediario' } } });

  await card(page).getByRole('link', { name: 'Mais estilos em Ajustes de envio' }).click();
  await expect(page).toHaveURL(/#anki\/ajustes$/);
  await expect(page.getByRole('form', { name: 'Ajustes de envio · Inglês' }).getByRole('radio', { name: 'Intermediário' })).toBeChecked();
  await estadoFinal(extensao, { [CHAVE]: { en: { nivel: 'intermediario', versao: 1 } } });
});

test.describe('quando a prévia não vem', () => {
  // Exceção de teste: sem-estado-guardado — a prévia é só leitura; o que falha aqui é o que aparece na tela.
  test('com a Conexão desligada, a prévia diz que precisa dela e Tentar de novo a mostra quando ela volta', async ({ page, extensao, fakes }) => {
    fakes.anki.desligar();
    await abrirONivel(page, extensao);

    await expect(previa(page, 'Inglês')).toContainText('A prévia aparece com a Conexão com o Anki ligada.');
    await expect(nivel(page, 'Inglês', 'Intermediário')).toBeEnabled();
    fakes.anki.ligar();
    await previa(page, 'Inglês').getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(cartao(page, 'Inglês')).toContainText(INICIANTE);
  });

  test('com o Anki na tela de perfis, a prévia também espera a Conexão ligada', async ({ page, extensao, fakes }) => {
    fakes.anki.abrirPerfil(null);
    await abrirONivel(page, extensao);

    await expect(previa(page, 'Inglês')).toContainText('A prévia aparece com a Conexão com o Anki ligada.');
  });

  test('uma Conexão sem a rota da prévia pede para atualizar, sem botão de tentar de novo', async ({ page, extensao, fakes }) => {
    fakes.anki.responder('POST', PREVIA, () => ({ status: 404, json: { error: 'not_found' } }));
    await abrirONivel(page, extensao);

    await expect(previa(page, 'Inglês')).toContainText('Atualize a Conexão com o Anki para ver a prévia.');
    await expect(previa(page, 'Inglês').getByRole('button', { name: 'Tentar de novo' })).toHaveCount(0);
  });

  // Exceção de teste: sem-estado-guardado — a prévia é só leitura; o que muda é o que aparece na tela.
  test('um erro da Conexão diz que não deu para montar a prévia e Tentar de novo a monta', async ({ page, extensao, fakes }) => {
    fakes.anki.responder('POST', PREVIA, () => ({ status: 500, json: { error: 'internal_error' } }));
    await abrirONivel(page, extensao);

    await expect(previa(page, 'Inglês')).toContainText('Não deu para montar a prévia. Tente de novo.');
    fakes.anki.pararDeResponder('POST', PREVIA);
    await previa(page, 'Inglês').getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(cartao(page, 'Inglês')).toContainText(INICIANTE);
  });

  test('sem a prévia, o nível ainda se escolhe e se salva', async ({ page, extensao, fakes }) => {
    fakes.anki.responder('POST', PREVIA, () => ({ status: 500, json: { error: 'internal_error' } }));
    await abrirONivel(page, extensao);

    await escolher(page, 'Inglês', 'Avançado');
    await expect(previa(page, 'Inglês')).toContainText('Não deu para montar a prévia. Tente de novo.');
    await estadoFinal(extensao, { [CHAVE]: { en: { nivel: 'avancado', versao: 1 } } });
  });
});
