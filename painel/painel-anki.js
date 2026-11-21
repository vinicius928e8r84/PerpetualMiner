'use strict';

(function (raiz) {
  const CHAVE_CUSTOS = 'pm_anki_custos';
  const CHAVE_QUATRO_CASAS = 'pm_anki_quatro_casas';
  const CHAVE_IDS = 'pm_anki_ids_dos_envios';

  const IDIOMAS_DOS_AZULEJOS = [
    { idioma: 'all', codigo: 'BRG-28.codigoTodos' },
    { idioma: 'en', codigo: 'BRG-28.codigoEn' },
    { idioma: 'ru', codigo: 'BRG-28.codigoRu' },
  ];
  const CODIGO_DO_IDIOMA = Object.fromEntries(IDIOMAS_DOS_AZULEJOS.map(({ idioma, codigo }) => [idioma, codigo]));
  const NOME_DO_IDIOMA = { en: 'INGLES', ru: 'RUSSO' };
  const ORIGENS = [
    { chave: 'real', rotulo: 'BRG-09.fotoReal', serie: 'real' },
    { chave: 'generated', rotulo: 'BRG-09.geradaPorIa', serie: 'gerada' },
    { chave: 'skipped', rotulo: 'BRG-09.semImagem', serie: 'sem' },
    { chave: 'failed', rotulo: 'BRG-09.falhou', serie: 'falhou' },
  ];

  const { textoDaVoz, Veio, Shell, ConexaoAnki, Contexto, IDIOMAS, PrimeiraConexao, PedidoAoAnki, ConversaComOAnki, PlanoDosCustos, SomaDosCustos, RetratoDosCustos } = raiz;
  const { elemento } = Veio;
  const { numero, partes } = SomaDosCustos;
  const somar = envios => SomaDosCustos.somar(envios, ORIGENS);
  const { haQuanto } = Contexto;
  const { ENDERECO: ENDERECO_DA_CONEXAO, SITUACAO: CONEXAO } = ConexaoAnki;
  const porId = id => document.getElementById(id);
  const { datasDoPeriodo, linhasDosCustos, naoEntraram, resultadoDaLeitura, situacaoDoDetalhe, statusDoEnvio } = RetratoDosCustos;

  const estado = {
    periodo: 'mes',
    de: '',
    ate: '',
    idioma: 'all',
    dados: null,
    carregando: false,
    erro: null,
    escolhido: null,
    quatroCasas: false,
    ids: false,
    leitura: 0,
    falhasAoRetomar: new Map(),
    apagados: new Set(),
    diagnosticoFalhou: false,
  };
  const ouvintesDoAtualizar = [];
  const continuar = raiz.ContinuarEnvioNosCustos.criar({ estado, ler, desenhar, marcarIndisponivel });

  async function iniciar() {
    PrimeiraConexao.montar();
    montarAzulejos();
    ligarControles();

    const gravado = await chrome.storage.local.get({
      [CHAVE_CUSTOS]: null,
      [CHAVE_QUATRO_CASAS]: false,
      [CHAVE_IDS]: false,
    });
    estado.quatroCasas = gravado[CHAVE_QUATRO_CASAS] === true;
    estado.ids = gravado[CHAVE_IDS] === true;
    porId('anki-quatro-casas').checked = estado.quatroCasas;
    porId('anki-ids-dos-envios').checked = estado.ids;
    const ultimo = gravado[CHAVE_CUSTOS];
    if (ultimo && Array.isArray(ultimo.envios)) {
      estado.dados = ultimo;
      Object.assign(estado, { periodo: ultimo.periodo, de: ultimo.de, ate: ultimo.ate });
    } else {
      Object.assign(estado, datasDoPeriodo('mes'));
    }

    await ConexaoAnki.pronta;
    ConexaoAnki.acompanhar(aoMudarAConexao);
    Shell.aoEntrarNaArea('anki', () => { if (situacaoDaConexao() === CONEXAO.LIGADA) ler(); });
    desenhar();
  }

  function ligarControles() {
    for (const radio of document.querySelectorAll('input[name="periodo-custos"]')) {
      radio.addEventListener('change', () => { if (radio.checked) escolherPeriodo(radio.value); });
    }
    for (const campo of [porId('anki-custos-de'), porId('anki-custos-ate')]) {
      campo.addEventListener('change', () => {
        Object.assign(estado, { periodo: 'datas', de: porId('anki-custos-de').value, ate: porId('anki-custos-ate').value });
        ler();
      });
    }
    porId('btn-anki-atualizar').addEventListener('click', atualizarTudo);
    porId('anki-quatro-casas').addEventListener('change', evento => {
      estado.quatroCasas = evento.target.checked;
      chrome.storage.local.set({ [CHAVE_QUATRO_CASAS]: estado.quatroCasas });
      desenhar();
    });
    porId('anki-ids-dos-envios').addEventListener('change', evento => {
      estado.ids = evento.target.checked;
      chrome.storage.local.set({ [CHAVE_IDS]: estado.ids });
      desenhar();
    });
  }

  const situacaoDaConexao = () => ConexaoAnki.situacao();
  const jaRespondeu = () => ConexaoAnki.ultimaResposta() !== null && ConexaoAnki.apresentada() === situacaoDaConexao();

  let anterior = CONEXAO.CONECTANDO;

  const acabouDeLigar = (antes, situacao) => situacao === CONEXAO.LIGADA && antes !== CONEXAO.LIGADA;
  const naAreaDoAnki = () => Shell.areaAtual() === 'anki';

  function aoMudarAConexao(situacao) {
    const antes = anterior;
    anterior = situacao;
    if (acabouDeLigar(antes, situacao) && naAreaDoAnki()) ler();
    desenhar();
  }

  async function atualizar() {
    const situacao = await ConexaoAnki.conferir();
    if (situacao === CONEXAO.LIGADA) ler();
    return situacao;
  }

  async function atualizarTudo() {
    if (await atualizar() === CONEXAO.LIGADA) for (const ouvinte of ouvintesDoAtualizar) ouvinte();
  }

  function aoAtualizar(ouvinte) {
    ouvintesDoAtualizar.push(ouvinte);
  }

  function escolherPeriodo(periodo) {
    Object.assign(estado, datasDoPeriodo(periodo));
    ler();
  }

  const caladaDuranteOutraLeitura = calado => calado && estado.carregando;
  const outraLeituraVeioDepois = leitura => leitura !== estado.leitura;
  const caladaSemEnvios = (calado, envios) => calado && !envios;

  function mostrarQueLe() {
    estado.carregando = true;
    estado.erro = null;
    desenhar();
  }

  async function lerOsEnvios({ de, ate }) {
    const pedidoDosCustos = PedidoAoAnki.custosDosEnvios({ de, ate });
    const pedido = `POST /analytics/jobs ${JSON.stringify(pedidoDosCustos.corpo)}`;
    return resultadoDaLeitura(await ConversaComOAnki.pedir(pedidoDosCustos), pedido);
  }

  function guardarALeitura(leitura) {
    estado.dados = leitura;
    chrome.storage.local.set({ [CHAVE_CUSTOS]: estado.dados });
  }

  async function ler({ calado = false } = {}) {
    if (caladaDuranteOutraLeitura(calado)) return;
    const leitura = ++estado.leitura;
    const { periodo, de, ate } = estado;
    if (!calado) mostrarQueLe();

    const { envios, erro } = await lerOsEnvios({ de, ate });
    if (outraLeituraVeioDepois(leitura) || caladaSemEnvios(calado, envios)) return;

    estado.carregando = false;
    estado.erro = erro;
    if (envios) guardarALeitura({ quando: Date.now(), periodo, de, ate, envios });
    desenhar();
  }

  function desenhar() {
    porId('anki-conectando').hidden = jaRespondeu() || situacaoDaConexao() !== CONEXAO.CONECTANDO;
    porId('anki-ajustes-nota').hidden = !desligada();
    desenharCustos();
  }

  function desligada() {
    return situacaoDaConexao() === CONEXAO.DESLIGADA;
  }

  function marcarIndisponivel(botao, idDaDica) {
    if (desligada()) {
      botao.setAttribute('aria-disabled', 'true');
      botao.setAttribute('aria-describedby', idDaDica);
    } else {
      botao.removeAttribute('aria-disabled');
      botao.removeAttribute('aria-describedby');
    }
  }

  function vistaDosCustos() {
    const { carregando, erro, dados } = estado;
    return RetratoDosCustos.vistaDosCustos({ desligada: desligada(), respondeu: jaRespondeu(), carregando, erro, dados });
  }

  function desenharCustos() {
    const vista = vistaDosCustos();
    const comDados = vista === 'dados' || vista === 'antiga';
    desenharOPeriodo(vista === 'antiga');
    desenharOSeloAntigo(vista === 'antiga');
    porId('anki-custos-azulejos').hidden = !comDados;
    porId('anki-custos-avancado').hidden = !comDados;
    desenharOCorpo(vista);
  }

  function desenharOPeriodo(antiga) {
    const periodo = antiga ? estado.dados : estado;
    for (const radio of document.querySelectorAll('input[name="periodo-custos"]')) {
      radio.checked = radio.value === periodo.periodo;
      radio.disabled = antiga;
    }
    for (const [campo, valor] of [[porId('anki-custos-de'), periodo.de], [porId('anki-custos-ate'), periodo.ate]]) {
      campo.value = valor || '';
      campo.disabled = antiga;
    }
  }

  function desenharOSeloAntigo(antiga) {
    const antigo = porId('anki-custos-antigo');
    antigo.hidden = !antiga;
    if (antiga) antigo.replaceChildren(...partesDoSeloAntigo(estado.dados.quando));
  }

  const PECAS_DA_VISTA = {
    esqueleto: () => [esqueleto()],
    carregando: () => [linhaDeEspera(textoDaVoz('BRG-25')), esqueleto()],
    erro: erroDosCustos,
    vazio: () => [vazioDosCustos()],
    dados: pecasDosEnvios,
    antiga: pecasDosEnvios,
  };

  const focoNoCorpo = () => document.activeElement?.closest?.('#anki-custos-corpo [data-foco]')?.dataset.foco;

  function desenharOCorpo(vista) {
    const foco = focoNoCorpo();
    const corpo = porId('anki-custos-corpo');
    corpo.replaceChildren(...PECAS_DA_VISTA[vista]());
    if (foco) corpo.querySelector(`[data-foco="${CSS.escape(foco)}"]`)?.focus();
  }

  function pecasDosEnvios() {
    const envios = enviosDoIdioma();
    desenharAzulejos();
    const soma = somar(envios);
    desenharAvancado(envios, soma);
    return [PlanoDosCustos.cartao(envios, dinheiro), faixaDeResumo(soma), origemDasImagens(soma), listaEDetalhe(envios)].filter(Boolean);
  }

  function partesDoSeloAntigo(quando, causa = `GET ${ENDERECO_DA_CONEXAO}/health · sem resposta`) {
    return [seloDoDadoAntigo(quando), Veio.montarDetalhes(causa)];
  }

  function seloDoDadoAntigo(quando, motivo = 'anki') {
    return elemento('span', 'anki-selo-antigo', textoDaVoz(`BRG-12.${motivo}`, { quando: haQuanto(quando) }));
  }

  function esqueleto(alturas = [96, 44, 200]) {
    const bloco = elemento('div', 'anki-esqueleto');
    bloco.setAttribute('aria-hidden', 'true');
    for (const altura of alturas) {
      const linha = elemento('div', 'veio-esqueleto');
      linha.style.height = `${altura}px`;
      bloco.append(linha);
    }
    return bloco;
  }

  function linhaDeEspera(texto) {
    const ponto = elemento('span', 'anki-ponto');
    ponto.setAttribute('aria-hidden', 'true');
    const linha = elemento('p', 'anki-espera', ponto, texto);
    linha.setAttribute('role', 'status');
    return linha;
  }

  function erroDosCustos() {
    const total = elemento('dl', 'anki-numero anki-numero--indisponivel',
      elemento('dt', null, textoDaVoz('BRG-29.total')),
      elemento('dd', null, textoDaVoz('BRG-03.indisponivel')));
    if (desligada()) return [total];
    const aviso = Veio.montarAviso({
      texto: textoDaVoz('BRG-04.aviso'),
      acao: { rotulo: textoDaVoz('BRG-04.tentarDeNovo'), aoUsar: atualizar },
      detalhes: estado.erro,
      fechavel: false,
    });
    return [total, aviso];
  }

  function vazioDosCustos() {
    const vazio = elemento('div', 'veio-vazio',
      elemento('p', 'veio-vazio__titulo', textoDaVoz('BRG-22')),
      elemento('p', 'veio-vazio__texto', textoDaVoz('BRG-33.vazioTexto')));
    if (estado.periodo !== 'tudo') {
      vazio.append(botao(textoDaVoz('BRG-33.verTudo'), 'veio-botao veio-botao--contorno veio-botao--compacto',
        () => escolherPeriodo('tudo')));
    }
    return vazio;
  }

  function formatar(valor, casas) {
    return valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  }

  function dinheiro(valor, { quatroCasas = estado.quatroCasas } = {}) {
    if (!Number.isFinite(valor)) return textoDaVoz('BRG-03.indisponivel');
    const casas = quatroCasas ? 4 : 2;
    const menor = 10 ** -casas;
    if (valor > 0 && valor < menor) return textoDaVoz('BRG-26', { valor: formatar(menor, casas) });
    return textoDaVoz('BRG-03.valor', { valor: formatar(valor, casas) });
  }

  function fracao(parte, total) {
    return total ? Math.round((parte / total) * 1000) / 10 : 0;
  }

  function porcento(parte, total) {
    const pct = fracao(parte, total);
    return `${formatar(pct, pct % 1 ? 1 : 0)}%`;
  }

  function nomeDoIdioma(lang) {
    return IDIOMAS[NOME_DO_IDIOMA[lang]] || lang;
  }

  function tituloDoEnvio(envio) {
    return textoDaVoz('ENV-08.titulo', { idioma: nomeDoIdioma(envio.lang).toLowerCase(), n: numero(envio.requestedCards) });
  }

  function enviosDoIdioma(idioma = estado.idioma) {
    return RetratoDosCustos.enviosDoIdioma(estado.dados.envios, idioma);
  }

  function montarAzulejos() {
    porId('anki-custos-azulejos').replaceChildren(...IDIOMAS_DOS_AZULEJOS.map(({ idioma, codigo }) => {
      const azulejo = botao(null, 'veio-azulejo anki-azulejo', () => {
        estado.idioma = idioma;
        desenhar();
      });
      azulejo.dataset.idioma = idioma;
      azulejo.append(
        elemento('span', 'anki-azulejo__codigo', textoDaVoz(codigo)),
        elemento('span', 'anki-azulejo__nome', idioma === 'all' ? textoDaVoz('BRG-28.todos') : nomeDoIdioma(idioma)),
        elemento('span', 'anki-azulejo__valor'),
        elemento('span', 'anki-azulejo__envios'));
      return azulejo;
    }));
  }

  function desenharAzulejos() {
    for (const azulejo of porId('anki-custos-azulejos').children) {
      const soma = somar(enviosDoIdioma(azulejo.dataset.idioma));
      const escolhido = azulejo.dataset.idioma === estado.idioma;
      azulejo.setAttribute('aria-pressed', String(escolhido));
      azulejo.classList.toggle('veio-azulejo--escolhido', escolhido);
      azulejo.querySelector('.anki-azulejo__valor').textContent = dinheiro(soma.total);
      azulejo.querySelector('.anki-azulejo__envios').textContent = textoDaVoz('BRG-28.envios', { n: soma.n });
    }
  }

  function faixaDeResumo(soma) {
    const item = (rotulo, valor) => elemento('span', null, rotulo, ' ', elemento('b', null, valor));
    const faixa = elemento('p', 'anki-faixa-resumo',
      item(textoDaVoz('BRG-08.criacaoDeCartoes'), dinheiro(soma.cartoes)),
      item(textoDaVoz('BRG-08.imagensGeradas'), dinheiro(soma.geradas)),
      item(textoDaVoz('BRG-08.economia'), dinheiro(soma.economia)),
      ...(soma.correcao > 0 ? [item(textoDaVoz('BRG-51'), dinheiro(soma.correcao))] : []),
      item(textoDaVoz('BRG-29.frases'), textoDaVoz('BRG-29.deTotal', { n: soma.enviadas, total: soma.pedidas })),
      item(textoDaVoz('BRG-29.enviosConcluidos'), textoDaVoz('BRG-29.deTotal', { n: soma.concluidos, total: soma.n })));
    faixa.id = 'anki-custos-faixa';
    return faixa;
  }

  function origemDasImagens(soma) {
    const cartao = elemento('section', 'anki-cartao',
      elemento('h3', null, textoDaVoz('BRG-30.titulo')),
      elemento('p', 'anki-apoio', textoDaVoz('BRG-30.imagens', { n: soma.imagens })),
      elemento('div', 'anki-origens', ...ORIGENS.map(origem => {
        const barra = elemento('div', 'anki-barra-serie', elemento('i', `anki-serie--${origem.serie}`));
        barra.firstChild.style.width = `${fracao(soma[origem.chave], soma.imagens)}%`;
        barra.setAttribute('aria-hidden', 'true');
        return elemento('div', 'anki-origem',
          elemento('div', 'anki-origem__topo', elemento('span', null, textoDaVoz(origem.rotulo)),
            elemento('b', null, porcento(soma[origem.chave], soma.imagens))),
          barra,
          elemento('small', null, textoDaVoz('BRG-30.imagens', { n: soma[origem.chave] })));
      })));
    cartao.id = 'anki-custos-imagens';
    return cartao;
  }

  function listaEDetalhe(envios) {
    if (!envios.some(envio => envio.jobId === estado.escolhido)) estado.escolhido = envios[0]?.jobId || null;
    const escolhido = envios.find(envio => envio.jobId === estado.escolhido);

    const lista = elemento('div', 'anki-lista');
    lista.setAttribute('role', 'listbox');
    lista.setAttribute('aria-label', textoDaVoz('BRG-31.titulo'));
    lista.addEventListener('keydown', evento => andarNaLista(evento, envios));
    for (const envio of envios) lista.append(opcaoDoEnvio(envio));

    const cartaoDaLista = elemento('section', 'anki-cartao anki-cartao--lista',
      elemento('h3', null, textoDaVoz('BRG-31.titulo'), ' ',
        elemento('small', null, `· ${textoDaVoz('BRG-28.envios', { n: envios.length })}`)),
      lista);
    const partesDaTela = [cartaoDaLista];
    if (escolhido) partesDaTela.push(detalheDoEnvio(escolhido));
    return elemento('div', 'anki-lista-e-detalhe', ...partesDaTela);
  }

  function opcaoDoEnvio(envio) {
    const escolhido = envio.jobId === estado.escolhido;
    const meta = [haQuanto(envio.createdAt)];
    if (estado.ids) meta.push(envio.jobId);
    const ponto = elemento('span', `anki-ponto-status anki-ponto-status--${statusDoEnvio(envio).tom}`);
    ponto.setAttribute('aria-hidden', 'true');
    const opcao = elemento('div', 'anki-opcao',
      elemento('span', 'anki-opcao__titulo', tituloDoEnvio(envio), elemento('small', null, meta.join(' · '))),
      elemento('span', 'anki-opcao__valor', ponto, elemento('span', null, dinheiro(partes(envio).total))));
    opcao.setAttribute('role', 'option');
    opcao.setAttribute('aria-selected', String(escolhido));
    opcao.tabIndex = escolhido ? 0 : -1;
    opcao.dataset.foco = `envio:${envio.jobId}`;
    opcao.addEventListener('click', () => escolherEnvio(envio.jobId));
    return opcao;
  }

  function escolherEnvio(jobId) {
    estado.escolhido = jobId;
    desenhar();
    porId('anki-custos-corpo').querySelector(`[data-foco="${CSS.escape(`envio:${jobId}`)}"]`)?.focus();
  }

  function andarNaLista(evento, envios) {
    const indice = envios.findIndex(envio => envio.jobId === estado.escolhido);
    const destino = {
      ArrowDown: Math.min(envios.length - 1, indice + 1),
      ArrowUp: Math.max(0, indice - 1),
      Home: 0,
      End: envios.length - 1,
    }[evento.key];
    if (destino === undefined) return;
    evento.preventDefault();
    escolherEnvio(envios[destino].jobId);
  }

  function textoDoSelo(envio) {
    if (envio.status === 'completed') return textoDaVoz('ENV-07.concluido');
    if (envio.status === 'failed') return textoDaVoz('ENV-07.falhou');
    if (envio.status === 'partial') {
      return textoDaVoz('BRG-31.emParte', { n: numero(envio.successfulCards), total: numero(envio.requestedCards) });
    }
    const etapa = raiz.Envio?.nomeDaEtapa(envio.stage) || 'naFila';
    return textoDaVoz('BRG-31.enviando', { etapa: textoDaVoz(`ENV-07.${etapa}`) });
  }

  function seloDoEnvio(envio) {
    return elemento('span', `veio-selo ${statusDoEnvio(envio).selo}`, textoDoSelo(envio));
  }

  function detalheDoEnvio(envio) {
    const situacao = situacaoDoDetalhe(envio, estado);
    const detalhe = cabecaDoDetalhe(envio);
    detalhe.append(...avisosDoDetalhe(envio, situacao), custosDoEnvio(envio), imagensDoEnvio(envio));
    if (situacao.retomavel) detalhe.append(continuar.montar(envio));
    return detalhe;
  }

  function cabecaDoDetalhe(envio) {
    const idDoTitulo = 'anki-detalhe-titulo';
    const meta = [haQuanto(envio.createdAt), nomeDoIdioma(envio.lang)];
    if (estado.ids) meta.push(envio.jobId);
    const detalhe = elemento('section', 'anki-cartao anki-detalhe',
      elemento('p', 'anki-apoio', meta.join(' · ')),
      elemento('h3', null, tituloDoEnvio(envio)),
      seloDoEnvio(envio));
    detalhe.querySelector('h3').id = idDoTitulo;
    detalhe.setAttribute('aria-labelledby', idDoTitulo);
    return detalhe;
  }

  const linhaDoMotivo = texto => elemento('p', 'anki-motivo', texto);

  function avisosDoDetalhe(envio, { apagado, retomavel, falhaAoRetomar }) {
    if (retomavel) return avisosDeRetomar(envio, falhaAoRetomar);
    const avisos = apagado ? [linhaDoMotivo(textoDaVoz('ENV-24.apagado'))] : [];
    if (envio.lastError) avisos.push(Veio.montarDetalhes(String(envio.lastError)));
    return avisos;
  }

  function avisosDeRetomar(envio, falhaAoRetomar) {
    const avisos = [linhaDoMotivo(falhaAoRetomar ? textoDaVoz('ENV-14.falha') : textoDaVoz('ENV-10.naoEntraram', { n: naoEntraram(envio) }))];
    const causas = [falhaAoRetomar, envio.lastError].filter(Boolean).map(String);
    if (causas.length) avisos.push(Veio.montarDetalhes(causas.join('\n')));
    return avisos;
  }

  function custosDoEnvio(envio) {
    const p = partes(envio);
    const custos = elemento('dl', 'anki-partes', ...linhasDosCustos(p).flatMap(([codigo, valor]) =>
      [elemento('dt', null, textoDaVoz(codigo)), elemento('dd', null, dinheiro(valor))]));
    custos.append(elemento('dt', 'anki-partes__total', textoDaVoz('BRG-29.total')),
      elemento('dd', 'anki-partes__total', dinheiro(p.total)));
    return custos;
  }

  function imagensDoEnvio(envio) {
    const imagens = envio.images || {};
    const barra = elemento('div', 'anki-barra-serie anki-barra-serie--grossa');
    barra.setAttribute('aria-hidden', 'true');
    for (const origem of ORIGENS) {
      const n = numero(imagens[origem.chave]);
      if (!n) continue;
      const pedaco = elemento('i', `anki-serie--${origem.serie}`);
      pedaco.style.flex = String(n);
      barra.append(pedaco);
    }
    const legenda = [
      ['real', textoDaVoz('BRG-31.fotosReais', { n: numero(imagens.real) })],
      ['gerada', textoDaVoz('BRG-09.geradas', { n: numero(imagens.generated) })],
      ['sem', textoDaVoz('BRG-31.semImagem', { n: numero(imagens.skipped) })],
      ['falhou', textoDaVoz('BRG-31.falharam', { n: numero(imagens.failed) })],
    ];
    return elemento('div', 'anki-imagens-do-envio',
      elemento('h4', null, textoDaVoz('BRG-31.imagens')),
      barra,
      elemento('p', 'anki-legenda', ...legenda.map(([serie, texto]) => {
        const marca = elemento('i', `anki-serie--${serie}`);
        marca.setAttribute('aria-hidden', 'true');
        return elemento('span', null, marca, texto);
      })));
  }

  function desenharAvancado(envios, soma) {
    const numeros = [
      [textoDaVoz('BRG-08.escolhaDeImagem'), soma.escolha],
      [textoDaVoz('BRG-08.triagemDeImagem'), soma.triagem],
      [textoDaVoz('BRG-32.totalQuatroCasas'), soma.total],
    ];
    porId('anki-custos-avancado-numeros').replaceChildren(...numeros.map(([rotulo, valor]) =>
      elemento('div', 'anki-numero', elemento('dt', null, rotulo), elemento('dd', null, dinheiro(valor, { quatroCasas: true })))));

    porId('anki-custos-diagnostico').replaceChildren(...envios.map(envio => {
      const codigo = CODIGO_DO_IDIOMA[envio.lang];
      const meta = [haQuanto(envio.createdAt), codigo ? textoDaVoz(codigo) : String(envio.lang || '')];
      if (estado.ids) meta.push(envio.jobId);
      const baixar = botao(textoDaVoz('BRG-23.baixar'), 'veio-botao veio-botao--fantasma veio-botao--compacto',
        () => baixarDiagnostico(envio.jobId));
      return elemento('tr', null,
        elemento('td', null, tituloDoEnvio(envio)),
        elemento('td', 'anki-apoio', meta.join(' · ')),
        elemento('td', 'anki-tabela__acao', baixar));
    }));
    const falha = porId('anki-diagnostico-falha');
    falha.hidden = !estado.diagnosticoFalhou;
    falha.textContent = textoDaVoz('BRG-23.falha');
  }

  async function baixarDiagnostico(jobId) {
    const desfecho = await ConversaComOAnki.pedir(PedidoAoAnki.pacoteDeDiagnostico(jobId));
    estado.diagnosticoFalhou = !desfecho.ok;
    if (desfecho.ok) {
      const url = URL.createObjectURL(new Blob([JSON.stringify(desfecho.dados, null, 2)], { type: 'application/json' }));
      const link = elemento('a');
      link.href = url;
      link.download = `diagnostico-${jobId}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }
    desenhar();
  }

  function botao(rotulo, classe, aoUsar) {
    const no = elemento('button', classe);
    if (rotulo) no.textContent = rotulo;
    no.type = 'button';
    no.addEventListener('click', aoUsar);
    return no;
  }

  raiz.Anki = {
    aoAtualizar,
    atualizar: atualizarTudo,
    pecas: { esqueleto, linhaDeEspera, seloDoDadoAntigo },
  };
  document.addEventListener('DOMContentLoaded', iniciar);
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
