'use strict';

(function (raiz) {
  const { elemento } = raiz.Veio;

  function no(tag, classe, atributos, ...filhos) {
    const novo = elemento(tag, classe, ...filhos);
    for (const [nome, valor] of Object.entries(atributos)) novo.setAttribute(nome, valor);
    return novo;
  }

  const voz = id => ({ 'data-voz': id });
  const vozAria = id => ({ 'data-voz-aria': id });
  const escondido = { hidden: '' };
  const icone = nome => no('span', '', { 'data-icone': nome });
  const textoDaVoz = id => no('span', '', voz(id));
  const vazio = (tag, classe, id, extras = {}) => no(tag, classe, { id, ...extras });
  const azulejos = (id, vozDosIdiomas) => vazio('div', 'anki-azulejos', id, { role: 'group', ...vozAria(vozDosIdiomas), ...escondido });

  function opcao(nome, valor, vozDoRotulo, extras = {}) {
    return no('label', 'veio-segmentado__opcao', {},
      no('input', '', { type: 'radio', name: nome, value: valor, ...extras }), textoDaVoz(vozDoRotulo));
  }

  function grupoDeOpcoes(classe, vozDoRotulo, ...opcoes) {
    return no('div', classe, { role: 'radiogroup', ...vozAria(vozDoRotulo) }, ...opcoes);
  }

  function cabecalho() {
    return no('header', 'shell-cabecalho', {},
      no('h1', '', { id: 'titulo-anki', ...voz('SHL-02.anki') }),
      no('button', 'veio-botao veio-botao--contorno', { id: 'btn-anki-atualizar', 'data-voz-title': 'BRG-24' }, icone('atualizar'), textoDaVoz('SHL-06')));
  }

  function faixaDaConexao() {
    return no('div', 'veio-aviso shell-faixa', { id: 'shell-faixa-conexao', role: 'status', ...escondido },
      no('p', 'veio-aviso__texto', voz('ENV-01.aviso')),
      no('div', 'veio-aviso__acoes', {},
        no('button', 'veio-botao veio-botao--contorno veio-botao--compacto', { id: 'shell-tentar-de-novo', ...voz('ENV-01.tentarDeNovo') })));
  }

  function faixaConectando() {
    return no('div', 'anki-faixa-conectando', { id: 'anki-conectando', role: 'status', ...escondido },
      no('span', 'anki-ponto', { 'aria-hidden': 'true' }), textoDaVoz('BRG-02'));
  }

  const quadroDaPrimeiraVez = (titulo, texto) => no('div', 'apv-quadro', {},
    no('h3', '', voz(titulo)), no('p', '', voz(texto)));

  function rodapeDaPrimeiraVez() {
    return no('div', 'apv-rodape', { id: 'apv-rodape' },
      no('p', 'apv-confere', {}, no('span', 'anki-ponto', { 'aria-hidden': 'true' }), vazio('span', '', 'apv-confere')),
      no('div', 'apv-quadros', {},
        quadroDaPrimeiraVez('ONB-16.continuaTitulo', 'ONB-16.continua'),
        quadroDaPrimeiraVez('ONB-16.indisponivelTitulo', 'ONB-16.indisponivel')));
  }

  function primeiraVez() {
    return no('section', 'anki-primeira-vez', { id: 'anki-primeira-vez', 'aria-labelledby': 'anki-primeira-vez-titulo', ...escondido },
      no('div', 'apv-topo', {},
        vazio('h2', 'apv-titulo', 'anki-primeira-vez-titulo'),
        no('p', 'apv-apoio', { id: 'apv-apoio', ...voz('ONB-16.apoio') })),
      vazio('div', '', 'apv-passos'),
      rodapeDaPrimeiraVez());
  }

  function abas() {
    return grupoDeOpcoes('veio-segmentado shell-abas', 'SHL-03.rotulo',
      opcao('aba-anki', 'custos', 'SHL-03.custos'),
      opcao('aba-anki', 'baralhos', 'SHL-03.baralhos'),
      opcao('aba-anki', 'vocabulario', 'SHL-03.vocabulario'),
      opcao('aba-anki', 'ajustes', 'SHL-03.ajustes'));
  }

  function periodoDosCustos() {
    return no('div', 'anki-barra', {},
      grupoDeOpcoes('veio-segmentado', 'BRG-28.periodo',
        opcao('periodo-custos', 'hoje', 'BRG-28.hoje'),
        opcao('periodo-custos', 'mes', 'BRG-28.mes', { checked: '' }),
        opcao('periodo-custos', 'tudo', 'BRG-28.tudo')),
      no('div', 'anki-datas', {},
        dataDosCustos('BRG-28.de', 'anki-custos-de'),
        dataDosCustos('BRG-28.ate', 'anki-custos-ate')));
  }

  const dataDosCustos = (vozDoRotulo, id) => no('label', 'anki-data', {}, textoDaVoz(vozDoRotulo), vazio('input', '', id, { type: 'date' }));

  const chaveDosCustos = (id, vozDoRotulo) => no('label', 'veio-toggle', {},
    vazio('input', '', id, { type: 'checkbox' }), no('span', 'veio-toggle__trilho', {}), textoDaVoz(vozDoRotulo));

  function diagnosticoDosCustos() {
    return no('div', 'anki-diagnostico', {},
      no('h3', '', voz('BRG-32.diagnostico')),
      no('p', 'anki-apoio', voz('BRG-32.diagnosticoTexto')),
      no('table', 'anki-tabela', {}, vazio('tbody', '', 'anki-custos-diagnostico')),
      vazio('p', 'anki-motivo', 'anki-diagnostico-falha', { role: 'alert', ...escondido }));
  }

  function avancadoDosCustos() {
    return no('details', 'anki-avancado', { id: 'anki-custos-avancado', ...escondido },
      no('summary', '', {}, textoDaVoz('BRG-32.titulo'), ' ', no('small', '', {}, '· ', textoDaVoz('BRG-32.resumo'))),
      no('div', 'anki-avancado__corpo', {},
        vazio('dl', 'anki-numeros', 'anki-custos-avancado-numeros'),
        no('div', 'anki-avancado__chaves', {}, chaveDosCustos('anki-quatro-casas', 'BRG-32.quatroCasas'), chaveDosCustos('anki-ids-dos-envios', 'BRG-32.ids')),
        diagnosticoDosCustos()));
  }

  function abaDosCustos() {
    return no('div', 'shell-aba', { 'data-aba': 'custos' },
      no('div', 'anki-custos', { id: 'anki-custos' },
        vazio('div', 'anki-antigo', 'anki-custos-antigo', escondido),
        periodoDosCustos(),
        azulejos('anki-custos-azulejos', 'BRG-28.idiomas'),
        vazio('div', '', 'anki-custos-corpo'),
        avancadoDosCustos()));
  }

  function abaDosBaralhos() {
    return no('div', 'shell-aba', { 'data-aba': 'baralhos', ...escondido },
      no('div', 'anki-baralhos', { id: 'anki-baralhos' },
        vazio('div', 'anki-topo', 'anki-baralhos-topo'),
        azulejos('anki-baralhos-azulejos', 'BRG-34.idiomas'),
        vazio('div', 'anki-corpo', 'anki-baralhos-corpo')));
  }

  const seletorDoVocabulario = (id, vozDoRotulo) => no('span', 'veio-select', {}, vazio('select', 'veio-campo', id, vozAria(vozDoRotulo)));

  function buscaDoVocabulario() {
    return no('label', 'veio-busca anki-busca', {},
      no('span', 'veio-busca__lupa', {}, icone('busca')),
      vazio('input', 'veio-campo', 'anki-vocabulario-busca', { type: 'search', autocomplete: 'off', ...vozAria('BRG-35.buscar') }),
      no('button', 'veio-botao-icone veio-busca__limpar',
        { id: 'anki-vocabulario-limpar', ...vozAria('BRG-35.limparBusca'), 'data-voz-title': 'BRG-35.limparBusca', ...escondido }, icone('fechar')));
  }

  function filtrosDoVocabulario() {
    return no('div', 'anki-filtros', { id: 'anki-vocabulario-filtros', ...escondido },
      seletorDoVocabulario('anki-vocabulario-tipo', 'BRG-35.tipo'),
      seletorDoVocabulario('anki-vocabulario-status', 'BRG-35.status'),
      buscaDoVocabulario());
  }

  function abaDoVocabulario() {
    return no('div', 'shell-aba', { 'data-aba': 'vocabulario', ...escondido },
      no('div', 'anki-vocabulario', { id: 'anki-vocabulario' },
        vazio('div', 'anki-topo', 'anki-vocabulario-topo'),
        azulejos('anki-vocabulario-azulejos', 'BRG-35.idiomas'),
        filtrosDoVocabulario(),
        vazio('p', 'anki-apoio anki-resumo', 'anki-vocabulario-resumo', { role: 'status', ...escondido }),
        vazio('div', 'anki-corpo', 'anki-vocabulario-corpo')));
  }

  function abaDosAjustes() {
    return no('div', 'shell-aba', { 'data-aba': 'ajustes', ...escondido },
      no('p', 'anki-nota', { id: 'anki-ajustes-nota', ...voz('BRG-33.ajustes'), ...escondido }),
      no('div', 'ajustes', { id: 'ajustes' },
        vazio('div', 'ajustes-aviso', 'ajustes-aviso'),
        vazio('div', 'shell-cards ajustes-cards', 'ajustes-cards', { role: 'group', ...vozAria('BRG-07.idiomas') })));
  }

  function areaDoAnki() {
    return no('section', 'shell-area', { 'data-area': 'anki', 'aria-labelledby': 'titulo-anki', ...escondido },
      cabecalho(), faixaDaConexao(), faixaConectando(), primeiraVez(), abas(),
      abaDosCustos(), abaDosBaralhos(), abaDoVocabulario(), abaDosAjustes());
  }

  document.querySelector('.shell-conteudo').append(areaDoAnki());
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
