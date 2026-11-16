'use strict';

(function (raiz) {
  const ENDERECO = 'http://127.0.0.1:8766';
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

  async function perguntarAoHealth() {
    try {
      const { PedidoAoAnki } = raiz;
      const resposta = await PedidoAoAnki.pedir(ENDERECO, PedidoAoAnki.saude(), { signal: AbortSignal.timeout(TEMPO_DA_RESPOSTA) });
      if (!resposta.ok) return null;
      const corpo = await resposta.json().catch(() => ({}));
      const texto = valor => (typeof valor === 'string' && valor !== '' ? valor : null);
      const atualizacao = corpo?.atualizacao;
      return {
        versao: texto(corpo?.versao),
        perfil: texto(corpo?.perfil),
        atualizacao: atualizacao && typeof atualizacao === 'object'
          ? { estado: texto(atualizacao.estado), versao: texto(atualizacao.versao), atualizada: texto(atualizacao.atualizada) }
          : null,
      };
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

  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area !== 'local') return;
    if (mudancas[CHAVE_JA_CONECTOU]?.newValue === true) atualizarJaConectou();
    else if (mudancas[CHAVE_JA_CONECTOU]?.newValue === false && estado.jaConectou) {
      estado.jaConectou = false;
      mudarPara(estado.situacao);
    }
  });
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
