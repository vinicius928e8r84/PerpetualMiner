'use strict';

(function (raiz) {
  const { textoDaVoz, ChaveDaOpenAI } = raiz;
  const { abrirConfirmacao } = raiz.Veio;
  const porId = id => document.getElementById(id);

  const estado = { n: null, comConta: false, temChave: false, contaDaChave: '', uid: '' };   // n: null até o painel.js contar

  // A chave da OpenAI só pelos 4 últimos caracteres (`pm_chave_openai`): basta saber se há uma.
  chrome.storage.local.get({ [ChaveDaOpenAI.MARCA]: null, pm_user_info: null }, dados => {
    estado.temChave = Boolean(dados[ChaveDaOpenAI.MARCA]?.ultimos4);
    estado.contaDaChave = dados[ChaveDaOpenAI.MARCA]?.conta || '';
    estado.uid = dados.pm_user_info?.uid || '';
  });
  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area !== 'local') return;
    if (ChaveDaOpenAI.MARCA in mudancas) {
      estado.temChave = Boolean(mudancas[ChaveDaOpenAI.MARCA].newValue?.ultimos4);
      estado.contaDaChave = mudancas[ChaveDaOpenAI.MARCA].newValue?.conta || '';
    }
    if ('pm_user_info' in mudancas) estado.uid = mudancas.pm_user_info.newValue?.uid || '';
  });
  let apagarTudo = () => {};
  let partes = null;   // o conteúdo do card, montado uma vez e atualizado no lugar

  function mostrarTotal(n) {
    estado.n = n;
    desenhar();
  }

  function mostrarConta(comConta) {
    estado.comConta = Boolean(comConta);
    desenhar();
  }

  function aoApagarTudo(apagar) {
    apagarTudo = apagar;
  }

  /**
   * A entrada é sempre o mesmo botão: o modal devolve o foco a ele quando fecha,
   * então ele não pode ser trocado por outro enquanto isso.
   */
  function montar() {
    const alcance = elemento('span', 'cfg-nota');
    const entrada = botao('veio-botao--perigo');
    entrada.id = 'btn-apagar-tudo';
    entrada.addEventListener('click', confirmarApagarTudo);

    const linha = elemento('div', 'cfg-linha',
      elemento('div', 'cfg-quem', elemento('b', 'cfg-nome', textoDaVoz('CFG-24.rotulo')), alcance),
      elemento('div', 'cfg-acoes', entrada));
    porId('cfg-perigo-corpo').replaceChildren(linha);
    return { linha, alcance, entrada };
  }

  function desenhar() {
    if (!partes) partes = montar();
    const { n, comConta } = estado;

    porId('cfg-perigo-descricao').textContent = textoDaVoz(comConta ? 'CFG-32.descricao' : 'CFG-32.descricaoSemConta');
    partes.linha.hidden = n === null;
    if (n === null) return;

    partes.alcance.textContent = n === 0
      ? textoDaVoz('CFG-24.nenhuma')
      : textoDaVoz(comConta ? 'CFG-24.alcance' : 'CFG-24.alcanceSemConta', { n });

    partes.entrada.disabled = n === 0;
    if (n === 0) partes.entrada.textContent = textoDaVoz('CFG-20');
    else if (n === 1) partes.entrada.textContent = textoDaVoz('CFG-24.uma');
    else partes.entrada.textContent = textoDaVoz('CFG-24.todas', { n });
  }

  /** “Apagar todas as 1.284 frases?”, com Cancelar (foco inicial) e o perigo preenchido. */
  function confirmarApagarTudo() {
    const { n, comConta } = estado;
    if (!estado.n) return;

    const outraConta = comConta && estado.contaDaChave && estado.contaDaChave !== estado.uid;
    abrirConfirmacao({
      id: 'cfg-perigo-modal',
      titulo: n === 1 ? textoDaVoz('CFG-17.tituloUma') : textoDaVoz('CFG-17.titulo', { n }),
      corpo: [
        textoDaVoz(comConta ? 'CFG-17.corpo' : 'CFG-17.corpoSemConta'),
        ...(estado.temChave ? [textoDaVoz(outraConta ? 'CFG-17.chaveOutraConta' : comConta ? 'CFG-17.chave' : 'CFG-17.chaveSemConta')] : []),
      ].join(' '),
      cancelar: textoDaVoz('CFG-17.cancelar'),
      confirmar: textoDaVoz('CFG-17.confirmar', { n }),
      aoConfirmar: () => apagarTudo(),
    });
  }

  function botao(variante, ...filhos) {
    const no = elemento('button', `veio-botao ${variante}`, ...filhos);
    no.type = 'button';
    return no;
  }

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    no.className = classe;
    no.append(...filhos);
    return no;
  }

  raiz.Perigo = {
    aoApagarTudo,
    mostrarConta,
    mostrarTotal,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
