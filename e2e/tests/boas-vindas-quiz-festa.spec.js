'use strict';

const { test, expect } = require('../fixtures');
const { quiz, responder, fraseDaPergunta, CERTA, OS_DOIS, grupo, CINCO_CERTAS_E_UMA_ERRADA, naParte2, chegarAoNivelSugerido } = require('../apoio-do-quiz');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const sons = window.__sons = { contextos: 0, notas: [] };
    window.AudioContext = class {
      constructor() { sons.contextos++; this.currentTime = 0; this.state = 'running'; this.destination = {}; }
      createOscillator() {
        const o = { type: '', frequency: { value: 0 }, connect() {}, stop() {}, start() { sons.notas.push({ hz: o.frequency.value, tipo: o.type }); } };
        return o;
      }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
      resume() {}
    };
  });
});

const sons = page => page.evaluate(() => window.__sons);
const botaoDeSom = (page, idioma = 'Inglês') => quiz(page, idioma).getByRole('button', { name: 'Som', exact: true });

test.describe('o som', () => {
  test('nada toca antes do primeiro toque, e o botão de som está à vista em toda tela do quiz', async ({ page, extensao, fakes, relogioParado }) => {
    // Exceção de teste: sem-estado-guardado
    await relogioParado();
    await extensao.gravarStorage({ pm_auto_miner_settings: OS_DOIS });
    await page.goto(extensao.url('painel.html#boas-vindas/nivel'));
    await expect(page.locator('.bv-card h2')).toHaveText('Escolher o nível do cartão');
    expect(await sons(page)).toEqual({ contextos: 0, notas: [] });

    await grupo(page, 'Russo').getByRole('button', { name: 'Não sei meu nível, quero descobrir' }).click();
    await expect(botaoDeSom(page, 'Russo')).toBeVisible();
    await expect(botaoDeSom(page, 'Russo')).toHaveAttribute('aria-pressed', 'true');
    await quiz(page, 'Russo').getByRole('button', { name: 'Já leio' }).click();
    await expect(botaoDeSom(page, 'Russo')).toBeVisible();
    expect(await sons(page)).toEqual({ contextos: 0, notas: [] });
  });

  test('cada acerto seguido toca uma nota mais alta, e errar não toca nada', async ({ page, extensao, fakes, relogioParado }) => {
    const partida = await naParte2({ page, extensao, fakes, relogioParado });

    await responder(partida, 'certo');
    const primeiro = (await sons(page)).notas;
    await responder(partida, 'certo');
    const depois = (await sons(page)).notas;
    expect(primeiro).toHaveLength(2);
    expect(depois).toHaveLength(4);
    expect(depois[2].hz).toBeGreaterThan(primeiro[0].hz);

    await responder(partida, 'errado');
    expect((await sons(page)).notas.slice(0, 4)).toEqual(depois);
    expect((await sons(page)).notas.length).toBeGreaterThan(4);
  });

  test('o chute errado e “Não sei” não tocam a nota de acerto', async ({ page, extensao, fakes, relogioParado }) => {
    // Exceção de teste: sem-estado-guardado
    const partida = await naParte2({ page, extensao, fakes, relogioParado });

    await responder(partida, 'errado');
    expect((await sons(page)).notas).toEqual([]);
    await quiz(page, 'Inglês').getByRole('button', { name: 'Não sei', exact: true }).click();
    expect((await sons(page)).notas).toEqual([{ hz: 330, tipo: 'triangle' }]);
  });

  test('com o som desligado, o acerto não toca nada e o botão diz que está desligado', async ({ page, extensao, fakes, relogioParado }) => {
    // Exceção de teste: sem-estado-guardado
    const partida = await naParte2({ page, extensao, fakes, relogioParado });

    await botaoDeSom(page).click();
    await expect(botaoDeSom(page)).toHaveAttribute('aria-pressed', 'false');
    await responder(partida, 'certo');
    await expect(quiz(page, 'Inglês')).toContainText('Pontos: 10');
    expect(await sons(page)).toEqual({ contextos: 0, notas: [] });
  });
});

test.describe('a festa do acerto', () => {
  test('o acerto pula, solta confete, mostra os pontos e sobe o placar; a sequência faz os pontos crescerem', async ({ page, extensao, fakes, relogioParado }) => {
    // Exceção de teste: sem-estado-guardado
    const partida = await naParte2({ page, extensao, fakes, relogioParado });
    await expect(quiz(page, 'Inglês')).toContainText('Pontos: 0');

    const certa = quiz(page, 'Inglês').locator('.quiz__opcao[data-estado="certa"]');
    await quiz(page, 'Inglês').locator('.quiz__opcao').nth(1).click();
    await expect(certa).toHaveAttribute('data-pulo', '');
    await expect(certa.locator('.quiz__pedaco').first()).toBeAttached();
    await expect(certa).toHaveCSS('opacity', '1');
    await expect(quiz(page, 'Inglês').locator('.quiz__opcao:disabled:not([data-estado])').first()).toHaveCSS('opacity', '0.45');
    const primeiro = await certa.locator('.quiz__pedaco').count();
    await expect(quiz(page, 'Inglês').locator('.quiz__ganho')).toHaveText('+10');
    await expect(quiz(page, 'Inglês')).toContainText('Pontos: 10');
    await expect(certa.locator('.quiz__ganho')).toHaveCount(1);
    await partida.relogio.avancar(1000);

    const certa2 = CERTA[await fraseDaPergunta(page, 'Inglês', fakes)];
    await quiz(page, 'Inglês').locator('.quiz__opcao').getByText(certa2, { exact: true }).click();
    await expect(quiz(page, 'Inglês').locator('.quiz__ganho').last()).toHaveText('+20');
    await expect(quiz(page, 'Inglês')).toContainText('Pontos: 30');
    expect(await certa.locator('.quiz__pedaco').count()).toBeGreaterThan(primeiro);
  });

  test('errar mostra a certa marcada, sem pulo, sem confete e sem pontos', async ({ page, extensao, fakes, relogioParado }) => {
    // Exceção de teste: sem-estado-guardado — a festa é só o que aparece na tela; nada é guardado até Usar este nível.
    await naParte2({ page, extensao, fakes, relogioParado });

    await quiz(page, 'Inglês').locator('.quiz__opcao').nth(0).click();
    await expect(quiz(page, 'Inglês').locator('.quiz__opcao[data-estado="certa"]')).toHaveCount(1);
    await expect(quiz(page, 'Inglês').locator('.quiz__opcao[data-pulo]')).toHaveCount(0);
    await expect(quiz(page, 'Inglês').locator('.quiz__pedaco')).toHaveCount(0);
    await expect(quiz(page, 'Inglês').locator('.quiz__ganho')).toHaveCount(0);
    await expect(quiz(page, 'Inglês')).toContainText('Pontos: 0');
  });
});

test.describe('a Revelação', () => {
  test('as portas enchem até o nível, o acorde e o confete grande vêm, e os números entram depois', async ({ page, extensao, fakes, relogioParado }) => {
    await chegarAoNivelSugerido({ page, extensao, fakes, relogioParado }, CINCO_CERTAS_E_UMA_ERRADA);

    const portas = quiz(page, 'Inglês').locator('.quiz__porta');
    await expect(portas).toHaveCount(3);
    await expect(quiz(page, 'Inglês').locator('.quiz__porta[data-cheia]')).toHaveCount(2);
    await expect(quiz(page, 'Inglês').locator('.quiz__porta[data-alvo]')).toHaveText('Intermediário');
    await expect(quiz(page, 'Inglês').locator('.quiz__confete--revelacao .quiz__pedaco').first()).toBeAttached();
    const [alvo, outra] = await portas.evaluateAll(lista => [lista[1], lista[2]].map(no => getComputedStyle(no).backgroundColor));
    expect(alvo).toBe(outra);
    await expect(quiz(page, 'Inglês').locator('.quiz__confete--revelacao .quiz__pedaco').first()).toHaveCSS('opacity', '0');
    await expect(quiz(page, 'Inglês').locator('.quiz__revelado .quiz__resumo')).toHaveText('5 de 6 certas · melhor sequência: 5 · escuta: 2 de 2');
    expect((await sons(page)).notas.filter(n => n.tipo === 'triangle').length).toBeGreaterThanOrEqual(10);
  });
});

test.describe('em 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a Revelação cabe no quiz: nada passa da borda e o nome de cada porta fica dentro dela', async ({ page, extensao, fakes, relogioParado }) => {
    // Exceção de teste: sem-estado-guardado
    await chegarAoNivelSugerido({ page, extensao, fakes, relogioParado }, CINCO_CERTAS_E_UMA_ERRADA);

    const medidas = await quiz(page, 'Inglês').evaluate(no => {
      const caixa = no.getBoundingClientRect();
      const filhos = [...no.querySelectorAll('*:not(.quiz__confete, .quiz__confete *)')].map(f => f.getBoundingClientRect()).filter(r => r.width);
      return {
        passaDaDireita: Math.max(0, ...filhos.map(r => r.right - caixa.right)),
        rolagem: no.scrollWidth - no.clientWidth,
        portas: [...no.querySelectorAll('.quiz__porta')].map(porta => {
          const nome = document.createRange();
          nome.selectNodeContents(porta.querySelector('.quiz__porta-nome'));
          const t = nome.getBoundingClientRect();
          const p = porta.getBoundingClientRect();
          return Math.min(t.left - p.left, p.right - t.right);
        }),
      };
    });
    expect(medidas.passaDaDireita).toBeLessThanOrEqual(0);
    expect(medidas.rolagem).toBeLessThanOrEqual(0);
    expect(Math.min(...medidas.portas)).toBeGreaterThanOrEqual(2);
  });
});

test.describe('menos movimento', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a certa só muda de cor: não pula, não solta confete nem mostra “+10”', async ({ page, extensao, fakes, relogioParado }) => {
    // Exceção de teste: sem-estado-guardado — a festa é só o que aparece na tela; nada é guardado até Usar este nível.
    await naParte2({ page, extensao, fakes, relogioParado });

    await quiz(page, 'Inglês').locator('.quiz__opcao').nth(1).click();
    const certa = quiz(page, 'Inglês').locator('.quiz__opcao[data-estado="certa"]');
    await expect(certa).toHaveCount(1);
    await expect(certa).toHaveCSS('animation-name', 'none');
    await expect(certa).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(quiz(page, 'Inglês').locator('.quiz__pedaco')).toHaveCount(0);
    await expect(quiz(page, 'Inglês').locator('.quiz__ganho')).toBeHidden();
    await expect(quiz(page, 'Inglês')).toContainText('Pontos: 10');
  });

  test('a Revelação já mostra as portas no nível, sem confete e sem animação', async ({ page, extensao, fakes, relogioParado }) => {
    await chegarAoNivelSugerido({ page, extensao, fakes, relogioParado }, ['errado', 'certo', 'certo']);

    await expect(quiz(page, 'Inglês').locator('.quiz__porta[data-cheia]')).toHaveCount(1);
    await expect(quiz(page, 'Inglês').locator('.quiz__porta[data-alvo]')).toHaveText('Iniciante');
    await expect(quiz(page, 'Inglês').locator('.quiz__pedaco')).toHaveCount(0);
    await expect(quiz(page, 'Inglês').locator('.quiz__revelado')).toHaveCSS('animation-name', 'none');
    await expect(quiz(page, 'Inglês').locator('.quiz__porta-enchimento').first()).toHaveCSS('animation-name', 'none');
  });
});
