'use strict';

// A casca do painel (Sidebar na variante inset, com o cabeçalho da página), a paleta de comandos (Command, Ctrl+K) e a
// moldura do protótipo: o seletor de direção, de estado, de cor e de tema, que não faz parte do painel.

(function (PS) {
  const { esc, ic, pecas } = PS;
  const d = PS.dados;
  const estreita = () => matchMedia('(max-width: 767px)').matches;

  function navegacao() {
    return `<div class="lateral__topo"><a class="marca" href="#frases" aria-label="PerpetualMiner">${PS.marca}<span>Perpetual<b>Miner</b></span></a></div>`
      + `<div class="lateral__meio"><nav class="lateral__grupo" aria-label="Navegação do painel"><div class="lateral__rotulo">Painel</div>`
      + `<a class="lateral__botao" href="#frases" data-nav="frases" data-dica-trilho="Frases">${ic('frases')}<span>Frases</span><span class="lateral__contagem mono" data-nav-total></span></a>`
      + `<a class="lateral__botao" href="#anki/custos" data-nav="anki" data-dica-trilho="Conexão com o Anki">${ic('tomada')}<span>Conexão com o Anki</span><span class="ponto" data-nav-ponto></span></a></nav></div>`
      + `<div class="lateral__pe"><a class="lateral__botao" href="#configuracoes" data-nav="configuracoes" data-dica-trilho="Configurações">${ic('engrenagem')}<span>Configurações</span></a>`
      + `<button type="button" class="lateral__botao lateral__botao--g" data-acao="casca.menuDaConta" data-nav-conta aria-haspopup="menu" aria-expanded="false"></button></div>`;
  }

  PS.casca = {
    montar() {
      document.getElementById('app').innerHTML = `<a class="botao pular" href="#conteudo">Pular para o conteúdo</a><div class="estrutura"><aside class="lateral" id="lateral">${navegacao()}</aside>`
        + `<div class="miolo"><header class="topo"><button type="button" class="botao botao--fantasma botao--icone botao--p" data-acao="casca.lateral" aria-label="Recolher ou abrir a lateral" data-dica="Lateral" data-dica-tecla="Ctrl B">${ic('painel')}</button><hr class="separador separador--v">`
        + `<span class="topo__migalha">PerpetualMiner</span>${ic('direita', 'topo__seta')}<span class="topo__titulo" id="topo-titulo"></span>`
        + `<div class="topo__acoes"><button type="button" class="botao botao--contorno topo__busca" data-acao="casca.comando">${ic('busca')}<span>Buscar…</span><kbd class="tecla">Ctrl K</kbd></button>`
        + `<button type="button" class="botao botao--fantasma botao--icone" id="alternar-tema" data-acao="casca.tema" aria-label="Alternar o tema" data-dica="Alternar o tema"></button></div></header>`
        + `<main id="conteudo" tabindex="-1"></main></div></div><div class="avisos" id="avisos" role="status" aria-live="polite"></div>${moldura()}`;
    },
    atualizar(rota, tela) {
      document.title = `${tela.titulo} · PerpetualMiner (protótipo shadcn)`;
      document.getElementById('topo-titulo').textContent = tela.titulo;
      document.getElementById('alternar-tema').innerHTML = ic(PS.estado.tema === 'escuro' ? 'sol' : 'lua');
      for (const link of document.querySelectorAll('[data-nav]')) {
        if (link.dataset.nav === rota.area) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
        if (PS.estado.lateral === 'trilho' && link.dataset.dicaTrilho) link.dataset.dica = link.dataset.dicaTrilho; else delete link.dataset.dica;
      }
      const conexao = PS.conexao();
      for (const ponto of document.querySelectorAll('[data-nav-ponto]')) { ponto.className = `ponto ponto--${conexao.ponto}`; ponto.title = `Conexão com o Anki: ${conexao.rotulo.toLowerCase()}`; }
      const conta = d.conta.entrou;
      for (const chip of document.querySelectorAll('[data-nav-conta]')) {
        const estado = !conta ? 'Só neste computador' : PS.estado.estado === 'erro' ? 'Sem sincronizar' : 'Sincronizado agora';   // SHL-05
        chip.innerHTML = `<span class="avatar ${conta ? 'avatar--conta' : ''}">${conta ? d.CONTA.nome[0] : '?'}</span><span class="lateral__quem"><b>${conta ? d.CONTA.nome : 'Sem conta'}</b><small>${estado}</small></span>${ic('abaixo')}`;
      }
      PS.casca.contagens();
      atualizarMoldura();
    },
    contagens() {
      const total = PS.estado.estado === 'vazio' ? 0 : d.frases.length;
      for (const el of document.querySelectorAll('[data-nav-total]')) el.textContent = PS.milhar(total);
    },
  };

  const A = PS.acoes;
  A['casca.lateral'] = () => {
    if (estreita()) {
      PS.abrirCamada({ tipo: 'gaveta-esquerda', rotulo: 'Navegação do painel', conteudo: `<div class="lateral lateral--gaveta">${navegacao()}</div>` });
      PS.casca.atualizar(PS.rota(), PS.telas[PS.rota().area]);
      return;
    }
    PS.mudar({ lateral: PS.estado.lateral === 'larga' ? 'trilho' : 'larga' });
  };
  A['casca.tema'] = () => PS.mudar({ tema: PS.estado.tema === 'escuro' ? 'claro' : 'escuro' });
  A['casca.menuDaConta'] = botao => PS.abrirMenu(botao, [
    { titulo: d.conta.entrou ? d.CONTA.email : 'Sem conta · só neste computador' },
    { rotulo: 'Conta & sync', icone: 'pessoa', acao: () => PS.ir('configuracoes/conta') },
    { rotulo: PS.estado.tema === 'escuro' ? 'Tema claro' : 'Tema escuro', icone: PS.estado.tema === 'escuro' ? 'sol' : 'lua', acao: A['casca.tema'] },
    { rotulo: 'Rever a Boas-vindas', icone: 'estrela', acao: () => PS.ir('boas-vindas') },
    { separador: true },
    d.conta.entrou ? { rotulo: 'Sair da conta', icone: 'sair', acao: () => { d.conta.entrou = false; PS.desenhar(); } } : { rotulo: 'Entrar com Google', icone: 'pessoa', acao: () => { PS.ir('configuracoes/conta'); } },
  ], { rotulo: 'Conta', alinhar: 'inicio' });

  // ---------- Command: buscar e ir para (Ctrl+K) ----------
  const semAcento = texto => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  function comandos() {
    const ir = (rotulo, icone, endereco, atalho = '') => ({ grupo: 'Ir para', rotulo, icone, atalho, acao: () => PS.ir(endereco) });
    return [
      ir('Frases', 'frases', 'frases'), ir('Custos', 'moeda', 'anki/custos'), ir('Baralhos e termos', 'baralho', 'anki/baralhos'), ir('Vocabulário', 'letras', 'anki/vocabulario'),
      ir('Ajustes de envio', 'ajustes', 'anki/ajustes'), ir('Configurações', 'engrenagem', 'configuracoes'), ir('Conta & sync', 'pessoa', 'configuracoes/conta'), ir('Atalhos', 'teclado', 'configuracoes/atalhos'),
      ir('IA dos cartões', 'brilho', 'configuracoes/ia'), ir('Chave do Gemini', 'chave', 'configuracoes/chave'), ir('Aparência', 'tema', 'configuracoes/aparencia'), ir('Zona de perigo', 'perigo', 'configuracoes/perigo'), ir('Boas-vindas', 'estrela', 'boas-vindas'),
      { grupo: 'Ações', rotulo: 'Minerar frases: colar', icone: 'colar', acao: () => { PS.ir('frases'); setTimeout(() => A['frases.minerar']({ dataset: { valor: 'colar' } }), 0); } },
      { grupo: 'Ações', rotulo: 'Minerar frases: arquivo .txt', icone: 'arquivo', acao: () => { PS.ir('frases'); setTimeout(() => A['frases.minerar']({ dataset: { valor: 'arquivo' } }), 0); } },
      { grupo: 'Ações', rotulo: PS.estado.tema === 'escuro' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro', icone: 'tema', acao: A['casca.tema'] },
      { grupo: 'Ações', rotulo: 'Recolher ou abrir a lateral', icone: 'painel', atalho: 'Ctrl B', acao: A['casca.lateral'] },
      ...d.frases.map(frase => ({ grupo: 'Frases', rotulo: frase.texto, icone: 'frases', soNaBusca: true, acao: () => { Object.assign(PS.frases, { busca: frase.texto, pagina: 1, fonte: '', idioma: '' }); PS.ir('frases'); } })),
    ];
  }
  function listaDeComandos(termo) {
    const alvo = semAcento(termo.trim());
    const achados = comandos().filter(c => (alvo ? semAcento(c.rotulo).includes(alvo) : !c.soNaBusca));
    if (!achados.length) return { html: '<p class="comando__vazio">Nada encontrado.</p>', achados };
    let html = '';
    let grupo = '';
    achados.forEach((c, i) => {
      if (c.grupo !== grupo) { html += `${grupo ? '</div>' : ''}<div class="comando__grupo" role="group" aria-label="${c.grupo}"><div class="comando__titulo">${c.grupo}</div>`; grupo = c.grupo; }
      html += `<button type="button" class="comando__item" role="option" id="comando-${i}" aria-selected="${i === 0}" tabindex="-1" data-i="${i}">${ic(c.icone)}<span>${esc(c.rotulo)}</span>${c.atalho ? `<span class="menu__atalho">${c.atalho}</span>` : ''}</button>`;
    });
    return { html: `${html}</div>`, achados };
  }
  A['casca.comando'] = () => {
    let achados = [];
    let marcado = 0;
    const el = PS.abrirCamada({
      tipo: 'comando', rotulo: 'Buscar e ir para',
      conteudo: `<label class="campo-com-icone comando__busca">${ic('busca')}<input class="campo" id="comando-campo" placeholder="Buscar uma tela, uma ação ou uma frase…" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="comando-lista" aria-label="Buscar uma tela, uma ação ou uma frase" data-foco-inicial></label>`
        + `<div class="comando__lista" id="comando-lista" role="listbox" aria-label="Resultados"></div><div class="comando__pe"><span><kbd class="tecla">↑</kbd> <kbd class="tecla">↓</kbd> andar</span><span><kbd class="tecla">Enter</kbd> abrir</span><span><kbd class="tecla">Esc</kbd> fechar</span></div>`,
    });
    const campo = el.querySelector('#comando-campo');
    const lista = el.querySelector('#comando-lista');
    const marcar = i => {
      marcado = (i + achados.length) % Math.max(1, achados.length);
      lista.querySelectorAll('.comando__item').forEach((item, n) => { item.setAttribute('aria-selected', n === marcado); if (n === marcado) { item.scrollIntoView({ block: 'nearest' }); campo.setAttribute('aria-activedescendant', item.id); } });
    };
    const desenhar = () => { const r = listaDeComandos(campo.value); achados = r.achados; lista.innerHTML = r.html; marcar(0); };
    const rodar = i => { const comando = achados[i]; if (!comando) return; PS.fecharCamada(); comando.acao(); };
    campo.addEventListener('input', desenhar);
    campo.addEventListener('keydown', evento => {
      if (evento.key === 'ArrowDown') { evento.preventDefault(); marcar(marcado + 1); }
      else if (evento.key === 'ArrowUp') { evento.preventDefault(); marcar(marcado - 1); }
      else if (evento.key === 'Enter') { evento.preventDefault(); rodar(marcado); }
    });
    lista.addEventListener('click', evento => { const item = evento.target.closest('.comando__item'); if (item) rodar(Number(item.dataset.i)); });
    lista.addEventListener('mousemove', evento => { const item = evento.target.closest('.comando__item'); if (item && Number(item.dataset.i) !== marcado) marcar(Number(item.dataset.i)); });
    desenhar();
  };

  // ---------- A moldura do protótipo ----------
  const SITUACOES = [['normal', 'Normal'], ['vazio', 'Vazio'], ['carregando', 'Carregando'], ['erro', 'Erro'], ['desligada', 'Conexão desligada'], ['primeira', 'Primeira conexão']];
  function moldura() {
    return `<aside class="moldura" id="moldura" aria-label="Controles do protótipo (não fazem parte do painel)"><span class="moldura__nome">Protótipo</span><span id="moldura-direcao"></span>`
      + `<label class="moldura__campo"><span>Estado</span>${pecas.selecao({ id: 'moldura-estado', rotulo: 'Estado da tela', valor: PS.estado.estado, acao: 'moldura.estado', opcoes: SITUACOES })}</label>`
      + `<span id="moldura-cor"></span><button type="button" class="botao botao--fantasma botao--icone botao--p" id="moldura-tema" data-acao="casca.tema" aria-label="Alternar o tema" data-dica="Tema" data-dica-tecla="T"></button>`
      + `<button type="button" class="botao botao--fantasma botao--p" data-acao="moldura.sobre" data-dica="O que é cada direção">${ic('info')}Sobre</button>`
      + `<button type="button" class="botao botao--fantasma botao--icone botao--p" data-acao="moldura.esconder" aria-label="Esconder os controles do protótipo" data-dica="Esconder" data-dica-tecla="M">${ic('fechar')}</button></aside>`
      + `<button type="button" class="botao botao--contorno botao--p moldura-volta" data-acao="moldura.esconder" data-dica="Mostrar os controles do protótipo" data-dica-tecla="M">${ic('ajustes')}Protótipo</button>`;
  }
  function atualizarMoldura() {
    document.getElementById('moldura-direcao').innerHTML = pecas.escolha({ rotulo: 'Direção do desenho', valor: PS.estado.d, acao: 'moldura.direcao', chave: 'direcao', classe: 'escolha--p', opcoes: [['a', 'A · shadcn fiel ★'], ['b', 'B · Densa']] });
    document.getElementById('moldura-cor').innerHTML = pecas.escolha({ rotulo: 'Cor de destaque', valor: PS.estado.cor, acao: 'moldura.cor', chave: 'cor', classe: 'escolha--p', opcoes: [['neutro', 'Neutro'], ['ouro', 'Ouro']] });
    document.getElementById('moldura-estado').value = PS.estado.estado;
    document.getElementById('moldura-tema').innerHTML = ic(PS.estado.tema === 'escuro' ? 'sol' : 'lua');
  }
  A['moldura.direcao'] = botao => PS.mudar({ d: botao.dataset.valor });
  A['moldura.cor'] = botao => PS.mudar({ cor: botao.dataset.valor });
  A['moldura.estado'] = campo => PS.mudar({ estado: campo.value });
  A['moldura.esconder'] = () => PS.mudar({ moldura: PS.estado.moldura === '1' ? '0' : '1' }, { redesenhar: false });
  A['moldura.sobre'] = () => PS.abrirCamada({
    rotulo: 'Sobre este protótipo', classe: 'dialogo--largo',
    conteudo: PS.dialogo({
      titulo: 'Sobre este protótipo',
      descricao: 'O painel do PerpetualMiner refeito com os componentes e os tokens do shadcn/ui. É um protótipo solto: os dados são de exemplo e nada é gravado.',
      corpo: `<div class="item item--contorno"><div class="item__conteudo"><p class="rotulo">A · shadcn fiel ★ <span class="selo selo--secundario">recomendada</span></p><p class="item__descricao">As mesmas telas e o mesmo caminho do painel de hoje, com as peças do shadcn: frases em cartões, lista e detalhe lado a lado, Configurações que abrem no lugar. Escolher a Palavra continua a um clique, na própria frase.</p></div></div>`
        + `<div class="item item--contorno"><div class="item__conteudo"><p class="rotulo">B · Densa</p><p class="item__descricao">Tudo em tabelas: mais frases, envios e itens por tela, com o detalhe numa gaveta. Ganha quem tem centenas de frases; perde o clique direto na palavra, que passa para a gaveta.</p></div></div>`
        + `<dl class="pares"><div><dt>Trocar de direção</dt><dd><kbd class="tecla">1</kbd> <kbd class="tecla">2</kbd></dd></div><div><dt>Tema claro ou escuro</dt><dd><kbd class="tecla">T</kbd></dd></div><div><dt>Buscar e ir para</dt><dd><kbd class="tecla">Ctrl K</kbd></dd></div><div><dt>Recolher a lateral</dt><dd><kbd class="tecla">Ctrl B</kbd></dd></div><div><dt>Esconder estes controles</dt><dd><kbd class="tecla">M</kbd></dd></div></dl>`
        + `<p class="campo-ajuda">Os nomes e os valores dos tokens foram estudados em ui.shadcn.com (shadcn/ui, licença MIT). O código daqui é HTML, CSS e JavaScript próprios, sem nada de fora.</p>`,
      pe: '<button type="button" class="botao" data-acao="camada.fechar" data-foco-inicial>Entendi</button>',
    }),
  });

  // ---------- Atalhos do teclado ----------
  document.addEventListener('keydown', evento => {
    const comando = evento.ctrlKey || evento.metaKey;
    if (comando && evento.key.toLowerCase() === 'k') { evento.preventDefault(); A['casca.comando'](); return; }
    if (comando && evento.key.toLowerCase() === 'b') { evento.preventDefault(); A['casca.lateral'](); return; }
    if (comando || evento.altKey || PS.cfg.visao.gravando) return;
    if (evento.target.closest('input, textarea, select, [contenteditable]') || PS.camadaAberta()) return;
    if (evento.key === '1') PS.mudar({ d: 'a' });
    else if (evento.key === '2') PS.mudar({ d: 'b' });
    else if (evento.key.toLowerCase() === 't') A['casca.tema']();
    else if (evento.key.toLowerCase() === 'm') A['moldura.esconder']();
  });

  PS.casca.montar();
  PS.aoComecar();
  PS.desenhar();
})(window.PS);
