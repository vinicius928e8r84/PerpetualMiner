'use strict';

(function (raiz) {
  const { textoDaVoz, Veio } = raiz;
  const { iconeVeio, abrirModal, mostrarToastDeSucesso, montarAviso, escreverFrase,
    escreverFraseClicavel, andarEntrePalavras, montarChipDaPalavra, refletirSelecao } = Veio;

  const CATALOGO_DA_VITRINE = [
    ['BRG-31.emParte', { n: 3, total: 4 }],
    ['POP-09'], ['ADD-01.botao'], ['PAI-12.cancelar'], ['PAI-13.confirmar', { n: 12 }],
    ['PAI-20.umaFrase'], ['PAI-12.confirmar'],
    ['PAI-04.acao'], ['PAI-10.todasAsFontes'], ['PAI-10.todosOsIdiomas'], ['POP-03'],
    ['POP-06'], ['POP-10'], ['PAI-09'], ['PAI-06', { n: 3 }],
    ['PAI-08'], ['BRG-01.ligada'], ['BRG-01.desligada'],
    ['FOT-19.lendo'],
    ['GLB-02.semAtalho'],
    ['ADD-11.colar'], ['ADD-11.arquivo'], ['ADD-11.foto'],
    ['POP-07.leitor', { n: 7, limite: 20 }], ['POP-08'],
    ['PAI-13.titulo', { n: 12 }], ['PAI-13.corpo'],
    ['PAI-14', { n: 12 }],
    ['PAI-15.aviso'], ['PAI-15.tentarDeNovo'], ['ONB-15.ocultar'],
    ['ONB-15.texto', { n: 0, total: 6 }], ['ONB-15.texto', { n: 2, total: 6 }], ['ONB-15.texto', { n: 6, total: 6 }],
    ['FOT-21.abertura'], ['FOT-21.aviso', { n: 2 }],
    ['PAI-02.titulo'], ['PAI-02.texto', { atalho: 'Alt+S' }], ['PAI-02.acao'], ['PAI-03.acao'],
    ['PAI-04.texto', { termo: 'gavião' }], ['PAI-04.acao'],
    ['PAI-11.hoje'],
  ];

  const FONTES = [
    ['netflix', 'Netflix'], ['youtube', 'YouTube'], ['web', 'Web'],
    ['pdf', 'PDF'], ['livro', 'Livro'], ['manual', 'Manual'],
  ];

  const FRASE_EM_INGLES = 'I’m not saying it’s your fault, I’m saying it’s your responsibility.';
  const FRASE_EM_RUSSO = 'Мы с тобой одной крови — ты и я.';

  const VALORES_DE_ATRIBUTO_AUSENTE = [false, null, undefined];
  const atributoAusente = valor => VALORES_DE_ATRIBUTO_AUSENTE.includes(valor);
  const filhoPresente = filho => filho !== null && filho !== undefined;
  const ehPropriedadeDoNo = (no, nome) => nome in no && nome !== 'list';

  function aplicarAtributo(no, nome, valor) {
    if (nome === 'class') no.className = valor;
    else if (nome === 'texto') no.textContent = valor;
    else if (ehPropriedadeDoNo(no, nome)) no[nome] = valor;
    else no.setAttribute(nome, valor === true ? '' : valor);
  }

  function el(tag, atributos = {}, ...filhos) {
    const no = document.createElement(tag);
    for (const [nome, valor] of Object.entries(atributos)) {
      if (!atributoAusente(valor)) aplicarAtributo(no, nome, valor);
    }
    no.append(...filhos.filter(filhoPresente));
    return no;
  }

  let proximoId = 0;
  const idUnico = prefixo => `${prefixo}-${(proximoId += 1)}`;

  const estadoDaAmostra = estado => ({
    desabilitado: estado === 'desabilitado',
    erro: estado === 'erro',
    classeDeFoco: estado === 'foco' ? 'amostra-de-foco-parado' : '',
  });

  const rotulo = (tag, classe, texto) =>
    el(tag, { class: classe, texto, 'data-vitrine-chrome': true });

  const grupo = (nome, ...linhas) =>
    el('section', { class: 'grupo', 'data-grupo': nome },
      rotulo('h4', 'grupo__nome', nome), ...linhas);

  const linha = (estado, ...amostras) =>
    el('div', { class: 'linha-de-estado', 'data-estado': estado },
      rotulo('i', 'linha-de-estado__nome', estado),
      el('div', { class: 'amostras' }, ...amostras));

  const gatilho = (texto, aoUsar) =>
    el('button', {
      type: 'button', class: 'veio-botao veio-botao--secundario',
      texto, 'data-vitrine-chrome': true, onclick: aoUsar,
    });

  const VARIANTES_DO_BOTAO_DE_ICONE = {
    neutro: 'veio-botao-icone',
    perigo: 'veio-botao-icone veio-botao-icone--perigo',
  };

  function botaoDeIcone({ variante, idDaVoz, icone }, { desabilitado, classeDeFoco = '' } = {}) {
    return el('button', {
      type: 'button', class: `${VARIANTES_DO_BOTAO_DE_ICONE[variante]} ${classeDeFoco}`.trim(),
      'aria-label': textoDaVoz(idDaVoz), disabled: desabilitado,
    }, iconeVeio(icone));
  }

  const ABRIR_O_CONTEXTO = { variante: 'neutro', idDaVoz: 'PAI-20.umaFrase', icone: 'contexto' };
  const APAGAR_A_FRASE = { variante: 'perigo', idDaVoz: 'PAI-12.confirmar', icone: 'apagar' };

  function botoes(estado) {
    const amostra = estadoDaAmostra(estado);
    const { desabilitado, classeDeFoco: foco } = amostra;
    const botao = (variante, id, valores) => el('button', {
      type: 'button',
      class: `veio-botao veio-botao--${variante} ${foco}`.trim(),
      texto: textoDaVoz(id, valores),
      disabled: desabilitado,
    });

    return [
      botao('primario', 'POP-09'),
      botao('secundario', 'ADD-01.botao'),
      botao('fantasma', 'PAI-12.cancelar'),
      botao('contorno', 'PAI-03.acao'),
      botao('perigo', 'PAI-13.confirmar', { n: 12 }),
      botao('perigo-cheio', 'PAI-13.confirmar', { n: 12 }),
      botaoDeIcone(ABRIR_O_CONTEXTO, amostra),
      botaoDeIcone(APAGAR_A_FRASE, amostra),
    ];
  }

  function busca({ desabilitado = false, classeDeFoco = '' } = {}) {
    const limpar = el('button', {
      type: 'button', class: 'veio-busca__limpar veio-botao-icone',
      'aria-label': textoDaVoz('PAI-04.acao'), hidden: true, disabled: desabilitado,
    }, iconeVeio('fechar'));

    const campo = el('input', {
      type: 'search', class: `veio-campo ${classeDeFoco}`.trim(),
      disabled: desabilitado,
    });
    campo.addEventListener('input', () => { limpar.hidden = campo.value === ''; });
    limpar.addEventListener('click', () => {
      campo.value = '';
      limpar.hidden = true;
      campo.focus();
    });

    const nome = rotulo('span', 'campo__nome', 'Busca');
    nome.id = idUnico('busca');
    campo.setAttribute('aria-labelledby', nome.id);

    return el('label', { class: 'campo' }, nome,
      el('span', { class: 'veio-busca' }, iconeVeio('busca'), campo, limpar));
  }

  function campoComNome(nomeDaVitrine, controle) {
    const nome = rotulo('span', 'campo__nome', nomeDaVitrine);
    return el('label', { class: 'campo' }, nome, controle);
  }

  function campos(estado) {
    const { desabilitado, erro, classeDeFoco } = estadoDaAmostra(estado);
    const classe = `veio-campo ${classeDeFoco}`.trim();

    const selecao = el('select', { class: classe, disabled: desabilitado, 'aria-invalid': erro ? 'true' : null },
      el('option', { texto: textoDaVoz('PAI-10.todasAsFontes') }),
      el('option', { texto: textoDaVoz('PAI-10.todosOsIdiomas') }));

    const area = el('textarea', {
      class: classe, rows: 2, placeholder: textoDaVoz('POP-03'),
      disabled: desabilitado, 'aria-invalid': erro ? 'true' : null,
    });

    const numero = el('input', {
      type: 'number', class: classe, value: 20, min: 1, max: 100,
      'aria-label': textoDaVoz('POP-10'), disabled: desabilitado,
      'aria-invalid': erro ? 'true' : null,
    });

    return [
      busca({ desabilitado, classeDeFoco }),
      campoComNome('Select', el('span', { class: 'veio-select' }, selecao)),
      campoComNome('Textarea', erro
        ? el('span', { class: 'campo__pilha' }, area, el('p', { class: 'veio-campo-erro', texto: textoDaVoz('POP-06') }))
        : area),
      campoComNome('Número', numero),
    ];
  }

  function toggle({ ligado, desabilitado = false, classeDeFoco = '' }) {
    return el('label', { class: 'veio-toggle' },
      el('input', { type: 'checkbox', checked: ligado, disabled: desabilitado }),
      el('span', { class: `veio-toggle__trilho ${classeDeFoco}`.trim() }),
      el('span', { texto: textoDaVoz('POP-10') }));
  }

  function checkboxes(estado) {
    const { desabilitado, classeDeFoco: foco } = estadoDaAmostra(estado);

    const misto = el('input', {
      type: 'checkbox', class: `veio-checkbox ${foco}`.trim(), disabled: desabilitado,
      'aria-label': textoDaVoz('PAI-06', { n: 3 }),
    });
    refletirSelecao(misto, 3, 12);

    return [
      toggle({ ligado: true, desabilitado, classeDeFoco: foco }),
      toggle({ ligado: false, desabilitado, classeDeFoco: foco }),
      el('label', { class: 'campo-em-linha' },
        el('input', { type: 'checkbox', class: `veio-checkbox ${foco}`.trim(), checked: true, disabled: desabilitado }),
        el('span', { texto: textoDaVoz('PAI-09') })),
      el('span', { class: 'campo-em-linha' }, misto,
        rotulo('span', '', 'misto')),
    ];
  }

  const selo = (classe, icone, texto) =>
    el('span', { class: `veio-selo ${classe}`.trim() },
      icone, el('span', { texto }));

  function selosDeFonte() {
    return FONTES.map(([chave, nome]) => selo('', iconeVeio(chave), nome));
  }

  function selosDeEstado() {
    const ponto = () => el('span', { class: 'veio-selo__ponto' });
    return [
      selo('veio-selo--ok', iconeVeio('certo'), textoDaVoz('PAI-08')),
      selo('veio-selo--ok', ponto(), textoDaVoz('BRG-01.ligada')),
      selo('veio-selo--erro', ponto(), textoDaVoz('BRG-01.desligada')),
      selo('veio-selo--lendo', ponto(), textoDaVoz('FOT-19.lendo')),
      selo('veio-selo--parte', null, textoDaVoz('BRG-31.emParte', { n: 3, total: 4 })),
    ];
  }

  function atalhos() {
    return [
      el('span', { class: 'atalho' },
        el('kbd', { class: 'veio-kbd', texto: 'Alt' }),
        el('span', { texto: '+' }),
        el('kbd', { class: 'veio-kbd', texto: 'S' })),
      el('kbd', { class: 'veio-kbd veio-kbd--sem-atalho', texto: textoDaVoz('GLB-02.semAtalho') }),
    ];
  }

  function segmentado({ desabilitado = false, classeDeFoco = '' } = {}) {
    const nomeDoGrupo = idUnico('segmentado');
    const opcoes = ['ADD-11.colar', 'ADD-11.arquivo', 'ADD-11.foto'].map((id, i) =>
      el('label', { class: `veio-segmentado__opcao ${i === 0 ? classeDeFoco : ''}`.trim() },
        el('input', { type: 'radio', name: nomeDoGrupo, checked: i === 0, disabled: desabilitado }),
        el('span', { texto: textoDaVoz(id) })));

    return el('div', { class: 'veio-segmentado', role: 'radiogroup', 'aria-label': textoDaVoz('ADD-01.botao') }, ...opcoes);
  }

  function aneis() {
    return [0, 2, 6].map(n => el('span', { class: 'anel' },
      Veio.montarAnelDeProgresso(n, 6),
      el('span', { texto: textoDaVoz('ONB-15.texto', { n, total: 6 }) })));
  }

  const AZULEJOS = [
    { idioma: 'Inglês', id: 'POP-07.leitor', valores: { n: 7, limite: 20 }, proporcao: 35, escolhido: true },
    { idioma: 'Russo', id: 'POP-08', valores: {}, proporcao: 100, escolhido: false },
  ];

  const azulejo = ({ idioma, id, valores, proporcao, escolhido }) =>
    el('div', { class: `veio-azulejo ${escolhido ? 'veio-azulejo--escolhido' : ''}`.trim() },
      el('span', { class: 'veio-azulejo__legenda', texto: idioma }),
      el('span', { class: 'veio-azulejo__numero', texto: textoDaVoz(id, valores) }),
      el('span', { class: 'veio-medidor' }, el('i', { style: `width:${proporcao}%` })));

  const azulejos = () => AZULEJOS.map(azulejo);

  function modal(temaDaColuna) {
    const cancelar = el('button', {
      type: 'button', class: 'veio-botao veio-botao--fantasma',
      texto: textoDaVoz('PAI-13.cancelar'), 'data-foco-seguro': true,
    });
    const confirmar = el('button', {
      type: 'button', class: 'veio-botao veio-botao--perigo-cheio',
      texto: textoDaVoz('PAI-13.confirmar', { n: 12 }),
    });

    const titulo = el('h2', { class: 'veio-modal__titulo', texto: textoDaVoz('PAI-13.titulo', { n: 12 }) });
    titulo.id = idUnico('titulo-do-modal');

    const dialogo = el('div', {
      class: 'veio-modal', role: 'dialog', 'aria-labelledby': titulo.id,
    }, titulo,
      el('p', { class: 'veio-modal__corpo', texto: textoDaVoz('PAI-13.corpo') }),
      el('div', { class: 'veio-modal__acoes' }, cancelar, confirmar));

    const scrim = el('div', { class: 'veio-scrim', hidden: true, 'data-modal': temaDaColuna }, dialogo);

    let aberto = null;
    const abrir = () => { aberto = abrirModal(scrim); };
    const fechar = () => aberto && aberto.fechar();
    cancelar.addEventListener('click', fechar);
    confirmar.addEventListener('click', fechar);

    const entrada = el('button', {
      type: 'button', class: 'veio-botao veio-botao--perigo',
      texto: textoDaVoz('PAI-13.confirmar', { n: 12 }),
      'data-abre-o-modal': temaDaColuna, onclick: abrir,
    });

    return el('div', { class: 'amostras' }, entrada, scrim);
  }

  function toast(coluna) {
    return gatilho('Mostrar o toast', () =>
      mostrarToastDeSucesso(textoDaVoz('PAI-14', { n: 12 }), { dentroDe: coluna }));
  }

  function avisoQueVoltaAoFechar(montarConteudo) {
    const lugar = el('div', { class: 'lugar-do-aviso' });
    const montar = () => lugar.append(montarAviso({
      ...montarConteudo(),
      rotuloDeFechar: textoDaVoz('ONB-15.ocultar'),
      aoFechar: montar,
    }));
    montar();
    return lugar;
  }

  const avisoDeErro = () => avisoQueVoltaAoFechar(() => ({
    texto: textoDaVoz('PAI-15.aviso'),
    acao: { rotulo: textoDaVoz('PAI-15.tentarDeNovo'), aoUsar: () => {} },
    detalhes: 'HTTP 403 · PERMISSION_DENIED',
  }));

  const avisoInformativo = () => avisoQueVoltaAoFechar(() => ({
    tom: 'info',
    icone: 'info',
    abertura: textoDaVoz('FOT-21.abertura'),
    texto: textoDaVoz('FOT-21.aviso', { n: 2 }),
  }));

  function vazio({ titulo, texto, acao, variante, icone }) {
    return el('div', { class: 'veio-vazio' },
      iconeVeio(icone),
      el('p', { class: 'veio-vazio__titulo', texto: textoDaVoz(...titulo) }),
      texto ? el('p', { class: 'veio-vazio__texto', texto: textoDaVoz(...texto) }) : null,
      el('button', {
        type: 'button', class: `veio-botao veio-botao--${variante}`,
        texto: textoDaVoz(acao),
      }));
  }

  const vazios = () => [
    vazio({
      titulo: ['PAI-02.titulo'], texto: ['PAI-02.texto', { atalho: 'Alt+S' }],
      acao: 'PAI-02.acao', variante: 'primario', icone: 'enviar',
    }),
    vazio({
      titulo: ['PAI-04.texto', { termo: 'gavião' }],
      acao: 'PAI-04.acao', variante: 'contorno', icone: 'busca',
    }),
  ];

  function esqueleto() {
    return el('div', { class: 'esqueleto-em-pilha', 'aria-hidden': 'true' },
      el('div', { class: 'veio-esqueleto', style: 'width:72%' }),
      el('div', { class: 'veio-esqueleto', style: 'width:94%' }),
      el('div', { class: 'veio-esqueleto', style: 'width:58%' }));
  }

  function frase({ texto, palavra, detectada, idioma, fonte, titulo, detalhe, selecionada, enviada }) {
    const marcada = el('input', {
      type: 'checkbox', class: 'veio-checkbox', checked: selecionada,
      'aria-label': textoDaVoz('PAI-06', { n: 1 }),
    });

    const corpo = el('div', { class: 'veio-frase__texto', lang: idioma });
    escreverFrase(corpo, texto, palavra);

    const contexto = el('div', { class: 'veio-frase__contexto' },
      selo('', iconeVeio(fonte[0]), fonte[1]),
      el('span', { texto: titulo }),
      detalhe ? el('span', { texto: `· ${detalhe}` }) : null,
      montarChipDaPalavra(palavra, { detectada }),
      enviada ? selo('veio-selo--ok', iconeVeio('certo'), textoDaVoz('PAI-08')) : null);

    const acoes = el('div', { class: 'veio-frase__acoes' },
      botaoDeIcone(ABRIR_O_CONTEXTO),
      botaoDeIcone(APAGAR_A_FRASE));

    return el('div', { class: `veio-frase ${selecionada ? 'veio-frase--selecionada' : ''}`.trim() },
      marcada, el('div', { class: 'coluna-da-frase' }, corpo, contexto), acoes);
  }

  function frases() {
    return el('div', { class: 'lista-de-frases' },
      el('div', { class: 'veio-cabecalho-de-data', texto: textoDaVoz('PAI-11.hoje') }),
      frase({
        texto: FRASE_EM_INGLES, palavra: 'responsibility', detectada: false, idioma: 'en',
        fonte: ['netflix', 'Netflix'], titulo: 'The Bear', detalhe: 'T2 · E7', selecionada: true,
      }),
      frase({
        texto: FRASE_EM_RUSSO, palavra: 'крови', detectada: true, idioma: 'ru',
        fonte: ['livro', 'Livro'], titulo: 'Маугли', detalhe: 'cap. 3', enviada: true,
      }));
  }

  function fraseClicavel() {
    const corpo = el('div', { class: 'veio-frase__texto', lang: 'en' });
    const trechos = FRASE_EM_INGLES.match(/[\p{L}’']+|[^\p{L}’']+/gu).map(texto =>
      /\p{L}/u.test(texto)
        ? { texto, palavra: true, grifada: texto === 'fault' }
        : { texto });
    escreverFraseClicavel(corpo, trechos);
    corpo.addEventListener('keydown', andarEntrePalavras);

    const marcada = el('input', {
      type: 'checkbox', class: 'veio-checkbox', 'aria-label': textoDaVoz('PAI-06', { n: 1 }),
    });
    const ilha = el('div', { class: 'ilha-de-amostra' },
      el('div', { class: 'veio-frase veio-frase--na-ilha' },
        marcada, el('div', { class: 'coluna-da-frase' }, corpo, montarChipDaPalavra('fault')), el('span')));
    return ilha;
  }

  const ESTADOS_DE_INTERACAO = ['normal', 'foco', 'desabilitado'];

  const linhasPorEstado = (estados, amostrasDe) =>
    estados.map(estado => linha(estado, ...amostrasDe(estado)));

  const gruposDeControles = () => [
    grupo('Botões', ...linhasPorEstado(ESTADOS_DE_INTERACAO, botoes)),
    grupo('Campos', ...linhasPorEstado([...ESTADOS_DE_INTERACAO, 'erro'], campos)),
    grupo('Toggle e checkbox', ...linhasPorEstado(ESTADOS_DE_INTERACAO, checkboxes)),
    grupo('Selos',
      linha('Fonte', ...selosDeFonte()),
      linha('estado', ...selosDeEstado())),
    grupo('Atalhos', linha('normal', ...atalhos())),
    grupo('Controle segmentado',
      linha('normal', segmentado()),
      linha('foco', segmentado({ classeDeFoco: 'amostra-de-foco-parado' })),
      linha('desabilitado', segmentado({ desabilitado: true }))),
    grupo('Azulejo', linha('normal', ...azulejos())),
    grupo('Anel de progresso', linha('normal', ...aneis())),
  ];

  const gruposDeRetorno = (destino, tema) => [
    grupo('Modal', modal(tema)),
    grupo('Toast', linha('normal', toast(destino))),
    grupo('Aviso persistente',
      linha('erro', avisoDeErro()),
      linha('informativo', avisoInformativo())),
    grupo('Estado vazio', linha('vazio', ...vazios())),
    grupo('Esqueleto', linha('carregando', esqueleto())),
    grupo('Linha de frase', frases(),
      linha('palavra clicável, na ilha', fraseClicavel())),
  ];

  function montarComponentes(destino, tema) {
    destino.append(...gruposDeControles(), ...gruposDeRetorno(destino, tema));
  }

  raiz.Vitrine = { montarComponentes, CATALOGO_DA_VITRINE };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
