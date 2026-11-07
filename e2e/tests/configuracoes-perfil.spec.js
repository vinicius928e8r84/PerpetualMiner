'use strict';

// Configurações › Conexão com o Anki: a linha “Perfil do Anki ▾” (#149, histórias 19, 20, 21 e 24).
//
// O perfil fixo mora na Conexão (o fake guarda a lista, o marcado e o aberto, do contrato em
// `complemento/contrato/exemplos-do-perfil.json`): os testes afirmam o que a pessoa vê e o que a Conexão ficou com.
// Com um perfil só nada sobre perfis aparece; o marcado que o Anki já não tem dá um aviso em vermelho.

const { test, expect } = require('../fixtures');

const linha = page => page.locator('#cfg-anki-perfil');
const escolha = page => page.getByRole('combobox', { name: 'Perfil do Anki' });
const aviso = page => page.locator('#cfg-anki-corpo .veio-aviso');

async function abrirCard(page, extensao) {
  await page.goto(extensao.url('painel.html#configuracoes/anki'));
  await expect(page.getByRole('button', { name: 'Conexão com o Anki', expanded: true })).toBeVisible();
}

const pedidosDeEscolha = fakes => fakes.anki.requisicoes.filter(r => r.metodo === 'POST' && r.caminho === '/anki/profile').map(r => JSON.parse(r.corpo));

test('com um perfil só o card não diz nada sobre perfis', async ({ page, extensao, fakes }) => {
  await abrirCard(page, extensao);
  await expect(page.getByRole('switch', { name: 'Abrir o Anki com o computador' })).toBeEnabled();
  // A lista já foi pedida à Conexão: sem a linha, sem a nota, sem aviso.
  await expect.poll(() => fakes.anki.requisicoes.some(r => r.caminho === '/anki/profiles')).toBe(true);

  await expect(page.locator('#cfg-anki-corpo')).not.toContainText('Perfil do Anki');
  await expect(linha(page)).toHaveCount(0);
  await expect(aviso(page)).toHaveCount(0);
});

test('com dois perfis a linha mostra o que ficou marcado na primeira conexão', async ({ page, extensao, fakes }) => {
  fakes.anki.definirPerfis(['Ana', 'Beto'], { aberto: 'Ana' });
  await abrirCard(page, extensao);

  await expect(escolha(page)).toHaveValue('Ana');
  await expect(escolha(page).locator('option')).toHaveText(['Ana', 'Beto']);
  await expect(linha(page)).toContainText('Os cartões só entram neste perfil.');
  await expect(aviso(page)).toHaveCount(0);
  expect(fakes.anki.perfilMarcado()).toBe('Ana');
});

test('escolher outro perfil pede à Conexão e a Conexão fica com ele', async ({ page, extensao, fakes }) => {
  fakes.anki.definirPerfis(['Ana', 'Beto'], { marcado: 'Ana', aberto: 'Ana' });
  await abrirCard(page, extensao);

  await escolha(page).selectOption('Beto');

  await expect.poll(() => fakes.anki.perfilMarcado()).toBe('Beto');
  expect(pedidosDeEscolha(fakes)).toEqual([{ profile: 'Beto' }]);
  await expect(escolha(page)).toHaveValue('Beto');
  await expect(aviso(page)).toHaveCount(0);
  // Escolher o perfil marcado não abre nem fecha nada no Anki: o aberto continua o que era.
  expect(fakes.anki.perfilAberto()).toBe('Ana');
});

test('o perfil marcado que o Anki já não tem dá um aviso em vermelho, mesmo com um perfil só, e escolher outro o tira', async ({ page, extensao, fakes }) => {
  fakes.anki.definirPerfis(['Beto'], { marcado: 'Ana', aberto: 'Beto' });
  await abrirCard(page, extensao);

  await expect(aviso(page)).toContainText('O perfil “Ana” não está mais no Anki. Escolha outro: nada é enviado até lá.');
  await expect(escolha(page)).toHaveValue('');
  expect(fakes.anki.perfilMarcado()).toBe('Ana');

  await escolha(page).selectOption('Beto');

  await expect(aviso(page)).toHaveCount(0);
  expect(fakes.anki.perfilMarcado()).toBe('Beto');
  expect(pedidosDeEscolha(fakes)).toEqual([{ profile: 'Beto' }]);
});

test('quando a Conexão não troca o perfil a tela diz e continua com o marcado de verdade', async ({ page, extensao, fakes }) => {
  fakes.anki.definirPerfis(['Ana', 'Beto'], { marcado: 'Ana', aberto: 'Ana' });
  fakes.anki.falharAEscolhaDoPerfil();
  await abrirCard(page, extensao);

  await escolha(page).selectOption('Beto');

  await expect(aviso(page)).toContainText('Não deu para trocar o perfil. Tente de novo.');
  await expect(escolha(page)).toHaveValue('Ana');
  expect(fakes.anki.perfilMarcado()).toBe('Ana');
});

test.describe('quando a resposta da escolha do perfil não chega', () => {
  /** O próximo `POST /anki/profile` perde a resposta (a conexão cai): com `aplicada` a Conexão chegou a marcar o perfil antes, sem `aplicada` não marcou. */
  async function perderAResposta(context, fakes, { aplicada }) {
    await context.route('**/anki/profile', async route => {
      await context.unroute('**/anki/profile');
      if (aplicada) await fakes.anki.tratar({ request: () => route.request(), fulfill: async () => {} });
      await route.abort('connectionreset');
    });
  }

  test('com o perfil marcado antes de a resposta se perder, a tela relê e mostra o escolhido, sem aviso de falha', async ({ page, extensao, context, fakes }) => {
    fakes.anki.definirPerfis(['Ana', 'Beto'], { marcado: 'Ana', aberto: 'Ana' });
    await abrirCard(page, extensao);
    await perderAResposta(context, fakes, { aplicada: true });

    await escolha(page).selectOption('Beto');

    await expect(escolha(page)).toHaveValue('Beto');
    await expect(escolha(page)).toBeEnabled();
    await expect(aviso(page)).toHaveCount(0);
    expect(fakes.anki.perfilMarcado()).toBe('Beto');
  });

  test('com o perfil que não chegou a ser marcado, a tela relê e só então diz que não trocou', async ({ page, extensao, context, fakes }) => {
    fakes.anki.definirPerfis(['Ana', 'Beto'], { marcado: 'Ana', aberto: 'Ana' });
    await abrirCard(page, extensao);
    await perderAResposta(context, fakes, { aplicada: false });

    await escolha(page).selectOption('Beto');

    await expect(aviso(page)).toContainText('Não deu para trocar o perfil. Tente de novo.');
    await expect(escolha(page)).toHaveValue('Ana');
    expect(fakes.anki.perfilMarcado()).toBe('Ana');
  });

  test('sem conseguir reler depois, a tela não afirma troca nem recusa', async ({ page, extensao, context, fakes }) => {
    fakes.anki.definirPerfis(['Ana', 'Beto'], { marcado: 'Ana', aberto: 'Ana' });
    await abrirCard(page, extensao);
    await expect(escolha(page)).toBeVisible();
    fakes.anki.responder('POST', '/anki/profiles', () => ({ status: 500, json: { error: 'internal_error' } }));
    await perderAResposta(context, fakes, { aplicada: true });

    await escolha(page).selectOption('Beto');

    await expect(linha(page)).toHaveCount(0);
    await expect(page.getByText('Não deu para trocar o perfil')).toHaveCount(0);
    expect(fakes.anki.perfilMarcado()).toBe('Beto');
  });
});

test('sem a Conexão ligada a linha não aparece', async ({ page, extensao, fakes }) => {
  fakes.anki.definirPerfis(['Ana', 'Beto'], { marcado: 'Ana', aberto: 'Ana' });
  fakes.anki.desligar();
  await abrirCard(page, extensao);

  await expect(page.locator('#cfg-anki-nota')).toContainText('Indisponível');
  await expect(linha(page)).toHaveCount(0);
});
