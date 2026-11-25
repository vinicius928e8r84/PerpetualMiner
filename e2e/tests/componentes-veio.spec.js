'use strict';

const { test, expect } = require('../fixtures');
const { ensinarAVitrineADesenharOFoco, anotarOFocadoDaVitrine, desenhosDosAnotadosDaVitrineSemFoco } = require('../apoio-do-foco');

const COMPONENTES = [
  'Botões', 'Campos', 'Toggle e checkbox', 'Selos', 'Atalhos',
  'Controle segmentado', 'Azulejo', 'Anel de progresso', 'Modal', 'Toast', 'Aviso persistente',
  'Estado vazio', 'Esqueleto', 'Linha de frase',
];

const TEMAS = ['escuro', 'claro'];

// Exceção de teste: catálogo (docs/testes.md)
const copiaDaVitrine = page => page.evaluate(() =>
  PerpetualMiner.Vitrine.CATALOGO_DA_VITRINE.map(([id, valores]) =>
    [id, PerpetualMiner.textoDaVoz(id, valores)]));

const abrirVitrine = async (page, paginas) => {
  await page.goto(paginas.url('vitrine.html'));
  await expect(page.locator('[data-grupo="Botões"]').first()).toBeVisible();
};

async function textosEscritos(page) {
  return page.evaluate(() => {
    const SELETORES = ['.veio-botao', '.veio-selo', '.veio-kbd', '.veio-segmentado__opcao',
      '.veio-azulejo__numero', '.veio-modal__titulo', '.veio-modal__corpo', '.veio-toast',
      '.veio-chip-palavra__rotulo', '.veio-aviso__texto', '.veio-aviso__detalhes > summary',
      '.veio-campo-erro', '.veio-vazio__texto', '.veio-cabecalho-de-data'].join(', ');
    return [...document.querySelectorAll(`[data-componentes] :is(${SELETORES})`)]
      .filter(no => !no.closest('[data-vitrine-chrome]') && !no.hasAttribute('data-vitrine-chrome'))
      .flatMap(no => {
        const abertura = no.matches('.veio-aviso__texto') && no.querySelector(':scope > strong');
        if (!abertura) return [no.textContent];
        return [abertura.textContent, no.textContent.slice(no.textContent.indexOf(abertura.textContent) + abertura.textContent.length)];
      })
      .map(texto => texto.trim())
      .filter(texto => texto !== '');
  });
}

const modalEscuro = page => {
  const scrim = page.locator('[data-modal="escuro"]');
  return { abrir: page.locator('[data-abre-o-modal="escuro"]'), scrim, dialogo: scrim.locator('[role="dialog"]') };
};

function anelDoFoco(no) {
  const estilo = getComputedStyle(no);
  return [estilo.outlineStyle, estilo.outlineWidth, estilo.outlineColor, estilo.outlineOffset].join(' ');
}

test('a vitrine mostra cada componente nos dois temas', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  for (const tema of TEMAS) {
    const coluna = page.locator(`[data-tema="${tema}"]`);
    for (const componente of COMPONENTES) {
      await expect(coluna.locator(`[data-grupo="${componente}"]`)).toBeVisible();
    }
  }

  const fundos = await page.evaluate(() => [...document.querySelectorAll('[data-tema]')]
    .map(no => getComputedStyle(no).backgroundColor));
  expect(new Set(fundos).size).toBe(2);
});

test('botões e campos aparecem em normal, foco, desabilitado e erro', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  for (const tema of TEMAS) {
    const coluna = page.locator(`[data-tema="${tema}"]`);

    for (const estado of ['normal', 'foco', 'desabilitado']) {
      await expect(coluna.locator(`[data-grupo="Botões"] [data-estado="${estado}"]`)).toBeVisible();
    }
    for (const estado of ['normal', 'foco', 'desabilitado', 'erro']) {
      await expect(coluna.locator(`[data-grupo="Campos"] [data-estado="${estado}"]`)).toBeVisible();
    }

    const desligados = coluna.locator('[data-estado="desabilitado"] .veio-botao');
    await expect(desligados.first()).toBeDisabled();

    await expect(coluna.locator('[data-estado="erro"] .veio-campo[aria-invalid="true"]').first())
      .toBeVisible();
    await expect(coluna.locator('[data-estado="erro"] .veio-campo-erro')).toBeVisible();
  }
});

test('as seis variantes de botão têm cada uma o seu desenho', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const coluna = page.locator('[data-tema="escuro"]');
  const linha = coluna.locator('[data-grupo="Botões"] [data-estado="normal"]');
  const fundoDe = variante => linha.locator(`.veio-botao--${variante}`)
    .evaluate(no => getComputedStyle(no).backgroundColor);

  const tokenDe = nome => coluna.evaluate((no, nome) => {
    const valor = getComputedStyle(no).getPropertyValue(nome).trim();
    const medida = document.createElement('span');
    medida.style.color = valor;
    document.body.append(medida);
    const rgb = getComputedStyle(medida).color;
    medida.remove();
    return rgb;
  }, nome);

  const ouro = await tokenDe('--veio-accent');
  const perigo = await tokenDe('--veio-danger');

  expect(await fundoDe('primario')).toBe(ouro);
  expect(await fundoDe('fantasma')).toBe('rgba(0, 0, 0, 0)');
  expect(await fundoDe('perigo')).toBe('rgba(0, 0, 0, 0)');
  expect(await fundoDe('perigo-cheio')).toBe(perigo);

  await expect(linha.locator('.veio-botao--perigo')).toHaveCSS('border-color', perigo);

  const soIcone = linha.locator('.veio-botao-icone').first();
  await expect(soIcone).toHaveCSS('border-radius', '50%');
  expect((await soIcone.getAttribute('aria-label')).length).toBeGreaterThan(0);
  await expect(soIcone).toHaveText('');
});

// Exceção de teste: sem-estado-guardado — a vitrine não tem chrome.storage.
test('a busca mostra o × só quando há texto, e ele limpa o campo', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const busca = page.locator('[data-tema="escuro"] [data-grupo="Campos"] [data-estado="normal"] .veio-busca');
  const campo = busca.locator('.veio-campo');
  const limpar = busca.locator('.veio-busca__limpar');

  await expect(limpar).toBeHidden();
  await campo.fill('gavião');
  await expect(limpar).toBeVisible();

  await limpar.click();
  await expect(campo).toHaveValue('');
  await expect(limpar).toBeHidden();
});

test('o checkbox do cabeçalho mostra o estado misto', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const misto = page.locator('[data-tema="escuro"] [data-grupo="Toggle e checkbox"] .veio-checkbox')
    .filter({ has: page.locator('xpath=.') })
    .last();

  expect(await misto.evaluate(no => ({ marcado: no.checked, misto: no.indeterminate })))
    .toEqual({ marcado: false, misto: true });
});

test('o toggle ligado usa o ouro, e o desligado não', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const toggles = page.locator('[data-tema="escuro"] [data-grupo="Toggle e checkbox"] [data-estado="normal"] .veio-toggle');
  const trilhos = await toggles.locator('.veio-toggle__trilho')
    .evaluateAll(nos => nos.map(no => getComputedStyle(no).backgroundColor));
  const ouro = await page.locator('[data-tema="escuro"] .veio-botao--primario').first()
    .evaluate(no => getComputedStyle(no).backgroundColor);

  expect(trilhos[0]).toBe(ouro);
  expect(trilhos[1]).not.toBe(ouro);
});

test('o botão do toggle fica centrado no trilho, ligado ou desligado', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const folgas = await page.locator('[data-tema="escuro"] [data-grupo="Toggle e checkbox"] [data-estado="normal"] .veio-toggle__trilho')
    .evaluateAll(nos => nos.map(trilho => {
      const botao = getComputedStyle(trilho, '::after');
      const esquerda = parseFloat(botao.left);
      return {
        ligado: trilho.previousElementSibling.checked,
        esquerda,
        direita: trilho.clientWidth - esquerda - parseFloat(botao.width),
      };
    }));

  const ligado = folgas.find(folga => folga.ligado);
  const desligado = folgas.find(folga => !folga.ligado);
  expect(desligado.esquerda).toBe(2);
  expect(ligado.direita).toBe(2);
});

test('sem atalho gravado, o kbd fica tracejado', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const semAtalho = page.locator('[data-tema="escuro"] .veio-kbd--sem-atalho');
  await expect(semAtalho).toHaveText('Sem atalho');
  await expect(semAtalho).toHaveCSS('border-style', 'dashed');

  await expect(page.locator('[data-tema="escuro"] .veio-kbd:not(.veio-kbd--sem-atalho)').first())
    .toHaveCSS('border-style', 'solid');
});

test('a amostra de foco parado desenha o mesmo anel do foco de verdade', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const parado = await page.locator('[data-tema="escuro"] .veio-botao.amostra-de-foco-parado').first().evaluate(anelDoFoco);

  const botao = page.locator('[data-tema="escuro"] [data-grupo="Botões"] [data-estado="normal"] .veio-botao').first();
  await botao.focus();
  const deVerdade = await botao.evaluate(anelDoFoco);

  expect(parado).toBe(deVerdade);
});

test('o estado vazio ensina o que fazer e leva a ação junto', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  for (const tema of TEMAS) {
    const vazios = page.locator(`[data-tema="${tema}"] [data-grupo="Estado vazio"] .veio-vazio`);
    await expect(vazios).toHaveCount(2);

    await expect(vazios.nth(0)).toContainText('Nenhuma frase ainda');
    await expect(vazios.nth(0).getByRole('button', { name: 'Minerar frases' })).toBeVisible();
    await expect(vazios.nth(1)).toContainText('gavião');
    await expect(vazios.nth(1).getByRole('button', { name: 'Limpar busca' })).toBeVisible();
  }
});

// Exceção de teste: sem-estado-guardado — a vitrine não tem chrome.storage.
test('o modal é um diálogo, começa no botão seguro e prende o foco', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const { abrir, scrim, dialogo } = modalEscuro(page);

  await abrir.click();
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toHaveAttribute('aria-modal', 'true');

  await expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeFocused();

  const nomesFocados = [];
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('Tab');
    nomesFocados.push(await page.evaluate(() => ({
      dentro: document.querySelector('[data-modal="escuro"] [role="dialog"]').contains(document.activeElement),
      nome: document.activeElement.textContent,
    })));
  }
  expect(nomesFocados.every(f => f.dentro)).toBe(true);
  expect(new Set(nomesFocados.map(f => f.nome)).size).toBe(2);

  expect(await page.locator('.cabecalho').evaluate(no => no.hasAttribute('inert'))).toBe(true);
});

// Exceção de teste: sem-estado-guardado — a vitrine não tem chrome.storage.
test('Esc fecha o modal e devolve o foco a quem abriu', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const { abrir, scrim } = modalEscuro(page);

  await abrir.click();
  await expect(scrim).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(scrim).toBeHidden();
  await expect(abrir).toBeFocused();
  expect(await page.locator('.cabecalho').evaluate(no => no.hasAttribute('inert'))).toBe(false);
});

// Exceção de teste: sem-estado-guardado — a vitrine não tem chrome.storage.
test('o clique fora fecha o modal, e dentro dele não', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const { abrir, scrim, dialogo } = modalEscuro(page);

  await abrir.click();
  await dialogo.locator('.veio-modal__titulo').click();
  await expect(scrim).toBeVisible();

  await scrim.click({ position: { x: 5, y: 5 } });
  await expect(scrim).toBeHidden();
  await expect(abrir).toBeFocused();
});

// Exceção de teste: sem-estado-guardado — a vitrine não tem chrome.storage.
test('o toast de sucesso some sozinho, depois do tempo de leitura', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const toast = page.locator('.veio-toast');
  await page.locator('[data-tema="escuro"] [data-grupo="Toast"] button').click();
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText('12 frases apagadas');

  await page.waitForTimeout(2400);
  await expect(toast).toBeVisible();

  await expect(toast).toBeHidden({ timeout: 4000 });
});

// Exceção de teste: sem-estado-guardado — a vitrine não tem chrome.storage.
test('o toast aparece no tema da coluna que o mostrou', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  for (const tema of TEMAS) {
    const coluna = page.locator(`[data-tema="${tema}"]`);
    await coluna.locator('[data-grupo="Toast"] button').click();

    const toast = coluna.locator('.veio-toast');
    await expect(toast).toBeVisible();

    const surface = await coluna.evaluate(no => {
      const medida = document.createElement('span');
      medida.style.backgroundColor = 'var(--veio-surface)';
      no.append(medida);
      const cor = getComputedStyle(medida).backgroundColor;
      medida.remove();
      return cor;
    });
    await expect(toast).toHaveCSS('background-color', surface);
    await expect(toast).toBeHidden({ timeout: 6000 });
  }
});

test('o toast fica mais tempo quanto maior o texto', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  // Exceção de teste: componente-base

  const tempoNaTela = texto => page.evaluate(texto => new Promise(resolve => {
    const comecou = performance.now();
    PerpetualMiner.Veio.mostrarToastDeSucesso(texto, {
      aoSumir: () => resolve(performance.now() - comecou),
    });
  }), texto);

  const curto = await tempoNaTela('Frase copiada');
  const longo = await tempoNaTela('Contexto de 12 frases atualizado neste computador e na nuvem');

  expect(curto).toBeGreaterThanOrEqual(2600);
  expect(longo).toBeGreaterThan(curto + 1000);
});

// Exceção de teste: sem-estado-guardado — a vitrine não tem chrome.storage.
test('o aviso persistente fica até ser fechado e tem Detalhes recolhido', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const aviso = page.locator('[data-tema="escuro"] .veio-aviso[role="alert"]');
  await expect(aviso).toBeVisible();
  await expect(aviso).toHaveAttribute('role', 'alert');
  await expect(aviso).toContainText('As frases foram apagadas deste computador');
  await expect(aviso.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  await expect(aviso.getByRole('button', { name: 'Ocultar' })).toBeVisible();

  const detalhes = aviso.locator('.veio-aviso__detalhes');
  await expect(detalhes.locator('pre')).toBeHidden();
  await detalhes.locator('summary').click();
  await expect(detalhes.locator('pre')).toBeVisible();
  await expect(detalhes.locator('pre')).toContainText('HTTP 403');

  await page.waitForTimeout(4000);
  await expect(aviso).toBeVisible();

  const detalhesAbertos = detalhes.locator('pre');
  await expect(detalhesAbertos).toBeVisible();
  await aviso.getByRole('button', { name: 'Ocultar' }).click();
  await expect(aviso.locator('.veio-aviso__detalhes pre')).toBeHidden();
  await expect(page.locator('[data-tema="escuro"] .veio-aviso[role="alert"]')).toBeVisible();
});

test('o aviso que só informa é neutro, fala sem alarme e abre com a 1ª frase em negrito', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const info = page.locator('[data-tema="escuro"] .veio-aviso--info');
  await expect(info).toBeVisible();
  await expect(info).toHaveAttribute('role', 'status');
  await expect(info.locator('strong')).toHaveText('Leitura cancelada.');
  await expect(info).toContainText('Leitura cancelada. 2 fotos ficaram sem ler; as frases das fotos já lidas continuam aqui.');
  await expect(info.locator('.veio-aviso__texto svg')).toHaveCount(1);

  const cores = await page.locator('[data-tema="escuro"]').evaluate(coluna => {
    const erro = getComputedStyle(coluna.querySelector('.veio-aviso[role="alert"]'));
    const neutro = getComputedStyle(coluna.querySelector('.veio-aviso--info'));
    return { erro: [erro.borderColor, erro.backgroundColor], neutro: [neutro.borderColor, neutro.backgroundColor] };
  });
  expect(cores.neutro[0]).not.toBe(cores.erro[0]);
  expect(cores.neutro[1]).not.toBe(cores.erro[1]);
});

test('a Palavra é grifada de 50% a 94% da linha, sem raio', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  for (const tema of TEMAS) {
    const palavra = page.locator(`[data-tema="${tema}"] .veio-palavra`).first();
    await expect(palavra).toBeVisible();
    await expect(palavra).toHaveText('responsibility');
    await expect(palavra).toHaveCSS('border-radius', '0px');

    const faixa = await palavra.evaluate(no => getComputedStyle(no).backgroundImage);
    expect(faixa).toContain('linear-gradient');
    expect(faixa).toContain('50%');
    expect(faixa).toContain('94%');

    const kwBg = await page.locator(`[data-tema="${tema}"]`)
      .evaluate(no => getComputedStyle(no).getPropertyValue('--veio-kw-bg').trim());
    const emRgba = kwBg.replace(/\s+/g, '').replace('rgba(', '').replace(')', '').split(',');
    expect(faixa).toContain(emRgba[0]);
  }
});

test('o chip diz se a Palavra foi escolhida ou detectada, com o rótulo em mono', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const chips = page.locator('[data-tema="escuro"] .veio-chip-palavra');
  await expect(chips.nth(0)).toHaveText('palavra:responsibility');
  await expect(chips.nth(1)).toHaveText('auto:крови');

  await expect(chips.nth(0).locator('.veio-chip-palavra__rotulo'))
    .toHaveCSS('font-family', /JetBrains Mono/);

  expect(await page.locator('main').innerText()).not.toContain('keyword');
});

test('a frase mostra o texto como texto, mesmo com marcação dentro', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const texto = '<img src=x onerror="window.__injetado=1">Hold the line.';
  // Exceção de teste: componente-base
  await page.evaluate(texto => {
    const corpo = document.querySelector('[data-tema="escuro"] .veio-frase__texto');
    PerpetualMiner.Veio.escreverFrase(corpo, texto, 'line');
  }, texto);

  const corpo = page.locator('[data-tema="escuro"] .veio-frase__texto').first();
  await expect(corpo).toHaveText(texto);
  await expect(corpo.locator('img')).toHaveCount(0);
  await expect(corpo.locator('.veio-palavra')).toHaveText('line');
  expect(await page.evaluate(() => window.__injetado)).toBeUndefined();
});

// Exceção de teste: sem-estado-guardado — a vitrine não tem chrome.storage.
test('na frase clicável, cada palavra é um botão, a escolhida é grifada e as setas andam numa parada só do Tab', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const cartao = page.locator('[data-tema="escuro"] [data-estado="palavra clicável, na ilha"] .veio-frase');
  await expect(cartao).toHaveClass(/veio-frase--na-ilha/);
  const [fundoDoCartao, fundoDaIlha, bg] = await cartao.evaluate(no => [
    getComputedStyle(no).backgroundColor,
    getComputedStyle(no.parentElement).backgroundColor,
    getComputedStyle(no.closest('[data-tema]')).backgroundColor,
  ]);
  expect(fundoDoCartao).toBe(bg);
  expect(fundoDaIlha).not.toBe(bg);

  const palavra = nome => cartao.getByRole('button', { name: nome, exact: true });
  await expect(palavra('fault')).toHaveAttribute('aria-pressed', 'true');
  expect(await palavra('fault').evaluate(no => getComputedStyle(no).backgroundImage)).toContain('linear-gradient');
  await expect(palavra('not')).toHaveAttribute('aria-pressed', 'false');
  await expect(cartao.locator('[role="button"][tabindex="0"]')).toHaveCount(1);

  await cartao.locator('[role="button"][tabindex="0"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(palavra('saying').first()).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(palavra('not')).toBeFocused();
  await expect(cartao.locator('[role="button"][tabindex="0"]')).toHaveCount(1);
});

// Exceção de teste: sem-estado-guardado — a vitrine não tem chrome.storage.
test('toda a cópia da vitrine vem do catálogo da Voz', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const doCatalogo = await copiaDaVitrine(page);
  expect(doCatalogo.length).toBeGreaterThan(20);

  for (const tema of TEMAS) {
    const coluna = page.locator(`[data-tema="${tema}"] [data-componentes]`);

    const toast = page.locator('.veio-toast');
    await page.locator(`[data-tema="${tema}"] [data-grupo="Toast"] button`).click();
    await expect(toast).toBeVisible();

    await page.locator(`[data-abre-o-modal="${tema}"]`).click();
    await expect(page.locator(`[data-modal="${tema}"] [role="dialog"]`)).toBeVisible();

    const percebido = [
      await coluna.innerText(),
      await coluna.evaluate(no => no.textContent),
      await toast.innerText(),
      ...await coluna.locator('[aria-label], [placeholder]').evaluateAll(
        nos => nos.flatMap(no => [no.getAttribute('aria-label'), no.getAttribute('placeholder')])),
    ].filter(Boolean).join('\n');

    for (const [id, texto] of doCatalogo) {
      expect(percebido, `${id} não apareceu no tema ${tema}`).toContain(texto);
    }

    await page.keyboard.press('Escape');
    await expect(page.locator(`[data-modal="${tema}"]`)).toBeHidden();
    await expect(toast).toBeHidden({ timeout: 5000 });
  }

  const aprovados = new Set(doCatalogo.map(([, texto]) => texto));
  const doGlossario = new Set(['Netflix', 'YouTube', 'Web', 'PDF', 'Livro', 'Manual']);
  const teclasGravadas = new Set(['Alt', 'S']);
  const doPadrao = new Set(['palavra:', 'auto:', 'Detalhes']);

  const soltos = await textosEscritos(page);

  expect(soltos.filter(texto => ![aprovados, doGlossario, teclasGravadas, doPadrao].some(lista => lista.has(texto)))).toEqual([]);
});

// Exceção de teste: sem-estado-guardado — a vitrine não tem chrome.storage.
test('todo controle da vitrine mostra onde o foco está', async ({ page, paginas }) => {
  test.setTimeout(90_000);
  await abrirVitrine(page, paginas);

  await ensinarAVitrineADesenharOFoco(page);

  const focados = [];
  for (let ordem = 0; ordem < 120; ordem += 1) {
    await page.keyboard.press('Tab');
    const focado = await anotarOFocadoDaVitrine(page, ordem);
    if (!focado) break;
    if (!focado.pular) focados.push(focado);
  }

  const desfocados = await desenhosDosAnotadosDaVitrineSemFoco(page);

  const semFoco = focados
    .filter((focado, i) => focado.desenho === desfocados[i])
    .map(focado => focado.controle);

  expect(focados.length).toBeGreaterThan(20);
  expect(semFoco).toEqual([]);
});
