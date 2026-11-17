'use strict';

(function (raiz) {
  const PASSOS = [
    { id: 'anki', titulo: 'ONB-18.titulo', texto: 'ONB-18.texto' },
    { id: 'colocar', titulo: 'ONB-16.passo1Titulo', texto: 'ONB-16.passo1Texto' },
    { id: 'reiniciar', titulo: 'ONB-16.passo2Titulo', texto: 'ONB-16.passo2Texto' },
    { id: 'abridor', titulo: 'ONB-17.titulo', texto: 'ONB-17.texto' },
  ];
  const PASSO_DO_ANKI = 'anki';
  const PASSO_DO_ARQUIVO = 'colocar';
  const PASSO_DO_TENTAR = 'reiniciar';
  const PASSO_DO_ABRIDOR = 'abridor';
  const ARQUIVO_DA_CONEXAO = 'conexao/perpetualminer.ankiaddon';
  const NOME_DO_ARQUIVO = 'perpetualminer.ankiaddon';
  const PAGINA_DO_ANKI = 'https://apps.ankiweb.net/';
  const DEPOIS_DO_DOWNLOAD = Object.freeze({
    mac: 'ONB-18.depoisNoMac',
    windows: 'ONB-18.depoisNoWindows',
    outro: 'ONB-18.depois',
  });
  const RESPOSTA = Object.freeze({ JA_TENHO: 'ja', NAO_TENHO: 'nao' });
  const SEM_RESPOSTA_MS = 2 * 60 * 1000;
  const INTERVALO_DO_TIQUE = 1000;
  const ITENS_DO_CHECKLIST = ['ONB-16.confira1', 'ONB-16.confira2', 'ONB-16.confira3'];

  const { textoDaVoz, Veio, ConexaoAnki, ConexaoNaTela, Configuracao, Abridor, ConversaComOAbridor } = raiz;
  const { elemento } = Veio;
  const { SITUACAO: CONEXAO } = ConexaoAnki;
  const { SITUACAO } = Configuracao;

  function depoisDoDownloadDestaPessoa() {
    const plataforma = navigator.userAgentData?.platform ?? navigator.userAgent;
    if (/mac/i.test(plataforma)) return DEPOIS_DO_DOWNLOAD.mac;
    if (/win/i.test(plataforma)) return DEPOIS_DO_DOWNLOAD.windows;
    return DEPOIS_DO_DOWNLOAD.outro;
  }

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

  /** Permitir abrir o Anki: o aviso do Chrome sai já no clique (o pedido precisa do gesto da pessoa). */
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

  const PONTO_DA_FASE = Object.freeze({
    [FASE.PEDINDO]: CONEXAO.CONECTANDO,
    [FASE.PROCURANDO]: CONEXAO.CONECTANDO,
    [FASE.ACHOU]: CONEXAO.LIGADA,
    [FASE.NAO_ACHOU]: CONEXAO.DESLIGADA,
    [FASE.SEM_ABRIDOR]: CONEXAO.DESLIGADA,
  });
  const TEXTO_DA_FASE = Object.freeze({
    [FASE.PEDINDO]: 'ONB-17.pedindo',
    [FASE.PROCURANDO]: 'ONB-17.procurando',
    [FASE.ACHOU]: 'ONB-17.achou',
    [FASE.NAO_ACHOU]: 'ONB-17.naoAchou',
    [FASE.SEM_ABRIDOR]: 'ONB-17.semAbridor',
  });

  function montar(lugar, { prefixo, navegacao = true, empilhado = false, aoSairOBotao = null, aoResolverOAbridor = null }) {
    iniciarOAbridor();
    const id = parte => `${prefixo}-${parte}`;
    const estado = {
      ultimaSituacao: null,
      ligou: false,
      resolvido: abridorResolvido(),
      escolha: null,
      pronto: false,
      visivel: false,
      conferindo: ConexaoAnki.conferindo(),
      esperandoDesde: null,
      semResposta: false,
    };
    const marcas = [];

    const itens = elemento('ol', 'bv-lista__itens');
    PASSOS.forEach((passo, i) => {
      const marca = elemento('span', 'bv-marca');
      marca.setAttribute('aria-hidden', 'true');
      marca.dataset.numero = String(i + 1);
      const leitor = elemento('span', 'veio-so-leitor');
      const botao = elemento('button', 'bv-lista__item', marca, elemento('span', null, textoDaVoz(passo.titulo)), leitor);
      botao.type = 'button';
      botao.addEventListener('click', () => abrirPasso(passo.id));
      marcas.push({ botao, marca, leitor });
      itens.append(elemento('li', null, botao));
    });
    const lista = elemento('nav', 'pc-lista', itens);
    lista.setAttribute('aria-label', textoDaVoz('ONB-16.passos'));

    const sobretitulo = elemento('p', 'bv-sobretitulo');
    const titulo = elemento('h3', 'bv-titulo');
    titulo.id = id('passo-titulo');
    titulo.tabIndex = -1;
    const texto = elemento('p', 'bv-texto');

    const destaque = navegacao ? 'veio-botao--primario' : 'veio-botao--contorno';
    const botaoDeLink = (rotulo, endereco, classe = `veio-botao ${destaque}`) => {
      const link = elemento('a', classe, rotulo);
      link.href = endereco;
      return link;
    };
    /** O arquivo da Conexão vem do próprio pacote da extensão (o Chrome não pede permissão). */
    const botaoDoArquivo = (rotulo, classe) => {
      const link = botaoDeLink(rotulo, chrome.runtime.getURL(ARQUIVO_DA_CONEXAO), classe);
      link.download = NOME_DO_ARQUIVO;
      return link;
    };
    const baixar = botaoDoArquivo(textoDaVoz('ONB-16.baixar'));
    baixar.addEventListener('click', () => { if (estado.esperandoDesde === null) estado.esperandoDesde = Date.now(); });

    const dialogoDoAnki = comOClique => {
      const quadro = elemento('div', `pc-animacao__quadro${comOClique ? ' pc-animacao__quadro--clique' : ''}`);
      quadro.setAttribute('aria-hidden', 'true');
      const botoes = elemento('div', 'pc-dialogo__botoes',
        elemento('span', 'pc-dialogo__botao pc-dialogo__botao--sim', textoDaVoz('ONB-19.sim')),
        elemento('span', 'pc-dialogo__botao', textoDaVoz('ONB-19.nao')));
      quadro.append(elemento('div', 'pc-dialogo',
        elemento('p', 'pc-dialogo__titulo', textoDaVoz('ONB-19.janela')),
        elemento('p', 'pc-dialogo__texto', textoDaVoz('ONB-19.aviso')), botoes));
      return quadro;
    };
    const aAnimacao = elemento('figure', 'pc-animacao',
      elemento('div', 'pc-animacao__quadros', dialogoDoAnki(false), dialogoDoAnki(true)),
      elemento('figcaption', 'pc-animacao__legenda', textoDaVoz('ONB-19.legenda')));

    const codigo = raiz.AnkiWeb?.codigo ?? null;
    const detalhes = Veio.montarDetalhes(
      codigo === null ? textoDaVoz('ONB-16.codigoEmBreve') : textoDaVoz('ONB-16.codigoDoAnkiWeb', { codigo }),
      document, textoDaVoz('ONB-16.arquivoNaoAbriu'));
    const doArquivo = elemento('div', 'pc-arquivo', aAnimacao, baixar, detalhes);

    const perguntaDoAnki = elemento('p', 'pc-anki__pergunta', textoDaVoz('ONB-18.pergunta'));
    const botaoDeResposta = (rotulo, parte) => {
      const botao = elemento('button', 'veio-botao veio-botao--contorno veio-botao--compacto', textoDaVoz(rotulo));
      botao.id = id(parte);
      botao.type = 'button';
      return botao;
    };
    const jaTenho = botaoDeResposta('ONB-18.jaTenho', 'anki-ja-tenho');
    const naoTenho = botaoDeResposta('ONB-18.naoTenho', 'anki-nao-tenho');
    const respostasDoAnki = elemento('div', 'pc-anki__respostas', jaTenho, naoTenho);

    const baixarOAnki = botaoDeLink(textoDaVoz('ONB-18.baixar'), PAGINA_DO_ANKI);
    baixarOAnki.id = id('anki-baixar');
    baixarOAnki.target = '_blank';
    baixarOAnki.rel = 'noopener';
    const depoisDoDownload = elemento('p', 'pc-anki__depois', textoDaVoz(depoisDoDownloadDestaPessoa()));
    const doDownloadDoAnki = elemento('div', 'pc-anki__download', baixarOAnki, depoisDoDownload);
    if (depoisDoDownloadDestaPessoa() === DEPOIS_DO_DOWNLOAD.mac) depoisDoDownload.before(raiz.DesenhoDoArraste.montar());

    const resultadoDoAnki = elemento('p', 'pc-anki__resultado');
    resultadoDoAnki.id = id('anki-resultado');
    resultadoDoAnki.setAttribute('aria-live', 'polite');
    const blocoDoAnki = elemento('div', 'pc-anki', perguntaDoAnki, respostasDoAnki, doDownloadDoAnki, resultadoDoAnki);
    doDownloadDoAnki.hidden = true;

    const anki = { escolha: null, doAbridor: null };
    const definirResposta = (escolha, doAbridor = null) => Object.assign(anki, { escolha, doAbridor });

    async function oAbridorAbreOAnki() {
      const { resultado } = await Abridor.abrirOAnki().catch(() => ({ resultado: null }));
      return resultado === Abridor.RESULTADO.ABRIU;
    }

    let conversandoComOAbridor = false;

    async function responderJaTenho() {
      if (conversandoComOAbridor && anki.escolha === RESPOSTA.JA_TENHO) return;
      definirResposta(RESPOSTA.JA_TENHO);
      desenhar();
      if (conversandoComOAbridor) return;
      conversandoComOAbridor = true;
      if (await Abridor.temPermissao().catch(() => false) && anki.escolha === RESPOSTA.JA_TENHO) {
        definirResposta(RESPOSTA.JA_TENHO, 'ONB-18.abrindo');
        desenhar();
      }
      const abriu = await oAbridorAbreOAnki().finally(() => { conversandoComOAbridor = false; });
      if (anki.escolha !== RESPOSTA.JA_TENHO) return;
      definirResposta(RESPOSTA.JA_TENHO, abriu ? 'ONB-18.abrindo' : 'ONB-18.manual');
      desenhar();
    }

    function responderNaoTenho() {
      definirResposta(RESPOSTA.NAO_TENHO);
      desenhar();
    }

    jaTenho.addEventListener('click', responderJaTenho);
    naoTenho.addEventListener('click', responderNaoTenho);

    const ponto = elemento('span', 'bv-ponto');
    ponto.id = id('ponto');
    ponto.setAttribute('aria-hidden', 'true');
    const textoDoStatus = elemento('span');
    textoDoStatus.id = id('status-texto');
    const status = elemento('p', 'bv-status', ponto, textoDoStatus);
    status.id = id('status');
    status.setAttribute('role', 'status');
    const tentar = elemento('button', `veio-botao ${destaque} veio-botao--compacto`, textoDaVoz('ENV-01.tentarDeNovo'));
    tentar.id = id('tentar');
    tentar.type = 'button';
    ConexaoNaTela.ligarTentarDeNovo(tentar, () => {
      estado.escolha = PASSO_DO_TENTAR;
      ConexaoAnki.tentarDeNovo();
    });
    const conexao = elemento('div', 'bv-conexao', status, tentar, elemento('div', 'pc-pareamento'));

    const pontoDoAbridor = elemento('span', 'bv-ponto');
    pontoDoAbridor.setAttribute('aria-hidden', 'true');
    const textoDoAbridor = elemento('span');
    const statusDoAbridor = elemento('p', 'bv-status', pontoDoAbridor, textoDoAbridor);
    statusDoAbridor.id = id('abridor-status');
    statusDoAbridor.setAttribute('aria-live', 'polite');
    const botaoDoAbridor = (parte, classe, rotulo, aoApertar) => {
      const botao = elemento('button', `veio-botao ${classe} veio-botao--compacto`, rotulo);
      botao.id = id(parte);
      botao.type = 'button';
      botao.addEventListener('click', () => { if (botao.getAttribute('aria-disabled') !== 'true') aoApertar(); });
      return botao;
    };
    const permitir = botaoDoAbridor('permitir', destaque, textoDaVoz('ONB-17.permitir'), pedirAPermissao);
    let tentarOAbridor = null;
    const agoraNao = botaoDoAbridor('agora-nao', 'veio-botao--contorno', textoDaVoz('ONB-04.agoraNao'), dizerAgoraNao);
    const acoesDoAbridor = elemento('div', 'pc-abridor__acoes', permitir, agoraNao);
    let avisoDoAbridor = null;
    const blocoDoAbridor = elemento('div', 'pc-abridor', statusDoAbridor, acoesDoAbridor);

    const baixarDeNovo = botaoDoArquivo(textoDaVoz('ONB-16.baixarDeNovo'),
      'veio-botao veio-botao--contorno veio-botao--compacto');
    const checklist = elemento('ul', 'pc-checklist', ...ITENS_DO_CHECKLIST.map(item => elemento('li', null, textoDaVoz(item))));
    const semResposta = elemento('div', 'pc-sem-resposta',
      elemento('p', 'pc-sem-resposta__texto', textoDaVoz('ONB-16.semResposta')), checklist, baixarDeNovo);
    semResposta.hidden = true;

    const controle = elemento('div', 'pc-controle', blocoDoAnki, doArquivo, conexao, blocoDoAbridor, semResposta);

    const voltar = elemento('button', 'veio-botao veio-botao--contorno', textoDaVoz('ONB-04.voltar'));
    voltar.id = id('voltar');
    voltar.type = 'button';
    voltar.addEventListener('click', () => abrirPasso(PASSOS[indiceAberto() - 1].id));
    const continuar = elemento('button', 'veio-botao veio-botao--contorno', textoDaVoz('ONB-04.continuar'));
    continuar.id = id('continuar');
    continuar.type = 'button';
    continuar.addEventListener('click', () => abrirPasso(PASSOS[indiceAberto() + 1].id));
    const rodape = elemento('div', 'pc-navegacao', voltar, continuar);
    rodape.hidden = !navegacao;

    const card = elemento('div', 'pc-card', sobretitulo, titulo, texto, controle, rodape);
    lugar.append(elemento('div', empilhado ? 'pc pc--empilhado' : 'pc', lista, card));

    const indice = passoId => PASSOS.findIndex(p => p.id === passoId);

    function passoAberto() {
      if (estado.pronto) return PASSOS[PASSOS.length - 1].id;
      if (estado.escolha !== null) return estado.escolha;
      const situacao = ConexaoAnki.apresentada();
      if (situacao === CONEXAO.LIGADA) return PASSO_DO_ABRIDOR;
      if (situacao !== CONEXAO.DESLIGADA) return PASSO_DO_TENTAR;
      return estado.ligou || ConexaoAnki.jaConectou() ? PASSO_DO_TENTAR : PASSOS[0].id;
    }
    const indiceAberto = () => indice(passoAberto());

    function abrirPasso(passoId) {
      estado.escolha = passoId;
      desenhar();
      titulo.focus();
    }

    function desenharAEspera() {
      const ligada = ConexaoAnki.situacao() === CONEXAO.LIGADA;
      if (ligada) {
        estado.esperandoDesde = null;
        estado.semResposta = false;
      } else {
        if (estado.visivel && estado.esperandoDesde === null) estado.esperandoDesde = Date.now();
        if (estado.esperandoDesde !== null && Date.now() - estado.esperandoDesde >= SEM_RESPOSTA_MS) estado.semResposta = true;
      }
      semResposta.hidden = !estado.semResposta || estado.pronto || ligada;
    }

    function desenhar({ pronto = estado.pronto } = {}) {
      estado.pronto = pronto;
      const aberto = pronto ? -1 : indiceAberto();
      const passoDoCard = PASSOS[pronto ? indice(PASSO_DO_ABRIDOR) : aberto];
      const situacao = ConexaoAnki.apresentada();
      const conectando = situacao === CONEXAO.CONECTANDO;
      const exibida = estado.conferindo && situacao === CONEXAO.DESLIGADA && passoDoCard.id === PASSO_DO_TENTAR
        ? CONEXAO.CONECTANDO : situacao;
      const conectou = pronto || situacao === CONEXAO.LIGADA;
      const situacaoDoPasso = passo => {
        if (passo.id !== PASSO_DO_ABRIDOR) return conectou ? SITUACAO.FEITO : '';
        if (abridor.fase === FASE.ACHOU) return SITUACAO.FEITO;
        return abridor.agoraNao ? SITUACAO.AGORA_NAO : '';
      };
      const LEITOR = { [SITUACAO.FEITO]: 'ONB-13.feito', [SITUACAO.AGORA_NAO]: 'ONB-13.agoraNao' };

      marcas.forEach(({ botao, marca, leitor }, i) => {
        const doPasso = situacaoDoPasso(PASSOS[i]);
        if (i === aberto) botao.setAttribute('aria-current', 'step');
        else botao.removeAttribute('aria-current');
        marca.dataset.situacao = doPasso;
        marca.classList.toggle('bv-marca--atual', i === aberto);
        marca.replaceChildren(...(doPasso === SITUACAO.FEITO ? [Veio.iconeVeio('certo')] : []));
        leitor.textContent = doPasso ? `, ${textoDaVoz(LEITOR[doPasso])}` : '';
      });

      sobretitulo.textContent = pronto ? textoDaVoz('ONB-16.pronto')
        : `${textoDaVoz('ONB-16.passos')} · ${textoDaVoz('ONB-03.passo', { n: aberto + 1, total: PASSOS.length })}`;
      titulo.textContent = pronto ? ConexaoNaTela.texto(CONEXAO.LIGADA) : textoDaVoz(passoDoCard.titulo);
      texto.textContent = pronto ? textoDaVoz('ONB-16.prontoApoio') : textoDaVoz(passoDoCard.texto);
      doArquivo.hidden = pronto || passoDoCard.id !== PASSO_DO_ARQUIVO;
      desenharOAnki(passoDoCard, pronto);

      conexao.hidden = passoDoCard.id === PASSO_DO_ANKI;

      const esperando = !pronto && passoDoCard.id === PASSO_DO_ARQUIVO && situacao === CONEXAO.DESLIGADA;
      status.classList.toggle('pc-status--espera', esperando);
      const mostrada = pronto && !conectando ? CONEXAO.LIGADA : exibida;
      ConexaoNaTela.pintarPonto(ponto, esperando ? '' : mostrada);
      textoDoStatus.textContent = esperando ? textoDaVoz('ONB-16.esperando')
        : mostrada === CONEXAO.LIGADA ? textoDeAchei() : ConexaoNaTela.texto(mostrada);

      ConexaoNaTela.pintarTentarDeNovo(tentar, exibida, {
        sai: pronto || ![CONEXAO.CONECTANDO, CONEXAO.DESLIGADA].includes(situacao) || passoDoCard.id !== PASSO_DO_TENTAR,
        focoPara: () => aoSairOBotao?.() ?? titulo,
      });

      desenharOAbridor(passoDoCard, pronto, situacao);

      rodape.hidden = !navegacao || pronto;
      voltar.hidden = aberto <= 0;
      continuar.hidden = aberto >= PASSOS.length - 1;
      desenharAEspera();
      raiz.ConexaoVersao?.reposicionar();
    }

    /** Região viva: nunca `hidden` (o leitor não fala o que chega com ela); vazia, só sai da vista. */
    function falar(regiao, texto, lugar = regiao) {
      lugar.textContent = texto || '';
      regiao.classList.toggle('veio-so-leitor', !texto);
    }

    function desenharOAnki(passoDoCard, pronto) {
      blocoDoAnki.hidden = pronto || passoDoCard.id !== PASSO_DO_ANKI;
      if (blocoDoAnki.hidden) return;
      jaTenho.setAttribute('aria-pressed', String(anki.escolha === RESPOSTA.JA_TENHO));
      naoTenho.setAttribute('aria-pressed', String(anki.escolha === RESPOSTA.NAO_TENHO));
      doDownloadDoAnki.hidden = anki.escolha !== RESPOSTA.NAO_TENHO;
      falar(resultadoDoAnki, anki.doAbridor && textoDaVoz(anki.doAbridor));
    }

    function desenharOAbridor(passoDoCard, pronto, situacao) {
      const { fase } = abridor;
      blocoDoAbridor.hidden = passoDoCard.id !== PASSO_DO_ABRIDOR || fase === FASE.ANTES || fase === FASE.LENDO
        || (!pronto && situacao !== CONEXAO.LIGADA);

      const semPermissao = fase === FASE.PEDIR && (abridor.agoraNao || abridor.recusada);
      const textoAgora = TEXTO_DA_FASE[fase] ?? (semPermissao ? 'ONB-17.semPermissao' : null);
      const problema = fase === FASE.NAO_ACHOU || fase === FASE.SEM_ABRIDOR;
      falar(statusDoAbridor, textoAgora && !problema && textoDaVoz(textoAgora), textoDoAbridor);
      pontoDoAbridor.dataset.estado = PONTO_DA_FASE[fase] ?? '';

      const botoes = ConversaComOAbridor.acoes(abridor);
      const comFoco = [permitir, tentarOAbridor, agoraNao].find(botao => botao === document.activeElement);
      permitir.hidden = pronto || !botoes.permitir;
      permitir.setAttribute('aria-disabled', String(botoes.ocupado));
      if (tentarOAbridor) tentarOAbridor.hidden = pronto || !botoes.tentar;
      agoraNao.hidden = pronto || !botoes.agoraNao;
      acoesDoAbridor.hidden = permitir.hidden && agoraNao.hidden;
      if (comFoco?.hidden && !blocoDoAbridor.hidden) (aoSairOBotao?.() ?? titulo).focus();

      const causa = problema && !pronto
        ? (fase === FASE.NAO_ACHOU ? '{"achou":false}' : abridor.detalhe) : '';
      if (avisoDoAbridor?.dataset.causa !== causa) {
        avisoDoAbridor?.remove();
        avisoDoAbridor = null;
        tentarOAbridor = null;
        if (causa) {
          avisoDoAbridor = Veio.montarAviso({
            texto: textoDaVoz(textoAgora), detalhes: causa, fechavel: false,
            acao: { rotulo: textoDaVoz('ENV-01.tentarDeNovo'), aoUsar: () => despacharAoAbridor(EVENTO.TENTAR) },
          });
          avisoDoAbridor.dataset.causa = causa;
          tentarOAbridor = avisoDoAbridor.querySelector('button');
          tentarOAbridor.id = id('abridor-tentar');
          blocoDoAbridor.insertBefore(avisoDoAbridor, acoesDoAbridor);
        }
      }
    }

    ConexaoAnki.acompanhar(situacao => {
      if (situacao === CONEXAO.LIGADA && estado.ultimaSituacao !== CONEXAO.LIGADA) {
        estado.ligou = true;
        if (!abridorResolvido()) estado.escolha = null;
        definirResposta(null);
        despacharAoAbridor(EVENTO.LIGOU);
      }
      estado.ultimaSituacao = situacao;
      desenhar();
    });
    ouvintesDoAbridor.add(() => {
      desenhar();
      const resolvido = abridorResolvido();
      if (resolvido && !estado.resolvido) aoResolverOAbridor?.();
      estado.resolvido = resolvido;
    });
    ConexaoAnki.aoConferir(conferindo => {
      estado.conferindo = conferindo;
      if (conferindo) desenhar();
    });
    setInterval(() => { if (estado.visivel) desenharAEspera(); }, INTERVALO_DO_TIQUE);

    return {
      desenhar,
      mostrar(visivel) {
        estado.visivel = visivel;
        if (visivel) desenharAEspera();
      },
      focarTitulo: () => titulo.focus(),
      abridorResolvido,
    };
  }

  raiz.PassosDaConexao = { montar };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
