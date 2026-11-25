'use strict';

const { createHash } = require('crypto');
const { test, expect } = require('../fixtures');

const CLIENTE_DO_GOOGLE = '777592854175-o2ha6n3oqv4f9i2mavbdmfoqbh9iauio.apps.googleusercontent.com';
const CINQUENTA_E_CINCO_MINUTOS = 55 * 60 * 1000;

const conta = page => page.locator('#cfg-conta');
const entrarComGoogle = page => conta(page).getByRole('button', { name: 'Entrar com Google' });

async function abrirAConta(page, extensao) {
  await page.goto(extensao.url('painel.html#configuracoes/conta'));
  await expect(entrarComGoogle(page)).toBeVisible();
}

async function detalhesDoCard(page) {
  const detalhes = conta(page).locator('details');
  await detalhes.locator('summary', { hasText: 'Detalhes' }).click();
  return detalhes.locator('pre');
}

async function entrarEEsperarAConta(page, extensao) {
  await abrirAConta(page, extensao);
  await entrarComGoogle(page).click();
  await expect(page.locator('#shell-chip-estado')).toHaveText('Sincronizado agora');
}

const guardado = extensao => extensao.lerStorage(['pm_user_info']).then(dados => dados.pm_user_info);

test('o pedido ao Google leva o cliente, o endereço de volta, o escopo e o nonce embaralhado', async ({ page, extensao, fakes }) => {
  await entrarEEsperarAConta(page, extensao);

  expect(fakes.google.pedidosDeLogin).toHaveLength(1);
  const pedido = fakes.google.pedidosDeLogin[0];
  expect(pedido).toMatchObject({
    client_id: CLIENTE_DO_GOOGLE,
    response_type: 'token id_token',
    redirect_uri: `https://${extensao.id}.chromiumapp.org/`,
    scope: 'openid email profile',
    prompt: 'select_account',
  });
  expect(pedido.nonce).toMatch(/^[0-9a-f]{64}$/);
  expect(Object.keys(pedido).sort()).toEqual(['client_id', 'nonce', 'prompt', 'redirect_uri', 'response_type', 'scope']);
  expect(await guardado(extensao)).toMatchObject({ uid: 'uid-teste' });
});

test('o Firebase recebe o id_token do Google e o nonce de verdade, de que o Google recebeu só o resumo', async ({ page, extensao, fakes }) => {
  await entrarEEsperarAConta(page, extensao);

  expect(fakes.google.entradasNoFirebase).toHaveLength(1);
  const { chave, tipo, corpo } = fakes.google.entradasNoFirebase[0];
  expect(chave).toMatch(/^AIza/);
  expect(tipo).toBe('application/json');
  expect(Object.keys(corpo).sort()).toEqual(['postBody', 'requestUri', 'returnIdpCredential', 'returnSecureToken']);
  expect(corpo).toMatchObject({
    requestUri: `https://${extensao.id}.chromiumapp.org/`,
    returnIdpCredential: true,
    returnSecureToken: true,
  });
  const campos = new URLSearchParams(corpo.postBody);
  expect([...campos.keys()]).toEqual(['id_token', 'nonce', 'providerId']);
  expect(campos.get('id_token')).toBe('id-token-teste');
  expect(campos.get('providerId')).toBe('google.com');
  expect(campos.get('nonce')).toMatch(/^[0-9a-f]{64}$/);
  const resumo = createHash('sha256').update(campos.get('nonce')).digest('hex');
  expect(fakes.google.pedidosDeLogin[0].nonce).toBe(resumo);
  expect(await guardado(extensao)).toMatchObject({ uid: 'uid-teste' });
});

test('cada entrada sorteia um nonce novo', async ({ page, extensao, fakes }) => {
  fakes.google.proximoLogin('falhar');
  await abrirAConta(page, extensao);
  await entrarComGoogle(page).click();
  await expect(conta(page).getByRole('alert')).toBeVisible();

  fakes.google.proximoLogin('entrar');
  await conta(page).getByRole('alert').getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.locator('#shell-chip-estado')).toHaveText('Sincronizado agora');

  const { pedidosDeLogin } = fakes.google;
  expect(pedidosDeLogin.at(0).nonce).not.toBe(pedidosDeLogin.at(-1).nonce);
  expect(await guardado(extensao)).toMatchObject({ uid: 'uid-teste' });
});

test('o perfil vem do Google com o token de acesso, e a pessoa fica guardada com a sessão do Firebase', async ({ page, extensao, fakes }) => {
  fakes.google.usarPerfil({ name: 'Bruno Lima', email: 'bruno@teste.dev', picture: 'https://fotos.teste.dev/bruno.png' });
  const antes = Date.now();

  await entrarEEsperarAConta(page, extensao);

  expect(fakes.google.pedidosDoPerfil).toEqual([{ autorizacao: 'Bearer access-token-teste' }]);
  expect(await extensao.lerStorage(['pm_user_info', 'pm_migrated'])).toEqual({
    pm_user_info: { uid: 'uid-teste', email: 'bruno@teste.dev', displayName: 'Bruno Lima', photoURL: 'https://fotos.teste.dev/bruno.png' },
    pm_migrated: 'uid-teste',
  });
  const sessao = await extensao.lerSessao();
  expect(sessao).toMatchObject({ uid: 'uid-teste', idToken: 'token-teste', refreshToken: 'refresh-teste' });
  expect(sessao.expiresAt).toBeGreaterThanOrEqual(antes + CINQUENTA_E_CINCO_MINUTOS);
  expect(sessao.expiresAt).toBeLessThanOrEqual(Date.now() + CINQUENTA_E_CINCO_MINUTOS);
});

const FALHAS = [
  {
    nome: 'o Google voltou sem id_token: o erro diz isso e nada fica guardado',
    provocar: fakes => fakes.google.proximoLogin('sem-token'),
    detalhe: 'id_token não encontrado na resposta do Google',
    foiAoPerfil: false,
    foiAoFirebase: false,
  },
  {
    nome: 'o Google recusou o perfil: o erro diz isso, o Firebase nem é chamado e nada fica guardado',
    provocar: fakes => fakes.google.deixarOPerfilIndisponivel(),
    detalhe: 'Falha ao obter dados do usuário Google',
    foiAoPerfil: true,
    foiAoFirebase: false,
  },
  {
    nome: 'o Firebase recusou a entrada: o erro traz a mensagem dele e nada fica guardado',
    provocar: fakes => fakes.google.recusarEntradaNoFirebase(),
    detalhe: 'Firebase Auth falhou: INVALID_IDP_RESPONSE',
    foiAoPerfil: true,
    foiAoFirebase: true,
  },
];

for (const falha of FALHAS) {
  test(falha.nome, async ({ page, extensao, fakes }) => {
    falha.provocar(fakes);
    await abrirAConta(page, extensao);

    await entrarComGoogle(page).click();

    await expect(conta(page).getByRole('alert')).toContainText('Não deu para entrar com o Google. Tente de novo.');
    await expect(await detalhesDoCard(page)).toContainText(falha.detalhe);
    expect(fakes.google.pedidosDoPerfil).toHaveLength(falha.foiAoPerfil ? 1 : 0);
    expect(fakes.google.entradasNoFirebase).toHaveLength(falha.foiAoFirebase ? 1 : 0);
    expect(await extensao.lerStorage(['pm_user_info'])).toEqual({});
    expect(await extensao.lerSessao()).toBeNull();
  });
}
