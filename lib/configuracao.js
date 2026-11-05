'use strict';

// A configuração da primeira execução num lugar só: os 8 passos da Boas-vindas,
// quando cada um está feito (pelo estado real, do storage e da Conexão), o
// “agora não” e o lembrete “Configuração pela metade” (item 9 da lista fechada:
// ONB-14 no popup, ONB-15 em Frases). A Boas-vindas, o popup e Frases leem daqui,
// então os três dizem o mesmo “N de 8” e caem no mesmo passo que falta.
//
// O progresso da página fica em `pm_boas_vindas`: `agoraNao` (os passos que a
// pessoa pulou), `concluida` (chegou a Abrir painel em Tudo pronto) e
// `lembreteOculto` (usou Ocultar em Frases). A instalação grava a chave
// (background.js): sem ela, a pessoa atualizou de uma versão sem Boas-vindas e
// nunca a começou, então não há configuração pela metade para lembrar.
//
// A Conexão com o Anki (o passo 4) vem de `lib/conexao-anki.js`: quem carrega
// este arquivo carrega aquele antes, e nenhuma página precisa repassá-la.
//
// Carregado pelo painel e pelo popup, depois de `lib/atalhos.js` e de `lib/ajustes-de-envio.js` (o nível do cartão, #164).

(function (raiz) {
  const { Atalhos } = raiz;

  const PROGRESSO = 'pm_boas_vindas';

  const SITUACAO = Object.freeze({ FEITO: 'feito', AGORA_NAO: 'agora-nao', FALTA: 'falta' });

  /** Os idiomas da mineração automática que estão ligados: os que o passo do nível pergunta. */
  const idiomasLigados = e => ['en', 'ru'].filter(lang => e.automatica[lang]);

  /** Os 8 passos, na ordem travada, e quando cada um está feito. */
  const PASSOS = Object.freeze([
    { id: 'minerar', opcional: false, feito: e => e.totalDeFrases > 0 },
    { id: 'atalho', opcional: false, feito: e => Boolean(e.atalhoDeSelecao) },
    { id: 'conta', opcional: true, feito: e => Boolean(e.conta) },
    { id: 'anki', opcional: false, feito: e => e.conexaoLigada === true },
    { id: 'ia', opcional: true, feito: e => Boolean(e.chaveDaOpenAI) },
    { id: 'automatica', opcional: true, feito: e => e.automatica.en || e.automatica.ru },
    // O nível do cartão (#164): feito quando todo idioma ligado tem o nível salvo (sem idioma ligado não há o que perguntar).
    { id: 'nivel', opcional: true, feito: e => idiomasLigados(e).length > 0 && idiomasLigados(e).every(lang => e.nivelSalvo[lang]) },
    { id: 'chave', opcional: true, feito: e => Boolean(e.chave) },
  ]);
  const PRONTO = 'pronto';

  const estado = {
    totalDeFrases: 0,
    atalhoDeSelecao: null,
    conta: null,            // { displayName, … } com uma conta conectada
    conexaoLigada: null,    // null até a Conexão com o Anki responder (Conectando não conta)
    automatica: { en: false, ru: false },
    nivelSalvo: { en: false, ru: false },   // o idioma tem os Ajustes de envio salvos (`versao` > 0)
    chave: '',
    chaveDaOpenAI: '',      // os 4 últimos caracteres da chave da OpenAI conferida (`pm_chave_openai`); '' sem chave
    // null: a configuração nunca começou neste computador (sem `pm_boas_vindas`).
    progresso: null,
  };

  const ouvintes = [];
  let lidoDoStorage = false;
  let atalhosLidos = false;
  let comecou = false;

  /** A situação da Conexão com o Anki: Conectando ainda não conta o passo, e o número não pula na tela. */
  function aoMudarAConexao(situacao) {
    const { SITUACAO: CONEXAO } = raiz.ConexaoAnki;
    const ligada = situacao === CONEXAO.CONECTANDO ? null : situacao === CONEXAO.LIGADA;
    if (estado.conexaoLigada === ligada) return;
    estado.conexaoLigada = ligada;
    avisar();
  }

  function comecarALer() {
    comecou = true;
    raiz.ConexaoAnki.acompanhar(aoMudarAConexao);
    chrome.storage.local.get({
      frases: [],
      pm_user_info: null,
      pm_auto_miner_settings: null,
      [raiz.AjustesDeEnvio.CHAVE]: null,
      geminiApiKey: '',
      pm_chave_openai: null,
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
      // A sessão inteira é privada (IndexedDB); o perfil público é escrito só
      // depois de guardar a sessão e removido ao sair. O lembrete não lê tokens.
      const mudouAConta = 'pm_user_info' in novos;
      delete novos.pm_user_info;
      if (Object.keys(novos).length) {
        aplicarGravado(novos);
        avisar();
      }
      if (mudouAConta) {
        chrome.storage.local.get({ pm_user_info: null }, dados => {
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
      estado.conta = dados.pm_user_info || null;
    }
    if ('pm_auto_miner_settings' in dados) {
      const ajustes = dados.pm_auto_miner_settings || {};
      estado.automatica = { en: Boolean(ajustes.en?.enabled), ru: Boolean(ajustes.ru?.enabled) };
    }
    if (raiz.AjustesDeEnvio.CHAVE in dados) {
      const salvos = dados[raiz.AjustesDeEnvio.CHAVE] || {};
      estado.nivelSalvo = { en: salvos.en?.versao > 0, ru: salvos.ru?.versao > 0 };
    }
    if ('geminiApiKey' in dados) estado.chave = dados.geminiApiKey || '';
    if ('pm_chave_openai' in dados) estado.chaveDaOpenAI = dados.pm_chave_openai?.ultimos4 || '';
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

  /** Feito vale sobre “agora não”: o que a pessoa fez depois de pular conta. */
  function situacaoDo(id) {
    const passo = PASSOS.find(p => p.id === id);
    if (passo.feito(estado)) return SITUACAO.FEITO;
    if (estado.progresso?.agoraNao.includes(id)) return SITUACAO.AGORA_NAO;
    return SITUACAO.FALTA;
  }

  /** O lembrete espera a Conexão (ela conta um passo): o número não pula na tela. */
  function conexaoJaRespondeu() {
    return estado.conexaoLigada !== null;
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
      lembrete: Boolean(progresso && !progresso.concluida && !progresso.lembreteOculto)
        && conexaoJaRespondeu(),
    };
  }

  function avisar() {
    if (!lidoDoStorage || !atalhosLidos) return;
    const agora = retrato();
    for (const ouvinte of ouvintes) ouvinte(agora);
  }

  /**
   * Chama `aoMudar(retrato)` depois da primeira leitura do que está gravado e a
   * cada mudança dele ou da Conexão que acompanha em `comecarALer()`.
   */
  function acompanhar(aoMudar) {
    ouvintes.push(aoMudar);
    if (!comecou) comecarALer();
    else if (lidoDoStorage && atalhosLidos) aoMudar(retrato());
  }

  /**
   * Junta `mudar(progresso)` ao que está gravado agora, não à cópia desta
   * página: o popup, Frases e a Boas-vindas (até em outra aba) gravam a mesma
   * chave, e um não apaga o que o outro acabou de gravar.
   */
  function gravarProgresso(mudar) {
    const inicial = { agoraNao: [], concluida: false };
    estado.progresso = { ...(estado.progresso || inicial), ...mudar(estado.progresso || inicial) };
    avisar();
    return chrome.storage.local.get({ [PROGRESSO]: null }).then(dados => {
      const gravado = normalizarProgresso(dados[PROGRESSO]) || inicial;
      return chrome.storage.local.set({ [PROGRESSO]: { ...gravado, ...mudar(gravado) } });
    });
  }

  function marcarAgoraNao(id) {
    return gravarProgresso(({ agoraNao }) => ({ agoraNao: agoraNao.includes(id) ? agoraNao : [...agoraNao, id] }));
  }

  /** Abrir painel em Tudo pronto: a Boas-vindas terminou, e o lembrete sai. */
  const concluir = () => gravarProgresso(() => ({ concluida: true }));

  /** Ocultar, em Frases: o lembrete sai de vez, nos dois lugares. */
  const ocultarLembrete = () => gravarProgresso(() => ({ lembreteOculto: true }));

  raiz.Configuracao = {
    PASSOS: PASSOS.map(({ id, opcional }) => Object.freeze({ id, opcional })),
    SITUACAO,
    acompanhar,
    marcarAgoraNao,
    concluir,
    ocultarLembrete,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
