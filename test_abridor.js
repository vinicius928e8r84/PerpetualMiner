'use strict';

// O abridor visto da extensão (lib/abridor.js, #147): o que cada resposta do host de Native Messaging
// quer dizer na tela. A seam é o `chrome.runtime.sendNativeMessage`: aqui ele é uma função de teste;
// no e2e, o host de mentira que o Chromium roda de verdade (e2e/fakes/abridor.js). As respostas boas
// saem do contrato (complemento/contrato/exemplos.json › abridor), o mesmo arquivo que o script de
// verdade responde, para este teste não inventar uma resposta que ninguém dá.
//
// O que o e2e não alcança e mora aqui: um host que responde fora do contrato. O fake nunca inventa
// uma resposta, então só este teste pode provar que um `null` (ou qualquer outra coisa) nunca é lido
// como “achei o Anki” nem como “o Anki abriu”.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const contrato = require('./complemento/contrato/carregar.js');

// Os objetos que saem do `vm` têm outro protótipo: compara-se o valor deles.
const comoValores = async promessa => JSON.parse(JSON.stringify(await promessa));

const exemploDoAbridor = (acao, anki) => contrato.abridor.exemplos
  .find(e => e.daExtensao && e.mensagem.acao === acao && e.contexto.anki === anki).resposta;

/**
 * A lib como a página a carrega, com um host que responde o que o teste disser: `responder` recebe a
 * mensagem e devolve a resposta (ou joga, como o Chrome faz com um host que não existe).
 */
function carregarOAbridor({ responder, permissao = true }) {
  const enviadas = [];
  const contexto = vm.createContext({
    setTimeout, clearTimeout,
    // Sem o quadro escondido do painel, a conversa usa o `chrome.runtime` da própria página.
    document: { getElementById: () => null },
    chrome: {
      permissions: { contains: async () => permissao },
      runtime: {
        async sendNativeMessage(host, mensagem) {
          enviadas.push({ host, mensagem: JSON.parse(JSON.stringify(mensagem)) });
          return responder(mensagem);
        },
      },
      storage: { local: { get: async () => ({}), set: async () => {} } },
    },
  });
  contexto.globalThis = contexto;
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'lib', 'abridor.js'), 'utf8'), contexto);
  return { Abridor: contexto.PerpetualMiner.Abridor, enviadas };
}

async function main() {
  {
    const { Abridor, enviadas } = carregarOAbridor({ responder: m => exemploDoAbridor(m.acao, 'no_lugar') });
    assert.deepStrictEqual(await comoValores(Abridor.conferirOAnki()), { resultado: Abridor.RESULTADO.ACHOU, detalhe: '' },
      'o conferir com o Anki no lugar achou');
    assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado: Abridor.RESULTADO.ABRIU, detalhe: '' },
      'o abrir com o Anki no lugar abriu');
    assert.deepStrictEqual(enviadas.map(e => e.mensagem), [{ acao: 'conferir' }, { acao: 'abrir' }],
      'a extensão manda as mensagens dos construtores, nada mais');
    assert.deepStrictEqual([...new Set(enviadas.map(e => e.host))], [contrato.abridor.host],
      'e manda ao host que a Conexão registra');
  }
  {
    const { Abridor } = carregarOAbridor({ responder: m => exemploDoAbridor(m.acao, 'sumiu') });
    assert.deepStrictEqual(await comoValores(Abridor.conferirOAnki()), { resultado: Abridor.RESULTADO.NAO_ACHOU, detalhe: '' },
      'o conferir sem o Anki no lugar não achou');
    assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado: Abridor.RESULTADO.NAO_ABRIU, detalhe: '' },
      'o abrir sem o Anki no lugar não abriu');
  }

  // O Anki no lugar que não abriu (o `open` falhou): o caminho manual, sem Detalhes de abridor quebrado.
  {
    const { Abridor } = carregarOAbridor({ responder: m => exemploDoAbridor(m.acao, 'nao_abre') });
    assert.deepStrictEqual(await comoValores(Abridor.conferirOAnki()), { resultado: Abridor.RESULTADO.ACHOU, detalhe: '' },
      'o conferir com o Anki no lugar achou, mesmo que o sistema não consiga abri-lo');
    assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado: Abridor.RESULTADO.NAO_ABRIU, detalhe: '' },
      'achou o Anki e não abriu: NAO_ABRIU');
  }

  {
    const { Abridor, enviadas } = carregarOAbridor({ permissao: false, responder: () => ({ achou: true }) });
    assert.deepStrictEqual(await comoValores(Abridor.conferirOAnki()), { resultado: Abridor.RESULTADO.SEM_PERMISSAO, detalhe: '' },
      'sem a permissão, o conferir diz SEM_PERMISSAO');
    assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado: Abridor.RESULTADO.SEM_PERMISSAO, detalhe: '' },
      'sem a permissão, o abrir diz SEM_PERMISSAO');
    assert.deepStrictEqual(enviadas, [], 'e nada chega ao abridor');
  }

  {
    const recado = 'Specified native messaging host not found.';
    const { Abridor } = carregarOAbridor({ responder: () => { throw new Error(recado); } });
    assert.deepStrictEqual(await comoValores(Abridor.conferirOAnki()), { resultado: Abridor.RESULTADO.SEM_ABRIDOR, detalhe: recado },
      'o conferir sem o host diz SEM_ABRIDOR com o recado do Chrome');
    assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado: Abridor.RESULTADO.SEM_ABRIDOR, detalhe: recado },
      'o abrir sem o host diz SEM_ABRIDOR com o recado do Chrome');
  }

  // `null` é a armadilha: é o que um host quebrado responde, e também o valor que um código de
  // dentro usaria para dizer “não houve resposta”. Confundir os dois põe “O Anki está abrindo…”
  // na tela sem nada ter aberto.
  // Os dois campos “verdadeiros” sem ser `true` também ficam de fora: só o booleano exato é abriu.
  for (const esquisita of [null, undefined, {}, { achou: 'sim' }, { abriu: true }, 'achou', 0,
    { achou: 'sim', abriu: 'sim' }, { achou: 1, abriu: 1 }]) {
    const { Abridor } = carregarOAbridor({ responder: () => esquisita });
    const comoDisse = JSON.stringify(esquisita ?? null);
    assert.deepStrictEqual(await comoValores(Abridor.conferirOAnki()), { resultado: Abridor.RESULTADO.SEM_ABRIDOR, detalhe: comoDisse },
      `o conferir com a resposta ${comoDisse} diz SEM_ABRIDOR, com o que o abridor disse`);
    assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado: Abridor.RESULTADO.SEM_ABRIDOR, detalhe: comoDisse },
      `o abrir com a resposta ${comoDisse} diz SEM_ABRIDOR, com o que o abridor disse`);
  }

  for (const meiaVerdade of [{ achou: false, abriu: true }, { achou: true, abriu: false }]) {
    const { Abridor } = carregarOAbridor({ responder: () => meiaVerdade });
    assert.deepStrictEqual(await comoValores(Abridor.abrirOAnki()), { resultado: Abridor.RESULTADO.NAO_ABRIU, detalhe: '' },
      `o abrir com ${JSON.stringify(meiaVerdade)} diz NAO_ABRIU`);
  }

  // O consertar (#152): cada exemplo do contrato vira o resultado que a tela lê, com o motivo da falha.
  {
    const { Abridor } = carregarOAbridor({ responder: () => null });
    for (const exemplo of contrato.conserto.exemplos) {
      const { Abridor: A } = carregarOAbridor({ responder: () => exemplo.resposta });
      assert.deepStrictEqual(await comoValores(A.consertarOAnki()),
        { resultado: exemplo.resposta.situacao, motivo: exemplo.resposta.motivo ?? '', detalhe: '' }, exemplo.nome);
    }
    assert.ok(Abridor.LIMITE_DO_CONSERTO_MS >= 30_000 + 10_000 + 20_000, 'a conversa do consertar cobre a espera, o fechar e o abrir');
  }
  {
    const { Abridor, enviadas } = carregarOAbridor({ permissao: false, responder: () => ({ situacao: 'reiniciado' }) });
    assert.deepStrictEqual(await comoValores(Abridor.consertarOAnki()), { resultado: Abridor.RESULTADO.SEM_PERMISSAO, detalhe: '' },
      'sem a permissão o consertar não fecha nada');
    assert.deepStrictEqual(enviadas, []);
  }
  {
    const recado = 'Specified native messaging host not found.';
    const { Abridor, enviadas } = carregarOAbridor({ responder: () => { throw new Error(recado); } });
    assert.deepStrictEqual(await comoValores(Abridor.consertarOAnki()), { resultado: Abridor.RESULTADO.SEM_ABRIDOR, detalhe: recado });
    assert.deepStrictEqual(enviadas.map(e => e.mensagem), [{ acao: 'consertar' }]);
  }
  // Um abridor de antes do consertar responde acao_desconhecida; uma resposta fora do contrato nunca vira “reiniciado”.
  for (const esquisita of [null, {}, { erro: 'acao_desconhecida' }, { situacao: 'quase' }, { situacao: 'achou' }, { achou: true, abriu: true }, { situacao: ['reiniciado'] }]) {
    const { Abridor } = carregarOAbridor({ responder: () => esquisita });
    assert.deepStrictEqual(await comoValores(Abridor.consertarOAnki()),
      { resultado: Abridor.RESULTADO.SEM_ABRIDOR, detalhe: JSON.stringify(esquisita ?? null) }, `consertar com a resposta ${JSON.stringify(esquisita)}`);
  }

  console.log('abridor tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });
