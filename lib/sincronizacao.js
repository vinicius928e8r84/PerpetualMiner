'use strict';

// A sincronização das Frases com a nuvem, num lugar só: o codec do Firestore, a
// sessão da conta, o que junta o histórico local, a nuvem e os tombstones, e o
// Apagar tudo que a nuvem ainda não confirmou. O painel e o service worker usam
// este módulo; o `test_sync.js` o carrega e roda a lógica de verdade.
//
//   Sincronizacao.criarSessao({ credenciais, aoRenovar })  o token válido da conta
//   Sincronizacao.nuvemHttp({ sessao })                    a nuvem pelo REST do Firestore
//   Sincronizacao.criarSincronizacao({ nuvem, armazenamento })
//       .carregar({ atuais }) · .apagar(ids) · .apagarTudo(ids) · .subirFrases(frases)
//   Sincronizacao.criarSincronizacaoDaChave({ nuvem, cofre }).sincronizar()
//       a chave da OpenAI que acompanha a conta (#154)
//
// A seam é a `nuvem`: HTTP na extensão (e nos e2e, que fingem o Firestore na
// rede), memória no Node. Uma `nuvem` tem
//   uid · listarFrases() · gravarFrase(frase, campos?) · gravarFrases(frases)
//   apagarFrases(ids) · lerTombstones() → Map<id, apagadaEm> · gravarTombstones(ids, apagadaEm)
//   lerChaveDaOpenAI() → { chave, em } | null · gravarChaveDaOpenAI({ chave, em })
// e o `armazenamento` é `{ local, sync }`, cada um com get/set/remove que
// devolvem promessa (`armazenamentoDoChrome` adapta o `chrome.storage`).
//
// Tombstone de uma frase apagada, em três lugares:
//   FONTE DE VERDADE  Firestore usuarios/{uid}/meta/deleted, um campo por frase no
//                     mapa `ids` (updateMask por campo: dois computadores gravam ao
//                     mesmo tempo sem conflito)
//   FALLBACK OFFLINE  chrome.storage.sync, uma chave por frase: pm_del_{id}
//   RETRY DO DELETE   chrome.storage.local, `pm_deleted_ids`
// E `pm_apagar_tudo` ({ uid, ate }) enquanto um Apagar tudo não chegou à nuvem.
//
// A chave da OpenAI que acompanha a conta (#154) é um documento só, usuarios/{uid}/segredos/openai:
// `{ chave, em }` (Trocar põe a nova), ou o tombstone `{ apagada: true, em }` depois de Apagar chave ou
// Apagar tudo com conta. `em` é a hora da última mudança, em qualquer computador: a mais nova vale. A chave
// de uma conta nunca sobe para outra conta que entrar no mesmo computador. As regras do Firestore
// deixam só o dono da conta ler e escrever o documento (docs/seguranca/chave-da-openai.md).
//
// Carregado pelo painel, pelo service worker (importScripts) e pelo Node.

(function (raiz) {
  const PROJETO = 'perpetualminer-4c219';
  const RAIZ_DOS_DOCUMENTOS = `projects/${PROJETO}/databases/(default)/documents`;
  const URL_DOS_DOCUMENTOS = `https://firestore.googleapis.com/v1/${RAIZ_DOS_DOCUMENTOS}`;
  const CHAVE_DA_API = 'AIzaSyDrbDVUvv8wyoYqjCr5jEMBJPPsIP2k1Ak';
  const URL_DA_RENOVACAO = `https://securetoken.googleapis.com/v1/token?key=${CHAVE_DA_API}`;
  const TTL_DO_TOMBSTONE = 30 * 24 * 60 * 60 * 1000; // 30 dias
  const PREFIXO_DO_TOMBSTONE = 'pm_del_';
  /** O token é renovado quando falta menos que isto para vencer. */
  const MARGEM_DO_TOKEN = 2 * 60 * 1000;
  /** Quanto dura um token novo (o Firebase dá 1 h; sobra uma folga). */
  const DURACAO_DO_TOKEN = 55 * 60 * 1000;
  /** Escritas por batchWrite (o limite do Firestore). */
  const LOTE = 500;
  /** As marcas que viajam para a nuvem e juntam ao carregar: Enviada ao Anki e Exportada. */
  const MARCAS = [['status', 'exported'], ['exportadaTxt', true]];

  /** O documento da chave da OpenAI, sob o uid. */
  const DOCUMENTO_DA_CHAVE = 'segredos/openai';

  /** Por que a nuvem recusou: a sessão acabou ou as regras do Firestore recusam a conta. */
  const MOTIVO = Object.freeze({ EXPIROU: 'expirou', RECUSADO: 'recusado' });

  // ─── Codec do Firestore ────────────────────────────────────────────────────

  /** Objeto JS → campos do REST do Firestore. */
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

  /** Campos do REST do Firestore → objeto JS. */
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

  /** Chaves do chrome.storage.sync que marcam as frases como apagadas. */
  function tombstonesSync(ids, apagadasEm) {
    return Object.fromEntries(ids.map(id => [`${PREFIXO_DO_TOMBSTONE}${id}`, apagadasEm]));
  }

  /**
   * Query e corpo do PATCH em meta/deleted. updateMask por campo: dois computadores
   * gravam ao mesmo tempo sem conflito. O id começa com dígito, então o caminho do
   * campo vai entre crases (ids.`123`), como a API REST exige.
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

  // ─── Erros ─────────────────────────────────────────────────────────────────

  /** `motivo` (MOTIVO) para sessão expirada/revogada ou acesso recusado; `status` para outras falhas HTTP. */
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

  // ─── Sessão da conta ───────────────────────────────────────────────────────

  /**
   * O token válido da conta, renovado pelo refresh token do Firebase quando está
   * para vencer. A forma persistida de `credenciais` (`pm_firebase_auth`) está em
   * CLAUDE.md, Storage Schema; `aoRenovar(credenciais)` grava o que mudou.
   *
   * Ao desconectar, o consumidor chama `revogar()` antes de soltar a referência.
   * A revogação é irreversível: `token()` e pedidos de `nuvemHttp` rejeitam com
   * `MOTIVO.EXPIROU`. Uma renovação cuja resposta chega depois da revogação não
   * chama `aoRenovar`; pedidos de rede já enviados não são cancelados.
   * Regressão: test_sync.js, cenário HTTP 10.
   */
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
          // Qualquer recusa da renovação é a sessão que acabou (CFG-08).
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

    /** O token foi recusado: o próximo pedido renova. */
    function invalidar() {
      atual.idToken = null;
      atual.expiresAt = 0;
    }

    function revogar() {
      revogada = true;
    }

    return { uid: atual.uid, token, invalidar, revogar, verificarAtiva };
  }

  // ─── A nuvem pelo REST do Firestore ────────────────────────────────────────

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
        const resposta = await buscar(`${URL_DOS_DOCUMENTOS}/${caminho}`, opcoes);
        sessao.verificarAtiva();

        if (resposta.status === 401 && !jaTentouDeNovo) {
          // Token recusado: força a renovação e tenta uma vez mais.
          sessao.invalidar();
          return await pedir(metodo, caminho, corpo, true);
        }
        // 404 em DELETE = o documento já não existe, tudo certo.
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

    // `campos`: os campos a atualizar (ex: ['keywords']); sem eles, grava todos.
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
      if (frases.length === 0) return;
      const token = await sessao.token();
      try {
        for (let i = 0; i < frases.length; i += LOTE) {
          const writes = frases.slice(i, i + LOTE).map(f => ({
            update: { name: `${RAIZ_DOS_DOCUMENTOS}/usuarios/${uid}/frases/${f.id}`, fields: paraCampos(f) },
          }));
          sessao.verificarAtiva();
          const resposta = await buscar(`${URL_DOS_DOCUMENTOS}:batchWrite`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ writes }),
          });
          sessao.verificarAtiva();
          if (!resposta.ok) throw await erroDaResposta(resposta);
        }
      } finally {
        sessao.verificarAtiva();
      }
    }

    async function apagarFrases(ids) {
      if (ids.length === 0) return;
      // Um DELETE por documento: o mesmo endpoint que a leitura e a escrita já usam.
      const resultados = await Promise.allSettled(ids.map(id => pedir('DELETE', `usuarios/${uid}/frases/${id}`)));
      const falha = resultados.find(r => r.status === 'rejected');
      if (falha) throw falha.reason;
    }

    async function lerTombstones() {
      const dados = await pedir('GET', `usuarios/${uid}/meta/deleted`);
      const campos = dados?.fields?.ids?.mapValue?.fields || {};
      return new Map(Object.entries(campos).map(([id, v]) => [id, Number(v.integerValue ?? v.stringValue ?? 0)]));
    }

    async function gravarTombstones(ids, apagadasEm) {
      if (ids.length === 0) return;
      const { mascara, corpo } = tombstoneFirestore(ids, apagadasEm);
      await pedir('PATCH', `usuarios/${uid}/meta/deleted?${mascara}`, corpo);
    }

    /** `{ chave, em }` (chave '' no tombstone), ou `null` quando a conta nunca teve chave (404). */
    async function lerChaveDaOpenAI() {
      let dados;
      try {
        dados = await pedir('GET', `usuarios/${uid}/${DOCUMENTO_DA_CHAVE}`);
      } catch (erro) {
        if (erro.status === 404) return null;
        throw erro;
      }
      const { chave, apagada, em } = deCampos(dados?.fields);
      return { chave: apagada || typeof chave !== 'string' ? '' : chave, em: Number(em) || 0 };
    }

    /** Grava o documento inteiro (sem máscara): o tombstone substitui a chave, que não fica em campo nenhum. */
    async function gravarChaveDaOpenAI({ chave, em }) {
      const campos = chave ? { chave, em } : { apagada: true, em };
      await pedir('PATCH', `usuarios/${uid}/${DOCUMENTO_DA_CHAVE}`, { fields: paraCampos(campos) });
    }

    return { uid, listarFrases, gravarFrase, gravarFrases, apagarFrases, lerTombstones, gravarTombstones, lerChaveDaOpenAI, gravarChaveDaOpenAI };
  }

  // ─── O armazenamento do Chrome, como promessas ─────────────────────────────

  /** `chrome.storage` (callbacks, como o painel e o simulador do preview o têm) → `{ local, sync }` de promessas. */
  function armazenamentoDoChrome(storage) {
    const area = a => ({
      get: chaves => new Promise(resolve => a.get(chaves, resolve)),
      set: itens => new Promise(resolve => a.set(itens, resolve)),
      remove: chaves => new Promise(resolve => a.remove(chaves, resolve)),
    });
    return { local: area(storage.local), sync: area(storage.sync) };
  }

  // ─── A sincronização ───────────────────────────────────────────────────────

  /**
   * `carregar` exige uma `nuvem`. Sem conta (`nuvem: null`), `apagar` só grava
   * tombstones locais/sync, `apagarTudo` apenas confirma e `subirFrases` não envia.
   * Quem chama continua responsável por retirar as frases da tela e do local.
   * `aviso(mensagem, erro)` recebe o que falhou em segundo plano (retries).
   */
  function criarSincronizacao({ nuvem, armazenamento, agora = Date.now, aviso = () => {} }) {
    const { local, sync } = armazenamento;
    const ids = lista => lista.map(String);

    // ── Tombstone no chrome.storage.sync ──

    async function lerTombstoneSync() {
      const itens = await sync.get(null);
      const idsApagados = new Set();
      const expirados = [];
      for (const [chave, apagadaEm] of Object.entries(itens || {})) {
        if (!chave.startsWith(PREFIXO_DO_TOMBSTONE)) continue;
        if (agora() - Number(apagadaEm) < TTL_DO_TOMBSTONE) idsApagados.add(chave.slice(PREFIXO_DO_TOMBSTONE.length));
        else expirados.push(chave);
      }
      if (expirados.length > 0) await sync.remove(expirados);
      return idsApagados;
    }

    const marcarNoSync = lista => sync.set(tombstonesSync(lista, agora()));
    const limparNoSync = lista => sync.remove(lista.map(id => `${PREFIXO_DO_TOMBSTONE}${id}`));

    // ── Tombstone no Firestore: a fonte de verdade ──

    async function lerTombstoneDaNuvem() {
      try {
        const idsApagados = new Set();
        for (const [id, apagadaEm] of await nuvem.lerTombstones()) {
          if (agora() - apagadaEm < TTL_DO_TOMBSTONE) idsApagados.add(id);
        }
        return idsApagados;
      } catch {
        return new Set(); // nuvem inacessível → o fallback do sync cobre
      }
    }

    // ── Tombstone local: retry do DELETE que falhou ──

    async function marcarParaDeletar(lista) {
      const { pm_deleted_ids = [] } = await local.get({ pm_deleted_ids: [] });
      await local.set({ pm_deleted_ids: [...new Set([...pm_deleted_ids, ...lista])] });
    }

    async function limparParaDeletar(lista) {
      const { pm_deleted_ids = [] } = await local.get({ pm_deleted_ids: [] });
      const removidos = new Set(lista);
      await local.set({ pm_deleted_ids: pm_deleted_ids.filter(id => !removidos.has(id)) });
    }

    /** As frases enviadas à nuvem saem da fila de retry (`pm_pending_sync`). */
    async function tirarDaFila(lista) {
      const subiram = new Set(ids(lista));
      const { pm_pending_sync = [] } = await local.get({ pm_pending_sync: [] });
      const restantes = pm_pending_sync.filter(id => !subiram.has(id));
      if (restantes.length !== pm_pending_sync.length) await local.set({ pm_pending_sync: restantes });
    }

    /** Apaga da nuvem o que está nela e é tombstone; o que falhar fica para o próximo carregamento. */
    function apagarEmSegundoPlano(frasesDaNuvem, tombstones, depois, quando) {
      const paraApagar = frasesDaNuvem.filter(f => tombstones.has(String(f.id))).map(f => String(f.id));
      if (paraApagar.length === 0) return null;
      return nuvem.apagarFrases(paraApagar)
        .then(() => depois(paraApagar))
        .catch(err => aviso(`retry delete ${quando} falhou`, err));
    }

    // Um Apagar tudo com a nuvem fora do ar deixou pm_apagar_tudo ({ uid, ate }). No
    // primeiro sync desta conta que alcança a nuvem, toda frase dela gravada até `ate`
    // (o id de uma frase é a hora em que ela foi gravada) ganha tombstone e sai; o que
    // foi minerado depois, em qualquer computador, fica. Devolve os ids apagados.
    async function concluirApagarTudoPendente(frasesDaNuvem) {
      const { pm_apagar_tudo: pendente } = await local.get({ pm_apagar_tudo: null });
      if (!pendente || pendente.uid !== nuvem.uid) return new Set();
      const apagar = frasesDaNuvem.filter(f => Number(f.id) <= pendente.ate).map(f => String(f.id));
      if (apagar.length > 0) {
        await marcarNoSync(apagar);
        await marcarParaDeletar(apagar);
        await nuvem.gravarTombstones(apagar, agora());
        await nuvem.apagarFrases(apagar);
        await limparParaDeletar(apagar);
      }
      await local.remove('pm_apagar_tudo');
      return new Set(apagar);
    }

    /**
     * Junta o histórico local, a nuvem e os tombstones; devolve o que o painel mostra.
     * `atuais()` devolve as frases que o painel tem na tela, lidas só no fim, depois de
     * a rede responder. Preserva edições das órfãs e novas frases mineradas nesse
     * meio tempo, desde que ainda existam no local e não tenham tombstone.
     *
     *   frases           a lista a mostrar
     *   desteComputador  quantas frases deste computador (sem as apagadas)
     *   falhaNasOrfas    { quantas, causas } das frases locais que não subiram, ou null
     *   tombstones       os ids apagados (Set<string>)
     *   concluida        promessa dos retries em segundo plano (os testes esperam por ela)
     *
     * Rejeita quando a nuvem não responde à leitura das frases.
     */
    async function carregar({ atuais = () => [] } = {}) {
      const emSegundoPlano = [];
      let frasesDaNuvem = await nuvem.listarFrases();

      // ── Apagar tudo que a nuvem não confirmou: sai o que foi gravado até aquela hora ──
      const apagadasAgora = await concluirApagarTudoPendente(frasesDaNuvem);
      frasesDaNuvem = frasesDaNuvem.filter(f => !apagadasAgora.has(String(f.id)));

      // ── Tombstone local: retry dos deletes que falharam neste computador ──
      const { pm_deleted_ids = [] } = await local.get({ pm_deleted_ids: [] });
      if (pm_deleted_ids.length > 0) {
        const apagadasAqui = new Set(pm_deleted_ids.map(String));
        const retry = apagarEmSegundoPlano(frasesDaNuvem, apagadasAqui, limparParaDeletar, 'pendente');
        if (retry) emSegundoPlano.push(retry);
        frasesDaNuvem = frasesDaNuvem.filter(f => !apagadasAqui.has(String(f.id)));
      }

      // ── Tombstone entre computadores: a nuvem (fonte de verdade) + o sync (fallback offline) ──
      // Lê os dois em paralelo e junta: as deleções recentes (ainda não propagadas
      // pelo Chrome sync) e as offline (sem nuvem) ficam cobertas.
      const [tombstoneNuvem, tombstoneSync] = await Promise.all([lerTombstoneDaNuvem(), lerTombstoneSync()]);
      const tombstones = new Set([...tombstoneNuvem, ...tombstoneSync, ...apagadasAgora]);

      if (tombstones.size > 0) {
        // Se ainda estão na nuvem (o delete falhou), apaga agora.
        const retry = apagarEmSegundoPlano(frasesDaNuvem, tombstones, limparNoSync, 'entre computadores');
        if (retry) emSegundoPlano.push(retry);
        frasesDaNuvem = frasesDaNuvem.filter(f => !tombstones.has(String(f.id)));
      }

      const idsNaNuvem = new Set(frasesDaNuvem.map(f => f.id));
      const { frases: locais = [] } = await local.get({ frases: [] });

      // ── Regra fundamental: o tombstone é a ÚNICA razão para descartar uma frase local.
      // Qualquer frase no armazenamento local que não foi explicitamente apagada (tombstone)
      // é válida e deve ir à nuvem se ainda não chegou lá.
      // Isso cobre: sync em voo, sync que falhou, adição manual, importação, etc.

      // Órfãs: frases locais ausentes da nuvem que não foram apagadas de propósito
      const orfas = locais.filter(f => !idsNaNuvem.has(f.id) && !tombstones.has(String(f.id)));

      // Limpa o local: só as frases com tombstone (apagadas de propósito)
      const locaisSemTombstone = locais.filter(f => !tombstones.has(String(f.id)));
      if (locaisSemTombstone.length !== locais.length) await local.set({ frases: locaisSemTombstone });

      // Limpa pm_pending_sync das apagadas (evita crescimento indefinido)
      if (tombstones.size > 0) {
        const { pm_pending_sync = [] } = await local.get({ pm_pending_sync: [] });
        const filtrado = pm_pending_sync.filter(id => !tombstones.has(id));
        if (filtrado.length !== pm_pending_sync.length) await local.set({ pm_pending_sync: filtrado });
      }

      let falhaNasOrfas = null;
      if (orfas.length > 0) {
        const resultados = await Promise.allSettled(orfas.map(f => nuvem.gravarFrase(f)));
        const enviadas = orfas.filter((_, i) => resultados[i].status === 'fulfilled');
        const falhas = resultados.filter(r => r.status === 'rejected');

        if (enviadas.length > 0) await tirarDaFila(enviadas.map(f => f.id));
        if (falhas.length > 0) falhaNasOrfas = { quantas: falhas.length, causas: falhas.map(r => r.reason) };

        // Todas as órfãs ficam na lista, também as que não subiram: o painel grava
        // `todasFrases` por inteiro no armazenamento a cada edição, então uma frase
        // que sumisse daqui sumiria do computador sem nunca ter chegado à nuvem.
        frasesDaNuvem.push(...orfas);
      }

      // ── Merge das marcas de Enviada ao Anki (`status: 'exported'`) e Exportada
      // (`exportadaTxt`) ──────────────────────────────────────────────────────
      // Se o local tem a marca mas a nuvem ainda não (falha de rede, service
      // worker em voo), preserva a marca na exibição e retenta o envio.
      // Se a nuvem já tem a marca (outro computador marcou), aplica ao local
      // para ela se propagar entre computadores.
      {
        const locaisPorIdAntes = new Map(locais.map(f => [String(f.id), f]));
        const pendentesNaNuvem = [];
        let localPrecisaAtualizar = false;
        const localAtualizado = [...locaisSemTombstone];

        frasesDaNuvem = frasesDaNuvem.map(f => {
          const id = String(f.id);
          const daqui = locaisPorIdAntes.get(id);
          if (!daqui) return f;
          let naNuvem = f;

          for (const [campo, valor] of MARCAS) {
            // Caso 1: marcada aqui, a nuvem ainda não — aplica e retenta
            if (daqui[campo] === valor && naNuvem[campo] !== valor) naNuvem = { ...naNuvem, [campo]: valor };

            // Caso 2: marcada na nuvem, aqui ainda não — atualiza o local
            if (f[campo] === valor && daqui[campo] !== valor) {
              const idx = localAtualizado.findIndex(lf => String(lf.id) === id);
              if (idx !== -1) localAtualizado[idx] = { ...localAtualizado[idx], [campo]: valor };
              localPrecisaAtualizar = true;
            }
          }

          if (naNuvem !== f) pendentesNaNuvem.push(naNuvem);
          return naNuvem;
        });

        if (pendentesNaNuvem.length > 0) {
          emSegundoPlano.push(nuvem.gravarFrases(pendentesNaNuvem)
            .catch(err => aviso('retry das marcas Enviada/Exportada falhou', err)));
        }
        if (localPrecisaAtualizar) await local.set({ frases: localAtualizado });
      }

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

    /**
     * Grava os tombstones locais/sync antes da rede. Com conta, o tombstone do
     * Firestore e o DELETE correm em paralelo; falha no primeiro só chama `aviso`.
     * Devolve o erro do DELETE e mantém os ids em `pm_deleted_ids` quando ele falha,
     * ou `null` (também sem conta).
     */
    async function apagar(idsParaApagar) {
      if (!idsParaApagar.length) return null;
      const lista = ids(idsParaApagar);
      await marcarNoSync(lista);
      await marcarParaDeletar(lista);
      if (!nuvem) return null;
      const [tombstone, remocao] = await Promise.allSettled([
        nuvem.gravarTombstones(lista, agora()),
        nuvem.apagarFrases(lista),
      ]);
      if (tombstone.status === 'rejected') aviso('tombstone write falhou', tombstone.reason);
      if (remocao.status === 'rejected') {
        aviso('delete falhou, ficará pendente', remocao.reason);
        return remocao.reason;
      }
      await limparParaDeletar(lista);
      return null;
    }

    // Com conta, as frases deste computador ficam marcadas como apagadas antes de
    // a nuvem ser lida: com ela fora do ar, o sync seguinte não as traz de volta. E até a nuvem
    // confirmar, fica lembrado “apagar tudo até agora” (pm_apagar_tudo), para o sync
    // seguinte apagar também o que outro computador gravou antes e daqui não se via.
    // Devolve `{ ok: true }` quando não há mais nada a apagar na nuvem (ou não há conta),
    // ou `{ ok: false, erro }`.
    async function apagarTudo(idsDesteComputador) {
      if (!nuvem) return { ok: true };
      const daqui = ids(idsDesteComputador);
      await marcarNoSync(daqui);
      await marcarParaDeletar(daqui);
      const ate = Math.max(agora(), ...daqui.map(Number));
      await local.set({ pm_apagar_tudo: { uid: nuvem.uid, ate } });
      try {
        const frasesDaNuvem = await nuvem.listarFrases();
        const todas = [...new Set([...daqui, ...frasesDaNuvem.map(f => String(f.id))])];
        await marcarNoSync(todas);
        await marcarParaDeletar(todas);
        await nuvem.gravarTombstones(todas, agora());
        await nuvem.apagarFrases(todas);
        await limparParaDeletar(todas);
        await local.remove('pm_apagar_tudo');
        return { ok: true };
      } catch (erro) {
        return { ok: false, erro };
      }
    }

    /** Sobe as frases de uma vez e as tira da fila de retry. Devolve o erro da nuvem, ou `null` (também sem conta). */
    async function subirFrases(frases) {
      if (!nuvem || frases.length === 0) return null;
      try {
        await nuvem.gravarFrases(frases);
      } catch (erro) {
        return erro;
      }
      await tirarDaFila(frases.map(f => f.id));
      return null;
    }

    return { carregar, apagar, apagarTudo, subirFrases };
  }

  // ─── A chave da OpenAI que acompanha a conta (#154) ────────────────────────

  /**
   * Junta a chave deste computador e a da nuvem da conta: a de hora (`em`) mais nova vale, e um apagamento
   * (chave '') vale como qualquer mudança, então a cópia velha de outro computador não volta pelo sync.
   *
   * `daqui` é a chave deste computador (lib/chave-da-openai.js na extensão):
   *   ler(uid?) → { chave, em, conta, ativaEm? }  leitura atômica; chave '' sem chave, em 0 no legado;
   *                                  conta é o UID da alteração/chegada ('' sem conta, 'local' no apagamento local).
   *                                  Pendência deste UID pode ser lida com a versão ativa em ativaEm.
   *   aplicar({ chave, em, conta }, { se })  guarda a chave que chegou (ou a apaga, com chave ''), aqui e na
   *                                  Conexão, só se a hora daqui ainda é `se`; devolve se aplicou
   *   marcarConta(conta, { se })     a chave daqui subiu para esta conta (só se a hora ainda é `se`)
   *
   * Uma chave alterada ou recebida por outra conta nunca sobe para esta: entrar noutra conta Google no mesmo
   * computador não leva a chave da primeira. A nuvem desta conta, se tem chave, vale aqui.
   *
   * `sincronizar()` devolve o que aconteceu: 'chegou', 'apagada' (veio da nuvem), 'subiu' (foi para ela) ou
   * `null` (nada, ou a chave daqui mudou no meio: o sync seguinte a leva). Rejeita quando a nuvem falha.
   */
  function criarSincronizacaoDaChave({ nuvem, daqui }) {
    // Uma chave de antes do #154 não tem hora: vale como a mais antiga das chaves, mas ainda chega a um
    // computador que nunca teve chave.
    const horaDe = ({ chave, em }) => em || (chave ? 1 : 0);

    async function sincronizar() {
      const [naNuvem, aqui] = await Promise.all([nuvem.lerChaveDaOpenAI(), daqui.ler(nuvem.uid)]);
      const deOutraConta = Boolean(aqui.conta) && aqui.conta !== nuvem.uid;
      // No empate, a remoção cancela só essa versão exata. Uma marca de outra
      // conta pode manter a hora da cópia retirada, sem apagar uma chave posterior.
      const empate = naNuvem && horaDe(naNuvem) === horaDe(aqui);
      if (naNuvem && (deOutraConta || horaDe(naNuvem) > horaDe(aqui) || (empate && !naNuvem.chave && aqui.chave))) {
        const aplicou = await daqui.aplicar({ chave: naNuvem.chave, em: horaDe(naNuvem), conta: nuvem.uid }, { se: aqui.ativaEm ?? aqui.em });
        if (!aplicou) return null;
        return naNuvem.chave ? 'chegou' : 'apagada';
      }
      if (!deOutraConta && (horaDe(aqui) > (naNuvem ? horaDe(naNuvem) : 0) || (empate && !aqui.chave && naNuvem.chave))) {
        const atual = await daqui.ler(nuvem.uid);
        if (atual.em !== aqui.em || atual.ativaEm !== aqui.ativaEm || atual.conta !== aqui.conta || atual.chave !== aqui.chave) return null;
        await nuvem.gravarChaveDaOpenAI({ chave: aqui.chave, em: horaDe(aqui) });
        if (aqui.ativaEm !== undefined) await daqui.aplicar(aqui, { se: aqui.ativaEm });
        else await daqui.marcarConta(nuvem.uid, { se: aqui.em });
        return 'subiu';
      }
      if (aqui.ativaEm !== undefined) await daqui.aplicar(aqui, { se: aqui.ativaEm });
      return null;
    }

    return { sincronizar };
  }

  // Tokens permitiriam buscar também o segredo no Firestore. Nunca ficam na área
  // chrome.storage.local que os content scripts leem; IndexedDB é da origem da extensão.
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
      // Atomic migration cannot overwrite a newer login or resurrect a logged-out session.
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
    lerCredenciais, guardarCredenciais, apagarCredenciais,
    MOTIVO,
    CHAVE_DA_API,
    TTL_DO_TOMBSTONE,
    PREFIXO_DO_TOMBSTONE,
    paraCampos,
    deCampos,
    tombstonesSync,
    tombstoneFirestore,
    erroDaNuvem,
    criarSessao,
    nuvemHttp,
    armazenamentoDoChrome,
    criarSincronizacao,
    criarSincronizacaoDaChave,
  };
  if (typeof module !== 'undefined') module.exports = raiz.Sincronizacao;
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
