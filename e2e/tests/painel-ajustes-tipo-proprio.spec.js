'use strict';

const { test, expect } = require('../fixtures');
const { estadoFinal } = require('../estado-final');
const { AGORA, INGLESAS, SACK, abrirPainel, marcarEEnviar, enviosCriados } = require('../apoio-do-envio');
const {
  CHAVE, AJUSTES, MEU_TIPO, TIPO_DE_UM_CAMPO,
  formulario, abrirOTipo, painelDoTipo, campo, continuar, salvar, situacao, pedidosDaPrevia,
  abrirAjustes, abrirOPainelDoTipo,
} = require('../apoio-do-tipo-proprio');

test('mapear o tipo que a pessoa já tem: a prévia aparece, Continuar liga e Salvar ajustes guarda o mapeamento', async ({ page, extensao, fakes }) => {
  await abrirOPainelDoTipo(page, extensao, fakes);
  await expect(continuar(page)).toBeDisabled();
  await campo(page, 'Tipo de nota').selectOption('Meu Inglês');
  await expect(campo(page, 'Frase')).toHaveValue('Pergunta');
  await expect(campo(page, 'Resposta')).toHaveValue('Resposta');
  await campo(page, 'Áudio da frase').selectOption('Som');
  await campo(page, 'Palavra').selectOption('Resposta');
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
  await abrirOPainelDoTipo(page, extensao, fakes);
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
  await abrirOPainelDoTipo(page, extensao, fakes);
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

test('o tipo de nota que some do Anki depois de lido: a prévia diz isso, sem mandar atualizar a Conexão, e Tentar de novo a mostra quando ele volta', async ({ page, extensao, fakes }) => {
  await abrirOPainelDoTipo(page, extensao, fakes);
  await expect(campo(page, 'Tipo de nota')).toBeVisible();
  fakes.anki.previa.tiposDeNota.definir([TIPO_DE_UM_CAMPO]);
  await campo(page, 'Tipo de nota').selectOption('Meu Inglês');

  const previa = page.getByRole('region', { name: 'Prévia do cartão' }).last();
  await expect(previa).toContainText('O tipo de nota não está mais no Anki.');
  await expect(previa).not.toContainText('Atualize a Conexão com o Anki');
  fakes.anki.previa.tiposDeNota.definir([MEU_TIPO, TIPO_DE_UM_CAMPO]);
  await previa.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(previa).toHaveAttribute('data-estado', 'pronta');
  await estadoFinal(extensao, { [CHAVE]: { en: { versao: 1 } } });
});

const SEM_A_LISTA = [
  {
    nome: 'sem a Conexão com o Anki ligada a lista não vem, a tela diz e o Tentar de novo lê de novo',
    perderAConexao: fakes => fakes.anki.abrirPerfil(null),
    recuperarAConexao: fakes => fakes.anki.abrirPerfil('Usuário 1'),
  },
  {
    nome: 'com a Conexão com o Anki sem responder a lista não vem, a tela diz e o Tentar de novo lê de novo',
    perderAConexao: fakes => fakes.anki.desligar(),
    recuperarAConexao: fakes => fakes.anki.ligar(),
  },
];

for (const { nome, perderAConexao, recuperarAConexao } of SEM_A_LISTA) {
  test(nome, async ({ page, extensao, fakes }) => {
    await abrirAjustes(page, extensao, fakes);
    perderAConexao(fakes);

    await abrirOTipo(page).click();
    await expect(painelDoTipo(page)).toContainText('Os tipos de nota aparecem com a Conexão com o Anki ligada.');
    recuperarAConexao(fakes);
    await painelDoTipo(page).getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(campo(page, 'Tipo de nota')).toBeVisible();
    await estadoFinal(extensao, { [CHAVE]: { en: { versao: 1 } } });
  });
}

test('uma Conexão com o Anki que não conhece os tipos de nota pede a atualização, sem Tentar de novo', async ({ page, extensao, fakes }) => {
  await abrirAjustes(page, extensao, fakes);
  fakes.anki.responder('POST', '/anki/note-types', () => ({ status: 404, json: { error: 'not_found' } }));

  await abrirOTipo(page).click();
  await expect(painelDoTipo(page)).toContainText('Atualize a Conexão com o Anki para usar um tipo que você já tem.');
  await expect(painelDoTipo(page).getByRole('button', { name: 'Tentar de novo' })).toHaveCount(0);
  await estadoFinal(extensao, { [CHAVE]: { en: { versao: 1 } } });
});

test('a leitura dos tipos recusada, ou fora do formato, diz que não deu e o Tentar de novo lê de novo', async ({ page, extensao, fakes }) => {
  await abrirAjustes(page, extensao, fakes);
  const leituras = () => fakes.anki.requisicoes.filter(r => r.caminho === '/anki/note-types').length;
  fakes.anki.responder('POST', '/anki/note-types', () => ({ status: 500, json: { error: 'internal_error' } }));

  await abrirOTipo(page).click();
  await expect(painelDoTipo(page)).toContainText('Não deu para ler os tipos de nota. Tente de novo.');
  fakes.anki.responder('POST', '/anki/note-types', () => ({ status: 200, json: { noteTypes: 'nenhum' } }));
  await painelDoTipo(page).getByRole('button', { name: 'Tentar de novo' }).click();
  await expect.poll(leituras).toBe(2);
  await expect(painelDoTipo(page)).toContainText('Não deu para ler os tipos de nota. Tente de novo.');
  fakes.anki.pararDeResponder('POST', '/anki/note-types');
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
