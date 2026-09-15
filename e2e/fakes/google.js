'use strict';

// Fake do Firestore (REST) e dos endpoints de conta do Google/Firebase.
// Guarda os documentos em memória, por caminho relativo a `.../documents/`,
// no mesmo formato de campos que a API REST usa.

const FIRESTORE_DOCS = /^https:\/\/firestore\.googleapis\.com\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents/;

function criarFakeGoogle() {
  const documentos = new Map();   // 'usuarios/uid/frases/123' → fields
  const requisicoes = [];
  let recusarEscritas = false;

  async function tratar(route) {
    const req = route.request();
    const url = new URL(req.url());
    requisicoes.push({ metodo: req.method(), url: req.url() });

    if (url.hostname === 'firestore.googleapis.com') return tratarFirestore(route, req, url);
    if (url.hostname === 'securetoken.googleapis.com') {
      return responderJson(route, 200, { id_token: 'token-renovado', refresh_token: 'refresh-renovado', expires_in: '3600' });
    }
    if (url.hostname === 'identitytoolkit.googleapis.com') {
      return responderJson(route, 200, { localId: 'uid-teste', idToken: 'token-teste', refreshToken: 'refresh-teste' });
    }
    if (url.hostname === 'www.googleapis.com' && url.pathname.startsWith('/oauth2/')) {
      return responderJson(route, 200, { email: 'pessoa@teste.dev', name: 'Pessoa de Teste', picture: '' });
    }
    return responderJson(route, 404, { error: { message: 'not_found' } });
  }

  function tratarFirestore(route, req, url) {
    const caminhoCompleto = decodeURIComponent(url.origin + url.pathname).replace(FIRESTORE_DOCS, '');
    const metodo = req.method();

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
      const fields = req.postDataJSON().fields || {};
      const mascara = url.searchParams.getAll('updateMask.fieldPaths');
      const atual = documentos.get(caminho) || {};
      const novo = mascara.length
        ? { ...atual, ...Object.fromEntries(mascara.filter(c => c in fields).map(c => [c, fields[c]])) }
        : fields;
      documentos.set(caminho, novo);
      return responderJson(route, 200, { name: nomeDoCaminho(caminho), fields: novo });
    }
    if (metodo === 'DELETE') {
      if (!documentos.delete(caminho)) return responderJson(route, 404, { error: { message: 'NOT_FOUND' } });
      return responderJson(route, 200, {});
    }
    return responderJson(route, 400, { error: { message: `não suportado: ${metodo} ${caminho}` } });
  }

  return {
    padrao: /^https:\/\/(firestore|securetoken|identitytoolkit|www)\.googleapis\.com\//,
    tratar,
    requisicoes,
    /** Frases do usuário no Firestore, já convertidas de campos para objetos. */
    frasesDe(uid) {
      const prefixo = `usuarios/${uid}/frases/`;
      return [...documentos]
        .filter(([doc]) => doc.startsWith(prefixo))
        .map(([, fields]) => camposParaObjeto(fields));
    },
    recusarEscritas(valor = true) { recusarEscritas = valor; },
  };
}

function caminhoDoNome(nome) {
  return nome.replace(/^projects\/[^/]+\/databases\/\(default\)\/documents\//, '');
}

function nomeDoCaminho(caminho) {
  return `projects/perpetualminer-4c219/databases/(default)/documents/${caminho}`;
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

function responderJson(route, status, json) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
}

module.exports = { criarFakeGoogle };
