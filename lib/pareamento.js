'use strict';

(function (raiz) {
  const BANCO = 'pm-pareamento';
  const LOJA = 'conexao';
  const REGISTRO = 'credencial';
  const ESTADO = Object.freeze({ PAREADA: 'pareada', A_PAREAR: 'a_parear', NAO_CONFIRMADA: 'nao_confirmada', ANTIGA: 'antiga' });
  const CABECALHO = Object.freeze({
    cliente: 'X-PerpetualMiner-Cliente',
    sessao: 'X-PerpetualMiner-Sessao',
    nonce: 'X-PerpetualMiner-Nonce',
    assinatura: 'X-PerpetualMiner-Assinatura',
    prova: 'X-PerpetualMiner-Prova',
  });
  const TEMPO_DO_CONFERIR_MS = 3000;
  const TEMPO_DO_PAREAMENTO_MS = 8000;

  let estadoAtual = null;
  const ouvintes = [];
  let clientePendente = null;

  function abrirOBanco() {
    return new Promise((resolver, rejeitar) => {
      const abertura = indexedDB.open(BANCO, 1);
      abertura.onupgradeneeded = () => abertura.result.createObjectStore(LOJA);
      abertura.onerror = () => rejeitar(abertura.error);
      abertura.onsuccess = () => resolver(abertura.result);
    });
  }

  async function noBanco(modo, fazer) {
    const banco = await abrirOBanco();
    try {
      return await new Promise((resolver, rejeitar) => {
        const transacao = banco.transaction(LOJA, modo);
        const pedido = fazer(transacao.objectStore(LOJA));
        transacao.oncomplete = () => resolver(pedido?.result ?? null);
        transacao.onerror = () => rejeitar(transacao.error);
        transacao.onabort = () => rejeitar(transacao.error);
      });
    } finally {
      banco.close();
    }
  }

  async function lerACredencial() {
    const guardada = await noBanco('readonly', loja => loja.get(REGISTRO));
    return guardada && typeof guardada.cliente === 'string' && guardada.chave ? guardada : null;
  }

  function dosBytes(base64) {
    const texto = atob(base64);
    return Uint8Array.from(texto, letra => letra.charCodeAt(0));
  }

  function emBase64(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)));
  }

  async function guardarACredencial(cliente, segredoEmBase64) {
    const bytes = dosBytes(segredoEmBase64);
    if (bytes.length !== 32) throw new Error('o segredo do pareamento não tem 32 bytes');
    const chave = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    await noBanco('readwrite', loja => loja.put({ cliente, chave }, REGISTRO));
    return { cliente, chave };
  }

  function esquecerACredencial(cliente) {
    return noBanco('readwrite', loja => {
      const lida = loja.get(REGISTRO);
      lida.onsuccess = () => { if (lida.result?.cliente === cliente) loja.delete(REGISTRO); };
      return lida;
    });
  }

  async function hmac(chave, texto) {
    return emBase64(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(texto)));
  }

  async function sha256Hex(bytes) {
    const resumo = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(resumo, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  const sortear = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');

  async function assinaturaDoPedido(chave, { sessao: daSessao, nonce, metodo, caminho, corpo }) {
    return hmac(chave, `pm1\npedido\n${daSessao}\n${nonce}\n${metodo}\n${caminho}\n${await sha256Hex(corpo)}`);
  }

  const provaDaResposta = async (chave, { sessao: daSessao, nonce, status, corpo }) =>
    hmac(chave, `pm1\nresposta\n${daSessao}\n${nonce}\n${status}\n${await sha256Hex(corpo)}`);

  const provaDoServidor = (chave, desafio, daSessao) => hmac(chave, `pm1\nservidor\n${desafio}\n${daSessao}`);
  const provaDaRevogacao = (chave, desafio) => hmac(chave, `pm1\nrevogado\n${desafio}`);

  function registrar(estado) {
    if (estado === estadoAtual) return;
    estadoAtual = estado;
    for (const ouvinte of ouvintes.slice()) ouvinte(estado);
  }

  function aoMudar(ouvinte) {
    ouvintes.push(ouvinte);
    return () => {
      const lugar = ouvintes.indexOf(ouvinte);
      if (lugar >= 0) ouvintes.splice(lugar, 1);
    };
  }

  async function semCredencial(endereco) {
    const { PedidoAoAnki } = raiz;
    try {
      const resposta = await PedidoAoAnki.pedir(endereco, PedidoAoAnki.conferirOPareamento(crypto.randomUUID(), sortear()), { signal: AbortSignal.timeout(TEMPO_DO_CONFERIR_MS) });
      if (resposta.status === 404) return { estado: ESTADO.ANTIGA };
    } catch {}
    return { estado: ESTADO.A_PAREAR };
  }

  async function conferirDeVerdade(endereco) {
    const credencial = await lerACredencial();
    const { PedidoAoAnki } = raiz;
    if (!credencial) return semCredencial(endereco);
    const desafio = sortear();
    const resposta = await PedidoAoAnki.pedir(endereco, PedidoAoAnki.conferirOPareamento(credencial.cliente, desafio), { signal: AbortSignal.timeout(TEMPO_DO_CONFERIR_MS) });
    if (resposta.status === 404) return { estado: ESTADO.ANTIGA };
    const corpo = await resposta.json().catch(() => null);
    if (resposta.status === 401 && corpo?.error === 'pairing_revoked' && typeof corpo.prova === 'string' && await provaDaRevogacao(credencial.chave, desafio) === corpo.prova) {
      await esquecerACredencial(credencial.cliente);
      clientePendente = null;
      return { estado: ESTADO.A_PAREAR };
    }
    if (resposta.status === 401 && corpo?.error === 'pairing_required') return { estado: ESTADO.A_PAREAR };
    if (!resposta.ok || typeof corpo?.sessao !== 'string' || typeof corpo?.prova !== 'string') return { estado: ESTADO.NAO_CONFIRMADA };
    if (await provaDoServidor(credencial.chave, desafio, corpo.sessao) !== corpo.prova) return { estado: ESTADO.NAO_CONFIRMADA };
    return { estado: ESTADO.PAREADA, credencial, sessao: corpo.sessao };
  }

  async function provar(endereco) {
    const resultado = await conferirDeVerdade(endereco);
    registrar(resultado.estado);
    return resultado;
  }

  function marcarNaoConfirmada() {
    registrar(ESTADO.NAO_CONFIRMADA);
  }

  async function assinar({ credencial, sessao: daSessao }, { metodo, caminho, corpo }) {
    const nonce = sortear();
    return {
      nonce,
      cabecalhos: {
        [CABECALHO.cliente]: credencial.cliente,
        [CABECALHO.sessao]: daSessao,
        [CABECALHO.nonce]: nonce,
        [CABECALHO.assinatura]: await assinaturaDoPedido(credencial.chave, { sessao: daSessao, nonce, metodo, caminho, corpo }),
      },
    };
  }

  async function conferirARespostaDe({ credencial, sessao: daSessao }, { nonce, status, corpo, prova }) {
    if (typeof prova !== 'string') return false;
    return await provaDaResposta(credencial.chave, { sessao: daSessao, nonce, status, corpo }) === prova;
  }

  const resposta = (status, json) => new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  const BYTES_SEM_CORPO = [101, 204, 205, 304];
  const semProva = mensagem => Object.assign(new TypeError(mensagem), { semProva: true });

  let ultimaSaida = Promise.resolve();

  async function pedirAssinado(endereco, pedido, opcoes, enviar) {
    const corpoEmTexto = pedido.corpo === undefined ? undefined : JSON.stringify(pedido.corpo);
    const bytes = new TextEncoder().encode(corpoEmTexto ?? '');   // os mesmos bytes que o fetch envia desse texto
    const anterior = ultimaSaida;
    let liberar;
    ultimaSaida = new Promise(resolver => { liberar = resolver; });
    try {
      for (let vez = 0; ; vez += 1) {
        const prova = await provar(endereco);
        if (prova.estado === ESTADO.A_PAREAR) return resposta(401, { error: 'pairing_required' });
        if (prova.estado === ESTADO.ANTIGA) return resposta(404, { error: 'not_found' });
        if (prova.estado !== ESTADO.PAREADA) throw semProva('a Conexão não provou ter o segredo deste navegador');
        const { nonce, cabecalhos } = await assinar(prova, { metodo: pedido.metodo, caminho: pedido.caminho, corpo: bytes });
        await anterior;
        const saindo = enviar(endereco, pedido, corpoEmTexto, opcoes, cabecalhos);
        liberar();
        const recebida = await saindo;
        const lida = new Uint8Array(await recebida.arrayBuffer());
        const devolver = () => new Response(BYTES_SEM_CORPO.includes(recebida.status) || !lida.length ? null : lida, {
          status: recebida.status, statusText: recebida.statusText, headers: recebida.headers,
        });
        if (recebida.status === 401) {
          const erro = (() => { try { return JSON.parse(new TextDecoder().decode(lida))?.error; } catch { return undefined; } })();
          if (erro === 'session_expired' && vez === 0) continue;
          if (erro === 'pairing_required') marcarNaoConfirmada();
          return devolver();
        }
        if (!await conferirARespostaDe(prova, { nonce, status: recebida.status, corpo: lida, prova: recebida.headers.get(CABECALHO.prova) })) {
          marcarNaoConfirmada();
          throw semProva('a resposta da Conexão não trouxe a prova de quem tem o segredo deste navegador');
        }
        return devolver();
      }
    } finally {
      liberar();
    }
  }

  function nomeDoNavegador() {
    const marcas = (globalThis.navigator?.userAgentData?.brands || []).map(({ brand }) => brand).filter(brand => !/chromium|not.?a.?brand/i.test(brand));
    return (marcas[0] || 'Navegador').slice(0, 60);
  }

  async function enviar(endereco, pedido) {
    const { PedidoAoAnki } = raiz;
    try {
      const resposta = await PedidoAoAnki.pedir(endereco, pedido, { signal: AbortSignal.timeout(TEMPO_DO_PAREAMENTO_MS) });
      return { status: resposta.status, corpo: await resposta.json().catch(() => null) };
    } catch {
      return { rede: true };
    }
  }

  async function comecar(endereco) {
    const resposta = await enviar(endereco, raiz.PedidoAoAnki.comecarOPareamento());
    return resposta.status === 200 && resposta.corpo?.ok === true ? { ok: true } : { erro: 'falhou' };
  }

  async function concluir(endereco, codigo) {
    clientePendente = clientePendente || crypto.randomUUID();
    const cliente = clientePendente;
    const resposta = await enviar(endereco, raiz.PedidoAoAnki.concluirOPareamento(codigo, cliente, nomeDoNavegador()));
    if (resposta.rede) return { erro: 'falhou' };
    const { status, corpo } = resposta;
    if (status === 401 && corpo?.error === 'pairing_code_wrong' && Number.isInteger(corpo.restam)) return { erro: 'errado', restam: corpo.restam };
    if ((status === 410 && corpo?.error === 'pairing_code_expired') || (status === 409 && corpo?.error === 'pairing_code_used')) {
      clientePendente = null;
      return { erro: 'venceu' };
    }
    if (status !== 200 || corpo?.cliente !== cliente || typeof corpo?.segredo !== 'string') return { erro: 'falhou' };
    try {
      await guardarACredencial(cliente, corpo.segredo);
    } catch {
      return { erro: 'falhou' };
    }
    clientePendente = null;
    return { ok: true };
  }

  raiz.PareamentoComOAnki = Object.freeze({
    ESTADO, CABECALHO, estado: () => estadoAtual, aoMudar, provar, marcarNaoConfirmada,
    assinar, conferirARespostaDe, pedirAssinado, comecar, concluir, lerACredencial,
    contas: Object.freeze({ assinaturaDoPedido, provaDaResposta, provaDoServidor, provaDaRevogacao }),
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
