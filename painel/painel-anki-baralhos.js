'use strict';

(function (raiz) {
  const CHAVE_BARALHOS = 'pm_anki_baralhos';
  const CHAVE_VOCABULARIO = 'pm_anki_vocabulario';

  const IDIOMAS_DOS_AZULEJOS = [
    { idioma: 'en', codigo: 'BRG-28.codigoEn', nome: 'INGLES' },
    { idioma: 'ru', codigo: 'BRG-28.codigoRu', nome: 'RUSSO' },
  ];
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
  const { Vocabulario } = raiz;
  const porId = id => document.getElementById(id);

  const leituraDaAba = () => ({ dados: null, quando: 0, nomes: null, carregando: false, erro: null, leitura: 0, idioma: 'en' });
  const estado = {
    nomes: null,
    baralhos: leituraDaAba(),
    vocabulario: { ...leituraDaAba(), tipo: 'all', status: 'all', busca: '', escolhido: null },
  };

  async function iniciar() {
    for (const { nome, recorte } of ABAS) montarAzulejos(`anki-${nome}-azulejos`, recorte);
    Vocabulario.montarFiltros();

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

  Vocabulario.usar({
    estado,
    desenhar,
    comum: { numero, formatar, nomeDoIdioma, botao, listaDeNumeros, nomeDoBaralho, seloDaLeituraAntiga, desenharAzulejos, MATURIDADE },
  });

  const ABA_DOS_BARALHOS = {
    nome: 'baralhos', recorte: estado.baralhos, chave: CHAVE_BARALHOS, alturas: [120, 120], espera: 'BRG-10',
    erro: { texto: 'BRG-11.aviso', rotulo: 'BRG-11.tentarDeNovo', tentarDeNovo: () => lerTudo({ deNovo: true, abrirOAnki: true }) },
    topo: topoDosBaralhos, mostrarControles: mostrarOsAzulejosDosBaralhos, desenharLida: desenharBaralhosLidos,
  };
  const ABA_DO_VOCABULARIO = {
    nome: 'vocabulario', recorte: estado.vocabulario, chave: CHAVE_VOCABULARIO, alturas: [40, 300], espera: 'BRG-19',
    erro: { texto: 'BRG-20.aviso', rotulo: 'BRG-20.tentarDeNovo', tentarDeNovo: lerVocabulario },
    topo: Vocabulario.topo, mostrarControles: Vocabulario.mostrarControles, desenharLida: Vocabulario.desenharLida,
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
