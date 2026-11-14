'use strict';

// Frases, a base: o que a tela guarda (filtros, página, seleção), a frase em pedaços e o desenho de uma frase, em
// cartão (direção A) ou em linha de tabela (direção B). O texto é o do catálogo da Voz do painel
// (lib/voz/catalogo.js); os IDs nos comentários dizem de onde veio cada um. A lista está em frases-lista.js e as
// ações em frases-acoes.js, frases-minerar.js e frases-envio.js.

(function (PS) {
  const { esc, ic } = PS;
  const POR_PAGINA = 10;
  const PALAVRA = /[\p{L}\p{M}\p{N}]+(?:[’'-][\p{L}\p{M}]+)*/gu;

  const visao = { fonte: '', idioma: '', ordem: 'novas', busca: '', ocultar: false, pagina: 1, selecao: new Set(), editando: null, grupoNovo: new Set(), lembrete: null };

  /** A frase em pedaços: as palavras (com o índice entre as palavras) e o que fica entre elas. */
  function pedacos(texto) {
    const lista = [];
    let fim = 0;
    let n = 0;
    for (const achado of texto.matchAll(PALAVRA)) {
      if (achado.index > fim) lista.push({ texto: texto.slice(fim, achado.index) });
      lista.push({ texto: achado[0], palavra: n++ });
      fim = achado.index + achado[0].length;
    }
    if (fim < texto.length) lista.push({ texto: texto.slice(fim) });
    return lista;
  }

  // Os dados trazem a Palavra escrita; a tela trabalha com o índice de cada palavra na frase.
  for (const frase of PS.dados.frases) {
    const palavras = pedacos(frase.texto).filter(p => p.palavra != null);
    frase.grupos = frase.palavras.map(grupo => grupo.map(escrita => palavras.find(p => p.texto === escrita).palavra));
    delete frase.palavras;
  }

  const todas = () => (PS.estado.estado === 'vazio' ? [] : PS.dados.frases);
  const fraseDe = id => PS.dados.frases.find(frase => frase.id === Number(id));
  const semConexao = () => ['desligada', 'primeira'].includes(PS.estado.estado);
  const quando = dias => (dias === 0 ? 'Hoje' : dias === 1 ? 'Ontem' : `Há ${dias} dias`);   // PAI-11
  const ESTADOS = { enviada: ['Enviada ao Anki', 'sucesso'], exportada: ['Exportada', 'secundario'] };   // PAI-08

  function filtradas() {
    const termo = visao.busca.trim().toLowerCase();
    const lista = todas().filter(frase =>
      (!visao.fonte || frase.fonte === visao.fonte)
      && (!visao.idioma || frase.idioma === visao.idioma)
      && (!visao.ocultar || !frase.estado)
      && (!termo || frase.texto.toLowerCase().includes(termo) || frase.titulo.toLowerCase().includes(termo)));
    return visao.ordem === 'novas' ? lista : [...lista].reverse();
  }

  function daPagina(lista) {
    const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
    visao.pagina = Math.min(visao.pagina, paginas);
    const inicio = (visao.pagina - 1) * POR_PAGINA;
    return { paginas, inicio, itens: lista.slice(inicio, inicio + POR_PAGINA) };
  }

  function textoDaPalavra(frase) {
    const palavras = pedacos(frase.texto).filter(p => p.palavra != null);
    return frase.grupos.map(grupo => grupo.map(i => palavras[i].texto).join(' ')).join(' | ');
  }

  // ---------- A frase ----------
  /** O texto com cada palavra num botão: clicar escolhe a Palavra. Uma parada de Tab; as setas andam entre as palavras. */
  function textoClicavel(frase) {
    const marcadas = new Set(frase.grupos.flat());
    let primeira = true;
    return `<p class="frase__texto" lang="${frase.idioma}" data-setas="foco">${pedacos(frase.texto).map(pedaco => {
      if (pedaco.palavra == null) return esc(pedaco.texto);
      const tab = primeira ? 0 : -1;
      primeira = false;
      return `<button type="button" class="palavra" aria-pressed="${marcadas.has(pedaco.palavra)}" tabindex="${tab}" data-seta data-foco="p-${frase.id}-${pedaco.palavra}" data-acao="frases.palavra" data-id="${frase.id}" data-i="${pedaco.palavra}">${esc(pedaco.texto)}</button>`;
    }).join('')}</p>`;
  }

  function textoRealcado(frase) {
    const marcadas = new Set(frase.grupos.flat());
    return pedacos(frase.texto).map(pedaco => (pedaco.palavra != null && marcadas.has(pedaco.palavra) ? `<mark>${esc(pedaco.texto)}</mark>` : esc(pedaco.texto))).join('');
  }

  function chipDaPalavra(frase) {
    if (!frase.grupos.length) return '';
    return `<div class="frase__palavra"><span class="selo selo--contorno palavra-chip"><span class="mono">${frase.auto ? 'auto:' : 'palavra:'}</span> <b>${esc(textoDaPalavra(frase))}</b>`
      + `<button type="button" class="palavra-chip__x" data-acao="frases.limparPalavra" data-id="${frase.id}" data-foco="x-${frase.id}" aria-label="Remover a palavra" data-dica="Remover a palavra">${ic('fechar')}</button></span>`
      + `<button type="button" class="botao botao--contorno botao--icone botao--pp" data-acao="frases.outroGrupo" data-id="${frase.id}" data-foco="g-${frase.id}" aria-pressed="${visao.grupoNovo.has(frase.id)}" aria-label="Adicionar outro grupo" data-dica="Adicionar outro grupo">${ic('mais')}</button></div>`;
  }

  function seloDaFonte(frase) {
    const fonte = PS.dados.FONTES[frase.fonte] || { nome: frase.fonte, icone: 'globo' };
    return `<span class="selo selo--secundario">${ic(fonte.icone)}${esc(fonte.nome)}</span>`;
  }

  function seloDoEstado(frase) {
    if (!frase.estado) return '';
    const [rotulo, tipo] = ESTADOS[frase.estado];
    return `<span class="selo selo--${tipo}">${rotulo}</span>`;
  }

  const contexto = frase => [frase.titulo, frase.detalhe].filter(Boolean).map(esc).join(' · ');

  function acoesDaFrase(frase) {   // PAI-30
    const botao = (acao, icone, rotulo, classe = '') => `<button type="button" class="botao botao--fantasma botao--icone botao--p ${classe}" data-acao="frases.${acao}" data-id="${frase.id}" data-foco="${acao}-${frase.id}" aria-label="${rotulo}" data-dica="${rotulo}">${ic(icone)}</button>`;
    return `<div class="frase__acoes">${botao('editarTexto', 'lapis', 'Editar texto')}${botao('editarContexto', 'etiqueta', 'Editar contexto')}${botao('copiar', 'copiar', 'Copiar frase')}${botao('apagarUma', 'lixeira', 'Apagar frase', 'frase__apagar')}</div>`;
  }

  /** O texto da frase com a Palavra, ou o campo de Editar texto no lugar dele (PAI-33). */
  function blocoDoTexto(frase) {
    if (visao.editando !== frase.id) return `${textoClicavel(frase)}${chipDaPalavra(frase)}`;
    return `<form class="frase__edicao" data-ao-enviar="frases.salvarTexto" data-id="${frase.id}"><input class="campo" id="edicao-${frase.id}" aria-label="Texto da frase" value="${esc(frase.texto)}" lang="${frase.idioma}" autocomplete="off">`
      + `<div class="frase__edicao-pe"><span class="campo-ajuda">Enter salva · Esc cancela</span><button type="button" class="botao botao--fantasma botao--p" data-acao="frases.cancelarTexto">Cancelar</button><button type="submit" class="botao botao--p">Salvar texto</button></div></form>`;
  }

  function cartaoDaFrase(frase) {
    const marcada = visao.selecao.has(frase.id);
    const corpo = blocoDoTexto(frase);
    return `<article class="frase" data-marcada="${marcada}" data-id="${frase.id}">`
      + `<input type="checkbox" class="caixa" ${marcada ? 'checked' : ''} aria-label="Selecionar frase: ${esc(frase.texto)}" data-ao-mudar="frases.marcar" data-id="${frase.id}" data-foco="c-${frase.id}">`
      + `<div class="frase__corpo">${corpo}<div class="frase__contexto">${seloDaFonte(frase)}<span>${contexto(frase)}</span>${seloDoEstado(frase)}</div></div>`
      + `${visao.editando === frase.id ? '' : acoesDaFrase(frase)}</article>`;
  }

  function listaEmCartoes(itens) {
    let dia = null;
    return itens.map(frase => {
      const cabeca = frase.dias !== dia ? `<h2 class="frases__dia">${quando(frase.dias)}</h2>` : '';
      dia = frase.dias;
      return cabeca + cartaoDaFrase(frase);
    }).join('');
  }

  function listaEmTabela(itens) {
    const linhas = itens.map(frase => {
      const marcada = visao.selecao.has(frase.id);
      return `<tr aria-selected="${marcada}"><td><input type="checkbox" class="caixa" ${marcada ? 'checked' : ''} aria-label="Selecionar frase: ${esc(frase.texto)}" data-ao-mudar="frases.marcar" data-id="${frase.id}" data-foco="c-${frase.id}"></td>`
        + `<td class="tabela__frase"><button type="button" class="frase-link" lang="${frase.idioma}" data-acao="frases.abrirGaveta" data-id="${frase.id}" data-foco="abrir-${frase.id}">${textoRealcado(frase)}</button></td>`
        + `<td>${frase.grupos.length ? `<span class="mono palavra-celula">${frase.auto ? '<span class="campo-ajuda">auto</span> ' : ''}${esc(textoDaPalavra(frase))}</span>` : '<span class="campo-ajuda">—</span>'}</td>`
        + `<td>${seloDaFonte(frase)}</td><td class="tabela__contexto">${contexto(frase) || '<span class="campo-ajuda">—</span>'}</td>`
        + `<td>${seloDoEstado(frase)}</td><td class="tabela__quando">${quando(frase.dias)}</td>`
        + `<td><button type="button" class="botao botao--fantasma botao--icone botao--p" data-acao="frases.menuDaLinha" data-id="${frase.id}" data-foco="menu-${frase.id}" aria-haspopup="menu" aria-expanded="false" aria-label="Ações da frase">${ic('pontos')}</button></td></tr>`;
    }).join('');
    return `<div class="tabela-moldura"><table class="tabela tabela--densa"><thead><tr><th class="tabela__caixa"><span class="so-leitor">Selecionar</span></th><th>Frase</th><th>Palavra</th><th>Fonte</th><th class="tabela__contexto">Título · Detalhe</th><th>Estado</th><th>Quando</th><th><span class="so-leitor">Ações</span></th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  }

  PS.frases = visao;
  PS.partesDasFrases = { POR_PAGINA, todas, fraseDe, semConexao, quando, filtradas, daPagina, textoDaPalavra, seloDaFonte, seloDoEstado, contexto, blocoDoTexto, listaEmCartoes, listaEmTabela };
})(window.PS);
