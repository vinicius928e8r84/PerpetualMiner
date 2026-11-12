'use strict';

(function (raiz) {
  const { textoDaVoz, Atalhos, Veio, IDIOMAS, Configuracao, ConexaoAnki, Conta, PassosDaConexao, MineracaoAutomatica, MineracaoDoDia, PassoDoNivel, PassoDeMinerar, PassoDoPrimeiroEnvio, AjustesDeEnvio } = raiz;
  const { SITUACAO: CONEXAO } = ConexaoAnki;

  const ABERTURA = 'abertura';
  const PRONTO = 'pronto';

  /** O que cada passo tem nesta página: o valor do resumo, quando feito, e a tela dele. A ordem, o “opcional” e o feito são de `Configuracao.PASSOS`. */
  const DESTA_PAGINA = {
    minerar: {
      valor: e => textoDaVoz('PAI-05', { n: e.totalDeFrases }),
      montar: () => { passoDeMinerar = PassoDeMinerar.montar({ aoDefinirAtalho: () => irPara('atalho') }); return passoDeMinerar.no; },
    },
    atalho: {
      valor: e => Atalhos.rotuloDoAtalho(e.atalhoDeSelecao),
      montar: montarPasso2,
    },
    conta: {
      valor: e => e.conta.displayName || textoDaVoz('CFG-10'),
      montar: montarPasso3,
    },
    anki: {
      valor: () => textoDaVoz('ONB-13.ligada'),
      montar: montarPasso4,
    },
    ia: {
      valor: () => textoDaVoz('ONB-13.salva'),
      montar: montarPassoDaIA,
    },
    automatica: {
      // Os idiomas ligados, separados pelo “·” da Voz (V5).
      valor: e => [e.automatica.en && IDIOMAS.INGLES, e.automatica.ru && IDIOMAS.RUSSO]
        .filter(Boolean).join(' · '),
      montar: montarPasso6,
    },
    nivel: {
      valor: e => PassoDoNivel.valorDoResumo(e),
      montar: () => { passoDoNivel = PassoDoNivel.montar({ aoLigar: () => irPara('automatica') }); return passoDoNivel.no; },
    },
    chave: {
      valor: () => textoDaVoz('ONB-13.salva'),
      montar: montarPassoDaChave,
    },
    envio: {
      valor: () => textoDaVoz('ONB-13.enviado'),
      montar: () => {
        passoDoEnvio = PassoDoPrimeiroEnvio.montar({
          // A linha do Envio é a de Frases (painel.js), que lê a Palavra de `keywords`; a lista de Frases só o enche depois de carregar.
          linhaDaFrase: frase => { keywords[frase.id] ??= frase.keywords; return linhaParaOAnki(frase); },
          aoTrocarAChave: () => irPara('ia'),
          aoConcluir: () => irPara(PRONTO),
        });
        return passoDoEnvio.no;
      },
    },
  };
  const PASSOS = Configuracao.PASSOS.map(passo => ({ ...passo, ...DESTA_PAGINA[passo.id] }));
  const TELAS = [ABERTURA, ...PASSOS.map(p => p.id), PRONTO];
  const passoDa = tela => PASSOS.find(p => p.id === tela);

  /** A situação de um passo e a palavra dela no catálogo (ONB-13). */
  const { SITUACAO } = Configuracao;
  const TEXTO_DA_SITUACAO = {
    [SITUACAO.FEITO]: 'ONB-13.feito',
    [SITUACAO.AGORA_NAO]: 'ONB-13.agoraNao',
    [SITUACAO.FALTA]: 'ONB-13.falta',
  };

  const estado = {
    tela: ABERTURA,
    atalhos: { ...Atalhos.ATALHOS_PADRAO },
    configuracao: null,    // o retrato de Configuracao, depois da primeira leitura
    automatica: null,      // o estado da mineração automática, do service worker
  };

  /** Os idiomas da mineração automática, como no popup. */
  const IDIOMAS_DA_MINERACAO = [
    { chave: 'en', idioma: IDIOMAS.INGLES },
    { chave: 'ru', idioma: IDIOMAS.RUSSO },
  ];

  const porId = id => document.getElementById(id);
  const itensDaLista = new Map();   // tela → { botao, marca, situacao }
  const telas = new Map();          // tela → o corpo dela no card
  let passoDeMinerar = null;        // o passo 1 (painel-boas-vindas-minerar.js)
  let rodapeDesenhadoPara = null;   // a tela (e o Agora não) do rodapé na tela agora
  let passo4 = null;                // os passos da Conexão do passo 4 (painel-conexao-passos.js)
  let passo6 = null;                // as do passo 6: a nota, as linhas dos idiomas, a falha
  let ondeConseguirAChave = null;   // o “Onde conseguir a chave” (ONB-11) do passo do Gemini, só sem chave
  let passoDoNivel = null;          // o passo do nível (painel-boas-vindas-nivel.js)
  let passoDoEnvio = null;          // o passo do primeiro Envio (painel-boas-vindas-envio.js)

  function iniciarBoasVindas() {
    montarLista();
    montarTelas();
    // A Conexão chega à Configuracao pelo ConexaoAnki, sem depender de outra página do painel.
    Configuracao.acompanhar(retrato => {
      estado.configuracao = retrato;
      desenhar();
    });
    // O atalho de legenda do passo 1 (o de seleção vem no retrato).
    Atalhos.acompanharAtalhos(atalhos => {
      estado.atalhos = atalhos;
      desenhar();
    });
    ConexaoAnki.acompanhar(desenharPasso6);
    AjustesDeEnvio.acompanhar(() => desenhar());   // o nível salvo, aqui ou em outra aba, é o do campo de cada idioma
    lerMineracaoAutomatica();
    window.addEventListener('hashchange', () => mostrarTelaDoEndereco({ focar: true }));
    mostrarTelaDoEndereco({ focar: false });
  }

  /** A tela que o endereço pede; fora de #boas-vindas, nada muda. */
  function mostrarTelaDoEndereco({ focar }) {
    const [area, parte] = location.hash.replace(/^#/, '').split('/');
    if (area !== 'boas-vindas') return;
    estado.tela = TELAS.includes(parte) ? parte : ABERTURA;
    desenhar();
    window.scrollTo(0, 0);
    if (focar) porId('bv-titulo').focus();
  }

  function irPara(tela) {
    location.hash = tela === ABERTURA ? '#boas-vindas' : `#boas-vindas/${tela}`;
  }

  /** Até a primeira leitura do que está gravado, todo passo falta. */
  const situacaoDo = passo => (estado.configuracao ? estado.configuracao.situacaoDo(passo.id) : SITUACAO.FALTA);

  const tituloDaTela = tela => (tela === PRONTO ? textoDaVoz('ONB-12.titulo') : textoDaVoz(`ONB-03.${tela}`));

  function montarLista() {
    const nav = porId('bv-lista');
    nav.setAttribute('aria-label', textoDaVoz('ONB-03.lista'));
    const ol = elemento('ol', 'bv-lista__itens');
    TELAS.forEach((tela, i) => {
      const marca = montarMarca(tela === ABERTURA ? '·' : tela === PRONTO ? '✓' : String(i));
      const situacao = elemento('span', 'veio-so-leitor');
      const botao = elemento('button', 'bv-lista__item', marca,
        elemento('span', 'bv-lista__rotulo', tela === ABERTURA ? textoDaVoz('ONB-03.abertura') : tituloDaTela(tela)),
        situacao);
      botao.type = 'button';
      botao.addEventListener('click', () => irPara(tela));
      itensDaLista.set(tela, { botao, marca, situacao });
      ol.append(elemento('li', null, botao));
    });
    nav.append(ol);
  }

  function desenharLista() {
    for (const [tela, { botao, marca, situacao }] of itensDaLista) {
      const atual = tela === estado.tela;
      if (atual) botao.setAttribute('aria-current', 'step');
      else botao.removeAttribute('aria-current');

      const passo = passoDa(tela);
      const agora = passo ? situacaoDo(passo) : null;
      desenharMarca(marca, agora, atual);
      // O nome do item diz a situação ao leitor de tela: “…, feito”.
      situacao.textContent = agora && agora !== SITUACAO.FALTA ? `, ${textoDaVoz(TEXTO_DA_SITUACAO[agora])}` : '';
    }
  }

  /** A marca de um passo: o número (ou o tracejado) sai do CSS, pelo `data-numero`; o texto do item é o título do passo. */
  function montarMarca(numero) {
    const marca = elemento('span', 'bv-marca');
    marca.setAttribute('aria-hidden', 'true');
    marca.dataset.numero = numero;
    return marca;
  }

  function desenharMarca(marca, situacao, atual) {
    marca.dataset.situacao = situacao || '';
    marca.classList.toggle('bv-marca--atual', atual);
    marca.replaceChildren(...(situacao === SITUACAO.FEITO ? [Veio.iconeVeio('certo')] : []));
  }

  function montarTelas() {
    const lugar = porId('bv-telas');
    const montarPronto = () => elemento('div', null,
      elemento('p', 'bv-texto', textoDaVoz('ONB-12.corpo')),
      elemento('ul', 'bv-resumo'));
    for (const tela of TELAS) {
      const corpo = tela === ABERTURA ? montarAbertura() : tela === PRONTO ? montarPronto() : passoDa(tela).montar();
      corpo.hidden = true;
      telas.set(tela, corpo);
      lugar.append(corpo);
    }
  }

  function montarAbertura() {
    const lista = elemento('ul', 'bv-resumo', ...PASSOS.map(({ id, opcional }, i) => {
      const item = elemento('li', 'bv-resumo__item', montarMarca(String(i + 1)), elemento('span', null, tituloDaTela(id)));
      if (opcional) item.append(elemento('span', 'veio-selo bv-resumo__lado', textoDaVoz('ONB-03.opcional')));
      return item;
    }));
    return elemento('div', null, elemento('p', 'bv-texto', textoDaVoz('ONB-01.corpo')), lista);
  }

  function montarPasso2() {
    const controle = elemento('div', 'bv-controle bv-controle--atalhos');
    const tela = elemento('div', null, elemento('p', 'bv-texto', textoDaVoz('ONB-06')), controle);
    // Sair do passo (a tela some) cancela a gravação, como fechar o card em Configurações.
    raiz.GravadorDeAtalhos.montar(controle, { prefixo: 'bv', lugar: tela });
    return tela;
  }

  /** O corpo do card Conta & sync, o mesmo de Configurações (painel-conta.js). */
  function montarPasso3() {
    const cartao = elemento('div', 'cfg-corpo bv-cartao');
    Conta.montarCartao(cartao);
    return elemento('div', null, elemento('p', 'bv-texto', textoDaVoz('ONB-07')), elemento('div', 'bv-controle', cartao));
  }

  /** Os passos de pôr a Conexão no Anki: o componente do card ONB-16 (painel-conexao-passos.js), sem Voltar · Continuar próprios. Ligada, o foco vai ao título. */
  function montarPasso4() {
    const lugar = elemento('div', 'bv-controle');
    passo4 = PassosDaConexao.montar(lugar, {
      prefixo: 'bv4', navegacao: false, empilhado: true, aoSairOBotao: () => porId('bv-titulo'),
    });
    return elemento('div', null, elemento('p', 'bv-texto', textoDaVoz('ONB-08.corpo')), lugar);
  }

  /** Os switches EN/RU do popup, cada um com o limite por dia, e a nota ONB-10 com a Conexão desligada (dá para ligar mesmo assim). O estado é o do service worker. */
  function montarPasso6() {
    const nota = elemento('p', 'bv-nota bv-nota--conexao', elemento('span', 'bv-ponto'), textoDaVoz('ONB-10'));
    nota.firstChild.dataset.estado = CONEXAO.DESLIGADA;
    nota.firstChild.setAttribute('aria-hidden', 'true');
    nota.hidden = true;

    const linhas = new Map(IDIOMAS_DA_MINERACAO.map(({ chave, idioma }) => [chave, montarLinhaDaAutomatica(chave, idioma)]));
    const falha = elemento('div', 'bv-automatica__falha');
    falha.setAttribute('role', 'alert');
    const controle = elemento('div', 'bv-controle bv-automatica', ...linhas.values(), falha);
    controle.setAttribute('aria-busy', 'true');

    passo6 = { nota, linhas, falha, controle };
    return elemento('div', null,
      elemento('p', 'bv-texto', textoDaVoz('ONB-09.corpo')),
      nota,
      controle,
      elemento('p', 'bv-nota bv-nota--depois', textoDaVoz('ONB-09.popup')));
  }

  function montarLinhaDaAutomatica(chave, idioma) {
    const idiomaNaFrase = idioma.toLowerCase();

    const caixa = elemento('input');
    caixa.type = 'checkbox';
    caixa.disabled = true;
    caixa.setAttribute('role', 'switch');
    caixa.setAttribute('aria-label', textoDaVoz('POP-14.ligar', { idioma: idiomaNaFrase }));
    caixa.addEventListener('change', () => salvarMineracaoAutomatica({ [chave]: { enabled: caixa.checked } }));
    const nome = elemento('span', 'bv-automatica__idioma', idioma);
    nome.setAttribute('aria-hidden', 'true');
    const ligar = elemento('label', 'bv-automatica__ligar',
      elemento('span', 'veio-toggle', caixa, elemento('span', 'veio-toggle__trilho')), nome);

    const campo = elemento('input');
    MineracaoAutomatica.ligarCampoDoLimite(campo, {
      limiteGravado: () => estado.automatica?.settings?.[chave]?.dailyLimit,
      gravar: valor => salvarMineracaoAutomatica({ [chave]: { dailyLimit: valor } }),
    });
    campo.disabled = true;
    campo.setAttribute('aria-label', textoDaVoz('POP-14.limiteDoIdioma', { idioma: idiomaNaFrase }));
    const antes = elemento('span', null, textoDaVoz('POP-14.limite'));
    const depois = elemento('span', null, textoDaVoz('POP-14.dia'));
    antes.setAttribute('aria-hidden', 'true');
    depois.setAttribute('aria-hidden', 'true');

    return elemento('div', 'bv-automatica__linha', ligar, elemento('div', 'bv-automatica__limite', antes, campo, depois));
  }

  function lerMineracaoAutomatica() {
    // Um estado publicado enquanto isso é mais novo que esta resposta.
    MineracaoAutomatica.lerEstado().then(
      novo => { if (!estado.automatica) mostrarMineracaoAutomatica(novo); },
      () => { if (!estado.automatica) mostrarFalhaDaAutomatica('POP-16.leitura'); });
    // O que o popup (ou a própria mineração) muda aparece aqui sem recarregar.
    chrome.storage.onChanged.addListener((mudancas, area) => {
      const publicado = area === 'local' && mudancas[MineracaoDoDia.CHAVES.estadoPublicado]?.newValue;
      if (publicado) mostrarMineracaoAutomatica(publicado);
    });
  }

  /** Grava só o que mudou num idioma; a promessa termina com os controles no que ficou gravado. */
  function salvarMineracaoAutomatica(mudanca) {
    return MineracaoAutomatica.salvarAjustes(mudanca).then(mostrarMineracaoAutomatica, () => {
      // Nada foi gravado: os controles voltam ao que está gravado, e POP-16 pede para tentar de novo.
      if (estado.automatica) mostrarMineracaoAutomatica(estado.automatica);
      mostrarFalhaDaAutomatica('POP-16.gravacao');
    });
  }

  function mostrarMineracaoAutomatica(novo) {
    estado.automatica = novo;
    passo6.controle.removeAttribute('aria-busy');
    passo6.falha.replaceChildren();
    for (const [chave, linha] of passo6.linhas) {
      const ajustes = novo.settings?.[chave] || {};
      const caixa = linha.querySelector('input[type="checkbox"]');
      const campo = linha.querySelector('input[type="number"]');
      caixa.disabled = false;
      campo.disabled = false;
      caixa.checked = Boolean(ajustes.enabled);
      // O que está sendo digitado no campo fica: ele grava ao sair ou com Enter.
      if (document.activeElement !== campo) campo.value = String(ajustes.dailyLimit);
    }
    // Um idioma ligado marca o passo pelo storage (lib/configuracao.js).
  }

  /** A nota ONB-10 enquanto a última resposta da Conexão foi “desligada”. */
  function desenharPasso6() {
    passo6.nota.hidden = ConexaoAnki.ultimaResposta() !== CONEXAO.DESLIGADA;
  }

  function mostrarFalhaDaAutomatica(id) {
    passo6.controle.removeAttribute('aria-busy');
    passo6.falha.replaceChildren(elemento('p', 'bv-falha', Veio.iconeVeio('alerta'), textoDaVoz(id)));
  }

  /** O card Chave do Gemini de Configurações (painel-chave.js) e, sem chave, onde consegui-la. */
  function montarPassoDaChave() {
    const cartao = elemento('div', 'cfg-corpo bv-cartao');
    raiz.ChaveDoGemini.montar(cartao, { prefixo: 'bv' });
    ondeConseguirAChave = elemento('details', 'bv-onde',
      elemento('summary', null, textoDaVoz('ONB-11.onde')),
      elemento('p', null, textoDaVoz('ONB-11.detalhes')));
    ondeConseguirAChave.hidden = true;
    const controle = elemento('div', 'bv-controle', cartao, ondeConseguirAChave);
    return elemento('div', null, elemento('p', 'bv-texto', textoDaVoz('ONB-11.corpo')), controle);
  }

  function montarPassoDaIA() {
    const cartao = elemento('div', 'cfg-corpo bv-cartao');
    raiz.CartaoDaIA.montar(cartao, { prefixo: 'bv' });
    return elemento('div', null, elemento('p', 'bv-texto', textoDaVoz('CFG-35.passo')), elemento('div', 'bv-controle', cartao));
  }

  function desenharResumo() {
    const lista = telas.get(PRONTO).querySelector('.bv-resumo');
    lista.replaceChildren(...PASSOS.map((passo, i) => {
      const situacao = situacaoDo(passo);
      const marca = montarMarca(String(i + 1));
      desenharMarca(marca, situacao, false);
      // Feito mostra o valor (“Alt+Q”); o leitor de tela ouve “feito: Alt+Q”.
      const lado = situacao === SITUACAO.FEITO
        ? elemento('span', 'bv-resumo__lado', elemento('span', 'veio-so-leitor', `${textoDaVoz(TEXTO_DA_SITUACAO[situacao])}: `), passo.valor(estado.configuracao.estado))
        : elemento('span', 'bv-resumo__lado', textoDaVoz(TEXTO_DA_SITUACAO[situacao]));
      return elemento('li', 'bv-resumo__item', marca, elemento('span', null, tituloDaTela(passo.id)), lado);
    }));
  }

  function desenhar() {
    const { tela } = estado;
    const passo = passoDa(tela);

    porId('bv-sobretitulo').textContent = sobretituloDa(tela, passo);
    porId('bv-titulo').textContent = tela === ABERTURA ? textoDaVoz('ONB-01.titulo') : tituloDaTela(tela);
    for (const [nome, corpo] of telas) corpo.hidden = nome !== tela;

    desenharLista();
    // À vista é a tela aberta numa página que está na tela: o shell esconde a Boas-vindas em outras áreas.
    passo4.mostrar(tela === 'anki' && !porId('boas-vindas').hidden);
    passoDeMinerar.desenhar(estado.atalhos);
    passoDoNivel.desenhar(estado.configuracao?.estado);
    // Ao chegar ao último passo o Envio começa sozinho; sair dele para a leitura.
    passoDoEnvio.desenhar(estado.configuracao, tela === 'envio' && !porId('boas-vindas').hidden);
    // Até a primeira leitura não se sabe se há chave: o Onde conseguir a chave espera, para não piscar.
    ondeConseguirAChave.hidden = !estado.configuracao || Boolean(estado.configuracao.estado.chave);
    desenharResumo();
    desenharRodape(tela, passo);
  }

  function sobretituloDa(tela, passo) {
    if (tela === ABERTURA) return textoDaVoz('ONB-03.abertura');
    if (tela === PRONTO) return textoDaVoz('ONB-12.sobretitulo');
    const n = PASSOS.indexOf(passo) + 1;
    return textoDaVoz(passo.opcional ? 'ONB-03.passoOpcional' : 'ONB-03.passo', { n, total: PASSOS.length });
  }

  function desenharRodape(tela, passo) {
    // Refeito só quando muda o que ele mostra: o foco do botão não se perde num redesenho.
    const comAgoraNao = Boolean(passo?.opcional && situacaoDo(passo) !== SITUACAO.FEITO);
    const desenhoDoRodape = `${tela}|${comAgoraNao}`;
    if (desenhoDoRodape === rodapeDesenhadoPara) return;
    rodapeDesenhadoPara = desenhoDoRodape;
    const rodape = porId('bv-rodape');
    const espaco = elemento('span', 'bv-rodape__espaco');
    const anterior = TELAS[TELAS.indexOf(tela) - 1];
    const seguinte = TELAS[TELAS.indexOf(tela) + 1];

    if (tela === ABERTURA) {
      rodape.replaceChildren(
        botaoDoRodape('ONB-02.pular', 'fantasma', () => { location.hash = '#frases'; }),
        espaco,
        botaoDoRodape('ONB-02.comecar', 'primario', () => irPara(seguinte)));
      return;
    }

    const voltar = botaoDoRodape('ONB-04.voltar', 'secundario', () => irPara(anterior));
    if (tela === PRONTO) {
      rodape.replaceChildren(voltar, espaco, botaoDoRodape('ONB-12.abrirPainel', 'primario', () => {
        Configuracao.concluir();
        location.hash = '#frases';
      }));
      return;
    }

    const botoes = [voltar, espaco];
    if (comAgoraNao) {
      botoes.push(botaoDoRodape('ONB-04.agoraNao', 'fantasma', () => {
        Configuracao.marcarAgoraNao(passo.id);
        irPara(seguinte);
      }));
    }
    // O último passo termina em Concluir, dentro do card, quando o Cartão chega ao Anki.
    if (tela !== 'envio') botoes.push(botaoDoRodape('ONB-04.continuar', 'primario', () => irPara(seguinte)));
    rodape.replaceChildren(...botoes);
  }

  function botaoDoRodape(id, variante, aoClicar) {
    const botao = elemento('button', `veio-botao veio-botao--${variante}`, textoDaVoz(id));
    botao.type = 'button';
    botao.addEventListener('click', aoClicar);
    return botao;
  }

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  document.addEventListener('DOMContentLoaded', iniciarBoasVindas);
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
