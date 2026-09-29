'use strict';

// A configuração da primeira execução num lugar só: os 6 passos da Boas-vindas,
// quando cada um está feito (pelo estado real, lido do que já está gravado), o
// “agora não” e o lembrete “Configuração pela metade” (item 9 da lista fechada:
// ONB-14 no popup, ONB-15 em Frases). A Boas-vindas, o popup e Frases leem daqui,
// então os três dizem o mesmo “N de 6” e caem no mesmo passo que falta.
//
// O progresso da página fica em `pm_boas_vindas`: `agoraNao` (os passos que a
// pessoa pulou), `concluida` (chegou a Abrir painel em Tudo pronto) e
// `lembreteOculto` (usou Ocultar em Frases). A instalação grava a chave
// (background.js): sem ela, a pessoa atualizou de uma versão sem Boas-vindas e
// nunca a começou, então não há configuração pela metade para lembrar.
//
// Carregado pelo painel e pelo popup, depois de `lib/atalhos.js`.

(function (raiz) {
  const { Atalhos } = raiz;

  const PROGRESSO = 'pm_boas_vindas';

  /** A situação de um passo. */
  const SITUACAO = Object.freeze({ FEITO: 'feito', AGORA_NAO: 'agora-nao', FALTA: 'falta' });

  /** Os 6 passos, na ordem travada, e quando cada um está feito. */
  const PASSOS = Object.freeze([
    { id: 'minerar', opcional: false, feito: e => e.totalDeFrases > 0 },
    { id: 'atalho', opcional: false, feito: e => Boolean(e.atalhoDeSelecao) },
    { id: 'conta', opcional: true, feito: e => Boolean(e.conta) },
    { id: 'anki', opcional: false, feito: e => e.conexaoLigada },
    { id: 'automatica', opcional: true, feito: e => e.automatica.en || e.automatica.ru },
    { id: 'chave', opcional: true, feito: e => Boolean(e.chave) },
  ]);
  const PRONTO = 'pronto';

  const estado = {
    totalDeFrases: 0,
    atalhoDeSelecao: null,
    conta: null,            // { displayName, … } com uma conta conectada
    conexaoLigada: false,
    automatica: { en: false, ru: false },
    chave: '',
    // null: a configuração nunca começou neste computador (sem `pm_boas_vindas`).
    progresso: null,
  };

  const ouvintes = [];
  let lidoDoStorage = false;
  let atalhosLidos = false;
  let comecou = false;

  // ─── O que já está gravado ─────────────────────────────────────────────────

  function comecarALer() {
    comecou = true;
    chrome.storage.local.get({
      frases: [],
      pm_user_info: null,
      pm_firebase_auth: null,
      pm_auto_miner_settings: null,
      geminiApiKey: '',
      [PROGRESSO]: null,
    }, dados => {
      aplicarGravado(dados);
      lidoDoStorage = true;
      avisar();
    });
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area !== 'local') return;
      const novos = {};
      for (const [chave, { newValue }] of Object.entries(mudancas)) novos[chave] = newValue;
      // A conta depende das duas chaves juntas, então ela é relida inteira; o
      // resto do mesmo lote (a frase, a chave, o progresso) entra na hora.
      const mudouAConta = 'pm_user_info' in novos || 'pm_firebase_auth' in novos;
      delete novos.pm_user_info;
      delete novos.pm_firebase_auth;
      if (Object.keys(novos).length) {
        aplicarGravado(novos);
        avisar();
      }
      if (mudouAConta) {
        chrome.storage.local.get({ pm_user_info: null, pm_firebase_auth: null }, dados => {
          aplicarGravado(dados);
          avisar();
        });
      }
    });
    Atalhos.acompanharAtalhos(atalhos => {
      estado.atalhoDeSelecao = atalhos[Atalhos.ACOES.SELECAO];
      atalhosLidos = true;
      avisar();
    });
  }

  function aplicarGravado(dados) {
    if ('frases' in dados) estado.totalDeFrases = (dados.frases || []).length;
    if ('pm_user_info' in dados) {
      estado.conta = dados.pm_user_info && dados.pm_firebase_auth ? dados.pm_user_info : null;
    }
    if ('pm_auto_miner_settings' in dados) {
      const ajustes = dados.pm_auto_miner_settings || {};
      estado.automatica = { en: Boolean(ajustes.en?.enabled), ru: Boolean(ajustes.ru?.enabled) };
    }
    if ('geminiApiKey' in dados) estado.chave = dados.geminiApiKey || '';
    if (PROGRESSO in dados) estado.progresso = normalizarProgresso(dados[PROGRESSO]);
  }

  function normalizarProgresso(gravado) {
    if (!gravado || typeof gravado !== 'object') return null;
    return {
      ...gravado,
      agoraNao: Array.isArray(gravado.agoraNao) ? gravado.agoraNao : [],
      concluida: Boolean(gravado.concluida),
    };
  }

  // ─── O retrato ─────────────────────────────────────────────────────────────

  /** Feito vale sobre “agora não”: o que a pessoa fez depois de pular conta. */
  function situacaoDo(id) {
    const passo = PASSOS.find(p => p.id === id);
    if (passo.feito(estado)) return SITUACAO.FEITO;
    if (estado.progresso?.agoraNao.includes(id)) return SITUACAO.AGORA_NAO;
    return SITUACAO.FALTA;
  }

  /**
   * O que as três superfícies mostram: cada passo, quantos já estão resolvidos
   * (feitos ou “agora não”), o primeiro que falta e se o lembrete aparece.
   */
  function retrato() {
    const resolvidos = PASSOS.filter(p => situacaoDo(p.id) !== SITUACAO.FALTA).length;
    const queFalta = PASSOS.find(p => situacaoDo(p.id) === SITUACAO.FALTA);
    const { progresso } = estado;
    return {
      estado,
      situacaoDo,
      resolvidos,
      total: PASSOS.length,
      // Continuar configuração: o primeiro passo que falta, ou Tudo pronto.
      enderecoParaContinuar: `#boas-vindas/${queFalta ? queFalta.id : PRONTO}`,
      lembrete: Boolean(progresso && !progresso.concluida && !progresso.lembreteOculto),
    };
  }

  function avisar() {
    if (!lidoDoStorage || !atalhosLidos) return;
    const agora = retrato();
    for (const ouvinte of ouvintes) ouvinte(agora);
  }

  // ─── A interface ───────────────────────────────────────────────────────────

  /**
   * Chama `aoMudar(retrato)` depois da primeira leitura do que está gravado e a
   * cada mudança dele (ou da Conexão, por `mostrarConexao`).
   */
  function acompanhar(aoMudar) {
    ouvintes.push(aoMudar);
    if (!comecou) comecarALer();
    else if (lidoDoStorage && atalhosLidos) aoMudar(retrato());
  }

  /** A Conexão com o Anki respondendo ou não: quem a confere é a página. */
  function mostrarConexao(ligada) {
    if (estado.conexaoLigada === ligada) return;
    estado.conexaoLigada = ligada;
    avisar();
  }

  function gravarProgresso(mudanca) {
    estado.progresso = { ...(estado.progresso || { agoraNao: [], concluida: false }), ...mudanca };
    avisar();
    return chrome.storage.local.set({ [PROGRESSO]: estado.progresso });
  }

  function marcarAgoraNao(id) {
    const agoraNao = estado.progresso?.agoraNao || [];
    if (agoraNao.includes(id)) return Promise.resolve();
    return gravarProgresso({ agoraNao: [...agoraNao, id] });
  }

  /** Abrir painel em Tudo pronto: a Boas-vindas terminou, e o lembrete sai. */
  const concluir = () => gravarProgresso({ concluida: true });

  /** Ocultar, em Frases: o lembrete sai de vez, nos dois lugares. */
  const ocultarLembrete = () => gravarProgresso({ lembreteOculto: true });

  raiz.Configuracao = {
    PASSOS: PASSOS.map(({ id, opcional }) => Object.freeze({ id, opcional })),
    SITUACAO,
    acompanhar,
    mostrarConexao,
    marcarAgoraNao,
    concluir,
    ocultarLembrete,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
