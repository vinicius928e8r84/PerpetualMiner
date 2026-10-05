'use strict';

// O contrato da Conexão com o Anki (o complemento do Anki em 127.0.0.1:8766), visto
// da extensão. Os exemplos de `complemento/contrato/exemplos.json` são lidos pelos
// dois lados: os testes do complemento (`python3 complemento/test_servidor.py`)
// conferem o servidor real contra eles, e este arquivo confere o fake do e2e, que é
// o que todos os outros testes da extensão usam no lugar da Conexão.
//
// Os exemplos de outra origem ou de outra página só valem no lado do complemento:
// uma página da extensão não consegue mandar o pedido como se fosse de outro site.
// O que o Chrome manda de verdade (o GET da extensão sem `Origin`, o POST com ela)
// está em `complemento/contrato/LEIA-ME.md`.

const { test, expect } = require('../fixtures');
const contrato = require('../../complemento/contrato/exemplos.json');
const { exemploDaExtensao, diferencaDoContrato } = require('../fakes/anki');

const daExtensao = contrato.exemplos.filter(exemploDaExtensao);

test('o contrato fala da origem da extensão que o Chromium carregou', async ({ extensao }) => {
  expect(contrato.origemDaExtensao).toBe(`chrome-extension://${extensao.id}`);
});

for (const exemplo of daExtensao) {
  test(`o fake da Conexão responde o exemplo do contrato: ${exemplo.nome}`, async ({ page, extensao, fakes }) => {
    fakes.anki.abrirPerfil(exemplo.contexto.perfil);
    if (exemplo.contexto.falhaNoPerfil) fakes.anki.falharLeituraDoPerfil();
    if ('colecao' in exemplo.contexto) fakes.anki.abrirColecao(exemplo.contexto.colecao);
    await page.goto(extensao.url('painel.html'));

    const resposta = await page.evaluate(async ({ metodo, caminho, corpo }) => {
      const r = await fetch(`http://127.0.0.1:8766${caminho}`, {
        method: metodo,
        ...(corpo !== undefined && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }),
      });
      return { status: r.status, json: await r.json() };
    }, exemplo.pedido);

    const mensagem = `O fake (e2e/fakes/anki.js) e o contrato (complemento/contrato/exemplos.json) se separaram no exemplo "${exemplo.nome}". `
      + 'Se a mudança é de propósito, atualize o exemplo; os testes do complemento leem o mesmo arquivo.';
    expect(resposta.status, mensagem).toBe(exemplo.resposta.status);
    expect(diferencaDoContrato(resposta.json, exemplo.resposta.json), mensagem).toBeNull();
  });
}

test('com a Conexão respondendo a saúde do contrato, a área Conexão com o Anki aparece ligada', async ({ page, extensao }) => {
  await page.goto(extensao.url('painel.html#anki/custos'));
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');
});
