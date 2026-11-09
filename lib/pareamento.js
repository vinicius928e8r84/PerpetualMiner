'use strict';

// O pareamento deste navegador com a Conexão com o Anki (#192): a credencial, a prova de que quem responde na porta é a Conexão
// e a assinatura de cada pedido. O desenho está em docs/design/pareamento-da-conexao.md; o lado do complemento, em complemento/pareamento.py.
//
//   credencial  `{ cliente, chave }` em IndexedDB `pm-pareamento` › `conexao`: `chave` é uma CryptoKey HMAC **não extraível**, então nem o
//               código desta extensão lê os bytes do segredo depois de guardado. Fora de `chrome.storage.local`, que o content script lê;
//               fora de log, URL e pacote de diagnóstico. (Não é `pm-segredos`: a migração da chave da OpenAI apaga esse banco.)
//   sessão      a da subida da Conexão, provada pelo `conferir`: a Conexão responde `HMAC(segredo, desafio ‖ sessão)` ao desafio que esta
//               página sorteou; um impostor na porta não tem o segredo e não prova. Fica só na memória da página (ou do service worker).
//   pedido      `PedidoAoAnki.pedir` assina cada pedido privado com a sessão e um nonce novo (`assinar`) e confere a prova da resposta
//               (`conferirARespostaDe`) antes de devolvê-la a quem chamou. Uma resposta sem prova válida é "não confirmada", nunca dado.
//
// Estados (`ESTADO`), o que a tela diz de cada um (painel-pareamento.js):
//   pareada         a credencial existe e a Conexão provou ter o segredo nesta subida
//   a_parear        sem credencial, ou a Conexão não conhece este navegador (a pessoa a desconectou no Anki)
//   nao_confirmada  a porta respondeu a saúde, mas sem a prova de quem tem o segredo (impostor, Conexão de outro usuário do sistema)
//   antiga          a Conexão não tem o pareamento (404): nada privado é enviado a ela
//
// A extensão **não** apaga a credencial por um 401 sem prova (um impostor não pode desparear ninguém): só um pareamento novo a substitui.
// O contrato dos três pedidos do pareamento (`comecar`, `concluir`, `conferir`) é complemento/contrato/exemplos-do-pareamento.json.
//
// Carregado depois de lib/pedido-ao-anki.js, pelo service worker e pelas páginas que falam com a Conexão.

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
  /** Quanto tempo uma sessão provada vale sem um `conferir` novo (o pedido que leva dado da pessoa pede um novo sempre). */
  const VALIDADE_DA_SESSAO_MS = 20 * 1000;
  const TEMPO_DO_CONFERIR_MS = 3000;
  const TEMPO_DO_PAREAMENTO_MS = 8000;

  let estadoAtual = null;          // o último estado visto por esta página (ESTADO) ou null
  const ouvintes = [];
  let sessao = null;               // { valor, cliente, em }
  let conferindo = null;           // o `conferir` em andamento
  let clientePendente = null;      // o navegador que está para ser pareado: o mesmo até dar certo, para o `concluir` repetido valer

  // --- a credencial -------------------------------------------------------------------------------------------------------------

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

  /** A credencial deste navegador (`{ cliente, chave }`) ou null. Lida a cada uso: outra página pode ter pareado. */
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

  /** Guarda a credencial: o segredo entra como CryptoKey HMAC não extraível e os bytes dele não ficam em lugar nenhum. */
  async function guardarACredencial(cliente, segredoEmBase64) {
    const bytes = dosBytes(segredoEmBase64);
    if (bytes.length !== 32) throw new Error('o segredo do pareamento não tem 32 bytes');
    const chave = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    await noBanco('readwrite', loja => loja.put({ cliente, chave }, REGISTRO));
    sessao = null;
    return { cliente, chave };
  }

  // --- as contas ----------------------------------------------------------------------------------------------------------------

  async function hmac(chave, texto) {
    return emBase64(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(texto)));
  }

  async function sha256Hex(bytes) {
    const resumo = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(resumo, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  const sortear = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');

  /** A assinatura de um pedido (os mesmos campos de complemento/pareamento.py › `assinatura_do_pedido`); `corpo` são os bytes enviados. */
  async function assinaturaDoPedido(chave, { sessao: daSessao, nonce, metodo, caminho, corpo }) {
    return hmac(chave, `pm1\npedido\n${daSessao}\n${nonce}\n${metodo}\n${caminho}\n${await sha256Hex(corpo)}`);
  }

  const provaDaResposta = async (chave, { sessao: daSessao, nonce, status, corpo }) =>
    hmac(chave, `pm1\nresposta\n${daSessao}\n${nonce}\n${status}\n${await sha256Hex(corpo)}`);

  const provaDoServidor = (chave, desafio, daSessao) => hmac(chave, `pm1\nservidor\n${desafio}\n${daSessao}`);

  // --- o estado -----------------------------------------------------------------------------------------------------------------

  function registrar(estado) {
    if (estado === estadoAtual) return;
    estadoAtual = estado;
    for (const ouvinte of ouvintes.slice()) ouvinte(estado);
  }

  /** `ouvinte(estado)` a cada mudança do que esta página sabe do pareamento. Devolve a função que o tira. */
  function aoMudar(ouvinte) {
    ouvintes.push(ouvinte);
    return () => {
      const lugar = ouvintes.indexOf(ouvinte);
      if (lugar >= 0) ouvintes.splice(lugar, 1);
    };
  }

  // --- a prova da Conexão --------------------------------------------------------------------------------------------------------

  async function conferirDeVerdade(endereco) {
    const credencial = await lerACredencial();
    if (!credencial) return { estado: ESTADO.A_PAREAR };
    const { PedidoAoAnki } = raiz;
    const desafio = sortear();
    const resposta = await PedidoAoAnki.pedir(endereco, PedidoAoAnki.conferirOPareamento(credencial.cliente, desafio), { signal: AbortSignal.timeout(TEMPO_DO_CONFERIR_MS) });
    if (resposta.status === 404) return { estado: ESTADO.ANTIGA };
    const corpo = await resposta.json().catch(() => null);
    if (resposta.status === 401 && corpo?.error === 'pairing_required') return { estado: ESTADO.A_PAREAR };
    if (!resposta.ok || typeof corpo?.sessao !== 'string' || typeof corpo?.prova !== 'string') return { estado: ESTADO.NAO_CONFIRMADA };
    if (await provaDoServidor(credencial.chave, desafio, corpo.sessao) !== corpo.prova) return { estado: ESTADO.NAO_CONFIRMADA };
    sessao = { valor: corpo.sessao, cliente: credencial.cliente, em: Date.now() };
    return { estado: ESTADO.PAREADA, credencial, sessao: sessao.valor };
  }

  /**
   * Prova que quem responde em `endereco` é a Conexão deste navegador, e devolve `{ estado, credencial?, sessao? }`. Sem `fresco`, uma sessão
   * provada há menos de VALIDADE_DA_SESSAO_MS vale; com `fresco`, o `conferir` é feito de novo (o pedido que leva a chave, o token ou as Frases).
   * Levanta o erro da rede se o `conferir` não chega; o estado visto fica registrado (`aoMudar`).
   */
  async function provar(endereco, { fresco = false } = {}) {
    if (!fresco && sessao && Date.now() - sessao.em < VALIDADE_DA_SESSAO_MS) {
      const credencial = await lerACredencial();
      if (credencial?.cliente === sessao.cliente) return { estado: ESTADO.PAREADA, credencial, sessao: sessao.valor };
    }
    if (!conferindo) {
      conferindo = conferirDeVerdade(endereco).finally(() => { conferindo = null; });
    }
    const resultado = await conferindo;
    registrar(resultado.estado);
    return resultado;
  }

  /** A sessão deixou de valer na Conexão (ela subiu de novo): o próximo pedido refaz o `conferir`. */
  function esquecerASessao() {
    sessao = null;
  }

  /** Uma resposta sem a prova de quem tem o segredo: a porta responde, mas não é a Conexão deste navegador. */
  function marcarNaoConfirmada() {
    sessao = null;
    registrar(ESTADO.NAO_CONFIRMADA);
  }

  /** A Conexão disse que não conhece este navegador (sem prova: só a tela muda, a credencial fica). */
  function marcarAParear() {
    sessao = null;
    registrar(ESTADO.A_PAREAR);
  }

  // --- o pedido -----------------------------------------------------------------------------------------------------------------

  /** Os cabeçalhos que assinam um pedido: o navegador, a sessão provada, um nonce novo e a assinatura. `corpo` são os bytes que seguem. */
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

  /** A resposta traz a prova de quem tem o segredo, para este pedido (o nonce), este status e este corpo? */
  async function conferirARespostaDe({ credencial, sessao: daSessao }, { nonce, status, corpo, prova }) {
    if (typeof prova !== 'string') return false;
    return await provaDaResposta(credencial.chave, { sessao: daSessao, nonce, status, corpo }) === prova;
  }

  // --- o pedido privado ----------------------------------------------------------------------------------------------------------

  const resposta = (status, json) => new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  const BYTES_SEM_CORPO = [101, 204, 205, 304];

  // Os pedidos assinados saem na ordem em que foram pedidos: o `conferir` e a assinatura são assíncronos e dois pedidos seguidos (o áudio da pergunta e o da
  // próxima, no quiz) chegariam à Conexão na ordem em que as contas terminam, não na em que foram feitos.
  let ultimaSaida = Promise.resolve();

  /**
   * O pedido privado de `PedidoAoAnki.pedir`: prova a Conexão, assina, envia (`enviar(endereco, pedido, corpoEmTexto, opcoes, cabecalhos)`) e confere a prova
   * da resposta. Sem navegador pareado nada sai (401 `pairing_required` na hora); uma Conexão sem o pareamento (404 no `conferir`) recebe um 404 na hora, que as
   * telas leem como “atualize a Conexão” (salvo o pedido de a atualizar: `daConexaoAntiga`); uma resposta sem a prova de quem tem o segredo levanta um erro (não é dado) e a tela passa a dizer “não confirmada”.
   * Uma sessão velha (a Conexão subiu de novo) refaz o `conferir` uma vez.
   */
  async function pedirAssinado(endereco, pedido, opcoes, enviar) {
    const corpoEmTexto = pedido.corpo === undefined ? undefined : JSON.stringify(pedido.corpo);
    const bytes = new TextEncoder().encode(corpoEmTexto ?? '');   // os mesmos bytes que o fetch envia desse texto
    const anterior = ultimaSaida;
    let liberar;
    ultimaSaida = new Promise(resolver => { liberar = resolver; });
    try {
      for (let vez = 0; ; vez += 1) {
        const prova = await provar(endereco, { fresco: pedido.comSegredo === true });
        if (prova.estado === ESTADO.A_PAREAR) return resposta(401, { error: 'pairing_required' });
        if (prova.estado === ESTADO.ANTIGA) {
          // O único pedido que sai para a Conexão de antes do pareamento é o que a tira dela (Atualizar agora, Reiniciar o Anki; corpo `{}`, sem dado da pessoa), sem assinatura nem prova.
          return pedido.daConexaoAntiga ? enviar(endereco, pedido, corpoEmTexto, opcoes) : resposta(404, { error: 'not_found' });
        }
        if (prova.estado !== ESTADO.PAREADA) throw new TypeError('a Conexão não provou ter o segredo deste navegador');
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
          // A recusa do porteiro não leva prova (ninguém provou nada): é só texto, e a credencial não muda por ela.
          const erro = (() => { try { return JSON.parse(new TextDecoder().decode(lida))?.error; } catch { return undefined; } })();
          if (erro === 'session_expired' && vez === 0) {
            esquecerASessao();
            continue;
          }
          if (erro === 'pairing_required') marcarAParear();
          return devolver();
        }
        if (!await conferirARespostaDe(prova, { nonce, status: recebida.status, corpo: lida, prova: recebida.headers.get(CABECALHO.prova) })) {
          marcarNaoConfirmada();
          throw new TypeError('a resposta da Conexão não trouxe a prova de quem tem o segredo deste navegador');
        }
        return devolver();
      }
    } finally {
      liberar();
    }
  }

  // --- parear ---------------------------------------------------------------------------------------------------------------------

  /** O nome do navegador, só para a pessoa reconhecer o que está conectado: “Chrome”, “Opera”… */
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

  /** O botão Conectar: o Anki mostra o código. `{ ok: true }` ou `{ erro: 'falhou' }` (sem janela do Anki, sem resposta, ou uma resposta fora do contrato). */
  async function comecar(endereco) {
    const resposta = await enviar(endereco, raiz.PedidoAoAnki.comecarOPareamento());
    return resposta.status === 200 && resposta.corpo?.ok === true ? { ok: true } : { erro: 'falhou' };
  }

  /**
   * O botão Confirmar: o código que a pessoa digitou. Certo: a credencial é guardada (o segredo nasce na Conexão e chega só aqui) e a Conexão é
   * conferida com ela. Devolve `{ ok: true }`, `{ erro: 'errado', restam }`, `{ erro: 'venceu' }` ou `{ erro: 'falhou' }`.
   */
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
    ESTADO, CABECALHO, estado: () => estadoAtual, aoMudar, provar, esquecerASessao, marcarNaoConfirmada, marcarAParear,
    assinar, conferirARespostaDe, pedirAssinado, comecar, concluir, lerACredencial,
    /** As contas puras, para a prova de interoperabilidade com o complemento (`node test_pareamento_do_anki.js`). */
    contas: Object.freeze({ assinaturaDoPedido, provaDaResposta, provaDoServidor }),
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
