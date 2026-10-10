'use strict';

// Fake do Firestore (REST) e dos endpoints de conta do Google/Firebase.
// Guarda os documentos em memória, por caminho relativo a `.../documents/`,
// no mesmo formato de campos que a API REST usa.

const { responderJson } = require('./http');

const RAIZ_DOS_DOCUMENTOS = 'projects/perpetualminer-4c219/databases/(default)/documents';
const URL_DOS_DOCUMENTOS = `https://firestore.googleapis.com/v1/${RAIZ_DOS_DOCUMENTOS}`;

function criarFakeGoogle() {
  const documentos = new Map();   // 'usuarios/uid/frases/123' → fields
  const requisicoes = [];
  let recusarEscritas = false;
  // A leitura da coleção de frases: 'normal', 'segurar' (nunca responde: a
  // lista fica carregando) ou 'recusar' (a nuvem falha ao carregar).
  let leituraDasFrases = 'normal';
  let foraDoAr = false;          // todo pedido ao Firestore: 503
  let acessoRecusado = false;    // todo pedido ao Firestore: 403 PERMISSION_DENIED
  let sessaoExpirada = false;    // a renovação do token é recusada
  let modoDoLogin = 'entrar';
  let perfil = { email: 'pessoa@teste.dev', name: 'Pessoa de Teste', picture: '' };

  async function tratar(route) {
    const req = route.request();
    const url = new URL(req.url());
    requisicoes.push({ metodo: req.method(), url: req.url() });

    if (url.hostname === 'firestore.googleapis.com') return tratarFirestore(route, req, url);
    if (url.hostname === 'securetoken.googleapis.com') {
      if (sessaoExpirada) return responderJson(route, 400, { error: { message: 'TOKEN_EXPIRED' } });
      return responderJson(route, 200, { id_token: 'token-renovado', refresh_token: 'refresh-renovado', expires_in: '3600' });
    }
    if (url.hostname === 'identitytoolkit.googleapis.com') {
      return responderJson(route, 200, { localId: 'uid-teste', idToken: 'token-teste', refreshToken: 'refresh-teste' });
    }
    if (url.hostname === 'www.googleapis.com' && url.pathname.startsWith('/oauth2/')) {
      return responderJson(route, 200, perfil);
    }
    return responderJson(route, 404, { error: { message: 'not_found' } });
  }

  function tratarFirestore(route, req, url) {
    const caminhoCompleto = decodeURIComponent(url.origin + url.pathname).replace(URL_DOS_DOCUMENTOS, '');
    const metodo = req.method();

    if (foraDoAr) return responderJson(route, 503, { error: { code: 503, status: 'UNAVAILABLE', message: 'The service is currently unavailable.' } });
    if (acessoRecusado) {
      return responderJson(route, 403, { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Missing or insufficient permissions.' } });
    }

    if (caminhoCompleto === ':batchWrite' && metodo === 'POST') {
      if (recusarEscritas) return responderJson(route, 503, { error: { message: 'indisponível' } });
      for (const write of req.postDataJSON().writes || []) {
        if (write.update) documentos.set(caminhoDoNome(write.update.name), write.update.fields || {});
        if (write.delete) documentos.delete(caminhoDoNome(write.delete));
      }
      return responderJson(route, 200, { writeResults: [] });
    }

    const caminho = caminhoCompleto.replace(/^\//, '');
    const segmentos = caminho.split('/');
    const ehColecao = segmentos.length % 2 === 1;

    if (metodo === 'GET' && ehColecao) {
      if (leituraDasFrases === 'segurar') return new Promise(() => {});
      if (leituraDasFrases === 'recusar') return responderJson(route, 503, { error: { message: 'indisponível' } });
      const prefixo = `${caminho}/`;
      const documents = [...documentos]
        .filter(([doc]) => doc.startsWith(prefixo) && !doc.slice(prefixo.length).includes('/'))
        .map(([doc, fields]) => ({ name: nomeDoCaminho(doc), fields }));
      return responderJson(route, 200, documents.length ? { documents } : {});
    }
    if (metodo === 'GET') {
      if (!documentos.has(caminho)) return responderJson(route, 404, { error: { message: 'NOT_FOUND' } });
      return responderJson(route, 200, { name: nomeDoCaminho(caminho), fields: documentos.get(caminho) });
    }
    if (metodo === 'PATCH') {
      if (recusarEscritas) return responderJson(route, 503, { error: { message: 'indisponível' } });
      if (url.searchParams.get('currentDocument.exists') === 'true' && !documentos.has(caminho)) {
        return responderJson(route, 404, { error: { status: 'NOT_FOUND', message: 'NOT_FOUND' } });
      }
      const fields = req.postDataJSON().fields || {};
      let mascara;
      try {
        mascara = url.searchParams.getAll('updateMask.fieldPaths').map(segmentosDoCaminhoDeCampo);
      } catch (erro) {
        return responderJson(route, 400, { error: { status: 'INVALID_ARGUMENT', message: erro.message } });
      }
      let novo = fields;
      if (mascara.length) {
        novo = structuredClone(documentos.get(caminho) || {});
        for (const segmentos of mascara) gravarCampo(novo, segmentos, lerCampo(fields, segmentos));
      }
      documentos.set(caminho, novo);
      return responderJson(route, 200, { name: nomeDoCaminho(caminho), fields: novo });
    }
    if (metodo === 'DELETE') {
      if (!documentos.delete(caminho)) return responderJson(route, 404, { error: { message: 'NOT_FOUND' } });
      return responderJson(route, 200, {});
    }
    return responderJson(route, 400, { error: { message: `não suportado: ${metodo} ${caminho}` } });
  }

  /**
   * A página de login do Google (servida pelo servidor HTTPS do fixture, porque
   * a janela de login não passa pelo roteamento do Playwright):
   *   'entrar'  a pessoa escolhe a conta: volta para a extensão com os tokens;
   *   'janela'  a janela fica aberta esperando (o teste pode fechá-la: cancelar);
   *   'falhar'  a página não carrega.
   */
  function responderLogin(url, req, res) {
    if (modoDoLogin === 'falhar') {
      req.socket.destroy();
      return;
    }
    if (modoDoLogin === 'janela') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h1>Escolha uma conta</h1>');
      return;
    }
    const volta = `${url.searchParams.get('redirect_uri')}#id_token=id-token-teste&access_token=access-token-teste`;
    res.writeHead(302, { Location: volta }).end();
  }

  return {
    padrao: /^https:\/\/(firestore|securetoken|identitytoolkit|www)\.googleapis\.com\//,
    tratar,
    requisicoes,
    /** O seam REST que o complemento (não mais o navegador) usa para a chave. */
    async pedidoDaConexao(metodo, uid, token, fields) {
      let resposta;
      const url = `${URL_DOS_DOCUMENTOS}/usuarios/${encodeURIComponent(uid)}/segredos/openai`;
      await tratar({ request: () => ({ url: () => url, method: () => metodo,
        headers: () => ({ authorization: `Bearer ${token}` }), postDataJSON: () => ({ fields }) }),
      fulfill: async ({ status, body }) => { resposta = { status, json: JSON.parse(body) }; } });
      return resposta;
    },
    /** @estado-guardado Frases do usuário no Firestore, já convertidas de campos para objetos. */
    frasesDe(uid) {
      const prefixo = `usuarios/${uid}/frases/`;
      return [...documentos]
        .filter(([doc]) => doc.startsWith(prefixo))
        .map(([, fields]) => camposParaObjeto(fields));
    },
    /** @estado-guardado Ids com tombstone no Firestore do usuário (`usuarios/{uid}/meta/deleted`). */
    apagadasDe(uid) {
      return Object.keys(documentos.get(`usuarios/${uid}/meta/deleted`)?.ids?.mapValue?.fields || {});
    },
    /**
     * @estado-guardado A chave da OpenAI da conta (`usuarios/{uid}/segredos/openai`), já convertida em objeto:
     * `{ chave, em }`, o tombstone `{ apagada: true, em }`, ou null se a conta nunca teve chave.
     */
    chaveDaOpenAIDe(uid) {
      const campos = documentos.get(`usuarios/${uid}/segredos/openai`);
      return campos ? camposParaObjeto(campos) : null;
    },
    /** A chave (ou o tombstone, com `apagada: true`) que outro computador da conta já deixou na nuvem. */
    gravarChaveDaOpenAI(uid, documento) {
      documentos.set(`usuarios/${uid}/segredos/openai`, objetoParaCampos(documento));
    },
    recusarEscritas(valor = true) { recusarEscritas = valor; },
    /** A leitura das frases da conta nunca responde. */
    segurarLeituras() { leituraDasFrases = 'segurar'; },
    /** A leitura das frases da conta falha com 503. */
    recusarLeituras() { leituraDasFrases = 'recusar'; },
    /** O Firestore fora do ar: todo pedido responde 503. */
    ficarForaDoAr(valor = true) { foraDoAr = valor; },
    /** As regras do Firestore recusam a conta: todo pedido responde 403. */
    recusarAcesso(valor = true) { acessoRecusado = valor; },
    /** O refresh token não vale mais: renovar a sessão falha. */
    expirarSessao(valor = true) { sessaoExpirada = valor; },
    /** Frases que já estão na nuvem da conta `uid`. */
    gravarFrases(uid, frases) {
      for (const frase of frases) documentos.set(`usuarios/${uid}/frases/${frase.id}`, objetoParaCampos(frase));
    },
    /** O que a próxima janela de login faz: 'entrar', 'janela' ou 'falhar'. */
    proximoLogin(modo) { modoDoLogin = modo; },
    /** O perfil que o Google devolve no login (nome, e-mail, foto). */
    usarPerfil(novo) { perfil = { ...perfil, ...novo }; },
    responderLogin,
  };
}

function caminhoDoNome(nome) {
  return nome.replace(`${RAIZ_DOS_DOCUMENTOS}/`, '');
}

function nomeDoCaminho(caminho) {
  return `${RAIZ_DOS_DOCUMENTOS}/${caminho}`;
}

// Caminho de campo como a API REST aceita: segmentos separados por ponto, cada um
// um nome simples (letras, dígitos e _, sem começar com dígito) ou um nome entre
// crases, com \ escapando. `ids.123` é recusado; `ids.\`123\`` vale.
function segmentosDoCaminhoDeCampo(caminho) {
  const segmentos = [];
  let resto = caminho;
  while (true) {
    const simples = resto.match(/^[A-Za-z_][A-Za-z_0-9]*/);
    const citado = resto.match(/^`((?:[^`\\]|\\.)+)`/);
    if (!simples && !citado) throw new Error(`Invalid property path "${caminho}".`);
    segmentos.push(simples ? simples[0] : citado[1].replace(/\\(.)/g, '$1'));
    resto = resto.slice((simples || citado)[0].length);
    if (resto === '') return segmentos;
    if (resto[0] !== '.') throw new Error(`Invalid property path "${caminho}".`);
    resto = resto.slice(1);
  }
}

function lerCampo(fields, [primeiro, ...resto]) {
  const valor = fields?.[primeiro];
  if (!resto.length || valor === undefined) return valor;
  return lerCampo(valor.mapValue?.fields, resto);
}

// Campo da máscara ausente no corpo = campo apagado, como no Firestore.
function gravarCampo(fields, [primeiro, ...resto], valor) {
  if (!resto.length) {
    if (valor === undefined) delete fields[primeiro];
    else fields[primeiro] = valor;
    return;
  }
  if (!fields[primeiro]?.mapValue) fields[primeiro] = { mapValue: { fields: {} } };
  fields[primeiro].mapValue.fields ||= {};
  gravarCampo(fields[primeiro].mapValue.fields, resto, valor);
}

function objetoParaCampos(obj) {
  const fields = {};
  for (const [chave, valor] of Object.entries(obj)) {
    if (typeof valor === 'string') fields[chave] = { stringValue: valor };
    else if (typeof valor === 'number') fields[chave] = { integerValue: String(valor) };
    else if (typeof valor === 'boolean') fields[chave] = { booleanValue: valor };
    else if (Array.isArray(valor)) fields[chave] = { arrayValue: { values: valor.map(v => ({ stringValue: String(v) })) } };
    else if (valor && typeof valor === 'object') fields[chave] = { mapValue: { fields: objetoParaCampos(valor) } };
  }
  return fields;
}

function camposParaObjeto(fields) {
  const obj = {};
  for (const [chave, valor] of Object.entries(fields || {})) {
    if ('stringValue' in valor) obj[chave] = valor.stringValue;
    else if ('integerValue' in valor) obj[chave] = Number(valor.integerValue);
    else if ('booleanValue' in valor) obj[chave] = valor.booleanValue;
    else if ('arrayValue' in valor) obj[chave] = (valor.arrayValue.values || []).map(v => v.stringValue);
    else if ('mapValue' in valor) obj[chave] = camposParaObjeto(valor.mapValue.fields);
  }
  return obj;
}

module.exports = { criarFakeGoogle };
