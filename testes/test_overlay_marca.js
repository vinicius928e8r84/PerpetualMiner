'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { DocumentoFalso, GLOBAIS_DO_DOM, caixa } = require('./dom-falso');

const RAIZ = path.join(__dirname, '..');
const LARGURA_DA_JANELA = 1000;
const LETRA = 10;
const ALTURA_DA_LINHA = 20;
const HOST = caixa(600, 300, 46, 46);
const PLAYER = caixa(0, 0, LARGURA_DA_JANELA, 450);
const CHIP = caixa(0, 0, 120, 24);

class OverlayDeTeste {
  constructor() {
    this.documento = new DocumentoFalso();
    this.documento.caixas.push(['perpetualminer-overlay', HOST], ['.player', PLAYER], ['.pm-chip', CHIP]);
    this.quadros = [];
    this.contexto = vm.createContext({
      ...GLOBAIS_DO_DOM,
      document: this.documento,
      window: { innerWidth: LARGURA_DA_JANELA },
      chrome: { runtime: { getURL: caminho => `chrome-extension://pm/${caminho}` } },
      fetch: () => new Promise(() => {}),
      requestAnimationFrame: quadro => this.quadros.push(quadro),
      cancelAnimationFrame() {},
      setTimeout: () => 0,
      clearTimeout() {},
    });
    this.contexto.globalThis = this.contexto;
    this.rodar('veio/componentes.js');
    this.contexto.PerpetualMiner.Atalhos = { digitandoNumCampo: () => false };
    this.rodar('overlay/overlay.js');
    this.Overlay = this.contexto.PerpetualMiner.Overlay;
    this.player = this.documento.createElement('div');
    this.player.className = 'player';
    this.documento.body.append(this.player);
  }

  rodar(arquivo) {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, arquivo), 'utf8'), this.contexto, { filename: arquivo });
  }

  get sombra() {
    this.host = this.host || this.documento.querySelector('perpetualminer-overlay');
    return this.host.shadowRoot;
  }

  parte(seletor) {
    return this.sombra.querySelector(seletor);
  }

  legenda(pedacos, { left = 100, top = 380, porLinha } = {}) {
    const lugar = this.documento.createElement('div');
    let coluna = 0;
    const textos = pedacos.map(pedaco => {
      const texto = this.documento.createTextNode(pedaco);
      texto.desenho = { left: left + coluna * LETRA, top, altura: ALTURA_DA_LINHA, largura: LETRA, porLinha };
      coluna += pedaco.length;
      lugar.append(texto);
      return texto;
    });
    this.player.append(lugar);
    return textos;
  }

  faixa(inicio, posicaoDoInicio, fim, posicaoDoFim) {
    const faixa = this.documento.createRange();
    faixa.setStart(inicio, posicaoDoInicio);
    faixa.setEnd(fim, posicaoDoFim);
    return faixa;
  }

  rodarUmQuadro() {
    const quadro = this.quadros.shift();
    quadro();
  }
}

const posicao = no => ({ left: no.style.left, top: no.style.top, width: no.style.width, height: no.style.height });

function retratoDoFeedback(overlay) {
  const pilula = overlay.parte('.pm-pilula');
  return {
    pilula: pilula.classList.contains('pm-pilula--aberta') ? overlay.parte('.pm-estado').textContent : null,
    erro: pilula.classList.contains('pm-pilula--erro'),
    linhas: overlay.parte('.pm-marca').querySelectorAll('.pm-linha').map(posicao),
    grifos: overlay.parte('.pm-marca').querySelectorAll('.pm-grifo').map(posicao),
    chip: overlay.parte('.pm-chip') && posicao(overlay.parte('.pm-chip')),
  };
}

const px = valor => `${valor}px`;
const linha = (left, top, width) => ({ left: px(left - HOST.left), top: px(top + ALTURA_DA_LINHA - HOST.top + 3), width: px(width), height: undefined });
const grifo = (left, top, width) => ({
  left: px(left - HOST.left - 1), top: px(top - HOST.top + ALTURA_DA_LINHA * 0.5), width: px(width + 2), height: px(ALTURA_DA_LINHA * 0.44),
});
const chip = (left, top) => ({ left: px(left - HOST.left), top: px(top - HOST.top), width: undefined, height: undefined });
const chipAcimaDe = (left, width, top = 380) => chip(left + width / 2 - CHIP.width / 2, top - 8 - CHIP.height);

const sucesso = (lugar, extras = {}) => ({ tipo: 'sucesso', icone: 'frases', titulo: 'Minerada', frase: 'the cat sat', palavras: ['cat'], meta: 'EN', lugar, ...extras });

function marcaSobre(overlay, pedacos, { palavras = ['cat'], desenho } = {}) {
  const textos = overlay.legenda(pedacos, desenho);
  const ultimo = textos[textos.length - 1];
  overlay.Overlay.mostrar(sucesso(() => overlay.faixa(textos[0], 0, ultimo, ultimo.length), { palavras }));
  return retratoDoFeedback(overlay);
}

const MARCA_DE_THE_CAT_SAT = { pilula: null, erro: false, linhas: [linha(100, 380, 110)], grifos: [grifo(140, 380, 30)], chip: chipAcimaDe(100, 110) };

const CASOS_DO_LUGAR = [
  {
    nome: 'a legenda dentro do player ganha a marca: a linha, o grifo da Palavra e o chip acima',
    pedacos: ['the cat sat'], esperado: MARCA_DE_THE_CAT_SAT,
  },
  {
    nome: 'a legenda em três textos vira uma linha só, e o grifo cai no texto da Palavra',
    pedacos: ['the ', 'cat', ' sat'], esperado: MARCA_DE_THE_CAT_SAT,
  },
  {
    nome: 'a Palavra partida entre dois textos ganha um grifo em cada pedaço',
    pedacos: ['the ca', 't sat'], esperado: { ...MARCA_DE_THE_CAT_SAT, grifos: [grifo(140, 380, 20), grifo(160, 380, 10)] },
  },
  {
    nome: 'a legenda em duas linhas ganha duas linhas, e o chip fica acima da primeira',
    pedacos: ['the cat sat'], desenho: { porLinha: 8 },
    esperado: { ...MARCA_DE_THE_CAT_SAT, linhas: [linha(100, 380, 80), linha(100, 400, 30)], chip: chipAcimaDe(100, 80) },
  },
  {
    nome: 'sem espaço acima, o chip desce para baixo da última linha',
    pedacos: ['the cat sat'], desenho: { top: 36 },
    esperado: { ...MARCA_DE_THE_CAT_SAT, linhas: [linha(100, 36, 110)], grifos: [grifo(140, 36, 30)], chip: chip(100 + 55 - 60, 36 + ALTURA_DA_LINHA + 3 + 8) },
  },
  {
    nome: 'perto da borda direita da janela, o chip para na margem',
    pedacos: ['the cat sat'], desenho: { left: 890 },
    esperado: { ...MARCA_DE_THE_CAT_SAT, linhas: [linha(890, 380, 110)], grifos: [grifo(930, 380, 30)], chip: chip(LARGURA_DA_JANELA - 8 - CHIP.width, 380 - 8 - CHIP.height) },
  },
  {
    nome: 'perto da borda esquerda da janela, o chip para na margem',
    pedacos: ['the cat sat'], desenho: { left: 1 },
    esperado: { ...MARCA_DE_THE_CAT_SAT, linhas: [linha(1, 380, 110)], grifos: [grifo(41, 380, 30)], chip: chip(8, 380 - 8 - CHIP.height) },
  },
];

const PILULA_DE_THE_CAT_SAT = { pilula: 'Mineradathe cat satEN', erro: false, linhas: [], grifos: [], chip: null };

const CASOS_FORA_DO_PLAYER = [
  { nome: 'a legenda 1 px além da direita do player ainda conta como dentro', desenho: { left: 891 }, dentro: true },
  { nome: 'a legenda 2 px além da direita do player vai para a pílula', desenho: { left: 892 }, dentro: false },
  { nome: 'a legenda além da esquerda do player vai para a pílula', desenho: { left: -2 }, dentro: false },
  { nome: 'a legenda acima do player vai para a pílula', desenho: { top: -2 }, dentro: false },
  { nome: 'a legenda abaixo do player vai para a pílula', desenho: { top: 432 }, dentro: false },
  { nome: 'a legenda 1 px abaixo do player ainda conta como dentro', desenho: { top: 431 }, dentro: true },
];

function provarOLugarDaMarca() {
  for (const caso of CASOS_DO_LUGAR) {
    const overlay = new OverlayDeTeste();
    overlay.Overlay.mostrarBotao(overlay.player);
    assert.deepStrictEqual(marcaSobre(overlay, caso.pedacos, { desenho: caso.desenho }), caso.esperado, caso.nome);
  }
  for (const caso of CASOS_FORA_DO_PLAYER) {
    const overlay = new OverlayDeTeste();
    overlay.Overlay.mostrarBotao(overlay.player);
    const retrato = marcaSobre(overlay, ['the cat sat'], { desenho: caso.desenho });
    assert.deepStrictEqual({ marca: retrato.linhas.length === 1, pilula: retrato.pilula }, caso.dentro ? { marca: true, pilula: null } : { marca: false, pilula: 'Mineradathe cat satEN' }, caso.nome);
  }
}

function provarOQueVaiParaAPilula() {
  const semPlayer = new OverlayDeTeste();
  assert.deepStrictEqual(marcaSobre(semPlayer, ['the cat sat'], { desenho: { left: 5000, top: 5000 } }).linhas.length, 1,
    'sem player, o overlay solto não confere a caixa e marca o texto onde ele estiver');

  const overlay = new OverlayDeTeste();
  overlay.Overlay.mostrarBotao(overlay.player);
  overlay.Overlay.mostrar(sucesso(() => null));
  assert.deepStrictEqual(retratoDoFeedback(overlay), PILULA_DE_THE_CAT_SAT, 'sem lugar, a pílula com a frase');

  const [texto] = overlay.legenda(['the cat sat']);
  overlay.Overlay.mostrar(sucesso(() => overlay.faixa(texto, 4, texto, 4)));
  assert.deepStrictEqual(retratoDoFeedback(overlay), PILULA_DE_THE_CAT_SAT, 'a faixa vazia não tem o que marcar');

  overlay.Overlay.mostrar({ ...sucesso(() => overlay.faixa(texto, 0, texto, 11)), tipo: 'erro', frase: '', dica: 'Tente de novo' });
  assert.deepStrictEqual(retratoDoFeedback(overlay), { ...PILULA_DE_THE_CAT_SAT, pilula: 'MineradaTente de novoEN', erro: true }, 'a falha nunca marca');
}

const CASOS_DOS_GRIFOS = [
  { nome: 'a Palavra dentro de outra palavra não é grifada', pedacos: ['concatenate it'], palavras: ['cat'], grifos: [] },
  { nome: 'a Palavra colada só numa letra antes não é grifada', pedacos: ['scat it'], palavras: ['cat'], grifos: [] },
  { nome: 'a Palavra colada só numa letra depois não é grifada', pedacos: ['cats it'], palavras: ['cat'], grifos: [] },
  { nome: 'a Palavra que só aparece colada numa letra acentuada não é grifada', pedacos: ['café ok'], palavras: ['caf'], grifos: [] },
  { nome: 'a Palavra no começo e no fim do texto é grifada', pedacos: ['cat'], palavras: ['cat'], grifos: [[0, 3]] },
  { nome: 'cada Palavra é procurada depois da anterior', pedacos: ['the cat the'], palavras: ['cat', 'the'], grifos: [[4, 3], [8, 3]] },
  { nome: 'a Palavra que não está no texto é pulada', pedacos: ['the cat sat'], palavras: ['dog', 'cat'], grifos: [[4, 3]] },
  { nome: 'a Palavra recusada não anda o cursor', pedacos: ['the scatter'], palavras: ['cat', 'the'], grifos: [[0, 3]] },
];

function provarOsGrifos() {
  for (const caso of CASOS_DOS_GRIFOS) {
    const overlay = new OverlayDeTeste();
    overlay.Overlay.mostrarBotao(overlay.player);
    const retrato = marcaSobre(overlay, caso.pedacos, { palavras: caso.palavras });
    assert.deepStrictEqual(retrato.grifos, caso.grifos.map(([inicio, tamanho]) => grifo(100 + inicio * LETRA, 380, tamanho * LETRA)), caso.nome);
  }
}

function provarQueAMarcaAcompanhaOTexto() {
  const overlay = new OverlayDeTeste();
  overlay.Overlay.mostrarBotao(overlay.player);
  const [texto] = overlay.legenda(['the cat sat']);
  let lugar = overlay.faixa(texto, 0, texto, 11);
  overlay.Overlay.mostrar(sucesso(() => lugar));
  const desenhada = overlay.parte('.pm-linha');
  overlay.rodarUmQuadro();
  assert.strictEqual(overlay.parte('.pm-linha'), desenhada, 'o mesmo lugar não redesenha');
  texto.desenho = { ...texto.desenho, top: 360 };
  overlay.rodarUmQuadro();
  assert.deepStrictEqual([overlay.parte('.pm-linha') === desenhada, overlay.parte('.pm-marca').className, posicao(overlay.parte('.pm-linha'))],
    [false, 'pm-marca pm-marca--parada', linha(100, 360, 110)], 'o texto que mexe leva a marca junto, já sem a animação de entrada');
  lugar = null;
  overlay.rodarUmQuadro();
  assert.deepStrictEqual(retratoDoFeedback(overlay), { pilula: null, erro: false, linhas: [], grifos: [], chip: null }, 'o texto que sai leva a marca embora');

  overlay.Overlay.mostrar(sucesso(() => overlay.faixa(texto, 0, texto, 11)));
  overlay.player.remove();
  overlay.quadros.splice(0, overlay.quadros.length - 1);
  overlay.rodarUmQuadro();
  assert.strictEqual(overlay.parte('.pm-marca').childNodes.length, 0, 'o player que sai da página leva a marca embora');
}

function retratoDoContador(overlay) {
  const contador = overlay.parte('.pm-contador');
  return {
    visivel: !contador.hidden,
    texto: contador.textContent,
    noLimite: contador.classList.contains('pm-contador--limite'),
    descricao: overlay.parte('#pm-descricao-do-contador').textContent,
    descritoPor: overlay.parte('.pm-botao').getAttribute('aria-describedby'),
    etiqueta: overlay.parte('.pm-dica-contador')?.textContent ?? null,
  };
}

const CONTAGEM = { texto: '5/20', descricao: 'Mineração automática: 5 de 20 hoje', etiqueta: 'Mineração automática: 5 de 20 hoje', noLimite: false };
const DESCRITO = 'pm-descricao-do-contador';

const PASSOS_DO_CONTADOR = [
  { nome: 'o contador do idioma ligado', contagem: CONTAGEM, esperado: { visivel: true, texto: '5/20', noLimite: false, descricao: CONTAGEM.descricao, descritoPor: DESCRITO, etiqueta: CONTAGEM.etiqueta } },
  { nome: 'no limite, o contador ganha o contorno', contagem: { ...CONTAGEM, texto: '20/20', noLimite: true }, esperado: { visivel: true, texto: '20/20', noLimite: true, descricao: CONTAGEM.descricao, descritoPor: DESCRITO, etiqueta: CONTAGEM.etiqueta } },
  { nome: 'sem descrição, o botão perde a descrição', contagem: { texto: '1/2' }, esperado: { visivel: true, texto: '1/2', noLimite: false, descricao: '', descritoPor: null, etiqueta: null } },
  { nome: 'o idioma desligado esconde o contador e guarda o último número', contagem: null, esperado: { visivel: false, texto: '1/2', noLimite: false, descricao: '', descritoPor: null, etiqueta: null } },
];

function provarOContador() {
  const antes = new OverlayDeTeste();
  antes.Overlay.mostrarContador(CONTAGEM);
  antes.Overlay.mostrarBotao(antes.player);
  assert.deepStrictEqual(retratoDoContador(antes), { visivel: false, texto: '', noLimite: false, descricao: '', descritoPor: null, etiqueta: CONTAGEM.etiqueta },
    'a contagem que chega antes do botão só deixa a etiqueta');

  const overlay = new OverlayDeTeste();
  overlay.Overlay.mostrarBotao(overlay.player);
  for (const passo of PASSOS_DO_CONTADOR) {
    overlay.Overlay.mostrarContador(passo.contagem);
    assert.deepStrictEqual(retratoDoContador(overlay), passo.esperado, passo.nome);
  }
}

provarOLugarDaMarca();
provarOQueVaiParaAPilula();
provarOsGrifos();
provarQueAMarcaAcompanhaOTexto();
provarOContador();
console.log('overlay marca tests passed');
