'use strict';

const assert = require('assert');

const { ENDERECO, comoValores, criarConexao, resposta, carregarAPagina, lerJson, igual, parear, parearComChaveGuardada } = require('./e2e/pagina-de-mentira-do-pareamento');

async function main() {
  {
    const conexao = criarConexao({ impostor: async ({ caminho }) => (caminho === '/health'
      ? resposta(200, { ok: true, versao: '0.4.25', perfil: 'X' })
      : resposta(200, { sessao: 'a'.repeat(32), prova: 'AAAA'.repeat(10) + 'AAA=' })) });
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    const antes = conexao.vistos.length;
    await assert.rejects(pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.chaveDaOpenAI('sk-proj-segredo-da-pessoa')), /não provou/);
    const depois = conexao.vistos.slice(antes);
    igual(depois.map(v => v.caminho), ['/pareamento/conferir'], 'o impostor viu o desafio e mais nada');
    assert.ok(!JSON.stringify(conexao.vistos).includes('sk-proj-segredo-da-pessoa'));
    assert.strictEqual(pagina.Pareamento.estado(), 'nao_confirmada');
  }


  {
    const conexao = criarConexao();
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    const original = conexao.fetch;
    for (const [nome, adulterar] of [
      ['sem a prova', r => new Response(r.body, { status: r.status })],
      ['com a prova de outro corpo', async r => new Response('{"ok":false}', { status: r.status, headers: r.headers })],
      ['com a prova de outro status', async r => new Response(await r.clone().text(), { status: 500, headers: r.headers })],
    ]) {
      conexao.fetch = async (url, opcoes) => {
        const r = await original(url, opcoes);
        return new URL(url).pathname === '/ia/estado' ? adulterar(r) : r;
      };
      await assert.rejects(pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.estadoDaIA()), /prova/, nome);
      assert.strictEqual(pagina.Pareamento.estado(), 'nao_confirmada', nome);
      conexao.fetch = original;
      await pagina.Pareamento.provar(ENDERECO);
    }
    assert.strictEqual(pagina.Pareamento.estado(), 'pareada');
  }


  {
    const conexao = criarConexao({ antiga: true });
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    const lida = await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.chaveDaOpenAI('sk-proj-x'));
    assert.strictEqual(pagina.PedidoAoAnki.ausenciaDaRota(lida.status), 'antiga');
    assert.ok(conexao.vistos.every(v => v.caminho === '/pareamento/conferir'), 'a Conexão antiga só viu o conferir');
    assert.strictEqual(pagina.Pareamento.estado(), 'antiga');
    for (const pedido of [pagina.PedidoAoAnki.atualizarAConexao(), pagina.PedidoAoAnki.reiniciarOAnki()]) {
      conexao.vistos.length = 0;
      assert.strictEqual((await pagina.PedidoAoAnki.pedir(ENDERECO, pedido)).status, 404);
      igual(conexao.vistos.map(v => v.caminho), ['/pareamento/conferir'], `${pedido.caminho}: a Conexão antiga só viu o conferir`);
    }
  }


  {
    const conexao = criarConexao({ antiga: true, navegadores: [] });
    const pagina = carregarAPagina(conexao);
    assert.strictEqual((await pagina.Pareamento.provar(ENDERECO)).estado, 'antiga');
    const lida = await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.chaveDaOpenAI('sk-proj-x'));
    assert.strictEqual(pagina.PedidoAoAnki.ausenciaDaRota(lida.status), 'antiga');
    igual([...new Set(conexao.vistos.map(v => v.caminho))], ['/pareamento/conferir'], 'a Conexão antiga só viu o conferir');
    assert.ok(!JSON.stringify(conexao.vistos).includes('sk-proj-x'));
  }


  {
    const conexao = criarConexao();
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.estadoDaIA());
    const antes = (await pagina.Pareamento.lerACredencial()).cliente;
    conexao.pareamento.desconectar();
    const lida = await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.estadoDaIA());
    igual([lida.status, (await lerJson(lida)).error], [401, 'pairing_required']);
    assert.strictEqual(pagina.Pareamento.estado(), 'a_parear');
    assert.strictEqual(await pagina.Pareamento.lerACredencial(), null, 'a prova da revogação apaga a credencial');
    conexao.pareamento.sortearCodigo('K7M4PX');
    await pagina.Pareamento.comecar(ENDERECO);
    igual(await pagina.Pareamento.concluir(ENDERECO, 'K7M-4PX'), { ok: true });
    assert.notStrictEqual((await pagina.Pareamento.lerACredencial()).cliente, antes, 'um navegador novo para a Conexão');
    assert.strictEqual((await pagina.Pareamento.provar(ENDERECO)).estado, 'pareada');
  }


  for (const [nome, corpo] of [
    ['sem prova', { error: 'pairing_revoked' }],
    ['com a prova de outro segredo', { error: 'pairing_revoked', prova: 'AAAA'.repeat(10) + 'AAA=' }],
  ]) {
    const conexao = criarConexao({ impostor: async ({ caminho }) => (caminho === '/health' ? resposta(200, { ok: true, versao: '9.9.9', perfil: 'X' }) : resposta(401, corpo)) });
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    assert.strictEqual((await pagina.Pareamento.provar(ENDERECO)).estado, 'nao_confirmada', nome);
    assert.ok(await pagina.Pareamento.lerACredencial(), `${nome}: a credencial fica`);
  }


  {
    const conexao = criarConexao();
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    conexao.pareamento.desconectar();
    const velha = await conexao.fetch(`${ENDERECO}/pareamento/conferir`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'chrome-extension://x' },
      body: JSON.stringify({ cliente: (await pagina.Pareamento.lerACredencial()).cliente, desafio: 'desafio-que-o-impostor-viu-0123456789' }),
    });
    const repetida = { error: 'pairing_revoked', prova: (await velha.json()).prova };
    const impostor = criarConexao({ impostor: async ({ caminho }) => (caminho === '/health' ? resposta(200, { ok: true, versao: '9.9.9', perfil: 'X' }) : resposta(401, repetida)) });
    conexao.fetch = impostor.fetch;
    assert.strictEqual((await pagina.Pareamento.provar(ENDERECO)).estado, 'nao_confirmada');
    assert.ok(await pagina.Pareamento.lerACredencial());
  }


  {
    const conexao = criarConexao();
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    const original = conexao.fetch;
    conexao.fetch = async (url, opcoes) => (new URL(url).pathname === '/ia/estado' ? resposta(401, { error: 'pairing_required' }) : original(url, opcoes));
    const lida = await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.estadoDaIA());
    assert.strictEqual(lida.status, 401);
    assert.strictEqual(pagina.Pareamento.estado(), 'nao_confirmada');
    assert.ok(await pagina.Pareamento.lerACredencial());
  }


  {
    const conexao = criarConexao({ impostor: async ({ caminho }) => (caminho === '/health' ? resposta(200, { ok: true, versao: '9.9.9', perfil: 'X' }) : resposta(401, { error: 'pairing_required' })) });
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    assert.strictEqual((await pagina.Pareamento.provar(ENDERECO)).estado, 'a_parear');
    const negada = await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.chaveDaOpenAI('sk-proj-x'));
    igual([negada.status, await lerJson(negada)], [401, { error: 'pairing_required' }]);
    igual([...new Set(conexao.vistos.map(v => v.caminho))], ['/pareamento/conferir']);
    const antes = (await pagina.Pareamento.lerACredencial()).cliente;
    const real = criarConexao({ navegadores: [] });
    conexao.fetch = real.fetch;
    real.pareamento.sortearCodigo('K7M4PX');
    await pagina.Pareamento.comecar(ENDERECO);
    igual(await pagina.Pareamento.concluir(ENDERECO, 'K7M-4PX'), { ok: true });
    assert.strictEqual((await pagina.Pareamento.lerACredencial()).cliente, antes);
    assert.deepStrictEqual([...real.pareamento.pareados().keys()], [antes]);
  }
  console.log('pareamento do anki (ataques) tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });
