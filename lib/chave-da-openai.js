'use strict';

(function (raiz) {
  const MARCA = 'pm_chave_openai';
  const MOTIVOS = { openai_key_rejected: 'recusada', openai_no_credit: 'sem_credito',
    openai_org_not_verified: 'organizacao_nao_verificada', openai_unreachable: 'openai_fora_do_ar',
    other_account_unsent: 'outra_conta_pendente', legacy_key_unbound: 'legado_pendente' };
  const CODIGOS = [...Object.keys(MOTIVOS), 'invalid_request', 'stale_key_version',
    'legacy_key_mismatch', 'internal_error', 'origin_not_allowed', 'cloud_sync_failed'];
  const ouvintes = new Set();
  let leitura;
  let legadoLimpo = false;

  const sessaoExpirada = (status, codigo) => status === 401 && codigo === 'session_expired';

  async function pedir(pedido, tempo = 5000) {
    const { MOTIVO, pedir: conversar } = raiz.ConversaComOAnki;
    const { motivo, codigo, status, dados } = await conversar(pedido, { prazoMs: tempo });
    if (motivo === MOTIVO.A_PAREAR) return { status: null, json: null, semPareamento: codigo };
    if (motivo === MOTIVO.SEM_RESPOSTA || sessaoExpirada(status, codigo)) return null;
    return { status, json: dados };
  }

  async function pedirDuasVezes(pedido, tempo) {
    const primeira = await pedir(pedido, tempo);
    return primeira || pedir(pedido, tempo);
  }

  const foiAceita = resposta => resposta?.status === 200 && resposta.json?.ok === true;
  const codigoDe = resposta => CODIGOS.includes(resposta?.json?.error) ? resposta.json.error : 'resposta_invalida';
  const erroSemConexao = () => ({ ok: false, motivo: 'sem_conexao', detalhes: 'sem resposta' });
  const erroDoPareamento = resposta => ({ ok: false, motivo: 'a_parear', detalhes: `HTTP 401 · ${resposta.semPareamento}` });
  const erroDaConexao = resposta => ({
    ok: false, motivo: MOTIVOS[codigoDe(resposta)] || 'conexao_com_erro', detalhes: `HTTP ${resposta.status} · ${codigoDe(resposta)}`,
  });

  function erro(resposta) {
    if (!resposta) return erroSemConexao();
    return resposta.semPareamento ? erroDoPareamento(resposta) : erroDaConexao(resposta);
  }

  const abrirBancoLegado = () => new Promise((resolve, reject) => {
    const req = indexedDB.open('pm-segredos', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('chaves');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const lerLegado = banco => new Promise((resolve, reject) => {
    const tx = banco.transaction('chaves', 'readonly'), loja = tx.objectStore('chaves');
    const chave = loja.get('openai'), conta = loja.get('openai-conta'), em = loja.get('openai-em');
    tx.oncomplete = () => resolve({ chave: chave.result || '', conta: conta.result || '', em: Number(em.result) || 0 });
    tx.onerror = tx.onabort = () => reject(tx.error);
  });

  const esvaziarAsChavesLegadasDeTodaConta = banco => new Promise((resolve, reject) => {
    const tx = banco.transaction('chaves', 'readwrite');
    tx.objectStore('chaves').clear();
    tx.oncomplete = resolve;
    tx.onerror = tx.onabort = () => reject(tx.error);
  });

  const temLegado = antigo => [antigo.chave, antigo.em, antigo.conta].some(Boolean);
  const donoPrecisaDoLegado = dono => dono.conta === null || !dono.configurada;

  const contaDoLegado = antigo => (antigo.conta === 'local' ? '' : antigo.conta);
  const horaDoLegado = antigo => antigo.em || (antigo.chave ? 1 : 0);
  const vinculoRecusado = resposta => resposta?.status !== 200 || !resposta.json?.ok;

  async function vincularLegadoAoDono(antigo) {
    const dono = await lerDono();
    if (!dono) throw new Error('legacy_owner_unavailable');
    if (!donoPrecisaDoLegado(dono)) return;
    const resposta = await pedir(raiz.PedidoAoAnki.vincularLegadoDaOpenAI(antigo.chave, contaDoLegado(antigo), horaDoLegado(antigo), dono.versao));
    if (vinculoRecusado(resposta)) throw Object.assign(new Error('legacy_key_mismatch'),
      { status: resposta?.status, codigo: codigoDe(resposta) });
  }

  async function passarOLegadoAoDono(todas) {
    const banco = await abrirBancoLegado();
    try {
      const antigo = await lerLegado(banco);
      if (!todas && temLegado(antigo)) await vincularLegadoAoDono(antigo);
      await esvaziarAsChavesLegadasDeTodaConta(banco);
    } finally { banco.close(); }
  }

  const marcaDeAntesDoNaoEnviada = marca => Boolean(marca) && typeof marca.naoEnviada !== 'boolean';

  async function limparMarcasAntigas() {
    const dados = await chrome.storage.local.get(MARCA);
    if (marcaDeAntesDoNaoEnviada(dados[MARCA])) await chrome.storage.local.remove(MARCA);
    await chrome.storage.local.remove('pm_chave_openai_versao');
  }

  async function limparLegado({ todas = false } = {}) {
    await navigator.locks.request('pm-chave-legado', async () => {
      if (legadoLimpo && !todas) return;
      await passarOLegadoAoDono(todas);
      await limparMarcasAntigas();
      legadoLimpo = true;
    });
  }

  async function lerCache() {
    const dados = await chrome.storage.local.get({ [MARCA]: null });
    return dados[MARCA] || { ultimos4: '', conta: '', versao: 0, naoEnviada: false };
  }

  const ehBooleano = valor => typeof valor === 'boolean';
  const versaoValida = valor => Number.isSafeInteger(valor) && valor >= 0;
  const contaValida = valor => valor === null || typeof valor === 'string';
  const ultimos4Validos = valor => typeof valor === 'string' && valor.length === 4;

  function donoValido(dono) {
    if (!dono) return false;
    const campos = [ehBooleano(dono.configurada), versaoValida(dono.versao), contaValida(dono.conta), ehBooleano(dono.naoEnviada)];
    if (!campos.every(Boolean)) return false;
    return !dono.configurada || ultimos4Validos(dono.ultimos4);
  }

  const semRotaDoDono = resposta => resposta?.status === 404;
  const donoSemVersao = dono => ehBooleano(dono?.configurada) && dono.versao === undefined;

  function recusarConexaoAntiga(resposta, dono) {
    if (!semRotaDoDono(resposta) && !donoSemVersao(dono)) return;
    throw Object.assign(new Error('outdated_connection'), { status: resposta.status, codigo: 'outdated_connection' });
  }

  const mudouOCache = (cache, anterior) => ['versao', 'conta', 'ultimos4'].some(campo => cache[campo] !== anterior[campo]);

  async function guardarNoCache(dono) {
    const anterior = await lerCache();
    const cache = { ultimos4: dono.configurada ? dono.ultimos4 : '', conta: dono.conta,
      versao: dono.versao, naoEnviada: dono.naoEnviada };
    const mudou = mudouOCache(cache, anterior);
    if (mudou || cache.naoEnviada !== anterior.naoEnviada) await chrome.storage.local.set({ [MARCA]: cache });
    return mudou;
  }

  const pendenteDeConta = dono => dono.naoEnviada && Boolean(dono.conta);

  async function avisarSeAContaAtualMudou(dono, mudou) {
    if (!mudou || !pendenteDeConta(dono)) return;
    if (dono.conta === await contaAtual().catch(() => '')) ouvintes.forEach(fn => fn());
  }

  async function lerDono() {
    return navigator.locks.request('pm-chave-cache', async () => {
      const resposta = await pedir(raiz.PedidoAoAnki.estadoDaIA());
      const dono = resposta?.status === 200 ? resposta.json?.openai : null;
      recusarConexaoAntiga(resposta, dono);
      if (!donoValido(dono)) return null;
      await avisarSeAContaAtualMudou(dono, await guardarNoCache(dono));
      return dono;
    });
  }

  async function conferirACopia({ migrar = true } = {}) {
    if (!leitura) leitura = (async () => { if (migrar) await limparLegado(); return lerDono(); })().finally(() => { leitura = null; });
    const dono = await leitura;
    return dono ? (dono.configurada || null) : null;
  }

  async function contaAtual() {
    const credenciais = await raiz.Sincronizacao.lerCredenciais();
    const { pm_user_info } = await chrome.storage.local.get({ pm_user_info: null });
    if (pm_user_info && pm_user_info.uid !== credenciais?.uid) throw new Error('session_changed');
    return pm_user_info ? credenciais.uid : '';
  }

  function desfechoDaConfirmacao(resposta, dono) {
    if (!foiAceita(resposta)) return erro(resposta);
    if (!dono) return erro(null);
    if (!dono.configurada) return { ok: false, motivo: 'conexao_com_erro', detalhes: 'owner_changed' };
    return { ok: true, ultimos4: dono.ultimos4 };
  }

  async function confirmar(chave) {
    const conta = await contaAtual();
    await conferirACopia({ migrar: false });
    const { versao } = await lerCache();
    const resposta = await pedirDuasVezes(raiz.PedidoAoAnki.chaveDaOpenAI(chave, versao, conta), 40000);
    if (foiAceita(resposta)) await limparLegado({ todas: true });
    return desfechoDaConfirmacao(resposta, await lerDono());
  }

  function chaveDeOutraConta(dono, conta) {
    if (!conta || !dono.configurada) return false;
    return Boolean(dono.conta) && dono.conta !== conta;
  }

  async function donoQueAContaPodeApagar(conta) {
    const atual = await lerDono();
    if (!atual) throw new Error('owner_unavailable');
    if (chaveDeOutraConta(atual, conta)) throw Object.assign(new Error('other_account_owner'), { codigo: 'other_account_owner' });
    return atual;
  }

  async function apagar() {
    const conta = await contaAtual();
    const atual = await donoQueAContaPodeApagar(conta);
    await limparLegado({ todas: true });
    const resposta = await pedirDuasVezes(raiz.PedidoAoAnki.apagarChaveDaOpenAI(atual.versao, conta));
    const dono = await lerDono();
    if (!foiAceita(resposta)) throw new Error(erro(resposta).detalhes);
    if (!dono) throw new Error('owner_unavailable');
    return dono;
  }

  const REPETIR = Symbol('repetir');
  const ADIAR = Symbol('adiar');

  async function confirmarASessao(sessao, uid) {
    sessao.verificarAtiva();
    if (await contaAtual() !== uid) throw raiz.Sincronizacao.erroDaNuvem('sessão mudou', { motivo: raiz.Sincronizacao.MOTIVO.EXPIROU });
  }

  const semConexaoSemPendencia = async anterior => !anterior.naoEnviada
    && await raiz.ConexaoAnki.conferir() !== raiz.ConexaoAnki.SITUACAO.LIGADA;
  const semRotaDaChave = falha => falha.codigo === 'outdated_connection' && falha.status === 404;

  async function lerDonoParaSincronizar(anterior) {
    try {
      await conferirACopia();
      return await lerDono();
    } catch (falha) {
      if (semRotaDaChave(falha) && !anterior.naoEnviada) return ADIAR;
      throw falha;
    }
  }

  const versaoVelha = resposta => resposta?.status === 409 && codigoDe(resposta) === 'stale_key_version';

  function motivoDaFalha(status) {
    const { MOTIVO } = raiz.Sincronizacao;
    if (status === 401) return MOTIVO.EXPIROU;
    return status === 403 ? MOTIVO.RECUSADO : undefined;
  }

  function falhaDaSincronizacao(resposta) {
    const status = resposta?.status || 503;
    const codigo = codigoDe(resposta);
    const falha = raiz.Sincronizacao.erroDaNuvem(`OpenAI sync · HTTP ${status} · ${codigo}`, { status, motivo: motivoDaFalha(status) });
    return Object.assign(falha, { codigo });
  }

  const tokenRecusado = resposta => resposta?.status === 401;

  function desfechoDaSincronizacao(resposta, sessao, primeira) {
    if (foiAceita(resposta)) return resposta.json.resultado;
    if (!primeira) throw falhaDaSincronizacao(resposta);
    if (tokenRecusado(resposta)) sessao.invalidar();
    if (tokenRecusado(resposta) || versaoVelha(resposta)) return REPETIR;
    throw falhaDaSincronizacao(resposta);
  }

  async function donoParaSincronizar(sessao, uid) {
    await confirmarASessao(sessao, uid);
    const anterior = await lerCache();
    if (await semConexaoSemPendencia(anterior)) return ADIAR;
    const dono = await lerDonoParaSincronizar(anterior);
    if (dono !== ADIAR && !dono) throw new Error('owner_unavailable');
    return dono;
  }

  async function tentarSincronizar(sessao, uid, primeira) {
    const dono = await donoParaSincronizar(sessao, uid);
    if (dono === ADIAR) return null;
    const token = await sessao.token();
    await confirmarASessao(sessao, uid);
    const resposta = await pedir(raiz.PedidoAoAnki.sincronizarChaveDaOpenAI(uid, token, dono.versao), 25000);
    await confirmarASessao(sessao, uid);
    await conferirACopia();
    return desfechoDaSincronizacao(resposta, sessao, primeira);
  }

  async function sincronizar(sessao, uid) {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const desfecho = await tentarSincronizar(sessao, uid, tentativa === 0);
      if (desfecho !== REPETIR) return desfecho;
    }
  }

  raiz.ChaveDaOpenAI = { MARCA, confirmar, apagar, conferirACopia, sincronizar,
    aoMudar: fn => ouvintes.add(fn) };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
