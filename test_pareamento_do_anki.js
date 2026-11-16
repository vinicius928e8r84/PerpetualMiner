'use strict';

const assert = require('assert');
const { webcrypto } = require('crypto');

const { NAVEGADORES, assinaturaDoPedido, provaDaRevogacao } = require('./e2e/pareamento-de-teste');
const contrato = require('./complemento/contrato/carregar');
const { ENDERECO, comoValores, criarConexao, resposta, carregarAPagina, lerJson, igual, parear, parearComChaveGuardada } = require('./e2e/pagina-de-mentira-do-pareamento');

async function main() {
  {
    const vetor = contrato.vetorDeAssinatura;
    const chave = await webcrypto.subtle.importKey('raw', Buffer.from(vetor.segredo, 'base64'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const { Pareamento } = carregarAPagina(criarConexao());
    const feita = await Pareamento.contas.assinaturaDoPedido(chave, { sessao: vetor.sessao, nonce: vetor.nonce, metodo: vetor.metodo, caminho: vetor.caminho, corpo: new TextEncoder().encode(vetor.corpo) });
    assert.strictEqual(feita, vetor.assinatura, 'a extensão assina como o complemento');
    assert.strictEqual(assinaturaDoPedido(vetor.segredo, { sessao: vetor.sessao, nonce: vetor.nonce, metodo: vetor.metodo, caminho: vetor.caminho, corpo: vetor.corpo }), vetor.assinatura, 'o fake do e2e assina como o complemento');
    const revogacao = contrato.vetorDaRevogacao;
    const chaveRevogada = await webcrypto.subtle.importKey('raw', Buffer.from(revogacao.segredo, 'base64'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    assert.strictEqual(await Pareamento.contas.provaDaRevogacao(chaveRevogada, revogacao.desafio), revogacao.prova, 'a extensão confere a prova da revogação como o complemento a dá');
    assert.strictEqual(provaDaRevogacao(revogacao.segredo, revogacao.desafio), revogacao.prova, 'o fake do e2e a dá como o complemento');
  }


  {
    const conexao = criarConexao({ navegadores: [] });
    const pagina = carregarAPagina(conexao);
    const lida = await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.estadoDaIA());
    igual([lida.status, await lerJson(lida)], [401, { error: 'pairing_required' }]);
    igual(conexao.vistos.map(v => v.caminho), ['/pareamento/conferir'], 'sem credencial a Conexão só vê o conferir, de um cliente que ninguém tem, e nenhum cabeçalho de assinatura');
    assert.ok(!Object.keys(conexao.vistos[0].cabecalhos).some(nome => nome.startsWith('x-perpetualminer')));
    assert.strictEqual(pagina.Pareamento.estado(), 'a_parear');
    const saude = await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.saude());
    assert.strictEqual(saude.status, 200, 'a saúde segue aberta');
  }


  {
    const conexao = criarConexao({ navegadores: [] });
    const pagina = carregarAPagina(conexao);
    conexao.pareamento.sortearCodigo('K7M4PX');
    igual(await pagina.Pareamento.comecar(ENDERECO), { ok: true });
    assert.strictEqual(conexao.pareamento.codigoNoAnki(), 'K7M-4PX');
    igual(await pagina.Pareamento.concluir(ENDERECO, 'AAA-AAA'), { erro: 'errado', restam: 4 });
    assert.strictEqual(await pagina.Pareamento.lerACredencial(), null, 'o código errado não guarda nada');
    igual(await pagina.Pareamento.concluir(ENDERECO, 'k7m 4px'), { ok: true });
    const credencial = await pagina.Pareamento.lerACredencial();
    assert.strictEqual(credencial.chave.extractable, false, 'nem o código da extensão lê os bytes do segredo');
    await assert.rejects(webcrypto.subtle.exportKey('raw', credencial.chave));
    assert.strictEqual(conexao.pareamento.pareados().size, 1);
    const lida = await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.estadoDaIA());
    igual([lida.status, await lerJson(lida)], [200, { ok: true, caminho: '/ia/estado' }]);
    const privado = conexao.vistos.at(-1);
    assert.ok(privado.cabecalhos['x-perpetualminer-assinatura'] && privado.cabecalhos['x-perpetualminer-nonce'], 'o pedido privado vai assinado');
    assert.strictEqual(pagina.Pareamento.estado(), 'pareada');
    const vezesQueOSegredoSaiu = conexao.vistos.filter(v => JSON.stringify(v).includes(conexao.pareamento.pareados().values().next().value)).length;
    assert.strictEqual(vezesQueOSegredoSaiu, 0, 'a extensão nunca manda o segredo');
  }


  {
    const conexao = criarConexao({ navegadores: [] });
    const pagina = carregarAPagina(conexao);
    conexao.pareamento.sortearCodigo('K7M4PX');
    await pagina.Pareamento.comecar(ENDERECO);
    const original = conexao.fetch;
    let perdeu = false;
    conexao.fetch = async (url, opcoes) => {
      const r = await original(url, opcoes);
      if (!perdeu && new URL(url).pathname === '/pareamento/concluir') { perdeu = true; throw new TypeError('Failed to fetch'); }
      return r;
    };
    igual(await pagina.Pareamento.concluir(ENDERECO, 'K7M-4PX'), { erro: 'falhou' });
    igual(await pagina.Pareamento.concluir(ENDERECO, 'K7M-4PX'), { ok: true });
    assert.strictEqual(conexao.pareamento.pareados().size, 1, 'um navegador só: o cliente da segunda tentativa foi o mesmo');
  }


  {
    const conexao = criarConexao({ navegadores: [] });
    const pagina = carregarAPagina(conexao);
    await pagina.Pareamento.comecar(ENDERECO);
    conexao.pareamento.vencerOCodigo();
    igual(await pagina.Pareamento.concluir(ENDERECO, 'K7M-4PX'), { erro: 'venceu' });
  }


  {
    const conexao = criarConexao();
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    const antiga = criarConexao();
    const nova = criarConexao();
    let provouNaAntiga = false;
    conexao.fetch = (url, opcoes) => {
      const ehConferir = new URL(url).pathname === '/pareamento/conferir';
      if (ehConferir && !provouNaAntiga) {
        provouNaAntiga = true;
        return antiga.fetch(url, opcoes);
      }
      return nova.fetch(url, opcoes);
    };
    const lida = await pagina.PedidoAoAnki.pedir(ENDERECO, pagina.PedidoAoAnki.estadoDaIA());
    assert.strictEqual(lida.status, 200);
    igual(nova.vistos.map(v => v.caminho), ['/ia/estado', '/pareamento/conferir', '/ia/estado'], 'session_expired, conferir e o pedido de novo');
  }


  {
    const conexao = criarConexao();
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    const conferencias = () => conexao.vistos.filter(v => v.caminho === '/pareamento/conferir').length;
    for (const pedido of [pagina.PedidoAoAnki.estadoDaIA(), pagina.PedidoAoAnki.estadoDaIA(), pagina.PedidoAoAnki.chaveDaOpenAI('sk-proj-x')]) {
      const antes = conferencias();
      await pagina.PedidoAoAnki.pedir(ENDERECO, pedido);
      assert.strictEqual(conferencias(), antes + 1, `${pedido.caminho}: um conferir novo antes do pedido`);
    }
  }


  {
    const conexao = criarConexao({ navegadores: [] });
    const paginaA = carregarAPagina(conexao);
    igual(await parear(paginaA, conexao), { ok: true });
    const paginaB = carregarAPagina(conexao, paginaA.indexedDB);
    const lida = await paginaB.PedidoAoAnki.pedir(ENDERECO, paginaB.PedidoAoAnki.estadoDaIA());
    assert.strictEqual(lida.status, 200);
  }


  {
    const conexao = criarConexao();
    const pagina = carregarAPagina(conexao);
    await parearComChaveGuardada(pagina);
    const CHAVE = contrato.exemplos.find(e => e.pedido.caminho === '/ia/openai/chave').pedido.corpo.chave;
    const ENVIO = contrato.exemplos.find(e => e.daExtensao && e.pedido.caminho === '/jobs').pedido.corpo;
    const variantes = pagina.Variantes.variantes([{ deckName: 'Inglês', lang: 'en' }, { deckName: 'Alemão', lang: 'ru' }], CHAVE, ENVIO);
    assert.ok(variantes.length > 40);
    for (const { nome, pedido } of variantes) {
      conexao.vistos.length = 0;
      await pagina.PedidoAoAnki.pedir(ENDERECO, pedido);
      const enviado = conexao.vistos.at(-1);
      const aberto = (pedido.metodo === 'GET' && pedido.caminho === '/health') || pedido.caminho.startsWith('/pareamento/');
      assert.strictEqual(Boolean(enviado.cabecalhos['x-perpetualminer-assinatura']), !aberto, `${nome}: ${aberto ? 'o pedido aberto não leva assinatura' : 'o pedido privado vai assinado'}`);
    }
  }

  assert.ok(NAVEGADORES.primeiro && NAVEGADORES.segundo);
  console.log('pareamento do anki tests passed');
  assert.ok(NAVEGADORES.primeiro && NAVEGADORES.segundo);
  console.log('pareamento do anki tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });
