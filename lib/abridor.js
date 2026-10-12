'use strict';

// O abridor da Conexão com o Anki, visto da extensão (#147). A Conexão escreve um script no computador e o
// registra como host de Native Messaging (complemento/abridor.py); a extensão o chama por
// `chrome.runtime.sendNativeMessage` com a permissão opcional `nativeMessaging`, que só é pedida quando a
// pessoa aperta Permitir abrir o Anki. Nada fica ligado: o Chrome roda o script, ele responde uma vez e sai.
//
// Cada mensagem nasce de um construtor daqui (`conferir`), e `variantes` lista todas: o contrato
// (complemento/contrato/exemplos.json › abridor) tem um exemplo de cada, que `node test_contrato_fechado.js`
// exige, o script de verdade responde (complemento/test_abridor.py) e o fake do e2e também
// (`node test_fake_abridor.js`). Este passo só confere (“achou o Anki?”); abrir o Anki é do Envio (#150).
//
//   temPermissao()            o Chrome já deu `nativeMessaging`?
//   pedirPermissao()          abre o aviso do Chrome; chame no clique, antes de qualquer `await` (o Chrome
//                             só pede com um gesto da pessoa). Resolve true ou false.
//   conferirOAnki()           { resultado, detalhe }: ACHOU, NAO_ACHOU, SEM_ABRIDOR (não registrado, quebrado
//                             ou mudo por LIMITE_DA_CONVERSA_MS; `detalhe` é o que o Chrome disse) ou SEM_PERMISSAO
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

  /** Toda mensagem que a extensão manda ao abridor, para o contrato ter um exemplo de cada. */
  const variantes = () => [{ nome: 'conferir se o abridor acha o Anki', mensagem: conferir() }];

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

  async function conferirOAnki() {
    if (!(await temPermissao())) return { resultado: RESULTADO.SEM_PERMISSAO, detalhe: '' };
    let resposta;
    try {
      resposta = await conversar(conferir());
    } catch (erro) {
      return { resultado: RESULTADO.SEM_ABRIDOR, detalhe: erro?.message ?? String(erro) };
    }
    if (resposta?.achou === true) return { resultado: RESULTADO.ACHOU, detalhe: '' };
    if (resposta?.achou === false) return { resultado: RESULTADO.NAO_ACHOU, detalhe: '' };
    return { resultado: RESULTADO.SEM_ABRIDOR, detalhe: JSON.stringify(resposta ?? null) };
  }

  async function lerAgoraNao() {
    const { [CHAVE]: guardado } = await chrome.storage.local.get(CHAVE);
    return guardado?.agoraNao === true;
  }

  const guardarAgoraNao = sim => chrome.storage.local.set({ [CHAVE]: { agoraNao: Boolean(sim) } });

  raiz.Abridor = Object.freeze({
    HOST,
    RESULTADO,
    conferir,
    variantes,
    temPermissao,
    pedirPermissao,
    conferirOAnki,
    lerAgoraNao,
    guardarAgoraNao,
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
