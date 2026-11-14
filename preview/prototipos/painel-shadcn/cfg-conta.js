'use strict';

// Configurações, a conta e os atalhos: Conta & sync (CFG-01 a CFG-10, CFG-23 a CFG-27) e Atalhos, com o gravador de
// verdade (CFG-11 a CFG-14, CFG-19 a CFG-22, CFG-33, CFG-34). `PS.cfg` guarda o que os outros cartões e a
// Boas-vindas usam de novo.

(function (PS) {
  const { esc, ic, pecas, plural } = PS;
  const d = PS.dados;
  const visao = { abertos: new Set(), gravando: null, erroDoAtalho: '', conta: 'parada', openai: 'vazia', erroDaOpenai: '', chatgpt: 'fora', geminiTrocando: false, erroDoGemini: '' };
  const ACOES_DOS_ATALHOS = { legenda: ['Minerar legenda', 'Minera a legenda que está na tela do vídeo.'], selecao: ['Minerar seleção', 'Minera o texto que você selecionou na página.'] };   // CFG-11, CFG-34
  const mascara = (chave, inicio = 4) => `${chave.slice(0, inicio)}••••••••${chave.slice(-4)}`;
  const semConexao = () => ['desligada', 'primeira'].includes(PS.estado.estado);
  const totalDeFrases = () => (PS.estado.estado === 'vazio' ? 0 : d.frases.length);

  // ---------- Conta & sync ----------
  function estadoDaConta() {
    if (!d.conta.entrou) return { texto: 'Sem conta · só neste computador', ponto: '' };   // SHL-05
    if (PS.estado.estado === 'erro') return { texto: `${d.CONTA.nome} · Sem sincronizar`, ponto: 'perigo' };
    return { texto: `${d.CONTA.nome} · Sincronizado agora`, ponto: 'sucesso' };   // CFG-27, CFG-02
  }
  function corpoDaConta() {
    if (!d.conta.entrou) {
      const falhou = visao.conta === 'falhou' ? pecas.alerta({ tipo: 'perigo', icone: 'erro-circulo', papel: 'alert', titulo: 'Não deu para entrar com o Google. Tente de novo.' }) : '';   // CFG-07
      return `${falhou}<div class="linha-ajuste"><div><p class="rotulo">Suas frases em qualquer computador</p><p class="campo-ajuda">Sem conta, elas ficam só neste computador.</p></div>`
        + `<button type="button" class="botao" data-acao="cfg.entrar" data-foco="cfg-entrar" aria-busy="${visao.conta === 'entrando'}">${ic(visao.conta === 'entrando' ? 'carregando' : 'pessoa')}${visao.conta === 'entrando' ? `Sincronizando ${totalDeFrases()} frases…` : 'Entrar com Google'}</button></div>`;   // CFG-06, CFG-09
    }
    const semSincronizar = PS.estado.estado === 'erro';
    return `${semSincronizar ? pecas.alerta({ tipo: 'perigo', icone: 'nuvem-fora', papel: 'alert', titulo: 'Sem sincronizar · as frases estão só neste computador', texto: 'As mudanças deste computador ainda não subiram para a nuvem.', acoes: '<button type="button" class="botao botao--contorno botao--p" data-acao="frases.tentarSincronizar">Tentar de novo</button>' }) : ''}`   // CFG-03
      + `<div class="linha-ajuste"><div class="conta"><span class="avatar avatar--conta avatar--g">${d.CONTA.nome[0]}</span><div><p class="rotulo">${d.CONTA.nome}</p><p class="com-controle campo-ajuda"><span class="ponto ponto--${semSincronizar ? 'perigo' : 'sucesso'}"></span>${semSincronizar ? 'Sem sincronizar' : 'Sincronizado agora'}</p></div></div>`
      + `<button type="button" class="botao botao--contorno" data-acao="cfg.sair" data-foco="cfg-sair">${ic('sair')}Sair da conta</button></div><p class="campo-ajuda">Ao sair, as frases continuam neste computador.</p>`;   // CFG-23, CFG-26
  }

  // ---------- Atalhos ----------
  const teclaDe = atalho => (atalho ? `<kbd class="tecla mono">${esc(atalho)}</kbd>` : '<kbd class="tecla tecla--vazia">Sem atalho</kbd>');   // CFG-12
  function linhaDoAtalho(qual) {
    const [nome, ajuda] = ACOES_DOS_ATALHOS[qual];
    const gravando = visao.gravando === qual;
    const controle = gravando
      ? `<span class="gravando" role="status"><span class="ponto ponto--perigo ponto--pulsa"></span>Pressione as teclas ou um botão extra do mouse…</span><button type="button" class="botao botao--contorno botao--p" data-acao="cfg.cancelarGravacao" data-foco="gravar-${qual}">Cancelar</button>`   // CFG-13
      : `${teclaDe(d.atalhos[qual])}<button type="button" class="botao botao--contorno botao--p" data-acao="cfg.gravar" data-valor="${qual}" data-foco="gravar-${qual}">Gravar atalho</button>`;
    return `<div class="linha-ajuste"><div><p class="rotulo">${nome}</p><p class="campo-ajuda">${ajuda}</p>${visao.erroDoAtalho && visao.erroDoAtalho.qual === qual ? `<p class="campo-erro" role="alert">${visao.erroDoAtalho.texto}</p>` : ''}</div><div class="com-acao">${controle}</div></div>`;
  }
  function corpoDosAtalhos() {
    return `${linhaDoAtalho('legenda')}${linhaDoAtalho('selecao')}<div class="linha-ajuste"><p class="campo-ajuda">Padrão: Minerar legenda em Alt+S, Minerar seleção sem atalho.</p><button type="button" class="botao botao--fantasma botao--p" data-acao="cfg.restaurarAtalhos" data-foco="restaurar-atalhos">Restaurar atalhos padrão</button></div>`;   // CFG-22, CFG-21
  }

  /** O gravador de verdade: a próxima combinação de teclas, ou botão extra do mouse, vira o atalho. */
  function nomeDoAtalho(evento) {
    const partes = [];
    if (evento.ctrlKey) partes.push('Ctrl');
    if (evento.altKey) partes.push('Alt');
    if (evento.shiftKey) partes.push('Shift');
    if (evento.metaKey) partes.push('Meta');
    if (evento.type === 'keydown') {
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(evento.key)) return null;
      partes.push(evento.code.replace(/^Key|^Digit/, '').replace('Space', 'Espaço'));
    } else {
      const botao = { 1: 'Botão do meio', 3: 'Botão voltar', 4: 'Botão avançar' }[evento.button];   // CFG-14
      if (!botao) return null;
      partes.push(botao);
    }
    return partes.join('+');
  }
  function ouvirAtalho(evento) {
    if (!visao.gravando) return;
    if (evento.type === 'keydown' && evento.key === 'Escape') { evento.preventDefault(); evento.stopPropagation(); PS.acoes['cfg.cancelarGravacao'](); return; }
    if (evento.type === 'keydown' && evento.key === 'Tab') return;
    const nome = nomeDoAtalho(evento);
    if (!nome) return;
    evento.preventDefault();
    evento.stopPropagation();
    const qual = visao.gravando;
    const outro = qual === 'legenda' ? 'selecao' : 'legenda';
    if (d.atalhos[outro] === nome) {
      visao.erroDoAtalho = { qual, texto: `Esse atalho já é do ${ACOES_DOS_ATALHOS[outro][0]}. Grave outro.` };   // CFG-19
    } else {
      d.atalhos[qual] = nome;
      visao.erroDoAtalho = '';
      visao.gravando = null;
    }
    PS.desenhar();
  }
  document.addEventListener('keydown', ouvirAtalho, true);
  document.addEventListener('mousedown', ouvirAtalho, true);
  document.addEventListener('auxclick', evento => { if (visao.gravando) evento.preventDefault(); }, true);

  const A = PS.acoes;
  A['cfg.entrar'] = () => {
    if (visao.conta === 'entrando') return;
    visao.conta = 'entrando';
    PS.desenhar();
    setTimeout(() => { visao.conta = 'parada'; d.conta.entrou = true; PS.desenhar(); PS.avisar(`${totalDeFrases()} ${plural(totalDeFrases(), 'frase sincronizada', 'frases sincronizadas')}`); }, 1200);
  };
  A['cfg.sair'] = () => { d.conta.entrou = false; PS.desenhar(); };
  A['cfg.gravar'] = botao => { visao.gravando = botao.dataset.valor; visao.erroDoAtalho = ''; PS.desenhar(); };
  A['cfg.cancelarGravacao'] = () => { visao.gravando = null; visao.erroDoAtalho = ''; PS.desenhar(); };
  A['cfg.restaurarAtalhos'] = () => { d.atalhos = { legenda: 'Alt+S', selecao: '' }; visao.gravando = null; visao.erroDoAtalho = ''; PS.desenhar(); };

  PS.cfg = { visao, mascara, semConexao, totalDeFrases, teclaDe, estadoDaConta, corpoDaConta, corpoDosAtalhos, linhaDoAtalho };
})(window.PS);
