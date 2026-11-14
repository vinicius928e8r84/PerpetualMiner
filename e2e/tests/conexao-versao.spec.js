'use strict';

// A versão da Conexão com o Anki no alto do Painel (#177, BRG-50). A Conexão se atualiza sozinha pelo AnkiWeb; a extensão lê a versão
// e a atualização na saúde e só fala em três casos: velha demais (Atualizar agora), falhou (Tentar de novo) e atualizada (discreto).
// A Conexão é o fake da fronteira HTTP (`fakes.anki`, que responde pelos exemplos de `complemento/contrato/exemplos-da-atualizacao.json`);
// `fakes.anki.atualizacao.definir({ versao, versaoNova })` põe as versões que o teste quer. Reiniciar o Anki é o clique que fecha o Anki e o
// abridor de mentira (`fakes.abridor`) o abre de novo: o fake cala por alguns segundos e volta na versão nova.

const { test, expect } = require('../fixtures');
const { estadoFinal, estadoFinalEm } = require('../estado-final');
const { abrirPainel } = require('../apoio-do-envio');

const VELHA = 'A Conexão com o Anki está desatualizada · O Envio espera. Suas frases estão guardadas.';
const aviso = page => page.locator('#painel-conexao-versao');
const ligada = page => expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');
const aberturas = fakes => fakes.abridor.pedidos().filter(p => p.mensagem.acao === 'abrir');

test.beforeEach(async ({ extensao }) => {
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
});

test.describe('mais nova, ou velha mas funcionando: nada aparece', () => {
  for (const versao of ['0.4.0', '0.4.2', '1.0.0']) {
    test(`a Conexão ${versao} não ganha aviso`, async ({ page, extensao, fakes }) => {
      fakes.anki.atualizacao.definir({ versao });
      await abrirPainel(page, extensao);

      await ligada(page);
      await expect(aviso(page)).toHaveCount(0);
    });
  }

  test('uma tentativa de atualizar que falhou sozinha, com a Conexão ainda funcionando, não ganha aviso', async ({ page, extensao, fakes }) => {
    fakes.anki.atualizacao.definir({ versao: '0.4.2' });
    fakes.anki.definirAtualizacao({ atualizacao: 'falhou' });
    await abrirPainel(page, extensao);

    await ligada(page);
    await expect(aviso(page)).toHaveCount(0);
  });
});

test('velha demais: diz que o Envio espera e que as frases estão guardadas, com Atualizar agora', async ({ page, extensao, fakes }) => {
  fakes.anki.atualizacao.definir({ versao: '0.3.9' });
  await abrirPainel(page, extensao);

  await expect(aviso(page)).toContainText(VELHA);
  await expect(aviso(page).getByRole('button', { name: 'Atualizar agora' })).toBeVisible();
  await expect(aviso(page).getByRole('button', { name: 'Reiniciar o Anki' })).toHaveCount(0);
});

test('Atualizar agora instala a versão nova e chama Reiniciar o Anki, porque a extensão a precisa na hora', async ({ page, extensao, fakes }) => {
  fakes.anki.atualizacao.definir({ versao: '0.3.9', versaoNova: '0.4.5' });
  fakes.anki.definirAtualizacao({ ankiweb: 'com_versao_nova' });
  await abrirPainel(page, extensao);

  await aviso(page).getByRole('button', { name: 'Atualizar agora' }).click();

  await expect(aviso(page)).toContainText('Conexão atualizada · 0.4.5. Reinicie o Anki para ela valer agora.');
  await expect(aviso(page).getByRole('button', { name: 'Reiniciar o Anki' })).toBeVisible();
  await estadoFinalEm('quantas vezes a Conexão fechou o Anki (nenhuma: a pessoa ainda não pediu)', () => fakes.anki.atualizacao.reinicios(), 0);
});

test.describe('com a permissão do abridor', () => {
  test.use({ permissaoDoAbridor: true });

  test('Reiniciar o Anki fecha o Anki, o abridor o abre de novo e a Conexão volta atualizada, com um aviso discreto que só aparece uma vez', async ({ page, extensao, fakes }) => {
    test.setTimeout(60_000);
    fakes.anki.atualizacao.definir({ versao: '0.3.9', versaoNova: '0.4.5' });
    fakes.anki.definirAtualizacao({ atualizacao: 'instalada', ankiweb: 'com_versao_nova' });
    await abrirPainel(page, extensao);
    await expect(aviso(page)).toContainText('Conexão atualizada · 0.4.5. Reinicie o Anki para ela valer agora.');

    await aviso(page).getByRole('button', { name: 'Reiniciar o Anki' }).click();

    await expect(aviso(page)).toContainText('Reiniciando o Anki…');
    await expect(aviso(page)).toContainText('Conexão atualizada · 0.4.5', { timeout: 30_000 });
    await expect(aviso(page)).not.toContainText('Reinicie');
    expect(aberturas(fakes)).toHaveLength(1);
    await estadoFinalEm('quantas vezes a Conexão fechou o Anki', () => fakes.anki.atualizacao.reinicios(), 1);
    await estadoFinal(extensao, { pm_conexao_atualizada_vista: '0.4.5' });

    await page.reload();
    await ligada(page);
    await expect(aviso(page)).toHaveCount(0);
  });

  test('o Anki fecha no Reiniciar e não volta: o aviso segue dizendo que está reiniciando e termina em “Não deu para reiniciar”, sem a Conexão; aberto à mão, a Conexão volta atualizada', async ({ page, extensao, fakes }) => {
    test.setTimeout(90_000);
    fakes.anki.atualizacao.definir({ versao: '0.3.9', versaoNova: '0.4.5' });
    fakes.anki.definirAtualizacao({ atualizacao: 'instalada', ankiweb: 'com_versao_nova' });
    fakes.abridor.definir('achei_sem_abrir');   // o abridor acha o Anki e não consegue abri-lo
    await abrirPainel(page, extensao);
    await aviso(page).getByRole('button', { name: 'Reiniciar o Anki' }).click();
    await expect(aviso(page)).toContainText('Reiniciando o Anki…');
    // O Anki fechou e não volta: a porta fica muda (o fake, sozinho, religaria em 4 s como se o abridor o tivesse aberto).
    await expect.poll(() => fakes.anki.atualizacao.reinicios()).toBe(1);
    fakes.anki.silenciar();

    // A Conexão calou, e é o reinício que a calou: o aviso é dele do clique até o desfecho.
    await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'desligada', { timeout: 15_000 });
    await expect(aviso(page)).toContainText('Reiniciando o Anki…');
    await expect(aviso(page)).toContainText('Não deu para reiniciar o Anki. Feche e abra de novo.', { timeout: 30_000 });
    await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'desligada');
    await expect(aviso(page).getByRole('button')).toHaveCount(0);   // sem a Conexão não há a quem pedir o reinício
    expect(aberturas(fakes)).toHaveLength(1);

    // A pessoa abre o Anki à mão: a Conexão volta na versão nova e o erro sai.
    fakes.anki.voltarAFalar();
    await expect(aviso(page)).toContainText('Conexão atualizada · 0.4.5', { timeout: 30_000 });
    await expect(aviso(page)).not.toContainText('Não deu');
    await estadoFinalEm('quantas vezes a Conexão fechou o Anki', () => fakes.anki.atualizacao.reinicios(), 1);
    await estadoFinal(extensao, { pm_conexao_atualizada_vista: '0.4.5' });
  });
});

test('sem a permissão do abridor o Anki não é fechado: ninguém o abriria de volta, e a tela diz o que fazer', async ({ page, extensao, fakes }) => {
  fakes.anki.atualizacao.definir({ versao: '0.3.9', versaoNova: '0.4.5' });
  fakes.anki.definirAtualizacao({ atualizacao: 'instalada' });
  await abrirPainel(page, extensao);
  // O Chrome pergunta pela permissão no clique e o Playwright não alcança o aviso dele: o clique sem a permissão dada é a recusa.
  await page.evaluate(() => { chrome.permissions.request = async () => false; });

  await aviso(page).getByRole('button', { name: 'Reiniciar o Anki' }).click();

  await expect(aviso(page)).toContainText('Feche o Anki e abra de novo para a Conexão nova valer.');
  await estadoFinalEm('quantas vezes a Conexão fechou o Anki (nenhuma)', () => fakes.anki.atualizacao.reinicios(), 0);
});

test('a atualização falhou: diz em que versão a Conexão segue e Tentar de novo resolve', async ({ page, extensao, fakes }) => {
  fakes.anki.atualizacao.definir({ versao: '0.3.9', versaoNova: '0.4.5' });
  fakes.anki.definirAtualizacao({ ankiweb: 'recusa' });
  await abrirPainel(page, extensao);
  await aviso(page).getByRole('button', { name: 'Atualizar agora' }).click();

  await expect(aviso(page)).toContainText('A Conexão com o Anki segue na versão 0.3.9. Não deu para atualizar agora.');
  fakes.anki.definirAtualizacao({ ankiweb: 'com_versao_nova' });
  await aviso(page).getByRole('button', { name: 'Tentar de novo' }).click();

  await expect(aviso(page)).toContainText('Conexão atualizada · 0.4.5. Reinicie o Anki para ela valer agora.');
  await estadoFinalEm('quantas vezes a Conexão fechou o Anki (nenhuma)', () => fakes.anki.atualizacao.reinicios(), 0);
});

test('uma Conexão que não diz a versão é a de antes da saúde dizê-la: velha demais', async ({ page, extensao, fakes }) => {
  fakes.anki.responder('GET', '/health', () => ({ json: { ok: true } }));
  await abrirPainel(page, extensao);

  await expect(aviso(page)).toContainText(VELHA);
});

test('a Conexão acabou de ser atualizada: um aviso discreto com a versão, que a pessoa fecha e não volta', async ({ page, extensao, fakes }) => {
  fakes.anki.atualizacao.definir({ versao: '0.4.5' });
  fakes.anki.definirAtualizacao({ atualizacao: 'atualizada' });
  await abrirPainel(page, extensao);

  await expect(aviso(page)).toContainText('Conexão atualizada · 0.4.5');
  await expect(aviso(page).getByRole('button', { name: 'Atualizar agora' })).toHaveCount(0);
  await aviso(page).getByRole('button', { name: 'Fechar' }).click();

  await expect(aviso(page)).toHaveCount(0);
  await estadoFinal(extensao, { pm_conexao_atualizada_vista: '0.4.5' });
});
