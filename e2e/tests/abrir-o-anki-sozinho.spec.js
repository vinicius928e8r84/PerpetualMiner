'use strict';

// Abrir o Anki sozinho (#147, ONB-17): o último passo da primeira conexão, logo depois de a Conexão com o
// Anki responder. A extensão pede a permissão opcional `nativeMessaging` e confere o abridor que a Conexão
// deixou no computador (só “achou o Anki?”: nada abre nem fecha). O mesmo componente
// (painel-conexao-passos.js) está no card ONB-16 da área Conexão com o Anki e no passo 4 da Boas-vindas.
//
// O abridor é o de mentira do fixture (fakes/abridor.js), registrado no perfil de teste do Chromium e
// respondendo pelos exemplos do contrato (complemento/contrato/exemplos.json › abridor). O que fica guardado
// é a permissão que o Chrome guarda (`extensao.permissaoDoAbridor()`) e o “Agora não” (`pm_abridor`).
//
// Exceção de teste (o aviso nativo do Chrome): o aviso da permissão é do Chrome, e o Playwright não alcança
// os botões dele. Por isso a permissão dada vem do fixture (`permissaoDoAbridor`, gravada no perfil como o
// Chrome a guarda depois de Permitir), e o teste do pedido confere o que a tela mostra enquanto o aviso espera.

const { test, expect } = require('../fixtures');
const { estadoFinal, estadoFinalEm } = require('../estado-final');
const { fotografar } = require('../evidencias-mineracao');
const contrato = require('../../complemento/contrato/exemplos.json');

const ORIGEM = `${contrato.origemDaExtensao}/`;
const CONFERIR = { mensagem: { acao: 'conferir' }, origem: ORIGEM };

const card = page => page.getByRole('region', { name: /^(Ainda não houve conexão neste computador|Abrir o Anki sozinho)$/ });
const pronto = page => page.getByRole('region', { name: 'Conexão com o Anki: ligada' });
const lista = page => page.getByRole('navigation', { name: 'Como ligar' });
const itemDaLista = (page, nome) => lista(page).getByRole('button', { name: new RegExp(`^${nome}`) });
const tituloDoPasso = page => page.locator('#apv-passo-titulo');
const statusDaConexao = page => page.locator('#apv-status');
const statusDoAbridor = page => page.locator('#apv-abridor-status');
const permitir = page => card(page).getByRole('button', { name: 'Permitir abrir o Anki' });
const agoraNao = page => card(page).getByRole('button', { name: 'Agora não' });
const tentarDoAbridor = page => page.locator('#apv-abridor-tentar');
const abas = page => page.getByRole('radiogroup', { name: 'Seções da Conexão com o Anki' });
const tentarDaF1 = page => page.locator('#shell-tentar-de-novo');

const ACHOU = 'O Anki abre sozinho quando um Envio precisar.';
const PASSOS = [/^Pôr a Conexão no Anki/, /^Reiniciar o Anki/, /^Abrir o Anki sozinho/];
const AGORA = new Date('2026-09-18T12:00:00');

/** O relógio da página parado: o Pronto (1,8 s) fica na tela até o teste andar com ele. */
async function pararRelogio(page) {
  await page.clock.install({ time: new Date(AGORA.getTime() - 60_000) });
  await page.clock.pauseAt(AGORA);
}
const SEM_PERMISSAO = 'Sem essa permissão, quando o Anki estiver fechado o Envio pede que você o abra.';

/** A área Conexão com o Anki nunca conectada, e então a Conexão responde (a pessoa reiniciou o Anki). */
async function conectarPelaPrimeiraVez(page, extensao, fakes) {
  fakes.anki.desligar();
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();
  fakes.anki.ligar();
  await tentarDaF1(page).click();
  await expect(statusDaConexao(page)).toHaveText(/^Achei o Anki/);
}

test('ligada, o card passa ao passo 3, Abrir o Anki sozinho, sem pedir nada ao Chrome nem ao abridor', async ({ page, extensao, fakes }) => {
  // A extensão chega da loja sem a permissão: ela é opcional.
  expect(await extensao.permissaoDoAbridor()).toBe(false);
  await conectarPelaPrimeiraVez(page, extensao, fakes);

  await expect(lista(page).getByRole('button')).toHaveText(PASSOS);
  await expect(itemDaLista(page, 'Abrir o Anki sozinho')).toHaveAttribute('aria-current', 'step');
  await expect(lista(page).getByRole('button', { name: /feito$/ })).toHaveCount(2);
  await expect(card(page)).toContainText('Como ligar · Passo 3 de 3');
  await expect(tituloDoPasso(page)).toHaveText('Abrir o Anki sozinho');
  await expect(card(page)).toContainText('Com a sua permissão, a extensão abre o Anki quando um Envio precisar dele. O Chrome vai pedir para ela se comunicar com o abridor que a Conexão com o Anki deixou neste computador. Agora ela só confere se acha o Anki: nada abre nem fecha.');
  // O que a Conexão disse de si continua na tela, e o passo tem as duas saídas.
  await expect(statusDaConexao(page)).toHaveText(/^Achei o Anki · Usuário 1 · versão \d/);
  await expect(permitir(page)).toBeVisible();
  await expect(agoraNao(page)).toBeVisible();
  // Um destaque só: no card ONB-16, o do passo é Permitir.
  await expect(page.locator('.veio-botao--primario:visible')).toHaveText(['Permitir abrir o Anki']);
  // O card fica: o Pronto espera a resposta deste passo.
  await expect(pronto(page)).toHaveCount(0);
  await expect(abas(page)).toBeHidden();
  await fotografar(page, 'abridor-passo-3.png');

  expect(fakes.abridor.pedidos()).toEqual([]);
  await estadoFinalEm('a permissão nativeMessaging no Chrome', () => extensao.permissaoDoAbridor(), false);
  await estadoFinal(extensao, { pm_abridor: null });
});

test('recarregar retoma Abrir o Anki sozinho até Agora não, mesmo com a saúde já confirmada', async ({ page, extensao, fakes }) => {
  await conectarPelaPrimeiraVez(page, extensao, fakes);
  await expect(permitir(page)).toBeVisible();
  await page.reload();
  await expect(page.locator('#anki-primeira-vez')).toBeVisible();
  await expect(page.locator('#anki-primeira-vez-titulo')).toHaveText('Abrir o Anki sozinho');
  await expect(page.getByRole('button', { name: 'Permitir abrir o Anki' })).toBeVisible();
  await expect(abas(page)).toBeHidden();
  await estadoFinal(extensao, { pm_anki_ja_conectou: true, pm_anki_abridor_pendente: true });
  await fotografar(page, 'abridor-retomado-apos-reload.png');
  await page.getByRole('button', { name: 'Agora não', exact: true }).click();
  await expect(abas(page)).toBeVisible();
  await page.reload();
  await expect(abas(page)).toBeVisible();
  await expect(page.locator('#anki-primeira-vez')).toBeHidden();
  await estadoFinal(extensao, { pm_anki_abridor_pendente: false, pm_abridor: { agoraNao: true } });
});

test('Permitir pede a permissão ao Chrome: o passo espera a resposta do aviso dele e ainda não chama o abridor', async ({ page, extensao, fakes }) => {
  await conectarPelaPrimeiraVez(page, extensao, fakes);

  await permitir(page).click();

  // O aviso do Chrome está aberto (exceção de teste, no topo do arquivo): a tela diz o que fazer e espera.
  await expect(statusDoAbridor(page)).toHaveText('Responda ao aviso do Chrome.');
  await expect(permitir(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(lista(page).getByRole('button', { name: /feito$/ })).toHaveCount(2);
  expect(fakes.abridor.pedidos()).toEqual([]);
  await estadoFinalEm('a permissão nativeMessaging no Chrome', () => extensao.permissaoDoAbridor(), false);
  await estadoFinal(extensao, { pm_abridor: null });
});

test('Agora não guarda a escolha, marca o passo “agora não” e o Pronto devolve as abas', async ({ page, extensao, fakes }) => {
  await pararRelogio(page);
  await conectarPelaPrimeiraVez(page, extensao, fakes);

  await agoraNao(page).click();

  await expect(pronto(page)).toBeVisible();
  await expect(itemDaLista(page, 'Abrir o Anki sozinho')).toHaveAccessibleName(/agora não$/);
  await expect(statusDoAbridor(page)).toHaveText(SEM_PERMISSAO);
  await expect(statusDoAbridor(page)).toBeVisible();
  await expect(tituloDoPasso(page)).toBeFocused();
  await fotografar(page, 'abridor-agora-nao-pronto.png');
  await page.clock.runFor(1_800);
  await expect(abas(page)).toBeVisible();
  await expect(pronto(page)).toBeHidden();
  expect(fakes.abridor.pedidos()).toEqual([]);
  await estadoFinal(extensao, { pm_abridor: { agoraNao: true }, pm_anki_abridor_pendente: false });
  await estadoFinalEm('a permissão nativeMessaging no Chrome', () => extensao.permissaoDoAbridor(), false);
});

test('quem já disse Agora não vai direto ao Pronto na primeira conexão', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ pm_abridor: { agoraNao: true } });
  fakes.anki.desligar();
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(card(page)).toBeVisible();
  await expect(itemDaLista(page, 'Abrir o Anki sozinho')).toHaveAccessibleName(/agora não$/);

  fakes.anki.ligar();
  await tentarDaF1(page).click();

  await expect(pronto(page)).toBeVisible();
  await expect(abas(page)).toBeVisible();
  expect(fakes.abridor.pedidos()).toEqual([]);
  await estadoFinal(extensao, { pm_abridor: { agoraNao: true } });
});

test.describe('com a permissão que o Chrome guardou depois de Permitir', () => {
  test.use({ permissaoDoAbridor: true });

  test('o passo confere o abridor sozinho: achou o Anki, o passo vira ✓ e o Pronto devolve as abas', async ({ page, extensao, fakes }) => {
    await pararRelogio(page);
    await conectarPelaPrimeiraVez(page, extensao, fakes);

    await expect(lista(page).getByRole('button', { name: /feito$/ })).toHaveCount(3);
    await expect(pronto(page)).toBeVisible();
    await expect(statusDoAbridor(page)).toHaveText(ACHOU);
    await expect(statusDoAbridor(page)).toBeVisible();
    await fotografar(page, 'abridor-achou-pronto.png');
    await page.clock.runFor(1_800);
    await expect(abas(page)).toBeVisible();

    // Uma conversa só, com a origem da extensão, e só para conferir: nada abriu.
    expect(fakes.abridor.pedidos()).toEqual([CONFERIR]);
    await estadoFinalEm('a permissão nativeMessaging no Chrome', () => extensao.permissaoDoAbridor(), true);
    await estadoFinal(extensao, { pm_abridor: null, pm_anki_abridor_pendente: false });
  });

  test('o abridor não acha o Anki: o passo diz o que fazer, e Tentar de novo confere de novo', async ({ page, extensao, fakes }) => {
    fakes.abridor.definir('nao_achei');
    await conectarPelaPrimeiraVez(page, extensao, fakes);

    const aviso = card(page).getByRole('alert');
    await expect(aviso).toBeVisible();
    await expect(aviso.locator('.veio-aviso__texto')).toHaveText('O abridor não achou o Anki neste computador. Feche o Anki e abra-o de novo: ao abrir, a Conexão com o Anki refaz o abridor.');
    await aviso.getByText('Detalhes', { exact: true }).click();
    await expect(aviso.locator('pre')).toHaveText('{"achou":false}');
    await expect(aviso.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
    await expect(itemDaLista(page, 'Abrir o Anki sozinho')).not.toHaveAccessibleName(/feito$|agora não$/);
    await expect(tentarDoAbridor(page)).toBeVisible();
    await expect(agoraNao(page)).toBeVisible();
    await expect(pronto(page)).toHaveCount(0);
    await fotografar(page, 'abridor-nao-achou.png');

    // A pessoa fechou e abriu o Anki: a Conexão refez o abridor, que agora acha o Anki.
    fakes.abridor.definir('achei');
    await tentarDoAbridor(page).click();

    await expect(pronto(page)).toBeVisible();
    await expect(statusDoAbridor(page)).toHaveText(ACHOU);
    expect(fakes.abridor.pedidos()).toEqual([CONFERIR, CONFERIR]);
    await estadoFinalEm('a permissão nativeMessaging no Chrome', () => extensao.permissaoDoAbridor(), true);
  });

  test('sem o abridor registrado (uma Conexão que ainda não o escrevia): o passo diz que ele não respondeu, com o que o Chrome disse no Detalhes', async ({ page, extensao, fakes }) => {
    fakes.abridor.desregistrar();
    await conectarPelaPrimeiraVez(page, extensao, fakes);

    const aviso = card(page).getByRole('alert');
    await expect(aviso).toBeVisible();
    await expect(aviso.locator('.veio-aviso__texto')).toHaveText('O abridor não respondeu. Feche o Anki e abra-o de novo: ao abrir, a Conexão com o Anki deixa o abridor neste computador.');
    await aviso.getByText('Detalhes', { exact: true }).click();
    await expect(aviso.locator('pre')).toContainText('native messaging host not found');
    await expect(aviso.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
    await expect(tentarDoAbridor(page)).toBeVisible();
    await expect(agoraNao(page)).toBeVisible();
    await expect(pronto(page)).toHaveCount(0);
    expect(fakes.abridor.pedidos()).toEqual([]);
    await estadoFinal(extensao, { pm_abridor: null });
  });

  test('o abridor que não responde: em 10 s o passo desiste e diz que ele não respondeu', async ({ page, extensao, fakes }) => {
    fakes.abridor.definir('sem_resposta');
    await page.clock.install({ time: new Date('2026-09-18T12:00:00') });
    await conectarPelaPrimeiraVez(page, extensao, fakes);

    await expect(statusDoAbridor(page)).toHaveText('Procurando o Anki…');
    await expect.poll(() => fakes.abridor.pedidos()).toEqual([CONFERIR]);
    await page.clock.runFor(9_000);
    await expect(statusDoAbridor(page)).toHaveText('Procurando o Anki…');
    await page.clock.runFor(1_000);

    await expect(card(page).getByRole('alert').locator('.veio-aviso__texto')).toHaveText(/^O abridor não respondeu\./);
    await expect(tentarDoAbridor(page)).toBeVisible();
    await estadoFinalEm('a permissão nativeMessaging no Chrome', () => extensao.permissaoDoAbridor(), true);
  });

  test('a permissão dada vence um Agora não antigo: o passo confere e o Agora não sai do que ficou guardado', async ({ page, extensao, fakes }) => {
    await extensao.gravarStorage({ pm_abridor: { agoraNao: true } });
    await pararRelogio(page);
    await conectarPelaPrimeiraVez(page, extensao, fakes);

    await expect(statusDoAbridor(page)).toHaveText(ACHOU);
    await expect(itemDaLista(page, 'Abrir o Anki sozinho')).toHaveAccessibleName(/feito$/);
    expect(fakes.abridor.pedidos()).toEqual([CONFERIR]);
    await estadoFinal(extensao, { pm_abridor: { agoraNao: false } });
  });
});

// ─── O mesmo passo na Boas-vindas ──────────────────────────────────────────────

const cardDaBoasVindas = page => page.locator('.bv-card');
const passosDaBoasVindas = page => cardDaBoasVindas(page).getByRole('navigation', { name: 'Como ligar' });

test('no passo 4 da Boas-vindas, o mesmo passo: ligada, Abrir o Anki sozinho, e Agora não fica guardado', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await page.goto(extensao.url('painel.html#boas-vindas/anki'));
  await expect(passosDaBoasVindas(page).getByRole('button')).toHaveText(PASSOS);

  fakes.anki.ligar();
  await passosDaBoasVindas(page).getByRole('button', { name: 'Reiniciar o Anki' }).click();
  await cardDaBoasVindas(page).locator('#bv4-tentar').click();

  await expect(page.locator('#bv4-passo-titulo')).toHaveText('Abrir o Anki sozinho');
  // Na Boas-vindas, o destaque é o Continuar dela: Permitir é contorno.
  await expect(page.locator('.veio-botao--primario:visible')).toHaveText(['Continuar']);
  await cardDaBoasVindas(page).getByRole('button', { name: 'Agora não', exact: true }).first().click();

  await expect(page.locator('#bv4-abridor-status')).toHaveText(SEM_PERMISSAO);
  await expect(passosDaBoasVindas(page).getByRole('button', { name: /^Abrir o Anki sozinho/ })).toHaveAccessibleName(/agora não$/);
  // O passo 4 da Boas-vindas continua feito pela Conexão ligada.
  await expect(page.getByRole('navigation', { name: 'Passos da configuração' }).getByRole('button', { name: /^Ligar a Conexão com o Anki/ }))
    .toHaveAccessibleName(/feito$/);
  expect(fakes.abridor.pedidos()).toEqual([]);
  await estadoFinal(extensao, { pm_abridor: { agoraNao: true } });
});

test.describe('na Boas-vindas, com a permissão dada', () => {
  test.use({ permissaoDoAbridor: true });

  test('o passo 4 confere o abridor e marca Abrir o Anki sozinho como feito', async ({ page, extensao, fakes }) => {
    fakes.anki.desligar();
    await page.goto(extensao.url('painel.html#boas-vindas/anki'));
    fakes.anki.ligar();
    await passosDaBoasVindas(page).getByRole('button', { name: 'Reiniciar o Anki' }).click();
    await cardDaBoasVindas(page).locator('#bv4-tentar').click();

    await expect(page.locator('#bv4-abridor-status')).toHaveText(ACHOU);
    await expect(passosDaBoasVindas(page).getByRole('button', { name: /feito$/ })).toHaveCount(3);
    await fotografar(page, 'abridor-boas-vindas-achou.png');
    expect(fakes.abridor.pedidos()).toEqual([CONFERIR]);
    await estadoFinalEm('a permissão nativeMessaging no Chrome', () => extensao.permissaoDoAbridor(), true);
  });
});
