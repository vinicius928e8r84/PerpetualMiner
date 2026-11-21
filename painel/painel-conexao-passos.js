'use strict';

(function (raiz) {
  const RESPOSTA = Object.freeze({ JA_TENHO: 'ja', NAO_TENHO: 'nao' });
  const INTERVALO_DO_TIQUE = 1000;

  const { textoDaVoz, Veio, ConexaoAnki, ConexaoNaTela, Configuracao, Abridor, ConversaComOAbridor, RetratoDosPassos, PecasDosPassos } = raiz;
  const { elemento } = Veio;
  const { SITUACAO: CONEXAO } = ConexaoAnki;
  const { SITUACAO } = Configuracao;
  const { PASSO, PASSOS } = RetratoDosPassos;

  const { FASE, EVENTO } = ConversaComOAbridor;
  let abridor = ConversaComOAbridor.inicial();
  const ouvintesDoAbridor = new Set();
  let abridorIniciado = false;

  function despacharAoAbridor(tipo, dados = {}) {
    const antes = abridor;
    abridor = ConversaComOAbridor.proxima(abridor, { tipo, ...dados });
    if (abridor === antes) return;
    ouvintesDoAbridor.forEach(ouvinte => ouvinte());
    if (abridor.fase === antes.fase) return;
    if (abridor.fase === FASE.LENDO) {
      Abridor.temPermissao().catch(() => false).then(tem => despacharAoAbridor(EVENTO.PERMISSAO, { tem }));
    } else if (abridor.fase === FASE.PROCURANDO) {
      Abridor.conferirOAnki().then(async ({ resultado, detalhe }) => {
        if (resultado !== Abridor.RESULTADO.SEM_PERMISSAO && abridor.agoraNao) await Abridor.guardarAgoraNao(false);
        despacharAoAbridor(EVENTO.CONFERIU, { resultado, detalhe });
      });
    }
  }

  const abridorResolvido = () => ConversaComOAbridor.resolvido(abridor);

  function iniciarOAbridor() {
    if (abridorIniciado) return;
    abridorIniciado = true;
    Abridor.lerAgoraNao().then(valor => despacharAoAbridor(EVENTO.AGORA_NAO, { valor }), () => {});
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area === 'local' && 'pm_abridor' in mudancas) despacharAoAbridor(EVENTO.AGORA_NAO, { valor: mudancas.pm_abridor.newValue?.agoraNao === true });
    });
  }

  function pedirAPermissao() {
    if (abridor.fase !== FASE.PEDIR) return;
    const pedido = Abridor.pedirPermissao();
    despacharAoAbridor(EVENTO.PERMITIR);
    pedido.then(dada => despacharAoAbridor(EVENTO.RESPONDEU, { dada }));
  }

  function dizerAgoraNao() {
    despacharAoAbridor(EVENTO.AGORA_NAO, { valor: true });
    Abridor.guardarAgoraNao(true);
  }

  function textoDeAchei() {
    const { perfil, versao } = ConexaoAnki.saude() ?? {};
    return [
      textoDaVoz('ONB-16.achei'),
      perfil,
      versao && textoDaVoz('ONB-16.acheiVersao', { versao }),
    ].filter(Boolean).join(' · ');
  }

  const comoEstaAConexao = tela => ({
    ...tela.estado,
    situacao: ConexaoAnki.situacao(),
    jaConectou: ConexaoAnki.jaConectou(),
  });

  const indiceAberto = tela => RetratoDosPassos.cartaoAberto(comoEstaAConexao(tela)).aberto;

  function abrirPasso(tela, passoId) {
    tela.estado.escolha = passoId;
    desenhar(tela);
    tela.cabecalho.titulo.focus();
  }

  const focoAoSair = tela => tela.opcoes.aoSairOBotao?.() ?? tela.cabecalho.titulo;

  function desenharAEspera(tela) {
    const ligada = ConexaoAnki.situacao() === CONEXAO.LIGADA;
    const { escondida, ...espera } = RetratoDosPassos.espera(tela.estado, { ligada, agora: Date.now() });
    Object.assign(tela.estado, espera);
    tela.semResposta.hidden = escondida;
  }

  function desenharAsMarcas(tela, retrato) {
    RetratoDosPassos.marcasDosPassos(retrato).forEach(({ situacao, atual, leitor }, i) => {
      const { botao: item, marca, leitor: falado } = tela.marcas[i];
      if (atual) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
      marca.dataset.situacao = situacao;
      marca.classList.toggle('bv-marca--atual', atual);
      marca.replaceChildren(...(situacao === SITUACAO.FEITO ? [Veio.iconeVeio('certo')] : []));
      falado.textContent = leitor ? `, ${textoDaVoz(leitor)}` : '';
    });
  }

  function desenharOTitulo(tela, { aberto, passo, pronto }) {
    const { sobretitulo, titulo, texto } = tela.cabecalho;
    sobretitulo.textContent = pronto ? textoDaVoz('ONB-16.pronto')
      : `${textoDaVoz('ONB-16.passos')} · ${textoDaVoz('ONB-03.passo', { n: aberto + 1, total: PASSOS.length })}`;
    titulo.textContent = pronto ? ConexaoNaTela.texto(CONEXAO.LIGADA) : textoDaVoz(passo.titulo);
    texto.textContent = pronto ? textoDaVoz('ONB-16.prontoApoio') : textoDaVoz(passo.texto);
  }

  function desenharOStatus(tela, retrato) {
    const { bloco, status, ponto, texto, tentar } = tela.conexao;
    bloco.hidden = retrato.passo.id === PASSO.ANKI;
    const { esperando, exibida, mostrada, tentarSai } = RetratoDosPassos.statusDaConexao(retrato);
    status.classList.toggle('pc-status--espera', esperando);
    ConexaoNaTela.pintarPonto(ponto, esperando ? '' : mostrada);
    if (esperando) texto.textContent = textoDaVoz('ONB-16.esperando');
    else texto.textContent = mostrada === CONEXAO.LIGADA ? textoDeAchei() : ConexaoNaTela.texto(mostrada);
    ConexaoNaTela.pintarTentarDeNovo(tentar, exibida, { sai: tentarSai, focoPara: () => focoAoSair(tela) });
  }

  function falar(regiao, texto, lugar = regiao) {
    lugar.textContent = texto || '';
    regiao.classList.toggle('veio-so-leitor', !texto);
  }

  function desenharOAnki(tela, { passo, pronto }) {
    const { bloco, jaTenho, naoTenho, doDownload, resultado } = tela.anki;
    bloco.hidden = pronto || passo.id !== PASSO.ANKI;
    if (bloco.hidden) return;
    const { escolha, doAbridor } = tela.resposta;
    jaTenho.setAttribute('aria-pressed', String(escolha === RESPOSTA.JA_TENHO));
    naoTenho.setAttribute('aria-pressed', String(escolha === RESPOSTA.NAO_TENHO));
    doDownload.hidden = escolha !== RESPOSTA.NAO_TENHO;
    falar(resultado, doAbridor && textoDaVoz(doAbridor));
  }

  function trocarOAvisoDoAbridor(tela, { causa, texto }) {
    const doAbridor = tela.abridor;
    if (doAbridor.aviso?.dataset.causa === causa) return;
    doAbridor.aviso?.remove();
    doAbridor.aviso = null;
    doAbridor.tentar = null;
    if (!causa) return;
    doAbridor.aviso = Veio.montarAviso({
      texto: textoDaVoz(texto), detalhes: causa, fechavel: false,
      acao: { rotulo: textoDaVoz('ENV-01.tentarDeNovo'), aoUsar: () => despacharAoAbridor(EVENTO.TENTAR) },
    });
    doAbridor.aviso.dataset.causa = causa;
    doAbridor.tentar = doAbridor.aviso.querySelector('button');
    doAbridor.tentar.id = tela.id('abridor-tentar');
    doAbridor.bloco.insertBefore(doAbridor.aviso, doAbridor.acoes);
  }

  function desenharOAbridor(tela, retrato) {
    const { bloco, status, ponto, texto, permitir, agoraNao, acoes, tentar } = tela.abridor;
    const noCard = RetratoDosPassos.abridorNoCard(abridor, retrato);
    bloco.hidden = noCard.escondido;
    falar(status, noCard.falado && textoDaVoz(noCard.falado), texto);
    ponto.dataset.estado = noCard.ponto;

    const { botoes } = noCard;
    const comFoco = [permitir, tentar, agoraNao].find(cada => cada === document.activeElement);
    permitir.hidden = !botoes.permitir;
    permitir.setAttribute('aria-disabled', String(botoes.ocupado));
    if (tentar) tentar.hidden = !botoes.tentar;
    agoraNao.hidden = !botoes.agoraNao;
    acoes.hidden = permitir.hidden && agoraNao.hidden;
    if (comFoco?.hidden && !bloco.hidden) focoAoSair(tela).focus();

    trocarOAvisoDoAbridor(tela, noCard);
  }

  function desenhar(tela, { pronto = tela.estado.pronto } = {}) {
    tela.estado.pronto = pronto;
    const conexao = comoEstaAConexao(tela);
    const retrato = { ...conexao, ...RetratoDosPassos.cartaoAberto(conexao), conversa: abridor };
    desenharAsMarcas(tela, retrato);
    desenharOTitulo(tela, retrato);
    tela.doArquivo.hidden = pronto || retrato.passo.id !== PASSO.ARQUIVO;
    desenharOAnki(tela, retrato);
    desenharOStatus(tela, retrato);
    desenharOAbridor(tela, retrato);
    const { rodape, voltar, continuar } = tela.navegacao;
    rodape.hidden = !tela.opcoes.navegacao || pronto;
    voltar.hidden = retrato.aberto <= 0;
    continuar.hidden = retrato.aberto >= PASSOS.length - 1;
    desenharAEspera(tela);
  }

  function responder(tela, escolha, doAbridor = null) {
    Object.assign(tela.resposta, { escolha, doAbridor });
    desenhar(tela);
  }

  async function oAbridorAbreOAnki() {
    const { resultado } = await Abridor.abrirOAnki().catch(() => ({ resultado: null }));
    return resultado === Abridor.RESULTADO.ABRIU;
  }

  async function avisarQueOAnkiVaiAbrir(tela) {
    if (await Abridor.temPermissao().catch(() => false) && tela.resposta.escolha === RESPOSTA.JA_TENHO) {
      responder(tela, RESPOSTA.JA_TENHO, 'ONB-18.abrindo');
    }
  }

  async function responderJaTenho(tela) {
    const { resposta } = tela;
    if (resposta.conversando && resposta.escolha === RESPOSTA.JA_TENHO) return;
    responder(tela, RESPOSTA.JA_TENHO);
    if (resposta.conversando) return;
    resposta.conversando = true;
    await avisarQueOAnkiVaiAbrir(tela);
    const abriu = await oAbridorAbreOAnki().finally(() => { resposta.conversando = false; });
    if (resposta.escolha !== RESPOSTA.JA_TENHO) return;
    responder(tela, RESPOSTA.JA_TENHO, abriu ? 'ONB-18.abrindo' : 'ONB-18.manual');
  }

  function aoMudarAConexao(tela, situacao) {
    const { estado } = tela;
    if (situacao === CONEXAO.LIGADA && estado.ultimaSituacao !== CONEXAO.LIGADA) {
      estado.ligou = true;
      if (!abridorResolvido()) estado.escolha = null;
      Object.assign(tela.resposta, { escolha: null, doAbridor: null });
      despacharAoAbridor(EVENTO.LIGOU);
    }
    estado.ultimaSituacao = situacao;
    desenhar(tela);
  }

  function aoMudarOAbridor(tela) {
    desenhar(tela);
    const resolvido = abridorResolvido();
    if (resolvido && !tela.estado.resolvido) tela.opcoes.aoResolverOAbridor?.();
    tela.estado.resolvido = resolvido;
  }

  function estadoInicial() {
    return {
      ultimaSituacao: null, ligou: false, resolvido: abridorResolvido(), escolha: null, pronto: false,
      visivel: false, conferindo: ConexaoAnki.conferindo(), esperandoDesde: null, semResposta: false,
    };
  }

  function montarAsPecas(tela, destaque) {
    const { id, estado } = tela;
    Object.assign(tela, PecasDosPassos.montarALista(passoId => abrirPasso(tela, passoId)));
    tela.cabecalho = PecasDosPassos.montarOTitulo(id);
    tela.anki = PecasDosPassos.montarOAnki(id, destaque);
    tela.doArquivo = PecasDosPassos.montarOArquivo(destaque, () => { if (estado.esperandoDesde === null) estado.esperandoDesde = Date.now(); });
    tela.conexao = PecasDosPassos.montarAConexao(id, destaque, () => {
      estado.escolha = PASSO.TENTAR;
      ConexaoAnki.tentarDeNovo();
    });
    tela.abridor = PecasDosPassos.montarOAbridor(id, destaque, { aoPermitir: pedirAPermissao, aoDizerAgoraNao: dizerAgoraNao });
    tela.semResposta = PecasDosPassos.montarSemResposta();
    tela.navegacao = PecasDosPassos.montarANavegacao(id, passos => abrirPasso(tela, PASSOS[indiceAberto(tela) + passos].id));
  }

  function montar(lugar, { prefixo, navegacao = true, empilhado = false, aoSairOBotao = null, aoResolverOAbridor = null }) {
    iniciarOAbridor();
    const tela = {
      id: parte => `${prefixo}-${parte}`,
      opcoes: { navegacao, aoSairOBotao, aoResolverOAbridor },
      estado: estadoInicial(),
      resposta: { escolha: null, doAbridor: null, conversando: false },
    };
    montarAsPecas(tela, navegacao ? 'veio-botao--primario' : 'veio-botao--contorno');
    tela.anki.jaTenho.addEventListener('click', () => responderJaTenho(tela));
    tela.anki.naoTenho.addEventListener('click', () => responder(tela, RESPOSTA.NAO_TENHO));
    tela.navegacao.rodape.hidden = !navegacao;

    const { sobretitulo, titulo, texto } = tela.cabecalho;
    const controle = elemento('div', 'pc-controle', tela.anki.bloco, tela.doArquivo, tela.conexao.bloco, tela.abridor.bloco, tela.semResposta);
    const card = elemento('div', 'pc-card', sobretitulo, titulo, texto, controle, tela.navegacao.rodape);
    lugar.append(elemento('div', empilhado ? 'pc pc--empilhado' : 'pc', tela.lista, card));

    ConexaoAnki.acompanhar(situacao => aoMudarAConexao(tela, situacao));
    ouvintesDoAbridor.add(() => aoMudarOAbridor(tela));
    ConexaoAnki.aoConferir(conferindo => {
      tela.estado.conferindo = conferindo;
      if (conferindo) desenhar(tela);
    });
    setInterval(() => { if (tela.estado.visivel) desenharAEspera(tela); }, INTERVALO_DO_TIQUE);

    return {
      desenhar: opcoes => desenhar(tela, opcoes),
      mostrar(visivel) {
        tela.estado.visivel = visivel;
        if (visivel) desenharAEspera(tela);
      },
      focarTitulo: () => titulo.focus(),
      abridorResolvido,
    };
  }

  raiz.PassosDaConexao = { montar };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
