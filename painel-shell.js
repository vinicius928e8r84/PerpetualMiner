'use strict';

// O shell “Ilhas” do Painel (docs/design/painel/shell/): uma página só, com uma
// área por endereço, e os indicadores colados na navegação.
//
//   #frases (padrão)                        Frases mineradas
//   #anki/custos|baralhos|vocabulario|ajustes  a aba da Conexão com o Anki
//   #configuracoes[/conta|atalhos|chave|perigo] Configurações, rolando até o card
//
// Trocar de área só troca a vista: nada recarrega, então os filtros, a página, a
// seleção, o sync e o acompanhamento de envios do painel.js continuam como estão.
//
// O shell é dono do que fica na sidebar: o total de frases e o ponto da Conexão
// com o Anki (e a faixa F1 da área dela). O chip de conta mora na sidebar, mas
// quem o desenha é painel-conta.js, junto com o card Conta & sync que ele
// espelha. O painel.js conta ao shell o total (`mostrarTotalDeFrases`) e pede
// para saber quando a pessoa entra numa área (`aoEntrarNaArea`).
//
// Em Configurações, os cards ficam fechados numa linha com o resumo e abrem no
// lugar, vários ao mesmo tempo; #configuracoes/<seção> abre o da seção. O
// resumo da conta é do painel-conta.js; os de Atalhos, Chave do Gemini e Zona
// de perigo saem daqui, do que já está gravado (o atalho de seleção, a chave e
// o total de frases). Toda cópia vem do catálogo da Voz.

(function (raiz) {
  const ABAS_DA_CONEXAO = ['custos', 'baralhos', 'vocabulario', 'ajustes'];
  const SECOES_DE_CONFIGURACOES = ['conta', 'atalhos', 'chave', 'perigo'];

  /**
   * O atalho de legenda ainda é o Alt+S fixo do content.js (`ATALHO_TECLA`); ele
   * fica gravável no ticket de Atalhos, e o resumo passa a ler o que for gravado.
   */
  const ATALHO_DE_LEGENDA = { type: 'keyboard', code: 'KeyS', altKey: true, ctrlKey: false, shiftKey: false };
  /** Os botões extras do mouse em PT-BR (CFG-14), pelo `button` do evento gravado. */
  const BOTOES_DO_MOUSE = { 1: 'CFG-14.botaoDoMeio', 3: 'CFG-14.botaoVoltar', 4: 'CFG-14.botaoAvancar' };
  /** A chave do Gemini no resumo: os 4 primeiros e os 4 últimos caracteres. */
  const MASCARA_DA_CHAVE = '••••••••';

  const ENDERECO_DA_CONEXAO = 'http://127.0.0.1:8766';
  /** De quanto em quanto tempo o ponto da Conexão com o Anki é conferido. */
  const INTERVALO_DA_CONEXAO = 15000;
  const estado = {
    area: null,
    conexao: 'conectando',   // 'conectando' | 'ligada' | 'desligada'
    conferindoConexao: false,
  };
  const ouvintesDeArea = new Map();
  const fimDosDestaques = new Map();   // card → o timer que tira a borda do destaque

  const { textoDaVoz } = raiz;
  const $ = seletor => document.querySelector(seletor);
  const $$ = seletor => [...document.querySelectorAll(seletor)];
  const porId = id => document.getElementById(id);

  // ─── Início ────────────────────────────────────────────────────────────────

  function iniciarShell() {
    escreverTextosDoCatalogo();
    desenharIcones();

    for (const radio of $$('input[name="aba-anki"]')) {
      radio.addEventListener('change', () => { location.hash = `#anki/${radio.value}`; });
    }
    porId('shell-tentar-de-novo').addEventListener('click', tentarAConexaoDeNovo);
    // A linha inteira do card abre e fecha; o botão do título é quem o teclado
    // e o leitor de tela usam, e o clique nele sobe até aqui.
    for (const cabeca of $$('.cfg-cabeca')) {
      cabeca.addEventListener('click', () => alternarCard(cabeca.closest('.cfg-card')));
    }
    window.addEventListener('hashchange', aplicarEndereco);
    document.addEventListener('click', reaplicarOMesmoEndereco);

    aplicarEndereco();
    lerResumosGravados();
    mostrarConexao('conectando');
    conferirConexao();
    setInterval(conferirConexao, INTERVALO_DA_CONEXAO);
  }

  /** Os textos fixos do shell, pelos atributos data-voz do painel.html. */
  function escreverTextosDoCatalogo() {
    for (const no of $$('[data-voz]')) no.textContent = textoDaVoz(no.dataset.voz);
    for (const no of $$('[data-voz-aria]')) no.setAttribute('aria-label', textoDaVoz(no.dataset.vozAria));
    for (const no of $$('[data-voz-title]')) no.title = textoDaVoz(no.dataset.vozTitle);
    // No trilho só o ícone fica à vista: o rótulo vira o tooltip.
    for (const item of $$('.shell-item')) {
      if (item.dataset.area !== 'anki') item.title = item.querySelector('.shell-rotulo').textContent;
    }
  }

  function desenharIcones() {
    const { iconeVeio } = raiz.Veio;
    for (const lugar of $$('[data-icone]')) lugar.replaceWith(iconeVeio(lugar.dataset.icone));
  }

  // ─── Endereços ─────────────────────────────────────────────────────────────

  /** A área (e a aba ou a seção) que um endereço abre. O desconhecido abre Frases. */
  function lerEndereco(hash) {
    const [area, parte] = hash.replace(/^#/, '').split('/');
    if (area === 'anki') {
      return { area, aba: ABAS_DA_CONEXAO.includes(parte) ? parte : ABAS_DA_CONEXAO[0] };
    }
    if (area === 'configuracoes') {
      return { area, secao: SECOES_DE_CONFIGURACOES.includes(parte) ? parte : null };
    }
    return { area: 'frases' };
  }

  function aplicarEndereco() {
    const { area, aba, secao } = lerEndereco(location.hash);
    const entrou = area !== estado.area;
    estado.area = area;

    for (const vista of $$('.shell-area')) vista.hidden = vista.dataset.area !== area;
    for (const item of $$('.shell-item')) {
      if (item.dataset.area === area) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    }
    if (aba) mostrarAba(aba);

    // #configuracoes sozinho mostra todos os cards fechados.
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
    // Voltar à área pela sidebar reabre a última aba vista.
    $('.shell-item[data-area="anki"]').setAttribute('href', `#anki/${aba}`);
  }

  // ─── Cards de Configurações ────────────────────────────────────────────────

  function abrirCard(card, aberto) {
    card.classList.toggle('cfg-card--aberto', aberto);
    card.querySelector('.cfg-alternar').setAttribute('aria-expanded', String(aberto));
    card.querySelector('.cfg-corpo').hidden = !aberto;
  }

  function alternarCard(card) {
    abrirCard(card, !card.classList.contains('cfg-card--aberto'));
  }

  function fecharOsCards() {
    for (const card of $$('.cfg-card')) abrirCard(card, false);
  }

  /**
   * Abre o card da seção, rola até ele e pisca a borda. O destaque dura o
   * `--veio-destaque`: com movimento reduzido não há animação para acabar, e a
   * borda parada sai quando ele termina.
   */
  function rolarAteASecao(secao) {
    const card = porId(`cfg-${secao}`);
    abrirCard(card, true);
    card.scrollIntoView({ block: 'start' });
    card.classList.remove('shell-card--destaque');
    void card.offsetWidth;
    card.classList.add('shell-card--destaque');
    clearTimeout(fimDosDestaques.get(card));
    fimDosDestaques.set(card, setTimeout(() => card.classList.remove('shell-card--destaque'), duracaoDoDestaque()));
  }

  /** O `--veio-destaque` (em segundos, nos tokens) em milissegundos. */
  function duracaoDoDestaque() {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--veio-destaque')) * 1000;
  }

  /** `ouvinte` roda cada vez que a pessoa entra na `area` (inclusive ao abrir nela). */
  function aoEntrarNaArea(area, ouvinte) {
    if (!ouvintesDeArea.has(area)) ouvintesDeArea.set(area, []);
    ouvintesDeArea.get(area).push(ouvinte);
    if (estado.area === area) ouvinte();
  }

  function areaAtual() {
    return estado.area;
  }

  // ─── Frases ────────────────────────────────────────────────────────────────

  function mostrarTotalDeFrases(n) {
    porId('shell-total').textContent = n.toLocaleString('pt-BR');
    porId('shell-total-descricao').textContent = textoDaVoz('PAI-05', { n });
    // A linha fechada da Zona de perigo: “1.284 frases”, “1 frase”, “Nenhuma frase”.
    porId('cfg-perigo-resumo').replaceChildren(
      elemento('span', null, n ? textoDaVoz('PAI-05', { n }) : textoDaVoz('CFG-28.nenhumaFrase')));
  }

  // ─── Resumos de Atalhos e da Chave do Gemini ───────────────────────────────

  /** O atalho de seleção e a chave, como estão gravados, e cada mudança deles. */
  function lerResumosGravados() {
    chrome.storage.local.get({ pm_atalho: null, geminiApiKey: '' }, dados => {
      mostrarResumoDosAtalhos(dados.pm_atalho);
      mostrarResumoDaChave(dados.geminiApiKey);
    });
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area !== 'local') return;
      if ('pm_atalho' in mudancas) mostrarResumoDosAtalhos(mudancas.pm_atalho.newValue || null);
      if ('geminiApiKey' in mudancas) mostrarResumoDaChave(mudancas.geminiApiKey.newValue || '');
    });
  }

  /** “Legenda [Alt+S]  Seleção [Alt+Botão voltar]”, com as teclas em `kbd`. */
  function mostrarResumoDosAtalhos(atalhoDeSelecao) {
    const atalho = (rotulo, gravado) => elemento('span', null, `${textoDaVoz(rotulo)} `, teclaDoAtalho(gravado));
    porId('cfg-atalhos-resumo').replaceChildren(
      atalho('CFG-28.legenda', ATALHO_DE_LEGENDA),
      atalho('CFG-28.selecao', atalhoDeSelecao));
  }

  /** A tecla gravada; sem atalho, o `kbd` tracejado “Sem atalho” (CFG-12). */
  function teclaDoAtalho(atalho) {
    if (!atalho) return elemento('kbd', 'veio-kbd veio-kbd--sem-atalho', textoDaVoz('CFG-12.semAtalho'));
    return elemento('kbd', 'veio-kbd', rotuloDoAtalho(atalho));
  }

  /**
   * O rótulo do atalho refeito do que foi gravado, e não do `label` antigo (em
   * inglês): “Ctrl+Shift+K”, “Alt+Botão voltar”.
   */
  function rotuloDoAtalho(atalho) {
    const modificadores = [atalho.ctrlKey && 'Ctrl', atalho.altKey && 'Alt', atalho.shiftKey && 'Shift'].filter(Boolean);
    let tecla;
    if (atalho.type === 'mouse') {
      const botao = BOTOES_DO_MOUSE[atalho.button];
      if (!botao) return atalho.label;
      tecla = textoDaVoz(botao);
    } else {
      if (!atalho.code) return atalho.label;
      tecla = atalho.code.replace(/^(Key|Digit)/, '');
    }
    return [...modificadores, tecla].join('+');
  }

  /** `AIza••••••••3kQ9` em mono; vazia, o ponto `danger` e “Sem chave”. */
  function mostrarResumoDaChave(chave) {
    const resumo = porId('cfg-chave-resumo');
    if (!chave) {
      const ponto = elemento('span', 'cfg-ponto');
      ponto.dataset.estado = 'erro';
      ponto.setAttribute('aria-hidden', 'true');
      resumo.replaceChildren(elemento('span', 'cfg-status cfg-status--erro', ponto, textoDaVoz('CFG-28.semChave')));
      return;
    }
    const mascarada = chave.length > 8 ? chave.slice(0, 4) + MASCARA_DA_CHAVE + chave.slice(-4) : MASCARA_DA_CHAVE;
    resumo.replaceChildren(elemento('span', 'cfg-chave-mascarada', mascarada));
  }

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  // ─── Conexão com o Anki ────────────────────────────────────────────────────

  async function conferirConexao() {
    if (estado.conferindoConexao) return;
    estado.conferindoConexao = true;
    let ligada = false;
    try {
      ligada = (await fetch(`${ENDERECO_DA_CONEXAO}/health`)).ok;
    } catch {
      ligada = false;
    }
    estado.conferindoConexao = false;
    mostrarConexao(ligada ? 'ligada' : 'desligada');
  }

  function mostrarConexao(situacao) {
    estado.conexao = situacao;
    const status = situacao === 'conectando' ? textoDaVoz('BRG-02') : textoDaVoz(`BRG-01.${situacao}`);
    $('.shell-ponto').dataset.estado = situacao;
    $('.shell-item[data-area="anki"]').title = status;
    porId('shell-conexao-descricao').textContent = status;

    // A faixa F1 fica enquanto a Conexão está desligada, inclusive durante o
    // “Tentar de novo”: ela só sai quando a Conexão responde.
    const tentando = porId('shell-tentar-de-novo');
    if (situacao === 'desligada') porId('shell-faixa-conexao').hidden = false;
    if (situacao === 'ligada') porId('shell-faixa-conexao').hidden = true;
    tentando.disabled = situacao === 'conectando';
  }

  function tentarAConexaoDeNovo() {
    mostrarConexao('conectando');
    conferirConexao();
  }

  document.addEventListener('DOMContentLoaded', iniciarShell);

  raiz.Shell = {
    aoEntrarNaArea,
    areaAtual,
    mostrarTotalDeFrases,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
