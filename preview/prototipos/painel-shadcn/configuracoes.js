'use strict';

// Configurações, a tela: Conta & sync, Atalhos, IA dos cartões, Chave do Gemini, Conexão com o Anki, Aparência e
// Zona de perigo. Na direção A, "resumo primeiro" como no painel: cada cartão é uma linha com o resumo e abre no
// lugar. Na direção B, tudo aberto, com o índice das seções ao lado. O texto é o do catálogo da Voz (CFG-*, SHL-04).

(function (PS) {
  const { esc, ic, pecas, plural } = PS;
  const d = PS.dados;
  const { visao, mascara, semConexao, totalDeFrases, teclaDe, estadoDaConta, corpoDaConta, corpoDosAtalhos, resumoDaIa, corpoDaIa, corpoDoGemini } = PS.cfg;
  const A = PS.acoes;

  // ---------- Conexão com o Anki ----------
  function corpoDoAnki() {
    const fora = semConexao();
    return `${fora ? '<p class="campo-ajuda">Indisponível: a Conexão com o Anki está desligada. Ligue-a neste computador para mudar isto.</p>' : ''}`   // CFG-38
      + `<div class="linha-ajuste"><div><label class="rotulo" for="cfg-perfil">Perfil do Anki</label><p class="campo-ajuda">Os cartões só entram neste perfil.</p></div>${pecas.selecao({ id: 'cfg-perfil', rotulo: 'Perfil do Anki', valor: d.perfil, acao: 'cfg.perfil', opcoes: [['Usuário 1', 'Usuário 1'], ['Estudos', 'Estudos']] }).replace('<select', `<select ${fora ? 'disabled' : ''}`)}</div>`   // CFG-43
      + `<div class="linha-ajuste"><div><label class="rotulo" for="cfg-abrir-anki">Abrir o Anki com o computador</label><p class="campo-ajuda">O Anki abre quando você liga o computador, e a Conexão com o Anki já fica pronta. A janela dele aparece na tela.</p></div>`
      + `<input type="checkbox" role="switch" class="interruptor" id="cfg-abrir-anki" ${d.abrirComOComputador ? 'checked' : ''} ${fora ? 'disabled' : ''} data-ao-mudar="cfg.abrirComOComputador"></div>`;   // CFG-36
  }

  // ---------- Zona de perigo ----------
  function corpoDoPerigo() {
    const n = totalDeFrases();
    const alcance = n ? `${PS.milhar(n)} ${plural(n, 'frase', 'frases')} ${d.conta.entrou ? 'em todos os computadores da sua conta' : 'neste computador'}` : 'Nenhuma frase no histórico';   // CFG-24
    return `<div class="linha-ajuste"><div><p class="rotulo">Apagar todas as frases</p><p class="campo-ajuda">${alcance}</p></div><button type="button" class="botao botao--perigo" data-acao="cfg.apagarTudo" data-foco="apagar-tudo" ${n ? '' : 'disabled'}>${ic('lixeira')}${n === 1 ? 'Apagar 1 frase' : `Apagar todas as ${PS.milhar(n)} frases`}</button></div>`;
  }


  // ---------- Os cartões ----------
  const CARTOES = [
    { id: 'conta', icone: 'pessoa', titulo: 'Conta & sync', descricao: 'Com a conta, suas frases ficam iguais em qualquer computador em que você entrar.', resumo: estadoDaConta, corpo: corpoDaConta },
    { id: 'atalhos', icone: 'teclado', titulo: 'Atalhos', descricao: 'Vale para qualquer página aberta no Chrome. Grave uma combinação de teclas ou um botão extra do mouse.', resumo: () => ({ html: `<span class="campo-ajuda">Legenda</span> ${teclaDe(d.atalhos.legenda)} <span class="campo-ajuda">Seleção</span> ${teclaDe(d.atalhos.selecao)}` }), corpo: corpoDosAtalhos },
    { id: 'ia', icone: 'brilho', titulo: 'IA dos cartões', descricao: 'Quem escreve o texto dos cartões: a sua chave da OpenAI ou a sua conta do ChatGPT.', resumo: resumoDaIa, corpo: corpoDaIa },
    { id: 'chave', icone: 'chave', titulo: 'Chave do Gemini', descricao: 'Usada para ler fotos.', resumo: () => (d.gemini ? { texto: mascara(d.gemini), mono: true } : { texto: 'Sem chave', ponto: 'perigo', perigo: true }), corpo: corpoDoGemini },
    { id: 'anki', icone: 'tomada', titulo: 'Conexão com o Anki', descricao: 'Só vale neste computador.', resumo: () => ({ texto: semConexao() ? 'Indisponível agora' : d.abrirComOComputador ? 'Abre com o computador' : 'Não abre com o computador' }), corpo: corpoDoAnki },   // CFG-37
    { id: 'aparencia', icone: 'tema', titulo: 'Aparência', descricao: 'Só neste computador.', resumo: () => ({ texto: PS.estado.tema === 'escuro' ? 'Escuro' : 'Claro' }), corpo: () => `<div class="linha-ajuste"><div><p class="rotulo">Tema</p><p class="campo-ajuda">Escuro ou claro.</p></div>${pecas.escolha({ rotulo: 'Tema', valor: PS.estado.tema, acao: 'cfg.tema', chave: 'tema', opcoes: [['escuro', 'Escuro'], ['claro', 'Claro']] })}</div>` },
    { id: 'perigo', icone: 'perigo', titulo: 'Zona de perigo', perigo: true, descricao: () => (d.conta.entrou ? 'Apagar tudo aqui não dá para desfazer, e vale para todos os computadores da sua conta.' : 'Apagar tudo aqui não dá para desfazer.'), resumo: () => { const n = totalDeFrases(); return { texto: n ? `${PS.milhar(n)} ${plural(n, 'frase', 'frases')}` : 'Nenhuma frase' }; }, corpo: corpoDoPerigo },
  ];

  function htmlDoResumo(resumo) {
    if (resumo.html) return resumo.html;
    return `${resumo.ponto ? `<span class="ponto ponto--${resumo.ponto}"></span>` : ''}<span class="${resumo.mono ? 'mono' : ''}" ${resumo.perigo ? 'style="color:var(--perigo-texto);font-weight:500"' : ''}>${esc(resumo.texto)}</span>`;
  }

  function cartao(c, todosAbertos) {
    const aberto = todosAbertos || visao.abertos.has(c.id);
    const descricao = typeof c.descricao === 'function' ? c.descricao() : c.descricao;
    const titulo = todosAbertos ? `<span id="cfg-${c.id}-titulo">${c.titulo}</span>`
      : `<button type="button" class="cfg__alternar" id="cfg-${c.id}-titulo" aria-expanded="${aberto}" aria-controls="cfg-${c.id}-corpo" data-acao="cfg.alternar" data-valor="${c.id}">${c.titulo}</button>`;
    return `<section class="cartao cfg ${c.perigo ? 'cartao--perigo' : ''}" id="cfg-${c.id}" data-aberto="${aberto}" aria-labelledby="cfg-${c.id}-titulo"><div class="cfg__cabeca"><span class="cfg__icone ${c.perigo ? 'cfg__icone--perigo' : ''}">${ic(c.icone)}</span>`
      + `<div class="cfg__titulos"><h2 class="cartao__titulo">${titulo}</h2>${aberto ? `<p class="cartao__descricao">${descricao}</p>` : ''}</div>`
      + `${aberto ? '' : `<span class="cfg__resumo">${htmlDoResumo(c.resumo())}</span>`}${todosAbertos ? '' : `<span class="cfg__seta">${ic(aberto ? 'acima' : 'abaixo')}</span>`}</div>`
      + `${aberto ? `<div class="cfg__corpo" id="cfg-${c.id}-corpo">${c.corpo()}</div>` : ''}</section>`;
  }

  PS.telas.configuracoes = {
    titulo: 'Configurações',
    desenhar(rota) {
      if (rota.sub && CARTOES.some(c => c.id === rota.sub) && PS.telas.configuracoes.ultimo !== rota.sub) { visao.abertos.add(rota.sub); PS.telas.configuracoes.ultimo = rota.sub; }
      const cabeca = '<header class="tela__cabeca"><div><h1 class="tela__titulo" id="titulo-da-tela" tabindex="-1">Configurações</h1><p class="tela__descricao">A conta, os atalhos, as chaves e o que vale só neste computador.</p></div></header>';
      if (PS.estado.estado === 'carregando') return `<div class="tela">${cabeca}<div class="pilha-de-cartoes coluna-estreita" aria-busy="true">${CARTOES.map(() => pecas.esqueleto('100%', '3.75rem')).join('')}</div></div>`;
      if (PS.estado.d === 'b') {
        return `<div class="tela">${cabeca}<div class="cfg-duas"><nav class="cfg-indice" aria-label="Seções das Configurações">${CARTOES.map(c => `<a class="lateral__botao" href="#configuracoes/${c.id}" ${rota.sub === c.id ? 'aria-current="true"' : ''}>${ic(c.icone)}<span>${c.titulo}</span></a>`).join('')}</nav><div class="pilha-de-cartoes">${CARTOES.map(c => cartao(c, true)).join('')}</div></div></div>`;
      }
      return `<div class="tela">${cabeca}<div class="pilha-de-cartoes coluna-estreita">${CARTOES.map(c => cartao(c, false)).join('')}</div></div>`;
    },
    depois(conteudo, rota) {
      if (PS.estado.d === 'b' && rota.sub && PS.telas.configuracoes.rolou !== rota.sub) {
        PS.telas.configuracoes.rolou = rota.sub;
        const alvo = document.getElementById(`cfg-${rota.sub}`);
        if (alvo) alvo.scrollIntoView({ block: 'start' });
      }
    },
  };

  A['cfg.alternar'] = botao => { const id = botao.dataset.valor; if (visao.abertos.has(id)) visao.abertos.delete(id); else visao.abertos.add(id); PS.desenhar(); };
  A['cfg.perfil'] = campo => { d.perfil = campo.value; };
  A['cfg.abrirComOComputador'] = caixa => { d.abrirComOComputador = caixa.checked; };
  A['cfg.tema'] = botao => PS.mudar({ tema: botao.dataset.valor });
  A['cfg.apagarTudo'] = () => {   // CFG-17
    const n = totalDeFrases();
    PS.abrirCamada({
      tipo: 'alerta', rotulo: n === 1 ? 'Apagar 1 frase?' : `Apagar todas as ${n} frases?`,
      conteudo: PS.dialogo({
        semFechar: true, titulo: n === 1 ? 'Apagar 1 frase?' : `Apagar todas as ${n} frases?`,
        descricao: `${d.conta.entrou ? 'Elas somem deste computador e de todos os outros conectados à sua conta. Não dá para desfazer.' : 'Elas somem deste computador.'}${d.openai ? ` ${d.conta.entrou ? 'A chave da OpenAI também sai, da sua conta e da Conexão com o Anki.' : 'A chave da OpenAI também sai da Conexão com o Anki. Nenhuma chave da conta Google é apagada. Ao entrar, a chave da conta pode voltar.'}` : ''}`,
        pe: `<button type="button" class="botao botao--contorno" data-acao="camada.fechar" data-foco-inicial>Cancelar</button><button type="button" class="botao botao--perigo-cheio" data-acao="cfg.confirmarApagarTudo">Apagar ${n} ${plural(n, 'frase', 'frases')}</button>`,
      }),
    });
  };
  A['cfg.confirmarApagarTudo'] = () => { d.frases = []; PS.frases.selecao.clear(); if (d.openai) { d.openai = ''; visao.openai = 'vazia'; } PS.fecharCamada(); PS.desenhar(); PS.avisar('Todas as frases foram apagadas'); };   // CFG-18
})(window.PS);
