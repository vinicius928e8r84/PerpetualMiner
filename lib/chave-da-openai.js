'use strict';

// Só a Conexão é dona da chave/revisão/flag de replicação. Aqui há UM cache
// público do resumo. Chave digitada e credencial Firebase são pedidos transitórios;
// não existem rascunhos secretos, gerações ou apagamentos locais por UID.
(function (raiz) {
  const MARCA = 'pm_chave_openai';
  const MOTIVOS = { openai_key_rejected: 'recusada', openai_no_credit: 'sem_credito',
    openai_org_not_verified: 'organizacao_nao_verificada', openai_unreachable: 'openai_fora_do_ar',
    other_account_unsent: 'outra_conta_pendente', legacy_key_unbound: 'legado_pendente' };
  const CODIGOS = [...Object.keys(MOTIVOS), 'invalid_request', 'stale_key_version',
    'legacy_key_mismatch', 'internal_error', 'origin_not_allowed', 'cloud_sync_failed'];
  const ouvintes = new Set();
  let leitura;
  let legadoLimpo = false; // cache de uma limpeza já concluída nesta página, sem segredo

  async function pedir(pedido, tempo = 5000) {
    try {
      const resposta = await raiz.PedidoAoAnki.pedir(raiz.ConexaoAnki.ENDERECO, pedido, { signal: AbortSignal.timeout(tempo) });
      return { status: resposta.status, json: await resposta.json().catch(() => null) };
    } catch { return null; }
  }
  const codigoDe = resposta => CODIGOS.includes(resposta?.json?.error) ? resposta.json.error : 'resposta_invalida';
  const erro = resposta => ({ ok: false, motivo: resposta ? MOTIVOS[codigoDe(resposta)] || 'conexao_com_erro' : 'sem_conexao',
    detalhes: resposta ? `HTTP ${resposta.status} · ${codigoDe(resposta)}` : 'sem resposta' });

  // Compatibilidade de formato, não outro dono: transfere UID/hora só com prova
  // EXATA do valor já guardado. Nunca importa uma chave antiga sobre a do servidor.
  async function limparLegado({ todas = false } = {}) {
    await navigator.locks.request('pm-chave-legado', async () => {
      if (legadoLimpo && !todas) return;
      const banco = await new Promise((resolve, reject) => {
        const req = indexedDB.open('pm-segredos', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('chaves');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      try {
        const antigo = await new Promise((resolve, reject) => {
          const tx = banco.transaction('chaves', 'readonly'), loja = tx.objectStore('chaves');
          const chave = loja.get('openai'), conta = loja.get('openai-conta'), em = loja.get('openai-em');
          tx.oncomplete = () => resolve({ chave: chave.result || '', conta: conta.result || '', em: Number(em.result) || 0 });
          tx.onerror = tx.onabort = () => reject(tx.error);
        });
        if (!todas && (antigo.chave || antigo.em || antigo.conta)) {
          // Uma prova recusada não faz do legado um dono: a máscara vem da
          // Conexão, mesmo quando a migração precisa de uma escolha explícita.
          const dono = await lerDono();
          if (!dono) throw new Error('legacy_owner_unavailable');
          if (dono.conta === null || !dono.configurada) {
            const conta = antigo.conta === 'local' ? '' : antigo.conta;
            const resposta = await pedir(raiz.PedidoAoAnki.vincularLegadoDaOpenAI(antigo.chave, conta, antigo.em || (antigo.chave ? 1 : 0), dono.versao));
            if (resposta?.status !== 200 || !resposta.json?.ok) throw Object.assign(new Error('legacy_key_mismatch'),
              { status: resposta?.status, codigo: codigoDe(resposta) });
          }
        }
        await new Promise((resolve, reject) => {
          const tx = banco.transaction('chaves', 'readwrite');
          tx.objectStore('chaves').clear(); // inclusive toda conta:<uid> que não é o dono
          tx.oncomplete = resolve;
          tx.onerror = tx.onabort = () => reject(tx.error);
        });
      } finally { banco.close(); }
      const dados = await chrome.storage.local.get(MARCA);
      if (dados[MARCA] && typeof dados[MARCA].naoEnviada !== 'boolean') await chrome.storage.local.remove(MARCA);
      await chrome.storage.local.remove('pm_chave_openai_versao');
      legadoLimpo = true;
    });
  }

  async function lerCache() {
    const dados = await chrome.storage.local.get({ [MARCA]: null });
    return dados[MARCA] || { ultimos4: '', conta: '', versao: 0, naoEnviada: false };
  }

  async function lerDono() {
    // Serializa também o HTTP de leitura entre abas, não apenas a gravação do
    // cache: uma leitura lenta não chega depois de uma leitura mais nova.
    return navigator.locks.request('pm-chave-cache', async () => {
      const resposta = await pedir(raiz.PedidoAoAnki.estadoDaIA());
      const dono = resposta?.status === 200 ? resposta.json?.openai : null;
      if (typeof dono?.configurada === 'boolean' && dono.versao === undefined) {
        // O main 0.1.0 responde, mas não implementa o dono versionado. Não
        // envie uma mutação que ele guardaria sem conta/CAS/estado verificável.
        throw Object.assign(new Error('outdated_connection'), { status: resposta.status, codigo: 'outdated_connection' });
      }
      if (!dono || typeof dono.configurada !== 'boolean' || !Number.isSafeInteger(dono.versao) || dono.versao < 0
        || (dono.conta !== null && typeof dono.conta !== 'string') || typeof dono.naoEnviada !== 'boolean'
        || (dono.configurada && (typeof dono.ultimos4 !== 'string' || dono.ultimos4.length !== 4))) return null;
      const anterior = await lerCache();
      const cache = { ultimos4: dono.configurada ? dono.ultimos4 : '', conta: dono.conta,
        versao: dono.versao, naoEnviada: dono.naoEnviada };
      const mudou = cache.versao !== anterior.versao || cache.conta !== anterior.conta || cache.ultimos4 !== anterior.ultimos4;
      if (mudou || cache.naoEnviada !== anterior.naoEnviada) await chrome.storage.local.set({ [MARCA]: cache });
      // Uma leitura passiva de outro perfil não é uma ordem de trocar/sincronizar
      // o dono. Só a mudança ainda não enviada da sessão atual pede replicação
      // (inclui a aceitação tardia cuja página já fechou).
      if (mudou && dono.naoEnviada && dono.conta
        && dono.conta === await contaAtual().catch(() => '')) ouvintes.forEach(fn => fn());
      return dono;
    });
  }

  async function conferirACopia({ migrar = true } = {}) {
    if (!leitura) leitura = (async () => { if (migrar) await limparLegado(); return lerDono(); })().finally(() => { leitura = null; });
    const dono = await leitura;
    return dono ? (dono.configurada || null) : null;
  }

  async function contaAtual() {
    // O perfil é legível/escrevível pelo content script; não é prova de sessão.
    const credenciais = await raiz.Sincronizacao.lerCredenciais();
    const { pm_user_info } = await chrome.storage.local.get({ pm_user_info: null });
    if (pm_user_info && pm_user_info.uid !== credenciais?.uid) throw new Error('session_changed');
    return pm_user_info ? credenciais.uid : '';
  }

  async function confirmar(chave) {
    const conta = await contaAtual(); // capturada ANTES de qualquer HTTP
    await conferirACopia({ migrar: false });
    const { versao } = await lerCache();
    const pedido = raiz.PedidoAoAnki.chaveDaOpenAI(chave, versao, conta);
    let resposta = await pedir(pedido, 40000);
    if (!resposta) resposta = await pedir(pedido, 40000); // idêntico/base idêntica, não outra revisão
    if (resposta?.status === 200 && resposta.json?.ok === true) await limparLegado({ todas: true });
    const dono = await lerDono();
    if (resposta?.status !== 200 || resposta.json?.ok !== true) return erro(resposta);
    if (!dono) return erro(null);
    if (!dono.configurada) return { ok: false, motivo: 'conexao_com_erro', detalhes: 'owner_changed' };
    return { ok: true, ultimos4: dono.ultimos4 };
  }

  async function apagar() {
    const conta = await contaAtual();
    // Apagar é uma escolha explícita de descartar também a cópia antiga,
    // não uma tentativa de provar/vincular seu valor divergente ao dono.
    await limparLegado({ todas: true });
    await conferirACopia({ migrar: false });
    const { versao } = await lerCache();
    const pedido = raiz.PedidoAoAnki.apagarChaveDaOpenAI(versao, conta);
    let resposta = await pedir(pedido);
    if (!resposta) resposta = await pedir(pedido);
    const dono = await lerDono();
    if (resposta?.status !== 200 || resposta.json?.ok !== true) throw new Error(erro(resposta).detalhes);
    if (!dono) throw new Error('owner_unavailable');
    return dono;
  }

  async function sincronizar(sessao, uid) {
    const ativa = async () => {
      sessao.verificarAtiva();
      if (await contaAtual() !== uid) throw raiz.Sincronizacao.erroDaNuvem('sessão mudou', { motivo: raiz.Sincronizacao.MOTIVO.EXPIROU });
    };
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      await ativa();
      const anterior = await lerCache();
      // Anki fechado não é falha de sync se não há mudança/apagamento pendente.
      // Ligada, continua lendo a nuvem: outro computador pode ter uma chave.
      if (!anterior.naoEnviada
        && await raiz.ConexaoAnki.conferir() !== raiz.ConexaoAnki.SITUACAO.LIGADA) return null;
      const token = await sessao.token();
      await ativa();
      await conferirACopia();
      const cache = await lerCache();
      const resposta = await pedir(raiz.PedidoAoAnki.sincronizarChaveDaOpenAI(uid, token, cache.versao), 25000);
      await ativa();
      await conferirACopia();
      if (resposta?.status === 200 && resposta.json?.ok === true) return resposta.json.resultado;
      if (resposta?.status === 401 && tentativa === 0) { sessao.invalidar(); continue; }
      if (resposta?.status === 409 && codigoDe(resposta) === 'stale_key_version' && tentativa === 0) continue;
      const status = resposta?.status || 503;
      const motivo = status === 401 ? raiz.Sincronizacao.MOTIVO.EXPIROU : status === 403 ? raiz.Sincronizacao.MOTIVO.RECUSADO : undefined;
      throw Object.assign(raiz.Sincronizacao.erroDaNuvem(`OpenAI sync · HTTP ${status} · ${codigoDe(resposta)}`, { status, motivo }), { codigo: codigoDe(resposta) });
    }
  }

  raiz.ChaveDaOpenAI = { MARCA, confirmar, apagar, conferirACopia, sincronizar, lerCache,
    aoMudar: fn => ouvintes.add(fn) };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
