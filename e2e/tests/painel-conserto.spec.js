'use strict';

// O Consertar sozinho (#152, histórias 90, 91, 92, 94 e 95): quando a Conexão não responde, o abridor da Conexão com o Anki
// (o host de mentira do fixture, e2e/fakes/abridor.js, que responde pelos exemplos de
// complemento/contrato/exemplos-do-conserto.json) fecha à força o Anki que travou, liga a Conexão desativada, ou diz que ela
// sumiu do Anki; a extensão só conta o que o abridor fez. Cada linha da tabela do Consertar da spec (#138) tem um teste aqui.
// O que o abridor de verdade faz (esperar 30 s, fechar, abrir, o meta.json) é complemento/test_conserto.py; fechar um Anki
// real só o ensaio do dono vê (riscos 3 e 12 do #138). O Reparar Anki, que só existia no Windows, saiu da extensão.

const fs = require('fs');
const { test, expect } = require('../fixtures');
const { estadoFinal } = require('../estado-final');
const { AGORA, INGLESAS, SACK, abrirPainel, marcar, enviarAoAnki, progresso, enviosCriados } = require('../apoio-do-envio');

const F1 = 'A Conexão com o Anki está desligada. Ligue-a neste computador e tente de novo.';
/** As mensagens que o abridor recebeu, na ordem (o passo Abrir o Anki sozinho também manda `conferir`). */
const acoesDoAbridor = fakes => fakes.abridor.pedidos().map(p => p.mensagem.acao).filter(acao => acao !== 'conferir');
const faixa = page => page.locator('#frases-avisos [data-aviso="envio-anki-fechado"]');
const toasts = page => page.locator('.veio-toast');
const cardDaPrimeiraConexao = page => page.getByRole('region', { name: 'Ainda não houve conexão neste computador' });

test.beforeEach(({ fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
});

/** O Anki que não responde num computador onde a Conexão já respondeu uma vez, e uma Frase marcada para enviar. */
async function prepararComAConexaoMuda(page, extensao, fakes, conserto, opcoes) {
  fakes.abridor.definirConserto(conserto, opcoes);
  await extensao.gravarStorage({ frases: INGLESAS, pm_anki_ja_conectou: true });
  fakes.anki.desligar();
  await abrirPainel(page, extensao);
  await marcar(page, SACK.texto).check();
}

test.describe('com a permissão do abridor', () => {
  test.use({ permissaoDoAbridor: true });

  test('o Anki que a pessoa fechou continua fechado até ela pedir: o consertar o encontra fechado e só então o abrir o abre', async ({ page, extensao, fakes }) => {
    await prepararComAConexaoMuda(page, extensao, fakes, 'anki_fechado');
    expect(acoesDoAbridor(fakes)).toEqual([]);

    await enviarAoAnki(page).click();

    await expect(faixa(page)).toHaveText('Abrindo o Anki para enviar…');
    await expect.poll(() => acoesDoAbridor(fakes)).toEqual(['consertar', 'abrir']);
    fakes.anki.ligar();
    await expect(faixa(page)).toBeHidden({ timeout: 10_000 });
    const [job] = await enviosCriados(fakes, 1);
    expect(job.entries.map(e => e.phraseId)).toEqual([SACK.id]);
    await expect(toasts(page)).toHaveCount(0);
    await estadoFinal(extensao, { pm_envio: { envios: [{ ids: [SACK.id], jobId: job.jobId }] } });
  });

  test('“Anki fechado” e “complemento desativado” dão o mesmo erro de rede na extensão; só o abridor os separa', async ({ page, extensao, fakes }) => {
    await extensao.gravarStorage({ pm_anki_ja_conectou: true });
    fakes.anki.desligar();
    const telaDaConexao = async conserto => {
      fakes.abridor.definirConserto(conserto);
      await page.goto(extensao.url('painel.html#anki/custos'));
      await expect(page.getByText(F1)).toBeVisible();
      return page.locator('.shell-conteudo').innerText();
    };

    const comOAnkiFechado = await telaDaConexao('anki_fechado');
    const comAConexaoDesativada = await telaDaConexao('complemento_desativado');

    // A extensão só vê a Conexão sem responder, nos dois casos: a mesma tela, e o abridor ainda não foi chamado.
    expect(comAConexaoDesativada).toBe(comOAnkiFechado);
    expect(acoesDoAbridor(fakes)).toEqual([]);
    await estadoFinal(extensao, { pm_anki_ja_conectou: true });
  });

  test('o Anki que não respondeu: o abridor fecha à força e abre de novo, e a extensão conta “O Anki travou e foi reiniciado.”', async ({ page, extensao, fakes }) => {
    await prepararComAConexaoMuda(page, extensao, fakes, 'anki_travado');

    await enviarAoAnki(page).click();

    await expect(faixa(page)).toHaveText('Abrindo o Anki para enviar…');
    await expect.poll(() => acoesDoAbridor(fakes)).toEqual(['consertar']);
    fakes.anki.ligar();
    await expect(toasts(page)).toHaveText('O Anki travou e foi reiniciado.', { timeout: 10_000 });
    await expect(faixa(page)).toBeHidden();
    // O abridor já abriu o Anki de novo: a extensão não manda abrir por cima, e as Frases saem.
    const [job] = await enviosCriados(fakes, 1);
    expect(job.entries.map(e => e.phraseId)).toEqual([SACK.id]);
    expect(acoesDoAbridor(fakes)).toEqual(['consertar']);
    await estadoFinal(extensao, { pm_envio: { envios: [{ ids: [SACK.id], jobId: job.jobId }] } });
  });

  test('o consertar que demora (a espera de 30 s do abridor): a faixa diz que confere a Conexão com o Anki', async ({ page, extensao, fakes }) => {
    await prepararComAConexaoMuda(page, extensao, fakes, 'anki_travado', { atrasoMs: 5_000 });

    await enviarAoAnki(page).click();

    await expect(faixa(page)).toHaveText('Abrindo o Anki para enviar…');
    await expect(faixa(page)).toHaveText('Conferindo a Conexão com o Anki…', { timeout: 6_000 });
    fakes.anki.ligar();
    await expect(toasts(page)).toHaveText('O Anki travou e foi reiniciado.', { timeout: 15_000 });
    await expect(faixa(page)).toBeHidden();
    const [job] = await enviosCriados(fakes, 1);
    await estadoFinal(extensao, { pm_envio: { envios: [{ ids: [SACK.id], jobId: job.jobId }] } });
  });

  test('a Conexão desativada no Anki: o abridor liga e reinicia, e a extensão conta o que ele fez', async ({ page, extensao, fakes }) => {
    await prepararComAConexaoMuda(page, extensao, fakes, 'complemento_desativado');

    await enviarAoAnki(page).click();

    await expect.poll(() => acoesDoAbridor(fakes)).toEqual(['consertar']);
    fakes.anki.ligar();
    await expect(toasts(page)).toHaveText('A Conexão com o Anki foi ligada de novo e o Anki reiniciou.', { timeout: 10_000 });
    await expect(faixa(page)).toBeHidden();
    const [job] = await enviosCriados(fakes, 1);
    expect(job.entries.map(e => e.phraseId)).toEqual([SACK.id]);
    await estadoFinal(extensao, { pm_envio: { envios: [{ ids: [SACK.id], jobId: job.jobId }] } });
  });

  for (const [quando, preparar] of [
    ['o abridor diz que a Conexão não está na pasta do Anki', (fakes, conserto) => fakes.abridor.definirConserto(conserto)],
    ['o Chrome não acha mais o abridor, que saiu junto com a Conexão', fakes => fakes.abridor.desregistrar()],
  ]) {
    test(`a Conexão que sumiu do Anki (${quando}): o único botão é Instalar de novo, que leva ao passo da primeira conexão`, async ({ page, extensao, fakes }) => {
      await prepararComAConexaoMuda(page, extensao, fakes, 'anki_fechado');
      preparar(fakes, 'complemento_sumiu');

      await enviarAoAnki(page).click();

      await expect(faixa(page)).toContainText('A Conexão com o Anki não está mais no Anki.');
      await expect(faixa(page).getByRole('button')).toHaveCount(1);
      await expect(faixa(page).getByRole('button', { name: 'Instalar de novo' })).toBeVisible();
      expect(acoesDoAbridor(fakes)).not.toContain('abrir');
      expect(fakes.anki.envios).toHaveLength(0);
      await expect(progresso(page)).toBeHidden();

      await faixa(page).getByRole('button', { name: 'Instalar de novo' }).click();

      await expect(page).toHaveURL(/painel\.html#anki$/);
      await expect(cardDaPrimeiraConexao(page)).toBeVisible();
      await estadoFinal(extensao, { pm_anki_ja_conectou: false });
    });
  }

  for (const [conserto, motivo] of [['anki_nao_fecha', 'nao_fechou'], ['anki_nao_abre', 'nao_abriu'], ['meta_ilegivel', 'meta_ilegivel']]) {
    test(`o conserto que falhou (${motivo}): “Não deu para consertar. Feche o Anki e abra de novo.” com Baixar diagnóstico`, async ({ page, extensao, fakes }) => {
      await prepararComAConexaoMuda(page, extensao, fakes, conserto);

      await enviarAoAnki(page).click();

      await expect(faixa(page)).toContainText('Não deu para consertar. Feche o Anki e abra de novo.');
      await expect(faixa(page).getByRole('button', { name: 'Baixar diagnóstico' })).toBeVisible();
      await faixa(page).getByText('Detalhes').click();
      await expect(faixa(page)).toContainText(motivo);
      expect(acoesDoAbridor(fakes)).toEqual(['consertar']);
      expect(fakes.anki.envios).toHaveLength(0);

      const baixando = page.waitForEvent('download');
      await faixa(page).getByRole('button', { name: 'Baixar diagnóstico' }).click();
      const download = await baixando;
      expect(download.suggestedFilename()).toBe('diagnostico-do-conserto.json');
      const diagnostico = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
      expect(diagnostico).toMatchObject({ tipo: 'diagnostico-do-conserto', desfecho: 'falhou', motivo });
      expect(diagnostico.passos[0]).toContain(`consertar → falhou · ${motivo}`);
      await estadoFinal(extensao, { pm_anki_ja_conectou: true });
    });
  }

  test('o Anki que a pessoa fechou durante a espera do consertar não é reaberto: a faixa pede que ela o abra', async ({ page, extensao, fakes }) => {
    await prepararComAConexaoMuda(page, extensao, fakes, 'anki_fechou_na_espera');

    await enviarAoAnki(page).click();

    await expect(faixa(page)).toContainText('Abra o Anki para enviar');
    expect(acoesDoAbridor(fakes)).toEqual(['consertar']);
    expect(fakes.anki.envios).toHaveLength(0);
    await expect(toasts(page)).toHaveCount(0);
    await estadoFinal(extensao, { pm_anki_ja_conectou: true });
  });

  test('o Anki saudável com a Conexão fora (porta ocupada): o abridor não fecha nada e a faixa conta, com o motivo no diagnóstico', async ({ page, extensao, fakes }) => {
    await prepararComAConexaoMuda(page, extensao, fakes, 'conexao_fora');

    await enviarAoAnki(page).click();

    await expect(faixa(page)).toContainText('O Anki está aberto, mas a Conexão com ele não subiu. Outro programa pode estar usando a porta 8766.');
    await expect(faixa(page).getByRole('button', { name: 'Baixar diagnóstico' })).toBeVisible();
    await faixa(page).getByText('Detalhes').click();
    await expect(faixa(page)).toContainText('conexao_fora');
    expect(acoesDoAbridor(fakes)).toEqual(['consertar']);
    expect(fakes.anki.envios).toHaveLength(0);

    const baixando = page.waitForEvent('download');
    await faixa(page).getByRole('button', { name: 'Baixar diagnóstico' }).click();
    const diagnostico = JSON.parse(fs.readFileSync(await (await baixando).path(), 'utf8'));
    expect(diagnostico).toMatchObject({ tipo: 'diagnostico-do-conserto', desfecho: 'falhou', motivo: 'conexao_fora' });
    await estadoFinal(extensao, { pm_anki_ja_conectou: true });
  });

  test('o botão Abrir o Anki de Baralhos e termos também conserta: o abridor reinicia o Anki que travou', async ({ page, extensao, fakes }) => {
    fakes.abridor.definirConserto('anki_travado');
    await extensao.gravarStorage({ pm_anki_ja_conectou: true });
    fakes.anki.desligar();
    await page.goto(extensao.url('painel.html#anki/baralhos'));
    const aba = page.locator('.shell-aba[data-aba="baralhos"]');
    await expect(aba).toContainText('— esperando o Anki');

    await aba.getByRole('button', { name: 'Abrir o Anki' }).click();

    await expect.poll(() => acoesDoAbridor(fakes)).toEqual(['consertar']);
    fakes.anki.ligar();
    await expect(toasts(page)).toHaveText('O Anki travou e foi reiniciado.', { timeout: 10_000 });
    await expect(aba).not.toContainText('esperando o Anki');
    expect(acoesDoAbridor(fakes)).toEqual(['consertar']);
    await estadoFinal(extensao, { pm_anki_ja_conectou: true });
  });
});

test.describe('sem a permissão do abridor', () => {
  test('nada é fechado nem aberto: a faixa pede que a pessoa abra o Anki, e o abridor não é chamado', async ({ page, extensao, fakes }) => {
    await prepararComAConexaoMuda(page, extensao, fakes, 'anki_travado');

    await enviarAoAnki(page).click();

    await expect(faixa(page)).toContainText('Abra o Anki para enviar');
    expect(acoesDoAbridor(fakes)).toEqual([]);
    expect(await extensao.permissaoDoAbridor()).toBe(false);
    await estadoFinal(extensao, { pm_anki_ja_conectou: true });
  });
});
