'use strict';

// Base Veio · os componentes base e a página-vitrine.
//
// A vitrine é a referência visual: ela carrega os mesmos tokens, componentes e
// catálogo da Voz que as páginas da extensão carregam. Os testes afirmam o que
// a pessoa vê na vitrine e como ela reage ao teclado e ao mouse.

const { test, expect } = require('../fixtures');

/** Os componentes que a vitrine mostra, na ordem em que ela os monta. */
const COMPONENTES = [
  'Botões', 'Campos', 'Toggle e checkbox', 'Selos', 'Atalhos',
  'Controle segmentado', 'Azulejo', 'Anel de progresso', 'Modal', 'Toast', 'Aviso persistente',
  'Estado vazio', 'Esqueleto', 'Linha de frase',
];

const TEMAS = ['escuro', 'claro'];

// Exceção de teste: catálogo (CLAUDE.md § Testing).
/** O texto aprovado de cada estado que a vitrine mostra, lido do catálogo. */
const copiaDaVitrine = page => page.evaluate(() =>
  PerpetualMiner.Vitrine.CATALOGO_DA_VITRINE.map(([id, valores]) =>
    [id, PerpetualMiner.textoDaVoz(id, valores)]));

const abrirVitrine = async (page, paginas) => {
  await page.goto(paginas.url('vitrine.html'));
  await expect(page.locator('[data-grupo="Botões"]').first()).toBeVisible();
};

test('a vitrine mostra cada componente nos dois temas', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  for (const tema of TEMAS) {
    const coluna = page.locator(`[data-tema="${tema}"]`);
    for (const componente of COMPONENTES) {
      await expect(coluna.locator(`[data-grupo="${componente}"]`)).toBeVisible();
    }
  }

  // As duas colunas mostram a mesma galeria, e cada uma lê os tokens dela.
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

    // Desabilitado é desabilitado de verdade, não só mais claro.
    const desligados = coluna.locator('[data-estado="desabilitado"] .veio-botao');
    await expect(desligados.first()).toBeDisabled();

    // Erro é dito pelo aria-invalid, que o leitor de tela também ouve.
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

  // As cores vêm dos tokens do tema, não de um valor escrito aqui.
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

  // Primário é ouro preenchido; perigo tem contorno e preenchido.
  expect(await fundoDe('primario')).toBe(ouro);
  expect(await fundoDe('fantasma')).toBe('rgba(0, 0, 0, 0)');
  expect(await fundoDe('perigo')).toBe('rgba(0, 0, 0, 0)');
  expect(await fundoDe('perigo-cheio')).toBe(perigo);

  await expect(linha.locator('.veio-botao--perigo')).toHaveCSS('border-color', perigo);

  // Só-ícone é circular e diz o que faz, porque não tem texto.
  const soIcone = linha.locator('.veio-botao-icone').first();
  await expect(soIcone).toHaveCSS('border-radius', '50%');
  expect((await soIcone.getAttribute('aria-label')).length).toBeGreaterThan(0);
  await expect(soIcone).toHaveText('');
});

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

  // Folga entre o botão e a borda de dentro do trilho, dos dois lados.
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

  // Ligado (à direita) e desligado (à esquerda) deixam a mesma folga que o
  // protótipo: 2 px até a borda.
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

  // O atalho gravado é sólido, para os dois não se confundirem.
  await expect(page.locator('[data-tema="escuro"] .veio-kbd:not(.veio-kbd--sem-atalho)').first())
    .toHaveCSS('border-style', 'solid');
});

test('a amostra de foco parado desenha o mesmo anel do foco de verdade', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  // A linha "foco" da vitrine pinta o anel o tempo todo, para o dono ver o
  // estado parado. Se ela divergir do anel que tokens.css desenha no foco de
  // verdade, a referência passa a mentir — então os dois são comparados.
  const parado = await page.locator('[data-tema="escuro"] .veio-botao.demo-de-foco').first()
    .evaluate(no => {
      const estilo = getComputedStyle(no);
      return [estilo.outlineStyle, estilo.outlineWidth, estilo.outlineColor, estilo.outlineOffset].join(' ');
    });

  const deVerdade = await page.locator('[data-tema="escuro"] [data-grupo="Botões"] [data-estado="normal"] .veio-botao').first()
    .evaluate(no => {
      no.focus();
      const estilo = getComputedStyle(no);
      return [estilo.outlineStyle, estilo.outlineWidth, estilo.outlineColor, estilo.outlineOffset].join(' ');
    });

  expect(parado).toBe(deVerdade);
});

test('o estado vazio ensina o que fazer e leva a ação junto', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  for (const tema of TEMAS) {
    const vazios = page.locator(`[data-tema="${tema}"] [data-grupo="Estado vazio"] .veio-vazio`);
    await expect(vazios).toHaveCount(2);

    // O primeiro uso ensina a minerar; a busca sem resultado limpa a busca.
    await expect(vazios.nth(0)).toContainText('Nenhuma frase ainda');
    await expect(vazios.nth(0).getByRole('button', { name: 'Minerar frases' })).toBeVisible();
    await expect(vazios.nth(1)).toContainText('gavião');
    await expect(vazios.nth(1).getByRole('button', { name: 'Limpar busca' })).toBeVisible();
  }
});

test('o modal é um diálogo, começa no botão seguro e prende o foco', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const abrir = page.locator('[data-abre-o-modal="escuro"]');
  const scrim = page.locator('[data-modal="escuro"]');
  const dialogo = scrim.locator('[role="dialog"]');

  await abrir.click();
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toHaveAttribute('aria-modal', 'true');

  // O foco entra no botão seguro: "Cancelar", nunca no que apaga.
  await expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeFocused();

  // O Tab dá a volta dentro do modal e não sai para a página atrás.
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

  // O resto da página fica inerte: o leitor de tela também não sai do modal.
  expect(await page.locator('.cabecalho').evaluate(no => no.hasAttribute('inert'))).toBe(true);
});

test('Esc fecha o modal e devolve o foco a quem abriu', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const abrir = page.locator('[data-abre-o-modal="escuro"]');
  const scrim = page.locator('[data-modal="escuro"]');

  await abrir.click();
  await expect(scrim).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(scrim).toBeHidden();
  await expect(abrir).toBeFocused();
  expect(await page.locator('.cabecalho').evaluate(no => no.hasAttribute('inert'))).toBe(false);
});

test('o clique fora fecha o modal, e dentro dele não', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const abrir = page.locator('[data-abre-o-modal="escuro"]');
  const scrim = page.locator('[data-modal="escuro"]');
  const dialogo = scrim.locator('[role="dialog"]');

  await abrir.click();
  await dialogo.locator('.veio-modal__titulo').click();
  await expect(scrim).toBeVisible();

  // O canto do scrim é a área fora do modal.
  await scrim.click({ position: { x: 5, y: 5 } });
  await expect(scrim).toBeHidden();
  await expect(abrir).toBeFocused();
});

test('o toast de sucesso some sozinho, depois do tempo de leitura', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const toast = page.locator('.veio-toast');
  await page.locator('[data-tema="escuro"] [data-grupo="Toast"] button').click();
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText('12 frases apagadas');

  // Nunca some antes de dar para ler: 2,6 s é o mínimo.
  await page.waitForTimeout(2400);
  await expect(toast).toBeVisible();

  await expect(toast).toBeHidden({ timeout: 4000 });
});

test('o toast aparece no tema da coluna que o mostrou', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  for (const tema of TEMAS) {
    const coluna = page.locator(`[data-tema="${tema}"]`);
    await coluna.locator('[data-grupo="Toast"] button').click();

    const toast = coluna.locator('.veio-toast');
    await expect(toast).toBeVisible();

    // O fundo do toast é o surface do tema da coluna, não o do outro tema.
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

  // Exceção de teste: componente-base (CLAUDE.md § Testing, garantias da base sem gatilho na tela): a
  // vitrine só mostra um texto de toast, então o teste chama
  // `mostrarToastDeSucesso` com dois tamanhos e mede quanto cada toast fica
  // de fato na tela.

  /** Quanto tempo o toast deste texto fica de fato na tela. */
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

test('o aviso persistente fica até ser fechado e tem Detalhes recolhido', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const aviso = page.locator('[data-tema="escuro"] .veio-aviso[role="alert"]');
  await expect(aviso).toBeVisible();
  await expect(aviso).toHaveAttribute('role', 'alert');
  await expect(aviso).toContainText('As frases foram apagadas deste computador');
  await expect(aviso.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  await expect(aviso.getByRole('button', { name: 'Ocultar' })).toBeVisible();

  // A causa técnica começa recolhida, e abre quando a pessoa pede.
  const detalhes = aviso.locator('.veio-aviso__detalhes');
  await expect(detalhes.locator('pre')).toBeHidden();
  await detalhes.locator('summary').click();
  await expect(detalhes.locator('pre')).toBeVisible();
  await expect(detalhes.locator('pre')).toContainText('HTTP 403');

  // Ao contrário do toast, ele continua ali depois do tempo de leitura.
  await page.waitForTimeout(4000);
  await expect(aviso).toBeVisible();

  // Fechado, ele sai — e a vitrine o repõe, para a referência não perder um
  // componente no primeiro clique.
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

  // Neutro: nem a borda nem o fundo são os do erro.
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

    // A faixa usa o token kw-bg do tema da coluna, não uma cor solta.
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

  // "keyword" é nome técnico do código: nunca aparece na tela.
  expect(await page.locator('main').innerText()).not.toContain('keyword');
});

test('a frase mostra o texto como texto, mesmo com marcação dentro', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const texto = '<img src=x onerror="window.__injetado=1">Hold the line.';
  // Exceção de teste: componente-base (CLAUDE.md § Testing, garantias da base sem gatilho na tela):
  // nenhuma frase da vitrine traz marcação, então o teste chama `escreverFrase`
  // numa linha de frase da própria vitrine e confere o que aparece nela.
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

test('na frase clicável, cada palavra é um botão, a escolhida é grifada e as setas andam numa parada só do Tab', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const cartao = page.locator('[data-tema="escuro"] [data-estado="palavra clicável, na ilha"] .veio-frase');
  await expect(cartao).toHaveClass(/veio-frase--na-ilha/);
  // Dentro da ilha `surface`, o cartão é `bg`.
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

test('toda a cópia da vitrine vem do catálogo da Voz', async ({ page, paginas }) => {
  await abrirVitrine(page, paginas);

  const doCatalogo = await copiaDaVitrine(page);
  expect(doCatalogo.length).toBeGreaterThan(20);

  for (const tema of TEMAS) {
    const coluna = page.locator(`[data-tema="${tema}"] [data-componentes]`);

    // Toast e modal só mostram a cópia deles depois de chamados, então os dois
    // entram na conta abertos. O toast primeiro: com o modal aberto, o resto da
    // página fica inerte e não recebe mais clique.
    const toast = page.locator('.veio-toast');
    await page.locator(`[data-tema="${tema}"] [data-grupo="Toast"] button`).click();
    await expect(toast).toBeVisible();

    await page.locator(`[data-abre-o-modal="${tema}"]`).click();
    await expect(page.locator(`[data-modal="${tema}"] [role="dialog"]`)).toBeVisible();

    // O que a pessoa lê na tela, mais o que o leitor de tela fala: o botão
    // só-ícone diz "Apagar frase" pelo aria-label, não por um texto visível.
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

  // E nenhum componente carrega texto solto: o que cada um mostra é um estado
  // do catálogo, um valor do glossário (a Fonte), a tecla que a pessoa gravou,
  // ou o andaime da vitrine.
  const aprovados = new Set(doCatalogo.map(([, texto]) => texto));
  const doGlossario = new Set(['Netflix', 'YouTube', 'Web', 'PDF', 'Livro', 'Manual']);
  const teclasGravadas = new Set(['Alt', 'S']);
  // Os três nomes de padrão que a própria base escreve, com a fonte de cada
  // um: o rótulo do chip da Palavra (CONTEXT.md e regra V6 da Voz) e o nome do
  // recolhido da causa técnica (regra V3 da Voz).
  const doPadrao = new Set(['palavra:', 'auto:', 'Detalhes']);

  const soltos = await page.evaluate(() => {
    const SELETORES = ['.veio-botao', '.veio-selo', '.veio-kbd', '.veio-segmentado__opcao',
      '.veio-azulejo__numero', '.veio-modal__titulo', '.veio-modal__corpo', '.veio-toast',
      '.veio-chip-palavra__rotulo', '.veio-aviso__texto', '.veio-aviso__detalhes > summary',
      '.veio-campo-erro', '.veio-vazio__texto', '.veio-cabecalho-de-data'].join(', ');
    return [...document.querySelectorAll(`[data-componentes] :is(${SELETORES})`)]
      .filter(no => !no.closest('[data-vitrine-chrome]') && !no.hasAttribute('data-vitrine-chrome'))
      // textContent, e não innerText: o cabeçalho de data é escrito "hoje" e
      // só aparece em maiúsculas por causa do text-transform. O que se compara
      // com o catálogo é a cópia escrita, não a caixa que o CSS dá a ela.
      // A abertura em negrito de um aviso é uma parte do estado, e o resto é
      // outra: cada uma é conferida sozinha.
      .flatMap(no => {
        const abertura = no.matches('.veio-aviso__texto') && no.querySelector(':scope > strong');
        if (!abertura) return [no.textContent];
        return [abertura.textContent, no.textContent.slice(no.textContent.indexOf(abertura.textContent) + abertura.textContent.length)];
      })
      .map(texto => texto.trim())
      .filter(texto => texto !== '');
  });

  expect(soltos.filter(texto => !aprovados.has(texto) && !doGlossario.has(texto)
    && !teclasGravadas.has(texto) && !doPadrao.has(texto))).toEqual([]);
});

test('todo controle da vitrine mostra onde o foco está', async ({ page, paginas }) => {
  test.setTimeout(90_000); // Sob carga, os cerca de 100 Tabs não cabem nos 30 s padrão.
  await abrirVitrine(page, paginas);

  await page.evaluate(() => {
    // Lido depois que as transições de foco terminam, como a pessoa vê.
    window.desenhoDoFoco = async no => {
      await Promise.all(no.getAnimations().map(animacao => animacao.finished.catch(() => {})));
      const estilo = getComputedStyle(no);
      const anel = estilo.outlineStyle !== 'none' && parseFloat(estilo.outlineWidth) > 0
        ? `${estilo.outlineStyle} ${estilo.outlineWidth} ${estilo.outlineColor}`
        : 'sem anel';
      // O toggle e o segmentado desenham o foco no trilho, não no <input>.
      const pintado = no.nextElementSibling || no;
      return [anel, estilo.boxShadow, estilo.borderColor, estilo.backgroundColor,
        getComputedStyle(pintado).outlineStyle].join(' | ');
    };
  });

  const focados = [];
  for (let ordem = 0; ordem < 120; ordem += 1) {
    await page.keyboard.press('Tab');
    const focado = await page.evaluate(async ordem => {
      const no = document.activeElement;
      if (!no || no === document.body || no.dataset.focoDeTeste) return null;
      // A linha "foco" da vitrine pinta o anel o tempo todo, para o dono ver
      // o estado parado ao lado dos outros: ela não diz nada sobre o foco real.
      if (no.classList.contains('demo-de-foco')) return { pular: true };
      no.dataset.focoDeTeste = String(ordem);
      return {
        controle: no.id || `${no.tagName.toLowerCase()}.${no.className}`,
        desenho: await window.desenhoDoFoco(no),
      };
    }, ordem);
    if (!focado) break;
    if (!focado.pular) focados.push(focado);
  }

  const desfocados = await page.evaluate(() => {
    document.activeElement.blur();
    return Promise.all([...document.querySelectorAll('[data-foco-de-teste]')]
      .sort((a, b) => a.dataset.focoDeTeste - b.dataset.focoDeTeste)
      .map(no => window.desenhoDoFoco(no)));
  });

  const semFoco = focados
    .filter((focado, i) => focado.desenho === desfocados[i])
    .map(focado => focado.controle);

  expect(focados.length).toBeGreaterThan(20);
  expect(semFoco).toEqual([]);
});

test('com movimento reduzido, os sinais de estado ficam parados', async ({ page, paginas }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await abrirVitrine(page, paginas);

  // O esqueleto continua no lugar do conteúdo, mas sem brilho correndo.
  const esqueleto = page.locator('[data-tema="escuro"] .veio-esqueleto').first();
  await expect(esqueleto).toBeVisible();
  await expect(esqueleto).toHaveCSS('animation-name', 'none');

  await page.locator('[data-tema="escuro"] [data-grupo="Toast"] button').click();
  await expect(page.locator('.veio-toast')).toBeVisible();

  const aindaEmMovimento = await page.evaluate(async () => {
    const prazo = new Promise(resolve => setTimeout(resolve, 300));
    await Promise.race([
      Promise.all(document.getAnimations().map(a => a.finished.then(() => true, () => true))),
      prazo,
    ]);
    return document.getAnimations()
      .filter(animacao => animacao.playState === 'running')
      .map(animacao => animacao.animationName || 'sem nome');
  });

  expect(aindaEmMovimento).toEqual([]);
});

test('a vitrine com componentes também não pede nada ao Google Fonts', async ({ page, paginas }) => {
  const paraFora = [];
  page.on('request', req => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(req.url())) paraFora.push(req.url());
  });

  await abrirVitrine(page, paginas);
  await page.evaluate(() => document.fonts.ready);

  expect(paraFora).toEqual([]);
});
