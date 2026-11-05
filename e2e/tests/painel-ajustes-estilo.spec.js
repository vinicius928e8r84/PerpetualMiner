'use strict';

// Conexão com o Anki · o estilo do Cartão nos Ajustes de envio (#162, Estilo do cartão): o nível de cada idioma (Iniciante,
// Intermediário, Avançado), com o texto do nível, nos dois idiomas (o russo desde o #163). Só grava em Salvar ajustes; o Envio seguinte pede
// à Conexão o nível salvo (`nivel` no `POST /jobs`, sem ele é o Iniciante).
//
// Sob o controle fica a prévia do Cartão (#164, BRG-43): o Cartão de exemplo do nível que está na tela, desenhado pelo Anki, antes de salvar.
//
// A Conexão com o Anki é falsificada na fronteira HTTP (e2e/fakes/anki.js, o contrato `exemplos-do-nivel.json`); o teste confere o que a
// pessoa vê, o que ficou gravado (`ankiBridgePresets`, `pm_envio`) e o que atravessou o HTTP.

const { test, expect } = require('../fixtures');
const { estadoFinal } = require('../estado-final');
const { AGORA, INGLESAS, RUSSA, SACK, abrirPainel, marcarEEnviar, enviosCriados } = require('../apoio-do-envio');

const CHAVE = 'ankiBridgePresets';
const AJUSTES = {
  en: { deckName: 'Inglês', imageSource: '1', ttsWordTld: 'com', ttsPhraseTld: 'co.uk' },
  ru: { deckName: 'Русский', imageSource: '1', ttsWordTld: 'ru', ttsPhraseTld: 'ru' },
};

const formulario = (page, idioma) => page.getByRole('form', { name: idioma ? `Ajustes de envio · ${idioma}` : /^Ajustes de envio · / });
const estilo = (page, idioma) => formulario(page, idioma).getByRole('radiogroup', { name: 'Estilo do cartão' });
const nivel = (page, nome, idioma) => estilo(page, idioma).getByRole('radio', { name: nome });
// O radio do controle segmentado é invisível: a pessoa clica no rótulo.
const escolher = (page, nome, idioma) => estilo(page, idioma).locator('label', { hasText: nome }).click();
const salvar = (page, idioma) => formulario(page, idioma).getByRole('button', { name: 'Salvar ajustes' });
const situacao = (page, idioma) => formulario(page, idioma).getByRole('status');
const cabeca = (page, idioma) => page.locator('#ajustes-cards').getByRole('button', { name: idioma, exact: true });

async function abrirAjustes(page, extensao, { gravado = {} } = {}) {
  await extensao.gravarStorage({ pm_anki_ja_conectou: true, ...gravado });
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#anki/ajustes'));
  await expect(formulario(page)).toBeVisible();
}

// Exceção de teste: sem-estado-guardado — só mostra o nível padrão e o texto dele; nada é gravado.
test('sem nada gravado, o inglês está no Iniciante, com o texto do nível', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao);

  await expect(estilo(page)).toBeVisible();
  await expect(nivel(page, 'Iniciante')).toBeChecked();
  for (const nome of ['Iniciante', 'Intermediário', 'Avançado']) await expect(nivel(page, nome)).toBeEnabled();
  await expect(estilo(page)).toHaveAccessibleDescription('Não entendo nada ou só algumas palavras');
  await expect(situacao(page)).toHaveText('Salvo');
  expect((await extensao.lerStorage(CHAVE))[CHAVE]).toBeUndefined();
});

const previa = (page, idioma) => formulario(page, idioma).locator('.previa');
const cartao = (page, idioma) => previa(page, idioma).frameLocator('iframe').locator('body');

test('sob o controle fica a prévia do Cartão do nível, que muda com a escolha antes de salvar', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });

  await expect(previa(page, 'Inglês')).toContainText('Exemplo do Iniciante em inglês, como o Anki mostra.');
  await expect(cartao(page, 'Inglês')).toContainText('Ela parou de fumar ano passado.');
  await expect(cartao(page, 'Inglês')).toContainText('She gave up smoking last year.');
  await expect(formulario(page, 'Inglês').getByRole('link', { name: 'Mais estilos em Ajustes de envio' })).toHaveCount(0);

  await escolher(page, 'Intermediário');
  await expect(previa(page, 'Inglês')).toContainText('Exemplo do Intermediário em inglês, como o Anki mostra.');
  await expect(cartao(page, 'Inglês')).toContainText('Desistir de fazer algo, parar de tentar.');
  await expect(cartao(page, 'Inglês')).not.toContainText('Ela parou de fumar ano passado.');
  // Só a prévia mudou: o nível ainda é um rascunho.
  await estadoFinal(extensao, { [CHAVE]: AJUSTES });
  expect((await extensao.lerStorage(CHAVE))[CHAVE].en.nivel).toBeUndefined();

  await escolher(page, 'Avançado');
  await expect(cartao(page, 'Inglês')).toContainText('To stop doing or trying something');
  await salvar(page).click();
  await expect(situacao(page)).toHaveText('Salvo');
  await expect(cartao(page, 'Inglês')).toContainText('Pam never gave up on her dream');
  await estadoFinal(extensao, { [CHAVE]: { en: { nivel: 'avancado', versao: 1 } } });
});

test('o card do russo tem a prévia do Cartão Iniciante dele, na Frase em russo', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });
  await cabeca(page, 'Russo').click();

  await expect(previa(page, 'Russo')).toContainText('Exemplo do Iniciante em russo, como o Anki mostra.');
  await expect(cartao(page, 'Russo')).toContainText('Я не мальчик!');
  await expect(cartao(page, 'Russo')).toContainText('Eu não sou um menino!');
  // Exceção de teste: sem-estado-guardado — só mostra a prévia; nada é gravado.
  expect((await extensao.lerStorage(CHAVE))[CHAVE].ru.nivel).toBeUndefined();
});

test('escolher o Intermediário muda o texto e só grava em Salvar ajustes, sem mexer no russo', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });

  await escolher(page, 'Intermediário');
  await expect(nivel(page, 'Intermediário')).toBeChecked();
  await expect(estilo(page)).toHaveAccessibleDescription('Com legenda, entendo 30% ou mais · numa frase, só me falta uma palavra');
  await expect(situacao(page)).toHaveText('Alterações não salvas');
  await expect(salvar(page)).toHaveClass(/veio-botao--primario/);
  await estadoFinal(extensao, { [CHAVE]: AJUSTES });
  expect((await extensao.lerStorage(CHAVE))[CHAVE].en.nivel).toBeUndefined();

  await salvar(page).click();
  await expect(situacao(page)).toHaveText('Salvo');
  // O russo não foi salvo: a versão dele não subiu e o nível é o Iniciante.
  await estadoFinal(extensao, { [CHAVE]: { en: { deckName: 'Inglês', nivel: 'intermediario', versao: 1 }, ru: { deckName: 'Русский', nivel: 'iniciante', versao: 0 } } });
});

test('o Avançado diz o nome do idioma no texto, e voltar ao Iniciante grava o Iniciante', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: { ...AJUSTES, en: { ...AJUSTES.en, nivel: 'intermediario', versao: 3 } } } });
  await expect(nivel(page, 'Intermediário')).toBeChecked();

  await escolher(page, 'Avançado');
  await expect(estilo(page)).toHaveAccessibleDescription('Entendo o inglês explicado em inglês');
  await salvar(page).click();
  await estadoFinal(extensao, { [CHAVE]: { en: { nivel: 'avancado', versao: 4 } } });

  await escolher(page, 'Iniciante');
  await salvar(page).click();
  await estadoFinal(extensao, { [CHAVE]: { en: { nivel: 'iniciante', versao: 5 } } });
});

// Exceção de teste: sem-estado-guardado — só abre o card do russo e mostra os três níveis ligados; nada é gravado.
test('o russo também escolhe os três níveis, sem aviso de "só o Iniciante"', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao);
  await cabeca(page, 'Russo').click();

  await expect(nivel(page, 'Iniciante', 'Russo')).toBeChecked();
  for (const nome of ['Iniciante', 'Intermediário', 'Avançado']) await expect(nivel(page, nome, 'Russo')).toBeEnabled();
  await expect(formulario(page, 'Russo')).not.toContainText('só o Iniciante');
  await expect(estilo(page, 'Russo')).toHaveAccessibleDescription('Não entendo nada ou só algumas palavras');
});

test('escolher o Avançado no russo diz o idioma no texto e só grava no russo, em Salvar ajustes', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: AJUSTES } });
  await cabeca(page, 'Russo').click();

  await escolher(page, 'Avançado', 'Russo');
  await expect(estilo(page, 'Russo')).toHaveAccessibleDescription('Entendo o russo explicado em russo');
  await expect(situacao(page, 'Russo')).toHaveText('Alterações não salvas');
  await estadoFinal(extensao, { [CHAVE]: AJUSTES });

  await salvar(page, 'Russo').click();
  await expect(situacao(page, 'Russo')).toHaveText('Salvo');
  await estadoFinal(extensao, { [CHAVE]: { en: { deckName: 'Inglês', versao: 0 }, ru: { deckName: 'Русский', nivel: 'avancado', versao: 1 } } });
});

test('um nível gravado que nenhum idioma tem volta ao Iniciante', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao, { gravado: { [CHAVE]: { ...AJUSTES, ru: { ...AJUSTES.ru, nivel: 'nativo', versao: 2 } } } });
  await cabeca(page, 'Russo').click();

  await expect(nivel(page, 'Iniciante', 'Russo')).toBeChecked();
  await salvar(page, 'Russo').click();
  await estadoFinal(extensao, { [CHAVE]: { ru: { nivel: 'iniciante', versao: 3 } } });
});

test('o nível salvo fica depois de recarregar o painel', async ({ page, extensao }) => {
  await abrirAjustes(page, extensao);
  await escolher(page, 'Avançado');
  await salvar(page).click();
  await estadoFinal(extensao, { [CHAVE]: { en: { nivel: 'avancado' } } });

  await page.reload();
  await expect(nivel(page, 'Avançado')).toBeChecked();
  await expect(situacao(page)).toHaveText('Salvo');
});

test.describe('o Envio seguinte pede o nível salvo', () => {
  test.beforeEach(({ fakes }) => {
    fakes.anki.usarRelogio(() => AGORA);
  });

  for (const [nome, salvo, pedido] of [['Intermediário', 'intermediario', 'intermediario'], ['Avançado', 'avancado', 'avancado']]) {
    test(`com o ${nome} salvo, o Envio em inglês leva o nível e guarda o corpo`, async ({ page, extensao, fakes }) => {
      await extensao.gravarStorage({ frases: INGLESAS, [CHAVE]: { ...AJUSTES, en: { ...AJUSTES.en, nivel: salvo, versao: 1 } } });
      await abrirPainel(page, extensao);
      await marcarEEnviar(page, [SACK.texto]);

      const [envio] = await enviosCriados(fakes, 1);
      expect(envio.corpo.nivel).toBe(pedido);
      expect(envio.corpo.lang).toBe('en');
      await estadoFinal(extensao, { pm_envio: { envios: [{ corpo: { lang: 'en', nivel: pedido } }] } });
    });
  }

  test('no Iniciante, o padrão da Conexão, o Envio não leva nível nenhum', async ({ page, extensao, fakes }) => {
    await extensao.gravarStorage({ frases: INGLESAS, [CHAVE]: { ...AJUSTES, en: { ...AJUSTES.en, nivel: 'iniciante', versao: 1 } } });
    await abrirPainel(page, extensao);
    await marcarEEnviar(page, [SACK.texto]);

    const [envio] = await enviosCriados(fakes, 1);
    expect('nivel' in envio.corpo).toBe(false);
    await estadoFinal(extensao, { pm_envio: { envios: [{ corpo: { lang: 'en' } }] } });
  });

  test('com o Intermediário salvo, o Envio em russo leva o nível e guarda o corpo', async ({ page, extensao, fakes }) => {
    await extensao.gravarStorage({ frases: [RUSSA], [CHAVE]: { ...AJUSTES, ru: { ...AJUSTES.ru, nivel: 'intermediario', versao: 1 } } });
    await abrirPainel(page, extensao);
    await marcarEEnviar(page, [RUSSA.texto]);

    const [envio] = await enviosCriados(fakes, 1);
    expect([envio.corpo.lang, envio.corpo.nivel]).toEqual(['ru', 'intermediario']);
    await estadoFinal(extensao, { pm_envio: { envios: [{ corpo: { lang: 'ru', nivel: 'intermediario' } }] } });
  });

  test('o nível de cada idioma é o dele: inglês no Avançado e russo no Iniciante mandam um Envio de cada', async ({ page, extensao, fakes }) => {
    await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA], [CHAVE]: { ...AJUSTES, en: { ...AJUSTES.en, nivel: 'avancado', versao: 1 } } });
    await abrirPainel(page, extensao);
    await marcarEEnviar(page, [SACK.texto, RUSSA.texto]);

    const [ingles, russo] = await enviosCriados(fakes, 2);
    expect([ingles.corpo.lang, ingles.corpo.nivel]).toEqual(['en', 'avancado']);
    expect([russo.corpo.lang, 'nivel' in russo.corpo]).toEqual(['ru', false]);
    await estadoFinal(extensao, { pm_envio: { envios: [{ corpo: { lang: 'en', nivel: 'avancado' } }, { corpo: { lang: 'ru' } }] } });
  });

  test('mudar o nível depois de um Envio não muda o Envio que já saiu', async ({ page, extensao, fakes }) => {
    await extensao.gravarStorage({ frases: INGLESAS, [CHAVE]: { ...AJUSTES, en: { ...AJUSTES.en, nivel: 'intermediario', versao: 1 } } });
    await abrirPainel(page, extensao);
    await marcarEEnviar(page, [SACK.texto]);
    const [envio] = await enviosCriados(fakes, 1);

    await extensao.gravarStorage({ [CHAVE]: { ...AJUSTES, en: { ...AJUSTES.en, nivel: 'avancado', versao: 2 } } });
    await page.reload();

    expect(fakes.anki.envios).toHaveLength(1);
    expect(envio.corpo.nivel).toBe('intermediario');
    await estadoFinal(extensao, { pm_envio: { envios: [{ corpo: { nivel: 'intermediario' } }] } });
  });
});
