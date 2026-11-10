'use strict';

// O pareamento visto da extensão diante de quem não é a Conexão (#192): o impostor na porta, a resposta sem prova ou com a prova de outra coisa, a Conexão de antes do pareamento e
// o Desconectar (um 401 sem prova também é o que um impostor responde, então quem já estava pareado não é levado a parear de novo sozinho). O apoio e o caminho feliz estão em
// `e2e/pagina-de-mentira-do-pareamento.js` e `test_pareamento_do_anki.js`.

const assert = require('assert');

const { ENDERECO, comoValores, criarConexao, resposta, carregarAPagina, lerJson, igual, parear, parearComChaveGuardada } = require('./e2e/pagina-de-mentira-do-pareamento');

async function main() {
  // O impostor na porta: responde a saúde e o `conferir` com o que quiser. A extensão não manda nada privado e passa a dizer "não confirmada".
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


  // O impostor prova a primeira vez e some: a resposta dele a um pedido assinado não tem a prova certa, e não vira dado.
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
      await pagina.Pareamento.provar(ENDERECO, { fresco: true });   // a Conexão de verdade volta e prova
    }
    assert.strictEqual(pagina.Pareamento.estado(), 'pareada');
  }


  // Conexão antiga (404 no `conferir`): nada privado sai e a tela lê "atualize".
  {
    const conexao = criarConexao({ antiga: true });
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    const lida = await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.chaveDaOpenAI('sk-proj-x'));
    assert.strictEqual(pagina.PedidoAoAnki.ausenciaDaRota(lida.status), 'antiga');
    assert.ok(conexao.vistos.every(v => v.caminho === '/pareamento/conferir'), 'a Conexão antiga só viu o conferir');
    assert.strictEqual(pagina.Pareamento.estado(), 'antiga');
    // O único pedido que sai para ela é o que a tira dela, sem assinatura e sem dado: Atualizar agora e Reiniciar o Anki.
    for (const pedido of [pagina.PedidoAoAnki.atualizarAConexao(), pagina.PedidoAoAnki.reiniciarOAnki()]) {
      conexao.vistos.length = 0;
      const atualizada = await pagina.PedidoAoAnki.pedir(ENDERECO, pedido);
      assert.strictEqual(atualizada.status, 200);
      igual(conexao.vistos.map(v => [v.caminho, v.corpo, 'x-perpetualminer-assinatura' in v.cabecalhos]).filter(([c]) => c.startsWith('/atualizacao')), [[pedido.caminho, '{}', false]]);
    }
  }


  // "Desconectar navegadores" no Anki: a Conexão não conhece mais o navegador. Um 401 sem prova também é o que um impostor responde, então quem já estava pareado
  // **não** é levado a parear de novo sozinho: a tela diz que a porta não se confirmou, e a credencial não se apaga por isso.
  {
    const conexao = criarConexao();
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.estadoDaIA());   // a sessão está provada
    conexao.pareamento.desconectar();
    const lida = await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.estadoDaIA(), {});
    igual([lida.status, (await lerJson(lida)).error], [401, 'pairing_required']);
    assert.strictEqual(pagina.Pareamento.estado(), 'nao_confirmada');
    assert.ok(await pagina.Pareamento.lerACredencial(), 'um 401 sem prova não desfaz o pareamento: só um pareamento novo o substitui');
    assert.strictEqual((await pagina.Pareamento.provar(ENDERECO, { fresco: true })).estado, 'nao_confirmada', 'o conferir também: sem prova, nada de parear sozinho');
    await assert.rejects(pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.estadoDaIA()), /não provou/);   // e nenhum pedido privado sai
  }


  // O impostor que responde 401 `pairing_required` a quem já está pareado: o mesmo, e nada além do desafio chega a ele.
  {
    const conexao = criarConexao({ impostor: async ({ caminho }) => (caminho === '/health' ? resposta(200, { ok: true, versao: '9.9.9', perfil: 'X' }) : resposta(401, { error: 'pairing_required' })) });
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    assert.strictEqual((await pagina.Pareamento.provar(ENDERECO, { fresco: true })).estado, 'nao_confirmada');
    await assert.rejects(pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.chaveDaOpenAI('sk-proj-x')), /não provou/);
    igual([...new Set(conexao.vistos.map(v => v.caminho))], ['/pareamento/conferir']);
    // Parear de novo, por escolha da pessoa, substitui a linha do mesmo navegador (o mesmo `cliente`).
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
