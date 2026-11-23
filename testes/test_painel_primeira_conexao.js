'use strict';

const assert = require('assert');

const { prepararAPagina, noComId, esperar } = require('./painel_de_mentira.js');

const { documento, raiz } = prepararAPagina();
require('../painel/painel-anki-primeira-conexao-estado.js');
const { textoDaVoz } = raiz;

const LIGADA = 'ligada';
const DESLIGADA = 'desligada';
const CONECTANDO = 'conectando';

const mundo = { situacao: CONECTANDO, respondeu: false, jaConectou: false, area: 'anki', resolvido: false, agora: 1000000 };
const registro = { passos: [], toasts: [], armazenado: [], timers: [], seguidores: {}, entrou: null };

const secao = noComId(documento, 'anki-primeira-vez');
secao.hidden = true;
const area = noComId(documento, 'area-anki', 'shell-area');
area.setAttribute('data-area', 'anki');
const titulo = noComId(documento, 'anki-primeira-vez-titulo');
const confere = noComId(documento, 'apv-confere');
const apoio = noComId(documento, 'apv-apoio');
const rodape = noComId(documento, 'apv-rodape');
const vagaDosPassos = noComId(documento, 'apv-passos');
const radio = documento.createElement('input');
const buscar = documento.querySelector.bind(documento);
documento.querySelector = seletor => (seletor === 'input[name="aba-anki"]:checked' ? radio : buscar(seletor));

raiz.Shell = { areaAtual: () => mundo.area, aoEntrarNaArea: (nome, desenhar) => { registro.entrou = [nome, desenhar]; } };
raiz.ConexaoNaTela = { texto: situacao => `na tela: ${situacao}` };
raiz.Veio.mostrarToastDeSucesso = texto => registro.toasts.push(texto);
raiz.ConexaoAnki = {
  SITUACAO: { CONECTANDO, LIGADA, DESLIGADA },
  pronta: Promise.resolve(),
  aoConferir: seguidor => { registro.seguidores.conferir = seguidor; },
  acompanhar: seguidor => { registro.seguidores.conexao = seguidor; },
  situacao: () => mundo.situacao,
  ultimaResposta: () => (mundo.respondeu ? mundo.situacao : null),
  jaConectou: () => mundo.jaConectou,
};
raiz.PassosDaConexao = {
  montar: (vaga, opcoes) => {
    registro.passos.push(['montar', vaga.id, opcoes.prefixo]);
    registro.resolverOAbridor = opcoes.aoResolverOAbridor;
    return {
      abridorResolvido: () => mundo.resolvido,
      mostrar: visivel => registro.passos.push(['mostrar', visivel]),
      desenhar: opcoes => registro.passos.push(['desenhar', opcoes]),
      focarTitulo: () => registro.passos.push(['focarTitulo']),
    };
  },
};
chrome.storage.local.get = async padrao => ({ ...padrao, ...registro.lido });
chrome.storage.local.set = async valores => { registro.armazenado.push(valores); };
globalThis.setInterval = (funcao, ms) => { registro.timers.push(['intervalo', ms, funcao]); };
globalThis.setTimeout = (funcao, ms) => { registro.timers.push(['espera', ms, funcao]); };
Date.now = () => mundo.agora;

require('../painel/painel-anki-primeira-conexao.js');

const retratoDaTela = () => ({
  escondida: secao.hidden, coberta: area.classList.contains('anki--primeira-vez'), titulo: titulo.textContent,
  confere: confere.textContent, apoio: apoio.hidden, rodape: rodape.hidden,
});
const aConexaoMudou = situacao => { mundo.situacao = situacao; registro.seguidores.conexao(situacao); };
const passosVistos = () => registro.passos.splice(0);

async function aTelaComecaConferindo() {
  registro.lido = {};
  await raiz.PrimeiraConexao.montar();
  assert.deepStrictEqual(passosVistos(), [['montar', 'apv-passos', 'apv']]);
  assert.deepStrictEqual(registro.timers.map(([tipo, ms]) => [tipo, ms]), [['intervalo', 1000]]);
  assert.strictEqual(registro.entrou[0], 'anki');
  aConexaoMudou(CONECTANDO);
  assert.strictEqual(secao.hidden, true, 'conectando sem resposta: o card espera');
  assert.deepStrictEqual(passosVistos(), [['mostrar', false]]);
}

function oCardDaInstalacaoCobreAsAbas() {
  mundo.respondeu = true;
  aConexaoMudou(DESLIGADA);
  assert.deepStrictEqual(retratoDaTela(), {
    escondida: false, coberta: true, titulo: textoDaVoz('ONB-16.titulo'),
    confere: textoDaVoz('ONB-16.conferindo', { segundos: 0 }), apoio: false, rodape: false,
  });
  assert.deepStrictEqual(passosVistos(), [['mostrar', true], ['desenhar', { pronto: false }]]);
  mundo.agora += 7400;
  registro.seguidores.conferir(true);
  assert.strictEqual(confere.textContent, textoDaVoz('ONB-16.conferindoAgora'));
  registro.seguidores.conferir(false);
  assert.strictEqual(confere.textContent, textoDaVoz('ONB-16.conferindo', { segundos: 7 }));
  mundo.situacao = CONECTANDO;
  registro.timers.find(([tipo]) => tipo === 'intervalo')[2]();
  assert.strictEqual(confere.textContent, textoDaVoz('ONB-16.conferindoAgora'), 'o tique redesenha a conferência');
  mundo.situacao = DESLIGADA;
}

function aLigacaoLevaAoPasso4() {
  aConexaoMudou(LIGADA);
  assert.strictEqual(titulo.textContent, textoDaVoz('ONB-17.titulo'));
  assert.deepStrictEqual(registro.armazenado.splice(0), [{ pm_anki_abridor_pendente: true }]);
  assert.deepStrictEqual(passosVistos(), [['mostrar', true], ['desenhar', { pronto: false }]]);
  assert.strictEqual(secao.hidden, false);
}

function resolverOAbridorMostraOMomentoPronto() {
  mundo.resolvido = true;
  documento.activeElement = secao;
  secao.append(radio);
  registro.resolverOAbridor();
  assert.deepStrictEqual(retratoDaTela(), {
    escondida: false, coberta: true, titulo: 'na tela: ligada',
    confere: textoDaVoz('ONB-16.conferindo', { segundos: 0 }), apoio: true, rodape: true,
  });
  assert.deepStrictEqual(registro.armazenado.splice(0), [{ pm_anki_abridor_pendente: false }]);
  assert.deepStrictEqual(passosVistos(), [['mostrar', true], ['desenhar', { pronto: true }], ['focarTitulo']]);
  const espera = registro.timers.filter(([tipo]) => tipo === 'espera');
  assert.deepStrictEqual(espera.map(([, ms]) => ms), [1800]);
  registro.timers.length = 0;
  return espera[0][2];
}

function depoisDoMomentoProntoVoltamAsAbas(passouOMomento) {
  documento.activeElement = radio;
  passouOMomento();
  assert.strictEqual(secao.hidden, true);
  assert.strictEqual(area.classList.contains('anki--primeira-vez'), false);
  assert.strictEqual(documento.activeElement, radio, 'o foco que estava no card vai para a aba marcada');
  assert.deepStrictEqual(registro.toasts, ['na tela: ligada']);
  assert.deepStrictEqual(passosVistos(), [['mostrar', false]]);
  mundo.area = 'frases';
  passouOMomento();
  assert.strictEqual(registro.toasts.length, 1, 'fora da área do Anki, o aviso de ligada não aparece');
}

async function tudo() {
  await aTelaComecaConferindo();
  oCardDaInstalacaoCobreAsAbas();
  aLigacaoLevaAoPasso4();
  const passouOMomento = resolverOAbridorMostraOMomentoPronto();
  depoisDoMomentoProntoVoltamAsAbas(passouOMomento);
  await esperar();
  console.log('painel da primeira conexão ok');
}

tudo().catch(erro => { console.error(erro); process.exit(1); });
