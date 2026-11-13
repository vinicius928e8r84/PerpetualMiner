'use strict';

// A mineração automática vista de uma página: ler o estado do service worker,
// gravar só o que mudou num idioma e o campo do limite por dia. O popup (os
// azulejos) e o passo 6 da Boas-vindas usam estes, então os dois gravam igual.
//
//   MineracaoAutomatica.lerEstado()          → Promise<estado>
//   MineracaoAutomatica.salvarAjustes(mudanca) → Promise<estado>
//   MineracaoAutomatica.ligarCampoDoLimite(campo, { limiteGravado, gravar })
//
// As duas promessas rejeitam com a causa técnica quando o service worker não
// respondeu, ou respondeu sem o estado: nada foi lido ou gravado.
//
// Carregado pelo popup e pelo painel.

(function (raiz) {
  /** A causa técnica de uma resposta do service worker que falhou; null se deu certo. */
  function causaDaFalha(resposta) {
    if (chrome.runtime.lastError) return chrome.runtime.lastError.message;
    if (resposta?.ok && resposta.state) return null;
    // Sem resposta nenhuma, `JSON.stringify(undefined)` seria `undefined` e passaria por sucesso.
    return resposta?.error || JSON.stringify(resposta ?? null);
  }

  function pedir(mensagem) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(mensagem, resposta => {
        const falha = causaDaFalha(resposta);
        if (falha) reject(new Error(falha));
        else resolve(resposta.state);
      });
    });
  }

  const lerEstado = () => pedir({ type: 'AUTO_MINER_GET_STATE' });

  /** Grava só o que mudou num idioma (`{ en: { enabled } }`); o service worker junta com o resto. */
  const salvarAjustes = mudanca => pedir({ type: 'AUTO_MINER_SET_SETTINGS', settings: mudanca });

  /**
   * O campo do limite por dia (1–100). Sem as setinhas do navegador: ao chegar
   * no campo o número já vem selecionado, e digitar troca o limite; ↑ ↓ seguem
   * valendo. Enter (ou sair do campo) grava e o foco fica ali; vazio volta ao
   * que estava. `gravar(valor)` devolve uma promessa; depois dela o campo mostra
   * o que ficou gravado (o service worker prende entre 1 e 100, e uma falha
   * não gravou nada).
   */
  function ligarCampoDoLimite(campo, { limiteGravado, gravar }) {
    campo.type = 'number';
    campo.min = '1';
    campo.max = '100';
    campo.step = '1';
    campo.inputMode = 'numeric';
    campo.classList.add('veio-campo', 'veio-campo--limite');

    let pedido = null;
    const aoGravar = () => {
      const gravado = limiteGravado();
      const valor = Math.round(Number(campo.value));
      if (!campo.value.trim() || Number.isNaN(valor)) {
        campo.value = String(gravado);
        return;
      }
      // Enter e o `change` que vem depois dele pedem a mesma gravação uma vez só.
      if (valor === gravado || valor === pedido) return;
      pedido = valor;
      gravar(valor).finally(() => {
        pedido = null;
        if (campo.isConnected) campo.value = String(limiteGravado());
      });
    };
    campo.addEventListener('change', aoGravar);
    campo.addEventListener('focus', () => campo.select());
    campo.addEventListener('keydown', evento => {
      if (evento.key !== 'Enter') return;
      evento.preventDefault();
      aoGravar();
    });
  }

  raiz.MineracaoAutomatica = { lerEstado, salvarAjustes, ligarCampoDoLimite };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
