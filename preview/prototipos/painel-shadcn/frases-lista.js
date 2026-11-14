'use strict';

// Frases, a tela: os filtros, a linha de seleção com a barra de ações, a lista, a paginação e os estados dela
// (carregando, vazia, busca sem resultado, sem sincronizar).

(function (PS) {
  const { esc, ic, pecas, plural } = PS;
  const visao = PS.frases;
  const { POR_PAGINA, todas, semConexao, filtradas, daPagina, listaEmCartoes, listaEmTabela } = PS.partesDasFrases;

  // ---------- Os estados da lista ----------
  function carregando() {
    if (PS.estado.d === 'b') {
      return `<div class="tabela-moldura" aria-hidden="true"><table class="tabela tabela--densa"><tbody>${Array.from({ length: 8 }, (_, i) => `<tr><td style="width:2rem">${pecas.esqueleto('1rem', '1rem')}</td><td>${pecas.esqueleto(`${55 - i * 4}%`, '0.875rem')}</td><td style="width:8rem">${pecas.esqueleto('5rem', '0.875rem')}</td><td style="width:6rem">${pecas.esqueleto('4rem', '1.25rem')}</td></tr>`).join('')}</tbody></table></div>`;
    }
    return Array.from({ length: 5 }, (_, i) => `<div class="frase" aria-hidden="true">${pecas.esqueleto('1rem', '1rem')}<div class="frase__corpo">${pecas.esqueleto(`${62 - i * 7}%`, '1rem')}${pecas.esqueleto('7rem', '1.25rem')}${pecas.esqueleto('11rem', '1.25rem')}</div></div>`).join('');
  }

  function nadaParaMostrar() {
    if (!todas().length) {   // PAI-02
      return pecas.vazio({
        icone: 'frases', titulo: 'Nenhuma frase ainda.',
        texto: `Minere de um vídeo com <kbd class="tecla">${esc(PS.dados.atalhos.legenda || 'Sem atalho')}</kbd> ou use Minerar frases para colar, importar ou ler uma foto.`,
        acoes: `<button type="button" class="botao" data-acao="frases.minerar" data-valor="colar">${ic('mais')}Minerar frases</button>`,
      });
    }
    if (visao.busca.trim()) {   // PAI-04
      return pecas.vazio({ icone: 'busca', titulo: `Nenhuma frase com “${esc(visao.busca.trim())}”.`, acoes: '<button type="button" class="botao botao--contorno" data-acao="frases.limparBusca">Limpar busca</button>' });
    }
    return pecas.vazio({ icone: 'ajustes', titulo: 'Nenhuma frase com estes filtros.', acoes: '<button type="button" class="botao botao--contorno" data-acao="frases.limparFiltros">Limpar filtros</button>' });   // PAI-03
  }

  // ---------- A linha de seleção e a barra de ações (PAI-31, PAI-32) ----------
  function linhaDeSelecao(lista, itens) {
    const naPagina = itens.filter(frase => visao.selecao.has(frase.id)).length;
    const n = visao.selecao.size;
    const caixa = `<input type="checkbox" class="caixa" id="sel-pagina" ${naPagina && naPagina === itens.length ? 'checked' : ''} data-misto="${naPagina > 0 && naPagina < itens.length}" data-ao-mudar="frases.marcarPagina" aria-label="Selecionar página">`;
    if (!n) return `<div class="selecao-linha"><label class="com-controle selecao-linha__pagina">${caixa}<span>Selecionar página</span></label><span class="campo-ajuda">${lista.length} ${plural(lista.length, 'frase', 'frases')}</span></div>`;
    const paginaInteira = naPagina === itens.length && lista.length > n;
    const desligada = semConexao();
    return `<div class="selecao-linha selecao-linha--ativa" role="toolbar" aria-label="Ações das frases selecionadas">${caixa}`
      + `<button type="button" class="botao botao--fantasma botao--icone botao--p" data-acao="frases.desmarcar" data-foco="desmarcar" aria-label="Desmarcar todas" data-dica="Desmarcar todas">${ic('fechar')}</button>`
      + `<b aria-live="polite">${n} ${plural(n, 'selecionada', 'selecionadas')}</b>`
      + `${paginaInteira ? `<button type="button" class="botao botao--link" data-acao="frases.marcarTodas" data-foco="marcar-todas">Selecionar todas as ${lista.length} frases</button>` : ''}`
      + `<span class="selecao-linha__acoes">`
      + `<button type="button" class="botao botao--fantasma botao--p" data-acao="frases.editarContextoDasMarcadas" data-foco="lote-contexto">${ic('etiqueta')}<span>Editar contexto</span></button>`
      + `<button type="button" class="botao botao--fantasma botao--p" data-acao="frases.exportar" data-foco="lote-exportar">${ic('arquivo')}<span>Exportar .txt</span></button>`
      + `<button type="button" class="botao botao--perigo botao--p" data-acao="frases.apagarMarcadas" data-foco="lote-apagar">${ic('lixeira')}<span>Apagar</span></button>`
      + `<button type="button" class="botao botao--p" data-acao="frases.enviar" data-foco="lote-enviar" ${desligada ? 'aria-disabled="true" data-dica="Indisponível: a Conexão com o Anki está desligada. Ligue-a neste computador para enviar."' : ''}>${ic('enviar')}<span>Enviar ao Anki</span></button>`
      + `</span></div>`;
  }

  function paginacao(lista, pagina) {   // PAI-07, PAI-26
    if (lista.length <= POR_PAGINA) return '';
    const botao = (acao, icone, rotulo, parado) => `<button type="button" class="botao botao--contorno botao--icone botao--p" data-acao="frases.pagina" data-valor="${acao}" data-foco="pg-${acao}" aria-label="${rotulo}" data-dica="${rotulo}" ${parado ? 'disabled' : ''}>${ic(icone)}</button>`;
    const noComeco = visao.pagina === 1;
    const noFim = visao.pagina === pagina.paginas;
    return `<nav class="paginas" aria-label="Páginas"><span class="paginas__intervalo mono">${pagina.inicio + 1}–${pagina.inicio + pagina.itens.length} de ${lista.length}</span>`
      + `${botao('primeira', 'primeira', 'Primeira página', noComeco)}${botao('anterior', 'esquerda', 'Página anterior', noComeco)}`
      + `<span class="paginas__atual mono">${visao.pagina} de ${pagina.paginas}</span>${botao('proxima', 'direita', 'Próxima página', noFim)}${botao('ultima', 'ultima', 'Última página', noFim)}</nav>`;
  }

  function filtros() {
    const fontes = [...new Set(todas().map(frase => frase.fonte))];
    const idiomas = [...new Set(todas().map(frase => frase.idioma))];
    return `<div class="filtros">`
      + pecas.selecao({ id: 'filtro-fonte', rotulo: 'Fonte', valor: visao.fonte, acao: 'frases.filtrar', opcoes: [['', 'Todas as fontes'], ...fontes.map(f => [f, (PS.dados.FONTES[f] || { nome: f }).nome])] })
      + pecas.selecao({ id: 'filtro-idioma', rotulo: 'Idioma', valor: visao.idioma, acao: 'frases.filtrar', opcoes: [['', 'Todos os idiomas'], ...idiomas.map(i => [i, PS.dados.IDIOMAS[i]])] })
      + pecas.selecao({ id: 'filtro-ordem', rotulo: 'Ordem', valor: visao.ordem, acao: 'frases.filtrar', opcoes: [['novas', 'Mais novas primeiro'], ['antigas', 'Mais antigas primeiro']] })
      + `<label class="campo-com-icone filtros__busca">${ic('busca')}<input type="search" class="campo campo--com-acao" id="busca-frases" placeholder="Buscar nas frases" aria-label="Buscar nas frases" autocomplete="off" value="${esc(visao.busca)}" data-ao-digitar="frases.buscar">`
      + `<button type="button" class="botao botao--fantasma botao--icone botao--pp" id="limpar-busca" data-acao="frases.limparBusca" aria-label="Limpar busca" ${visao.busca ? '' : 'hidden'}>${ic('fechar')}</button></label>`
      + `<label class="com-controle filtros__ocultar"><input type="checkbox" role="switch" class="interruptor" id="filtro-ocultar" ${visao.ocultar ? 'checked' : ''} data-ao-mudar="frases.filtrar"><span>Ocultar enviadas e exportadas</span></label></div>`;
  }

  function avisos() {
    let saida = '';
    if (PS.estado.estado === 'erro') {   // CFG-03
      saida += pecas.alerta({ tipo: 'perigo', icone: 'nuvem-fora', papel: 'alert', titulo: 'Sem sincronizar · as frases estão só neste computador', texto: 'As mudanças deste computador ainda não subiram para a nuvem.', acoes: '<button type="button" class="botao botao--contorno botao--p" data-acao="frases.tentarSincronizar">Tentar de novo</button>' });
    }
    if (visao.lembrete) {   // ONB-15
      saida += pecas.alerta({ icone: 'relogio', titulo: `A configuração ficou pela metade: ${visao.lembrete.feitos} de ${visao.lembrete.total} passos.`, acoes: '<button type="button" class="botao botao--fantasma botao--p" data-acao="frases.ocultarLembrete">Ocultar</button><button type="button" class="botao botao--contorno botao--p" data-acao="frases.continuarConfiguracao">Continuar configuração</button>' });
    }
    return saida;
  }

  /** A parte que muda quando a busca ou a seleção muda: a linha de seleção, a lista e a paginação. */
  function miolo() {
    if (PS.estado.estado === 'carregando') return `<div class="frases__lista" aria-busy="true">${carregando()}</div>`;
    const lista = filtradas();
    if (!lista.length) return nadaParaMostrar();
    const pagina = daPagina(lista);
    return `${linhaDeSelecao(lista, pagina.itens)}<div class="frases__lista">${PS.estado.d === 'b' ? listaEmTabela(pagina.itens) : listaEmCartoes(pagina.itens)}</div>${paginacao(lista, pagina)}`;
  }

  function redesenharMiolo() {
    const el = document.getElementById('frases-miolo');
    if (!el) { PS.desenhar(); return; }
    const ativo = document.activeElement;
    const chave = ativo && ativo.dataset ? ativo.dataset.foco : null;
    el.innerHTML = miolo();
    marcarMisto();
    document.getElementById('limpar-busca').hidden = !visao.busca;
    if (chave) {
      const novo = el.querySelector(`[data-foco="${CSS.escape(chave)}"]`);
      if (novo) novo.focus({ preventScroll: true });
    }
    PS.casca.contagens();
  }

  function marcarMisto() {
    const caixa = document.getElementById('sel-pagina');
    if (caixa) caixa.indeterminate = caixa.dataset.misto === 'true';
  }

  PS.telas.frases = {
    titulo: 'Frases mineradas',
    desenhar() {
      const temFrases = todas().length > 0 || PS.estado.estado === 'carregando';
      return `<div class="tela tela--frases"><header class="tela__cabeca"><div><h1 class="tela__titulo" id="titulo-da-tela" tabindex="-1">Frases mineradas</h1><p class="tela__descricao">Tudo o que você minerou, pronto para virar cartão no Anki.</p></div>`
        + `<button type="button" class="botao" id="minerar-frases" data-acao="frases.menuMinerar" aria-haspopup="menu" aria-expanded="false">${ic('mais')}Minerar frases${ic('abaixo')}</button></header>`
        + `${avisos()}${temFrases ? filtros() : ''}<div id="frases-miolo">${miolo()}</div></div>`;
    },
    depois: marcarMisto,
  };

  PS.partesDasFrases.redesenharMiolo = redesenharMiolo;
})(window.PS);
