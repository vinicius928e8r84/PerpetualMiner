'use strict';

(function (raiz) {
  const { textoDaVoz, Veio, AjustesDeEnvio, ConversaComOAnki, PedidoAoAnki, Configuracao, EnvioAcompanhado, ehRussa } = raiz;
  const { elemento } = Veio;
  const ESPERA_DA_LEITURA_MS = 1000;
  const CONTEXTO_DA_FRASE_DE_TESTE = '[Contexto: Teste - Boas-vindas - Primeiro cartão]';
  const FRASES_DE_TESTE = {
    en: `give up : She gave up smoking last year. ${CONTEXTO_DA_FRASE_DE_TESTE}`,
    ru: `приходила : Она приходила вчера. ${CONTEXTO_DA_FRASE_DE_TESTE}`,
  };
  const { ESTADO, doCodigo, terminou } = raiz.SituacaoDoEnvio;
  const DA_CONEXAO = { fala: 'ONB-23.motivoConexao', chave: false };
  const OUTRO = doCodigo(null);

  function botao(variante, id, aoClicar) {
    const no = elemento('button', `veio-botao veio-botao--${variante}`, textoDaVoz(id));
    no.type = 'button';
    no.addEventListener('click', aoClicar);
    return no;
  }

  function motivoDoEnvio(estado) {
    const doCartao = Object.values(estado.cards || {}).find(cartao => cartao.status === 'failed' && cartao.error)?.error;
    return doCodigo(doCartao || estado.lastError);
  }

  const cartoesDe = lido => Object.values(lido.cards || {});
  const guidDoCartao = lido => cartoesDe(lido).find(cartao => cartao.guid)?.guid || null;
  const falhouSemMotivoNoCartao = lido => lido.lastError === 'cards_failed' && !cartoesDe(lido).some(cartao => cartao.error);
  const foiDaConexao = desfecho => desfecho.semResposta || desfecho.status >= 500;

  const temPalavra = frase => ehRussa(frase) || (frase.keywords || []).some(palavra => palavra !== '|');
  const viraCartao = frase => frase?.texto && temPalavra(frase);
  const ehMaisNova = (frase, mais) => !mais || Number(frase.id) > Number(mais.id);
  const maisNova = (mais, frase) => (ehMaisNova(frase, mais) ? frase : mais);
  const fraseMinerada = frases => frases.filter(viraCartao).reduce(maisNova, null);

  function idiomaDoEnvio(minerada, automatica) {
    if (minerada) return ehRussa(minerada) ? 'ru' : 'en';
    return !automatica.en && automatica.ru ? 'ru' : 'en';
  }

  function entradaDoEnvio(minerada, lang, linhaDaFrase) {
    if (minerada) return { phraseId: Number(minerada.id), line: linhaDaFrase(minerada) };
    return { phraseId: Date.now(), line: FRASES_DE_TESTE[lang] };
  }

  async function montarCorpo(retrato, linhaDaFrase) {
    const { frases = [] } = await chrome.storage.local.get({ frases: [] });
    const minerada = fraseMinerada(frases);
    const lang = idiomaDoEnvio(minerada, retrato.estado.automatica);
    const ajustes = (await AjustesDeEnvio.ler())[lang];
    return {
      jobId: crypto.randomUUID(),
      lang,
      deckName: ajustes.deckName,
      imageSource: ajustes.imageSource,
      ...AjustesDeEnvio.vozENivel(ajustes),
      ...(!minerada && { teste: true }),
      entries: [entradaDoEnvio(minerada, lang, linhaDaFrase)],
    };
  }

  function noDaFalha({ fala, chave }, { aoTentar, aoTrocarAChave }) {
    const botoes = [botao('primario', 'ONB-23.tentarDeNovo', aoTentar)];
    if (chave) botoes.push(botao('secundario', 'ONB-23.trocarAChave', aoTrocarAChave));
    const titulo = elemento('h3', 'bv-envio__titulo', Veio.iconeVeio('alerta'), textoDaVoz('ONB-23.falhou'));
    const falha = elemento('div', 'bv-envio__falha', titulo, elemento('p', 'bv-texto', textoDaVoz(fala)), elemento('div', 'bv-envio__acoes', ...botoes));
    falha.setAttribute('role', 'alert');
    return falha;
  }

  async function abrirNoAnki(guid, erro) {
    const resposta = await ConversaComOAnki.pedir(PedidoAoAnki.abrirNoAnki(guid));
    erro.replaceChildren(...(resposta.ok ? [] : [Veio.iconeVeio('alerta'), textoDaVoz('ONB-23.naoAbriu')]));
    erro.hidden = Boolean(resposta.ok);
  }

  function noDoErroAoAbrir() {
    const erro = elemento('p', 'bv-falha');
    erro.setAttribute('role', 'alert');
    erro.hidden = true;
    return erro;
  }

  function acoesDoPronto({ guid, erroAoAbrir, aoConcluir }) {
    const acoes = elemento('div', 'bv-envio__acoes');
    if (guid) acoes.append(botao('secundario', 'ONB-23.abrirNoAnki', () => abrirNoAnki(guid, erroAoAbrir)));
    acoes.append(botao('primario', 'ONB-23.concluir', aoConcluir));
    return acoes;
  }

  function partesDoPronto({ corpo, guid, aoConcluir }) {
    const chip = elemento('span', 'veio-selo bv-envio__baralho', AjustesDeEnvio.nomeDoBaralho(corpo.deckName));
    const erroAoAbrir = noDoErroAoAbrir();
    const acoes = acoesDoPronto({ guid, erroAoAbrir, aoConcluir });
    const ok = elemento('p', 'bv-envio__ok', Veio.iconeVeio('certo'), textoDaVoz('ONB-23.enviado'), chip);
    return { chip, erroAoAbrir, acoes, ok };
  }

  async function notaDoTeste() {
    const { frases = [] } = await chrome.storage.local.get({ frases: [] });
    const jaMinerou = frases.some(frase => frase?.texto);
    return [elemento('p', 'bv-nota', textoDaVoz(jaMinerou ? 'ONB-23.testeSemPalavra' : 'ONB-23.teste'))];
  }

  async function nivelDoEnvio(lang) {
    return (await AjustesDeEnvio.ler().catch(() => null))?.[lang]?.nivel || 'iniciante';
  }

  async function preencherAPrevia(vale, { previa, chip, guid, lang }) {
    const nivel = await nivelDoEnvio(lang);
    if (!vale()) return;
    const mostrada = await (guid ? previa.mostrarNota(guid) : previa.mostrar(nivel));
    const deck = mostrada?.previa?.deck;
    if (vale() && deck) chip.textContent = AjustesDeEnvio.nomeDoBaralho(deck);
  }

  function montar({ linhaDaFrase, aoTrocarAChave, aoConcluir }) {
    const lugar = elemento('div', 'bv-envio');
    lugar.setAttribute('aria-live', 'polite');
    const no = elemento('div', null, elemento('p', 'bv-texto', textoDaVoz('ONB-23.corpo')), lugar);
    const previas = new Map();
    const andamento = { retrato: null, vez: 0, acompanhado: null, comecou: false };
    const seForAVez = (minha, fazer) => (minha === andamento.vez ? fazer() : undefined);

    function largarOEnvio() {
      andamento.acompanhado?.largar();
      andamento.acompanhado = null;
    }

    function mostrar(estado, ...filhos) {
      lugar.replaceChildren(...filhos);
      lugar.dataset.estado = estado;
    }

    const mostrarEnviando = () => mostrar('enviando', elemento('p', 'bv-envio__enviando', textoDaVoz('ONB-23.enviando')));
    const mostrarFalha = motivo => mostrar('falhou', noDaFalha(motivo, { aoTentar: executar, aoTrocarAChave }));

    function previaDe(lang) {
      if (!previas.has(lang)) previas.set(lang, raiz.PreviaDoCartao.montar({ prefixo: 'bv-envio', lang }));
      return previas.get(lang);
    }

    async function mostrarPronto({ corpo, guid }) {
      const minha = andamento.vez;
      const { lang } = corpo;
      const previa = previaDe(lang);
      const partes = partesDoPronto({ corpo, guid, aoConcluir });
      const nota = corpo.teste ? await notaDoTeste() : [];
      mostrar('enviado', partes.ok, ...nota, previa.no, partes.erroAoAbrir, partes.acoes);
      await preencherAPrevia(() => minha === andamento.vez, { previa, chip: partes.chip, guid, lang });
    }

    async function concluir(minha, corpo, lido) {
      const guid = guidDoCartao(lido);
      await Configuracao.guardarPrimeiroEnvio(() => ({ chegou: true, guid }));
      return seForAVez(minha, () => mostrarPronto({ corpo, guid }));
    }

    async function terminar(minha, corpo, situacao, lido) {
      if (situacao.estado === ESTADO.CONCLUIDO) return concluir(minha, corpo, lido);
      if (situacao.estado === ESTADO.DESCONHECIDO) return mostrarFalha(DA_CONEXAO);
      if (falhouSemMotivoNoCartao(lido)) await Configuracao.guardarPrimeiroEnvio(() => ({ corpo: null }));
      return seForAVez(minha, () => mostrarFalha(motivoDoEnvio(lido)));
    }

    async function corpoNovo() {
      try {
        const corpo = await montarCorpo(andamento.retrato, linhaDaFrase);
        await Configuracao.guardarPrimeiroEnvio(() => ({ corpo }));
        return corpo;
      } catch {
        return null;
      }
    }

    function aoNaoLer(minha) {
      if (minha !== andamento.vez) return;
      largarOEnvio();
      mostrarFalha(DA_CONEXAO);
    }

    async function aoFalharAoCriar(minha, desfecho) {
      if (!desfecho.apagado) return mostrarFalha(foiDaConexao(desfecho) ? DA_CONEXAO : OUTRO);
      await Configuracao.guardarPrimeiroEnvio(() => ({ corpo: null }));
      return seForAVez(minha, () => mostrarFalha(OUTRO));
    }

    async function acompanhar(minha, corpo) {
      const envio = EnvioAcompanhado.acompanhar(corpo, { intervaloMs: ESPERA_DA_LEITURA_MS });
      andamento.acompanhado = envio;
      envio.aoNaoLer(() => aoNaoLer(minha));
      envio.aoMudar((situacao, lido) => seForAVez(minha, () => (terminou(situacao) ? terminar(minha, corpo, situacao, lido) : undefined)));
      const desfecho = await envio.criar();
      if (minha !== andamento.vez || desfecho.ok) return undefined;
      return aoFalharAoCriar(minha, desfecho);
    }

    async function executar() {
      const minha = ++andamento.vez;
      largarOEnvio();
      mostrarEnviando();
      const primeiro = andamento.retrato.estado.progresso?.primeiroEnvio;
      if (primeiro?.chegou) return mostrarPronto(primeiro);
      const corpo = primeiro?.corpo || await corpoNovo();
      if (!corpo) return seForAVez(minha, () => mostrarFalha(OUTRO));
      return acompanhar(minha, corpo);
    }

    function sairDeVista() {
      if (!andamento.comecou) return;
      andamento.vez += 1;
      largarOEnvio();
      andamento.comecou = false;
    }

    function desenhar(novoRetrato, aVista) {
      andamento.retrato = novoRetrato;
      if (!aVista) return sairDeVista();
      if (andamento.comecou || !novoRetrato) return undefined;
      andamento.comecou = true;
      return executar();
    }

    return { no, desenhar };
  }

  raiz.PassoDoPrimeiroEnvio = Object.freeze({ montar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
