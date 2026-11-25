'use strict';

(function (raiz) {
  const { textoDaVoz } = raiz;
  const { iconeVeio, refletirSelecao, elemento, botao } = raiz.Veio;
  const porId = id => document.getElementById(id);

  let estado = null;
  let apoio = null;

  function usar(entrada) {
    ({ estado, apoio } = entrada);
  }

  function estadoDaColuna() {
    for (const colunaSeVale of COLUNAS_EM_ORDEM) {
      const coluna = colunaSeVale();
      if (coluna) return coluna;
    }
    return { id: 'nada' };
  }

  function colunaSemChave() {
    return estado.chaveGemini ? null : { id: 'semChave', montar: montarSemChave };
  }

  function colunaDoInicio() {
    return estado.fotos.length ? null : { id: 'inicio', montar: montarInicio };
  }

  function colunaDaPrevia() {
    const pronta = apoio.fotosCom(apoio.STATUS.PRONTA)[0];
    return pronta ? { id: `previa:${pronta.id}`, montar: () => montarPrevia(pronta) } : null;
  }

  function colunaDaLista() {
    return estado.frases.length ? { id: 'lista' } : null;
  }

  function colunaDaLeitura() {
    const lendo = apoio.fotosCom(apoio.STATUS.LENDO)[0];
    if (!lendo && !apoio.lendoOuNaFila().length) return null;
    const total = estado.fotos.length;
    const n = lendo ? apoio.numeroDaFoto(lendo) : 1;
    return { id: `lendo:${n}/${total}`, montar: () => montarLendo(n, total) };
  }

  function colunaDasFalhas() {
    const falhas = apoio.fotosCom(apoio.STATUS.FALHOU);
    return falhas.length ? { id: `falhas:${falhas.map(foto => foto.id)}`, montar: () => montarFalhas(falhas) } : null;
  }

  function colunaSemMarcacoes() {
    const lidas = apoio.fotosCom(apoio.STATUS.LIDA).length;
    return lidas ? { id: `semMarcacoes:${lidas}`, montar: () => montarSemMarcacoes(lidas) } : null;
  }

  function colunaCancelada() {
    return apoio.fotosCom(apoio.STATUS.CANCELADA).length ? { id: apoio.ID_DA_COLUNA_CANCELADA, montar: montarCancelada } : null;
  }

  const COLUNAS_EM_ORDEM = [
    colunaSemChave, colunaDoInicio, colunaDaPrevia, colunaDaLista, colunaDaLeitura, colunaDasFalhas, colunaSemMarcacoes, colunaCancelada,
  ];

  function vazio(icone, ...partes) {
    return elemento('div', 'veio-vazio foto-vazio', iconeVeio(icone), ...partes);
  }

  function vazioDeAcento(icone, ...partes) {
    const caixa = vazio(icone, ...partes);
    caixa.classList.add('foto-vazio--acento');
    return caixa;
  }

  function botaoRecomecar() {
    const recomecar = botao('veio-botao--fantasma', iconeVeio('atualizar'), textoDaVoz('FOT-17'));
    recomecar.addEventListener('click', apoio.pedirParaRecomecar);
    return recomecar;
  }

  function botaoAbrirConfiguracoes(variante) {
    const abrir = elemento('button', `veio-botao ${variante}`, iconeVeio('chave'), textoDaVoz('FOT-05.acao'));
    abrir.type = 'button';
    abrir.addEventListener('click', apoio.abrirConfiguracoes);
    return abrir;
  }

  function montarSemChave() {
    return vazioDeAcento('chave',
      elemento('p', 'veio-vazio__titulo', textoDaVoz('FOT-05.titulo')),
      elemento('p', 'veio-vazio__texto', textoDaVoz('FOT-05.aviso')),
      botaoAbrirConfiguracoes('veio-botao--primario'));
  }

  function montarInicio() {
    const caixa = vazioDeAcento('livro',
      elemento('p', 'veio-vazio__titulo', textoDaVoz('FOT-01.titulo')),
      elemento('p', 'veio-vazio__texto', `${textoDaVoz('FOT-01.subtitulo')} ${textoDaVoz('FOT-25.comoAparecem')}`));
    caixa.classList.add('foto-vazio--inicio');
    return caixa;
  }

  function montarPrevia(foto) {
    const ler = elemento('button', 'veio-botao veio-botao--primario', iconeVeio('ler'), textoDaVoz('FOT-25.lerMarcacoes'));
    ler.type = 'button';
    ler.addEventListener('click', apoio.lerAsProntas);
    return elemento('div', 'foto-previa',
      elemento('figure', 'foto-previa__quadro',
        apoio.miniatura(foto, 'foto-previa__imagem'),
        elemento('figcaption', 'foto-previa__aviso', textoDaVoz('FOT-03'))),
      elemento('div', 'foto-previa__acoes', ler, botaoRecomecar()));
  }

  function montarLendo(n, total) {
    return vazioDeAcento('ler',
      elemento('p', 'veio-vazio__titulo', total > 1 ? textoDaVoz('FOT-07', { n, total }) : textoDaVoz('FOT-06.titulo')),
      elemento('p', 'veio-vazio__texto', textoDaVoz('FOT-06.detalhe')));
  }

  function montarSemMarcacoes(lidas) {
    return vazio('busca',
      elemento('p', 'veio-vazio__titulo', textoDaVoz('FOT-10.titulo', { n: lidas })),
      elemento('p', 'veio-vazio__texto', textoDaVoz('FOT-10.texto')),
      botaoRecomecar());
  }

  function montarCancelada() {
    return vazio('fechar',
      elemento('p', 'veio-vazio__titulo', textoDaVoz('FOT-21.titulo')),
      elemento('p', 'veio-vazio__texto', textoDaVoz('FOT-21.nenhumaLida')),
      botaoRecomecar());
  }

  function montarFalhas(falhas) {
    const { causa, chaveRecusada } = apoio.resumoDasFalhas(falhas);
    const caixa = vazio('perigo',
      elemento('p', 'veio-vazio__titulo', textoDaVoz('FOT-11.titulo', { n: falhas.length })),
      elemento('p', 'veio-vazio__texto', causa));
    const acoes = elemento('div', 'foto-vazio__acoes', botaoRecomecar());
    if (chaveRecusada) acoes.prepend(botaoAbrirConfiguracoes('veio-botao--secundario'));
    caixa.append(acoes);
    caixa.classList.add('foto-vazio--falha');
    return caixa;
  }

  function desenharLista() {
    porId('foto-lista').hidden = estado.frases.length === 0;
    if (!estado.frases.length) return;

    for (const foto of estado.fotos) desenharGrupo(foto, estado.frases.filter(frase => frase.fotoId === foto.id));
    desenharSelecao();
    desenharBotaoDeMinerar();
  }

  function desenharGrupo(foto, frasesDaFoto) {
    if (!frasesDaFoto.length) return;
    const grupo = grupoDaFoto(foto);
    for (const frase of frasesDaFoto) atualizarLinha(linhaDaFrase(frase, grupo), frase);
  }

  const grupoDaFoto = foto => apoio.desenhadoOuMontado(apoio.desenhado().grupos, foto.id, () => montarGrupo(foto), porId('foto-grupos'));
  const linhaDaFrase = (frase, grupo) => apoio.desenhadoOuMontado(apoio.desenhado().linhas, frase.id, () => montarLinha(frase),
    grupo.querySelector('.foto-grupo__frases'));

  function desenharSelecao() {
    const aindaNao = apoio.pendentes();
    const marcadas = aindaNao.filter(frase => frase.marcada);
    const todas = porId('foto-todas');
    refletirSelecao(todas, marcadas.length, aindaNao.length);
    todas.disabled = aindaNao.length === 0;
    porId('foto-contagem').textContent = textoDaVoz('FOT-09', { n: estado.frases.length });
  }

  function desenharBotaoDeMinerar() {
    const n = apoio.paraMinerar().length;
    const botao = porId('foto-minerar');
    botao.disabled = estado.minerando || n === 0;
    botao.replaceChildren(iconeVeio('manual'), n ? textoDaVoz('FOT-12', { n }) : textoDaVoz('FOT-13'));
  }

  function montarGrupo(foto) {
    const titulo = elemento('p', 'foto-grupo__titulo',
      elemento('span', 'foto-grupo__numero', textoDaVoz('FOT-25.grupo', { n: apoio.numeroDaFoto(foto) })),
      elemento('span', 'foto-grupo__nome', foto.nome));
    return elemento('section', 'foto-grupo', titulo, elemento('div', 'foto-grupo__frases'));
  }

  function montarLinha(frase) {
    const marcar = elemento('input', 'veio-checkbox foto-frase__marcar');
    marcar.type = 'checkbox';
    marcar.addEventListener('change', () => {
      frase.marcada = marcar.checked;
      desenharLista();
    });

    const texto = elemento('div', 'veio-frase__texto foto-frase__texto', frase.texto);
    texto.setAttribute('role', 'textbox');
    texto.setAttribute('aria-label', textoDaVoz('PAI-33.campo'));
    texto.spellcheck = false;
    texto.addEventListener('input', () => {
      frase.texto = texto.textContent;
      marcar.setAttribute('aria-label', frase.texto);
      desenharLista();
    });

    const minerada = apoio.selo('veio-selo--ok foto-frase__minerada', textoDaVoz('FOT-25.minerada'));
    return elemento('div', 'veio-frase foto-frase', marcar, texto, minerada);
  }

  function atualizarLinha(linha, frase) {
    const marcar = linha.querySelector('.foto-frase__marcar');
    const texto = linha.querySelector('.foto-frase__texto');
    marcar.checked = frase.marcada;
    marcar.disabled = frase.minerada;
    marcar.setAttribute('aria-label', frase.texto);
    texto.contentEditable = frase.minerada ? 'false' : 'plaintext-only';
    texto.setAttribute('aria-readonly', String(frase.minerada));
    if (frase.minerada && texto.textContent !== frase.texto) texto.textContent = frase.texto;
    linha.classList.toggle('foto-frase--minerada', frase.minerada);
    linha.classList.toggle('foto-frase--desmarcada', !frase.minerada && !frase.marcada);
    linha.querySelector('.foto-frase__minerada').hidden = !frase.minerada;
  }

  raiz.ColunaDaFoto = { usar, estadoDaColuna, desenharLista };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
