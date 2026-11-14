'use strict';

// O que as telas dividem: o estado do protótipo (direção, tema, cor, situação e endereço), que mora no endereço, as
// ações por `data-acao`, as setas do teclado, as peças de HTML que se repetem e o desenho da tela do endereço. Nada
// daqui fala com a rede nem guarda nada no navegador. O que abre e fecha por cima da tela está em camadas.js.

(function (PS) {
  const html = document.documentElement;

  // ---------- Texto ----------
  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  PS.esc = texto => String(texto ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);
  PS.plural = (n, um, varios) => (n === 1 ? um : varios);
  PS.milhar = n => n.toLocaleString('pt-BR');
  PS.dinheiro = (valor, casas = 2) => `US$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
  PS.porcento = (parte, total) => (total ? `${(parte / total * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '0%');
  PS.idiomaEm = codigo => PS.dados.IDIOMAS[codigo].toLowerCase();

  // ---------- Estado no endereço ----------
  const PADRAO = { d: 'a', tema: 'escuro', cor: 'neutro', estado: 'normal', lateral: 'larga', moldura: '1' };
  const ACEITOS = {
    d: ['a', 'b'], tema: ['escuro', 'claro'], cor: ['neutro', 'ouro'], lateral: ['larga', 'trilho'], moldura: ['1', '0'],
    estado: ['normal', 'vazio', 'carregando', 'erro', 'desligada', 'primeira'],
  };
  const lido = new URLSearchParams(location.search);
  PS.estado = {};
  for (const [chave, valores] of Object.entries(ACEITOS)) {
    PS.estado[chave] = valores.includes(lido.get(chave)) ? lido.get(chave) : PADRAO[chave];
  }

  function gravarEndereco() {
    const params = new URLSearchParams();
    for (const chave of Object.keys(ACEITOS)) if (PS.estado[chave] !== PADRAO[chave]) params.set(chave, PS.estado[chave]);
    const busca = params.toString();
    history.replaceState(null, '', `${location.pathname}${busca ? `?${busca}` : ''}${location.hash}`);
  }

  function aplicarEstado() {
    html.classList.toggle('dark', PS.estado.tema === 'escuro');
    html.dataset.cor = PS.estado.cor;
    html.dataset.direcao = PS.estado.d;
    html.dataset.lateral = PS.estado.lateral;
    html.dataset.moldura = PS.estado.moldura;
    const cor = document.querySelector('meta[name="theme-color"]');
    if (cor) cor.content = PS.estado.tema === 'escuro' ? '#0a0a0a' : '#fafafa';
  }

  PS.mudar = function (mudancas, { redesenhar = true } = {}) {
    Object.assign(PS.estado, mudancas);
    aplicarEstado();
    gravarEndereco();
    if (redesenhar) PS.desenhar();
  };
  aplicarEstado();

  // ---------- Endereço (#frases, #anki/custos, #configuracoes/atalhos, #boas-vindas/3) ----------
  PS.rota = function () {
    const [area = '', sub = ''] = location.hash.replace(/^#/, '').split('/');
    return { area: PS.telas[area] ? area : 'frases', sub };
  };
  PS.ir = function (endereco) {
    if (location.hash === `#${endereco}`) PS.desenhar();
    else location.hash = endereco;
  };

  // ---------- Ações ----------
  // Um clique num elemento com `data-acao="tela.nome"` chama PS.acoes['tela.nome'](elemento, evento). `data-ao-mudar`
  // faz o mesmo no `change` e `data-ao-digitar` no `input`.
  PS.acoes = {};
  PS.telas = {};

  function despachar(atributo, evento) {
    const alvo = evento.target.closest(`[${atributo}]`);
    if (!alvo) return;
    if (alvo.getAttribute('aria-disabled') === 'true') { evento.preventDefault(); return; }
    const acao = PS.acoes[alvo.getAttribute(atributo)];
    if (!acao) throw new Error(`ação sem dono: ${alvo.getAttribute(atributo)}`);
    acao(alvo, evento);
  }
  document.addEventListener('click', evento => despachar('data-acao', evento));
  document.addEventListener('change', evento => despachar('data-ao-mudar', evento));
  document.addEventListener('input', evento => despachar('data-ao-digitar', evento));
  document.addEventListener('submit', evento => {
    evento.preventDefault();
    despachar('data-ao-enviar', evento);
  });

  // ---------- Setas: Tabs, Toggle Group e as palavras da frase têm uma só parada de Tab ----------
  // `data-setas` no grupo: as setas andam entre os itens (`[data-seta]`); sem `data-setas="foco"`, andar também escolhe.
  document.addEventListener('keydown', evento => {
    const TECLAS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!TECLAS.includes(evento.key) || evento.altKey || evento.ctrlKey || evento.metaKey) return;
    const item = evento.target.closest('[data-seta]');
    const grupo = item && item.closest('[data-setas]');
    if (!grupo) return;
    const itens = [...grupo.querySelectorAll('[data-seta]')].filter(el => !el.disabled);
    const atual = itens.indexOf(item);
    let proximo = atual;
    if (evento.key === 'Home') proximo = 0;
    else if (evento.key === 'End') proximo = itens.length - 1;
    else if (evento.key === 'ArrowLeft' || evento.key === 'ArrowUp') proximo = (atual - 1 + itens.length) % itens.length;
    else proximo = (atual + 1) % itens.length;
    evento.preventDefault();
    const chave = itens[proximo].dataset.foco;
    if (grupo.dataset.setas !== 'foco') itens[proximo].click();
    // O clique pode ter redesenhado a tela: o foco vai para o item novo com a mesma chave.
    const destino = (chave && document.querySelector(`[data-foco="${CSS.escape(chave)}"]`)) || itens[proximo];
    if (grupo.dataset.setas === 'foco') {
      itens.forEach(el => { el.tabIndex = -1; });
      destino.tabIndex = 0;
    }
    destino.focus();
  });

  // ---------- Peças de HTML que as telas repetem ----------
  PS.pecas = {
    /** Toggle Group de escolha única (radiogroup): `opcoes` é [[valor, rótulo], …]. */
    escolha({ rotulo, valor, opcoes, acao, chave, classe = '' }) {
      return `<div class="escolha ${classe}" role="radiogroup" aria-label="${PS.esc(rotulo)}" data-setas>${opcoes.map(([v, texto]) =>
        `<button type="button" class="escolha__opcao" role="radio" aria-checked="${v === valor}" tabindex="${v === valor ? 0 : -1}" data-seta data-foco="${chave}-${v}" data-acao="${acao}" data-valor="${PS.esc(v)}">${PS.esc(texto)}</button>`).join('')}</div>`;
    },
    /** Tabs: `opcoes` é [[valor, rótulo, extra], …]; o painel de cada aba é quem chama que desenha. */
    abas({ rotulo, valor, opcoes, acao, chave }) {
      return `<div class="abas" role="tablist" aria-label="${PS.esc(rotulo)}" data-setas>${opcoes.map(([v, texto, extra = '']) =>
        `<button type="button" class="aba" role="tab" aria-selected="${v === valor}" tabindex="${v === valor ? 0 : -1}" data-seta data-foco="${chave}-${v}" data-acao="${acao}" data-valor="${PS.esc(v)}">${PS.esc(texto)}${extra}</button>`).join('')}</div>`;
    },
    /** Native Select: `opcoes` é [[valor, rótulo], …]. */
    selecao({ id, rotulo, valor, opcoes, acao, classe = '' }) {
      return `<span class="selecao ${classe}"><select class="campo" id="${id}" aria-label="${PS.esc(rotulo)}" data-ao-mudar="${acao}">${opcoes.map(([v, texto]) =>
        `<option value="${PS.esc(v)}"${v === valor ? ' selected' : ''}>${PS.esc(texto)}</option>`).join('')}</select>${PS.ic('abaixo')}</span>`;
    },
    alerta({ tipo = '', icone = 'info', titulo = '', texto = '', acoes = '', papel = 'status' }) {
      return `<div class="alerta ${tipo ? `alerta--${tipo}` : ''}" role="${papel}">${PS.ic(icone)}${titulo ? `<p class="alerta__titulo">${titulo}</p>` : ''}${texto ? `<p class="alerta__texto">${texto}</p>` : ''}${acoes ? `<div class="alerta__acoes">${acoes}</div>` : ''}</div>`;
    },
    vazio({ icone = 'caixa', titulo, texto = '', acoes = '' }) {
      return `<div class="vazio"><span class="vazio__icone">${PS.ic(icone)}</span><div><p class="vazio__titulo">${titulo}</p>${texto ? `<p class="vazio__texto">${texto}</p>` : ''}</div>${acoes ? `<div class="vazio__acoes">${acoes}</div>` : ''}</div>`;
    },
    esqueleto(largura, altura, classe = '') {
      return `<span class="esqueleto ${classe}" style="display:block;width:${largura};height:${altura}"></span>`;
    },
  };

  // ---------- Desenhar a tela do endereço ----------
  PS.desenhar = function () {
    const rota = PS.rota();
    const tela = PS.telas[rota.area];
    const ativo = document.activeElement;
    const chave = ativo && ativo !== document.body && !ativo.closest('.veu, .menu') ? { id: ativo.id, foco: ativo.dataset.foco, inicio: ativo.selectionStart } : null;
    html.dataset.area = rota.area;
    PS.casca.atualizar(rota, tela);
    const conteudo = document.getElementById('conteudo');
    conteudo.innerHTML = tela.desenhar(rota);
    if (tela.depois) tela.depois(conteudo, rota);
    if (chave && (chave.id || chave.foco)) {
      const novo = (chave.id && document.getElementById(chave.id)) || (chave.foco && document.querySelector(`[data-foco="${CSS.escape(chave.foco)}"]`));
      if (novo && novo !== document.activeElement) {
        novo.focus({ preventScroll: true });
        if (chave.inicio != null && novo.setSelectionRange && /^(text|search)$/.test(novo.type)) novo.setSelectionRange(chave.inicio, chave.inicio);
      }
    }
  };

  // Trocar de tela leva o foco ao título dela e a rolagem ao topo; trocar de aba dentro da mesma tela (as abas da Conexão
  // com o Anki, um cartão das Configurações) deixa o foco e a rolagem onde estavam.
  let areaAnterior = null;
  addEventListener('hashchange', () => {
    const { area } = PS.rota();
    PS.fecharCamada();
    PS.desenhar();
    if (area === areaAnterior && area !== 'boas-vindas') return;
    areaAnterior = area;
    scrollTo(0, 0);
    document.getElementById('titulo-da-tela').focus({ preventScroll: true });
  });
  PS.aoComecar = () => { areaAnterior = PS.rota().area; };
})(window.PS = window.PS || {});
