'use strict';

(function (raiz) {
  const PROJETO = 'perpetualminer-4c219';
  const RAIZ_DOS_DOCUMENTOS = `projects/${PROJETO}/databases/(default)/documents`;
  const URL_DOS_DOCUMENTOS = `https://firestore.googleapis.com/v1/${RAIZ_DOS_DOCUMENTOS}`;
  const ESCRITAS_POR_COMMIT = 500;
  const TOMBSTONES_POR_PATCH = 250;

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
    const caminhoDoCampoEntreCrases = id => `ids.\`${String(id).replace(/[`\\]/g, '\\$&')}\``;
    return {
      mascara: ids.map(id => `updateMask.fieldPaths=${encodeURIComponent(caminhoDoCampoEntreCrases(id))}`).join('&'),
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

  function nuvemHttp({ sessao, buscar = (...a) => fetch(...a) }) {
    const { uid } = sessao;

    async function opcoesDoPedido(metodo, corpo) {
      const opcoes = { method: metodo, headers: { Authorization: `Bearer ${await sessao.token()}` } };
      if (corpo) {
        opcoes.headers['Content-Type'] = 'application/json';
        opcoes.body = JSON.stringify(corpo);
      }
      return opcoes;
    }

    const urlDoDocumento = caminho => `${URL_DOS_DOCUMENTOS}${caminho[0] === ':' ? '' : '/'}${caminho}`;

    const tokenRecusadoPelaPrimeiraVez = (resposta, jaTentouDeNovo) => resposta.status === 401 && !jaTentouDeNovo;

    async function lerARespostaDe(metodo, resposta) {
      if (resposta.status === 404 && metodo === 'DELETE') return null;
      if (!resposta.ok) throw await erroDaResposta(resposta);
      return await resposta.json().catch(() => null);
    }

    async function pedir(metodo, caminho, corpo = null, jaTentouDeNovo = false) {
      try {
        const opcoes = await opcoesDoPedido(metodo, corpo);
        sessao.verificarAtiva();
        const resposta = await buscar(urlDoDocumento(caminho), opcoes);
        sessao.verificarAtiva();

        if (tokenRecusadoPelaPrimeiraVez(resposta, jaTentouDeNovo)) {
          sessao.invalidar();
          return await pedir(metodo, caminho, corpo, true);
        }
        return await lerARespostaDe(metodo, resposta);
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
      for (let i = 0; i < ids.length; i += TOMBSTONES_POR_PATCH) {
        const { mascara, corpo } = tombstoneFirestore(ids.slice(i, i + TOMBSTONES_POR_PATCH), apagadasEm);
        await pedir('PATCH', `usuarios/${uid}/meta/deleted?${mascara}`, corpo);
      }
    }

    return { uid, listarFrases, gravarFrase, gravarFrases, apagarFrases, lerTombstones, gravarTombstones };
  }

  raiz.NuvemDoFirestore = {
    MOTIVO, URL_DOS_DOCUMENTOS, paraCampos, deCampos, tombstoneFirestore, erroDaNuvem, erroDaResposta, nuvemHttp,
  };
  if (typeof module !== 'undefined') module.exports = raiz.NuvemDoFirestore;
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
