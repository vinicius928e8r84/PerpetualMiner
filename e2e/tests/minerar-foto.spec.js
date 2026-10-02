'use strict';

// Minerar de uma foto · Página Fotos × frases (#36), o layout C travado em
// docs/design/foto/. A página lê a foto pelo Gemini (falsificado na fronteira
// HTTP) e mina pelo service worker de verdade: os testes olham o que a pessoa
// vê na tela e o que fica gravado em `frases`. Cancelar, Recomeçar e
// “Tentar de novo” numa foto são do #37.

const { test, expect } = require('../fixtures');

const CHAVE = 'chave-de-teste';

const FRASES_DA_PAGINA_1 = [
  'The ferry left without a single passenger.',
  'She folded the map along its oldest crease.',
  'Rain drummed on the tin roof all night.',
];
const FRASES_DA_PAGINA_2 = [
  'He kept the letter unopened for a decade.',
  'The orchard smelled of bruised apples.',
];

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const foto = nome => ({ name: nome, mimeType: 'image/png', buffer: PNG_1X1 });

async function abrirAPagina(page, extensao, { chave = CHAVE } = {}) {
  if (chave) await extensao.gravarStorage({ geminiApiKey: chave });
  await page.goto(extensao.url('bookreader.html'));
  await expect(page.getByRole('heading', { name: 'Minerar de uma foto' })).toBeVisible();
}

const enviarFotos = (page, ...fotos) => page.locator('#foto-arquivo').setInputFiles(fotos);
const filaDeFotos = page => page.getByRole('list', { name: 'Fotos' });
const fotoNaFila = (page, nome) => filaDeFotos(page).getByRole('listitem').filter({ hasText: nome });
const botaoMinerar = page => page.locator('#foto-minerar');
const colunaDasFrases = page => page.locator('#foto-estado');
const frase = (page, texto) => page.getByRole('checkbox', { name: texto, exact: true });
const gravadasDoLivro = async extensao => (await extensao.frases()).filter(f => f.streaming === 'livro');

/** Lê uma foto só: ela para na prévia, e “Ler marcações” lê. */
async function lerUmaFoto(page, nome = 'pagina.png') {
  await enviarFotos(page, foto(nome));
  await page.getByRole('button', { name: 'Ler marcações' }).click();
}

// ─── O caminho feliz de hoje ────────────────────────────────────────────────

test('uma foto: prévia, leitura, frases agrupadas pela foto e “Minerar N frases” grava todas com o Livro', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases(FRASES_DA_PAGINA_1);
  await abrirAPagina(page, extensao);
  await page.getByLabel('Livro').fill('Atomic Habits');

  await enviarFotos(page, foto('pagina.png'));
  await expect(page.getByText('Confira se as marcações aparecem na foto')).toBeVisible();
  await expect(fotoNaFila(page, 'pagina.png')).toContainText('Pronta');
  expect(fakes.gemini.chamadas).toHaveLength(0);

  await page.getByRole('button', { name: 'Ler marcações' }).click();

  await expect(fotoNaFila(page, 'pagina.png')).toContainText('3 frases');
  await expect(page.getByText('Foto 1', { exact: true })).toBeVisible();
  for (const texto of FRASES_DA_PAGINA_1) await expect(frase(page, texto)).toBeChecked();
  await expect(page.getByText('3 frases encontradas')).toBeVisible();
  await expect(botaoMinerar(page)).toHaveText('Minerar 3 frases');
  expect(fakes.gemini.chamadas[0].chave).toBe(CHAVE);

  await botaoMinerar(page).click();

  await expect(page.locator('.veio-toast')).toHaveText('3 frases mineradas');
  const gravadas = await gravadasDoLivro(extensao);
  expect(gravadas.map(f => f.texto).sort()).toEqual([...FRASES_DA_PAGINA_1].sort());
  for (const gravada of gravadas) {
    expect(gravada.contexto).toEqual({ fonte: 'livro', titulo: 'Atomic Habits', detalhe: '' });
    expect(gravada.idioma).toBe('Inglês');
  }
});

test('várias fotos pulam a prévia e são lidas em sequência, com o status de cada uma e o progresso', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases(FRASES_DA_PAGINA_1);
  const soltarASegunda = fakes.gemini.segurarFrases(FRASES_DA_PAGINA_2);
  fakes.gemini.responderFrases([]);
  await abrirAPagina(page, extensao);

  await enviarFotos(page, foto('a.png'), foto('b.png'), foto('c.png'));

  await expect(fotoNaFila(page, 'a.png')).toContainText('3 frases');
  await expect(fotoNaFila(page, 'b.png')).toContainText('Lendo…');
  await expect(fotoNaFila(page, 'c.png')).toContainText('Na fila');
  await expect(page.getByText('1 de 3 lidas')).toBeVisible();
  // As frases da foto já lida aparecem enquanto a próxima é lida.
  await expect(frase(page, FRASES_DA_PAGINA_1[0])).toBeVisible();

  soltarASegunda();

  await expect(fotoNaFila(page, 'b.png')).toContainText('2 frases');
  await expect(fotoNaFila(page, 'c.png')).toContainText('Sem marcações');
  await expect(page.getByText('3 de 3 lidas')).toBeHidden();
  await expect(page.getByText('Foto 2', { exact: true })).toBeVisible();
  await expect(page.getByText('Foto 3', { exact: true })).toBeHidden();
  await expect(botaoMinerar(page)).toHaveText('Minerar 5 frases');
});

test('lendo a primeira foto, a coluna das frases diz que está lendo, e as fotos novas entram na fila', async ({ page, extensao, fakes }) => {
  const soltar = fakes.gemini.segurarFrases(FRASES_DA_PAGINA_1);
  fakes.gemini.responderFrases(FRASES_DA_PAGINA_2);
  await abrirAPagina(page, extensao);

  await lerUmaFoto(page, 'a.png');
  await expect(page.getByText('Lendo a foto…')).toBeVisible();
  await expect(page.getByText('Procurando os trechos marcados')).toBeVisible();

  await enviarFotos(page, foto('b.png'));
  await expect(fotoNaFila(page, 'b.png')).toContainText('Na fila');
  await expect(page.getByText('1 foto na fila · arraste mais para ler em seguida')).toBeVisible();

  soltar();
  await expect(fotoNaFila(page, 'b.png')).toContainText('2 frases');
  await expect(botaoMinerar(page)).toHaveText('Minerar 5 frases');
});

test('a frase editada na lista é a que fica gravada', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases(['The ferry left without a singel passenger.']);
  await abrirAPagina(page, extensao);
  await lerUmaFoto(page);

  const texto = page.getByRole('textbox', { name: 'Texto da frase' });
  await texto.fill('The ferry left without a single passenger.');
  await botaoMinerar(page).click();

  await expect(page.locator('.veio-toast')).toHaveText('1 frase minerada');
  expect((await gravadasDoLivro(extensao)).map(f => f.texto)).toEqual(['The ferry left without a single passenger.']);
});

test('“Selecionar todas” marca e desmarca, fica misto com parte, e o botão conta só as marcadas', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases(FRASES_DA_PAGINA_1);
  await abrirAPagina(page, extensao);
  await lerUmaFoto(page);
  const todas = page.getByRole('checkbox', { name: 'Selecionar todas' });
  await expect(todas).toBeChecked();

  await frase(page, FRASES_DA_PAGINA_1[1]).uncheck();
  await expect(todas).toHaveJSProperty('indeterminate', true);
  await expect(botaoMinerar(page)).toHaveText('Minerar 2 frases');

  // Misto: o clique marca todas; marcado: o clique desmarca todas.
  await todas.click();
  await expect(todas).toBeChecked();
  await expect(botaoMinerar(page)).toHaveText('Minerar 3 frases');

  await todas.click();
  await expect(todas).not.toBeChecked();
  await expect(botaoMinerar(page)).toBeDisabled();
  await expect(botaoMinerar(page)).toHaveText('Selecione pelo menos uma frase');

  await todas.click();

  await frase(page, FRASES_DA_PAGINA_1[1]).uncheck();
  await botaoMinerar(page).click();
  await expect(page.locator('.veio-toast')).toHaveText('2 frases mineradas');
  expect((await gravadasDoLivro(extensao)).map(f => f.texto).sort())
    .toEqual([FRASES_DA_PAGINA_1[0], FRASES_DA_PAGINA_1[2]].sort());
});

// ─── Gravou ou não gravou: só um “ok” do service worker conta ────────────────

test('um service worker que responde sem confirmar a gravação não deixa a frase “Minerada”', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases(FRASES_DA_PAGINA_1);
  await abrirAPagina(page, extensao);
  await lerUmaFoto(page);
  await expect(botaoMinerar(page)).toHaveText('Minerar 3 frases');

  // O service worker "responde", mas sem confirmar nada (nem erro): sem `ok`, não gravou.
  await page.evaluate(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = (mensagem, retorno) => {
      if (mensagem?.type !== 'SALVAR_HISTORICO') return original(mensagem, retorno);
      setTimeout(() => retorno(undefined));
    };
  });
  await botaoMinerar(page).click();

  await expect(page.locator('#foto-avisos')).toContainText('Não deu para minerar as frases. Tente de novo.');
  await expect(page.locator('.foto-frase__minerada:visible')).toHaveCount(0);
  await expect(frase(page, FRASES_DA_PAGINA_1[0])).toBeEnabled();
  await expect(page.locator('.veio-toast')).toHaveCount(0);
  expect(await gravadasDoLivro(extensao)).toEqual([]);
});

// ─── Bug de #9: o botão “salvo” reabilitava e salvava de novo ────────────────

test('minerar e clicar de novo não grava nada duas vezes; as mineradas ficam “Minerada” e saem do botão', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases(FRASES_DA_PAGINA_1);
  fakes.gemini.responderFrases(FRASES_DA_PAGINA_2);
  await abrirAPagina(page, extensao);
  await lerUmaFoto(page, 'a.png');

  await botaoMinerar(page).dblclick();
  await expect(page.locator('.veio-toast')).toHaveText('3 frases mineradas');
  for (const texto of FRASES_DA_PAGINA_1) {
    const linha = page.locator('.foto-frase').filter({ has: frase(page, texto) });
    await expect(linha).toContainText('Minerada');
    await expect(linha).not.toContainText('✓');
    await expect(frase(page, texto)).toBeDisabled();
  }
  await expect(botaoMinerar(page)).toBeDisabled();
  await botaoMinerar(page).click({ force: true });

  // Chega outra foto: o botão volta, mas só com as frases novas.
  await enviarFotos(page, foto('b.png'));
  await expect(fotoNaFila(page, 'b.png')).toContainText('2 frases');
  await expect(botaoMinerar(page)).toHaveText('Minerar 2 frases');
  await botaoMinerar(page).click();
  await expect(page.locator('.veio-toast').last()).toHaveText('2 frases mineradas');

  const gravadas = await gravadasDoLivro(extensao);
  expect(gravadas.map(f => f.texto).sort()).toEqual([...FRASES_DA_PAGINA_1, ...FRASES_DA_PAGINA_2].sort());
});

// ─── Bug de #9: o estado vazio culpava as marcações quando a API falhava ─────

test('o Gemini sem marcações diz “Sem marcações” e ensina a marcar', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases([]);
  await abrirAPagina(page, extensao);
  await lerUmaFoto(page);

  await expect(fotoNaFila(page, 'pagina.png')).toContainText('Sem marcações');
  await expect(page.getByText('Nenhuma marcação encontrada nesta foto', { exact: true })).toBeVisible();
  await expect(page.getByText('Marque as frases com /barras/, _sublinhado_ ou caneta e confira se aparecem na foto.', { exact: true })).toBeVisible();
  // A legenda das marcações fica só no pé da fila, não se repete no vazio.
  await expect(page.getByText('entre barras')).toHaveCount(1);
  await expect(colunaDasFrases(page).getByText('entre barras')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(botaoMinerar(page)).toBeHidden();
});

test('o Gemini com pedidos demais: a foto falha com o motivo, sem culpar as marcações', async ({ page, extensao, fakes }) => {
  fakes.gemini.falhar(429, 'Resource has been exhausted (e.g. check quota).');
  await abrirAPagina(page, extensao);
  await lerUmaFoto(page);

  const cartao = fotoNaFila(page, 'pagina.png');
  await expect(cartao).toContainText('Falhou');
  await expect(cartao).toContainText('O Gemini está recebendo pedidos demais; espere um minuto e tente de novo.');
  // Sem nenhuma frase, a coluna das frases é o estado da falha, e não há um aviso repetindo o mesmo.
  const coluna = colunaDasFrases(page);
  await expect(coluna.getByText('Não deu para ler a foto', { exact: true })).toBeVisible();
  await expect(coluna).toContainText('O Gemini está recebendo pedidos demais; espere um minuto e tente de novo.');
  await expect(coluna.getByText('Detalhes')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);

  await expect(page.getByText(/Nenhuma marcação/)).toHaveCount(0);
  await expect(page.getByText('Sem marcações')).toHaveCount(0);
});

test('a chave recusada pelo Gemini diz que a chave não funciona e leva a Configurações', async ({ page, context, extensao, fakes }) => {
  fakes.gemini.falhar(400, 'API key not valid. Please pass a valid API key.');
  await abrirAPagina(page, extensao);
  await lerUmaFoto(page);

  const coluna = colunaDasFrases(page);
  await expect(coluna).toContainText('A chave do Gemini não funciona. Confira em Configurações.');
  const [painel] = await Promise.all([
    context.waitForEvent('page'),
    coluna.getByRole('button', { name: 'Abrir Configurações' }).click(),
  ]);
  await expect(painel).toHaveURL(/painel\.html#configuracoes\/chave$/);
});

test('sem rede, a foto falha dizendo que falta a conexão', async ({ page, extensao, fakes }) => {
  fakes.gemini.ficarSemRede();
  await abrirAPagina(page, extensao);
  await lerUmaFoto(page);

  await expect(fotoNaFila(page, 'pagina.png')).toContainText('Sem conexão com a internet. Confira a rede e tente de novo.');
  await expect(colunaDasFrases(page)).toContainText('Não deu para ler a foto');
});

test('uma resposta do Gemini sem texto (pedido bloqueado) é falha, não “Sem marcações”', async ({ page, extensao, fakes }) => {
  fakes.gemini.bloquear('SAFETY');
  await abrirAPagina(page, extensao);
  await lerUmaFoto(page);

  await expect(fotoNaFila(page, 'pagina.png')).toContainText('Falhou');
  const coluna = colunaDasFrases(page);
  await expect(coluna).toContainText('Não deu para ler a foto');
  await expect(coluna).toContainText('Algo deu errado. Tente de novo.');
  await expect(page.getByText('Sem marcações')).toHaveCount(0);
});

test('uma foto sem marcações e outra que falhou: a coluna diz que a leitura falhou, sem culpar as marcações', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases([]);
  fakes.gemini.falhar(500, 'Internal error encountered.');
  await abrirAPagina(page, extensao);

  await enviarFotos(page, foto('a.png'), foto('b.png'));

  await expect(fotoNaFila(page, 'a.png')).toContainText('Sem marcações');
  await expect(fotoNaFila(page, 'b.png')).toContainText('Falhou');
  const coluna = colunaDasFrases(page);
  await expect(coluna.getByText('Não deu para ler a foto', { exact: true })).toBeVisible();
  await expect(coluna).toContainText('Algo deu errado. Tente de novo.');
  await expect(page.getByText(/Nenhuma marcação encontrada/)).toHaveCount(0);
});

test('uma foto que falha não apaga as frases das outras', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases(FRASES_DA_PAGINA_1);
  fakes.gemini.falhar(500, 'Internal error encountered.');
  await abrirAPagina(page, extensao);

  await enviarFotos(page, foto('a.png'), foto('b.png'));

  await expect(fotoNaFila(page, 'b.png')).toContainText('Falhou');
  await expect(page.getByRole('alert')).toContainText('Não deu para ler a foto 2. Algo deu errado. Tente de novo.');
  await expect(botaoMinerar(page)).toHaveText('Minerar 3 frases');
});

test('várias fotos sem marcações: o vazio fala das fotos, no plural', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases([]);
  fakes.gemini.responderFrases([]);
  await abrirAPagina(page, extensao);

  await enviarFotos(page, foto('a.png'), foto('b.png'));

  await expect(fotoNaFila(page, 'b.png')).toContainText('Sem marcações');
  await expect(page.getByText('Nenhuma marcação encontrada nestas fotos', { exact: true })).toBeVisible();
});

test('várias fotos que falham dão um aviso só, com o símbolo de aviso e sem Detalhes', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases(FRASES_DA_PAGINA_1);
  fakes.gemini.falhar(500, 'Internal error encountered.');
  fakes.gemini.falhar(429, 'Resource has been exhausted (e.g. check quota).');
  await abrirAPagina(page, extensao);

  await enviarFotos(page, foto('a.png'), foto('b.png'), foto('c.png'));

  await expect(fotoNaFila(page, 'c.png')).toContainText('Falhou');
  const aviso = page.getByRole('alert');
  await expect(aviso).toHaveCount(1);
  await expect(aviso).toContainText('Não deu para ler 2 fotos. Algo deu errado. Tente de novo.');
  await expect(aviso.locator('strong')).toHaveText('Não deu para ler 2 fotos.');
  await expect(aviso.locator('.veio-aviso__texto svg')).toHaveCount(1);
  await expect(aviso.getByText('Detalhes')).toHaveCount(0);
  await expect(botaoMinerar(page)).toHaveText('Minerar 3 frases');
});

test('todas as fotos falharam: a coluna das frases diz que não deu para ler, com a causa e o caminho até a chave', async ({ page, extensao, fakes }) => {
  fakes.gemini.falhar(400, 'API key not valid. Please pass a valid API key.');
  fakes.gemini.falhar(400, 'API key not valid. Please pass a valid API key.');
  await abrirAPagina(page, extensao);

  await enviarFotos(page, foto('a.png'), foto('b.png'));

  await expect(fotoNaFila(page, 'b.png')).toContainText('Falhou');
  const coluna = colunaDasFrases(page);
  await expect(coluna.getByText('Não deu para ler as fotos', { exact: true })).toBeVisible();
  await expect(coluna).toContainText('A chave do Gemini não funciona. Confira em Configurações.');
  await expect(coluna.getByRole('button', { name: 'Abrir Configurações' })).toBeVisible();
  await expect(coluna.getByText('Detalhes')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText(/Nenhuma marcação/)).toHaveCount(0);
});

test('fechado, o aviso das falhas não volta com uma foto lida; volta com uma falha nova', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases(FRASES_DA_PAGINA_1);
  fakes.gemini.falhar(500, 'Internal error encountered.');
  await abrirAPagina(page, extensao);
  await enviarFotos(page, foto('a.png'), foto('b.png'));
  const aviso = page.getByRole('alert');
  await expect(aviso).toContainText('Não deu para ler a foto 2.');
  await aviso.getByRole('button', { name: 'Fechar' }).click();
  await expect(aviso).toHaveCount(0);

  fakes.gemini.responderFrases(FRASES_DA_PAGINA_2);
  await enviarFotos(page, foto('c.png'));
  await expect(fotoNaFila(page, 'c.png')).toContainText('2 frases');
  await expect(aviso).toHaveCount(0);

  fakes.gemini.falhar(500, 'Internal error encountered.');
  await enviarFotos(page, foto('d.png'));
  await expect(fotoNaFila(page, 'd.png')).toContainText('Falhou');
  await expect(aviso).toContainText('Não deu para ler 2 fotos.');
});

// ─── Cancelar (FOT-06, FOT-07, FOT-21) ───────────────────────────────────────

const FRASES_DA_PAGINA_3 = ['The lamp flickered twice and went out.'];
const botaoCancelar = page => page.getByRole('button', { name: 'Cancelar', exact: true });
const botaoRecomecar = page => page.getByRole('button', { name: 'Recomeçar' });
const dialogo = page => page.getByRole('dialog');

test('4 fotos, Cancelar depois da 2ª: as fotos 3 e 4 ficam “Cancelada” e as frases das fotos 1 e 2 continuam', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases(FRASES_DA_PAGINA_1);
  fakes.gemini.responderFrases(FRASES_DA_PAGINA_2);
  const soltarATerceira = fakes.gemini.segurarFrases(FRASES_DA_PAGINA_3);
  await abrirAPagina(page, extensao);

  await enviarFotos(page, foto('a.png'), foto('b.png'), foto('c.png'), foto('d.png'));
  await expect(fotoNaFila(page, 'c.png')).toContainText('Lendo…');
  await expect(page.getByText('2 de 4 lidas')).toBeVisible();
  await expect(fotoNaFila(page, 'd.png')).toContainText('Na fila');

  await botaoCancelar(page).click();

  await expect(fotoNaFila(page, 'c.png')).toContainText('Cancelada');
  await expect(fotoNaFila(page, 'd.png')).toContainText('Cancelada');
  await expect(fotoNaFila(page, 'a.png')).toContainText('3 frases');
  await expect(fotoNaFila(page, 'b.png')).toContainText('2 frases');
  await expect(botaoCancelar(page)).toHaveCount(0);
  await expect(page.getByText('2 de 4 lidas')).toBeHidden();
  const aviso = page.locator('#foto-avisos .veio-aviso');
  await expect(aviso).toHaveText('Leitura cancelada. 2 fotos ficaram sem ler; as frases das fotos já lidas continuam aqui.');
  await expect(aviso.locator('strong')).toHaveText('Leitura cancelada.');
  // Informa, não alarma: é um status, não um alerta.
  await expect(aviso).toHaveAttribute('role', 'status');
  await expect(botaoMinerar(page)).toHaveText('Minerar 5 frases');

  // A resposta que chega depois de cancelar não entra, e a 4ª foto nem vai ao Gemini.
  await soltarATerceira();
  fakes.gemini.responderFrases(['A new page arrived after the cancel.']);
  await enviarFotos(page, foto('e.png'));
  await expect(fotoNaFila(page, 'e.png')).toContainText('1 frase');
  await expect(frase(page, FRASES_DA_PAGINA_3[0])).toHaveCount(0);
  await expect(fotoNaFila(page, 'c.png')).toContainText('Cancelada');
  expect(fakes.gemini.chamadas).toHaveLength(4);

  await botaoMinerar(page).click();
  await expect(page.locator('.veio-toast')).toHaveText('6 frases mineradas');
  expect(await gravadasDoLivro(extensao)).toHaveLength(6);
});

test('lendo a 1ª foto de várias, a coluna diz “Lendo a foto 1 de 3…”, e Cancelar antes de ler qualquer foto diz que nenhuma foi lida', async ({ page, extensao, fakes }) => {
  const soltar = fakes.gemini.segurarFrases(FRASES_DA_PAGINA_1);
  await abrirAPagina(page, extensao);

  await enviarFotos(page, foto('a.png'), foto('b.png'), foto('c.png'));
  await expect(colunaDasFrases(page).getByText('Lendo a foto 1 de 3…')).toBeVisible();
  await botaoCancelar(page).focus();
  await page.keyboard.press('Enter');

  for (const nome of ['a.png', 'b.png', 'c.png']) await expect(fotoNaFila(page, nome)).toContainText('Cancelada');
  const coluna = colunaDasFrases(page);
  // Nada foi lido: a coluna não promete frases que não existem.
  await expect(coluna.getByText('Leitura cancelada', { exact: true })).toBeVisible();
  await expect(coluna.getByText('Nenhuma foto chegou a ser lida.', { exact: true })).toBeVisible();
  await expect(page.getByText(/frases das fotos já lidas/)).toHaveCount(0);
  // Sem frases, a própria coluna é o aviso: ele não se repete no topo.
  await expect(page.locator('#foto-avisos .veio-aviso')).toHaveCount(0);
  await expect(coluna.getByRole('button', { name: 'Recomeçar' })).toBeVisible();
  // O foco não se perde quando o Cancelar some.
  await expect(page.locator('body')).not.toBeFocused();

  await soltar();
  await expect(frase(page, FRASES_DA_PAGINA_1[0])).toHaveCount(0);
});

// ─── Recomeçar (FOT-17, FOT-18) ──────────────────────────────────────────────

test('Recomeçar com a leitura em andamento: nenhuma frase chega depois (sem itens fantasma)', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases(FRASES_DA_PAGINA_1);
  const soltarASegunda = fakes.gemini.segurarFrases(FRASES_DA_PAGINA_2);
  await abrirAPagina(page, extensao);
  await page.getByLabel('Livro').fill('Atomic Habits');

  await enviarFotos(page, foto('a.png'), foto('b.png'));
  await expect(fotoNaFila(page, 'b.png')).toContainText('Lendo…');
  await botaoRecomecar(page).click();
  await dialogo(page).getByRole('button', { name: 'Descartar 3 frases' }).click();

  await expect(filaDeFotos(page).getByRole('listitem')).toHaveCount(0);
  await expect(page.getByText('Arraste fotos de páginas marcadas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Escolher' })).toBeFocused();
  await expect(page.getByLabel('Livro')).toHaveValue('Atomic Habits');

  // A 2ª foto responde depois de Recomeçar: nada dela aparece.
  await soltarASegunda();
  fakes.gemini.responderFrases(FRASES_DA_PAGINA_3);
  await lerUmaFoto(page, 'nova.png');
  await expect(fotoNaFila(page, 'nova.png')).toContainText('1 frase');
  await expect(filaDeFotos(page).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByText('Foto 1', { exact: true })).toBeVisible();
  await expect(frase(page, FRASES_DA_PAGINA_2[0])).toHaveCount(0);
  await expect(frase(page, FRASES_DA_PAGINA_1[0])).toHaveCount(0);
  await expect(page.getByText('1 frase encontrada')).toBeVisible();
  expect(await gravadasDoLivro(extensao)).toHaveLength(0);
});

test('Recomeçar com frases não mineradas pede confirmação no modal; Cancelar mantém tudo', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases(FRASES_DA_PAGINA_1);
  await abrirAPagina(page, extensao);
  await lerUmaFoto(page, 'a.png');
  await expect(frase(page, FRASES_DA_PAGINA_1[0])).toBeVisible();

  await botaoRecomecar(page).click();

  const modal = dialogo(page);
  await expect(modal.getByRole('heading')).toHaveText('Descartar 3 frases não mineradas?');
  await expect(modal).toContainText('Elas ainda não foram mineradas e vão se perder.');
  await expect(modal.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await expect(modal.getByRole('button', { name: 'Descartar 3 frases' })).toBeVisible();

  await modal.getByRole('button', { name: 'Cancelar' }).click();
  await expect(modal).toHaveCount(0);
  await expect(botaoRecomecar(page)).toBeFocused();
  await expect(fotoNaFila(page, 'a.png')).toContainText('3 frases');
  await expect(botaoMinerar(page)).toHaveText('Minerar 3 frases');

  // Esc também fecha sem descartar.
  await botaoRecomecar(page).click();
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(frase(page, FRASES_DA_PAGINA_1[0])).toBeVisible();
});

test('Recomeçar conta só as frases ainda não mineradas, e sem nenhuma pendente recomeça direto', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases(FRASES_DA_PAGINA_1);
  fakes.gemini.responderFrases(FRASES_DA_PAGINA_2);
  await abrirAPagina(page, extensao);
  await lerUmaFoto(page, 'a.png');
  await botaoMinerar(page).click();
  await expect(page.locator('.veio-toast')).toHaveText('3 frases mineradas');

  await enviarFotos(page, foto('b.png'));
  await expect(fotoNaFila(page, 'b.png')).toContainText('2 frases');
  // Uma desmarcada ainda se perde: conta também.
  await frase(page, FRASES_DA_PAGINA_2[0]).uncheck();
  await botaoRecomecar(page).click();
  await expect(dialogo(page).getByRole('heading')).toHaveText('Descartar 2 frases não mineradas?');
  await dialogo(page).getByRole('button', { name: 'Cancelar' }).click();

  await botaoMinerar(page).click();
  await expect(page.locator('.veio-toast').last()).toHaveText('1 frase minerada');
  await frase(page, FRASES_DA_PAGINA_2[0]).check();
  await botaoMinerar(page).click();
  await expect(frase(page, FRASES_DA_PAGINA_2[0])).toBeDisabled();

  await botaoRecomecar(page).click();

  await expect(dialogo(page)).toHaveCount(0);
  await expect(filaDeFotos(page).getByRole('listitem')).toHaveCount(0);
  await expect(page.locator('#foto-lista')).toBeHidden();
  await expect(page.getByText('Arraste fotos de páginas marcadas')).toBeVisible();
  // O que foi minerado continua gravado.
  expect(await gravadasDoLivro(extensao)).toHaveLength(5);
});

test('Recomeçar também está na prévia e nos vazios de falha e de sem marcações', async ({ page, extensao, fakes }) => {
  await abrirAPagina(page, extensao);
  await enviarFotos(page, foto('a.png'));
  await colunaDasFrases(page).getByRole('button', { name: 'Recomeçar' }).click();
  await expect(filaDeFotos(page).getByRole('listitem')).toHaveCount(0);

  fakes.gemini.responderFrases([]);
  await lerUmaFoto(page, 'b.png');
  await expect(fotoNaFila(page, 'b.png')).toContainText('Sem marcações');
  await colunaDasFrases(page).getByRole('button', { name: 'Recomeçar' }).click();
  await expect(filaDeFotos(page).getByRole('listitem')).toHaveCount(0);

  fakes.gemini.falhar(500, 'Internal error encountered.');
  await lerUmaFoto(page, 'c.png');
  await expect(fotoNaFila(page, 'c.png')).toContainText('Falhou');
  await colunaDasFrases(page).getByRole('button', { name: 'Recomeçar' }).click();
  await expect(filaDeFotos(page).getByRole('listitem')).toHaveCount(0);
  await expect(page.getByText('Arraste fotos de páginas marcadas')).toBeVisible();
});

// ─── “Tentar de novo” numa foto que falhou (FOT-11, FOT-19) ─────────────────

test('“Tentar de novo” numa foto que falhou lê só aquela foto', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases(FRASES_DA_PAGINA_1);
  fakes.gemini.falhar(500, 'Internal error encountered.');
  fakes.gemini.responderFrases([]);
  await abrirAPagina(page, extensao);

  await enviarFotos(page, foto('a.png'), foto('b.png'), foto('c.png'));
  await expect(fotoNaFila(page, 'c.png')).toContainText('Sem marcações');
  await expect(fotoNaFila(page, 'b.png')).toContainText('Falhou');
  // Só a foto que falhou tem “Tentar de novo”.
  await expect(filaDeFotos(page).getByRole('button', { name: 'Tentar de novo' })).toHaveCount(1);
  expect(fakes.gemini.chamadas).toHaveLength(3);

  fakes.gemini.responderFrases(FRASES_DA_PAGINA_2);
  await fotoNaFila(page, 'b.png').getByRole('button', { name: 'Tentar de novo' }).click();

  await expect(fotoNaFila(page, 'b.png')).toContainText('2 frases');
  await expect(fotoNaFila(page, 'b.png').getByRole('button', { name: 'Tentar de novo' })).toHaveCount(0);
  await expect(fotoNaFila(page, 'a.png')).toContainText('3 frases');
  await expect(fotoNaFila(page, 'c.png')).toContainText('Sem marcações');
  expect(fakes.gemini.chamadas).toHaveLength(4);
  // A foto que falhou não falha mais: o aviso sai.
  await expect(page.locator('#foto-avisos .veio-aviso')).toHaveCount(0);
  await expect(page.getByText('Foto 2', { exact: true })).toBeVisible();
  await expect(botaoMinerar(page)).toHaveText('Minerar 5 frases');
});

test('“Tentar de novo” com todas as fotos falhadas: a que volta a falhar continua com o motivo, e a outra é lida', async ({ page, extensao, fakes }) => {
  fakes.gemini.falhar(429, 'Resource has been exhausted (e.g. check quota).');
  fakes.gemini.ficarSemRede();
  await abrirAPagina(page, extensao);

  await enviarFotos(page, foto('a.png'), foto('b.png'));
  await expect(fotoNaFila(page, 'b.png')).toContainText('Falhou');

  fakes.gemini.falhar(429, 'Resource has been exhausted (e.g. check quota).');
  await fotoNaFila(page, 'a.png').getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(fotoNaFila(page, 'a.png')).toContainText('O Gemini está recebendo pedidos demais');
  await expect(fotoNaFila(page, 'a.png').getByRole('button', { name: 'Tentar de novo' })).toBeVisible();

  fakes.gemini.responderFrases(FRASES_DA_PAGINA_2);
  await fotoNaFila(page, 'b.png').getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(fotoNaFila(page, 'b.png')).toContainText('2 frases');
  await expect(page.getByRole('alert')).toContainText('Não deu para ler a foto 1.');
  expect(fakes.gemini.chamadas).toHaveLength(4);
});

// ─── Bug de #9: “Voltar” abria um segundo painel ──────────────────────────────

test('“Voltar ao painel” com o painel aberto foca aquela aba, sem abrir outra nem recarregar', async ({ page, context, extensao }) => {
  const painel = await context.newPage();
  await painel.goto(extensao.url('painel.html#frases'));
  await painel.evaluate(() => { window.continuaAMesmaPagina = true; });
  await abrirAPagina(page, extensao);
  await page.bringToFront();
  const abasAntes = context.pages().length;

  await page.getByRole('button', { name: 'Voltar ao painel' }).click();

  await expect.poll(() => extensao.serviceWorker.evaluate(async () =>
    (await chrome.tabs.query({ active: true })).map(aba => new URL(aba.url).pathname))).toEqual(['/painel.html']);
  expect(context.pages()).toHaveLength(abasAntes);
  expect(await painel.evaluate(() => window.continuaAMesmaPagina)).toBe(true);
});

test('“Voltar ao painel” sem painel aberto abre um', async ({ page, context, extensao }) => {
  await abrirAPagina(page, extensao);

  const [painel] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Voltar ao painel' }).click(),
  ]);

  await expect(painel).toHaveURL(/painel\.html/);
});

// ─── Bug de #9: o Título do livro nunca era lembrado ────────────────────────

test('o Livro digitado volta preenchido na próxima visita', async ({ page, extensao }) => {
  await abrirAPagina(page, extensao);
  await page.getByLabel('Livro').fill('Братья Карамазовы');

  await page.reload();

  await expect(page.getByLabel('Livro')).toHaveValue('Братья Карамазовы');
});

test('com o Livro em branco a frase vai com o Título “Físico/Livro”, como hoje', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases([FRASES_DA_PAGINA_1[0]]);
  await abrirAPagina(page, extensao);
  await lerUmaFoto(page);
  await botaoMinerar(page).click();

  await expect(page.locator('.veio-toast')).toHaveText('1 frase minerada');
  expect((await gravadasDoLivro(extensao))[0].contexto.titulo).toBe('Físico/Livro');
});

// ─── Bug de #9: HEIC anunciado mas recusado ou mal rotulado ──────────────────

test('o que a página anuncia de formatos é o que ela aceita: HEIC entra e vai ao Gemini como HEIC', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases(FRASES_DA_PAGINA_1);
  await abrirAPagina(page, extensao);
  await expect(page.getByText('JPG, PNG, HEIC ou WEBP')).toBeVisible();
  const aceita = await page.locator('#foto-arquivo').getAttribute('accept');
  for (const formato of ['.jpg', '.jpeg', '.png', '.heic', '.webp']) expect(aceita).toContain(formato);
  // Só o que a página anuncia: nada de formato a mais.
  expect(aceita).not.toMatch(/heif/);

  // O Chrome no Windows entrega o HEIC sem tipo: a página reconhece pela extensão.
  await enviarFotos(page, { name: 'IMG_2041.HEIC', mimeType: '', buffer: PNG_1X1 });
  await page.getByRole('button', { name: 'Ler marcações' }).click();

  await expect(fotoNaFila(page, 'IMG_2041.HEIC')).toContainText('3 frases');
  expect(fakes.gemini.chamadas[0].mimeType).toBe('image/heic');
});

test('um arquivo que não é foto é recusado com o aviso, e nada entra na fila', async ({ page, extensao, fakes }) => {
  await abrirAPagina(page, extensao);

  await enviarFotos(page, { name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('oi') });

  await expect(page.getByRole('alert')).toContainText('Esse arquivo não é uma foto. Use JPG, PNG, HEIC ou WEBP.');
  await expect(filaDeFotos(page).getByRole('listitem')).toHaveCount(0);
  expect(fakes.gemini.chamadas).toHaveLength(0);
});

// ─── Sem chave do Gemini ─────────────────────────────────────────────────────

test('sem chave, o cartão FOT-05 no lugar do campo de chave, e “Abrir Configurações” abre #configuracoes/chave com o campo focado', async ({ page, context, extensao }) => {
  await abrirAPagina(page, extensao, { chave: null });

  await expect(page.getByText('Falta a chave do Gemini')).toBeVisible();
  await expect(page.getByText('Para ler fotos, adicione sua chave do Gemini em Configurações.')).toBeVisible();
  await expect(page.getByText('Adicione a chave do Gemini para começar', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Escolher' })).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);

  const [painel] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Abrir Configurações' }).click(),
  ]);

  await expect(painel).toHaveURL(/painel\.html#configuracoes\/chave$/);
  await expect(painel.locator('#cfg-chave-campo')).toBeFocused();
});

test('sem chave e com o painel aberto, “Abrir Configurações” leva aquela aba à chave', async ({ page, context, extensao }) => {
  const painel = await context.newPage();
  await painel.goto(extensao.url('painel.html#frases'));
  await abrirAPagina(page, extensao, { chave: null });
  const abasAntes = context.pages().length;

  await page.getByRole('button', { name: 'Abrir Configurações' }).click();

  await expect(painel).toHaveURL(/painel\.html#configuracoes\/chave$/);
  await expect(painel.locator('#cfg-chave-campo')).toBeFocused();
  expect(context.pages()).toHaveLength(abasAntes);
});

test('com o painel já em #configuracoes/chave, “Abrir Configurações” põe o foco no campo de novo', async ({ page, context, extensao }) => {
  const painel = await context.newPage();
  await painel.goto(extensao.url('painel.html#configuracoes/chave'));
  await expect(painel.locator('#cfg-chave-campo')).toBeFocused();
  await painel.locator('#cfg-chave-campo').blur();
  await abrirAPagina(page, extensao, { chave: null });
  await page.bringToFront();

  await page.getByRole('button', { name: 'Abrir Configurações' }).click();

  await expect(painel.locator('#cfg-chave-campo')).toBeFocused();
});

test('a chave salva no painel libera a página sem recarregar', async ({ page, extensao }) => {
  await abrirAPagina(page, extensao, { chave: null });
  await expect(page.getByText('Falta a chave do Gemini')).toBeVisible();

  await extensao.gravarStorage({ geminiApiKey: CHAVE });

  await expect(page.getByText('Falta a chave do Gemini')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Escolher' })).toBeVisible();
  await expect(page.getByText('Tire uma foto da página com os trechos marcados e escolha quais frases minerar. As frases aparecem aqui, agrupadas por foto.', { exact: true })).toBeVisible();
});

// ─── Teclado, leitor de tela e movimento ─────────────────────────────────────

test('os controles têm nome, e o teclado chega à escolha de fotos e ao Livro', async ({ page, extensao, fakes }) => {
  fakes.gemini.responderFrases(FRASES_DA_PAGINA_1);
  await abrirAPagina(page, extensao);

  await expect(page.getByLabel('Livro')).toHaveAttribute('placeholder', 'Ex.: Atomic Habits');
  await page.getByLabel('Livro').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Voltar ao painel' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Escolher' })).toBeFocused();

  // O status de cada foto muda sozinho: a fila avisa o leitor de tela.
  await expect(filaDeFotos(page)).toHaveAttribute('aria-live', 'polite');

  await lerUmaFoto(page);
  await expect(page.getByRole('checkbox', { name: 'Selecionar todas' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Texto da frase' })).toHaveCount(3);
  // Cada frase é um marco do teclado: o checkbox (com o nome da frase) e o texto editável.
  await frase(page, FRASES_DA_PAGINA_1[0]).focus();
  await page.keyboard.press('Space');
  await expect(frase(page, FRASES_DA_PAGINA_1[0])).not.toBeChecked();
});

test('com movimento reduzido, o “Lendo…” da foto fica parado', async ({ page, extensao, fakes }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const soltar = fakes.gemini.segurarFrases(FRASES_DA_PAGINA_1);
  await abrirAPagina(page, extensao);
  await lerUmaFoto(page);

  const ponto = fotoNaFila(page, 'pagina.png').locator('.veio-selo__ponto');
  await expect(ponto).toBeVisible();
  const animacao = await ponto.evaluate(no => {
    const estilo = getComputedStyle(no);
    return { nome: estilo.animationName };
  });
  expect(animacao.nome).toBe('none');
  soltar();
});

// ─── Tema ────────────────────────────────────────────────────────────────────

test('a página segue o tema escolhido, sem recarregar', async ({ page, extensao }) => {
  await abrirAPagina(page, extensao);
  const fundo = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const escuro = await fundo();

  await extensao.gravarStorage({ pm_tema: 'claro' });

  await expect.poll(fundo).not.toBe(escuro);
});
