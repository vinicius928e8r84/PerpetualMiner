'use strict';

(function (raiz) {
  const LIMITE_DO_VOCABULARIO = 10000;

  const montados = new WeakSet();
  const montar = pedido => {
    const pronto = Object.freeze(pedido);
    montados.add(pronto);
    return pronto;
  };

  const saude = () => montar({ metodo: 'GET', caminho: '/health', semAssinatura: true });

  const comecarOPareamento = () => montar({ metodo: 'POST', caminho: '/pareamento/comecar', corpo: {}, semAssinatura: true });

  function concluirOPareamento(codigo, cliente, nome) {
    if (typeof codigo !== 'string' || typeof cliente !== 'string' || typeof nome !== 'string') throw new Error('concluirOPareamento pede o código, o navegador e o nome como texto');
    return montar({ metodo: 'POST', caminho: '/pareamento/concluir', corpo: { codigo, cliente, nome }, semAssinatura: true });
  }

  function conferirOPareamento(cliente, desafio) {
    if (typeof cliente !== 'string' || typeof desafio !== 'string') throw new Error('conferirOPareamento pede o navegador e o desafio como texto');
    return montar({ metodo: 'POST', caminho: '/pareamento/conferir', corpo: { cliente, desafio }, semAssinatura: true });
  }

  const baralhos = () => montar({ metodo: 'POST', caminho: '/anki/decks', corpo: {} });

  const LEITURAS_DOS_NUMEROS = Object.freeze([
    Object.freeze({ deNovo: false, abrirOAnki: false }),
    Object.freeze({ deNovo: true, abrirOAnki: false }),
    Object.freeze({ deNovo: true, abrirOAnki: true }),
  ]);

  function estatisticas(baralhosPedidos, { deNovo = false, abrirOAnki = false } = {}) {
    if (!LEITURAS_DOS_NUMEROS.some(leitura => leitura.deNovo === deNovo && leitura.abrirOAnki === abrirOAnki)) {
      throw new Error(`leitura dos números sem exemplo no contrato: deNovo=${deNovo}, abrirOAnki=${abrirOAnki}; `
        + 'acrescente-a a LEITURAS_DOS_NUMEROS (lib/pedido-ao-anki.js) e o exemplo a complemento/contrato/exemplos.json');
    }
    const corpo = { decks: baralhosPedidos.map(({ deckName, lang }) => ({ deckName, lang })) };
    if (deNovo) corpo.refresh = true;
    if (abrirOAnki) corpo.launch = true;
    return montar({ metodo: 'POST', caminho: '/anki/stats/decks', corpo });
  }

  const vocabulario = (deck, lang) => montar({
    metodo: 'POST', caminho: '/anki/vocabulary', corpo: { deck, lang, limit: LIMITE_DO_VOCABULARIO },
  });

  function previaDoCartao(lang, nivel, tipoProprio) {
    if (typeof lang !== 'string' || typeof nivel !== 'string') throw new Error('previaDoCartao pede o idioma e o nível');
    return montar({ metodo: 'POST', caminho: '/anki/card-preview', corpo: { lang, nivel, ...(tipoProprio && { tipoProprio }) } });
  }

  function previaDaNota(guid) {
    if (typeof guid !== 'string' || !guid) throw new Error('previaDaNota pede o guid da nota');
    return montar({ metodo: 'POST', caminho: '/anki/card-preview', corpo: { guid } });
  }

  function abrirNoAnki(guid) {
    if (typeof guid !== 'string' || !guid) throw new Error('abrirNoAnki pede o guid da nota');
    return montar({ metodo: 'POST', caminho: '/anki/browse', corpo: { guid } });
  }

  const tiposDeNota = () => montar({ metodo: 'POST', caminho: '/anki/note-types', corpo: {} });

  const estadoDoItemDeLogin = () => montar({ metodo: 'POST', caminho: '/abrir-com-o-computador/estado', corpo: {} });

  function abrirComOComputador(ligado) {
    if (typeof ligado !== 'boolean') throw new Error(`abrirComOComputador pede true ou false, não ${JSON.stringify(ligado)}`);
    return montar({ metodo: 'POST', caminho: '/abrir-com-o-computador', corpo: { ligado } });
  }

  const perfisDoAnki = () => montar({ metodo: 'POST', caminho: '/anki/profiles', corpo: {} });

  function escolherOPerfil(perfil) {
    if (typeof perfil !== 'string' || !perfil) throw new Error('escolherOPerfil pede o nome do perfil');
    return montar({ metodo: 'POST', caminho: '/anki/profile', corpo: { profile: perfil } });
  }

  const abrirOPerfilMarcado = () => montar({ metodo: 'POST', caminho: '/anki/profile/open', corpo: {} });

  function chaveDaOpenAI(chave, versao = 0, conta = '') {
    if (typeof chave !== 'string') throw new Error('chaveDaOpenAI pede a chave como texto');
    return montar({ metodo: 'POST', caminho: '/ia/openai/chave', corpo: { chave, versao, conta } });
  }

  const apagarChaveDaOpenAI = (versao = 0, conta = '') => montar({ metodo: 'POST', caminho: '/ia/openai/chave/apagar', corpo: { versao, conta } });

  const sincronizarChaveDaOpenAI = (uid, token, versao = 0) => montar({
    metodo: 'POST', caminho: '/ia/openai/sincronizar', corpo: { uid, token, versao },
  });

  const vincularLegadoDaOpenAI = (chave, conta, em, versao = 0) => montar({
    metodo: 'POST', caminho: '/ia/openai/legado', corpo: { chave, conta, em, versao },
  });

  const estadoDaIA = () => montar({ metodo: 'POST', caminho: '/ia/estado', corpo: {} });

  const estadoDoChatGPT = () => montar({ metodo: 'POST', caminho: '/ia/chatgpt/estado', corpo: {} });
  const entrarComOChatGPT = () => montar({ metodo: 'POST', caminho: '/ia/chatgpt/entrar', corpo: {} });
  const sairDoChatGPT = () => montar({ metodo: 'POST', caminho: '/ia/chatgpt/sair', corpo: {} });

  const estadoDoModelo = () => montar({ metodo: 'POST', caminho: '/ia/modelo/estado', corpo: {} });
  const escolherOModelo = modelo => montar({ metodo: 'POST', caminho: '/ia/modelo/escolher', corpo: { modelo } });

  function trocarAFrente(lang, frente) {
    if (typeof lang !== 'string' || typeof frente !== 'string') throw new Error('trocarAFrente pede o idioma e a frente como texto');
    return montar({ metodo: 'POST', caminho: '/anki/card-front', corpo: { lang, frente } });
  }

  function criarEnvio(envio) {
    const { jobId, lang, deckName, imageSource, tts, nivel, tipoProprio, teste, entries } = envio;
    if (typeof jobId !== 'string' || !jobId) throw new Error('criarEnvio pede o jobId do Envio');
    return montar({ metodo: 'POST', caminho: '/jobs', corpo: { jobId, lang, deckName, imageSource, tts, ...(nivel && { nivel }), ...(tipoProprio && { tipoProprio }), ...(teste && { teste: true }), entries } });
  }

  function ouvirAVoz(lang, provedor, sotaque) {
    if (!['google', 'openai'].includes(provedor)) throw new Error(`ouvirAVoz pede google ou openai, não ${JSON.stringify(provedor)}`);
    return montar({ metodo: 'POST', caminho: '/voz/ouvir', corpo: { lang, provedor, ...(provedor === 'google' && { sotaque }) } });
  }

  function falarAFrase(lang, sotaque, texto) {
    if (typeof texto !== 'string' || !texto.trim() || texto.length > 200) throw new Error('falarAFrase pede 1 a 200 letras');
    return montar({ metodo: 'POST', caminho: '/voz/falar', corpo: { lang, sotaque, texto } });
  }

  const listarEnvios = () => montar({ metodo: 'POST', caminho: '/jobs/list', corpo: {} });

  const doEnvio = caminho => jobId => montar({ metodo: 'POST', caminho, corpo: { jobId } });
  const verEnvio = doEnvio('/jobs/get');
  const tentarEnvioDeNovo = doEnvio('/jobs/retry');
  const usarAChaveNoEnvio = doEnvio('/jobs/usar-a-chave');
  const pacoteDeDiagnostico = doEnvio('/jobs/debug-bundle');

  const apagarFrasesDosEnvios = () => montar({ metodo: 'POST', caminho: '/jobs/apagar-frases', corpo: {} });

  function custosDosEnvios({ de = '', ate = '' } = {}) {
    const corpo = { lang: 'all' };
    if (de) corpo.from = de;
    if (ate) corpo.to = ate;
    return montar({ metodo: 'POST', caminho: '/analytics/jobs', corpo });
  }

  const tetoDoMes = () => montar({ metodo: 'POST', caminho: '/custos/teto', corpo: {} });
  const atualizarAConexao = () => montar({ metodo: 'POST', caminho: '/atualizacao/agora', corpo: {} });
  const reiniciarOAnki = () => montar({ metodo: 'POST', caminho: '/atualizacao/reiniciar', corpo: {} });
  function definirOTeto(limitUsd) {
    if (typeof limitUsd !== 'number' || !(limitUsd > 0)) throw new Error('definirOTeto pede um valor em dólares maior que zero');
    return montar({ metodo: 'POST', caminho: '/custos/teto/definir', corpo: { limitUsd } });
  }

  function enviar(endereco, { metodo, caminho }, corpoEmTexto, opcoes, cabecalhos = {}) {
    const url = `${endereco}${caminho}`;
    if (corpoEmTexto === undefined) return fetch(url, { ...opcoes, method: metodo, ...(Object.keys(cabecalhos).length && { headers: cabecalhos }) });
    return fetch(url, { ...opcoes, method: metodo, headers: { 'Content-Type': 'application/json', ...cabecalhos }, body: corpoEmTexto });
  }

  function exigirConstrutor(pedido) {
    if (!montados.has(pedido)) {
      throw new Error('pedido que não saiu de PedidoAoAnki (saude, baralhos, estatisticas ou vocabulario): '
        + 'monte-o por um deles, para o contrato ter o exemplo dele');
    }
  }

  function pedir(endereco, pedido, opcoes = {}) {
    exigirConstrutor(pedido);
    if (pedido.semAssinatura) {
      return enviar(endereco, pedido, pedido.corpo === undefined ? undefined : JSON.stringify(pedido.corpo), opcoes);
    }
    return raiz.PareamentoComOAnki.pedirAssinado(endereco, pedido, opcoes, enviar);
  }

  function ausenciaDaRota(status) {
    return status === 404 ? 'antiga' : 'falhou';
  }

  raiz.PedidoAoAnki = Object.freeze({
    LEITURAS_DOS_NUMEROS,
    abrirComOComputador,
    abrirNoAnki,
    abrirOPerfilMarcado,
    apagarChaveDaOpenAI,
    apagarFrasesDosEnvios,
    atualizarAConexao,
    ausenciaDaRota,
    baralhos,
    chaveDaOpenAI,
    comecarOPareamento,
    concluirOPareamento,
    conferirOPareamento,
    criarEnvio,
    custosDosEnvios,
    definirOTeto,
    entrarComOChatGPT,
    escolherOModelo,
    escolherOPerfil,
    estadoDaIA,
    estadoDoChatGPT,
    estadoDoItemDeLogin,
    estadoDoModelo,
    estatisticas,
    falarAFrase,
    listarEnvios,
    ouvirAVoz,
    pacoteDeDiagnostico,
    pedir,
    perfisDoAnki,
    previaDaNota,
    previaDoCartao,
    reiniciarOAnki,
    sairDoChatGPT,
    saude,
    sincronizarChaveDaOpenAI,
    tentarEnvioDeNovo,
    tetoDoMes,
    tiposDeNota,
    trocarAFrente,
    usarAChaveNoEnvio,
    verEnvio,
    vincularLegadoDaOpenAI,
    vocabulario,
  });

  const ENDERECO = 'http://127.0.0.1:8766';
  const PRAZO_PADRAO_MS = 15000;
  const MOTIVO = Object.freeze({
    SEM_RESPOSTA: 'sem_resposta',
    ANTIGA: 'antiga',
    ANKI_OCUPADO: 'anki_ocupado',
    A_PAREAR: 'a_parear',
    RECUSADO: 'recusado',
    INVALIDA: 'invalida',
  });
  const RECUSAS_DO_PAREAMENTO = ['pairing_required', 'pairing_invalid', 'pairing_revoked'];

  function porHttpAssinado(endereco) {
    return async (pedido, sinal) => {
      const resposta = await pedir(endereco, pedido, { signal: sinal });
      return { status: resposta.status, texto: await resposta.text() };
    };
  }

  function objetoDoJson(texto) {
    try {
      const lido = JSON.parse(texto);
      return lido && typeof lido === 'object' && !Array.isArray(lido) ? lido : null;
    } catch {
      return null;
    }
  }

  const falha = (motivo, { codigo = null, status = null, dados = null, detalhes }) => ({ ok: false, motivo, codigo, status, dados, detalhes });

  function semResposta(erro) {
    const codigo = erro?.name === 'TimeoutError' ? 'prazo' : erro?.semProva ? 'sem_prova' : 'rede';
    return falha(MOTIVO.SEM_RESPOSTA, { codigo, detalhes: String(erro?.message || erro) });
  }

  function motivoDaRecusa(status, codigo, dados) {
    if (status === 401 && RECUSAS_DO_PAREAMENTO.includes(codigo)) return MOTIVO.A_PAREAR;
    if (status === 404 && (codigo === null || codigo === 'not_found')) return MOTIVO.ANTIGA;
    if (status === 503 && typeof dados?.detail === 'string') return MOTIVO.ANKI_OCUPADO;
    return MOTIVO.RECUSADO;
  }

  function desfechoDe({ status, texto }, formato) {
    const dados = objetoDoJson(texto);
    if (status >= 200 && status < 300) {
      const codigo = !dados ? 'json_quebrado' : formato && !formato(dados) ? 'fora_do_formato' : null;
      return codigo ? falha(MOTIVO.INVALIDA, { codigo, status, dados, detalhes: `HTTP ${status} · ${codigo}` }) : { ok: true, status, dados };
    }
    const codigo = typeof dados?.error === 'string' ? dados.error : null;
    return falha(motivoDaRecusa(status, codigo, dados), { codigo, status, dados, detalhes: [`HTTP ${status}`, codigo, dados?.detail].filter(Boolean).join(' · ') });
  }

  function criarConversa({ endereco, transporte = porHttpAssinado(endereco), sinalDoPrazo = ms => AbortSignal.timeout(ms) } = {}) {
    async function pedirODesfecho(pedido, { prazoMs = PRAZO_PADRAO_MS, formato = null } = {}) {
      exigirConstrutor(pedido);
      let recebida;
      try {
        recebida = await transporte(pedido, sinalDoPrazo(prazoMs));
      } catch (erro) {
        return semResposta(erro);
      }
      return desfechoDe(recebida, formato);
    }
    return Object.freeze({ pedir: pedirODesfecho });
  }

  raiz.ConversaComOAnki = Object.freeze({ ENDERECO, MOTIVO, PRAZO_PADRAO_MS, criar: criarConversa, pedir: criarConversa({ endereco: ENDERECO }).pedir });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
