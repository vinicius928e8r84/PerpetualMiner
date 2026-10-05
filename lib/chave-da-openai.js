'use strict';

// A chave da OpenAI da pessoa: onde ela mora na extensão e como chega à Conexão
// com o Anki. Quem a usa é o card da IA (painel-ia.js), em Configurações e na
// Boas-vindas; nenhuma outra página a toca.
//
// A chave fica em três lugares com papéis diferentes:
//
//   IndexedDB da extensão  `pm-segredos` › `chaves` › `openai`: a chave inteira.
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
//
// `confirmar(chave)` é o único caminho para guardar: a Conexão confere, depois a
// chave entra no IndexedDB e só então os 4 últimos entram no `chrome.storage.local`.
// Uma chave recusada não muda nada do que já estava guardado.
//
// O que a Conexão responde (complemento/contrato/exemplos.json) vira um `motivo`:
//   recusada · sem_credito · organizacao_nao_verificada · openai_fora_do_ar
//   sem_conexao (nada respondeu) · conexao_com_erro (respondeu algo fora do contrato)

(function (raiz) {
  const MARCA = 'pm_chave_openai';
  const BANCO = 'pm-segredos';
  const LOJA = 'chaves';
  const ITEM = 'openai';
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

  /** A chave inteira, ou '' sem chave. Só para entregá-la à Conexão: nunca para a tela. */
  async function lerAChave() {
    return (await naLoja('readonly', loja => loja.get(ITEM))) || '';
  }

  function gravarAChave(chave) {
    return naLoja('readwrite', loja => loja.put(chave, ITEM));
  }

  // ─── A Conexão ─────────────────────────────────────────────────────────────

  /** POST num caminho da Conexão: `{ status, json }`, ou `null` se nada respondeu. */
  async function pedirAConexao(caminho, corpo, tempo) {
    try {
      const resposta = await fetch(`${raiz.ConexaoAnki.ENDERECO}${caminho}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(tempo),
      });
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
    const resposta = await pedirAConexao('/ia/openai/chave', { chave }, TEMPO_DA_CONFERENCIA);
    if (!resposta) return { ok: false, motivo: 'sem_conexao', detalhes: 'Sem resposta de 127.0.0.1:8766' };
    const { status, json } = resposta;
    if (status === 200 && json?.ok === true && typeof json.ultimos4 === 'string') {
      return { ok: true, ultimos4: json.ultimos4 };
    }
    const motivo = MOTIVO_DO_ERRO[json?.error] || 'conexao_com_erro';
    return { ok: false, motivo, detalhes: `HTTP ${status} · ${json?.error || 'sem corpo'}` };
  }

  /** O que a Conexão guarda: `{ configurada, ultimos4? }`, ou `null` se nada respondeu. */
  async function estadoNaConexao() {
    const resposta = await pedirAConexao('/ia/estado', {}, TEMPO_DO_ESTADO);
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
    await gravarAChave(chave);
    await chrome.storage.local.set({ [MARCA]: { ultimos4: resultado.ultimos4 } });
    return resultado;
  }

  /**
   * Depois de a Conexão voltar: se ela não tem a cópia da chave que a extensão guarda (ou tem outra),
   * entrega de novo. Devolve `true` com a cópia no lugar, `false` sem ela, `null` se a Conexão não respondeu
   * ou se não há chave guardada para entregar.
   */
  async function conferirACopia() {
    const ultimos4 = await lerOsUltimos4();
    if (!ultimos4) return null;
    const naConexao = await estadoNaConexao();
    if (!naConexao) return null;
    if (naConexao.configurada && naConexao.ultimos4 === ultimos4) return true;
    const chave = await lerAChave();
    if (!chave) return false;
    return (await entregarAConexao(chave)).ok;
  }

  raiz.ChaveDaOpenAI = { MARCA, confirmar, conferirACopia };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
