'use strict';

// Abrir o Anki a pedido da pessoa (#150): o clique que chama o abridor (lib/abridor.js) e a espera da Conexão
// responder. Só um clique, ou um Envio que a pessoa pediu, chega aqui: ler o vocabulário, entrar numa área ou o
// relógio nunca abrem o Anki.
//
//   abrirNoClique()      { resultado, detalhe } do abridor. Chame no clique, antes de qualquer `await`: ele pede a
//                        permissão `nativeMessaging` primeiro (o Chrome só pede com o gesto; já dada, responde
//                        na hora) e, dada, abre o Anki. Sem a permissão: SEM_PERMISSAO.
//   esperarOAnki(opcoes) true quando a Conexão responde ligada; false se `prazo` passa ou `continuar()` diz que não
//   abrirEEsperar()      o clique inteiro: abre e espera (uma só por página); { resultado, detalhe, respondeu }
//   causaDoAbridor(resposta)  o que o abridor disse, para o Detalhes de quem o chamou: `abridor · <resultado> · <detalhe>`
//   montarBotao(classe)  o botão Abrir o Anki (BRG-38) e a linha do que deu, para o selo BRG-12, o BRG-37 e o popup
//   montarSeJaConectou(lugar, classe)  põe o botão em `lugar` (se existe; uma vez) só depois de a Conexão ter respondido neste computador:
//                        sem ela o que falta é a Conexão, não abrir o Anki (como o Envio)
//
// Carregado depois de lib/abridor.js e lib/conexao-anki.js.

(function (raiz) {
  const { textoDaVoz, Abridor, ConexaoAnki } = raiz;
  const { RESULTADO } = Abridor;
  /** Quanto o Anki tem para abrir e a Conexão responder, depois do abridor; passado o prazo, a pessoa abre à mão. */
  const PRAZO_DO_ANKI_MS = 2 * 60 * 1000;
  const INTERVALO_MS = 2000;

  function abrirNoClique() {
    return Abridor.pedirPermissao().then(dada => (dada ? Abridor.abrirOAnki() : { resultado: RESULTADO.SEM_PERMISSAO, detalhe: '' }));
  }

  /** O prazo conta os intervalos, não o relógio da página. */
  async function esperarOAnki({ prazo = PRAZO_DO_ANKI_MS, intervalo = INTERVALO_MS, continuar = () => true } = {}) {
    for (let esperado = 0; esperado <= prazo && continuar(); esperado += intervalo) {
      if (await ConexaoAnki.conferir() === ConexaoAnki.SITUACAO.LIGADA) return true;
      await new Promise(resolver => setTimeout(resolver, intervalo));
    }
    return false;
  }

  const causaDoAbridor = ({ resultado, detalhe }) => `abridor · ${resultado}${detalhe ? ` · ${detalhe}` : ''}`;

  let emAndamento = null;
  function abrirEEsperar() {
    emAndamento = emAndamento || abrirNoClique()
      .then(async aberto => ({ ...aberto, respondeu: aberto.resultado === RESULTADO.ABRIU && await esperarOAnki() }))
      .finally(() => { emAndamento = null; });
    return emAndamento;
  }

  function montarBotao(classe = 'veio-botao veio-botao--contorno veio-botao--compacto') {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = classe;
    botao.textContent = textoDaVoz('BRG-38.abrir');
    const aviso = document.createElement('span');
    aviso.setAttribute('role', 'status');
    const lugar = document.createElement('span');
    lugar.className = 'abrir-o-anki';
    lugar.append(botao, aviso);

    botao.addEventListener('click', () => {
      if (botao.getAttribute('aria-disabled') === 'true') return;
      const aberto = abrirEEsperar();
      botao.setAttribute('aria-disabled', 'true');
      botao.textContent = textoDaVoz('BRG-38.abrindo');
      aviso.textContent = '';
      aberto.then(({ respondeu }) => {
        if (!respondeu) aviso.textContent = textoDaVoz('BRG-38.naoAbriu');
      }, () => { aviso.textContent = textoDaVoz('BRG-38.naoAbriu'); }).finally(() => {
        botao.removeAttribute('aria-disabled');
        botao.textContent = textoDaVoz('BRG-38.abrir');
      });
    });
    return lugar;
  }

  function montarSeJaConectou(lugar, classe) {
    if (lugar && ConexaoAnki.jaConectou() && !lugar.querySelector('.abrir-o-anki')) lugar.append(montarBotao(classe));
  }

  raiz.AbrirOAnki = { PRAZO_DO_ANKI_MS, abrirNoClique, esperarOAnki, abrirEEsperar, causaDoAbridor, montarBotao, montarSeJaConectou };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
