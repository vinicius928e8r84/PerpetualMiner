'use strict';

// “Sincronizado há N min” (CFG-02) conta desde a última vez que o painel ficou em dia. Voltar à aba só confere a
// chave da OpenAI com a Conexão: as frases não foram lidas de novo, então o relógio não recomeça.

const { test, expect } = require('../fixtures');

const estadoDoChip = page => page.locator('#shell-chip-estado');
const sincronizacoesDaChave = fakes => fakes.anki.requisicoes.filter(r => r.caminho === '/ia/openai/sincronizar').length;

// Exceção de teste: sem-estado-guardado — só o texto do relógio muda; nada é gravado ao voltar à aba.
test('voltar à aba do painel não recomeça o “Sincronizado há N min”', async ({ page, extensao, fakes, relogioParado }) => {
  const relogio = await relogioParado();
  await extensao.semearSessao({ displayName: 'Ana Souza' });
  await page.goto(extensao.url('painel.html#configuracoes'));
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
  await relogio.avancar('02:30');
  await expect(estadoDoChip(page)).toHaveText('Sincronizado há 2 min');

  // O Chromium do teste não esconde nem mostra a aba: o teste dispara o `visibilitychange` que o Chrome dispararia
  // quando a pessoa volta a ela, e espera a conferência da chave que ele pede terminar.
  const antes = sincronizacoesDaChave(fakes);
  const conferida = page.waitForResponse(r => new URL(r.url()).pathname === '/ia/openai/sincronizar');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await (await conferida).finished();
  expect(sincronizacoesDaChave(fakes)).toBe(antes + 1);
  await expect(page.locator('#cfg-conta').getByRole('alert')).toHaveCount(0);

  // Mais um minuto: são 3 min e meio desde a sincronização das frases, não 1 min desde a volta à aba.
  await relogio.avancar('01:00');
  await expect(estadoDoChip(page)).toHaveText('Sincronizado há 3 min');
});
