'use strict';

(function (raiz) {
  const { elemento } = raiz.Veio;

  function no(tag, classe, atributos, ...filhos) {
    const novo = elemento(tag, classe, ...filhos);
    for (const [nome, valor] of Object.entries(atributos)) novo.setAttribute(nome, valor);
    return novo;
  }

  const icone = nome => no('span', '', { 'data-icone': nome });
  const voz = id => ({ 'data-voz': id });
  const vazio = (tag, classe, id) => no(tag, classe, { id });
  const botaoDeFechar = atributos => no('button', 'veio-botao-icone veio-modal__fechar', { ...atributos, 'data-voz-aria': 'PAI-34', 'data-voz-title': 'PAI-34' }, icone('fechar'));
  const rotulo = id => no('span', 'frases-modal__rotulo', voz(id));
  const campo = (...filhos) => no('label', 'frases-modal__campo', {}, ...filhos);
  const campoDeTexto = (id, vozDoRotulo, extras = {}) => campo(rotulo(vozDoRotulo), no('input', 'veio-campo', { id, autocomplete: 'off', ...extras }));
  const acoes = (...botoes) => no('div', 'veio-modal__acoes', {}, ...botoes);
  const botao = (classe, atributos, ...filhos) => no('button', `veio-botao ${classe}`, atributos, ...filhos);

  function modal(id, classe, aria, ...filhos) {
    return no('div', 'veio-scrim', { id, hidden: '' }, no('div', classe, { role: 'dialog', ...aria }, ...filhos));
  }

  function modalDoContexto() {
    return modal('modal-contexto', 'veio-modal', { 'aria-labelledby': 'modal-contexto-titulo', 'aria-describedby': 'modal-contexto-subtitulo' },
      botaoDeFechar({ 'data-fechar-modal': '' }),
      vazio('h2', 'veio-modal__titulo', 'modal-contexto-titulo'),
      vazio('p', 'veio-modal__corpo frases-modal__subtitulo', 'modal-contexto-subtitulo'),
      no('form', 'frases-modal__campos', { id: 'form-contexto' },
        campo(
          rotulo('PAI-21.fonte'),
          no('input', 'veio-campo', { id: 'modal-fonte', autocomplete: 'off', 'aria-describedby': 'modal-fonte-ajuda' }),
          no('span', 'frases-modal__ajuda', { id: 'modal-fonte-ajuda', ...voz('PAI-21.fonteAjuda') }),
        ),
        campoDeTexto('modal-titulo', 'PAI-21.titulo'),
        campo(
          rotulo('PAI-21.detalhe'),
          no('input', 'veio-campo', { id: 'modal-detalhe', autocomplete: 'off', 'aria-describedby': 'modal-detalhe-ajuda' }),
          no('span', 'frases-modal__ajuda', { id: 'modal-detalhe-ajuda', ...voz('PAI-21.detalheAjuda') }),
        ),
        acoes(
          botao('veio-botao--fantasma', { type: 'button', 'data-fechar-modal': '', ...voz('PAI-20.cancelar') }),
          botao('veio-botao--primario', { type: 'submit', ...voz('PAI-20.salvar') }),
        ),
      ),
    );
  }

  function modalDeApagar() {
    return modal('modal-apagar', 'veio-modal', { 'aria-labelledby': 'modal-apagar-titulo', 'aria-describedby': 'modal-apagar-corpo' },
      botaoDeFechar({ 'data-fechar-modal': '' }),
      vazio('h2', 'veio-modal__titulo', 'modal-apagar-titulo'),
      vazio('p', 'veio-modal__corpo', 'modal-apagar-corpo'),
      acoes(
        botao('veio-botao--fantasma', { 'data-fechar-modal': '', 'data-foco-seguro': '', id: 'btn-apagar-cancelar' }),
        botao('veio-botao--perigo-cheio', { id: 'btn-apagar-confirmar' }),
      ),
    );
  }

  const opcaoDeAba = (valor, vozDoTexto) => no('label', 'veio-segmentado__opcao', {},
    no('input', '', { type: 'radio', name: 'aba-minerar', value: valor }), no('span', '', voz(vozDoTexto)));

  function abasDeMinerar() {
    return no('div', 'minerar-abas', {},
      no('div', 'veio-segmentado', { role: 'radiogroup', 'data-voz-aria': 'ADD-01.botao' }, opcaoDeAba('colar', 'ADD-01.colar'), opcaoDeAba('arquivo', 'ADD-01.arquivo')),
      botao('veio-botao--fantasma veio-botao--compacto minerar-abas__foto', { id: 'btn-minerar-foto', 'aria-describedby': 'minerar-foto-ajuda' },
        no('span', '', voz('ADD-01.foto')), icone('externo')),
      no('span', '', { id: 'minerar-foto-ajuda', ...voz('ADD-11.fotoAjuda'), hidden: '' }),
    );
  }

  function colarDeMinerar() {
    return no('form', 'minerar-colar', { id: 'minerar-colar', novalidate: '' },
      campo(
        rotulo('ADD-12.campo'),
        no('textarea', 'veio-campo minerar-colar__frases', { id: 'minerar-frases', rows: '7', spellcheck: 'false', 'aria-describedby': 'minerar-frases-erro' }),
        no('span', 'veio-campo-erro', { id: 'minerar-frases-erro', hidden: '' }),
      ),
      no('div', 'minerar-colar__contexto', {}, campoDeTexto('minerar-fonte', 'PAI-21.fonte'), campoDeTexto('minerar-titulo', 'PAI-21.titulo')),
      acoes(
        vazio('span', 'minerar-contagem', 'minerar-contagem'),
        botao('veio-botao--fantasma', { type: 'button', 'data-fechar-modal': '', ...voz('ADD-12.cancelar') }),
        botao('veio-botao--primario', { type: 'submit', id: 'btn-minerar-colar' }),
      ),
    );
  }

  function arquivoDeMinerar() {
    return no('div', 'minerar-arquivo', { id: 'minerar-arquivo', hidden: '' },
      no('div', 'minerar-arquivo__area', {},
        vazio('b', 'minerar-arquivo__nome', 'minerar-arquivo-nome'),
        no('p', 'minerar-arquivo__nota', voz('ADD-12.arquivoNota')),
        no('input', '', { type: 'file', id: 'minerar-arquivo-escolha', accept: '.txt,text/plain', hidden: '' }),
        botao('veio-botao--contorno veio-botao--compacto', { id: 'btn-minerar-escolher' }),
      ),
      no('p', 'veio-campo-erro', { id: 'minerar-arquivo-erro', role: 'alert', hidden: '' }),
      no('p', 'minerar-resultado', { id: 'minerar-arquivo-resultado', role: 'status', hidden: '' }),
      acoes(botao('veio-botao--fantasma', { 'data-fechar-modal': '', id: 'btn-minerar-arquivo-sair' })),
    );
  }

  function progressoDeMinerar() {
    return no('div', 'minerar-progresso', { id: 'minerar-progresso', hidden: '' },
      no('b', 'minerar-progresso__rotulo', { id: 'minerar-progresso-rotulo', 'aria-live': 'polite' }),
      no('div', 'minerar-progresso__barra', { role: 'progressbar', 'aria-labelledby': 'minerar-progresso-rotulo', 'aria-valuemin': '0' }, no('i', '', {})),
      no('p', 'minerar-progresso__nota', voz('ADD-12.progressoNota')),
    );
  }

  function modalDeMinerar() {
    return modal('modal-minerar', 'veio-modal minerar-modal', { 'aria-labelledby': 'modal-minerar-titulo' },
      botaoDeFechar({ 'data-fechar-modal': '' }),
      no('h2', 'veio-modal__titulo', { id: 'modal-minerar-titulo', ...voz('ADD-01.botao') }),
      no('div', '', { id: 'minerar-edicao' }, abasDeMinerar(), colarDeMinerar(), arquivoDeMinerar()),
      progressoDeMinerar(),
    );
  }

  function modalDoEnvio() {
    return modal('modal-envio', 'veio-modal envio-modal', { 'aria-labelledby': 'modal-envio-titulo', 'aria-describedby': 'modal-envio-detalhe' },
      botaoDeFechar({ id: 'modal-envio-fechar' }),
      no('h2', 'veio-modal__titulo', { id: 'modal-envio-titulo', ...voz('ENV-06.titulo') }),
      vazio('p', 'veio-modal__corpo', 'modal-envio-detalhe'),
      no('p', 'envio-modal__sem-noticia', { id: 'modal-envio-sem-noticia', role: 'status', ...voz('ENV-09'), hidden: '' }),
      vazio('div', 'envio-modal__envios', 'modal-envio-lista'),
      no('p', 'envio-modal__pe', voz('ENV-15')),
    );
  }

  function modalDoResumo() {
    return modal('modal-resumo', 'veio-modal envio-modal', { 'aria-labelledby': 'modal-resumo-titulo' },
      botaoDeFechar({ id: 'modal-resumo-fechar' }),
      vazio('h2', 'veio-modal__titulo', 'modal-resumo-titulo'),
      vazio('p', 'veio-modal__corpo', 'modal-resumo-detalhe'),
      vazio('div', 'envio-resumo__baralhos', 'modal-resumo-baralhos'),
      no('div', 'envio-resumo__historico', {}, vazio('p', 'envio-resumo__pergunta', 'modal-resumo-pergunta'), vazio('p', 'envio-resumo__ajuda', 'modal-resumo-ajuda')),
      acoes(
        botao('veio-botao--secundario', { id: 'btn-resumo-manter' }),
        botao('veio-botao--primario', { id: 'btn-resumo-apagar' }, icone('apagar'), no('span', '', voz('ENV-10.tirar'))),
      ),
    );
  }

  document.getElementById('abridor-ponte').before(modalDoContexto(), modalDeApagar(), modalDeMinerar(), modalDoEnvio(), modalDoResumo());
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
