'use strict';

// Referência visual do Envio ao Anki (#32): o modal de progresso, o resumo e o
// Enviar ao Anki indisponível, no layout A do protótipo travado
// (docs/design/painel/frases/prototipo-frases.html?variant=A, “⚙ Estados do
// protótipo” › Envio ao Anki termina). O dono revisa estas telas lado a lado
// com o protótipo; depois de aprovadas, uma mudança visual faz o teste falhar
// até alguém olhar e atualizar a referência:
//
//   cd e2e && npx playwright test painel-envio-visual --update-snapshots

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

// AGUARDANDO A APROVAÇÃO DO DONO (CODING_STANDARDS regra 10, #151): o Envio parado porque o Anki fechou é tela nova, e Tentar de novo
// tomou o lugar de Continuar envio nos cartões que terminaram em parte ou não concluídos. As referências só entram depois que ele
// aprova; aprovadas: tire o `test.fixme`, rode com --update-snapshots e anote a aprovação em e2e/aprovados-visuais.json.
const AGUARDA_O_DONO = 'a referência visual espera a aprovação do dono (regra 10)';

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
  await expect(progresso(page).getByRole('group', { name: 'Envio em russo · 2 frases' })).toContainText('A Conexão com o Anki respondeu com erro.');

  await expect(page).toHaveScreenshot('envio-progresso.png');
});

test('o progresso: um Envio em parte, com Tentar de novo', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirFrases(page, extensao);
  await enviarTodas(page, fakes, 2);
  const [ingles, russo] = fakes.anki.envios;
  fakes.anki.moverEnvio(russo.jobId, { stage: 'send_to_anki' });
  fakes.anki.concluirEnvio(ingles.jobId, { falhas: [5] });
  await expect(progresso(page).getByRole('button', { name: 'Tentar de novo' })).toBeVisible({ timeout: 10_000 });

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

// #142: o Envio dentro da Conexão com o Anki. O dono aprovou as duas telas como referência (#269, 2026-10-26); o
// Envio com um código da Conexão fica assim até o #173 e o #177 trazerem o texto de o que fazer.

test('o Envio esperando o Anki: a coleção fechada ou sincronizando, e a Conexão espera', async ({ page, extensao, fakes }) => {
  await abrirFrases(page, extensao);
  await enviarTodas(page, fakes, 2);
  const [ingles, russo] = fakes.anki.envios;
  fakes.anki.moverEnvio(ingles.jobId, { stage: 'wait_anki', atualizadoEm: new Date(AGORA.getTime() - 120_000) });
  fakes.anki.moverEnvio(russo.jobId, { stage: 'wait_anki', atualizadoEm: new Date(AGORA.getTime() - 120_000) });
  await expect(progresso(page).getByText('Esperando o Anki')).toHaveCount(2, { timeout: 10_000 });

  await expect(page).toHaveScreenshot('envio-esperando-o-anki.png');
});

test('o Envio com um código da Conexão: um Cartão não entrou, Tentar de novo e o código em Detalhes', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  // Uma Conexão de antes do Envio (≤ 0.2.0) não tem a rota: o russo não começa, com o 404 em Detalhes.
  fakes.anki.recusarEnvios('ru', { status: 404, erro: 'not_found' });
  // O id do Envio aparece em Detalhes: fixo, para a referência não mudar a cada execução.
  await page.addInitScript(() => {
    let n = 0;
    crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  });
  await abrirFrases(page, extensao);
  await enviarTodas(page, fakes, 2);
  const [ingles] = fakes.anki.enviosEm('en');
  fakes.anki.concluirEnvio(ingles.jobId, { erro: 'openai_key_missing' });
  await expect(progresso(page).getByRole('button', { name: 'Tentar de novo' })).toBeVisible({ timeout: 10_000 });
  for (const detalhes of await progresso(page).locator('summary').all()) await detalhes.click();

  await expect(page).toHaveScreenshot('envio-codigo-da-conexao.png');
});

// #150: o Envio com o Anki fechado, aprovado pelo dono contra o protótipo do #105 (o Envio esperando o Anki).
const faixaDoAnkiFechado = page => page.locator('#frases-avisos [data-aviso="envio-anki-fechado"]');

async function enviarComOAnkiFechado(page, extensao, fakes) {
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  fakes.anki.desligar();
  await abrirFrases(page, extensao);
  await page.getByRole('checkbox', { name: 'Selecionar página' }).check();
  await page.locator('#frases-barra').getByRole('button', { name: 'Enviar ao Anki', exact: true }).click();
}

test.describe('com a permissão do abridor', () => {
  test.use({ permissaoDoAbridor: true });

  test('Enviar com o Anki fechado: a faixa “Abrindo o Anki para enviar…”', async ({ page, extensao, fakes }) => {
    await enviarComOAnkiFechado(page, extensao, fakes);
    await expect(faixaDoAnkiFechado(page)).toHaveText('Abrindo o Anki para enviar…');

    await expect(page).toHaveScreenshot('envio-abrindo-o-anki.png');
  });
});

test('Enviar com o Anki fechado e sem a permissão: a faixa “Abra o Anki para enviar” com o botão Abrir o Anki sozinho', async ({ page, extensao, fakes }) => {
  await enviarComOAnkiFechado(page, extensao, fakes);
  await expect(faixaDoAnkiFechado(page).getByRole('button', { name: 'Abrir o Anki sozinho' })).toBeVisible();

  await expect(page).toHaveScreenshot('envio-abra-o-anki.png');
});

// #151: o Envio parado porque a pessoa fechou o Anki: a frase com a contagem e o Continuar envio.
test('o Envio parado porque o Anki fechou: “3 de 10 no Anki” e Continuar envio', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await extensao.gravarStorage({ pm_anki_ja_conectou: true });
  await abrirFrases(page, extensao);
  await enviarTodas(page, fakes, 2);
  const [ingles, russo] = fakes.anki.envios;
  const cartoes = (frase, prontos, de) => Object.fromEntries(Array.from({ length: de }, (_, i) => [`${frase}-${i}`, i < prontos ? 'added' : 'pending']));
  fakes.anki.moverEnvio(ingles.jobId, { stage: 'generate_cards', cartoes: cartoes(6, 3, 10), atualizadoEm: new Date(AGORA.getTime() - 60_000) });
  fakes.anki.moverEnvio(russo.jobId, { stage: 'generate_cards', cartoes: cartoes(3, 1, 2), atualizadoEm: new Date(AGORA.getTime() - 60_000) });
  await expect(progresso(page).getByText('Criando cartões')).toHaveCount(2, { timeout: 10_000 });
  fakes.anki.desligar();
  await expect(progresso(page).getByText('Quando o Anki abrir, o Envio continua sozinho.')).toHaveCount(2, { timeout: 20_000 });

  await expect(page).toHaveScreenshot('envio-parado.png');
});

// #156: o Envio que o plano do ChatGPT parou no primeiro limite de uso. O protótipo é o P3 do #105 (“Limite de uso atingido”, com Gerenciar uso);
// a cópia que não diz que a cota acabou é do catálogo (ENV-19) e espera o olhar do dono.
test('o Envio que o plano do ChatGPT parou no limite de uso: o resumo com Gerenciar uso e Tentar de novo', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await abrirFrases(page, extensao);
  await enviarTodas(page, fakes, 2);
  const [ingles, russo] = fakes.anki.envios;
  fakes.anki.concluirEnvio(ingles.jobId, { erro: 'chatgpt_usage_limit' });
  fakes.anki.concluirEnvio(russo.jobId);
  await expect(resumo(page)).toContainText('Gerenciar uso', { timeout: 10_000 });

  await expect(page).toHaveScreenshot('envio-limite-do-plano.png');
});
