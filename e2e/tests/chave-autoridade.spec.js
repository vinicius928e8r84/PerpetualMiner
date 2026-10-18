'use strict';

// Opção B: o cofre da Conexão, não uma reserva ou rascunho da extensão,
// é o valor exibido. Só chaves fictícias. UI nativa + estado guardado.
const { test, expect } = require('../fixtures');
const { fotografar } = require('../evidencias-mineracao');
const CHAVE = 'sk-fake-autoridade-primeira-aaaa';
async function segredosLocais(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('pm-segredos', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('chaves');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction('chaves'), valores = tx.objectStore('chaves').getAll();
      tx.oncomplete = () => { db.close(); resolve(valores.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
}
const NOVA = 'sk-fake-autoridade-segunda-bbbb';
const card = page => page.locator('#cfg-ia');
const resumo = page => card(page).locator('.cfg-resumo');
const campo = page => card(page).getByRole('textbox', { name: 'Chave da OpenAI' });
async function abrir(page, extensao) {
  await page.goto(extensao.url('painel.html#configuracoes/ia'));
  await expect(card(page)).toBeVisible();
}
async function confirmar(page, chave) {
  await campo(page).fill(chave);
  await card(page).getByRole('button', { name: 'Conferir e salvar' }).click();
}

for (const bComChave of [false, true]) test(bComChave
  ? 'K1-delete: A vê a chave de B sem Apagar chave e não muda nenhuma das contas'
  : 'K1: a saúde de dois perfis A e B só lê o dono, sem pingue-pongue de sync', async ({ page, extensao, fakes, segundoPerfil }) => {
  test.slow(); // dois processos Chromium/perfis, não duas abas do mesmo perfil
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 60_000));
  await extensao.semearSessao({ uid: 'A' });
  fakes.google.gravarChaveDaOpenAI('A', { chave: CHAVE, em: 100 });
  if (bComChave) fakes.google.gravarChaveDaOpenAI('B', { chave: NOVA, em: 101 });
  await abrir(page, extensao);
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado agora');
  // Fronteira de armazenamento de outro perfil real, não outra aba com a mesma sessão.
  await segundoPerfil.extensao.semearSessao({ uid: 'B', displayName: 'Pessoa B' });
  const b = await segundoPerfil.context.newPage();
  await b.clock.install();
  await b.clock.pauseAt(new Date(Date.now() + 60_000));
  await abrir(b, segundoPerfil.extensao);
  await expect(b.locator('#shell-chip')).toContainText('Sincronizado agora');
  const dono = fakes.anki.estadoDaChave();
  const syncs = () => fakes.anki.requisicoes.filter(r => r.caminho === '/ia/openai/sincronizar').length;
  const antes = syncs();
  for (let n = 0; n < 4; n++) {
    for (const tela of [page, b]) {
      const lida = tela.waitForResponse(r => r.url().endsWith('/ia/estado'));
      await tela.clock.runFor(16000);
      await (await lida).finished();
    }
  }
  await expect(resumo(page)).toHaveText(bComChave ? '••••••••bbbb' : 'Sem chave');
  if (bComChave) {
    await expect(card(page)).toContainText('Esta chave é de outra conta Google.');
    await expect(card(page).getByRole('button', { name: 'Apagar chave', exact: true })).toHaveCount(0);
    await fotografar(card(page), 'k1-chave-de-B-na-tela-de-A.png');
    await card(page).getByRole('button', { name: 'Trocar chave', exact: true }).click();
    await expect(campo(page)).toBeEmpty();
  }
  expect(fakes.anki.estadoDaChave()).toEqual(dono);
  expect(syncs()).toBe(antes);
  expect(fakes.google.chaveDaOpenAIDe('A')?.chave === CHAVE).toBe(true);
  if (bComChave) expect(fakes.google.chaveDaOpenAIDe('B')?.chave === NOVA).toBe(true);
  else expect(fakes.google.chaveDaOpenAIDe('B')).toBeNull();
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai.conta).toBe('B');
});

test('K1-delete: dono mudou para B durante o modal de A, confirmar não apaga nem cria tombstone de A', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'A' });
  fakes.google.gravarChaveDaOpenAI('A', { chave: CHAVE, em: 100 });
  fakes.google.gravarChaveDaOpenAI('B', { chave: NOVA, em: 101 });
  await abrir(page, extensao);
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado agora');
  await expect(resumo(page)).toHaveText('••••••••aaaa');
  await card(page).getByRole('button', { name: 'Apagar chave', exact: true }).click();
  // Mudança externa aceita enquanto a confirmação está aberta, não alteração
  // de internals da extensão: o dono agora pertence a outro perfil.
  fakes.anki.guardarChaveNaConexao('bbbb', 42, 'B', 101, false);
  const dono = fakes.anki.estadoDaChave();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar chave', exact: true }).click();
  const aviso = card(page).getByRole('alert');
  await expect(aviso).toContainText('Esta chave é de outra conta Google e não foi apagada.');
  await expect(aviso.getByRole('button', { name: 'Tentar de novo' })).toHaveCount(0);
  await expect(resumo(page)).toHaveText('••••••••bbbb');
  await fotografar(aviso, 'o1-recusa-modal.png');
  await aviso.getByRole('button', { name: 'Trocar chave' }).click();
  await expect(campo(page)).toBeEmpty();
  await expect(card(page).getByRole('button', { name: 'Apagar chave', exact: true })).toHaveCount(0);
  expect(fakes.anki.estadoDaChave()).toEqual(dono);
  expect(fakes.anki.chaveNaConexao()?.endsWith('bbbb')).toBe(true);
  expect(fakes.google.chaveDaOpenAIDe('A')?.chave === CHAVE).toBe(true);
  expect(fakes.google.chaveDaOpenAIDe('B')?.chave === NOVA).toBe(true);
  expect(fakes.anki.requisicoes.filter(r => r.caminho === '/ia/openai/chave/apagar').length).toBe(0);
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai.conta).toBe('B');
});

test('K1-delete: Apagar tudo em A não apaga o dono de B nem a chave da nuvem de A', async ({ page, extensao, fakes }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 60_000));
  const frases = [{ id: '123', text: 'A sentence to study.', lang: 'Inglês', source: 'manual', timestamp: Date.now() }];
  await extensao.semearSessao({ uid: 'A' });
  await extensao.gravarStorage({ frases });
  fakes.google.gravarFrases('A', frases);
  fakes.google.gravarChaveDaOpenAI('A', { chave: CHAVE, em: 100 });
  fakes.google.gravarChaveDaOpenAI('B', { chave: NOVA, em: 101 });
  await abrir(page, extensao);
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado agora');
  fakes.anki.guardarChaveNaConexao('bbbb', 42, 'B', 101, false);
  const dono = fakes.anki.estadoDaChave();
  await page.clock.runFor(16000);
  await expect(resumo(page)).toHaveText('••••••••bbbb');
  await page.getByRole('button', { name: 'Zona de perigo', exact: true }).click();
  await page.locator('#cfg-perigo').getByRole('button', { name: 'Apagar 1 frase', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Nenhuma chave da OpenAI será apagada: a chave deste computador é de outra conta Google.');
  await fotografar(page.getByRole('dialog'), 'o1-outra-conta-tudo-modal.png');
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar 1 frase', exact: true }).click();
  const aviso = page.locator('#cfg-perigo').getByRole('alert');
  await expect(aviso).toContainText('Esta chave é de outra conta Google e não foi apagada.');
  await expect(aviso.getByRole('button', { name: 'Tentar de novo' })).toHaveCount(0);
  await fotografar(aviso, 'o1-recusa-tudo.png');
  await aviso.getByRole('button', { name: 'Trocar chave' }).click();
  await expect(campo(page)).toBeEmpty();
  await expect(resumo(page)).toHaveText('••••••••bbbb');
  expect(fakes.anki.estadoDaChave()).toEqual(dono);
  expect(fakes.google.chaveDaOpenAIDe('A')?.chave === CHAVE).toBe(true);
  expect(fakes.google.chaveDaOpenAIDe('B')?.chave === NOVA).toBe(true);
  expect(fakes.google.frasesDe('A')).toEqual([]);
  expect(await extensao.frases()).toEqual([]);
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai.conta).toBe('B');
});

test('K1-PC: três reconfirmações idênticas mantêm v1 e não disparam upload ou confirmação automática', async ({ page, extensao, fakes }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 60_000));
  await extensao.semearSessao({ uid: 'A' });
  await abrir(page, extensao);
  await confirmar(page, CHAVE);
  await expect(resumo(page)).toHaveText('••••••••aaaa');
  await expect.poll(() => fakes.anki.estadoDaChave().naoEnviada).toBe(false);
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado agora');
  const antes = fakes.anki.estadoDaChave();
  const nuvem = fakes.google.chaveDaOpenAIDe('A');
  const uploads = fakes.google.requisicoes.filter(p => p.metodo === 'PATCH').length;
  const revisoes = [antes.versao];
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    await card(page).getByRole('button', { name: 'Trocar chave', exact: true }).click();
    await expect(campo(page)).toBeEmpty();
    await confirmar(page, CHAVE);
    await expect(card(page).getByRole('button', { name: 'Trocar chave', exact: true })).toBeVisible();
    await expect(page.locator('#shell-chip')).toContainText('Sincronizado agora');
    revisoes.push(fakes.anki.estadoDaChave().versao);
  }
  expect(revisoes).toEqual([1, 1, 1, 1]);
  await page.clock.runFor(31000); // saúde só lê, não reconfirma chave nem dispara sync
  await expect(resumo(page)).toHaveText('••••••••aaaa');
  expect(fakes.anki.estadoDaChave()).toEqual(antes);
  expect(fakes.google.chaveDaOpenAIDe('A')?.em).toBe(nuvem.em);
  expect(fakes.google.chaveDaOpenAIDe('A')?.chave === CHAVE).toBe(true);
  expect(fakes.google.requisicoes.filter(p => p.metodo === 'PATCH').length).toBe(uploads);
  expect(fakes.anki.requisicoes.filter(p => p.caminho === '/ia/openai/chave').length).toBe(4);
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai).toEqual({ ultimos4: 'aaaa', conta: 'A', versao: 1, naoEnviada: false });
  expect(await segredosLocais(page)).toEqual([]);
  await fotografar(card(page), 'k1-pc-reconfirmacoes-idempotentes.png');
});

for (const tudo of [false, true]) test(`O1: sair da conta permite ${tudo ? 'Apagar tudo' : 'Apagar chave'} só deste computador, sem apagar nenhuma chave na nuvem`, async ({ page, extensao, fakes }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 60_000));
  await extensao.semearSessao({ uid: 'A' });
  const frases = [{ id: '123', text: 'A sentence to study.', lang: 'Inglês', source: 'manual', timestamp: Date.now() }];
  await extensao.gravarStorage({ frases });
  fakes.google.gravarFrases('A', frases);
  fakes.google.gravarChaveDaOpenAI('A', { chave: CHAVE, em: 100 });
  fakes.google.gravarChaveDaOpenAI('B', { chave: NOVA, em: 101 });
  await abrir(page, extensao);
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado agora');
  await page.getByRole('button', { name: 'Conta & sync', exact: true }).click();
  await page.locator('#cfg-conta').getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page.locator('#shell-chip')).toContainText('Sem conta');
  const syncs = fakes.anki.requisicoes.filter(p => p.caminho === '/ia/openai/sincronizar').length;
  const nuvem = fakes.google.requisicoes.length;
  await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('pm-segredos', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('chaves');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction('chaves', 'readwrite');
      tx.objectStore('chaves').put({ chave: 'sk-fake-legacy-A', conta: 'A', em: 10 }, 'conta:A');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
  const entrada = page.getByRole('button', { name: 'IA dos cartões', exact: true });
  if (await entrada.getAttribute('aria-expanded') !== 'true') await entrada.click();
  await expect(card(page).getByRole('button', { name: 'Apagar chave', exact: true })).toBeVisible();
  await expect(card(page)).toContainText('Esta chave está vinculada a uma conta Google.');
  await expect(card(page)).not.toContainText('entre e confira a chave de novo');
  if (tudo) await page.getByRole('button', { name: 'Zona de perigo', exact: true }).click();
  const rotulo = tudo ? 'Apagar 1 frase' : 'Apagar chave';
  await page.locator(tudo ? '#cfg-perigo' : '#cfg-ia').getByRole('button', { name: rotulo, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Nenhuma chave da conta Google é apagada.');
  await fotografar(page.getByRole('dialog'), `o1-local-${tudo ? 'tudo' : 'chave'}-modal.png`);
  await page.getByRole('dialog').getByRole('button', { name: rotulo, exact: true }).click();
  await expect(resumo(page)).toHaveText('Sem chave');
  expect(fakes.anki.chaveNaConexao()).toBeNull();
  expect(fakes.anki.estadoDaChave().conta).toBe('');
  expect(fakes.google.chaveDaOpenAIDe('A')?.chave === CHAVE).toBe(true);
  expect(fakes.google.chaveDaOpenAIDe('B')?.chave === NOVA).toBe(true);
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai.ultimos4).toBe('');
  expect(await segredosLocais(page)).toEqual([]);
  expect(fakes.google.frasesDe('A')).toHaveLength(1);
  expect(await extensao.frases()).toHaveLength(tudo ? 0 : 1);
  expect(fakes.anki.requisicoes.filter(p => p.caminho === '/ia/openai/sincronizar').length).toBe(syncs);
  expect(fakes.google.requisicoes.length).toBe(nuvem);
  await fotografar(card(page), `o1-local-${tudo ? 'tudo' : 'chave'}-resultado.png`);
});

test('K2: o legado do main com conta A oferece Trocar chave, não um retry sem saída', async ({ page, extensao, fakes }) => {
  const antiga = 'sk-proj-guardada-antes-aaaa';
  fakes.anki.guardarChaveNaConexao('aaaa');
  fakes.google.gravarChaveDaOpenAI('A', { chave: antiga, em: 100 });
  await extensao.semearSessao({ uid: 'A' });
  await page.goto(extensao.url('manifest.json'));
  await page.evaluate(chave => new Promise((resolve, reject) => {
    const req = indexedDB.open('pm-segredos', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('chaves');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction('chaves', 'readwrite');
      tx.objectStore('chaves').put(chave, 'openai');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), antiga);
  await page.goto(extensao.url('painel.html#configuracoes/conta'));
  const conta = page.locator('#cfg-conta');
  await expect(conta).toContainText('cole a mesma chave de novo');
  await conta.getByRole('button', { name: 'Trocar chave', exact: true }).click();
  await expect(campo(page)).toBeVisible();
  await expect(campo(page)).toBeFocused();
  await confirmar(page, antiga);
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado agora');
  expect(fakes.anki.estadoDaChave().conta).toBe('A');
  expect(fakes.google.chaveDaOpenAIDe('A')?.chave === antiga).toBe(true);
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai.conta).toBe('A');
  expect(await segredosLocais(page)).toEqual([]);
});

test('P1 legado: migrar o cache de A com B aberta não vincula o segredo a B', async ({ page, extensao, fakes }) => {
  const legado = 'sk-proj-guardada-antes-aaaa';
  fakes.anki.guardarChaveNaConexao('aaaa');
  await extensao.semearSessao({ uid: 'B' });
  await page.goto(extensao.url('manifest.json'));
  await page.evaluate(({ chave }) => new Promise((resolve, reject) => {
    const req = indexedDB.open('pm-segredos', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('chaves');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction('chaves', 'readwrite'), loja = tx.objectStore('chaves');
      loja.put(chave, 'openai'); loja.put('A', 'openai-conta'); loja.put(100, 'openai-em');
      loja.put({ chave, conta: 'A', em: 100 }, 'conta:A');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), { chave: legado });
  await abrir(page, extensao);
  await expect.poll(() => fakes.anki.estadoDaChave().conta).toBe('A');
  await expect(card(page)).toContainText('Esta chave é de outra conta Google.');
  expect(fakes.anki.chaveNaConexao() === legado).toBe(true);
  expect(fakes.google.chaveDaOpenAIDe('B')?.chave === legado).toBe(false);
  expect(JSON.stringify(await extensao.lerStorage(null)).includes(legado)).toBe(false);
});

test('legado divergente não vira outro dono: a tela lê a Conexão sem exportar nem destruir o segredo antigo', async ({ page, extensao, fakes }) => {
  fakes.anki.guardarChaveNaConexao('bbbb');
  await extensao.semearSessao({ uid: 'B' });
  await extensao.gravarStorage({ pm_chave_openai: { ultimos4: 'aaaa' } });
  await page.goto(extensao.url('manifest.json'));
  await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('pm-segredos', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('chaves');
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction('chaves', 'readwrite'), loja = tx.objectStore('chaves');
      loja.put('sk-fake-legado-aaaa', 'openai'); loja.put('A', 'openai-conta'); loja.put(100, 'openai-em');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
    req.onerror = () => reject(req.error);
  }));
  await abrir(page, extensao);
  await expect(resumo(page)).toHaveText('••••••••bbbb');
  await expect(card(page)).toContainText('chave sem conta identificada');
  await expect(card(page)).not.toContainText('Vai junto com a sua conta Google');
  expect(fakes.anki.estadoDaChave().conta).toBeNull();
  expect(fakes.anki.chaveNaConexao()?.endsWith('bbbb')).toBe(true);
  expect(fakes.google.chaveDaOpenAIDe('B')).toBeNull();
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai.ultimos4).toBe('bbbb');
  expect((await segredosLocais(page)).includes('sk-fake-legado-aaaa')).toBe(true); // migração não concluída, sem perda silenciosa
});

test('A3: apagar chave também descarta o legado divergente após a escolha explícita', async ({ page, extensao, fakes }) => {
  fakes.anki.guardarChaveNaConexao('bbbb');
  await page.goto(extensao.url('manifest.json'));
  await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('pm-segredos', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('chaves');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction('chaves', 'readwrite'), loja = tx.objectStore('chaves');
      loja.put('sk-fake-legado-aaaa', 'openai'); loja.put('A', 'openai-conta'); loja.put(100, 'openai-em');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
  await abrir(page, extensao);
  await expect(resumo(page)).toHaveText('••••••••bbbb');
  await card(page).getByRole('button', { name: 'Apagar chave', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar chave', exact: true }).click();
  await expect(resumo(page)).toHaveText('Sem chave');
  expect(fakes.anki.chaveNaConexao()).toBeNull();
  expect(await segredosLocais(page)).toEqual([]);
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai.ultimos4).toBe('');
});

test('P1: uma chave sem conta não sobe ao abrir perfis A ou B; colar de novo em A é a escolha', async ({ page, extensao, fakes }) => {
  await abrir(page, extensao);
  await confirmar(page, CHAVE);
  await expect(resumo(page)).toHaveText('••••••••aaaa');
  expect(fakes.anki.estadoDaChave().conta).toBe('');
  const antes = fakes.anki.estadoDaChave();
  for (const uid of ['B', 'A']) {
    await extensao.semearSessao({ uid });
    await page.reload();
    await expect(page.locator('#shell-chip')).toContainText('Sem sincronizar');
    await expect(card(page)).toContainText('sem conta identificada');
    await expect(card(page)).not.toContainText('Vai junto com a sua conta Google');
    expect(fakes.anki.estadoDaChave()).toEqual(antes);
    expect(fakes.google.chaveDaOpenAIDe(uid)).toBeNull();
    expect(fakes.anki.chaveNaConexao() === CHAVE).toBe(true);
  }
  await card(page).getByRole('button', { name: 'Trocar chave' }).click();
  await confirmar(page, CHAVE);
  await expect.poll(() => fakes.google.chaveDaOpenAIDe('A')?.chave === CHAVE).toBe(true);
  expect(fakes.google.chaveDaOpenAIDe('B')).toBeNull();
  expect(fakes.anki.estadoDaChave().conta).toBe('A');
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai.conta).toBe('A');
  expect(await segredosLocais(page)).toEqual([]);
});

test('L1: abrir e reabrir com OpenAI fora do ar lê a chave da conta sem 409 permanente', async ({ page, extensao, fakes }) => {
  await extensao.semearSessao({ uid: 'A' });
  fakes.google.gravarChaveDaOpenAI('A', { chave: CHAVE, em: 100 });
  fakes.anki.responderOpenAI('fora_do_ar');
  await abrir(page, extensao);
  await expect(resumo(page)).toHaveText('••••••••aaaa');
  await page.reload();
  await expect(resumo(page)).toHaveText('••••••••aaaa', { timeout: 45000 });
  await expect(page.locator('#shell-chip')).toContainText('Sincronizado', { timeout: 45000 });
  expect(fakes.anki.chaveNaConexao() === CHAVE).toBe(true);
  expect(fakes.anki.estadoDaChave()).toEqual({ versao: 1, conta: 'A', em: 100, naoEnviada: false });
  expect(fakes.google.chaveDaOpenAIDe('A')?.chave === CHAVE).toBe(true);
  expect(await segredosLocais(page)).toEqual([]);
  expect(JSON.stringify(await extensao.lerStorage(null)).includes(CHAVE)).toBe(false);
});

test('a conta traz mudança com o mesmo final e apagamento ao painel e ao dono', async ({ page, extensao, fakes }) => {
  const mesmoFinal = 'sk-fake-outro-segredo-mesmo-final-aaaa';
  await extensao.semearSessao({ uid: 'A' });
  fakes.google.gravarChaveDaOpenAI('A', { chave: CHAVE, em: 1000 });
  await abrir(page, extensao);
  await expect(resumo(page)).toHaveText('••••••••aaaa');
  expect(fakes.anki.chaveNaConexao() === CHAVE).toBe(true);
  fakes.google.gravarChaveDaOpenAI('A', { chave: mesmoFinal, em: 2000 });
  // Exceção de teste: chrome-nativo — a volta à aba, não uma função do produto.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => fakes.anki.chaveNaConexao() === mesmoFinal).toBe(true);
  await expect(resumo(page)).toHaveText('••••••••aaaa');
  expect(fakes.anki.estadoDaChave().versao).toBe(2);
  // O sufixo não muda: a máscara não é uma barreira para a leitura do cache.
  await expect.poll(async () => (await extensao.lerStorage('pm_chave_openai')).pm_chave_openai.versao).toBe(2);
  fakes.google.gravarChaveDaOpenAI('A', { chave: '', em: 3000 });
  // Exceção de teste: chrome-nativo — outra volta à aba recebe o valor vazio.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(resumo(page)).toHaveText('Sem chave');
  expect(fakes.anki.chaveNaConexao()).toBeNull();
  expect(fakes.google.chaveDaOpenAIDe('A')).toEqual({ chave: '', em: 3000 });
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai).toEqual({ ultimos4: '', conta: 'A', versao: 3, naoEnviada: false });
  expect(await segredosLocais(page)).toEqual([]);
});

test('N1: uma confirmação recusada enquanto a resposta aceita espera não desfaz o dono', async ({ page, extensao, context, fakes }) => {
  await abrir(page, extensao);
  let liberar, gravou;
  const espera = new Promise(resolve => { liberar = resolve; });
  const guardada = new Promise(resolve => { gravou = resolve; });
  await context.route('**/ia/openai/chave', async route => {
    if (route.request().postDataJSON().chave !== CHAVE) return route.fallback();
    await fakes.anki.tratar({ request: () => route.request(), fulfill: async resposta => {
      gravou(); await espera; await route.fulfill(resposta).catch(() => {});
    } });
  });
  const outra = await context.newPage();
  try {
    await confirmar(page, CHAVE);
    await guardada;
    await abrir(outra, extensao);
    await expect(resumo(outra)).toHaveText('••••••••aaaa');
    await card(outra).getByRole('button', { name: 'Trocar chave' }).click();
    fakes.anki.responderOpenAI('recusa');
    await confirmar(outra, NOVA);
    await expect(card(outra)).toContainText('A OpenAI recusou a chave.');
    liberar();
    await expect(resumo(page)).toHaveText('••••••••aaaa');
    await outra.reload();
    await expect(resumo(outra)).toHaveText('••••••••aaaa');
    expect(fakes.anki.chaveNaConexao() === CHAVE).toBe(true);
    expect(fakes.anki.estadoDaChave().versao).toBe(1);
    expect(await segredosLocais(page)).toEqual([]);
    expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai.ultimos4).toBe('aaaa');
  } finally { liberar(); await outra.close(); }
});

test('F4: Apagar tudo limpa o dono, a conta e todas as cópias secretas do formato antigo', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [{ id: 'optionB-frase', texto: 'A phrase to remove.', lang: 'en', keywords: [], timestamp: new Date().toISOString() }] });
  await extensao.semearSessao({ uid: 'A' });
  await abrir(page, extensao);
  await confirmar(page, CHAVE);
  // Termina o Save antes de semear a falha/legado; o clique não aguarda o HTTP.
  await expect(card(page).getByRole('button', { name: 'Conferindo a chave…' })).toHaveCount(0, { timeout: 45000 });
  await expect(resumo(page)).toHaveText('••••••••aaaa');
  await expect.poll(() => fakes.google.chaveDaOpenAIDe('A')?.chave === CHAVE).toBe(true);
  // Apenas semeia o armazenamento legado na fronteira, não funções do produto.
  await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('pm-segredos', 1);
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction('chaves', 'readwrite'), loja = tx.objectStore('chaves');
      loja.put({ chave: 'sk-fake-legacy-A', conta: 'A', em: 10 }, 'conta:A');
      loja.put({ chave: 'sk-fake-legacy-B', conta: 'B', em: 20 }, 'conta:B');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
    req.onerror = () => reject(req.error);
  }));
  await page.goto(extensao.url('painel.html#configuracoes/perigo'));
  await page.locator('#cfg-perigo').getByRole('button', { name: 'Apagar 1 frase', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar 1 frase', exact: true }).click();
  await expect.poll(() => fakes.anki.chaveNaConexao()).toBeNull();
  await expect.poll(() => fakes.google.chaveDaOpenAIDe('A')?.chave).toBe('');
  expect(await segredosLocais(page)).toEqual([]);
  expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai.ultimos4).toBe('');
  expect(JSON.stringify(await extensao.lerStorage(null)).includes(CHAVE)).toBe(false);
});

test('o apagamento aceito não apaga da tela uma chave nova aceita enquanto a resposta espera', async ({ page, extensao, context, fakes }) => {
  const instante = new Date();
  await page.clock.install({ time: instante });
  await page.clock.pauseAt(new Date(instante.getTime() + 60_000));
  await abrir(page, extensao);
  await confirmar(page, CHAVE);
  await expect(card(page).getByRole('button', { name: 'Trocar chave' })).toBeVisible();
  let liberar, apagou;
  const espera = new Promise(resolve => { liberar = resolve; });
  const apagada = new Promise(resolve => { apagou = resolve; });
  await context.route('**/ia/openai/chave/apagar', async route => {
    await fakes.anki.tratar({ request: () => route.request(), fulfill: async resposta => {
      apagou(); await espera; await route.fulfill(resposta).catch(() => {});
    } });
  });
  const outra = await context.newPage();
  try {
    await card(page).getByRole('button', { name: 'Apagar chave' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Apagar chave', exact: true }).click();
    await apagada;
    await abrir(outra, extensao);
    await confirmar(outra, NOVA);
    await expect(card(outra).getByRole('button', { name: 'Trocar chave' })).toBeVisible();
    expect(fakes.anki.chaveNaConexao() === NOVA).toBe(true);
    liberar();
    // Sob uma espera longa, a resposta pode ter expirado. Aguarde o resultado
    // terminal (sucesso ou incerteza), não apenas o cache atualizado pela outra aba.
    await expect(page.locator('.veio-toast').filter({ hasText: 'Chave da OpenAI apagada' })
      .or(card(page).getByRole('alert').filter({ hasText: 'Não deu para confirmar o apagamento' }))).toBeVisible();
    await expect(resumo(page)).toHaveText('••••••••bbbb');
    expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai.ultimos4).toBe('bbbb');
    expect(fakes.anki.estadoDaChave().versao).toBe(3);
    expect(await segredosLocais(page)).toEqual([]);
  } finally { liberar(); await outra.close(); }
});

test('R1: aceitação tardia depois de recarregar aparece no painel já aberto', async ({ page, extensao, context, fakes }) => {
  const instante = new Date();
  await page.clock.install({ time: instante });
  await page.clock.pauseAt(new Date(instante.getTime() + 60_000));
  await abrir(page, extensao);
  let liberar, entrou;
  const espera = new Promise(resolve => { liberar = resolve; });
  const pedidoEmVoo = new Promise(resolve => { entrou = resolve; });
  await context.route('**/ia/openai/chave', async route => {
    entrou(); await espera;
    // Só a validação externa espera: o dono continua recebendo o pedido
    // mesmo quando o navegador abandonou a resposta da página anterior.
    await fakes.anki.tratar({ request: () => route.request(), fulfill: async resposta => route.fulfill(resposta).catch(() => {}) });
  });
  try {
    await confirmar(page, NOVA);
    await pedidoEmVoo;
    await page.reload();
    await expect(resumo(page)).toHaveText('Sem chave');
    await expect(page.locator('#shell-conexao-descricao')).toHaveText('Conexão com o Anki: ligada');
    // A primeira leitura é vazia; não deixe a aceitação vencer por acaso o bootstrap.
    const antes = page.waitForResponse(resposta => resposta.url().endsWith('/health'));
    await page.clock.runFor(16000);
    await antes;
    await expect(resumo(page)).toHaveText('Sem chave');
    liberar();
    await expect.poll(() => fakes.anki.chaveNaConexao() === NOVA).toBe(true);
    const depois = page.waitForResponse(resposta => resposta.url().endsWith('/health'));
    await page.clock.runFor(16000);
    await depois;
    await expect(resumo(page)).toHaveText('••••••••bbbb');
    expect(fakes.anki.chaveNaConexao() === NOVA).toBe(true);
    expect((await extensao.lerStorage('pm_chave_openai')).pm_chave_openai.ultimos4).toBe('bbbb');
    expect(await segredosLocais(page)).toEqual([]);
  } finally { liberar(); }
});

for (const perda of ['resposta abortada', 'recarregar']) {
  test(`R1 autoridade: chave gravada com ${perda} é a chave real ao abrir`, async ({ page, extensao, context, fakes }) => {
    await abrir(page, extensao);
    let liberar, gravou;
    const espera = new Promise(resolve => { liberar = resolve; });
    const guardada = new Promise(resolve => { gravou = resolve; });
    let perder = true;
    await context.route('**/ia/openai/chave', async route => {
      if (!perder) return route.fallback();
      perder = false;
      await fakes.anki.tratar({ request: () => route.request(), fulfill: async resposta => {
        expect(resposta.status).toBe(200);
        gravou();
        await espera;
        await route.abort('connectionreset').catch(() => {});
      } });
    });
    try {
      await confirmar(page, NOVA);
      await guardada;
      if (perda === 'recarregar') await page.reload();
      liberar();
      if (perda === 'resposta abortada') await expect(card(page).getByRole('button', { name: 'Conferindo a chave…' })).toHaveCount(0);
      await page.reload();
      await expect(resumo(page)).toHaveText('••••••••bbbb');
      await expect(card(page)).toContainText('A Conexão com o Anki guarda a chave.');
      expect(fakes.anki.chaveNaConexao() === NOVA).toBe(true);
      expect(await extensao.lerStorage('pm_chave_openai')).toEqual({ pm_chave_openai: { ultimos4: 'bbbb', conta: '', versao: 1, naoEnviada: true } });
      await fotografar(card(page), `optionB-r1-${perda.replaceAll(' ', '-')}.png`);
    } finally { liberar(); }
  });
}
