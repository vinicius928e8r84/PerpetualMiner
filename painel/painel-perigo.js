'use strict';

(function (raiz) {
  const { textoDaVoz, ChaveDaOpenAI, ConexaoAnki } = raiz;
  const { abrirConfirmacao, montarAviso, elemento, botao } = raiz.Veio;
  const porId = id => document.getElementById(id);

  const estado = { n: null, ids: [], comConta: false, temChave: false, contaDaChave: '', uid: '' };

  function guardarAChave(marca) {
    estado.temChave = Boolean(marca?.ultimos4);
    estado.contaDaChave = marca?.conta || '';
  }

  const uidDaConta = info => info?.uid || '';

  chrome.storage.local.get({ [ChaveDaOpenAI.MARCA]: null, pm_user_info: null }, dados => {
    guardarAChave(dados[ChaveDaOpenAI.MARCA]);
    estado.uid = uidDaConta(dados.pm_user_info);
  });
  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area !== 'local') return;
    if (ChaveDaOpenAI.MARCA in mudancas) guardarAChave(mudancas[ChaveDaOpenAI.MARCA].newValue);
    if ('pm_user_info' in mudancas) estado.uid = uidDaConta(mudancas.pm_user_info.newValue);
  });
  let avisoDaRecusa = null;
  const tirarARecusa = () => {
    avisoDaRecusa?.remove();
    avisoDaRecusa = null;
  };
  ConexaoAnki.acompanhar(situacao => {
    if (situacao === ConexaoAnki.SITUACAO.LIGADA) tirarARecusa();
  });
  let apagarTudo = () => {};
  let partes = null;

  function mostrarFrases(frases) {
    estado.n = frases.length;
    estado.ids = frases.map(frase => frase.id);
    desenhar();
  }

  function mostrarConta(comConta) {
    estado.comConta = Boolean(comConta);
    desenhar();
  }

  function aoApagarTudo(apagar) {
    apagarTudo = apagar;
  }

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

  async function apagarSeAConexaoResponde(confirmado) {
    tirarARecusa();
    if (await ConexaoAnki.conferir() !== ConexaoAnki.SITUACAO.DESLIGADA) return apagarTudo(confirmado);
    avisoDaRecusa = montarAviso({
      texto: textoDaVoz('CFG-17.conexaoNaoResponde'),
      acao: { rotulo: textoDaVoz('CFG-35.erroTentarDeNovo'), aoUsar: () => apagarSeAConexaoResponde(confirmado) },
      detalhes: 'anki_connection_unreachable',
      fechavel: false,
    });
    porId('cfg-perigo-corpo').append(avisoDaRecusa);
  }

  function vozDaChave(comConta) {
    if (!comConta) return 'CFG-17.chaveSemConta';
    const outraConta = estado.contaDaChave && estado.contaDaChave !== estado.uid;
    return outraConta ? 'CFG-17.chaveOutraConta' : 'CFG-17.chave';
  }

  function confirmarApagarTudo() {
    const { n, comConta } = estado;
    if (!estado.n) return;

    const confirmado = { ids: estado.ids, em: Date.now() };
    abrirConfirmacao({
      id: 'cfg-perigo-modal',
      titulo: n === 1 ? textoDaVoz('CFG-17.tituloUma') : textoDaVoz('CFG-17.titulo', { n }),
      corpo: [
        textoDaVoz(comConta ? 'CFG-17.corpo' : 'CFG-17.corpoSemConta'),
        ...(estado.temChave ? [textoDaVoz(vozDaChave(comConta))] : []),
      ].join(' '),
      cancelar: textoDaVoz('CFG-17.cancelar'),
      confirmar: textoDaVoz('CFG-17.confirmar', { n }),
      aoConfirmar: () => apagarSeAConexaoResponde(confirmado),
    });
  }

  raiz.Perigo = {
    aoApagarTudo,
    mostrarConta,
    mostrarFrases,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
