'use strict';

(function (raiz) {
  const { Sincronizacao } = raiz;

  const CLIENTE_DO_GOOGLE = '777592854175-o2ha6n3oqv4f9i2mavbdmfoqbh9iauio.apps.googleusercontent.com';
  const ENDERECO_DO_LOGIN = 'https://accounts.google.com/o/oauth2/v2/auth';
  const ENDERECO_DO_PERFIL = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json';
  const ENDERECO_DO_FIREBASE = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${Sincronizacao.CHAVE_DA_API}`;
  const VALIDADE_DA_SESSAO_EM_MS = 55 * 60 * 1000;
  const BYTES_DO_NONCE = 32;

  const emHexadecimal = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

  function abrirAJanelaDoGoogle(endereco) {
    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url: endereco, interactive: true }, resposta => {
        if (chrome.runtime.lastError || !resposta) reject(new Error(chrome.runtime.lastError?.message || 'Login cancelado'));
        else resolve(resposta);
      });
    });
  }

  const portasDoChrome = () => ({
    enderecoDeVolta: () => chrome.identity.getRedirectURL(),
    sortear: bytes => crypto.getRandomValues(bytes),
    resumir: bytes => crypto.subtle.digest('SHA-256', bytes),
    abrirJanela: abrirAJanelaDoGoogle,
    buscar: (...argumentos) => fetch(...argumentos),
    agora: () => Date.now(),
  });

  async function prepararOPedido({ enderecoDeVolta, sortear, resumir }) {
    const nonce = emHexadecimal(sortear(new Uint8Array(BYTES_DO_NONCE)));
    const nonceEmbaralhado = emHexadecimal(new Uint8Array(await resumir(new TextEncoder().encode(nonce))));
    const endereco = new URL(ENDERECO_DO_LOGIN);
    const parametros = [
      ['client_id', CLIENTE_DO_GOOGLE],
      ['response_type', 'token id_token'],
      ['redirect_uri', enderecoDeVolta],
      ['scope', 'openid email profile'],
      ['nonce', nonceEmbaralhado],
      ['prompt', 'select_account'],
    ];
    for (const [nome, valor] of parametros) endereco.searchParams.set(nome, valor);
    return { endereco: endereco.toString(), nonce, enderecoDeVolta };
  }

  async function pedirAoGoogle({ pedido, abrirJanela }) {
    const resposta = await abrirJanela(pedido.endereco);
    const campos = new URLSearchParams(new URL(resposta).hash.slice(1));
    const idToken = campos.get('id_token');
    if (!idToken) throw new Error('id_token não encontrado na resposta do Google');
    return { idToken, accessToken: campos.get('access_token') };
  }

  async function lerOPerfil({ accessToken, buscar }) {
    const resposta = await buscar(ENDERECO_DO_PERFIL, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resposta.ok) throw new Error('Falha ao obter dados do usuário Google');
    return resposta.json();
  }

  async function entrarNoFirebase({ pedido, idToken, buscar }) {
    const resposta = await buscar(ENDERECO_DO_FIREBASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody: `id_token=${idToken}&nonce=${pedido.nonce}&providerId=google.com`,
        requestUri: pedido.enderecoDeVolta,
        returnIdpCredential: true,
        returnSecureToken: true,
      }),
    });
    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({}));
      throw new Error('Firebase Auth falhou: ' + (erro?.error?.message || resposta.status));
    }
    return resposta.json();
  }

  async function trocarPelaSessao({ pedido, respostaDoGoogle, buscar, agora }) {
    const perfil = await lerOPerfil({ accessToken: respostaDoGoogle.accessToken, buscar });
    const sessao = await entrarNoFirebase({ pedido, idToken: respostaDoGoogle.idToken, buscar });
    return {
      usuario: { uid: sessao.localId, email: perfil.email, displayName: perfil.name, photoURL: perfil.picture },
      credenciais: {
        uid: sessao.localId,
        idToken: sessao.idToken,
        refreshToken: sessao.refreshToken,
        expiresAt: agora() + VALIDADE_DA_SESSAO_EM_MS,
      },
    };
  }

  async function entrar(portasDeTeste = {}) {
    const portas = { ...portasDoChrome(), ...portasDeTeste };
    const pedido = await prepararOPedido({ ...portas, enderecoDeVolta: portas.enderecoDeVolta() });
    const respostaDoGoogle = await pedirAoGoogle({ pedido, abrirJanela: portas.abrirJanela });
    return trocarPelaSessao({ pedido, respostaDoGoogle, buscar: portas.buscar, agora: portas.agora });
  }

  const foiCancelado = erro => /did not approve|cancel/i.test(erro?.message || '');

  raiz.EntradaComGoogle = { entrar, prepararOPedido, pedirAoGoogle, trocarPelaSessao, foiCancelado };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
