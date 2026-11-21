'use strict';

(function (raiz) {
  const { textoDaVoz, Mineracao } = raiz;
  const { iconeVeio, montarAviso, mostrarToastDeSucesso, refletirSelecao, abrirConfirmacao, elemento, botao } = raiz.Veio;
  const { lerAsMarcacoes, classificarFalha } = raiz.LeituraDoGemini;

  const TITULO_SEM_LIVRO = 'Físico/Livro';

  const FONTE = 'livro';

  const ENDERECO_DA_CHAVE = '#configuracoes/chave';

  /**
   * Os formatos que a página anuncia (FOT-02) e aceita. O Chrome no Windows
   * entrega o HEIC sem tipo, então a extensão do arquivo também vale.
   */
  const TIPO_POR_EXTENSAO = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
  };
  const TIPOS_ACEITOS = new Set(Object.values(TIPO_POR_EXTENSAO));

  const STATUS = {
    PRONTA: 'pronta',
    NA_FILA: 'naFila',
    LENDO: 'lendo',
    LIDA: 'lida',
    FALHOU: 'falhou',
    CANCELADA: 'cancelada',
  };

  const ID_DA_COLUNA_CANCELADA = 'cancelada';

  const LEGENDA = [
    { exemplo: 'FOT-24.exemploBarras', nome: 'FOT-24.barras' },
    { exemplo: 'FOT-24.exemploUnderscores', nome: 'FOT-24.underscores' },
    { exemplo: 'FOT-24.exemploSublinhado', nome: 'FOT-24.sublinhado', sublinhado: true },
    { exemplo: 'FOT-24.exemploColchetes', nome: 'FOT-24.colchetes' },
  ];

  const estado = {
    chaveGemini: '',
    fotos: [],
    frases: [],
    lendo: false,
    leitura: null,
    minerando: false,
    sessao: 0,
  };
  let proximoId = 1;

  const nadaDesenhado = () => ({
    estadoDaColuna: null,
    cartoes: new Map(),
    grupos: new Map(),
    linhas: new Map(),
    avisoDaLeitura: null,
    falhasDoAviso: '',
    avisoDoEnvio: null,
    avisoDoCancelamento: null,
    canceladasDoAviso: '',
  });
  let desenhado = nadaDesenhado();

  const porId = id => document.getElementById(id);
  const fotosCom = (...status) => estado.fotos.filter(foto => status.includes(foto.status));

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    document.title = `${textoDaVoz('FOT-01.titulo')} · PerpetualMiner`;
    preencherTextosFixos();
    porId('foto-marcacoes').replaceWith(montarLegenda());

    chrome.storage.local.get({ geminiApiKey: '', bookTitleDefault: '' }, dados => {
      estado.chaveGemini = dados.geminiApiKey || '';
      porId('foto-livro').value = dados.bookTitleDefault || '';
      desenhar();
    });
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area !== 'local' || !('geminiApiKey' in mudancas)) return;
      estado.chaveGemini = mudancas.geminiApiKey.newValue || '';
      desenhar();
    });

    porId('foto-livro').addEventListener('input', evento => {
      chrome.storage.local.set({ bookTitleDefault: evento.target.value });
    });
    porId('foto-voltar').addEventListener('click', () => abrirPainel());

    const arquivo = porId('foto-arquivo');
    porId('foto-escolher').addEventListener('click', evento => {
      evento.stopPropagation();
      arquivo.click();
    });
    porId('foto-envio').addEventListener('click', () => arquivo.click());
    arquivo.addEventListener('change', () => {
      receberArquivos([...arquivo.files]);
      arquivo.value = '';
    });
    ouvirArrastar();

    porId('foto-todas').addEventListener('change', evento => {
      for (const frase of pendentes()) frase.marcada = evento.target.checked;
      desenharLista();
    });
    porId('foto-minerar').addEventListener('click', () => minerar());
    porId('foto-cancelar').addEventListener('click', cancelarLeitura);
    porId('foto-recomecar').addEventListener('click', pedirParaRecomecar);
  }

  function preencherTextosFixos() {
    for (const no of document.querySelectorAll('[data-voz]')) no.textContent = textoDaVoz(no.dataset.voz);
    for (const no of document.querySelectorAll('[data-voz-placeholder]')) {
      no.placeholder = textoDaVoz(no.dataset.vozPlaceholder);
    }
    for (const lugar of document.querySelectorAll('[data-icone]')) lugar.replaceWith(iconeVeio(lugar.dataset.icone));
  }

  function montarLegenda() {
    const lista = elemento('ul', 'foto-marcacoes');
    for (const marcacao of LEGENDA) {
      const exemplo = elemento('span', 'foto-marcacao__exemplo', textoDaVoz(marcacao.exemplo));
      exemplo.classList.toggle('foto-marcacao__exemplo--sublinhado', !!marcacao.sublinhado);
      lista.append(elemento('li', 'foto-marcacao', exemplo, textoDaVoz(marcacao.nome)));
    }
    return lista;
  }

  /** Solto em qualquer lugar da página, a foto entra na fila; o Chrome nunca a abre. */
  function ouvirArrastar() {
    const envio = porId('foto-envio');
    const sobre = ativo => envio.classList.toggle('foto-envio--sobre', ativo && !!estado.chaveGemini);
    document.addEventListener('dragover', evento => {
      evento.preventDefault();
      sobre(true);
    });
    document.addEventListener('dragleave', evento => {
      if (!evento.relatedTarget) sobre(false);
    });
    document.addEventListener('drop', evento => {
      evento.preventDefault();
      sobre(false);
      receberArquivos([...evento.dataTransfer.files]);
    });
  }

  function tipoDaFoto(arquivo) {
    if (TIPOS_ACEITOS.has(arquivo.type)) return arquivo.type;
    const extensao = arquivo.name.split('.').pop().toLowerCase();
    return TIPO_POR_EXTENSAO[extensao] || null;
  }

  async function receberArquivos(arquivos) {
    if (!estado.chaveGemini || !arquivos.length) return;

    avisarDosRecusados(arquivos.filter(arquivo => !tipoDaFoto(arquivo)));

    const aceitos = arquivos.filter(arquivo => tipoDaFoto(arquivo));
    if (!aceitos.length) return;
    const novas = await lerNaMesmaSessao(aceitos);
    if (novas) entrarNaFila(novas);
  }

  function avisarDosRecusados(recusados) {
    if (!recusados.length) return;
    mostrarAviso({
      texto: textoDaVoz('FOT-04'),
      detalhes: recusados.map(arquivo => arquivo.name).join('\n'),
    });
  }

  async function lerNaMesmaSessao(arquivos) {
    const sessao = estado.sessao;
    const novas = await Promise.all(arquivos.map(lerArquivo));
    if (sessao === estado.sessao) return novas;
    for (const foto of novas) URL.revokeObjectURL(foto.url);
    return null;
  }

  const ehAPrimeiraFotoSozinha = novas => estado.fotos.length === 0 && novas.length === 1;
  const haPrevia = () => fotosCom(STATUS.PRONTA).length > 0;
  const entramNaPrevia = novas => ehAPrimeiraFotoSozinha(novas) || haPrevia();

  function entrarNaFila(novas) {
    const status = entramNaPrevia(novas) ? STATUS.PRONTA : STATUS.NA_FILA;
    for (const foto of novas) estado.fotos.push({ ...foto, status });

    desenhar();
    if (status === STATUS.NA_FILA) lerAFila();
  }

  function lerArquivo(arquivo) {
    return new Promise(resolve => {
      const leitor = new FileReader();
      leitor.onload = () => resolve({
        id: proximoId++,
        nome: arquivo.name,
        tipo: tipoDaFoto(arquivo),
        base64: leitor.result.split(',')[1],
        url: URL.createObjectURL(arquivo),
        achadas: 0,
      });
      leitor.readAsDataURL(arquivo);
    });
  }

  function lerAsProntas() {
    for (const foto of fotosCom(STATUS.PRONTA)) foto.status = STATUS.NA_FILA;
    desenhar();
    lerAFila();
  }

  async function lerAFila() {
    if (estado.lendo) return;
    estado.lendo = true;
    const leitura = { interrompida: false, controlador: null };
    estado.leitura = leitura;

    let foto;
    while ((foto = fotosCom(STATUS.NA_FILA)[0])) {
      foto.status = STATUS.LENDO;
      desenhar();
      leitura.controlador = new AbortController();
      let textos = null;
      let falha = null;
      try {
        textos = await lerAsMarcacoes(estado.chaveGemini, foto, leitura.controlador.signal);
      } catch (erro) {
        falha = erro;
      }
      if (leitura.interrompida) return;
      if (falha) {
        foto.status = STATUS.FALHOU;
        foto.falha = classificarFalha(falha);
      } else {
        for (const texto of textos) {
          estado.frases.push({ id: proximoId++, fotoId: foto.id, texto, marcada: true, minerada: false });
        }
        foto.achadas = textos.length;
        foto.status = STATUS.LIDA;
      }
      desenhar();
    }

    estado.lendo = false;
    estado.leitura = null;
    desenhar();
  }

  function interromperLeitura() {
    const leitura = estado.leitura;
    if (!leitura) return;
    leitura.interrompida = true;
    leitura.controlador?.abort();
    estado.leitura = null;
    estado.lendo = false;
  }

  function cancelarLeitura() {
    interromperLeitura();
    for (const foto of lendoOuNaFila()) foto.status = STATUS.CANCELADA;
    desenhar();
    porId('foto-escolher').focus();
  }

  function tentarDeNovo(foto) {
    if (foto.status !== STATUS.FALHOU) return;
    foto.status = STATUS.NA_FILA;
    foto.falha = null;
    desenhar();
    desenhado.cartoes.get(foto.id)?.focus();
    lerAFila();
  }

  const aPerder = () => pendentes().filter(frase => frase.texto.trim());

  function pedirParaRecomecar() {
    const n = aPerder().length;
    if (!n) {
      recomecar();
      return;
    }

    abrirConfirmacao({
      id: 'foto-recomecar',
      titulo: textoDaVoz('FOT-18.titulo', { n }),
      corpo: textoDaVoz('FOT-18.corpo'),
      cancelar: textoDaVoz('FOT-18.cancelar'),
      confirmar: textoDaVoz('FOT-18.confirmar', { n }),
      aoConfirmar: recomecar,
      confirmarComContorno: true,
    });
  }

  function recomecar() {
    interromperLeitura();
    estado.sessao++;
    for (const foto of estado.fotos) URL.revokeObjectURL(foto.url);
    estado.fotos = [];
    estado.frases = [];

    desenhado = nadaDesenhado();
    porId('foto-fila').replaceChildren();
    porId('foto-grupos').replaceChildren();
    porId('foto-avisos').replaceChildren();

    desenhar();
    porId('foto-escolher').focus();
  }

  function numeroDaFoto(foto) {
    return estado.fotos.indexOf(foto) + 1;
  }

  const abrirConfiguracoes = () => abrirPainel(ENDERECO_DA_CHAVE);

  function resumoDasFalhas(falhas) {
    return {
      causa: falhas[0].falha.causa,
      chaveRecusada: falhas.some(foto => foto.falha.chaveRecusada),
    };
  }

  function desenharAvisoDaLeitura() {
    const falhas = fotosCom(STATUS.FALHOU);
    const ids = estado.frases.length ? falhas.map(foto => foto.id).join(',') : '';
    if (ids === desenhado.falhasDoAviso) return;
    desenhado.falhasDoAviso = ids;
    desenhado.avisoDaLeitura?.remove();
    desenhado.avisoDaLeitura = null;
    if (!ids) return;

    const { causa, chaveRecusada } = resumoDasFalhas(falhas);
    const abertura = falhas.length === 1
      ? textoDaVoz('FOT-11.aviso', { n: numeroDaFoto(falhas[0]) })
      : textoDaVoz('FOT-11.avisoVarias', { n: falhas.length });
    desenhado.avisoDaLeitura = mostrarAviso({
      abertura,
      texto: causa,
      icone: 'perigo',
      acao: chaveRecusada ? { rotulo: textoDaVoz('FOT-05.acao'), aoUsar: abrirConfiguracoes } : undefined,
    });
  }

  function desenharAvisoDoCancelamento() {
    const canceladas = fotosCom(STATUS.CANCELADA);
    const colunaJaDiz = estadoDaColuna().id === ID_DA_COLUNA_CANCELADA;
    const ids = colunaJaDiz ? '' : canceladas.map(foto => foto.id).join(',');
    if (ids === desenhado.canceladasDoAviso) return;
    desenhado.canceladasDoAviso = ids;
    desenhado.avisoDoCancelamento?.remove();
    desenhado.avisoDoCancelamento = null;
    if (!ids) return;

    desenhado.avisoDoCancelamento = mostrarAviso({
      tom: 'info',
      icone: 'info',
      abertura: textoDaVoz('FOT-21.abertura'),
      texto: textoDaVoz('FOT-21.aviso', { n: canceladas.length }),
    });
  }

  function mostrarAviso(conteudo) {
    const aviso = montarAviso({ ...conteudo, rotuloDeFechar: textoDaVoz('PAI-34') });
    porId('foto-avisos').append(aviso);
    return aviso;
  }

  const pendentes = () => estado.frases.filter(frase => !frase.minerada);
  const paraMinerar = () => pendentes().filter(frase => frase.marcada && frase.texto.trim());

  async function minerar(alvo = paraMinerar()) {
    if (estado.minerando) return;
    alvo = alvo.filter(frase => !frase.minerada);
    if (!alvo.length) return;

    estado.minerando = true;
    desenhado.avisoDoEnvio?.remove();
    desenharLista();

    const sessao = estado.sessao;
    const n = await gravarAsFrases(alvo);

    estado.minerando = false;
    desenharLista();
    avisarDaMineracao(alvo, n, sessao !== estado.sessao);
  }

  async function gravarAsFrases(frases) {
    const titulo = porId('foto-livro').value.trim() || TITULO_SEM_LIVRO;
    const deuCerto = await Promise.all(frases.map(frase => salvarNoHistorico(frase.texto.trim(), titulo)));
    frases.forEach((frase, i) => {
      if (!deuCerto[i]) return;
      frase.texto = frase.texto.trim();
      frase.minerada = true;
    });
    return deuCerto.filter(Boolean).length;
  }

  function avisarDaMineracao(alvo, n, recomecou) {
    if (recomecou || n === alvo.length) {
      if (n) mostrarToastDeSucesso(textoDaVoz('FOT-14', { n }));
      return;
    }
    const falharam = alvo.filter(frase => !frase.minerada);
    desenhado.avisoDoEnvio = mostrarAviso({
      texto: n === 0
        ? textoDaVoz('FOT-16')
        : textoDaVoz('FOT-15.resumo', { n, total: alvo.length, falhas: falharam.length }),
      acao: { rotulo: textoDaVoz('FOT-15.tentarDeNovo'), aoUsar: () => minerar(falharam) },
    });
  }

  async function salvarNoHistorico(texto, titulo) {
    const { ok } = await Mineracao.gravar({ texto, contexto: { fonte: FONTE, titulo, detalhe: '' } });
    return ok;
  }

  /**
   * Foca a aba do painel que já estiver aberta (levando-a a `endereco`, se
   * houver); sem nenhuma, abre uma. Nunca abre um segundo painel. Um painel
   * que já está em `endereco` não recebe `hashchange`, então ele é avisado
   * para aplicar o endereço de novo (e focar o campo da chave, por exemplo).
   */
  function abrirPainel(endereco = '') {
    const alvo = chrome.runtime.getURL('painel/painel.html');
    chrome.tabs.query({}, abas => {
      const aba = abas.find(a => a.url && a.url.split('#')[0] === alvo);
      if (!aba) {
        chrome.tabs.create({ url: alvo + endereco });
        return;
      }
      chrome.tabs.update(aba.id, endereco ? { active: true, url: alvo + endereco } : { active: true });
      chrome.windows.update(aba.windowId, { focused: true });
      if (endereco && aba.url === alvo + endereco) {
        chrome.runtime.sendMessage({ type: 'PAINEL_REAPLICAR_ENDERECO' }, () => void chrome.runtime.lastError);
      }
    });
  }

  function desenhar() {
    desenharFila();
    desenharEstado();
    desenharAvisoDaLeitura();
    desenharAvisoDoCancelamento();
    desenharLista();
  }

  const lendoOuNaFila = () => fotosCom(STATUS.LENDO, STATUS.NA_FILA);

  function desenharFila() {
    desenharEnvio();
    desenharProgresso();
    for (const foto of estado.fotos) atualizarCartaoDaFoto(cartaoDaFoto(foto), foto);
  }

  function desenharEnvio() {
    const comChave = !!estado.chaveGemini;
    porId('foto-sem-chave').hidden = comChave;
    porId('foto-envio').hidden = !comChave;
    porId('foto-fotos-total').textContent = estado.fotos.length || '';
    porId('foto-envio-texto').textContent = textoDoEnvio();
    porId('foto-envio-formatos').hidden = !comChave || estado.fotos.length > 0;
    porId('foto-envio').classList.toggle('foto-envio--lendo', estado.lendo);
  }

  function textoDoEnvio() {
    if (!estado.fotos.length) return textoDaVoz('FOT-02.titulo');
    const naFila = fotosCom(STATUS.NA_FILA).length;
    return naFila ? textoDaVoz('FOT-08', { n: naFila }) : textoDaVoz('FOT-23.maisFotos');
  }

  function desenharProgresso() {
    const ocupadas = lendoOuNaFila().length;
    porId('foto-progresso').hidden = ocupadas === 0;
    const cancelar = porId('foto-cancelar');
    if (!ocupadas && document.activeElement === cancelar) porId('foto-escolher').focus();
    cancelar.hidden = ocupadas === 0;
    if (ocupadas) desenharAsLidas(ocupadas);
  }

  function desenharAsLidas(ocupadas) {
    const total = estado.fotos.length - fotosCom(STATUS.PRONTA, STATUS.CANCELADA).length;
    const lidas = total - ocupadas;
    porId('foto-progresso-texto').textContent = textoDaVoz('FOT-20', { n: lidas, total });
    porId('foto-progresso-barra').style.width = `${Math.round((lidas / total) * 100)}%`;
  }

  function cartaoDaFoto(foto) {
    let cartao = desenhado.cartoes.get(foto.id);
    if (!cartao) {
      cartao = montarCartaoDaFoto(foto);
      desenhado.cartoes.set(foto.id, cartao);
      porId('foto-fila').append(cartao);
    }
    return cartao;
  }

  function montarCartaoDaFoto(foto) {
    const nome = elemento('p', 'foto-cartao__nome', foto.nome);
    nome.title = foto.nome;
    nome.id = `foto-cartao-nome-${foto.id}`;
    const deNovo = botao('veio-botao--secundario veio-botao--compacto foto-cartao__de-novo',
      iconeVeio('atualizar'), textoDaVoz('FOT-19.tentarDeNovo'));
    deNovo.setAttribute('aria-describedby', nome.id);
    deNovo.addEventListener('click', () => tentarDeNovo(foto));
    const cartao = elemento('li', 'foto-cartao',
      miniatura(foto, 'foto-cartao__miniatura'),
      elemento('div', 'foto-cartao__info', nome,
        elemento('div', 'foto-cartao__status'),
        elemento('p', 'foto-cartao__causa'),
        deNovo));
    cartao.tabIndex = -1;
    return cartao;
  }

  function atualizarCartaoDaFoto(cartao, foto) {
    cartao.dataset.status = foto.status;
    cartao.querySelector('.foto-cartao__status').replaceChildren(seloDaFoto(foto));
    const falhou = foto.status === STATUS.FALHOU;
    const causa = cartao.querySelector('.foto-cartao__causa');
    causa.textContent = falhou ? foto.falha.causa : '';
    causa.hidden = !falhou;
    cartao.querySelector('.foto-cartao__de-novo').hidden = !falhou;
  }

  function seloDaFoto(foto) {
    switch (foto.status) {
      case STATUS.PRONTA: return selo('', textoDaVoz('FOT-19.pronta'));
      case STATUS.NA_FILA: return selo('', textoDaVoz('FOT-19.naFila'));
      case STATUS.LENDO: {
        const lendo = selo('veio-selo--lendo', textoDaVoz('FOT-19.lendo'));
        lendo.prepend(elemento('span', 'veio-selo__ponto'));
        return lendo;
      }
      case STATUS.LIDA: return foto.achadas
        ? selo('veio-selo--ok', textoDaVoz('FOT-19.frases', { n: foto.achadas }))
        : selo('', textoDaVoz('FOT-19.semMarcacoes'));
      case STATUS.FALHOU: return selo('veio-selo--erro', textoDaVoz('FOT-19.falhou'));
      case STATUS.CANCELADA: return selo('', textoDaVoz('FOT-19.cancelada'));
      default: throw new Error(`Status de foto desconhecido: ${foto.status}`);
    }
  }

  function miniatura(foto, classe) {
    const imagem = elemento('img', classe);
    imagem.alt = '';
    imagem.src = foto.url;
    imagem.addEventListener('error', () => {
      const lugar = elemento('span', `${classe} foto-sem-miniatura`, iconeVeio('foto'));
      lugar.setAttribute('aria-hidden', 'true');
      imagem.replaceWith(lugar);
    }, { once: true });
    return imagem;
  }

  function desenharEstado() {
    const { id, montar } = estadoDaColuna();
    if (id === desenhado.estadoDaColuna) return;
    desenhado.estadoDaColuna = id;
    porId('foto-estado').replaceChildren(...(montar ? [montar()] : []));
  }

  function estadoDaColuna() {
    for (const colunaSeVale of COLUNAS_EM_ORDEM) {
      const coluna = colunaSeVale();
      if (coluna) return coluna;
    }
    return { id: 'nada' };
  }

  function colunaSemChave() {
    return estado.chaveGemini ? null : { id: 'semChave', montar: montarSemChave };
  }

  function colunaDoInicio() {
    return estado.fotos.length ? null : { id: 'inicio', montar: montarInicio };
  }

  function colunaDaPrevia() {
    const pronta = fotosCom(STATUS.PRONTA)[0];
    return pronta ? { id: `previa:${pronta.id}`, montar: () => montarPrevia(pronta) } : null;
  }

  function colunaDaLista() {
    return estado.frases.length ? { id: 'lista' } : null;
  }

  function colunaDaLeitura() {
    const lendo = fotosCom(STATUS.LENDO)[0];
    if (!lendo && !lendoOuNaFila().length) return null;
    const total = estado.fotos.length;
    const n = lendo ? numeroDaFoto(lendo) : 1;
    return { id: `lendo:${n}/${total}`, montar: () => montarLendo(n, total) };
  }

  function colunaDasFalhas() {
    const falhas = fotosCom(STATUS.FALHOU);
    return falhas.length ? { id: `falhas:${falhas.map(foto => foto.id)}`, montar: () => montarFalhas(falhas) } : null;
  }

  function colunaSemMarcacoes() {
    const lidas = fotosCom(STATUS.LIDA).length;
    return lidas ? { id: `semMarcacoes:${lidas}`, montar: () => montarSemMarcacoes(lidas) } : null;
  }

  function colunaCancelada() {
    return fotosCom(STATUS.CANCELADA).length ? { id: ID_DA_COLUNA_CANCELADA, montar: montarCancelada } : null;
  }

  const COLUNAS_EM_ORDEM = [
    colunaSemChave, colunaDoInicio, colunaDaPrevia, colunaDaLista, colunaDaLeitura, colunaDasFalhas, colunaSemMarcacoes, colunaCancelada,
  ];

  function vazio(icone, ...partes) {
    return elemento('div', 'veio-vazio foto-vazio', iconeVeio(icone), ...partes);
  }

  function vazioDeAcento(icone, ...partes) {
    const caixa = vazio(icone, ...partes);
    caixa.classList.add('foto-vazio--acento');
    return caixa;
  }

  function botaoRecomecar() {
    const recomecar = botao('veio-botao--fantasma', iconeVeio('atualizar'), textoDaVoz('FOT-17'));
    recomecar.addEventListener('click', pedirParaRecomecar);
    return recomecar;
  }

  function botaoAbrirConfiguracoes(variante) {
    const abrir = elemento('button', `veio-botao ${variante}`, iconeVeio('chave'), textoDaVoz('FOT-05.acao'));
    abrir.type = 'button';
    abrir.addEventListener('click', abrirConfiguracoes);
    return abrir;
  }

  function montarSemChave() {
    return vazioDeAcento('chave',
      elemento('p', 'veio-vazio__titulo', textoDaVoz('FOT-05.titulo')),
      elemento('p', 'veio-vazio__texto', textoDaVoz('FOT-05.aviso')),
      botaoAbrirConfiguracoes('veio-botao--primario'));
  }

  function montarInicio() {
    const caixa = vazioDeAcento('livro',
      elemento('p', 'veio-vazio__titulo', textoDaVoz('FOT-01.titulo')),
      elemento('p', 'veio-vazio__texto', `${textoDaVoz('FOT-01.subtitulo')} ${textoDaVoz('FOT-25.comoAparecem')}`));
    caixa.classList.add('foto-vazio--inicio');
    return caixa;
  }

  function montarPrevia(foto) {
    const ler = elemento('button', 'veio-botao veio-botao--primario', iconeVeio('ler'), textoDaVoz('FOT-25.lerMarcacoes'));
    ler.type = 'button';
    ler.addEventListener('click', lerAsProntas);
    return elemento('div', 'foto-previa',
      elemento('figure', 'foto-previa__quadro',
        miniatura(foto, 'foto-previa__imagem'),
        elemento('figcaption', 'foto-previa__aviso', textoDaVoz('FOT-03'))),
      elemento('div', 'foto-previa__acoes', ler, botaoRecomecar()));
  }

  function montarLendo(n, total) {
    return vazioDeAcento('ler',
      elemento('p', 'veio-vazio__titulo', total > 1 ? textoDaVoz('FOT-07', { n, total }) : textoDaVoz('FOT-06.titulo')),
      elemento('p', 'veio-vazio__texto', textoDaVoz('FOT-06.detalhe')));
  }

  function montarSemMarcacoes(lidas) {
    return vazio('busca',
      elemento('p', 'veio-vazio__titulo', textoDaVoz('FOT-10.titulo', { n: lidas })),
      elemento('p', 'veio-vazio__texto', textoDaVoz('FOT-10.texto')),
      botaoRecomecar());
  }

  function montarCancelada() {
    return vazio('fechar',
      elemento('p', 'veio-vazio__titulo', textoDaVoz('FOT-21.titulo')),
      elemento('p', 'veio-vazio__texto', textoDaVoz('FOT-21.nenhumaLida')),
      botaoRecomecar());
  }

  function montarFalhas(falhas) {
    const { causa, chaveRecusada } = resumoDasFalhas(falhas);
    const caixa = vazio('perigo',
      elemento('p', 'veio-vazio__titulo', textoDaVoz('FOT-11.titulo', { n: falhas.length })),
      elemento('p', 'veio-vazio__texto', causa));
    const acoes = elemento('div', 'foto-vazio__acoes', botaoRecomecar());
    if (chaveRecusada) acoes.prepend(botaoAbrirConfiguracoes('veio-botao--secundario'));
    caixa.append(acoes);
    caixa.classList.add('foto-vazio--falha');
    return caixa;
  }

  function desenharLista() {
    porId('foto-lista').hidden = estado.frases.length === 0;
    if (!estado.frases.length) return;

    for (const foto of estado.fotos) desenharGrupo(foto, estado.frases.filter(frase => frase.fotoId === foto.id));
    desenharSelecao();
    desenharBotaoDeMinerar();
  }

  function desenharGrupo(foto, frasesDaFoto) {
    if (!frasesDaFoto.length) return;
    const grupo = grupoDaFoto(foto);
    for (const frase of frasesDaFoto) atualizarLinha(linhaDaFrase(frase, grupo), frase);
  }

  function grupoDaFoto(foto) {
    let grupo = desenhado.grupos.get(foto.id);
    if (!grupo) {
      grupo = montarGrupo(foto);
      desenhado.grupos.set(foto.id, grupo);
      porId('foto-grupos').append(grupo);
    }
    return grupo;
  }

  function linhaDaFrase(frase, grupo) {
    let linha = desenhado.linhas.get(frase.id);
    if (!linha) {
      linha = montarLinha(frase);
      desenhado.linhas.set(frase.id, linha);
      grupo.querySelector('.foto-grupo__frases').append(linha);
    }
    return linha;
  }

  function desenharSelecao() {
    const aindaNao = pendentes();
    const marcadas = aindaNao.filter(frase => frase.marcada);
    const todas = porId('foto-todas');
    refletirSelecao(todas, marcadas.length, aindaNao.length);
    todas.disabled = aindaNao.length === 0;
    porId('foto-contagem').textContent = textoDaVoz('FOT-09', { n: estado.frases.length });
  }

  function desenharBotaoDeMinerar() {
    const n = paraMinerar().length;
    const botao = porId('foto-minerar');
    botao.disabled = estado.minerando || n === 0;
    botao.replaceChildren(iconeVeio('manual'), n ? textoDaVoz('FOT-12', { n }) : textoDaVoz('FOT-13'));
  }

  function montarGrupo(foto) {
    const titulo = elemento('p', 'foto-grupo__titulo',
      elemento('span', 'foto-grupo__numero', textoDaVoz('FOT-25.grupo', { n: numeroDaFoto(foto) })),
      elemento('span', 'foto-grupo__nome', foto.nome));
    return elemento('section', 'foto-grupo', titulo, elemento('div', 'foto-grupo__frases'));
  }

  function montarLinha(frase) {
    const marcar = elemento('input', 'veio-checkbox foto-frase__marcar');
    marcar.type = 'checkbox';
    marcar.addEventListener('change', () => {
      frase.marcada = marcar.checked;
      desenharLista();
    });

    const texto = elemento('div', 'veio-frase__texto foto-frase__texto', frase.texto);
    texto.setAttribute('role', 'textbox');
    texto.setAttribute('aria-label', textoDaVoz('PAI-33.campo'));
    texto.spellcheck = false;
    texto.addEventListener('input', () => {
      frase.texto = texto.textContent;
      marcar.setAttribute('aria-label', frase.texto);
      desenharLista();
    });

    const minerada = selo('veio-selo--ok foto-frase__minerada', textoDaVoz('FOT-25.minerada'));
    return elemento('div', 'veio-frase foto-frase', marcar, texto, minerada);
  }

  function atualizarLinha(linha, frase) {
    const marcar = linha.querySelector('.foto-frase__marcar');
    const texto = linha.querySelector('.foto-frase__texto');
    marcar.checked = frase.marcada;
    marcar.disabled = frase.minerada;
    marcar.setAttribute('aria-label', frase.texto);
    texto.contentEditable = frase.minerada ? 'false' : 'plaintext-only';
    texto.setAttribute('aria-readonly', String(frase.minerada));
    if (frase.minerada && texto.textContent !== frase.texto) texto.textContent = frase.texto;
    linha.classList.toggle('foto-frase--minerada', frase.minerada);
    linha.classList.toggle('foto-frase--desmarcada', !frase.minerada && !frase.marcada);
    linha.querySelector('.foto-frase__minerada').hidden = !frase.minerada;
  }

  function selo(modificador, texto) {
    return elemento('span', `veio-selo ${modificador}`.trim(), texto);
  }
})(globalThis.PerpetualMiner);
