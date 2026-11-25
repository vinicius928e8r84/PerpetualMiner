'use strict';

const assert = require('assert');
const { rotaComFalhasNaFrente } = require('../e2e/conexao-real');
const { NAVEGADORES, provaDaResposta } = require('../e2e/pareamento-de-teste');

const PORTA_DA_CONEXAO = 4321;
const NAVEGADOR = NAVEGADORES.primeiro;

function conexaoDeMentira(erroDoComando = null) {
  const enviados = [];
  const respostas = {
    envios: { envios: ['um envio'] }, perfis: { perfis: { aberto: 'Ana' } }, estado: { cofre: { chave: 'sk-x' } }, login: { login: 'entrando' },
  };
  return {
    porta: PORTA_DA_CONEXAO,
    enviados,
    enviar: async comando => {
      enviados.push(comando);
      const chave = Object.keys(comando).find(nome => nome in respostas);
      if (chave) return respostas[chave];
      return erroDoComando ? { erro: erroDoComando } : { ok: true };
    },
  };
}

function ankiDeMentira(frente) {
  const espelhado = [];
  return {
    espelhado,
    perdeu: 0,
    naFrente: () => frente,
    perdeuAResposta() { this.perdeu += 1; },
    espelharEnvios: envios => espelhado.push(['envios', envios]),
    espelharPerfis: perfis => espelhado.push(['perfis', perfis]),
    espelharChave: cofre => espelhado.push(['chave', cofre]),
    chatgpt: { espelhar: login => espelhado.push(['login', login]) },
  };
}

function rotaDeMentira(url, cabecalhos = {}) {
  const feitas = [];
  return {
    feitas,
    request: () => ({ url: () => url, headers: () => cabecalhos }),
    fetch: async opcoes => { feitas.push(['fetch', opcoes.url]); return { de: opcoes.url }; },
    fulfill: async opcoes => { feitas.push(['fulfill', opcoes]); },
    abort: async motivo => { feitas.push(['abort', motivo]); },
  };
}

const ENDERECO = caminho => `http://127.0.0.1:8766${caminho}`;
const NA_CONEXAO = caminho => `http://127.0.0.1:${PORTA_DA_CONEXAO}${caminho}`;
const CASOS = [];
const caso = (nome, corpo) => CASOS.push({ nome, corpo });

async function passar(frente, caminho, { cabecalhos, erroDoComando } = {}) {
  const conexao = conexaoDeMentira(erroDoComando);
  const anki = ankiDeMentira(frente);
  const rota = rotaDeMentira(ENDERECO(caminho), cabecalhos);
  await rotaComFalhasNaFrente(conexao, anki)(rota);
  return { conexao, anki, rota };
}

caso('o pedido recusado pelo fake é recusado como uma porta fechada', async () => {
  const { rota, conexao } = await passar({ recusar: true }, '/health');
  assert.deepStrictEqual(rota.feitas, [['abort', 'connectionrefused']]);
  assert.deepStrictEqual(conexao.enviados, []);
});

caso('o pedido calado nunca é respondido', async () => {
  const rota = rotaDeMentira(ENDERECO('/health'));
  let respondeu = false;
  rotaComFalhasNaFrente(conexaoDeMentira(), ankiDeMentira({ calar: true }))(rota).then(() => { respondeu = true; });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.strictEqual(respondeu, false);
  assert.deepStrictEqual(rota.feitas, []);
});

caso('um pedido sem nada na frente vai para a porta da Conexão real, sem espelhar nada', async () => {
  const { rota, anki } = await passar({}, '/health');
  assert.deepStrictEqual(rota.feitas, [['fetch', NA_CONEXAO('/health')], ['fulfill', { response: { de: NA_CONEXAO('/health') } }]]);
  assert.deepStrictEqual(anki.espelhado, []);
});

for (const [caminho, quem] of [['/anki/profile', 'perfis'], ['/anki/profile/abrir', 'perfis'], ['/ia/openai/chave', 'chave'], ['/ia/chatgpt/entrar', 'login'], ['/jobs', 'envios'], ['/jobs/apagar-frases', 'envios']]) {
  caso(`${caminho} vai à Conexão real e depois espelha ${quem} no fake`, async () => {
    const { rota, anki } = await passar({}, caminho);
    assert.deepStrictEqual(rota.feitas.map(([como]) => como), ['fetch', 'fulfill']);
    assert.strictEqual(rota.feitas[0][1], NA_CONEXAO(caminho));
    assert.deepStrictEqual(anki.espelhado.map(([nome]) => nome), [quem]);
  });
}

caso('o que o fake espelha vem do que a Conexão real respondeu aos comandos de leitura', async () => {
  const { conexao, anki } = await passar({}, '/jobs');
  assert.deepStrictEqual(conexao.enviados, [{ envios: true }]);
  assert.deepStrictEqual(anki.espelhado, [['envios', ['um envio']]]);
  const perfis = await passar({}, '/anki/profile');
  assert.deepStrictEqual([perfis.conexao.enviados, perfis.anki.espelhado], [[{ perfis: true }], [['perfis', { aberto: 'Ana' }]]]);
  const chave = await passar({}, '/ia/openai/chave');
  assert.deepStrictEqual([chave.conexao.enviados, chave.anki.espelhado], [[{ estado: true }], [['chave', { chave: 'sk-x' }]]]);
  const login = await passar({}, '/ia/chatgpt/entrar');
  assert.deepStrictEqual([login.conexao.enviados, login.anki.espelhado], [[{ login: true }], [['login', 'entrando']]]);
});

caso('com roteiro na frente o pedido não vai à Conexão real, mesmo num caminho espelhado', async () => {
  const roteiro = async () => ({ status: 201, json: { ok: 1 } });
  for (const caminho of ['/anki/profile', '/ia/openai/chave', '/ia/chatgpt/entrar', '/jobs', '/health']) {
    const { rota, anki } = await passar({ roteiro }, caminho);
    assert.deepStrictEqual(rota.feitas.map(([como]) => como), ['fulfill'], caminho);
    assert.deepStrictEqual(rota.feitas[0][1], { status: 201, contentType: 'application/json', body: '{"ok":1}', headers: {} }, caminho);
    assert.deepStrictEqual(anki.espelhado, [], caminho);
  }
});

caso('o roteiro sem status e sem json responde 200 com o objeto vazio, e recebe o pedido e o endereço', async () => {
  let recebido;
  const { rota } = await passar({ roteiro: async (req, url) => { recebido = [req.url(), url.pathname]; return {}; } }, '/x');
  assert.deepStrictEqual(rota.feitas[0][1], { status: 200, contentType: 'application/json', body: '{}', headers: {} });
  assert.deepStrictEqual(recebido, [ENDERECO('/x'), '/x']);
});

caso('o roteiro de um navegador pareado leva a prova da resposta e libera o cabeçalho dela', async () => {
  const cabecalhos = { 'x-perpetualminer-cliente': NAVEGADOR.cliente, 'x-perpetualminer-sessao': 'sessao-1', 'x-perpetualminer-nonce': 'nonce-1' };
  const { rota } = await passar({ roteiro: async () => ({ status: 202, json: { a: 1 } }) }, '/x', { cabecalhos });
  const prova = provaDaResposta(NAVEGADOR.segredo, { sessao: 'sessao-1', nonce: 'nonce-1', status: 202, corpo: Buffer.from('{"a":1}', 'utf8') });
  assert.deepStrictEqual(rota.feitas[0][1].headers, { 'X-PerpetualMiner-Prova': prova, 'Access-Control-Expose-Headers': 'X-PerpetualMiner-Prova' });
});

caso('sem a sessão, sem o nonce ou com um cliente que não é de teste o roteiro não leva prova', async () => {
  const completo = { 'x-perpetualminer-cliente': NAVEGADOR.cliente, 'x-perpetualminer-sessao': 's', 'x-perpetualminer-nonce': 'n' };
  const variantes = [{ ...completo, 'x-perpetualminer-sessao': undefined }, { ...completo, 'x-perpetualminer-nonce': undefined }, { ...completo, 'x-perpetualminer-cliente': 'outro' }];
  for (const cabecalhos of variantes) {
    const { rota } = await passar({ roteiro: async () => ({}) }, '/x', { cabecalhos });
    assert.deepStrictEqual(rota.feitas[0][1].headers, {});
  }
});

caso('o mundo e a fila que o fake mandou chegam à Conexão real antes do pedido, na ordem', async () => {
  const fila = [{ mudar: 1 }, { criar: 2 }];
  const { conexao, rota } = await passar({ mundo: { colecao: {} }, fila }, '/health');
  assert.deepStrictEqual(conexao.enviados, [{ mundo: { colecao: {} } }, { mudar: 1 }, { criar: 2 }]);
  assert.deepStrictEqual(rota.feitas.map(([como]) => como), ['fetch', 'fulfill']);
});

caso('só a fila, sem mundo, também chega antes do pedido', async () => {
  const { conexao } = await passar({ fila: [{ apagarFrases: true }] }, '/health');
  assert.deepStrictEqual(conexao.enviados, [{ apagarFrases: true }]);
});

caso('a fila que a Conexão real recusa derruba o pedido com o erro dela', async () => {
  await assert.rejects(
    passar({ fila: [{ mudar: 1 }] }, '/health', { erroDoComando: 'transição inválida' }),
    /A fila da Conexão real recusou o que o fake fez com o Envio: transição inválida/,
  );
});

caso('a resposta perdida avisa o fake e, num Envio, a Conexão real responde e a resposta cai (depois de espelhar)', async () => {
  const fora = await passar({ perder: true }, '/health');
  assert.strictEqual(fora.anki.perdeu, 1);
  assert.deepStrictEqual(fora.rota.feitas.map(([como]) => como), ['fetch', 'fulfill']);
  const envio = await passar({ perder: true }, '/jobs');
  assert.strictEqual(envio.anki.perdeu, 1);
  assert.deepStrictEqual(envio.rota.feitas, [['fetch', NA_CONEXAO('/jobs')], ['abort', 'connectionreset']]);
  assert.deepStrictEqual(envio.anki.espelhado, [['envios', ['um envio']]]);
});

caso('a página que fecha no meio não derruba o teste, e qualquer outro erro derruba', async () => {
  for (const mensagem of ['Target page closed', 'Browser has been disposed', 'request aborted']) {
    const rota = rotaDeMentira(ENDERECO('/health'));
    rota.fetch = async () => { throw new Error(mensagem); };
    await rotaComFalhasNaFrente(conexaoDeMentira(), ankiDeMentira({}))(rota);
    const roteirada = rotaDeMentira(ENDERECO('/x'));
    roteirada.fulfill = async () => { throw new Error(mensagem); };
    assert.strictEqual(await rotaComFalhasNaFrente(conexaoDeMentira(), ankiDeMentira({ roteiro: async () => ({}) }))(roteirada), undefined);
  }
  const quebrada = rotaDeMentira(ENDERECO('/health'));
  quebrada.fetch = async () => { throw new Error('boom'); };
  await assert.rejects(rotaComFalhasNaFrente(conexaoDeMentira(), ankiDeMentira({}))(quebrada), /boom/);
  const roteirada = rotaDeMentira(ENDERECO('/x'));
  roteirada.fulfill = async () => { throw new Error('boom'); };
  await assert.rejects(rotaComFalhasNaFrente(conexaoDeMentira(), ankiDeMentira({ roteiro: async () => ({}) }))(roteirada), /boom/);
});

(async () => {
  for (const { nome, corpo } of CASOS) {
    try {
      await corpo();
    } catch (erro) {
      console.error(`falhou: ${nome}`);
      throw erro;
    }
  }
  console.log(`test_conexao_real_rota: ${CASOS.length} casos ok`);
})().catch(erro => { console.error(erro); process.exit(1); });
