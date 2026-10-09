'use strict';

// A chave da OpenAI da pessoa: onde ela mora na extensão e como chega à Conexão
// com o Anki. Quem a usa é o card da IA (painel-ia.js), em Configurações e na
// Boas-vindas; nenhuma outra página a toca.
//
// A chave fica em quatro lugares com papéis diferentes:
//
//   IndexedDB da extensão  `pm-segredos` › `chaves` › `openai`: a chave inteira; `openai-em`: a hora da última
//     mudança (colar, trocar, apagar), que decide qual chave vale entre os computadores da conta; e
//     `openai-apagar-na-conexao`, enquanto a cópia da Conexão ainda tem uma chave que foi apagada aqui.
//     O armazenamento da extensão que o content script e o overlay não alcançam:
//     eles rodam na página, e o IndexedDB que a página abre é o do site, nunca o
//     da extensão. O `chrome.storage.local` não serve, porque o content script o
//     lê (os atalhos moram nele) e `setAccessLevel` fecharia a área toda para ele.
//   `pm_chave_openai`      `{ ultimos4 }` no `chrome.storage.local`: só os 4 últimos
//     caracteres, o que a Conexão também devolve. É o que as telas leem (o resumo,
//     o passo da Boas-vindas, o lembrete) sem nunca tocar na chave.
//   a Conexão com o Anki   uma cópia própria, para o Envio funcionar com o Chrome
//     fechado. A extensão não fala com a OpenAI (não tem a permissão de host): quem
//     confere a chave é a Conexão, que responde só um código e os 4 últimos caracteres.
//   a nuvem da conta       com conta, a chave acompanha a conta Google (#154): `cofre` é o lado
//     deste computador que `Sincronizacao.criarSincronizacaoDaChave` junta com a nuvem (o painel.js
//     liga os dois). Quem tem a conta é o painel; daqui a chave não vai à rede além da Conexão.
//
// `confirmar(chave)` é o único caminho para guardar: a Conexão confere, depois a
// chave entra no IndexedDB e só então os 4 últimos entram no `chrome.storage.local`.
// Uma chave recusada não muda nada do que já estava guardado. `apagar()` (Apagar chave, Apagar
// tudo) tira a chave daqui e a cópia da Conexão, e guarda a hora: é o tombstone que a nuvem leva aos
// outros computadores. A cópia da Conexão acompanha o que a extensão guarda por `conferirACopia`,
// chamada quando a Conexão volta a responder e quando a chave muda.
//
// A chave inteira nunca vai a um log, a uma mensagem de erro nem à tela.
//
// O que a Conexão responde (complemento/contrato/exemplos.json) vira um `motivo`:
//   recusada · sem_credito · organizacao_nao_verificada · openai_fora_do_ar
//   sem_conexao (nada respondeu) · conexao_com_erro (respondeu algo fora do contrato)

(function (raiz) {
  const MARCA = 'pm_chave_openai';
  const BANCO = 'pm-segredos';
  const LOJA = 'chaves';
  const ITEM = 'openai';
  const HORA = 'openai-em';
  const APAGAR_NA_CONEXAO = 'openai-apagar-na-conexao';
  /** A Conexão confere a chave com dois pedidos à OpenAI, de até 15 s cada. */
  const TEMPO_DA_CONFERENCIA = 40000;
  const TEMPO_DO_ESTADO = 5000;

  const MOTIVO_DO_ERRO = Object.freeze({
    openai_key_rejected: 'recusada',
    openai_no_credit: 'sem_credito',
    openai_org_not_verified: 'organizacao_nao_verificada',
    openai_unreachable: 'openai_fora_do_ar',
  });

  // ─── A chave inteira, no IndexedDB da extensão ─────────────────────────────

  function abrirOBanco() {
    return new Promise((resolver, rejeitar) => {
      const pedido = indexedDB.open(BANCO, 1);
      pedido.onupgradeneeded = () => pedido.result.createObjectStore(LOJA);
      pedido.onsuccess = () => resolver(pedido.result);
      pedido.onerror = () => rejeitar(pedido.error);
    });
  }

  async function naLoja(modo, fazer) {
    const banco = await abrirOBanco();
    try {
      return await new Promise((resolver, rejeitar) => {
        const transacao = banco.transaction(LOJA, modo);
        const pedido = fazer(transacao.objectStore(LOJA));
        transacao.oncomplete = () => resolver(pedido.result);
        transacao.onerror = () => rejeitar(transacao.error);
        transacao.onabort = () => rejeitar(transacao.error);
      });
    } finally {
      banco.close();
    }
  }

  /** A chave inteira, ou '' sem chave. Só para entregá-la à Conexão e à nuvem da conta: nunca para a tela. */
  async function lerAChave() {
    return (await naLoja('readonly', loja => loja.get(ITEM))) || '';
  }

  const lerItem = item => naLoja('readonly', loja => loja.get(item));

  /** Grava (ou, com `undefined`, apaga) os itens de uma vez, numa transação só. */
  function gravarItens(itens) {
    return naLoja('readwrite', loja => {
      let ultimo;
      for (const [item, valor] of Object.entries(itens)) {
        ultimo = valor === undefined ? loja.delete(item) : loja.put(valor, item);
      }
      return ultimo;
    });
  }

  // ─── A Conexão ─────────────────────────────────────────────────────────────

  /** Envia um pedido de `PedidoAoAnki` à Conexão: `{ status, json }`, ou `null` se nada respondeu. */
  async function pedirAConexao(pedido, tempo) {
    try {
      const resposta = await raiz.PedidoAoAnki.pedir(raiz.ConexaoAnki.ENDERECO, pedido, { signal: AbortSignal.timeout(tempo) });
      let json = null;
      try { json = await resposta.json(); } catch { /* o corpo não é JSON */ }
      return { status: resposta.status, json };
    } catch {
      return null;
    }
  }

  /**
   * Entrega a chave à Conexão, que a confere na OpenAI e guarda a cópia dela.
   * `{ ok: true, ultimos4 }` ou `{ ok: false, motivo, detalhes }`, com o `detalhes` para o Detalhes recolhido.
   */
  async function entregarAConexao(chave) {
    const resposta = await pedirAConexao(raiz.PedidoAoAnki.chaveDaOpenAI(chave), TEMPO_DA_CONFERENCIA);
    if (!resposta) return { ok: false, motivo: 'sem_conexao', detalhes: `sem resposta · ${raiz.ConexaoAnki.ENDERECO}` };
    const { status, json } = resposta;
    if (status === 200 && json?.ok === true && typeof json.ultimos4 === 'string') {
      return { ok: true, ultimos4: json.ultimos4 };
    }
    const motivo = MOTIVO_DO_ERRO[json?.error] || 'conexao_com_erro';
    return { ok: false, motivo, detalhes: `HTTP ${status} · ${json?.error || 'sem corpo'}` };
  }

  /** Tira a cópia da chave da Conexão. `true` quando ela confirmou, `false` sem resposta que sirva. */
  async function apagarNaConexao() {
    const resposta = await pedirAConexao(raiz.PedidoAoAnki.apagarChaveDaOpenAI(), TEMPO_DO_ESTADO);
    return resposta?.status === 200 && resposta.json?.ok === true;
  }

  /** O que a Conexão guarda: `{ configurada, ultimos4? }`, ou `null` se nada respondeu. */
  async function estadoNaConexao() {
    const resposta = await pedirAConexao(raiz.PedidoAoAnki.estadoDaIA(), TEMPO_DO_ESTADO);
    const openai = resposta?.status === 200 ? resposta.json?.openai : null;
    return openai && typeof openai.configurada === 'boolean' ? openai : null;
  }

  // ─── O que a tela guarda ───────────────────────────────────────────────────

  /** Os 4 últimos caracteres da chave guardada, ou '' sem chave. */
  async function lerOsUltimos4() {
    const guardado = await chrome.storage.local.get({ [MARCA]: null });
    return guardado[MARCA]?.ultimos4 || '';
  }

  /**
   * Confere a chave na Conexão e, aceita, guarda: a chave no IndexedDB e os 4 últimos no storage.
   * Devolve o resultado de `entregarAConexao`. Recusada, nada do que já estava guardado muda.
   */
  async function confirmar(chave) {
    const resultado = await entregarAConexao(chave);
    if (!resultado.ok) return resultado;
    await gravarItens({ [ITEM]: chave, [HORA]: Date.now(), [APAGAR_NA_CONEXAO]: undefined });
    await chrome.storage.local.set({ [MARCA]: { ultimos4: resultado.ultimos4 } });
    avisarQueMudou();
    return resultado;
  }

  /**
   * Apagar chave e Apagar tudo: a chave sai daqui e a hora fica (o tombstone que a nuvem leva). A cópia da
   * Conexão sai agora, se ela responder, ou quando ela voltar (`conferirACopia`). `mesmoSemChave` marca o
   * apagamento sem chave guardada aqui: com conta, Apagar tudo apaga também a chave que só a nuvem tem.
   */
  async function apagar({ mesmoSemChave = false } = {}) {
    if (!mesmoSemChave && !(await lerOsUltimos4())) return;
    await apagarAqui(Date.now());
    avisarQueMudou();
    await conferirACopia();
  }

  async function apagarAqui(em) {
    await gravarItens({ [ITEM]: undefined, [HORA]: em, [APAGAR_NA_CONEXAO]: true });
    await chrome.storage.local.remove(MARCA);
  }

  /** Quem quer saber quando a chave muda neste computador (o painel.js, que a leva à nuvem da conta). */
  const ouvintes = new Set();
  const aoMudar = fn => ouvintes.add(fn);
  const avisarQueMudou = () => ouvintes.forEach(fn => fn());

  /**
   * O lado deste computador da chave que acompanha a conta (`Sincronizacao.criarSincronizacaoDaChave`).
   * `ler()` → `{ chave, em }`; `aplicar({ chave, em })` guarda a chave que chegou de outro computador (ela já
   * foi conferida lá) ou, com chave '', a apaga. A Conexão recebe a cópia (ou a perde) por `conferirACopia`,
   * que o card da IA chama quando `pm_chave_openai` muda (painel-ia.js, sempre montado no painel).
   */
  const cofre = {
    async ler() {
      return { chave: await lerAChave(), em: Number(await lerItem(HORA)) || 0 };
    },
    async aplicar({ chave, em }) {
      if (!chave) {
        await apagarAqui(em);
      } else {
        await gravarItens({ [ITEM]: chave, [HORA]: em, [APAGAR_NA_CONEXAO]: undefined });
        await chrome.storage.local.set({ [MARCA]: { ultimos4: chave.slice(-4) } });
      }
    },
  };

  /**
   * Depois de a Conexão voltar, ou de a chave mudar: se ela não tem a cópia da chave que a extensão guarda (ou tem outra),
   * entrega de novo. Devolve `true` com a cópia no lugar, `false` sem ela, `null` se a Conexão não respondeu
   * ou se não há chave guardada para entregar. Sem chave aqui, tira a cópia de uma chave apagada aqui.
   */
  async function conferirACopia() {
    const ultimos4 = await lerOsUltimos4();
    if (!ultimos4) {
      // Apagada aqui com a Conexão desligada: a cópia dela sai agora, uma vez só.
      if (await lerItem(APAGAR_NA_CONEXAO) && await apagarNaConexao()) await gravarItens({ [APAGAR_NA_CONEXAO]: undefined });
      return null;
    }
    const naConexao = await estadoNaConexao();
    if (!naConexao) return null;
    if (naConexao.configurada && naConexao.ultimos4 === ultimos4) return true;
    const chave = await lerAChave();
    if (!chave) return false;
    return (await entregarAConexao(chave)).ok;
  }

  raiz.ChaveDaOpenAI = { MARCA, confirmar, apagar, conferirACopia, aoMudar, cofre };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
