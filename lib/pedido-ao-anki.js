'use strict';

// Como a extensão pede à Conexão com o Anki. Cada pedido nasce de um construtor daqui (`saude`,
// `baralhos`, `estatisticas`, `vocabulario`, `estadoDoItemDeLogin`, `abrirComOComputador`) e `pedir` só envia o que um deles montou: o conjunto de
// pedidos que a extensão faz é este arquivo, e `PedidoAoAnki.variantes` o lista inteiro. O contrato
// (complemento/contrato/exemplos.json) tem de ter um exemplo de cada um, o que
// `node test_contrato_fechado.js` confere; um pedido montado à mão ou um `fetch` direto não passa disso
// (regra `contrato-fechado`, scripts/regras/). O que lê o Anki da pessoa (os Baralhos, os números e o
// vocabulário) é POST com corpo JSON: o GET de uma página da extensão vai sem `Origin` e a Conexão só
// atende a extensão (complemento/contrato/LEIA-ME.md). Quem pede trata a resposta.
//
// Carregado pelo service worker e pelas páginas que falam com a Conexão, antes de quem pede.

(function (raiz) {
  const LIMITE_DO_VOCABULARIO = 10000;

  // Os pedidos que `pedir` aceita: só os que um construtor montou.
  const montados = new WeakSet();
  const montar = pedido => {
    const pronto = Object.freeze(pedido);
    montados.add(pronto);
    return pronto;
  };

  /** `GET /health`: a Conexão está ligada? */
  const saude = () => montar({ metodo: 'GET', caminho: '/health' });

  /** `POST /anki/decks`: os nomes dos Baralhos que o Anki tem. */
  const baralhos = () => montar({ metodo: 'POST', caminho: '/anki/decks', corpo: {} });

  // As leituras dos números que a tela de Baralhos e termos faz: a primeira, a de novo (depois de um
  // reparo ou de salvar outro Baralho, passando por cima do cache) e a de novo abrindo o Anki
  // (Atualizar e Tentar de novo). Outra combinação não é um pedido que a extensão faça.
  const LEITURAS_DOS_NUMEROS = Object.freeze([
    Object.freeze({ deNovo: false, abrirOAnki: false }),
    Object.freeze({ deNovo: true, abrirOAnki: false }),
    Object.freeze({ deNovo: true, abrirOAnki: true }),
  ]);

  /** `POST /anki/stats/decks` com os `baralhos` (`[{ deckName, lang }]`) numa leitura só, de uma das LEITURAS_DOS_NUMEROS. */
  function estatisticas(baralhosPedidos, { deNovo = false, abrirOAnki = false } = {}) {
    if (!LEITURAS_DOS_NUMEROS.some(leitura => leitura.deNovo === deNovo && leitura.abrirOAnki === abrirOAnki)) {
      throw new Error(`leitura dos números sem exemplo no contrato: deNovo=${deNovo}, abrirOAnki=${abrirOAnki}; `
        + 'acrescente-a a LEITURAS_DOS_NUMEROS (lib/pedido-ao-anki.js) e o exemplo a complemento/contrato/exemplos.json');
    }
    const corpo = { decks: baralhosPedidos.map(({ deckName, lang }) => ({ deckName, lang })) };
    if (deNovo) corpo.refresh = true;
    if (abrirOAnki) corpo.launch = true;
    return montar({ metodo: 'POST', caminho: '/anki/stats/decks', corpo });
  }

  /** `POST /anki/vocabulary`: o vocabulário inteiro do Baralho `deck` do idioma `lang`; os filtros são da tela. */
  const vocabulario = (deck, lang) => montar({
    metodo: 'POST', caminho: '/anki/vocabulary', corpo: { deck, lang, limit: LIMITE_DO_VOCABULARIO },
  });

  /** `POST /abrir-com-o-computador/estado`: o item de login que a Conexão guarda está escrito? */
  const estadoDoItemDeLogin = () => montar({ metodo: 'POST', caminho: '/abrir-com-o-computador/estado', corpo: {} });

  /** `POST /abrir-com-o-computador`: escreve (`ligado` true) ou apaga (false) o item de login. */
  function abrirComOComputador(ligado) {
    if (typeof ligado !== 'boolean') throw new Error(`abrirComOComputador pede true ou false, não ${JSON.stringify(ligado)}`);
    return montar({ metodo: 'POST', caminho: '/abrir-com-o-computador', corpo: { ligado } });
  }

  /** `POST /ia/openai/chave`: só a Conexão avança a revisão; `versao` é a observada pelo cliente. */
  function chaveDaOpenAI(chave, versao = 0, conta = '') {
    if (typeof chave !== 'string') throw new Error('chaveDaOpenAI pede a chave como texto');
    return montar({ metodo: 'POST', caminho: '/ia/openai/chave', corpo: { chave, versao, conta } });
  }

  /** `POST /ia/openai/chave/apagar`: substitui o valor da revisão observada por uma chave vazia. */
  const apagarChaveDaOpenAI = (versao = 0, conta = '') => montar({ metodo: 'POST', caminho: '/ia/openai/chave/apagar', corpo: { versao, conta } });

  /** `POST /ia/openai/sincronizar`: o dono leva a chave à conta; credencial transitória, nunca no cache. */
  const sincronizarChaveDaOpenAI = (uid, token, versao = 0) => montar({
    metodo: 'POST', caminho: '/ia/openai/sincronizar', corpo: { uid, token, versao },
  });

  /** Só migração: prova o valor já guardado antes de transferir seu UID/hora. Não troca a chave. */
  const vincularLegadoDaOpenAI = (chave, conta, em, versao = 0) => montar({
    metodo: 'POST', caminho: '/ia/openai/legado', corpo: { chave, conta, em, versao },
  });

  /** `POST /ia/estado`: o que a Conexão guarda da IA (a chave só pelos 4 últimos caracteres). */
  const estadoDaIA = () => montar({ metodo: 'POST', caminho: '/ia/estado', corpo: {} });

  /**
   * Todos os pedidos que a extensão pode fazer, para os Baralhos `baralhosPedidos` (um por idioma):
   * `[{ nome, pedido }]`; `chaveDeExemplo` é a chave que o pedido da IA leva. O teste do contrato confere um exemplo de cada.
   */
  function variantes(baralhosPedidos, chaveDeExemplo) {
    return [
      { nome: 'saúde', pedido: saude() },
      { nome: 'Baralhos', pedido: baralhos() },
      ...LEITURAS_DOS_NUMEROS.map(leitura => ({
        nome: `números (${leitura.abrirOAnki ? 'de novo, abrindo o Anki' : leitura.deNovo ? 'de novo' : 'primeira leitura'})`,
        pedido: estatisticas(baralhosPedidos, leitura),
      })),
      ...baralhosPedidos.map(({ deckName, lang }) => ({ nome: `vocabulário (${lang})`, pedido: vocabulario(deckName, lang) })),
      { nome: 'item de login: estado', pedido: estadoDoItemDeLogin() },
      { nome: 'item de login: ligar', pedido: abrirComOComputador(true) },
      { nome: 'item de login: desligar', pedido: abrirComOComputador(false) },
      { nome: 'IA: entregar a chave', pedido: chaveDaOpenAI(chaveDeExemplo) },
      { nome: 'IA: estado', pedido: estadoDaIA() },
      { nome: 'IA: apagar a chave', pedido: apagarChaveDaOpenAI() },
      { nome: 'IA: sincronizar a chave', pedido: sincronizarChaveDaOpenAI('uid-teste', 'token-ficticio') },
      { nome: 'IA: migrar a remoção antiga', pedido: vincularLegadoDaOpenAI('', 'uid-teste', 100) },
    ];
  }

  /** Envia o `pedido` (de um construtor daqui) à Conexão em `endereco`; `opcoes` vão ao `fetch` (o `signal`, por exemplo). Devolve a resposta. */
  function pedir(endereco, pedido, opcoes = {}) {
    if (!montados.has(pedido)) {
      throw new Error('pedido que não saiu de PedidoAoAnki (saude, baralhos, estatisticas ou vocabulario): '
        + 'monte-o por um deles, para o contrato ter o exemplo dele');
    }
    const { metodo, caminho, corpo } = pedido;
    if (corpo === undefined) return fetch(`${endereco}${caminho}`, { ...opcoes, method: metodo });
    return fetch(`${endereco}${caminho}`, {
      ...opcoes,
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
  }

  function ausenciaDaRota(status) {
    return status === 404 ? 'antiga' : 'falhou';
  }

  raiz.PedidoAoAnki = Object.freeze({ saude, baralhos, estatisticas, vocabulario, estadoDoItemDeLogin, abrirComOComputador, chaveDaOpenAI, apagarChaveDaOpenAI, sincronizarChaveDaOpenAI, vincularLegadoDaOpenAI, estadoDaIA, variantes, pedir, ausenciaDaRota });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
