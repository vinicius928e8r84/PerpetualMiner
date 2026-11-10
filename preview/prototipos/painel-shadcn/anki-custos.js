'use strict';

// Custos: o período, o cartão com os azulejos de idioma e o gráfico por dia, a origem das imagens, o teto do mês, os
// envios recentes (lista e detalhe na direção A, tabela e gaveta na B) e o Avançado (BRG-03 a BRG-41, ENV-08).

(function (PS) {
  const { esc, ic, pecas, plural, dinheiro } = PS;
  const { dia, PERIODOS, visao, situacao, ligada, custoDe, dataDe, quandoFoi, valor, enviosDoPeriodo, somar, ESTADOS_DO_ENVIO, tituloDoEnvio } = PS.partesDoAnki;
  const A = PS.acoes;

  // ---------- Custos ----------
  function barraDoPeriodo() {
    return `<div class="anki-barra">${pecas.escolha({ rotulo: 'Período', valor: visao.periodo, acao: 'anki.periodo', chave: 'periodo', opcoes: [['hoje', 'Hoje'], ['mes', 'Este mês'], ['tudo', 'Tudo']] })}`
      + `<div class="anki-datas"><label class="com-controle"><span class="campo-ajuda">De</span><input type="date" class="campo campo--mono" id="custos-de" value="${visao.de}" data-ao-mudar="anki.datas"></label>`
      + `<label class="com-controle"><span class="campo-ajuda">Até</span><input type="date" class="campo campo--mono" id="custos-ate" value="${visao.ate}" data-ao-mudar="anki.datas"></label></div></div>`;
  }

  /** O cartão do alto, no desenho do "Bar Chart - Interactive" do shadcn: o título, os azulejos que trocam o idioma e o gráfico. */
  function cartaoDosCustos() {
    const azulejo = (idioma, codigo, nome) => {
      const lista = enviosDoPeriodo(idioma);
      const marcado = visao.idiomaDosCustos === idioma;
      return `<button type="button" class="azulejo" role="radio" aria-checked="${marcado}" tabindex="${marcado ? 0 : -1}" data-seta data-foco="custos-${idioma}" data-acao="anki.idiomaDosCustos" data-valor="${idioma}">`
        + `<span class="azulejo__codigo mono">${codigo}</span><span class="azulejo__nome">${nome}</span><span class="azulejo__numero mono">${valor(somar(lista, custoDe), { minimo: false })}</span><span class="campo-ajuda">${lista.length} ${plural(lista.length, 'envio', 'envios')}</span></button>`;
    };
    const lista = enviosDoPeriodo();
    const porDia = new Map();
    for (const envio of [...lista].reverse()) {
      const chave = dia(dataDe(envio));
      const soma = porDia.get(chave) || { custo: 0, envios: 0 };
      porDia.set(chave, { custo: soma.custo + custoDe(envio), envios: soma.envios + 1 });
    }
    const teto = Math.max(...[...porDia.values()].map(d => d.custo), 0.0001);
    const barras = [...porDia].map(([chave, d]) => {
      const rotulo = `${chave.slice(8)}/${chave.slice(5, 7)}`;
      return `<div class="grafico__coluna" tabindex="0" data-dica="${rotulo} · ${dinheiro(d.custo, visao.quatroCasas ? 4 : 2)} · ${d.envios} ${plural(d.envios, 'envio', 'envios')}"><span class="grafico__valor mono">${valor(d.custo, { minimo: false })}</span><i style="height:${Math.max(4, d.custo / teto * 100)}%"></i><span class="grafico__dia mono">${rotulo}</span></div>`;
    }).join('');
    const numeros = [
      ['Criação de cartões', valor(somar(lista, e => e.custos.cartoes))],
      ['Imagens geradas', valor(somar(lista, e => e.custos.geradas))],
      ['Economia com fotos reais', valor(somar(lista, e => e.economia))],
      ['Frases', `${somar(lista, e => e.enviadas)} de ${somar(lista, e => e.pedidas)}`],
      ['Envios concluídos', `${lista.filter(e => e.estado === 'concluido').length} de ${lista.length}`],
    ];
    return `<section class="cartao custos" aria-label="Custos"><div class="custos__topo"><div class="custos__titulo"><h2 class="cartao__titulo">Custos</h2><p class="cartao__descricao">O que os envios ao Anki gastaram na sua chave, por dia.</p></div>`
      + `<div class="custos__azulejos" role="radiogroup" aria-label="Idioma dos custos" data-setas>${azulejo('todos', 'EN + RU', 'Todos os idiomas')}${azulejo('en', 'EN', 'Inglês')}${azulejo('ru', 'RU', 'Russo')}</div></div>`
      + `<div class="cartao__corpo"><figure class="grafico" aria-label="Custo por dia no período">${barras}</figure></div>`
      + `<dl class="cartao__pe custos__numeros">${numeros.map(([nome, numero]) => `<div><dt>${nome}</dt><dd class="mono">${numero}</dd></div>`).join('')}</dl></section>`;
  }

  function origemDasImagens() {
    const lista = enviosDoPeriodo();
    const partes = [['Foto real', 'real', 1], ['Gerada por IA', 'geradas', 2], ['Sem imagem', 'sem', 3], ['Falhou', 'falhas', 4]];
    const total = somar(lista, e => e.imagens.real + e.imagens.geradas + e.imagens.sem + e.imagens.falhas);
    return `<section class="cartao" aria-label="Origem das imagens"><div class="cartao__topo"><h2 class="cartao__titulo">Origem das imagens</h2><p class="cartao__descricao">${total} ${plural(total, 'imagem', 'imagens')}</p></div>`
      + `<div class="cartao__corpo origem">${partes.map(([nome, campo, cor]) => {
        const n = somar(lista, e => e.imagens[campo]);
        return `<div class="origem__parte"><div class="origem__linha"><span>${nome}</span><b class="mono">${PS.porcento(n, total)}</b></div><div class="progresso progresso--g" role="progressbar" aria-label="${nome}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${n}"><i style="width:${total ? n / total * 100 : 0}%;background:var(--chart-${cor})"></i></div><span class="campo-ajuda">${n} ${plural(n, 'imagem', 'imagens')}</span></div>`;
      }).join('')}</div></section>`;
  }

  function tetoDoMes() {   // BRG-41
    const gasto = somar(PS.dados.envios.filter(envio => dia(dataDe(envio)) >= PERIODOS.mes[0]), custoDe);
    const usado = Math.min(100, gasto / PS.dados.teto * 100);
    return `<section class="cartao" aria-label="Teto do mês"><div class="cartao__topo"><h2 class="cartao__titulo">Teto do mês</h2><p class="cartao__descricao">${dinheiro(gasto)} de ${dinheiro(PS.dados.teto)} este mês</p></div>`
      + `<div class="cartao__corpo teto"><div class="progresso progresso--g" role="progressbar" aria-label="Uso do teto do mês" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(usado)}"><i style="width:${usado}%;background:var(--chart-${usado >= 80 ? 4 : 1})"></i></div>`
      + `<form class="teto__form" data-ao-enviar="anki.salvarTeto"><label class="campo-ajuda" for="teto-valor">US$</label><input class="campo campo--mono" id="teto-valor" inputmode="decimal" aria-label="Teto do mês em dólares" value="${String(PS.dados.teto).replace('.', ',')}"><button type="submit" class="botao botao--contorno">Salvar teto</button></form>`
      + `<p class="campo-erro" id="teto-erro" role="alert" hidden>Digite um valor maior que zero.</p><p class="campo-ajuda">Conta o que a chave gasta, com a imagem gerada. Vale só neste computador.</p></div></section>`;
  }

  function detalheDoEnvio(envio) {
    const estado = ESTADOS_DO_ENVIO[envio.estado];
    const img = envio.imagens;
    const total = img.real + img.geradas + img.sem + img.falhas;
    const fatia = (n, cor) => (n ? `<i style="flex:${n};background:var(--chart-${cor})"></i>` : '');
    const linha = (nome, numero) => `<div><dt>${nome}</dt><dd class="mono">${numero}</dd></div>`;
    const selo = envio.estado === 'em-parte' ? `Concluído em parte · ${envio.enviadas} de ${envio.pedidas} frases` : estado.rotulo;
    return `<p class="campo-ajuda">${quandoFoi(envio)} · ${PS.dados.IDIOMAS[envio.idioma]}${visao.ids ? ` · <span class="mono">${envio.id}</span>` : ''}</p><h3 class="detalhe__titulo">${tituloDoEnvio(envio)}</h3>`
      + `<p><span class="selo selo--${estado.selo}">${selo}</span></p>`
      + `<dl class="pares">${linha('Criação de cartões', valor(envio.custos.cartoes))}${linha('Imagens geradas', valor(envio.custos.geradas))}${linha('Escolha e triagem', valor(envio.custos.escolha + envio.custos.triagem))}<div class="pares__total"><dt>Total</dt><dd class="mono">${valor(custoDe(envio), { minimo: false })}</dd></div></dl>`
      + `${total ? `<div class="campo-grupo"><span class="rotulo">Imagens</span><div class="pilha" role="img" aria-label="${img.real} fotos reais, ${img.geradas} geradas, ${img.sem} sem imagem, ${img.falhas} falharam">${fatia(img.real, 1)}${fatia(img.geradas, 2)}${fatia(img.sem, 3)}${fatia(img.falhas, 4)}</div>`
        + `<ul class="legenda"><li><i style="background:var(--chart-1)"></i>${img.real} ${plural(img.real, 'foto real', 'fotos reais')}</li><li><i style="background:var(--chart-2)"></i>${img.geradas} ${plural(img.geradas, 'gerada', 'geradas')}</li><li><i style="background:var(--chart-3)"></i>${img.sem} sem imagem</li><li><i style="background:var(--chart-4)"></i>${img.falhas} ${plural(img.falhas, 'falhou', 'falharam')}</li></ul></div>` : ''}`
      + `${envio.erro ? `<details class="recolhivel" ${visao.detalhes ? 'open' : ''} data-ao-alternar="detalhes"><summary>${ic('direita', 'ic--seta')}Detalhes</summary><p class="detalhe__erro mono">${esc(envio.erro)}</p></details>`
        + `<button type="button" class="botao botao--contorno" data-acao="anki.tentarEnvio" data-id="${envio.id}" ${ligada() ? '' : 'aria-disabled="true" data-dica="Indisponível: a Conexão com o Anki está desligada. Ligue-a neste computador para continuar o envio."'}>${ic('atualizar')}Tentar de novo</button>` : ''}`;
  }

  function enviosRecentes() {
    const lista = enviosDoPeriodo();
    if (!lista.length) return pecas.vazio({ icone: 'moeda', titulo: 'Nenhum envio neste período.', acoes: '<button type="button" class="botao botao--contorno" data-acao="anki.periodo" data-valor="tudo">Ver tudo</button>' });   // BRG-22
    const escolhido = lista.find(envio => envio.id === visao.envio) || lista[0];
    const cabeca = `<div class="cartao__topo"><h2 class="cartao__titulo">Envios recentes</h2><p class="cartao__descricao">${lista.length} ${plural(lista.length, 'envio', 'envios')}</p></div>`;
    if (PS.estado.d === 'b') {
      return `<section class="cartao" aria-label="Envios recentes">${cabeca}<div class="cartao__corpo"><div class="tabela-moldura"><table class="tabela tabela--densa"><thead><tr><th>Envio</th><th>Quando</th><th>Estado</th><th class="num">Frases</th><th class="num">Imagens</th><th class="num">Custo</th></tr></thead><tbody>`
        + lista.map(envio => {
          const estado = ESTADOS_DO_ENVIO[envio.estado];
          const img = envio.imagens;
          return `<tr><td><button type="button" class="frase-link" data-acao="anki.abrirEnvio" data-id="${envio.id}" data-foco="envio-${envio.id}">${tituloDoEnvio(envio)}</button>${visao.ids ? ` <span class="campo-ajuda mono">${envio.id}</span>` : ''}</td><td>${quandoFoi(envio)}</td><td><span class="selo selo--${estado.selo}">${estado.rotulo}</span></td>`
            + `<td class="num">${envio.enviadas} de ${envio.pedidas}</td><td class="num">${img.real + img.geradas + img.sem + img.falhas}</td><td class="num">${valor(custoDe(envio), { minimo: false })}</td></tr>`;
        }).join('') + '</tbody></table></div></div></section>';
    }
    return `<section class="cartao" aria-label="Envios recentes">${cabeca}<div class="cartao__corpo lista-detalhe"><div class="lista-detalhe__lista" role="listbox" aria-label="Envios recentes" data-setas>`
      + lista.map(envio => {
        const marcado = envio === escolhido;
        return `<button type="button" class="item" role="option" aria-selected="${marcado}" tabindex="${marcado ? 0 : -1}" data-seta data-foco="envio-${envio.id}" data-acao="anki.escolherEnvio" data-id="${envio.id}"><span class="item__conteudo"><span class="item__titulo">${tituloDoEnvio(envio)}</span><span class="item__descricao">${quandoFoi(envio)}${visao.ids ? ` · <span class="mono">${envio.id}</span>` : ''}</span></span>`
          + `<span class="ponto ponto--${ESTADOS_DO_ENVIO[envio.estado].ponto}" title="${ESTADOS_DO_ENVIO[envio.estado].rotulo}"></span><span class="mono">${valor(custoDe(envio), { minimo: false })}</span></button>`;
      }).join('') + `</div><div class="lista-detalhe__detalhe" id="detalhe-do-envio">${detalheDoEnvio(escolhido)}</div></div></section>`;
  }

  function avancado() {   // BRG-32
    const lista = enviosDoPeriodo();
    return `<details class="recolhivel cartao-tracejado" id="custos-avancado"><summary>${ic('direita', 'ic--seta')}Avançado <small>· escolha e triagem de imagem, IDs, 4 casas, diagnóstico</small></summary><div class="avancado">`
      + `<dl class="pares"><div><dt>Escolha de imagem</dt><dd class="mono">${dinheiro(somar(lista, e => e.custos.escolha), 4)}</dd></div><div><dt>Triagem de imagem</dt><dd class="mono">${dinheiro(somar(lista, e => e.custos.triagem), 4)}</dd></div><div class="pares__total"><dt>Total com 4 casas</dt><dd class="mono">${dinheiro(somar(lista, custoDe), 4)}</dd></div></dl>`
      + `<div class="avancado__chaves"><label class="com-controle"><input type="checkbox" role="switch" class="interruptor" id="quatro-casas" ${visao.quatroCasas ? 'checked' : ''} data-ao-mudar="anki.quatroCasas"><span>Mostrar custos com 4 casas</span></label>`
      + `<label class="com-controle"><input type="checkbox" role="switch" class="interruptor" id="ids-dos-envios" ${visao.ids ? 'checked' : ''} data-ao-mudar="anki.ids"><span>Mostrar IDs dos envios</span></label></div>`
      + `<div class="campo-grupo"><h3 class="rotulo">Pacote de diagnóstico</h3><p class="campo-ajuda">Um arquivo por envio, com etapas, erros e caminhos. Serve para investigar um envio que falhou.</p>`
      + `<div class="tabela-moldura"><table class="tabela tabela--densa"><tbody>${lista.map(envio => `<tr><td>${tituloDoEnvio(envio)} <span class="campo-ajuda">· ${quandoFoi(envio)}</span></td><td class="num"><button type="button" class="botao botao--fantasma botao--p" data-acao="anki.baixarDiagnostico" data-id="${envio.id}">${ic('baixar')}Baixar diagnóstico</button></td></tr>`).join('')}</tbody></table></div></div></div></details>`;
  }

  function custos() {
    if (situacao() === 'carregando') {
      return `<div aria-busy="true" class="pilha-de-cartoes"><p class="campo-ajuda" role="status">Somando os custos…</p>${pecas.esqueleto('100%', '15rem')}<div class="duas-colunas">${pecas.esqueleto('100%', '9rem')}${pecas.esqueleto('100%', '9rem')}</div>${pecas.esqueleto('100%', '14rem')}</div>`;   // BRG-25
    }
    if (situacao() === 'erro' || situacao() === 'desligada') {   // BRG-04
      return pecas.alerta({ tipo: 'perigo', icone: 'erro-circulo', papel: 'alert', titulo: 'Não deu para carregar os custos.', texto: 'Confira se a Conexão com o Anki está ligada.', acoes: '<button type="button" class="botao botao--contorno botao--p" data-acao="anki.tentarDeNovo">Tentar de novo</button>' });
    }
    if (situacao() === 'vazio') return pecas.vazio({ icone: 'moeda', titulo: 'Nenhum envio ainda', texto: 'Os custos aparecem aqui depois do primeiro envio ao Anki.', acoes: '<a class="botao botao--contorno" href="#frases">Ir para Frases</a>' });   // BRG-33
    return `<div class="pilha-de-cartoes">${barraDoPeriodo()}${cartaoDosCustos()}<div class="duas-colunas">${origemDasImagens()}${tetoDoMes()}</div>${enviosRecentes()}${avancado()}</div>`;
  }

  A['anki.periodo'] = botao => { visao.periodo = botao.dataset.valor; [visao.de, visao.ate] = PERIODOS[visao.periodo]; PS.desenhar(); };
  A['anki.datas'] = () => {
    visao.de = document.getElementById('custos-de').value;
    visao.ate = document.getElementById('custos-ate').value;
    visao.periodo = Object.keys(PERIODOS).find(nome => PERIODOS[nome][0] === visao.de && PERIODOS[nome][1] === visao.ate) || '';
    PS.desenhar();
  };
  A['anki.idiomaDosCustos'] = botao => { visao.idiomaDosCustos = botao.dataset.valor; PS.desenhar(); };
  A['anki.escolherEnvio'] = botao => { visao.envio = botao.dataset.id; visao.detalhes = false; PS.desenhar(); };
  A['anki.abrirEnvio'] = botao => {
    const envio = PS.dados.envios.find(item => item.id === botao.dataset.id);
    PS.abrirCamada({ tipo: 'gaveta', rotulo: tituloDoEnvio(envio), conteudo: PS.gaveta({ titulo: 'Envio', descricao: 'Quanto custou e o que entrou no Anki.', corpo: `<div class="gaveta__bloco">${detalheDoEnvio(envio)}</div>` }) });
  };
  A['anki.tentarEnvio'] = botao => {   // ENV-14
    const envio = PS.dados.envios.find(item => item.id === botao.dataset.id);
    Object.assign(envio, { estado: 'concluido', enviadas: envio.pedidas, erro: null });
    PS.fecharCamada();
    PS.desenhar();
    PS.avisar('Envio retomado');
  };
  A['anki.quatroCasas'] = caixa => { visao.quatroCasas = caixa.checked; redesenharComAvancado(); };
  A['anki.ids'] = caixa => { visao.ids = caixa.checked; redesenharComAvancado(); };
  function redesenharComAvancado() {
    PS.desenhar();
    document.getElementById('custos-avancado').open = true;
  }
  A['anki.baixarDiagnostico'] = botao => PS.avisar(`Diagnóstico de ${botao.dataset.id} baixado (de mentira, no protótipo)`);
  A['anki.salvarTeto'] = () => {
    const numero = Number(document.getElementById('teto-valor').value.replace(',', '.'));
    if (!(numero > 0)) { document.getElementById('teto-erro').hidden = false; document.getElementById('teto-valor').setAttribute('aria-invalid', 'true'); return; }
    PS.dados.teto = numero;
    PS.desenhar();
    PS.avisar('Teto salvo');
  };
  document.addEventListener('toggle', evento => {
    if (evento.target.matches && evento.target.matches('[data-ao-alternar="detalhes"]')) visao.detalhes = evento.target.open;
  }, true);

  PS.partesDoAnki.corpos.custos = custos;
})(window.PS);
