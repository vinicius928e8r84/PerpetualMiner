'use strict';

const { responderJson } = require('./http');

const RAIZ_DOS_DOCUMENTOS = 'projects/perpetualminer-4c219/databases/(default)/documents';
const URL_DOS_DOCUMENTOS = `https://firestore.googleapis.com/v1/${RAIZ_DOS_DOCUMENTOS}`;
const LIMITE_DA_URL = 16 * 1024;

const PERMISSAO_NEGADA = { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Missing or insufficient permissions.' } };
const FORA_DO_AR = { error: { code: 503, status: 'UNAVAILABLE', message: 'The service is currently unavailable.' } };
const INDISPONIVEL = { error: { message: 'indisponível' } };
const NAO_ENCONTRADO = { error: { message: 'NOT_FOUND' } };
const HORA_DA_LEITURA = '2026-11-06T00:00:00Z';

const recusar = route => responderJson(route, 403, PERMISSAO_NEGADA);
const recusarPorIndisponivel = route => responderJson(route, 503, INDISPONIVEL);

function estadoInicial() {
  return {
    documentos: new Map(),
    requisicoes: [],
    recusarEscritas: false,
    leituraDasFrases: 'normal',
    foraDoAr: false,
    acessoRecusado: false,
    sessaoExpirada: false,
    quemEstaLogado: 'uid-teste',
    modoDoLogin: 'entrar',
    perfil: { email: 'pessoa@teste.dev', name: 'Pessoa de Teste', picture: '' },
  };
}

function criarFakeGoogle() {
  const estado = estadoInicial();
  const tratarPedido = route => tratar(estado, route);
  const marcar = campo => (valor = true) => { estado[campo] = valor; };
  const ligar = (campo, valor) => () => { estado[campo] = valor; };

  const responderLogin = (url, req, res) => respostaDoLogin(estado.modoDoLogin)(url, req, res);

  return {
    padrao: /^https:\/\/(firestore|securetoken|identitytoolkit|www)\.googleapis\.com\//,
    tratar: tratarPedido,
    requisicoes: estado.requisicoes,
    pedidoDaConexao: (metodo, uid, token, fields) => pedidoDaConexao(tratarPedido, { metodo, uid, token, fields }),
    /** @estado-guardado Frases do usuário no Firestore, já convertidas de campos para objetos. */
    frasesDe: uid => objetosComOPrefixo(estado.documentos, `usuarios/${uid}/frases/`),
    /** @estado-guardado Ids com tombstone no Firestore do usuário (`usuarios/{uid}/meta/deleted`). */
    apagadasDe: uid => idsApagadosDe(estado.documentos, uid),
    /** @estado-guardado */
    chaveDaOpenAIDe: uid => objetoDoDocumento(estado.documentos, `usuarios/${uid}/segredos/openai`),
    gravarChaveDaOpenAI: (uid, documento) => { estado.documentos.set(`usuarios/${uid}/segredos/openai`, objetoParaCampos(documento)); },
    recusarEscritas: marcar('recusarEscritas'),
    segurarLeituras: ligar('leituraDasFrases', 'segurar'),
    recusarLeituras: ligar('leituraDasFrases', 'recusar'),
    ficarForaDoAr: marcar('foraDoAr'),
    recusarAcesso: marcar('acessoRecusado'),
    expirarSessao: marcar('sessaoExpirada'),
    gravarFrases: (uid, frases) => gravarObjetos(estado.documentos, frases, frase => `usuarios/${uid}/frases/${frase.id}`),
    /** @estado-guardado O ranking do grupo no idioma (`ranking/{idioma}_{uid}`), já convertido em objetos: só quem topou está lá. */
    rankingDe: idioma => objetosComOPrefixo(estado.documentos, `ranking/${idioma}_`),
    gravarNoRanking: registros => gravarObjetos(estado.documentos, registros, registro => `ranking/${registro.idioma}_${registro.uid}`),
    autenticarComo: uid => { estado.quemEstaLogado = uid; },
    proximoLogin: modo => { estado.modoDoLogin = modo; },
    usarPerfil: novo => { estado.perfil = { ...estado.perfil, ...novo }; },
    responderLogin,
  };
}

async function tratar(estado, route) {
  const req = route.request();
  const url = new URL(req.url());
  estado.requisicoes.push({ metodo: req.method(), url: req.url() });
  return servicoDoGoogle(url)(estado, { route, req, url });
}

function renovarSessao(estado, { route }) {
  if (estado.sessaoExpirada) return responderJson(route, 400, { error: { message: 'TOKEN_EXPIRED' } });
  return responderJson(route, 200, { id_token: 'token-renovado', refresh_token: 'refresh-renovado', expires_in: '3600' });
}

const entrarNoFirebase = (estado, { route }) => responderJson(route, 200, { localId: 'uid-teste', idToken: 'token-teste', refreshToken: 'refresh-teste' });
const responderPerfil = (estado, { route }) => responderJson(route, 200, estado.perfil);
const servicoDesconhecido = (estado, { route }) => responderJson(route, 404, { error: { message: 'not_found' } });

const SERVICOS_DO_GOOGLE = new Map([
  ['firestore.googleapis.com', tratarFirestore],
  ['securetoken.googleapis.com', renovarSessao],
  ['identitytoolkit.googleapis.com', entrarNoFirebase],
]);

const ehPerfilDoOauth = url => url.hostname === 'www.googleapis.com' && url.pathname.startsWith('/oauth2/');

function servicoDoGoogle(url) {
  if (ehPerfilDoOauth(url)) return responderPerfil;
  return SERVICOS_DO_GOOGLE.get(url.hostname) || servicoDesconhecido;
}

function pedidoAoFirestore({ route, req, url }) {
  const caminhoCompleto = decodeURIComponent(url.origin + url.pathname).replace(URL_DOS_DOCUMENTOS, '');
  return { route, req, url, metodo: req.method(), caminhoCompleto, caminho: caminhoCompleto.replace(/^\//, '') };
}

const recusarUrlLonga = route => route.fulfill({ status: 400, contentType: 'text/html; charset=UTF-8', body: '<!DOCTYPE html><title>Error 400 (Bad Request)!!1</title>' });

const RECUSAS_DA_ENTRADA = [
  { vale: (estado, req) => req.url().length > LIMITE_DA_URL, responder: recusarUrlLonga },
  { vale: estado => estado.foraDoAr, responder: route => responderJson(route, 503, FORA_DO_AR) },
  { vale: estado => estado.acessoRecusado, responder: recusar },
];

function tratarFirestore(estado, entrada) {
  const pedido = pedidoAoFirestore(entrada);
  const recusa = RECUSAS_DA_ENTRADA.find(({ vale }) => vale(estado, pedido.req));
  if (recusa) return recusa.responder(pedido.route);
  return operacaoDoFirestore(pedido)(estado, pedido);
}

const OPERACOES_DO_FIRESTORE = new Map([
  ['POST :runQuery', consultarRanking],
  ['POST :batchWrite', (estado, { route }) => recusar(route)],
  ['POST :commit', gravarLote],
]);

const OPERACOES_NO_DOCUMENTO = new Map([
  ['GET', lerNoFirestore],
  ['PATCH', atualizarDocumento],
  ['DELETE', apagarDocumento],
]);

function operacaoDoFirestore({ metodo, caminhoCompleto }) {
  if (caminhoCompleto.startsWith('/ranking/')) return tratarRanking;
  return OPERACOES_DO_FIRESTORE.get(`${metodo} ${caminhoCompleto}`) || OPERACOES_NO_DOCUMENTO.get(metodo) || operacaoNaoSuportada;
}

const operacaoNaoSuportada = (estado, { route, metodo, caminho }) => responderJson(route, 400, { error: { message: `não suportado: ${metodo} ${caminho}` } });

function aplicarEscrita(documentos, write) {
  if (write.update) documentos.set(caminhoDoNome(write.update.name), write.update.fields || {});
  if (write.delete) documentos.delete(caminhoDoNome(write.delete));
}

function gravarLote(estado, { route, req }) {
  if (estado.recusarEscritas) return recusarPorIndisponivel(route);
  for (const write of req.postDataJSON().writes || []) aplicarEscrita(estado.documentos, write);
  return responderJson(route, 200, { writeResults: [], commitTime: new Date().toISOString() });
}

const ehColecao = caminho => caminho.split('/').length % 2 === 1;

function lerNoFirestore(estado, pedido) {
  return ehColecao(pedido.caminho) ? listarColecao(estado, pedido) : lerDocumento(estado, pedido);
}

const LEITURAS_DAS_FRASES_FORA_DO_NORMAL = new Map([
  ['segurar', () => new Promise(() => {})],
  ['recusar', recusarPorIndisponivel],
]);

function documentosDaColecao(documentos, caminho) {
  const prefixo = `${caminho}/`;
  return [...documentos]
    .filter(([doc]) => doc.startsWith(prefixo) && !doc.slice(prefixo.length).includes('/'))
    .map(([doc, fields]) => ({ name: nomeDoCaminho(doc), fields }));
}

function listarColecao(estado, { route, caminho }) {
  const leituraForaDoNormal = LEITURAS_DAS_FRASES_FORA_DO_NORMAL.get(estado.leituraDasFrases);
  if (leituraForaDoNormal) return leituraForaDoNormal(route);
  const documents = documentosDaColecao(estado.documentos, caminho);
  return responderJson(route, 200, documents.length ? { documents } : {});
}

function lerDocumento(estado, { route, caminho }) {
  if (!estado.documentos.has(caminho)) return responderJson(route, 404, NAO_ENCONTRADO);
  return responderJson(route, 200, { name: nomeDoCaminho(caminho), fields: estado.documentos.get(caminho) });
}

function mascaraDoPedido(url) {
  try {
    return { caminhos: url.searchParams.getAll('updateMask.fieldPaths').map(segmentosDoCaminhoDeCampo) };
  } catch (erro) {
    return { erro };
  }
}

function documentoComAMascara(anterior, fields, mascara) {
  if (!mascara.length) return fields;
  const novo = structuredClone(anterior || {});
  for (const segmentos of mascara) gravarCampo(novo, segmentos, lerCampo(fields, segmentos));
  return novo;
}

const exigeDocumentoExistente = url => url.searchParams.get('currentDocument.exists') === 'true';

function atualizarDocumento(estado, { route, req, url, caminho }) {
  if (estado.recusarEscritas) return recusarPorIndisponivel(route);
  if (exigeDocumentoExistente(url) && !estado.documentos.has(caminho)) {
    return responderJson(route, 404, { error: { status: 'NOT_FOUND', message: 'NOT_FOUND' } });
  }
  const fields = req.postDataJSON().fields || {};
  const mascara = mascaraDoPedido(url);
  if (mascara.erro) return responderJson(route, 400, { error: { status: 'INVALID_ARGUMENT', message: mascara.erro.message } });
  const novo = documentoComAMascara(estado.documentos.get(caminho), fields, mascara.caminhos);
  estado.documentos.set(caminho, novo);
  return responderJson(route, 200, { name: nomeDoCaminho(caminho), fields: novo });
}

function apagarDocumento(estado, { route, caminho }) {
  if (!estado.documentos.delete(caminho)) return responderJson(route, 404, NAO_ENCONTRADO);
  return responderJson(route, 200, {});
}

const CAMPOS_DO_RANKING = ['uid', 'idioma', 'nome', 'foto', 'nivel', 'melhorSequencia', 'nota', 'acertos', 'perguntas', 'grupos', 'topou', 'em'];
const IDIOMAS_DO_RANKING = ['en', 'ru'];
const NIVEIS_DO_RANKING = ['iniciante', 'intermediario', 'avancado'];

const temSoOsCamposDoRanking = doc => CAMPOS_DO_RANKING.every(c => c in doc) && Object.keys(doc).every(c => CAMPOS_DO_RANKING.includes(c));
const textoAte = (valor, limite) => typeof valor === 'string' && valor.length <= limite;
const inteiroEntre = (valor, minimo, maximo) => Number.isInteger(valor) && valor >= minimo && valor <= maximo;

function ehDeQuemEstaLogadoETopou(doc, id, quemEstaLogado) {
  return doc.uid === quemEstaLogado && doc.topou === true && IDIOMAS_DO_RANKING.includes(doc.idioma) && id === `${doc.idioma}_${quemEstaLogado}`;
}

function perfilDoRankingValido(doc) {
  return NIVEIS_DO_RANKING.includes(doc.nivel) && textoAte(doc.nome, 100) && textoAte(doc.foto, 600);
}

function resultadoDoQuizValido(doc) {
  return inteiroEntre(doc.melhorSequencia, 0, 6) && [doc.nota, doc.acertos, doc.perguntas, doc.em].every(Number.isInteger) && Array.isArray(doc.grupos);
}

function documentoDoRankingValido(doc, id, quemEstaLogado) {
  return temSoOsCamposDoRanking(doc) && ehDeQuemEstaLogadoETopou(doc, id, quemEstaLogado)
    && perfilDoRankingValido(doc) && resultadoDoQuizValido(doc);
}

function filtrosDaConsulta(consulta) {
  if (consulta.where?.compositeFilter?.filters) return consulta.where.compositeFilter.filters;
  return consulta.where ? [consulta.where] : [];
}

function igualdadesDaConsulta(consulta) {
  const igual = {};
  for (const { fieldFilter } of filtrosDaConsulta(consulta)) {
    if (fieldFilter?.op === 'EQUAL') igual[fieldFilter.field.fieldPath] = camposParaObjeto({ v: fieldFilter.value }).v;
  }
  return igual;
}

const consultaSoDeQuemTopouNoRanking = (consulta, igual) => consulta.from?.[0]?.collectionId === 'ranking' && igual.topou === true;
const casaComAsIgualdades = (dados, igual) => dados.topou === true && Object.entries(igual).every(([campo, valor]) => dados[campo] === valor);

function achadosDoRanking(documentos, igual) {
  return [...documentos]
    .filter(([doc]) => /^ranking\/[^/]+$/.test(doc))
    .filter(([, fields]) => casaComAsIgualdades(camposParaObjeto(fields), igual))
    .map(([doc, fields]) => ({ document: { name: nomeDoCaminho(doc), fields }, readTime: HORA_DA_LEITURA }));
}

function consultarRanking(estado, { route, req }) {
  const consulta = req.postDataJSON().structuredQuery || {};
  const igual = igualdadesDaConsulta(consulta);
  if (!consultaSoDeQuemTopouNoRanking(consulta, igual)) return recusar(route);
  const achados = achadosDoRanking(estado.documentos, igual);
  return responderJson(route, 200, achados.length ? achados : [{ readTime: HORA_DA_LEITURA }]);
}

function entrarNoRanking(estado, { route, req, caminho }) {
  const doc = camposParaObjeto(req.postDataJSON().fields || {});
  if (!documentoDoRankingValido(doc, caminho.slice('ranking/'.length), estado.quemEstaLogado)) return recusar(route);
  estado.documentos.set(caminho, req.postDataJSON().fields);
  return responderJson(route, 200, { name: nomeDoCaminho(caminho), fields: estado.documentos.get(caminho) });
}

function sairDoRanking(estado, { route, caminho }) {
  const existente = estado.documentos.get(caminho);
  if (existente && camposParaObjeto(existente).uid !== estado.quemEstaLogado) return recusar(route);
  estado.documentos.delete(caminho);
  return responderJson(route, 200, {});
}

function lerNoRanking(estado, { route, caminho }) {
  const fields = estado.documentos.get(caminho);
  if (!fields || camposParaObjeto(fields).topou !== true) return recusar(route);
  return responderJson(route, 200, { name: nomeDoCaminho(caminho), fields });
}

const OPERACOES_NO_RANKING = new Map([
  ['PATCH', entrarNoRanking],
  ['DELETE', sairDoRanking],
  ['GET', lerNoRanking],
]);

function tratarRanking(estado, pedido) {
  const operacao = OPERACOES_NO_RANKING.get(pedido.metodo);
  return operacao ? operacao(estado, pedido) : recusar(pedido.route);
}

function derrubarAPaginaDeLogin(url, req) {
  req.socket.destroy();
}

function deixarAJanelaDeLoginEsperando(url, req, res) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h1>Escolha uma conta</h1>');
}

function voltarParaAExtensaoComOsTokens(url, req, res) {
  const volta = `${url.searchParams.get('redirect_uri')}#id_token=id-token-teste&access_token=access-token-teste`;
  res.writeHead(302, { Location: volta }).end();
}

const RESPOSTAS_DO_LOGIN = new Map([
  ['falhar', derrubarAPaginaDeLogin],
  ['janela', deixarAJanelaDeLoginEsperando],
]);

const respostaDoLogin = modo => RESPOSTAS_DO_LOGIN.get(modo) || voltarParaAExtensaoComOsTokens;

function rotaDoPedidoDaConexao({ metodo, uid, token, fields }, aoResponder) {
  const url = `${URL_DOS_DOCUMENTOS}/usuarios/${encodeURIComponent(uid)}/segredos/openai`;
  const request = () => ({ url: () => url, method: () => metodo, headers: () => ({ authorization: `Bearer ${token}` }), postDataJSON: () => ({ fields }) });
  return { request, fulfill: async ({ status, body }) => aoResponder({ status, json: JSON.parse(body) }) };
}

async function pedidoDaConexao(tratarPedido, pedido) {
  let resposta;
  await tratarPedido(rotaDoPedidoDaConexao(pedido, recebida => { resposta = recebida; }));
  return resposta;
}

function objetosComOPrefixo(documentos, prefixo) {
  return [...documentos]
    .filter(([doc]) => doc.startsWith(prefixo))
    .map(([, fields]) => camposParaObjeto(fields));
}

function idsApagadosDe(documentos, uid) {
  const tombstone = documentos.get(`usuarios/${uid}/meta/deleted`);
  return Object.keys(tombstone?.ids?.mapValue?.fields || {});
}

function objetoDoDocumento(documentos, caminho) {
  const campos = documentos.get(caminho);
  return campos ? camposParaObjeto(campos) : null;
}

function gravarObjetos(documentos, objetos, caminhoDe) {
  for (const objeto of objetos) documentos.set(caminhoDe(objeto), objetoParaCampos(objeto));
}

function caminhoDoNome(nome) {
  return nome.replace(`${RAIZ_DOS_DOCUMENTOS}/`, '');
}

function nomeDoCaminho(caminho) {
  return `${RAIZ_DOS_DOCUMENTOS}/${caminho}`;
}

const SEGMENTO_SIMPLES = /^[A-Za-z_][A-Za-z_0-9]*/;
const SEGMENTO_ENTRE_CRASES = /^`((?:[^`\\]|\\.)+)`/;

const caminhoInvalido = caminho => new Error(`Invalid property path "${caminho}".`);

function primeiroSegmento(resto, caminho) {
  const simples = resto.match(SEGMENTO_SIMPLES);
  if (simples) return { nome: simples[0], tamanho: simples[0].length };
  const citado = resto.match(SEGMENTO_ENTRE_CRASES);
  if (citado) return { nome: citado[1].replace(/\\(.)/g, '$1'), tamanho: citado[0].length };
  throw caminhoInvalido(caminho);
}

function segmentosDoCaminhoDeCampo(caminho) {
  const segmentos = [];
  let resto = caminho;
  while (true) {
    const { nome, tamanho } = primeiroSegmento(resto, caminho);
    segmentos.push(nome);
    resto = resto.slice(tamanho);
    if (resto === '') return segmentos;
    if (resto[0] !== '.') throw caminhoInvalido(caminho);
    resto = resto.slice(1);
  }
}

function lerCampo(fields, [primeiro, ...resto]) {
  const valor = fields?.[primeiro];
  if (!resto.length || valor === undefined) return valor;
  return lerCampo(valor.mapValue?.fields, resto);
}

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

const ESCRITORES_DO_VALOR = [
  [valor => typeof valor === 'string', valor => ({ stringValue: valor })],
  [valor => typeof valor === 'number', valor => ({ integerValue: String(valor) })],
  [valor => typeof valor === 'boolean', valor => ({ booleanValue: valor })],
  [Array.isArray, valor => ({ arrayValue: { values: valor.map(v => ({ stringValue: String(v) })) } })],
  [valor => valor && typeof valor === 'object', valor => ({ mapValue: { fields: objetoParaCampos(valor) } })],
];

function objetoParaCampos(obj) {
  const fields = {};
  for (const [chave, valor] of Object.entries(obj)) {
    const escritor = ESCRITORES_DO_VALOR.find(([ehDoTipo]) => ehDoTipo(valor));
    if (escritor) fields[chave] = escritor[1](valor);
  }
  return fields;
}

const LEITORES_DO_VALOR = [
  ['stringValue', valor => valor.stringValue],
  ['integerValue', valor => Number(valor.integerValue)],
  ['booleanValue', valor => valor.booleanValue],
  ['arrayValue', valor => (valor.arrayValue.values || []).map(v => v.stringValue)],
  ['mapValue', valor => camposParaObjeto(valor.mapValue.fields)],
];

function camposParaObjeto(fields) {
  const obj = {};
  for (const [chave, valor] of Object.entries(fields || {})) {
    const leitor = LEITORES_DO_VALOR.find(([tipo]) => tipo in valor);
    if (leitor) obj[chave] = leitor[1](valor);
  }
  return obj;
}

module.exports = { criarFakeGoogle };
