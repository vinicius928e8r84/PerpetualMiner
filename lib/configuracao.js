'use strict';

(function (raiz) {
  const { Atalhos } = raiz;

  const PROGRESSO = 'pm_boas_vindas';

  const SITUACAO = Object.freeze({ FEITO: 'feito', AGORA_NAO: 'agora-nao', FALTA: 'falta' });

  const idiomasLigados = e => ['en', 'ru'].filter(lang => e.automatica[lang]);

  const PASSOS = Object.freeze([
    { id: 'minerar', opcional: false, feito: e => e.totalDeFrases > 0 },
    { id: 'atalho', opcional: false, feito: e => Boolean(e.atalhoDeSelecao) },
    { id: 'conta', opcional: true, feito: e => Boolean(e.conta) },
    { id: 'anki', opcional: false, feito: e => e.conexaoLigada === true && e.conexaoPareada === true },
    { id: 'ia', opcional: true, feito: e => Boolean(e.chaveDaOpenAI) },
    { id: 'automatica', opcional: true, feito: e => e.automatica.en || e.automatica.ru },
    { id: 'nivel', opcional: true, feito: e => idiomasLigados(e).length > 0 && idiomasLigados(e).every(lang => e.nivelSalvo[lang]) },
    { id: 'chave', opcional: true, feito: e => Boolean(e.chave) },
    { id: 'envio', opcional: false, feito: e => e.progresso?.primeiroEnvio?.chegou === true },
  ]);
  const PRONTO = 'pronto';

  const estado = {
    totalDeFrases: 0,
    atalhoDeSelecao: null,
    conta: null,
    conexaoLigada: null,
    conexaoPareada: false,
    automatica: { en: false, ru: false },
    nivelSalvo: { en: false, ru: false },
    chave: '',
    chaveDaOpenAI: '',
    progresso: null,
  };

  const ouvintes = [];
  let lidoDoStorage = false;
  let atalhosLidos = false;
  let comecou = false;

  function aoMudarAConexao(situacao) {
    const { SITUACAO: CONEXAO } = raiz.ConexaoAnki;
    const ligada = situacao === CONEXAO.CONECTANDO ? null : situacao === CONEXAO.LIGADA;
    const pareada = ligada === true && raiz.ConexaoAnki.apresentada() === CONEXAO.LIGADA;
    if (estado.conexaoLigada === ligada && estado.conexaoPareada === pareada) return;
    estado.conexaoLigada = ligada;
    estado.conexaoPareada = pareada;
    avisar();
  }

  function comecarALer() {
    comecou = true;
    raiz.ConexaoAnki.acompanhar(aoMudarAConexao);
    raiz.PareamentoComOAnki?.aoMudar(() => aoMudarAConexao(raiz.ConexaoAnki.situacao()));
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

  function situacaoDo(id) {
    const passo = PASSOS.find(p => p.id === id);
    if (passo.feito(estado)) return SITUACAO.FEITO;
    if (estado.progresso?.agoraNao.includes(id)) return SITUACAO.AGORA_NAO;
    return SITUACAO.FALTA;
  }

  function conexaoJaRespondeu() {
    return estado.conexaoLigada !== null;
  }

  function retrato() {
    const resolvidos = PASSOS.filter(p => situacaoDo(p.id) !== SITUACAO.FALTA).length;
    const queFalta = PASSOS.find(p => situacaoDo(p.id) === SITUACAO.FALTA);
    const { progresso } = estado;
    return {
      estado,
      situacaoDo,
      resolvidos,
      total: PASSOS.length,
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

  function acompanhar(aoMudar) {
    ouvintes.push(aoMudar);
    if (!comecou) comecarALer();
    else if (lidoDoStorage && atalhosLidos) aoMudar(retrato());
  }

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

  const concluir = () => gravarProgresso(() => ({ concluida: true }));

  const guardarPrimeiroEnvio = mudar => gravarProgresso(({ primeiroEnvio }) => ({ primeiroEnvio: { ...primeiroEnvio, ...mudar(primeiroEnvio || null) } }));

  const ocultarLembrete = () => gravarProgresso(() => ({ lembreteOculto: true }));

  raiz.Configuracao = {
    PASSOS: PASSOS.map(({ id, opcional }) => Object.freeze({ id, opcional })),
    SITUACAO,
    acompanhar,
    marcarAgoraNao,
    concluir,
    guardarPrimeiroEnvio,
    ocultarLembrete,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
