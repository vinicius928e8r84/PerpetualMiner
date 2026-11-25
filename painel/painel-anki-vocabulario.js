'use strict';

(function (raiz) {
  const MOSTRAR_NO_MAXIMO = 200;

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

  const { textoDaVoz, Veio } = raiz;
  const { elemento } = Veio;
  const porId = id => document.getElementById(id);

  let estado = null;
  let desenhar = null;
  let comum = null;

  function usar(entrada) {
    ({ estado, desenhar, comum } = entrada);
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
    return qual === 'antiga' ? [comum.seloDaLeituraAntiga('vocabulario', estado.vocabulario)] : [];
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
    comum.desenharAzulejos('anki-vocabulario-azulejos', estado.vocabulario, azulejoDoVocabulario);
    const mostrados = itensFiltrados().slice(0, MOSTRAR_NO_MAXIMO);
    porId('anki-vocabulario-resumo').textContent = resumoDoVocabulario(mostrados.length);
    const foco = focoNaLista();
    corpo.replaceChildren(mostrados.length ? listaEDetalhe(mostrados) : vazioDaBusca());
    if (foco) corpo.querySelector(`[data-foco="${CSS.escape(foco)}"]`)?.focus();
  }

  function azulejoDoVocabulario(idioma) {
    const doIdioma = estado.vocabulario.dados[idioma] || { deckName: comum.nomeDoBaralho(idioma), itens: [] };
    const total = totalDoIdioma(doIdioma);
    return { baralho: doIdioma.deckName, valor: comum.formatar(total), legenda: textoDaVoz('BRG-35.itens', { n: total }) };
  }

  function resumoDoVocabulario(mostrados) {
    const { dados, idioma } = estado.vocabulario;
    return [
      textoDaVoz('BRG-21.resumo', { n: totalDoIdioma(dados[idioma]), idioma: comum.nomeDoIdioma(idioma).toLowerCase() }),
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
      vazio.append(comum.botao(textoDaVoz('BRG-35.limparBusca'), 'veio-botao veio-botao--contorno veio-botao--compacto', limparTudo));
    }
    return vazio;
  }

  function totalDoIdioma(doIdioma) {
    return doIdioma ? comum.numero(doIdioma.total ?? doIdioma.itens.length) : 0;
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
      textoDaVoz('BRG-35.cartoes', { n: comum.numero(item.cards) }),
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
    const series = { maduros: comum.numero(item.mature), recentes: comum.numero(item.recent), novos: comum.numero(item.new) };
    const barra = elemento('div', 'anki-barra-serie anki-barra-serie--grossa');
    barra.setAttribute('aria-hidden', 'true');
    for (const { chave } of comum.MATURIDADE) {
      if (!series[chave]) continue;
      const pedaco = elemento('i', `anki-serie--${chave}`);
      pedaco.style.flex = String(series[chave]);
      barra.append(pedaco);
    }
    const titulo = elemento('h3', null, String(item.word));
    titulo.id = idDoTitulo;
    const linhas = [
      [textoDaVoz('BRG-35.apareceEm'), textoDaVoz('BRG-35.cartoes', { n: comum.numero(item.cards) })],
      ...comum.MATURIDADE.map(({ chave, rotulo }) => [textoDaVoz(rotulo), comum.formatar(series[chave])]),
    ];
    const numeros = comum.listaDeNumeros(linhas);
    numeros.append(
      elemento('dt', 'anki-partes__total', textoDaVoz('BRG-35.status')),
      elemento('dd', 'anki-partes__total anki-partes__texto', textoDaVoz(statusDoItem(item).texto)));
    const detalhe = elemento('section', 'anki-cartao anki-detalhe anki-item',
      elemento('p', 'anki-apoio', `${textoDaVoz(tipoDoItem(item).detalhe)} · ${comum.nomeDoIdioma(estado.vocabulario.idioma)}`),
      titulo, barra, numeros);
    detalhe.setAttribute('aria-labelledby', idDoTitulo);
    return detalhe;
  }

  raiz.Vocabulario = {
    usar, montarFiltros, topo: topoDoVocabulario, mostrarControles: desenharOsFiltros, desenharLida: desenharVocabularioLido,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
