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
  /** Quanto dura um token novo (o Firebase dá 1 h; sobra uma folga). */
  const DURACAO_DO_TOKEN = 55 * 60 * 1000;
  const ESCRITAS_POR_COMMIT = 500;
  const MARCAS = [['status', 'exported'], ['exportadaTxt', true]];

  const MOTIVO = Object.freeze({ EXPIROU: 'expirou', RECUSADO: 'recusado' });

  function paraCampos(obj) {
    const fields = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val === null || val === undefined) continue;
      if (typeof val === 'string')       fields[key] = { stringValue: val };
      else if (typeof val === 'number')  fields[key] = { integerValue: String(val) };
      else if (typeof val === 'boolean') fields[key] = { booleanValue: val };
      else if (Array.isArray(val))       fields[key] = {
        arrayValue: { values: val.map(v => ({ stringValue: String(v) })) },
      };
      else if (typeof val === 'object')  fields[key] = {
        mapValue: { fields: paraCampos(val) },
      };
    }
    return fields;
  }

  function deCampos(fields) {
    const obj = {};
    for (const [key, val] of Object.entries(fields || {})) {
      if      ('stringValue'  in val) obj[key] = val.stringValue;
      else if ('integerValue' in val) obj[key] = Number(val.integerValue);
      else if ('booleanValue' in val) obj[key] = val.booleanValue;
      else if ('arrayValue'   in val) obj[key] = (val.arrayValue.values || [])
        .map(v => v.stringValue ?? String(v.integerValue ?? ''));
      else if ('mapValue'     in val) obj[key] = deCampos(val.mapValue.fields);
      else obj[key] = null;
    }
    return obj;
  }

  /**
   * Query e corpo do PATCH em meta/deleted, com updateMask por campo. O id começa com
   * dígito, então o caminho do campo vai entre crases (ids.`123`), como a API REST exige.
   */
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

  async function erroDaResposta(resposta) {
    const corpo = await resposta.json().catch(() => ({}));
    const mensagem = corpo?.error?.message || `HTTP ${resposta.status}`;
    if (resposta.status === 401) return erroDaNuvem(mensagem, { motivo: MOTIVO.EXPIROU });
    if (resposta.status === 403 || corpo?.error?.status === 'PERMISSION_DENIED') {
      return erroDaNuvem(mensagem, { motivo: MOTIVO.RECUSADO });
    }
    return erroDaNuvem(mensagem, { status: resposta.status });
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

    // A máscara vai na URL, que o Google recusa acima de 16 KB: 250 por PATCH.
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
      const paraApagar = frasesDaNuvem.filter(f => tombstones.has(String(f.id))).map(f => String(f.id));
      if (paraApagar.length === 0) return null;
      return nuvem.apagarFrases(paraApagar)
        .then(() => depois(paraApagar))
        .catch(err => aviso(`retry delete ${quando} falhou`, err));
    }

    async function concluirApagarTudoPendente(frasesDaNuvem, contadas = []) {
      const { pm_apagar_tudo: pendente } = await local.get({ pm_apagar_tudo: null });
      if (!pendente || pendente.uid !== nuvem.uid) return new Set();
      const apagar = [...new Set([...contadas, ...frasesDaNuvem.filter(f => Number(f.id) <= pendente.ate).map(f => String(f.id))])];
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
      const locaisPorIdAntes = new Map(locais.map(f => [String(f.id), f]));
      const pendentesNaNuvem = [];
      const marcasDaNuvem = new Map();

      const juntas = frasesDaNuvem.map(f => {
        const id = String(f.id);
        const daqui = locaisPorIdAntes.get(id);
        if (!daqui) return f;
        let naNuvem = f;

        for (const [campo, valor] of MARCAS) {
          if (daqui[campo] === valor && naNuvem[campo] !== valor) naNuvem = { ...naNuvem, [campo]: valor };

          if (f[campo] === valor && daqui[campo] !== valor) marcasDaNuvem.set(id, { ...marcasDaNuvem.get(id), [campo]: valor });
        }

        if (naNuvem !== f) pendentesNaNuvem.push(naNuvem);
        return naNuvem;
      });

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
      frasesDaNuvem = frasesDaNuvem.filter(f => !apagadasAgora.has(String(f.id)));

      const { pm_deleted_ids = [] } = await local.get({ pm_deleted_ids: [] });
      const apagadasAqui = new Set(pm_deleted_ids.map(String));
      const retryAqui = apagarEmSegundoPlano(frasesDaNuvem, apagadasAqui, limparParaDeletar, 'pendente');
      if (retryAqui) emSegundoPlano.push(retryAqui);
      frasesDaNuvem = frasesDaNuvem.filter(f => !apagadasAqui.has(String(f.id)));

      const tombstoneSync = await lerTombstoneSync();
      const tombstones = new Set([...tombstoneNuvem, ...tombstoneSync, ...apagadasAgora, ...semTombstone]);

      const retryEntre = apagarEmSegundoPlano(frasesDaNuvem, tombstones, limparSeGravado, 'entre computadores');
      if (retryEntre) emSegundoPlano.push(retryEntre);
      frasesDaNuvem = frasesDaNuvem.filter(f => !tombstones.has(String(f.id)));

      const idsNaNuvem = new Set(frasesDaNuvem.map(f => f.id));
      const { frases: locais = [] } = await local.get({ frases: [] });

      const locaisSemTombstone = locais.filter(f => !tombstones.has(String(f.id)));
      const orfas = locaisSemTombstone.filter(f => !idsNaNuvem.has(f.id));
      if (locaisSemTombstone.length !== locais.length) await historico.apagar([...tombstones]);

      const falhaNasOrfas = await manterOrfasNaLista(orfas, frasesDaNuvem);

      frasesDaNuvem = await juntarMarcas(frasesDaNuvem, locais, emSegundoPlano);

      const idsOrfas = new Set(orfas.map(f => String(f.id)));
      const { frases: locaisAgora = [] } = await local.get({ frases: [] });
      const locaisPorId = new Map(locaisAgora.map(f => [String(f.id), f]));
      const naTela = atuais();
      const atuaisPorId = new Map(naTela.map(f => [String(f.id), f]));
      frasesDaNuvem = frasesDaNuvem
        .filter(f => !idsOrfas.has(String(f.id)) || locaisPorId.has(String(f.id)))
        .map(f => idsOrfas.has(String(f.id))
          ? atuaisPorId.get(String(f.id)) || locaisPorId.get(String(f.id))
          : f);
      const idsCarregados = new Set(frasesDaNuvem.map(f => String(f.id)));
      const frases = [...frasesDaNuvem, ...naTela.filter(f =>
        !idsCarregados.has(String(f.id)) && locaisPorId.has(String(f.id)) && !tombstones.has(String(f.id)),
      )];

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
