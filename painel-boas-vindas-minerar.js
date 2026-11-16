'use strict';

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

  function montar({ aoDefinirAtalho }) {
    const paragrafoDoVideo = elemento('p', 'bv-texto');
    let atalhoDesenhado;
    let minerando = false;
    const selecao = elemento('p', 'bv-texto', textoDaVoz('ONB-05.selecao'));

    const legenda = elemento('span', 'bv-ilustracao__legenda');
    Veio.escreverFrase(legenda, textoDaVoz('ONB-05.exemplo'), textoDaVoz('ONB-05.exemploPalavra'));
    const ilustracao = elemento('div', 'bv-ilustracao', legenda,
      Veio.montarChipDaPalavra(textoDaVoz('ONB-05.exemploPalavra')));
    ilustracao.setAttribute('aria-hidden', 'true');
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
        minerando = false;
        campo.value = '';
        limparErro(campo, erro);
      }, () => {
        minerando = false;
        erro.replaceChildren(elemento('p', 'bv-falha', Veio.iconeVeio('alerta'), textoDaVoz('POP-06')));
        campo.setAttribute('aria-invalid', 'true');
      });
    }

    function desenhar(atalhos) {
      const rotulo = Atalhos.rotuloDoAtalho(atalhos[Atalhos.ACOES.LEGENDA]);
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
