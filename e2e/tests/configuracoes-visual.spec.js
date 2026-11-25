'use strict';

const { test, expect } = require('../fixtures');
const { FRASES_DO_PROTOTIPO, semearComoNoPrototipo, abrirConfiguracoes } = require('../apoio-das-configuracoes');
const {
  estadoDoChip, campoDaChave, esperarALigacao, semearContaVisual, semearContaDaIA, semearChaveConferida,
  abrirComContaSincronizada, abrirOCardDoAnki, falharOArmazemDeSegredos,
} = require('../apoio-visual-das-configuracoes');

const COM_CONTA_SINCRONIZADA = [
  { nome: 'Configurações com os cards fechados', endereco: '#configuracoes', imagem: 'configuracoes-fechados.png', opcoes: {} },
  { nome: 'Conta & sync aberto, sincronizado', endereco: '#configuracoes/conta', imagem: 'conta-sincronizado.png', opcoes: { animations: 'disabled' } },
  { nome: 'Zona de perigo aberta, com conta', endereco: '#configuracoes/perigo', imagem: 'perigo-com-conta.png', opcoes: { animations: 'disabled' } },
];

for (const { nome, endereco, imagem, opcoes } of COM_CONTA_SINCRONIZADA) {
  test(nome, async ({ page, extensao, fakes }) => {
    await abrirComContaSincronizada(page, extensao, fakes, endereco);

    await expect(page).toHaveScreenshot(imagem, opcoes);
  });
}

test('Conta & sync aberto, sem sincronizar', async ({ page, extensao, fakes }) => {
  await semearContaVisual(extensao, fakes);
  fakes.google.ficarForaDoAr();
  await abrirConfiguracoes(page, extensao, '#configuracoes/conta');
  await expect(estadoDoChip(page)).toHaveText('Sem sincronizar');
  await esperarALigacao(page);

  await expect(page).toHaveScreenshot('conta-sem-sincronizar.png', { animations: 'disabled' });
});

test('Conta & sync aberto, sem conta e com o login que falhou', async ({ page, extensao, fakes }) => {
  await semearComoNoPrototipo(extensao, fakes);
  fakes.google.proximoLogin('falhar');
  await abrirConfiguracoes(page, extensao, '#configuracoes/conta');
  await page.locator('#cfg-conta').getByRole('button', { name: 'Entrar com Google' }).click();
  await expect(page.locator('#cfg-conta').getByRole('alert')).toBeVisible();
  await esperarALigacao(page);

  await expect(page).toHaveScreenshot('conta-login-falhou.png', { animations: 'disabled' });
});

test('Aparência aberto, no escuro', async ({ page, extensao, fakes }) => {
  await semearContaVisual(extensao, fakes);
  await abrirConfiguracoes(page, extensao, '#configuracoes/aparencia');
  await expect(page.getByRole('radio', { name: 'Escuro' })).toBeChecked();

  await expect(page).toHaveScreenshot('aparencia-escuro.png', { animations: 'disabled' });
});

test('Aparência aberto, no claro: a mesma tela com os tokens claros', async ({ page, extensao, fakes }) => {
  await semearContaVisual(extensao, fakes);
  await extensao.gravarStorage({ pm_tema: 'claro' });
  await abrirConfiguracoes(page, extensao, '#configuracoes/aparencia');
  await expect(page.getByRole('radio', { name: 'Claro' })).toBeChecked();

  await expect(page).toHaveScreenshot('aparencia-claro.png', { animations: 'disabled' });
});

test('janela estreita: sem resumo na linha e sem recuo no conteúdo', async ({ page, extensao, fakes }) => {
  await semearContaVisual(extensao, fakes);
  await abrirConfiguracoes(page, extensao, '#configuracoes/conta', { largura: 700 });
  await expect(page.locator('#cfg-conta').getByText('Sincronizado agora', { exact: true })).toBeVisible();
  await esperarALigacao(page);

  await expect(page).toHaveScreenshot('conta-estreita.png', { animations: 'disabled' });
});

async function abrirAtalhos(page, extensao, fakes) {
  await semearComoNoPrototipo(extensao, fakes);
  await abrirConfiguracoes(page, extensao, '#configuracoes/atalhos');
  await esperarALigacao(page);
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
  await esperarALigacao(page);

  await expect(page).toHaveScreenshot('chave-salva.png', { animations: 'disabled' });
});

test('Chave do Gemini aberta, vazia, depois de salvar vazio', async ({ page, extensao, fakes }) => {
  await semearComoNoPrototipo(extensao, fakes);
  await extensao.gravarStorage({ geminiApiKey: '' });
  await abrirConfiguracoes(page, extensao, '#configuracoes/chave');
  await page.locator('#cfg-chave').getByRole('button', { name: 'Salvar chave' }).click();
  await expect(page.locator('#cfg-chave').getByText('Cole a chave antes de salvar')).toBeVisible();
  await page.locator('#cfg-chave-campo').blur();
  await esperarALigacao(page);

  await expect(page).toHaveScreenshot('chave-vazia-recusada.png', { animations: 'disabled' });
});

const AGUARDA_O_DONO = 'a referência visual do card IA dos cartões espera a aprovação do dono';
test('IA dos cartões aberta, sem chave: as duas entradas lado a lado', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearComoNoPrototipo(extensao, fakes);
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await expect(page.locator('#cfg-ia').getByRole('textbox', { name: 'Chave da OpenAI' })).toBeFocused();
  await esperarALigacao(page);

  await expect(page).toHaveScreenshot('ia-sem-chave.png', { animations: 'disabled' });
});

test('IA dos cartões aberta, com a chave conferida e a cópia na Conexão', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearComoNoPrototipo(extensao, fakes);
  await semearChaveConferida(extensao, fakes);
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await expect(page.locator('#cfg-ia').getByText('A Conexão com o Anki guarda a chave.')).toBeVisible();
  await esperarALigacao(page);

  await expect(page).toHaveScreenshot('ia-conferida.png', { animations: 'disabled' });
});

test('IA dos cartões com conta: a chave vai junto com a conta Google, com Trocar chave e Apagar chave', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearContaDaIA(extensao, fakes);
  await semearChaveConferida(extensao, fakes);
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await expect(page.locator('#cfg-ia').getByText('Vai junto com a sua conta Google', { exact: false })).toBeVisible();
  await expect(page.locator('#cfg-ia').getByText('A Conexão com o Anki guarda a chave.')).toBeVisible();

  await expect(page).toHaveScreenshot('ia-conferida-com-conta.png', { animations: 'disabled' });
});

test('Apagar tudo com a Conexão sem responder: a falha local de hoje, sem aviso novo', async ({ page, extensao, fakes }) => {
  await semearComoNoPrototipo(extensao, fakes);
  fakes.anki.falharApagarFrases();
  await abrirConfiguracoes(page, extensao, '#configuracoes/perigo');
  await page.locator('#cfg-perigo').getByRole('button', { name: /^Apagar todas as/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Apagar .* frases$/ }).click();

  await expect(page.getByText('Todas as frases foram apagadas')).toBeVisible();
  await expect(page).toHaveScreenshot('apagar-tudo-falha-frases-na-conexao.png', { animations: 'disabled' });
});

test('o modal de apagar a chave da OpenAI, com conta', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearContaDaIA(extensao, fakes);
  await semearChaveConferida(extensao, fakes);
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await page.locator('#cfg-ia').getByRole('button', { name: 'Apagar chave' }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Apagar a chave da OpenAI?');

  await expect(page).toHaveScreenshot('ia-apagar-modal.png', { animations: 'disabled' });
});

test('IA dos cartões com a chave recusada: a faixa diz a qual entrada pertence', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearComoNoPrototipo(extensao, fakes);
  fakes.anki.responderOpenAI('recusa');
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await page.locator('#cfg-ia').getByRole('textbox', { name: 'Chave da OpenAI' }).fill('sk-proj-chave-de-exemplo-9f3a');
  await page.locator('#cfg-ia').getByRole('button', { name: 'Conferir e salvar' }).click();
  await expect(page.locator('#cfg-ia').getByRole('alert')).toContainText('A OpenAI recusou a chave.');
  await page.locator('#cfg-ia').getByText('Detalhes').click();
  await esperarALigacao(page);

  await expect(page).toHaveScreenshot('ia-recusada.png', { animations: 'disabled', mask: [campoDaChave(page)] });
});

test('IA dos cartões com a chave sem crédito, no tema claro', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearComoNoPrototipo(extensao, fakes);
  await extensao.gravarStorage({ pm_tema: 'claro' });
  fakes.anki.responderOpenAI('sem_credito');
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await page.locator('#cfg-ia').getByRole('textbox', { name: 'Chave da OpenAI' }).fill('sk-proj-chave-de-exemplo-9f3a');
  await page.locator('#cfg-ia').getByRole('button', { name: 'Conferir e salvar' }).click();
  await expect(page.locator('#cfg-ia').getByRole('alert')).toContainText('sem crédito');
  await esperarALigacao(page);

  await expect(page).toHaveScreenshot('ia-sem-credito-claro.png', { animations: 'disabled', mask: [campoDaChave(page)] });
});

test('IA dos cartões em janela estreita: as colunas viram linhas', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearComoNoPrototipo(extensao, fakes);
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia', { largura: 760 });
  await expect(page.locator('#cfg-ia').getByRole('region', { name: /Conta do ChatGPT/ })).toBeVisible();
  await esperarALigacao(page);

  await expect(page).toHaveScreenshot('ia-estreita.png', { animations: 'disabled' });
});

test('o modal de apagar todas as frases, com conta', async ({ page, extensao, fakes }) => {
  await abrirComContaSincronizada(page, extensao, fakes, '#configuracoes/perigo');
  await page.getByRole('button', { name: 'Apagar todas as 1.284 frases' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await expect(page).toHaveScreenshot('perigo-modal.png', { animations: 'disabled' });
});

test.fixme('Conta & sync: só a chave da OpenAI está pendente — aprovação visual pendente', async ({ page, extensao, fakes }) => {
  await semearContaVisual(extensao, fakes);
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
  fakes.google.recusarEscritas();
  await campoDaChave(page).fill('sk-fake-visual-9f3a');
  await page.locator('#cfg-ia').getByRole('button', { name: 'Conferir e salvar' }).click();
  await expect(page.locator('#cfg-ia-resumo')).toHaveText('••••••••9f3a');
  await page.locator('#shell-chip').click();
  await expect(page.locator('#cfg-conta')).toContainText('Não deu para conferir a sincronização da chave da OpenAI.');
  expect(fakes.google.frasesDe('uid-visual')).toEqual(FRASES_DO_PROTOTIPO);
  await expect(page).toHaveScreenshot('conta-chave-pendente.png', { animations: 'disabled', mask: [campoDaChave(page)] });
});

for (const variante of ['outra-conta', 'apagar-falhou', 'apagar-tudo-parcial']) {
  test.fixme(`IA: ${variante} — aprovação visual pendente`, async ({ page, extensao, fakes }) => {
    await extensao.semearSessao({ uid: 'uid-visual' });
    await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
    await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
    const ia = page.locator('#cfg-ia');
    await campoDaChave(page).fill('sk-fake-visual-9f3a');
    await ia.getByRole('button', { name: 'Conferir e salvar' }).click();
    await expect(ia.locator('.cfg-resumo')).toHaveText('••••••••9f3a');
    await expect.poll(() => Boolean(fakes.google.chaveDaOpenAIDe('uid-visual'))).toBe(true);
    if (variante === 'outra-conta') {
      await extensao.semearSessao({ uid: 'uid-outra-conta' });
      await page.reload();
      await expect(ia).toContainText('Esta chave é de outra conta Google.');
    } else {
      await falharOArmazemDeSegredos(page);
      if (variante === 'apagar-falhou') {
        await ia.getByRole('button', { name: 'Apagar chave' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Apagar chave' }).click();
      } else {
        await page.goto(extensao.url('painel.html#configuracoes/perigo'));
        await falharOArmazemDeSegredos(page);
        await page.locator('#btn-apagar-tudo').click();
        await page.getByRole('dialog').locator('.veio-botao--perigo-cheio').click();
      }
      await expect(page.getByRole('alert')).toContainText(variante === 'apagar-falhou'
        ? 'Não deu para confirmar o apagamento da chave neste computador.' : 'As frases foram apagadas, mas não deu para conferir o apagamento da chave da OpenAI');
    }
    await expect(page).toHaveScreenshot(`ia-${variante}.png`, { animations: 'disabled', mask: [campoDaChave(page)] });
  });
}

test.fixme('Conexão com o Anki aberta, com o interruptor desligado', async ({ page, extensao, fakes }) => {
  await abrirOCardDoAnki(page, extensao, fakes);
  await expect(page.getByRole('switch', { name: 'Abrir o Anki com o computador' })).toBeEnabled();
  await esperarALigacao(page);

  await expect(page).toHaveScreenshot('anki-desligado.png', { animations: 'disabled' });
});

test.fixme('Conexão com o Anki aberta, com o interruptor ligado', async ({ page, extensao, fakes }) => {
  fakes.anki.definirItemDeLogin('ligado');
  await abrirOCardDoAnki(page, extensao, fakes);
  await expect(page.getByRole('switch', { name: 'Abrir o Anki com o computador' })).toBeChecked();
  await esperarALigacao(page);

  await expect(page).toHaveScreenshot('anki-ligado.png', { animations: 'disabled' });
});

test.fixme('Conexão com o Anki aberta, com a Conexão desligada', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirOCardDoAnki(page, extensao, fakes);
  await expect(page.getByRole('switch', { name: 'Abrir o Anki com o computador' })).toBeDisabled();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'desligada');

  await expect(page).toHaveScreenshot('anki-indisponivel.png', { animations: 'disabled' });
});

test.fixme('Conexão com o Anki aberta, com o item que não pôde ser escrito', async ({ page, extensao, fakes }) => {
  fakes.anki.definirItemDeLogin('falha');
  await abrirOCardDoAnki(page, extensao, fakes);
  await expect(page.getByRole('switch', { name: 'Abrir o Anki com o computador' })).toBeEnabled();
  await page.locator('#cfg-anki-corpo .veio-toggle').click();
  await expect(page.locator('#cfg-anki-corpo').getByRole('alert')).toBeVisible();
  await esperarALigacao(page);

  await expect(page).toHaveScreenshot('anki-falhou.png', { animations: 'disabled' });
});
