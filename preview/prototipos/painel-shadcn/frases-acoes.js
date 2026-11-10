'use strict';

// Frases, as ações: filtrar, selecionar, paginar, escolher a Palavra, editar o texto e o contexto, copiar, apagar,
// exportar o .txt e a gaveta da frase (direção B).

(function (PS) {
  const { esc, ic, plural } = PS;
  const visao = PS.frases;
  const { fraseDe, quando, filtradas, daPagina, seloDaFonte, seloDoEstado, contexto, blocoDoTexto, redesenharMiolo } = PS.partesDasFrases;
  const A = PS.acoes;

  // ---------- Ações: filtros, seleção, paginação ----------
  A['frases.filtrar'] = () => {
    visao.fonte = document.getElementById('filtro-fonte').value;
    visao.idioma = document.getElementById('filtro-idioma').value;
    const ordem = document.getElementById('filtro-ordem').value;
    const soOrdem = ordem !== visao.ordem;
    visao.ordem = ordem;
    visao.ocultar = document.getElementById('filtro-ocultar').checked;
    visao.pagina = 1;
    if (!soOrdem) visao.selecao.clear();   // mudar o filtro limpa a seleção; reordenar não
    redesenharMiolo();
  };
  A['frases.buscar'] = campo => { visao.busca = campo.value; visao.pagina = 1; visao.selecao.clear(); redesenharMiolo(); };
  A['frases.limparBusca'] = () => { visao.busca = ''; const campo = document.getElementById('busca-frases'); campo.value = ''; redesenharMiolo(); campo.focus(); };
  A['frases.limparFiltros'] = () => { Object.assign(visao, { fonte: '', idioma: '', ocultar: false, busca: '', pagina: 1 }); PS.desenhar(); };
  A['frases.marcar'] = caixa => { const id = Number(caixa.dataset.id); if (caixa.checked) visao.selecao.add(id); else visao.selecao.delete(id); redesenharMiolo(); };
  A['frases.marcarPagina'] = caixa => { for (const frase of daPagina(filtradas()).itens) { if (caixa.checked) visao.selecao.add(frase.id); else visao.selecao.delete(frase.id); } redesenharMiolo(); document.getElementById('sel-pagina').focus(); };
  A['frases.marcarTodas'] = () => { for (const frase of filtradas()) visao.selecao.add(frase.id); redesenharMiolo(); document.getElementById('sel-pagina').focus(); };
  A['frases.desmarcar'] = () => { visao.selecao.clear(); redesenharMiolo(); document.getElementById('sel-pagina').focus(); };
  A['frases.pagina'] = botao => {
    const { paginas } = daPagina(filtradas());
    visao.pagina = { primeira: 1, anterior: visao.pagina - 1, proxima: visao.pagina + 1, ultima: paginas }[botao.dataset.valor];
    redesenharMiolo();
    scrollTo({ top: 0 });
  };
  A['frases.tentarSincronizar'] = () => { PS.mudar({ estado: 'normal' }); PS.avisar(`${PS.dados.frases.length} frases sincronizadas`); };   // CFG-09
  A['frases.ocultarLembrete'] = () => { visao.lembrete = null; PS.desenhar(); };
  A['frases.continuarConfiguracao'] = () => PS.ir(`boas-vindas/${visao.lembrete.passo}`);

  // ---------- Ações: a Palavra ----------
  A['frases.palavra'] = botao => {
    const frase = fraseDe(botao.dataset.id);
    const i = Number(botao.dataset.i);
    const dono = frase.grupos.find(grupo => grupo.includes(i));
    if (dono) {
      dono.splice(dono.indexOf(i), 1);
      frase.grupos = frase.grupos.filter(grupo => grupo.length);
    } else if (visao.grupoNovo.has(frase.id) || !frase.grupos.length) {
      frase.grupos.push([i]);
    } else {
      const ultimo = frase.grupos[frase.grupos.length - 1];
      ultimo.push(i);
      ultimo.sort((a, b) => a - b);
    }
    visao.grupoNovo.delete(frase.id);
    frase.auto = false;
    if (PS.camadaAberta()) redesenharGaveta(frase); else redesenharMiolo();
  };
  A['frases.limparPalavra'] = botao => {
    const frase = fraseDe(botao.dataset.id);
    frase.grupos = [];
    frase.auto = false;
    visao.grupoNovo.delete(frase.id);
    if (PS.camadaAberta()) redesenharGaveta(frase); else { redesenharMiolo(); const primeira = document.querySelector(`[data-foco="p-${frase.id}-0"]`); if (primeira) primeira.focus(); }
  };
  A['frases.outroGrupo'] = botao => {
    const id = Number(botao.dataset.id);
    if (visao.grupoNovo.has(id)) visao.grupoNovo.delete(id); else visao.grupoNovo.add(id);
    if (PS.camadaAberta()) redesenharGaveta(fraseDe(id)); else redesenharMiolo();
    if (visao.grupoNovo.has(id)) PS.avisar('Clique na palavra que começa o outro grupo');
  };

  // ---------- Ações: cada frase ----------
  A['frases.editarTexto'] = botao => {
    visao.editando = Number(botao.dataset.id);
    if (PS.camadaAberta()) redesenharGaveta(fraseDe(visao.editando)); else redesenharMiolo();
    const campo = document.getElementById(`edicao-${visao.editando}`);
    campo.focus();
    campo.select();
    campo.addEventListener('keydown', evento => { if (evento.key === 'Escape') { evento.stopPropagation(); A['frases.cancelarTexto'](); } });
  };
  A['frases.cancelarTexto'] = () => {
    const id = visao.editando;
    visao.editando = null;
    if (PS.camadaAberta()) redesenharGaveta(fraseDe(id)); else redesenharMiolo();
    const volta = document.querySelector(`[data-foco="editarTexto-${id}"]`);
    if (volta) volta.focus();
  };
  A['frases.salvarTexto'] = formulario => {
    const frase = fraseDe(formulario.dataset.id);
    const novo = formulario.querySelector('input').value.trim();
    if (novo && novo !== frase.texto) { frase.texto = novo; frase.grupos = []; }   // PAI-16: sem toast, a mudança está na tela
    A['frases.cancelarTexto']();
  };
  A['frases.copiar'] = async botao => {   // PAI-17
    const frase = fraseDe(botao.dataset.id);
    try { await navigator.clipboard.writeText(frase.texto); PS.avisar('Frase copiada'); } catch { PS.avisar('Não deu para copiar', { erro: true }); }
  };
  A['frases.editarContexto'] = botao => abrirContexto([fraseDe(botao.dataset.id)]);
  A['frases.editarContextoDasMarcadas'] = () => abrirContexto(PS.dados.frases.filter(frase => visao.selecao.has(frase.id)));
  A['frases.apagarUma'] = botao => abrirApagar([fraseDe(botao.dataset.id)]);
  A['frases.apagarMarcadas'] = () => abrirApagar(PS.dados.frases.filter(frase => visao.selecao.has(frase.id)));
  A['frases.menuDaLinha'] = botao => {
    const frase = fraseDe(botao.dataset.id);
    PS.abrirMenu(botao, [
      { rotulo: 'Abrir a frase', icone: 'olho', acao: () => abrirGaveta(frase) },
      { rotulo: 'Editar contexto', icone: 'etiqueta', acao: () => abrirContexto([frase]) },
      { rotulo: 'Copiar frase', icone: 'copiar', acao: () => A['frases.copiar'](botao) },
      { separador: true },
      { rotulo: 'Apagar frase', icone: 'lixeira', perigo: true, acao: () => abrirApagar([frase]) },
    ], { rotulo: 'Ações da frase' });
  };

  // ---------- Editar contexto (PAI-20, PAI-21, PAI-22) ----------
  function abrirContexto(frases) {
    const uma = frases.length === 1 ? frases[0] : null;
    PS.abrirCamada({
      rotulo: uma ? 'Editar contexto' : `Editar contexto de ${frases.length} frases`,
      conteudo: `<form data-ao-enviar="frases.salvarContexto" class="dialogo__corpo">${PS.dialogo({
        titulo: uma ? 'Editar contexto' : `Editar contexto de ${frases.length} frases`,
        descricao: uma ? esc(uma.texto) : 'Campos em branco ficam como estão',
        corpo: `<div class="campo-grupo"><label class="rotulo" for="ctx-fonte">Fonte</label><input class="campo" id="ctx-fonte" autocomplete="off" value="${uma ? esc(uma.fonte) : ''}" data-foco-inicial><span class="campo-ajuda">de onde a frase veio (netflix, youtube, livro…)</span></div>`
          + `<div class="campo-grupo"><label class="rotulo" for="ctx-titulo">Título</label><input class="campo" id="ctx-titulo" autocomplete="off" value="${uma ? esc(uma.titulo) : ''}"></div>`
          + `<div class="campo-grupo"><label class="rotulo" for="ctx-detalhe">Detalhe</label><input class="campo" id="ctx-detalhe" autocomplete="off" value="${uma ? esc(uma.detalhe) : ''}"><span class="campo-ajuda">episódio, capítulo ou canal</span></div>`,
        pe: '<button type="button" class="botao botao--contorno" data-acao="camada.fechar">Cancelar</button><button type="submit" class="botao">Salvar contexto</button>',
      })}</form>`,
    });
    abrirContexto.frases = frases;
  }
  A['frases.salvarContexto'] = () => {
    const frases = abrirContexto.frases;
    const valores = { fonte: document.getElementById('ctx-fonte').value.trim().toLowerCase(), titulo: document.getElementById('ctx-titulo').value.trim(), detalhe: document.getElementById('ctx-detalhe').value.trim() };
    for (const frase of frases) {
      for (const [campo, valor] of Object.entries(valores)) {
        if (frases.length === 1 ? campo !== 'fonte' || valor : valor) frase[campo] = valor;
      }
    }
    PS.fecharCamada();
    PS.desenhar();
    if (frases.length > 1) PS.avisar(`Contexto de ${frases.length} frases atualizado`);
  };

  // ---------- Apagar (PAI-12, PAI-13, PAI-14) ----------
  function abrirApagar(frases) {
    const n = frases.length;
    const comConta = PS.dados.conta.entrou;
    PS.abrirCamada({
      tipo: 'alerta', rotulo: n === 1 ? 'Apagar esta frase?' : `Apagar ${n} frases?`,
      conteudo: PS.dialogo({
        semFechar: true,
        titulo: n === 1 ? 'Apagar esta frase?' : `Apagar ${n} frases?`,
        descricao: comConta ? `${n === 1 ? 'Ela some' : 'Elas somem'} também dos outros computadores conectados à sua conta. Não dá para desfazer.` : 'Não dá para desfazer.',
        pe: `<button type="button" class="botao botao--contorno" data-acao="camada.fechar" data-foco-inicial>Cancelar</button><button type="button" class="botao botao--perigo-cheio" data-acao="frases.confirmarApagar">${n === 1 ? 'Apagar frase' : `Apagar ${n} frases`}</button>`,
      }),
    });
    abrirApagar.frases = frases;
  }
  function tirarDoHistorico(frases) {
    const ids = new Set(frases.map(frase => frase.id));
    PS.dados.frases = PS.dados.frases.filter(frase => !ids.has(frase.id));
    for (const id of ids) visao.selecao.delete(id);
  }
  A['frases.confirmarApagar'] = () => {
    const n = abrirApagar.frases.length;
    tirarDoHistorico(abrirApagar.frases);
    PS.fecharCamada();
    PS.desenhar();
    PS.avisar(`${n} ${plural(n, 'frase apagada', 'frases apagadas')}`);
  };

  // ---------- Exportar .txt (PAI-19): baixa o arquivo de verdade ----------
  A['frases.exportar'] = () => {
    const frases = PS.dados.frases.filter(frase => visao.selecao.has(frase.id));
    const texto = frases.map(frase => frase.texto).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`${texto}\n`], { type: 'text/plain;charset=utf-8' }));
    link.download = 'frases-perpetualminer.txt';
    link.click();
    URL.revokeObjectURL(link.href);
    for (const frase of frases) if (!frase.estado) frase.estado = 'exportada';
    redesenharMiolo();
    PS.avisar(`${frases.length} ${plural(frases.length, 'frase exportada', 'frases exportadas')} para .txt`);
  };

  // ---------- A gaveta da frase (direção B) ----------
  function corpoDaGaveta(frase) {
    const editando = visao.editando === frase.id;
    return `<div class="campo-grupo"><div class="linha-ajuste"><span class="rotulo">Frase</span>${editando ? '' : `<button type="button" class="botao botao--fantasma botao--p" data-acao="frases.editarTexto" data-id="${frase.id}" data-foco="editarTexto-${frase.id}">${ic('lapis')}Editar texto</button>`}</div>`
      + `<div class="gaveta-frase">${blocoDoTexto(frase)}${editando || frase.grupos.length ? '' : '<p class="campo-ajuda">Clique numa palavra para escolher a Palavra do cartão.</p>'}</div></div>`
      + `<dl class="pares"><div><dt>Fonte</dt><dd>${seloDaFonte(frase)}</dd></div><div><dt>Título · Detalhe</dt><dd>${contexto(frase) || '—'}</dd></div><div><dt>Idioma</dt><dd>${PS.dados.IDIOMAS[frase.idioma]}</dd></div><div><dt>Minerada</dt><dd>${quando(frase.dias)}</dd></div><div><dt>Estado</dt><dd>${seloDoEstado(frase) || 'No histórico'}</dd></div></dl>`;
  }
  function abrirGaveta(frase) {
    PS.abrirCamada({
      tipo: 'gaveta', rotulo: 'Frase',
      conteudo: PS.gaveta({
        titulo: 'Frase', descricao: 'A Palavra, o contexto e o estado desta frase.',
        corpo: `<div id="gaveta-da-frase" class="gaveta__bloco">${corpoDaGaveta(frase)}</div>`,
        pe: `<button type="button" class="botao botao--contorno" data-acao="frases.editarContexto" data-id="${frase.id}">${ic('etiqueta')}Editar contexto</button><button type="button" class="botao botao--contorno" data-acao="frases.copiar" data-id="${frase.id}">${ic('copiar')}Copiar frase</button><button type="button" class="botao botao--perigo" data-acao="frases.apagarUma" data-id="${frase.id}">${ic('lixeira')}Apagar frase</button>`,
      }),
      aoFechar: () => { visao.editando = null; PS.desenhar(); },
    });
  }
  function redesenharGaveta(frase) {
    const el = document.getElementById('gaveta-da-frase');
    if (!el) { redesenharMiolo(); return; }
    const chave = document.activeElement && document.activeElement.dataset.foco;
    el.innerHTML = corpoDaGaveta(frase);
    const novo = chave && el.querySelector(`[data-foco="${CSS.escape(chave)}"]`);
    const alvo = novo || el.querySelector('.palavra');
    if (alvo) alvo.focus();
  }
  A['frases.abrirGaveta'] = botao => abrirGaveta(fraseDe(botao.dataset.id));

  PS.partesDasFrases.tirarDoHistorico = tirarDoHistorico;
})(window.PS);
