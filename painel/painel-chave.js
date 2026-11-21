'use strict';

(function (raiz) {
  const { textoDaVoz } = raiz;
  const { mostrarToastDeSucesso, elemento } = raiz.Veio;
  const porId = id => document.getElementById(id);

  const estado = {
    chave: null,
    focarAoLer: false,
  };

  const lugares = [];
  let configuracoes = null;

  function iniciar() {
    configuracoes = montar(porId('cfg-chave-corpo'), { prefixo: 'cfg' });
    chrome.storage.local.get({ geminiApiKey: '' }, lerAChaveGuardada);
    chrome.storage.onChanged.addListener(seguirAChaveGuardada);
    raiz.Shell.aoAbrirASecao('chave', focarOCampoSeVazia);
  }

  function lerAChaveGuardada(dados) {
    estado.chave = dados.geminiApiKey || '';
    lugares.forEach(desenhar);
    if (estado.focarAoLer) focarOCampoSeVazia();
  }

  const mudouAChaveDoGemini = (mudancas, area) => area === 'local' && 'geminiApiKey' in mudancas;

  function seguirAChaveGuardada(mudancas, area) {
    if (!mudouAChaveDoGemini(mudancas, area)) return;
    const nova = mudancas.geminiApiKey.newValue || '';
    if (nova === estado.chave) return;
    estado.chave = nova;
    desenharOsQueNaoEstaoTrocando();
  }

  function desenharOsQueNaoEstaoTrocando() {
    for (const lugar of lugares) if (!lugar.trocando) desenhar(lugar);
  }

  function montar(corpo, { prefixo }) {
    const lugar = { corpo, prefixo, trocando: false };
    lugares.push(lugar);
    if (estado.chave !== null) desenhar(lugar);
    return lugar;
  }

  function focarOCampoSeVazia() {
    if (estado.chave === null) {
      estado.focarAoLer = true;
      return;
    }
    if (!estado.chave) porId(idDe(configuracoes, 'campo'))?.focus();
  }

  const idDe = (lugar, parte) => `${lugar.prefixo}-chave-${parte}`;

  function desenhar(lugar) {
    if (estado.chave && !lugar.trocando) lugar.corpo.replaceChildren(chaveSalva(lugar));
    else lugar.corpo.replaceChildren(...campoDaChave(lugar));
  }

  function chaveSalva(lugar) {
    const ponto = elemento('span', 'cfg-ponto');
    ponto.dataset.estado = 'ok';
    ponto.setAttribute('aria-hidden', 'true');
    const trocar = botao('contorno', textoDaVoz('CFG-15.trocar'), () => {
      lugar.trocando = true;
      desenhar(lugar);
      porId(idDe(lugar, 'campo')).focus();
    });
    trocar.id = idDe(lugar, 'trocar');

    return elemento('div', 'cfg-linha',
      elemento('div', 'cfg-quem',
        elemento('span', 'cfg-status', ponto, textoDaVoz('CFG-15.salva')),
        elemento('span', 'cfg-chave-mascarada cfg-chave-mascarada--card', raiz.Shell.mascararChave(estado.chave))),
      elemento('div', 'cfg-acoes', trocar));
  }

  function campoDaChave(lugar) {
    const campo = elemento('input', 'veio-campo cfg-chave-campo');
    campo.id = idDe(lugar, 'campo');
    campo.type = 'text';
    campo.autocomplete = 'off';
    campo.spellcheck = false;
    campo.placeholder = textoDaVoz('CFG-15.campo');
    campo.setAttribute('aria-label', textoDaVoz('CFG-15.titulo'));

    const erro = elemento('p', 'veio-campo-erro', textoDaVoz('CFG-16.vazia'));
    erro.id = idDe(lugar, 'erro');
    erro.hidden = true;
    campo.addEventListener('input', () => marcarVazia(campo, erro, false));

    const salvar = elemento('button', `veio-botao veio-botao--${estado.chave ? 'secundario' : 'primario'}`,
      textoDaVoz('CFG-15.salvar'));
    salvar.type = 'submit';
    const acoes = elemento('div', 'cfg-acoes', salvar);
    if (lugar.trocando) {
      acoes.append(botao('fantasma', textoDaVoz('CFG-15.cancelar'), () => {
        lugar.trocando = false;
        desenhar(lugar);
        porId(idDe(lugar, 'trocar')).focus();
      }));
    }

    const formulario = elemento('form', 'cfg-chave-form',
      elemento('div', 'cfg-chave-entrada', campo, erro), acoes);
    formulario.noValidate = true;
    formulario.addEventListener('submit', evento => {
      evento.preventDefault();
      salvarChave(lugar, campo, erro);
    });

    const partes = [formulario];
    if (!estado.chave) partes.push(elemento('p', 'cfg-nota', textoDaVoz('CFG-15.semChave')));
    return partes;
  }

  function marcarVazia(campo, aviso, vazia) {
    aviso.hidden = !vazia;
    if (vazia) {
      campo.setAttribute('aria-invalid', 'true');
      campo.setAttribute('aria-describedby', aviso.id);
    } else {
      campo.removeAttribute('aria-invalid');
      campo.removeAttribute('aria-describedby');
    }
  }

  function salvarChave(lugar, campo, erro) {
    const chave = campo.value.trim();
    if (!chave) {
      marcarVazia(campo, erro, true);
      campo.focus();
      return;
    }
    chrome.storage.local.set({ geminiApiKey: chave }, () => {
      estado.chave = chave;
      lugar.trocando = false;
      desenharOsQueNaoEstaoTrocando();
      porId(idDe(lugar, 'trocar')).focus();
      mostrarToastDeSucesso(textoDaVoz('CFG-16.salva'));
    });
  }

  function botao(variante, rotulo, aoUsar) {
    const b = elemento('button', `veio-botao veio-botao--${variante}`, rotulo);
    b.type = 'button';
    b.addEventListener('click', aoUsar);
    return b;
  }

  document.addEventListener('DOMContentLoaded', iniciar);

  raiz.ChaveDoGemini = { montar };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
