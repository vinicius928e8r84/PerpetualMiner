'use strict';

// A chave da OpenAI da pessoa: onde ela mora na extensão e como chega à Conexão
// com o Anki. Quem a usa é o card da IA (painel-ia.js), em Configurações e na
// Boas-vindas; nenhuma outra página a toca.
//
// A chave fica em quatro lugares com papéis diferentes:
//
//   IndexedDB da extensão  `pm-segredos` › `chaves` › `openai`: a chave inteira; `openai-em`: a hora da última
//     mudança (colar, trocar, apagar com conta), que decide qual chave vale entre os computadores da conta;
//     `openai-conexao-versao`: a geração HTTP monotônica daqui (não a hora remota), inclusive ao trocar de UID;
//     `openai-geracao-reservada` e `openai-hora-reservada`: relógios não secretos, reservados antes do HTTP;
//     `openai-conta`: o uid da alteração ou chegada; `conta:<uid>`: versões locais ainda pendentes,
//     preservadas durante uma troca de conta e retiradas após o sync; `openai-apagar-na-conexao`,
//     enquanto a cópia da Conexão ainda tem uma chave apagada aqui.
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
//   a nuvem da conta       com conta, a chave acompanha a conta Google (#154): `daqui` é o lado
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
  const VERSAO = 'pm_chave_openai_versao';
  const BANCO = 'pm-segredos';
  const LOJA = 'chaves';
  const ITEM = 'openai';
  const HORA = 'openai-em';
  const CONTA = 'openai-conta';
  // Cloud time chooses the account value; the local HTTP generation orders
  // Conexão operations even when switching to an account with an older key.
  const VERSAO_DA_CONEXAO = 'openai-conexao-versao';
  const GERACAO_RESERVADA = 'openai-geracao-reservada';
  const HORA_RESERVADA = 'openai-hora-reservada';
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

  const lerItem = item => naLoja('readonly', loja => loja.get(item));

  /**
   * Grava (ou, com `undefined`, apaga) os itens de uma vez, numa transação só. Com `se`, só grava se a hora
   * guardada ainda é `se` (lida e escrita na mesma transação: nada muda no meio). Devolve se gravou.
   */
  async function gravarItens(itens, { se, todas = false, reserva, seVersao, acimaDe } = {}) {
    const banco = await abrirOBanco();
    try {
      return await new Promise((resolver, rejeitar) => {
        const transacao = banco.transaction(LOJA, 'readwrite');
        const loja = transacao.objectStore(LOJA);
        let gravou = false;
        const gravar = () => {
          const escrever = () => {
            for (const [item, valor] of Object.entries(itens)) {
              if (valor === undefined) loja.delete(item);
              else loja.put(valor, item);
            }
            gravou = true;
          };
          if ((HORA in itens || acimaDe !== undefined) && !(VERSAO_DA_CONEXAO in itens)) {
            const anterior = loja.get(VERSAO_DA_CONEXAO);
            const horaAnterior = loja.get(HORA);
            const reservada = loja.get(GERACAO_RESERVADA);
            reservada.onsuccess = () => {
              itens[VERSAO_DA_CONEXAO] = Math.max(Date.now(), (Number(anterior.result) || Number(horaAnterior.result) || 0) + 1,
                (Number(reservada.result) || 0) + 1, (Number(acimaDe) || 0) + 1);
              itens[GERACAO_RESERVADA] = itens[VERSAO_DA_CONEXAO];
              escrever();
            };
          } else escrever();
        };
        if (todas) {
          // A mesma transação apaga TODOS os segredos daqui. Os outros UIDs
          // ficam só com marcas de remoção, que esperam a autenticação daquele UID.
          const nomes = loja.getAllKeys();
          const valores = loja.getAll();
          valores.onsuccess = () => {
            const pendencias = nomes.result.map((nome, i) => [nome, valores.result[i]])
              .filter(([nome]) => typeof nome === 'string' && nome.startsWith('conta:'));
            const em = Math.max(itens[HORA],
              (Number(valores.result[nomes.result.indexOf(HORA)]) || 0) + 1,
              (Number(valores.result[nomes.result.indexOf(HORA_RESERVADA)]) || 0) + 1,
              ...pendencias.map(([, valor]) => (Number(valor?.em) || 0) + 1));
            itens[HORA] = em;
            // Outra conta: retirar a cópia daqui não é uma nova mudança nessa
            // conta. A marca só cancela esta pendência, nunca uma chave posterior.
            for (const [nome, valor] of pendencias) itens[nome] = { chave: '', em: Number(valor?.em) || 0, conta: nome.slice(6) };
            const contaAntes = valores.result[nomes.result.indexOf(CONTA)];
            const horaAntes = Number(valores.result[nomes.result.indexOf(HORA)]) || 0;
            if (contaAntes && contaAntes !== 'local') itens[`conta:${contaAntes}`] = { chave: '', em: horaAntes, conta: contaAntes };
            if (itens[CONTA] && itens[CONTA] !== 'local') itens[`conta:${itens[CONTA]}`] = { chave: '', em, conta: itens[CONTA] };
            gravar();
          };
        } else if (seVersao !== undefined) {
          const atual = loja.get(VERSAO_DA_CONEXAO);
          atual.onsuccess = () => { if ((Number(atual.result) || 0) === seVersao) gravar(); };
        } else if (reserva !== undefined) {
          // Uma reserva que falhou não substitui a chave aceita. Só uma mudança
          // já gravada (confirmação, chegada ou remoção) invalida a aceitação anterior.
          const atual = loja.get(VERSAO_DA_CONEXAO);
          atual.onsuccess = () => { if ((Number(atual.result) || 0) < reserva) gravar(); };
        } else if (se === undefined) {
          gravar();
        } else {
          const hora = loja.get(HORA);
          hora.onsuccess = () => { if ((Number(hora.result) || 0) === se) gravar(); };
        }
        transacao.oncomplete = () => resolver(gravou);
        transacao.onerror = () => rejeitar(transacao.error);
        transacao.onabort = () => rejeitar(transacao.error);
      });
    } finally {
      banco.close();
    }
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
  async function entregarAConexao(chave, versao) {
    const resposta = await pedirAConexao(raiz.PedidoAoAnki.chaveDaOpenAI(chave, versao), TEMPO_DA_CONFERENCIA);
    if (!resposta) return { ok: false, motivo: 'sem_conexao', detalhes: `sem resposta · ${raiz.ConexaoAnki.ENDERECO}` };
    const { status, json } = resposta;
    if (status === 200 && json?.ok === true && typeof json.ultimos4 === 'string') {
      return { ok: true, ultimos4: json.ultimos4 };
    }
    const motivo = MOTIVO_DO_ERRO[json?.error] || 'conexao_com_erro';
    return { ok: false, motivo, detalhes: `HTTP ${status} · ${json?.error || 'sem corpo'}` };
  }

  /** Tira a cópia da chave da Conexão. `true` quando ela confirmou, `false` sem resposta que sirva. */
  async function apagarNaConexao(versao) {
    const resposta = await pedirAConexao(raiz.PedidoAoAnki.apagarChaveDaOpenAI(versao), TEMPO_DO_ESTADO);
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
   * Guarda a chave daqui (ou a apaga, com chave ''), com a hora e a conta, só se a hora ainda é `se` (quando
   * dado). Os 4 últimos vão ao storage, onde as telas os leem; apagada, a cópia da Conexão fica para sair.
   */
  async function guardarAqui({ chave, em, conta, versao }, { se, pendente = false, todas = false, reserva } = {}) {
    const itens = chave
      ? { [ITEM]: chave, [HORA]: em, [CONTA]: conta, [APAGAR_NA_CONEXAO]: undefined }
      : { [ITEM]: undefined, [HORA]: em, [CONTA]: conta, [APAGAR_NA_CONEXAO]: true };
    if (versao !== undefined) itens[VERSAO_DA_CONEXAO] = versao;
    if (conta && conta !== 'local') itens[`conta:${conta}`] = pendente ? { chave, em, conta } : undefined;
    // A local removal also removes the pending secret currently being displayed.
    if (!chave && pendente) {
      const anterior = await daqui.ler();
      if (anterior.conta && anterior.conta !== conta) itens[`conta:${anterior.conta}`] = undefined;
    }
    if (!(await gravarItens(itens, { se, todas, reserva }))) return false;
    await chrome.storage.local.set({ [VERSAO]: { em: itens[HORA], conta, versao: Number(await lerItem(VERSAO_DA_CONEXAO)) || 0 } });
    if (chave) await chrome.storage.local.set({ [MARCA]: { ultimos4: chave.slice(-4) } });
    else await chrome.storage.local.remove(MARCA);
    return true;
  }

  /** Reserva a geração ANTES do HTTP, com exclusão mútua entre abas. */
  async function reservarMudanca() {
    const banco = await abrirOBanco();
    try {
      return await new Promise((resolve, reject) => {
        const tx = banco.transaction(LOJA, 'readwrite');
        const loja = tx.objectStore(LOJA);
        const atual = loja.get(VERSAO_DA_CONEXAO);
        const reservada = loja.get(GERACAO_RESERVADA);
        const hora = loja.get(HORA);
        const horaReservada = loja.get(HORA_RESERVADA);
        let mudanca;
        horaReservada.onsuccess = () => {
          mudanca = {
            versao: Math.max(Date.now(), (Number(atual.result) || 0) + 1, (Number(reservada.result) || 0) + 1),
            em: Math.max(Date.now(), (Number(hora.result) || 0) + 1, (Number(horaReservada.result) || 0) + 1),
          };
          loja.put(mudanca.versao, GERACAO_RESERVADA);
          loja.put(mudanca.em, HORA_RESERVADA);
        };
        tx.oncomplete = () => resolve(mudanca);
        tx.onabort = tx.onerror = () => reject(tx.error);
      });
    } finally { banco.close(); }
  }

  /**
   * Confere a chave na Conexão e, aceita, guarda com o UID de quando foi colada, antes de qualquer pedido.
   * Sem conta, ela pode ser vinculada no primeiro sync; com conta, uma falha nunca a solta para outro UID.
   * Devolve o resultado de `entregarAConexao`. Recusada, nada do que já estava guardado muda.
   */
  async function confirmar(chave) {
    const { pm_user_info } = await chrome.storage.local.get({ pm_user_info: null });
    const conta = pm_user_info?.uid || '';
    const { em, versao } = await reservarMudanca();
    const resultado = await entregarAConexao(chave, versao);
    if (!resultado.ok) {
      // A ausência da resposta não prova que a Conexão não gravou. O cofre
      // confirmado continua sendo a verdade; reconciliar não aceita um rascunho.
      if (resultado.motivo === 'sem_conexao') await conferirACopia();
      return resultado;
    }
    if (!(await guardarAqui({ chave, em, conta, versao }, { reserva: versao, pendente: true }))) {
      return { ok: false, motivo: 'conexao_com_erro', detalhes: 'stale_key_version' };
    }
    avisarQueMudou();
    return resultado;
  }

  /**
   * Apagar chave e Apagar tudo: a chave sai daqui, e a cópia da Conexão agora, se ela responder, ou quando
   * ela voltar (`conferirACopia`). Com conta, fica a hora: é o tombstone que a nuvem leva aos outros
   * computadores. Sem conta, a remoção ativa é só local; Apagar chave simples preserva as pendências
   * dos outros UIDs. `mesmoSemChave` apaga também sem chave guardada aqui (com conta, Apagar tudo apaga
   * a chave que só a nuvem tem). `todas` varre TODAS as pendências, mesmo sem conta: ficam só marcas por
   * UID com a hora da própria cópia removida, que só sobem com a autenticação daquele UID. Assim uma
   * chave mais nova da conta pode chegar quando a pessoa entrar nela.
   */
  async function apagar({ comConta, mesmoSemChave = false, todas = mesmoSemChave }) {
    if (!todas && !mesmoSemChave && !(await lerOsUltimos4())) return;
    const { pm_user_info } = await chrome.storage.local.get({ pm_user_info: null });
    const conta = comConta ? (pm_user_info?.uid || '') : 'local';
    const anterior = await daqui.ler();
    await guardarAqui({ chave: '', em: Math.max(Date.now(), anterior.em + 1), conta }, { pendente: true, todas });
    avisarQueMudou();
    await conferirACopia();
  }

  /** Quem quer saber quando a chave muda neste computador (o painel.js, que a leva à nuvem da conta). */
  const ouvintes = new Set();
  const aoMudar = fn => ouvintes.add(fn);
  const avisarQueMudou = () => ouvintes.forEach(fn => fn());

  /**
   * A chave deste computador para `Sincronizacao.criarSincronizacaoDaChave` (o contrato está lá). Uma chave
   * que chega já foi conferida no computador onde foi colada. A Conexão recebe a cópia (ou a perde) por
   * `conferirACopia`, que o card da IA chama quando `pm_chave_openai` muda (painel-ia.js, sempre montado no painel).
   */
  const daqui = {
    async ler(uid) {
      const banco = await abrirOBanco();
      try {
        return await new Promise((resolver, rejeitar) => {
          const tx = banco.transaction(LOJA, 'readonly');
          const loja = tx.objectStore(LOJA);
          const chave = loja.get(ITEM), hora = loja.get(HORA), conta = loja.get(CONTA), versao = loja.get(VERSAO_DA_CONEXAO);
          const destaConta = uid ? loja.get(`conta:${uid}`) : null;
          tx.oncomplete = () => {
            const ativa = { chave: chave.result || '', em: Number(hora.result) || 0, conta: conta.result || '', versao: Number(versao.result) || Number(hora.result) || 0 };
            // Trocar a conta ativa não perde uma alteração que a nuvem recusou.
            const propria = destaConta?.result;
            resolver(propria && ativa.conta && ativa.conta !== uid ? { ...propria, ativaEm: ativa.em } : ativa);
          };
          tx.onerror = tx.onabort = () => rejeitar(tx.error);
        });
      } finally { banco.close(); }
    },
    aplicar: (versao, { se }) => guardarAqui(versao, { se }),
    async marcarConta(conta, { se }) {
      const atual = await daqui.ler();
      if (atual.em !== se) return;
      await guardarAqui({ ...atual, conta }, { se });
    },
  };

  /**
   * Depois de a Conexão voltar, ou de a chave mudar: se ela não tem a cópia da chave que a extensão guarda (ou tem outra),
   * entrega de novo. Devolve `true` com a cópia no lugar, `false` sem ela, `null` se a Conexão não respondeu
   * ou se não há chave guardada para entregar. Consulta também sem chave aqui: uma
   * conferência pode ter gravado lá antes de a aba fechar ou perder a resposta.
   */
  async function conferirACopia({ aoAbrir = false } = {}) {
    let aqui = await daqui.ler();
    // A nova página só desenha o estado confirmado. Uma reserva de uma página
    // anterior não pode gravar depois dessa recuperação e criar uma cópia órfã.
    const reservada = aoAbrir ? Number(await lerItem(GERACAO_RESERVADA)) || 0 : 0;
    if (reservada > aqui.versao) {
      const itens = aqui.chave ? {} : { [APAGAR_NA_CONEXAO]: true };
      if (!(await gravarItens(itens, { seVersao: aqui.versao, acimaDe: reservada }))) return null;
      aqui = await daqui.ler();
    }
    const naConexao = await estadoNaConexao();
    if (!naConexao) return null;
    const atual = await daqui.ler();
    if (atual.versao !== aqui.versao || atual.em !== aqui.em || atual.chave !== aqui.chave) return null;
    if (aqui.chave && naConexao.configurada && naConexao.versao === aqui.versao) return true;
    if (!aqui.chave && !naConexao.configurada && !(await lerItem(APAGAR_NA_CONEXAO))) return null;
    // Nunca reenvia a geração velha para sempre (409). A única verdade é a
    // chave já confirmada no cofre daqui; não há outro estado secreto de handshake.
    if ((Number(naConexao.versao) || 0) >= aqui.versao) {
      if (!(await gravarItens({}, { seVersao: aqui.versao, acimaDe: naConexao.versao }))) return null;
      aqui = await daqui.ler();
    }
    const versao = aqui.versao;
    const entregue = aqui.chave ? (await entregarAConexao(aqui.chave, versao)).ok : await apagarNaConexao(versao);
    const depois = await daqui.ler();
    if (depois.versao !== versao || depois.chave !== aqui.chave) return null;
    // A chave confirmada pode ter sido revogada ou perdido crédito. Se não dá
    // para repô-la, ao menos remove a cópia não confirmada: nunca gasta outra.
    // A mesma geração também barra a conferência desta entrega, se ela terminar tarde.
    if (aqui.chave && !entregue) await apagarNaConexao(versao);
    if (!aqui.chave && entregue) await gravarItens({ [APAGAR_NA_CONEXAO]: undefined }, { seVersao: versao });
    return aqui.chave ? entregue : null;
  }

  raiz.ChaveDaOpenAI = { MARCA, VERSAO, confirmar, apagar, conferirACopia, aoMudar, daqui };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
