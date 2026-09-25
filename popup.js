'use strict';

// O popup “Cockpit” (docs/design/popup/, variante A). A base compartilhada é
// carregada antes pelo popup.html: o catálogo da Voz, os componentes da Veio,
// o detector de idioma, os atalhos gravados e o Contexto da frase.
const { detectarIdioma, IDIOMAS, textoDaVoz, Atalhos } = PerpetualMiner;
const { iconeVeio, escreverFrase, montarTecla, montarDetalhes } = PerpetualMiner.Veio;
const { fonteDaFrase, nomeDaFonte, rotuloDoDia } = PerpetualMiner.Contexto;

const QUANTAS_ULTIMAS = 5;
const ENDERECO_DA_CONEXAO = 'http://127.0.0.1:8766';
const ENDERECO_DOS_ATALHOS = '#configuracoes/atalhos';

// Os dois idiomas da Mineração automática, na ordem dos azulejos.
const IDIOMAS_DA_MINERACAO = [
  { chave: 'en', idioma: IDIOMAS.INGLES },
  { chave: 'ru', idioma: IDIOMAS.RUSSO },
];

// O atalho entra no meio da cópia como tecla (kbd), não como texto solto.
const MARCA_DO_ATALHO = '\u0000';

// ─── Estado ───────────────────────────────────────────────────────────────────

let frases = null;                    // null enquanto a primeira leitura não volta (POP-01)
let idsJaMostrados = null;            // o que a lista já mostrou, para realçar a frase que chega
const idsChegando = new Set();        // as que ainda estão no realce: um redesenho não o apaga
let atalhoDeLegenda = Atalhos.ATALHOS_PADRAO.legenda;
let mineracaoAutomatica = null;       // { settings, daily } do service worker
let minerando = false;

const porId = id => document.getElementById(id);

// ─── Início ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  escreverCopiaFixa();
  desenharUltimas();

  porId('abrir-painel').addEventListener('click', () => abrirPainel());
  porId('ver-todas').addEventListener('click', () => abrirPainel('#frases'));
  prepararMineracaoRapida();

  chrome.storage.local.get({ frases: [] }, data => {
    frases = data.frases || [];
    desenharUltimas();
  });

  Atalhos.acompanharAtalhos(({ legenda }) => {
    atalhoDeLegenda = legenda;
    desenharRodape();
    if (frases) desenharUltimas();
  });

  chrome.runtime.sendMessage({ type: 'AUTO_MINER_GET_STATE' }, resposta => {
    if (chrome.runtime.lastError || !resposta?.state) return;
    mostrarMineracaoAutomatica(resposta.state);
  });

  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area !== 'local') return;
    if (mudancas.frases) {
      frases = mudancas.frases.newValue || [];
      desenharUltimas();
    }
    if (mudancas.pm_auto_miner_state_view?.newValue) {
      mostrarMineracaoAutomatica(mudancas.pm_auto_miner_state_view.newValue);
    }
  });

  conferirConexao();
});

function escreverCopiaFixa() {
  const abrir = porId('abrir-painel');
  abrir.append(iconeVeio('frases'), textoDaVoz('POP-09'));
  porId('titulo-automatica-texto').textContent = textoDaVoz('POP-10');
  porId('automatica-por-dia').textContent = textoDaVoz('POP-14.porDia');
  porId('nota-conexao').textContent = textoDaVoz('ONB-10');
  porId('titulo-ultimas-texto').textContent = textoDaVoz('POP-13.titulo');
  porId('ver-todas').textContent = textoDaVoz('POP-13.verTodas');

  const campo = porId('frase-rapida');
  campo.placeholder = textoDaVoz('POP-03');
  campo.setAttribute('aria-label', textoDaVoz('POP-03'));
  porId('minerar-rapida').textContent = textoDaVoz('POP-04');
}

// ─── Painel ───────────────────────────────────────────────────────────────────

/**
 * Foca a aba do Painel que já está aberta, ou abre uma. Com `endereco`, a aba
 * vai para aquele endereço (#frases, #configuracoes/atalhos); sem ele, fica
 * onde a pessoa a deixou.
 */
function abrirPainel(endereco = '') {
  const painel = chrome.runtime.getURL('painel.html');
  chrome.tabs.query({ url: painel }, abas => {
    const aba = abas?.[0];
    if (!aba) {
      chrome.tabs.create({ url: painel + endereco });
      return;
    }
    chrome.tabs.update(aba.id, { active: true, ...(endereco && { url: painel + endereco }) });
    chrome.windows.update(aba.windowId, { focused: true });
  });
}

// ─── Mineração automática ─────────────────────────────────────────────────────

function mostrarMineracaoAutomatica(estado) {
  mineracaoAutomatica = estado;
  const azulejos = porId('azulejos');
  // Redesenhar tiraria o foco (e o que está sendo digitado) do campo de limite.
  const foco = document.activeElement?.closest?.('.popup-azulejo')?.dataset.idioma;
  const focoNoLimite = document.activeElement?.classList.contains('popup-azulejo__campo');
  if (focoNoLimite) {
    atualizarAzulejosSemOCampo();
    return;
  }
  azulejos.replaceChildren(...IDIOMAS_DA_MINERACAO.map(montarAzulejo));
  if (foco) azulejos.querySelector(`[data-idioma="${foco}"] input[type="checkbox"]`)?.focus();
}

function numerosDoIdioma(chave) {
  const ajustes = mineracaoAutomatica.settings?.[chave] || {};
  // O service worker devolve o limite já normalizado (1–100, com o padrão dele).
  const limite = ajustes.dailyLimit;
  const n = mineracaoAutomatica.daily?.[chave]?.count || 0;
  return { ligado: Boolean(ajustes.enabled), limite, n, noLimite: n >= limite };
}

function montarAzulejo({ chave, idioma }) {
  const { ligado, limite, n, noLimite } = numerosDoIdioma(chave);
  const idiomaNaFrase = idioma.toLowerCase();

  const azulejo = criar('div', 'veio-azulejo popup-azulejo');
  azulejo.dataset.idioma = chave;
  azulejo.classList.toggle('veio-azulejo--escolhido', ligado);

  const topo = criar('div', 'popup-azulejo__topo');
  const codigo = criar('b', 'popup-azulejo__codigo', textoDaVoz(`POP-15.${chave}`));
  codigo.setAttribute('aria-hidden', 'true');
  const toggle = criar('label', 'veio-toggle');
  const caixa = criar('input');
  caixa.type = 'checkbox';
  caixa.setAttribute('role', 'switch');
  caixa.checked = ligado;
  caixa.setAttribute('aria-label', textoDaVoz('POP-14.ligar', { idioma: idiomaNaFrase }));
  caixa.addEventListener('change', () => salvarMineracaoAutomatica({ [chave]: { enabled: caixa.checked } }));
  toggle.append(caixa, criar('span', 'veio-toggle__trilho'));
  topo.append(codigo, toggle);

  const contador = criar('p', 'popup-azulejo__contador', textoDaVoz('POP-07', { n, limite }));
  const medidor = criar('div', 'veio-medidor');
  medidor.setAttribute('aria-hidden', 'true');
  const preenchido = criar('i');
  preenchido.style.width = larguraDoMedidor(n, limite);
  medidor.append(preenchido);

  azulejo.append(topo, contador, medidor);

  // No limite, o campo dá lugar a POP-08: a mineração do dia acabou.
  if (ligado && noLimite) {
    azulejo.append(criar('p', 'popup-azulejo__no-limite', textoDaVoz('POP-08', { n, limite })));
  } else {
    azulejo.append(montarLimite(chave, idiomaNaFrase, limite));
  }
  return azulejo;
}

function montarLimite(chave, idiomaNaFrase, limite) {
  const linha = criar('div', 'popup-azulejo__limite');
  const campo = criar('input', 'veio-campo popup-azulejo__campo');
  campo.type = 'number';
  campo.min = '1';
  campo.max = '100';
  campo.step = '1';
  campo.inputMode = 'numeric';
  campo.value = String(limite);
  campo.setAttribute('aria-label', textoDaVoz('POP-14.limiteDoIdioma', { idioma: idiomaNaFrase }));
  campo.addEventListener('change', () => {
    const valor = Number(campo.value);
    // O service worker prende o limite entre 1 e 100; um campo vazio volta ao que estava.
    if (!campo.value.trim() || Number.isNaN(valor)) {
      campo.value = String(limite);
      return;
    }
    salvarMineracaoAutomatica({ [chave]: { dailyLimit: Math.round(valor) } }, () => campo.blur());
  });
  campo.addEventListener('keydown', evento => {
    // Sair do campo dispara o `change` uma vez só, como ao clicar fora.
    if (evento.key === 'Enter') campo.blur();
  });
  const rotuloAntes = criar('span', '', textoDaVoz('POP-14.limite'));
  const rotuloDepois = criar('span', '', textoDaVoz('POP-14.dia'));
  rotuloAntes.setAttribute('aria-hidden', 'true');
  rotuloDepois.setAttribute('aria-hidden', 'true');
  linha.append(rotuloAntes, campo, rotuloDepois);
  return linha;
}

function larguraDoMedidor(n, limite) {
  return `${Math.min(100, Math.round((n / limite) * 100))}%`;
}

/** Enquanto a pessoa digita um limite, só o contador e o medidor mudam. */
function atualizarAzulejosSemOCampo() {
  for (const { chave } of IDIOMAS_DA_MINERACAO) {
    const azulejo = porId('azulejos').querySelector(`[data-idioma="${chave}"]`);
    if (!azulejo) continue;
    const { ligado, limite, n } = numerosDoIdioma(chave);
    azulejo.classList.toggle('veio-azulejo--escolhido', ligado);
    azulejo.querySelector('input[type="checkbox"]').checked = ligado;
    azulejo.querySelector('.popup-azulejo__contador').textContent = textoDaVoz('POP-07', { n, limite });
    azulejo.querySelector('.veio-medidor > i').style.width = larguraDoMedidor(n, limite);
  }
}

/** Grava só o que mudou num idioma; o service worker junta com o resto. */
function salvarMineracaoAutomatica(mudanca, depois) {
  chrome.runtime.sendMessage({ type: 'AUTO_MINER_SET_SETTINGS', settings: mudanca }, resposta => {
    if (depois) depois();
    if (chrome.runtime.lastError || !resposta?.state) return;
    mostrarMineracaoAutomatica(resposta.state);
  });
}

/** A nota ONB-10 aparece enquanto a Conexão com o Anki não responde. */
async function conferirConexao() {
  let ligada = false;
  try {
    ligada = (await fetch(`${ENDERECO_DA_CONEXAO}/health`)).ok;
  } catch {
    ligada = false;
  }
  porId('nota-conexao').hidden = ligada;
}

// ─── Mineração rápida ─────────────────────────────────────────────────────────

function prepararMineracaoRapida() {
  const formulario = porId('mineracao-rapida');
  const campo = porId('frase-rapida');

  campo.addEventListener('input', () => {
    refletirCampo();
    limparErro();
  });
  // Enter minera; Shift+Enter quebra a linha.
  campo.addEventListener('keydown', evento => {
    if (evento.key !== 'Enter' || evento.shiftKey || evento.isComposing) return;
    evento.preventDefault();
    formulario.requestSubmit();
  });
  formulario.addEventListener('submit', evento => {
    evento.preventDefault();
    minerarFraseRapida();
  });
}

function refletirCampo() {
  porId('minerar-rapida').disabled = minerando || !porId('frase-rapida').value.trim();
}

function minerarFraseRapida() {
  const campo = porId('frase-rapida');
  const texto = campo.value.trim();
  if (!texto || minerando) return;
  minerando = true;
  refletirCampo();

  chrome.runtime.sendMessage({
    type: 'SALVAR_HISTORICO',
    texto,
    origem: 'manual',
    idioma: detectarIdioma(texto),
    contexto: { fonte: 'manual', titulo: '', detalhe: '' },
  }, resposta => {
    minerando = false;
    // A causa técnica vai para o Detalhes: a mensagem do Chrome ou a resposta crua.
    const falha = chrome.runtime.lastError?.message || (resposta?.ok ? null : resposta?.error || JSON.stringify(resposta));
    if (falha) {
      // POP-06: o texto fica no campo, para tentar de novo.
      mostrarErro(falha);
      refletirCampo();
      return;
    }
    // POP-05: sem texto. O campo limpa e a frase aparece no topo das últimas.
    campo.value = '';
    limparErro();
    refletirCampo();
    if (resposta.frase && frases) {
      frases = [resposta.frase, ...frases.filter(f => f.id !== resposta.frase.id)];
      desenharUltimas();
    }
  });
}

function mostrarErro(causa) {
  const erro = porId('erro-rapida');
  const linha = criar('p', 'veio-campo-erro', textoDaVoz('POP-06'));
  erro.replaceChildren(linha, montarDetalhes(String(causa)));
  porId('frase-rapida').setAttribute('aria-invalid', 'true');
}

function limparErro() {
  porId('erro-rapida').replaceChildren();
  porId('frase-rapida').removeAttribute('aria-invalid');
}

// ─── Últimas mineradas ────────────────────────────────────────────────────────

function desenharUltimas() {
  const lugar = porId('ultimas');

  if (!frases) {
    // POP-01: espera curta, sem texto, só esqueleto.
    const lista = criar('ol', 'popup-ultimas');
    lista.setAttribute('aria-busy', 'true');
    for (let i = 0; i < QUANTAS_ULTIMAS; i++) {
      const linha = criar('li', 'popup-ultima popup-ultima--esqueleto');
      linha.setAttribute('aria-hidden', 'true');
      linha.append(criar('div', 'veio-esqueleto'), criar('div', 'veio-esqueleto popup-ultima__esqueleto-curto'));
      lista.append(linha);
    }
    lugar.replaceChildren(lista);
    porId('ver-todas').hidden = true;
    return;
  }

  const ultimas = frases.slice(0, QUANTAS_ULTIMAS);
  porId('ver-todas').hidden = ultimas.length === 0;

  if (ultimas.length === 0) {
    lugar.replaceChildren(montarVazio());
    idsJaMostrados = new Set();
    return;
  }

  const lista = criar('ol', 'popup-ultimas');
  for (const f of ultimas) {
    const linha = montarUltima(f);
    // A frase que acabou de chegar (mineração rápida, legenda, automática)
    // pisca uma vez; na primeira leitura, nada pisca.
    if (idsJaMostrados && !idsJaMostrados.has(f.id)) idsChegando.add(f.id);
    if (idsChegando.has(f.id)) {
      linha.classList.add('popup-ultima--nova');
      linha.addEventListener('animationend', () => idsChegando.delete(f.id), { once: true });
    }
    lista.append(linha);
  }
  lugar.replaceChildren(lista);
  idsJaMostrados = new Set([...(idsJaMostrados || []), ...ultimas.map(f => f.id)]);
}

function montarUltima(f) {
  const linha = criar('li', 'popup-ultima');
  const texto = criar('p', 'popup-ultima__texto');
  texto.lang = f.idioma === IDIOMAS.RUSSO ? 'ru' : 'en';
  escreverFrase(texto, String(f.texto || ''), palavraDaFrase(f));
  texto.title = String(f.texto || '');

  const contexto = criar('p', 'popup-ultima__contexto', linhaDoContexto(f));
  linha.append(texto, contexto);
  return linha;
}

/** A Palavra grifada: o primeiro grupo de `keywords` (`palavra@índice`, `|` entre grupos). */
function palavraDaFrase(f) {
  const grupo = [];
  for (const item of f.keywords || []) {
    if (item === '|') break;
    grupo.push(String(item).replace(/@\d+$/, ''));
  }
  return grupo.join(' ');
}

/** O Contexto numa linha: Fonte · Título · Detalhe · dia. */
function linhaDoContexto(f) {
  const fonte = fonteDaFrase(f);
  return [fonte && nomeDaFonte(fonte), f.contexto?.titulo, f.contexto?.detalhe, rotuloDoDia(f.data)]
    .filter(Boolean)
    .join(' · ');
}

/** POP-02: o vazio ensina o atalho gravado; sem atalho, “Sem atalho” e Definir atalho (GLB-02). */
function montarVazio() {
  const vazio = criar('div', 'veio-vazio popup-vazio');
  const texto = criar('p', 'veio-vazio__texto');
  const [antes, depois] = textoDaVoz('POP-02', { atalho: MARCA_DO_ATALHO }).split(MARCA_DO_ATALHO);
  texto.append(antes, teclaDaLegenda(), depois);
  vazio.append(texto);
  if (!atalhoDeLegenda) vazio.append(botaoDosAtalhos(textoDaVoz('GLB-02.definir'), 'veio-botao--contorno'));
  return vazio;
}

// ─── Rodapé ───────────────────────────────────────────────────────────────────

/** POP-11: o atalho de legenda gravado e Mudar atalho; sem atalho, “Sem atalho” e Definir atalho. */
function desenharRodape() {
  const rodape = porId('rodape');
  if (!atalhoDeLegenda) {
    rodape.replaceChildren(teclaDaLegenda(), botaoDosAtalhos(textoDaVoz('GLB-02.definir')));
    return;
  }
  const [antes, depois] = textoDaVoz('POP-11.atalho', { atalho: MARCA_DO_ATALHO }).split(MARCA_DO_ATALHO);
  const frase = criar('span', 'popup-rodape__texto');
  frase.append(antes, teclaDaLegenda(), depois);
  rodape.replaceChildren(frase, botaoDosAtalhos(textoDaVoz('POP-11.mudar')));
}

function teclaDaLegenda() {
  return montarTecla(Atalhos.rotuloDoAtalho(atalhoDeLegenda), { seVazia: textoDaVoz('GLB-02.semAtalho') });
}

function botaoDosAtalhos(rotulo, variante = 'veio-botao--fantasma') {
  const botao = criar('button', `veio-botao ${variante} veio-botao--compacto popup-atalhos`, rotulo);
  botao.type = 'button';
  botao.addEventListener('click', () => abrirPainel(ENDERECO_DOS_ATALHOS));
  return botao;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function criar(tag, classe, texto) {
  const no = document.createElement(tag);
  if (classe) no.className = classe;
  if (texto != null) no.textContent = texto;
  return no;
}
