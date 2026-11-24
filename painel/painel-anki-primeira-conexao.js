'use strict';

(function (raiz) {
  const INTERVALO_DO_TIQUE = 1000;
  const MOMENTO_PRONTO_MS = 1800;
  const CHAVE_ABRIDOR_PENDENTE = 'pm_anki_abridor_pendente';

  const { textoDaVoz, Veio, Shell, ConexaoAnki, ConexaoNaTela, PassosDaConexao, FaseDaPrimeiraConexao } = raiz;
  const { SITUACAO: CONEXAO } = ConexaoAnki;
  const { FASE, EVENTO, cobreAsAbas } = FaseDaPrimeiraConexao;
  const porId = id => document.getElementById(id);

  let maquina = FaseDaPrimeiraConexao.inicial();
  const estado = {
    prontoDesenhado: false,
    conferindo: false,
    conferiuEm: null,
  };
  let passos = null;

  function despachar(tipo, dados = {}) {
    const antes = maquina;
    maquina = FaseDaPrimeiraConexao.proxima(maquina, { tipo, ...dados });
    if (maquina.pendente !== antes.pendente && tipo !== EVENTO.LEU) chrome.storage.local.set({ [CHAVE_ABRIDOR_PENDENTE]: maquina.pendente });
    if (maquina.fase === FASE.PRONTO && antes.fase !== FASE.PRONTO) {
      setTimeout(() => {
        despachar(EVENTO.PRONTO_PASSOU);
        desenhar();
        if (Shell.areaAtual() === 'anki') Veio.mostrarToastDeSucesso(ConexaoNaTela.texto(CONEXAO.LIGADA));
      }, MOMENTO_PRONTO_MS);
    }
  }

  function montar() {
    passos = PassosDaConexao.montar(porId('apv-passos'), { prefixo: 'apv', aoResolverOAbridor });
    ConexaoAnki.aoConferir(conferindo => {
      estado.conferindo = conferindo;
      desenharConferencia();
    });
    setInterval(desenharConferencia, INTERVALO_DO_TIQUE);
    return Promise.all([ConexaoAnki.pronta, chrome.storage.local.get({ [CHAVE_ABRIDOR_PENDENTE]: false })]).then(([, gravado]) => {
      despachar(EVENTO.LEU, { pendente: gravado[CHAVE_ABRIDOR_PENDENTE] === true });
      Shell.aoEntrarNaArea('anki', desenhar);
      return ConexaoAnki.acompanhar(aoMudarAConexao);
    });
  }

  function aoMudarAConexao(situacao) {
    if (situacao !== CONEXAO.CONECTANDO) estado.conferiuEm = Date.now();
    despachar(EVENTO.CONEXAO, {
      situacao,
      respondeu: ConexaoAnki.ultimaResposta() !== null,
      jaConectou: ConexaoAnki.jaConectou(),
      naArea: Shell.areaAtual() === 'anki',
      resolvido: passos.abridorResolvido(),
    });
    desenhar();
  }

  function aoResolverOAbridor() {
    despachar(EVENTO.RESOLVEU);
    desenhar();
  }

  function desenharConferencia() {
    if (porId('anki-primeira-vez').hidden) return;
    const agora = estado.conferindo || ConexaoAnki.situacao() === CONEXAO.CONECTANDO;
    const segundos = Math.max(0, Math.floor((Date.now() - (estado.conferiuEm ?? Date.now())) / 1000));
    porId('apv-confere').textContent = agora
      ? textoDaVoz('ONB-16.conferindoAgora')
      : textoDaVoz('ONB-16.conferindo', { segundos });
  }

  const focoDentroDoCardVisivel = secao => !secao.hidden && secao.contains(document.activeElement);
  const cardSumindoComFoco = (secao, cobre) => !cobre && focoDentroDoCardVisivel(secao);
  const semFocoEmLugarNenhum = ativo => ativo === document.body || ativo === null;
  const focoSaindoDoCard = secao => secao.contains(document.activeElement) || semFocoEmLugarNenhum(document.activeElement);

  function mostrarOCard(cobre) {
    const secao = porId('anki-primeira-vez');
    document.querySelector('.shell-area[data-area="anki"]').classList.toggle('anki--primeira-vez', cobre);
    if (cardSumindoComFoco(secao, cobre)) document.querySelector('input[name="aba-anki"]:checked')?.focus();
    secao.hidden = !cobre;
    estado.prontoDesenhado = estado.prontoDesenhado && cobre;
    passos.mostrar(cobre && Shell.areaAtual() === 'anki');
  }

  function tituloDoCard(pronto) {
    if (pronto) return ConexaoNaTela.texto(CONEXAO.LIGADA);
    return textoDaVoz(maquina.fase === FASE.PASSO4 ? 'ONB-17.titulo' : 'ONB-16.titulo');
  }

  function desenhar() {
    const cobre = cobreAsAbas(maquina);
    mostrarOCard(cobre);
    if (!cobre) return;
    const pronto = maquina.fase === FASE.PRONTO;
    const focoSaindo = focoSaindoDoCard(porId('anki-primeira-vez'));
    const entrouNoPronto = pronto && !estado.prontoDesenhado;
    estado.prontoDesenhado = pronto;

    porId('anki-primeira-vez-titulo').textContent = tituloDoCard(pronto);
    porId('apv-apoio').hidden = pronto;
    porId('apv-rodape').hidden = pronto;
    passos.desenhar({ pronto });

    desenharConferencia();
    if (entrouNoPronto && focoSaindo) passos.focarTitulo();
  }

  raiz.PrimeiraConexao = { montar };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
