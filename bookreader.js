'use strict';

// Minerar de uma foto, no layout C · Fotos × frases (docs/design/foto/).
//
// À esquerda, a fila de fotos: cada uma com miniatura e status (FOT-19), o
// progresso da leitura (FOT-20) e a área de envio. À direita, as frases que o
// Gemini leu, agrupadas por foto, com “Selecionar todas”, a contagem (FOT-09)
// e “Minerar N frases” (FOT-12).
//
// A página só afirma o que confirmou:
//   - uma foto que o Gemini leu sem achar nada é “Sem marcações” (FOT-10); uma
//     foto em que a API falhou é “Falhou” com o motivo (FOT-11), nunca culpa as
//     marcações;
//   - uma frase minerada fica “✓ minerada” e sai do botão, então clicar de novo
//     (ou chegar outra foto) nunca grava a mesma frase duas vezes.
//
// A chave do Gemini mora em Configurações: sem ela, o cartão FOT-05 leva a
// #configuracoes/chave. O Livro (o Título das frases) fica lembrado em
// `bookTitleDefault`. Cancelar, Recomeçar e “Tentar de novo” numa foto são do
// #37. Toda cópia vem do catálogo da Voz.

(function (raiz) {
  const { textoDaVoz, detectarIdioma } = raiz;
  const { iconeVeio, montarAviso, mostrarToastDeSucesso, refletirSelecao } = raiz.Veio;

  // ─── Constantes ─────────────────────────────────────────────────────────────

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
  };

  /** As marcações da legenda (FOT-24): a parte do exemplo e a do nome de cada uma. */
  const LEGENDA = [
    { exemplo: 'FOT-24.exemploBarras', nome: 'FOT-24.barras' },
    { exemplo: 'FOT-24.exemploUnderscores', nome: 'FOT-24.underscores' },
    { exemplo: 'FOT-24.exemploSublinhado', nome: 'FOT-24.sublinhado', sublinhado: true },
    { exemplo: 'FOT-24.exemploColchetes', nome: 'FOT-24.colchetes' },
  ];

  // ─── Estado ─────────────────────────────────────────────────────────────────

  const estado = {
    chave: '',
    fotos: [],        // { id, nome, tipo, base64, url, status, achadas, falha: { causa, chaveRecusada, detalhes } }
    frases: [],       // { id, fotoId, texto, marcada, minerada }
    lendo: false,     // a fila está sendo lida
    minerando: false, // um “Minerar N frases” está a caminho do service worker
  };
  let proximoId = 1;

  /** O que já está desenhado, para redesenhar só o que mudou. */
  const desenhado = {
    estado: null,               // a chave do estado da coluna das frases
    cartoes: new Map(),         // foto.id → <li> da fila
    grupos: new Map(),          // foto.id → grupo de frases
    linhas: new Map(),          // frase.id → linha da frase
    avisoDoEnvio: null,         // o aviso de FOT-15/16, trocado a cada envio
  };

  const porId = id => document.getElementById(id);

  // ─── Início ─────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    document.title = `${textoDaVoz('FOT-01.titulo')} · PerpetualMiner`;
    preencherTextosFixos();
    porId('foto-marcacoes').replaceWith(montarLegenda());

    chrome.storage.local.get({ geminiApiKey: '', bookTitleDefault: '' }, dados => {
      estado.chave = dados.geminiApiKey || '';
      porId('foto-livro').value = dados.bookTitleDefault || '';
      desenhar();
    });
    // A chave salva no painel libera a página sem recarregar.
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area !== 'local' || !('geminiApiKey' in mudancas)) return;
      estado.chave = mudancas.geminiApiKey.newValue || '';
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
    const sobre = ativo => envio.classList.toggle('foto-envio--sobre', ativo && !!estado.chave);
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

  // ─── Fotos ──────────────────────────────────────────────────────────────────

  /** O tipo da foto pelo tipo do arquivo ou, sem ele, pela extensão; `null` se não é foto. */
  function tipoDaFoto(arquivo) {
    if (TIPOS_ACEITOS.has(arquivo.type)) return arquivo.type;
    const extensao = arquivo.name.split('.').pop().toLowerCase();
    return TIPO_POR_EXTENSAO[extensao] || null;
  }

  async function receberArquivos(arquivos) {
    if (!estado.chave || !arquivos.length) return;

    const recusados = arquivos.filter(arquivo => !tipoDaFoto(arquivo));
    if (recusados.length) {
      mostrarAviso({
        texto: textoDaVoz('FOT-04'),
        detalhes: recusados.map(arquivo => arquivo.name).join('\n'),
      });
    }

    const aceitos = arquivos.filter(arquivo => tipoDaFoto(arquivo));
    if (!aceitos.length) return;
    const novas = await Promise.all(aceitos.map(lerArquivo));

    // Uma foto sozinha para na prévia, como hoje; várias vão direto para a
    // leitura. Uma foto que chega com a prévia aberta espera junto com ela.
    const primeiraVez = estado.fotos.length === 0;
    const comPrevia = estado.fotos.some(foto => foto.status === STATUS.PRONTA);
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
    for (const foto of estado.fotos) if (foto.status === STATUS.PRONTA) foto.status = STATUS.NA_FILA;
    desenhar();
    lerAFila();
  }

  /** Lê as fotos da fila uma por vez, na ordem em que chegaram. */
  async function lerAFila() {
    if (estado.lendo) return;
    estado.lendo = true;

    let foto;
    while ((foto = estado.fotos.find(f => f.status === STATUS.NA_FILA))) {
      foto.status = STATUS.LENDO;
      desenhar();
      try {
        const textos = await chamarGemini(estado.chave, foto);
        for (const texto of textos) {
          estado.frases.push({ id: proximoId++, fotoId: foto.id, texto, marcada: true, minerada: false });
        }
        foto.achadas = textos.length;
        foto.status = STATUS.LIDA;
      } catch (erro) {
        foto.status = STATUS.FALHOU;
        foto.falha = classificarFalha(erro);
        mostrarFalhaDaFoto(foto);
      }
      desenhar();
    }

    estado.lendo = false;
    desenhar();
  }

  // ─── Gemini ─────────────────────────────────────────────────────────────────

  async function chamarGemini(chave, foto) {
    let resposta;
    try {
      resposta = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(chave)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    if (!texto) {
      const motivo = dados?.promptFeedback?.blockReason || dados?.candidates?.[0]?.finishReason || 'sem texto';
      throw new Error(`Resposta do Gemini sem texto (${motivo})`);
    }
    return texto
      .split('\n')
      .map(linha => linha.trim())
      .filter(linha => linha.length > 0 && !linha.startsWith(SENTINEL_VAZIO));
  }

  /**
   * Por que a leitura falhou, nos termos da pessoa: a `causa` é a 2ª frase do
   * FOT-11 (GLB-01 quando nada a explica), `chaveRecusada` põe “Abrir
   * Configurações” no aviso, e o original vai para `detalhes`.
   */
  function classificarFalha(erro) {
    const chaveRecusada = erro.status === 401 || erro.status === 403 || /api[ _]?key/i.test(erro.message);
    let causa = textoDaVoz('GLB-01');
    if (erro.semRede) causa = textoDaVoz('FOT-11.causaRede');
    else if (erro.status === 429 || erro.estadoDaApi === 'RESOURCE_EXHAUSTED') causa = textoDaVoz('FOT-11.causaLimite');
    else if (chaveRecusada) causa = textoDaVoz('FOT-11.causaChave');
    return { causa, chaveRecusada, detalhes: erro.message };
  }

  function numeroDaFoto(foto) {
    return estado.fotos.indexOf(foto) + 1;
  }

  function mostrarFalhaDaFoto(foto) {
    const { causa, chaveRecusada, detalhes } = foto.falha;
    mostrarAviso({
      texto: `${textoDaVoz('FOT-11.aviso', { n: numeroDaFoto(foto) })} ${causa}`,
      acao: chaveRecusada
        ? { rotulo: textoDaVoz('FOT-05.acao'), aoUsar: () => abrirPainel('#configuracoes/chave') }
        : undefined,
      detalhes,
    });
  }

  /** Um aviso persistente no topo da coluna das frases, com o × de PAI-34. */
  function mostrarAviso(conteudo) {
    const aviso = montarAviso({ ...conteudo, rotuloDeFechar: textoDaVoz('PAI-34') });
    porId('foto-avisos').append(aviso);
    return aviso;
  }

  // ─── Minerar ────────────────────────────────────────────────────────────────

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
  function salvarNoHistorico(texto, titulo) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({
        type: 'SALVAR_HISTORICO',
        texto,
        origem: 'livro',
        idioma: detectarIdioma(texto),
        contexto: { fonte: 'livro', titulo, detalhe: '' },
      }, resposta => {
        resolve(!chrome.runtime.lastError && resposta?.ok !== false);
      });
    });
  }

  // ─── Painel ─────────────────────────────────────────────────────────────────

  /**
   * Foca a aba do painel que já estiver aberta (levando-a a `endereco`, se
   * houver); sem nenhuma, abre uma. Nunca abre um segundo painel.
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
    });
  }

  // ─── Desenho ────────────────────────────────────────────────────────────────

  function desenhar() {
    desenharFila();
    desenharEstado();
    desenharLista();
  }

  const lendoOuNaFila = () => estado.fotos.filter(f => f.status === STATUS.LENDO || f.status === STATUS.NA_FILA);

  /** A coluna da esquerda: área de envio, progresso e um cartão por foto. */
  function desenharFila() {
    const comChave = !!estado.chave;
    porId('foto-sem-chave').hidden = comChave;
    porId('foto-envio').hidden = !comChave;
    porId('foto-fotos-total').textContent = estado.fotos.length || '';

    const naFila = estado.fotos.filter(f => f.status === STATUS.NA_FILA).length;
    porId('foto-envio-texto').textContent = !estado.fotos.length
      ? textoDaVoz('FOT-02.titulo')
      : naFila
        ? textoDaVoz('FOT-08', { n: naFila })
        : textoDaVoz('FOT-23.maisFotos');
    porId('foto-envio-formatos').hidden = estado.fotos.length > 0;
    porId('foto-envio').classList.toggle('foto-envio--lendo', estado.lendo);

    const ocupadas = lendoOuNaFila().length;
    const total = estado.fotos.filter(f => f.status !== STATUS.PRONTA).length;
    porId('foto-progresso').hidden = ocupadas === 0;
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
    return elemento('li', 'foto-cartao',
      miniatura(foto, 'foto-cartao__miniatura'),
      elemento('div', 'foto-cartao__info', nome,
        elemento('div', 'foto-cartao__status'),
        elemento('p', 'foto-cartao__causa')));
  }

  function atualizarCartaoDaFoto(cartao, foto) {
    cartao.dataset.status = foto.status;
    cartao.querySelector('.foto-cartao__status').replaceChildren(seloDaFoto(foto));
    const causa = cartao.querySelector('.foto-cartao__causa');
    causa.textContent = foto.status === STATUS.FALHOU ? foto.falha.causa : '';
    causa.hidden = foto.status !== STATUS.FALHOU;
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
   * começo, a prévia, a leitura da 1ª foto ou a leitura sem marcações. Só é
   * refeito quando o estado muda, para não roubar o foco de quem está nele.
   */
  function desenharEstado() {
    const { chave, montar } = estadoDaColuna();
    if (chave === desenhado.estado) return;
    desenhado.estado = chave;
    porId('foto-estado').replaceChildren(...(montar ? [montar()] : []));
  }

  function estadoDaColuna() {
    if (!estado.chave) return { chave: 'semChave', montar: montarSemChave };
    if (!estado.fotos.length) return { chave: 'inicio', montar: montarInicio };

    const pronta = estado.fotos.find(f => f.status === STATUS.PRONTA);
    if (pronta) return { chave: `previa:${pronta.id}`, montar: () => montarPrevia(pronta) };
    if (estado.frases.length) return { chave: 'lista' };

    const lendo = estado.fotos.find(f => f.status === STATUS.LENDO);
    if (lendo || lendoOuNaFila().length) {
      const total = estado.fotos.length;
      const n = lendo ? numeroDaFoto(lendo) : 1;
      return { chave: `lendo:${n}/${total}`, montar: () => montarLendo(n, total) };
    }
    // “Sem marcações” só quando nenhuma foto falhou: com uma falha, o aviso
    // dela é o estado, e o vazio não pode pôr a culpa nas marcações.
    const algumaFalhou = estado.fotos.some(f => f.status === STATUS.FALHOU);
    if (!algumaFalhou && estado.fotos.some(f => f.status === STATUS.LIDA)) {
      return { chave: 'semMarcacoes', montar: montarSemMarcacoes };
    }
    return { chave: 'nada' };
  }

  function vazio(icone, ...partes) {
    return elemento('div', 'veio-vazio foto-vazio', iconeVeio(icone), ...partes);
  }

  function montarSemChave() {
    const abrir = elemento('button', 'veio-botao veio-botao--primario', iconeVeio('chave'), textoDaVoz('FOT-05.acao'));
    abrir.type = 'button';
    abrir.addEventListener('click', () => abrirPainel('#configuracoes/chave'));
    const caixa = vazio('chave',
      elemento('p', 'veio-vazio__titulo', textoDaVoz('FOT-05.titulo')),
      elemento('p', 'veio-vazio__texto', textoDaVoz('FOT-05.aviso')),
      abrir);
    caixa.classList.add('foto-vazio--acento');
    return caixa;
  }

  function montarInicio() {
    const caixa = vazio('livro',
      elemento('p', 'veio-vazio__titulo', textoDaVoz('FOT-01.titulo')),
      elemento('p', 'veio-vazio__texto', textoDaVoz('FOT-01.subtitulo')),
      elemento('p', 'veio-vazio__texto', textoDaVoz('FOT-25.comoAparecem')));
    caixa.classList.add('foto-vazio--acento', 'foto-vazio--inicio');
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
      elemento('div', 'foto-previa__acoes', ler));
  }

  function montarLendo(n, total) {
    const caixa = vazio('ler',
      elemento('p', 'veio-vazio__titulo', total > 1 ? textoDaVoz('FOT-07', { n, total }) : textoDaVoz('FOT-06.titulo')),
      elemento('p', 'veio-vazio__texto', textoDaVoz('FOT-06.detalhe')));
    caixa.classList.add('foto-vazio--acento');
    return caixa;
  }

  function montarSemMarcacoes() {
    return vazio('busca',
      elemento('p', 'veio-vazio__texto', textoDaVoz('FOT-10')),
      montarLegenda());
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

    const minerada = elemento('span', 'foto-frase__minerada', textoDaVoz('FOT-25.minerada'));
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

  // ─── Ajudantes ──────────────────────────────────────────────────────────────

  /** Um elemento com classe e filhos; texto sempre entra como texto. */
  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  function selo(modificador, texto) {
    return elemento('span', `veio-selo ${modificador}`.trim(), texto);
  }
})(globalThis.PerpetualMiner);
