'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..');
const NAO_RODAM_AQUI = ['lib/atalhos.js', 'veio/componentes.js', 'overlay/overlay.js'];
const SILENCIO_DA_LEGENDA_MS = 650;
const INICIO = 1_000_000;

const scriptsDeConteudo = () => JSON.parse(fs.readFileSync(path.join(RAIZ, 'manifest.json'), 'utf8')).content_scripts[0].js;
const plano = valor => JSON.parse(JSON.stringify(valor));

function videoDaPagina(pagina) {
  return {
    get paused() { return !pagina.tocando; },
    ended: false,
    parentElement: {},
    getBoundingClientRect: () => ({ width: 640, height: 360, top: 0, left: 0, bottom: 360, right: 640 }),
  };
}

function documentoDaPagina(pagina) {
  const video = videoDaPagina(pagina);
  return {
    title: '',
    querySelectorAll: seletor => (seletor === 'video' ? [video] : seletor === '.ytp-caption-segment' ? pagina.segmentos : []),
    querySelector: () => null,
    addEventListener: () => undefined,
    createRange: () => ({ setStartBefore: () => undefined, setEndAfter: () => undefined }),
  };
}

function chromeDaPagina(pagina, { estado, aoMandar }) {
  return {
    runtime: {
      id: 'extensao',
      lastError: undefined,
      sendMessage: (mensagem, aoResponder) => {
        pagina.mensagens.push(plano(mensagem));
        if (mensagem.type === 'AUTO_MINER_GET_STATE') aoResponder?.({ state: estado });
        else aoResponder?.(aoMandar(mensagem));
      },
      onMessage: { addListener: ouvinte => pagina.ouvintes.push(ouvinte) },
    },
  };
}

function overlayDaPagina(pagina, { haBotao, falhaNaTela }) {
  return {
    aoClicar: () => undefined,
    definirRotulo: () => undefined,
    mostrarBotao: () => undefined,
    temBotao: () => haBotao,
    mostrandoFalha: () => falhaNaTela,
    mostrar: aviso => pagina.avisos.push(plano(aviso)),
    mostrarContador: contagem => pagina.contadores.push(plano(contagem)),
  };
}

const ATALHOS_DA_PAGINA = {
  ATALHOS_PADRAO: { legenda: null, selecao: null },
  acompanharAtalhos: () => undefined,
  rotuloDoAtalho: () => '',
  correspondeAoAtalho: () => false,
  digitandoNumCampo: () => false,
  guardarSolturaDoBotao: () => undefined,
};

function contextoDaPagina(pagina, hostname, portas) {
  const janela = { location: { hostname, href: `https://${hostname}/watch?v=1` }, getSelection: () => null, innerHeight: 800, innerWidth: 1200, frames: [] };
  janela.top = janela;
  class RelogioDaPagina extends Date { static now() { return pagina.agora; } }
  const contexto = {
    console: { ...console, debug: () => undefined },
    document: documentoDaPagina(pagina), window: janela, navigator: {}, chrome: chromeDaPagina(pagina, portas), Date: RelogioDaPagina,
    setInterval: (funcao, ms) => pagina.intervalos.push({ funcao, ms }),
    PerpetualMiner: { Atalhos: ATALHOS_DA_PAGINA, Overlay: overlayDaPagina(pagina, portas) },
  };
  contexto.globalThis = contexto;
  vm.createContext(contexto);
  for (const arquivo of scriptsDeConteudo().filter(a => !NAO_RODAM_AQUI.includes(a))) {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, arquivo), 'utf8'), contexto, { filename: arquivo });
  }
  return contexto;
}

function montarPagina({ hostname = 'www.youtube.com', estado = null, aoMandar = () => undefined, haBotao = true, falhaNaTela = false } = {}) {
  const pagina = { segmentos: [], tocando: true, agora: INICIO, mensagens: [], avisos: [], contadores: [], intervalos: [], ouvintes: [] };
  const contexto = contextoDaPagina(pagina, hostname, { estado, aoMandar, haBotao, falhaNaTela });
  const rodar = ms => pagina.intervalos.filter(i => i.ms === ms).forEach(i => i.funcao());
  return {
    ...pagina,
    pagina,
    voz: (id, dados) => contexto.PerpetualMiner.textoDaVoz(id, dados),
    legenda: (...textos) => { pagina.segmentos = textos.map(texto => ({ innerText: texto, isConnected: true })); },
    olhar: depoisDe => { pagina.agora = INICIO + depoisDe; rodar(700); },
    selo: () => rodar(1000),
    mudarEstado: novo => pagina.ouvintes.forEach(ouvinte => ouvinte({ type: contexto.PerpetualMiner.MineracaoDoDia.MENSAGEM_ESTADO_MUDOU, state: novo })),
    candidatas: () => pagina.mensagens.filter(m => m.type === 'AUTO_MINER_CANDIDATE'),
  };
}

function estadoLigado({ en = true, ru = false, contagem = 0, limite = 20 } = {}) {
  const hoje = new Date();
  const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  return {
    settings: { en: { enabled: en, dailyLimit: limite }, ru: { enabled: ru, dailyLimit: limite } },
    daily: { date: dia, en: { count: contagem }, ru: { count: 0 } },
  };
}

const CASOS = [];
const caso = (nome, corpo) => CASOS.push([nome, corpo]);

caso('a legenda que parou por 650 ms é mandada uma vez, com o texto, a origem, o contexto e o idioma', () => {
  const p = montarPagina({ estado: estadoLigado() });
  p.legenda('He   went', 'home.');
  p.olhar(0);
  p.olhar(SILENCIO_DA_LEGENDA_MS - 1);
  assert.deepStrictEqual(p.candidatas(), []);
  p.olhar(SILENCIO_DA_LEGENDA_MS);
  const [candidata] = p.candidatas();
  assert.strictEqual(p.candidatas().length, 1);
  assert.strictEqual(candidata.texto, 'He went home.');
  assert.strictEqual(candidata.origem, 'youtube');
  assert.strictEqual(candidata.lang, 'en');
  assert.strictEqual(candidata.contexto.fonte, 'youtube');
  p.olhar(5000);
  assert.strictEqual(p.candidatas().length, 1, 'a mesma legenda não é mandada de novo');
});

caso('a legenda que muda recomeça a espera dos 650 ms', () => {
  const p = montarPagina({ estado: estadoLigado() });
  p.legenda('First line.');
  p.olhar(0);
  p.olhar(600);
  p.legenda('Second line.');
  p.olhar(700);
  p.olhar(700 + SILENCIO_DA_LEGENDA_MS - 1);
  assert.deepStrictEqual(p.candidatas(), []);
  p.olhar(700 + SILENCIO_DA_LEGENDA_MS);
  assert.deepStrictEqual(p.candidatas().map(c => c.texto), ['Second line.']);
});

caso('uma legenda que já foi mandada volta a ser mandada depois de outra', () => {
  const p = montarPagina({ estado: estadoLigado() });
  p.legenda('One.');
  p.olhar(0); p.olhar(700);
  p.legenda('Two.');
  p.olhar(800); p.olhar(1500);
  p.legenda('One.');
  p.olhar(1600); p.olhar(2300);
  assert.deepStrictEqual(p.candidatas().map(c => c.texto), ['One.', 'Two.', 'One.']);
});

caso('a legenda que some e volta igual não reinicia a espera: é mandada na primeira olhada', () => {
  const p = montarPagina({ estado: estadoLigado() });
  p.legenda('Gone.');
  p.olhar(0);
  p.legenda();
  p.olhar(1000);
  p.legenda('Gone.');
  p.olhar(1400);
  assert.deepStrictEqual(p.candidatas().map(c => c.texto), ['Gone.']);
});

caso('nada é mandado com a Mineração automática desligada, o vídeo parado, a legenda sem texto ou o limite do dia batido', () => {
  const desligada = montarPagina({ estado: estadoLigado({ en: false }) });
  desligada.legenda('Off.'); desligada.olhar(0); desligada.olhar(2000);
  const parado = montarPagina({ estado: estadoLigado() });
  parado.pagina.tocando = false;
  parado.legenda('Paused.'); parado.olhar(0); parado.olhar(2000);
  const sem = montarPagina({ estado: estadoLigado() });
  sem.legenda('  '); sem.olhar(0); sem.olhar(2000);
  const cheia = montarPagina({ estado: estadoLigado({ contagem: 20, limite: 20 }) });
  cheia.legenda('Full.'); cheia.olhar(0); cheia.olhar(2000);
  const semEstado = montarPagina({ estado: null });
  semEstado.legenda('Unknown.'); semEstado.olhar(0); semEstado.olhar(2000);
  for (const p of [desligada, parado, sem, cheia, semEstado]) assert.deepStrictEqual(p.candidatas(), []);
});

caso('a legenda em russo vai com o idioma ru', () => {
  const p = montarPagina({ estado: estadoLigado({ en: false, ru: true }) });
  p.legenda('Он ушёл домой.');
  p.olhar(0); p.olhar(700);
  assert.deepStrictEqual(p.candidatas().map(c => [c.texto, c.lang]), [['Он ушёл домой.', 'ru']]);
});

caso('a resposta saved mostra o aviso com o idioma, a conta do dia, a frase e a Palavra; skip e sem resposta não mostram', () => {
  const estado = estadoLigado({ contagem: 3 });
  const p = montarPagina({
    estado,
    aoMandar: () => ({ action: 'saved', state: estadoLigado({ contagem: 4 }), frase: { keywords: ['went', '|', 'home'] } }),
  });
  p.legenda('He went home.');
  p.olhar(0); p.olhar(700);
  assert.strictEqual(p.avisos.length, 1);
  const [aviso] = p.avisos;
  assert.deepStrictEqual(
    [aviso.tipo, aviso.icone, aviso.titulo, aviso.meta, aviso.frase, aviso.palavras, aviso.palavraDetectada, aviso.apagada],
    ['sucesso', 'automatica', p.voz('MIN-06'), 'EN 4/20', 'He went home.', ['went'], true, true],
  );
  assert.strictEqual(typeof aviso.lugar, 'undefined', 'o lugar é uma função e não atravessa o plano');

  for (const resposta of [{ action: 'skip', reason: 'known', state: estadoLigado() }, null]) {
    const outra = montarPagina({ estado, aoMandar: () => resposta });
    outra.legenda('Skip.'); outra.olhar(0); outra.olhar(700);
    assert.deepStrictEqual(outra.avisos, []);
  }
});

caso('o aviso espera o botão e não aparece por cima de uma falha', () => {
  const resposta = { action: 'saved', state: estadoLigado({ contagem: 4 }), frase: { keywords: ['went'] } };
  for (const opcoes of [{ haBotao: false }, { falhaNaTela: true }]) {
    const p = montarPagina({ estado: estadoLigado(), aoMandar: () => resposta, ...opcoes });
    p.legenda('He went home.'); p.olhar(0); p.olhar(700);
    assert.strictEqual(p.candidatas().length, 1);
    assert.deepStrictEqual(p.avisos, []);
  }
});

caso('o selo mostra a conta do dia do idioma ligado e some quando o idioma está desligado', () => {
  const p = montarPagina({ estado: estadoLigado({ contagem: 3 }) });
  p.selo();
  const ultimo = () => p.contadores[p.contadores.length - 1];
  assert.deepStrictEqual(ultimo(), {
    texto: '3/20', noLimite: false,
    descricao: p.voz('MIN-11.contador', { idioma: 'Inglês', n: 3, limite: 20 }),
    etiqueta: p.voz('MIN-11.etiqueta', { n: 3, limite: 20 }),
  });
  p.mudarEstado(estadoLigado({ contagem: 20 }));
  assert.deepStrictEqual(ultimo(), {
    texto: '20/20', noLimite: true,
    descricao: p.voz('MIN-11.noLimite', { idioma: 'Inglês' }),
    etiqueta: p.voz('MIN-11.etiquetaNoLimite'),
  });
  p.mudarEstado(estadoLigado({ en: false }));
  assert.strictEqual(ultimo(), null);
});

caso('com dois idiomas ligados o selo segue o idioma da legenda que está na tela', () => {
  const p = montarPagina({ estado: estadoLigado({ en: true, ru: true, contagem: 5 }) });
  p.selo();
  assert.strictEqual(p.contadores[p.contadores.length - 1], null, 'sem legenda e com dois idiomas, não há de qual contar');
  p.legenda('Он ушёл домой.');
  p.olhar(0);
  assert.strictEqual(p.contadores[p.contadores.length - 1].texto, '0/20');
  p.legenda('He went home.');
  p.olhar(100);
  assert.strictEqual(p.contadores[p.contadores.length - 1].texto, '5/20');
});

let falhas = 0;
for (const [nome, corpo] of CASOS) {
  try {
    corpo();
    console.log(`ok: ${nome}`);
  } catch (erro) {
    falhas++;
    console.error(`FALHOU: ${nome}\n${erro.stack}`);
  }
}
if (falhas) process.exit(1);
console.log('mineração automática na página: tudo certo');
