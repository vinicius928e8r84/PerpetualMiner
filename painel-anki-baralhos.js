'use strict';

(function (raiz) {
  const CHAVE_BARALHOS = 'pm_anki_baralhos';
  const CHAVE_VOCABULARIO = 'pm_anki_vocabulario';
  const FONTE_ARQUIVO = raiz.VocabularioDaMineracao.FONTE_ARQUIVO;
  // O reparo leva até ~110 s (fechar o Anki + os 90 s de espera da Conexão). Este
  // limite não é o do reparo: só evita esperar para sempre uma Conexão muda.
  const LIMITE_DO_REPARO_MS = 180_000;
  // Os itens do vocabulário que a lista desenha; a busca e os filtros estreitam.
  const MOSTRAR_NO_MAXIMO = 200;

  const IDIOMAS_DOS_AZULEJOS = [
    { idioma: 'en', codigo: 'BRG-28.codigoEn', nome: 'INGLES' },
    { idioma: 'ru', codigo: 'BRG-28.codigoRu', nome: 'RUSSO' },
  ];
  const FILTROS_DE_TIPO = [
    ['all', 'BRG-35.palavrasETermos'],
    ['word', 'BRG-21.soPalavras'],
    ['term', 'BRG-21.soTermos'],
  ];
  const FILTROS_DE_STATUS = [
    ['all', 'BRG-35.todos'],
    ['new', 'BRG-35.novos'],
    ['recent', 'BRG-35.recentes'],
    ['mature', 'BRG-35.maduros'],
    ['mixed', 'BRG-35.mistos'],
  ];
  // O `status` de um item do bridge na tela: o texto e o tom do selo.
  const STATUS_DO_ITEM = {
    mature: { texto: 'BRG-35.maduro', selo: 'veio-selo--ok' },
    recent: { texto: 'BRG-35.recente', selo: 'veio-selo--info' },
    mixed: { texto: 'BRG-35.misto', selo: 'veio-selo--parte' },
    new: { texto: 'BRG-35.novo', selo: '' },
    seen: { texto: 'BRG-35.visto', selo: '' },
  };
  // O `type` de um item do bridge na tela: na lista e no topo do detalhe.
  const TIPO_DO_ITEM = {
    word: { lista: 'BRG-35.palavra', detalhe: 'BRG-35.tipoPalavra' },
    term: { lista: 'BRG-35.termo', detalhe: 'BRG-35.tipoTermo' },
  };
  const tipoDoItem = item => TIPO_DO_ITEM[item.type] || TIPO_DO_ITEM.word;
  // As três séries de maturidade, na ordem e com a cor (a exceção de dataviz do Veio).
  const MATURIDADE = [
    { chave: 'maduros', rotulo: 'BRG-34.maduros' },
    { chave: 'recentes', rotulo: 'BRG-34.recentes' },
    { chave: 'novos', rotulo: 'BRG-34.novos' },
  ];

  const { textoDaVoz, Veio, Shell, ConexaoAnki, IDIOMAS, VocabularioDaMineracao } = raiz;
  const { haQuanto } = raiz.Contexto;
  const { esqueleto, linhaDeEspera, seloDoDadoAntigo } = raiz.Anki.pecas;
  const { ENDERECO: ENDERECO_DA_CONEXAO, SITUACAO: CONEXAO } = ConexaoAnki;
  const porId = id => document.getElementById(id);

  const estado = {
    nomes: null,            // { en, ru }: os baralhos dos Ajustes de envio
    baralhos: {
      dados: null,          // a última leitura de GET /anki/stats/decks
      quando: 0,
      dadosDe: 0,           // o momento dos dados (lib/vocabulario-da-mineracao.js): o de `quando`, ou o de antes de o Anki fechar
      ankiFechado: false,   // a Conexão leu o arquivo e confirmou que o Anki está fechado
      nomes: null,          // os baralhos (`{ en, ru }`) a que esta leitura se refere
      carregando: false,
      erro: null,           // a causa técnica, para o Detalhes
      leitura: 0,           // só a leitura mais recente desenha
      idioma: 'en',
    },
    vocabulario: {
      dados: null,          // { en: { deckName, itens }, ru: { … } }
      quando: 0,
      dadosDe: 0,
      ankiFechado: false,
      nomes: null,
      carregando: false,
      erro: null,
      leitura: 0,
      idioma: 'en',
      tipo: 'all',
      status: 'all',
      busca: '',
      escolhido: null,      // a chave do item no detalhe
    },
    reparando: false,
    fimDoReparo: null,      // o aviso do reparo que não deu certo (BRG-17, BRG-18), até fechar
  };

  async function iniciar() {
    montarAzulejos('anki-baralhos-azulejos', estado.baralhos);
    montarAzulejos('anki-vocabulario-azulejos', estado.vocabulario);
    montarFiltros();
    const reparar = porId('btn-bridge-anki-repair');
    reparar.addEventListener('click', () => pedirReparo(reparar));

    const gravado = await chrome.storage.local.get({ [CHAVE_BARALHOS]: null, [CHAVE_VOCABULARIO]: null });
    const baralhos = gravado[CHAVE_BARALHOS];
    if (baralhos?.dados && !estado.baralhos.dados) Object.assign(estado.baralhos, baralhos);
    const vocabulario = gravado[CHAVE_VOCABULARIO];
    if (vocabulario?.dados && !estado.vocabulario.dados) Object.assign(estado.vocabulario, vocabulario);

    ConexaoAnki.acompanhar(aoMudarAConexao);
    Shell.aoEntrarNaArea('anki', () => lerTudo());
    raiz.Anki.aoAtualizar(() => lerTudo({ deNovo: true, abrirOAnki: true }));
    desenhar();
  }

  /**
   * O painel.js informa os baralhos dos Ajustes de envio, ao abrir e a cada
   * Salvar ajustes; um baralho novo é lido de novo. Ler nunca abre o Anki: só
   * Atualizar e Tentar de novo, que a pessoa aperta, pedem à Conexão que o abra.
   */
  function usarBaralhos(nomes) {
    const antes = estado.nomes;
    estado.nomes = { en: nomes.en, ru: nomes.ru };
    const mudou = Boolean(antes) && (antes.en !== nomes.en || antes.ru !== nomes.ru);
    if ((!antes || mudou) && Shell.areaAtual() === 'anki') lerTudo({ deNovo: mudou });
  }

  let anterior = CONEXAO.CONECTANDO;   // a situação da notificação anterior: ligar é decidido contra ela

  function aoMudarAConexao(situacao) {
    const antes = anterior;
    anterior = situacao;
    if (situacao === CONEXAO.LIGADA && antes !== CONEXAO.LIGADA && Shell.areaAtual() === 'anki') {
      lerTudo();
    }
    desenhar();
  }

  function desligada() {
    return ConexaoAnki.situacao() === CONEXAO.DESLIGADA;
  }

  /** Lê as duas abas, cada uma por si; sem a Conexão (ou sem os baralhos) não há de onde. */
  function lerTudo(opcoes = {}) {
    if (ConexaoAnki.situacao() !== CONEXAO.LIGADA || !estado.nomes) return;
    lerBaralhos(opcoes);
    lerVocabulario();
  }

  /**
   * POST /anki/stats/decks com os dois baralhos numa leitura só. `deNovo` passa
   * por cima do cache da Conexão; `abrirOAnki` a deixa abrir o Anki (BRG-24): só um clique pede isso.
   */
  async function lerBaralhos({ deNovo = false, abrirOAnki = false, focarAzulejo = false } = {}) {
    const baralhos = estado.baralhos;
    const leitura = ++baralhos.leitura;
    baralhos.carregando = true;
    baralhos.erro = null;
    desenhar();

    const nomes = { ...estado.nomes };
    const baralhosPedidos = IDIOMAS_DOS_AZULEJOS.map(({ idioma }) => ({ deckName: estado.nomes[idioma], lang: idioma }));
    let dados = null;
    let erro = null;
    try {
      dados = await pedirJson(raiz.PedidoAoAnki.estatisticas(baralhosPedidos, { deNovo, abrirOAnki }));
    } catch (falha) {
      erro = `POST /anki/stats/decks · ${falha.message}`;
    }
    const quando = Date.now();
    const marca = dados && await marcaDaLeitura(baralhos, nomes, dados.source, quando);
    if (leitura !== baralhos.leitura) return;

    baralhos.carregando = false;
    baralhos.erro = erro;
    if (dados) {
      Object.assign(baralhos, { dados, quando, nomes, dadosDe: marca.dadosDe, ankiFechado: marca.ankiFechado });
      chrome.storage.local.set({ [CHAVE_BARALHOS]: { dados, quando, nomes, dadosDe: marca.dadosDe, ankiFechado: marca.ankiFechado } });
    }
    desenhar();
    if (focarAzulejo && dados && document.activeElement === document.body) {
      porId('anki-baralhos-azulejos').querySelector('[aria-pressed="true"]')?.focus();
    }
  }

  /** O vocabulário inteiro do baralho de cada idioma; os filtros são aplicados aqui. */
  async function lerVocabulario() {
    const vocabulario = estado.vocabulario;
    const leitura = ++vocabulario.leitura;
    vocabulario.carregando = true;
    vocabulario.erro = null;
    desenhar();

    const nomes = { ...estado.nomes };
    const lerIdioma = async idioma => {
      const deckName = estado.nomes[idioma];
      const resposta = await pedirJson(raiz.PedidoAoAnki.vocabulario(deckName, idioma));
      const itens = Array.isArray(resposta.words) ? resposta.words : [];
      // O bridge entrega até 10.000 itens; o total do idioma é o `totalWords` dele.
      return { deckName: resposta.deckName || deckName, itens, total: numero(resposta.totalWords ?? itens.length), source: resposta.source };
    };
    let dados = null;
    let erro = null;
    try {
      const [en, ru] = await Promise.all(IDIOMAS_DOS_AZULEJOS.map(({ idioma }) => lerIdioma(idioma)));
      dados = { en, ru };
    } catch (falha) {
      erro = `POST /anki/vocabulary · ${falha.message}`;
    }
    const quando = Date.now();
    const doArquivo = dados && Object.values(dados).some(doIdioma => doIdioma.source === FONTE_ARQUIVO);
    const marca = dados && await marcaDaLeitura(vocabulario, nomes, doArquivo ? FONTE_ARQUIVO : null, quando);
    if (leitura !== vocabulario.leitura) return;

    vocabulario.carregando = false;
    vocabulario.erro = erro;
    if (dados) {
      Object.assign(vocabulario, { dados, quando, nomes, dadosDe: marca.dadosDe, ankiFechado: marca.ankiFechado });
      chrome.storage.local.set({ [CHAVE_VOCABULARIO]: { dados, quando, nomes, dadosDe: marca.dadosDe, ankiFechado: marca.ankiFechado } });
    }
    desenhar();
  }

  /**
   * O `dadosDe` e o `ankiFechado` de uma leitura nova da aba. A idade só vem da
   * leitura anterior dos mesmos baralhos: outro Baralho começa a sua agora.
   */
  function marcaDaLeitura(aba, nomes, source, quando) {
    const mesmosBaralhos = aba.nomes?.en === nomes.en && aba.nomes?.ru === nomes.ru;
    const anterior = mesmosBaralhos ? { dadosDe: aba.dadosDe, createdAt: aba.quando } : null;
    return VocabularioDaMineracao.marcaDaLeitura(anterior, source, ENDERECO_DA_CONEXAO, quando);
  }

  /** Envia um pedido de `PedidoAoAnki` à Conexão (o que lê o Anki da pessoa é POST: contrato/LEIA-ME.md); um HTTP de erro vira a causa, com o `detail` que ela mandar. */
  async function pedirJson(pedido) {
    const resposta = await raiz.PedidoAoAnki.pedir(ENDERECO_DA_CONEXAO, pedido);
    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => ({}));
      throw new Error([`HTTP ${resposta.status}`, corpo.error, corpo.detail].filter(Boolean).join(' · '));
    }
    return resposta.json();
  }

  async function pedirReparo(botao) {
    if (botao.getAttribute('aria-disabled') === 'true') return;
    const reparoDoErro = Boolean(botao.closest('#anki-baralhos-corpo'));
    estado.reparando = true;
    estado.fimDoReparo = null;
    desenhar();
    // Quem apertou saiu da tela (o Reparar do BRG-11 ou o do Avançado, que some no reparo): o foco vai para a espera.
    porId('anki-reparando')?.focus();

    const limite = new AbortController();
    const relogio = setTimeout(() => limite.abort(), LIMITE_DO_REPARO_MS);
    let fim;
    try {
      const resposta = await fetch(`${ENDERECO_DA_CONEXAO}/anki/repair`, { method: 'POST', signal: limite.signal });
      const dados = await resposta.json().catch(() => ({}));
      if ((resposta.ok && dados.ok) || dados.after?.collectionReady) fim = { ok: true };
      else if (windowsBloqueou(dados)) fim = { bloqueado: true, causa: `anki_repair_access_denied · ${processosDoReparo(dados)}` };
      else {
        // Com `after`, o reparo rodou e esperou o Anki voltar, e ele não voltou: BRG-17.
        // Sem ele (já reparando, ou o reparo nem começou), a Conexão não chegou a esperar.
        const causa = ['POST /anki/repair', `HTTP ${resposta.status}`, dados.error || dados.code, dados.detail].filter(Boolean).join(' · ');
        fim = { demorou: Boolean(dados.after), causa };
      }
    } catch (falha) {
      const motivo = limite.signal.aborted ? `sem resposta em ${LIMITE_DO_REPARO_MS / 1000} s` : falha.message;
      fim = { demorou: limite.signal.aborted, causa: `POST /anki/repair · ${motivo}` };
    } finally {
      clearTimeout(relogio);
    }

    estado.reparando = false;
    if (fim.ok) {
      Veio.mostrarToastDeSucesso(textoDaVoz('BRG-16'));
      desenhar();
      if (!reparoDoErro) devolverOFoco(botao);
      lerTudo({ deNovo: true, focarAzulejo: reparoDoErro });
      return;
    }
    if (fim.bloqueado) estado.fimDoReparo = avisoDeBloqueio(fim.causa);
    else if (fim.demorou) estado.fimDoReparo = avisoDeDemora(fim.causa);
    else estado.fimDoReparo = avisoDeFalha(fim.causa);
    desenhar();
    devolverOFoco(botao);
  }

  /** A espera sumiu: devolve o foco apenas ao botão que ainda permanece na tela. */
  function devolverOFoco(botao) {
    if (document.activeElement === document.body && botao.isConnected && !botao.closest('[hidden]')) botao.focus();
  }

  function windowsBloqueou(dados) {
    return Boolean(dados.accessDenied || dados.kill?.accessDenied || dados.code === 'anki_repair_access_denied');
  }

  /** Os processos que o Windows não deixou fechar, para o Detalhes do BRG-18. */
  function processosDoReparo(dados) {
    const linhas = [
      ...(Array.isArray(dados.pids) ? dados.pids : []),
      ...(Array.isArray(dados.processes) ? dados.processes : []),
      ...(Array.isArray(dados.kill?.remaining) ? dados.kill.remaining : []),
    ];
    const pids = [...new Set(linhas.map(linha => Number(linha?.pid ?? linha)).filter(Boolean))];
    return `processos: ${pids.join(', ') || '?'}`;
  }

  /** BRG-18: persistente, com Reparar Anki de novo e os processos em Detalhes. */
  function avisoDeBloqueio(causa) {
    const aviso = Veio.montarAviso({
      texto: textoDaVoz('BRG-18'),
      detalhes: causa,
      rotuloDeFechar: textoDaVoz('PAI-34'),
      aoFechar: fecharFimDoReparo,
    });
    aviso.querySelector('.veio-aviso__acoes').prepend(botaoDeReparar('anki-reparar-indisponivel-bloqueio'));
    return aviso;
  }

  /** BRG-17: o reparo não deixou o Anki pronto; Atualizar confere e lê de novo. */
  function avisoDeDemora(causa) {
    return Veio.montarAviso({
      texto: textoDaVoz('BRG-17.aviso'),
      acao: {
        rotulo: textoDaVoz('BRG-17.atualizar'),
        aoUsar: () => {
          fecharFimDoReparo();
          raiz.Anki.atualizar();
        },
      },
      detalhes: causa,
      rotuloDeFechar: textoDaVoz('PAI-34'),
      aoFechar: fecharFimDoReparo,
    });
  }

  /** O reparo que falhou sem cópia própria: GLB-01, com Reparar Anki de novo e a causa em Detalhes. */
  function avisoDeFalha(causa) {
    const aviso = Veio.montarAviso({
      texto: textoDaVoz('GLB-01'),
      detalhes: causa,
      rotuloDeFechar: textoDaVoz('PAI-34'),
      aoFechar: fecharFimDoReparo,
    });
    aviso.querySelector('.veio-aviso__acoes').prepend(botaoDeReparar('anki-reparar-indisponivel-falha'));
    return aviso;
  }

  function fecharFimDoReparo() {
    estado.fimDoReparo = null;
    desenhar();
  }

  /** Um Reparar Anki a mais (nos avisos), com a dica própria. */
  function botaoDeReparar(idDaDica) {
    const acao = botao(null, 'veio-botao veio-botao--contorno', () => pedirReparo(acao));
    acao.dataset.reparar = '';
    const dica = elemento('span', 'veio-dica', textoDaVoz('BRG-33.reparar'));
    dica.id = idDaDica;
    dica.setAttribute('role', 'tooltip');
    return elemento('span', 'veio-com-dica', acao, dica);
  }

  /**
   * Os botões ficam ocultos durante o reparo; enquanto isso, não aceitam outro
   * pedido. Com a Conexão desligada, aria-disabled (continua no Tab) e dica.
   */
  function desenharBotoesDeReparar() {
    for (const acao of document.querySelectorAll('#btn-bridge-anki-repair, [data-reparar]')) {
      acao.textContent = textoDaVoz(estado.reparando ? 'BRG-15.titulo' : 'BRG-11.repararAnki');
      const dica = acao.parentElement.querySelector('.veio-dica');
      if (desligada() || estado.reparando) acao.setAttribute('aria-disabled', 'true');
      else acao.removeAttribute('aria-disabled');
      if (desligada()) acao.setAttribute('aria-describedby', dica.id);
      else acao.removeAttribute('aria-describedby');
    }
  }

  function desenhar() {
    desenharBaralhos();
    desenharVocabulario();
    desenharBotoesDeReparar();
  }

  /** O que a aba mostra agora: a mesma regra nas duas abas. */
  function vista({ dados, carregando, erro }) {
    if (desligada() && dados) return 'antiga';
    if (ConexaoAnki.ultimaResposta() === null) return 'esqueleto';
    if (desligada()) return 'nada';
    if (carregando || (!dados && !erro)) return 'carregando';
    if (erro) return 'erro';
    return 'dados';
  }

  /** Troca os filhos só quando mudam: um aviso que continua na tela guarda o foco e o Detalhes aberto. */
  function mostrar(lugar, nos) {
    const iguais = lugar.children.length === nos.length && nos.every((no, i) => lugar.children[i] === no);
    if (!iguais) lugar.replaceChildren(...nos);
  }

  /** O momento dos dados de uma leitura gravada; as de antes de `dadosDe` valem o momento em que foram lidas. */
  const momentoDosDados = leitura => leitura.dadosDe || leitura.quando;

  function seloAntigo(quando, motivo) {
    return elemento('div', 'anki-antigo', seloDoDadoAntigo(quando, motivo));
  }

  // Cada lugar da tela guarda o último nó que desenhou e com o quê: enquanto
  // isso não muda, o mesmo nó volta, e o foco e o Detalhes aberto ficam.
  const desenhados = new Map();

  function oMesmo(lugar, chave, fabricar) {
    const guardado = desenhados.get(lugar);
    if (guardado?.chave === chave) return guardado.no;
    const no = fabricar();
    desenhados.set(lugar, { chave, no });
    return no;
  }

  const esperaDoReparo = (() => {
    const linha = linhaDeEspera(textoDaVoz('BRG-15.detalhe'));
    linha.id = 'anki-reparando';
    linha.tabIndex = -1;
    return linha;
  })();

  function desenharBaralhos() {
    const baralhos = estado.baralhos;
    const qual = estado.reparando ? 'reparando' : vista(baralhos);

    const topo = [];
    if (estado.reparando) topo.push(esperaDoReparo);
    if (estado.fimDoReparo) topo.push(estado.fimDoReparo);
    const comDados = qual === 'dados' || qual === 'antiga';
    if (comDados && baralhos.dados.source === FONTE_ARQUIVO) topo.push(oMesmo('baralhos:arquivo', true, notaDoArquivoLocal));
    if (qual === 'antiga' || (qual === 'dados' && baralhos.ankiFechado)) {
      const idade = haQuanto(momentoDosDados(baralhos));
      topo.push(oMesmo('baralhos:selo', idade, () => seloAntigo(momentoDosDados(baralhos))));
    } else if (qual === 'dados' && baralhos.dados.stale) topo.push(oMesmo('baralhos:cache', baralhos.dados, () => seloDoCache(baralhos.dados)));
    mostrar(porId('anki-baralhos-topo'), topo);

    porId('anki-baralhos-azulejos').hidden = !comDados;
    porId('anki-baralhos-avancado').hidden = qual === 'esqueleto' || qual === 'reparando';
    const corpo = porId('anki-baralhos-corpo');
    if (qual === 'esqueleto') mostrar(corpo, [esqueleto([120, 120])]);
    else if (qual === 'carregando' || qual === 'reparando') mostrar(corpo, [linhaDeEspera(textoDaVoz('BRG-10')), esqueleto([120, 120])]);
    else if (qual === 'erro') mostrar(corpo, [oMesmo('baralhos:erro', baralhos.erro, erroDosBaralhos)]);
    else if (qual === 'nada') mostrar(corpo, [oMesmo('baralhos:esperando', true, esperandoOAnki)]);
    else {
      const decks = decksPorIdioma(baralhos.dados);
      desenharAzulejos('anki-baralhos-azulejos', baralhos, idioma => {
        const deck = decks[idioma];
        return {
          baralho: nomeDoBaralho(idioma, deck),
          valor: deck?.missing ? textoDaVoz('BRG-27.valor') : formatar(palavrasDoBaralho(deck)),
          legenda: deck?.missing ? textoDaVoz('BRG-27.legenda') : textoDaVoz('BRG-34.palavras', { n: palavrasDoBaralho(deck) }),
        };
      });
      const deck = decks[baralhos.idioma];
      mostrar(corpo, [oMesmo('baralhos:detalhe', deck, () => detalheDoBaralho(baralhos.idioma, deck))]);
    }
  }

  /** BRG-37: o Anki fechado e nenhuma leitura guardada; o primeiro Anki aberto traz os dados. */
  function esperandoOAnki() {
    return elemento('div', 'veio-vazio',
      elemento('p', 'veio-vazio__titulo', textoDaVoz('BRG-37.esperando')),
      elemento('p', 'veio-vazio__texto', textoDaVoz('BRG-37.comeca')));
  }

  function notaDoArquivoLocal() {
    const ponto = elemento('span', 'anki-ponto anki-ponto--parado');
    ponto.setAttribute('aria-hidden', 'true');
    return elemento('p', 'anki-nota anki-nota--com-ponto', ponto, textoDaVoz('BRG-13'));
  }

  /** A Conexão mandou o que tinha guardado, porque o Anki não respondeu agora. */
  function seloDoCache(dados) {
    return seloAntigo(dados.generatedAt || estado.baralhos.quando, 'atualizacao');
  }

  /** BRG-11: persistente, com Reparar Anki e Tentar de novo, e a causa em Detalhes. */
  function erroDosBaralhos() {
    const aviso = Veio.montarAviso({
      texto: textoDaVoz('BRG-11.aviso'),
      acao: { rotulo: textoDaVoz('BRG-11.tentarDeNovo'), aoUsar: () => lerTudo({ deNovo: true, abrirOAnki: true }) },
      detalhes: estado.baralhos.erro,
      fechavel: false,
    });
    aviso.querySelector('.veio-aviso__acoes').prepend(botaoDeReparar('anki-reparar-indisponivel-erro'));
    return aviso;
  }

  function decksPorIdioma(dados) {
    const decks = Array.isArray(dados?.decks) ? dados.decks : [];
    return Object.fromEntries(IDIOMAS_DOS_AZULEJOS.map(({ idioma }) => [idioma, decks.find(deck => deck.lang === idioma)]));
  }

  /** O nome do baralho: o que a Conexão leu, ou o dos Ajustes de envio. */
  function nomeDoBaralho(idioma, deck) {
    return deck?.deckName || estado.nomes?.[idioma] || '';
  }

  function palavrasDoBaralho(deck) {
    if (!deck) return 0;
    return numero(deck.vocabulary?.phraseVocabulary ?? deck.uniqueTermTokens ?? deck.uniqueTerms);
  }

  /** Os cartões por maturidade; recentes junta os que estão aprendendo e os jovens do Anki. */
  function maturidadeDoBaralho(deck) {
    return {
      maduros: numero(deck.mature),
      recentes: numero(deck.young) + numero(deck.learning),
      novos: numero(deck.new),
    };
  }

  function detalheDoBaralho(idioma, deck) {
    const nome = `${nomeDoIdioma(idioma)} · ${nomeDoBaralho(idioma, deck)}`;
    if (!deck || deck.missing) {
      const aviso = Veio.montarAviso({
        texto: textoDaVoz('BRG-14', { baralho: nomeDoBaralho(idioma, deck) }),
        acao: { rotulo: textoDaVoz('BRG-34.abrirAjustes'), aoUsar: () => { location.hash = '#anki/ajustes'; } },
        fechavel: false,
      });
      return elemento('section', 'anki-cartao anki-baralho anki-baralho--sem', elemento('h3', null, nome), aviso);
    }

    const series = maturidadeDoBaralho(deck);
    const linhas = [
      [textoDaVoz('BRG-34.cartoes'), formatar(numero(deck.cards))],
      [textoDaVoz('BRG-34.termosAlvo'), formatar(numero(deck.vocabulary?.targetTerms ?? deck.uniqueTerms))],
      [textoDaVoz('BRG-34.palavraNovaPorCartao'), formatar(numero(deck.vocabulary?.avgNewPhraseVocabularyPerCard), 1)],
      ...MATURIDADE.map(({ chave, rotulo }) => [marcaDaSerie(chave, textoDaVoz(rotulo)), formatar(series[chave])]),
    ];
    const numeros = elemento('dl', 'anki-partes', ...linhas.flatMap(([rotulo, valor]) =>
      [elemento('dt', null, rotulo), elemento('dd', null, valor)]));
    return elemento('section', 'anki-cartao anki-baralho',
      anelDeMaturidade(series),
      elemento('div', 'anki-baralho__numeros',
        elemento('p', 'anki-apoio', nome),
        elemento('p', 'anki-baralho__palavras', formatar(palavrasDoBaralho(deck))),
        elemento('p', 'anki-apoio', textoDaVoz('BRG-34.palavrasNosCartoes')),
        numeros));
  }

  function marcaDaSerie(chave, texto) {
    const marca = elemento('i', `anki-serie--${chave}`);
    marca.setAttribute('aria-hidden', 'true');
    return elemento('span', 'anki-com-marca', marca, texto);
  }

  /** O anel: maduros · recentes · novos, e no meio a parte madura de todos os cartões. */
  function anelDeMaturidade(series) {
    const SVG = 'http://www.w3.org/2000/svg';
    const raio = 52;
    const volta = 2 * Math.PI * raio;
    const total = series.maduros + series.recentes + series.novos;
    const pct = `${total ? Math.round((series.maduros / total) * 100) : 0}%`;
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 132 132');
    svg.setAttribute('class', 'anki-anel');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', textoDaVoz('BRG-34.maturidade', { pct }));
    const circulo = classe => {
      const no = document.createElementNS(SVG, 'circle');
      for (const [nome, valor] of [['cx', 66], ['cy', 66], ['r', raio], ['class', classe]]) no.setAttribute(nome, valor);
      return no;
    };
    svg.append(circulo('anki-anel__fundo'));
    let andado = 0;
    for (const { chave } of MATURIDADE) {
      if (!total || !series[chave]) continue;
      const comprimento = (series[chave] / total) * volta;
      const pedaco = circulo(`anki-anel__serie anki-serie--${chave}`);
      pedaco.setAttribute('stroke-dasharray', `${Math.max(comprimento - 2, 0)} ${volta}`);
      pedaco.setAttribute('stroke-dashoffset', String(-andado));
      pedaco.setAttribute('transform', 'rotate(-90 66 66)');
      svg.append(pedaco);
      andado += comprimento;
    }
    const texto = (classe, y, conteudo) => {
      const no = document.createElementNS(SVG, 'text');
      for (const [nome, valor] of [['x', 66], ['y', y], ['text-anchor', 'middle'], ['class', classe]]) no.setAttribute(nome, valor);
      no.textContent = conteudo;
      no.setAttribute('aria-hidden', 'true');
      return no;
    };
    svg.append(texto('anki-anel__pct', 66, pct), texto('anki-anel__rotulo', 82, textoDaVoz('BRG-34.anel')));
    return svg;
  }

  function montarFiltros() {
    const opcoes = (select, lista) => select.replaceChildren(...lista.map(([valor, id]) => {
      const opcao = elemento('option', null, textoDaVoz(id));
      opcao.value = valor;
      return opcao;
    }));
    const tipo = porId('anki-vocabulario-tipo');
    const status = porId('anki-vocabulario-status');
    const busca = porId('anki-vocabulario-busca');
    opcoes(tipo, FILTROS_DE_TIPO);
    opcoes(status, FILTROS_DE_STATUS);
    busca.placeholder = textoDaVoz('BRG-35.buscar');
    tipo.addEventListener('change', () => filtrar({ tipo: tipo.value }));
    status.addEventListener('change', () => filtrar({ status: status.value }));
    busca.addEventListener('input', () => filtrar({ busca: busca.value }));
    porId('anki-vocabulario-limpar').addEventListener('click', () => {
      filtrar({ busca: '' });
      busca.focus();
    });
  }

  function filtrar(mudanca) {
    Object.assign(estado.vocabulario, mudanca);
    desenhar();
  }

  /** Limpar busca (o vazio BRG-21): volta a busca e os filtros, e o foco vai para a busca. */
  function limparTudo() {
    filtrar({ busca: '', tipo: 'all', status: 'all' });
    porId('anki-vocabulario-busca').focus();
  }

  const chaveDoItem = item => `${item.type}:${item.word}`;

  function itensFiltrados() {
    const { dados, idioma, tipo, status, busca } = estado.vocabulario;
    const procura = busca.trim().toLocaleLowerCase();
    return (dados?.[idioma]?.itens || []).filter(item =>
      (tipo === 'all' || item.type === tipo)
      && (status === 'all' || item.status === status)
      && (!procura || String(item.word).toLocaleLowerCase().includes(procura)));
  }

  function desenharVocabulario() {
    const vocabulario = estado.vocabulario;
    const qual = vista(vocabulario);
    const comDados = qual === 'dados' || qual === 'antiga';
    // A chave do selo é a idade dita, e não o momento: renovada a leitura, “há 2 h” vira “há 4 h”.
    const idade = haQuanto(momentoDosDados(vocabulario));
    mostrar(porId('anki-vocabulario-topo'),
      qual === 'antiga' || (qual === 'dados' && vocabulario.ankiFechado)
        ? [oMesmo('vocabulario:selo', idade, () => seloAntigo(momentoDosDados(vocabulario)))]
        : []);

    porId('anki-vocabulario-azulejos').hidden = !comDados;
    porId('anki-vocabulario-filtros').hidden = !comDados;
    porId('anki-vocabulario-resumo').hidden = !comDados;
    porId('anki-vocabulario-tipo').value = vocabulario.tipo;
    porId('anki-vocabulario-status').value = vocabulario.status;
    const busca = porId('anki-vocabulario-busca');
    if (busca.value !== vocabulario.busca) busca.value = vocabulario.busca;
    porId('anki-vocabulario-limpar').hidden = !vocabulario.busca;

    const corpo = porId('anki-vocabulario-corpo');
    if (qual === 'esqueleto') return mostrar(corpo, [esqueleto([40, 300])]);
    if (qual === 'carregando') return mostrar(corpo, [linhaDeEspera(textoDaVoz('BRG-19')), esqueleto([40, 300])]);
    if (qual === 'erro') return mostrar(corpo, [oMesmo('vocabulario:erro', vocabulario.erro, erroDoVocabulario)]);
    if (qual === 'nada') return mostrar(corpo, [oMesmo('vocabulario:esperando', true, esperandoOAnki)]);

    desenharAzulejos('anki-vocabulario-azulejos', vocabulario, idioma => {
      const doIdioma = vocabulario.dados[idioma] || { deckName: estado.nomes?.[idioma] || '', itens: [] };
      return {
        baralho: doIdioma.deckName,
        valor: formatar(totalDoIdioma(doIdioma)),
        legenda: textoDaVoz('BRG-35.itens', { n: totalDoIdioma(doIdioma) }),
      };
    });
    const itens = itensFiltrados();
    const mostrados = itens.slice(0, MOSTRAR_NO_MAXIMO);
    const total = totalDoIdioma(vocabulario.dados[vocabulario.idioma]);
    porId('anki-vocabulario-resumo').textContent = [
      textoDaVoz('BRG-21.resumo', { n: total, idioma: nomeDoIdioma(vocabulario.idioma).toLowerCase() }),
      textoDaVoz('BRG-21.mostrando', { n: mostrados.length }),
    ].join(' · ');

    const foco = document.activeElement?.closest?.('#anki-vocabulario-corpo [data-foco]')?.dataset.foco;
    if (mostrados.length) corpo.replaceChildren(listaEDetalhe(mostrados));
    else corpo.replaceChildren(vazioDaBusca());
    if (foco) corpo.querySelector(`[data-foco="${CSS.escape(foco)}"]`)?.focus();
  }

  /** BRG-20: persistente, com Tentar de novo e a causa em Detalhes. */
  function erroDoVocabulario() {
    return Veio.montarAviso({
      texto: textoDaVoz('BRG-20.aviso'),
      acao: { rotulo: textoDaVoz('BRG-20.tentarDeNovo'), aoUsar: lerVocabulario },
      detalhes: estado.vocabulario.erro,
      fechavel: false,
    });
  }

  /** O vazio BRG-21; Limpar busca só quando há busca ou filtro a limpar. */
  function vazioDaBusca() {
    const { busca, tipo, status } = estado.vocabulario;
    const vazio = elemento('div', 'veio-vazio',
      elemento('p', 'veio-vazio__titulo', textoDaVoz('BRG-21.vazio')),
      elemento('p', 'veio-vazio__texto', textoDaVoz('BRG-35.vazioTexto')));
    if (busca || tipo !== 'all' || status !== 'all') {
      vazio.append(botao(textoDaVoz('BRG-35.limparBusca'), 'veio-botao veio-botao--contorno veio-botao--compacto', limparTudo));
    }
    return vazio;
  }

  function totalDoIdioma(doIdioma) {
    return doIdioma ? numero(doIdioma.total ?? doIdioma.itens.length) : 0;
  }

  function listaEDetalhe(itens) {
    const vocabulario = estado.vocabulario;
    if (!itens.some(item => chaveDoItem(item) === vocabulario.escolhido)) vocabulario.escolhido = chaveDoItem(itens[0]);
    const escolhido = itens.find(item => chaveDoItem(item) === vocabulario.escolhido);

    const lista = elemento('div', 'anki-lista');
    lista.setAttribute('role', 'listbox');
    lista.setAttribute('aria-label', textoDaVoz('SHL-03.vocabulario'));
    lista.addEventListener('keydown', evento => andarNaLista(evento, itens));
    for (const item of itens) lista.append(opcaoDoItem(item));
    return elemento('div', 'anki-lista-e-detalhe',
      elemento('section', 'anki-cartao anki-cartao--lista', lista),
      detalheDoItem(escolhido));
  }

  function statusDoItem(item) {
    return STATUS_DO_ITEM[item.status] || STATUS_DO_ITEM.seen;
  }

  function seloDoItem(item) {
    const { texto, selo } = statusDoItem(item);
    return elemento('span', `veio-selo ${selo}`.trim(), textoDaVoz(texto));
  }

  function opcaoDoItem(item) {
    const chave = chaveDoItem(item);
    const escolhido = chave === estado.vocabulario.escolhido;
    const meta = [
      textoDaVoz(tipoDoItem(item).lista),
      textoDaVoz('BRG-35.cartoes', { n: numero(item.cards) }),
    ].join(' · ');
    const opcao = elemento('div', 'anki-opcao',
      elemento('span', 'anki-opcao__titulo', String(item.word), elemento('small', null, meta)),
      elemento('span', 'anki-opcao__valor', seloDoItem(item)));
    opcao.setAttribute('role', 'option');
    opcao.setAttribute('aria-selected', String(escolhido));
    opcao.tabIndex = escolhido ? 0 : -1;
    opcao.dataset.foco = `item:${chave}`;
    opcao.addEventListener('click', () => escolherItem(chave));
    return opcao;
  }

  function escolherItem(chave) {
    estado.vocabulario.escolhido = chave;
    desenhar();
    porId('anki-vocabulario-corpo').querySelector(`[data-foco="${CSS.escape(`item:${chave}`)}"]`)?.focus();
  }

  /** ↑ ↓ Home End andam pela lista e escolhem o item, como num listbox. */
  function andarNaLista(evento, itens) {
    const indice = itens.findIndex(item => chaveDoItem(item) === estado.vocabulario.escolhido);
    const destino = {
      ArrowDown: Math.min(itens.length - 1, indice + 1),
      ArrowUp: Math.max(0, indice - 1),
      Home: 0,
      End: itens.length - 1,
    }[evento.key];
    if (destino === undefined) return;
    evento.preventDefault();
    escolherItem(chaveDoItem(itens[destino]));
  }

  function detalheDoItem(item) {
    const idDoTitulo = 'anki-vocabulario-detalhe-titulo';
    const series = { maduros: numero(item.mature), recentes: numero(item.recent), novos: numero(item.new) };
    const barra = elemento('div', 'anki-barra-serie anki-barra-serie--grossa');
    barra.setAttribute('aria-hidden', 'true');
    for (const { chave } of MATURIDADE) {
      if (!series[chave]) continue;
      const pedaco = elemento('i', `anki-serie--${chave}`);
      pedaco.style.flex = String(series[chave]);
      barra.append(pedaco);
    }
    const titulo = elemento('h3', null, String(item.word));
    titulo.id = idDoTitulo;
    const linhas = [
      [textoDaVoz('BRG-35.apareceEm'), textoDaVoz('BRG-35.cartoes', { n: numero(item.cards) })],
      ...MATURIDADE.map(({ chave, rotulo }) => [textoDaVoz(rotulo), formatar(series[chave])]),
    ];
    const numeros = elemento('dl', 'anki-partes', ...linhas.flatMap(([rotulo, valor]) =>
      [elemento('dt', null, rotulo), elemento('dd', null, valor)]));
    numeros.append(
      elemento('dt', 'anki-partes__total', textoDaVoz('BRG-35.status')),
      elemento('dd', 'anki-partes__total anki-partes__texto', textoDaVoz(statusDoItem(item).texto)));
    const detalhe = elemento('section', 'anki-cartao anki-detalhe anki-item',
      elemento('p', 'anki-apoio', `${textoDaVoz(tipoDoItem(item).detalhe)} · ${nomeDoIdioma(estado.vocabulario.idioma)}`),
      titulo, barra, numeros);
    detalhe.setAttribute('aria-labelledby', idDoTitulo);
    return detalhe;
  }

  /** Os azulejos Inglês · Russo de uma aba; o escolhido fica em `recorte.idioma`. */
  function montarAzulejos(id, recorte) {
    porId(id).replaceChildren(...IDIOMAS_DOS_AZULEJOS.map(({ idioma }) => {
      const azulejo = botao(null, 'veio-azulejo anki-azulejo', () => {
        recorte.idioma = idioma;
        desenhar();
      });
      azulejo.dataset.idioma = idioma;
      azulejo.append(
        elemento('span', 'anki-azulejo__codigo'),
        elemento('span', 'anki-azulejo__nome', nomeDoIdioma(idioma)),
        elemento('span', 'anki-azulejo__valor'), ' ',
        elemento('span', 'anki-azulejo__envios'));
      return azulejo;
    }));
  }

  function desenharAzulejos(id, recorte, conteudo) {
    for (const azulejo of porId(id).children) {
      const { idioma } = azulejo.dataset;
      const { baralho, valor, legenda } = conteudo(idioma);
      const codigo = textoDaVoz(IDIOMAS_DOS_AZULEJOS.find(item => item.idioma === idioma).codigo);
      const escolhido = idioma === recorte.idioma;
      azulejo.setAttribute('aria-pressed', String(escolhido));
      azulejo.classList.toggle('veio-azulejo--escolhido', escolhido);
      azulejo.querySelector('.anki-azulejo__codigo').textContent = baralho ? `${codigo} · ${baralho}` : codigo;
      azulejo.querySelector('.anki-azulejo__valor').textContent = valor;
      azulejo.querySelector('.anki-azulejo__envios').textContent = legenda;
    }
  }

  function numero(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
  }

  function formatar(valor, casas = 0) {
    return valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  }

  function nomeDoIdioma(idioma) {
    return IDIOMAS[IDIOMAS_DOS_AZULEJOS.find(item => item.idioma === idioma)?.nome] || idioma;
  }

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  function botao(rotulo, classe, aoUsar) {
    const no = elemento('button', classe);
    if (rotulo) no.textContent = rotulo;
    no.type = 'button';
    no.addEventListener('click', aoUsar);
    return no;
  }

  raiz.Baralhos = { usarBaralhos };
  document.addEventListener('DOMContentLoaded', iniciar);
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
