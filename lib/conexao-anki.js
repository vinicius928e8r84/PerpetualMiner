'use strict';

(function (raiz) {
  const { ENDERECO } = raiz.ConversaComOAnki;
  const SITUACAO = Object.freeze({ CONECTANDO: 'conectando', LIGADA: 'ligada', DESLIGADA: 'desligada' });
  const APRESENTADA = Object.freeze({ A_PAREAR: 'a_parear', NAO_CONFIRMADA: 'nao_confirmada' });
  const TEMPO_DA_RESPOSTA = 3000;
  const INTERVALO = 15000;
  const CHAVE_JA_CONECTOU = 'pm_anki_ja_conectou';

  const estado = {
    situacao: SITUACAO.CONECTANDO,
    ultimaResposta: null,
    saude: null,
    pareamento: null,
    jaConectou: false,
    conferencia: null,
    relogio: null,
  };
  const ouvintesDaSituacao = [];
  const ouvintesDaConferencia = [];

  function atualizarJaConectou() {
    if (estado.jaConectou) return;
    estado.jaConectou = true;
    mudarPara(estado.situacao);
  }

  async function lerOQueEstaGravado() {
    try {
      const gravado = await chrome.storage.local.get({ [CHAVE_JA_CONECTOU]: false });
      if (gravado[CHAVE_JA_CONECTOU] === true) atualizarJaConectou();
    } catch {
    }
  }

  function textoOuNulo(valor) {
    return typeof valor === 'string' && valor !== '' ? valor : null;
  }

  function atualizacaoDaSaude(atualizacao) {
    if (!atualizacao || typeof atualizacao !== 'object') return null;
    return { estado: textoOuNulo(atualizacao.estado), versao: textoOuNulo(atualizacao.versao), atualizada: textoOuNulo(atualizacao.atualizada) };
  }

  function saudeDaResposta(corpo) {
    return { versao: textoOuNulo(corpo.versao), perfil: textoOuNulo(corpo.perfil), atualizacao: atualizacaoDaSaude(corpo.atualizacao) };
  }

  async function perguntarAoHealth() {
    try {
      const { PedidoAoAnki, ConversaComOAnki } = raiz;
      const desfecho = await ConversaComOAnki.pedir(PedidoAoAnki.saude(), { prazoMs: TEMPO_DA_RESPOSTA });
      if (!desfecho.ok && desfecho.motivo !== ConversaComOAnki.MOTIVO.INVALIDA) return null;
      return saudeDaResposta(desfecho.dados || {});
    } catch {
      return null;
    }
  }

  function apresentada() {
    if (estado.situacao !== SITUACAO.LIGADA) return estado.situacao;
    if (estado.pareamento === 'a_parear') return APRESENTADA.A_PAREAR;
    return estado.pareamento === 'nao_confirmada' || estado.pareamento === 'antiga' ? APRESENTADA.NAO_CONFIRMADA : estado.situacao;
  }

  async function conferirOPareamento() {
    const { PareamentoComOAnki } = raiz;
    if (!PareamentoComOAnki) return null;
    try {
      return (await PareamentoComOAnki.provar(ENDERECO)).estado;
    } catch {
      PareamentoComOAnki.marcarNaoConfirmada();
      return PareamentoComOAnki.ESTADO.NAO_CONFIRMADA;
    }
  }

  function mudarPara(situacao) {
    estado.situacao = situacao;
    if (situacao !== SITUACAO.CONECTANDO) estado.ultimaResposta = situacao;
    for (const ouvinte of ouvintesDaSituacao) ouvinte(situacao);
  }

  function conferir() {
    if (!estado.conferencia) {
      estado.conferencia = (async () => {
        for (const ouvinte of ouvintesDaConferencia) ouvinte(true);
        const saude = await perguntarAoHealth();
        const ligada = saude !== null;
        const pareamento = ligada ? await conferirOPareamento() : null;
        estado.conferencia = null;
        estado.saude = saude;
        estado.pareamento = pareamento;
        for (const ouvinte of ouvintesDaConferencia) ouvinte(false);
        mudarPara(ligada ? SITUACAO.LIGADA : SITUACAO.DESLIGADA);
        if (ligada && !estado.jaConectou) {
          estado.jaConectou = true;
          chrome.storage.local.set({ [CHAVE_JA_CONECTOU]: true });
        }
        return estado.situacao;
      })();
    }
    return estado.conferencia;
  }

  async function esquecerQueConectou() {
    estado.jaConectou = false;
    await chrome.storage.local.set({ [CHAVE_JA_CONECTOU]: false });
    mudarPara(estado.situacao);
  }

  function tentarDeNovo() {
    mudarPara(SITUACAO.CONECTANDO);
    return conferir();
  }

  function iniciar({ aCada = null } = {}) {
    if (aCada && !estado.relogio) estado.relogio = setInterval(conferir, aCada);
    return conferir();
  }

  function acompanhar(ouvinte) {
    ouvintesDaSituacao.push(ouvinte);
    ouvinte(estado.situacao);
    return () => {
      const lugar = ouvintesDaSituacao.indexOf(ouvinte);
      if (lugar >= 0) ouvintesDaSituacao.splice(lugar, 1);
    };
  }

  function aoConferir(ouvinte) {
    ouvintesDaConferencia.push(ouvinte);
  }

  function seguirOJaConectouGravado(mudancas, area) {
    if (area !== 'local') return;
    if (mudancas[CHAVE_JA_CONECTOU]?.newValue === true) atualizarJaConectou();
    else if (mudancas[CHAVE_JA_CONECTOU]?.newValue === false && estado.jaConectou) {
      estado.jaConectou = false;
      mudarPara(estado.situacao);
    }
  }

  chrome.storage.onChanged.addListener(seguirOJaConectouGravado);
  raiz.PareamentoComOAnki?.aoMudar(novo => { if (estado.situacao === SITUACAO.LIGADA) estado.pareamento = novo; });
  const pronta = lerOQueEstaGravado();

  raiz.ConexaoAnki = {
    ENDERECO,
    SITUACAO,
    APRESENTADA,
    apresentada,
    INTERVALO,
    TEMPO_DA_RESPOSTA,
    pronta,
    situacao: () => estado.situacao,
    ultimaResposta: () => estado.ultimaResposta,
    pareamento: () => (estado.situacao === SITUACAO.LIGADA ? estado.pareamento : null),
    saude: () => estado.saude,
    conferindo: () => estado.conferencia !== null,
    jaConectou: () => estado.jaConectou,
    acompanhar,
    aoConferir,
    conferir,
    iniciar,
    tentarDeNovo,
    esquecerQueConectou,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
