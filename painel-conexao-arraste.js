'use strict';

// O desenho de arrastar o Anki para a pasta Aplicativos, no passo do Mac do Ter o Anki (ONB-25, #238).
// Está à parte porque `painel-conexao-passos.js` não pode crescer (o limite de tamanho dos arquivos).
//
//   PerpetualMiner.DesenhoDoArraste.montar()  -> <figure>
//
// Dois quadros, no mesmo jeito da animação do aviso do Anki (`.pc-animacao`): o ícone do Anki ao lado da
// pasta Aplicativos e o ícone já dentro dela, que se alternam sozinhos (`painel-conexao-arraste.css`). É só imagem
// (aria-hidden): a frase do passo, logo abaixo, é o que o leitor de tela lê.

(function (raiz) {
  const { textoDaVoz } = raiz;

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    no.className = classe;
    no.append(...filhos);
    return no;
  }

  /** Um ícone ou uma pasta, com o nome que o Mac mostra embaixo (o lugar vago de onde o Anki saiu não tem nome). */
  function item(desenho, nome) {
    const no = elemento('span', 'pc-arraste__item', desenho);
    if (nome) no.append(elemento('span', 'pc-arraste__nome', textoDaVoz(nome)));
    return no;
  }

  /** `solto` é o segundo quadro: o Anki já dentro da pasta, que leva a marca de foco da Base. */
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
