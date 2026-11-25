'use strict';

(function (raiz) {
  const { ehRussa, detectarIdioma, textoDaVoz, Mineracao } = raiz;
  const { fonteDaFrase, nomeDaFonte } = raiz.Contexto;
  const { iconeVeio, montarChipDaPalavra, escreverFraseClicavel, andarEntrePalavras, focarPalavra, criar } = raiz.Veio;
  const { foiEnviadaAoAnki } = raiz.FiltroDasFrases;

  const ICONE_DE_VIDEO = 'netflix';

  const ICONES_DE_FONTE = {
    netflix: ICONE_DE_VIDEO, primevideo: ICONE_DE_VIDEO, max: ICONE_DE_VIDEO, disneyplus: ICONE_DE_VIDEO,
    starplus: ICONE_DE_VIDEO, kinopoisk: ICONE_DE_VIDEO, youtube: 'youtube',
    web: 'web', selecao: 'web', pdf: 'pdf', livro: 'livro', manual: 'manual', importado: 'manual',
  };

  let painel = null;
  let keywords = null;
  let selecionadas = null;
  let edicaoDeTexto = null;

  function iniciar(ligacao) {
    painel = ligacao;
    keywords = ligacao.keywords;
    selecionadas = ligacao.selecionadas;
  }

  function aoDigitarNaEdicao(e) {
    if (edicaoDeTexto && e.target.matches('textarea[data-edicao]')) edicaoDeTexto.rascunho = e.target.value;
  }

  function esquecerEdicaoDe(ids) {
    if (edicaoDeTexto && ids.has(edicaoDeTexto.id)) edicaoDeTexto = null;
  }

  function montarCartao(f) {
    const cartao = criar('article', 'veio-frase veio-frase--na-ilha');
    cartao.dataset.id = f.id;
    cartao.classList.toggle('veio-frase--selecionada', selecionadas.has(f.id));

    const marcar = criar('input', 'veio-checkbox frase-check');
    marcar.type = 'checkbox';
    marcar.dataset.id = f.id;
    marcar.checked = selecionadas.has(f.id);
    marcar.setAttribute('aria-label', textoDaVoz('PAI-28'));

    const texto = criar('div', 'veio-frase__texto');
    texto.lang = ehRussa(f) ? 'ru' : 'en';
    const editando = edicaoDeTexto?.id === f.id;
    if (editando) texto.append(montarEdicaoDeTexto(f));
    else          escreverPalavras(texto, f);

    const corpo = criar('div', 'frase-corpo');
    corpo.append(texto);
    const chip = editando ? null : montarLinhaDoChip(f);
    if (chip) corpo.append(chip);
    corpo.append(montarContexto(f));

    cartao.append(marcar, corpo, montarAcoesDoCartao(f));
    return cartao;
  }

  function escreverPalavras(no, f) {
    const ativas = new Set((keywords[f.id] || []).filter(w => w !== '|'));
    escreverFraseClicavel(no, Mineracao.tokenizar(f.texto || '').map((tok, idx) => tok.isWord
      ? {
        texto: tok.text,
        palavra: true,
        grifada: ativas.has(`${tok.clean}@${idx}`) || ativas.has(tok.clean),
        dados: { id: f.id, idx, word: tok.clean },
      }
      : { texto: tok.text }));
  }

  function montarLinhaDoChip(f) {
    const kws = keywords[f.id] || [];
    if (!kws.length) return null;

    const texto = kws.map(w => w === '|' ? '|' : w.replace(/@\d+$/, '')).join(' ');
    const chip = montarChipDaPalavra(texto, { detectada: Boolean(f.autoKeyword) });
    chip.append(botaoIcone('fechar', textoDaVoz('PAI-27.remover'), 'clear-kw', f.id));

    const outroGrupo = criar('button', 'veio-chip-palavra__outro', '+');
    outroGrupo.type = 'button';
    outroGrupo.dataset.action = 'add-sep';
    outroGrupo.dataset.id = f.id;
    outroGrupo.setAttribute('aria-label', textoDaVoz('PAI-27.outroGrupo'));
    outroGrupo.title = textoDaVoz('PAI-27.outroGrupo');

    const linha = criar('div', 'frase-chip');
    linha.append(chip, outroGrupo);
    return linha;
  }

  function montarContexto(f) {
    const linha = criar('div', 'veio-frase__contexto');
    const fonte = fonteDaFrase(f);
    if (fonte) {
      const selo = criar('span', 'veio-selo');
      selo.append(iconeVeio(ICONES_DE_FONTE[fonte] || 'web'), nomeDaFonte(fonte));
      linha.append(selo);
    }
    const origem = [f.contexto?.titulo, f.contexto?.detalhe].filter(Boolean).join(' · ');
    if (origem) linha.append(criar('span', 'frase-origem', origem));
    if (foiEnviadaAoAnki(f))  linha.append(criar('span', 'veio-selo veio-selo--ok', textoDaVoz('PAI-08.enviada')));
    else if (f.exportadaTxt)  linha.append(criar('span', 'veio-selo veio-selo--info', textoDaVoz('PAI-08.exportada')));
    return linha;
  }

  function montarAcoesDoCartao(f) {
    const acoes = criar('div', 'veio-frase__acoes');
    acoes.append(
      botaoIcone('texto', textoDaVoz('PAI-30.editarTexto'), 'edit-text', f.id),
      botaoIcone('contexto', textoDaVoz('PAI-30.editarContexto'), 'edit', f.id),
      botaoIcone('copiar', textoDaVoz('PAI-30.copiar'), 'copy', f.id),
      comoPerigo(botaoIcone('apagar', textoDaVoz('PAI-30.apagar'), 'delete', f.id)));
    return acoes;
  }

  function comoPerigo(botao) {
    botao.classList.add('veio-botao-icone--perigo');
    return botao;
  }

  function botaoIcone(icone, rotulo, acao, id) {
    const botao = criar('button', 'veio-botao-icone');
    botao.type = 'button';
    botao.dataset.action = acao;
    botao.dataset.id = id;
    botao.setAttribute('aria-label', rotulo);
    botao.title = rotulo;
    botao.append(iconeVeio(icone));
    return botao;
  }

  function cartaoNaLista(id) {
    return document.querySelector(`#frases-lista .veio-frase[data-id="${id}"]`);
  }

  function refletirSelecao(id) {
    const cartao = cartaoNaLista(id);
    if (!cartao) return;
    cartao.classList.toggle('veio-frase--selecionada', selecionadas.has(id));
    cartao.querySelector('.frase-check').checked = selecionadas.has(id);
  }

  function atualizarCartao(id) {
    const antigo = cartaoNaLista(id);
    const frase = painel.frases().find(f => f.id === id);
    if (!antigo || !frase) return;
    const foco = chaveDoFoco(document.activeElement);
    antigo.replaceWith(montarCartao(frase));
    restaurarFoco(foco);
  }

  function chaveDoFoco(no) {
    if (!no?.closest?.('#frases-lista')) return null;
    if (no.classList.contains('veio-palavra-clicavel')) return `.veio-palavra-clicavel[data-id="${no.dataset.id}"][data-idx="${no.dataset.idx}"]`;
    if (no.dataset.action) return `[data-action="${no.dataset.action}"][data-id="${no.dataset.id}"]`;
    if (no.classList.contains('frase-check')) return `.frase-check[data-id="${no.dataset.id}"]`;
    if (no.dataset.edicao) return `textarea[data-edicao="${no.dataset.edicao}"]`;
    return null;
  }

  function restaurarFoco(seletor) {
    if (!seletor) return;
    const no = document.querySelector(`#frases-lista ${seletor}`);
    if (!no) return;
    if (no.classList.contains('veio-palavra-clicavel')) focarPalavra(no);
    else no.focus();
  }

  function escolherPalavra(palavra) {
    marcarPalavra(Number(palavra.dataset.id), Number(palavra.dataset.idx), palavra.dataset.word);
  }

  function aoTeclarNaFrase(e) {
    const palavra = e.target.closest('.veio-palavra-clicavel');
    if (!palavra || andarEntrePalavras(e)) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      escolherPalavra(palavra);
    }
  }

  function gravarPalavras(id) {
    const idxFrase = painel.frases().findIndex(f => f.id === id);
    if (idxFrase < 0) return;
    painel.editarFrase(idxFrase, { keywords: keywords[id] || [], autoKeyword: false });
    painel.salvarNaNuvem(painel.frases()[idxFrase], ['keywords', 'autoKeyword']);
    atualizarCartao(id);
  }

  function marcarPalavra(id, indice, palavra) {
    if (palavra == null) return;
    const frase = painel.frases().find(f => f.id === id);
    if (!frase) return;
    guardarPalavras(id, Mineracao.palavrasAposMarcar(keywords[id] || [], `${palavra}@${indice}`, frase.texto));
  }

  function guardarPalavras(id, palavras) {
    if (palavras.length === 0) delete keywords[id];
    else                       keywords[id] = palavras;
    gravarPalavras(id);
  }

  function clearKeywords(id) {
    delete keywords[id];
    gravarPalavras(id);
  }

  const podeAbrirOutroGrupo = palavras => Boolean(palavras?.length) && palavras.at(-1) !== '|';

  function addSeparator(id) {
    const all = keywords[id];
    if (!podeAbrirOutroGrupo(all)) return;
    keywords[id] = [...all, '|'];
    gravarPalavras(id);
  }

  function editarTextoFrase(id) {
    const frase = painel.frases().find(f => f.id === id);
    if (!frase) return;
    edicaoDeTexto = { id, rascunho: frase.texto };
    atualizarCartao(id);
    const campo = cartaoNaLista(id)?.querySelector('textarea[data-edicao]');
    if (!campo) return;
    campo.focus();
    campo.setSelectionRange(campo.value.length, campo.value.length);
  }

  function montarEdicaoDeTexto(f) {
    const edicao = criar('div', 'frase-edicao');
    const campo = criar('textarea', 'veio-campo frase-edicao__campo');
    campo.dataset.edicao = f.id;
    campo.value = edicaoDeTexto.rascunho;
    campo.rows = Math.max(2, Math.ceil(campo.value.length / 55));
    campo.setAttribute('aria-label', textoDaVoz('PAI-33.campo'));

    const dica = criar('span', 'frase-edicao__dica', textoDaVoz('PAI-33.dica'));
    dica.id = `dica-edicao-${f.id}`;
    campo.setAttribute('aria-describedby', dica.id);

    const cancelar = criar('button', 'veio-botao veio-botao--fantasma', textoDaVoz('PAI-33.cancelar'));
    cancelar.type = 'button';
    cancelar.dataset.action = 'cancelar-texto';
    cancelar.dataset.id = f.id;
    const salvar = criar('button', 'veio-botao veio-botao--primario', textoDaVoz('PAI-33.salvar'));
    salvar.type = 'button';
    salvar.dataset.action = 'salvar-texto';
    salvar.dataset.id = f.id;

    const acoes = criar('div', 'frase-edicao__acoes');
    acoes.append(dica, cancelar, salvar);
    edicao.append(campo, acoes);
    return edicao;
  }

  function aoTeclarNaEdicaoDeTexto(e) {
    if (!edicaoDeTexto || !e.target.matches('textarea[data-edicao]')) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      terminarEdicaoDeTexto(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      terminarEdicaoDeTexto(false);
    }
  }

  function textoParaSalvar(frase, rascunho) {
    if (!frase) return null;
    const novoTexto = rascunho.trim();
    return novoTexto && novoTexto !== frase.texto ? novoTexto : null;
  }

  function terminarEdicaoDeTexto(salvar) {
    if (!edicaoDeTexto) return;
    const { id, rascunho } = edicaoDeTexto;
    edicaoDeTexto = null;
    const frase = painel.frases().find(f => f.id === id);
    const novoTexto = salvar ? textoParaSalvar(frase, rascunho) : null;
    if (novoTexto) salvarTextoFrase(id, novoTexto);
    else atualizarCartao(id);
    cartaoNaLista(id)?.querySelector('[data-action="edit-text"]')?.focus();
  }

  function salvarTextoFrase(id, novoTexto) {
    const idx = painel.frases().findIndex(f => f.id === id);
    if (idx < 0) return;
    const palavras = Mineracao.palavrasQueFicam(keywords[id], novoTexto);
    if (palavras.length) keywords[id] = palavras;
    else delete keywords[id];
    painel.editarFrase(idx, { texto: novoTexto, idioma: detectarIdioma(novoTexto), keywords: palavras });
    painel.salvarNaNuvem(painel.frases()[idx]);
    painel.aplicarFiltro();
  }

  raiz.FrasesCartao = {
    iniciar, montarCartao, refletirSelecao, chaveDoFoco, restaurarFoco, escolherPalavra, aoTeclarNaFrase,
    clearKeywords, addSeparator, editarTextoFrase, terminarEdicaoDeTexto, aoTeclarNaEdicaoDeTexto, aoDigitarNaEdicao, esquecerEdicaoDe,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
