'use strict';

// As máquinas do Envio ao Anki na extensão, sem tela: a situação de um Envio (`SituacaoDoEnvio`: o que o cartão dele diz), a fase da remessa
// (`FaseDaRemessa`: criar, acompanhar, resumir), as duas em `painel-envio-estado.js`, e o que fica guardado em `pm_envio` (`EnvioGravado`,
// `lib/envio-gravado.js`). Roda sem navegador: `node test_estado_do_envio.js`.
// O que a pessoa vê é do e2e (`painel-envio*.spec.js`).

const assert = require('assert');

globalThis.PerpetualMiner = {};
require('./painel-envio-estado.js');
const { SituacaoDoEnvio, FaseDaRemessa } = globalThis.PerpetualMiner;

// ─── A situação de um Envio ───────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const { ESTADO, ESPERA, AJUDA, situacaoDoEnvio, terminou, retomavel, foraDoResumo, doCodigo } = SituacaoDoEnvio;
  const AGORA = Date.parse('2026-09-18T12:00:00Z');
  const ENVIO = { id: 'e1', jobId: 'e1', falhaAoCriar: null };
  const de = (job, contexto = {}, envio = ENVIO) => situacaoDoEnvio(envio, job, { agora: AGORA, ...contexto });
  const rodando = (mais = {}) => ({ status: 'running', stage: 'generate_cards', updatedAt: '2026-09-18T11:59:00Z', ...mais });

  assert.deepStrictEqual(Object.values(ESTADO).sort(),
    ['andando', 'apagado', 'concluido', 'criando', 'desconhecido', 'emParte', 'esperando', 'naFila', 'naoComecou', 'naoConcluido', 'parado']);

  // Antes de a Conexão responder ao pedido, o Envio não está na fila de ninguém: está sendo pedido (o defeito T1 era dizer “Na fila”).
  assert.strictEqual(de(null, {}, { id: 'e1', jobId: null, falhaAoCriar: null }).estado, ESTADO.CRIANDO);
  // O pedido que não deu: a causa é uma de três.
  assert.deepStrictEqual(de(null, {}, { jobId: null, falhaAoCriar: { semResposta: true, causa: 'x' } }), { estado: ESTADO.NAO_COMECOU, causa: 'semResposta' });
  assert.deepStrictEqual(de(null, {}, { jobId: null, falhaAoCriar: { semResposta: false, causa: 'x' } }), { estado: ESTADO.NAO_COMECOU, causa: 'erro' });
  assert.deepStrictEqual(de(null, {}, { jobId: null, falhaAoCriar: { motivo: 'ENV-03.motivoAjustes', causa: 'x' } }), { estado: ESTADO.NAO_COMECOU, causa: 'ajustes' });
  // A Conexão responde e não conhece o Envio: vale mais que o último estado lido.
  assert.strictEqual(de(rodando(), { desconhecido: true }).estado, ESTADO.DESCONHECIDO);
  // Criado, e a primeira leitura ainda não voltou: na fila.
  assert.deepStrictEqual(de(null), { estado: ESTADO.NA_FILA, etapa: 'queued', feitos: 0, total: 0 });
  assert.strictEqual(de({ status: 'queued', stage: 'queued' }).estado, ESTADO.NA_FILA);
  // Andando: a etapa é a do Cartão que está sendo feito, e o quanto é `feitos de total` Cartões.
  assert.deepStrictEqual(de(rodando({ stage: 'generate_audio', progress: { done: 1, total: 4 } })), { estado: ESTADO.ANDANDO, etapa: 'generate_audio', feitos: 1, total: 4 });
  assert.deepStrictEqual(de(rodando({ progress: {} })), { estado: ESTADO.ANDANDO, etapa: 'generate_cards', feitos: 0, total: 0 });

  // O Anki fechou no meio: parado, seja o que for que o último estado lido dizia esperar.
  assert.strictEqual(de(rodando({ waiting: { reason: 'plan_limit' } }), { ankiFechado: true }).estado, ESTADO.PARADO);
  assert.strictEqual(de({ status: 'queued', stage: 'queued' }, { ankiFechado: true }).estado, ESTADO.PARADO);
  // Esperando: o motivo é um de uma lista fechada.
  const espera = (job, contexto) => { const s = de(job, contexto); return [s.estado, s.espera]; };
  assert.deepStrictEqual(espera(rodando({ waiting: { reason: 'plan_limit' } })), [ESTADO.ESPERANDO, ESPERA.PLANO]);
  assert.deepStrictEqual(espera(rodando({ waiting: { reason: 'monthly_cap' } })), [ESTADO.ESPERANDO, ESPERA.TETO]);
  assert.deepStrictEqual(espera(rodando({ stage: 'wait_anki', waiting: { reason: 'other_profile', profile: 'A', marked: 'B' } })), [ESTADO.ESPERANDO, ESPERA.OUTRO_PERFIL]);
  assert.deepStrictEqual(espera(rodando({ stage: 'wait_anki', waiting: { reason: 'profile_missing', marked: 'B' } })), [ESTADO.ESPERANDO, ESPERA.PERFIL_SUMIU]);
  // Esperando o Anki sem motivo: só passa a pedir algo da pessoa depois de 5 minutos.
  assert.strictEqual(de(rodando({ stage: 'wait_anki', updatedAt: '2026-09-18T11:56:00Z' })).estado, ESTADO.ANDANDO);
  assert.deepStrictEqual(espera(rodando({ stage: 'wait_anki', updatedAt: '2026-09-18T11:55:00Z' })), [ESTADO.ESPERANDO, ESPERA.ANKI]);
  assert.strictEqual(de({ status: 'queued', stage: 'wait_anki', updatedAt: '2026-09-18T11:00:00Z' }).estado, ESTADO.NA_FILA);
  // Um motivo de espera que esta versão não conhece não inventa um pedido: o Envio anda.
  assert.strictEqual(de(rodando({ waiting: { reason: 'novidade' } })).estado, ESTADO.ANDANDO);

  // Os três fins, e o motivo do que não entrou (o código da Conexão).
  assert.deepStrictEqual(de({ status: 'completed', stage: 'completed' }), { estado: ESTADO.CONCLUIDO });
  assert.deepStrictEqual(de({ status: 'partial', stage: 'partial', lastError: 'cards_failed' }), { estado: ESTADO.EM_PARTE, motivo: 'cards_failed' });
  assert.deepStrictEqual(de({ status: 'failed', stage: 'failed', lastError: 'openai_key_rejected' }), { estado: ESTADO.NAO_CONCLUIDO, motivo: 'openai_key_rejected' });
  // O fim vale mais que o Anki fechado e que um `waiting` que sobrou.
  assert.strictEqual(de({ status: 'failed', lastError: 'x', waiting: { reason: 'plan_limit' } }, { ankiFechado: true }).estado, ESTADO.NAO_CONCLUIDO);
  // As Frases apagadas na Conexão (o Apagar tudo de outro navegador): não é um “não concluído” que se retoma (o laço do defeito T4).
  assert.deepStrictEqual(de({ status: 'failed', stage: 'failed', lastError: 'frases_apagadas', wiped: true }), { estado: ESTADO.APAGADO });
  assert.strictEqual(de({ status: 'failed', lastError: 'frases_apagadas' }).estado, ESTADO.APAGADO);
  // Terminado e só depois apagado: o fim é o mesmo (o que entrou conta no resumo), mas nada se retoma na Conexão.
  assert.deepStrictEqual(de({ status: 'completed', wiped: true }), { estado: ESTADO.CONCLUIDO });
  assert.deepStrictEqual(de({ status: 'partial', wiped: true, lastError: 'cards_failed' }), { estado: ESTADO.EM_PARTE, motivo: 'cards_failed', apagadas: true });
  assert.strictEqual(retomavel(de({ status: 'partial', wiped: true, lastError: 'cards_failed' })), false);
  assert.strictEqual(retomavel(de({ status: 'partial', lastError: 'cards_failed' })), true);

  // O que cada estado permite, numa linha por estado.
  const TABELA = {
    //                        terminou  retomável  fora do resumo
    [ESTADO.CRIANDO]:        [false,    false,     false],
    [ESTADO.NAO_COMECOU]:    [true,     false,     false],
    [ESTADO.DESCONHECIDO]:   [true,     false,     true],
    [ESTADO.NA_FILA]:        [false,    false,     false],
    [ESTADO.ANDANDO]:        [false,    false,     false],
    [ESTADO.PARADO]:         [false,    false,     false],
    [ESTADO.ESPERANDO]:      [false,    false,     false],
    [ESTADO.CONCLUIDO]:      [true,     false,     false],
    [ESTADO.EM_PARTE]:       [true,     true,      false],
    [ESTADO.NAO_CONCLUIDO]:  [true,     true,      false],
    [ESTADO.APAGADO]:        [true,     false,     true],
  };
  assert.deepStrictEqual(Object.keys(TABELA).sort(), Object.values(ESTADO).sort());
  for (const [estado, esperado] of Object.entries(TABELA)) {
    assert.deepStrictEqual([terminou({ estado }), retomavel({ estado }), foraDoResumo({ estado })], esperado, estado);
  }

  // O resumo, por idioma: o Envio que a Conexão não conhece e o apagado ficam de fora; na dúvida, a Frase conta como não entrou.
  {
    const envios = [
      { id: 'a', jobId: 'a', lang: 'en', baralho: 'PM::Inglês', ids: [1, 2, 3, 4] },
      { id: 'b', jobId: null, lang: 'en', ids: [5], falhaAoCriar: { semResposta: true, causa: 'x' } },
      { id: 'c', jobId: 'c', lang: 'ru', baralho: 'PM::Russo', ids: [6] },
      { id: 'd', jobId: 'd', lang: 'ru', ids: [7] },
      { id: 'e', jobId: 'e', lang: 'en', ids: [8] },
    ];
    const jobs = {
      a: { status: 'partial', lastError: 'openai_key_rejected', successfulPhraseIds: [1, 2, 3], failedPhraseIds: [3, 4], duplicatePhraseIds: ['2'] },
      c: { status: 'completed', successfulPhraseIds: [6] },
      d: { status: 'failed', lastError: 'frases_apagadas', wiped: true },
    };
    const estadoDoJob = envio => jobs[envio.jobId] || null;
    const situacaoDe = envio => situacaoDoEnvio(envio, estadoDoJob(envio), { desconhecido: envio.id === 'e', agora: AGORA });
    assert.deepStrictEqual(SituacaoDoEnvio.contagemPorIdioma(envios, situacaoDe, estadoDoJob), [
      { lang: 'en', baralho: 'PM::Inglês', total: 5, enviadas: [1], duplicadas: [2], falhas: 3, codigo: 'openai_key_rejected' },
      { lang: 'ru', baralho: 'PM::Russo', total: 1, enviadas: [6], duplicadas: [], falhas: 0, codigo: undefined },
    ]);
  }

  // O motivo de cada código da Conexão: uma tabela só, para o cartão, o resumo e a Boas-vindas.
  const linha = codigo => { const { fala, noPainel, ajuda, chave } = doCodigo(codigo); return [fala, noPainel, ajuda, chave]; };
  assert.deepStrictEqual(linha('openai_key_missing'), ['ONB-23.motivoSemChave', 'ONB-23.motivoSemChave', AJUDA.TROCAR_A_CHAVE, true]);
  assert.deepStrictEqual(linha('openai_key_rejected'), ['ONB-23.motivoChaveRecusada', 'ONB-23.motivoChaveRecusada', AJUDA.TROCAR_A_CHAVE, true]);
  assert.deepStrictEqual(linha('openai_no_credit'), ['ONB-23.motivoSemCredito', 'ONB-23.motivoSemCredito', AJUDA.TROCAR_A_CHAVE, true]);
  for (const codigo of ['openai_rate_limited', 'openai_unreachable', 'generation_error', 'empty_response']) {
    assert.deepStrictEqual(linha(codigo), ['ONB-23.motivoOpenAI', 'ONB-23.motivoOpenAI', AJUDA.TENTAR, false], codigo);
  }
  for (const codigo of ['chatgpt_signed_out', 'chatgpt_rejected']) {
    assert.deepStrictEqual(linha(codigo), ['ONB-23.motivoChatGPT', null, AJUDA.TENTAR, true], codigo);
  }
  assert.deepStrictEqual(linha('chatgpt_not_eligible'), ['ONB-23.motivoChatGPT', 'CFG-35.erroChatgptNaoServe', AJUDA.USAR_A_CHAVE, true]);
  assert.deepStrictEqual(linha('chatgpt_usage_limit'), ['ONB-23.motivoOutro', 'ENV-20.limite', AJUDA.GERENCIAR_USO, true]);
  assert.deepStrictEqual(linha('note_type_missing'), ['ONB-23.motivoTipoDeNota', 'ONB-23.motivoTipoDeNota', AJUDA.TENTAR, false]);
  assert.deepStrictEqual(linha('anki_write_failed'), ['ONB-23.motivoAnki', 'ONB-23.motivoAnki', AJUDA.TENTAR, false]);
  // O código que a tabela não conhece (ou nenhum): o painel não inventa motivo, e só resta tentar de novo.
  for (const codigo of ['cards_failed', 'novidade', 'toString', null, undefined]) {
    assert.deepStrictEqual(linha(codigo), ['ONB-23.motivoOutro', null, AJUDA.TENTAR, true], String(codigo));
  }
  // Toda frase da tabela existe no catálogo da Voz.
  require('./lib/voz/catalogo.js');
  require('./lib/voz/catalogo-nivel.js');
  require('./lib/voz/texto.js');
  const codigos = ['openai_key_missing', 'openai_key_rejected', 'openai_no_credit', 'openai_rate_limited', 'chatgpt_signed_out', 'chatgpt_not_eligible', 'chatgpt_usage_limit', 'note_type_missing', 'anki_write_failed', null];
  for (const codigo of codigos) {
    for (const id of [doCodigo(codigo).fala, doCodigo(codigo).noPainel].filter(Boolean)) assert.ok(globalThis.PerpetualMiner.textoDaVoz(id), id);
  }
}

// ─── A fase da remessa ────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const { FASE, EVENTO, PRAZO_DO_PEDIDO_MS, proxima, aceita } = FaseDaRemessa;
  const depoisDe = (eventos, fase = FASE.PARADA) => eventos.reduce((f, evento) => proxima(f, typeof evento === 'string' ? { tipo: evento } : evento), fase);
  const CRIOU = { tipo: EVENTO.CRIOU, sobrou: true };
  const NADA_SOBROU = { tipo: EVENTO.CRIOU, sobrou: false };

  assert.deepStrictEqual(Object.values(FASE).sort(), ['acompanhando', 'criando', 'parada', 'resumo']);
  // Todo pedido tem prazo: uma Conexão que aceita o pedido e não responde não segura a remessa para sempre (o defeito T1).
  assert.ok(PRAZO_DO_PEDIDO_MS > 0 && PRAZO_DO_PEDIDO_MS <= 30_000);

  // O caminho inteiro: parada → criando → acompanhando → resumo → parada.
  assert.strictEqual(depoisDe([EVENTO.CRIAR]), FASE.CRIANDO);
  assert.strictEqual(depoisDe([EVENTO.CRIAR, CRIOU]), FASE.ACOMPANHANDO);
  assert.strictEqual(depoisDe([EVENTO.CRIAR, CRIOU, EVENTO.RESUMIR]), FASE.RESUMO);
  assert.strictEqual(depoisDe([EVENTO.CRIAR, CRIOU, EVENTO.RESUMIR, { tipo: EVENTO.RESPONDER, tentar: false }]), FASE.PARADA);
  // Tentar de novo no resumo volta a acompanhar (e daí a criar o que não tinha começado).
  assert.strictEqual(depoisDe([EVENTO.CRIAR, CRIOU, EVENTO.RESUMIR, { tipo: EVENTO.RESPONDER, tentar: true }]), FASE.ACOMPANHANDO);
  assert.strictEqual(depoisDe([EVENTO.CRIAR, CRIOU, EVENTO.RESUMIR, { tipo: EVENTO.RESPONDER, tentar: true }, EVENTO.CRIAR]), FASE.CRIANDO);
  // O criar que não deixou nada para acompanhar (fechado sem nada ter começado) volta a parada.
  assert.strictEqual(depoisDe([EVENTO.CRIAR, NADA_SOBROU]), FASE.PARADA);
  // Enviar de novo, ou recomeçar um Envio, enquanto se acompanha.
  assert.strictEqual(depoisDe([EVENTO.CRIAR, CRIOU, EVENTO.CRIAR]), FASE.CRIANDO);
  // Esquecer o que se acompanhava (o último Envio saiu, ou o progresso fechou sem nada começado).
  assert.strictEqual(depoisDe([EVENTO.CRIAR, CRIOU, EVENTO.ESQUECER]), FASE.PARADA);
  // O Apagar tudo leva qualquer fase a parada.
  for (const fase of Object.values(FASE)) assert.strictEqual(proxima(fase, { tipo: EVENTO.APAGAR_TUDO }), FASE.PARADA, fase);

  // O que cada fase aceita: o que não está na linha não muda a fase (nada de “esqueci de conferir `criando`”).
  const ACEITA = {
    [FASE.PARADA]: [EVENTO.CRIAR, EVENTO.APAGAR_TUDO],
    [FASE.CRIANDO]: [EVENTO.CRIOU, EVENTO.APAGAR_TUDO],
    [FASE.ACOMPANHANDO]: [EVENTO.CRIAR, EVENTO.RESUMIR, EVENTO.ESQUECER, EVENTO.APAGAR_TUDO],
    [FASE.RESUMO]: [EVENTO.RESPONDER, EVENTO.APAGAR_TUDO],
  };
  for (const fase of Object.values(FASE)) {
    for (const tipo of Object.values(EVENTO)) {
      assert.strictEqual(aceita(fase, tipo), ACEITA[fase].includes(tipo), `${fase} × ${tipo}`);
      if (!ACEITA[fase].includes(tipo)) assert.strictEqual(proxima(fase, { tipo, sobrou: true, tentar: true }), fase, `${fase} × ${tipo}`);
    }
  }
  // Toda fase tem saída, e de toda fase se chega a parada.
  for (const fase of Object.values(FASE)) assert.ok(ACEITA[fase].some(tipo => proxima(fase, { tipo, sobrou: true, tentar: true }) !== fase), fase);
}

// ─── O que fica guardado em `pm_envio` ────────────────────────────────────────────────────────────────────────────────────────────
(async () => {
  require('./lib/envio-gravado.js');
  const { EnvioGravado } = globalThis.PerpetualMiner;
  const { EVENTO, proximo, criar } = EnvioGravado;
  const ENVIOS = [{ id: 'a', lang: 'en', ids: [1], jobId: 'a' }];
  const SO_A_MARCA = { envios: [], apagarFrases: true };
  const COM_MARCA = { envios: ENVIOS, apagarFrases: true };

  // Os quatro valores × os quatro eventos.
  const TABELA = [
    // guardado          acompanhar(ENVIOS)   esquecer      apagarTudo    confirmou
    [null,               { envios: ENVIOS },  null,         SO_A_MARCA,   null],
    [{ envios: ENVIOS }, { envios: ENVIOS },  null,         SO_A_MARCA,   { envios: ENVIOS }],
    [COM_MARCA,          COM_MARCA,           SO_A_MARCA,   SO_A_MARCA,   { envios: ENVIOS }],
    [SO_A_MARCA,         COM_MARCA,           SO_A_MARCA,   SO_A_MARCA,   null],
  ];
  for (const [guardado, ...esperados] of TABELA) {
    [EVENTO.ACOMPANHAR, EVENTO.ESQUECER, EVENTO.APAGAR_TUDO, EVENTO.CONFIRMOU].forEach((tipo, i) => {
      assert.deepStrictEqual(proximo(guardado, { tipo, envios: ENVIOS }), esperados[i], `${JSON.stringify(guardado)} × ${tipo}`);
    });
  }
  assert.deepStrictEqual(proximo(COM_MARCA, { tipo: 'novidade' }), COM_MARCA);

  // Quem grava: lê, aplica e grava; nada guardado é a chave removida.
  const guardado = {};
  const storage = {
    get: async chaves => Object.fromEntries(Object.keys(chaves).map(chave => [chave, chave in guardado ? guardado[chave] : chaves[chave]])),
    set: async valores => { Object.assign(guardado, valores); },
    remove: async chave => { delete guardado[chave]; },
  };
  const gravado = criar(storage);
  await gravado.mudar(EVENTO.APAGAR_TUDO);
  await gravado.mudar(EVENTO.ACOMPANHAR, { envios: ENVIOS });
  assert.deepStrictEqual(guardado, { pm_envio: COM_MARCA });
  assert.deepStrictEqual(await gravado.ler(), COM_MARCA);
  // O Apagar tudo veio enquanto se lia: o que o painel ia gravar não é gravado.
  await gravado.mudar(EVENTO.ACOMPANHAR, { envios: [], seAinda: () => false });
  assert.deepStrictEqual(guardado, { pm_envio: COM_MARCA });
  await gravado.mudar(EVENTO.CONFIRMOU);
  assert.deepStrictEqual(guardado, { pm_envio: { envios: ENVIOS } });
  await gravado.mudar(EVENTO.ESQUECER);
  assert.deepStrictEqual(guardado, {});

  console.log('estado do envio ok');
})().catch(erro => {
  console.error(erro);
  process.exit(1);
});
