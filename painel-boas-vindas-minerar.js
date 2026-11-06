'use strict';

// O passo 1 da Boas-vindas (ONB-05): como minerar a primeira frase, com o atalho de legenda gravado, a ilustração de uma legenda marcada e a mineração
// rápida do popup (`lib/mineracao.js`; sucesso é silêncio, POP-05; falha é POP-06 sob o campo, com o texto mantido). Está à parte de
// `painel-boas-vindas.js` (que o monta) só pelo limite de tamanho dos arquivos.

(function (raiz) {
  const { textoDaVoz, Atalhos, Veio, minerarFraseManual } = raiz;

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  function limparErro(campo, erro) {
    erro.replaceChildren();
    campo.removeAttribute('aria-invalid');
  }

  /** O corpo do passo; `aoDefinirAtalho` leva ao passo do atalho. Devolve `{ no, desenhar(atalhos) }`. */
  function montar({ aoDefinirAtalho }) {
    const paragrafoDoVideo = elemento('p', 'bv-texto');
    let atalhoDesenhado;   // o rótulo que está no parágrafo, para não refazê-lo à toa
    let minerando = false;
    const selecao = elemento('p', 'bv-texto', textoDaVoz('ONB-05.selecao'));

    // A legenda marcada, parada: a linha ouro, a Palavra grifada e o chip.
    const legenda = elemento('span', 'bv-ilustracao__legenda');
    Veio.escreverFrase(legenda, textoDaVoz('ONB-05.exemplo'), textoDaVoz('ONB-05.exemploPalavra'));
    const ilustracao = elemento('div', 'bv-ilustracao', legenda,
      Veio.montarChipDaPalavra(textoDaVoz('ONB-05.exemploPalavra')));
    ilustracao.setAttribute('aria-hidden', 'true');
    // Uma tela de vídeo: escura nos dois temas, como o overlay.
    ilustracao.dataset.tema = 'escuro';

    const campo = elemento('input', 'veio-campo');
    campo.type = 'text';
    campo.id = 'bv-frase-rapida';
    campo.autocomplete = 'off';
    campo.placeholder = textoDaVoz('POP-03');
    campo.setAttribute('aria-label', textoDaVoz('POP-03'));
    campo.setAttribute('aria-describedby', 'bv-erro-rapida');
    const botao = elemento('button', 'veio-botao veio-botao--secundario', textoDaVoz('POP-04'));
    botao.type = 'submit';
    const erro = elemento('div', 'bv-rapida__erro');
    erro.id = 'bv-erro-rapida';
    erro.setAttribute('role', 'alert');

    const formulario = elemento('form', 'bv-rapida', elemento('div', 'bv-rapida__campo', campo, botao), erro);
    formulario.noValidate = true;
    formulario.addEventListener('submit', evento => {
      evento.preventDefault();
      minerarFraseRapida();
    });
    campo.addEventListener('input', () => limparErro(campo, erro));

    function minerarFraseRapida() {
      const texto = campo.value.trim();
      if (!texto || minerando) return;
      minerando = true;
      minerarFraseManual(texto).then(() => {
        // POP-05: sem texto. O campo limpa e o passo fica feito pelo histórico.
        minerando = false;
        campo.value = '';
        limparErro(campo, erro);
      }, () => {
        // POP-06: o texto fica no campo, para tentar de novo.
        minerando = false;
        erro.replaceChildren(elemento('p', 'bv-falha', Veio.iconeVeio('alerta'), textoDaVoz('POP-06')));
        campo.setAttribute('aria-invalid', 'true');
      });
    }

    /** “Num vídeo com legenda, aperte [Alt+S]. …”, com o atalho gravado num `kbd`; sem atalho, “Sem atalho” e Definir atalho (o passo 2). */
    function desenhar(atalhos) {
      const rotulo = Atalhos.rotuloDoAtalho(atalhos[Atalhos.ACOES.LEGENDA]);
      // Só refaz quando o atalho muda: refazer o parágrafo tiraria o foco do Definir atalho.
      if (rotulo === atalhoDesenhado) return;
      atalhoDesenhado = rotulo;
      const marcador = '\u0000';
      const [antes, depois] = textoDaVoz('ONB-05.video', { atalho: marcador }).split(marcador);
      const partes = [antes, Veio.montarTecla(rotulo, { seVazia: textoDaVoz('GLB-02.semAtalho') }), depois];
      if (!rotulo) {
        const definir = elemento('button', 'veio-botao veio-botao--link', textoDaVoz('GLB-02.definir'));
        definir.type = 'button';
        definir.addEventListener('click', aoDefinirAtalho);
        partes.push(' ', definir);
      }
      paragrafoDoVideo.replaceChildren(...partes);
    }

    const controle = elemento('div', 'bv-controle', elemento('p', 'bv-nota', textoDaVoz('ONB-05.colar')), formulario);
    return { no: elemento('div', null, paragrafoDoVideo, selecao, ilustracao, controle), desenhar };
  }

  raiz.PassoDeMinerar = Object.freeze({ montar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
