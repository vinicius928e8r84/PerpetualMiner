'use strict';

// O abridor da Conexão com o Anki, visto da extensão (#147). A Conexão escreve um script no computador e o
// registra como host de Native Messaging (complemento/abridor.py); a extensão o chama por
// `chrome.runtime.sendNativeMessage` com a permissão opcional `nativeMessaging`, que só é pedida quando a
// pessoa aperta Permitir abrir o Anki. Nada fica ligado: o Chrome roda o script, ele responde uma vez e sai.
//
// Cada mensagem nasce de um construtor daqui (`conferir`, `abrirOAnki`), e `variantes` lista todas: o
// contrato (complemento/contrato/exemplos.json › abridor) tem um exemplo de cada, que `node
// test_contrato_fechado.js` exige, o script de verdade responde (complemento/test_abridor.py) e o fake do
// e2e também (`node test_fake_abridor.js`).
//
//   temPermissao()            o Chrome já deu `nativeMessaging`?
//   pedirPermissao()          abre o aviso do Chrome; chame no clique, antes de qualquer `await` (o Chrome
//                             só pede com um gesto da pessoa). Resolve true ou false.
//   conferirOAnki()           { resultado, detalhe }: ACHOU, NAO_ACHOU, SEM_ABRIDOR (não registrado, quebrado
//                             ou mudo por LIMITE_DA_CONVERSA_MS; `detalhe` é o que o Chrome disse) ou SEM_PERMISSAO
//   abrirOAnkiDeVerdade()     o mesmo, para o `abrir` do contrato: o Anki abre no perfil anotado (o passo
//                             “Ter o Anki” o usa com a permissão já dada, #146; o Envio usa no #150). ACHOU é
//                             “abriu”; o Anki fora do lugar ou que não abriu é NAO_ACHOU
//   lerAgoraNao() / guardarAgoraNao(sim)   o “Agora não” do passo, em `pm_abridor` ({ agoraNao })
//
// A permissão dada depois de a página abrir não chega ao `chrome.runtime` da própria página (nem ao do service
// worker): o Chrome monta essa parte da API uma vez. Por isso a conversa passa por um quadro escondido da página
// (`<iframe id="abridor-ponte" src="abridor.html" hidden>` no painel), recarregado a cada conversa: um quadro novo
// já nasce com a permissão de agora. Carregado pelo painel, antes de quem o usa.

(function (raiz) {
  const HOST = 'com.perpetualminer.abridor';
  const PERMISSAO = Object.freeze({ permissions: ['nativeMessaging'] });
  const CHAVE = 'pm_abridor';
  const ID_DA_PONTE = 'abridor-ponte';
  /** Sem resposta do abridor depois disto, a conversa desiste (um host que travou não segura o passo). */
  const LIMITE_DA_CONVERSA_MS = 10 * 1000;

  const RESULTADO = Object.freeze({
    ACHOU: 'achou',
    NAO_ACHOU: 'nao_achou',
    SEM_ABRIDOR: 'sem_abridor',
    SEM_PERMISSAO: 'sem_permissao',
  });

  // As mensagens que `conversar` aceita: só as que um construtor montou.
  const montadas = new WeakSet();
  const montar = mensagem => {
    const pronta = Object.freeze(mensagem);
    montadas.add(pronta);
    return pronta;
  };

  /** O abridor acha o Anki no lugar que a Conexão anotou? Não abre nem fecha nada. */
  const conferir = () => montar({ acao: 'conferir' });

  /** O Anki abre, no perfil anotado se houver; a resposta diz se abriu (`{ achou, abriu }`). */
  const abrirOAnki = () => montar({ acao: 'abrir' });

  /** Toda mensagem que a extensão manda ao abridor, para o contrato ter um exemplo de cada. */
  const variantes = () => [
    { nome: 'conferir se o abridor acha o Anki', mensagem: conferir() },
    { nome: 'abrir o Anki no perfil anotado', mensagem: abrirOAnki() },
  ];

  const temPermissao = () => chrome.permissions.contains(PERMISSAO);

  async function pedirPermissao() {
    try {
      return await chrome.permissions.request(PERMISSAO);
    } catch {
      return false;
    }
  }

  /** O `chrome.runtime` de um quadro recém-carregado, com a permissão de agora; o da página se não houver quadro. */
  async function runtimeDeAgora() {
    const ponte = document.getElementById(ID_DA_PONTE);
    if (!ponte) return chrome.runtime;
    await new Promise(resolve => {
      ponte.addEventListener('load', resolve, { once: true });
      ponte.contentWindow.location.reload();
    });
    return ponte.contentWindow.chrome?.runtime ?? chrome.runtime;
  }

  /** Manda uma mensagem montada aqui e devolve a resposta; rejeita com o que o Chrome disse, ou sem resposta no prazo. */
  async function conversar(mensagem) {
    if (!montadas.has(mensagem)) throw new Error('mensagem ao abridor que não saiu de PerpetualMiner.Abridor');
    const runtime = await runtimeDeAgora();
    if (typeof runtime.sendNativeMessage !== 'function') throw new Error('nativeMessaging indisponível nesta página');
    let limite;
    const semResposta = new Promise((_, rejeitar) => {
      limite = setTimeout(() => rejeitar(new Error(`o abridor não respondeu em ${LIMITE_DA_CONVERSA_MS / 1000} s`)), LIMITE_DA_CONVERSA_MS);
    });
    try {
      return await Promise.race([runtime.sendNativeMessage(HOST, mensagem), semResposta]);
    } finally {
      clearTimeout(limite);
    }
  }

  /**
   * A conversa em si, sem interpretar: `{ resposta }` com o que o abridor respondeu — qualquer
   * coisa, inclusive `null` —, ou `{ semResposta: { resultado, detalhe } }` quando ninguém
   * respondeu (sem permissão; host não registrado, quebrado ou mudo). Os dois casos são campos
   * diferentes de propósito: uma resposta `null` é um abridor estranho, não uma conversa que falhou.
   */
  async function conversarComOAbridor(mensagem) {
    if (!(await temPermissao())) return { semResposta: { resultado: RESULTADO.SEM_PERMISSAO, detalhe: '' } };
    try {
      return { resposta: await conversar(mensagem) };
    } catch (erro) {
      return { semResposta: { resultado: RESULTADO.SEM_ABRIDOR, detalhe: erro?.message ?? String(erro) } };
    }
  }

  /** Uma resposta que não é a do contrato (nem `achou`, nem `abriu`): abridor quebrado, com o que ele disse. */
  const foraDoContrato = resposta => ({ resultado: RESULTADO.SEM_ABRIDOR, detalhe: JSON.stringify(resposta ?? null) });

  /** O abridor acha o Anki no lugar anotado? A resposta do `conferir` diz `{ achou }`. */
  async function conferirOAnki() {
    const { resposta, semResposta } = await conversarComOAbridor(conferir());
    if (semResposta) return semResposta;
    if (resposta?.achou === true) return { resultado: RESULTADO.ACHOU, detalhe: '' };
    if (resposta?.achou === false) return { resultado: RESULTADO.NAO_ACHOU, detalhe: '' };
    return foraDoContrato(resposta);
  }

  /** Abrir é dizer se abriu: só `{ achou: true, abriu: true }` do `abrir` é o Anki aberto. */
  async function abrirOAnkiDeVerdade() {
    const { resposta, semResposta } = await conversarComOAbridor(abrirOAnki());
    if (semResposta) return semResposta;
    if (resposta?.achou === true && resposta?.abriu === true) return { resultado: RESULTADO.ACHOU, detalhe: '' };
    // O Anki fora do lugar, ou achado e sem abrir (o `open` falhou): o caminho manual, sem Detalhes.
    if (typeof resposta?.achou === 'boolean' && typeof resposta?.abriu === 'boolean') {
      return { resultado: RESULTADO.NAO_ACHOU, detalhe: '' };
    }
    return foraDoContrato(resposta);
  }

  async function lerAgoraNao() {
    const { [CHAVE]: guardado } = await chrome.storage.local.get(CHAVE);
    return guardado?.agoraNao === true;
  }

  const guardarAgoraNao = sim => chrome.storage.local.set({ [CHAVE]: { agoraNao: Boolean(sim) } });

  raiz.Abridor = Object.freeze({
    HOST,
    RESULTADO,
    LIMITE_DA_CONVERSA_MS,
    conferir,
    abrirOAnki,
    variantes,
    temPermissao,
    pedirPermissao,
    conferirOAnki,
    abrirOAnkiDeVerdade,
    lerAgoraNao,
    guardarAgoraNao,
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
