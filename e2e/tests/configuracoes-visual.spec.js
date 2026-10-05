'use strict';

// Referência visual de Configurações · resumo primeiro + Conta & sync (#26),
// Chave do Gemini e Zona de perigo (#28), mais o card Aparência e o tema claro
// (#45).
//
// O dono revisa estas telas lado a lado com o protótipo travado
// (docs/design/painel/configuracoes/prototipo-configuracoes.html?variant=C).
// Depois de aprovadas, elas são a referência: uma mudança visual faz o teste
// falhar até alguém olhar e atualizar:
//
//   cd e2e && npx playwright test configuracoes-visual --update-snapshots
//
// O relógio fica parado, para “Sincronizado agora” sair sempre igual. Os dados
// são os do protótipo (1.284 frases, a chave salva, a seleção em Alt+Botão
// voltar), para os resumos das linhas fechadas saírem iguais aos dele.

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');
const TOTAL_DO_PROTOTIPO = 1284;

const FRASES_DO_PROTOTIPO = Array.from({ length: TOTAL_DO_PROTOTIPO }, (_, i) => ({
  id: 1_700_000_000_000 + (TOTAL_DO_PROTOTIPO - i),
  texto: `Sentence number ${TOTAL_DO_PROTOTIPO - i} about the harbour.`,
  data: AGORA.toLocaleDateString('pt-BR'),
  streaming: 'netflix',
  idioma: 'Inglês',
}));

/**
 * As frases, a chave do Gemini e o atalho de seleção do protótipo. Com a conta,
 * as frases já estão na nuvem, então abrir o painel não vira uma primeira subida.
 */
async function semearComoNoPrototipo(extensao, fakes, uid = null) {
  await extensao.gravarStorage({
    frases: FRASES_DO_PROTOTIPO,
    geminiApiKey: 'AIzaSyD4kQ7wL2mXe9pRtB8nVfH0cJ3kQ9',
    pm_atalho: { type: 'mouse', button: 3, code: null, altKey: true, ctrlKey: false, shiftKey: false, label: 'Alt+Mouse Back' },
  });
  if (uid) fakes.google.gravarFrases(uid, FRASES_DO_PROTOTIPO);
}

async function abrirConfiguracoes(page, extensao, endereco, largura = 1280) {
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: largura, height: 800 });
  await page.goto(extensao.url(`painel.html${endereco}`));
  await expect(page.getByRole('navigation', { name: 'Navegação do painel' })).toBeVisible();
  await expect(page.locator('#cfg-perigo-resumo')).toHaveText('1.284 frases');
  await page.evaluate(() => document.fonts.ready);
}

const estadoDoChip = page => page.locator('#shell-chip-estado');

test('Configurações com os cards fechados', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  await abrirConfiguracoes(page, extensao, '#configuracoes');
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('configuracoes-fechados.png');
});

test('Conta & sync aberto, sincronizado', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  await abrirConfiguracoes(page, extensao, '#configuracoes/conta');
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('conta-sincronizado.png', { animations: 'disabled' });
});

test('Conta & sync aberto, sem sincronizar', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  fakes.google.ficarForaDoAr();
  await abrirConfiguracoes(page, extensao, '#configuracoes/conta');
  await expect(estadoDoChip(page)).toHaveText('Sem sincronizar');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('conta-sem-sincronizar.png', { animations: 'disabled' });
});

test('Conta & sync aberto, sem conta e com o login que falhou', async ({ page, extensao, fakes }) => {
  await semearComoNoPrototipo(extensao, fakes);
  fakes.google.proximoLogin('falhar');
  await abrirConfiguracoes(page, extensao, '#configuracoes/conta');
  await page.locator('#cfg-conta').getByRole('button', { name: 'Entrar com Google' }).click();
  await expect(page.locator('#cfg-conta').getByRole('alert')).toBeVisible();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('conta-login-falhou.png', { animations: 'disabled' });
});

test('Aparência aberto, no escuro', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  await abrirConfiguracoes(page, extensao, '#configuracoes/aparencia');
  await expect(page.getByRole('radio', { name: 'Escuro' })).toBeChecked();

  await expect(page).toHaveScreenshot('aparencia-escuro.png', { animations: 'disabled' });
});

test('Aparência aberto, no claro: a mesma tela com os tokens claros', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  await extensao.gravarStorage({ pm_tema: 'claro' });
  await abrirConfiguracoes(page, extensao, '#configuracoes/aparencia');
  await expect(page.getByRole('radio', { name: 'Claro' })).toBeChecked();

  await expect(page).toHaveScreenshot('aparencia-claro.png', { animations: 'disabled' });
});

test('janela estreita: sem resumo na linha e sem recuo no conteúdo', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  await abrirConfiguracoes(page, extensao, '#configuracoes/conta', 700);
  await expect(page.locator('#cfg-conta').getByText('Sincronizado agora', { exact: true })).toBeVisible();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('conta-estreita.png', { animations: 'disabled' });
});

// ─── Atalhos (#27) ───────────────────────────────────────────────────────────
// Com a seleção em Alt+Botão voltar, como no protótipo: fora do padrão, então
// “Restaurar atalhos padrão” aparece no pé do card.

async function abrirAtalhos(page, extensao, fakes) {
  await semearComoNoPrototipo(extensao, fakes);
  await abrirConfiguracoes(page, extensao, '#configuracoes/atalhos');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');
}

const gravarAtalho = (page, nome) =>
  page.locator('#cfg-atalhos').getByRole('group', { name: nome }).getByRole('button', { name: 'Gravar atalho' });

test('Atalhos aberto, com a seleção gravada e o Restaurar atalhos padrão', async ({ page, extensao, fakes }) => {
  await abrirAtalhos(page, extensao, fakes);
  await expect(page.locator('#cfg-atalhos').getByRole('button', { name: 'Restaurar atalhos padrão' })).toBeVisible();

  await expect(page).toHaveScreenshot('atalhos-aberto.png', { animations: 'disabled' });
});

test('Atalhos gravando o Minerar legenda', async ({ page, extensao, fakes }) => {
  await abrirAtalhos(page, extensao, fakes);
  await gravarAtalho(page, 'Minerar legenda').click();
  await page.mouse.move(0, 0);

  await expect(page).toHaveScreenshot('atalhos-gravando.png', { animations: 'disabled' });
});

test('Atalhos com o atalho repetido recusado', async ({ page, extensao, fakes }) => {
  await abrirAtalhos(page, extensao, fakes);
  await gravarAtalho(page, 'Minerar seleção').click();
  await page.keyboard.press('Alt+KeyS');
  await expect(page.locator('#cfg-atalhos').getByRole('alert')).toBeVisible();
  await page.mouse.move(0, 0);

  await expect(page).toHaveScreenshot('atalhos-repetido.png', { animations: 'disabled' });
});

test('Chave do Gemini aberta, com a chave salva', async ({ page, extensao, fakes }) => {
  await semearComoNoPrototipo(extensao, fakes);
  await abrirConfiguracoes(page, extensao, '#configuracoes/chave');
  await expect(page.locator('#cfg-chave').getByRole('button', { name: 'Trocar chave' })).toBeVisible();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('chave-salva.png', { animations: 'disabled' });
});

test('Chave do Gemini aberta, vazia, depois de salvar vazio', async ({ page, extensao, fakes }) => {
  await semearComoNoPrototipo(extensao, fakes);
  await extensao.gravarStorage({ geminiApiKey: '' });
  await abrirConfiguracoes(page, extensao, '#configuracoes/chave');
  await page.locator('#cfg-chave').getByRole('button', { name: 'Salvar chave' }).click();
  await expect(page.locator('#cfg-chave').getByText('Cole a chave antes de salvar')).toBeVisible();
  await page.locator('#cfg-chave-campo').blur();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('chave-vazia-recusada.png', { animations: 'disabled' });
});

test('Zona de perigo aberta, com conta', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  await abrirConfiguracoes(page, extensao, '#configuracoes/perigo');
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('perigo-com-conta.png', { animations: 'disabled' });
});

test('o modal de apagar todas as frases, com conta', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  await abrirConfiguracoes(page, extensao, '#configuracoes/perigo');
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');
  await page.getByRole('button', { name: 'Apagar todas as 1.284 frases' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await expect(page).toHaveScreenshot('perigo-modal.png', { animations: 'disabled' });
});

// Conexão com o Anki › Abrir o Anki com o computador (#153). Não há protótipo próprio dele (o #106 o decidiu em
// texto): o card segue o “resumo primeiro” e o interruptor é o do Veio. O dono aprova estas referências.

test('Conexão com o Anki aberta, com o interruptor desligado', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  await abrirConfiguracoes(page, extensao, '#configuracoes/anki');
  await expect(page.getByRole('switch', { name: 'Abrir o Anki com o computador' })).toBeEnabled();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('anki-desligado.png', { animations: 'disabled' });
});

test('Conexão com o Anki aberta, com o interruptor ligado', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  fakes.anki.definirItemDeLogin('ligado');
  await abrirConfiguracoes(page, extensao, '#configuracoes/anki');
  await expect(page.getByRole('switch', { name: 'Abrir o Anki com o computador' })).toBeChecked();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('anki-ligado.png', { animations: 'disabled' });
});

test('Conexão com o Anki aberta, com a Conexão desligada', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  fakes.anki.desligar();
  await abrirConfiguracoes(page, extensao, '#configuracoes/anki');
  await expect(page.getByRole('switch', { name: 'Abrir o Anki com o computador' })).toBeDisabled();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'desligada');

  await expect(page).toHaveScreenshot('anki-indisponivel.png', { animations: 'disabled' });
});

test('Conexão com o Anki aberta, com o item que não pôde ser escrito', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  fakes.anki.definirItemDeLogin('falha');
  await abrirConfiguracoes(page, extensao, '#configuracoes/anki');
  await expect(page.getByRole('switch', { name: 'Abrir o Anki com o computador' })).toBeEnabled();
  await page.locator('#cfg-anki-corpo .veio-toggle').click();
  await expect(page.locator('#cfg-anki-corpo').getByRole('alert')).toBeVisible();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('anki-falhou.png', { animations: 'disabled' });
});
