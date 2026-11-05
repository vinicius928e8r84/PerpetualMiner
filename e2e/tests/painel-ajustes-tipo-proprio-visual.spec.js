'use strict';

// Referência visual de “Usar um tipo que já tenho” (#165), nos Ajustes de envio › Estilo do cartão: o botão fechado, o mapeamento com a prévia no tipo da pessoa,
// o tipo sem campos para a Frase e a resposta (a explicação e o estilo pronto) e a janela estreita. Não há protótipo desta seção: ela reusa o controle do Estilo do
// cartão (#162), a prévia (#164) e o aviso da Base Veio, e o dono compara estas telas com o protótipo aprovado dos Ajustes de envio
// (`docs/design/painel/anki/prototipo-ajustes-envio.html`). Todas são PROPOSTAS (`test.fixme`, sem PNG na árvore) até a aprovação dele (CODING_STANDARDS regra 10).
// Aprovando: tirar o `fixme` e `cd e2e && npx playwright test painel-ajustes-tipo-proprio-visual --update-snapshots`, e a entrada no livro `e2e/aprovados-visuais.json`.

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');
const AGUARDA_O_DONO = 'a referência visual espera a aprovação do dono (regra 10)';
const ilha = page => page.locator('.shell-conteudo');
const formulario = page => page.getByRole('form', { name: 'Ajustes de envio · Inglês' });
const painelDoTipo = page => formulario(page).getByRole('group', { name: 'Usar um tipo que já tenho' });
const TIPOS = [{ name: 'Meu Inglês', fields: ['Pergunta', 'Resposta', 'Anotações', 'Som'] }, { name: 'Só um campo', fields: ['Texto'] }];

async function abrirOTipo(page, extensao, fakes, { largura = 1280, tipo = null } = {}) {
  fakes.anki.previa.tiposDeNota.definir(TIPOS);
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: largura, height: 1400 });
  await page.goto(extensao.url('painel.html#anki/ajustes'));
  await expect(formulario(page)).toBeVisible();
  if (tipo) {
    await formulario(page).getByRole('button', { name: 'Usar um tipo que já tenho' }).click();
    await painelDoTipo(page).getByLabel('Tipo de nota', { exact: true }).selectOption(tipo);
  }
  await page.evaluate(() => document.fonts.ready);
}

test('o botão “Usar um tipo que já tenho”, fechado, sob a prévia do estilo pronto', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirOTipo(page, extensao, fakes);

  await expect(ilha(page)).toHaveScreenshot('ajustes-tipo-proprio-fechado.png');
});

test('o mapeamento de um tipo com quatro campos, com a prévia no tipo da pessoa', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirOTipo(page, extensao, fakes, { tipo: 'Meu Inglês' });
  await expect(page.getByRole('region', { name: 'Prévia do cartão' }).last()).toHaveAttribute('data-estado', 'pronta');

  await expect(ilha(page)).toHaveScreenshot('ajustes-tipo-proprio-mapeamento.png');
});

test('o tipo de um campo só: a tela explica, oferece o estilo pronto e Continuar fica desligado', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirOTipo(page, extensao, fakes, { tipo: 'Só um campo' });
  await expect(painelDoTipo(page).getByRole('alert')).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('ajustes-tipo-proprio-sem-campos.png');
});

test('na janela estreita o mapeamento fica legível', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirOTipo(page, extensao, fakes, { largura: 760, tipo: 'Meu Inglês' });
  await expect(page.getByRole('region', { name: 'Prévia do cartão' }).last()).toHaveAttribute('data-estado', 'pronta');

  await expect(page).toHaveScreenshot('ajustes-tipo-proprio-estreita.png', { fullPage: false });
});
