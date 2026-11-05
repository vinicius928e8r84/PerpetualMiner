'use strict';

// Como a extensão pede à Conexão com o Anki. Cada pedido nasce de um construtor daqui (`saude`,
// `baralhos`, `estatisticas`, `vocabulario`, `estadoDoItemDeLogin`, `abrirComOComputador`, os do perfil fixo, os da chave da IA, os do ChatGPT, os do modelo dos cartões, `trocarAFrente` e os do Envio:
// `criarEnvio`, `ouvirAVoz`, `previaDoCartao`, `listarEnvios`, `verEnvio`, `tentarEnvioDeNovo`, `usarAChaveNoEnvio`, `pacoteDeDiagnostico`, `apagarFrasesDosEnvios`, `custosDosEnvios`, `tetoDoMes`, `definirOTeto`) e `pedir` só envia o que um deles montou: o conjunto de
// pedidos que a extensão faz é este arquivo, e `PedidoAoAnki.variantes` o lista inteiro. O contrato
// (complemento/contrato/exemplos.json) tem de ter um exemplo de cada um, o que
// `node test_contrato_fechado.js` confere; um pedido montado à mão ou um `fetch` direto não passa disso
// (regra `contrato-fechado`, scripts/regras/). O que lê o Anki da pessoa (os Baralhos, os números e o
// vocabulário) é POST com corpo JSON: o GET de uma página da extensão vai sem `Origin` e a Conexão só
// atende a extensão (complemento/contrato/LEIA-ME.md). Quem pede trata a resposta.
//
// Carregado pelo service worker e pelas páginas que falam com a Conexão, antes de quem pede.

(function (raiz) {
  const LIMITE_DO_VOCABULARIO = 10000;

  // Os pedidos que `pedir` aceita: só os que um construtor montou.
  const montados = new WeakSet();
  const montar = pedido => {
    const pronto = Object.freeze(pedido);
    montados.add(pronto);
    return pronto;
  };

  /** `GET /health`: a Conexão está ligada? */
  const saude = () => montar({ metodo: 'GET', caminho: '/health' });

  /** `POST /anki/decks`: os nomes dos Baralhos que o Anki tem. */
  const baralhos = () => montar({ metodo: 'POST', caminho: '/anki/decks', corpo: {} });

  // As leituras dos números que a tela de Baralhos e termos faz: a primeira, a de novo (depois de um
  // reparo ou de salvar outro Baralho, passando por cima do cache) e a de novo abrindo o Anki
  // (Atualizar e Tentar de novo). Outra combinação não é um pedido que a extensão faça.
  const LEITURAS_DOS_NUMEROS = Object.freeze([
    Object.freeze({ deNovo: false, abrirOAnki: false }),
    Object.freeze({ deNovo: true, abrirOAnki: false }),
    Object.freeze({ deNovo: true, abrirOAnki: true }),
  ]);

  /** `POST /anki/stats/decks` com os `baralhos` (`[{ deckName, lang }]`) numa leitura só, de uma das LEITURAS_DOS_NUMEROS. */
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

  /** `POST /anki/vocabulary`: o vocabulário inteiro do Baralho `deck` do idioma `lang`; os filtros são da tela. */
  const vocabulario = (deck, lang) => montar({
    metodo: 'POST', caminho: '/anki/vocabulary', corpo: { deck, lang, limit: LIMITE_DO_VOCABULARIO },
  });

  /**
   * `POST /anki/card-preview` (#164): o Cartão de exemplo do estilo (`lang` e `nivel`) como o Anki o desenha: `{ front, back, css, … }`, o HTML do Cartão
   * (o áudio é um botão, a imagem vem dentro do HTML) para um quadro isolado. A prévia de uma nota gravada, pelo `guid`, ainda não é pedido da extensão (#173).
   */
  function previaDoCartao(lang, nivel) {
    if (typeof lang !== 'string' || typeof nivel !== 'string') throw new Error('previaDoCartao pede o idioma e o nível');
    return montar({ metodo: 'POST', caminho: '/anki/card-preview', corpo: { lang, nivel } });
  }

  /** `POST /abrir-com-o-computador/estado`: o item de login que a Conexão guarda está escrito? */
  const estadoDoItemDeLogin = () => montar({ metodo: 'POST', caminho: '/abrir-com-o-computador/estado', corpo: {} });

  /** `POST /abrir-com-o-computador`: escreve (`ligado` true) ou apaga (false) o item de login. */
  function abrirComOComputador(ligado) {
    if (typeof ligado !== 'boolean') throw new Error(`abrirComOComputador pede true ou false, não ${JSON.stringify(ligado)}`);
    return montar({ metodo: 'POST', caminho: '/abrir-com-o-computador', corpo: { ligado } });
  }

  // O perfil fixo do Anki (#149): os Cartões só entram no perfil marcado na primeira conexão.

  /** `POST /anki/profiles`: os perfis que o Anki tem (também na tela de perfis), o marcado e o aberto. */
  const perfisDoAnki = () => montar({ metodo: 'POST', caminho: '/anki/profiles', corpo: {} });

  /** `POST /anki/profile`: marca outro perfil (“Perfil do Anki ▾”); os Cartões passam a entrar nele. */
  function escolherOPerfil(perfil) {
    if (typeof perfil !== 'string' || !perfil) throw new Error('escolherOPerfil pede o nome do perfil');
    return montar({ metodo: 'POST', caminho: '/anki/profile', corpo: { profile: perfil } });
  }

  /** `POST /anki/profile/open`: “Abrir <perfil>”: a Conexão fecha o perfil aberto pelo caminho do Anki (que sincroniza) e abre o marcado. */
  const abrirOPerfilMarcado = () => montar({ metodo: 'POST', caminho: '/anki/profile/open', corpo: {} });

  /** `POST /ia/openai/chave`: só a Conexão avança a revisão; `versao` é a observada pelo cliente. */
  function chaveDaOpenAI(chave, versao = 0, conta = '') {
    if (typeof chave !== 'string') throw new Error('chaveDaOpenAI pede a chave como texto');
    return montar({ metodo: 'POST', caminho: '/ia/openai/chave', corpo: { chave, versao, conta } });
  }

  /** `POST /ia/openai/chave/apagar`: substitui o valor da revisão observada por uma chave vazia. */
  const apagarChaveDaOpenAI = (versao = 0, conta = '') => montar({ metodo: 'POST', caminho: '/ia/openai/chave/apagar', corpo: { versao, conta } });

  /** `POST /ia/openai/sincronizar`: o dono leva a chave à conta; credencial transitória, nunca no cache. */
  const sincronizarChaveDaOpenAI = (uid, token, versao = 0) => montar({
    metodo: 'POST', caminho: '/ia/openai/sincronizar', corpo: { uid, token, versao },
  });

  /** Só migração: prova o valor já guardado antes de transferir seu UID/hora. Não troca a chave. */
  const vincularLegadoDaOpenAI = (chave, conta, em, versao = 0) => montar({
    metodo: 'POST', caminho: '/ia/openai/legado', corpo: { chave, conta, em, versao },
  });

  /** `POST /ia/estado`: o que a Conexão guarda da IA (a chave só pelos 4 últimos caracteres). */
  const estadoDaIA = () => montar({ metodo: 'POST', caminho: '/ia/estado', corpo: {} });

  // Entrar com o ChatGPT (#155): o login e os tokens são da Conexão; a extensão só pede, abre a URL e lê o estado.
  /** `POST /ia/chatgpt/estado`: `{ conectada, entrando, falha }`, nenhum token. */
  const estadoDoChatGPT = () => montar({ metodo: 'POST', caminho: '/ia/chatgpt/estado', corpo: {} });
  /** `POST /ia/chatgpt/entrar`: uma tentativa nova de login e a URL de autorização que a extensão abre numa aba. */
  const entrarComOChatGPT = () => montar({ metodo: 'POST', caminho: '/ia/chatgpt/entrar', corpo: {} });
  /** `POST /ia/chatgpt/sair`: revoga a sessão e apaga o login da Conexão (`{ ok, revogada }`). */
  const sairDoChatGPT = () => montar({ metodo: 'POST', caminho: '/ia/chatgpt/sair', corpo: {} });

  // O modelo dos cartões (#157): a escolha, a lista da conta e a troca antes da saída são da Conexão; a extensão só lê e escolhe.
  /** `POST /ia/modelo/estado`: `{ paga, escolha, modelos, aviso, trocou }` (`paga`: `plano`, `chave` ou null). */
  const estadoDoModelo = () => montar({ metodo: 'POST', caminho: '/ia/modelo/estado', corpo: {} });
  /** `POST /ia/modelo/escolher`: `modelo` é `automatico` (também o Trocar agora) ou um da lista da conta. */
  const escolherOModelo = modelo => montar({ metodo: 'POST', caminho: '/ia/modelo/escolher', corpo: { modelo } });

  // A frente do Cartão (#166): quem troca o modelo do tipo de nota é a Conexão; a extensão só diz o idioma e a frente.
  /** `POST /anki/card-front`: os Cartões do idioma passam a ter a frente (`frase_com_audio`, `ouvir_primeiro`, `lacuna` ou `criacao`) na hora, sem nota nova e sem custo. */
  function trocarAFrente(lang, frente) {
    if (typeof lang !== 'string' || typeof frente !== 'string') throw new Error('trocarAFrente pede o idioma e a frente como texto');
    return montar({ metodo: 'POST', caminho: '/anki/card-front', corpo: { lang, frente } });
  }

  // O Envio (#142): a fila é da Conexão; o painel cria, acompanha e pede para tentar de novo. Tudo POST com a origem
  // da extensão, porque leva as Frases e os custos da pessoa (complemento/contrato/LEIA-ME.md).

  /**
   * `POST /jobs`: entrega as Frases de um Envio. `envio` é o corpo congelado (`jobId`, `lang`, `deckName`, `imageSource`,
   * `tts`, `entries`, e o `nivel` do estilo do Cartão quando não é o Iniciante): o mesmo corpo de novo é o mesmo Envio na Conexão (o `jobId` é a chave), nunca outro.
   */
  function criarEnvio(envio) {
    const { jobId, lang, deckName, imageSource, tts, nivel, entries } = envio;
    if (typeof jobId !== 'string' || !jobId) throw new Error('criarEnvio pede o jobId do Envio');
    return montar({ metodo: 'POST', caminho: '/jobs', corpo: { jobId, lang, deckName, imageSource, tts, ...(nivel && { nivel }), entries } });
  }

  /**
   * `POST /voz/ouvir`: o Ouvir dos Ajustes de envio (#174). A Conexão fala uma frase de amostra com o `provedor` (`google`, com o
   * `sotaque`, ou `openai`, pela chave) e responde `{ audio }`, um MP3 em base64.
   */
  function ouvirAVoz(lang, provedor, sotaque) {
    if (!['google', 'openai'].includes(provedor)) throw new Error(`ouvirAVoz pede google ou openai, não ${JSON.stringify(provedor)}`);
    return montar({ metodo: 'POST', caminho: '/voz/ouvir', corpo: { lang, provedor, ...(provedor === 'google' && { sotaque }) } });
  }

  /** `POST /jobs/list`: cada Envio que a Conexão tem, com o estado dele e o de cada Cartão. */
  const listarEnvios = () => montar({ metodo: 'POST', caminho: '/jobs/list', corpo: {} });

  const doEnvio = caminho => jobId => montar({ metodo: 'POST', caminho, corpo: { jobId } });
  /** `POST /jobs/get`: o pedido e o estado de um Envio. */
  const verEnvio = doEnvio('/jobs/get');
  /** `POST /jobs/retry`: Continuar envio / Tentar de novo; a Conexão refaz só o que falta. */
  const tentarEnvioDeNovo = doEnvio('/jobs/retry');
  /** `POST /jobs/usar-a-chave`: no limite do plano do ChatGPT (#158), o que falta do Envio vai pela chave da OpenAI. */
  const usarAChaveNoEnvio = doEnvio('/jobs/usar-a-chave');
  /** `POST /jobs/debug-bundle`: o pacote de diagnóstico de um Envio (sem a chave). */
  const pacoteDeDiagnostico = doEnvio('/jobs/debug-bundle');

  /** `POST /jobs/apagar-frases`: o Apagar tudo (CFG-17) tira também as Frases que a Conexão guarda (as linhas dos pedidos e os textos gerados). */
  const apagarFrasesDosEnvios = () => montar({ metodo: 'POST', caminho: '/jobs/apagar-frases', corpo: {} });

  /** `POST /analytics/jobs`: os custos dos Envios do período (`de`/`ate` em AAAA-MM-DD; sem eles, todo o período). */
  function custosDosEnvios({ de = '', ate = '' } = {}) {
    const corpo = { lang: 'all' };
    if (de) corpo.from = de;
    if (ate) corpo.to = ate;
    return montar({ metodo: 'POST', caminho: '/analytics/jobs', corpo });
  }

  // O teto do mês (#160): o valor e o gasto são da Conexão deste computador; a extensão lê e sobe ou baixa o teto.
  /** `POST /custos/teto`: `{ limitUsd, spentUsd, month }` (o gasto da chave no mês). */
  const tetoDoMes = () => montar({ metodo: 'POST', caminho: '/custos/teto', corpo: {} });
  /** `POST /custos/teto/definir`: o teto novo em dólares (positivo); a Conexão responde como `tetoDoMes`. */
  function definirOTeto(limitUsd) {
    if (typeof limitUsd !== 'number' || !(limitUsd > 0)) throw new Error('definirOTeto pede um valor em dólares maior que zero');
    return montar({ metodo: 'POST', caminho: '/custos/teto/definir', corpo: { limitUsd } });
  }

  /**
   * Todos os pedidos que a extensão pode fazer, para os Baralhos `baralhosPedidos` (um por idioma):
   * `[{ nome, pedido }]`; `chaveDeExemplo` é a chave que o pedido da IA leva e `envioDeExemplo` o corpo de um Envio
   * (o `jobId` dele é o que os outros pedidos do Envio levam). O teste do contrato confere um exemplo de cada.
   */
  function variantes(baralhosPedidos, chaveDeExemplo, envioDeExemplo) {
    return [
      { nome: 'saúde', pedido: saude() },
      { nome: 'Baralhos', pedido: baralhos() },
      ...LEITURAS_DOS_NUMEROS.map(leitura => ({
        nome: `números (${leitura.abrirOAnki ? 'de novo, abrindo o Anki' : leitura.deNovo ? 'de novo' : 'primeira leitura'})`,
        pedido: estatisticas(baralhosPedidos, leitura),
      })),
      ...baralhosPedidos.map(({ deckName, lang }) => ({ nome: `vocabulário (${lang})`, pedido: vocabulario(deckName, lang) })),
      { nome: 'prévia do Cartão: Iniciante do inglês', pedido: previaDoCartao('en', 'iniciante') },
      { nome: 'prévia do Cartão: Intermediário do inglês', pedido: previaDoCartao('en', 'intermediario') },
      { nome: 'prévia do Cartão: Avançado do inglês', pedido: previaDoCartao('en', 'avancado') },
      { nome: 'prévia do Cartão: Iniciante do russo', pedido: previaDoCartao('ru', 'iniciante') },
      { nome: 'prévia do Cartão: Intermediário do russo', pedido: previaDoCartao('ru', 'intermediario') },
      { nome: 'prévia do Cartão: Avançado do russo', pedido: previaDoCartao('ru', 'avancado') },
      { nome: 'item de login: estado', pedido: estadoDoItemDeLogin() },
      { nome: 'item de login: ligar', pedido: abrirComOComputador(true) },
      { nome: 'item de login: desligar', pedido: abrirComOComputador(false) },
      { nome: 'perfil: a lista', pedido: perfisDoAnki() },
      { nome: 'perfil: escolher outro', pedido: escolherOPerfil('Beto') },
      { nome: 'perfil: abrir o marcado', pedido: abrirOPerfilMarcado() },
      { nome: 'IA: entregar a chave', pedido: chaveDaOpenAI(chaveDeExemplo) },
      { nome: 'IA: estado', pedido: estadoDaIA() },
      { nome: 'IA: apagar a chave', pedido: apagarChaveDaOpenAI() },
      { nome: 'IA: sincronizar a chave', pedido: sincronizarChaveDaOpenAI('uid-teste', 'token-ficticio') },
      { nome: 'IA: migrar a remoção antiga', pedido: vincularLegadoDaOpenAI('', 'uid-teste', 100) },
      { nome: 'ChatGPT: estado', pedido: estadoDoChatGPT() },
      { nome: 'ChatGPT: entrar', pedido: entrarComOChatGPT() },
      { nome: 'ChatGPT: sair', pedido: sairDoChatGPT() },
      { nome: 'Modelo dos cartões: estado', pedido: estadoDoModelo() },
      { nome: 'Modelo dos cartões: escolher o Automático', pedido: escolherOModelo('automatico') },
      { nome: 'Frente do Cartão: trocar', pedido: trocarAFrente('en', 'lacuna') },
      { nome: 'Envio: criar', pedido: criarEnvio(envioDeExemplo) },
      { nome: 'Envio: criar no Intermediário', pedido: criarEnvio({ ...envioDeExemplo, nivel: 'intermediario' }) },
      { nome: 'Envio: criar no Avançado', pedido: criarEnvio({ ...envioDeExemplo, nivel: 'avancado' }) },
      { nome: 'Envio: criar sem voz de reserva', pedido: criarEnvio({ ...envioDeExemplo, tts: { ...envioDeExemplo.tts, reserva: [] } }) },
      { nome: 'Ouvir: o sotaque do Google', pedido: ouvirAVoz('en', 'google', 'co.uk') },
      { nome: 'Ouvir: a voz da OpenAI', pedido: ouvirAVoz('en', 'openai') },
      { nome: 'Envio: listar', pedido: listarEnvios() },
      { nome: 'Envio: ver', pedido: verEnvio(envioDeExemplo.jobId) },
      { nome: 'Envio: tentar de novo', pedido: tentarEnvioDeNovo(envioDeExemplo.jobId) },
      { nome: 'Envio: usar a minha chave', pedido: usarAChaveNoEnvio(envioDeExemplo.jobId) },
      { nome: 'Envio: pacote de diagnóstico', pedido: pacoteDeDiagnostico(envioDeExemplo.jobId) },
      { nome: 'Envio: apagar as Frases', pedido: apagarFrasesDosEnvios() },
      { nome: 'Custos: um período', pedido: custosDosEnvios({ de: '2026-10-12', ate: '2026-10-12' }) },
      { nome: 'Custos: todo o período', pedido: custosDosEnvios() },
      { nome: 'Teto do mês: ler', pedido: tetoDoMes() },
      { nome: 'Teto do mês: definir', pedido: definirOTeto(12) },
    ];
  }

  /** Envia o `pedido` (de um construtor daqui) à Conexão em `endereco`; `opcoes` vão ao `fetch` (o `signal`, por exemplo). Devolve a resposta. */
  function pedir(endereco, pedido, opcoes = {}) {
    if (!montados.has(pedido)) {
      throw new Error('pedido que não saiu de PedidoAoAnki (saude, baralhos, estatisticas ou vocabulario): '
        + 'monte-o por um deles, para o contrato ter o exemplo dele');
    }
    const { metodo, caminho, corpo } = pedido;
    if (corpo === undefined) return fetch(`${endereco}${caminho}`, { ...opcoes, method: metodo });
    return fetch(`${endereco}${caminho}`, {
      ...opcoes,
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
  }

  /** 404 é uma Conexão que não tem a rota: uma versão do complemento anterior à rota. */
  function ausenciaDaRota(status) {
    return status === 404 ? 'antiga' : 'falhou';
  }

  raiz.PedidoAoAnki = Object.freeze({
    saude, baralhos, estatisticas, vocabulario, estadoDoItemDeLogin, abrirComOComputador, previaDoCartao, perfisDoAnki, escolherOPerfil, abrirOPerfilMarcado, chaveDaOpenAI, apagarChaveDaOpenAI,
    sincronizarChaveDaOpenAI, vincularLegadoDaOpenAI, estadoDaIA, estadoDoChatGPT, entrarComOChatGPT, sairDoChatGPT,
    estadoDoModelo, escolherOModelo, trocarAFrente, criarEnvio, ouvirAVoz, listarEnvios, verEnvio, tentarEnvioDeNovo, usarAChaveNoEnvio, pacoteDeDiagnostico, apagarFrasesDosEnvios, custosDosEnvios, tetoDoMes, definirOTeto, variantes, pedir,
    ausenciaDaRota,
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
