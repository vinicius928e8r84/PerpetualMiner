'use strict';

const assert = require('assert');
const { createHash } = require('crypto');
const fs = require('fs');
const test = require('node:test');
const vm = require('vm');

const ENDERECO_DE_VOLTA = 'https://abcdef.chromiumapp.org/';
const NONCE_SORTEADO = Array.from({ length: 32 }, (_, i) => i * 7 % 256);
const NONCE_EM_HEXADECIMAL = Buffer.from(NONCE_SORTEADO).toString('hex');
const comoDado = valor => JSON.parse(JSON.stringify(valor));

function abrirOModulo() {
  const contexto = vm.createContext({ URL, URLSearchParams, TextEncoder, Uint8Array, Date, JSON, Promise });
  contexto.globalThis = contexto;
  contexto.PerpetualMiner = { Sincronizacao: { CHAVE_DA_API: 'chave-de-teste' } };
  vm.runInContext(fs.readFileSync('lib/entrada-com-google.js', 'utf8'), contexto);
  return contexto.PerpetualMiner.EntradaComGoogle;
}

const sortear = bytes => { bytes.set(NONCE_SORTEADO); return bytes; };
const resumir = async bytes => createHash('sha256').update(Buffer.from(bytes)).digest().buffer;

function respostaDe(corpo, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => { if (corpo === undefined) throw new Error('sem corpo'); return corpo; } };
}

function buscaDeMentira(respostas) {
  const pedidos = [];
  const buscar = async (endereco, opcoes) => {
    pedidos.push({ endereco, opcoes });
    return respostas[pedidos.length - 1];
  };
  return { buscar, pedidos };
}

const PERFIL = { email: 'bruno@teste.dev', name: 'Bruno Lima', picture: 'https://fotos.teste.dev/bruno.png' };
const SESSAO = { localId: 'uid-1', idToken: 'token-1', refreshToken: 'refresh-1' };
const PEDIDO = { endereco: 'https://accounts.google.com/x', nonce: 'nonce-de-verdade', enderecoDeVolta: ENDERECO_DE_VOLTA };

test('preparar o pedido: o nonce sorteado vira hexadecimal, e o Google recebe só o resumo dele', async () => {
  const { prepararOPedido } = abrirOModulo();

  const pedido = await prepararOPedido({ enderecoDeVolta: ENDERECO_DE_VOLTA, sortear, resumir });

  assert.strictEqual(pedido.nonce, NONCE_EM_HEXADECIMAL);
  assert.strictEqual(pedido.enderecoDeVolta, ENDERECO_DE_VOLTA);
  const endereco = new URL(pedido.endereco);
  assert.strictEqual(endereco.origin + endereco.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.deepStrictEqual(comoDado([...endereco.searchParams]), [
    ['client_id', '777592854175-o2ha6n3oqv4f9i2mavbdmfoqbh9iauio.apps.googleusercontent.com'],
    ['response_type', 'token id_token'],
    ['redirect_uri', ENDERECO_DE_VOLTA],
    ['scope', 'openid email profile'],
    ['nonce', createHash('sha256').update(NONCE_EM_HEXADECIMAL).digest('hex')],
    ['prompt', 'select_account'],
  ]);
});

test('preparar o pedido: o sorteio pede 32 bytes', async () => {
  const { prepararOPedido } = abrirOModulo();
  let tamanho = null;

  await prepararOPedido({ enderecoDeVolta: ENDERECO_DE_VOLTA, sortear: bytes => { tamanho = bytes.length; return bytes; }, resumir });

  assert.strictEqual(tamanho, 32);
});

test('pedir ao Google: abre a janela no endereço do pedido e lê os dois tokens do que volta depois do #', async () => {
  const { pedirAoGoogle } = abrirOModulo();
  const abertas = [];

  const resposta = await pedirAoGoogle({
    pedido: PEDIDO,
    abrirJanela: async endereco => { abertas.push(endereco); return `${ENDERECO_DE_VOLTA}#id_token=id-1&access_token=acesso-1&token_type=Bearer`; },
  });

  assert.deepStrictEqual(comoDado(abertas), [PEDIDO.endereco]);
  assert.deepStrictEqual(comoDado(resposta), { idToken: 'id-1', accessToken: 'acesso-1' });
});

test('pedir ao Google: sem id_token na volta, o erro diz isso', async () => {
  const { pedirAoGoogle } = abrirOModulo();

  await assert.rejects(
    pedirAoGoogle({ pedido: PEDIDO, abrirJanela: async () => `${ENDERECO_DE_VOLTA}#access_token=acesso-1` }),
    { message: 'id_token não encontrado na resposta do Google' },
  );
});

test('pedir ao Google: o erro da janela passa como veio', async () => {
  const { pedirAoGoogle } = abrirOModulo();

  await assert.rejects(
    pedirAoGoogle({ pedido: PEDIDO, abrirJanela: async () => { throw new Error('The user did not approve access.'); } }),
    { message: 'The user did not approve access.' },
  );
});

test('trocar pela sessão: o perfil pede com o token de acesso, o Firebase recebe o id_token e o nonce de verdade', async () => {
  const { trocarPelaSessao } = abrirOModulo();
  const { buscar, pedidos } = buscaDeMentira([respostaDe(PERFIL), respostaDe(SESSAO)]);

  await trocarPelaSessao({ pedido: PEDIDO, respostaDoGoogle: { idToken: 'id-1', accessToken: 'acesso-1' }, buscar, agora: () => 1_000 });

  assert.strictEqual(pedidos.length, 2);
  assert.strictEqual(pedidos[0].endereco, 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json');
  assert.deepStrictEqual(comoDado(pedidos[0].opcoes), { headers: { Authorization: 'Bearer acesso-1' } });
  assert.strictEqual(pedidos[1].endereco, 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=chave-de-teste');
  assert.strictEqual(pedidos[1].opcoes.method, 'POST');
  assert.deepStrictEqual(comoDado(pedidos[1].opcoes.headers), { 'Content-Type': 'application/json' });
  assert.deepStrictEqual(comoDado(JSON.parse(pedidos[1].opcoes.body)), {
    postBody: 'id_token=id-1&nonce=nonce-de-verdade&providerId=google.com',
    requestUri: ENDERECO_DE_VOLTA,
    returnIdpCredential: true,
    returnSecureToken: true,
  });
});

test('trocar pela sessão: devolve a pessoa e as credenciais, que valem 55 minutos', async () => {
  const { trocarPelaSessao } = abrirOModulo();
  const { buscar } = buscaDeMentira([respostaDe(PERFIL), respostaDe(SESSAO)]);

  const entrada = await trocarPelaSessao({ pedido: PEDIDO, respostaDoGoogle: { idToken: 'id-1', accessToken: 'acesso-1' }, buscar, agora: () => 1_000 });

  assert.deepStrictEqual(comoDado(entrada), {
    usuario: { uid: 'uid-1', email: 'bruno@teste.dev', displayName: 'Bruno Lima', photoURL: 'https://fotos.teste.dev/bruno.png' },
    credenciais: { uid: 'uid-1', idToken: 'token-1', refreshToken: 'refresh-1', expiresAt: 1_000 + 55 * 60 * 1000 },
  });
});

test('trocar pela sessão: sem o perfil do Google, o Firebase nem é chamado', async () => {
  const { trocarPelaSessao } = abrirOModulo();
  const { buscar, pedidos } = buscaDeMentira([respostaDe({}, { ok: false, status: 401 })]);

  await assert.rejects(
    trocarPelaSessao({ pedido: PEDIDO, respostaDoGoogle: { idToken: 'id-1', accessToken: 'acesso-1' }, buscar, agora: () => 0 }),
    { message: 'Falha ao obter dados do usuário Google' },
  );
  assert.strictEqual(pedidos.length, 1);
});

test('trocar pela sessão: o Firebase recusou, e o erro traz a mensagem dele', async () => {
  const { trocarPelaSessao } = abrirOModulo();
  const { buscar } = buscaDeMentira([respostaDe(PERFIL), respostaDe({ error: { message: 'INVALID_IDP_RESPONSE' } }, { ok: false, status: 400 })]);

  await assert.rejects(
    trocarPelaSessao({ pedido: PEDIDO, respostaDoGoogle: { idToken: 'id-1', accessToken: 'acesso-1' }, buscar, agora: () => 0 }),
    { message: 'Firebase Auth falhou: INVALID_IDP_RESPONSE' },
  );
});

test('trocar pela sessão: o Firebase recusou sem corpo legível, e o erro traz o código HTTP', async () => {
  const { trocarPelaSessao } = abrirOModulo();
  const { buscar } = buscaDeMentira([respostaDe(PERFIL), respostaDe(undefined, { ok: false, status: 502 })]);

  await assert.rejects(
    trocarPelaSessao({ pedido: PEDIDO, respostaDoGoogle: { idToken: 'id-1', accessToken: 'acesso-1' }, buscar, agora: () => 0 }),
    { message: 'Firebase Auth falhou: 502' },
  );
});

test('entrar: os três passos em ordem, com o endereço de volta da extensão no pedido e no Firebase', async () => {
  const { entrar } = abrirOModulo();
  const { buscar, pedidos } = buscaDeMentira([respostaDe(PERFIL), respostaDe(SESSAO)]);
  const abertas = [];

  const { usuario, credenciais } = await entrar({
    enderecoDeVolta: () => ENDERECO_DE_VOLTA,
    sortear,
    resumir,
    abrirJanela: async endereco => { abertas.push(endereco); return `${ENDERECO_DE_VOLTA}#id_token=id-1&access_token=acesso-1`; },
    buscar,
    agora: () => 5,
  });

  assert.strictEqual(new URL(abertas[0]).searchParams.get('redirect_uri'), ENDERECO_DE_VOLTA);
  assert.strictEqual(JSON.parse(pedidos[1].opcoes.body).requestUri, ENDERECO_DE_VOLTA);
  assert.strictEqual(JSON.parse(pedidos[1].opcoes.body).postBody, `id_token=id-1&nonce=${NONCE_EM_HEXADECIMAL}&providerId=google.com`);
  assert.strictEqual(usuario.displayName, 'Bruno Lima');
  assert.strictEqual(credenciais.expiresAt, 5 + 55 * 60 * 1000);
});

test('entrar: se o Google falha, nada vai ao perfil nem ao Firebase', async () => {
  const { entrar } = abrirOModulo();
  const { buscar, pedidos } = buscaDeMentira([]);

  await assert.rejects(
    entrar({ enderecoDeVolta: () => ENDERECO_DE_VOLTA, sortear, resumir, abrirJanela: async () => { throw new Error('Login cancelado'); }, buscar }),
    { message: 'Login cancelado' },
  );
  assert.strictEqual(pedidos.length, 0);
});

test('foi cancelado: só a recusa ou o cancelamento da janela, não os outros erros', () => {
  const { foiCancelado } = abrirOModulo();

  assert.strictEqual(foiCancelado(new Error('The user did not approve access.')), true);
  assert.strictEqual(foiCancelado(new Error('Login cancelado')), true);
  assert.strictEqual(foiCancelado(new Error('Authorization page could not be loaded.')), false);
  assert.strictEqual(foiCancelado(new Error('Firebase Auth falhou: INVALID_IDP_RESPONSE')), false);
  assert.strictEqual(foiCancelado(undefined), false);
  assert.strictEqual(foiCancelado(null), false);
});
