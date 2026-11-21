'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { DocumentoFalso } = require('./dom-falso');

const RAIZ = path.join(__dirname, '..');
const ARQUIVOS_DE_VERDADE = ['lib/voz/catalogo.js', 'lib/voz/texto.js', 'veio/componentes.js', 'lib/idioma.js', 'lib/contexto.js'];
const ESTADO_PUBLICADO = 'pm_auto_miner_state_view';
const CHAVES_DO_VOCABULARIO = { en: 'pm_vocab_en', ru: 'pm_vocab_ru' };

const PAGINA = [
  ['button', 'abrir-painel'], ['button', 'lembrete'], ['span', 'lembrete-anel', 'lembrete'], ['b', 'lembrete-titulo', 'lembrete'],
  ['span', 'lembrete-corpo', 'lembrete'], ['span', 'lembrete-continuar', 'lembrete'], ['span', 'titulo-automatica-texto'],
  ['span', 'automatica-por-dia'], ['div', 'azulejos'], ['p', 'selo-vocabulario'], ['span', 'selo-vocabulario-texto', 'selo-vocabulario'],
  ['form', 'mineracao-rapida'], ['textarea', 'frase-rapida', 'mineracao-rapida'], ['button', 'minerar-rapida', 'mineracao-rapida'],
  ['div', 'erro-rapida'], ['span', 'titulo-ultimas-texto'], ['button', 'ver-todas'], ['div', 'ultimas'], ['footer', 'rodape'],
];

const deixarAndar = () => new Promise(resolver => setImmediate(resolver));

function montarPagina(documento) {
  for (const [tag, id, pai] of PAGINA) {
    const no = documento.createElement(tag);
    no.id = id;
    (pai ? documento.getElementById(pai) : documento.body).append(no);
  }
  documento.getElementById('selo-vocabulario').hidden = true;
}

class PopupDeTeste {
  constructor({ leituras = null, situacao = 'ligada' } = {}) {
    this.documento = new DocumentoFalso();
    montarPagina(this.documento);
    this.leituras = leituras;
    this.situacao = situacao;
    this.chamadasDoAbrirOAnki = [];
    this.mineradas = [];
    this.ouvintes = {};
    this.contexto = vm.createContext({ document: this.documento, chrome: this.chrome(), console, setTimeout, clearTimeout, Intl, Date });
    this.contexto.globalThis = this.contexto;
    for (const arquivo of ARQUIVOS_DE_VERDADE) this.rodar(arquivo);
    Object.assign(this.contexto.PerpetualMiner, this.portas());
    this.rodar('popup/popup.js');
  }

  rodar(arquivo) {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, arquivo), 'utf8'), this.contexto, { filename: arquivo });
  }

  chrome() {
    return {
      storage: {
        local: { get: (padrao, devolver) => { this.ouvintes.frases = devolver; } },
        onChanged: { addListener: ouvinte => { this.ouvintes.storage = ouvinte; } },
      },
      runtime: { getURL: caminho => `chrome-extension://pm/${caminho}` },
    };
  }

  portas() {
    const popup = this;
    return {
      Atalhos: { ATALHOS_PADRAO: { legenda: 'Alt+S' }, acompanharAtalhos: ouvinte => { popup.ouvintes.atalhos = ouvinte; }, rotuloDoAtalho: atalho => atalho },
      Configuracao: { acompanhar() {} },
      ConexaoAnki: {
        SITUACAO: { LIGADA: 'ligada', DESLIGADA: 'desligada' },
        situacao: () => popup.situacao,
        acompanhar: ouvinte => { popup.ouvintes.conexao = ouvinte; },
        iniciar() {},
      },
      AbrirOAnki: { montarSeJaConectou: (no, classes) => popup.chamadasDoAbrirOAnki.push([popup.nomeDoLugar(no), classes]) },
      MineracaoAutomatica: {
        lerEstado: () => new Promise(() => {}),
        salvarAjustes: () => new Promise(() => {}),
        ligarCampoDoLimite() {},
      },
      MineracaoDoDia: { CHAVES: { estadoPublicado: ESTADO_PUBLICADO } },
      AjustesDeEnvio: { CHAVE: 'pm_ajustes_de_envio' },
      VocabularioDaMineracao: {
        CHAVES: CHAVES_DO_VOCABULARIO,
        lerLeituras: () => (popup.leituras ? Promise.resolve(popup.leituras) : Promise.reject(new Error('sem leitura'))),
      },
      minerarFraseManual: texto => { popup.mineradas.push(texto); return Promise.resolve(null); },
    };
  }

  nomeDoLugar(no) {
    if (!no) return null;
    if (no.id) return no.id;
    return `espera-${no.closest('.popup-azulejo').dataset.idioma}`;
  }

  abrir() {
    this.documento.disparar('DOMContentLoaded');
    return this;
  }

  porId(id) {
    return this.documento.getElementById(id);
  }

  publicar(estado) {
    this.ouvintes.storage({ [ESTADO_PUBLICADO]: { newValue: estado } }, 'local');
  }

  trocarAsFrases(frases) {
    this.ouvintes.storage({ frases: { newValue: frases } }, 'local');
  }

  async mudarAConexao(situacao) {
    await deixarAndar();
    this.situacao = situacao;
    this.chamadasDoAbrirOAnki = [];
    this.ouvintes.conexao(situacao);
  }

  azulejo(chave) {
    return this.documento.querySelector(`.popup-azulejo[data-idioma="${chave}"]`);
  }

  focar(chave, seletor) {
    this.azulejo(chave).querySelector(seletor).focus();
  }

  diaEHora(quando) {
    return this.contexto.PerpetualMiner.Contexto.diaEHora(quando);
  }

  textoDaVoz(id, valores) {
    return this.contexto.PerpetualMiner.textoDaVoz(id, valores);
  }
}

function estado(ajustes, contagens = {}) {
  const settings = {};
  const daily = {};
  for (const [chave, [enabled, dailyLimit]] of Object.entries(ajustes)) settings[chave] = { enabled, dailyLimit };
  for (const [chave, count] of Object.entries(contagens)) daily[chave] = { count };
  return { settings, daily };
}

function retratoDoVocabulario(popup) {
  const selo = popup.porId('selo-vocabulario');
  const espera = chave => popup.azulejo(chave).querySelector('.popup-azulejo__espera').hidden;
  return {
    selo: selo.hidden ? null : popup.porId('selo-vocabulario-texto').textContent,
    esperando: ['en', 'ru'].filter(chave => !espera(chave)),
    abrirOAnki: popup.chamadasDoAbrirOAnki,
  };
}

const CHAMADAS_COM_OS_AZULEJOS = [['selo-vocabulario', 'veio-botao veio-botao--link'], ['espera-en', undefined], ['espera-ru', undefined]];

const ONTEM = Date.UTC(2026, 10, 19, 8, 30);
const HOJE = Date.UTC(2026, 10, 20, 14, 2);

const CASOS_DO_VOCABULARIO = [
  {
    nome: 'Anki fechado, os dois idiomas lidos: o selo diz a leitura mais velha',
    situacao: 'desligada', ligados: ['en', 'ru'], leituras: { en: { createdAt: HOJE }, ru: { createdAt: ONTEM } },
    selo: ONTEM, esperando: [],
  },
  {
    nome: 'Anki fechado, só o inglês lido: o selo diz o inglês e o russo espera o Anki',
    situacao: 'desligada', ligados: ['en', 'ru'], leituras: { en: { createdAt: HOJE } }, selo: HOJE, esperando: ['ru'],
  },
  {
    nome: 'Anki fechado, o russo desligado não entra no selo nem espera',
    situacao: 'desligada', ligados: ['en'], leituras: { en: { createdAt: HOJE }, ru: { createdAt: ONTEM } }, selo: HOJE, esperando: [],
  },
  {
    nome: 'Anki fechado, o inglês desligado e sem leitura não espera',
    situacao: 'desligada', ligados: ['ru'], leituras: { ru: { createdAt: ONTEM } }, selo: ONTEM, esperando: [],
  },
  {
    nome: 'Conexão ligada: nem selo nem espera',
    situacao: 'ligada', ligados: ['en', 'ru'], leituras: { en: { createdAt: HOJE } }, selo: null, esperando: [],
  },
  {
    nome: 'Anki fechado e nenhum Baralho lido ainda: os dois esperam e não há selo',
    situacao: 'desligada', ligados: ['en', 'ru'], leituras: {}, selo: null, esperando: ['en', 'ru'],
  },
  {
    nome: 'Anki fechado e as leituras não se leram: nada aparece',
    situacao: 'desligada', ligados: ['en', 'ru'], leituras: null, selo: null, esperando: [],
  },
  {
    nome: 'Anki fechado e nenhum idioma ligado: nada aparece',
    situacao: 'desligada', ligados: [], leituras: { en: { createdAt: HOJE } }, selo: null, esperando: [],
  },
];

async function provarOVocabularioComOAnkiFechado() {
  for (const caso of CASOS_DO_VOCABULARIO) {
    const popup = new PopupDeTeste({ leituras: caso.leituras }).abrir();
    popup.publicar(estado({ en: [caso.ligados.includes('en'), 20], ru: [caso.ligados.includes('ru'), 20] }));
    await deixarAndar();
    await popup.mudarAConexao(caso.situacao);
    const selo = caso.selo === null ? null : popup.textoDaVoz('POP-17.selo', { quando: popup.diaEHora(caso.selo) });
    assert.deepStrictEqual(retratoDoVocabulario(popup), { selo, esperando: caso.esperando, abrirOAnki: CHAMADAS_COM_OS_AZULEJOS }, caso.nome);
  }
}

async function provarOVocabularioAntesDosAzulejos() {
  const popup = new PopupDeTeste({ leituras: { en: { createdAt: HOJE } } }).abrir();
  await popup.mudarAConexao('desligada');
  assert.deepStrictEqual(popup.chamadasDoAbrirOAnki, [['selo-vocabulario', 'veio-botao veio-botao--link'], [null, undefined], [null, undefined]],
    'sem azulejos, o Abrir o Anki só vai para o selo');
  assert.strictEqual(popup.porId('selo-vocabulario').hidden, true, 'sem o estado da mineração, nenhum idioma está ligado');
}

function retratoDosAzulejos(popup, antes) {
  const foco = popup.documento.activeElement;
  return ['en', 'ru'].map(chave => {
    const azulejo = popup.azulejo(chave);
    return {
      chave,
      mesmo: azulejo === antes[chave],
      campo: Boolean(azulejo.querySelector('.popup-azulejo__campo')),
      noLimite: Boolean(azulejo.querySelector('.popup-azulejo__no-limite')),
      contador: azulejo.querySelector('.popup-azulejo__contador b').textContent,
      foco: azulejo.contains(foco) ? foco.className || foco.type : null,
    };
  });
}

const CASOS_DO_FOCO = [
  {
    nome: 'o campo do limite em foco fica no lugar quando o número muda',
    focar: ['en', '.popup-azulejo__campo'], depois: estado({ en: [true, 20], ru: [true, 10] }, { en: 6, ru: 1 }),
    esperado: [{ mesmo: true, campo: true, noLimite: false, contador: '6', foco: 'popup-azulejo__campo' }, { mesmo: false, campo: true, noLimite: false, contador: '1', foco: null }],
  },
  {
    nome: 'o campo em foco dá lugar ao POP-08 no limite, e o foco vai para o interruptor',
    focar: ['en', '.popup-azulejo__campo'], depois: estado({ en: [true, 20], ru: [true, 10] }, { en: 20, ru: 1 }),
    esperado: [{ mesmo: false, campo: false, noLimite: true, contador: '20', foco: 'checkbox' }, { mesmo: false, campo: true, noLimite: false, contador: '1', foco: null }],
  },
  {
    nome: 'o campo do russo em foco fica, e o azulejo do inglês é refeito',
    focar: ['ru', '.popup-azulejo__campo'], depois: estado({ en: [true, 20], ru: [true, 10] }, { en: 6, ru: 2 }),
    esperado: [{ mesmo: false, campo: true, noLimite: false, contador: '6', foco: null }, { mesmo: true, campo: true, noLimite: false, contador: '2', foco: 'popup-azulejo__campo' }],
  },
  {
    nome: 'o interruptor em foco: o azulejo é refeito e o foco volta ao interruptor novo',
    focar: ['en', 'input[type="checkbox"]'], depois: estado({ en: [false, 20], ru: [true, 10] }, { en: 5, ru: 1 }),
    esperado: [{ mesmo: false, campo: true, noLimite: false, contador: '5', foco: 'checkbox' }, { mesmo: false, campo: true, noLimite: false, contador: '1', foco: null }],
  },
  {
    nome: 'o campo em foco de um idioma desligado no número do limite fica no lugar',
    focar: ['en', '.popup-azulejo__campo'], depois: estado({ en: [false, 20], ru: [true, 10] }, { en: 20, ru: 1 }),
    esperado: [{ mesmo: true, campo: true, noLimite: false, contador: '20', foco: 'popup-azulejo__campo' }, { mesmo: false, campo: true, noLimite: false, contador: '1', foco: null }],
  },
  {
    nome: 'sem foco nos azulejos: os dois são refeitos e o foco não muda',
    focar: null, depois: estado({ en: [true, 20], ru: [true, 10] }, { en: 6, ru: 1 }),
    esperado: [{ mesmo: false, campo: true, noLimite: false, contador: '6', foco: null }, { mesmo: false, campo: true, noLimite: false, contador: '1', foco: null }],
  },
];

async function provarOFocoNosAzulejos() {
  for (const caso of CASOS_DO_FOCO) {
    const popup = new PopupDeTeste().abrir();
    popup.publicar(estado({ en: [true, 20], ru: [true, 10] }, { en: 5, ru: 1 }));
    if (caso.focar) popup.focar(...caso.focar);
    const antes = { en: popup.azulejo('en'), ru: popup.azulejo('ru') };
    popup.publicar(caso.depois);
    const esperado = caso.esperado.map((azulejo, i) => ({ chave: ['en', 'ru'][i], ...azulejo }));
    assert.deepStrictEqual(retratoDosAzulejos(popup, antes), esperado, caso.nome);
  }
}

const CASOS_DO_ENTER = [
  { nome: 'Enter envia', tecla: { key: 'Enter' }, envia: true },
  { nome: 'Shift+Enter quebra a linha', tecla: { key: 'Enter', shiftKey: true }, envia: false },
  { nome: 'Enter que fecha uma composição não envia', tecla: { key: 'Enter', isComposing: true }, envia: false },
  { nome: 'outra tecla não envia', tecla: { key: 'a' }, envia: false },
];

function provarOEnterDaMineracaoRapida() {
  for (const caso of CASOS_DO_ENTER) {
    const popup = new PopupDeTeste().abrir();
    let enviadas = 0;
    popup.porId('mineracao-rapida').requestSubmit = () => { enviadas++; };
    const evento = popup.porId('frase-rapida').disparar('keydown', caso.tecla);
    assert.deepStrictEqual({ enviadas, impedido: evento.padraoImpedido }, { enviadas: caso.envia ? 1 : 0, impedido: caso.envia }, caso.nome);
  }
}

function frase(id, texto = `frase ${id}`) {
  return { id, texto, idioma: 'Inglês', keywords: [], data: '', contexto: {} };
}

function retratoDasUltimas(popup) {
  const lista = popup.porId('ultimas').children[0];
  return {
    lugar: lista.className,
    ocupada: lista.getAttribute('aria-busy'),
    linhas: lista.querySelectorAll('li').map(linha => (linha.classList.contains('popup-ultima--esqueleto') ? 'esqueleto' : linha.querySelector('.popup-ultima__texto')?.title)),
    novas: lista.querySelectorAll('.popup-ultima--nova').map(linha => linha.querySelector('.popup-ultima__texto').title),
    verTodas: !popup.porId('ver-todas').hidden,
  };
}

const ESQUELETO = { lugar: 'popup-ultimas', ocupada: 'true', linhas: Array(5).fill('esqueleto'), novas: [], verTodas: false };
const VAZIO = { lugar: 'veio-vazio popup-vazio', ocupada: null, linhas: [], novas: [], verTodas: false };
const textos = (...ids) => ids.map(id => `frase ${id}`);
const lista = (linhas, novas = []) => ({ lugar: 'popup-ultimas', ocupada: null, linhas: textos(...linhas), novas: textos(...novas), verTodas: true });

function provarAsUltimas() {
  const popup = new PopupDeTeste().abrir();
  assert.deepStrictEqual(retratoDasUltimas(popup), ESQUELETO, 'antes das frases, o esqueleto de 5 linhas');
  popup.ouvintes.frases({ frases: [1, 2, 3, 4, 5, 6, 7].map(id => frase(id)) });
  assert.deepStrictEqual(retratoDasUltimas(popup), lista([1, 2, 3, 4, 5]), 'as 5 primeiras, nenhuma nova no primeiro desenho');
  popup.trocarAsFrases([8, 1, 2, 3, 4, 5].map(id => frase(id)));
  assert.deepStrictEqual(retratoDasUltimas(popup), lista([8, 1, 2, 3, 4], [8]), 'a frase que chega entra marcada como nova');
  popup.ouvintes.atalhos({ legenda: 'Alt+M' });
  assert.deepStrictEqual(retratoDasUltimas(popup), lista([8, 1, 2, 3, 4], [8]), 'até a animação acabar, ela segue nova num desenho de novo');
  popup.porId('ultimas').querySelector('.popup-ultima--nova').disparar('animationend');
  popup.trocarAsFrases([8, 1, 2, 3, 4, 5].map(id => frase(id)));
  assert.deepStrictEqual(retratoDasUltimas(popup), lista([8, 1, 2, 3, 4]), 'depois da animação, ela não é mais nova');
  popup.trocarAsFrases([]);
  assert.deepStrictEqual(retratoDasUltimas(popup), VAZIO, 'sem frase, o vazio e sem Ver todas');
  popup.trocarAsFrases([frase(9)]);
  assert.deepStrictEqual(retratoDasUltimas(popup), lista([9], [9]), 'depois do vazio, a primeira frase chega nova');

  const comecaVazio = new PopupDeTeste().abrir();
  comecaVazio.ouvintes.frases({ frases: [] });
  comecaVazio.trocarAsFrases([frase(1)]);
  assert.deepStrictEqual(retratoDasUltimas(comecaVazio), lista([1], [1]), 'o popup que abriu vazio mostra a primeira frase como nova');
}

async function main() {
  await provarOVocabularioComOAnkiFechado();
  await provarOVocabularioAntesDosAzulejos();
  await provarOFocoNosAzulejos();
  provarOEnterDaMineracaoRapida();
  provarAsUltimas();
  console.log('popup cockpit tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });
