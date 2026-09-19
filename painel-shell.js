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
// O shell é dono do que fica na sidebar: o total de frases, o ponto da Conexão
// com o Anki (e a faixa F1 da área dela) e o chip de conta. O painel.js conta
// ao shell o que muda (`mostrarTotalDeFrases`, `mostrarConta`,
// `mostrarSincronizacao`) e pede para saber quando a pessoa entra numa área
// (`aoEntrarNaArea`). Toda cópia vem do catálogo da Voz.

(function (raiz) {
  const ABAS_DA_CONEXAO = ['custos', 'baralhos', 'vocabulario', 'ajustes'];
  const SECOES_DE_CONFIGURACOES = ['conta', 'atalhos', 'chave', 'perigo'];

  const ENDERECO_DA_CONEXAO = 'http://127.0.0.1:8766';
  /** De quanto em quanto tempo o ponto da Conexão com o Anki é conferido. */
  const INTERVALO_DA_CONEXAO = 15000;
  /** “Sincronizado há N minutos” avança sozinho. */
  const INTERVALO_DO_RELOGIO = 30000;

  const QUANTO_TEMPO = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

  const estado = {
    area: null,
    conexao: 'conectando',   // 'conectando' | 'ligada' | 'desligada'
    conferindoConexao: false,
    conta: null,             // { displayName, email, photoURL } | null
    sincronizacao: null,     // 'sincronizando' | 'sincronizado' | 'erro' | null
    sincronizadoEm: null,
  };
  const ouvintesDeArea = new Map();

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
    window.addEventListener('hashchange', aplicarEndereco);
    document.addEventListener('click', reaplicarOMesmoEndereco);

    aplicarEndereco();
    mostrarConexao('conectando');
    desenharChip();
    conferirConexao();
    setInterval(conferirConexao, INTERVALO_DA_CONEXAO);
    setInterval(() => { if (estado.sincronizacao === 'sincronizado') desenharChip(); }, INTERVALO_DO_RELOGIO);
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

  /** Rola até o card da seção e pisca a borda dele (parada com movimento reduzido). */
  function rolarAteASecao(secao) {
    const card = porId(`cfg-${secao}`);
    card.scrollIntoView({ block: 'start' });
    card.classList.remove('shell-card--destaque');
    void card.offsetWidth;
    card.classList.add('shell-card--destaque');
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

  // ─── Conta ─────────────────────────────────────────────────────────────────

  function mostrarConta(usuario) {
    estado.conta = usuario ? { ...usuario } : null;
    if (!usuario) estado.sincronizacao = null;
    desenharChip();
  }

  function mostrarSincronizacao(situacao) {
    estado.sincronizacao = situacao;
    if (situacao === 'sincronizado') estado.sincronizadoEm = Date.now();
    desenharChip();
  }

  function desenharChip() {
    const chip = porId('shell-chip');
    const avatar = porId('shell-avatar');
    const nome = porId('shell-chip-nome');
    const situacao = porId('shell-chip-estado');
    const { conta } = estado;

    avatar.replaceChildren();
    avatar.classList.toggle('shell-avatar--vazio', !conta);
    situacao.classList.remove('shell-chip__estado--erro');

    if (!conta) {
      avatar.append(raiz.Veio.iconeVeio('conta'));
      nome.textContent = textoDaVoz('SHL-05.semConta');
      situacao.textContent = '';
      situacao.hidden = true;
      chip.title = nome.textContent;
      return;
    }

    const nomeVisivel = conta.displayName || conta.email || textoDaVoz('CFG-10');
    nome.textContent = nomeVisivel;
    chip.title = nomeVisivel;
    if (conta.photoURL) {
      const foto = document.createElement('img');
      foto.src = conta.photoURL;
      foto.alt = '';
      avatar.append(foto);
    } else {
      avatar.textContent = nomeVisivel.charAt(0).toUpperCase();
    }

    situacao.textContent = textoDaSincronizacao();
    situacao.hidden = !situacao.textContent;
    situacao.classList.toggle('shell-chip__estado--erro', estado.sincronizacao === 'erro');
  }

  function textoDaSincronizacao() {
    switch (estado.sincronizacao) {
      case 'sincronizando': return textoDaVoz('CFG-01');
      case 'sincronizado': return textoDaVoz('CFG-02', { quando: haQuantoTempo(estado.sincronizadoEm) });
      case 'erro': return textoDaVoz('SHL-05.semSincronizar');
      default: return '';
    }
  }

  /** “agora”, “há 2 minutos”, “há 3 horas”, “ontem”: o `{quando}` da CFG-02. */
  function haQuantoTempo(momento) {
    const minutos = Math.floor((Date.now() - momento) / 60000);
    if (minutos < 1) return QUANTO_TEMPO.format(0, 'second');
    if (minutos < 60) return QUANTO_TEMPO.format(-minutos, 'minute');
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return QUANTO_TEMPO.format(-horas, 'hour');
    return QUANTO_TEMPO.format(-Math.floor(horas / 24), 'day');
  }

  document.addEventListener('DOMContentLoaded', iniciarShell);

  raiz.Shell = {
    aoEntrarNaArea,
    areaAtual,
    mostrarTotalDeFrases,
    mostrarConta,
    mostrarSincronizacao,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
