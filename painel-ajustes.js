'use strict';

// A aba Ajustes de envio da Conexão com o Anki (docs/design/painel/anki/,
// variante C): os azulejos Inglês · Russo mostram o baralho e a fonte de imagem
// gravados; o formulário é do idioma escolhido (Baralho, em branco volta ao
// padrão; Imagens, com a nota de custo; o sotaque do áudio no Avançado) e só
// grava em Salvar ajustes.
//
// O rascunho de cada idioma sobrevive à troca de azulejo. O que outra aba salva
// chega por `AjustesDeEnvio.acompanhar`: um idioma sem rascunho passa a mostrar o
// novo; um com rascunho fica como está, e Salvar recusa (a versão lida ficou
// para trás) com o aviso de que os ajustes mudaram em outra aba — nada é
// sobrescrito sem a pessoa ver. Com a Conexão desligada, tudo continua editável
// (a nota BRG-33 é do painel-anki.js). Toda cópia vem do catálogo da Voz.

(function (raiz) {
  const { textoDaVoz, Veio, AjustesDeEnvio, IDIOMAS } = raiz;
  const { IMAGENS } = AjustesDeEnvio;
  const NOME_DO_IDIOMA = { en: IDIOMAS.INGLES, ru: IDIOMAS.RUSSO };
  const CODIGO_DO_IDIOMA = { en: 'BRG-28.codigoEn', ru: 'BRG-28.codigoRu' };
  const CAMPOS = ['deckName', 'imageSource', 'ttsWordTld', 'ttsPhraseTld'];
  const porId = id => document.getElementById(id);

  const estado = {
    idioma: 'en',
    gravados: null,                 // os ajustes gravados, como os azulejos mostram
    lidos: { en: null, ru: null },  // o gravado de onde cada rascunho partiu (com a versão)
    rascunhos: { en: null, ru: null },
    salvando: false,
  };

  function iniciar() {
    montarAzulejos();
    montarSotaque();
    const form = porId('ajustes-form');
    form.addEventListener('submit', salvar);
    form.addEventListener('input', lerFormulario);
    form.addEventListener('change', () => { lerFormulario(); desenharNotaDasImagens(); });
    AjustesDeEnvio.acompanhar(aoMudarOGravado);
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
  }

  function aoMudarOGravado(ajustes) {
    estado.gravados = ajustes;
    for (const lang of AjustesDeEnvio.IDIOMAS) {
      if (!temRascunho(lang)) adotarGravado(lang);
    }
    porId('ajustes-form').hidden = false;
    desenhar();
  }

  function lerFormulario() {
    const rascunho = estado.rascunhos[estado.idioma];
    if (!rascunho) return;
    rascunho.deckName = porId('ajustes-baralho').value;
    rascunho.imageSource = porId('ajustes-imagens').value;
    rascunho.ttsWordTld = porId('ajustes-sotaque-palavra').value;
    rascunho.ttsPhraseTld = porId('ajustes-sotaque-frase').value;
  }

  function escolherIdioma(lang) {
    if (lang === estado.idioma) return;
    lerFormulario();
    estado.idioma = lang;
    fecharAviso();
    desenhar();
  }

  // ─── Salvar ────────────────────────────────────────────────────────────────

  async function salvar(evento) {
    evento.preventDefault();
    if (estado.salvando || !estado.gravados) return;
    lerFormulario();
    const lang = estado.idioma;
    estado.salvando = true;
    let resultado;
    try {
      resultado = await AjustesDeEnvio.salvar(lang, estado.rascunhos[lang], estado.lidos[lang].versao);
    } catch (erro) {
      mostrarAviso({ texto: textoDaVoz('BRG-07.naoSalvou'), detalhes: String(erro?.message || erro) });
      return;
    } finally {
      estado.salvando = false;
    }
    estado.gravados = resultado.ajustes;
    if (!resultado.ok) {
      mostrarAviso({
        texto: textoDaVoz('BRG-07.desatualizada'),
        acao: { rotulo: textoDaVoz('BRG-07.mostrarNovos'), aoUsar: () => mostrarOsNovos(lang) },
      });
      desenharAzulejos();
      return;
    }
    adotarGravado(lang);
    fecharAviso();
    desenhar();
    Veio.mostrarToastDeSucesso(textoDaVoz('BRG-07.salvo'));
  }

  function mostrarOsNovos(lang) {
    adotarGravado(lang);
    fecharAviso();
    desenhar();
    porId('ajustes-baralho').focus();
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

  // ─── Desenho ───────────────────────────────────────────────────────────────

  function desenhar() {
    if (!estado.gravados) return;
    desenharAzulejos();
    desenharFormulario();
  }

  function montarAzulejos() {
    porId('ajustes-azulejos').replaceChildren(...AjustesDeEnvio.IDIOMAS.map(lang => {
      const azulejo = elemento('button', 'veio-azulejo anki-azulejo ajustes-azulejo');
      azulejo.type = 'button';
      azulejo.dataset.idioma = lang;
      azulejo.addEventListener('click', () => escolherIdioma(lang));
      azulejo.append(
        elemento('span', 'anki-azulejo__codigo', textoDaVoz(CODIGO_DO_IDIOMA[lang])),
        elemento('span', 'anki-azulejo__nome', NOME_DO_IDIOMA[lang]),
        elemento('span', 'anki-azulejo__valor ajustes-azulejo__baralho'),
        ' ',
        elemento('span', 'anki-azulejo__envios ajustes-azulejo__imagens'));
      return azulejo;
    }));
  }

  function desenharAzulejos() {
    for (const azulejo of porId('ajustes-azulejos').children) {
      const lang = azulejo.dataset.idioma;
      const gravado = estado.gravados[lang];
      const escolhido = lang === estado.idioma;
      azulejo.setAttribute('aria-pressed', String(escolhido));
      azulejo.classList.toggle('veio-azulejo--escolhido', escolhido);
      azulejo.querySelector('.ajustes-azulejo__baralho').textContent = AjustesDeEnvio.nomeDoBaralho(gravado.deckName);
      azulejo.querySelector('.ajustes-azulejo__imagens').textContent = textoDaVoz(
        gravado.imageSource === IMAGENS.GERADA_POR_IA ? 'BRG-07.azulejoGeradaPorIa' : 'BRG-07.azulejoFotoReal');
    }
  }

  function desenharFormulario() {
    const lang = estado.idioma;
    const nome = NOME_DO_IDIOMA[lang];
    const rascunho = estado.rascunhos[lang];
    porId('ajustes-form').setAttribute('aria-label', textoDaVoz('BRG-07.formulario', { idioma: nome }));
    porId('ajustes-titulo').textContent = nome;
    porId('ajustes-descricao').textContent = textoDaVoz('BRG-07.descricao', { idioma: nome.toLowerCase() });
    porId('ajustes-baralho').value = rascunho.deckName;
    porId('ajustes-baralho-ajuda').textContent = textoDaVoz('BRG-07.baralhoEmBranco', { baralho: AjustesDeEnvio.baralhoPadrao(lang) });
    porId('ajustes-imagens').value = rascunho.imageSource;
    porId('ajustes-sotaque-palavra').value = rascunho.ttsWordTld;
    porId('ajustes-sotaque-palavra').placeholder = AjustesDeEnvio.PADRAO[lang].ttsWordTld;
    porId('ajustes-sotaque-frase').value = rascunho.ttsPhraseTld;
    porId('ajustes-sotaque-frase').placeholder = AjustesDeEnvio.PADRAO[lang].ttsPhraseTld;
    desenharNotaDasImagens();
  }

  function desenharNotaDasImagens() {
    const gerada = porId('ajustes-imagens').value === IMAGENS.GERADA_POR_IA;
    porId('ajustes-imagens-ajuda').textContent = textoDaVoz(gerada ? 'BRG-07.notaGeradaPorIa' : 'BRG-07.notaFotoReal');
  }

  /** “Sotaque do áudio: … Exemplos: com (Estados Unidos), …”, com o domínio em mono. */
  function montarSotaque() {
    const exemplos = ['exemploEstadosUnidos', 'exemploReinoUnido', 'exemploAustralia'].map(parte => {
      const texto = textoDaVoz(`BRG-07.${parte}`);
      const espaco = texto.indexOf(' ');
      return [elemento('span', 'ajustes-dominio', texto.slice(0, espaco)), texto.slice(espaco)];
    });
    const partes = [textoDaVoz('BRG-07.sotaque'), ' '];
    exemplos.forEach((exemplo, i) => partes.push(...exemplo, i < exemplos.length - 1 ? ', ' : '.'));
    porId('ajustes-sotaque').replaceChildren(...partes);
  }

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
