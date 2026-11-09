'use strict';

(function (raiz) {
  const { textoDaVoz, Mineracao } = raiz;
  const { iconeVeio, montarAviso, mostrarToastDeSucesso, refletirSelecao, abrirConfirmacao } = raiz.Veio;

  const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

  // Sentinel retornado pelo modelo quando não há trechos marcados
  const SENTINEL_VAZIO = 'NENHUM_TRECHO';

  const PROMPT = `Analise a foto desta página de livro ou texto impresso.

TAREFA: encontre e transcreva APENAS os trechos que foram marcados manualmente pelo leitor.

Tipos de marcação a identificar:
1. Texto entre barras oblíquas → /texto marcado aqui/
2. Texto entre underscores → _texto marcado aqui_
3. Texto com sublinhado físico desenhado à mão abaixo das palavras
4. Texto circulado, entre colchetes [] ou com marcação lateral

REGRAS — siga à risca:
- Retorne APENAS o texto limpo de cada trecho, sem os símbolos de marcação
- Um trecho por linha, sem numeração, sem bullet points, sem explicações
- Preserve a frase exatamente como está, incluindo pontuação e capitalização
- Se não houver absolutamente nenhum trecho marcado, responda exatamente: ${SENTINEL_VAZIO}

Exemplo de saída correta (para uma página com 3 trechos marcados):
The quick brown fox jumps over the lazy dog
All that glitters is not gold
To be or not to be, that is the question`;

  /** O Título gravado quando o Livro fica em branco: dado, não cópia de tela. */
  const TITULO_SEM_LIVRO = 'Físico/Livro';

  /** A Fonte das frases mineradas daqui. */
  const FONTE = 'livro';

  /** Onde o painel pede a chave do Gemini, com o campo focado. */
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

  /** O status de cada foto; os nomes das partes de FOT-19, onde há uma. */
  const STATUS = {
    PRONTA: 'pronta',     // 1 foto na prévia, ainda não lida
    NA_FILA: 'naFila',
    LENDO: 'lendo',
    LIDA: 'lida',         // “N frases” ou “Sem marcações”
    FALHOU: 'falhou',
    CANCELADA: 'cancelada', // estava na fila (ou sendo lida) quando a pessoa cancelou
  };

  /** O estado da coluna quando a leitura foi cancelada antes de ler qualquer foto. */
  const ID_DA_COLUNA_CANCELADA = 'cancelada';

  /** As marcações da legenda (FOT-24): a parte do exemplo e a do nome de cada uma. */
  const LEGENDA = [
    { exemplo: 'FOT-24.exemploBarras', nome: 'FOT-24.barras' },
    { exemplo: 'FOT-24.exemploUnderscores', nome: 'FOT-24.underscores' },
    { exemplo: 'FOT-24.exemploSublinhado', nome: 'FOT-24.sublinhado', sublinhado: true },
    { exemplo: 'FOT-24.exemploColchetes', nome: 'FOT-24.colchetes' },
  ];

  const estado = {
    chaveGemini: '',
    fotos: [],        // { id, nome, tipo, base64, url, status, achadas, falha: { causa, chaveRecusada, detalhes } }
    frases: [],       // { id, fotoId, texto, marcada, minerada }
    lendo: false,     // a fila está sendo lida
    leitura: null,    // a leitura em curso: { interrompida, controlador }
    minerando: false, // um “Minerar N frases” está a caminho do service worker
    sessao: 0,        // sobe a cada Recomeçar: o que chega de antes não entra
  };
  let proximoId = 1;

  /** O que já está desenhado, para redesenhar só o que mudou. */
  const nadaDesenhado = () => ({
    estadoDaColuna: null,       // o id do estado da coluna das frases
    cartoes: new Map(),         // foto.id → <li> da fila
    grupos: new Map(),          // foto.id → grupo de frases
    linhas: new Map(),          // frase.id → linha da frase
    avisoDaLeitura: null,       // o aviso único das fotos que falharam (FOT-11)
    falhasDoAviso: '',          // os ids das fotos que esse aviso conta
    avisoDoEnvio: null,         // o aviso de FOT-15/16, trocado a cada envio
    avisoDoCancelamento: null,  // o aviso de FOT-21
    canceladasDoAviso: '',      // os ids das fotos que esse aviso conta
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
    // A chave salva no painel libera a página sem recarregar.
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

  /** A cópia fixa da página, pelos atributos data-voz* do bookreader.html. */
  function preencherTextosFixos() {
    for (const no of document.querySelectorAll('[data-voz]')) no.textContent = textoDaVoz(no.dataset.voz);
    for (const no of document.querySelectorAll('[data-voz-placeholder]')) {
      no.placeholder = textoDaVoz(no.dataset.vozPlaceholder);
    }
    for (const lugar of document.querySelectorAll('[data-icone]')) lugar.replaceWith(iconeVeio(lugar.dataset.icone));
  }

  /** “Marcações que o Gemini lê”: o exemplo em mono e o nome de cada uma. */
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

  /** O tipo da foto pelo tipo do arquivo ou, sem ele, pela extensão; `null` se não é foto. */
  function tipoDaFoto(arquivo) {
    if (TIPOS_ACEITOS.has(arquivo.type)) return arquivo.type;
    const extensao = arquivo.name.split('.').pop().toLowerCase();
    return TIPO_POR_EXTENSAO[extensao] || null;
  }

  async function receberArquivos(arquivos) {
    if (!estado.chaveGemini || !arquivos.length) return;

    const recusados = arquivos.filter(arquivo => !tipoDaFoto(arquivo));
    if (recusados.length) {
      mostrarAviso({
        texto: textoDaVoz('FOT-04'),
        detalhes: recusados.map(arquivo => arquivo.name).join('\n'),
      });
    }

    const aceitos = arquivos.filter(arquivo => tipoDaFoto(arquivo));
    if (!aceitos.length) return;
    const sessao = estado.sessao;
    const novas = await Promise.all(aceitos.map(lerArquivo));
    // Recomeçar enquanto os arquivos eram lidos descarta estes também.
    if (sessao !== estado.sessao) {
      for (const foto of novas) URL.revokeObjectURL(foto.url);
      return;
    }

    // Uma foto sozinha para na prévia, como hoje; várias vão direto para a
    // leitura. Uma foto que chega com a prévia aberta espera junto com ela.
    const primeiraVez = estado.fotos.length === 0;
    const comPrevia = fotosCom(STATUS.PRONTA).length > 0;
    const status = (primeiraVez && novas.length === 1) || comPrevia ? STATUS.PRONTA : STATUS.NA_FILA;
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

  /** “Ler marcações” na prévia: as fotos prontas entram na fila. */
  function lerAsProntas() {
    for (const foto of fotosCom(STATUS.PRONTA)) foto.status = STATUS.NA_FILA;
    desenhar();
    lerAFila();
  }

  /**
   * Lê as fotos da fila uma por vez, na ordem em que chegaram. Interrompida
   * (Cancelar, Recomeçar), ela desiste do pedido em curso e o que ainda
   * chegar dele não entra na página.
   */
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
        textos = await chamarGemini(estado.chaveGemini, foto, leitura.controlador.signal);
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

  /** Para a leitura em curso: o pedido ao Gemini é abandonado. */
  function interromperLeitura() {
    const leitura = estado.leitura;
    if (!leitura) return;
    leitura.interrompida = true;
    leitura.controlador?.abort();
    estado.leitura = null;
    estado.lendo = false;
  }

  /**
   * Cancelar (FOT-06): a foto sendo lida e as da fila ficam “Cancelada”; as
   * frases das fotos já lidas continuam (FOT-21).
   */
  function cancelarLeitura() {
    interromperLeitura();
    for (const foto of lendoOuNaFila()) foto.status = STATUS.CANCELADA;
    desenhar();
    porId('foto-escolher').focus();
  }

  /** “Tentar de novo” numa foto que falhou: ela volta para a fila, e só ela. */
  function tentarDeNovo(foto) {
    if (foto.status !== STATUS.FALHOU) return;
    foto.status = STATUS.NA_FILA;
    foto.falha = null;
    desenhar();
    // O botão some com a falha: o foco fica no cartão, que anuncia o status.
    desenhado.cartoes.get(foto.id)?.focus();
    lerAFila();
  }

  /** As frases que Recomeçar perderia: as ainda não mineradas, com texto. */
  const aPerder = () => pendentes().filter(frase => frase.texto.trim());

  /** Recomeçar (FOT-17): com frases a perder, confirma no modal FOT-18. */
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

  /**
   * Volta ao começo: abandona a leitura, tira as fotos, as frases e os avisos.
   * O Livro fica. O foco vai para “Escolher”, o próximo passo.
   */
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

  async function chamarGemini(chave, foto, sinal) {
    let resposta;
    try {
      resposta = await fetch(GEMINI_URL, {
        method: 'POST',
        signal: sinal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
        body: JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType: foto.tipo, data: foto.base64 } },
            { text: PROMPT },
          ] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
        }),
      });
    } catch (causa) {
      const erro = new Error(causa.message);
      erro.semRede = true;
      throw erro;
    }

    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => ({}));
      const erro = new Error(corpo?.error?.message || `HTTP ${resposta.status}`);
      erro.status = resposta.status;
      erro.estadoDaApi = corpo?.error?.status;
      throw erro;
    }

    // Só o sentinel diz “sem marcações”. Uma resposta sem texto (pedido
    // bloqueado, corte por tamanho) é falha da leitura, não da página.
    const dados = await resposta.json();
    const texto = dados?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    if (!texto) throw new Error(JSON.stringify(dados));
    return texto
      .split('\n')
      .map(linha => linha.trim())
      .filter(linha => linha.length > 0 && !linha.startsWith(SENTINEL_VAZIO));
  }

  /**
   * Por que a leitura falhou, nos termos da pessoa: a `causa` é a 2ª frase do
   * FOT-11 (GLB-01 quando nada a explica), e `chaveRecusada` põe “Abrir
   * Configurações” no aviso.
   */
  function classificarFalha(erro) {
    const chaveRecusada = erro.status === 401 || erro.status === 403 || /api[ _]?key/i.test(erro.message);
    let causa = textoDaVoz('GLB-01');
    if (erro.semRede) causa = textoDaVoz('FOT-11.causaRede');
    else if (erro.status === 429 || erro.estadoDaApi === 'RESOURCE_EXHAUSTED') causa = textoDaVoz('FOT-11.causaLimite');
    else if (chaveRecusada) causa = textoDaVoz('FOT-11.causaChave');
    return { causa, chaveRecusada };
  }

  function numeroDaFoto(foto) {
    return estado.fotos.indexOf(foto) + 1;
  }

  const abrirConfiguracoes = () => abrirPainel(ENDERECO_DA_CHAVE);

  /**
   * O que as fotos que falharam dizem juntas: a causa da primeira e se alguma
   * teve a chave recusada.
   */
  function resumoDasFalhas(falhas) {
    return {
      causa: falhas[0].falha.causa,
      chaveRecusada: falhas.some(foto => foto.falha.chaveRecusada),
    };
  }

  /**
   * Com frases na tela, as fotos que falharam viram um aviso só no topo delas
   * (“Não deu para ler a foto 2.” ou “Não deu para ler 3 fotos.”), como no
   * protótipo: o símbolo de aviso, a abertura em negrito e a causa. Sem
   * nenhuma frase, quem diz a falha é a coluna (montarFalhas).
   * O aviso só é refeito quando falha mais uma foto: fechado, ele não volta
   * com uma foto lida.
   */
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

  /**
   * Fotos canceladas: o aviso FOT-21 no topo das frases. Quando a coluna
   * inteira já diz isso (nada foi lido), o aviso não se repete. Como o das
   * falhas, fechado ele só volta quando outra foto é cancelada.
   */
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

  /** Um aviso persistente no topo da coluna das frases, com o × de PAI-34. */
  function mostrarAviso(conteudo) {
    const aviso = montarAviso({ ...conteudo, rotuloDeFechar: textoDaVoz('PAI-34') });
    porId('foto-avisos').append(aviso);
    return aviso;
  }

  const pendentes = () => estado.frases.filter(frase => !frase.minerada);
  const paraMinerar = () => pendentes().filter(frase => frase.marcada && frase.texto.trim());

  /**
   * Minera as frases marcadas que ainda não foram mineradas. Um clique a mais
   * no meio do caminho não faz nada, e o que foi minerado não volta ao botão.
   * O “Tentar de novo” do FOT-15/16 passa `alvo`: as mesmas frases que
   * falharam, e só elas.
   */
  async function minerar(alvo = paraMinerar()) {
    if (estado.minerando) return;
    alvo = alvo.filter(frase => !frase.minerada);
    if (!alvo.length) return;

    estado.minerando = true;
    desenhado.avisoDoEnvio?.remove();
    desenharLista();

    const sessao = estado.sessao;
    const titulo = porId('foto-livro').value.trim() || TITULO_SEM_LIVRO;
    const deuCerto = await Promise.all(alvo.map(frase => salvarNoHistorico(frase.texto.trim(), titulo)));
    alvo.forEach((frase, i) => {
      if (!deuCerto[i]) return;
      frase.texto = frase.texto.trim();
      frase.minerada = true;
    });

    estado.minerando = false;
    desenharLista();

    const n = deuCerto.filter(Boolean).length;
    // Depois de Recomeçar, as frases que falharam já foram descartadas: só
    // o que foi gravado ainda é notícia.
    if (sessao !== estado.sessao) {
      if (n) mostrarToastDeSucesso(textoDaVoz('FOT-14', { n }));
      return;
    }
    if (n === alvo.length) {
      mostrarToastDeSucesso(textoDaVoz('FOT-14', { n }));
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

  /** Grava pelo service worker, que serializa as gravações (nenhuma se perde). */
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
    const painel = chrome.runtime.getURL('painel.html');
    chrome.tabs.query({}, abas => {
      const aba = abas.find(a => a.url && a.url.split('#')[0] === painel);
      if (!aba) {
        chrome.tabs.create({ url: painel + endereco });
        return;
      }
      chrome.tabs.update(aba.id, endereco ? { active: true, url: painel + endereco } : { active: true });
      chrome.windows.update(aba.windowId, { focused: true });
      if (endereco && aba.url === painel + endereco) {
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

  /** A coluna da esquerda: área de envio, progresso e um cartão por foto. */
  function desenharFila() {
    const comChave = !!estado.chaveGemini;
    porId('foto-sem-chave').hidden = comChave;
    porId('foto-envio').hidden = !comChave;
    porId('foto-fotos-total').textContent = estado.fotos.length || '';

    const naFila = fotosCom(STATUS.NA_FILA).length;
    porId('foto-envio-texto').textContent = !estado.fotos.length
      ? textoDaVoz('FOT-02.titulo')
      : naFila
        ? textoDaVoz('FOT-08', { n: naFila })
        : textoDaVoz('FOT-23.maisFotos');
    porId('foto-envio-formatos').hidden = !comChave || estado.fotos.length > 0;
    porId('foto-envio').classList.toggle('foto-envio--lendo', estado.lendo);

    // O progresso conta as fotos que foram (ou vão ser) lidas: nem a prévia
    // nem as canceladas.
    const ocupadas = lendoOuNaFila().length;
    const total = estado.fotos.length - fotosCom(STATUS.PRONTA, STATUS.CANCELADA).length;
    porId('foto-progresso').hidden = ocupadas === 0;
    const cancelar = porId('foto-cancelar');
    if (!ocupadas && document.activeElement === cancelar) porId('foto-escolher').focus();
    cancelar.hidden = ocupadas === 0;
    if (ocupadas) {
      const lidas = total - ocupadas;
      porId('foto-progresso-texto').textContent = textoDaVoz('FOT-20', { n: lidas, total });
      porId('foto-progresso-barra').style.width = `${Math.round((lidas / total) * 100)}%`;
    }

    for (const foto of estado.fotos) {
      let cartao = desenhado.cartoes.get(foto.id);
      if (!cartao) {
        cartao = montarCartaoDaFoto(foto);
        desenhado.cartoes.set(foto.id, cartao);
        porId('foto-fila').append(cartao);
      }
      atualizarCartaoDaFoto(cartao, foto);
    }
  }

  function montarCartaoDaFoto(foto) {
    const nome = elemento('p', 'foto-cartao__nome', foto.nome);
    nome.title = foto.nome;
    nome.id = `foto-cartao-nome-${foto.id}`;
    // Cada foto que falhou tem o seu: o nome da foto o descreve.
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

  /** A miniatura; um HEIC que o Chrome não desenha fica com o ícone de foto. */
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

  /**
   * O topo da coluna das frases quando ainda não há lista: sem chave, o
   * começo, a prévia, a leitura da 1ª foto, as fotos que falharam ou a
   * leitura sem marcações. Só é refeito quando o estado muda, para não roubar
   * o foco de quem está nele.
   */
  function desenharEstado() {
    const { id, montar } = estadoDaColuna();
    if (id === desenhado.estadoDaColuna) return;
    desenhado.estadoDaColuna = id;
    porId('foto-estado').replaceChildren(...(montar ? [montar()] : []));
  }

  function estadoDaColuna() {
    if (!estado.chaveGemini) return { id: 'semChave', montar: montarSemChave };
    if (!estado.fotos.length) return { id: 'inicio', montar: montarInicio };

    const pronta = fotosCom(STATUS.PRONTA)[0];
    if (pronta) return { id: `previa:${pronta.id}`, montar: () => montarPrevia(pronta) };
    if (estado.frases.length) return { id: 'lista' };

    const lendo = fotosCom(STATUS.LENDO)[0];
    if (lendo || lendoOuNaFila().length) {
      const total = estado.fotos.length;
      const n = lendo ? numeroDaFoto(lendo) : 1;
      return { id: `lendo:${n}/${total}`, montar: () => montarLendo(n, total) };
    }
    // Sem frases, uma falha é o estado da coluna: o vazio “Sem marcações” não
    // pode pôr a culpa nas marcações quando alguma leitura nem aconteceu.
    const falhas = fotosCom(STATUS.FALHOU);
    if (falhas.length) {
      return { id: `falhas:${falhas.map(foto => foto.id)}`, montar: () => montarFalhas(falhas) };
    }
    const lidas = fotosCom(STATUS.LIDA).length;
    if (lidas) return { id: `semMarcacoes:${lidas}`, montar: () => montarSemMarcacoes(lidas) };
    // Cancelada antes de qualquer foto ser lida: a coluna diz isso, e o aviso
    // FOT-21 não se repete em cima dela.
    if (fotosCom(STATUS.CANCELADA).length) return { id: ID_DA_COLUNA_CANCELADA, montar: montarCancelada };
    return { id: 'nada' };
  }

  function vazio(icone, ...partes) {
    return elemento('div', 'veio-vazio foto-vazio', iconeVeio(icone), ...partes);
  }

  /** O vazio em ouro, dos estados em que a página espera a pessoa ou o Gemini. */
  function vazioDeAcento(icone, ...partes) {
    const caixa = vazio(icone, ...partes);
    caixa.classList.add('foto-vazio--acento');
    return caixa;
  }

  /** Recomeçar dentro de um estado da coluna (prévia, falha, sem marcações). */
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

  /** Cancelada antes de ler qualquer foto (FOT-21, como no protótipo). */
  function montarCancelada() {
    return vazio('fechar',
      elemento('p', 'veio-vazio__titulo', textoDaVoz('FOT-21.titulo')),
      elemento('p', 'veio-vazio__texto', textoDaVoz('FOT-21.nenhumaLida')),
      botaoRecomecar());
  }

  /**
   * Nenhuma frase e alguma foto falhou (“Não deu para ler a foto” / “as
   * fotos”, como no protótipo): a causa e, quando a chave foi recusada, o
   * caminho até ela.
   */
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

  /** As frases agrupadas por foto, a seleção, a contagem e o botão. */
  function desenharLista() {
    porId('foto-lista').hidden = estado.frases.length === 0;
    if (!estado.frases.length) return;

    // As fotos terminam em ordem, então um grupo novo sempre entra no fim, e
    // os que já estão na tela (com uma edição em curso) não saem do lugar.
    for (const foto of estado.fotos) {
      const frasesDaFoto = estado.frases.filter(frase => frase.fotoId === foto.id);
      if (!frasesDaFoto.length) continue;
      let grupo = desenhado.grupos.get(foto.id);
      if (!grupo) {
        grupo = montarGrupo(foto);
        desenhado.grupos.set(foto.id, grupo);
        porId('foto-grupos').append(grupo);
      }
      for (const frase of frasesDaFoto) {
        let linha = desenhado.linhas.get(frase.id);
        if (!linha) {
          linha = montarLinha(frase);
          desenhado.linhas.set(frase.id, linha);
          grupo.querySelector('.foto-grupo__frases').append(linha);
        }
        atualizarLinha(linha, frase);
      }
    }

    const aindaNao = pendentes();
    const marcadas = aindaNao.filter(frase => frase.marcada);
    const todas = porId('foto-todas');
    refletirSelecao(todas, marcadas.length, aindaNao.length);
    todas.disabled = aindaNao.length === 0;
    porId('foto-contagem').textContent = textoDaVoz('FOT-09', { n: estado.frases.length });

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

    // O texto é editável no lugar: o que estiver nele é o que vai ser minerado.
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

  /** Um elemento com classe e filhos; texto sempre entra como texto. */
  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  function botao(variante, ...filhos) {
    const no = elemento('button', `veio-botao ${variante}`, ...filhos);
    no.type = 'button';
    return no;
  }

  function selo(modificador, texto) {
    return elemento('span', `veio-selo ${modificador}`.trim(), texto);
  }
})(globalThis.PerpetualMiner);
