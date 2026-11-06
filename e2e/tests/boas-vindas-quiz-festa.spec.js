'use strict';

// Boas-vindas · a festa e a revelação do quiz de nível (#171, ONB-21 e ONB-22; histórias 54, 57 e 60): a cada acerto, som curto, pulo, a sequência que sobe uma nota, confete,
// pontos e placar; errar mostra a certa sem som nem confete; no fim, as portas enchem até o nível, com acorde e confete, e só depois vêm os números. Com “menos movimento”
// só a cor muda; nada toca antes do primeiro toque; o botão de som fica sempre à vista. O som é o WebAudio, trocado por um que anota as notas (`window.__sons`): o que a
// pessoa ouve é o que foi mandado tocar. O relógio fica parado (`relogioParado`) como nos outros testes do quiz.

const { test, expect } = require('../fixtures');
const { quiz, responderAParte1, responder, percorrer, abrirOQuiz, fraseDaPergunta, CERTA, OS_DOIS, grupo } = require('../apoio-do-quiz');

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
    // Exceção de teste: sem-estado-guardado — o som e o botão são só o que a tela faz; nada é guardado até Usar este estilo.
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
    const relogio = await abrirOQuiz(page, extensao, relogioParado);
    await responderAParte1(page, 'Inglês', 'iniciante');

    await responder(page, 'Inglês', fakes, relogio, 'certo');
    const primeiro = (await sons(page)).notas;
    await responder(page, 'Inglês', fakes, relogio, 'certo');
    const depois = (await sons(page)).notas;
    // Cada acerto toca a nota da escala e a oitava dela; o segundo começa mais alto que o primeiro.
    expect(primeiro).toHaveLength(2);
    expect(depois).toHaveLength(4);
    expect(depois[2].hz).toBeGreaterThan(primeiro[0].hz);

    await responder(page, 'Inglês', fakes, relogio, 'errado');
    expect((await sons(page)).notas.slice(0, 4)).toEqual(depois);
    expect((await sons(page)).notas.length).toBeGreaterThan(4); // só o acorde e o rufar da Revelação, que vêm depois do último erro
  });

  test('o chute errado e “Não sei” não tocam a nota de acerto', async ({ page, extensao, fakes, relogioParado }) => {
    // Exceção de teste: sem-estado-guardado — o som é só o que a tela faz; nada é guardado até Usar este estilo.
    const relogio = await abrirOQuiz(page, extensao, relogioParado);
    await responderAParte1(page, 'Inglês', 'iniciante');

    await responder(page, 'Inglês', fakes, relogio, 'errado');
    expect((await sons(page)).notas).toEqual([]);
    await quiz(page, 'Inglês').getByRole('button', { name: 'Não sei', exact: true }).click();
    // “Não sei” tem o tom neutro e baixo, de outro timbre que o do acerto.
    expect((await sons(page)).notas).toEqual([{ hz: 330, tipo: 'triangle' }]);
  });

  test('com o som desligado, o acerto não toca nada e o botão diz que está desligado', async ({ page, extensao, fakes, relogioParado }) => {
    // Exceção de teste: sem-estado-guardado — o som ligado ou desligado é só da tela aberta; nada é guardado.
    const relogio = await abrirOQuiz(page, extensao, relogioParado);
    await responderAParte1(page, 'Inglês', 'iniciante');

    await botaoDeSom(page).click();
    await expect(botaoDeSom(page)).toHaveAttribute('aria-pressed', 'false');
    await responder(page, 'Inglês', fakes, relogio, 'certo');
    await expect(quiz(page, 'Inglês')).toContainText('Pontos: 10');
    expect(await sons(page)).toEqual({ contextos: 0, notas: [] });
  });
});

test.describe('a festa do acerto', () => {
  test('o acerto pula, solta confete, mostra os pontos e sobe o placar; a sequência faz os pontos crescerem', async ({ page, extensao, fakes, relogioParado }) => {
    // Exceção de teste: sem-estado-guardado — a festa é só o que aparece na tela; nada é guardado até Usar este estilo.
    const relogio = await abrirOQuiz(page, extensao, relogioParado);
    await responderAParte1(page, 'Inglês', 'iniciante');
    await expect(quiz(page, 'Inglês')).toContainText('Pontos: 0');

    const certa = quiz(page, 'Inglês').locator('.quiz__opcao[data-estado="certa"]');
    await quiz(page, 'Inglês').locator('.quiz__opcao').nth(1).click(); // a certa da primeira pergunta (legenda) é a segunda alternativa
    await expect(certa).toHaveAttribute('data-pulo', '');
    await expect(certa.locator('.quiz__pedaco').first()).toBeAttached();
    const primeiro = await certa.locator('.quiz__pedaco').count();
    await expect(quiz(page, 'Inglês').locator('.quiz__ganho')).toHaveText('+10');
    await expect(quiz(page, 'Inglês')).toContainText('Pontos: 10');
    await relogio.avancar(1000);

    // O segundo acerto seguido vale mais e solta mais confete que o primeiro.
    const certa2 = CERTA[await fraseDaPergunta(page, 'Inglês', fakes)];
    await quiz(page, 'Inglês').locator('.quiz__opcao').getByText(certa2, { exact: true }).click();
    await expect(quiz(page, 'Inglês').locator('.quiz__ganho').last()).toHaveText('+20');
    await expect(quiz(page, 'Inglês')).toContainText('Pontos: 30');
    expect(await certa.locator('.quiz__pedaco').count()).toBeGreaterThan(primeiro);
  });

  test('errar mostra a certa marcada, sem pulo, sem confete e sem pontos', async ({ page, extensao, fakes, relogioParado }) => {
    // Exceção de teste: sem-estado-guardado — a festa é só o que aparece na tela; nada é guardado até Usar este estilo.
    await abrirOQuiz(page, extensao, relogioParado);
    await responderAParte1(page, 'Inglês', 'iniciante');

    await quiz(page, 'Inglês').locator('.quiz__opcao').nth(0).click(); // a certa é a segunda
    await expect(quiz(page, 'Inglês').locator('.quiz__opcao[data-estado="certa"]')).toHaveCount(1);
    await expect(quiz(page, 'Inglês').locator('.quiz__opcao[data-pulo]')).toHaveCount(0);
    await expect(quiz(page, 'Inglês').locator('.quiz__pedaco')).toHaveCount(0);
    await expect(quiz(page, 'Inglês').locator('.quiz__ganho')).toHaveCount(0);
    await expect(quiz(page, 'Inglês')).toContainText('Pontos: 0');
  });
});

test.describe('a Revelação', () => {
  test('as portas enchem até o nível, o acorde e o confete grande vêm, e os números entram depois', async ({ page, extensao, fakes, relogioParado }) => {
    const relogio = await abrirOQuiz(page, extensao, relogioParado);
    await responderAParte1(page, 'Inglês', 'iniciante');
    await percorrer(page, 'Inglês', fakes, relogio, ['certo', 'certo', 'certo', 'certo', 'certo', 'errado']);

    // Intermediário: duas portas cheias, a do nível em ouro e a de cima vazia.
    const portas = quiz(page, 'Inglês').locator('.quiz__porta');
    await expect(portas).toHaveCount(3);
    await expect(quiz(page, 'Inglês').locator('.quiz__porta[data-cheia]')).toHaveCount(2);
    await expect(quiz(page, 'Inglês').locator('.quiz__porta[data-alvo]')).toHaveText('Intermediário');
    await expect(quiz(page, 'Inglês').locator('.quiz__confete--revelacao .quiz__pedaco').first()).toBeAttached();
    await expect(quiz(page, 'Inglês').locator('.quiz__revelado .quiz__resumo')).toHaveText('5 de 6 certas · melhor sequência: 5 · escuta: 2 de 2');
    // O rufar e o acorde da Revelação foram mandados tocar (as notas de acerto vieram antes).
    expect((await sons(page)).notas.filter(n => n.tipo === 'triangle').length).toBeGreaterThanOrEqual(10);
  });
});

test.describe('menos movimento', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a certa só muda de cor: não pula, não solta confete nem mostra “+10”', async ({ page, extensao, fakes, relogioParado }) => {
    // Exceção de teste: sem-estado-guardado — a festa é só o que aparece na tela; nada é guardado até Usar este estilo.
    await abrirOQuiz(page, extensao, relogioParado);
    await responderAParte1(page, 'Inglês', 'iniciante');

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
    const relogio = await abrirOQuiz(page, extensao, relogioParado);
    await responderAParte1(page, 'Inglês', 'iniciante');
    await percorrer(page, 'Inglês', fakes, relogio, ['errado', 'certo', 'certo']);

    await expect(quiz(page, 'Inglês').locator('.quiz__porta[data-cheia]')).toHaveCount(1);
    await expect(quiz(page, 'Inglês').locator('.quiz__porta[data-alvo]')).toHaveText('Iniciante');
    await expect(quiz(page, 'Inglês').locator('.quiz__pedaco')).toHaveCount(0);
    await expect(quiz(page, 'Inglês').locator('.quiz__revelado')).toHaveCSS('animation-name', 'none');
    await expect(quiz(page, 'Inglês').locator('.quiz__porta-enchimento').first()).toHaveCSS('animation-name', 'none');
  });
});
