'use strict';

// O shell “Ilhas” do Painel (docs/design/painel/shell/): uma página só, com uma
// área por endereço, e os indicadores colados na navegação.
//
//   #frases (padrão)                        Frases mineradas
//   #anki/custos|baralhos|vocabulario|ajustes  a aba da Conexão com o Anki
//   #configuracoes[/conta|atalhos|chave|aparencia|perigo] Configurações, rolando até o card
//   #boas-vindas[/<passo>]                  a Boas-vindas, sem a sidebar (painel-boas-vindas.js)
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
// lugar, vários ao mesmo tempo; #configuracoes/<seção> abre o da seção e avisa
// quem pediu (`aoAbrirASecao`). O resumo da conta é do painel-conta.js; os de
// Atalhos, Chave do Gemini, Aparência e Zona de perigo saem daqui, do que já
// está gravado (os atalhos, a chave, o tema e o total de frases). O conteúdo dos
// cards Atalhos, Chave do Gemini e Zona de perigo é do painel-atalhos.js, do
// painel-chave.js e do painel-perigo.js. Toda cópia vem do catálogo da Voz.

(function (raiz) {
  /** As áreas do painel com a sidebar; a Boas-vindas é a página à parte. */
  const AREAS_DO_PAINEL = Object.freeze(['frases', 'anki', 'configuracoes']);
  const ABAS_DA_CONEXAO = ['custos', 'baralhos', 'vocabulario', 'ajustes'];
  const SECOES_DE_CONFIGURACOES = ['conta', 'atalhos', 'chave', 'aparencia', 'perigo'];

  /** A chave do Gemini no resumo: os 4 primeiros e os 4 últimos caracteres. */
  const MASCARA_DA_CHAVE = '••••••••';

  const ENDERECO_DA_CONEXAO = 'http://127.0.0.1:8766';
  /** As situações da Conexão com o Anki, que o shell diz a quem acompanha (aoMudarAConexao). */
  const CONEXAO = Object.freeze({ CONECTANDO: 'conectando', LIGADA: 'ligada', DESLIGADA: 'desligada' });
  /** De quanto em quanto tempo o ponto da Conexão com o Anki é conferido. */
  const INTERVALO_DA_CONEXAO = 15000;
  const estado = {
    area: null,
    conexao: CONEXAO.CONECTANDO,
    conferencia: null,           // a conferência do /health em andamento (uma promessa)
  };
  const ouvintesDeArea = new Map();
  const ouvintesDeSecao = new Map();   // seção de Configurações → ouvintes
  const ouvintesDaConexao = [];        // quem acompanha a Conexão com o Anki (aoMudarAConexao)
  const ouvintesDaConferencia = [];    // quem mostra a conferência andando (aoConferirAConexao)
  const fimDosDestaques = new Map();   // card → o timer que tira a borda do destaque

  const { textoDaVoz, Atalhos, Veio } = raiz;
  // O tema (veio/tema.js) é pedido só na hora de usar: o shell também é
  // carregado fora da extensão, pelos testes legados, sem a base do <head>.
  const baseDoTema = () => raiz.Tema;
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
    // O tema vale na hora: gravar é o que troca a tela, aqui e em qualquer
    // outra página aberta (veio/tema.js escuta o mesmo storage).
    for (const radio of $$('#cfg-tema input[name="tema"]')) {
      radio.addEventListener('change', () => { if (radio.checked) baseDoTema().gravarTema(radio.value); });
    }
    // A linha inteira do card abre e fecha; o botão do título é quem o teclado
    // e o leitor de tela usam, e o clique nele sobe até aqui.
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
    mostrarConexao(CONEXAO.CONECTANDO);
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
    // O passo da Boas-vindas é de painel-boas-vindas.js.
    if (area === 'boas-vindas') return { area };
    return { area: 'frases' };
  }

  function aplicarEndereco() {
    const { area, aba, secao } = lerEndereco(location.hash);
    const entrou = area !== estado.area;
    estado.area = area;

    // A Boas-vindas é uma página sem a sidebar: o shell inteiro sai da tela.
    $('.shell').hidden = area === 'boas-vindas';
    porId('boas-vindas').hidden = area !== 'boas-vindas';
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
    for (const card of $$('.shell-area[data-area="configuracoes"] .cfg-card')) abrirCard(card, false);
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
    for (const ouvinte of ouvintesDeSecao.get(secao) || []) ouvinte();
  }

  /** O `--veio-destaque` (em segundos, nos tokens) em milissegundos. */
  function duracaoDoDestaque() {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--veio-destaque')) * 1000;
  }

  /**
   * Guarda o `ouvinte` sob a `chave` e, se ela já vale agora, roda na hora: quem
   * se registra depois de o endereço ter sido aplicado não perde a vez.
   */
  function registrar(ouvintes, chave, ouvinte, jaVale) {
    if (!ouvintes.has(chave)) ouvintes.set(chave, []);
    ouvintes.get(chave).push(ouvinte);
    if (jaVale) ouvinte();
  }

  /** `ouvinte` roda cada vez que a pessoa entra na `area` (inclusive ao abrir nela). */
  function aoEntrarNaArea(area, ouvinte) {
    registrar(ouvintesDeArea, area, ouvinte, estado.area === area);
  }

  /**
   * `ouvinte` roda cada vez que um endereço abre a `secao` de Configurações
   * (inclusive ao abrir o painel nele), com o card já aberto.
   */
  function aoAbrirASecao(secao, ouvinte) {
    registrar(ouvintesDeSecao, secao, ouvinte,
      estado.area === 'configuracoes' && lerEndereco(location.hash).secao === secao);
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

  /** Os atalhos, a chave e o tema, como estão gravados, e cada mudança deles. */
  function lerResumosGravados() {
    Atalhos.acompanharAtalhos(mostrarResumoDosAtalhos);
    chrome.storage.local.get({ geminiApiKey: '' }, dados => mostrarResumoDaChave(dados.geminiApiKey));
    // O tema sai do que está gravado, como os outros resumos: o que está
    // pintado ainda pode ser o espelho da primeira pintura, que veio/tema.js
    // corrige quando o storage responde.
    baseDoTema().lerTemaGravado().then(mostrarTema);
    baseDoTema().aoMudarTema(mostrarTema);
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area === 'local' && 'geminiApiKey' in mudancas) mostrarResumoDaChave(mudancas.geminiApiKey.newValue || '');
    });
  }

  /** “Legenda [Alt+S]  Seleção [Alt+Botão voltar]”, com as teclas em `kbd`. */
  function mostrarResumoDosAtalhos({ legenda, selecao }) {
    const atalho = (rotulo, gravado) => elemento('span', null, `${textoDaVoz(rotulo)} `,
      Veio.montarTecla(Atalhos.rotuloDoAtalho(gravado), { seVazia: textoDaVoz('CFG-12.semAtalho') }));
    porId('cfg-atalhos-resumo').replaceChildren(
      atalho('CFG-28.legenda', legenda),
      atalho('CFG-28.selecao', selecao));
  }

  /**
   * O tema em uso: a opção marcada no controle e o resumo da linha fechada
   * (CFG-31). Sem escolha gravada, os dois dizem “Escuro”. Chega sempre
   * normalizado por veio/tema.js, então é “escuro” ou “claro”.
   */
  function mostrarTema(escolhido) {
    for (const radio of $$('#cfg-tema input[name="tema"]')) radio.checked = radio.value === escolhido;
    porId('cfg-aparencia-resumo').replaceChildren(
      elemento('span', null, textoDaVoz(`CFG-31.${escolhido}`)));
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
    resumo.replaceChildren(elemento('span', 'cfg-chave-mascarada', mascararChave(chave)));
  }

  /** `AIza••••••••3kQ9`: a chave nunca aparece inteira na tela. */
  function mascararChave(chave) {
    return chave.length > 8 ? chave.slice(0, 4) + MASCARA_DA_CHAVE + chave.slice(-4) : MASCARA_DA_CHAVE;
  }

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  // ─── Conexão com o Anki ────────────────────────────────────────────────────

  /**
   * Pergunta ao /health se a Conexão está ligada e mostra a resposta. Duas
   * conferências ao mesmo tempo são uma só: quem chama recebe a mesma
   * promessa, que termina com a situação (um dos valores de CONEXAO).
   */
  function conferirConexao() {
    if (!estado.conferencia) {
      estado.conferencia = (async () => {
        for (const ouvinte of ouvintesDaConferencia) ouvinte(true);
        let ligada = false;
        try {
          ligada = (await fetch(`${ENDERECO_DA_CONEXAO}/health`)).ok;
        } catch {
          ligada = false;
        }
        estado.conferencia = null;
        for (const ouvinte of ouvintesDaConferencia) ouvinte(false);
        mostrarConexao(ligada ? CONEXAO.LIGADA : CONEXAO.DESLIGADA);
        return estado.conexao;
      })();
    }
    return estado.conferencia;
  }

  function mostrarConexao(situacao) {
    estado.conexao = situacao;
    for (const ouvinte of ouvintesDaConexao) ouvinte(situacao);
    const status = situacao === CONEXAO.CONECTANDO ? textoDaVoz('BRG-02') : textoDaVoz(`BRG-01.${situacao}`);
    $('.shell-ponto').dataset.estado = situacao;
    $('.shell-item[data-area="anki"]').title = status;
    porId('shell-conexao-descricao').textContent = status;

    // A faixa F1 fica enquanto a Conexão está desligada, inclusive durante o
    // “Tentar de novo”: ela só sai quando a Conexão responde.
    const tentando = porId('shell-tentar-de-novo');
    if (situacao === CONEXAO.DESLIGADA) porId('shell-faixa-conexao').hidden = false;
    if (situacao === CONEXAO.LIGADA) porId('shell-faixa-conexao').hidden = true;
    tentando.disabled = situacao === CONEXAO.CONECTANDO;
  }

  /**
   * Quem precisa saber se a Conexão com o Anki está ligada (o Enviar ao Anki
   * fica indisponível com ela desligada). O ouvinte recebe a situação de agora
   * na hora, e cada mudança depois: um dos valores de CONEXAO.
   */
  function aoMudarAConexao(ouvinte) {
    ouvintesDaConexao.push(ouvinte);
    ouvinte(estado.conexao);
  }

  /**
   * Quem mostra a conferência andando (a linha “Confere sozinho…” do card
   * ONB-16): `true` quando a conferência sai e `false` quando a resposta volta,
   * logo antes de `aoMudarAConexao` ouvir a situação. É a mesma conferência de
   * 15 s do shell, sem relógio de rede de ninguém mais.
   */
  function aoConferirAConexao(ouvinte) {
    ouvintesDaConferencia.push(ouvinte);
  }

  /**
   * O Tentar de novo da F1: “Conectando ao Anki…” na hora e a conferência. O
   * passo 4 da Boas-vindas usa este mesmo.
   */
  function tentarAConexaoDeNovo() {
    mostrarConexao(CONEXAO.CONECTANDO);
    conferirConexao();
  }

  document.addEventListener('DOMContentLoaded', iniciarShell);

  raiz.Shell = {
    AREAS_DO_PAINEL,
    CONEXAO,
    ENDERECO_DA_CONEXAO,
    aoAbrirASecao,
    conferirConexao,
    aoMudarAConexao,
    aoConferirAConexao,
    aoEntrarNaArea,
    areaAtual,
    mascararChave,
    mostrarTotalDeFrases,
    tentarAConexaoDeNovo,
  };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
