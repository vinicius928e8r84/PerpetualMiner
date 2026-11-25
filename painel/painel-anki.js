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
  const somar = envios => SomaDosCustos.somar(envios, ORIGENS);
  const { haQuanto } = Contexto;
  const { ENDERECO: ENDERECO_DA_CONEXAO, SITUACAO: CONEXAO } = ConexaoAnki;
  const porId = id => document.getElementById(id);
  const { datasDoPeriodo, resultadoDaLeitura } = RetratoDosCustos;

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
  const { EnviosNosCustos } = raiz;
  EnviosNosCustos.usar({
    estado,
    desenhar,
    apoio: { dinheiro, nomeDoIdioma, botao, continuar, ORIGENS, CODIGO_DO_IDIOMA },
  });

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
    EnviosNosCustos.desenharAvancado(envios, soma);
    return [PlanoDosCustos.cartao(envios, dinheiro), faixaDeResumo(soma), origemDasImagens(soma), EnviosNosCustos.listaEDetalhe(envios)].filter(Boolean);
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
