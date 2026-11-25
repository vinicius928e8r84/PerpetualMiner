'use strict';

const { test, expect } = require('../fixtures');
const { AGORA, abrirPainel } = require('../apoio-do-envio');
const { faixa, campo, confirmar } = require('../apoio-do-pareamento');
const { ilha, esperarAsFontes, abrirOCampoDoCodigo } = require('../apoio-visual-do-pareamento');

test.use({ pareada: false });

test.beforeEach(async ({ page, extensao, fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
  fakes.anki.pareamento.sortearCodigo('K7M4PX');
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await page.setViewportSize({ width: 1280, height: 900 });
});

test.fixme('a parear: o aviso Conecte este navegador ao Anki, com Conectar', async ({ page, extensao }) => {
  await abrirPainel(page, extensao, '#anki');
  await expect(faixa(page)).toContainText('Conecte este navegador ao Anki');
  await esperarAsFontes(page);

  await expect(ilha(page)).toHaveScreenshot('pareamento-conectar.png');
});

test.fixme('o código: o campo e Confirmar', async ({ page, extensao }) => {
  await abrirOCampoDoCodigo(page, extensao);
  await expect(campo(page)).toBeFocused();
  await esperarAsFontes(page);

  await expect(ilha(page)).toHaveScreenshot('pareamento-codigo.png');
});

const CODIGO_RECUSADO = [
  {
    nome: 'o código errado: quantas tentativas restam',
    antesDeDigitar: () => {},
    codigo: 'AAA-AAA',
    aviso: 'Código errado. Restam 4 tentativas',
    imagem: 'pareamento-errado.png',
  },
  {
    nome: 'o código venceu: Peça outro, com Conectar',
    antesDeDigitar: fakes => fakes.anki.pareamento.vencerOCodigo(),
    codigo: 'K7M-4PX',
    aviso: 'O código venceu. Peça outro',
    imagem: 'pareamento-venceu.png',
  },
];

for (const { nome, antesDeDigitar, codigo, aviso, imagem } of CODIGO_RECUSADO) {
  test.fixme(nome, async ({ page, extensao, fakes }) => {
    await abrirOCampoDoCodigo(page, extensao);
    antesDeDigitar(fakes);
    await campo(page).fill(codigo);
    await confirmar(page).click();
    await expect(faixa(page)).toContainText(aviso);
    await esperarAsFontes(page);

    await expect(ilha(page)).toHaveScreenshot(imagem);
  });
}

test.describe('a porta que não se confirmou', () => {
  test.use({ pareada: true });

  test.fixme('o aviso Algo na porta do Anki não se confirmou, com Tentar de novo', async ({ page, extensao, context, fakes }) => {
    await context.route(fakes.anki.padrao, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(new URL(route.request().url()).pathname === '/health' ? { ok: true, versao: '9.9.9', perfil: 'X' } : {}) }));
    await abrirPainel(page, extensao, '#anki');
    await expect(faixa(page)).toContainText('Algo na porta do Anki não se confirmou');
    await esperarAsFontes(page);

    await expect(ilha(page)).toHaveScreenshot('pareamento-nao-confirmada.png');
  });
});

test.fixme('o aviso Conectar no tema claro', async ({ page, extensao }) => {
  await extensao.gravarStorage({ pm_tema: 'claro' });
  await abrirPainel(page, extensao, '#anki');
  await expect(faixa(page)).toBeVisible();

  await expect(ilha(page)).toHaveScreenshot('pareamento-conectar-claro.png');
});
