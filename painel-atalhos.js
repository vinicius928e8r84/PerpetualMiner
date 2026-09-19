'use strict';

// O card Atalhos de Configurações (docs/design/painel/configuracoes/, item 7 da
// lista fechada): “Minerar legenda” e “Minerar seleção”, cada um gravado na
// própria linha, com uma tecla e modificadores ou com um botão extra do mouse.
//
//   Gravar atalho   a tecla da linha vira a pílula ouro (CFG-13) e o botão vira
//                   Cancelar; o botão da outra linha fica indisponível.
//   Esc             sem modificador, cancela.
//   Clique          esquerdo e direito não gravam, então o Cancelar continua
//                   clicável. Voltar e avançar do mouse não navegam enquanto grava.
//   Repetido        a combinação que já é do outro atalho é recusada, com o
//                   aviso na linha (CFG-19); a gravação continua.
//   Gravou          a tecla nova pisca uma vez, sem toast.
//   Restaurar       “Restaurar atalhos padrão” só aparece fora do padrão e grava
//                   {legenda: Alt+S, seleção: nenhum} na hora, sem confirmação.
//
// O que fica gravado, o rótulo em PT-BR e a regra de repetido são de
// lib/atalhos.js, os mesmos que o content script usa. Toda cópia vem do
// catálogo da Voz.

(function (raiz) {
  const { textoDaVoz, Atalhos } = raiz;
  const { ACOES } = Atalhos;

  /** O nome de cada ação (CFG-11) e o que ela faz (CFG-30), pela mesma parte do catálogo. */
  const PARTE_DO_CATALOGO = { [ACOES.LEGENDA]: 'minerarLegenda', [ACOES.SELECAO]: 'minerarSelecao' };

  const estado = {
    atalhos: { legenda: Atalhos.ATALHOS_PADRAO.legenda, selecao: null },
    gravando: null,        // a ação sendo gravada, ou null
    aviso: null,           // { acao, texto } do atalho repetido
    soltarBotao: null,     // o botão do mouse gravado, cuja soltura ainda não pode navegar
  };
  const linhas = new Map();    // ação → { tecla, botao, aviso }
  let restaurar = null;

  function iniciarAtalhos() {
    const corpo = document.getElementById('cfg-atalhos-corpo');
    corpo.append(...Object.values(ACOES).map(montarLinha), montarRestaurar());
    Atalhos.acompanharAtalhos(atalhos => {
      estado.atalhos = atalhos;
      desenhar();
    });
    // Voltar e avançar do mouse navegam na soltura: enquanto grava (e na soltura
    // do botão que acabou de gravar), ela não chega ao navegador.
    for (const tipo of ['mouseup', 'auxclick']) document.addEventListener(tipo, segurarASoltura, true);
  }

  function montarLinha(acao) {
    const parte = PARTE_DO_CATALOGO[acao];
    const idDoNome = `cfg-atalho-${acao}-nome`;

    const nome = elemento('b', 'cfg-atalho__nome', textoDaVoz(`CFG-11.${parte}`));
    nome.id = idDoNome;
    const texto = elemento('div', 'cfg-atalho__texto', nome,
      elemento('span', 'cfg-nota', textoDaVoz(`CFG-30.${parte}`)));

    const tecla = elemento('span', 'cfg-atalho__tecla');
    const botao = elemento('button', 'veio-botao veio-botao--secundario', textoDaVoz('CFG-12.gravar'));
    botao.type = 'button';
    botao.setAttribute('aria-describedby', idDoNome);
    botao.addEventListener('click', () => (estado.gravando === acao ? pararDeGravar() : comecarAGravar(acao)));

    const aviso = elemento('p', 'cfg-atalho__aviso');
    aviso.setAttribute('role', 'alert');
    aviso.hidden = true;

    const linha = elemento('div', 'cfg-atalho', texto, elemento('div', 'cfg-acoes', tecla, botao), aviso);
    linha.setAttribute('role', 'group');
    linha.setAttribute('aria-labelledby', idDoNome);
    linhas.set(acao, { tecla, botao, aviso });
    return linha;
  }

  function montarRestaurar() {
    const botao = elemento('button', 'veio-botao veio-botao--fantasma', textoDaVoz('CFG-21'));
    botao.type = 'button';
    botao.addEventListener('click', restaurarOPadrao);
    restaurar = elemento('div', 'cfg-atalho cfg-atalho--restaurar',
      elemento('span', 'cfg-nota', textoDaVoz('CFG-22')), botao);
    return restaurar;
  }

  // ─── Desenho ───────────────────────────────────────────────────────────────

  function desenhar() {
    for (const [acao, { tecla, botao, aviso }] of linhas) {
      const gravando = estado.gravando === acao;
      tecla.replaceChildren(gravando ? pilulaDeGravacao() : teclaDoAtalho(estado.atalhos[acao]));
      botao.textContent = textoDaVoz(gravando ? 'CFG-12.cancelar' : 'CFG-12.gravar');
      botao.disabled = !!estado.gravando && !gravando;

      const texto = estado.aviso?.acao === acao ? estado.aviso.texto : '';
      aviso.hidden = !texto;
      aviso.textContent = texto;
    }
    restaurar.hidden = Atalhos.estaNoPadrao(estado.atalhos);
    restaurar.querySelector('button').disabled = !!estado.gravando;
  }

  /** A tecla gravada; sem atalho, o `kbd` tracejado “Sem atalho” (CFG-12). */
  function teclaDoAtalho(atalho) {
    if (!atalho) return elemento('kbd', 'veio-kbd veio-kbd--sem-atalho', textoDaVoz('CFG-12.semAtalho'));
    return elemento('kbd', 'veio-kbd', Atalhos.rotuloDoAtalho(atalho));
  }

  function pilulaDeGravacao() {
    const pilula = elemento('span', 'cfg-gravando', textoDaVoz('CFG-13'));
    pilula.setAttribute('role', 'status');
    return pilula;
  }

  /** A tecla nova pisca uma vez (com movimento reduzido, fica parada). */
  function piscarATecla(acao) {
    const kbd = linhas.get(acao).tecla.querySelector('kbd');
    kbd?.classList.add('cfg-atalho__tecla--nova');
  }

  // ─── Gravação ──────────────────────────────────────────────────────────────

  function comecarAGravar(acao) {
    estado.gravando = acao;
    estado.aviso = null;
    desenhar();
    document.addEventListener('keydown', aoGravar, true);
    document.addEventListener('mousedown', aoGravar, true);
  }

  function pararDeGravar() {
    const acao = estado.gravando;
    estado.gravando = null;
    estado.aviso = null;
    document.removeEventListener('keydown', aoGravar, true);
    document.removeEventListener('mousedown', aoGravar, true);
    desenhar();
    return acao;
  }

  function aoGravar(evento) {
    const novo = Atalhos.atalhoDoEvento(evento);
    if (!novo) return;
    evento.preventDefault();
    evento.stopImmediatePropagation();
    if (novo.type === 'mouse') estado.soltarBotao = novo.button;

    const acao = estado.gravando;
    const semModificador = !evento.altKey && !evento.ctrlKey && !evento.shiftKey && !evento.metaKey;
    if (evento.type === 'keydown' && evento.key === 'Escape' && semModificador) {
      pararDeGravar();
      linhas.get(acao).botao.focus();
      return;
    }

    const outra = acao === ACOES.LEGENDA ? ACOES.SELECAO : ACOES.LEGENDA;
    if (Atalhos.mesmoAtalho(novo, estado.atalhos[outra])) {
      estado.aviso = { acao, texto: textoDaVoz('CFG-19', { acao: textoDaVoz(`CFG-11.${PARTE_DO_CATALOGO[outra]}`) }) };
      desenhar();
      return;
    }

    pararDeGravar();
    estado.atalhos = { ...estado.atalhos, [acao]: novo };
    desenhar();
    piscarATecla(acao);
    linhas.get(acao).botao.focus();
    Atalhos.gravarAtalho(acao, novo);
  }

  function segurarASoltura(evento) {
    if (evento.button === 0 || evento.button === 2) return;
    if (!estado.gravando && evento.button !== estado.soltarBotao) return;
    evento.preventDefault();
    evento.stopImmediatePropagation();
    if (evento.type === 'auxclick') estado.soltarBotao = null;
  }

  function restaurarOPadrao() {
    estado.atalhos = { ...Atalhos.ATALHOS_PADRAO };
    desenhar();
    // O botão sumiu com o padrão: o foco vai para o começo do card, não se perde.
    linhas.get(ACOES.LEGENDA).botao.focus();
    Atalhos.restaurarAtalhosPadrao();
  }

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  document.addEventListener('DOMContentLoaded', iniciarAtalhos);
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
