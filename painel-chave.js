'use strict';

// O card Chave do Gemini de Configurações (docs/design/painel/configuracoes/).
//
// A chave é a mesma de sempre: `geminiApiKey` no chrome.storage.local, que o
// Minerar de uma foto lê. Salva, ela aparece só mascarada (4 primeiros + 4
// últimos, como no resumo da linha fechada), com Trocar chave; trocar abre o
// campo vazio com Salvar chave e Cancelar, para a chave antiga nunca ir para a
// tela. Vazia, o campo fica aberto. Salvar vazio é recusado no próprio campo
// (CFG-16); salvar — pelo botão ou com Enter — mostra o toast e volta ao resumo.
// A chave não é validada: não há chamada de teste.
//
// #configuracoes/chave com a chave vazia põe o foco no campo: é para lá que o
// “Abrir Configurações” do Minerar de uma foto leva.
//
// O mesmo campo mora no passo 6 da Boas-vindas: `ChaveDoGemini.montar(corpo,
// { prefixo })` desenha o card em outro lugar, com a mesma chave. Cada lugar
// tem o seu Trocar chave aberto ou fechado. Toda cópia vem do catálogo da Voz.

(function (raiz) {
  const { textoDaVoz } = raiz;
  const { mostrarToastDeSucesso } = raiz.Veio;
  const porId = id => document.getElementById(id);

  const estado = {
    chave: null,         // null até a primeira leitura do storage
    focarAoLer: false,   // o endereço pediu o foco antes de a chave ser lida
  };

  /** Onde o card é desenhado: { corpo, prefixo, trocando }. */
  const lugares = [];
  let configuracoes = null;

  function iniciar() {
    configuracoes = montar(porId('cfg-chave-corpo'), { prefixo: 'cfg' });
    chrome.storage.local.get({ geminiApiKey: '' }, dados => {
      estado.chave = dados.geminiApiKey || '';
      lugares.forEach(desenhar);
      if (estado.focarAoLer) focarOCampoSeVazia();
    });
    // Salvar em outro lugar (o Minerar de uma foto, o outro card) aparece aqui
    // sem recarregar. No meio de uma troca a chave nova é guardada sem
    // redesenhar, para não derrubar o que a pessoa está digitando; Cancelar já
    // mostra a chave nova.
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area !== 'local' || !('geminiApiKey' in mudancas)) return;
      const nova = mudancas.geminiApiKey.newValue || '';
      if (nova === estado.chave) return;
      estado.chave = nova;
      for (const lugar of lugares) if (!lugar.trocando) desenhar(lugar);
    });
    raiz.Shell.aoAbrirASecao('chave', focarOCampoSeVazia);
  }

  /** Desenha o card em `corpo`; `prefixo` separa os ids de cada lugar. */
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

  // ─── Desenho ───────────────────────────────────────────────────────────────

  function desenhar(lugar) {
    if (estado.chave && !lugar.trocando) lugar.corpo.replaceChildren(chaveSalva(lugar));
    else lugar.corpo.replaceChildren(...campoDaChave(lugar));
  }

  /** Ponto verde, “Chave salva”, a chave mascarada e Trocar chave. */
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

  /** O campo, Salvar chave e (trocando) Cancelar; vazia, a nota embaixo. */
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

    // Um formulário: o Enter no campo salva, como o botão.
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

  /** Liga ou desliga o erro de salvar vazio: borda danger (aria-invalid) e o aviso embaixo, ligado ao campo. */
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
      // Este volta ao resumo; o outro lugar também, se não estiver no meio de uma troca.
      for (const outro of lugares) if (!outro.trocando) desenhar(outro);
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

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    no.className = classe;
    no.append(...filhos);
    return no;
  }

  document.addEventListener('DOMContentLoaded', iniciar);

  raiz.ChaveDoGemini = { montar };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
