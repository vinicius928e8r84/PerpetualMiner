'use strict';

(function (raiz) {
  const { textoDaVoz, Sincronizacao, ChaveDaOpenAI } = raiz;
  const { Conta } = raiz;
  const { SITUACOES } = Conta;
  const { mostrarToastDeSucesso } = raiz.Veio;

  let painel = null;
  let sessao = null;
  let nuvem = null;
  let sincronizacao = novaSincronizacao();
  let sincronizandoAChave = Promise.resolve();
  let erroDaChave = null;
  let estadoDasFrases = { situacao: SITUACOES.SINCRONIZADO, dados: {} };

  function iniciar(ligacao) {
    painel = ligacao;
    ChaveDaOpenAI.aoMudar(() => { if (nuvem) carregarDaNuvem(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') sincronizarAChave();
    });
  }

  function novaSincronizacao() {
    return Sincronizacao.criarSincronizacao({
      nuvem,
      armazenamento: Sincronizacao.armazenamentoDoChrome(chrome.storage),
      aviso: (mensagem, erro) => console.warn('[Firestore]', mensagem + ':', erro?.message),
    });
  }

  function conectar(credenciais) {
    sessao = Sincronizacao.criarSessao({
      credenciais,
      aoRenovar: Sincronizacao.guardarCredenciais,
    });
    nuvem = Sincronizacao.nuvemHttp({ sessao });
    sincronizacao = novaSincronizacao();
  }

  function desconectar() {
    erroDaChave = null;
    estadoDasFrases = { situacao: SITUACOES.SINCRONIZADO, dados: {} };
    sessao?.revogar();
    sessao = null;
    nuvem = null;
    sincronizacao = novaSincronizacao();
  }

  function mostrarEstadoDoSync() {
    const { situacao, dados } = estadoDasFrases;
    const situacaoDaChave = erroDaChave ? situacaoDoErro(erroDaChave, SITUACOES.CHAVE_PENDENTE) : null;
    const exigeConta = s => s === SITUACOES.RECUSADO || s === SITUACOES.EXPIROU;
    if (exigeConta(situacaoDaChave) && !exigeConta(situacao)) {
      Conta.mostrarSincronizacao(situacaoDaChave, { detalhes: erroDaChave.message });
    } else if (situacao !== SITUACOES.SINCRONIZADO) {
      Conta.mostrarSincronizacao(situacao, { ...dados,
        detalhes: [dados.detalhes, erroDaChave?.message].filter(Boolean).join('\n'),
      });
    } else if (erroDaChave) {
      Conta.mostrarSincronizacao(situacaoDaChave, { detalhes: erroDaChave.message, codigo: erroDaChave.codigo });
    } else Conta.mostrarSincronizacao(SITUACOES.SINCRONIZADO);
  }

  function mostrarEstadoDasFrases(situacao, dados = {}) {
    estadoDasFrases = { situacao, dados };
    mostrarEstadoDoSync();
  }

  function mostrarSincronizado() {
    mostrarEstadoDasFrases(SITUACOES.SINCRONIZADO);
  }

  function sincronizarAChave() {
    sincronizandoAChave = sincronizandoAChave.then(sincronizarAChaveDestaNuvem);
    return sincronizandoAChave;
  }

  async function sincronizarAChaveDestaNuvem() {
    const estaNuvem = nuvem;
    const estaSessao = sessao;
    if (!estaNuvem || !estaSessao) return;
    try {
      await ChaveDaOpenAI.sincronizar(estaSessao, estaNuvem.uid);
      if (nuvem === estaNuvem) limparErroDaChave();
    } catch (err) {
      if (nuvem === estaNuvem) registrarErroDaChave(err);
    }
  }

  function limparErroDaChave() {
    erroDaChave = null;
    mostrarEstadoDoSync();
  }

  function registrarErroDaChave(err) {
    const motivo = err?.status || err?.motivo || 'sem resposta';
    erroDaChave = Object.assign(new Error(`OpenAI sync · ${motivo}`), { motivo: err?.motivo, codigo: err?.codigo });
    mostrarEstadoDoSync();
  }

  function situacaoDoErro(err, semSincronizar = SITUACOES.SEM_SINCRONIZAR) {
    if (err?.motivo === Sincronizacao.MOTIVO.EXPIROU) return SITUACOES.EXPIROU;
    if (err?.motivo === Sincronizacao.MOTIVO.RECUSADO) return SITUACOES.RECUSADO;
    return semSincronizar;
  }

  function mostrarFalhaNaNuvem(err, semSincronizar) {
    mostrarEstadoDasFrases(situacaoDoErro(err, semSincronizar), { detalhes: err?.message || String(err) });
  }

  function frasesDoComputador() {
    return new Promise(resolve => chrome.storage.local.get({ frases: [] }, resolve));
  }

  async function migrar() {
    const { frases = [] } = await frasesDoComputador();
    if (frases.length > 0) {
      mostrarEstadoDasFrases(SITUACOES.PRIMEIRA_SUBIDA, { n: frases.length });
      try {
        await nuvem.gravarFrases(frases);
        mostrarToastDeSucesso(textoDaVoz('CFG-09.sucesso', { n: frases.length }));
      } catch (err) {
        console.error('[Firestore] migração falhou:', err);
        await carregarDaNuvem({ primeiraSubidaFalhou: true });
        return;
      }
    }
    await carregarDaNuvem();
  }

  function carregarLocal() {
    chrome.storage.local.get({ frases: [] }, (data) => {
      painel.trocarFrases(data.frases || []);
      painel.carregou();
    });
  }

  async function carregarDaNuvem({ primeiraSubidaFalhou = false } = {}) {
    const semSincronizar = primeiraSubidaFalhou ? SITUACOES.PRIMEIRA_SUBIDA_FALHOU : SITUACOES.SEM_SINCRONIZAR;
    mostrarEstadoDasFrases(SITUACOES.SINCRONIZANDO);
    await sincronizarAChave();
    try {
      const { frases, desteComputador, falhaNasOrfas } = await sincronizacao.carregar({ atuais: painel.frases });
      painel.trocarFrases(frases);
      if (falhaNasOrfas) {
        console.error('[Firestore] orphans com falha:', falhaNasOrfas.quantas, falhaNasOrfas.causas[0]?.message);
        mostrarSyncIncompleto(falhaNasOrfas, desteComputador, semSincronizar);
      } else {
        mostrarSincronizado();
      }
      painel.carregou();
    } catch (err) {
      console.error('[Firestore] carregar:', err);
      mostrarFalhaNaNuvem(err, semSincronizar);
      carregarLocal();
    }
  }

  function mostrarSyncIncompleto({ quantas, causas }, desteComputador, semSincronizar) {
    const detalhes = [...new Set(causas.map(c => c?.message || String(c)))].join('\n');
    const situacao = situacaoDoErro(causas[0], semSincronizar);
    const naNuvem = desteComputador - quantas;
    if (situacao !== semSincronizar || naNuvem === 0) {
      mostrarEstadoDasFrases(situacao, { detalhes });
      return;
    }
    mostrarEstadoDasFrases(SITUACOES.PARCIAL, { n: naNuvem, total: desteComputador, detalhes });
  }

  function salvarFrase(frase, campos = null) {
    if (!nuvem) return;
    nuvem.gravarFrase(frase, campos).catch(err => {
      console.error('[Firestore] patch:', frase.id, err.message);
      mostrarFalhaNaNuvem(err);
    });
  }

  raiz.FrasesNuvem = {
    iniciar,
    conectar,
    desconectar,
    nuvem: () => nuvem,
    sincronizacao: () => sincronizacao,
    erroDaChave: () => erroDaChave,
    sincronizarAChave,
    carregarDaNuvem,
    carregarLocal,
    migrar,
    salvarFrase,
    mostrarFalha: mostrarFalhaNaNuvem,
    mostrarSincronizado,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
