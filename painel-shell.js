'use strict';

(function (raiz) {
  const AREAS_DO_PAINEL = Object.freeze(['frases', 'anki', 'configuracoes']);
  const ABAS_DA_CONEXAO = ['custos', 'baralhos', 'vocabulario', 'ajustes'];
  const SECOES_DE_CONFIGURACOES = ['conta', 'atalhos', 'ia', 'chave', 'anki', 'aparencia', 'perigo'];

  const MASCARA_DA_CHAVE = '••••••••';

  const estado = { area: null };
  const ouvintesDeArea = new Map();
  const ouvintesDeSecao = new Map();
  const fimDosDestaques = new Map();

  const { textoDaVoz, Atalhos, Veio, ConexaoAnki, ConexaoNaTela } = raiz;
  const { SITUACAO } = ConexaoAnki;
  const $ = seletor => document.querySelector(seletor);
  const $$ = seletor => [...document.querySelectorAll(seletor)];
  const porId = id => document.getElementById(id);

  function iniciarShell() {
    escreverTextosDoCatalogo();
    desenharIcones();

    for (const radio of $$('input[name="aba-anki"]')) {
      radio.addEventListener('change', () => { location.hash = `#anki/${radio.value}`; });
    }
    ConexaoNaTela.ligarTentarDeNovo(porId('shell-tentar-de-novo'));
    for (const radio of $$('#cfg-tema input[name="tema"]')) {
      radio.addEventListener('change', () => { if (radio.checked) raiz.Tema.gravarTema(radio.value); });
    }
    for (const cabeca of $$('.shell-area[data-area="configuracoes"] .cfg-cabeca')) {
      cabeca.addEventListener('click', () => alternarCard(cabeca.closest('.cfg-card')));
    }
    window.addEventListener('hashchange', aplicarEndereco);
    document.addEventListener('click', reaplicarOMesmoEndereco);
    // Outra página que leva o painel ao endereço em que ele já está (o “Abrir
    // Configurações” do Minerar de uma foto) não dispara `hashchange`: ela avisa.
    chrome.runtime.onMessage.addListener(mensagem => {
      if (mensagem?.type === 'PAINEL_REAPLICAR_ENDERECO') aplicarEndereco();
    });

    aplicarEndereco();
    lerResumosGravados();
    ConexaoAnki.acompanhar(mostrarConexao);
    raiz.PareamentoComOAnki?.aoMudar(() => mostrarConexao(ConexaoAnki.situacao()));
    ConexaoAnki.iniciar({ aCada: ConexaoAnki.INTERVALO });
  }

  function escreverTextosDoCatalogo() {
    for (const no of $$('[data-voz]')) no.textContent = textoDaVoz(no.dataset.voz);
    for (const no of $$('[data-voz-aria]')) no.setAttribute('aria-label', textoDaVoz(no.dataset.vozAria));
    for (const no of $$('[data-voz-title]')) no.title = textoDaVoz(no.dataset.vozTitle);
    for (const item of $$('.shell-item')) {
      if (item.dataset.area !== 'anki') item.title = item.querySelector('.shell-rotulo').textContent;
    }
  }

  function desenharIcones() {
    const { iconeVeio } = raiz.Veio;
    for (const lugar of $$('[data-icone]')) lugar.replaceWith(iconeVeio(lugar.dataset.icone));
  }

  function lerEndereco(hash) {
    const [area, parte] = hash.replace(/^#/, '').split('/');
    if (area === 'anki') {
      return { area, aba: ABAS_DA_CONEXAO.includes(parte) ? parte : ABAS_DA_CONEXAO[0] };
    }
    if (area === 'configuracoes') {
      return { area, secao: SECOES_DE_CONFIGURACOES.includes(parte) ? parte : null };
    }
    if (area === 'boas-vindas') return { area };
    return { area: 'frases' };
  }

  function aplicarEndereco() {
    const { area, aba, secao } = lerEndereco(location.hash);
    const entrou = area !== estado.area;
    estado.area = area;

    $('.shell').hidden = area === 'boas-vindas';
    porId('boas-vindas').hidden = area !== 'boas-vindas';
    for (const vista of $$('.shell-area')) vista.hidden = vista.dataset.area !== area;
    for (const item of $$('.shell-item')) {
      if (item.dataset.area === area) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    }
    if (aba) mostrarAba(aba);

    if (area === 'configuracoes' && !secao) fecharOsCards();
    if (secao) rolarAteASecao(secao);
    else if (entrou) $('.shell-conteudo').scrollTo(0, 0);

    if (entrou) for (const ouvinte of ouvintesDeArea.get(area) || []) ouvinte();
  }

  /**
   * Um link para o endereço em que a pessoa já está não dispara `hashchange`:
   * sem isto, clicar no chip já em #configuracoes/conta não levaria de volta ao card.
   */
  function reaplicarOMesmoEndereco(evento) {
    if (evento.defaultPrevented || evento.button !== 0 || evento.ctrlKey || evento.metaKey || evento.shiftKey) return;
    const link = evento.target.closest('a[href^="#"]');
    if (link && link.getAttribute('href') === location.hash) aplicarEndereco();
  }

  function mostrarAba(aba) {
    for (const radio of $$('input[name="aba-anki"]')) radio.checked = radio.value === aba;
    for (const vista of $$('.shell-aba')) vista.hidden = vista.dataset.aba !== aba;
    $('.shell-item[data-area="anki"]').setAttribute('href', `#anki/${aba}`);
  }

  function abrirCard(card, aberto) {
    card.classList.toggle('cfg-card--aberto', aberto);
    card.querySelector('.cfg-alternar').setAttribute('aria-expanded', String(aberto));
    card.querySelector('.cfg-corpo').hidden = !aberto;
  }

  function alternarCard(card) {
    abrirCard(card, !card.classList.contains('cfg-card--aberto'));
  }

  function fecharOsCards() {
    for (const card of $$('.shell-area[data-area="configuracoes"] .cfg-card')) abrirCard(card, false);
  }

  function rolarAteASecao(secao) {
    const card = porId(`cfg-${secao}`);
    abrirCard(card, true);
    card.scrollIntoView({ block: 'start' });
    card.classList.remove('shell-card--destaque');
    void card.offsetWidth;
    card.classList.add('shell-card--destaque');
    clearTimeout(fimDosDestaques.get(card));
    fimDosDestaques.set(card, setTimeout(() => card.classList.remove('shell-card--destaque'), duracaoDoDestaque()));
    for (const ouvinte of ouvintesDeSecao.get(secao) || []) ouvinte();
  }

  function duracaoDoDestaque() {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--veio-destaque')) * 1000;
  }

  function registrar(ouvintes, chave, ouvinte, jaVale) {
    if (!ouvintes.has(chave)) ouvintes.set(chave, []);
    ouvintes.get(chave).push(ouvinte);
    if (jaVale) ouvinte();
  }

  function aoEntrarNaArea(area, ouvinte) {
    registrar(ouvintesDeArea, area, ouvinte, estado.area === area);
  }

  function aoAbrirASecao(secao, ouvinte) {
    registrar(ouvintesDeSecao, secao, ouvinte,
      estado.area === 'configuracoes' && lerEndereco(location.hash).secao === secao);
  }

  function areaAtual() {
    return estado.area;
  }

  function mostrarTotalDeFrases(n) {
    porId('shell-total').textContent = n.toLocaleString('pt-BR');
    porId('shell-total-descricao').textContent = textoDaVoz('PAI-05', { n });
    porId('cfg-perigo-resumo').replaceChildren(
      elemento('span', null, n ? textoDaVoz('PAI-05', { n }) : textoDaVoz('CFG-28.nenhumaFrase')));
  }

  function lerResumosGravados() {
    Atalhos.acompanharAtalhos(mostrarResumoDosAtalhos);
    chrome.storage.local.get({ geminiApiKey: '' }, dados => mostrarResumoDaChave(dados.geminiApiKey));
    raiz.Tema.acompanharTemaGravado(mostrarTema);
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area === 'local' && 'geminiApiKey' in mudancas) mostrarResumoDaChave(mudancas.geminiApiKey.newValue || '');
    });
  }

  function mostrarResumoDosAtalhos({ legenda, selecao }) {
    const atalho = (rotulo, gravado) => elemento('span', null, `${textoDaVoz(rotulo)} `,
      Veio.montarTecla(Atalhos.rotuloDoAtalho(gravado), { seVazia: textoDaVoz('CFG-12.semAtalho') }));
    porId('cfg-atalhos-resumo').replaceChildren(
      atalho('CFG-28.legenda', legenda),
      atalho('CFG-28.selecao', selecao));
  }

  function mostrarTema(escolhido) {
    for (const radio of $$('#cfg-tema input[name="tema"]')) radio.checked = radio.value === escolhido;
    porId('cfg-aparencia-resumo').replaceChildren(
      elemento('span', null, textoDaVoz(`CFG-31.${escolhido}`)));
  }

  function mostrarResumoDaChave(chave) {
    const resumo = porId('cfg-chave-resumo');
    if (!chave) {
      const ponto = elemento('span', 'cfg-ponto');
      ponto.dataset.estado = 'erro';
      ponto.setAttribute('aria-hidden', 'true');
      resumo.replaceChildren(elemento('span', 'cfg-status cfg-status--erro', ponto, textoDaVoz('CFG-28.semChave')));
      return;
    }
    resumo.replaceChildren(elemento('span', 'cfg-chave-mascarada', mascararChave(chave)));
  }

  function mascararChave(chave) {
    return chave.length > 8 ? chave.slice(0, 4) + MASCARA_DA_CHAVE + chave.slice(-4) : MASCARA_DA_CHAVE;
  }

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  function mostrarConexao(situacao) {
    const apresentada = ConexaoAnki.apresentada();
    const status = ConexaoNaTela.texto(apresentada);
    ConexaoNaTela.pintarPonto($('.shell-ponto'), apresentada);
    $('.shell-item[data-area="anki"]').title = status;
    porId('shell-conexao-descricao').textContent = status;

    ConexaoNaTela.pintarTentarDeNovo(porId('shell-tentar-de-novo'), situacao, {
      sai: situacao === SITUACAO.LIGADA,
      focoPara: () => document.querySelector('input[name="aba-anki"]:checked'),
    });
    if (situacao === SITUACAO.DESLIGADA) porId('shell-faixa-conexao').hidden = false;
    if (situacao === SITUACAO.LIGADA) porId('shell-faixa-conexao').hidden = true;
  }

  document.addEventListener('DOMContentLoaded', iniciarShell);

  raiz.Shell = {
    AREAS_DO_PAINEL,
    aoAbrirASecao,
    aoEntrarNaArea,
    areaAtual,
    mascararChave,
    mostrarTotalDeFrases,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
