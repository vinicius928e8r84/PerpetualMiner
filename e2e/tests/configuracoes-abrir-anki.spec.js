'use strict';

// Configurações › Conexão com o Anki: o interruptor “Abrir o Anki com o computador” (#153, história 101).
//
// Vem desligado. Ligado, a Conexão escreve o item de login; desligado, ela o apaga. O item mora na
// Conexão (o fake guarda a situação dele, do contrato em `complemento/contrato/exemplos.json`), então os
// testes afirmam o que a pessoa vê e o que a Conexão ficou com: o interruptor nunca anda sozinho à frente
// da resposta dela. O que o Mac e o Windows fazem com o item é do ensaio do dono.

const { test, expect } = require('../fixtures');

const interruptor = page => page.getByRole('switch', { name: 'Abrir o Anki com o computador' });
/** O interruptor é desenhado pela base Veio (o input fica escondido): quem recebe o clique é o trilho. */
const trilho = page => page.locator('#cfg-anki-corpo .veio-toggle');
const resumo = page => page.locator('#cfg-anki-resumo');
const nota = page => page.locator('#cfg-anki-nota');
const aviso = page => page.locator('#cfg-anki-corpo .veio-aviso');

const pedidosDeLigarOuDesligar = fakes =>
  fakes.anki.requisicoes.filter(r => r.metodo === 'POST' && r.caminho === '/abrir-com-o-computador')
    .map(r => JSON.parse(r.corpo));

async function abrirCard(page, extensao) {
  await page.goto(extensao.url('painel.html#configuracoes/anki'));
  await expect(page.getByRole('button', { name: 'Conexão com o Anki', expanded: true })).toBeVisible();
}

test('o interruptor vem desligado e a linha fechada diz que o Anki não abre com o computador', async ({ page, extensao, fakes }) => {
  await page.goto(extensao.url('painel.html#configuracoes'));

  await expect(resumo(page)).toHaveText('Não abre com o computador');
  await page.getByRole('button', { name: 'Conexão com o Anki' }).click();
  await expect(interruptor(page)).not.toBeChecked();
  await expect(nota(page)).toContainText('O Anki abre quando você liga o computador');
  // Ler o estado não escreve nada: só a pessoa muda o interruptor.
  expect(pedidosDeLigarOuDesligar(fakes)).toEqual([]);
  expect(fakes.anki.itemInstalado()).toBe(false);
});

test('o endereço #configuracoes/anki abre o card', async ({ page, extensao, fakes }) => {
  await abrirCard(page, extensao);

  await expect(interruptor(page)).toBeVisible();
  expect(fakes.anki.itemInstalado()).toBe(false);
});

test('ligar o interruptor pede à Conexão que escreva o item de login', async ({ page, extensao, fakes }) => {
  await abrirCard(page, extensao);
  await expect(interruptor(page)).toBeEnabled();

  await trilho(page).click();

  await expect(interruptor(page)).toBeChecked();
  await expect(resumo(page)).toHaveText('Abre com o computador');
  expect(pedidosDeLigarOuDesligar(fakes)).toEqual([{ ligado: true }]);
  expect(fakes.anki.itemInstalado()).toBe(true);
  await expect(aviso(page)).toHaveCount(0);
});

test('desligar o interruptor pede à Conexão que apague o item de login', async ({ page, extensao, fakes }) => {
  fakes.anki.definirItemDeLogin('ligado');
  await abrirCard(page, extensao);
  await expect(interruptor(page)).toBeChecked();

  await trilho(page).click();

  await expect(interruptor(page)).not.toBeChecked();
  await expect(resumo(page)).toHaveText('Não abre com o computador');
  expect(pedidosDeLigarOuDesligar(fakes)).toEqual([{ ligado: false }]);
  expect(fakes.anki.itemInstalado()).toBe(false);
});

test('o teclado liga o interruptor com o espaço e o foco fica nele', async ({ page, extensao, fakes }) => {
  await abrirCard(page, extensao);
  await expect(interruptor(page)).toBeEnabled();

  await interruptor(page).focus();
  await page.keyboard.press('Space');

  await expect(interruptor(page)).toBeChecked();
  await expect(interruptor(page)).toBeFocused();
  expect(fakes.anki.itemInstalado()).toBe(true);
});

test('ao reabrir o painel o interruptor mostra o que a Conexão tem, não o que ficou na tela', async ({ page, extensao, fakes }) => {
  await abrirCard(page, extensao);
  await expect(interruptor(page)).toBeEnabled();
  await trilho(page).click();
  await expect(interruptor(page)).toBeChecked();

  await page.reload();

  await expect(resumo(page)).toHaveText('Abre com o computador');
  await expect(interruptor(page)).toBeChecked();
  expect(fakes.anki.itemInstalado()).toBe(true);
});

test('enquanto a Conexão escreve o item o interruptor espera, mostrando o que está de verdade', async ({ page, extensao, fakes }) => {
  let responder;
  const segurando = new Promise(resolve => { responder = resolve; });
  fakes.anki.responder('POST', '/abrir-com-o-computador', async () => {
    await segurando;
    fakes.anki.definirItemDeLogin('ligado');   // a Conexão escreve o item e então responde
    return { json: { ok: true, ligado: true } };
  });
  await abrirCard(page, extensao);
  await expect(interruptor(page)).toBeEnabled();

  await trilho(page).click();

  await expect(interruptor(page)).toBeDisabled();
  await expect(interruptor(page)).not.toBeChecked();
  await expect(resumo(page)).toHaveText('Não abre com o computador');
  expect(fakes.anki.itemInstalado()).toBe(false);

  responder();
  await expect(interruptor(page)).toBeChecked();
  await expect(interruptor(page)).toBeEnabled();
  expect(fakes.anki.itemInstalado()).toBe(true);
});

test.describe('com a Conexão desligada', () => {
  test('o interruptor fica indisponível e a nota diz por quê', async ({ page, extensao, fakes }) => {
    fakes.anki.desligar();
    await abrirCard(page, extensao);

    await expect(interruptor(page)).toBeDisabled();
    await expect(nota(page)).toHaveText(
      'Indisponível: a Conexão com o Anki está desligada. Ligue-a neste computador para mudar isto.');
    await expect(resumo(page)).toHaveText('Indisponível agora');
    expect(fakes.anki.requisicoes.filter(r => r.caminho.startsWith('/abrir-com-o-computador'))).toEqual([]);
    expect(fakes.anki.itemInstalado()).toBe(false);
  });

  test('quando a Conexão volta o interruptor mostra o que ela tem', async ({ page, extensao, fakes }) => {
    fakes.anki.definirItemDeLogin('ligado');
    fakes.anki.desligar();
    await abrirCard(page, extensao);
    await expect(interruptor(page)).toBeDisabled();

    // O Tentar de novo é da faixa da área Conexão com o Anki; a Conexão volta e a pessoa retorna ao card.
    await page.getByRole('link', { name: 'Conexão com o Anki' }).click();
    fakes.anki.ligar();
    await page.locator('#shell-tentar-de-novo').click();
    await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');
    await page.getByRole('link', { name: 'Configurações' }).click();
    await page.locator('#cfg-anki-titulo').click();

    await expect(interruptor(page)).toBeEnabled();
    await expect(interruptor(page)).toBeChecked();
    await expect(resumo(page)).toHaveText('Abre com o computador');
    expect(fakes.anki.itemInstalado()).toBe(true);
  });
});

test.describe('com uma Conexão que não sabe responder', () => {
  test('a Conexão de antes do complemento, sem a rota, deixa o interruptor indisponível e diz o motivo', async ({ page, extensao, fakes }) => {
    fakes.anki.responder('POST', '/abrir-com-o-computador/estado', () => ({ status: 404, json: { error: 'not_found' } }));
    await abrirCard(page, extensao);

    await expect(nota(page)).toHaveText('Indisponível: esta versão da Conexão com o Anki ainda não abre o Anki com o computador.');
    await expect(interruptor(page)).toBeDisabled();
    await expect(resumo(page)).toHaveText('Indisponível agora');
    expect(fakes.anki.itemInstalado()).toBe(false);
  });

  test('uma leitura que falha deixa o interruptor indisponível em vez de ficar conferindo para sempre', async ({ page, extensao, fakes }) => {
    fakes.anki.responder('POST', '/abrir-com-o-computador/estado', () => ({ status: 500, json: { error: 'internal_error' } }));
    await abrirCard(page, extensao);

    await expect(nota(page)).toHaveText('Indisponível: não deu para conferir como está. Abra Configurações de novo para tentar.');
    await expect(interruptor(page)).toBeDisabled();
    await expect(resumo(page)).toHaveText('Indisponível agora');
    expect(fakes.anki.itemInstalado()).toBe(false);
  });

  for (const [nome, resposta] of [
    ['sem o campo ligado', { ok: true }],
    ['com ligado que não é verdadeiro nem falso', { ok: true, ligado: 'sim' }],
    ['que não é um objeto JSON', [true]],
  ]) {
    test(`uma resposta ${nome} deixa o interruptor indisponível, nunca “desligado”`, async ({ page, extensao, fakes }) => {
      fakes.anki.definirItemDeLogin('ligado');
      fakes.anki.responder('POST', '/abrir-com-o-computador/estado', () => ({ json: resposta }));
      await abrirCard(page, extensao);

      await expect(nota(page)).toHaveText('Indisponível: não deu para conferir como está. Abra Configurações de novo para tentar.');
      await expect(interruptor(page)).toBeDisabled();
      await expect(interruptor(page)).not.toBeChecked();
      await expect(resumo(page)).toHaveText('Indisponível agora');
      expect(fakes.anki.itemInstalado()).toBe(true);   // o item está lá, e a tela não afirma o contrário
    });
  }

  test('uma leitura que falha depois de uma que deu certo tira o estado antigo da tela', async ({ page, extensao, fakes }) => {
    fakes.anki.definirItemDeLogin('ligado');
    await abrirCard(page, extensao);
    await expect(interruptor(page)).toBeChecked();
    fakes.anki.responder('POST', '/abrir-com-o-computador/estado', () => ({ status: 500, json: { error: 'internal_error' } }));

    await page.evaluate(() => { location.hash = '#frases'; });
    await expect(page.getByRole('heading', { name: 'Frases mineradas' })).toBeVisible();
    await page.evaluate(() => { location.hash = '#configuracoes/anki'; });

    await expect(nota(page)).toHaveText('Indisponível: não deu para conferir como está. Abra Configurações de novo para tentar.');
    await expect(interruptor(page)).toBeDisabled();
    await expect(resumo(page)).toHaveText('Indisponível agora');
    expect(fakes.anki.itemInstalado()).toBe(true);
  });
});

test.describe('quando o item não muda', () => {
  test('sem poder escrever o item, o interruptor continua desligado e o aviso diz o que aconteceu', async ({ page, extensao, fakes }) => {
    fakes.anki.definirItemDeLogin('falha');
    await abrirCard(page, extensao);
    await expect(interruptor(page)).toBeEnabled();

    await trilho(page).click();

    await expect(aviso(page)).toContainText('Não deu para ligar. O Anki não vai abrir com o computador.');
    await expect(aviso(page).locator('summary')).toHaveText('Detalhes');
    await expect(aviso(page).locator('details')).toContainText('login_item_failed');
    await expect(interruptor(page)).not.toBeChecked();
    await expect(interruptor(page)).toBeEnabled();
    await expect(resumo(page)).toHaveText('Não abre com o computador');
    expect(fakes.anki.itemInstalado()).toBe(false);
  });

  test('sem saber onde o Anki está, o aviso diz isso', async ({ page, extensao, fakes }) => {
    fakes.anki.definirItemDeLogin('sem_anki');
    await abrirCard(page, extensao);
    await expect(interruptor(page)).toBeEnabled();

    await trilho(page).click();

    await expect(aviso(page)).toContainText(
      'A Conexão não sabe onde o Anki está instalado neste computador, então não dá para abri-lo sozinha.');
    await expect(interruptor(page)).not.toBeChecked();
    expect(fakes.anki.itemInstalado()).toBe(false);
  });

  test('num computador sem item de login o aviso diz que ele não deixa', async ({ page, extensao, fakes }) => {
    fakes.anki.definirItemDeLogin('indisponivel');
    await abrirCard(page, extensao);
    await expect(interruptor(page)).toBeEnabled();

    await trilho(page).click();

    await expect(aviso(page)).toContainText('Este computador não deixa a Conexão abrir o Anki sozinha.');
    await expect(interruptor(page)).not.toBeChecked();
    expect(fakes.anki.itemInstalado()).toBe(false);
  });

  test('a falha ao desligar mantém o interruptor ligado', async ({ page, extensao, fakes }) => {
    fakes.anki.definirItemDeLogin('ligado');
    await abrirCard(page, extensao);
    await expect(interruptor(page)).toBeChecked();
    fakes.anki.responder('POST', '/abrir-com-o-computador', () => ({ status: 500, json: { error: 'login_item_failed' } }));

    await trilho(page).click();

    await expect(aviso(page)).toContainText('Não deu para desligar. O Anki ainda vai abrir com o computador.');
    await expect(interruptor(page)).toBeChecked();
    await expect(resumo(page)).toHaveText('Abre com o computador');
    expect(fakes.anki.itemInstalado()).toBe(true);
  });

  test('fechar o aviso o tira da tela e o interruptor segue funcionando', async ({ page, extensao, fakes }) => {
    fakes.anki.definirItemDeLogin('falha');
    await abrirCard(page, extensao);
    await expect(interruptor(page)).toBeEnabled();
    await trilho(page).click();
    await expect(aviso(page)).toBeVisible();

    await aviso(page).getByRole('button', { name: 'Fechar' }).click();
    fakes.anki.definirItemDeLogin('desligado');
    await trilho(page).click();

    await expect(aviso(page)).toHaveCount(0);
    await expect(interruptor(page)).toBeChecked();
    expect(fakes.anki.itemInstalado()).toBe(true);
  });
});

test.describe('quando a resposta de ligar não chega', () => {
  const SEM_CONFIRMAR = 'Não deu para confirmar se o Anki vai abrir com o computador. A tela confere de novo sozinha.';

  test('com o item escrito antes de a resposta se perder, a tela confere e mostra o item ligado, sem aviso de falha', async ({ page, extensao, fakes }) => {
    await abrirCard(page, extensao);
    await expect(interruptor(page)).toBeEnabled();
    fakes.anki.perderARespostaDoItemDeLogin({ aplicada: true });

    await trilho(page).click();

    await expect(interruptor(page)).toBeChecked();
    await expect(interruptor(page)).toBeEnabled();
    await expect(resumo(page)).toHaveText('Abre com o computador');
    await expect(aviso(page)).toHaveCount(0);
    expect(fakes.anki.itemInstalado()).toBe(true);
  });

  test('com o item que não chegou a ser escrito, a tela confere e diz que não foi ligado', async ({ page, extensao, fakes }) => {
    await abrirCard(page, extensao);
    await expect(interruptor(page)).toBeEnabled();
    fakes.anki.perderARespostaDoItemDeLogin({ aplicada: false });

    await trilho(page).click();

    await expect(aviso(page)).toContainText('Não deu para ligar. O Anki não vai abrir com o computador.');
    await expect(interruptor(page)).not.toBeChecked();
    await expect(interruptor(page)).toBeEnabled();
    await expect(resumo(page)).toHaveText('Não abre com o computador');
    expect(fakes.anki.itemInstalado()).toBe(false);
  });

  test('sem conseguir conferir depois, o interruptor fica indisponível e o aviso não afirma o que não se sabe', async ({ page, extensao, fakes }) => {
    await abrirCard(page, extensao);
    await expect(interruptor(page)).toBeEnabled();
    fakes.anki.responder('POST', '/abrir-com-o-computador/estado', () => ({ status: 500, json: { error: 'internal_error' } }));
    fakes.anki.perderARespostaDoItemDeLogin({ aplicada: true });

    await trilho(page).click();

    await expect(aviso(page)).toContainText(SEM_CONFIRMAR);
    await expect(aviso(page)).not.toContainText('não vai abrir');
    await expect(interruptor(page)).toBeDisabled();
    await expect(resumo(page)).toHaveText('Indisponível agora');
    expect(fakes.anki.itemInstalado()).toBe(true);
  });

  test('uma Conexão que escreve o item e demora mais que o prazo não é dada como falha: a tela confere', async ({ page, extensao, fakes }) => {
    let soltar;
    const segurando = new Promise(resolve => { soltar = resolve; });
    fakes.anki.responder('POST', '/abrir-com-o-computador', async () => {
      fakes.anki.definirItemDeLogin('ligado');   // escreveu o item
      await segurando;                            // e a resposta não vem a tempo
      return { json: { ok: true, ligado: true } };
    });
    await abrirCard(page, extensao);
    await expect(interruptor(page)).toBeEnabled();

    await trilho(page).click();

    await expect(interruptor(page)).toBeChecked({ timeout: 10_000 });
    await expect(interruptor(page)).toBeEnabled();
    await expect(aviso(page)).toHaveCount(0);
    expect(fakes.anki.itemInstalado()).toBe(true);
    soltar();
  });
});
