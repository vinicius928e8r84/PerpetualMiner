'use strict';

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');
const HOJE = '18/09/2026';

const FRASES = [
  { id: 6, texto: 'She hit the sack early.', data: HOJE, streaming: 'netflix', idioma: 'Inglês', keywords: ['sack@3'], contexto: { fonte: 'netflix', titulo: 'Dark', detalhe: 'T1E3' } },
  { id: 5, texto: 'It costs an arm and a leg.', data: HOJE, streaming: 'youtube', idioma: 'Inglês', contexto: { fonte: 'youtube', titulo: 'Vsauce', detalhe: '' } },
  { id: 4, texto: 'Better late than never.', data: HOJE, streaming: 'web', idioma: 'Inglês', contexto: { fonte: 'web', titulo: 'The Guardian', detalhe: '' } },
  { id: 3, texto: 'Он так и не сказал спасибо.', data: HOJE, streaming: 'livro', idioma: 'Russo', keywords: ['спасибо@10'], contexto: { fonte: 'livro', titulo: 'Мастер и Маргарита', detalhe: 'cap. 3' } },
  { id: 2, texto: 'Мне всё равно.', data: HOJE, streaming: 'youtube', idioma: 'Russo', contexto: { fonte: 'youtube', titulo: 'Russian with Max', detalhe: '' } },
];

const progresso = page => page.getByRole('dialog', { name: 'Enviando ao Anki…' });
const resumo = page => page.getByRole('dialog', { name: /^Envio concluído/ });

test.beforeEach(({ fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
});

async function abrirFrases(page, extensao) {
  await extensao.gravarStorage({ frases: FRASES });
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(extensao.url('painel.html#frases'));
  await expect(page.locator('#frases-lista .veio-frase')).toHaveCount(FRASES.length);
  await page.evaluate(() => document.fonts.ready);
}

async function enviarTodas(page, fakes, n) {
  await page.getByRole('checkbox', { name: 'Selecionar página' }).check();
  await page.locator('#frases-barra').getByRole('button', { name: 'Enviar ao Anki', exact: true }).click();
  await expect(progresso(page)).toBeVisible();
  await expect.poll(() => fakes.anki.requisicoes.filter(r => r.metodo === 'POST' && r.caminho === '/jobs').length).toBe(n);
}

test('o progresso: um Envio andando, o outro que não começou (ENV-03)', async ({ page, extensao, fakes }) => {
  fakes.anki.recusarEnvios('ru');
  await abrirFrases(page, extensao);
  await enviarTodas(page, fakes, 2);
  const [ingles] = fakes.anki.enviosEm('en');
  fakes.anki.moverEnvio(ingles.jobId, {
    stage: 'generate_audio',
    progress: { done: 1, total: 2 },
    atualizadoEm: new Date(AGORA.getTime() - 60_000),
  });
  await expect(progresso(page).getByRole('group', { name: 'Envio em inglês · 3 frases' })).toContainText('Gerando áudio', { timeout: 10_000 });
  await expect(progresso(page).getByRole('group', { name: 'Envio em russo · 2 frases' })).toContainText('A conexão com o Anki respondeu com erro.');

  await expect(page).toHaveScreenshot('envio-progresso.png');
});

test('o progresso: um Envio em parte, com Continuar envio', async ({ page, extensao, fakes }) => {
  await abrirFrases(page, extensao);
  await enviarTodas(page, fakes, 2);
  const [ingles, russo] = fakes.anki.envios;
  fakes.anki.moverEnvio(russo.jobId, { stage: 'send_to_anki' });
  fakes.anki.concluirEnvio(ingles.jobId, { falhas: [5] });
  await expect(progresso(page).getByRole('button', { name: 'Continuar envio' })).toBeVisible({ timeout: 10_000 });

  await expect(page).toHaveScreenshot('envio-em-parte.png');
});

test('o resumo concluído em parte (ENV-10), com Tentar de novo as que falharam', async ({ page, extensao, fakes }) => {
  await abrirFrases(page, extensao);
  await enviarTodas(page, fakes, 2);
  const [ingles, russo] = fakes.anki.envios;
  fakes.anki.concluirEnvio(ingles.jobId, { duplicadas: [4] });
  fakes.anki.concluirEnvio(russo.jobId, { falhas: [2] });
  await expect(resumo(page)).toHaveAccessibleName('Envio concluído em parte', { timeout: 10_000 });

  await expect(page).toHaveScreenshot('envio-resumo-em-parte.png');
});

test('o resumo concluído (ENV-10), aberto em Configurações', async ({ page, extensao, fakes }) => {
  await abrirFrases(page, extensao);
  await enviarTodas(page, fakes, 2);
  await page.keyboard.press('Escape');
  await page.locator('.shell-item[data-area="configuracoes"]').click();
  for (const envio of fakes.anki.envios) fakes.anki.concluirEnvio(envio.jobId);
  await expect(resumo(page)).toHaveAccessibleName('Envio concluído', { timeout: 10_000 });

  await expect(page).toHaveScreenshot('envio-resumo.png');
});

test('Enviar ao Anki indisponível com a Conexão desligada, com o tooltip', async ({ page, extensao, fakes }) => {
  fakes.anki.desligar();
  await abrirFrases(page, extensao);
  await page.getByRole('checkbox', { name: 'Selecionar página' }).check();
  const botao = page.locator('#frases-barra').getByRole('button', { name: 'Enviar ao Anki', exact: true });
  await expect(botao).toHaveAttribute('aria-disabled', 'true');
  await botao.hover();
  await expect(page.getByRole('tooltip')).toBeVisible();

  await expect(page).toHaveScreenshot('envio-indisponivel.png');
});
