'use strict';

if (typeof module !== 'undefined') require('./historico.js');

(function (raiz) {
  const PROJETO = 'perpetualminer-4c219';
  const RAIZ_DOS_DOCUMENTOS = `projects/${PROJETO}/databases/(default)/documents`;
  const URL_DOS_DOCUMENTOS = `https://firestore.googleapis.com/v1/${RAIZ_DOS_DOCUMENTOS}`;
  const CHAVE_DA_API = 'AIzaSyDrbDVUvv8wyoYqjCr5jEMBJPPsIP2k1Ak';
  const URL_DA_RENOVACAO = `https://securetoken.googleapis.com/v1/token?key=${CHAVE_DA_API}`;
  const { TTL_DO_TOMBSTONE, PREFIXO_DO_TOMBSTONE, tombstonesSync } = raiz.ListasPendentes;
  const MARGEM_DO_TOKEN = 2 * 60 * 1000;
  const DURACAO_DO_TOKEN = 55 * 60 * 1000;
  const ESCRITAS_POR_COMMIT = 500;
  const MARCAS = [['status', 'exported'], ['exportadaTxt', true]];

  const MOTIVO = Object.freeze({ EXPIROU: 'expirou', RECUSADO: 'recusado' });

  const ESCRITORES_DE_VALOR = [
    [v => typeof v === 'string', v => ({ stringValue: v })],
    [v => typeof v === 'number', v => ({ integerValue: String(v) })],
    [v => typeof v === 'boolean', v => ({ booleanValue: v })],
    [Array.isArray, v => ({ arrayValue: { values: v.map(item => ({ stringValue: String(item) })) } })],
    [v => typeof v === 'object' && v !== null, v => ({ mapValue: { fields: paraCampos(v) } })],
  ];

  function valorParaFirestore(val) {
    const [, escrever] = ESCRITORES_DE_VALOR.find(([serve]) => serve(val)) || [];
    return escrever ? escrever(val) : null;
  }

  function paraCampos(obj) {
    const fields = {};
    for (const [key, val] of Object.entries(obj)) {
      const campo = valorParaFirestore(val);
      if (campo) fields[key] = campo;
    }
    return fields;
  }

  const LEITORES_DE_VALOR = [
    ['stringValue', valor => valor],
    ['integerValue', Number],
    ['booleanValue', valor => valor],
    ['arrayValue', valor => (valor.values || []).map(v => v.stringValue ?? String(v.integerValue ?? ''))],
    ['mapValue', valor => deCampos(valor.fields)],
  ];

  function valorDoFirestore(val) {
    const [tipo, ler] = LEITORES_DE_VALOR.find(([chave]) => chave in val) || [];
    return ler ? ler(val[tipo]) : null;
  }

  function deCampos(fields) {
    const obj = {};
    for (const [key, val] of Object.entries(fields || {})) obj[key] = valorDoFirestore(val);
    return obj;
  }

  function tombstoneFirestore(ids, apagadasEm) {
    const caminho = id => `ids.\`${String(id).replace(/[`\\]/g, '\\$&')}\``;
    return {
      mascara: ids.map(id => `updateMask.fieldPaths=${encodeURIComponent(caminho(id))}`).join('&'),
      corpo: { fields: { ids: { mapValue: { fields: Object.fromEntries(
        ids.map(id => [id, { integerValue: String(apagadasEm) }]),
      ) } } } },
    };
  }

  function erroDaNuvem(mensagem, { motivo, status } = {}) {
    const erro = new Error(mensagem);
    if (motivo) erro.motivo = motivo;
    if (status) erro.status = status;
    return erro;
  }

  function motivoDaRecusa(resposta, corpo) {
    if (resposta.status === 401) return MOTIVO.EXPIROU;
    if (resposta.status === 403 || corpo?.error?.status === 'PERMISSION_DENIED') return MOTIVO.RECUSADO;
    return null;
  }

  async function erroDaResposta(resposta) {
    const corpo = await resposta.json().catch(() => ({}));
    const mensagem = corpo?.error?.message || `HTTP ${resposta.status}`;
    const motivo = motivoDaRecusa(resposta, corpo);
    return motivo ? erroDaNuvem(mensagem, { motivo }) : erroDaNuvem(mensagem, { status: resposta.status });
  }

  function nadaSe404(erro) {
    if (erro.status === 404) return null;
    throw erro;
  }

  function criarSessao({ credenciais, aoRenovar = () => {}, buscar = (...a) => fetch(...a), agora = Date.now }) {
    const atual = { ...credenciais };
    let revogada = false;

    function verificarAtiva() {
      if (revogada) throw erroDaNuvem('Sessão revogada', { motivo: MOTIVO.EXPIROU });
    }

    async function token() {
      verificarAtiva();
      const expirando = !atual.idToken || agora() > (atual.expiresAt || 0) - MARGEM_DO_TOKEN;
      if (!expirando) return atual.idToken;
      if (!atual.refreshToken) throw erroDaNuvem('Sem refresh token', { motivo: MOTIVO.EXPIROU });

      try {
        const resposta = await buscar(URL_DA_RENOVACAO, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: atual.refreshToken }),
        });
        verificarAtiva();
        if (!resposta.ok) {
          const recusa = await erroDaResposta(resposta);
          throw erroDaNuvem(recusa.message, { motivo: MOTIVO.EXPIROU });
        }
        const dados = await resposta.json();
        verificarAtiva();
        atual.idToken = dados.id_token;
        atual.refreshToken = dados.refresh_token;
        atual.expiresAt = agora() + DURACAO_DO_TOKEN;
        await aoRenovar({ ...atual });
        return atual.idToken;
      } finally {
        verificarAtiva();
      }
    }

    function invalidar() {
      atual.idToken = null;
      atual.expiresAt = 0;
    }

    function revogar() {
      revogada = true;
    }

    return { uid: atual.uid, token, invalidar, revogar, verificarAtiva };
  }

  function nuvemHttp({ sessao, buscar = (...a) => fetch(...a) }) {
    const { uid } = sessao;

    async function pedir(metodo, caminho, corpo = null, jaTentouDeNovo = false) {
      try {
        const opcoes = { method: metodo, headers: { Authorization: `Bearer ${await sessao.token()}` } };
        if (corpo) {
          opcoes.headers['Content-Type'] = 'application/json';
          opcoes.body = JSON.stringify(corpo);
        }
        sessao.verificarAtiva();
        const resposta = await buscar(`${URL_DOS_DOCUMENTOS}${caminho[0] === ':' ? '' : '/'}${caminho}`, opcoes);
        sessao.verificarAtiva();

        if (resposta.status === 401 && !jaTentouDeNovo) {
          sessao.invalidar();
          return await pedir(metodo, caminho, corpo, true);
        }
        if (resposta.status === 404 && metodo === 'DELETE') return null;
        if (!resposta.ok) throw await erroDaResposta(resposta);
        return await resposta.json().catch(() => null);
      } finally {
        sessao.verificarAtiva();
      }
    }

    async function listarFrases() {
      const frases = [];
      let pagina = '';
      do {
        const caminho = `usuarios/${uid}/frases?pageSize=300${pagina ? '&pageToken=' + encodeURIComponent(pagina) : ''}`;
        const dados = await pedir('GET', caminho);
        (dados?.documents || []).forEach(doc => frases.push(deCampos(doc.fields)));
        pagina = dados?.nextPageToken || '';
      } while (pagina);
      return frases;
    }

    async function gravarFrase(frase, campos = null) {
      const caminho = `usuarios/${uid}/frases/${frase.id}`;
      const corpo = { fields: paraCampos(frase) };
      if (!campos?.length) return pedir('PATCH', caminho, corpo);
      const mascara = campos.map(c => `updateMask.fieldPaths=${encodeURIComponent(c)}`).join('&');
      try {
        return await pedir('PATCH', `${caminho}?${mascara}&currentDocument.exists=true`, corpo);
      } catch (err) {
        if (err.status !== 404) throw err;
        return pedir('PATCH', caminho, corpo);
      }
    }

    async function gravarFrases(frases) {
      for (let i = 0; i < frases.length; i += ESCRITAS_POR_COMMIT) {
        const writes = frases.slice(i, i + ESCRITAS_POR_COMMIT).map(f => ({
          update: { name: `${RAIZ_DOS_DOCUMENTOS}/usuarios/${uid}/frases/${f.id}`, fields: paraCampos(f) },
        }));
        await pedir('POST', ':commit', { writes });
      }
    }

    async function apagarFrases(ids) {
      if (ids.length === 0) return;
      const resultados = await Promise.allSettled(ids.map(id => pedir('DELETE', `usuarios/${uid}/frases/${id}`)));
      const falha = resultados.find(r => r.status === 'rejected');
      if (falha) throw falha.reason;
    }

    async function lerTombstones() {
      const dados = await pedir('GET', `usuarios/${uid}/meta/deleted`).catch(nadaSe404);
      const campos = dados?.fields?.ids?.mapValue?.fields || {};
      return new Map(Object.entries(campos).map(([id, v]) => [id, Number(v.integerValue ?? v.stringValue ?? 0)]));
    }

    async function gravarTombstones(ids, apagadasEm) {
      for (let i = 0; i < ids.length; i += 250) {
        const { mascara, corpo } = tombstoneFirestore(ids.slice(i, i + 250), apagadasEm);
        await pedir('PATCH', `usuarios/${uid}/meta/deleted?${mascara}`, corpo);
      }
    }

    return { uid, listarFrases, gravarFrase, gravarFrases, apagarFrases, lerTombstones, gravarTombstones };
  }

  function armazenamentoDoChrome(storage) {
    const pedir = (a, metodo) => arg => new Promise((resolve, reject) => a[metodo](arg, valor => {
      const erro = globalThis.chrome?.runtime?.lastError;
      if (erro) reject(new Error(erro.message));
      else resolve(valor);
    }));
    const area = a => ({ get: pedir(a, 'get'), set: pedir(a, 'set'), remove: pedir(a, 'remove') });
    return { local: area(storage.local), sync: area(storage.sync) };
  }

  const marcasQueFaltam = (tem, falta) =>
    MARCAS.filter(([campo, valor]) => tem[campo] === valor && falta[campo] !== valor);

  function conciliarMarcas(frasesDaNuvem, locais) {
    const locaisPorId = porId(locais);
    const pendentesNaNuvem = [];
    const marcasDaNuvem = new Map();
    const juntas = frasesDaNuvem.map(f => {
      const id = idDe(f);
      const daqui = locaisPorId.get(id);
      if (!daqui) return f;
      const paraAqui = marcasQueFaltam(f, daqui);
      if (paraAqui.length > 0) marcasDaNuvem.set(id, Object.fromEntries(paraAqui));
      const paraNuvem = marcasQueFaltam(daqui, f);
      if (paraNuvem.length === 0) return f;
      const naNuvem = { ...f, ...Object.fromEntries(paraNuvem) };
      pendentesNaNuvem.push(naNuvem);
      return naNuvem;
    });
    return { juntas, pendentesNaNuvem, marcasDaNuvem };
  }

  const idDe = f => String(f.id);
  const porId = frases => new Map(frases.map(f => [idDe(f), f]));

  function frasesParaATela({ daNuvem, orfas, locaisAgora, naTela, tombstones }) {
    const idsOrfas = new Set(orfas.map(idDe));
    const locaisPorId = porId(locaisAgora);
    const atuaisPorId = porId(naTela);
    const daNuvemNaTela = daNuvem
      .filter(f => !idsOrfas.has(idDe(f)) || locaisPorId.has(idDe(f)))
      .map(f => idsOrfas.has(idDe(f)) ? atuaisPorId.get(idDe(f)) || locaisPorId.get(idDe(f)) : f);
    const idsCarregados = new Set(daNuvemNaTela.map(idDe));
    return [...daNuvemNaTela, ...naTela.filter(f =>
      !idsCarregados.has(idDe(f)) && locaisPorId.has(idDe(f)) && !tombstones.has(idDe(f)),
    )];
  }

  function criarSincronizacao({ nuvem, armazenamento, agora = Date.now, aviso = () => {} }) {
    const { local } = armazenamento;
    const historico = raiz.Historico.criar({ armazenamento: local });
    const ids = lista => lista.map(String);
    const reforco = area => Object.fromEntries(['get', 'set', 'remove'].map(m =>
      [m, arg => area[m](arg).catch(erro => (aviso(`${m} de reforço falhou`, erro), {}))]));
    const sync = reforco(armazenamento.sync);
    const { marcarParaDeletar, limparParaDeletar, marcarTombstone, limparTombstone, regravarTombstones } =
      raiz.ListasPendentes.criar({ local, reforco, nuvem, agora, aviso });
    const { ler: lerTombstoneSync, marcar: marcarNoSync, limpar: limparNoSync } = raiz.ListasPendentes.tombstonesDoSync({ sync, agora });

    async function lerTombstoneDaNuvem() {
      const idsApagados = new Set();
      for (const [id, apagadaEm] of await nuvem.lerTombstones()) {
        if (agora() - apagadaEm < TTL_DO_TOMBSTONE) idsApagados.add(id);
      }
      return idsApagados;
    }

    function apagarEmSegundoPlano(frasesDaNuvem, tombstones, depois, quando) {
      const paraApagar = frasesDaNuvem.filter(f => tombstones.has(idDe(f))).map(idDe);
      if (paraApagar.length === 0) return null;
      return nuvem.apagarFrases(paraApagar)
        .then(() => depois(paraApagar))
        .catch(err => aviso(`retry delete ${quando} falhou`, err));
    }

    async function concluirApagarTudoPendente(frasesDaNuvem, contadas = []) {
      const { pm_apagar_tudo: pendente } = await local.get({ pm_apagar_tudo: null });
      if (!pendente || pendente.uid !== nuvem.uid) return new Set();
      const apagar = [...new Set([...contadas, ...frasesDaNuvem.filter(f => Number(f.id) <= pendente.ate).map(idDe)])];
      if (apagar.length > 0) {
        await marcarNoSync(apagar);
        await marcarParaDeletar(apagar);
        await nuvem.gravarTombstones(apagar, agora());
        await limparTombstone(apagar);
        await nuvem.apagarFrases(apagar);
        await limparParaDeletar(apagar);
      }
      await local.remove('pm_apagar_tudo');
      return new Set(apagar);
    }

    async function manterOrfasNaLista(orfas, frasesDaNuvem) {
      if (orfas.length === 0) return null;
      const resultados = await Promise.allSettled(orfas.map(f => nuvem.gravarFrase(f)));
      const falhas = resultados.filter(r => r.status === 'rejected');
      frasesDaNuvem.push(...orfas);
      if (falhas.length === 0) return null;
      return { quantas: falhas.length, causas: falhas.map(r => r.reason) };
    }

    async function juntarMarcas(frasesDaNuvem, locais, emSegundoPlano) {
      const { juntas, pendentesNaNuvem, marcasDaNuvem } = conciliarMarcas(frasesDaNuvem, locais);
      if (pendentesNaNuvem.length > 0) {
        emSegundoPlano.push(nuvem.gravarFrases(pendentesNaNuvem)
          .catch(err => aviso('retry das marcas Enviada/Exportada falhou', err)));
      }
      if (marcasDaNuvem.size > 0) await historico.editarVarias(marcasDaNuvem);
      return juntas;
    }

    async function carregar({ atuais = () => [] } = {}) {
      const emSegundoPlano = [];
      let frasesDaNuvem = await nuvem.listarFrases();
      const semTombstone = await regravarTombstones();
      const tombstoneNuvem = await lerTombstoneDaNuvem();
      const limparSeGravado = lista => limparNoSync(lista.filter(id => !semTombstone.has(id)));

      const apagadasAgora = await concluirApagarTudoPendente(frasesDaNuvem);
      frasesDaNuvem = frasesDaNuvem.filter(f => !apagadasAgora.has(idDe(f)));

      const { pm_deleted_ids = [] } = await local.get({ pm_deleted_ids: [] });
      const apagadasAqui = new Set(pm_deleted_ids.map(String));
      const retryAqui = apagarEmSegundoPlano(frasesDaNuvem, apagadasAqui, limparParaDeletar, 'pendente');
      if (retryAqui) emSegundoPlano.push(retryAqui);
      frasesDaNuvem = frasesDaNuvem.filter(f => !apagadasAqui.has(idDe(f)));

      const tombstoneSync = await lerTombstoneSync();
      const tombstones = new Set([...tombstoneNuvem, ...tombstoneSync, ...apagadasAgora, ...semTombstone]);

      const retryEntre = apagarEmSegundoPlano(frasesDaNuvem, tombstones, limparSeGravado, 'entre computadores');
      if (retryEntre) emSegundoPlano.push(retryEntre);
      frasesDaNuvem = frasesDaNuvem.filter(f => !tombstones.has(idDe(f)));

      const idsNaNuvem = new Set(frasesDaNuvem.map(f => f.id));
      const { frases: locais = [] } = await local.get({ frases: [] });

      const locaisSemTombstone = locais.filter(f => !tombstones.has(idDe(f)));
      const orfas = locaisSemTombstone.filter(f => !idsNaNuvem.has(f.id));
      if (locaisSemTombstone.length !== locais.length) await historico.apagar([...tombstones]);

      const falhaNasOrfas = await manterOrfasNaLista(orfas, frasesDaNuvem);

      frasesDaNuvem = await juntarMarcas(frasesDaNuvem, locais, emSegundoPlano);

      const { frases: locaisAgora = [] } = await local.get({ frases: [] });
      const frases = frasesParaATela({ daNuvem: frasesDaNuvem, orfas, locaisAgora, naTela: atuais(), tombstones });

      return {
        frases,
        desteComputador: locaisSemTombstone.length,
        falhaNasOrfas,
        tombstones,
        concluida: Promise.allSettled(emSegundoPlano).then(() => {}),
      };
    }

    async function apagar(idsParaApagar) {
      if (!idsParaApagar.length) return null;
      const lista = ids(idsParaApagar);
      await marcarNoSync(lista);
      await marcarParaDeletar(lista);
      if (!nuvem) return null;
      await marcarTombstone(lista);
      const [tombstone, remocao] = await Promise.allSettled([
        nuvem.gravarTombstones(lista, agora()),
        nuvem.apagarFrases(lista),
      ]);
      if (tombstone.status === 'rejected') aviso('tombstone write falhou', tombstone.reason);
      else await limparTombstone(lista);
      if (remocao.status === 'rejected') {
        aviso('delete falhou, ficará pendente', remocao.reason);
        return remocao.reason;
      }
      await limparParaDeletar(lista);
      return null;
    }

    async function apagarTudo(contadas, confirmadoEm = agora()) {
      if (!nuvem) return { ok: true };
      const daqui = ids(contadas);
      await marcarNoSync(daqui);
      await marcarParaDeletar(daqui);
      await marcarTombstone(daqui);
      try {
        await local.set({ pm_apagar_tudo: { uid: nuvem.uid, ate: Math.max(confirmadoEm, ...daqui.map(Number)) } });
        await concluirApagarTudoPendente(await nuvem.listarFrases(), daqui);
        return { ok: true };
      } catch (erro) {
        return { ok: false, erro };
      }
    }

    async function subirFrases(frases) {
      if (!nuvem || frases.length === 0) return null;
      try {
        await nuvem.gravarFrases(frases);
      } catch (erro) {
        return erro;
      }
      return null;
    }

    return { carregar, apagar, apagarTudo, subirFrases };
  }

  async function noBancoDaSessao(modo, fazer) {
    const banco = await new Promise((resolve, reject) => {
      const pedido = indexedDB.open('pm-sessao', 1);
      pedido.onupgradeneeded = () => pedido.result.createObjectStore('sessao');
      pedido.onsuccess = () => resolve(pedido.result);
      pedido.onerror = () => reject(pedido.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = banco.transaction('sessao', modo);
        const req = fazer(tx.objectStore('sessao'));
        tx.oncomplete = () => resolve(req.result);
        tx.onabort = tx.onerror = () => reject(tx.error);
      });
    } finally { banco.close(); }
  }

  const guardarCredenciais = valor => noBancoDaSessao('readwrite', loja => {
    loja.put(true, 'migrada');
    return loja.put(valor, 'firebase');
  });
  const apagarCredenciais = () => noBancoDaSessao('readwrite', loja => {
    loja.put(true, 'migrada');
    return loja.delete('firebase');
  });
  async function lerCredenciais() {
    const { pm_firebase_auth: antiga } = await chrome.storage.local.get({ pm_firebase_auth: null });
    if (antiga) {
      await noBancoDaSessao('readwrite', loja => {
        const migrada = loja.get('migrada');
        migrada.onsuccess = () => {
          if (migrada.result) return;
          loja.put(antiga, 'firebase');
          loja.put(true, 'migrada');
        };
        return migrada;
      });
      await chrome.storage.local.remove('pm_firebase_auth');
    }
    return (await noBancoDaSessao('readonly', loja => loja.get('firebase'))) || null;
  }

  raiz.Sincronizacao = {
    lerCredenciais, guardarCredenciais, apagarCredenciais, MOTIVO, CHAVE_DA_API, TTL_DO_TOMBSTONE, PREFIXO_DO_TOMBSTONE,
    paraCampos, deCampos, tombstonesSync, tombstoneFirestore, erroDaNuvem, erroDaResposta, URL_DOS_DOCUMENTOS,
    criarSessao, nuvemHttp, armazenamentoDoChrome, criarSincronizacao,
  };
  if (typeof module !== 'undefined') module.exports = raiz.Sincronizacao;
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
