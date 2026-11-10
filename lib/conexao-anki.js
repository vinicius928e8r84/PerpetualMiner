'use strict';

// A Conexão com o Anki, num lugar só: a situação dela, a conferência do /health
// e o fato “já respondeu neste computador”. O painel (shell, Frases, Anki,
// Boas-vindas, Envio) e o popup usam este módulo; nenhum deles guarda uma
// cópia própria da situação nem confere a porta por conta própria.
//
// Três situações:
//   conectando  a primeira conferência ainda não voltou (ou a pessoa apertou
//               Tentar de novo e a resposta não chegou)
//   ligada      o /health respondeu ok
//   desligada   o /health falhou, deu erro ou não respondeu em 3 s: uma porta
//               que aceita e fica muda conta como desligada, nada espera para sempre
//
// Ligada é a porta que responde o /health. Uma Conexão ligada ainda pode não ter pareado com este navegador (#192): `pareamento()` diz isso à parte
// (lib/pareamento.js: pareada, a_parear, nao_confirmada ou antiga), depois de cada /health ligado, e é o que o painel mostra enquanto a
// Conexão não é de confiança. Os pedidos privados só saem com o pareamento (`PedidoAoAnki.pedir`); pareado agora, `tentarDeNovo()` refaz a conferência.
//
// E um fato gravado, `pm_anki_ja_conectou`: a Conexão já respondeu ligada neste
// computador. Quem confere (painel ou popup) grava; `storage.onChanged` mantém
// o fato atual em outras páginas, sem repetir a conferência. Os ouvintes de uma
// resposta ligada ainda leem `jaConectou()` como estava antes dela (assim o
// card da primeira conexão sabe que aquela foi a primeira); o fato vale a
// partir do fim da notificação.

(function (raiz) {
  const ENDERECO = 'http://127.0.0.1:8766';
  const SITUACAO = Object.freeze({ CONECTANDO: 'conectando', LIGADA: 'ligada', DESLIGADA: 'desligada' });
  /** O que a tela diz de uma porta que responde a saúde sem ter provado ser a Conexão deste navegador (`apresentada`). */
  const APRESENTADA = Object.freeze({ A_PAREAR: 'a_parear', NAO_CONFIRMADA: 'nao_confirmada' });
  /** O que o /health tem para responder: depois disso, a Conexão conta como desligada. */
  const TEMPO_DA_RESPOSTA = 3000;
  /** De quanto em quanto tempo `iniciar` confere de novo. */
  const INTERVALO = 15000;
  const CHAVE_JA_CONECTOU = 'pm_anki_ja_conectou';

  const estado = {
    situacao: SITUACAO.CONECTANDO,
    ultimaResposta: null,        // ligada ou desligada: a última situação que não foi Conectando
    saude: null,                 // o que o último /health ligado disse: { versao, perfil, atualizacao } (null: nenhum ainda, ou desligada)
    pareamento: null,            // com a Conexão ligada, o que o último conferir disse (PareamentoComOAnki.ESTADO); senão null
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

  /**
   * Pergunta ao /health. Devolve `null` quando a Conexão não respondeu ok; ligada, o que ela diz de si:
   * a versão, a atualização (quando há) e o perfil do Anki aberto (uma versão antiga não diz nenhum dos dois, e o corpo que não
   * se lê também não derruba a resposta: ligada é ligada).
   */
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
        // A atualização da Conexão pelo AnkiWeb (#177): só vem quando há o que dizer (uma versão no disco, uma tentativa que falhou, a atualização que valeu agora).
        atualizacao: atualizacao && typeof atualizacao === 'object'
          ? { estado: texto(atualizacao.estado), versao: texto(atualizacao.versao), atualizada: texto(atualizacao.atualizada) }
          : null,
      };
    } catch {
      return null;
    }
  }

  /** A situação como a tela a diz: `ligada` só com a Conexão provada (#192, desenho § 2). Sem pareamento, ou diante de uma porta que não provou ter o segredo (um impostor,
   * uma Conexão antiga, que não sabe provar), é `a_parear` ou `nao_confirmada`: o ponto da Conexão não fica verde. */
  function apresentada() {
    if (estado.situacao !== SITUACAO.LIGADA) return estado.situacao;
    if (estado.pareamento === 'a_parear') return APRESENTADA.A_PAREAR;
    return estado.pareamento === 'nao_confirmada' || estado.pareamento === 'antiga' ? APRESENTADA.NAO_CONFIRMADA : estado.situacao;
  }

  /** Com a Conexão ligada: a Conexão tem o segredo deste navegador? Sem o módulo (uma página que não o carrega) o pareamento não se conhece. */
  async function conferirOPareamento() {
    const { PareamentoComOAnki } = raiz;
    if (!PareamentoComOAnki) return null;
    try {
      return (await PareamentoComOAnki.provar(ENDERECO, { fresco: true })).estado;
    } catch {
      PareamentoComOAnki.marcarNaoConfirmada();   // a porta respondeu a saúde e calou no conferir: nada foi provado
      return PareamentoComOAnki.ESTADO.NAO_CONFIRMADA;
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

  /**
   * Instalar de novo (#152): a Conexão sumiu do Anki, então o que vale é o caminho da primeira conexão. Esquece o fato
   * gravado, e quem acompanha a situação redesenha (o card ONB-16 volta no lugar das abas enquanto ela não responder).
   */
  async function esquecerQueConectou() {
    estado.jaConectou = false;
    await chrome.storage.local.set({ [CHAVE_JA_CONECTOU]: false });
    mudarPara(estado.situacao);
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

  // O painel espera `pronta` antes de escolher entre o card e as abas. A
  // conferência do /health começa independente desta leitura: storage lento
  // ou indisponível não atrasa o prazo de resposta da porta.
  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area !== 'local') return;
    if (mudancas[CHAVE_JA_CONECTOU]?.newValue === true) atualizarJaConectou();
    else if (mudancas[CHAVE_JA_CONECTOU]?.newValue === false && estado.jaConectou) {
      estado.jaConectou = false;
      mudarPara(estado.situacao);
    }
  });
  // Um pedido que descobre que a Conexão não conhece mais este navegador (ou não prova nada) muda o que a tela diz sem esperar os 15 s da saúde.
  // Carregado depois de lib/pareamento.js, para este ouvinte ser o primeiro: quem lê `pareamento()` num ouvinte do módulo já o vê novo.
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
    /** ligada ou desligada: a última resposta; null enquanto nenhuma voltou nesta página. */
    ultimaResposta: () => estado.ultimaResposta,
    /** O pareamento deste navegador com a Conexão ligada (`PareamentoComOAnki.ESTADO`: pareada, a_parear, nao_confirmada, antiga); `null` sem Conexão ligada. */
    pareamento: () => (estado.situacao === SITUACAO.LIGADA ? estado.pareamento : null),
    /** O que o último /health ligado disse da Conexão: `{ versao, perfil, atualizacao }` (cada um `null` quando não veio); `null` sem Conexão ligada. */
    saude: () => estado.saude,
    /** Uma conferência do /health está no ar agora (`aoConferir` avisa quando ela sai e quando volta). */
    conferindo: () => estado.conferencia !== null,
    /** A Conexão já respondeu ligada neste computador (`pm_anki_ja_conectou`). */
    jaConectou: () => estado.jaConectou,
    acompanhar,
    aoConferir,
    conferir,
    iniciar,
    tentarDeNovo,
    esquecerQueConectou,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
