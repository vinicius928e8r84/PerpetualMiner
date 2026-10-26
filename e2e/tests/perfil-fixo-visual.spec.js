'use strict';

// Referências visuais do perfil fixo do Anki (#149). As duas telas são novas, então ficam `fixme`, sem PNG, até o dono
// compará-las com o protótipo aprovado do #133 (“B BOA OPÇAO”, Configurações) e com o do #105 (o Envio) e aprovar (regra 10):
// a linha “Perfil do Anki ▾” com o aviso em vermelho, e o cartão do Envio esperando em outro perfil.

const { test, expect } = require('../fixtures');
const { AGORA, INGLESAS, SACK, ARM, abrirPainel, envio, marcarEEnviar, enviosCriados } = require('../apoio-do-envio');

const AGUARDA_O_DONO = 'a referência visual do perfil fixo do Anki espera a aprovação do dono contra os protótipos do #133 e do #105 (regra 10)';

test('Configurações › Conexão com o Anki: a linha Perfil do Anki com o marcado que sumiu', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  fakes.anki.definirPerfis(['Beto', 'Carla'], { marcado: 'Ana', aberto: 'Beto' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(extensao.url('painel.html#configuracoes/anki'));
  await expect(page.locator('#cfg-anki-perfil')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  await expect(page).toHaveScreenshot('configuracoes-perfil-sumiu.png');
});

test('o Envio esperando em outro perfil, com Abrir <perfil>', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  fakes.anki.usarRelogio(() => AGORA);
  fakes.anki.definirPerfis(['Ana', 'Beto'], { marcado: 'Ana', aberto: 'Beto' });
  await extensao.gravarStorage({ frases: INGLESAS });
  await page.setViewportSize({ width: 1280, height: 900 });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, ARM.texto]);
  const [ingles] = await enviosCriados(fakes, 1);
  fakes.anki.moverEnvio(ingles.jobId, { stage: 'wait_anki', esperando: { reason: 'other_profile', profile: 'Beto', marked: 'Ana' }, atualizadoEm: new Date(AGORA.getTime() - 120_000) });
  await expect(envio(page, 'Envio em inglês · 2 frases').getByRole('button', { name: 'Abrir Ana' })).toBeVisible();

  await expect(page).toHaveScreenshot('envio-esperando-o-perfil.png');
});
