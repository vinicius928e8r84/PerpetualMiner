'use strict';

// Conexão com o Anki · “Usar um tipo que já tenho” nos Ajustes de envio (#165, Estilo do cartão): a pessoa escolhe um tipo de nota do Anki dela e diz em que campo
// vai cada parte do Cartão (várias partes podem ir num campo só) e vê a prévia. Continuar só liga com um campo para a Frase e outro, diferente, para a resposta; sem
// isso nada é gravado, a tela explica e oferece o estilo pronto. Um tipo da pessoa fica com a frente que ela já tem (a escolha da Frente some). O Envio seguinte
// leva o mapeamento. A Conexão é falsificada na fronteira HTTP (e2e/fakes/anki.js, o contrato `exemplos-do-tipo-proprio.json`); o teste confere o que a pessoa
// vê, o que ficou gravado (`ankiBridgePresets`) e o que atravessou o HTTP.

const { test, expect } = require('../fixtures');
const { estadoFinal } = require('../estado-final');
const { AGORA, INGLESAS, SACK, abrirPainel, marcarEEnviar, enviosCriados } = require('../apoio-do-envio');

const CHAVE = 'ankiBridgePresets';
const AJUSTES = {
  en: { deckName: 'Inglês', imageSource: '1', ttsWordTld: 'com', ttsPhraseTld: 'co.uk', versao: 1 },
  ru: { deckName: 'Русский', imageSource: '1', ttsWordTld: 'ru', ttsPhraseTld: 'ru', versao: 1 },
};
const MEU_TIPO = { name: 'Meu Inglês', fields: ['Pergunta', 'Resposta', 'Anotações', 'Som'] };
const TIPO_DE_UM_CAMPO = { name: 'Só um campo', fields: ['Texto'] };

const formulario = (page, idioma = 'Inglês') => page.getByRole('form', { name: `Ajustes de envio · ${idioma}` });
const abrirOTipo = page => formulario(page).getByRole('button', { name: 'Usar um tipo que já tenho' });
const painelDoTipo = page => formulario(page).getByRole('group', { name: 'Usar um tipo que já tenho' });
const campo = (page, nome) => painelDoTipo(page).getByLabel(nome, { exact: true });
const continuar = page => painelDoTipo(page).getByRole('button', { name: 'Continuar' });
const salvar = page => formulario(page).getByRole('button', { name: 'Salvar ajustes' });
const situacao = page => formulario(page).getByRole('status').filter({ hasText: /Salvo|Alterações não salvas/ });
const pedidosDaPrevia = fakes => fakes.anki.requisicoes.filter(r => r.caminho === '/anki/card-preview' && r.dados?.tipoProprio).map(r => r.dados);

async function abrirAjustes(page, extensao, fakes, { tipos = [MEU_TIPO, TIPO_DE_UM_CAMPO], gravado = AJUSTES } = {}) {
  fakes.anki.previa.tiposDeNota.definir(tipos);
  await extensao.gravarStorage({ pm_anki_ja_conectou: true, [CHAVE]: gravado });
  await page.clock.setFixedTime(AGORA);
  await page.goto(extensao.url('painel.html#anki/ajustes'));
  await expect(formulario(page)).toBeVisible();
}

test('mapear o tipo que a pessoa já tem: a prévia aparece, Continuar liga e Salvar ajustes guarda o mapeamento', async ({ page, extensao, fakes }) => {
  await abrirAjustes(page, extensao, fakes);

  await abrirOTipo(page).click();
  await expect(continuar(page)).toBeDisabled();
  await campo(page, 'Tipo de nota').selectOption('Meu Inglês');
  // O Básico de sempre: a Frase no primeiro campo e a resposta no segundo.
  await expect(campo(page, 'Frase')).toHaveValue('Pergunta');
  await expect(campo(page, 'Resposta')).toHaveValue('Resposta');
  await campo(page, 'Áudio da frase').selectOption('Som');
  await campo(page, 'Palavra').selectOption('Resposta'); // várias partes num campo só
  await expect(continuar(page)).toBeEnabled();
  await expect(page.getByRole('region', { name: 'Prévia do cartão' }).last()).toHaveAttribute('data-estado', 'pronta');
  expect(pedidosDaPrevia(fakes).at(-1)).toEqual({
    lang: 'en', nivel: 'iniciante', tipoProprio: { nome: 'Meu Inglês', mapa: { frase: 'Pergunta', audio_da_frase: 'Som', resposta: 'Resposta', palavra: 'Resposta' } },
  });

  await continuar(page).click();
  await expect(painelDoTipo(page)).toContainText('Usando o tipo Meu Inglês. A frente que ele já tem fica como está.');
  await expect(situacao(page)).toHaveText('Alterações não salvas');
  expect((await extensao.lerStorage(CHAVE))[CHAVE].en.tipoProprio).toBeUndefined();

  await salvar(page).click();
  await expect(situacao(page)).toHaveText('Salvo');
  await estadoFinal(extensao, {
    [CHAVE]: { en: { versao: 2, tipoProprio: { nome: 'Meu Inglês', mapa: { frase: 'Pergunta', audio_da_frase: 'Som', resposta: 'Resposta', palavra: 'Resposta' } } }, ru: { versao: 1 } },
  });
});

test('o tipo que a pessoa já tem fica com a frente que ela já tem: a escolha da Frente some e o estilo pronto a traz de volta', async ({ page, extensao, fakes }) => {
  await abrirAjustes(page, extensao, fakes);
  const frente = formulario(page).getByRole('radiogroup', { name: 'Frente' });
  await expect(frente).toBeVisible();

  await abrirOTipo(page).click();
  await campo(page, 'Tipo de nota').selectOption('Meu Inglês');
  await continuar(page).click();
  await expect(frente).toBeHidden();

  await painelDoTipo(page).getByRole('button', { name: 'Usar o estilo pronto' }).click();
  await expect(frente).toBeVisible();
  await expect(abrirOTipo(page)).toBeVisible();
  await expect(situacao(page)).toHaveText('Salvo');
  await estadoFinal(extensao, { [CHAVE]: { en: { versao: 1 } } });
  expect((await extensao.lerStorage(CHAVE))[CHAVE].en.tipoProprio).toBeUndefined();
});

test('um tipo sem campo para a Frase e outro para a resposta: Continuar fica desligado, a tela explica, oferece o estilo pronto e nada é gravado', async ({ page, extensao, fakes }) => {
  await abrirAjustes(page, extensao, fakes);

  await abrirOTipo(page).click();
  await campo(page, 'Tipo de nota').selectOption('Só um campo');
  await expect(painelDoTipo(page).getByRole('alert')).toContainText('Este tipo de nota não tem um campo para a frase e outro para a resposta. Nada foi alterado no Anki.');
  await expect(continuar(page)).toBeDisabled();
  expect(pedidosDaPrevia(fakes)).toEqual([]);

  await painelDoTipo(page).getByRole('button', { name: 'Usar o estilo pronto' }).first().click();
  await expect(abrirOTipo(page)).toBeVisible();
  await expect(situacao(page)).toHaveText('Salvo');
  await estadoFinal(extensao, { [CHAVE]: { en: { versao: 1 } } });
  expect((await extensao.lerStorage(CHAVE))[CHAVE].en.tipoProprio).toBeUndefined();
});

test('a Frase e a resposta no mesmo campo, ou uma delas sem campo, desligam o Continuar até haver dois campos diferentes', async ({ page, extensao, fakes }) => {
  await abrirAjustes(page, extensao, fakes);
  await abrirOTipo(page).click();
  await campo(page, 'Tipo de nota').selectOption('Meu Inglês');
  await expect(continuar(page)).toBeEnabled();

  await campo(page, 'Resposta').selectOption('Pergunta');
  await expect(painelDoTipo(page)).toContainText('Escolha um campo para a frase e outro, diferente, para a resposta.');
  await expect(continuar(page)).toBeDisabled();
  await campo(page, 'Resposta').selectOption('');
  await expect(continuar(page)).toBeDisabled();
  await campo(page, 'Resposta').selectOption('Anotações');
  await expect(continuar(page)).toBeEnabled();
  expect((await extensao.lerStorage(CHAVE))[CHAVE].en.tipoProprio).toBeUndefined();
  await estadoFinal(extensao, { [CHAVE]: { en: { versao: 1 } } });
});

test('sem a Conexão com o Anki ligada a lista não vem, a tela diz e o Tentar de novo lê de novo', async ({ page, extensao, fakes }) => {
  await abrirAjustes(page, extensao, fakes);
  fakes.anki.abrirPerfil(null);

  await abrirOTipo(page).click();
  await expect(painelDoTipo(page)).toContainText('Os tipos de nota aparecem com a Conexão com o Anki ligada.');
  fakes.anki.abrirPerfil('Usuário 1');
  await painelDoTipo(page).getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(campo(page, 'Tipo de nota')).toBeVisible();
  await estadoFinal(extensao, { [CHAVE]: { en: { versao: 1 } } });
});

test.describe('o Envio seguinte leva o mapeamento', () => {
  test.beforeEach(({ fakes }) => {
    fakes.anki.usarRelogio(() => AGORA);
  });

  test('com um tipo próprio salvo, o Envio em inglês leva o tipoProprio e guarda o corpo', async ({ page, extensao, fakes }) => {
    const tipoProprio = { nome: 'Meu Inglês', mapa: { frase: 'Pergunta', resposta: 'Resposta' } };
    await extensao.gravarStorage({ frases: INGLESAS, [CHAVE]: { ...AJUSTES, en: { ...AJUSTES.en, tipoProprio } } });
    await abrirPainel(page, extensao);
    await marcarEEnviar(page, [SACK.texto]);

    const [envio] = await enviosCriados(fakes, 1);
    expect(envio.corpo.tipoProprio).toEqual(tipoProprio);
    await estadoFinal(extensao, { pm_envio: { envios: [{ corpo: { lang: 'en', tipoProprio } }] } });
  });

  test('sem tipo próprio, o Envio não leva tipoProprio nenhum', async ({ page, extensao, fakes }) => {
    await extensao.gravarStorage({ frases: INGLESAS, [CHAVE]: AJUSTES });
    await abrirPainel(page, extensao);
    await marcarEEnviar(page, [SACK.texto]);

    const [envio] = await enviosCriados(fakes, 1);
    expect('tipoProprio' in envio.corpo).toBe(false);
    await estadoFinal(extensao, { pm_envio: { envios: [{ corpo: { lang: 'en' } }] } });
  });
});
