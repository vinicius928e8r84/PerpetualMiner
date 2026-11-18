'use strict';

(function (raiz) {
  const { textoDaVoz, Veio, AjustesDeEnvio, ConversaComOAnki, PedidoAoAnki, Configuracao, ehRussa } = raiz;
  const { elemento } = Veio;
  const ESPERA_DA_LEITURA_MS = 1000;
  const ETAPAS_DO_FIM = ['completed', 'partial', 'failed'];
  const CONTEXTO_DA_FRASE_DE_TESTE = '[Contexto: Teste - Boas-vindas - Primeiro cartão]';
  const FRASES_DE_TESTE = {
    en: `give up : She gave up smoking last year. ${CONTEXTO_DA_FRASE_DE_TESTE}`,
    ru: `приходила : Она приходила вчера. ${CONTEXTO_DA_FRASE_DE_TESTE}`,
  };
  const { doCodigo } = raiz.SituacaoDoEnvio;
  const DA_CONEXAO = { fala: 'ONB-23.motivoConexao', chave: false };
  const OUTRO = doCodigo(null);

  const esperar = ms => new Promise(resolver => setTimeout(resolver, ms));

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

  function montar({ linhaDaFrase, aoTrocarAChave, aoConcluir }) {
    const lugar = elemento('div', 'bv-envio');
    lugar.setAttribute('aria-live', 'polite');
    const no = elemento('div', null, elemento('p', 'bv-texto', textoDaVoz('ONB-23.corpo')), lugar);
    const previas = new Map();
    let retrato = null;
    let vez = 0;

    function mostrarEnviando() {
      lugar.replaceChildren(elemento('p', 'bv-envio__enviando', textoDaVoz('ONB-23.enviando')));
      lugar.dataset.estado = 'enviando';
    }

    function mostrarFalha({ fala, chave }) {
      const botoes = [botao('primario', 'ONB-23.tentarDeNovo', executar)];
      if (chave) botoes.push(botao('secundario', 'ONB-23.trocarAChave', aoTrocarAChave));
      const titulo = elemento('h3', 'bv-envio__titulo', Veio.iconeVeio('alerta'), textoDaVoz('ONB-23.falhou'));
      const falha = elemento('div', 'bv-envio__falha', titulo, elemento('p', 'bv-texto', textoDaVoz(fala)), elemento('div', 'bv-envio__acoes', ...botoes));
      falha.setAttribute('role', 'alert');
      lugar.replaceChildren(falha);
      lugar.dataset.estado = 'falhou';
    }

    async function mostrarPronto({ corpo, guid }) {
      const minha = vez;
      const lang = corpo.lang;
      if (!previas.has(lang)) previas.set(lang, raiz.PreviaDoCartao.montar({ prefixo: 'bv-envio', lang }));
      const previa = previas.get(lang);
      const chip = elemento('span', 'veio-selo bv-envio__baralho', AjustesDeEnvio.nomeDoBaralho(corpo.deckName));
      const erroAoAbrir = elemento('p', 'bv-falha');
      erroAoAbrir.setAttribute('role', 'alert');
      erroAoAbrir.hidden = true;
      const acoes = elemento('div', 'bv-envio__acoes');
      if (guid) acoes.append(botao('secundario', 'ONB-23.abrirNoAnki', () => abrirNoAnki(guid, erroAoAbrir)));
      acoes.append(botao('primario', 'ONB-23.concluir', aoConcluir));
      const ok = elemento('p', 'bv-envio__ok', Veio.iconeVeio('certo'), textoDaVoz('ONB-23.enviado'), chip);
      const { frases = [] } = corpo.teste ? await chrome.storage.local.get({ frases: [] }) : {};
      const jaMinerou = frases.some(frase => frase?.texto);
      lugar.replaceChildren(ok, ...(corpo.teste ? [elemento('p', 'bv-nota', textoDaVoz(jaMinerou ? 'ONB-23.testeSemPalavra' : 'ONB-23.teste'))] : []), previa.no, erroAoAbrir, acoes);
      lugar.dataset.estado = 'enviado';
      const nivel = (await AjustesDeEnvio.ler().catch(() => null))?.[lang]?.nivel || 'iniciante';
      if (minha !== vez) return;
      const mostrada = await (guid ? previa.mostrarNota(guid) : previa.mostrar(nivel));
      if (minha === vez && mostrada?.previa?.deck) chip.textContent = AjustesDeEnvio.nomeDoBaralho(mostrada.previa.deck);
    }

    async function abrirNoAnki(guid, erro) {
      const resposta = await ConversaComOAnki.pedir(PedidoAoAnki.abrirNoAnki(guid));
      erro.replaceChildren(...(resposta.ok ? [] : [Veio.iconeVeio('alerta'), textoDaVoz('ONB-23.naoAbriu')]));
      erro.hidden = Boolean(resposta.ok);
    }

    async function montarCorpo() {
      const { frases = [] } = await chrome.storage.local.get({ frases: [] });
      const viraCartao = frase => frase?.texto && (ehRussa(frase) || (frase.keywords || []).some(palavra => palavra !== '|'));
      const minerada = frases.filter(viraCartao).reduce((mais, frase) => (!mais || Number(frase.id) > Number(mais.id) ? frase : mais), null);
      const automatica = retrato.estado.automatica;
      const lang = minerada ? (ehRussa(minerada) ? 'ru' : 'en') : (!automatica.en && automatica.ru ? 'ru' : 'en');
      const ajustes = (await AjustesDeEnvio.ler())[lang];
      return {
        jobId: crypto.randomUUID(),
        lang,
        deckName: ajustes.deckName,
        imageSource: ajustes.imageSource,
        ...AjustesDeEnvio.vozENivel(ajustes),
        ...(!minerada && { teste: true }),
        entries: [minerada
          ? { phraseId: Number(minerada.id), line: linhaDaFrase(minerada) }
          : { phraseId: Date.now(), line: FRASES_DE_TESTE[lang] }],
      };
    }

    async function executar() {
      const minha = ++vez;
      mostrarEnviando();
      let primeiro = retrato.estado.progresso?.primeiroEnvio;
      if (primeiro?.chegou) return mostrarPronto(primeiro);
      try {
        if (!primeiro?.corpo) {
          const corpo = await montarCorpo();
          await Configuracao.guardarPrimeiroEnvio(() => ({ corpo }));
          primeiro = { corpo };
        }
      } catch {
        return minha === vez ? mostrarFalha(OUTRO) : undefined;
      }
      const { corpo } = primeiro;
      const criado = await ConversaComOAnki.pedir(PedidoAoAnki.criarEnvio(corpo));
      if (minha !== vez) return undefined;
      if (!criado.ok) return mostrarFalha(criado.motivo === ConversaComOAnki.MOTIVO.SEM_RESPOSTA || criado.status >= 500 ? DA_CONEXAO : OUTRO);
      if (['failed', 'partial'].includes(criado.dados.status)) {
        const outra = await ConversaComOAnki.pedir(PedidoAoAnki.tentarEnvioDeNovo(corpo.jobId));
        if (minha !== vez) return undefined;
        if (outra.status === 409) {
          await Configuracao.guardarPrimeiroEnvio(() => ({ corpo: null }));
          return minha === vez ? mostrarFalha(OUTRO) : undefined;
        }
        if (!outra.ok) return mostrarFalha(DA_CONEXAO);
      }

      for (;;) {
        const lido = await ConversaComOAnki.pedir(PedidoAoAnki.verEnvio(corpo.jobId), { formato: dados => Boolean(dados.state) });
        if (minha !== vez) return undefined;
        if (!lido.ok) return mostrarFalha(DA_CONEXAO);
        const { state: estado } = lido.dados;
        if (estado.status === 'completed') {
          const guid = Object.values(estado.cards || {}).find(cartao => cartao.guid)?.guid || null;
          await Configuracao.guardarPrimeiroEnvio(() => ({ chegou: true, guid }));
          return minha === vez ? mostrarPronto({ corpo, guid }) : undefined;
        }
        if (ETAPAS_DO_FIM.includes(estado.status)) {
          if (estado.lastError === 'cards_failed' && !Object.values(estado.cards || {}).some(cartao => cartao.error)) await Configuracao.guardarPrimeiroEnvio(() => ({ corpo: null }));
          return mostrarFalha(motivoDoEnvio(estado));
        }
        await esperar(ESPERA_DA_LEITURA_MS);
        if (minha !== vez) return undefined;
      }
    }

    let comecou = false;
    function desenhar(novoRetrato, aVista) {
      retrato = novoRetrato;
      if (!aVista) {
        if (comecou) { vez += 1; comecou = false; }
        return;
      }
      if (comecou || !retrato) return;
      comecou = true;
      executar();
    }

    return { no, desenhar };
  }

  raiz.PassoDoPrimeiroEnvio = Object.freeze({ montar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
