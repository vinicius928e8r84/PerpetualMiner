'use strict';

// Conectar este navegador à Conexão com o Anki (#192, BRG-52, opção A do dono): o código aparece no Anki, a pessoa o digita no Painel, e dali em diante
// cada pedido vai assinado e cada resposta volta provada. A Conexão é o fake da fronteira HTTP (`fakes.anki`, com o pareamento de `fakes/pareamento.js`);
// com `PM_CONEXAO=real` os testes que não dependem de fingir o relógio rodam contra o complemento de verdade (`conexaoDoTeste`), que é a prova do
// protocolo com o Python: `PM_CONEXAO=real node scripts/testar.mjs e2e -- pareamento`. O diálogo do Anki (Qt) não existe aqui: o código "aparece" na janela de
// mentira (`codigoNoAnki`), e a prova dele num Anki de verdade é a prova real (docs/design/pareamento-da-conexao.md § 6).

const { test, expect } = require('../fixtures');
const { estadoFinal, estadoFinalEm } = require('../estado-final');
const { abrirPainel } = require('../apoio-do-envio');

test.use({ pareada: false });

const faixa = page => page.locator('#painel-pareamento');
const conectar = page => faixa(page).getByRole('button', { name: 'Conectar' });
const campo = page => page.getByRole('textbox', { name: 'Digite o código que apareceu no Anki' });
const confirmar = page => faixa(page).getByRole('button', { name: 'Confirmar' });
const toasts = page => page.locator('.veio-toast');

/** O código que o Anki mostra agora: na janela de mentira do fake, ou na do complemento real. */
const codigoNoAnki = async (fakes, conexaoDoTeste) => (conexaoDoTeste ? (await conexaoDoTeste.enviar({ pareamento: 'codigo' })).codigo : fakes.anki.pareamento.codigoNoAnki());
const quantosPareados = async (fakes, conexaoDoTeste) => (conexaoDoTeste ? (await conexaoDoTeste.enviar({ pareamento: 'navegadores' })).navegadores : fakes.anki.pareamento.pareados().size);
const desconectarNoAnki = async (fakes, conexaoDoTeste) => (conexaoDoTeste ? conexaoDoTeste.enviar({ pareamento: 'desconectar' }) : fakes.anki.pareamento.desconectar());

/** O que a extensão guardou do pareamento no IndexedDB do service worker: o navegador e se a chave deixa ler os bytes. */
const credencialGuardada = extensao => extensao.serviceWorker.evaluate(() => new Promise((resolver, rejeitar) => {
  const abertura = indexedDB.open('pm-pareamento', 1);
  abertura.onerror = () => rejeitar(abertura.error);
  abertura.onsuccess = () => {
    const banco = abertura.result;
    if (!banco.objectStoreNames.contains('conexao')) { banco.close(); return resolver(null); }
    const leitura = banco.transaction('conexao', 'readonly').objectStore('conexao').get('credencial');
    leitura.onsuccess = () => {
      banco.close();
      const guardada = leitura.result;
      resolver(guardada ? { cliente: guardada.cliente, extraivel: guardada.chave.extractable, usos: guardada.chave.usages } : null);
    };
  };
}));

async function parearPelaTela(page, fakes, conexaoDoTeste) {
  await conectar(page).click();
  await expect(campo(page)).toBeVisible();
  const codigo = await codigoNoAnki(fakes, conexaoDoTeste);
  await campo(page).fill(codigo.toLowerCase());
  await confirmar(page).click();
  await expect(faixa(page)).toHaveCount(0);
}

test('sem pareamento, o Painel pede para conectar e nenhum pedido privado sai para a Conexão', async ({ page, extensao, fakes, conexaoDoTeste }) => {
  await abrirPainel(page, extensao, '#anki/custos');

  await expect(faixa(page)).toContainText('Conecte este navegador ao Anki');
  await expect(conectar(page)).toBeVisible();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');
  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => quantosPareados(fakes, conexaoDoTeste), 0);
  if (!conexaoDoTeste) {
    const caminhos = [...new Set(fakes.anki.requisicoes.map(r => r.caminho))];
    expect(caminhos).toEqual(['/health']);
    expect(fakes.anki.pareamento.recebidos()).toEqual([]);
  }
  expect(await credencialGuardada(extensao)).toBeNull();
});

test('sem pareamento, a chave colada não sai: o card da IA diz que a Conexão não respondeu, e não que a sessão da conta expirou', async ({ page, extensao, fakes, conexaoDoTeste }) => {
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await expect(faixa(page)).toContainText('Conecte este navegador ao Anki');

  await page.locator('#cfg-ia').getByRole('textbox', { name: 'Chave da OpenAI' }).fill('sk-proj-chave-que-nao-pode-sair-5678');
  await page.locator('#cfg-ia').getByRole('button', { name: 'Conferir e salvar' }).click();

  await expect(page.locator('#cfg-ia').getByRole('alert')).toContainText('A Conexão com o Anki não respondeu');
  await expect(page.locator('#cfg-ia').getByRole('alert')).not.toContainText('sessão');
  await estadoFinal(extensao, { pm_chave_openai: null });
  if (!conexaoDoTeste) expect(JSON.stringify(fakes.anki.requisicoes)).not.toContain('sk-proj-chave-que-nao-pode-sair');
});

test('Conectar, o código do Anki e Confirmar: o navegador fica conectado, com a chave que ninguém lê, e as telas voltam a ler da Conexão', async ({ page, extensao, fakes, conexaoDoTeste }) => {
  fakes.anki.definirCustos([{ jobId: 'job-en', lang: 'en', createdAt: '2026-09-18T11:00:00', status: 'completed', pedidas: 12, custos: { cartoes: 0.081 } }]);
  await abrirPainel(page, extensao, '#anki/custos');
  await conectar(page).click();

  await expect(faixa(page)).toContainText('Digite o código que apareceu no Anki');
  await expect(campo(page)).toBeFocused();
  const codigo = await codigoNoAnki(fakes, conexaoDoTeste);
  expect(codigo).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  await expect(page.locator('body')).not.toContainText(codigo);   // o código não aparece no Painel: só quem lê o Anki o tem
  await campo(page).fill(codigo);
  await confirmar(page).click();

  await expect(faixa(page)).toHaveCount(0);
  await expect(toasts(page)).toContainText('Conexão com o Anki: ligada');
  // Pareado, a aba Custos lê da Conexão (o pedido saiu assinado e a resposta voltou provada).
  await page.getByRole('radio', { name: 'Custos' }).check();
  await expect(conexaoDoTeste ? page.getByText('Nenhum envio neste período.') : page.getByRole('listbox', { name: 'Envios recentes' })).toBeVisible();
  await expect(page.getByText('Não deu para carregar os custos')).toHaveCount(0);
  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => quantosPareados(fakes, conexaoDoTeste), 1);
  const guardada = await credencialGuardada(extensao);
  expect(guardada).toMatchObject({ extraivel: false, usos: ['sign'] });
  expect(guardada.cliente).toMatch(/^[0-9a-f-]{36}$/);
  // O segredo nasce na Conexão e passa uma vez, na resposta do `concluir`: nem o storage que o content script lê nem os pedidos seguintes o têm.
  await estadoFinal(extensao, { pm_anki_ja_conectou: true });
  const tudoNoStorage = JSON.stringify(await extensao.lerStorage(null));
  expect(tudoNoStorage).not.toContain(guardada.cliente);
  if (!conexaoDoTeste) {
    const [segredo] = fakes.anki.pareamento.pareados().values();
    expect(tudoNoStorage).not.toContain(segredo);
    expect(JSON.stringify(fakes.anki.requisicoes)).not.toContain(segredo);
    // O código nunca foi pedido nem devolvido por HTTP: o Painel só o mandou ao `concluir`.
    expect(fakes.anki.pareamento.recebidos().map(r => r.caminho).slice(0, 2)).toEqual(['/pareamento/comecar', '/pareamento/concluir']);
  }
});

test('o código errado diz quantas tentativas restam e guarda o que foi digitado; o certo, depois, conecta', async ({ page, extensao, fakes, conexaoDoTeste }) => {
  await abrirPainel(page, extensao, '#frases');
  await conectar(page).click();

  await campo(page).fill('AAA-AAA');
  await confirmar(page).click();
  await expect(faixa(page)).toContainText('Código errado. Restam 4 tentativas');
  await expect(campo(page)).toHaveValue('AAA-AAA');
  await campo(page).press('Enter');
  await expect(faixa(page)).toContainText('Código errado. Restam 3 tentativas');
  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => quantosPareados(fakes, conexaoDoTeste), 0);

  await campo(page).fill(await codigoNoAnki(fakes, conexaoDoTeste));
  await confirmar(page).click();
  await expect(faixa(page)).toHaveCount(0);
  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => quantosPareados(fakes, conexaoDoTeste), 1);
});

test('cinco códigos errados matam o código: o Painel volta ao Conectar com “Peça outro”, e um código novo conecta', async ({ page, extensao, fakes, conexaoDoTeste }) => {
  await abrirPainel(page, extensao, '#frases');
  await conectar(page).click();
  for (const restam of [4, 3, 2, 1]) {
    await campo(page).fill('AAA-AAA');
    await confirmar(page).click();
    await expect(faixa(page)).toContainText(restam === 1 ? 'Código errado. Resta 1 tentativa' : `Código errado. Restam ${restam} tentativas`);
  }
  const morto = await codigoNoAnki(fakes, conexaoDoTeste);
  await campo(page).fill('AAA-AAA');
  await confirmar(page).click();

  await expect(faixa(page)).toContainText('O código venceu. Peça outro');
  await expect(campo(page)).toHaveCount(0);
  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => quantosPareados(fakes, conexaoDoTeste), 0);
  expect(await codigoNoAnki(fakes, conexaoDoTeste)).toBeNull();   // o diálogo do Anki fechou
  await parearPelaTela(page, fakes, conexaoDoTeste);
  expect(morto).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => quantosPareados(fakes, conexaoDoTeste), 1);
});

test('o código que o Anki fechou com Cancelar não vale mais', async ({ page, extensao, fakes, conexaoDoTeste }) => {
  await abrirPainel(page, extensao, '#frases');
  await conectar(page).click();
  const codigo = await codigoNoAnki(fakes, conexaoDoTeste);
  if (conexaoDoTeste) await conexaoDoTeste.enviar({ pareamento: 'cancelar' });
  else fakes.anki.pareamento.cancelarNoAnki();

  await campo(page).fill(codigo);
  await confirmar(page).click();

  await expect(faixa(page)).toContainText('O código venceu. Peça outro');
  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => quantosPareados(fakes, conexaoDoTeste), 0);
});

test('o código que passou de 5 minutos não vale mais', async ({ page, extensao, fakes, conexaoDoTeste }) => {
  test.skip(Boolean(conexaoDoTeste), 'o relógio de 5 minutos da Conexão real é provado em complemento/test_pareamento.py');
  await abrirPainel(page, extensao, '#frases');
  await conectar(page).click();
  const codigo = fakes.anki.pareamento.codigoNoAnki();
  fakes.anki.pareamento.vencerOCodigo();

  await campo(page).fill(codigo);
  await confirmar(page).click();

  await expect(faixa(page)).toContainText('O código venceu. Peça outro');
  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => fakes.anki.pareamento.pareados().size, 0);
});

test('o Anki que não consegue mostrar o código: o Painel diz que a porta não se confirmou e nada fica pareado', async ({ page, extensao, fakes, conexaoDoTeste }) => {
  test.skip(Boolean(conexaoDoTeste), 'sem a janela do Anki é um estado do fake e do complemento sem Qt (contrato: pairing_unavailable)');
  fakes.anki.pareamento.semJanelaDoAnki();
  await abrirPainel(page, extensao, '#frases');
  await conectar(page).click();

  await expect(faixa(page)).toContainText('Algo na porta do Anki não se confirmou. Nada foi enviado');
  await expect(conectar(page)).toBeVisible();
  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => fakes.anki.pareamento.pareados().size, 0);
});

test.describe('depois de pareado', () => {
  test.use({ pareada: true });

  test('Desconectar navegadores no Anki: a faixa volta, a credencial não é apagada e a chave da OpenAI da Conexão fica', async ({ page, extensao, fakes, conexaoDoTeste }) => {
    test.skip(Boolean(conexaoDoTeste), 'a chave da Conexão real tem o próprio caminho (chave-autoridade.spec.js); o desconectar real é provado em complemento/test_pareamento.py');
    fakes.anki.guardarChaveNaConexao('9f3a', 3, 'uid-teste', 100, false);
    await abrirPainel(page, extensao, '#anki/custos');
    await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');
    await expect(faixa(page)).toHaveCount(0);

    fakes.anki.pareamento.desconectar();
    await page.reload();

    await expect(faixa(page)).toContainText('Conecte este navegador ao Anki');
    expect((await credencialGuardada(extensao))?.cliente).toMatch(/^[0-9a-f-]{36}$/);   // a credencial fica: um 401 sem prova não desfaz o pareamento
    await estadoFinalEm('a chave da OpenAI que a Conexão guarda', () => fakes.anki.chaveNaConexao(), 'sk-proj-guardada-antes-9f3a');
    // Parear de novo substitui o segredo daquele navegador.
    await parearPelaTela(page, fakes, conexaoDoTeste);
    await estadoFinalEm('os navegadores que a Conexão tem pareados', () => fakes.anki.pareamento.pareados().size, 1);
  });
});

test('dois perfis do Chrome pareiam cada um o seu segredo, e o Desconectar do Anki pede o código aos dois', async ({ page, extensao, segundoPerfil, fakes, conexaoDoTeste }) => {
  const outra = await segundoPerfil.context.newPage();
  await abrirPainel(page, extensao, '#frases');
  await outra.goto(segundoPerfil.extensao.url('painel.html#frases'));
  await expect(outra.getByRole('heading', { level: 1 })).toBeVisible();

  await parearPelaTela(page, fakes, conexaoDoTeste);
  await parearPelaTela(outra, fakes, conexaoDoTeste);

  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => quantosPareados(fakes, conexaoDoTeste), 2);
  const [primeira, segunda] = await Promise.all([credencialGuardada(extensao), credencialGuardada(segundoPerfil.extensao)]);
  expect(primeira.cliente).not.toBe(segunda.cliente);
  await desconectarNoAnki(fakes, conexaoDoTeste);
  await page.reload();
  await outra.reload();
  await expect(faixa(page)).toContainText('Conecte este navegador ao Anki');
  await expect(faixa(outra)).toContainText('Conecte este navegador ao Anki');
  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => quantosPareados(fakes, conexaoDoTeste), 0);
});

test.describe('quem não é a Conexão', () => {
  test.use({ pareada: true });
  test.beforeEach(({ conexaoDoTeste }) => test.skip(Boolean(conexaoDoTeste), 'o impostor ocupa a porta no lugar do fake'));

  /** Um impostor na 8766: responde a saúde como a Conexão e tudo o mais com 200 e `{}`, sem prova, e anota o que recebe. */
  async function impostorNaPorta(context, fakes) {
    const vistos = [];
    await context.route(fakes.anki.padrao, async route => {
      const req = route.request();
      const caminho = new URL(req.url()).pathname;
      vistos.push({ metodo: req.method(), caminho, corpo: req.postData() });
      const corpo = caminho === '/health' ? { ok: true, versao: '9.9.9', perfil: 'Impostor' } : {};
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
    });
    return vistos;
  }

  test('o impostor na porta só vê o desafio: a chave digitada não sai, o Painel diz que a porta não se confirmou e a aba do ChatGPT não abre', async ({ page, context, extensao, fakes }) => {
    const vistos = await impostorNaPorta(context, fakes);
    await abrirPainel(page, extensao, '#configuracoes/ia');
    await expect(faixa(page)).toContainText('Algo na porta do Anki não se confirmou. Nada foi enviado');
    await expect(faixa(page).getByRole('button', { name: 'Tentar de novo' })).toBeVisible();

    await page.locator('#cfg-ia').getByRole('textbox', { name: 'Chave da OpenAI' }).fill('sk-proj-chave-que-nao-pode-vazar-1234');
    await page.locator('#cfg-ia').getByRole('button', { name: 'Conferir e salvar' }).click();
    await page.locator('#cfg-ia').getByRole('button', { name: 'Continuar com o ChatGPT' }).click();

    await estadoFinalEm('o que o impostor da porta recebeu', () => [...new Set(vistos.map(v => v.caminho))].sort(), ['/health', '/pareamento/conferir']);
    expect(JSON.stringify(vistos)).not.toContain('sk-proj-chave-que-nao-pode-vazar');
    expect(context.pages().filter(p => p.url().startsWith('https://auth.openai.com'))).toHaveLength(0);
    expect(fakes.anki.requisicoes).toEqual([]);
    await estadoFinal(extensao, { pm_chave_openai: null });
  });
});

test.describe('uma Conexão de antes do pareamento', () => {
  test.use({ pareada: true });

  test('o 404 no conferir dá o aviso de atualizar e só o Atualizar agora sai para ela, sem assinatura nem dado', async ({ page, extensao, fakes, conexaoDoTeste }) => {
    test.skip(Boolean(conexaoDoTeste), 'a Conexão real tem o pareamento');
    fakes.anki.pareamento.antigo();
    fakes.anki.definirAtualizacao({ ankiweb: 'com_versao_nova' });
    await abrirPainel(page, extensao, '#anki/custos');

    await expect(page.locator('#painel-conexao-versao')).toContainText('A Conexão com o Anki está desatualizada');
    await expect(faixa(page)).toHaveCount(0);
    await estadoFinalEm('os pedidos que a Conexão antiga recebeu', () => [...new Set(fakes.anki.requisicoes.map(r => r.caminho))], ['/health']);

    await page.locator('#painel-conexao-versao').getByRole('button', { name: 'Atualizar agora' }).click();
    await estadoFinalEm('os pedidos que a Conexão antiga recebeu', () => [...new Set(fakes.anki.requisicoes.map(r => r.caminho))].sort(), ['/atualizacao/agora', '/health']);
    expect(fakes.anki.requisicoes.find(r => r.caminho === '/atualizacao/agora').corpo).toBe('{}');
  });
});
