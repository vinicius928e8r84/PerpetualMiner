'use strict';

// Como a extensão pede à Conexão com o Anki: cada pedido nasce de um construtor daqui e `pedir` só envia o que um deles montou. `PedidoAoAnki.variantes` os lista, e
// o contrato (complemento/contrato/exemplos*.json) tem um exemplo de cada (`node test_contrato_fechado.js`; regra `contrato-fechado`). O que lê o Anki da pessoa
// é POST com corpo JSON: o GET da extensão vai sem `Origin` e a Conexão só atende a extensão (contrato/LEIA-ME.md).
//
// Todo pedido, menos a saúde e os três do pareamento, vai assinado por um navegador pareado (#192, lib/pareamento.js): `pedir` prova a
// Conexão (`conferir`), assina, e só devolve a resposta se ela traz a prova do segredo. É o único lugar do lado da extensão que decide isso.
//
// Carregado pelo service worker e pelas páginas que falam com a Conexão; `pedir` procura lib/pareamento.js na hora de usar.

(function (raiz) {
  const LIMITE_DO_VOCABULARIO = 10000;

  // Os pedidos que `pedir` aceita: só os que um construtor montou.
  const montados = new WeakSet();
  const montar = pedido => {
    const pronto = Object.freeze(pedido);
    montados.add(pronto);
    return pronto;
  };

  /** `GET /health`: a Conexão está ligada? Aberta: não leva assinatura. */
  const saude = () => montar({ metodo: 'GET', caminho: '/health', semAssinatura: true });

  // O pareamento (#192): as únicas rotas, além da saúde, que a Conexão atende sem a assinatura de um navegador pareado.

  /** `POST /pareamento/comecar`: o Anki mostra o código para conectar. O código não volta na resposta. */
  const comecarOPareamento = () => montar({ metodo: 'POST', caminho: '/pareamento/comecar', corpo: {}, semAssinatura: true });

  /** `POST /pareamento/concluir`: o código que a pessoa digitou, e o navegador (`cliente`, um UUID) a parear; responde `{ cliente, segredo }`, uma vez. */
  function concluirOPareamento(codigo, cliente, nome) {
    if (typeof codigo !== 'string' || typeof cliente !== 'string' || typeof nome !== 'string') throw new Error('concluirOPareamento pede o código, o navegador e o nome como texto');
    return montar({ metodo: 'POST', caminho: '/pareamento/concluir', corpo: { codigo, cliente, nome }, semAssinatura: true });
  }

  /** `POST /pareamento/conferir`: a prova de que a Conexão tem o segredo deste navegador (`{ sessao, prova }`) para o `desafio` sorteado. */
  function conferirOPareamento(cliente, desafio) {
    if (typeof cliente !== 'string' || typeof desafio !== 'string') throw new Error('conferirOPareamento pede o navegador e o desafio como texto');
    return montar({ metodo: 'POST', caminho: '/pareamento/conferir', corpo: { cliente, desafio }, semAssinatura: true });
  }

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

  /** `POST /anki/stats/decks` com os `baralhos` (`[{ deckName, lang }]`), uma das LEITURAS_DOS_NUMEROS. */
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

  /** `POST /anki/vocabulary`: o vocabulário inteiro do Baralho `deck` de `lang`; os filtros são da tela. */
  const vocabulario = (deck, lang) => montar({
    metodo: 'POST', caminho: '/anki/vocabulary', corpo: { deck, lang, limit: LIMITE_DO_VOCABULARIO },
  });

  /** `POST /anki/card-preview` (#164): o Cartão de exemplo do estilo (`lang`, `nivel`) como o Anki o desenha: `{ front, back, css, … }`. */
  function previaDoCartao(lang, nivel, tipoProprio) {
    if (typeof lang !== 'string' || typeof nivel !== 'string') throw new Error('previaDoCartao pede o idioma e o nível');
    return montar({ metodo: 'POST', caminho: '/anki/card-preview', corpo: { lang, nivel, ...(tipoProprio && { tipoProprio }) } });
  }

  /** `POST /anki/card-preview` pelo `guid` (#173): o Cartão da nota que o Envio gravou. */
  function previaDaNota(guid) {
    if (typeof guid !== 'string' || !guid) throw new Error('previaDaNota pede o guid da nota');
    return montar({ metodo: 'POST', caminho: '/anki/card-preview', corpo: { guid } });
  }

  /** `POST /anki/browse` (#173): o Anki abre o navegador na nota de `guid`. */
  function abrirNoAnki(guid) {
    if (typeof guid !== 'string' || !guid) throw new Error('abrirNoAnki pede o guid da nota');
    return montar({ metodo: 'POST', caminho: '/anki/browse', corpo: { guid } });
  }

  /** `POST /anki/note-types` (#165): os tipos de nota da pessoa e os campos deles, sem os da Conexão (“Usar um tipo que já tenho”; `tipoProprio` = `{ nome, mapa }`). */
  const tiposDeNota = () => montar({ metodo: 'POST', caminho: '/anki/note-types', corpo: {} });

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

  /** `POST /anki/profile/open`: “Abrir <perfil>”: fecha o perfil aberto (sincroniza) e abre o marcado. */
  const abrirOPerfilMarcado = () => montar({ metodo: 'POST', caminho: '/anki/profile/open', corpo: {} });

  /** `POST /ia/openai/chave`: só a Conexão avança a revisão; `versao` é a observada pelo cliente. */
  function chaveDaOpenAI(chave, versao = 0, conta = '') {
    if (typeof chave !== 'string') throw new Error('chaveDaOpenAI pede a chave como texto');
    return montar({ metodo: 'POST', caminho: '/ia/openai/chave', corpo: { chave, versao, conta }, comSegredo: true });
  }

  /** `POST /ia/openai/chave/apagar`: substitui o valor da revisão observada por uma chave vazia. */
  const apagarChaveDaOpenAI = (versao = 0, conta = '') => montar({ metodo: 'POST', caminho: '/ia/openai/chave/apagar', corpo: { versao, conta }, comSegredo: true });

  /** `POST /ia/openai/sincronizar`: o dono leva a chave à conta; credencial transitória, nunca no cache. */
  const sincronizarChaveDaOpenAI = (uid, token, versao = 0) => montar({
    metodo: 'POST', caminho: '/ia/openai/sincronizar', corpo: { uid, token, versao }, comSegredo: true,
  });

  /** Só migração: prova o valor já guardado antes de transferir seu UID/hora. Não troca a chave. */
  const vincularLegadoDaOpenAI = (chave, conta, em, versao = 0) => montar({
    metodo: 'POST', caminho: '/ia/openai/legado', corpo: { chave, conta, em, versao }, comSegredo: true,
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
  /** `POST /anki/card-front`: os Cartões do idioma passam a ter a frente (`frase_com_audio`, `ouvir_primeiro`, `lacuna` ou `criacao`) na hora. */
  function trocarAFrente(lang, frente) {
    if (typeof lang !== 'string' || typeof frente !== 'string') throw new Error('trocarAFrente pede o idioma e a frente como texto');
    return montar({ metodo: 'POST', caminho: '/anki/card-front', corpo: { lang, frente } });
  }

  // O Envio (#142): a fila é da Conexão; o painel cria, acompanha e pede para tentar de novo. Tudo POST com a origem
  // da extensão, porque leva as Frases e os custos da pessoa (complemento/contrato/LEIA-ME.md).

  /** `POST /jobs`: entrega as Frases de um Envio (`envio`: `jobId`, `lang`, `deckName`, `imageSource`, `tts`, `entries`, `nivel`, `teste` #173); o mesmo corpo de novo é o mesmo Envio. */
  function criarEnvio(envio) {
    const { jobId, lang, deckName, imageSource, tts, nivel, tipoProprio, teste, entries } = envio;
    if (typeof jobId !== 'string' || !jobId) throw new Error('criarEnvio pede o jobId do Envio');
    return montar({ metodo: 'POST', caminho: '/jobs', corpo: { jobId, lang, deckName, imageSource, tts, ...(nivel && { nivel }), ...(tipoProprio && { tipoProprio }), ...(teste && { teste: true }), entries }, comSegredo: true });
  }

  /** `POST /voz/ouvir` (#174): a Conexão fala uma frase de amostra com o `provedor` (`google` com `sotaque`, ou `openai`) e responde `{ audio }` (MP3 em base64). */
  function ouvirAVoz(lang, provedor, sotaque) {
    if (!['google', 'openai'].includes(provedor)) throw new Error(`ouvirAVoz pede google ou openai, não ${JSON.stringify(provedor)}`);
    return montar({ metodo: 'POST', caminho: '/voz/ouvir', corpo: { lang, provedor, ...(provedor === 'google' && { sotaque }) } });
  }

  /** `POST /voz/falar`, o quiz de nível (#170): a Conexão diz o `texto` (1 a 200 letras) no `sotaque` e responde `{ audio }`; Conexão antiga: 404. */
  function falarAFrase(lang, sotaque, texto) {
    if (typeof texto !== 'string' || !texto.trim() || texto.length > 200) throw new Error('falarAFrase pede 1 a 200 letras');
    return montar({ metodo: 'POST', caminho: '/voz/falar', corpo: { lang, sotaque, texto } });
  }

  /** `POST /jobs/list`: cada Envio que a Conexão tem, com o estado dele e o de cada Cartão. */
  const listarEnvios = () => montar({ metodo: 'POST', caminho: '/jobs/list', corpo: {} });

  const doEnvio = caminho => jobId => montar({ metodo: 'POST', caminho, corpo: { jobId } });
  /** `POST /jobs/get`: o pedido e o estado de um Envio. */
  const verEnvio = doEnvio('/jobs/get');
  /** `POST /jobs/retry`: Continuar envio / Tentar de novo; a Conexão refaz só o que falta. */
  const tentarEnvioDeNovo = doEnvio('/jobs/retry');
  /** `POST /jobs/usar-a-chave`: no limite do plano (#158), o que falta do Envio vai pela chave da OpenAI. */
  const usarAChaveNoEnvio = doEnvio('/jobs/usar-a-chave');
  /** `POST /jobs/debug-bundle`: o pacote de diagnóstico de um Envio (sem a chave). */
  const pacoteDeDiagnostico = doEnvio('/jobs/debug-bundle');

  /** `POST /jobs/apagar-frases`: o Apagar tudo (CFG-17) tira também as Frases que a Conexão guarda. */
  const apagarFrasesDosEnvios = () => montar({ metodo: 'POST', caminho: '/jobs/apagar-frases', corpo: {} });

  /** `POST /analytics/jobs`: os custos dos Envios do período (`de`/`ate` em AAAA-MM-DD; sem eles, todos). */
  function custosDosEnvios({ de = '', ate = '' } = {}) {
    const corpo = { lang: 'all' };
    if (de) corpo.from = de;
    if (ate) corpo.to = ate;
    return montar({ metodo: 'POST', caminho: '/analytics/jobs', corpo });
  }

  // O teto do mês (#160): o valor e o gasto são da Conexão deste computador; a extensão lê e sobe ou baixa o teto.
  /** `POST /custos/teto`: `{ limitUsd, spentUsd, month }` (o gasto da chave no mês). */
  const tetoDoMes = () => montar({ metodo: 'POST', caminho: '/custos/teto', corpo: {} });
  /** `POST /atualizacao/agora` (#177): consulta o AnkiWeb e instala. */
  const atualizarAConexao = () => montar({ metodo: 'POST', caminho: '/atualizacao/agora', corpo: {}, daConexaoAntiga: true });
  /** `POST /atualizacao/reiniciar`: a Conexão fecha o Anki. */
  const reiniciarOAnki = () => montar({ metodo: 'POST', caminho: '/atualizacao/reiniciar', corpo: {}, daConexaoAntiga: true });
  /** `POST /custos/teto/definir`: o teto novo em dólares (positivo); a Conexão responde como `tetoDoMes`. */
  function definirOTeto(limitUsd) {
    if (typeof limitUsd !== 'number' || !(limitUsd > 0)) throw new Error('definirOTeto pede um valor em dólares maior que zero');
    return montar({ metodo: 'POST', caminho: '/custos/teto/definir', corpo: { limitUsd } });
  }

  /** O fetch do pedido, com `cabecalhos` a mais; `corpoEmTexto` é o que segue (undefined: nada). */
  function enviar(endereco, { metodo, caminho }, corpoEmTexto, opcoes, cabecalhos = {}) {
    const url = `${endereco}${caminho}`;
    if (corpoEmTexto === undefined) return fetch(url, { ...opcoes, method: metodo, ...(Object.keys(cabecalhos).length && { headers: cabecalhos }) });
    return fetch(url, { ...opcoes, method: metodo, headers: { 'Content-Type': 'application/json', ...cabecalhos }, body: corpoEmTexto });
  }

  /**
   * Envia o `pedido` (de um construtor daqui) à Conexão em `endereco`; `opcoes` vão ao `fetch`. Devolve a resposta.
   * A saúde e o pareamento vão como estão; todo o resto, assinado por um navegador pareado (lib/pareamento.js).
   */
  function pedir(endereco, pedido, opcoes = {}) {
    if (!montados.has(pedido)) {
      throw new Error('pedido que não saiu de PedidoAoAnki (saude, baralhos, estatisticas ou vocabulario): '
        + 'monte-o por um deles, para o contrato ter o exemplo dele');
    }
    if (pedido.semAssinatura) {
      return enviar(endereco, pedido, pedido.corpo === undefined ? undefined : JSON.stringify(pedido.corpo), opcoes);
    }
    return raiz.PareamentoComOAnki.pedirAssinado(endereco, pedido, opcoes, enviar);
  }

  /** 404 é uma Conexão que não tem a rota: uma versão do complemento anterior à rota. */
  function ausenciaDaRota(status) {
    return status === 404 ? 'antiga' : 'falhou';
  }

  raiz.PedidoAoAnki = Object.freeze({
    saude, comecarOPareamento, concluirOPareamento, conferirOPareamento, baralhos, estatisticas, vocabulario, estadoDoItemDeLogin, abrirComOComputador, previaDoCartao, previaDaNota, abrirNoAnki, tiposDeNota, perfisDoAnki, escolherOPerfil, abrirOPerfilMarcado, chaveDaOpenAI, apagarChaveDaOpenAI,
    sincronizarChaveDaOpenAI, vincularLegadoDaOpenAI, estadoDaIA, estadoDoChatGPT, entrarComOChatGPT, sairDoChatGPT,
    estadoDoModelo, escolherOModelo, trocarAFrente, criarEnvio, ouvirAVoz, falarAFrase, listarEnvios, verEnvio, tentarEnvioDeNovo, usarAChaveNoEnvio, pacoteDeDiagnostico, apagarFrasesDosEnvios, custosDosEnvios, tetoDoMes, definirOTeto, atualizarAConexao, reiniciarOAnki, LEITURAS_DOS_NUMEROS, pedir,
    ausenciaDaRota,
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
