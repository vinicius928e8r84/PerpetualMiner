'use strict';

// Conectar este navegador à Conexão com o Anki (#192, BRG-52, opção A do dono): o código aparece no Anki, a pessoa o digita no Painel, e dali em diante
// cada pedido vai assinado e cada resposta volta provada. A Conexão é o fake da fronteira HTTP (`fakes.anki`, com o pareamento de `fakes/pareamento.js`);
// com `PM_CONEXAO=real` os testes que não dependem de fingir o relógio rodam contra o complemento de verdade (`conexaoDoTeste`), que é a prova do
// protocolo com o Python: `PM_CONEXAO=real node scripts/testar.mjs e2e -- pareamento`. O diálogo do Anki (Qt) não existe aqui: o código "aparece" na janela de
// mentira (`codigoNoAnki`), e a prova dele num Anki de verdade é a prova real (docs/design/pareamento-da-conexao.md § 6).

const { test, expect } = require('../fixtures');
const { estadoFinal, estadoFinalEm } = require('../estado-final');
const { abrirPainel } = require('../apoio-do-envio');
const { faixa, conectar, campo, confirmar, toasts, ponto, codigoNoAnki, quantosPareados, desconectarNoAnki, credencialGuardada, parearPelaTela } = require('../apoio-do-pareamento');

test.use({ pareada: false });

test('sem pareamento, o Painel pede para conectar e nenhum pedido privado sai para a Conexão', async ({ page, extensao, fakes, conexaoDoTeste }) => {
  await abrirPainel(page, extensao, '#anki/custos');

  await expect(faixa(page)).toContainText('Conecte este navegador ao Anki');
  await expect(conectar(page)).toBeVisible();
  // O ponto da Conexão só fica verde com a Conexão provada (desenho § 2): sem pareamento ele diz o que falta, e as telas não fingem erro.
  await expect(ponto(page)).toHaveAttribute('data-estado', 'a_parear');
  await expect(page.locator('#shell-conexao-descricao')).toHaveText('Conecte este navegador ao Anki');
  await expect(page.getByText('Não deu para carregar os custos')).toHaveCount(0);
  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => quantosPareados(fakes, conexaoDoTeste), 0);
  if (!conexaoDoTeste) {
    const caminhos = [...new Set(fakes.anki.requisicoes.map(r => r.caminho))];
    expect(caminhos).toEqual(['/health']);
    expect([...new Set(fakes.anki.pareamento.recebidos().map(r => r.caminho))]).toEqual(['/pareamento/conferir']);   // só o conferir de um navegador que ninguém conhece, para saber se a Conexão é a antiga
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

test('na Boas-vindas, que esconde o resto do Painel, o aviso de conectar aparece no alto dela, e conecta de lá', async ({ page, extensao, fakes, conexaoDoTeste }) => {
  await page.goto(extensao.url('painel.html#boas-vindas'));
  await expect(page.locator('#boas-vindas')).toBeVisible();
  await expect(page.locator('#boas-vindas > #painel-pareamento')).toContainText('Conecte este navegador ao Anki');

  await page.locator('#boas-vindas > #painel-pareamento').getByRole('button', { name: 'Conectar' }).click();
  await expect(campo(page)).toBeVisible();
  await campo(page).fill(await codigoNoAnki(fakes, conexaoDoTeste));
  await confirmar(page).click();

  await expect(faixa(page)).toHaveCount(0);
  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => quantosPareados(fakes, conexaoDoTeste), 1);
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
  await expect(ponto(page)).toHaveAttribute('data-estado', 'ligada');
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
    expect(fakes.anki.pareamento.recebidos().map(r => r.caminho).filter(caminho => caminho !== '/pareamento/conferir').slice(0, 2)).toEqual(['/pareamento/comecar', '/pareamento/concluir']);
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

  await expect(campo(page)).toBeVisible();
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
  await expect(campo(page)).toBeVisible();   // o `comecar` já chegou à Conexão: só então o código existe para ser lido
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
  await expect(campo(page)).toBeVisible();
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

  test('Desconectar navegadores no Anki: a Conexão prova que desconectou, o Painel volta a pedir para conectar, o código pareia de novo e a chave fica', async ({ page, extensao, fakes, conexaoDoTeste }) => {
    test.skip(Boolean(conexaoDoTeste), 'a chave da Conexão real tem o próprio caminho (chave-autoridade.spec.js); o desconectar real é provado em complemento/test_pareamento_revogado.py');
    fakes.anki.guardarChaveNaConexao('9f3a', 3, 'uid-teste', 100, false);
    await abrirPainel(page, extensao, '#anki/custos');
    await expect(ponto(page)).toHaveAttribute('data-estado', 'ligada');
    await expect(faixa(page)).toHaveCount(0);
    const antes = (await credencialGuardada(extensao))?.cliente;
    expect(antes).toMatch(/^[0-9a-f-]{36}$/);

    fakes.anki.pareamento.desconectar();
    await page.reload();

    await expect(faixa(page)).toContainText('Conecte este navegador ao Anki');   // a prova da revogação: só ela devolve o navegador ao Conectar
    await expect(ponto(page)).toHaveAttribute('data-estado', 'a_parear');
    await estadoFinalEm('a credencial que o navegador guarda', () => credencialGuardada(extensao), null);
    await estadoFinalEm('a chave da OpenAI que a Conexão guarda', () => fakes.anki.chaveNaConexao(), 'sk-proj-guardada-antes-9f3a');
    await parearPelaTela(page, fakes, conexaoDoTeste);
    await estadoFinalEm('os navegadores que a Conexão tem pareados', () => fakes.anki.pareamento.pareados().size, 1);
    expect((await credencialGuardada(extensao))?.cliente).not.toBe(antes);
    await expect(ponto(page)).toHaveAttribute('data-estado', 'ligada');
  });
});

test('dois perfis do Chrome pareiam cada um o seu segredo, e o Desconectar do Anki pede o código aos dois', async ({ page, extensao, segundoPerfil, fakes, conexaoDoTeste }) => {
  test.slow();   // quatro pareamentos pela tela, em dois perfis
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
  await parearPelaTela(page, fakes, conexaoDoTeste);
  await parearPelaTela(outra, fakes, conexaoDoTeste);
  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => quantosPareados(fakes, conexaoDoTeste), 2);
});
