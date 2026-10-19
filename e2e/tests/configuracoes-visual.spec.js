'use strict';

// Referência visual de Configurações · resumo primeiro + Conta & sync (#26),
// Chave do Gemini e Zona de perigo (#28), mais o card Aparência e o tema claro
// (#45).
//
// O dono revisa estas telas lado a lado com o protótipo travado
// (docs/design/painel/configuracoes/prototipo-configuracoes.html?variant=C).
// Depois de aprovadas, elas são a referência: uma mudança visual faz o teste
// falhar até alguém olhar e atualizar:
//
//   cd e2e && npx playwright test configuracoes-visual --update-snapshots
//
// O relógio fica parado, para “Sincronizado agora” sair sempre igual. Os dados
// são os do protótipo (1.284 frases, a chave salva, a seleção em Alt+Botão
// voltar), para os resumos das linhas fechadas saírem iguais aos dele.

const { test, expect } = require('../fixtures');

const AGORA = new Date('2026-09-18T12:00:00');
const TOTAL_DO_PROTOTIPO = 1284;

const FRASES_DO_PROTOTIPO = Array.from({ length: TOTAL_DO_PROTOTIPO }, (_, i) => ({
  id: 1_700_000_000_000 + (TOTAL_DO_PROTOTIPO - i),
  texto: `Sentence number ${TOTAL_DO_PROTOTIPO - i} about the harbour.`,
  data: AGORA.toLocaleDateString('pt-BR'),
  streaming: 'netflix',
  idioma: 'Inglês',
}));

/**
 * As frases, a chave do Gemini e o atalho de seleção do protótipo. Com a conta,
 * as frases já estão na nuvem, então abrir o painel não vira uma primeira subida.
 */
async function semearComoNoPrototipo(extensao, fakes, uid = null) {
  await extensao.gravarStorage({
    frases: FRASES_DO_PROTOTIPO,
    geminiApiKey: 'AIzaSyD4kQ7wL2mXe9pRtB8nVfH0cJ3kQ9',
    pm_atalho: { type: 'mouse', button: 3, code: null, altKey: true, ctrlKey: false, shiftKey: false, label: 'Alt+Mouse Back' },
  });
  if (uid) fakes.google.gravarFrases(uid, FRASES_DO_PROTOTIPO);
}

async function abrirConfiguracoes(page, extensao, endereco, largura = 1280) {
  await page.clock.setFixedTime(AGORA);
  await page.setViewportSize({ width: largura, height: 800 });
  await page.goto(extensao.url(`painel.html${endereco}`));
  await expect(page.getByRole('navigation', { name: 'Navegação do painel' })).toBeVisible();
  await expect(page.locator('#cfg-perigo-resumo')).toHaveText('1.284 frases', { timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
}

const estadoDoChip = page => page.locator('#shell-chip-estado');

test('Configurações com os cards fechados', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  await abrirConfiguracoes(page, extensao, '#configuracoes');
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('configuracoes-fechados.png');
});

test('Conta & sync aberto, sincronizado', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  await abrirConfiguracoes(page, extensao, '#configuracoes/conta');
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('conta-sincronizado.png', { animations: 'disabled' });
});

test('Conta & sync aberto, sem sincronizar', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  fakes.google.ficarForaDoAr();
  await abrirConfiguracoes(page, extensao, '#configuracoes/conta');
  await expect(estadoDoChip(page)).toHaveText('Sem sincronizar');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('conta-sem-sincronizar.png', { animations: 'disabled' });
});

test('Conta & sync aberto, sem conta e com o login que falhou', async ({ page, extensao, fakes }) => {
  await semearComoNoPrototipo(extensao, fakes);
  fakes.google.proximoLogin('falhar');
  await abrirConfiguracoes(page, extensao, '#configuracoes/conta');
  await page.locator('#cfg-conta').getByRole('button', { name: 'Entrar com Google' }).click();
  await expect(page.locator('#cfg-conta').getByRole('alert')).toBeVisible();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('conta-login-falhou.png', { animations: 'disabled' });
});

test('Aparência aberto, no escuro', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  await abrirConfiguracoes(page, extensao, '#configuracoes/aparencia');
  await expect(page.getByRole('radio', { name: 'Escuro' })).toBeChecked();

  await expect(page).toHaveScreenshot('aparencia-escuro.png', { animations: 'disabled' });
});

test('Aparência aberto, no claro: a mesma tela com os tokens claros', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  await extensao.gravarStorage({ pm_tema: 'claro' });
  await abrirConfiguracoes(page, extensao, '#configuracoes/aparencia');
  await expect(page.getByRole('radio', { name: 'Claro' })).toBeChecked();

  await expect(page).toHaveScreenshot('aparencia-claro.png', { animations: 'disabled' });
});

test('janela estreita: sem resumo na linha e sem recuo no conteúdo', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  await abrirConfiguracoes(page, extensao, '#configuracoes/conta', 700);
  await expect(page.locator('#cfg-conta').getByText('Sincronizado agora', { exact: true })).toBeVisible();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('conta-estreita.png', { animations: 'disabled' });
});

// Com a seleção em Alt+Botão voltar, como no protótipo: fora do padrão, então
// “Restaurar atalhos padrão” aparece no pé do card.

async function abrirAtalhos(page, extensao, fakes) {
  await semearComoNoPrototipo(extensao, fakes);
  await abrirConfiguracoes(page, extensao, '#configuracoes/atalhos');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');
}

const gravarAtalho = (page, nome) =>
  page.locator('#cfg-atalhos').getByRole('group', { name: nome }).getByRole('button', { name: 'Gravar atalho' });

test('Atalhos aberto, com a seleção gravada e o Restaurar atalhos padrão', async ({ page, extensao, fakes }) => {
  await abrirAtalhos(page, extensao, fakes);
  await expect(page.locator('#cfg-atalhos').getByRole('button', { name: 'Restaurar atalhos padrão' })).toBeVisible();

  await expect(page).toHaveScreenshot('atalhos-aberto.png', { animations: 'disabled' });
});

test('Atalhos gravando o Minerar legenda', async ({ page, extensao, fakes }) => {
  await abrirAtalhos(page, extensao, fakes);
  await gravarAtalho(page, 'Minerar legenda').click();
  await page.mouse.move(0, 0);

  await expect(page).toHaveScreenshot('atalhos-gravando.png', { animations: 'disabled' });
});

test('Atalhos com o atalho repetido recusado', async ({ page, extensao, fakes }) => {
  await abrirAtalhos(page, extensao, fakes);
  await gravarAtalho(page, 'Minerar seleção').click();
  await page.keyboard.press('Alt+KeyS');
  await expect(page.locator('#cfg-atalhos').getByRole('alert')).toBeVisible();
  await page.mouse.move(0, 0);

  await expect(page).toHaveScreenshot('atalhos-repetido.png', { animations: 'disabled' });
});

test('Chave do Gemini aberta, com a chave salva', async ({ page, extensao, fakes }) => {
  await semearComoNoPrototipo(extensao, fakes);
  await abrirConfiguracoes(page, extensao, '#configuracoes/chave');
  await expect(page.locator('#cfg-chave').getByRole('button', { name: 'Trocar chave' })).toBeVisible();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('chave-salva.png', { animations: 'disabled' });
});

test('Chave do Gemini aberta, vazia, depois de salvar vazio', async ({ page, extensao, fakes }) => {
  await semearComoNoPrototipo(extensao, fakes);
  await extensao.gravarStorage({ geminiApiKey: '' });
  await abrirConfiguracoes(page, extensao, '#configuracoes/chave');
  await page.locator('#cfg-chave').getByRole('button', { name: 'Salvar chave' }).click();
  await expect(page.locator('#cfg-chave').getByText('Cole a chave antes de salvar')).toBeVisible();
  await page.locator('#cfg-chave-campo').blur();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('chave-vazia-recusada.png', { animations: 'disabled' });
});

// O card IA dos cartões (#140): o desenho A do #101, duas entradas em colunas do mesmo tamanho.
// A chave do protótipo termina em 9f3a, como o exemplo do contrato da Conexão.
//
// AGUARDANDO A APROVAÇÃO DO DONO (CODING_STANDARDS regra 10): estas cinco telas são novas e a referência só
// entra depois que ele aprova o visual implementado. Até lá ficam como `fixme` e sem PNG. Aprovado: tire o
// `test.fixme` de cada uma, rode `npx playwright test configuracoes-visual -g "IA dos cartões" --update-snapshots`
// e confira que nenhuma captura tem a chave inteira (o campo é sempre mascarado: regra 9).
const AGUARDA_O_DONO = 'a referência visual do card IA dos cartões espera a aprovação do dono (regra 10)';
const campoDaChave = page => page.locator('#cfg-ia .cfg-chave-campo');
test('IA dos cartões aberta, sem chave: as duas entradas lado a lado', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearComoNoPrototipo(extensao, fakes);
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await expect(page.locator('#cfg-ia').getByRole('textbox', { name: 'Chave da OpenAI' })).toBeFocused();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('ia-sem-chave.png', { animations: 'disabled' });
});

test('IA dos cartões aberta, com a chave conferida e a cópia na Conexão', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearComoNoPrototipo(extensao, fakes);
  await extensao.gravarStorage({ pm_chave_openai: { ultimos4: '9f3a' } });
  fakes.anki.guardarChaveNaConexao('9f3a');
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await expect(page.locator('#cfg-ia').getByText('A Conexão com o Anki guarda a chave.')).toBeVisible();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('ia-conferida.png', { animations: 'disabled' });
});

// #154: a chave acompanha a conta Google. Também à espera do dono (regra 10): `fixme` e sem PNG, como as de cima.
test('IA dos cartões com conta: a chave vai junto com a conta Google, com Trocar chave e Apagar chave', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearComoNoPrototipo(extensao, fakes, 'uid-ia');
  await extensao.semearSessao({ uid: 'uid-ia', displayName: 'Vinicius' });
  await extensao.gravarStorage({ pm_chave_openai: { ultimos4: '9f3a' } });
  fakes.anki.guardarChaveNaConexao('9f3a');
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await expect(page.locator('#cfg-ia').getByText('Vai junto com a sua conta Google', { exact: false })).toBeVisible();
  await expect(page.locator('#cfg-ia').getByText('A Conexão com o Anki guarda a chave.')).toBeVisible();

  await expect(page).toHaveScreenshot('ia-conferida-com-conta.png', { animations: 'disabled' });
});

// #142 / #248: a parte “Falha local” do CFG-17 ganha as Frases que a Conexão ainda guarda quando ela não responde ao Apagar tudo.
// A cópia dessa falha ainda não existe no catálogo da Voz: é cópia a aprovar pelo dono (regra 10, “Falha local” do CFG-17 na
// página docs/design/envio-no-complemento.md). Até lá o teste fica `fixme`, sem PNG e sem texto inventado na tela.
test('Apagar tudo com a Conexão sem responder: a falha local diz que as Frases dela ainda não saíram', async ({ page, extensao, fakes }) => {
  test.fixme(true, 'a cópia da Falha local do CFG-17 com as Frases na Conexão espera a aprovação do dono (regra 10)');
  await semearComoNoPrototipo(extensao, fakes);
  fakes.anki.falharApagarFrases();
  await abrirConfiguracoes(page, extensao, '#configuracoes/perigo');
  await page.locator('#cfg-perigo').getByRole('button', { name: /^Apagar todas as/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Apagar .* frases$/ }).click();

  await expect(page).toHaveScreenshot('apagar-tudo-falha-frases-na-conexao.png', { animations: 'disabled' });
});

// #142 / #259: o Apagar tudo recusado (CFG-17.conexaoNaoResponde) com um Envio andando e a Conexão sem responder. A cópia é a que o dono
// propôs e ainda não viu na tela: `fixme` e sem PNG até ele aprovar o visual implementado (regra 10). Aprovado: tire o `test.fixme`
// e rode `npx playwright test configuracoes-visual -g "recusado" --update-snapshots`.
test('Apagar tudo recusado: a Conexão não responde e há um Envio andando', async ({ page, extensao, fakes }) => {
  test.fixme(true, 'a referência visual da recusa do Apagar tudo espera a aprovação do dono (regra 10)');
  await semearComoNoPrototipo(extensao, fakes);
  await extensao.gravarStorage({ pm_envio: { envios: [{ id: 'e1', lang: 'en', ids: [1], baralho: 'Inglês', jobId: 'job-1', criadoEm: 0, falhaAoCriar: null }] } });
  fakes.anki.desligar();
  await abrirConfiguracoes(page, extensao, '#configuracoes/perigo');
  await page.locator('#cfg-perigo').getByRole('button', { name: /^Apagar todas as/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Apagar .* frases$/ }).click();
  await expect(page.locator('#cfg-perigo').getByRole('alert')).toContainText('Não deu para apagar agora');

  await expect(page).toHaveScreenshot('apagar-tudo-recusado-conexao-fora.png', { animations: 'disabled' });
});

test('o modal de apagar a chave da OpenAI, com conta', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearComoNoPrototipo(extensao, fakes, 'uid-ia');
  await extensao.semearSessao({ uid: 'uid-ia', displayName: 'Vinicius' });
  await extensao.gravarStorage({ pm_chave_openai: { ultimos4: '9f3a' } });
  fakes.anki.guardarChaveNaConexao('9f3a');
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await page.locator('#cfg-ia').getByRole('button', { name: 'Apagar chave' }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Apagar a chave da OpenAI?');

  await expect(page).toHaveScreenshot('ia-apagar-modal.png', { animations: 'disabled' });
});

test('IA dos cartões com a chave recusada: a faixa diz a qual entrada pertence', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearComoNoPrototipo(extensao, fakes);
  fakes.anki.responderOpenAI('recusa');
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await page.locator('#cfg-ia').getByRole('textbox', { name: 'Chave da OpenAI' }).fill('sk-proj-chave-de-exemplo-9f3a');
  await page.locator('#cfg-ia').getByRole('button', { name: 'Conferir e salvar' }).click();
  await expect(page.locator('#cfg-ia').getByRole('alert')).toContainText('A OpenAI recusou a chave.');
  await page.locator('#cfg-ia').getByText('Detalhes').click();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('ia-recusada.png', { animations: 'disabled', mask: [campoDaChave(page)] });
});

test('IA dos cartões com a chave sem crédito, no tema claro', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearComoNoPrototipo(extensao, fakes);
  await extensao.gravarStorage({ pm_tema: 'claro' });
  fakes.anki.responderOpenAI('sem_credito');
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await page.locator('#cfg-ia').getByRole('textbox', { name: 'Chave da OpenAI' }).fill('sk-proj-chave-de-exemplo-9f3a');
  await page.locator('#cfg-ia').getByRole('button', { name: 'Conferir e salvar' }).click();
  await expect(page.locator('#cfg-ia').getByRole('alert')).toContainText('sem crédito');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('ia-sem-credito-claro.png', { animations: 'disabled', mask: [campoDaChave(page)] });
});

test('IA dos cartões em janela estreita: as colunas viram linhas', async ({ page, extensao, fakes }) => {
  test.fixme(true, AGUARDA_O_DONO);
  await semearComoNoPrototipo(extensao, fakes);
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia', 760);
  await expect(page.locator('#cfg-ia').getByRole('region', { name: /Conta do ChatGPT/ })).toBeVisible();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('ia-estreita.png', { animations: 'disabled' });
});

test('Zona de perigo aberta, com conta', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  await abrirConfiguracoes(page, extensao, '#configuracoes/perigo');
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('perigo-com-conta.png', { animations: 'disabled' });
});

test('o modal de apagar todas as frases, com conta', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  await abrirConfiguracoes(page, extensao, '#configuracoes/perigo');
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');
  await page.getByRole('button', { name: 'Apagar todas as 1.284 frases' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await expect(page).toHaveScreenshot('perigo-modal.png', { animations: 'disabled' });
});

test.fixme('Conta & sync: só a chave da OpenAI está pendente — aprovação visual pendente', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
  await expect(estadoDoChip(page)).toHaveText('Sincronizado agora');
  fakes.google.recusarEscritas();
  await campoDaChave(page).fill('sk-fake-visual-9f3a');
  await page.locator('#cfg-ia').getByRole('button', { name: 'Conferir e salvar' }).click();
  await expect(page.locator('#cfg-ia-resumo')).toHaveText('••••••••9f3a');
  await page.locator('#shell-chip').click();
  await expect(page.locator('#cfg-conta')).toContainText('Não deu para conferir a sincronização da chave da OpenAI.');
  expect(fakes.google.frasesDe('uid-visual')).toEqual(FRASES_DO_PROTOTIPO);
  await expect(page).toHaveScreenshot('conta-chave-pendente.png', { animations: 'disabled', mask: [campoDaChave(page)] });
});

// Security-review states await owner approval; no PNG baseline is approved here.
for (const variante of ['outra-conta', 'apagar-falhou', 'apagar-tudo-parcial']) {
  test.fixme(`IA: ${variante} — aprovação visual pendente`, async ({ page, extensao, fakes }) => {
    await extensao.semearSessao({ uid: 'uid-visual' });
    await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
    await abrirConfiguracoes(page, extensao, '#configuracoes/ia');
    const ia = page.locator('#cfg-ia');
    await campoDaChave(page).fill('sk-fake-visual-9f3a');
    await ia.getByRole('button', { name: 'Conferir e salvar' }).click();
    await expect(ia.locator('.cfg-resumo')).toHaveText('••••••••9f3a');
    await expect.poll(() => Boolean(fakes.google.chaveDaOpenAIDe('uid-visual'))).toBe(true);
    if (variante === 'outra-conta') {
      await extensao.semearSessao({ uid: 'uid-outra-conta' });
      await page.reload();
      await expect(ia).toContainText('Esta chave é de outra conta Google.');
    } else {
      await page.evaluate(() => {
        const abrir = indexedDB.open.bind(indexedDB);
        indexedDB.open = (...args) => {
          if (args[0] === 'pm-segredos') throw new DOMException('fake storage failure', 'StorageUnavailable');
          return abrir(...args);
        };
      });
      if (variante === 'apagar-falhou') {
        await ia.getByRole('button', { name: 'Apagar chave' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Apagar chave' }).click();
      } else {
        await page.goto(extensao.url('painel.html#configuracoes/perigo'));
        await page.evaluate(() => {
          const abrir = indexedDB.open.bind(indexedDB);
          indexedDB.open = (...args) => {
            if (args[0] === 'pm-segredos') throw new DOMException('fake storage failure', 'StorageUnavailable');
            return abrir(...args);
          };
        });
        await page.locator('#btn-apagar-tudo').click();
        await page.getByRole('dialog').locator('.veio-botao--perigo-cheio').click();
      }
      await expect(page.getByRole('alert')).toContainText(variante === 'apagar-falhou'
        ? 'Não deu para confirmar o apagamento da chave neste computador.' : 'As frases foram apagadas, mas não deu para conferir o apagamento da chave da OpenAI');
    }
    await expect(page).toHaveScreenshot(`ia-${variante}.png`, { animations: 'disabled', mask: [campoDaChave(page)] });
  });
}

// Conexão com o Anki › Abrir o Anki com o computador (#153). Não há protótipo próprio dele (o #106 o decidiu em
// texto): o card segue o “resumo primeiro” e o interruptor é o do Veio. Uma referência nova só entra depois de o
// dono aprovar o visual (CODING_STANDARDS, regra 10), então estas quatro ficam em `test.fixme` até lá. Para
// aprovar: tire o `fixme`, rode `npx playwright test configuracoes-visual -g "Conexão com o Anki aberta" --update-snapshots`
// e olhe os quatro PNGs (as imagens de proposta estão no corpo do PR #189). Os cards fechados das outras referências
// já mostram a linha do card.

test.fixme('Conexão com o Anki aberta, com o interruptor desligado', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  await abrirConfiguracoes(page, extensao, '#configuracoes/anki');
  await expect(page.getByRole('switch', { name: 'Abrir o Anki com o computador' })).toBeEnabled();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('anki-desligado.png', { animations: 'disabled' });
});

test.fixme('Conexão com o Anki aberta, com o interruptor ligado', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  fakes.anki.definirItemDeLogin('ligado');
  await abrirConfiguracoes(page, extensao, '#configuracoes/anki');
  await expect(page.getByRole('switch', { name: 'Abrir o Anki com o computador' })).toBeChecked();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('anki-ligado.png', { animations: 'disabled' });
});

test.fixme('Conexão com o Anki aberta, com a Conexão desligada', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  fakes.anki.desligar();
  await abrirConfiguracoes(page, extensao, '#configuracoes/anki');
  await expect(page.getByRole('switch', { name: 'Abrir o Anki com o computador' })).toBeDisabled();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'desligada');

  await expect(page).toHaveScreenshot('anki-indisponivel.png', { animations: 'disabled' });
});

test.fixme('Conexão com o Anki aberta, com o item que não pôde ser escrito', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'uid-visual', displayName: 'Ana Souza' });
  await semearComoNoPrototipo(extensao, fakes, 'uid-visual');
  fakes.anki.definirItemDeLogin('falha');
  await abrirConfiguracoes(page, extensao, '#configuracoes/anki');
  await expect(page.getByRole('switch', { name: 'Abrir o Anki com o computador' })).toBeEnabled();
  await page.locator('#cfg-anki-corpo .veio-toggle').click();
  await expect(page.locator('#cfg-anki-corpo').getByRole('alert')).toBeVisible();
  await expect(page.locator('.shell-ponto')).toHaveAttribute('data-estado', 'ligada');

  await expect(page).toHaveScreenshot('anki-falhou.png', { animations: 'disabled' });
});
