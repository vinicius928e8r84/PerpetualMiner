'use strict';

(function (raiz) {
  const CHAVE_BARALHOS = 'pm_anki_baralhos';
  const CHAVE_VOCABULARIO = 'pm_anki_vocabulario';
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
  const STATUS_DO_ITEM = {
    mature: { texto: 'BRG-35.maduro', selo: 'veio-selo--ok' },
    recent: { texto: 'BRG-35.recente', selo: 'veio-selo--info' },
    mixed: { texto: 'BRG-35.misto', selo: 'veio-selo--parte' },
    new: { texto: 'BRG-35.novo', selo: '' },
    seen: { texto: 'BRG-35.visto', selo: '' },
  };
  const TIPO_DO_ITEM = {
    word: { lista: 'BRG-35.palavra', detalhe: 'BRG-35.tipoPalavra' },
    term: { lista: 'BRG-35.termo', detalhe: 'BRG-35.tipoTermo' },
  };
  const tipoDoItem = item => TIPO_DO_ITEM[item.type] || TIPO_DO_ITEM.word;
  const MATURIDADE = [
    { chave: 'maduros', rotulo: 'BRG-34.maduros' },
    { chave: 'recentes', rotulo: 'BRG-34.recentes' },
    { chave: 'novos', rotulo: 'BRG-34.novos' },
  ];

  const { textoDaVoz, Veio, Shell, ConexaoAnki, IDIOMAS } = raiz;
  const { elemento } = Veio;
  const { haQuanto } = raiz.Contexto;
  const { esqueleto, linhaDeEspera, seloDoDadoAntigo } = raiz.Anki.pecas;
  const { SITUACAO: CONEXAO } = ConexaoAnki;
  const porId = id => document.getElementById(id);

  const leituraDaAba = () => ({ dados: null, quando: 0, nomes: null, carregando: false, erro: null, leitura: 0, idioma: 'en' });
  const estado = {
    nomes: null,
    baralhos: leituraDaAba(),
    vocabulario: { ...leituraDaAba(), tipo: 'all', status: 'all', busca: '', escolhido: null },
  };

  async function iniciar() {
    for (const { nome, recorte } of ABAS) montarAzulejos(`anki-${nome}-azulejos`, recorte);
    montarFiltros();

    const gravado = await chrome.storage.local.get({ [CHAVE_BARALHOS]: null, [CHAVE_VOCABULARIO]: null });
    for (const { recorte, chave } of ABAS) {
      if (gravado[chave]?.dados && !recorte.dados) Object.assign(recorte, gravado[chave]);
    }

    ConexaoAnki.acompanhar(aoMudarAConexao);
    Shell.aoEntrarNaArea('anki', () => lerTudo());
    raiz.Anki.aoAtualizar(() => lerTudo({ deNovo: true, abrirOAnki: true }));
    desenhar();
  }

  function usarBaralhos(nomes) {
    const antes = estado.nomes;
    estado.nomes = { en: nomes.en, ru: nomes.ru };
    if (!antes) lerNaAreaDoAnki({ deNovo: false });
    else if (mudaramOsBaralhos(antes, nomes)) lerNaAreaDoAnki({ deNovo: true });
  }

  function mudaramOsBaralhos(antes, nomes) {
    return IDIOMAS_DOS_AZULEJOS.some(({ idioma }) => antes[idioma] !== nomes[idioma]);
  }

  let anterior = CONEXAO.CONECTANDO;

  const acabouDeLigar = (antes, agora) => agora === CONEXAO.LIGADA && antes !== CONEXAO.LIGADA;

  function aoMudarAConexao(situacao) {
    const antes = anterior;
    anterior = situacao;
    if (acabouDeLigar(antes, situacao)) lerNaAreaDoAnki();
    desenhar();
  }

  function lerNaAreaDoAnki(opcoes) {
    if (Shell.areaAtual() === 'anki') lerTudo(opcoes);
  }

  function desligada() {
    return ConexaoAnki.situacao() === CONEXAO.DESLIGADA;
  }

  function lerTudo(opcoes = {}) {
    if (ConexaoAnki.situacao() !== CONEXAO.LIGADA || !estado.nomes) return;
    lerBaralhos(opcoes);
    lerVocabulario();
  }

  const lerBaralhos = opcoes => lerAba(ABA_DOS_BARALHOS, () => estatisticasDosBaralhos(opcoes));
  const lerVocabulario = () => lerAba(ABA_DO_VOCABULARIO, vocabularioDosBaralhos);

  async function lerAba({ recorte, chave }, pedir) {
    const leitura = ++recorte.leitura;
    recorte.carregando = true;
    recorte.erro = null;
    desenhar();

    const nomes = { ...estado.nomes };
    const { dados, erro } = await pedir();
    const quando = Date.now();
    if (leitura !== recorte.leitura) return;

    recorte.carregando = false;
    recorte.erro = erro;
    if (dados) {
      Object.assign(recorte, { dados, quando, nomes });
      chrome.storage.local.set({ [chave]: { dados, quando, nomes } });
    }
    desenhar();
  }

  async function estatisticasDosBaralhos({ deNovo = false, abrirOAnki = false } = {}) {
    const baralhosPedidos = IDIOMAS_DOS_AZULEJOS.map(({ idioma }) => ({ deckName: estado.nomes[idioma], lang: idioma }));
    const desfecho = await raiz.ConversaComOAnki.pedir(raiz.PedidoAoAnki.estatisticas(baralhosPedidos, { deNovo, abrirOAnki }));
    if (desfecho.ok) return { dados: desfecho.dados, erro: null };
    return { dados: null, erro: `POST /anki/stats/decks · ${desfecho.detalhes}` };
  }

  async function vocabularioDosBaralhos() {
    try {
      const [en, ru] = await Promise.all(IDIOMAS_DOS_AZULEJOS.map(({ idioma }) => vocabularioDoIdioma(idioma)));
      return { dados: { en, ru }, erro: null };
    } catch (falha) {
      return { dados: null, erro: `POST /anki/vocabulary · ${falha.message}` };
    }
  }

  async function vocabularioDoIdioma(idioma) {
    const deckName = estado.nomes[idioma];
    const desfecho = await raiz.ConversaComOAnki.pedir(raiz.PedidoAoAnki.vocabulario(deckName, idioma));
    if (!desfecho.ok) throw new Error(desfecho.detalhes);
    const resposta = desfecho.dados;
    const itens = Array.isArray(resposta.words) ? resposta.words : [];
    return { deckName: resposta.deckName || deckName, itens, total: numero(resposta.totalWords ?? itens.length) };
  }

  const ABA_DOS_BARALHOS = {
    nome: 'baralhos', recorte: estado.baralhos, chave: CHAVE_BARALHOS, alturas: [120, 120], espera: 'BRG-10',
    erro: { texto: 'BRG-11.aviso', rotulo: 'BRG-11.tentarDeNovo', tentarDeNovo: () => lerTudo({ deNovo: true, abrirOAnki: true }) },
    topo: topoDosBaralhos, mostrarControles: mostrarOsAzulejosDosBaralhos, desenharLida: desenharBaralhosLidos,
  };
  const ABA_DO_VOCABULARIO = {
    nome: 'vocabulario', recorte: estado.vocabulario, chave: CHAVE_VOCABULARIO, alturas: [40, 300], espera: 'BRG-19',
    erro: { texto: 'BRG-20.aviso', rotulo: 'BRG-20.tentarDeNovo', tentarDeNovo: lerVocabulario },
    topo: topoDoVocabulario, mostrarControles: desenharOsFiltros, desenharLida: desenharVocabularioLido,
  };
  const ABAS = [ABA_DOS_BARALHOS, ABA_DO_VOCABULARIO];

  const CORPO_SEM_DADOS = {
    esqueleto: aba => [esqueleto(aba.alturas)],
    carregando: aba => [linhaDeEspera(textoDaVoz(aba.espera)), esqueleto(aba.alturas)],
    erro: aba => [oMesmo(`${aba.nome}:erro`, aba.recorte.erro, () => avisoDoErro(aba))],
    nada: aba => [oMesmo(`${aba.nome}:esperando`, true, esperandoOAnki)],
  };

  function desenhar() {
    for (const aba of ABAS) desenharAba(aba);
  }

  function desenharAba(aba) {
    const qual = vista(aba.recorte);
    mostrar(porId(`anki-${aba.nome}-topo`), aba.topo(qual));
    aba.mostrarControles(qual === 'dados' || qual === 'antiga');
    const corpo = porId(`anki-${aba.nome}-corpo`);
    if (qual in CORPO_SEM_DADOS) mostrar(corpo, CORPO_SEM_DADOS[qual](aba));
    else aba.desenharLida(corpo);
  }

  function vista(recorte) {
    if (desligada() && recorte.dados) return 'antiga';
    if (!conexaoApresentada()) return 'esqueleto';
    if (desligada()) return 'nada';
    return vistaDaLeitura(recorte);
  }

  function conexaoApresentada() {
    return ConexaoAnki.ultimaResposta() !== null && ConexaoAnki.apresentada() === ConexaoAnki.situacao();
  }

  function vistaDaLeitura({ dados, carregando, erro }) {
    if (carregando) return 'carregando';
    if (erro) return 'erro';
    return dados ? 'dados' : 'carregando';
  }

  function mostrar(lugar, nos) {
    const iguais = lugar.children.length === nos.length && nos.every((no, i) => lugar.children[i] === no);
    if (!iguais) lugar.replaceChildren(...nos);
  }

  function seloAntigo(quando, motivo = 'anki') {
    return elemento('div', 'anki-antigo', seloDoDadoAntigo(quando, motivo), ...(motivo === 'anki' ? [raiz.AbrirOAnki.montarBotao()] : []));
  }

  const desenhados = new Map();

  function oMesmo(lugar, chave, fabricar) {
    const guardado = desenhados.get(lugar);
    if (guardado?.chave === chave) return guardado.no;
    const no = fabricar();
    desenhados.set(lugar, { chave, no });
    return no;
  }

  function seloDaLeituraAntiga(nome, recorte) {
    return oMesmo(`${nome}:selo`, haQuanto(recorte.quando), () => seloAntigo(recorte.quando));
  }

  function topoDosBaralhos(qual) {
    const { dados } = estado.baralhos;
    if (qual === 'antiga') return [seloDaLeituraAntiga('baralhos', estado.baralhos)];
    if (qual === 'dados' && dados.stale) return [oMesmo('baralhos:cache', dados, () => seloDoCache(dados))];
    return [];
  }

  function mostrarOsAzulejosDosBaralhos(comDados) {
    porId('anki-baralhos-azulejos').hidden = !comDados;
  }

  function desenharBaralhosLidos(corpo) {
    const baralhos = estado.baralhos;
    const decks = decksPorIdioma(baralhos.dados);
    desenharAzulejos('anki-baralhos-azulejos', baralhos, idioma => azulejoDoBaralho(idioma, decks[idioma]));
    const deck = decks[baralhos.idioma];
    mostrar(corpo, [oMesmo('baralhos:detalhe', deck, () => detalheDoBaralho(baralhos.idioma, deck))]);
  }

  function azulejoDoBaralho(idioma, deck) {
    const baralho = nomeDoBaralho(idioma, deck);
    if (deck?.missing) return { baralho, valor: textoDaVoz('BRG-27.valor'), legenda: textoDaVoz('BRG-27.legenda') };
    const palavras = palavrasDoBaralho(deck);
    return { baralho, valor: formatar(palavras), legenda: textoDaVoz('BRG-34.palavras', { n: palavras }) };
  }

  function esperandoOAnki() {
    return elemento('div', 'veio-vazio',
      elemento('p', 'veio-vazio__titulo', textoDaVoz('BRG-37.esperando')),
      elemento('p', 'veio-vazio__texto', textoDaVoz('BRG-37.comeca')),
      raiz.AbrirOAnki.montarBotao());
  }

  function seloDoCache(dados) {
    return seloAntigo(dados.generatedAt || estado.baralhos.quando, 'atualizacao');
  }

  function avisoDoErro({ erro, recorte }) {
    return Veio.montarAviso({
      texto: textoDaVoz(erro.texto),
      acao: { rotulo: textoDaVoz(erro.rotulo), aoUsar: erro.tentarDeNovo },
      detalhes: recorte.erro,
      fechavel: false,
    });
  }

  function decksPorIdioma(dados) {
    const decks = Array.isArray(dados?.decks) ? dados.decks : [];
    return Object.fromEntries(IDIOMAS_DOS_AZULEJOS.map(({ idioma }) => [idioma, decks.find(deck => deck.lang === idioma)]));
  }

  function nomeDoBaralho(idioma, deck) {
    return deck?.deckName || estado.nomes?.[idioma] || '';
  }

  function palavrasDoBaralho(deck) {
    if (!deck) return 0;
    return numero(deck.vocabulary?.phraseVocabulary ?? deck.uniqueTermTokens ?? deck.uniqueTerms);
  }

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
    return elemento('section', 'anki-cartao anki-baralho',
      anelDeMaturidade(series),
      elemento('div', 'anki-baralho__numeros',
        elemento('p', 'anki-apoio', nome),
        elemento('p', 'anki-baralho__palavras', formatar(palavrasDoBaralho(deck))),
        elemento('p', 'anki-apoio', textoDaVoz('BRG-34.palavrasNosCartoes')),
        listaDeNumeros(linhas)));
  }

  function listaDeNumeros(linhas) {
    return elemento('dl', 'anki-partes', ...linhas.flatMap(([rotulo, valor]) => [elemento('dt', null, rotulo), elemento('dd', null, valor)]));
  }

  function marcaDaSerie(chave, texto) {
    const marca = elemento('i', `anki-serie--${chave}`);
    marca.setAttribute('aria-hidden', 'true');
    return elemento('span', 'anki-com-marca', marca, texto);
  }

  function anelDeMaturidade(series) {
    const raio = 52;
    const volta = 2 * Math.PI * raio;
    const total = series.maduros + series.recentes + series.novos;
    const pct = `${total ? Math.round((series.maduros / total) * 100) : 0}%`;
    const svg = noDoAnel('svg', { viewBox: '0 0 132 132', class: 'anki-anel', role: 'img', 'aria-label': textoDaVoz('BRG-34.maturidade', { pct }) });
    const circulo = (classe, traco = {}) => noDoAnel('circle', { cx: 66, cy: 66, r: raio, class: classe, ...traco });
    svg.append(circulo('anki-anel__fundo'));
    let andado = 0;
    for (const { chave } of MATURIDADE) {
      if (!total || !series[chave]) continue;
      const comprimento = (series[chave] / total) * volta;
      svg.append(circulo(`anki-anel__serie anki-serie--${chave}`, {
        'stroke-dasharray': `${Math.max(comprimento - 2, 0)} ${volta}`, 'stroke-dashoffset': String(-andado), transform: 'rotate(-90 66 66)',
      }));
      andado += comprimento;
    }
    const texto = (classe, y, conteudo) => noDoAnel('text', { x: 66, y, 'text-anchor': 'middle', class: classe, 'aria-hidden': 'true' }, conteudo);
    svg.append(texto('anki-anel__pct', 66, pct), texto('anki-anel__rotulo', 82, textoDaVoz('BRG-34.anel')));
    return svg;
  }

  function noDoAnel(tag, atributos, conteudo) {
    const no = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [nome, valor] of Object.entries(atributos)) no.setAttribute(nome, valor);
    if (conteudo) no.textContent = conteudo;
    return no;
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

  function limparTudo() {
    filtrar({ busca: '', tipo: 'all', status: 'all' });
    porId('anki-vocabulario-busca').focus();
  }

  const chaveDoItem = item => `${item.type}:${item.word}`;

  const passaNoFiltro = (escolha, valor) => escolha === 'all' || valor === escolha;
  const contemABusca = (item, procura) => !procura || String(item.word).toLocaleLowerCase().includes(procura);

  function itensFiltrados() {
    const { dados, idioma, tipo, status, busca } = estado.vocabulario;
    const procura = busca.trim().toLocaleLowerCase();
    const itens = dados?.[idioma]?.itens || [];
    return itens.filter(item => passaNoFiltro(tipo, item.type) && passaNoFiltro(status, item.status) && contemABusca(item, procura));
  }

  function topoDoVocabulario(qual) {
    return qual === 'antiga' ? [seloDaLeituraAntiga('vocabulario', estado.vocabulario)] : [];
  }

  function desenharOsFiltros(comDados) {
    const { tipo, status, busca } = estado.vocabulario;
    for (const id of ['anki-vocabulario-azulejos', 'anki-vocabulario-filtros', 'anki-vocabulario-resumo']) porId(id).hidden = !comDados;
    porId('anki-vocabulario-tipo').value = tipo;
    porId('anki-vocabulario-status').value = status;
    const campo = porId('anki-vocabulario-busca');
    if (campo.value !== busca) campo.value = busca;
    porId('anki-vocabulario-limpar').hidden = !busca;
  }

  function desenharVocabularioLido(corpo) {
    desenharAzulejos('anki-vocabulario-azulejos', estado.vocabulario, azulejoDoVocabulario);
    const mostrados = itensFiltrados().slice(0, MOSTRAR_NO_MAXIMO);
    porId('anki-vocabulario-resumo').textContent = resumoDoVocabulario(mostrados.length);
    const foco = focoNaLista();
    corpo.replaceChildren(mostrados.length ? listaEDetalhe(mostrados) : vazioDaBusca());
    if (foco) corpo.querySelector(`[data-foco="${CSS.escape(foco)}"]`)?.focus();
  }

  function azulejoDoVocabulario(idioma) {
    const doIdioma = estado.vocabulario.dados[idioma] || { deckName: nomeDoBaralho(idioma), itens: [] };
    const total = totalDoIdioma(doIdioma);
    return { baralho: doIdioma.deckName, valor: formatar(total), legenda: textoDaVoz('BRG-35.itens', { n: total }) };
  }

  function resumoDoVocabulario(mostrados) {
    const { dados, idioma } = estado.vocabulario;
    return [
      textoDaVoz('BRG-21.resumo', { n: totalDoIdioma(dados[idioma]), idioma: nomeDoIdioma(idioma).toLowerCase() }),
      textoDaVoz('BRG-21.mostrando', { n: mostrados }),
    ].join(' · ');
  }

  function focoNaLista() {
    return document.activeElement?.closest?.('#anki-vocabulario-corpo [data-foco]')?.dataset.foco;
  }

  function algumFiltroLigado({ busca, tipo, status }) {
    return Boolean(busca) || [tipo, status].some(filtro => filtro !== 'all');
  }

  function vazioDaBusca() {
    const vazio = elemento('div', 'veio-vazio',
      elemento('p', 'veio-vazio__titulo', textoDaVoz('BRG-21.vazio')),
      elemento('p', 'veio-vazio__texto', textoDaVoz('BRG-35.vazioTexto')));
    if (algumFiltroLigado(estado.vocabulario)) {
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
    const numeros = listaDeNumeros(linhas);
    numeros.append(
      elemento('dt', 'anki-partes__total', textoDaVoz('BRG-35.status')),
      elemento('dd', 'anki-partes__total anki-partes__texto', textoDaVoz(statusDoItem(item).texto)));
    const detalhe = elemento('section', 'anki-cartao anki-detalhe anki-item',
      elemento('p', 'anki-apoio', `${textoDaVoz(tipoDoItem(item).detalhe)} · ${nomeDoIdioma(estado.vocabulario.idioma)}`),
      titulo, barra, numeros);
    detalhe.setAttribute('aria-labelledby', idDoTitulo);
    return detalhe;
  }

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
