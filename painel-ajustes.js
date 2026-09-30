'use strict';

// A aba Ajustes de envio da Conexão com o Anki (docs/design/painel/anki/prototipo-ajustes-envio.html,
// variante A · Cartões): um card por idioma, recolhível como os de Configurações. O card fechado
// diz o baralho e a fonte de imagem gravados; aberto, traz o formulário do idioma (Baralho, Imagens,
// o sotaque do áudio no Avançado) e só grava em Salvar ajustes.
//
// O Baralho é uma escolha entre os baralhos que o Anki tem (`GET /anki/decks`, com o nome legível:
// os níveis `::` viram ›). Sem a lista (a Conexão desligada, o Anki sem responder), é um campo de
// texto, em branco volta ao padrão, e um nome com nível vazio (`Inglês::`) é recusado no campo.
//
// O rascunho de cada idioma sobrevive a abrir e fechar os cards. O que outra aba salva chega por
// `AjustesDeEnvio.acompanhar`: um idioma sem rascunho passa a mostrar o novo; um com rascunho fica
// como está, e Salvar recusa (a versão lida ficou para trás) com o aviso de que mudou em outra aba;
// nada é sobrescrito sem a pessoa ver. Com a Conexão desligada, tudo continua editável (a nota BRG-33
// é do painel-anki.js). Toda cópia vem do catálogo da Voz.

(function (raiz) {
  const { textoDaVoz, Veio, AjustesDeEnvio, IDIOMAS, Shell } = raiz;
  const { IMAGENS } = AjustesDeEnvio;
  const NOME_DO_IDIOMA = { en: IDIOMAS.INGLES, ru: IDIOMAS.RUSSO };
  const CODIGO_DO_IDIOMA = { en: 'BRG-28.codigoEn', ru: 'BRG-28.codigoRu' };
  const CAMPOS = ['deckName', 'imageSource', 'ttsWordTld', 'ttsPhraseTld'];
  // Os sotaques da voz do Google, por nome de lugar: o domínio é o que o bridge
  // recebe, e a pessoa não precisa saber qual é qual.
  const SOTAQUES = {
    en: [
      ['com', 'BRG-07.sotaqueEstadosUnidos'],
      ['co.uk', 'BRG-07.sotaqueReinoUnido'],
      ['com.au', 'BRG-07.sotaqueAustralia'],
      ['co.in', 'BRG-07.sotaqueIndia'],
      ['ca', 'BRG-07.sotaqueCanada'],
      ['ie', 'BRG-07.sotaqueIrlanda'],
      ['co.za', 'BRG-07.sotaqueAfricaDoSul'],
    ],
    ru: [['ru', 'BRG-07.sotaqueRussia']],
  };
  const porId = id => document.getElementById(id);

  const estado = {
    aberto: 'en',                   // o card aberto (um por vez); null com todos fechados
    gravados: null,                 // os ajustes gravados, como os cards fechados mostram
    lidos: { en: null, ru: null },  // o gravado de onde cada rascunho partiu (com a versão)
    rascunhos: { en: null, ru: null },
    erros: { en: false, ru: false },// o nome do baralho tem um nível vazio (só no campo de texto)
    baralhos: null,                 // os baralhos do Anki; null sem a lista (campo de texto)
    ultimaLeituraDeBaralhos: 0,
    salvando: null,
  };

  function iniciar() {
    montarCartoes();
    AjustesDeEnvio.acompanhar(aoMudarOGravado);
    Shell.aoMudarAConexao(situacao => { if (situacao === Shell.CONEXAO.LIGADA) lerBaralhos(); });
    Shell.aoEntrarNaArea('anki', lerBaralhos);
  }

  // ─── Estado ────────────────────────────────────────────────────────────────

  function copia(ajustesDoIdioma) {
    return Object.fromEntries(CAMPOS.map(campo => [campo, ajustesDoIdioma[campo]]));
  }

  function temRascunho(lang) {
    const lido = estado.lidos[lang];
    const rascunho = estado.rascunhos[lang];
    return Boolean(lido && rascunho) && CAMPOS.some(campo => rascunho[campo] !== lido[campo]);
  }

  /** Trazer o gravado para o formulário de um idioma, descartando o rascunho. */
  function adotarGravado(lang) {
    estado.lidos[lang] = estado.gravados[lang];
    estado.rascunhos[lang] = copia(estado.gravados[lang]);
    estado.erros[lang] = false;
  }

  function aoMudarOGravado(ajustes) {
    estado.gravados = ajustes;
    for (const lang of AjustesDeEnvio.LANGS) {
      if (!temRascunho(lang) && estado.salvando !== lang) adotarGravado(lang);
    }
    desenhar();
  }

  /** O nome tem um nível vazio (`Inglês::`, `::Minerar`): o Anki não cria esse baralho. */
  function comNivelVazio(nome) {
    const texto = String(nome || '').trim();
    return texto !== '' && texto.split('::').some(parte => !parte.trim());
  }

  // ─── Os baralhos do Anki ───────────────────────────────────────────────────

  async function lerBaralhos() {
    const leitura = ++estado.ultimaLeituraDeBaralhos;
    let baralhos = null;
    try {
      const resposta = await fetch(`${Shell.ENDERECO_DA_CONEXAO}/anki/decks`);
      if (resposta.ok) {
        const dados = await resposta.json();
        if (Array.isArray(dados.decks)) baralhos = dados.decks.map(String);
      }
    } catch {
      // Sem a lista, o Baralho é um campo de texto.
    }
    if (leitura !== estado.ultimaLeituraDeBaralhos) return;
    if (JSON.stringify(baralhos) === JSON.stringify(estado.baralhos)) return;
    estado.baralhos = baralhos;
    desenhar();
  }

  /** As opções do Baralho: os do Anki e, fora deles, o escolhido e o padrão, dizendo que o Anki não os tem. */
  function opcoesDeBaralho(lang) {
    const escolhido = estado.rascunhos[lang].deckName;
    const padrao = AjustesDeEnvio.baralhoPadrao(lang);
    const nomes = [...estado.baralhos];
    for (const nome of [escolhido, padrao]) {
      if (nome && !nomes.includes(nome)) nomes.push(nome);
    }
    return nomes.map(nome => {
      const legivel = AjustesDeEnvio.nomeDoBaralho(nome);
      return opcao(nome, estado.baralhos.includes(nome) ? legivel : textoDaVoz('BRG-07.baralhoForaDoAnki', { baralho: legivel }));
    });
  }

  // ─── Salvar ────────────────────────────────────────────────────────────────

  async function salvar(lang) {
    if (estado.salvando || !estado.gravados) return;
    if (!estado.baralhos && comNivelVazio(estado.rascunhos[lang].deckName)) {
      estado.erros[lang] = true;
      desenhar();
      porId(`ajustes-baralho-${lang}`)?.focus();
      return;
    }
    estado.erros[lang] = false;
    const enviados = copia(estado.rascunhos[lang]);
    estado.salvando = lang;
    let resultado;
    try {
      resultado = await AjustesDeEnvio.salvar(lang, enviados, estado.lidos[lang].versao);
    } catch (erro) {
      mostrarAviso({ texto: textoDaVoz('BRG-07.naoSalvou'), detalhes: String(erro?.message || erro) });
      return;
    } finally {
      estado.salvando = null;
    }
    estado.gravados = resultado.ajustes;
    if (!resultado.ok) {
      mostrarAviso({
        texto: textoDaVoz('BRG-07.desatualizada'),
        acao: { rotulo: textoDaVoz('BRG-07.mostrarNovos'), aoUsar: () => mostrarOsNovos(lang) },
      });
      desenhar();
      return;
    }
    if (CAMPOS.some(campo => estado.rascunhos[lang][campo] !== enviados[campo])) {
      estado.lidos[lang] = estado.gravados[lang];
    } else adotarGravado(lang);
    fecharAviso();
    desenhar();
    Veio.mostrarToastDeSucesso(textoDaVoz('BRG-07.salvo'));
  }

  function mostrarOsNovos(lang) {
    adotarGravado(lang);
    fecharAviso();
    estado.aberto = lang;
    desenhar();
    (porId(`ajustes-baralho-${lang}`) || porId(`ajustes-cabeca-${lang}`))?.focus();
  }

  // ─── Aviso ─────────────────────────────────────────────────────────────────

  function mostrarAviso({ texto, acao, detalhes }) {
    const aviso = Veio.montarAviso({
      texto,
      acao,
      detalhes,
      rotuloDeFechar: textoDaVoz('PAI-34'),
      aoFechar: fecharAviso,
    });
    porId('ajustes-aviso').replaceChildren(aviso);
  }

  function fecharAviso() {
    porId('ajustes-aviso').replaceChildren();
  }

  // ─── Os cards ──────────────────────────────────────────────────────────────

  function alternar(lang) {
    estado.aberto = estado.aberto === lang ? null : lang;
    desenhar();
    porId(`ajustes-cabeca-${lang}`)?.focus();
  }

  function montarCartoes() {
    porId('ajustes-cards').replaceChildren(...AjustesDeEnvio.LANGS.map(lang => {
      const alternador = elemento('button', 'cfg-alternar', NOME_DO_IDIOMA[lang]);
      alternador.type = 'button';
      alternador.id = `ajustes-cabeca-${lang}`;
      alternador.setAttribute('aria-controls', `ajustes-corpo-${lang}`);
      alternador.addEventListener('click', evento => { evento.stopPropagation(); alternar(lang); });

      const cabeca = elemento('div', 'cfg-cabeca',
        elemento('span', 'cfg-icone', elemento('span', 'ajustes-codigo', textoDaVoz(CODIGO_DO_IDIOMA[lang]))),
        elemento('div', 'cfg-titulos',
          elemento('h2', 'shell-card__titulo', alternador),
          elemento('p', 'cfg-descricao', textoDaVoz('BRG-07.descricao', { idioma: NOME_DO_IDIOMA[lang].toLowerCase() }))),
        elemento('span', 'cfg-resumo', elemento('span', 'ajustes-resumo')),
        elemento('span', 'cfg-chevron', Veio.iconeVeio('abrir')));
      cabeca.addEventListener('click', () => alternar(lang));

      const corpo = elemento('form', 'cfg-corpo ajustes-form');
      corpo.id = `ajustes-corpo-${lang}`;
      corpo.noValidate = true;
      corpo.hidden = true;
      corpo.setAttribute('aria-label', textoDaVoz('BRG-07.formulario', { idioma: NOME_DO_IDIOMA[lang] }));
      corpo.addEventListener('submit', evento => { evento.preventDefault(); salvar(lang); });
      corpo.addEventListener('input', () => aoEditar(lang));
      corpo.addEventListener('change', () => aoEditar(lang));

      const cartao = elemento('section', 'shell-card cfg-card ajustes-card', cabeca, corpo);
      cartao.dataset.idioma = lang;
      return cartao;
    }));
  }

  function desenhar() {
    if (!estado.gravados) return;
    const foco = document.activeElement?.id;
    for (const cartao of porId('ajustes-cards').children) {
      const lang = cartao.dataset.idioma;
      const gravado = estado.gravados[lang];
      const aberto = estado.aberto === lang;
      cartao.classList.toggle('cfg-card--aberto', aberto);
      cartao.querySelector('.cfg-alternar').setAttribute('aria-expanded', String(aberto));
      cartao.querySelector('.ajustes-resumo').textContent = [
        AjustesDeEnvio.nomeDoBaralho(gravado.deckName),
        textoDaVoz(gravado.imageSource === IMAGENS.GERADA_POR_IA ? 'BRG-07.azulejoGeradaPorIa' : 'BRG-07.azulejoFotoReal'),
      ].join(' ');
      const corpo = cartao.querySelector('.ajustes-form');
      corpo.hidden = !aberto;
      if (aberto) corpo.replaceChildren(...formulario(lang));
    }
    if (foco) porId(foco)?.focus();
  }

  // ─── O formulário de um idioma ─────────────────────────────────────────────

  function formulario(lang) {
    return [campoDoBaralho(lang), campoDasImagens(lang), avancado(lang), acoes(lang)];
  }

  function campoDoBaralho(lang) {
    const rascunho = estado.rascunhos[lang];
    const id = `ajustes-baralho-${lang}`;
    const rotulo = elemento('label', 'ajustes-campo__rotulo', textoDaVoz('BRG-07.baralho'));
    rotulo.htmlFor = id;
    if (estado.baralhos) {
      const escolha = elemento('select', 'veio-campo', ...opcoesDeBaralho(lang));
      escolha.id = id;
      escolha.value = rascunho.deckName;
      escolha.addEventListener('change', () => { rascunho.deckName = escolha.value; });
      return elemento('div', 'ajustes-campo', rotulo, elemento('span', 'veio-select', escolha));
    }
    const campo = elemento('input', 'veio-campo');
    campo.id = id;
    campo.type = 'text';
    campo.autocomplete = 'off';
    campo.spellcheck = false;
    campo.value = rascunho.deckName;
    campo.placeholder = AjustesDeEnvio.baralhoPadrao(lang);
    campo.addEventListener('input', () => {
      rascunho.deckName = campo.value;
      if (estado.erros[lang]) {
        estado.erros[lang] = false;
        campo.removeAttribute('aria-invalid');
        porId(`${id}-ajuda`).replaceWith(ajudaDoBaralho(lang, id));
      }
    });
    const erro = estado.erros[lang];
    if (erro) campo.setAttribute('aria-invalid', 'true');
    campo.setAttribute('aria-describedby', `${id}-ajuda`);
    return elemento('div', 'ajustes-campo', rotulo, campo, ajudaDoBaralho(lang, id));
  }

  /** Embaixo do campo de texto: o que vale em branco, ou (nome com nível vazio) o porquê da recusa. */
  function ajudaDoBaralho(lang, id) {
    const ajuda = estado.erros[lang]
      ? elemento('p', 'veio-campo-erro', textoDaVoz('BRG-07.nivelVazio'))
      : elemento('span', 'ajustes-campo__ajuda',
        textoDaVoz('BRG-07.baralhoEmBranco', { baralho: AjustesDeEnvio.baralhoPadrao(lang) }));
    ajuda.id = `${id}-ajuda`;
    return ajuda;
  }

  function campoDasImagens(lang) {
    const rascunho = estado.rascunhos[lang];
    const rotulo = elemento('span', 'ajustes-campo__rotulo', textoDaVoz('BRG-07.imagens'));
    rotulo.id = `ajustes-imagens-${lang}-rotulo`;
    const grupo = elemento('div', 'veio-segmentado', ...[
      [IMAGENS.FOTO_REAL, 'BRG-07.fotoReal'],
      [IMAGENS.GERADA_POR_IA, 'BRG-07.geradaPorIa'],
    ].map(([valor, voz]) => {
      const radio = elemento('input');
      radio.type = 'radio';
      radio.name = `ajustes-imagens-${lang}`;
      radio.value = valor;
      radio.checked = rascunho.imageSource === valor;
      radio.addEventListener('change', () => {
        rascunho.imageSource = valor;
        porId(`ajustes-imagens-${lang}-nota`).textContent = notaDasImagens(lang);
      });
      return elemento('label', 'veio-segmentado__opcao', radio, elemento('span', '', textoDaVoz(voz)));
    }));
    grupo.setAttribute('role', 'radiogroup');
    grupo.setAttribute('aria-labelledby', rotulo.id);
    grupo.setAttribute('aria-describedby', `ajustes-imagens-${lang}-nota`);
    const nota = elemento('span', 'ajustes-campo__ajuda', notaDasImagens(lang));
    nota.id = `ajustes-imagens-${lang}-nota`;
    return elemento('div', 'ajustes-campo', rotulo, grupo, nota);
  }

  function notaDasImagens(lang) {
    return textoDaVoz(estado.rascunhos[lang].imageSource === IMAGENS.GERADA_POR_IA ? 'BRG-07.notaGeradaPorIa' : 'BRG-07.notaFotoReal');
  }

  function avancado(lang) {
    const aberto = estado.avancadoAberto?.[lang] === true;
    const detalhes = elemento('details', 'anki-avancado',
      elemento('summary', '',
        textoDaVoz('BRG-32.titulo'), ' ', elemento('small', '', `· ${textoDaVoz('BRG-07.avancado')}`)),
      elemento('div', 'anki-avancado__corpo',
        elemento('p', 'ajustes-sotaque-idioma', NOME_DO_IDIOMA[lang]),
        elemento('p', 'anki-apoio', textoDaVoz('BRG-07.sotaque')),
        elemento('div', 'ajustes-sotaques',
          campoDoSotaque(lang, 'ttsWordTld', 'BRG-07.sotaquePalavra'),
          campoDoSotaque(lang, 'ttsPhraseTld', 'BRG-07.sotaqueFrase'))));
    detalhes.id = `ajustes-avancado-${lang}`;
    detalhes.open = aberto;
    detalhes.addEventListener('toggle', () => {
      estado.avancadoAberto = { ...estado.avancadoAberto, [lang]: detalhes.open };
    });
    return detalhes;
  }

  /** O sotaque, pelo nome do lugar; um domínio gravado que não está na lista continua lá, com o próprio nome. */
  function campoDoSotaque(lang, campo, vozDoRotulo) {
    const rascunho = estado.rascunhos[lang];
    const dominio = rascunho[campo];
    const opcoes = SOTAQUES[lang].map(([valor, voz]) => opcao(valor, textoDaVoz(voz)));
    if (!SOTAQUES[lang].some(([valor]) => valor === dominio)) opcoes.push(opcao(dominio, dominio));
    const escolha = elemento('select', 'veio-campo', ...opcoes);
    escolha.id = `ajustes-${campo}-${lang}`;
    escolha.value = dominio;
    escolha.addEventListener('change', () => { rascunho[campo] = escolha.value; });
    const rotulo = elemento('label', 'ajustes-campo__rotulo', textoDaVoz(vozDoRotulo));
    rotulo.htmlFor = escolha.id;
    return elemento('div', 'ajustes-campo', rotulo, elemento('span', 'veio-select', escolha));
  }

  function acoes(lang) {
    const salvar = elemento('button', 'veio-botao', textoDaVoz('BRG-07.salvar'));
    salvar.type = 'submit';
    salvar.id = `ajustes-salvar-${lang}`;
    const situacao = elemento('span', 'cfg-status');
    situacao.id = `ajustes-situacao-${lang}`;
    situacao.setAttribute('role', 'status');
    mostrarSituacao(lang, salvar, situacao);
    return elemento('div', 'ajustes-acoes', salvar, situacao);
  }

  /** Salvar em destaque só com o que salvar; ao lado, se o que está na tela já está gravado. */
  function mostrarSituacao(lang, salvar = porId(`ajustes-salvar-${lang}`), situacao = porId(`ajustes-situacao-${lang}`)) {
    if (!salvar || !situacao) return;
    const sujo = temRascunho(lang);
    salvar.classList.toggle('veio-botao--primario', sujo);
    salvar.classList.toggle('veio-botao--secundario', !sujo);
    const ponto = elemento('span', 'cfg-ponto');
    if (!sujo) ponto.dataset.estado = 'ok';
    ponto.setAttribute('aria-hidden', 'true');
    situacao.replaceChildren(ponto, textoDaVoz(sujo ? 'BRG-07.estadoNaoSalvo' : 'BRG-07.estadoSalvo'));
  }

  /** Mexeu no formulário: só a situação muda, o campo em uso não é redesenhado. */
  function aoEditar(lang) {
    mostrarSituacao(lang);
  }

  function opcao(valor, texto) {
    const no = elemento('option', '', texto);
    no.value = valor;
    return no;
  }

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
