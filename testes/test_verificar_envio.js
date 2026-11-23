'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { AsyncLocalStorage, AsyncResource } = require('async_hooks');

const RAIZ = path.join(__dirname, '..');
const CHAVE = 'pm_envio';
const copia = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
Error.stackTraceLimit = 50;

const TRANCA_NO_MUDAR = {
  'lib/envio-gravado.js': [[
    "      const depois = proximo(await ler(), { tipo, envios });\n      if (seAinda && !seAinda()) return;\n      if (depois) await storage.set({ [CHAVE]: depois });\n      else await storage.remove(CHAVE);\n",
    "      return globalThis.navigator.locks.request('pm-envio', async () => {\n      const depois = proximo(await ler(), { tipo, envios });\n      if (seAinda && !seAinda()) return;\n      if (depois) await storage.set({ [CHAVE]: depois });\n      else await storage.remove(CHAVE);\n      });\n",
  ]],
};
const ESQUECER_SOLTA_A_MARCA = {
  'lib/envio-gravado.js': [["const esquecer = gravado => (apagarFrasesMarcado(gravado) ? soAMarca() : null);", "const esquecer = () => null;"]],
};
const APAGAR_TUDO_SEM_A_MARCA = {
  'lib/envio-gravado.js': [["[EVENTO.APAGAR_TUDO, soAMarca],", "[EVENTO.APAGAR_TUDO, () => ({ envios: [] })],"]],
};
const CONFIRMOU_ESQUECE_OS_ENVIOS = {
  'lib/envio-gravado.js': [["const confirmou = gravado => (gravado?.envios?.length ? { envios: gravado.envios } : null);", "const confirmou = () => null;"]],
};
const juntar = (...trocas) => {
  const todas = {};
  for (const t of trocas) for (const [arquivo, lista] of Object.entries(t)) todas[arquivo] = [...(todas[arquivo] || []), ...lista];
  return todas;
};

function compilador(trocas) {
  const cache = new Map();
  return arquivo => {
    if (!cache.has(arquivo)) {
      let texto = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
      for (const [de, para] of trocas[arquivo] || []) {
        assert.strictEqual(texto.split(de).length - 1, 1, `a troca não casa uma vez em ${arquivo}: ${de.slice(0, 60)}`);
        texto = texto.replace(de, para);
      }
      cache.set(arquivo, { linhas: texto.split('\n'), script: new vm.Script(texto, { filename: arquivo }) });
    }
    return cache.get(arquivo);
  };
}

const ator = new AsyncLocalStorage();
const ehDoCodigoAlvo = arquivo => arquivo.startsWith('lib/') || arquivo === 'painel/painel-envio-apagar.js';

function chamador() {
  for (const linha of new Error().stack.split('\n').slice(2)) {
    const m = linha.match(/\(?((?:lib\/)?[\w.-]+\.js):(\d+):\d+\)?$/);
    if (m && ehDoCodigoAlvo(m[1])) return `${m[1]}:${m[2]}`;
  }
  return '?';
}

function novoMundo(escolhas, fonte) {
  const mundo = { dados: {}, pendentes: [], rastro: [], decisoes: [], posts: [], marcas: [], passos: 0 };
  mundo.passo = (o_que, efeito) => new Promise(resolve => {
    mundo.pendentes.push({ quem: ator.getStore() || '?', o_que, onde: chamador(), executar() { resolve(efeito(this.quem)); } });
  });
  mundo.escolher = () => {
    const d = mundo.decisoes.length;
    const i = d < escolhas.length ? escolhas[d] : 0;
    mundo.decisoes.push({ n: mundo.pendentes.length, i });
    return mundo.pendentes.splice(i, 1)[0];
  };
  mundo.fonte = fonte;
  return mundo;
}

const ehObjeto = c => c !== null && typeof c === 'object';

function pedidoTocaOEnvio(c) {
  if (c === CHAVE) return true;
  if (Array.isArray(c)) return c.includes(CHAVE);
  return ehObjeto(c) && CHAVE in c;
}

const valorGuardadoOuPadrao = (mundo, c, padrao) => copia(c in mundo.dados ? mundo.dados[c] : padrao);
const lerDoMundo = (mundo, pedido) => Object.fromEntries(Object.entries(pedido).map(([c, p]) => [c, valorGuardadoOuPadrao(mundo, c, p)]));

function anotarAPrimeiraMarca(mundo, quem, valor) {
  if (!mundo.marcadores.has(quem) || !valor?.apagarFrases) return;
  if (mundo.marcas.some(m => m.quem === quem)) return;
  mundo.marcas.push({ quem, depoisDoPasso: mundo.passos });
}

function gravarNoMundo(mundo, quem, valor) {
  mundo.passos += 1;
  anotarAPrimeiraMarca(mundo, quem, valor);
  mundo.dados[CHAVE] = copia(valor);
}

function armazenamento(mundo) {
  return {
    get: pedido => mundo.passo('lê pm_envio', () => lerDoMundo(mundo, pedidoTocaOEnvio(pedido) ? pedido : {})),
    set: valores => mundo.passo(`grava pm_envio ${JSON.stringify(valores[CHAVE])}`, quem => gravarNoMundo(mundo, quem, valores[CHAVE])),
    remove: () => mundo.passo('remove pm_envio', () => { mundo.passos += 1; delete mundo.dados[CHAVE]; }),
  };
}

function trancas(mundo) {
  const filas = new Map();
  function conceder(nome) {
    const fila = filas.get(nome);
    const vez = fila[0];
    Promise.resolve().then(vez.fazer).then(
      r => { fila.shift(); vez.ok(r); if (fila.length) conceder(nome); },
      e => { fila.shift(); vez.falha(e); if (fila.length) conceder(nome); });
  }
  return {
    request(nome, ...resto) {
      const fazer = AsyncResource.bind(resto.at(-1));
      return new Promise((ok, falha) => mundo.passo('pede a tranca', () => {
        if (!filas.has(nome)) filas.set(nome, []);
        filas.get(nome).push({ fazer, ok, falha });
        if (filas.get(nome).length === 1) conceder(nome);
      }));
    },
  };
}

function contexto(mundo, locks, arquivos) {
  const ctx = {
    console, Promise, setTimeout: () => 0, clearTimeout() {},
    navigator: { locks },
    chrome: {
      storage: { local: armazenamento(mundo) },
      alarms: { get: async () => null, create: async () => {}, clear: async () => {} },
    },
  };
  ctx.globalThis = ctx;
  ctx.PerpetualMiner = {
    ConversaComOAnki: {
      pedir: pedido => mundo.passo('POST /jobs/apagar-frases chega', quem => {
        mundo.passos += 1;
        mundo.posts.push({ aposOPasso: mundo.passos, de: quem });
        return { ok: true };
      }).then(r => { assert.strictEqual(pedido.rota, 'apagar-frases'); return r; }),
    },
    PedidoAoAnki: { apagarFrasesDosEnvios: () => ({ rota: 'apagar-frases' }) },
  };
  vm.createContext(ctx);
  for (const a of arquivos) mundo.fonte(a).script.runInContext(ctx);
  return ctx;
}

const quieto = async () => { for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r)); };

const ENVIO_E1 = { id: 'e1', jobId: 'e1', lang: 'en', ids: [1] };
const ENVIO_E2 = { id: 'e2', jobId: 'e2', lang: 'en', ids: [2] };

const aba = (nome, acoes) => ({ nome, marca: acoes.some(a => a.tipo === 'apagarTudo'), acoes, arquivos: ['lib/envio-gravado.js', 'painel/painel-envio-apagar.js'] });
const worker = (nome, acoes) => ({ nome, marca: false, acoes, arquivos: ['lib/envio-gravado.js', 'lib/apagar-frases-pendente.js'] });
const acompanhar = envios => ({ tipo: 'acompanhar', envios });
const esquecer = { tipo: 'esquecer' };
const apagarTudo = { tipo: 'apagarTudo' };
const pedir = { tipo: 'pedir' };
const alarme = { tipo: 'alarme' };

const mudarOGravado = (ctx, evento, dados) => {
  const { EnvioGravado } = ctx.PerpetualMiner;
  return EnvioGravado.criar(ctx.chrome.storage.local).mudar(EnvioGravado.EVENTO[evento], dados);
};

const FAZER = {
  acompanhar: (ctx, a) => mudarOGravado(ctx, 'ACOMPANHAR', { envios: a.envios, seAinda: () => true }),
  esquecer: ctx => mudarOGravado(ctx, 'ESQUECER'),
  apagarTudo: ctx => mudarOGravado(ctx, 'APAGAR_TUDO'),
  pedir: ctx => ctx.PerpetualMiner.EnvioApagarFrases.pedir(),
  alarme: ctx => ctx.PerpetualMiner.ApagarFrasesPendente
    .criar({ chrome: ctx.chrome, conversa: ctx.PerpetualMiner.ConversaComOAnki }).conferir(),
};

const confirmarSeMarcado = (s, _a, E) => (s?.apagarFrases ? E.proximo(s, { tipo: E.EVENTO.CONFIRMOU }) : s);

const SERIAL = {
  acompanhar: (s, a, E) => E.proximo(s, { tipo: E.EVENTO.ACOMPANHAR, envios: a.envios }),
  esquecer: (s, _a, E) => E.proximo(s, { tipo: E.EVENTO.ESQUECER }),
  apagarTudo: (s, _a, E) => E.proximo(s, { tipo: E.EVENTO.APAGAR_TUDO }),
  pedir: confirmarSeMarcado,
  alarme: confirmarSeMarcado,
};

async function executar(cenario, escolhas, fonte) {
  const mundo = novoMundo(escolhas, fonte);
  mundo.marcadores = new Set(cenario.atores.filter(a => a.marca).map(a => a.nome));
  if (cenario.inicio !== undefined) mundo.dados[CHAVE] = copia(cenario.inicio);
  const locks = trancas(mundo);
  const contextos = cenario.atores.map(a => ({ a, ctx: contexto(mundo, locks, a.arquivos) }));
  await quieto();
  mundo.pendentes.length = 0;
  const fim = new Map();
  const rodando = contextos.map(({ a, ctx }) => ator.run(a.nome, async () => {
    try {
      for (const acao of a.acoes) await FAZER[acao.tipo](ctx, acao);
      fim.set(a.nome, {});
    } catch (e) {
      fim.set(a.nome, { erro: String(e?.stack || e) });
    }
  }));
  for (;;) {
    await quieto();
    if (mundo.pendentes.length === 0) break;
    const p = mundo.escolher();
    mundo.rastro.push(`${p.quem.padEnd(10)} ${p.o_que.padEnd(40)} ${p.onde}`);
    p.executar();
  }
  const parados = cenario.atores.filter(a => !fim.has(a.nome)).map(a => a.nome);
  await Promise.race([Promise.all(rodando), quieto()]);
  return { mundo, fim, parados };
}

function errosDosAtores({ fim, parados }) {
  const erros = parados.length ? [`impasse: ${parados.join(', ')} não terminou`] : [];
  for (const [nome, { erro }] of fim) if (erro) erros.push(`falha: ${nome}: ${erro.split('\n')[0]}`);
  return erros;
}

const semAPrimeira = (restos, i) => restos.map((t, j) => (j === i ? t.slice(1) : t));

function intercalar(restos, prefixo, ordens) {
  if (restos.every(r => r.length === 0)) {
    ordens.push(prefixo);
    return ordens;
  }
  restos.forEach((r, i) => r.length && intercalar(semAPrimeira(restos, i), [...prefixo, r[0]], ordens));
  return ordens;
}

function estadosEmSerie(cenario, E) {
  const ordens = intercalar(cenario.atores.map(a => a.acoes), [], []);
  const emSerie = ordem => ordem.reduce((s, acao) => SERIAL[acao.tipo](s, acao, E), copia(cenario.inicio ?? null)) ?? null;
  return new Set(ordens.map(ordem => JSON.stringify(emSerie(ordem))));
}

function errosDoEstado(cenario, final, E) {
  const possiveis = estadosEmSerie(cenario, E);
  if (possiveis.has(JSON.stringify(final))) return [];
  return [`estado: o pm_envio final ${JSON.stringify(final)} não é o de nenhuma ordem em série (por exemplo ${[...possiveis][0]})`];
}

const chegouUmPostDepois = (mundo, passo) => mundo.posts.some(p => p.aposOPasso > passo);

function marcasPerdidas(mundo, final) {
  if (final?.apagarFrases) return [];
  return mundo.marcas.filter(({ depoisDoPasso }) => !chegouUmPostDepois(mundo, depoisDoPasso))
    .map(({ quem }) => `marca perdida: o Apagar tudo de ${quem} marcou o pm_envio, e a marca não está no fim nem chegou um POST /jobs/apagar-frases depois dela`);
}

function conferir(cenario, execucao, E) {
  const final = copia(execucao.mundo.dados[CHAVE] ?? null);
  return [...errosDosAtores(execucao), ...errosDoEstado(cenario, final, E), ...marcasPerdidas(execucao.mundo, final)];
}

async function explorar(cenario, fonte, E, { um = false } = {}) {
  let escolhas = [];
  let ordens = 0;
  const falhas = [];
  for (;;) {
    const execucao = await executar(cenario, escolhas, fonte);
    ordens++;
    const erros = conferir(cenario, execucao, E);
    if (erros.length) {
      falhas.push({ erros, rastro: execucao.mundo.rastro });
      if (um) break;
    }
    const d = execucao.mundo.decisoes;
    let k = d.length - 1;
    while (k >= 0 && d[k].i + 1 >= d[k].n) k--;
    if (k < 0) break;
    escolhas = [...d.slice(0, k).map(x => x.i), d[k].i + 1];
  }
  return { ordens, falhas };
}

const CENARIOS = [
  { nome: 'duas-abas-acompanhar-e-apagar-tudo', inicio: { envios: [ENVIO_E1] },
    atores: [aba('aba A', [acompanhar([ENVIO_E1])]), aba('aba B', [apagarTudo, pedir])] },
  { nome: 'aba-esquece-e-outra-apaga-tudo', inicio: { envios: [ENVIO_E1] },
    atores: [aba('aba A', [esquecer]), aba('aba B', [apagarTudo, pedir])] },
  { nome: 'apagar-tudo-e-o-alarme-do-service-worker', inicio: { envios: [ENVIO_E1] },
    atores: [aba('aba B', [apagarTudo, pedir]), worker('SW', [alarme])] },
  { nome: 'dois-apagar-tudo', inicio: { envios: [ENVIO_E1, ENVIO_E2] },
    atores: [aba('aba A', [apagarTudo, pedir]), aba('aba B', [apagarTudo, pedir])] },
  { nome: 'acompanhar-apagar-tudo-e-o-alarme', inicio: { envios: [ENVIO_E1] },
    atores: [aba('aba A', [acompanhar([ENVIO_E1])]), aba('aba B', [apagarTudo]), worker('SW', [alarme])] },
  { nome: 'acompanhar-durante-o-alarme-com-marca', inicio: { envios: [], apagarFrases: true },
    atores: [aba('aba A', [acompanhar([ENVIO_E1])]), worker('SW', [alarme])] },
  { nome: 'acompanhar-esquecer-e-apagar-tudo', inicio: null,
    atores: [aba('aba A', [acompanhar([ENVIO_E1]), esquecer]), aba('aba B', [apagarTudo, pedir])] },
];

function ligacoesDoPainelContinuamAsMesmas() {
  const painel = fs.readFileSync(path.join(RAIZ, 'painel/painel-envio.js'), 'utf8');
  for (const trecho of [
    'gravado.mudar(EnvioGravado.EVENTO.ACOMPANHAR, { envios, seAinda: () => remessa === aRemessa })',
    'await gravado.mudar(EnvioGravado.EVENTO.APAGAR_TUDO);\n    return EnvioApagarFrases.pedir();',
    'return gravado.mudar(EnvioGravado.EVENTO.ESQUECER);',
    'if (situacao !== CONEXAO.DESLIGADA) EnvioApagarFrases.pedir();',
  ]) {
    assert.ok(painel.includes(trecho), `painel/painel-envio.js mudou o que o explorador copia dele: ${trecho}`);
  }
}

async function rodar(trocas, E, so) {
  const fonte = compilador(trocas);
  const resultado = [];
  for (const cenario of CENARIOS.filter(c => !so || so.includes(c.nome))) {
    const { ordens, falhas } = await explorar(cenario, fonte, E, { um: Boolean(so) });
    resultado.push({ cenario: cenario.nome, ordens, falhas });
  }
  return { resultado };
}

const HOJE = {
  'duas-abas-acompanhar-e-apagar-tudo': '28 ordens, 6 com contraexemplo, estado + marca perdida',
  'aba-esquece-e-outra-apaga-tudo': '28 ordens, 6 com contraexemplo, estado + marca perdida',
  'apagar-tudo-e-o-alarme-do-service-worker': '72 ordens, 0 com contraexemplo, nenhum',
  'dois-apagar-tudo': '924 ordens, 22 com contraexemplo, marca perdida',
  'acompanhar-apagar-tudo-e-o-alarme': '48 ordens, 8 com contraexemplo, marca perdida',
  'acompanhar-durante-o-alarme-com-marca': '15 ordens, 8 com contraexemplo, estado',
  'acompanhar-esquecer-e-apagar-tudo': '186 ordens, 72 com contraexemplo, estado + marca perdida',
};
const tipos = falhas => new Set(falhas.flatMap(f => f.erros.map(e => e.split(':')[0])));

async function principal() {
  ligacoesDoPainelContinuamAsMesmas();
  const base = {};
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, 'lib/envio-gravado.js'), 'utf8'), { globalThis: base, Object, Boolean }, { filename: 'lib/envio-gravado.js' });
  const E = base.PerpetualMiner.EnvioGravado;
  const casos = [];
  const caso = (nome, f) => casos.push({ nome, f });

  const sem = (resultado, cenario) => resultado.find(r => r.cenario === cenario);
  const relato = resultado => resultado.filter(r => r.falhas.length).map(r => `${r.cenario}\n${r.falhas[0].rastro.join('\n')}\n${r.falhas[0].erros.join('\n')}`).join('\n');

  caso('no codigo de hoje o pm_envio perde a marca do Apagar tudo ou a traz de volta quando outra aba grava ao mesmo tempo', async () => {
    const { resultado } = await rodar({}, E);
    const visto = Object.fromEntries(resultado.map(r => [r.cenario, `${r.ordens} ordens, ${r.falhas.length} com contraexemplo, ${[...tipos(r.falhas)].sort().join(' + ') || 'nenhum'}`]));
    assert.deepStrictEqual(visto, HOJE, `o que o explorador vê no pm_envio mudou; se o conserto entrou, atualize HOJE; se não, é uma quebra:\n${relato(resultado)}`);
  });

  caso('com o mudar atras de uma tranca so resta a confirmacao que apaga a marca de um segundo Apagar tudo', async () => {
    const { resultado } = await rodar(TRANCA_NO_MUDAR, E);
    const ruins = resultado.filter(r => r.falhas.length);
    assert.deepStrictEqual(ruins.map(r => r.cenario), ['dois-apagar-tudo'], relato(resultado));
    assert.deepStrictEqual([...tipos(ruins[0].falhas)], ['marca perdida']);
    assert.ok(resultado.every(r => r.ordens > 1), 'o explorador não tentou mais de uma ordem');
  });

  const QUEBRAS = [
    ['o Esquecer solta a marca', ESQUECER_SOLTA_A_MARCA, 'aba-esquece-e-outra-apaga-tudo'],
    ['o Apagar tudo não grava a marca', APAGAR_TUDO_SEM_A_MARCA, 'duas-abas-acompanhar-e-apagar-tudo'],
    ['o resumo confirmado esquece os Envios acompanhados', CONFIRMOU_ESQUECE_OS_ENVIOS, 'acompanhar-durante-o-alarme-com-marca'],
  ];
  for (const [quebra, trocas, cenario] of QUEBRAS) {
    caso(`a quebra de proposito em que ${quebra} falha com a tranca no lugar (${cenario})`, async () => {
      const { resultado } = await rodar(juntar(TRANCA_NO_MUDAR, trocas), E, [cenario]);
      assert.ok(sem(resultado, cenario).falhas.length > 0, `nenhum contraexemplo para: ${quebra}`);
    });
  }

  let falhas = 0;
  for (const { nome, f } of casos) {
    const inicio = Date.now();
    try {
      await f();
      console.log(`ok  ${nome} (${Date.now() - inicio} ms)`);
    } catch (erro) {
      falhas++;
      console.log(`FALHOU  ${nome}\n${erro.message}`);
    }
  }
  if (falhas) process.exit(1);
  console.log('test_verificar_envio.js: tudo certo');
}

if (require.main === module) principal();

