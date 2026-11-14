'use strict';

// Baralhos e termos (a rosca de maturidade e os números do baralho) e Vocabulário (a lista com filtro, busca e o
// detalhe do item), por idioma (BRG-10 a BRG-21, BRG-34, BRG-35).

(function (PS) {
  const { esc, ic, pecas, plural, milhar } = PS;
  const { visao, situacao } = PS.partesDoAnki;
  const A = PS.acoes;

  // ---------- Baralhos e termos ----------
  function azulejosDeIdioma({ rotulo, valorAtual, acao, chave, numero }) {
    return `<div class="azulejos" role="radiogroup" aria-label="${rotulo}" data-setas>${Object.keys(PS.dados.IDIOMAS).map(idioma => {
      const marcado = idioma === valorAtual;
      const [n, unidade] = numero(idioma);
      return `<button type="button" class="azulejo azulejo--cartao" role="radio" aria-checked="${marcado}" tabindex="${marcado ? 0 : -1}" data-seta data-foco="${chave}-${idioma}" data-acao="${acao}" data-valor="${idioma}"><span class="azulejo__codigo mono">${idioma.toUpperCase()} · ${esc(PS.dados.ajustesSalvos[idioma].baralho)}</span><span class="azulejo__nome">${PS.dados.IDIOMAS[idioma]}</span><span><span class="azulejo__numero mono">${n}</span> <span class="campo-ajuda">${unidade}</span></span></button>`;
    }).join('')}</div>`;
  }

  function rosca(b) {
    const total = b.maduros + b.recentes + b.novos;
    const raio = 42;
    const volta = 2 * Math.PI * raio;
    let andado = 0;
    const arco = (n, cor) => {
      const tamanho = n / total * volta;
      const el = `<circle cx="60" cy="60" r="${raio}" fill="none" stroke="var(--chart-${cor})" stroke-width="13" stroke-dasharray="${Math.max(0, tamanho - 2).toFixed(2)} ${(volta - tamanho + 2).toFixed(2)}" stroke-dashoffset="${(-andado).toFixed(2)}"/>`;
      andado += tamanho;
      return el;
    };
    const pct = Math.round(b.maduros / total * 100);
    return `<figure class="rosca" role="img" aria-label="${pct}% maduros"><svg viewBox="0 0 120 120"><g transform="rotate(-90 60 60)">${arco(b.maduros, 1)}${arco(b.recentes, 2)}${arco(b.novos, 3)}</g></svg><figcaption><b class="mono">${pct}%</b><span>maduros</span></figcaption></figure>`;
  }

  function baralhos() {
    if (situacao() === 'carregando') return `<div aria-busy="true" class="pilha-de-cartoes"><p class="campo-ajuda" role="status">Lendo os baralhos do Anki…</p><div class="duas-colunas">${pecas.esqueleto('100%', '5.5rem')}${pecas.esqueleto('100%', '5.5rem')}</div>${pecas.esqueleto('100%', '16rem')}</div>`;   // BRG-10
    if (situacao() === 'erro') return pecas.alerta({ tipo: 'perigo', icone: 'erro-circulo', papel: 'alert', titulo: 'Não deu para ler os baralhos do Anki.', acoes: '<button type="button" class="botao botao--contorno botao--p" data-acao="anki.tentarDeNovo">Tentar de novo</button>' });   // BRG-11
    if (situacao() === 'vazio') return pecas.vazio({ icone: 'baralho', titulo: 'Esperando o Anki', texto: 'Começa depois que o Anki abrir uma vez.', acoes: `<button type="button" class="botao botao--contorno" data-acao="anki.abrirOAnki">${ic('externo')}Abrir o Anki</button>` });   // BRG-37, BRG-38
    const b = PS.dados.baralhos[visao.idiomaDosBaralhos];
    const linha = (nome, numero, cor) => `<div><dt>${cor ? `<i class="legenda__cor" style="background:var(--chart-${cor})"></i>` : ''}${nome}</dt><dd class="mono">${numero}</dd></div>`;
    return `<div class="pilha-de-cartoes">${situacao() === 'desligada' ? pecas.alerta({ tipo: 'aviso', icone: 'relogio', titulo: 'Anki fechado. Mostrando dados de há 2 h.', texto: 'Números lidos direto do arquivo do Anki. Para enviar, o Anki precisa abrir normalmente.' }) : ''}`   // BRG-12, BRG-13
      + azulejosDeIdioma({ rotulo: 'Idioma dos baralhos', valorAtual: visao.idiomaDosBaralhos, acao: 'anki.idiomaDosBaralhos', chave: 'baralhos', numero: idioma => [milhar(PS.dados.baralhos[idioma].palavras), 'palavras'] })
      + `<section class="cartao" aria-label="${PS.dados.IDIOMAS[visao.idiomaDosBaralhos]} · ${esc(b.baralho)}"><div class="cartao__topo"><h2 class="cartao__titulo">${PS.dados.IDIOMAS[visao.idiomaDosBaralhos]} · ${esc(b.baralho)}</h2><p class="cartao__descricao">A maturidade dos cartões e as palavras que eles cobrem.</p>`
      + `<a class="botao botao--contorno botao--p cartao__acao" href="#anki/ajustes">${ic('ajustes')}Abrir Ajustes de envio</a></div>`
      + `<div class="cartao__corpo baralho">${rosca(b)}<div class="baralho__numeros"><p class="baralho__total mono">${milhar(b.palavras)}</p><p class="campo-ajuda">palavras diferentes nos cartões</p>`
      + `<dl class="pares">${linha('Cartões', milhar(b.cartoes))}${linha('Termos-alvo', milhar(b.termos))}${linha('Palavra nova por cartão', b.porCartao.toLocaleString('pt-BR'))}${linha('Maduros', milhar(b.maduros), 1)}${linha('Recentes', milhar(b.recentes), 2)}${linha('Novos', milhar(b.novos), 3)}</dl></div></div></section></div>`;
  }

  // ---------- Vocabulário ----------
  const cartoesDoItem = item => item.maduros + item.recentes + item.novos;
  function statusDoItem(item) {   // BRG-35
    const tipos = ['maduros', 'recentes', 'novos'].filter(tipo => item[tipo] > 0);
    if (tipos.length > 1) return ['Misto', 'aviso', 'mistos'];
    return { maduros: ['Maduro', 'sucesso', 'maduros'], recentes: ['Recente', 'info', 'recentes'], novos: ['Novo', 'contorno', 'novos'] }[tipos[0]];
  }

  function itensDoVocabulario() {
    const termo = visao.busca.trim().toLowerCase();
    return PS.dados.vocabulario[visao.idiomaDoVocabulario].filter(item =>
      (!visao.tipo || item.tipo === visao.tipo) && (!visao.status || statusDoItem(item)[2] === visao.status) && (!termo || item.item.toLowerCase().includes(termo)));
  }

  function detalheDoItem(item) {
    const total = cartoesDoItem(item);
    const fatia = (n, cor) => (n ? `<i style="flex:${n};background:var(--chart-${cor})"></i>` : '');
    const [rotulo, selo] = statusDoItem(item);
    return `<p class="campo-ajuda">${item.tipo === 'termo' ? 'Termo' : 'Palavra'} · ${PS.dados.IDIOMAS[visao.idiomaDoVocabulario]}</p><h2 class="detalhe__titulo detalhe__titulo--g" lang="${visao.idiomaDoVocabulario}">${esc(item.item)}</h2>`
      + `<div class="pilha" role="img" aria-label="${item.maduros} maduros, ${item.recentes} recentes, ${item.novos} novos">${fatia(item.maduros, 1)}${fatia(item.recentes, 2)}${fatia(item.novos, 3)}</div>`
      + `<dl class="pares"><div><dt>Aparece em</dt><dd class="mono">${total} ${plural(total, 'cartão', 'cartões')}</dd></div><div><dt><i class="legenda__cor" style="background:var(--chart-1)"></i>Maduros</dt><dd class="mono">${item.maduros}</dd></div><div><dt><i class="legenda__cor" style="background:var(--chart-2)"></i>Recentes</dt><dd class="mono">${item.recentes}</dd></div><div><dt><i class="legenda__cor" style="background:var(--chart-3)"></i>Novos</dt><dd class="mono">${item.novos}</dd></div><div class="pares__total"><dt>Status</dt><dd><span class="selo selo--${selo}">${rotulo}</span></dd></div></dl>`;
  }

  function listaDoVocabulario() {
    const todos = PS.dados.vocabulario[visao.idiomaDoVocabulario];
    const itens = itensDoVocabulario();
    const resumo = `<p class="campo-ajuda" role="status">${todos.length} ${plural(todos.length, 'item', 'itens')} em ${PS.idiomaEm(visao.idiomaDoVocabulario)} · mostrando ${itens.length}</p>`;   // BRG-21
    if (!itens.length) return resumo + pecas.vazio({ icone: 'busca', titulo: 'Nenhum item com esta busca.', texto: 'Mude os filtros ou limpe a busca.', acoes: '<button type="button" class="botao botao--contorno" data-acao="anki.limparVocabulario">Limpar busca</button>' });
    const escolhido = itens.find(item => item.item === visao.item) || itens[0];
    if (PS.estado.d === 'b') {
      return `${resumo}<div class="tabela-moldura"><table class="tabela tabela--densa"><thead><tr><th>Item</th><th>Tipo</th><th>Status</th><th class="num">Cartões</th><th class="num">Maduros</th><th class="num">Recentes</th><th class="num">Novos</th><th>Maturidade</th></tr></thead><tbody>`
        + itens.map(item => {
          const [rotulo, selo] = statusDoItem(item);
          const fatia = (n, cor) => (n ? `<i style="flex:${n};background:var(--chart-${cor})"></i>` : '');
          return `<tr><td lang="${visao.idiomaDoVocabulario}"><b>${esc(item.item)}</b></td><td>${item.tipo}</td><td><span class="selo selo--${selo}">${rotulo}</span></td><td class="num">${cartoesDoItem(item)}</td><td class="num">${item.maduros}</td><td class="num">${item.recentes}</td><td class="num">${item.novos}</td><td><div class="pilha pilha--fina" aria-hidden="true">${fatia(item.maduros, 1)}${fatia(item.recentes, 2)}${fatia(item.novos, 3)}</div></td></tr>`;
        }).join('') + '</tbody></table></div>';
    }
    return `${resumo}<div class="cartao"><div class="cartao__corpo lista-detalhe"><div class="lista-detalhe__lista" role="listbox" aria-label="Vocabulário" data-setas>`
      + itens.map(item => {
        const marcado = item === escolhido;
        const [rotulo, selo] = statusDoItem(item);
        const n = cartoesDoItem(item);
        return `<button type="button" class="item" role="option" aria-selected="${marcado}" tabindex="${marcado ? 0 : -1}" data-seta data-foco="voc-${esc(item.item)}" data-acao="anki.escolherItem" data-valor="${esc(item.item)}"><span class="item__conteudo"><span class="item__titulo" lang="${visao.idiomaDoVocabulario}">${esc(item.item)}</span><span class="item__descricao">${item.tipo} · ${n} ${plural(n, 'cartão', 'cartões')}</span></span><span class="selo selo--${selo}">${rotulo}</span></button>`;
      }).join('') + `</div><div class="lista-detalhe__detalhe">${detalheDoItem(escolhido)}</div></div></div>`;
  }

  function vocabulario() {
    if (situacao() === 'carregando') return `<div aria-busy="true" class="pilha-de-cartoes"><p class="campo-ajuda" role="status">Lendo o vocabulário…</p><div class="duas-colunas">${pecas.esqueleto('100%', '5.5rem')}${pecas.esqueleto('100%', '5.5rem')}</div>${pecas.esqueleto('100%', '18rem')}</div>`;   // BRG-19
    if (situacao() === 'erro' || situacao() === 'desligada') return pecas.alerta({ tipo: 'perigo', icone: 'erro-circulo', papel: 'alert', titulo: 'Não deu para carregar o vocabulário.', acoes: '<button type="button" class="botao botao--contorno botao--p" data-acao="anki.tentarDeNovo">Tentar de novo</button>' });   // BRG-20
    if (situacao() === 'vazio') return pecas.vazio({ icone: 'letras', titulo: 'Esperando o Anki', texto: 'Começa depois que o Anki abrir uma vez.', acoes: `<button type="button" class="botao botao--contorno" data-acao="anki.abrirOAnki">${ic('externo')}Abrir o Anki</button>` });
    return `<div class="pilha-de-cartoes">`
      + azulejosDeIdioma({ rotulo: 'Idioma do vocabulário', valorAtual: visao.idiomaDoVocabulario, acao: 'anki.idiomaDoVocabulario', chave: 'vocabulario', numero: idioma => [PS.dados.vocabulario[idioma].length, plural(PS.dados.vocabulario[idioma].length, 'item', 'itens')] })
      + `<div class="filtros">${pecas.selecao({ id: 'voc-tipo', rotulo: 'Tipo', valor: visao.tipo, acao: 'anki.filtrarVocabulario', opcoes: [['', 'Palavras e termos'], ['palavra', 'Só palavras'], ['termo', 'Só termos']] })}`
      + pecas.selecao({ id: 'voc-status', rotulo: 'Status', valor: visao.status, acao: 'anki.filtrarVocabulario', opcoes: [['', 'Todos'], ['novos', 'Novos'], ['recentes', 'Recentes'], ['maduros', 'Maduros'], ['mistos', 'Mistos']] })
      + `<label class="campo-com-icone filtros__busca">${ic('busca')}<input type="search" class="campo" id="voc-busca" placeholder="Buscar no vocabulário" aria-label="Buscar no vocabulário" autocomplete="off" value="${esc(visao.busca)}" data-ao-digitar="anki.buscarVocabulario"></label></div>`
      + `<div id="voc-lista" class="pilha-de-cartoes">${listaDoVocabulario()}</div></div>`;
  }

  A['anki.idiomaDosBaralhos'] = botao => { visao.idiomaDosBaralhos = botao.dataset.valor; PS.desenhar(); };
  A['anki.idiomaDoVocabulario'] = botao => { Object.assign(visao, { idiomaDoVocabulario: botao.dataset.valor, item: null, busca: '', tipo: '', status: '' }); PS.desenhar(); };
  A['anki.filtrarVocabulario'] = () => { visao.tipo = document.getElementById('voc-tipo').value; visao.status = document.getElementById('voc-status').value; document.getElementById('voc-lista').innerHTML = listaDoVocabulario(); };
  A['anki.buscarVocabulario'] = campo => { visao.busca = campo.value; document.getElementById('voc-lista').innerHTML = listaDoVocabulario(); };
  A['anki.limparVocabulario'] = () => { Object.assign(visao, { busca: '', tipo: '', status: '' }); PS.desenhar(); document.getElementById('voc-busca').focus(); };
  A['anki.escolherItem'] = botao => { visao.item = botao.dataset.valor; PS.desenhar(); };

  PS.partesDoAnki.corpos.baralhos = baralhos;
  PS.partesDoAnki.corpos.vocabulario = vocabulario;
})(window.PS);
