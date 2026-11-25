'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const lerDaLib = nome => fs.readFileSync(path.join(__dirname, '..', 'lib', nome), 'utf8');
const FONTE = lerDaLib('chave-da-openai.js');
const FONTE_LEGADA = lerDaLib('chave-legada.js');
const MARCA = 'pm_chave_openai';
const MOTIVO = { A_PAREAR: 'a_parear', SEM_RESPOSTA: 'sem_resposta' };
const DONO = { configurada: true, ultimos4: 'abcd', versao: 2, conta: 'A', naoEnviada: false };
const SEM_CHAVE = { configurada: false, versao: 0, conta: '', naoEnviada: false };

const plano = valor => {
  if (Array.isArray(valor)) return valor.map(plano);
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([nome, parte]) => [nome, plano(parte)]));
  return valor;
};
const igual = (real, esperado, mensagem) => assert.deepStrictEqual(plano(real), esperado, mensagem);

const resposta = (status, dados) => ({ status, dados });
const donoResposta = dono => resposta(200, { openai: dono });
const SEM_RESPOSTA = { motivo: MOTIVO.SEM_RESPOSTA };

function bancoFalso(guardado) {
  const dados = new Map(Object.entries(guardado));
  const banco = {
    dados,
    transaction() {
      const tx = {
        objectStore: () => ({
          get: chave => ({ result: dados.get(chave) }),
          clear: () => dados.clear(),
        }),
      };
      queueMicrotask(() => tx.oncomplete && tx.oncomplete());
      return tx;
    },
    close() {},
    createObjectStore() {},
  };
  return banco;
}

function carregar({ respostas, legado = {}, armazenado = {}, uid = 'A', logado = true }) {
  const pedidos = [];
  const fila = [...respostas];
  const banco = bancoFalso(legado);
  const armazenamento = { ...(logado ? { pm_user_info: { uid } } : {}), ...armazenado };
  const ouvidos = [];
  const sessao = { invalidou: 0 };
  const raiz = {
    ConversaComOAnki: {
      MOTIVO,
      pedir: async pedido => {
        pedidos.push(pedido);
        const dada = fila.shift();
        if (dada === undefined) throw new Error(`sem resposta combinada para ${pedido.caminho}`);
        return dada;
      },
    },
    PedidoAoAnki: {
      estadoDaIA: () => ({ caminho: '/ia/estado' }),
      chaveDaOpenAI: (chave, versao, conta) => ({ caminho: '/ia/openai/chave', chave, versao, conta }),
      apagarChaveDaOpenAI: (versao, conta) => ({ caminho: '/ia/openai/chave/apagar', versao, conta }),
      sincronizarChaveDaOpenAI: (uidDaConta, token, versao) => ({ caminho: '/ia/openai/sincronizar', uid: uidDaConta, token, versao }),
      vincularLegadoDaOpenAI: (chave, conta, em, versao) => ({ caminho: '/ia/openai/legado', chave, conta, em, versao }),
    },
    Sincronizacao: {
      lerCredenciais: async () => (logado ? { uid } : null),
      MOTIVO: { EXPIROU: 'expirou', RECUSADO: 'recusado' },
      erroDaNuvem: (mensagem, extra) => Object.assign(new Error(mensagem), extra),
    },
    ConexaoAnki: { SITUACAO: { LIGADA: 'ligada' }, conferir: async () => 'ligada' },
  };
  const contexto = vm.createContext({
    navigator: { locks: { request: (_, fazer) => fazer() } },
    indexedDB: {
      open() {
        const pedido = { result: banco };
        queueMicrotask(() => { if (pedido.onupgradeneeded) pedido.onupgradeneeded(); pedido.onsuccess(); });
        return pedido;
      },
    },
    chrome: {
      storage: {
        local: {
          get: async padrao => {
            if (typeof padrao === 'string') return padrao in armazenamento ? { [padrao]: armazenamento[padrao] } : {};
            return Object.fromEntries(Object.entries(padrao).map(([chave, valor]) => [chave, chave in armazenamento ? armazenamento[chave] : valor]));
          },
          set: async valores => { Object.assign(armazenamento, valores); },
          remove: async chave => { delete armazenamento[chave]; },
        },
      },
    },
    PerpetualMiner: raiz,
  });
  contexto.globalThis = contexto;
  vm.runInContext(FONTE_LEGADA, contexto, { filename: 'lib/chave-legada.js' });
  vm.runInContext(FONTE, contexto, { filename: 'lib/chave-da-openai.js' });
  const chave = raiz.ChaveDaOpenAI;
  chave.aoMudar(() => ouvidos.push('mudou'));
  const sessaoFalsa = {
    verificarAtiva() {},
    token: async () => 'token-da-conta',
    invalidar() { sessao.invalidou += 1; },
  };
  return { chave, pedidos, armazenamento, banco, ouvidos, sessao, sessaoFalsa, raiz };
}

const caminhos = mundo => mundo.pedidos.map(pedido => pedido.caminho);

async function recusa(promessa) {
  try {
    await promessa;
  } catch (falha) {
    return falha;
  }
  throw new Error('devia ter recusado');
}

async function oDonoQueVale() {
  const cache = (conta, naoEnviada) => ({ ultimos4: 'abcd', conta, versao: 2, naoEnviada });
  const validos = [
    ['com a chave', DONO, true, cache('A', false)],
    ['sem a chave (igual ao cache vazio: nada a gravar)', SEM_CHAVE, null, null],
    ['sem a chave mas com conta', { ...SEM_CHAVE, conta: 'A' }, null, { ultimos4: '', conta: 'A', versao: 0, naoEnviada: false }],
    ['sem conta (a chave é só deste computador)', { ...DONO, conta: null }, true, cache(null, false)],
    ['com a chave ainda não enviada', { ...DONO, naoEnviada: true }, true, cache('A', true)],
  ];
  for (const [nome, dono, copia, guardado] of validos) {
    const mundo = carregar({ respostas: [donoResposta(dono)] });
    assert.strictEqual(await mundo.chave.conferirACopia({ migrar: false }), copia, nome);
    igual(JSON.parse(JSON.stringify(mundo.armazenamento[MARCA] || null)), guardado, nome);
  }
}

async function oDonoQueNaoVale() {
  const invalidos = [
    ['sem o dono na resposta', resposta(200, {})],
    ['status de erro', resposta(500, { openai: DONO })],
    ['configurada que não é booleano', donoResposta({ ...DONO, configurada: 'sim' })],
    ['versão com fração', donoResposta({ ...DONO, versao: 1.5 })],
    ['versão negativa', donoResposta({ ...DONO, versao: -1 })],
    ['conta que não é texto', donoResposta({ ...DONO, conta: 7 })],
    ['naoEnviada ausente', donoResposta({ ...DONO, naoEnviada: undefined })],
    ['últimos 4 com 3 letras', donoResposta({ ...DONO, ultimos4: 'abc' })],
    ['últimos 4 que não é texto', donoResposta({ ...DONO, ultimos4: 1234 })],
  ];
  for (const [nome, dada] of invalidos) {
    const mundo = carregar({ respostas: [dada] });
    assert.strictEqual(await mundo.chave.conferirACopia({ migrar: false }), null, nome);
    assert.ok(!(MARCA in mundo.armazenamento), `${nome}: o cache não muda`);
  }

  const semConexao = carregar({ respostas: [SEM_RESPOSTA] });
  assert.strictEqual(await semConexao.chave.conferirACopia({ migrar: false }), null);
}

async function aConexaoAntigaDemais() {
  for (const [nome, dada] of [
    ['rota que não existe', resposta(404, {})],
    ['dono sem versão', donoResposta({ configurada: true, ultimos4: 'abcd', conta: 'A', naoEnviada: false })],
  ]) {
    const mundo = carregar({ respostas: [dada] });
    const falha = await recusa(mundo.chave.conferirACopia({ migrar: false }));
    assert.strictEqual(falha.message, 'outdated_connection', nome);
    assert.strictEqual(falha.codigo, 'outdated_connection', nome);
  }
  assert.strictEqual((await recusa(carregar({ respostas: [resposta(404, {})] }).chave.conferirACopia({ migrar: false }))).status, 404);
}

async function oCacheAvisaQuemOuveSoQuandoACopiaDaContaAtualMuda() {
  const pendenteDaConta = { ...DONO, naoEnviada: true };
  const mudou = carregar({ respostas: [donoResposta(pendenteDaConta)] });
  await mudou.chave.conferirACopia({ migrar: false });
  igual(mudou.ouvidos, ['mudou']);

  const semMudanca = carregar({
    respostas: [donoResposta(pendenteDaConta)],
    armazenado: { [MARCA]: { ultimos4: 'abcd', conta: 'A', versao: 2, naoEnviada: true } },
  });
  await semMudanca.chave.conferirACopia({ migrar: false });
  igual(semMudanca.ouvidos, []);

  const outraConta = carregar({ respostas: [donoResposta(pendenteDaConta)], uid: 'B' });
  await outraConta.chave.conferirACopia({ migrar: false });
  igual(outraConta.ouvidos, []);

  const semUsuario = carregar({ respostas: [donoResposta(pendenteDaConta)], logado: false });
  await semUsuario.chave.conferirACopia({ migrar: false });
  igual(semUsuario.ouvidos, []);
}

async function cadaRespostaDaSincronizacao() {
  const donoDaConta = donoResposta(DONO);
  const nuvem = (status, dados) => resposta(status, dados);
  const subiu = nuvem(200, { ok: true, resultado: 'subiu', versao: 2 });

  const certo = carregar({ respostas: [donoDaConta, donoDaConta, subiu, donoDaConta] });
  assert.strictEqual(await certo.chave.sincronizar(certo.sessaoFalsa, 'A'), 'subiu');
  igual(caminhos(certo), ['/ia/estado', '/ia/estado', '/ia/openai/sincronizar', '/ia/estado']);
  igual(certo.pedidos[2], { caminho: '/ia/openai/sincronizar', uid: 'A', token: 'token-da-conta', versao: 2 });

  const expirouUmaVez = carregar({ respostas: [donoDaConta, donoDaConta, nuvem(401, {}), donoDaConta, donoDaConta, donoDaConta, subiu, donoDaConta] });
  assert.strictEqual(await expirouUmaVez.chave.sincronizar(expirouUmaVez.sessaoFalsa, 'A'), 'subiu');
  assert.strictEqual(expirouUmaVez.sessao.invalidou, 1);

  const velhaUmaVez = carregar({
    respostas: [donoDaConta, donoDaConta, nuvem(409, { error: 'stale_key_version' }), donoDaConta, donoDaConta, donoDaConta, subiu, donoDaConta],
  });
  assert.strictEqual(await velhaUmaVez.chave.sincronizar(velhaUmaVez.sessaoFalsa, 'A'), 'subiu');
  assert.strictEqual(velhaUmaVez.sessao.invalidou, 0);

  const recusas = [
    ['401 duas vezes', [nuvem(401, {}), nuvem(401, {})], 401, 'expirou', 'resposta_invalida'],
    ['409 de versão velha duas vezes', [nuvem(409, { error: 'stale_key_version' }), nuvem(409, { error: 'stale_key_version' })], 409, undefined, 'stale_key_version'],
    ['403', [nuvem(403, { error: 'cloud_sync_failed' })], 403, 'recusado', 'cloud_sync_failed'],
    ['500 da nuvem', [nuvem(500, { error: 'cloud_sync_failed' })], 500, undefined, 'cloud_sync_failed'],
    ['outra conta com chave pendente', [nuvem(409, { error: 'other_account_unsent' })], 409, undefined, 'other_account_unsent'],
    ['sem resposta', [SEM_RESPOSTA], 503, undefined, 'resposta_invalida'],
  ];
  for (const [nome, rodadas, status, motivo, codigo] of recusas) {
    const respostas = [];
    for (const rodada of rodadas) respostas.push(donoDaConta, donoDaConta, rodada, donoDaConta);
    const mundo = carregar({ respostas });
    const falha = await recusa(mundo.chave.sincronizar(mundo.sessaoFalsa, 'A'));
    igual([falha.status, falha.motivo, falha.codigo], [status, motivo, codigo], nome);
    assert.ok(falha.message.startsWith(`OpenAI sync · HTTP ${status} · ${codigo}`), `${nome}: ${falha.message}`);
  }
}

async function aSincronizacaoQueNaoChegaAoComplemento() {
  const desligada = carregar({ respostas: [] });
  desligada.raiz.ConexaoAnki.conferir = async () => 'desligada';
  assert.strictEqual(await desligada.chave.sincronizar(desligada.sessaoFalsa, 'A'), null);
  igual(caminhos(desligada), []);

  const desligadaComChavePendente = carregar({
    respostas: [resposta(404, {})],
    armazenado: { [MARCA]: { ultimos4: 'abcd', conta: 'A', versao: 2, naoEnviada: true } },
  });
  desligadaComChavePendente.raiz.ConexaoAnki.conferir = async () => 'desligada';
  assert.strictEqual((await recusa(desligadaComChavePendente.chave.sincronizar(desligadaComChavePendente.sessaoFalsa, 'A'))).message, 'outdated_connection');

  const antiga = carregar({ respostas: [resposta(404, {})] });
  assert.strictEqual(await antiga.chave.sincronizar(antiga.sessaoFalsa, 'A'), null);

  const semDono = carregar({ respostas: [resposta(500, {}), resposta(500, {})] });
  assert.strictEqual((await recusa(semDono.chave.sincronizar(semDono.sessaoFalsa, 'A'))).message, 'owner_unavailable');

  const trocouDeConta = carregar({ respostas: [], uid: 'B' });
  const falha = await recusa(trocouDeConta.chave.sincronizar(trocouDeConta.sessaoFalsa, 'A'));
  igual([falha.message, falha.motivo], ['sessão mudou', 'expirou']);
}

async function confirmarEApagar() {
  const donoDaConta = donoResposta(DONO);
  const aceita = resposta(200, { ok: true, ultimos4: 'abcd' });

  const confirmou = carregar({ respostas: [donoDaConta, aceita, donoDaConta], armazenado: { [MARCA]: { ultimos4: 'abcd', conta: 'A', versao: 1, naoEnviada: false } } });
  igual(await confirmou.chave.confirmar('sk-nova'), { ok: true, ultimos4: 'abcd' });
  igual(confirmou.pedidos[1], { caminho: '/ia/openai/chave', chave: 'sk-nova', versao: 2, conta: 'A' });

  const recusada = carregar({ respostas: [donoDaConta, resposta(422, { error: 'openai_key_rejected' }), donoDaConta] });
  igual(await recusada.chave.confirmar('sk-ruim'), { ok: false, motivo: 'recusada', detalhes: 'HTTP 422 · openai_key_rejected' });

  const semCredito = carregar({ respostas: [donoDaConta, resposta(402, { error: 'openai_no_credit' }), donoDaConta] });
  assert.strictEqual((await semCredito.chave.confirmar('sk')).motivo, 'sem_credito');

  const caiuUmaVez = carregar({ respostas: [donoDaConta, SEM_RESPOSTA, aceita, donoDaConta] });
  igual(await caiuUmaVez.chave.confirmar('sk'), { ok: true, ultimos4: 'abcd' });

  const semConexao = carregar({ respostas: [donoDaConta, SEM_RESPOSTA, SEM_RESPOSTA, donoDaConta] });
  igual(await semConexao.chave.confirmar('sk'), { ok: false, motivo: 'sem_conexao', detalhes: 'sem resposta' });

  const semPareamento = carregar({ respostas: [donoDaConta, { motivo: MOTIVO.A_PAREAR, codigo: 'pairing_required' }, donoDaConta] });
  igual(await semPareamento.chave.confirmar('sk'), { ok: false, motivo: 'a_parear', detalhes: 'HTTP 401 · pairing_required' });

  const donoSumiu = carregar({ respostas: [donoDaConta, aceita, resposta(500, {})] });
  igual(await donoSumiu.chave.confirmar('sk'), { ok: false, motivo: 'sem_conexao', detalhes: 'sem resposta' });

  const donoMudou = carregar({ respostas: [donoDaConta, aceita, donoResposta(SEM_CHAVE)] });
  igual(await donoMudou.chave.confirmar('sk'), { ok: false, motivo: 'conexao_com_erro', detalhes: 'owner_changed' });

  const apagou = carregar({ respostas: [donoDaConta, resposta(200, { ok: true }), donoResposta(SEM_CHAVE)] });
  igual({ ...(await apagou.chave.apagar()) }, SEM_CHAVE);
  igual(apagou.pedidos[1], { caminho: '/ia/openai/chave/apagar', versao: 2, conta: 'A' });

  const deOutraConta = carregar({ respostas: [donoResposta({ ...DONO, conta: 'B' })] });
  assert.strictEqual((await recusa(deOutraConta.chave.apagar())).codigo, 'other_account_owner');
  igual(caminhos(deOutraConta), ['/ia/estado']);

  const deOutraContaSemChave = carregar({ respostas: [donoResposta({ ...SEM_CHAVE, conta: 'B' }), resposta(200, { ok: true }), donoResposta(SEM_CHAVE)] });
  igual({ ...(await deOutraContaSemChave.chave.apagar()) }, SEM_CHAVE);

  const semDono = carregar({ respostas: [resposta(500, {})] });
  assert.strictEqual((await recusa(semDono.chave.apagar())).message, 'owner_unavailable');

  const apagarFalhou = carregar({ respostas: [donoDaConta, resposta(409, { error: 'stale_key_version' }), donoDaConta] });
  assert.strictEqual((await recusa(apagarFalhou.chave.apagar())).message, 'HTTP 409 · stale_key_version');

  const apagarCaiuUmaVez = carregar({ respostas: [donoDaConta, SEM_RESPOSTA, resposta(200, { ok: true }), donoResposta(SEM_CHAVE)] });
  igual({ ...(await apagarCaiuUmaVez.chave.apagar()) }, SEM_CHAVE);
}

async function aChaveDaExtensaoAntigaVaiParaODono() {
  const semDonoAinda = { ...SEM_CHAVE, conta: null };
  const aceita = resposta(200, { ok: true });
  const antiga = { openai: 'sk-antiga', 'openai-conta': 'A', 'openai-em': 1700 };

  const nada = carregar({ respostas: [donoResposta(DONO)] });
  await nada.chave.conferirACopia();
  igual(caminhos(nada), ['/ia/estado']);
  assert.strictEqual(nada.banco.dados.size, 0);

  const semDono = carregar({ respostas: [donoResposta(semDonoAinda), aceita, donoResposta(DONO)], legado: antiga });
  await semDono.chave.conferirACopia();
  igual(semDono.pedidos[1], { caminho: '/ia/openai/legado', chave: 'sk-antiga', conta: 'A', em: 1700, versao: 0 });
  assert.strictEqual(semDono.banco.dados.size, 0);

  const local = carregar({ respostas: [donoResposta(SEM_CHAVE), aceita, donoResposta(DONO)], legado: { openai: 'sk-antiga', 'openai-conta': 'local' } });
  await local.chave.conferirACopia();
  igual(local.pedidos[1], { caminho: '/ia/openai/legado', chave: 'sk-antiga', conta: '', em: 1, versao: 0 });

  const soAHora = carregar({ respostas: [donoResposta(SEM_CHAVE), aceita, donoResposta(SEM_CHAVE)], legado: { 'openai-em': 5 } });
  await soAHora.chave.conferirACopia();
  igual(soAHora.pedidos[1], { caminho: '/ia/openai/legado', chave: '', conta: '', em: 5, versao: 0 });

  const jaTemDono = carregar({ respostas: [donoResposta(DONO), donoResposta(DONO)], legado: antiga });
  await jaTemDono.chave.conferirACopia();
  igual(caminhos(jaTemDono), ['/ia/estado', '/ia/estado']);
  assert.strictEqual(jaTemDono.banco.dados.size, 0);

  const naoBate = carregar({ respostas: [donoResposta(semDonoAinda), resposta(409, { error: 'legacy_key_mismatch' })], legado: antiga });
  const falha = await recusa(naoBate.chave.conferirACopia());
  igual([falha.message, falha.status, falha.codigo], ['legacy_key_mismatch', 409, 'legacy_key_mismatch']);
  assert.strictEqual(naoBate.banco.dados.size, 3, 'a chave antiga fica onde estava');

  const semDonoNaConexao = carregar({ respostas: [resposta(500, {})], legado: antiga });
  assert.strictEqual((await recusa(semDonoNaConexao.chave.conferirACopia())).message, 'legacy_owner_unavailable');

  const marcaAntiga = carregar({
    respostas: [donoResposta(DONO)],
    armazenado: { [MARCA]: { ultimos4: 'abcd' }, pm_chave_openai_versao: 3 },
  });
  await marcaAntiga.chave.conferirACopia();
  assert.ok(!('pm_chave_openai_versao' in marcaAntiga.armazenamento));
  assert.strictEqual(marcaAntiga.armazenamento[MARCA].versao, 2, 'a marca antiga é trocada pelo cache do dono');
}

async function oLegadoLimpaTudoAoConfirmarEApagar() {
  const donoDaConta = donoResposta(DONO);
  const aceita = resposta(200, { ok: true, ultimos4: 'abcd' });
  const confirmou = carregar({ respostas: [donoDaConta, aceita, donoDaConta], legado: { openai: 'sk-antiga', 'conta:B': 'x' } });
  await confirmou.chave.confirmar('sk-nova');
  assert.strictEqual(confirmou.banco.dados.size, 0, 'confirmar limpa toda a chave antiga, de toda conta');

  const apagou = carregar({ respostas: [donoDaConta, resposta(200, { ok: true }), donoResposta(SEM_CHAVE)], legado: { openai: 'sk-antiga', 'conta:B': 'x' } });
  await apagou.chave.apagar();
  assert.strictEqual(apagou.banco.dados.size, 0, 'apagar limpa toda a chave antiga, de toda conta');
}

(async () => {
  await oDonoQueVale();
  await oDonoQueNaoVale();
  await aConexaoAntigaDemais();
  await oCacheAvisaQuemOuveSoQuandoACopiaDaContaAtualMuda();
  await cadaRespostaDaSincronizacao();
  await aSincronizacaoQueNaoChegaAoComplemento();
  await confirmarEApagar();
  await aChaveDaExtensaoAntigaVaiParaODono();
  await oLegadoLimpaTudoAoConfirmarEApagar();
  console.log('chave da openai tests passed');
})().catch(falha => {
  console.error(falha);
  process.exit(1);
});
