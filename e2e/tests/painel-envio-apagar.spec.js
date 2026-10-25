'use strict';

const { test, expect } = require('../fixtures');
const { AGORA, frase, INGLESAS, RUSSA, SACK, ARM, abrirPainel, progresso, resumo, envio, marcarEEnviar, enviosCriados, pedirConferenciaDaConexao, umaVoltaDoEnvio } = require('../apoio-do-envio');

test.beforeEach(({ fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
});

const SENTINELA = 'zymurgyxq';

test('Apagar tudo tira a Palavra e a Frase do que o painel guarda do Envio e da Conexão, e o Tentar de novo não as reenvia', async ({ page, extensao, fakes }) => {
  const sentinela = frase(1_700_000_000_099, `The ${SENTINELA} vat bubbled all night.`, { keywords: [`${SENTINELA}@1`] });
  await extensao.gravarStorage({ frases: [sentinela] });
  fakes.anki.perderARespostaDoEnvio();
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [sentinela.texto]);
  await expect(envio(page, 'Envio em inglês · 1 frase')).toContainText('Não começou');
  const [naConexao] = await enviosCriados(fakes, 1);
  // Antes: a Frase está onde o Envio precisa dela (o corpo congelado do painel e a linha do pedido na Conexão).
  expect(JSON.stringify(await extensao.lerStorage())).toContain(SENTINELA);
  expect(JSON.stringify(naConexao.corpo)).toContain(SENTINELA);

  await progresso(page).getByRole('button', { name: 'Fechar' }).first().click();
  await page.goto(extensao.url('painel.html#configuracoes/perigo'));
  await page.locator('#cfg-perigo').getByRole('button', { name: 'Apagar 1 frase' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar 1 frase' }).click();

  await expect.poll(async () => JSON.stringify(await extensao.lerStorage())).not.toContain(SENTINELA);
  await expect.poll(() => JSON.stringify(fakes.anki.envios.map(e => e.corpo))).not.toContain(SENTINELA);
  expect(fakes.anki.requisicoes.filter(r => r.metodo === 'POST' && r.caminho === '/jobs/apagar-frases')).toHaveLength(1);
  // O Envio sem resposta (jobId nulo) não tem mais o que reenviar: nada de Tentar de novo, nada de `POST /jobs` novo.
  // O fake muda antes de a resposta chegar à extensão: `pm_envio` só sai quando o painel a lê.
  await expect.poll(async () => (await extensao.lerStorage('pm_envio')).pm_envio).toBeUndefined();
  await page.goto(extensao.url('painel.html#frases'));
  await page.waitForTimeout(500);
  expect(fakes.anki.requisicoes.filter(r => r.metodo === 'POST' && r.caminho === '/jobs')).toHaveLength(1);
  expect(fakes.anki.envios).toHaveLength(1);
});

test('Apagar tudo sem a Conexão responder: as Frases saem do painel e o pedido segue marcado até a Conexão responder', async ({ page, extensao, fakes }) => {
  const sentinela = frase(1_700_000_000_098, `The ${SENTINELA} vat bubbled all night.`, { keywords: [`${SENTINELA}@1`] });
  await extensao.gravarStorage({ frases: [sentinela] });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [sentinela.texto]);
  await enviosCriados(fakes, 1);
  await expect.poll(async () => (await extensao.lerStorage('pm_envio')).pm_envio?.envios?.[0]?.jobId).toBeTruthy();

  fakes.anki.falharApagarFrases();
  await progresso(page).getByRole('button', { name: 'Fechar' }).first().click();
  await page.goto(extensao.url('painel.html#configuracoes/perigo'));
  await page.locator('#cfg-perigo').getByRole('button', { name: 'Apagar 1 frase' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar 1 frase' }).click();

  // O que o painel guardava já saiu, e ele não acompanha mais o Envio; a Conexão ainda não confirmou, e o pedido fica marcado.
  await expect.poll(async () => JSON.stringify(await extensao.lerStorage())).not.toContain(SENTINELA);
  const { pm_envio: pendente } = await extensao.lerStorage('pm_envio');
  expect(pendente).toStrictEqual({ envios: [], apagarFrases: true });
  expect(JSON.stringify(fakes.anki.envios.map(e => e.corpo))).toContain(SENTINELA);

  fakes.anki.voltarApagarFrases();
  await page.reload();
  await expect.poll(() => JSON.stringify(fakes.anki.envios.map(e => e.corpo))).not.toContain(SENTINELA);
  await expect.poll(async () => (await extensao.lerStorage('pm_envio')).pm_envio?.apagarFrases).toBeUndefined();
});

test('Apagar tudo no meio de um Envio encerra o Envio no painel: nenhum resumo oferece mandar de novo as Frases apagadas', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, ARM.texto, RUSSA.texto]);
  const [ingles, russo] = await enviosCriados(fakes, 2);
  fakes.anki.moverEnvio(ingles.jobId, { stage: 'generate_cards', progress: { done: 1, total: 2 } });
  await expect(envio(page, 'Envio em inglês · 2 frases')).toContainText('Criando cartões');

  await progresso(page).getByRole('button', { name: 'Fechar' }).first().click();
  await page.goto(extensao.url('painel.html#configuracoes/perigo'));
  await page.locator('#cfg-perigo').getByRole('button', { name: 'Apagar todas as 4 frases' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar 4 frases' }).click();
  // A Conexão parou os dois Envios (as Frases deles não existem mais).
  await expect.poll(() => [ingles, russo].map(e => fakes.anki.envios.find(x => x.jobId === e.jobId).state.lastError))
    .toEqual(['frases_apagadas', 'frases_apagadas']);

  // De volta a Frases: nada do Envio aparece, nem o resumo, nem o progresso.
  await page.goto(extensao.url('painel.html#frases'));
  await expect(page.getByText('Nenhuma frase ainda.')).toBeVisible();
  await umaVoltaDoEnvio(page);
  await expect(resumo(page)).toBeHidden();
  await expect(progresso(page)).toBeHidden();
  expect(fakes.anki.requisicoes.filter(r => r.caminho === '/jobs/retry')).toHaveLength(0);
  // O painel não guarda mais Envio nenhum: a Conexão confirmou o Apagar tudo.
  await expect.poll(async () => (await extensao.lerStorage('pm_envio')).pm_envio).toBeUndefined();
});

test('Apagar tudo numa aba encerra o Envio nas outras abas: nenhuma abre um resumo falso nem o Tentar de novo', async ({ page, context, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, ARM.texto, RUSSA.texto]);
  const [ingles, russo] = await enviosCriados(fakes, 2);
  await expect.poll(async () => (await extensao.lerStorage('pm_envio')).pm_envio?.envios?.map(e => e.jobId)).toEqual([ingles.jobId, russo.jobId]);
  fakes.anki.moverEnvio(ingles.jobId, { stage: 'generate_cards', progress: { done: 1, total: 2 } });

  // A outra aba acompanha os mesmos Envios (a remessa vem de `pm_envio`).
  const outra = await context.newPage();
  await abrirPainel(outra, extensao);
  await expect(outra.locator('#frases-lista .veio-frase').first()).toBeVisible();

  await progresso(page).getByRole('button', { name: 'Fechar' }).first().click();
  await page.goto(extensao.url('painel.html#configuracoes/perigo'));
  await page.locator('#cfg-perigo').getByRole('button', { name: 'Apagar todas as 4 frases' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar 4 frases' }).click();
  await expect.poll(() => [ingles, russo].map(e => fakes.anki.envios.find(x => x.jobId === e.jobId).state.lastError))
    .toEqual(['frases_apagadas', 'frases_apagadas']);
  await expect.poll(async () => (await extensao.lerStorage('pm_envio')).pm_envio).toBeUndefined();

  // A outra aba soube do Apagar tudo: as Frases dos Envios não existem mais, então não há resumo "+0 cartões" nem Tentar de novo.
  await outra.bringToFront();
  await umaVoltaDoEnvio(outra);
  await expect(outra.getByText('Nenhuma frase ainda.')).toBeVisible();
  await expect(resumo(outra)).toBeHidden();
  await expect(progresso(outra)).toBeHidden();
  expect(fakes.anki.requisicoes.filter(r => r.caminho === '/jobs/retry')).toHaveLength(0);
  expect((await extensao.lerStorage('pm_envio')).pm_envio).toBeUndefined();
});

const RECUSA = 'Não deu para apagar agora: a Conexão com o Anki não está respondendo. Abra o Anki e tente de novo.';
const apagarTodas = async (page, n) => {
  await page.locator('#cfg-perigo').getByRole('button', { name: `Apagar todas as ${n} frases` }).click();
  await page.getByRole('dialog').getByRole('button', { name: `Apagar ${n} frases` }).click();
};

test('Apagar tudo é recusado com um Envio andando e a Conexão sem responder: nada é apagado e a pessoa sabe por quê', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, ARM.texto]);
  const [naConexao] = await enviosCriados(fakes, 1);
  await expect.poll(async () => (await extensao.lerStorage('pm_envio')).pm_envio?.envios?.[0]?.jobId).toBe(naConexao.jobId);
  const antes = (await extensao.lerStorage('pm_envio')).pm_envio;

  // O Anki fecha com o Envio no meio: a Conexão não responde, e um Apagar tudo agora ficaria marcado sem chegar a ela.
  fakes.anki.desligar();
  await progresso(page).getByRole('button', { name: 'Fechar' }).first().click();
  await page.goto(extensao.url('painel.html#configuracoes/perigo'));
  await apagarTodas(page, 4);

  await expect(page.locator('#cfg-perigo').getByRole('alert')).toContainText(RECUSA);
  // Nada saiu: as Frases e o Envio estão como estavam, e não há marca de Apagar tudo esperando.
  expect((await extensao.frases()).map(f => f.id).sort()).toEqual([...INGLESAS, RUSSA].map(f => f.id).sort());
  expect((await extensao.lerStorage('pm_envio')).pm_envio).toStrictEqual(antes);
  expect(fakes.anki.requisicoes.filter(r => r.caminho === '/jobs/apagar-frases')).toHaveLength(0);

  // O Anki abre de novo e a pessoa tenta outra vez: agora a Conexão ouve o pedido.
  fakes.anki.ligar();
  await apagarTodas(page, 4);
  await expect(page.locator('#cfg-perigo').getByRole('alert')).toBeHidden();
  await expect.poll(async () => (await extensao.frases()).length).toBe(0);
  await expect.poll(() => fakes.anki.requisicoes.filter(r => r.caminho === '/jobs/apagar-frases').length).toBe(1);
});

test('Apagar tudo é recusado sempre que a Conexão não responde, sem Envio nenhum: a faixa tem Tentar de novo e Detalhes, e some quando a Conexão volta', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  fakes.anki.desligar();
  await abrirPainel(page, extensao, '#configuracoes/perigo');
  await apagarTodas(page, 4);

  const faixa = page.locator('#cfg-perigo').getByRole('alert');
  await expect(faixa).toContainText(RECUSA);
  await expect(faixa.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  await expect(faixa.getByText('Detalhes', { exact: true })).toBeVisible();
  // Nada saiu e nada ficou marcado: nem as Frases, nem `pm_envio`.
  expect((await extensao.frases()).map(f => f.id).sort()).toEqual([...INGLESAS, RUSSA].map(f => f.id).sort());
  expect((await extensao.lerStorage('pm_envio')).pm_envio).toBeUndefined();
  expect(fakes.anki.requisicoes.filter(r => r.caminho === '/jobs/apagar-frases')).toHaveLength(0);

  // Tentar de novo com a Conexão ainda fora: a recusa continua, sem pedir de novo a confirmação.
  await faixa.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(faixa).toContainText(RECUSA);
  expect((await extensao.frases())).toHaveLength(4);

  // A Conexão volta a responder: a faixa sai sozinha, e as Frases continuam até a pessoa tentar.
  fakes.anki.ligar();
  await pedirConferenciaDaConexao(page);
  await expect(faixa).toBeHidden();
  expect((await extensao.frases())).toHaveLength(4);

  // Recusado de novo e, com a Conexão de volta, o Tentar de novo da faixa apaga (a confirmação já foi dada).
  fakes.anki.desligar();
  await apagarTodas(page, 4);
  await expect(faixa).toContainText(RECUSA);
  fakes.anki.ligar();
  await faixa.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(faixa).toBeHidden();
  await expect.poll(async () => (await extensao.frases()).length).toBe(0);
  await expect.poll(() => fakes.anki.requisicoes.filter(r => r.caminho === '/jobs/apagar-frases').length).toBe(1);
});

test('Apagar tudo numa aba aberta antes do Enviar também é recusado com a Conexão fora: a aba não sabe do Envio, a Conexão basta', async ({ page, context, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  const antiga = await context.newPage();
  await abrirPainel(antiga, extensao, '#configuracoes/perigo');
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, ARM.texto]);
  await enviosCriados(fakes, 1);
  await expect.poll(async () => (await extensao.lerStorage('pm_envio')).pm_envio?.envios?.[0]?.jobId).toBeTruthy();
  const antes = (await extensao.lerStorage('pm_envio')).pm_envio;

  fakes.anki.desligar();
  await antiga.bringToFront();
  await apagarTodas(antiga, 4);

  await expect(antiga.locator('#cfg-perigo').getByRole('alert')).toContainText(RECUSA);
  expect((await extensao.frases())).toHaveLength(4);
  expect((await extensao.lerStorage('pm_envio')).pm_envio).toStrictEqual(antes);
  expect(fakes.anki.requisicoes.filter(r => r.caminho === '/jobs/apagar-frases')).toHaveLength(0);
});

// O service worker repete o pedido com todo painel fechado (background.js › ApagarFrasesPendente): a marca em `pm_envio` e o alarme de 30 s.
test('uma marca de Apagar tudo sem nenhum painel aberto chega à Conexão pelo alarme do service worker, e a marca sai', async ({ extensao, fakes }) => {
  test.setTimeout(90_000);
  await extensao.gravarStorage({ pm_envio: { envios: [], apagarFrases: true } });

  await expect.poll(() => fakes.anki.requisicoes.filter(r => r.metodo === 'POST' && r.caminho === '/jobs/apagar-frases').length, { timeout: 60_000 }).toBe(1);
  await expect.poll(async () => (await extensao.lerStorage('pm_envio')).pm_envio, { timeout: 10_000 }).toBeUndefined();
});

test('Apagar tudo enquanto o pedido de um Envio espera a Conexão: a resposta que chega depois não traz o Envio de volta, e o outro idioma não sai', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  // O primeiro POST /jobs (o inglês) fica esperando até o teste soltar; os idiomas que chegam são anotados.
  const idiomasPedidos = [];
  let soltar;
  const solto = new Promise(r => { soltar = r; });
  fakes.anki.responder('POST', '/jobs', async req => {
    const { jobId, lang } = JSON.parse(req.postData());
    idiomasPedidos.push(lang);
    await solto;
    return { status: 201, json: { jobId, status: 'queued' } };
  });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, RUSSA.texto]);
  await expect.poll(() => idiomasPedidos).toEqual(['en']);

  // Mesma página: o painel que espera a resposta é o que apaga.
  await progresso(page).getByRole('button', { name: 'Fechar' }).first().click();
  await page.locator('.shell-item[data-area="configuracoes"]').click();
  await page.locator('#cfg-perigo-titulo').click();
  await page.locator('#cfg-perigo').getByRole('button', { name: 'Apagar todas as 4 frases' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar 4 frases' }).click();
  await expect.poll(async () => (await extensao.lerStorage('pm_envio')).pm_envio).toBeUndefined();

  const resposta = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/jobs'));
  soltar();
  await umaVoltaDoEnvio(page, { resposta });
  expect(idiomasPedidos).toEqual(['en']);
  // Nada do Envio voltou ao que o painel guarda, nem as Frases dele.
  expect((await extensao.lerStorage('pm_envio')).pm_envio).toBeUndefined();
  expect(JSON.stringify(await extensao.lerStorage())).not.toContain('hit the sack');
});
