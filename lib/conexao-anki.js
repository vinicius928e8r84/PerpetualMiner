'use strict';

// A Conexão com o Anki, num lugar só: a situação dela, a conferência do /health
// e o fato “já respondeu neste computador”. O painel (shell, Frases, Anki,
// Boas-vindas, Envio) e o popup só ouvem este módulo; nenhum deles guarda uma
// cópia própria da situação nem confere a porta por conta própria.
//
// Três situações:
//   conectando  a primeira conferência ainda não voltou (ou a pessoa apertou
//               Tentar de novo e a resposta não chegou)
//   ligada      o /health respondeu ok
//   desligada   o /health falhou, deu erro ou não respondeu em 3 s: uma porta
//               que aceita e fica muda conta como desligada, nada espera para sempre
//
// E um fato gravado, `pm_anki_ja_conectou`: a Conexão já respondeu ligada neste
// computador. Quem confere grava. Os ouvintes de uma resposta ligada ainda leem
// `jaConectou()` como estava antes dela (assim o card da primeira conexão sabe
// que aquela foi a primeira); o fato vale a partir do fim da notificação.

(function (raiz) {
  const ENDERECO = 'http://127.0.0.1:8766';
  const SITUACAO = Object.freeze({ CONECTANDO: 'conectando', LIGADA: 'ligada', DESLIGADA: 'desligada' });
  /** O que o /health tem para responder: depois disso, a Conexão conta como desligada. */
  const TEMPO_DA_RESPOSTA = 3000;
  /** De quanto em quanto tempo `iniciar` confere de novo. */
  const INTERVALO = 15000;
  const CHAVE_JA_CONECTOU = 'pm_anki_ja_conectou';

  const estado = {
    situacao: SITUACAO.CONECTANDO,
    ultimaResposta: null,        // ligada ou desligada: a última situação que não foi Conectando
    jaConectou: false,
    conferencia: null,           // a conferência em andamento (uma promessa)
    relogio: null,
  };
  const ouvintesDaSituacao = [];      // acompanhar
  const ouvintesDaConferencia = [];   // aoConferir

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
      const resposta = await fetch(`${ENDERECO}/health`, { signal: AbortSignal.timeout(TEMPO_DA_RESPOSTA) });
      return resposta.ok;
    } catch {
      return false;
    }
  }

  function mudarPara(situacao) {
    estado.situacao = situacao;
    if (situacao !== SITUACAO.CONECTANDO) estado.ultimaResposta = situacao;
    for (const ouvinte of ouvintesDaSituacao) ouvinte(situacao);
  }

  /**
   * Pergunta ao /health se a Conexão está ligada e avisa a todos a resposta.
   * Duas conferências ao mesmo tempo são uma só: quem chama recebe a mesma
   * promessa, que termina com a situação (um dos valores de SITUACAO).
   */
  function conferir() {
    if (!estado.conferencia) {
      estado.conferencia = (async () => {
        for (const ouvinte of ouvintesDaConferencia) ouvinte(true);
        const ligada = await perguntarAoHealth();
        estado.conferencia = null;
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

  /** O Tentar de novo: “Conectando” na hora e a conferência. */
  function tentarDeNovo() {
    mudarPara(SITUACAO.CONECTANDO);
    return conferir();
  }

  /**
   * Confere agora e, com `aCada`, de novo a esse intervalo (ms) enquanto a
   * página está aberta. Quem chama de novo não ganha um segundo relógio.
   */
  function iniciar({ aCada = null } = {}) {
    if (aCada && !estado.relogio) estado.relogio = setInterval(conferir, aCada);
    return conferir();
  }

  /**
   * Quem precisa saber da situação. O ouvinte recebe a de agora na hora, e
   * cada resposta depois (a cada conferência, mudando ou não): um dos valores
   * de SITUACAO. Devolve a função que tira o ouvinte.
   */
  function acompanhar(ouvinte) {
    ouvintesDaSituacao.push(ouvinte);
    ouvinte(estado.situacao);
    return () => {
      const lugar = ouvintesDaSituacao.indexOf(ouvinte);
      if (lugar >= 0) ouvintesDaSituacao.splice(lugar, 1);
    };
  }

  /**
   * Quem mostra a conferência andando (a linha “Confere sozinho…” do card
   * ONB-16): `true` quando a conferência sai e `false` quando a resposta
   * volta, logo antes de `acompanhar` ouvir a situação.
   */
  function aoConferir(ouvinte) {
    ouvintesDaConferencia.push(ouvinte);
  }

  // O gravado é lido já no carregamento: `jaConectou()` responde certo para
  // quem pergunta antes da primeira conferência (o painel desenha o card da
  // primeira conexão, ou as abas, com ele). `pronta` espera essa leitura.
  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area === 'local' && mudancas[CHAVE_JA_CONECTOU]?.newValue === true) atualizarJaConectou();
  });
  const pronta = lerOQueEstaGravado();

  raiz.ConexaoAnki = {
    ENDERECO,
    SITUACAO,
    INTERVALO,
    TEMPO_DA_RESPOSTA,
    CHAVE_JA_CONECTOU,
    pronta,
    situacao: () => estado.situacao,
    /** ligada ou desligada: a última resposta; null enquanto nenhuma voltou nesta página. */
    ultimaResposta: () => estado.ultimaResposta,
    /** A Conexão já respondeu ligada neste computador (`pm_anki_ja_conectou`). */
    jaConectou: () => estado.jaConectou,
    acompanhar,
    aoConferir,
    conferir,
    iniciar,
    tentarDeNovo,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
