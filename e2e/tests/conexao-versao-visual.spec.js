'use strict';

// Referência visual da versão da Conexão com o Anki (#177, BRG-50): o aviso no alto do Painel nos quatro estados (velha demais, falhou,
// atualizada e a que pede Reiniciar o Anki) e no tema claro. Não há protótipo para ele: o desenho segue os avisos do Painel
// (`docs/design/painel/anki/prototipo-anki.html`, como o aviso do teto do mês). É PROPOSTA para o dono comparar e aprovar (CODING_STANDARDS
// regra 10): as imagens não estão na árvore. Aprovando: tirar o `fixme`, rodar
//
//   cd e2e && npx playwright test conexao-versao-visual --update-snapshots
//
// e anotar a aprovação em e2e/aprovados-visuais.json.

const { test, expect } = require('../fixtures');
const { AGORA, abrirPainel } = require('../apoio-do-envio');

const aviso = page => page.locator('#painel-conexao-versao');
const ilha = page => page.locator('.shell-conteudo');

test.beforeEach(async ({ page, extensao, fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await page.setViewportSize({ width: 1280, height: 900 });
});

test.fixme('a Conexão velha demais: o aviso com Atualizar agora', async ({ page, extensao, fakes }) => {
  fakes.anki.atualizacao.definir({ versao: '0.3.9' });
  await abrirPainel(page, extensao, '#anki');
  await expect(aviso(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  await expect(ilha(page)).toHaveScreenshot('conexao-velha.png');
});

test.fixme('a atualização falhou: a Conexão segue na versão X, com Tentar de novo', async ({ page, extensao, fakes }) => {
  fakes.anki.atualizacao.definir({ versao: '0.3.9' });
  fakes.anki.definirAtualizacao({ atualizacao: 'falhou' });
  await abrirPainel(page, extensao, '#anki');
  await expect(aviso(page)).toContainText('segue na versão 0.3.9');
  await page.evaluate(() => document.fonts.ready);

  await expect(ilha(page)).toHaveScreenshot('conexao-falhou.png');
});

test.fixme('a versão nova já está no Anki: o aviso com Reiniciar o Anki', async ({ page, extensao, fakes }) => {
  fakes.anki.atualizacao.definir({ versao: '0.3.9', versaoNova: '0.4.5' });
  fakes.anki.definirAtualizacao({ atualizacao: 'instalada' });
  await abrirPainel(page, extensao, '#anki');
  await expect(aviso(page)).toContainText('Reinicie o Anki');
  await page.evaluate(() => document.fonts.ready);

  await expect(ilha(page)).toHaveScreenshot('conexao-reiniciar.png');
});

test.fixme('a Conexão atualizada: o aviso discreto com a versão', async ({ page, extensao, fakes }) => {
  fakes.anki.atualizacao.definir({ versao: '0.4.5' });
  fakes.anki.definirAtualizacao({ atualizacao: 'atualizada' });
  await abrirPainel(page, extensao, '#anki');
  await expect(aviso(page)).toContainText('Conexão atualizada · 0.4.5');
  await page.evaluate(() => document.fonts.ready);

  await expect(ilha(page)).toHaveScreenshot('conexao-atualizada.png');
});

test.fixme('a Conexão velha demais no tema claro', async ({ page, extensao, fakes }) => {
  fakes.anki.atualizacao.definir({ versao: '0.3.9' });
  await extensao.gravarStorage({ pm_tema: 'claro' });
  await abrirPainel(page, extensao, '#anki');
  await expect(aviso(page)).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('conexao-velha-claro.png');
});
