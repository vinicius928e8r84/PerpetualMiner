'use strict';

(function (raiz) {
  const ARQUIVO_DA_CONEXAO = 'conexao/perpetualminer.ankiaddon';
  const NOME_DO_ARQUIVO = 'perpetualminer.ankiaddon';
  const PAGINA_DO_ANKI = 'https://apps.ankiweb.net/';
  const DEPOIS_DO_DOWNLOAD = Object.freeze({
    mac: 'ONB-18.depoisNoMac',
    windows: 'ONB-18.depoisNoWindows',
    outro: 'ONB-18.depois',
  });
  const ITENS_DO_CHECKLIST = ['ONB-16.confira1', 'ONB-16.confira2', 'ONB-16.confira3'];

  const { textoDaVoz, Veio, ConexaoNaTela, RetratoDosPassos } = raiz;
  const { elemento } = Veio;
  const { PASSOS } = RetratoDosPassos;

  function depoisDoDownloadDestaPessoa() {
    const plataforma = navigator.userAgentData?.platform ?? navigator.userAgent;
    if (/mac/i.test(plataforma)) return DEPOIS_DO_DOWNLOAD.mac;
    if (/win/i.test(plataforma)) return DEPOIS_DO_DOWNLOAD.windows;
    return DEPOIS_DO_DOWNLOAD.outro;
  }

  function botao(classe, id, ...filhos) {
    const novo = elemento('button', classe, ...filhos);
    if (id) novo.id = id;
    novo.type = 'button';
    return novo;
  }

  function botaoDeLink(rotulo, endereco, classe) {
    const link = elemento('a', classe, rotulo);
    link.href = endereco;
    return link;
  }

  function botaoDoArquivo(rotulo, classe) {
    const link = botaoDeLink(rotulo, chrome.runtime.getURL(ARQUIVO_DA_CONEXAO), classe);
    link.download = NOME_DO_ARQUIVO;
    return link;
  }

  function montarALista(aoAbrir) {
    const marcas = [];
    const itens = elemento('ol', 'bv-lista__itens');
    PASSOS.forEach((passo, i) => {
      const marca = elemento('span', 'bv-marca');
      marca.setAttribute('aria-hidden', 'true');
      marca.dataset.numero = String(i + 1);
      const leitor = elemento('span', 'veio-so-leitor');
      const item = botao('bv-lista__item', null, marca, elemento('span', null, textoDaVoz(passo.titulo)), leitor);
      item.addEventListener('click', () => aoAbrir(passo.id));
      marcas.push({ botao: item, marca, leitor });
      itens.append(elemento('li', null, item));
    });
    const lista = elemento('nav', 'pc-lista', itens);
    lista.setAttribute('aria-label', textoDaVoz('ONB-16.passos'));
    return { lista, marcas };
  }

  function dialogoDoAnki(comOClique) {
    const quadro = elemento('div', `pc-animacao__quadro${comOClique ? ' pc-animacao__quadro--clique' : ''}`);
    quadro.setAttribute('aria-hidden', 'true');
    const botoes = elemento('div', 'pc-dialogo__botoes',
      elemento('span', 'pc-dialogo__botao pc-dialogo__botao--sim', textoDaVoz('ONB-19.sim')),
      elemento('span', 'pc-dialogo__botao', textoDaVoz('ONB-19.nao')));
    quadro.append(elemento('div', 'pc-dialogo',
      elemento('p', 'pc-dialogo__titulo', textoDaVoz('ONB-19.janela')),
      elemento('p', 'pc-dialogo__texto', textoDaVoz('ONB-19.aviso')), botoes));
    return quadro;
  }

  function montarOArquivo(destaque, aoBaixar) {
    const baixar = botaoDoArquivo(textoDaVoz('ONB-16.baixar'), `veio-botao ${destaque}`);
    baixar.addEventListener('click', aoBaixar);
    const aAnimacao = elemento('figure', 'pc-animacao',
      elemento('div', 'pc-animacao__quadros', dialogoDoAnki(false), dialogoDoAnki(true)),
      elemento('figcaption', 'pc-animacao__legenda', textoDaVoz('ONB-19.legenda')));
    const codigo = raiz.AnkiWeb?.codigo ?? null;
    const detalhes = Veio.montarDetalhes(
      codigo === null ? textoDaVoz('ONB-16.codigoEmBreve') : textoDaVoz('ONB-16.codigoDoAnkiWeb', { codigo }),
      document, textoDaVoz('ONB-16.arquivoNaoAbriu'));
    return elemento('div', 'pc-arquivo', aAnimacao, baixar, detalhes);
  }

  function montarODownloadDoAnki(id, destaque) {
    const baixarOAnki = botaoDeLink(textoDaVoz('ONB-18.baixar'), PAGINA_DO_ANKI, `veio-botao ${destaque}`);
    baixarOAnki.id = id('anki-baixar');
    baixarOAnki.target = '_blank';
    baixarOAnki.rel = 'noopener';
    const depoisDoDownload = elemento('p', 'pc-anki__depois', textoDaVoz(depoisDoDownloadDestaPessoa()));
    const doDownloadDoAnki = elemento('div', 'pc-anki__download', baixarOAnki, depoisDoDownload);
    if (depoisDoDownloadDestaPessoa() === DEPOIS_DO_DOWNLOAD.mac) depoisDoDownload.before(raiz.DesenhoDoArraste.montar());
    doDownloadDoAnki.hidden = true;
    return doDownloadDoAnki;
  }

  function montarOAnki(id, destaque) {
    const resposta = (rotulo, parte) => botao('veio-botao veio-botao--contorno veio-botao--compacto', id(parte), textoDaVoz(rotulo));
    const jaTenho = resposta('ONB-18.jaTenho', 'anki-ja-tenho');
    const naoTenho = resposta('ONB-18.naoTenho', 'anki-nao-tenho');
    const doDownload = montarODownloadDoAnki(id, destaque);
    const resultado = elemento('p', 'pc-anki__resultado');
    resultado.id = id('anki-resultado');
    resultado.setAttribute('aria-live', 'polite');
    const bloco = elemento('div', 'pc-anki', elemento('p', 'pc-anki__pergunta', textoDaVoz('ONB-18.pergunta')),
      elemento('div', 'pc-anki__respostas', jaTenho, naoTenho), doDownload, resultado);
    return { bloco, jaTenho, naoTenho, doDownload, resultado };
  }

  function montarAConexao(id, destaque, aoTentar) {
    const ponto = elemento('span', 'bv-ponto');
    ponto.id = id('ponto');
    ponto.setAttribute('aria-hidden', 'true');
    const texto = elemento('span');
    texto.id = id('status-texto');
    const status = elemento('p', 'bv-status', ponto, texto);
    status.id = id('status');
    status.setAttribute('role', 'status');
    const tentar = botao(`veio-botao ${destaque} veio-botao--compacto`, id('tentar'), textoDaVoz('ENV-01.tentarDeNovo'));
    ConexaoNaTela.ligarTentarDeNovo(tentar, aoTentar);
    return { bloco: elemento('div', 'bv-conexao', status, tentar), status, ponto, texto, tentar };
  }

  function botaoDoAbridor(id, classe, rotulo, aoApertar) {
    const novo = botao(`veio-botao ${classe} veio-botao--compacto`, id, rotulo);
    novo.addEventListener('click', () => { if (novo.getAttribute('aria-disabled') !== 'true') aoApertar(); });
    return novo;
  }

  function montarOAbridor(id, destaque, { aoPermitir, aoDizerAgoraNao }) {
    const ponto = elemento('span', 'bv-ponto');
    ponto.setAttribute('aria-hidden', 'true');
    const texto = elemento('span');
    const status = elemento('p', 'bv-status', ponto, texto);
    status.id = id('abridor-status');
    status.setAttribute('aria-live', 'polite');
    const permitir = botaoDoAbridor(id('permitir'), destaque, textoDaVoz('ONB-17.permitir'), aoPermitir);
    const agoraNao = botaoDoAbridor(id('agora-nao'), 'veio-botao--contorno', textoDaVoz('ONB-04.agoraNao'), aoDizerAgoraNao);
    const acoes = elemento('div', 'pc-abridor__acoes', permitir, agoraNao);
    const bloco = elemento('div', 'pc-abridor', status, acoes);
    return { bloco, status, ponto, texto, permitir, agoraNao, acoes, aviso: null, tentar: null };
  }

  function montarSemResposta() {
    const baixarDeNovo = botaoDoArquivo(textoDaVoz('ONB-16.baixarDeNovo'), 'veio-botao veio-botao--contorno veio-botao--compacto');
    const checklist = elemento('ul', 'pc-checklist', ...ITENS_DO_CHECKLIST.map(item => elemento('li', null, textoDaVoz(item))));
    const semResposta = elemento('div', 'pc-sem-resposta',
      elemento('p', 'pc-sem-resposta__texto', textoDaVoz('ONB-16.semResposta')), checklist, baixarDeNovo);
    semResposta.hidden = true;
    return semResposta;
  }

  function montarANavegacao(id, aoAndar) {
    const voltar = botao('veio-botao veio-botao--contorno', id('voltar'), textoDaVoz('ONB-04.voltar'));
    voltar.addEventListener('click', () => aoAndar(-1));
    const continuar = botao('veio-botao veio-botao--contorno', id('continuar'), textoDaVoz('ONB-04.continuar'));
    continuar.addEventListener('click', () => aoAndar(1));
    return { rodape: elemento('div', 'pc-navegacao', voltar, continuar), voltar, continuar };
  }

  function montarOTitulo(id) {
    const titulo = elemento('h3', 'bv-titulo');
    titulo.id = id('passo-titulo');
    titulo.tabIndex = -1;
    return { sobretitulo: elemento('p', 'bv-sobretitulo'), titulo, texto: elemento('p', 'bv-texto') };
  }

  raiz.PecasDosPassos = Object.freeze({
    montarALista, montarOTitulo, montarOAnki, montarOArquivo, montarAConexao, montarOAbridor, montarSemResposta, montarANavegacao,
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
