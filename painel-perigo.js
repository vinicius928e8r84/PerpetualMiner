'use strict';

// O card Zona de perigo de Configurações (docs/design/painel/configuracoes/):
// apagar todas as frases.
//
// O botão de perigo em contorno é só a entrada: ele abre o modal Veio (CFG-17),
// com o foco inicial em Cancelar, e quem apaga é o botão de perigo preenchido
// lá dentro. Nunca o confirm() do navegador. O alcance que a tela promete muda
// com a conta: com ela, as frases somem de todos os computadores da conta; sem
// ela, só deste. Sem frases, a entrada fica indisponível (CFG-20). Enquanto o
// total não chega, a linha fica escondida: nunca um “Nenhuma frase” de mentira.
// Com uma chave da OpenAI guardada, o modal diz que ela também sai (#154): quem
// a apaga é o painel.js, pelo lib/chave-da-openai.js.
//
// O painel.js conta o que muda e faz o apagamento:
//
//   Perigo.mostrarTotal(n)
//   Perigo.mostrarConta(comConta)
//   Perigo.aoApagarTudo(apagar)   roda depois que a pessoa confirma no modal
//
// Toda cópia vem do catálogo da Voz.

(function (raiz) {
  const { textoDaVoz, ChaveDaOpenAI } = raiz;
  const { abrirConfirmacao } = raiz.Veio;
  const porId = id => document.getElementById(id);

  const estado = { n: null, comConta: false, temChave: false };   // n: null até o painel.js contar

  // A chave da OpenAI só pelos 4 últimos caracteres (`pm_chave_openai`): basta saber se há uma.
  chrome.storage.local.get({ [ChaveDaOpenAI.MARCA]: null }, dados => {
    estado.temChave = Boolean(dados[ChaveDaOpenAI.MARCA]?.ultimos4);
  });
  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area === 'local' && ChaveDaOpenAI.MARCA in mudancas) estado.temChave = Boolean(mudancas[ChaveDaOpenAI.MARCA].newValue?.ultimos4);
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

  // ─── Card ──────────────────────────────────────────────────────────────────

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

  // ─── Modal ─────────────────────────────────────────────────────────────────

  /** “Apagar todas as 1.284 frases?”, com Cancelar (foco inicial) e o perigo preenchido. */
  function confirmarApagarTudo() {
    const { n, comConta } = estado;
    if (!estado.n) return;

    abrirConfirmacao({
      id: 'cfg-perigo-modal',
      titulo: n === 1 ? textoDaVoz('CFG-17.tituloUma') : textoDaVoz('CFG-17.titulo', { n }),
      corpo: [
        textoDaVoz(comConta ? 'CFG-17.corpo' : 'CFG-17.corpoSemConta'),
        ...(estado.temChave ? [textoDaVoz(comConta ? 'CFG-17.chave' : 'CFG-17.chaveSemConta')] : []),
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
