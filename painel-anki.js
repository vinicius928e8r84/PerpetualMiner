'use strict';

(function (raiz) {
  const CHAVE_CUSTOS = 'pm_anki_custos';
  const CHAVE_QUATRO_CASAS = 'pm_anki_quatro_casas';
  const CHAVE_IDS = 'pm_anki_ids_dos_envios';

  // Os idiomas do bridge (`lang`) e o código que cada azulejo mostra (BRG-28).
  const IDIOMAS_DOS_AZULEJOS = [
    { idioma: 'all', codigo: 'BRG-28.codigoTodos' },
    { idioma: 'en', codigo: 'BRG-28.codigoEn' },
    { idioma: 'ru', codigo: 'BRG-28.codigoRu' },
  ];
  const CODIGO_DO_IDIOMA = Object.fromEntries(IDIOMAS_DOS_AZULEJOS.map(({ idioma, codigo }) => [idioma, codigo]));
  const NOME_DO_IDIOMA = { en: 'INGLES', ru: 'RUSSO' };
  // O que cada `status` do bridge vira na tela: o tom do ponto na lista, o selo do
  // detalhe e se o envio pode ser continuado. O que não está aqui está andando.
  const STATUS_DO_ENVIO = {
    completed: { tom: 'ok', selo: 'veio-selo--ok', retomavel: false },
    partial: { tom: 'parte', selo: 'veio-selo--parte', retomavel: true },
    failed: { tom: 'erro', selo: 'veio-selo--erro', retomavel: true },
  };
  const ANDANDO = { tom: 'andando', selo: 'veio-selo--info', retomavel: false };
  // As 4 origens das imagens, na ordem e com a cor da série (exceção de dataviz do Veio).
  const ORIGENS = [
    { chave: 'real', rotulo: 'BRG-09.fotoReal', serie: 'real' },
    { chave: 'generated', rotulo: 'BRG-09.geradaPorIa', serie: 'gerada' },
    { chave: 'skipped', rotulo: 'BRG-09.semImagem', serie: 'sem' },
    { chave: 'failed', rotulo: 'BRG-09.falhou', serie: 'falhou' },
  ];

  const { textoDaVoz, Veio, Shell, ConexaoAnki, Contexto, IDIOMAS, PrimeiraConexao, PedidoAoAnki, PlanoDosCustos } = raiz;
  const { haQuanto } = Contexto;
  const { ENDERECO: ENDERECO_DA_CONEXAO, SITUACAO: CONEXAO } = ConexaoAnki;
  const porId = id => document.getElementById(id);

  const estado = {
    periodo: 'mes',         // 'hoje' | 'mes' | 'tudo' | 'datas' (De/Até escolhidos)
    de: '',
    ate: '',
    idioma: 'all',
    dados: null,            // a última leitura: { quando, periodo, de, ate, envios }
    carregando: false,
    erro: null,             // a causa técnica da leitura que falhou, para o Detalhes
    escolhido: null,        // o jobId do envio no detalhe
    quatroCasas: false,
    ids: false,
    leitura: 0,             // só a leitura mais recente desenha
    falhasAoRetomar: new Map(),  // jobId → a causa técnica, para o Detalhes
    diagnosticoFalhou: false,
  };
  const ouvintesDoAtualizar = [];   // quem mais responde ao ↻ Atualizar (aoAtualizar)

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
    porId('btn-bridge-analytics-refresh-main').addEventListener('click', atualizarTudo);
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
  /** A Conexão já respondeu, ligada ou desligada, nesta página. */
  const jaRespondeu = () => ConexaoAnki.ultimaResposta() !== null;

  // A situação da última notificação: ler os custos é decidido contra ela.
  let anterior = CONEXAO.CONECTANDO;

  function aoMudarAConexao(situacao) {
    const antes = anterior;
    anterior = situacao;
    if (situacao === CONEXAO.LIGADA && antes !== CONEXAO.LIGADA && Shell.areaAtual() === 'anki') ler();
    desenhar();
  }

  /** Confere a Conexão e, ligada, lê os custos de novo (Tentar de novo do BRG-04). */
  async function atualizar() {
    const situacao = await ConexaoAnki.conferir();
    if (situacao === CONEXAO.LIGADA) ler();
    return situacao;
  }

  /**
   * ↻ Atualizar (BRG-24): uma ação só. Confere a Conexão e, só com ela ligada,
   * lê os custos e pede às outras abas os dados delas (os baralhos, que abrem o
   * Anki se precisar). Desligada, não há quem abra o Anki: a F1 já diz o porquê.
   */
  async function atualizarTudo() {
    if (await atualizar() === CONEXAO.LIGADA) for (const ouvinte of ouvintesDoAtualizar) ouvinte();
  }

  /** `ouvinte` roda a cada ↻ Atualizar com a Conexão ligada. */
  function aoAtualizar(ouvinte) {
    ouvintesDoAtualizar.push(ouvinte);
  }

  function dataIso(data) {
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${data.getFullYear()}-${mes}-${dia}`;
  }

  function datasDoPeriodo(periodo) {
    const hoje = new Date();
    if (periodo === 'hoje') return { periodo, de: dataIso(hoje), ate: dataIso(hoje) };
    if (periodo === 'mes') return { periodo, de: dataIso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: dataIso(hoje) };
    return { periodo: 'tudo', de: '', ate: '' };
  }

  function escolherPeriodo(periodo) {
    Object.assign(estado, datasDoPeriodo(periodo));
    ler();
  }

  async function ler() {
    const leitura = ++estado.leitura;
    const { periodo, de, ate } = estado;
    estado.carregando = true;
    estado.erro = null;
    desenhar();

    const pedidoDosCustos = PedidoAoAnki.custosDosEnvios({ de, ate });
    const pedido = `POST /analytics/jobs ${JSON.stringify(pedidoDosCustos.corpo)}`;
    let envios = null;
    let erro = null;
    try {
      const resposta = await PedidoAoAnki.pedir(ENDERECO_DA_CONEXAO, pedidoDosCustos);
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      const { jobs } = await resposta.json();
      envios = Array.isArray(jobs) ? jobs : [];
    } catch (falha) {
      erro = `${pedido} · ${falha.message}`;
    }
    if (leitura !== estado.leitura) return;

    estado.carregando = false;
    estado.erro = erro;
    if (envios) {
      estado.dados = { quando: Date.now(), periodo, de, ate, envios };
      chrome.storage.local.set({ [CHAVE_CUSTOS]: estado.dados });
    }
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

  /**
   * Com a Conexão desligada, o botão fica `aria-disabled` (não `disabled`: ele
   * continua no Tab) e a dica irmã diz por quê, no hover e no foco.
   */
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
    if (desligada() && estado.dados) return 'antiga';
    if (!jaRespondeu()) return 'esqueleto';
    if (estado.carregando) return 'carregando';
    if (estado.erro || desligada()) return 'erro';
    if (!estado.dados) return 'carregando';
    return estado.dados.envios.length ? 'dados' : 'vazio';
  }

  function desenharCustos() {
    const vista = vistaDosCustos();
    const comDados = vista === 'dados' || vista === 'antiga';
    // O último dado vale para o período lido: os controles mostram esse.
    const periodo = vista === 'antiga' ? estado.dados : estado;
    // Sem a Conexão, outro período não teria de onde vir: os controles ficam
    // parados no do último dado até ela voltar.
    for (const radio of document.querySelectorAll('input[name="periodo-custos"]')) {
      radio.checked = radio.value === periodo.periodo;
      radio.disabled = vista === 'antiga';
    }
    for (const [campo, valor] of [[porId('anki-custos-de'), periodo.de], [porId('anki-custos-ate'), periodo.ate]]) {
      campo.value = valor || '';
      campo.disabled = vista === 'antiga';
    }

    const antigo = porId('anki-custos-antigo');
    antigo.hidden = vista !== 'antiga';
    if (vista === 'antiga') {
      antigo.replaceChildren(...partesDoSeloAntigo(estado.dados.quando));
    }

    porId('anki-custos-azulejos').hidden = !comDados;
    porId('anki-custos-avancado').hidden = !comDados;

    const foco = document.activeElement?.closest?.('#anki-custos-corpo [data-foco]')?.dataset.foco;
    const corpo = porId('anki-custos-corpo');
    if (vista === 'esqueleto') corpo.replaceChildren(esqueleto());
    else if (vista === 'carregando') corpo.replaceChildren(linhaDeEspera(textoDaVoz('BRG-25')), esqueleto());
    else if (vista === 'erro') corpo.replaceChildren(...erroDosCustos());
    else if (vista === 'vazio') corpo.replaceChildren(vazioDosCustos());
    else {
      const envios = enviosDoIdioma();
      desenharAzulejos();
      const soma = somar(envios);
      corpo.replaceChildren(...[PlanoDosCustos.cartao(envios, dinheiro), faixaDeResumo(soma), origemDasImagens(soma), listaEDetalhe(envios)].filter(Boolean));
      desenharAvancado(envios, soma);
    }
    if (foco) corpo.querySelector(`[data-foco="${CSS.escape(foco)}"]`)?.focus();
  }

  /**
   * Custos: o selo BRG-12 (o último dado, de quando) e a causa em Detalhes:
   * por padrão, a Conexão que não respondeu. As outras abas usam só `seloDoDadoAntigo`.
   */
  function partesDoSeloAntigo(quando, causa = `GET ${ENDERECO_DA_CONEXAO}/health · sem resposta`) {
    return [seloDoDadoAntigo(quando), Veio.montarDetalhes(causa)];
  }

  /**
   * Só o selo BRG-12, sem o Detalhes: Baralhos e termos e Vocabulário. O motivo
   * é o Anki fechado (sem resposta); `'atualizacao'` é a Conexão que responde
   * com o último dado que tinha, porque não deu para atualizar.
   */
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

  /**
   * O erro de leitura: o total indisponível e o aviso BRG-04, que fica até a
   * leitura dar certo. Com a Conexão desligada (e nada gravado para mostrar), o
   * porquê e o Tentar de novo já estão na F1 do shell: aqui fica só o total.
   */
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

  function numero(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
  }

  /** As partes do custo de um envio; o total é a soma delas. */
  function partes(envio) {
    const custos = envio.costs || {};
    const p = {
      cartoes: numero(custos.cardUsd),
      geradas: numero(custos.imageGenerationUsd),
      escolha: numero(custos.imageJudgeUsd),
      triagem: numero(custos.imageGuardUsd),
      outros: numero(custos.otherUsd),
    };
    p.total = p.cartoes + p.geradas + p.escolha + p.triagem + p.outros;
    return p;
  }

  function somar(envios) {
    const soma = { cartoes: 0, geradas: 0, escolha: 0, triagem: 0, outros: 0, total: 0, economia: 0,
      pedidas: 0, enviadas: 0, concluidos: 0, n: envios.length, imagens: 0 };
    for (const origem of ORIGENS) soma[origem.chave] = 0;
    for (const envio of envios) {
      const p = partes(envio);
      for (const chave of ['cartoes', 'geradas', 'escolha', 'triagem', 'outros', 'total']) soma[chave] += p[chave];
      soma.economia += numero(envio.images?.savingsUsd);
      soma.pedidas += numero(envio.requestedCards);
      soma.enviadas += numero(envio.successfulCards);
      if (envio.status === 'completed') soma.concluidos += 1;
      for (const origem of ORIGENS) {
        soma[origem.chave] += numero(envio.images?.[origem.chave]);
        soma.imagens += numero(envio.images?.[origem.chave]);
      }
    }
    return soma;
  }

  function formatar(valor, casas) {
    return valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  }

  /**
   * US$ com 2 casas (V7); com a chave, tudo com 4 casas. Um valor positivo
   * menor que a menor casa nunca sai zerado: “< US$ 0,01” (ou “< US$ 0,0001”).
   */
  function dinheiro(valor, { quatroCasas = estado.quatroCasas } = {}) {
    if (!Number.isFinite(valor)) return textoDaVoz('BRG-03.indisponivel');
    const casas = quatroCasas ? 4 : 2;
    const menor = 10 ** -casas;
    if (valor > 0 && valor < menor) return textoDaVoz('BRG-26', { valor: formatar(menor, casas) });
    return textoDaVoz('BRG-03.valor', { valor: formatar(valor, casas) });
  }

  /** A parte do total, em %, com uma casa (o número, para a largura da barra). */
  function fracao(parte, total) {
    return total ? Math.round((parte / total) * 1000) / 10 : 0;
  }

  /** A mesma parte como a tela diz: “75,9%”, “0%”. */
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

  /** Os envios do período, mais novos primeiro, no idioma do azulejo escolhido. */
  function enviosDoIdioma(idioma = estado.idioma) {
    return [...estado.dados.envios]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .filter(envio => idioma === 'all' || envio.lang === idioma);
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

  /** ↑ ↓ Home End andam pela lista e escolhem o envio, como num listbox. */
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

  function statusDoEnvio(envio) {
    return STATUS_DO_ENVIO[envio.status] || ANDANDO;
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
    const idDoTitulo = 'anki-detalhe-titulo';
    const meta = [haQuanto(envio.createdAt), nomeDoIdioma(envio.lang)];
    if (estado.ids) meta.push(envio.jobId);
    const detalhe = elemento('section', 'anki-cartao anki-detalhe',
      elemento('p', 'anki-apoio', meta.join(' · ')),
      elemento('h3', null, tituloDoEnvio(envio)),
      seloDoEnvio(envio));
    detalhe.querySelector('h3').id = idDoTitulo;
    detalhe.setAttribute('aria-labelledby', idDoTitulo);

    const { retomavel } = statusDoEnvio(envio);
    if (retomavel) {
      const naoEntraram = numero(envio.failedCards) || Math.max(0, numero(envio.requestedCards) - numero(envio.successfulCards));
      const falhaAoRetomar = estado.falhasAoRetomar.get(envio.jobId);
      const motivo = falhaAoRetomar ? textoDaVoz('ENV-14.falha') : textoDaVoz('ENV-10.naoEntraram', { n: naoEntraram });
      detalhe.append(elemento('p', 'anki-motivo', motivo));
      const causas = [falhaAoRetomar, envio.lastError].filter(Boolean).map(String);
      if (causas.length) detalhe.append(Veio.montarDetalhes(causas.join('\n')));
    } else if (envio.lastError) {
      detalhe.append(Veio.montarDetalhes(String(envio.lastError)));
    }

    const p = partes(envio);
    const linhas = [
      [textoDaVoz('BRG-08.criacaoDeCartoes'), p.cartoes],
      [textoDaVoz('BRG-08.imagensGeradas'), p.geradas],
      [textoDaVoz('BRG-29.escolhaETriagem'), p.escolha + p.triagem],
    ];
    if (p.outros > 0) linhas.push([textoDaVoz('BRG-29.outros'), p.outros]);
    const custos = elemento('dl', 'anki-partes', ...linhas.flatMap(([rotulo, valor]) =>
      [elemento('dt', null, rotulo), elemento('dd', null, dinheiro(valor))]));
    custos.append(elemento('dt', 'anki-partes__total', textoDaVoz('BRG-29.total')),
      elemento('dd', 'anki-partes__total', dinheiro(p.total)));
    detalhe.append(custos, imagensDoEnvio(envio));

    if (retomavel) detalhe.append(continuarEnvio(envio));
    return detalhe;
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

  /** Continuar envio (botão pequeno, como no protótipo); com a Conexão desligada, aria-disabled com a dica. */
  function continuarEnvio(envio) {
    const acao = botao(textoDaVoz('ENV-13.continuar'), 'veio-botao veio-botao--contorno veio-botao--compacto',
      () => retomar(envio.jobId, acao));
    acao.dataset.foco = `continuar:${envio.jobId}`;
    const dica = elemento('span', 'veio-dica', textoDaVoz('BRG-33.continuar'));
    dica.id = 'anki-continuar-indisponivel';
    dica.setAttribute('role', 'tooltip');
    marcarIndisponivel(acao, dica.id);
    return elemento('div', 'anki-acao', elemento('span', 'veio-com-dica', acao, dica));
  }

  async function retomar(jobId, acao) {
    if (acao.getAttribute('aria-disabled') === 'true') return;
    try {
      const resposta = await PedidoAoAnki.pedir(ENDERECO_DA_CONEXAO, PedidoAoAnki.tentarEnvioDeNovo(jobId));
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      estado.falhasAoRetomar.delete(jobId);
      Veio.mostrarToastDeSucesso(textoDaVoz('ENV-14.sucesso'));
      ler();
    } catch (falha) {
      estado.falhasAoRetomar.set(jobId, `POST /jobs/retry ${jobId} · ${falha.message}`);
      desenhar();
    }
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

  /** O pacote de diagnóstico do envio, como arquivo. O download é o retorno: sem toast. */
  async function baixarDiagnostico(jobId) {
    try {
      const resposta = await PedidoAoAnki.pedir(ENDERECO_DA_CONEXAO, PedidoAoAnki.pacoteDeDiagnostico(jobId));
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      const pacote = await resposta.json();
      const url = URL.createObjectURL(new Blob([JSON.stringify(pacote, null, 2)], { type: 'application/json' }));
      const link = elemento('a');
      link.href = url;
      link.download = `diagnostico-${jobId}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      estado.diagnosticoFalhou = false;
    } catch {
      estado.diagnosticoFalhou = true;
    }
    desenhar();
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

  raiz.Anki = {
    aoAtualizar,
    atualizar: atualizarTudo,
    // Os pedaços da área que Baralhos e termos e o Vocabulário também desenham.
    pecas: { esqueleto, linhaDeEspera, seloDoDadoAntigo },
  };
  document.addEventListener('DOMContentLoaded', iniciar);
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
