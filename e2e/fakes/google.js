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
    const caminhoCompleto = decodeURIComponent(url.origin + url.pathname).replace(URL_DOS_DOCUMENTOS, '');
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
    /** Ids com tombstone no Firestore do usuário (`usuarios/{uid}/meta/deleted`). */
    apagadasDe(uid) {
      return Object.keys(documentos.get(`usuarios/${uid}/meta/deleted`)?.ids?.mapValue?.fields || {});
    },
    recusarEscritas(valor = true) { recusarEscritas = valor; },
    /** A leitura das frases da conta nunca responde. */
    segurarLeituras() { leituraDasFrases = 'segurar'; },
    /** A leitura das frases da conta falha com 503. */
    recusarLeituras() { leituraDasFrases = 'recusar'; },
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
