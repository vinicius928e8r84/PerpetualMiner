'use strict';

// O pareamento (#192) diante de quem não é a Conexão e de quem insiste: o impostor na porta (que não prova, ou que responde 401 `pairing_required` a quem já está
// pareado), os códigos gastos em sequência (o teto do review: três esgotados bloqueiam o seguinte) e a Conexão de antes do pareamento. A Conexão é o fake da fronteira
// HTTP; o impostor é uma rota registrada depois dela. Os fluxos de parear estão em pareamento.spec.js.

const { test, expect } = require('../fixtures');
const { estadoFinal, estadoFinalEm } = require('../estado-final');
const { abrirPainel } = require('../apoio-do-envio');
const { faixa, conectar, campo, confirmar, ponto, codigoNoAnki, quantosPareados, credencialGuardada } = require('../apoio-do-pareamento');

const NAO_CONFIRMOU = 'Algo na porta do Anki não se confirmou. Nada foi enviado';

test.describe('quem não é a Conexão', () => {
  test.use({ pareada: true });
  test.beforeEach(({ conexaoDoTeste }) => test.skip(Boolean(conexaoDoTeste), 'o impostor ocupa a porta no lugar do fake'));

  /** Um impostor na 8766: responde a saúde como a Conexão e o resto com `resposta(caminho)`, sem prova, e anota o que recebe. */
  async function impostorNaPorta(context, fakes, resposta = () => ({ status: 200, corpo: {} })) {
    const vistos = [];
    await context.route(fakes.anki.padrao, async route => {
      const req = route.request();
      const caminho = new URL(req.url()).pathname;
      vistos.push({ metodo: req.method(), caminho, corpo: req.postData() });
      const { status, corpo } = caminho === '/health' ? { status: 200, corpo: { ok: true, versao: '9.9.9', perfil: 'Impostor' } } : resposta(caminho);
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo) });
    });
    return vistos;
  }

  test('o impostor na porta só vê o desafio: a chave digitada não sai, o ponto não fica verde, o Painel diz que a porta não se confirmou e a aba do ChatGPT não abre', async ({ page, context, extensao, fakes }) => {
    const vistos = await impostorNaPorta(context, fakes);
    await abrirPainel(page, extensao, '#configuracoes/ia');
    await expect(faixa(page)).toContainText(NAO_CONFIRMOU);
    await expect(faixa(page).getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
    await expect(ponto(page)).toHaveAttribute('data-estado', 'nao_confirmada');
    await expect(page.locator('#shell-conexao-descricao')).toHaveText(NAO_CONFIRMOU);

    await page.locator('#cfg-ia').getByRole('textbox', { name: 'Chave da OpenAI' }).fill('sk-proj-chave-que-nao-pode-vazar-1234');
    await page.locator('#cfg-ia').getByRole('button', { name: 'Conferir e salvar' }).click();
    await page.locator('#cfg-ia').getByRole('button', { name: 'Continuar com o ChatGPT' }).click();

    await estadoFinalEm('o que o impostor da porta recebeu', () => [...new Set(vistos.map(v => v.caminho))].sort(), ['/health', '/pareamento/conferir']);
    expect(JSON.stringify(vistos)).not.toContain('sk-proj-chave-que-nao-pode-vazar');
    expect(context.pages().filter(p => p.url().startsWith('https://auth.openai.com'))).toHaveLength(0);
    expect(fakes.anki.requisicoes).toEqual([]);
    await estadoFinal(extensao, { pm_chave_openai: null });
  });

  test('o impostor que responde 401 pairing_required a quem já está pareado não leva ninguém a parear sozinho: o Painel diz que a porta não se confirmou e nada de pareamento sai', async ({ page, context, extensao, fakes }) => {
    const vistos = await impostorNaPorta(context, fakes, () => ({ status: 401, corpo: { error: 'pairing_required' } }));
    const antes = (await credencialGuardada(extensao)).cliente;
    await abrirPainel(page, extensao, '#frases');

    await expect(faixa(page)).toContainText(NAO_CONFIRMOU);
    await expect(faixa(page)).not.toContainText('Conecte este navegador ao Anki');
    await expect(ponto(page)).toHaveAttribute('data-estado', 'nao_confirmada');
    // Quem já está pareado nunca é levado ao código por um 401 sem prova: nem o campo, nem o Conectar.
    await expect(campo(page)).toHaveCount(0);
    await expect(conectar(page)).toHaveCount(0);
    await estadoFinalEm('o que o impostor da porta recebeu', () => [...new Set(vistos.map(v => v.caminho))].sort(), ['/health', '/pareamento/conferir']);
    expect((await credencialGuardada(extensao)).cliente).toBe(antes);   // e a credencial não se apaga por um 401 sem prova
  });
});

test.describe('quem pede código sem parar', () => {
  test.use({ pareada: false });

  test('três códigos que gastaram as tentativas bloqueiam o seguinte: o Painel diz que a porta não se confirmou e o Anki não abre outro diálogo', async ({ page, extensao, fakes, conexaoDoTeste }) => {
    await abrirPainel(page, extensao, '#frases');
    for (let vez = 0; vez < 3; vez += 1) {
      await conectar(page).click();
      await expect(campo(page)).toBeVisible();
      for (let erro = 0; erro < 5; erro += 1) {
        await campo(page).fill('AAA-AAA');
        await confirmar(page).click();
        if (erro < 4) await expect(faixa(page)).toContainText(`Restam ${4 - erro}`.replace('Restam 1', 'Resta 1'));
      }
      await expect(faixa(page)).toContainText('O código venceu. Peça outro');
    }

    await conectar(page).click();

    await expect(faixa(page)).toContainText(NAO_CONFIRMOU);
    await expect(campo(page)).toHaveCount(0);
    expect(await codigoNoAnki(fakes, conexaoDoTeste)).toBeNull();   // nenhum diálogo novo
    if (!conexaoDoTeste) expect(fakes.anki.pareamento.codigosMostrados()).toHaveLength(3);
    await estadoFinalEm('os navegadores que a Conexão tem pareados', () => quantosPareados(fakes, conexaoDoTeste), 0);
  });
});

test.describe('uma Conexão de antes do pareamento', () => {
  test.use({ pareada: true });

  test('o 404 no conferir dá o aviso de atualizar, sem botão, o ponto não fica verde e nada sai para ela além do conferir', async ({ page, extensao, fakes, conexaoDoTeste }) => {
    test.skip(Boolean(conexaoDoTeste), 'a Conexão real tem o pareamento');
    fakes.anki.pareamento.antigo();
    fakes.anki.definirAtualizacao({ ankiweb: 'com_versao_nova' });
    await abrirPainel(page, extensao, '#anki/custos');

    await expect(page.locator('#painel-conexao-versao')).toContainText('A Conexão com o Anki está desatualizada');
    await expect(faixa(page)).toHaveCount(0);
    await expect(ponto(page)).toHaveAttribute('data-estado', 'nao_confirmada');
    await expect(page.locator('#painel-conexao-versao').getByRole('button')).toHaveCount(0);   // nem o Atualizar agora: nenhum pedido sem assinatura sai (L9)
    await estadoFinalEm('os pedidos que a Conexão antiga recebeu', () => [...new Set(fakes.anki.requisicoes.map(r => r.caminho))], ['/health']);
  });
});

test.describe('uma Conexão de antes do pareamento, diante de quem nunca se pareou', () => {
  test.use({ pareada: false });

  test('quem vem da main vê o aviso de versão, não o convite a conectar, e só o conferir chega a ela', async ({ page, extensao, fakes, conexaoDoTeste }) => {
    test.skip(Boolean(conexaoDoTeste), 'a Conexão real tem o pareamento');
    fakes.anki.pareamento.antigo();
    fakes.anki.definirAtualizacao({ ankiweb: 'com_versao_nova' });
    await abrirPainel(page, extensao, '#anki/custos');

    await expect(page.locator('#painel-conexao-versao')).toContainText('A Conexão com o Anki está desatualizada');
    await expect(page.locator('#painel-conexao-versao').getByRole('button')).toHaveCount(0);
    await expect(faixa(page)).toHaveCount(0);
    await expect(conectar(page)).toHaveCount(0);
    await estadoFinalEm('os pedidos de pareamento que a Conexão antiga recebeu', () => [...new Set(fakes.anki.pareamento.recebidos().map(r => r.caminho))], ['/pareamento/conferir']);
    await estadoFinalEm('os pedidos que a Conexão antiga recebeu', () => [...new Set(fakes.anki.requisicoes.map(r => r.caminho))], ['/health']);
  });
});
