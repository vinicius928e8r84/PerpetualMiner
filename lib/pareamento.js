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

  const credencialCompleta = guardada => typeof guardada?.cliente === 'string' && Boolean(guardada.chave);

  async function lerACredencial() {
    const guardada = await noBanco('readonly', loja => loja.get(REGISTRO));
    return credencialCompleta(guardada) ? guardada : null;
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

  function conferir(endereco, cliente, desafio) {
    const { PedidoAoAnki } = raiz;
    return PedidoAoAnki.enviarSemAssinatura(endereco, PedidoAoAnki.conferirOPareamento(cliente, desafio), { signal: AbortSignal.timeout(TEMPO_DO_CONFERIR_MS) });
  }

  async function semCredencial(endereco) {
    try {
      const resposta = await conferir(endereco, crypto.randomUUID(), sortear());
      if (resposta.status === 404) return { estado: ESTADO.ANTIGA };
    } catch {}
    return { estado: ESTADO.A_PAREAR };
  }

  const recusou = ({ status, corpo }, erro) => status === 401 && corpo?.error === erro;

  async function revogacaoProvada({ credencial, desafio, resposta }) {
    if (!recusou(resposta, 'pairing_revoked') || typeof resposta.corpo.prova !== 'string') return false;
    return await provaDaRevogacao(credencial.chave, desafio) === resposta.corpo.prova;
  }

  const sessaoComProva = corpo => typeof corpo?.sessao === 'string' && typeof corpo.prova === 'string';

  async function servidorProvou({ credencial, desafio, resposta }) {
    if (!resposta.ok || !sessaoComProva(resposta.corpo)) return false;
    return await provaDoServidor(credencial.chave, desafio, resposta.corpo.sessao) === resposta.corpo.prova;
  }

  async function desfechoDaConferencia(conferencia) {
    if (await revogacaoProvada(conferencia)) {
      await esquecerACredencial(conferencia.credencial.cliente);
      clientePendente = null;
      return { estado: ESTADO.A_PAREAR };
    }
    if (recusou(conferencia.resposta, 'pairing_required')) return { estado: ESTADO.A_PAREAR };
    if (!await servidorProvou(conferencia)) return { estado: ESTADO.NAO_CONFIRMADA };
    return { estado: ESTADO.PAREADA, credencial: conferencia.credencial, sessao: conferencia.resposta.corpo.sessao };
  }

  async function conferirDeVerdade(endereco) {
    const credencial = await lerACredencial();
    if (!credencial) return semCredencial(endereco);
    const desafio = sortear();
    const recebida = await conferir(endereco, credencial.cliente, desafio);
    if (recebida.status === 404) return { estado: ESTADO.ANTIGA };
    const resposta = { status: recebida.status, ok: recebida.ok, corpo: await recebida.json().catch(() => null) };
    return desfechoDaConferencia({ credencial, desafio, resposta });
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

  const semProva = mensagem => Object.assign(new TypeError(mensagem), { semProva: true });

  let ultimaSaida = Promise.resolve();

  function entrarNaFilaDeSaida() {
    const anterior = ultimaSaida;
    let liberar;
    ultimaSaida = new Promise(resolver => { liberar = resolver; });
    return { anterior, liberar };
  }

  function corpoQueSai(pedido) {
    const texto = pedido.corpo === undefined ? undefined : JSON.stringify(pedido.corpo);
    return { texto, bytesQueOFetchEnvia: new TextEncoder().encode(texto ?? '') };
  }

  const ESTADOS_QUE_NAO_DEIXAM_PEDIR = Object.freeze([ESTADO.A_PAREAR, ESTADO.ANTIGA]);

  async function lerAVolta(recebida) {
    const lida = new Uint8Array(await recebida.arrayBuffer());
    return { recebida, lida, devolvida: { status: recebida.status, texto: new TextDecoder().decode(lida) } };
  }

  function erroDaRecusa(devolvida) {
    try {
      return JSON.parse(devolvida.texto)?.error;
    } catch {
      return undefined;
    }
  }

  const sessaoVencida = ({ devolvida }) => devolvida.status === 401 && erroDaRecusa(devolvida) === 'session_expired';

  function devolvidaRecusada(devolvida) {
    if (erroDaRecusa(devolvida) === 'pairing_required') marcarNaoConfirmada();
    return devolvida;
  }

  async function desfechoDaVolta(prova, nonce, { recebida, lida, devolvida }) {
    if (recebida.status === 401) return devolvidaRecusada(devolvida);
    if (!await conferirARespostaDe(prova, { nonce, status: recebida.status, corpo: lida, prova: recebida.headers.get(CABECALHO.prova) })) {
      marcarNaoConfirmada();
      throw semProva('a resposta da Conexão não trouxe a prova de quem tem o segredo deste navegador');
    }
    return devolvida;
  }

  async function pedirAssinado(endereco, pedido, opcoes, enviar) {
    const corpo = corpoQueSai(pedido);
    const fila = entrarNaFilaDeSaida();
    try {
      for (let vez = 0; ; vez += 1) {
        const prova = await provar(endereco);
        if (ESTADOS_QUE_NAO_DEIXAM_PEDIR.includes(prova.estado)) return { pareamento: prova.estado };
        if (prova.estado !== ESTADO.PAREADA) throw semProva('a Conexão não provou ter o segredo deste navegador');
        const { nonce, cabecalhos } = await assinar(prova, { metodo: pedido.metodo, caminho: pedido.caminho, corpo: corpo.bytesQueOFetchEnvia });
        await fila.anterior;
        const saindo = enviar(endereco, pedido, corpo.texto, opcoes, cabecalhos);
        fila.liberar();
        const volta = await lerAVolta(await saindo);
        if (sessaoVencida(volta) && vez === 0) continue;
        return desfechoDaVolta(prova, nonce, volta);
      }
    } finally {
      fila.liberar();
    }
  }

  function nomeDoNavegador() {
    const marcas = (globalThis.navigator?.userAgentData?.brands || []).map(({ brand }) => brand).filter(brand => !/chromium|not.?a.?brand/i.test(brand));
    return (marcas[0] || 'Navegador').slice(0, 60);
  }

  async function enviar(endereco, pedido) {
    const { PedidoAoAnki } = raiz;
    try {
      const resposta = await PedidoAoAnki.enviarSemAssinatura(endereco, pedido, { signal: AbortSignal.timeout(TEMPO_DO_PAREAMENTO_MS) });
      return { status: resposta.status, corpo: await resposta.json().catch(() => null) };
    } catch {
      return { rede: true };
    }
  }

  async function comecar(endereco) {
    const resposta = await enviar(endereco, raiz.PedidoAoAnki.comecarOPareamento());
    return resposta.status === 200 && resposta.corpo?.ok === true ? { ok: true } : { erro: 'falhou' };
  }

  function clienteAParear() {
    clientePendente = clientePendente || crypto.randomUUID();
    return clientePendente;
  }

  const codigoErrado = resposta => recusou(resposta, 'pairing_code_wrong') && Number.isInteger(resposta.corpo.restam);

  const ERRO_DO_CODIGO_VENCIDO = Object.freeze({ 409: 'pairing_code_used', 410: 'pairing_code_expired' });
  const codigoVencido = ({ status, corpo }) => Object.hasOwn(ERRO_DO_CODIGO_VENCIDO, status) && corpo?.error === ERRO_DO_CODIGO_VENCIDO[status];

  function segredoDoCliente({ status, corpo }, cliente) {
    if (status !== 200 || corpo?.cliente !== cliente) return false;
    return typeof corpo.segredo === 'string';
  }

  async function guardarOPareamento(cliente, segredo) {
    try {
      await guardarACredencial(cliente, segredo);
    } catch {
      return { erro: 'falhou' };
    }
    clientePendente = null;
    return { ok: true };
  }

  async function concluir(endereco, codigo) {
    const cliente = clienteAParear();
    const resposta = await enviar(endereco, raiz.PedidoAoAnki.concluirOPareamento(codigo, cliente, nomeDoNavegador()));
    if (resposta.rede) return { erro: 'falhou' };
    if (codigoErrado(resposta)) return { erro: 'errado', restam: resposta.corpo.restam };
    if (codigoVencido(resposta)) {
      clientePendente = null;
      return { erro: 'venceu' };
    }
    if (!segredoDoCliente(resposta, cliente)) return { erro: 'falhou' };
    return guardarOPareamento(cliente, resposta.corpo.segredo);
  }

  raiz.PareamentoComOAnki = Object.freeze({
    ESTADO, CABECALHO, estado: () => estadoAtual, aoMudar, provar, marcarNaoConfirmada,
    assinar, conferirARespostaDe, pedirAssinado, comecar, concluir, lerACredencial,
    contas: Object.freeze({ assinaturaDoPedido, provaDaResposta, provaDoServidor, provaDaRevogacao }),
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
