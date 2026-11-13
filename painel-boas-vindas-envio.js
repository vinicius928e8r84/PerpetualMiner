'use strict';

// O passo do primeiro Envio da Boas-vindas (#173, ONB-23, o último): ao chegar nele o Envio começa sozinho, sem clique, com 1 Cartão (a Frase minerada
// mais recente ou, sem nenhuma, uma Frase de teste do idioma ligado na mineração automática). A tela mostra só “Enviando…” e depois “Cartão enviado ao Anki”,
// sem etapas, custo nem estimativa, e o Cartão como o Anki o mostra (a prévia de uma nota gravada, `painel-anki-previa.js`) com o Baralho, Abrir no Anki e
// Concluir. Na falha diz “Este cartão não foi”, o motivo e Tentar de novo / Trocar a chave. A configuração só termina quando o Cartão chega ao Anki
// (`Configuracao`, passo `envio`); as outras Frases esperam no Envio.
//
// O pedido do Envio é congelado em `pm_boas_vindas.primeiroEnvio.corpo` antes de ir: repetir o passo (ou recarregar a página, ou voltar a ele depois de trocar
// a chave) pede o mesmo Envio à Conexão, que não cria outro Cartão (o `guid` da nota é do Envio) nem outro Baralho. Só a imagem falhar não é falha: o Cartão
// vai sem ela e conta como enviado (a Conexão). `painel-boas-vindas.js` o põe na lista de passos. Carregado depois de painel-envio-estado.js.

(function (raiz) {
  const { textoDaVoz, Veio, AjustesDeEnvio, ConexaoAnki, PedidoAoAnki, Configuracao, ehRussa } = raiz;
  const ESPERA_DA_LEITURA_MS = 1000;
  const ETAPAS_DO_FIM = ['completed', 'partial', 'failed'];
  const CONTEXTO_DA_FRASE_DE_TESTE = '[Contexto: Teste - Boas-vindas - Primeiro cartão]';
  const FRASES_DE_TESTE = {
    en: `give up : She gave up smoking last year. ${CONTEXTO_DA_FRASE_DE_TESTE}`,
    ru: `приходила : Она приходила вчера. ${CONTEXTO_DA_FRASE_DE_TESTE}`,
  };
  // O motivo de uma falha: a frase (ONB-23) e se Trocar a chave pode resolver. O de um código da Conexão sai da tabela dos motivos, a mesma do painel.
  const { doCodigo } = raiz.SituacaoDoEnvio;
  const DA_CONEXAO = { fala: 'ONB-23.motivoConexao', chave: false };
  const OUTRO = doCodigo(null);

  const esperar = ms => new Promise(resolver => setTimeout(resolver, ms));

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  function botao(variante, id, aoClicar) {
    const no = elemento('button', `veio-botao veio-botao--${variante}`, textoDaVoz(id));
    no.type = 'button';
    no.addEventListener('click', aoClicar);
    return no;
  }

  /** Pede à Conexão; nunca levanta: `{ semResposta: true }` quando ela não responde, senão `{ ok, status, json }`. */
  async function chamar(pedido) {
    try {
      const resposta = await PedidoAoAnki.pedir(ConexaoAnki.ENDERECO, pedido);
      return { ok: resposta.ok, status: resposta.status, json: await resposta.json().catch(() => ({})) };
    } catch {
      return { semResposta: true };
    }
  }

  /** O motivo do Envio que não chegou: o erro do Cartão, ou o do Envio (código da Conexão, nunca o texto da OpenAI). */
  function motivoDoEnvio(estado) {
    const doCartao = Object.values(estado.cards || {}).find(cartao => cartao.status === 'failed' && cartao.error)?.error;
    return doCodigo(doCartao || estado.lastError);
  }

  /**
   * O corpo do passo. `linhaDaFrase` é a linha de uma Frase para o Anki (a de Frases); `aoTrocarAChave` leva ao passo da IA e `aoConcluir` ao Tudo pronto.
   * Devolve `{ no, desenhar(retrato, aVista) }`: `desenhar` recebe o retrato de `Configuracao` e se o passo está na tela (ao entrar nele, o Envio começa).
   */
  function montar({ linhaDaFrase, aoTrocarAChave, aoConcluir }) {
    const lugar = elemento('div', 'bv-envio');
    lugar.setAttribute('aria-live', 'polite');
    const no = elemento('div', null, elemento('p', 'bv-texto', textoDaVoz('ONB-23.corpo')), lugar);
    const previas = new Map();   // lang → a prévia do Cartão (o quadro não é refeito à toa)
    let retrato = null;
    let vez = 0;                 // cada começo ou saída do passo troca a vez; o que sobra de uma vez antiga se descarta

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

    /** O Cartão que chegou ao Anki: o aviso, o Baralho, o Cartão como o Anki o mostra e as ações. Sem `guid` (o Anki já tinha o Cartão), o exemplo do estilo e sem Abrir no Anki. */
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
      // Quem já minerou, mas sem Palavra marcada, não "ainda não minerou": o aviso diz o que falta.
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
      const resposta = await chamar(PedidoAoAnki.abrirNoAnki(guid));
      erro.replaceChildren(...(resposta.ok ? [] : [Veio.iconeVeio('alerta'), textoDaVoz('ONB-23.naoAbriu')]));
      erro.hidden = Boolean(resposta.ok);
    }

    /** O pedido do Envio, congelado: a Frase minerada mais recente ou a Frase de teste do idioma ligado. */
    async function montarCorpo() {
      const { frases = [] } = await chrome.storage.local.get({ frases: [] });
      // Só uma Frase que vira Cartão serve: no inglês a linha precisa da Palavra (`palavra : frase`), no russo qualquer uma.
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

    /** O Envio de um Cartão até o fim. Um Envio que já terminou sem chegar (a chave trocada, o Anki aberto) volta à fila: a Conexão refaz só o que falta, sem pagar de novo o que está pronto. */
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
      const criado = await chamar(PedidoAoAnki.criarEnvio(corpo));
      if (minha !== vez) return undefined;
      if (!criado.ok) return mostrarFalha(criado.semResposta || criado.status >= 500 ? DA_CONEXAO : OUTRO);
      if (['failed', 'partial'].includes(criado.json.status)) {
        const outra = await chamar(PedidoAoAnki.tentarEnvioDeNovo(corpo.jobId));
        if (minha !== vez) return undefined;
        if (!outra.ok) return mostrarFalha(DA_CONEXAO);
      }

      for (;;) {
        const lido = await chamar(PedidoAoAnki.verEnvio(corpo.jobId));
        if (minha !== vez) return undefined;
        if (!lido.ok) return mostrarFalha(DA_CONEXAO);
        const { state: estado } = lido.json;
        if (estado.status === 'completed') {
          const guid = Object.values(estado.cards || {}).find(cartao => cartao.guid)?.guid || null;
          await Configuracao.guardarPrimeiroEnvio(() => ({ chegou: true, guid }));
          return minha === vez ? mostrarPronto({ corpo, guid }) : undefined;
        }
        if (ETAPAS_DO_FIM.includes(estado.status)) {
          // Uma linha sem Cartão nenhum (`cards_failed` sem erro de Cartão) falharia igual: o pedido congelado sai, e Tentar de novo monta outro.
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
        // Sair do passo para a leitura; voltar a ele pede o mesmo Envio de novo, que não cria nada.
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
