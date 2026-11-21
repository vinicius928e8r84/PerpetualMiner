'use strict';

const assert = require('assert');
const crypto = require('crypto');

const {
  abrirPagina, adiado, foto, respostaDoGemini, respostaComCorpo, respostaSemJson,
} = require('./pagina-da-foto');

const URL_DO_GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';
const SHA_DO_PEDIDO_AO_GEMINI = '715b05fb7ed311b792b73251228be86dc0e5c6d95a86a0ec193cdf516c01a9ed';

const cenarios = [];
const cenario = (nome, rodar) => cenarios.push({ nome, rodar });

const geminiEmFila = respostas => async () => {
  const proxima = respostas.shift();
  if (proxima instanceof Error) throw proxima;
  return proxima;
};

const geminiPendente = () => {
  const pendentes = [];
  const gemini = ({ signal }) => {
    const pedido = adiado();
    signal.addEventListener('abort', () => pedido.rejeitar(new Error('AbortError')));
    pendentes.push(pedido);
    return pedido.promessa;
  };
  return { gemini, pendentes };
};

cenario('sem a chave, a página pede a chave e não recebe foto', async () => {
  const pagina = await abrirPagina({ chave: '' });
  await pagina.soltar([foto('a.jpg')]);
  const retrato = pagina.retrato();
  assert.strictEqual(retrato.semChave, true);
  assert.strictEqual(retrato.envio, null);
  assert.strictEqual(retrato.formatos, false);
  assert.strictEqual(retrato.coluna, '«chave»FOT-05.tituloFOT-05.aviso«chave»FOT-05.acao');
  assert.deepStrictEqual(retrato.cartoes, []);

  await pagina.mudarChave('nova');
  assert.strictEqual(pagina.retrato().coluna, '«livro»FOT-01.tituloFOT-01.subtitulo FOT-25.comoAparecem');
  assert.strictEqual(pagina.retrato().envio, 'FOT-02.titulo|');
  assert.strictEqual(pagina.retrato().formatos, true);
});

cenario('a chave da coluna abre o painel nas Configurações, e o painel já aberto só é focado', async () => {
  const pagina = await abrirPagina({ chave: '' });
  await pagina.clicar(pagina.botoesDaColuna()[0]);
  assert.deepStrictEqual(pagina.registro.abasCriadas, [{ url: 'chrome-extension://pm/painel/painel.html#configuracoes/chave' }]);

  const comPainel = await abrirPagina({ chave: '', abas: [{ id: 7, windowId: 3, url: 'chrome-extension://pm/painel/painel.html#configuracoes/chave' }] });
  await comPainel.clicar(comPainel.botoesDaColuna()[0]);
  await comPainel.clicar('foto-voltar');
  assert.deepStrictEqual(comPainel.registro.abasMudadas, [
    { id: 7, active: true, url: 'chrome-extension://pm/painel/painel.html#configuracoes/chave' },
    { id: 7, active: true },
  ]);
  assert.deepStrictEqual(comPainel.registro.janelas, [{ id: 3, focused: true }, { id: 3, focused: true }]);
  assert.deepStrictEqual(comPainel.registro.mensagens, [{ type: 'PAINEL_REAPLICAR_ENDERECO' }]);
});

cenario('a chave só muda com uma mudança local da própria chave', async () => {
  const pagina = await abrirPagina();
  await pagina.mudarArmazenamento({ geminiApiKey: { newValue: '' } }, 'sync');
  await pagina.mudarArmazenamento({ bookTitleDefault: { newValue: 'Outro' } }, 'local');
  assert.strictEqual(pagina.retrato().semChave, false);
  await pagina.mudarArmazenamento({ geminiApiKey: { newValue: '' } }, 'local');
  assert.strictEqual(pagina.retrato().semChave, true);
});

cenario('o painel no endereço sem hash é focado sem o aviso de reaplicar, e levado ao endereço da chave', async () => {
  const pagina = await abrirPagina({ chave: '', abas: [{ id: 4, windowId: 2, url: 'chrome-extension://pm/painel/painel.html' }] });
  await pagina.clicar('foto-voltar');
  await pagina.clicar(pagina.botoesDaColuna()[0]);
  assert.deepStrictEqual(pagina.registro.abasMudadas, [
    { id: 4, active: true },
    { id: 4, active: true, url: 'chrome-extension://pm/painel/painel.html#configuracoes/chave' },
  ]);
  assert.deepStrictEqual(pagina.registro.mensagens, []);
  assert.deepStrictEqual(pagina.registro.abasCriadas, []);
});

cenario('uma foto sozinha para na prévia; outra que chega com a prévia aberta espera nela', async () => {
  const pagina = await abrirPagina();
  await pagina.soltar([foto('um.jpg')]);
  let retrato = pagina.retrato();
  assert.deepStrictEqual(retrato.cartoes, [{ status: 'pronta', selo: 'veio-selo|FOT-19.pronta', causa: null, deNovo: false }]);
  assert.strictEqual(retrato.coluna, 'FOT-03«ler»FOT-25.lerMarcacoes«atualizar»FOT-17');
  assert.strictEqual(retrato.envio, 'FOT-23.maisFotos|');
  assert.strictEqual(retrato.formatos, false);
  assert.strictEqual(retrato.total, '1');

  await pagina.escolher([foto('dois.png', 'image/png'), foto('tres.webp', 'image/webp')]);
  retrato = pagina.retrato();
  assert.deepStrictEqual(retrato.cartoes.map(cartao => cartao.status), ['pronta', 'pronta', 'pronta']);
  assert.strictEqual(pagina.registro.pedidos.length, 0);
  assert.strictEqual(pagina.no('foto-arquivo').value, '');
});

cenario('várias fotos de uma vez vão direto para a fila, lidas uma a uma, com o pedido inteiro ao Gemini', async () => {
  const pagina = await abrirPagina({ gemini: geminiEmFila([respostaDoGemini('  a frase  \n\nb\nNENHUM_TRECHO x'), respostaDoGemini('NENHUM_TRECHO')]) });
  await pagina.soltar([foto('a.jpg'), foto('IMG.HEIC', '')]);
  const [primeiro, segundo] = pagina.registro.pedidos;
  assert.strictEqual(primeiro.url, URL_DO_GEMINI);
  assert.strictEqual(primeiro.method, 'POST');
  assert.deepStrictEqual(primeiro.headers, { 'Content-Type': 'application/json', 'x-goog-api-key': 'chave-de-teste' });
  assert.strictEqual(crypto.createHash('sha256').update(primeiro.corpo.contents[0].parts[1].text).digest('hex'), SHA_DO_PEDIDO_AO_GEMINI);
  const corpoEsperado = prompt => JSON.stringify({
    contents: [{ parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'YS5qcGc=' } }, { text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
  });
  assert.strictEqual(primeiro.body, corpoEsperado(primeiro.corpo.contents[0].parts[1].text));
  assert.strictEqual(segundo.corpo.contents[0].parts[0].inlineData.mimeType, 'image/heic');

  const retrato = pagina.retrato();
  assert.deepStrictEqual(retrato.cartoes, [
    { status: 'lida', selo: 'veio-selo veio-selo--ok|FOT-19.frases{"n":2}', causa: null, deNovo: false },
    { status: 'lida', selo: 'veio-selo|FOT-19.semMarcacoes', causa: null, deNovo: false },
  ]);
  assert.deepStrictEqual(retrato.lista.grupos.map(grupo => [grupo.titulo, grupo.frases.map(frase => frase.texto)]),
    [['FOT-25.grupo{"n":1}a.jpg', ['a frase', 'b']]]);
  assert.strictEqual(retrato.coluna, '');
  assert.strictEqual(retrato.progresso, null);
  assert.strictEqual(retrato.cancelar, false);
});

cenario('um arquivo que não é foto recebe o FOT-04 com os nomes, e só as fotos entram', async () => {
  const pagina = await abrirPagina();
  await pagina.soltar([foto('notas.txt', 'text/plain'), foto('c.jpg'), foto('sem-tipo', '')]);
  const retrato = pagina.retrato();
  assert.deepStrictEqual(retrato.avisos, [{ texto: 'FOT-04', detalhes: 'notas.txt\nsem-tipo', rotuloDeFechar: 'PAI-34' }]);
  assert.deepStrictEqual(retrato.cartoes.map(cartao => cartao.status), ['pronta']);

  const soRecusados = await abrirPagina();
  await soRecusados.soltar([foto('a.pdf', 'application/pdf')]);
  assert.strictEqual(soRecusados.retrato().avisos.length, 1);
  assert.deepStrictEqual(soRecusados.retrato().cartoes, []);
  assert.strictEqual(soRecusados.retrato().coluna, '«livro»FOT-01.tituloFOT-01.subtitulo FOT-25.comoAparecem');

  const nada = await abrirPagina();
  await nada.soltar([]);
  assert.deepStrictEqual(nada.retrato().avisos, []);
});

cenario('o tipo que o navegador dá vale antes da extensão, e é o que o Gemini recebe', async () => {
  const pagina = await abrirPagina();
  await pagina.soltar([foto('colada', 'image/png'), foto('foto.jpg', 'image/webp')]);
  assert.deepStrictEqual(pagina.registro.pedidos.map(pedido => pedido.corpo.contents[0].parts[0].inlineData.mimeType), ['image/png', 'image/webp']);
  assert.deepStrictEqual(pagina.retrato().avisos, []);
});

cenario('fotos lidas do disco depois de um Recomeçar são descartadas', async () => {
  const pagina = await abrirPagina();
  pagina.documento.disparar('drop', { dataTransfer: { files: [foto('a.jpg'), foto('b.jpg')] } });
  await pagina.clicar('foto-recomecar');
  assert.deepStrictEqual(pagina.registro.revogadas, ['blob:a.jpg', 'blob:b.jpg']);
  assert.deepStrictEqual(pagina.retrato().cartoes, []);
  assert.strictEqual(pagina.registro.pedidos.length, 0);
});

const respostaQueFalha = [
  { nome: 'sem rede', resposta: new TypeError('Failed to fetch'), causa: 'FOT-11.causaRede', chave: false },
  { nome: '429', resposta: respostaComCorpo(429, { error: { message: 'quota' } }), causa: 'FOT-11.causaLimite', chave: false },
  { nome: '429 falando de API key', resposta: respostaComCorpo(429, { error: { message: 'API key quota' } }), causa: 'FOT-11.causaLimite', chave: true },
  { nome: 'sem rede falando de API key', resposta: new TypeError('api key'), causa: 'FOT-11.causaRede', chave: true },
  { nome: 'RESOURCE_EXHAUSTED', resposta: respostaComCorpo(500, { error: { status: 'RESOURCE_EXHAUSTED' } }), causa: 'FOT-11.causaLimite', chave: false },
  { nome: '401', resposta: respostaComCorpo(401, {}), causa: 'FOT-11.causaChave', chave: true },
  { nome: '403 sem JSON', resposta: respostaSemJson(403), causa: 'FOT-11.causaChave', chave: true },
  { nome: 'API key na mensagem', resposta: respostaComCorpo(400, { error: { message: 'API key not valid' } }), causa: 'FOT-11.causaChave', chave: true },
  { nome: 'api_key na mensagem', resposta: respostaComCorpo(400, { error: { message: 'bad Api_Key' } }), causa: 'FOT-11.causaChave', chave: true },
  { nome: 'apikey na mensagem', resposta: respostaComCorpo(400, { error: { message: 'no apikey' } }), causa: 'FOT-11.causaChave', chave: true },
  { nome: '500 sem JSON', resposta: respostaSemJson(500), causa: 'GLB-01', chave: false },
  { nome: '500 com corpo nulo', resposta: respostaComCorpo(500, null), causa: 'GLB-01', chave: false },
  { nome: '500 com error nulo', resposta: respostaComCorpo(500, { error: null }), causa: 'GLB-01', chave: false },
  { nome: '200 sem candidatos', resposta: respostaComCorpo(200, { candidates: [] }), causa: 'GLB-01', chave: false },
  { nome: '200 sem partes', resposta: respostaComCorpo(200, { candidates: [{ content: {} }] }), causa: 'GLB-01', chave: false },
  { nome: '200 nulo', resposta: respostaComCorpo(200, null), causa: 'GLB-01', chave: false },
  { nome: '200 só espaços', resposta: respostaDoGemini('   \n  '), causa: 'GLB-01', chave: false },
  { nome: '200 falando de api key sem texto', resposta: respostaComCorpo(200, { promptFeedback: 'api key' }), causa: 'FOT-11.causaChave', chave: true },
];

cenario('cada falha da leitura diz a sua causa no cartão e na coluna, e a chave recusada leva às Configurações', async () => {
  for (const { nome, resposta, causa, chave } of respostaQueFalha) {
    const pagina = await abrirPagina({ gemini: geminiEmFila([resposta]) });
    await pagina.soltar([foto('a.jpg')]);
    await pagina.clicar(pagina.botoesDaColuna()[0]);
    const retrato = pagina.retrato();
    assert.deepStrictEqual(retrato.cartoes, [{ status: 'falhou', selo: 'veio-selo veio-selo--erro|FOT-19.falhou', causa, deNovo: true }], nome);
    const botoes = chave ? '«chave»FOT-05.acao«atualizar»FOT-17' : '«atualizar»FOT-17';
    assert.strictEqual(retrato.coluna, `«perigo»FOT-11.titulo{"n":1}${causa}${botoes}`, nome);
    assert.deepStrictEqual(retrato.avisos, [], nome);
    assert.strictEqual(retrato.lista, null, nome);
  }
});

cenario('com frases na tela, as falhas viram um aviso só, refeito apenas quando outra foto falha', async () => {
  const pagina = await abrirPagina({ gemini: geminiEmFila([respostaDoGemini('uma'), respostaComCorpo(401, {}), respostaSemJson(500)]) });
  await pagina.soltar([foto('a.jpg'), foto('b.jpg'), foto('c.jpg')]);
  const [aviso] = pagina.avisos();
  assert.deepStrictEqual(pagina.retrato().avisos, [{
    abertura: 'FOT-11.avisoVarias{"n":2}', texto: 'FOT-11.causaChave', icone: 'perigo', acao: 'FOT-05.acao', rotuloDeFechar: 'PAI-34',
  }]);
  aviso.acao.aoUsar();
  assert.deepStrictEqual(pagina.registro.abasCriadas, [{ url: 'chrome-extension://pm/painel/painel.html#configuracoes/chave' }]);

  const uma = await abrirPagina({ gemini: geminiEmFila([respostaDoGemini('uma'), respostaSemJson(500), respostaDoGemini('tres'), respostaSemJson(500)]) });
  await uma.soltar([foto('a.jpg'), foto('b.jpg')]);
  assert.deepStrictEqual(uma.retrato().avisos, [{
    abertura: 'FOT-11.aviso{"n":2}', texto: 'GLB-01', icone: 'perigo', acao: undefined, rotuloDeFechar: 'PAI-34',
  }]);
  const primeiro = uma.avisos()[0];
  await uma.soltar([foto('c.jpg')]);
  assert.strictEqual(uma.avisos()[0], primeiro);
  await uma.soltar([foto('d.jpg')]);
  assert.notStrictEqual(uma.avisos()[0], primeiro);
  assert.deepStrictEqual(uma.retrato().avisos.map(aviso => aviso.abertura), ['FOT-11.avisoVarias{"n":2}']);
});

cenario('Tentar de novo põe só a foto que falhou de volta na fila e deixa o foco no cartão', async () => {
  const pagina = await abrirPagina({ gemini: geminiEmFila([respostaDoGemini('uma'), respostaSemJson(500), respostaDoGemini('duas')]) });
  await pagina.soltar([foto('a.jpg'), foto('b.jpg')]);
  const cartao = pagina.cartoes()[1];
  await pagina.clicar(cartao.querySelector('.foto-cartao__de-novo'));
  const retrato = pagina.retrato();
  assert.deepStrictEqual(retrato.cartoes.map(item => item.status), ['lida', 'lida']);
  assert.ok(pagina.documento.activeElement === cartao, 'o foco fica no cartão da foto');
  assert.deepStrictEqual(retrato.avisos, []);
  assert.deepStrictEqual(retrato.lista.grupos.map(grupo => grupo.titulo), ['FOT-25.grupo{"n":1}a.jpg', 'FOT-25.grupo{"n":2}b.jpg']);
  assert.strictEqual(pagina.registro.pedidos.length, 3);
});

cenario('durante a leitura, o envio, o progresso e a coluna contam as fotos', async () => {
  const { gemini, pendentes } = geminiPendente();
  const pagina = await abrirPagina({ gemini });
  await pagina.soltar([foto('a.jpg'), foto('b.jpg'), foto('c.jpg')]);
  let retrato = pagina.retrato();
  assert.strictEqual(retrato.envio, 'FOT-08{"n":2}|foto-envio--lendo');
  assert.strictEqual(retrato.progresso, 'FOT-20{"n":0,"total":3}|0%');
  assert.strictEqual(retrato.cancelar, true);
  assert.strictEqual(retrato.coluna, '«ler»FOT-07{"n":1,"total":3}FOT-06.detalhe');
  assert.deepStrictEqual(retrato.cartoes.map(cartao => cartao.selo), [
    'veio-selo veio-selo--lendo|FOT-19.lendo', 'veio-selo|FOT-19.naFila', 'veio-selo|FOT-19.naFila',
  ]);
  const seloLendo = pagina.cartoes()[0].querySelector('.foto-cartao__status').nos()[0];
  assert.deepStrictEqual(seloLendo.nos().map(no => no.className), ['veio-selo__ponto']);

  pendentes[0].resolver(respostaDoGemini('NENHUM_TRECHO'));
  await pagina.soltar([foto('d.jpg')]);
  retrato = pagina.retrato();
  assert.strictEqual(retrato.progresso, 'FOT-20{"n":1,"total":4}|25%');
  assert.strictEqual(retrato.coluna, '«ler»FOT-07{"n":2,"total":4}FOT-06.detalhe');

  pagina.no('foto-cancelar').focus();
  for (let i = 1; i < 4; i++) {
    pendentes[i].resolver(respostaDoGemini('NENHUM_TRECHO'));
    await pagina.soltar([]);
    if (i < 3) assert.strictEqual(pagina.retrato().foco, 'foto-cancelar');
  }
  retrato = pagina.retrato();
  assert.strictEqual(retrato.envio, 'FOT-23.maisFotos|');
  assert.strictEqual(retrato.cancelar, false);
  assert.strictEqual(retrato.foco, 'foto-escolher');
  assert.strictEqual(retrato.coluna, '«busca»FOT-10.titulo{"n":4}FOT-10.texto«atualizar»FOT-17');
});

cenario('com frases na tela, a coluna é a lista mesmo com outra foto sendo lida', async () => {
  const { gemini, pendentes } = geminiPendente();
  const pagina = await abrirPagina({ gemini });
  await pagina.soltar([foto('a.jpg'), foto('b.jpg')]);
  pendentes[0].resolver(respostaDoGemini('uma'));
  await pagina.soltar([]);
  const retrato = pagina.retrato();
  assert.strictEqual(retrato.coluna, '');
  assert.strictEqual(retrato.progresso, 'FOT-20{"n":1,"total":2}|50%');
  assert.deepStrictEqual(retrato.lista.grupos.map(grupo => grupo.titulo), ['FOT-25.grupo{"n":1}a.jpg']);
});

cenario('uma foto só, lida pela prévia, diz FOT-06 na coluna', async () => {
  const { gemini, pendentes } = geminiPendente();
  const pagina = await abrirPagina({ gemini });
  await pagina.soltar([foto('a.jpg')]);
  await pagina.clicar(pagina.botoesDaColuna()[0]);
  assert.strictEqual(pagina.retrato().coluna, '«ler»FOT-06.tituloFOT-06.detalhe');
  assert.strictEqual(pagina.retrato().progresso, 'FOT-20{"n":0,"total":1}|0%');
  pendentes[0].resolver(respostaDoGemini('NENHUM_TRECHO'));
  await pagina.soltar([]);
  assert.strictEqual(pagina.retrato().coluna, '«busca»FOT-10.titulo{"n":1}FOT-10.texto«atualizar»FOT-17');
});

cenario('Cancelar sem foto lida: a coluna diz Leitura cancelada, e a resposta que chega depois é largada', async () => {
  const { gemini, pendentes } = geminiPendente();
  const pagina = await abrirPagina({ gemini });
  await pagina.soltar([foto('a.jpg'), foto('b.jpg')]);
  await pagina.clicar('foto-cancelar');
  const retrato = pagina.retrato();
  assert.deepStrictEqual(retrato.cartoes.map(cartao => cartao.selo), ['veio-selo|FOT-19.cancelada', 'veio-selo|FOT-19.cancelada']);
  assert.strictEqual(retrato.coluna, '«fechar»FOT-21.tituloFOT-21.nenhumaLida«atualizar»FOT-17');
  assert.deepStrictEqual(retrato.avisos, []);
  assert.strictEqual(retrato.foco, 'foto-escolher');
  assert.strictEqual(retrato.envio, 'FOT-23.maisFotos|');
  pendentes[0].resolver(respostaDoGemini('tarde'));
  await pagina.soltar([]);
  assert.strictEqual(pagina.retrato().lista, null);
});

cenario('Cancelar com fotos lidas: um aviso FOT-21 sobre as frases, e a falha antes do cancelamento ganha a coluna', async () => {
  const { gemini, pendentes } = geminiPendente();
  const pagina = await abrirPagina({ gemini });
  await pagina.soltar([foto('a.jpg'), foto('b.jpg'), foto('c.jpg')]);
  pendentes[0].resolver(respostaDoGemini('uma'));
  await pagina.soltar([]);
  await pagina.clicar('foto-cancelar');
  assert.deepStrictEqual(pagina.retrato().avisos, [{
    tom: 'info', icone: 'info', abertura: 'FOT-21.abertura', texto: 'FOT-21.aviso{"n":2}', rotuloDeFechar: 'PAI-34',
  }]);

  const comFalha = geminiPendente();
  const outra = await abrirPagina({ gemini: comFalha.gemini });
  await outra.soltar([foto('a.jpg'), foto('b.jpg')]);
  comFalha.pendentes[0].resolver(respostaSemJson(500));
  await outra.soltar([]);
  await outra.clicar('foto-cancelar');
  assert.strictEqual(outra.retrato().coluna, '«perigo»FOT-11.titulo{"n":1}GLB-01«atualizar»FOT-17');
  assert.deepStrictEqual(outra.retrato().avisos, [{
    tom: 'info', icone: 'info', abertura: 'FOT-21.abertura', texto: 'FOT-21.aviso{"n":1}', rotuloDeFechar: 'PAI-34',
  }]);
});

cenario('arrastar sobre a página acende a área de envio só com a chave', async () => {
  const pagina = await abrirPagina();
  pagina.documento.disparar('dragover');
  assert.strictEqual(pagina.no('foto-envio').className, 'foto-envio--sobre');
  pagina.documento.disparar('dragleave', { relatedTarget: pagina.no('foto-fila') });
  assert.strictEqual(pagina.no('foto-envio').className, 'foto-envio--sobre');
  pagina.documento.disparar('dragleave');
  assert.strictEqual(pagina.no('foto-envio').className, '');

  const semChave = await abrirPagina({ chave: '' });
  semChave.documento.disparar('dragover');
  assert.strictEqual(semChave.no('foto-envio').className, '');
});

(async () => {
  for (const { nome, rodar } of cenarios) {
    await rodar();
    console.log(`ok: ${nome}`);
  }
})().catch(erro => {
  console.error(erro);
  process.exitCode = 1;
});
