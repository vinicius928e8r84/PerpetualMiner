'use strict';

(function (raiz) {
  const { elemento } = raiz.Veio;
  const { textoDaVoz } = raiz;

  function item(desenho, nome) {
    const no = elemento('span', 'pc-arraste__item', desenho);
    if (nome) no.append(elemento('span', 'pc-arraste__nome', textoDaVoz(nome)));
    return no;
  }

  function quadro(solto) {
    const icone = elemento('span', `pc-arraste__icone${solto ? ' pc-arraste__icone--vago' : ''}`);
    const pasta = elemento('span', 'pc-arraste__pasta');
    if (solto) pasta.append(elemento('span', 'pc-arraste__miniatura'));
    const janela = elemento('div', 'pc-arraste__janela',
      item(icone, solto ? null : 'ONB-25.anki'), elemento('span', 'pc-arraste__seta'), item(pasta, 'ONB-25.aplicativos'));
    const no = elemento('div', `pc-arraste__quadro${solto ? ' pc-arraste__quadro--solto' : ''}`, janela);
    no.setAttribute('aria-hidden', 'true');
    return no;
  }

  function montar() {
    return elemento('figure', 'pc-arraste', elemento('div', 'pc-arraste__quadros', quadro(false), quadro(true)));
  }

  raiz.DesenhoDoArraste = { montar };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
