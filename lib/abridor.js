'use strict';

(function (raiz) {
  const HOST = 'com.perpetualminer.abridor';
  const PERMISSAO = Object.freeze({ permissions: ['nativeMessaging'] });
  const CHAVE = 'pm_abridor';
  const ID_DA_PONTE = 'abridor-ponte';
  const LIMITE_DA_CONVERSA_MS = 10 * 1000;
  const LIMITE_DO_CONSERTO_MS = 90 * 1000;

  const RESULTADO = Object.freeze({
    ACHOU: 'achou',
    NAO_ACHOU: 'nao_achou',
    ABRIU: 'abriu',
    NAO_ABRIU: 'nao_abriu',
    SEM_ABRIDOR: 'sem_abridor',
    SEM_PERMISSAO: 'sem_permissao',
    FECHADO: 'fechado',
    FECHOU: 'fechou',
    RESPONDEU: 'respondeu',
    REINICIADO: 'reiniciado',
    LIGADO: 'ligado',
    SUMIU: 'sumiu',
    FALHOU: 'falhou',
  });

  const montadas = new WeakSet();
  const montar = mensagem => {
    const pronta = Object.freeze(mensagem);
    montadas.add(pronta);
    return pronta;
  };

  const conferir = () => montar({ acao: 'conferir' });

  const abrir = () => montar({ acao: 'abrir' });

  const consertar = () => montar({ acao: 'consertar' });

  const variantes = () => [
    { nome: 'conferir se o abridor acha o Anki', mensagem: conferir() },
    { nome: 'abrir o Anki no perfil anotado', mensagem: abrir() },
    { nome: 'consertar o Anki e a Conexão', mensagem: consertar() },
  ];

  const temPermissao = () => chrome.permissions.contains(PERMISSAO);

  async function pedirPermissao() {
    try {
      return await chrome.permissions.request(PERMISSAO);
    } catch {
      return false;
    }
  }

  /** O `chrome.runtime` de um quadro recém-carregado, com a permissão de agora; o da página se não houver quadro. */
  async function runtimeDeAgora() {
    const ponte = document.getElementById(ID_DA_PONTE);
    if (!ponte) return chrome.runtime;
    await new Promise(resolve => {
      ponte.addEventListener('load', resolve, { once: true });
      ponte.contentWindow.location.reload();
    });
    return ponte.contentWindow.chrome?.runtime ?? chrome.runtime;
  }

  async function conversar(mensagem, limiteMs = LIMITE_DA_CONVERSA_MS) {
    if (!montadas.has(mensagem)) throw new Error('mensagem ao abridor que não saiu de PerpetualMiner.Abridor');
    const runtime = await runtimeDeAgora();
    if (typeof runtime.sendNativeMessage !== 'function') throw new Error('nativeMessaging indisponível nesta página');
    let limite;
    const semResposta = new Promise((_, rejeitar) => {
      limite = setTimeout(() => rejeitar(new Error(`o abridor não respondeu em ${limiteMs / 1000} s`)), limiteMs);
    });
    try {
      return await Promise.race([runtime.sendNativeMessage(HOST, mensagem), semResposta]);
    } finally {
      clearTimeout(limite);
    }
  }

  async function conversarComOAbridor(mensagem, limiteMs) {
    if (!(await temPermissao())) return { semResposta: { resultado: RESULTADO.SEM_PERMISSAO, detalhe: '' } };
    try {
      return { resposta: await conversar(mensagem, limiteMs) };
    } catch (erro) {
      return { semResposta: { resultado: RESULTADO.SEM_ABRIDOR, detalhe: erro?.message ?? String(erro) } };
    }
  }

  const foraDoContrato = resposta => ({ resultado: RESULTADO.SEM_ABRIDOR, detalhe: JSON.stringify(resposta ?? null) });

  async function conferirOAnki() {
    const { resposta, semResposta } = await conversarComOAbridor(conferir());
    if (semResposta) return semResposta;
    if (resposta?.achou === true) return { resultado: RESULTADO.ACHOU, detalhe: '' };
    if (resposta?.achou === false) return { resultado: RESULTADO.NAO_ACHOU, detalhe: '' };
    return foraDoContrato(resposta);
  }

  async function abrirOAnki() {
    const { resposta, semResposta } = await conversarComOAbridor(abrir());
    if (semResposta) return semResposta;
    if (resposta?.achou === true && resposta?.abriu === true) return { resultado: RESULTADO.ABRIU, detalhe: '' };
    if (typeof resposta?.achou === 'boolean' && typeof resposta?.abriu === 'boolean') {
      return { resultado: RESULTADO.NAO_ABRIU, detalhe: '' };
    }
    return foraDoContrato(resposta);
  }

  async function consertarOAnki() {
    const { resposta, semResposta } = await conversarComOAbridor(consertar(), LIMITE_DO_CONSERTO_MS);
    if (semResposta) return semResposta;
    const situacao = [RESULTADO.FECHADO, RESULTADO.FECHOU, RESULTADO.RESPONDEU, RESULTADO.REINICIADO, RESULTADO.LIGADO, RESULTADO.SUMIU, RESULTADO.FALHOU]
      .find(valor => valor === resposta?.situacao);
    if (!situacao) return foraDoContrato(resposta);
    return { resultado: situacao, motivo: situacao === RESULTADO.FALHOU && typeof resposta.motivo === 'string' ? resposta.motivo : '', detalhe: '' };
  }

  async function lerAgoraNao() {
    const { [CHAVE]: guardado } = await chrome.storage.local.get(CHAVE);
    return guardado?.agoraNao === true;
  }

  const guardarAgoraNao = sim => chrome.storage.local.set({ [CHAVE]: { agoraNao: Boolean(sim) } });

  raiz.Abridor = Object.freeze({
    HOST,
    RESULTADO,
    conferir,
    abrir,
    consertar,
    variantes,
    LIMITE_DO_CONSERTO_MS,
    temPermissao,
    pedirPermissao,
    conferirOAnki,
    abrirOAnki,
    consertarOAnki,
    lerAgoraNao,
    guardarAgoraNao,
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
