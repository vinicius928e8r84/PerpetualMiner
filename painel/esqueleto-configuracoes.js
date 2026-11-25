'use strict';

(function (raiz) {
  const { elemento } = raiz.Veio;

  function no(tag, classe, atributos, ...filhos) {
    const novo = elemento(tag, classe, ...filhos);
    for (const [nome, valor] of Object.entries(atributos)) novo.setAttribute(nome, valor);
    return novo;
  }

  const voz = id => ({ 'data-voz': id });
  const icone = nome => no('span', '', { 'data-icone': nome });

  function cabecaDoCartao({ id, icone: nomeDoIcone, titulo, descricao }) {
    return no('div', 'cfg-cabeca', {},
      no('span', 'cfg-icone', {}, icone(nomeDoIcone)),
      no('div', 'cfg-titulos', {},
        no('h2', 'shell-card__titulo', {},
          no('button', 'cfg-alternar', { id: `${id}-titulo`, 'aria-expanded': 'false', 'aria-controls': `${id}-corpo`, ...voz(titulo) })),
        no('p', 'cfg-descricao', descricao)),
      no('span', 'cfg-resumo', { id: `${id}-resumo` }),
      no('span', 'cfg-chevron', {}, icone('abrir')));
  }

  function cartao({ id, perigo, ...cabeca }, ...conteudo) {
    return no('section', `shell-card cfg-card${perigo ? ' shell-card--perigo' : ''}`, { id, 'aria-labelledby': `${id}-titulo` },
      cabecaDoCartao({ id, ...cabeca }),
      no('div', 'cfg-corpo', { id: `${id}-corpo`, hidden: '' }, ...conteudo));
  }

  const opcaoDeTema = valor => no('label', 'veio-segmentado__opcao', {},
    no('input', '', { type: 'radio', name: 'tema', value: valor }), no('span', '', voz(`CFG-30.${valor}`)));

  const temaDaAparencia = () => no('div', 'veio-segmentado', { id: 'cfg-tema', role: 'radiogroup', 'data-voz-aria': 'CFG-30.rotulo' },
    opcaoDeTema('escuro'), opcaoDeTema('claro'));

  const cartoes = () => [
    cartao({ id: 'cfg-conta', icone: 'conta', titulo: 'SHL-04.conta', descricao: voz('CFG-25') }),
    cartao({ id: 'cfg-atalhos', icone: 'teclado', titulo: 'SHL-04.atalhos', descricao: voz('CFG-33') }),
    cartao({ id: 'cfg-ia', icone: 'ia', titulo: 'CFG-35.titulo', descricao: voz('CFG-35.descricao') }),
    cartao({ id: 'cfg-chave', icone: 'chave', titulo: 'CFG-15.titulo', descricao: voz('CFG-15.descricao') }),
    cartao({ id: 'cfg-anki', icone: 'anki', titulo: 'SHL-04.anki', descricao: voz('CFG-40') }),
    cartao({ id: 'cfg-aparencia', icone: 'tema', titulo: 'CFG-29.titulo', descricao: voz('CFG-29.descricao') }, temaDaAparencia()),
    cartao({ id: 'cfg-perigo', perigo: true, icone: 'perigo', titulo: 'SHL-04.perigo', descricao: { id: 'cfg-perigo-descricao' } }),
  ];

  function areaDeConfiguracoes() {
    return no('section', 'shell-area', { 'data-area': 'configuracoes', 'aria-labelledby': 'titulo-configuracoes', hidden: '' },
      no('header', 'shell-cabecalho', {}, no('h1', '', { id: 'titulo-configuracoes', ...voz('SHL-02.configuracoes') })),
      no('div', 'shell-cards', {}, ...cartoes()));
  }

  document.querySelector('.shell-conteudo').append(areaDeConfiguracoes());
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
