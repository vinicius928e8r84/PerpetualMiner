'use strict';

const { IDIOMAS, textoDaVoz, Atalhos, minerarFraseManual, Configuracao, ConexaoAnki, AbrirOAnki, MineracaoAutomatica, MineracaoDoDia, AjustesDeEnvio, VocabularioDaMineracao } = PerpetualMiner;
const { iconeVeio, escreverFrase, montarTeclas, montarAnelDeProgresso, criar } = PerpetualMiner.Veio;
const { fonteDaFrase, nomeDaFonte, rotuloDoDia, diaEHora } = PerpetualMiner.Contexto;

const QUANTAS_ULTIMAS = 5;
const ENDERECO_DOS_ATALHOS = '#configuracoes/atalhos';

const IDIOMAS_DA_MINERACAO = [
  { chave: 'en', idioma: IDIOMAS.INGLES },
  { chave: 'ru', idioma: IDIOMAS.RUSSO },
];

const MARCA_DO_ATALHO = '\u0000';

let frases = null;
let idsJaMostrados = null;
const idsChegando = new Set();
let atalhoDeLegenda = Atalhos.ATALHOS_PADRAO.legenda;
let mineracaoAutomatica = null;
let leiturasDoVocabulario = null;
let configuracao = null;
let minerando = false;

const porId = id => document.getElementById(id);

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
    if (mudancas[MineracaoDoDia.CHAVES.estadoPublicado]?.newValue) {
      mostrarMineracaoAutomatica(mudancas[MineracaoDoDia.CHAVES.estadoPublicado].newValue);
    }
    const mudouOVocabulario = Object.values(VocabularioDaMineracao.CHAVES).some(chave => chave in mudancas);
    if (mudouOVocabulario || AjustesDeEnvio.CHAVE in mudancas) lerAIdadeDoVocabulario();
  });

  ConexaoAnki.acompanhar(refletirOVocabularioDoAnkiFechado);
  ConexaoAnki.iniciar();
  lerAIdadeDoVocabulario();
});

function escreverCopiaFixa() {
  const abrir = porId('abrir-painel');
  abrir.append(iconeVeio('frases'), textoDaVoz('POP-09'));
  porId('titulo-automatica-texto').textContent = textoDaVoz('POP-10');
  porId('automatica-por-dia').textContent = textoDaVoz('POP-14.porDia');
  porId('lembrete-corpo').textContent = textoDaVoz('ONB-14.corpo');
  porId('lembrete-continuar').textContent = textoDaVoz('ONB-14.continuar');
  porId('titulo-ultimas-texto').textContent = textoDaVoz('POP-13.titulo');
  porId('ver-todas').textContent = textoDaVoz('POP-13.verTodas');

  const campo = porId('frase-rapida');
  campo.placeholder = textoDaVoz('POP-03');
  campo.setAttribute('aria-label', textoDaVoz('POP-03'));
  porId('minerar-rapida').textContent = textoDaVoz('POP-04');
}

function abrirPainel(endereco = '') {
  const painel = chrome.runtime.getURL('painel/painel.html');
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

function pedirEstadoDaAutomatica() {
  const azulejos = porId('azulejos');
  azulejos.setAttribute('aria-busy', 'true');
  azulejos.replaceChildren(...IDIOMAS_DA_MINERACAO.map(() => {
    const esqueleto = criar('div', 'veio-azulejo popup-azulejo--esqueleto');
    esqueleto.setAttribute('aria-hidden', 'true');
    esqueleto.append(...linhasDeEsqueleto());
    return esqueleto;
  }));

  MineracaoAutomatica.lerEstado().then(
    estado => { if (!mineracaoAutomatica) mostrarMineracaoAutomatica(estado); },
    () => { if (!mineracaoAutomatica) mostrarFalhaDaAutomatica('POP-16.leitura'); });
}

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
    if (limiteEmEdicao(foco, chave, numeros)) {
      const atual = azulejos.querySelector(`.popup-azulejo[data-idioma="${chave}"]`);
      preencherAzulejo(atual, numeros);
      return atual;
    }
    return montarAzulejo(chave, idioma, numeros);
  }));

  devolverOFoco(azulejos, foco);
  refletirOVocabularioDoAnkiFechado();
}

function limiteEmEdicao(foco, chave, { atingiuOLimite }) {
  return foco.noCampo && foco.chave === chave && !atingiuOLimite;
}

function ondeEstaOFoco() {
  const ativo = document.activeElement;
  return {
    chave: ativo?.closest?.('.popup-azulejo')?.dataset.idioma,
    noCampo: Boolean(ativo?.classList.contains('popup-azulejo__campo')),
  };
}

function trocarAzulejos(azulejos, novos) {
  for (const velho of [...azulejos.children]) if (!novos.includes(velho)) velho.remove();
  novos.forEach((azulejo, i) => {
    if (azulejos.children[i] !== azulejo) azulejos.insertBefore(azulejo, azulejos.children[i] || null);
  });
}

function devolverOFoco(azulejos, foco) {
  if (!foco.chave || azulejos.contains(document.activeElement)) return;
  const azulejo = azulejos.querySelector(`.popup-azulejo[data-idioma="${foco.chave}"]`);
  const alvo = (foco.noCampo && azulejo?.querySelector('.popup-azulejo__campo'))
    || azulejo?.querySelector('input[type="checkbox"]');
  alvo?.focus();
}

function contagemPublicada(registro) {
  return registro?.count || 0;
}

function numerosDoIdioma(chave) {
  const ajustes = mineracaoAutomatica.settings?.[chave] || {};
  const limite = ajustes.dailyLimit;
  const n = contagemPublicada(mineracaoAutomatica.daily?.[chave]);
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

  const contador = criar('p', 'popup-azulejo__contador');
  const visto = criar('span');
  visto.setAttribute('aria-hidden', 'true');
  visto.append(criar('b'), criar('small'));
  contador.append(visto, criar('span', 'veio-so-leitor'));

  const espera = criar('p', 'popup-azulejo__espera');
  espera.hidden = true;
  espera.append(criar('b', null, textoDaVoz('BRG-37.esperando')), criar('span', null, textoDaVoz('BRG-37.comeca')));

  azulejo.append(topo, contador, medidor, espera);

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
  const campo = criar('input', 'popup-azulejo__campo');
  MineracaoAutomatica.ligarCampoDoLimite(campo, {
    limiteGravado: () => numerosDoIdioma(chave).limite,
    gravar: valor => salvarMineracaoAutomatica({ [chave]: { dailyLimit: valor } }),
  });
  campo.value = String(limite);
  campo.setAttribute('aria-label', textoDaVoz('POP-14.limiteDoIdioma', { idioma: idiomaNaFrase }));

  const rotuloAntes = criar('span', '', textoDaVoz('POP-14.limite'));
  const rotuloDepois = criar('span', '', textoDaVoz('POP-14.dia'));
  rotuloAntes.setAttribute('aria-hidden', 'true');
  rotuloDepois.setAttribute('aria-hidden', 'true');
  linha.append(rotuloAntes, campo, rotuloDepois);
  return linha;
}

function salvarMineracaoAutomatica(mudanca) {
  return MineracaoAutomatica.salvarAjustes(mudanca).then(mostrarMineracaoAutomatica, () => {
    mostrarMineracaoAutomatica(mineracaoAutomatica);
    mostrarFalhaDaAutomatica('POP-16.gravacao');
  });
}

function lerAIdadeDoVocabulario() {
  VocabularioDaMineracao.lerLeituras().then(leituras => {
    leiturasDoVocabulario = leituras;
    refletirOVocabularioDoAnkiFechado();
  }, () => {});
}

function refletirOVocabularioDoAnkiFechado() {
  const selo = porId('selo-vocabulario');
  AbrirOAnki.montarSeJaConectou(selo, 'veio-botao veio-botao--link');
  const { lidos, esperando } = vocabularioComOAnkiFechado(leiturasDoVocabulario, idiomasLigados());
  mostrarOSeloDoVocabulario(selo, lidos);
  for (const { chave } of IDIOMAS_DA_MINERACAO) mostrarAEsperaDoAnki(chave, esperando.includes(chave));
}

function idiomasLigados() {
  return IDIOMAS_DA_MINERACAO.map(({ chave }) => chave).filter(chave => mineracaoAutomatica?.settings?.[chave]?.enabled);
}

function vocabularioComOAnkiFechado(leituras, ligados) {
  if (!leituras || ConexaoAnki.situacao() !== ConexaoAnki.SITUACAO.DESLIGADA) return { lidos: [], esperando: [] };
  return {
    lidos: ligados.map(chave => leituras[chave]).filter(Boolean),
    esperando: ligados.filter(chave => !leituras[chave]),
  };
}

function mostrarOSeloDoVocabulario(selo, lidos) {
  selo.hidden = lidos.length === 0;
  if (selo.hidden) return;
  const quando = diaEHora(Math.min(...lidos.map(leitura => leitura.createdAt)));
  porId('selo-vocabulario-texto').textContent = textoDaVoz('POP-17.selo', { quando });
}

function mostrarAEsperaDoAnki(chave, esperando) {
  const espera = document.querySelector(`.popup-azulejo[data-idioma="${chave}"] .popup-azulejo__espera`);
  AbrirOAnki.montarSeJaConectou(espera);
  if (espera) espera.hidden = !esperando;
}

function desenharLembrete() {
  const cartao = porId('lembrete');
  cartao.hidden = !configuracao.lembrete;
  if (!configuracao.lembrete) return;
  const { resolvidos: n, total } = configuracao;
  porId('lembrete-anel').replaceChildren(montarAnelDeProgresso(n, total));
  porId('lembrete-titulo').textContent = textoDaVoz('ONB-14.titulo', { n, total });
}

function prepararMineracaoRapida() {
  const formulario = porId('mineracao-rapida');
  const campo = porId('frase-rapida');

  campo.addEventListener('input', () => {
    refletirCampo();
    limparErro();
  });
  campo.addEventListener('keydown', evento => {
    if (!enterQueMinera(evento)) return;
    evento.preventDefault();
    formulario.requestSubmit();
  });
  formulario.addEventListener('submit', evento => {
    evento.preventDefault();
    minerarFraseRapida();
  });
}

function enterQueMinera({ key, shiftKey, isComposing }) {
  return key === 'Enter' && !shiftKey && !isComposing;
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
    campo.value = '';
    limparErro();
    refletirCampo();
    if (frase && frases) {
      frases = [frase, ...frases.filter(f => f.id !== frase.id)];
      desenharUltimas();
    }
  }, () => {
    minerando = false;
    mostrarErro();
    refletirCampo();
  });
}

function mostrarErro() {
  porId('erro-rapida').replaceChildren(linhaDeFalha(textoDaVoz('POP-06')));
  porId('frase-rapida').setAttribute('aria-invalid', 'true');
}

function linhaDeFalha(texto) {
  const linha = criar('p', 'popup-falha');
  linha.append(iconeVeio('alerta'), texto);
  return linha;
}

function limparErro() {
  porId('erro-rapida').replaceChildren();
  porId('frase-rapida').removeAttribute('aria-invalid');
}

function desenharUltimas() {
  const lugar = porId('ultimas');

  if (!frases) {
    lugar.replaceChildren(montarEsqueletoDasUltimas());
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
    marcarSeEstaChegando(linha, f);
    lista.append(linha);
  }
  lugar.replaceChildren(lista);
  idsJaMostrados = new Set([...(idsJaMostrados || []), ...ultimas.map(f => f.id)]);
}

function montarEsqueletoDasUltimas() {
  const lista = criar('ol', 'popup-ultimas');
  lista.setAttribute('aria-busy', 'true');
  for (let i = 0; i < QUANTAS_ULTIMAS; i++) {
    const linha = criar('li', 'popup-ultima popup-ultima--esqueleto');
    linha.setAttribute('aria-hidden', 'true');
    linha.append(...linhasDeEsqueleto());
    lista.append(linha);
  }
  return lista;
}

function marcarSeEstaChegando(linha, f) {
  if (idsJaMostrados && !idsJaMostrados.has(f.id)) idsChegando.add(f.id);
  if (!idsChegando.has(f.id)) return;
  linha.classList.add('popup-ultima--nova');
  linha.addEventListener('animationend', () => idsChegando.delete(f.id), { once: true });
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

function palavraDaFrase(f) {
  const grupo = [];
  for (const item of f.keywords || []) {
    if (item === '|') break;
    grupo.push(String(item).replace(/@\d+$/, ''));
  }
  return grupo.join(' ');
}

function linhaDoContexto(f) {
  const fonte = fonteDaFrase(f);
  return [fonte && nomeDaFonte(fonte), f.contexto?.titulo, f.contexto?.detalhe, rotuloDoDia(f.data)]
    .filter(Boolean)
    .join(' · ');
}

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

function copiaComATecla(id) {
  const [antes, depois] = textoDaVoz(id, { atalho: MARCA_DO_ATALHO }).split(MARCA_DO_ATALHO);
  return [antes, teclaDaLegenda(), depois];
}

function teclaDaLegenda() {
  return montarTeclas(Atalhos.rotuloDoAtalho(atalhoDeLegenda), { seVazia: textoDaVoz('GLB-02.semAtalho') });
}

function botaoDosAtalhos(rotulo, variante = 'veio-botao--fantasma') {
  const botao = criar('button', `veio-botao ${variante} veio-botao--compacto popup-atalhos`, rotulo);
  botao.type = 'button';
  botao.addEventListener('click', () => abrirPainel(ENDERECO_DOS_ATALHOS));
  return botao;
}

function linhasDeEsqueleto() {
  return [criar('div', 'veio-esqueleto'), criar('div', 'veio-esqueleto popup-esqueleto-curto')];
}

