'use strict';

const { test, expect } = require('../fixtures');
const { estadoFinal, estadoFinalEm } = require('../estado-final');
const { abrirPainel } = require('../apoio-do-envio');
const { faixa, conectar, campo, confirmar, toasts, ponto, codigoNoAnki, quantosPareados, desconectarNoAnki, credencialGuardada, parearPelaTela } = require('../apoio-do-pareamento');

test.use({ pareada: false });

test('sem pareamento, o Painel pede para conectar e nenhum pedido privado sai para a Conexão', async ({ page, extensao, fakes, conexaoDoTeste }) => {
  await abrirPainel(page, extensao, '#anki/custos');

  await expect(faixa(page)).toContainText('Conecte este navegador ao Anki');
  await expect(conectar(page)).toBeVisible();
  await expect(ponto(page)).toHaveAttribute('data-estado', 'a_parear');
  await expect(page.locator('#shell-conexao-descricao')).toHaveText('Conecte este navegador ao Anki');
  await expect(page.getByText('Não deu para carregar os custos')).toHaveCount(0);
  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => quantosPareados(fakes, conexaoDoTeste), 0);
  if (!conexaoDoTeste) {
    const caminhos = [...new Set(fakes.anki.requisicoes.map(r => r.caminho))];
    expect(caminhos).toEqual(['/health']);
    expect([...new Set(fakes.anki.pareamento.recebidos().map(r => r.caminho))]).toEqual(['/pareamento/conferir']);
  }
  expect(await credencialGuardada(extensao)).toBeNull();
});

test('sem pareamento, a chave colada não sai: o card da IA diz para conectar este navegador, com Conectar, e não que a Conexão não respondeu', async ({ page, extensao, fakes, conexaoDoTeste }) => {
  await abrirPainel(page, extensao, '#configuracoes/ia');
  await expect(faixa(page)).toContainText('Conecte este navegador ao Anki');

  await page.locator('#cfg-ia').getByRole('textbox', { name: 'Chave da OpenAI' }).fill('sk-proj-chave-que-nao-pode-sair-5678');
  await page.locator('#cfg-ia').getByRole('button', { name: 'Conferir e salvar' }).click();

  const erro = page.locator('#cfg-ia').getByRole('alert');
  await expect(erro).toContainText('Este navegador ainda não está conectado ao Anki');
  await expect(erro).not.toContainText('não respondeu');
  await expect(erro).not.toContainText('sessão');
  await expect(erro.getByRole('button', { name: 'Conectar' })).toBeVisible();
  await estadoFinal(extensao, { pm_chave_openai: null });
  if (!conexaoDoTeste) expect(JSON.stringify(fakes.anki.requisicoes)).not.toContain('sk-proj-chave-que-nao-pode-sair');
});

test('na Boas-vindas, o passo 5 sem pareamento diz para conectar este navegador; Conectar leva ao código e, conectado, a mesma chave é conferida', async ({ page, extensao, fakes, conexaoDoTeste }) => {
  await page.goto(extensao.url('painel.html#boas-vindas/ia'));
  const cartao = page.locator('.bv-card');
  await page.getByRole('textbox', { name: 'Chave da OpenAI' }).fill('sk-proj-chave-de-exemplo-AbCd');
  await page.getByRole('button', { name: 'Conferir e salvar' }).click();

  const erro = cartao.getByRole('alert').filter({ hasText: 'Chave da OpenAI:' });
  await expect(erro).toContainText('Este navegador ainda não está conectado ao Anki');
  await erro.getByRole('button', { name: 'Conectar' }).click();
  await expect(campo(page)).toBeFocused();
  await campo(page).fill(await codigoNoAnki(fakes, conexaoDoTeste));
  await confirmar(page).click();

  await expect(faixa(page)).toHaveCount(0);
  await expect(erro).toHaveCount(0);
  await page.getByRole('button', { name: 'Conferir e salvar' }).click();
  await expect(cartao).toContainText('••••••••AbCd');
  await estadoFinal(extensao, { pm_chave_openai: { ultimos4: 'AbCd' } });
});

test('na Boas-vindas, o passo 4 pede o pareamento dentro dele e só fica feito depois de conectar', async ({ page, extensao, fakes, conexaoDoTeste }) => {
  await page.goto(extensao.url('painel.html#boas-vindas/anki'));
  const itemDoPasso = page.getByRole('navigation', { name: 'Passos da configuração' }).getByRole('button', { name: /^Ligar a Conexão com o Anki/ });
  await expect(page.locator('#boas-vindas .bv-card #painel-pareamento')).toContainText('Conecte este navegador ao Anki');
  await expect(page.locator('#boas-vindas > #painel-pareamento')).toHaveCount(0);
  await expect(itemDoPasso).not.toHaveAccessibleName(/feito$/);

  await parearPelaTela(page, fakes, conexaoDoTeste);

  await expect(itemDoPasso).toHaveAccessibleName(/feito$/);
  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => quantosPareados(fakes, conexaoDoTeste), 1);
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
  await expect(page.locator('body')).not.toContainText(codigo);
  await campo(page).fill(codigo);
  await confirmar(page).click();

  await expect(faixa(page)).toHaveCount(0);
  await expect(toasts(page)).toContainText('Conexão com o Anki: ligada');
  await expect(ponto(page)).toHaveAttribute('data-estado', 'ligada');
  await page.getByRole('radio', { name: 'Custos' }).check();
  await expect(conexaoDoTeste ? page.getByText('Nenhum envio neste período.') : page.getByRole('listbox', { name: 'Envios recentes' })).toBeVisible();
  await expect(page.getByText('Não deu para carregar os custos')).toHaveCount(0);
  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => quantosPareados(fakes, conexaoDoTeste), 1);
  const guardada = await credencialGuardada(extensao);
  expect(guardada).toMatchObject({ extraivel: false, usos: ['sign'] });
  expect(guardada.cliente).toMatch(/^[0-9a-f-]{36}$/);
  await estadoFinal(extensao, { pm_anki_ja_conectou: true });
  const tudoNoStorage = JSON.stringify(await extensao.lerStorage(null));
  expect(tudoNoStorage).not.toContain(guardada.cliente);
  if (!conexaoDoTeste) {
    const [segredo] = fakes.anki.pareamento.pareados().values();
    expect(tudoNoStorage).not.toContain(segredo);
    expect(JSON.stringify(fakes.anki.requisicoes)).not.toContain(segredo);
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
  expect(await codigoNoAnki(fakes, conexaoDoTeste)).toBeNull();
  await parearPelaTela(page, fakes, conexaoDoTeste);
  expect(morto).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  await estadoFinalEm('os navegadores que a Conexão tem pareados', () => quantosPareados(fakes, conexaoDoTeste), 1);
});

test('o código que o Anki fechou com Cancelar não vale mais', async ({ page, extensao, fakes, conexaoDoTeste }) => {
  await abrirPainel(page, extensao, '#frases');
  await conectar(page).click();
  await expect(campo(page)).toBeVisible();
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
    fakes.anki.guardarChaveNaConexao('9f3a', { versao: 3, conta: 'uid-teste', em: 100, naoEnviada: false });
    await abrirPainel(page, extensao, '#anki/custos');
    await expect(ponto(page)).toHaveAttribute('data-estado', 'ligada');
    await expect(faixa(page)).toHaveCount(0);
    const antes = (await credencialGuardada(extensao))?.cliente;
    expect(antes).toMatch(/^[0-9a-f-]{36}$/);

    fakes.anki.pareamento.desconectar();
    await page.reload();

    await expect(faixa(page)).toContainText('Conecte este navegador ao Anki');
    await expect(ponto(page)).toHaveAttribute('data-estado', 'a_parear');
    await estadoFinalEm('a credencial que o navegador guarda', () => credencialGuardada(extensao), null);
    await estadoFinalEm('a chave da OpenAI que a Conexão guarda', () => fakes.anki.chaveNaConexao(), 'sk-proj-guardada-antes-9f3a');
    await parearPelaTela(page, fakes, conexaoDoTeste);
    await estadoFinalEm('os navegadores que a Conexão tem pareados', () => fakes.anki.pareamento.pareados().size, 1);
    expect((await credencialGuardada(extensao))?.cliente).not.toBe(antes);
    await expect(ponto(page)).toHaveAttribute('data-estado', 'ligada');
  });

  test('a Conexão que perdeu o navegador sem o desconectar (reinstalada, outro Anki): o Painel oferece Conectar, a credencial fica até o código do Anki valer, e o código pareia de novo', async ({ page, extensao, fakes, conexaoDoTeste }) => {
    test.skip(Boolean(conexaoDoTeste), 'a Conexão real que não conhece o navegador responde pairing_required: provado em complemento/test_pareamento.py');
    await abrirPainel(page, extensao, '#frases');
    await expect(ponto(page)).toHaveAttribute('data-estado', 'ligada');
    const antes = (await credencialGuardada(extensao))?.cliente;
    expect(antes).toMatch(/^[0-9a-f-]{36}$/);

    fakes.anki.pareamento.perderOsNavegadores();
    await page.reload();

    await expect(faixa(page)).toContainText('Conecte este navegador ao Anki');
    await expect(conectar(page)).toBeVisible();
    await expect(ponto(page)).toHaveAttribute('data-estado', 'a_parear');
    await estadoFinalEm('os caminhos de pareamento que a Conexão recebeu', () => [...new Set(fakes.anki.pareamento.recebidos().map(r => r.caminho))], ['/pareamento/conferir']);
    await estadoFinalEm('a credencial que o navegador guarda', async () => (await credencialGuardada(extensao))?.cliente, antes);

    await conectar(page).click();
    await expect(campo(page)).toBeVisible();
    await campo(page).fill('AAA-AAA');
    await confirmar(page).click();
    await expect(faixa(page)).toContainText('Código errado. Restam 4 tentativas');
    await estadoFinalEm('os navegadores que a Conexão tem pareados', () => fakes.anki.pareamento.pareados().size, 0);
    await estadoFinalEm('a credencial que o navegador guarda', async () => (await credencialGuardada(extensao))?.cliente, antes);

    await campo(page).fill(fakes.anki.pareamento.codigoNoAnki());
    await confirmar(page).click();
    await expect(faixa(page)).toHaveCount(0);
    await estadoFinalEm('os navegadores que a Conexão tem pareados', () => fakes.anki.pareamento.pareados().size, 1);
    await expect(ponto(page)).toHaveAttribute('data-estado', 'ligada');
  });

  test('pareado com a base 1, depois com a base 2: voltar à base 1 oferece Conectar, e depois do Desconectar também', async ({ page, extensao, fakes, conexaoDoTeste }) => {
    test.skip(Boolean(conexaoDoTeste), 'a segunda base é o fake que troca os navegadores que a Conexão conhece');
    await abrirPainel(page, extensao, '#frases');
    await expect(ponto(page)).toHaveAttribute('data-estado', 'ligada');

    fakes.anki.pareamento.perderOsNavegadores();
    await page.reload();
    await parearPelaTela(page, fakes, conexaoDoTeste);
    await expect(ponto(page)).toHaveAttribute('data-estado', 'ligada');

    fakes.anki.pareamento.perderOsNavegadores();
    fakes.anki.pareamento.parear('primeiro');
    await page.reload();
    await expect(faixa(page)).toContainText('Conecte este navegador ao Anki');
    await expect(conectar(page)).toBeVisible();
    await expect(ponto(page)).toHaveAttribute('data-estado', 'a_parear');

    fakes.anki.pareamento.desconectar();
    await page.reload();
    await expect(faixa(page)).toContainText('Conecte este navegador ao Anki');
    await expect(conectar(page)).toBeVisible();
    await estadoFinalEm('os navegadores que a Conexão tem pareados', () => fakes.anki.pareamento.pareados().size, 0);
  });
});

test('dois perfis do Chrome pareiam cada um o seu segredo, e o Desconectar do Anki pede o código aos dois', async ({ page, extensao, segundoPerfil, fakes, conexaoDoTeste }) => {
  test.slow();
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
