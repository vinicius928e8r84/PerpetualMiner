'use strict';

// O popup “Cockpit” (docs/design/popup/, variante A). A base compartilhada é
// carregada antes pelo popup.html: o catálogo da Voz, os componentes da Veio,
// o detector de idioma, os atalhos gravados e o Contexto da frase.
const { IDIOMAS, textoDaVoz, Atalhos, minerarFraseManual, Configuracao } = PerpetualMiner;
const { iconeVeio, escreverFrase, montarTeclas, montarAnelDeProgresso } = PerpetualMiner.Veio;
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
let conexaoLigada = null;             // null até o /health da Conexão com o Anki responder
let configuracao = null;              // o retrato da configuração (lib/configuracao.js)
let minerando = false;

const porId = id => document.getElementById(id);

// ─── Início ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  escreverCopiaFixa();
  desenharUltimas();

  porId('abrir-painel').addEventListener('click', () => abrirPainel());
  porId('ver-todas').addEventListener('click', () => abrirPainel('#frases'));
  porId('lembrete').addEventListener('click', () => abrirPainel(configuracao.enderecoParaContinuar));
  Configuracao.acompanhar(retrato => {
    configuracao = retrato;
    desenharLembrete();
  });
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

  pedirEstadoDaAutomatica();

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
  porId('lembrete-corpo').textContent = textoDaVoz('ONB-14.corpo');
  porId('lembrete-continuar').textContent = textoDaVoz('ONB-14.continuar');
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

/** Pede o estado ao service worker, com o esqueleto (POP-01) enquanto ele não responde. */
function pedirEstadoDaAutomatica() {
  const azulejos = porId('azulejos');
  azulejos.setAttribute('aria-busy', 'true');
  azulejos.replaceChildren(...IDIOMAS_DA_MINERACAO.map(() => {
    const esqueleto = criar('div', 'veio-azulejo popup-azulejo--esqueleto');
    esqueleto.setAttribute('aria-hidden', 'true');
    esqueleto.append(...linhasDeEsqueleto());
    return esqueleto;
  }));

  chrome.runtime.sendMessage({ type: 'AUTO_MINER_GET_STATE' }, resposta => {
    const falha = causaDaFalha(resposta);
    // Um estado publicado enquanto isso (`pm_auto_miner_state_view`) é mais novo que esta resposta.
    if (mineracaoAutomatica) return;
    if (falha || !resposta.state) {
      mostrarFalhaDaAutomatica('POP-16.leitura');
      return;
    }
    mostrarMineracaoAutomatica(resposta.state);
  });
}

/**
 * POP-16 sob os azulejos (ou no lugar deles, se o estado nunca chegou): uma
 * linha que diz o que fazer, sem botão e sem Detalhes. Sai no próximo estado
 * que o service worker publicar.
 */
function mostrarFalhaDaAutomatica(id) {
  const azulejos = porId('azulejos');
  azulejos.removeAttribute('aria-busy');
  azulejos.querySelectorAll('.popup-azulejo--esqueleto, .popup-azulejos__falha').forEach(no => no.remove());
  const falha = linhaDeFalha(textoDaVoz(id));
  falha.classList.add('popup-azulejos__falha');
  falha.setAttribute('role', 'alert');
  azulejos.append(falha);
}

function mostrarMineracaoAutomatica(estado) {
  mineracaoAutomatica = estado;
  const azulejos = porId('azulejos');
  azulejos.removeAttribute('aria-busy');
  const foco = ondeEstaOFoco();

  trocarAzulejos(azulejos, IDIOMAS_DA_MINERACAO.map(({ chave, idioma }) => {
    const numeros = numerosDoIdioma(chave);
    // Redesenhar tiraria o foco (e o que está sendo digitado) do campo de limite:
    // esse azulejo muda no lugar, a não ser que o campo dê lugar a POP-08.
    if (foco.noCampo && foco.chave === chave && !numeros.atingiuOLimite) {
      const atual = azulejos.querySelector(`.popup-azulejo[data-idioma="${chave}"]`);
      preencherAzulejo(atual, numeros);
      return atual;
    }
    return montarAzulejo(chave, idioma, numeros);
  }));

  devolverOFoco(azulejos, foco);
  refletirNotaDaConexao();
}

/** O azulejo e o controle com o foco, para devolvê-lo depois de redesenhar. */
function ondeEstaOFoco() {
  const ativo = document.activeElement;
  return {
    chave: ativo?.closest?.('.popup-azulejo')?.dataset.idioma,
    noCampo: Boolean(ativo?.classList.contains('popup-azulejo__campo')),
  };
}

/** Deixa em `azulejos` só os `novos`, em ordem, sem tirar do DOM o que já está lá (perderia o foco). */
function trocarAzulejos(azulejos, novos) {
  for (const velho of [...azulejos.children]) if (!novos.includes(velho)) velho.remove();
  novos.forEach((azulejo, i) => {
    if (azulejos.children[i] !== azulejo) azulejos.insertBefore(azulejo, azulejos.children[i] || null);
  });
}

/** O foco que estava num azulejo redesenhado volta ao mesmo controle; sem o campo (agora POP-08), ao toggle. */
function devolverOFoco(azulejos, foco) {
  if (!foco.chave || azulejos.contains(document.activeElement)) return;
  const azulejo = azulejos.querySelector(`.popup-azulejo[data-idioma="${foco.chave}"]`);
  const alvo = (foco.noCampo && azulejo?.querySelector('.popup-azulejo__campo'))
    || azulejo?.querySelector('input[type="checkbox"]');
  alvo?.focus();
}

function numerosDoIdioma(chave) {
  const ajustes = mineracaoAutomatica.settings?.[chave] || {};
  // O service worker devolve o limite já normalizado (1–100, com o padrão dele).
  const limite = ajustes.dailyLimit;
  const n = mineracaoAutomatica.daily?.[chave]?.count || 0;
  const ligado = Boolean(ajustes.enabled);
  return { ligado, limite, n, atingiuOLimite: ligado && n >= limite };
}

function montarAzulejo(chave, idioma, numeros) {
  const idiomaNaFrase = idioma.toLowerCase();

  const azulejo = criar('div', 'veio-azulejo popup-azulejo');
  azulejo.dataset.idioma = chave;

  const topo = criar('div', 'popup-azulejo__topo');
  const codigo = criar('b', 'popup-azulejo__codigo', textoDaVoz(`POP-15.${chave}`));
  codigo.setAttribute('aria-hidden', 'true');
  const toggle = criar('label', 'veio-toggle');
  const caixa = criar('input');
  caixa.type = 'checkbox';
  caixa.setAttribute('role', 'switch');
  caixa.setAttribute('aria-label', textoDaVoz('POP-14.ligar', { idioma: idiomaNaFrase }));
  caixa.addEventListener('change', () => salvarMineracaoAutomatica({ [chave]: { enabled: caixa.checked } }));
  toggle.append(caixa, criar('span', 'veio-toggle__trilho'));
  topo.append(codigo, toggle);

  const medidor = criar('div', 'veio-medidor');
  medidor.setAttribute('aria-hidden', 'true');
  medidor.append(criar('i'));

  // POP-07: na tela, “7/20” como no protótipo; o leitor de tela ouve “7 de 20 hoje”.
  const contador = criar('p', 'popup-azulejo__contador');
  const visto = criar('span');
  visto.setAttribute('aria-hidden', 'true');
  visto.append(criar('b'), criar('small'));
  contador.append(visto, criar('span', 'veio-so-leitor'));

  azulejo.append(topo, contador, medidor);

  // No limite, o campo dá lugar a POP-08: a mineração do dia acabou. O toggle
  // o tem como descrição, para o leitor de tela dizê-lo quando o foco chega ali.
  const { limite } = numeros;
  if (numeros.atingiuOLimite) {
    const noLimite = criar('p', 'popup-azulejo__no-limite', textoDaVoz('POP-08'));
    noLimite.id = `no-limite-${chave}`;
    caixa.setAttribute('aria-describedby', noLimite.id);
    azulejo.append(noLimite);
  } else {
    azulejo.append(montarLimite(chave, idiomaNaFrase, limite));
  }

  preencherAzulejo(azulejo, numeros);
  return azulejo;
}

/** O que muda com o dia: ligado, o contador POP-07 e o medidor. O campo de limite fica como está. */
function preencherAzulejo(azulejo, { ligado, limite, n }) {
  azulejo.classList.toggle('veio-azulejo--escolhido', ligado);
  azulejo.querySelector('input[type="checkbox"]').checked = ligado;
  const contador = azulejo.querySelector('.popup-azulejo__contador');
  contador.querySelector('b').textContent = String(n);
  contador.querySelector('small').textContent = textoDaVoz('POP-07.limite', { limite });
  contador.querySelector('.veio-so-leitor').textContent = textoDaVoz('POP-07.leitor', { n, limite });
  azulejo.querySelector('.veio-medidor > i').style.width = `${Math.min(100, Math.round((n / limite) * 100))}%`;
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

  let pedido = null;
  const gravar = () => {
    const gravado = numerosDoIdioma(chave).limite;
    const valor = Math.round(Number(campo.value));
    // Um campo vazio volta ao que estava.
    if (!campo.value.trim() || Number.isNaN(valor)) {
      campo.value = String(gravado);
      return;
    }
    // Enter e o `change` que vem depois dele pedem a mesma gravação uma vez só.
    if (valor === gravado || valor === pedido) return;
    pedido = valor;
    salvarMineracaoAutomatica({ [chave]: { dailyLimit: valor } }, () => {
      pedido = null;
      // O service worker prende o limite entre 1 e 100: o campo mostra o que ficou gravado.
      if (campo.isConnected) campo.value = String(numerosDoIdioma(chave).limite);
    });
  };
  campo.addEventListener('change', gravar);
  // Sem as setinhas do navegador: ao chegar no campo, o número já vem
  // selecionado, e digitar troca o limite. As setas ↑ ↓ do teclado seguem valendo.
  campo.addEventListener('focus', () => campo.select());
  // Enter grava e o foco fica no campo, para o teclado seguir de onde estava.
  campo.addEventListener('keydown', evento => {
    if (evento.key !== 'Enter') return;
    evento.preventDefault();
    gravar();
  });

  const rotuloAntes = criar('span', '', textoDaVoz('POP-14.limite'));
  const rotuloDepois = criar('span', '', textoDaVoz('POP-14.dia'));
  rotuloAntes.setAttribute('aria-hidden', 'true');
  rotuloDepois.setAttribute('aria-hidden', 'true');
  linha.append(rotuloAntes, campo, rotuloDepois);
  return linha;
}

/** Grava só o que mudou num idioma; o service worker junta com o resto. */
function salvarMineracaoAutomatica(mudanca, depois) {
  chrome.runtime.sendMessage({ type: 'AUTO_MINER_SET_SETTINGS', settings: mudanca }, resposta => {
    const falha = causaDaFalha(resposta) || (resposta.state ? null : JSON.stringify(resposta));
    if (falha) {
      // Nada foi gravado: os azulejos voltam ao que está gravado, e POP-16 diz para tentar de novo.
      mostrarMineracaoAutomatica(mineracaoAutomatica);
      mostrarFalhaDaAutomatica('POP-16.gravacao');
    } else {
      mostrarMineracaoAutomatica(resposta.state);
    }
    if (depois) depois();
  });
}

async function conferirConexao() {
  try {
    conexaoLigada = (await fetch(`${ENDERECO_DA_CONEXAO}/health`)).ok;
  } catch {
    conexaoLigada = false;
  }
  refletirNotaDaConexao();
  Configuracao.mostrarConexao(conexaoLigada);
  desenharLembrete();
}

/**
 * A nota ONB-10 aparece enquanto a Conexão com o Anki não responde, a não ser
 * que a mineração automática já tenha minerado hoje: aí a Conexão funcionou
 * hoje, e a nota só assustaria.
 */
function refletirNotaDaConexao() {
  const mineradoHoje = Boolean(mineracaoAutomatica)
    && IDIOMAS_DA_MINERACAO.some(({ chave }) => numerosDoIdioma(chave).n > 0);
  porId('nota-conexao').hidden = conexaoLigada !== false || mineradoHoje;
}

// ─── Configuração pela metade ─────────────────────────────────────────────────

/**
 * O cartão ONB-14, enquanto a Boas-vindas não chegou a Tudo pronto e o lembrete
 * não foi ocultado (em Frases). Ele espera o /health da Conexão com o Anki,
 * que conta um dos passos: sem isso, o número pularia com o popup já aberto.
 * O cartão é o botão, e só o conteúdo dele é refeito: o foco fica nele.
 */
function desenharLembrete() {
  const cartao = porId('lembrete');
  const aparece = Boolean(configuracao?.lembrete) && conexaoLigada !== null;
  cartao.hidden = !aparece;
  if (!aparece) return;
  const { resolvidos: n, total } = configuracao;
  porId('lembrete-anel').replaceChildren(montarAnelDeProgresso(n, total));
  porId('lembrete-titulo').textContent = textoDaVoz('ONB-14.titulo', { n, total });
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

  minerarFraseManual(texto).then(frase => {
    minerando = false;
    // POP-05: sem texto. O campo limpa e a frase aparece no topo das últimas.
    campo.value = '';
    limparErro();
    refletirCampo();
    if (frase && frases) {
      frases = [frase, ...frases.filter(f => f.id !== frase.id)];
      desenharUltimas();
    }
  }, () => {
    minerando = false;
    // POP-06: o texto fica no campo, para tentar de novo.
    mostrarErro();
    refletirCampo();
  });
}

function mostrarErro() {
  porId('erro-rapida').replaceChildren(linhaDeFalha(textoDaVoz('POP-06')));
  porId('frase-rapida').setAttribute('aria-invalid', 'true');
}

/** Uma falha em linha, como no protótipo: o ícone de alerta e a frase que diz o que fazer. */
function linhaDeFalha(texto) {
  const linha = criar('p', 'popup-falha');
  linha.append(iconeVeio('alerta'), texto);
  return linha;
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
      linha.append(...linhasDeEsqueleto());
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

/**
 * POP-02: a picareta, o título e o texto que ensina o atalho gravado; sem
 * atalho, o texto pede um, com Definir atalho (GLB-02).
 */
function montarVazio() {
  const vazio = criar('div', 'veio-vazio popup-vazio');
  const texto = criar('p', 'veio-vazio__texto');
  vazio.append(iconeVeio('picareta'), criar('p', 'veio-vazio__titulo', textoDaVoz('POP-02.titulo')), texto);
  if (atalhoDeLegenda) {
    texto.append(...copiaComATecla('POP-02.atalho'));
  } else {
    texto.textContent = textoDaVoz('POP-02.semAtalho');
    vazio.append(botaoDosAtalhos(textoDaVoz('GLB-02.definir'), 'veio-botao--contorno'));
  }
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
  const frase = criar('span', 'popup-rodape__texto');
  frase.append(...copiaComATecla('POP-11.atalho'));
  rodape.replaceChildren(frase, botaoDosAtalhos(textoDaVoz('POP-11.mudar')));
}

/** A cópia `id` com o atalho de legenda no lugar de `{atalho}`, como tecla. */
function copiaComATecla(id) {
  const [antes, depois] = textoDaVoz(id, { atalho: MARCA_DO_ATALHO }).split(MARCA_DO_ATALHO);
  return [antes, teclaDaLegenda(), depois];
}

/** O atalho de legenda com uma tecla por kbd (Alt + S), ou o kbd tracejado “Sem atalho”. */
function teclaDaLegenda() {
  return montarTeclas(Atalhos.rotuloDoAtalho(atalhoDeLegenda), { seVazia: textoDaVoz('GLB-02.semAtalho') });
}

function botaoDosAtalhos(rotulo, variante = 'veio-botao--fantasma') {
  const botao = criar('button', `veio-botao ${variante} veio-botao--compacto popup-atalhos`, rotulo);
  botao.type = 'button';
  botao.addEventListener('click', () => abrirPainel(ENDERECO_DOS_ATALHOS));
  return botao;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

/** A causa técnica de uma resposta do service worker que falhou; null se deu certo. */
function causaDaFalha(resposta) {
  if (chrome.runtime.lastError) return chrome.runtime.lastError.message;
  if (resposta?.ok) return null;
  // Sem resposta nenhuma, `JSON.stringify(undefined)` seria `undefined` e passaria por sucesso.
  return resposta?.error || JSON.stringify(resposta ?? null);
}

/** O esqueleto sem texto (POP-01): uma linha inteira e uma curta. */
function linhasDeEsqueleto() {
  return [criar('div', 'veio-esqueleto'), criar('div', 'veio-esqueleto popup-esqueleto-curto')];
}

function criar(tag, classe, texto) {
  const no = document.createElement(tag);
  if (classe) no.className = classe;
  if (texto != null) no.textContent = texto;
  return no;
}
