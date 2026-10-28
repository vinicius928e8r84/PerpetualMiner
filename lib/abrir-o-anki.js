'use strict';

// Abrir o Anki a pedido da pessoa (#150): o clique que chama o abridor (lib/abridor.js) e a espera da Conexão
// responder. Só um clique, ou um Envio que a pessoa pediu, chega aqui: ler o vocabulário, entrar numa área ou o
// relógio nunca abrem o Anki.
//
//   abrirNoClique()      { resultado, detalhe } do abridor. Chame no clique, antes de qualquer `await`: ele pede a
//                        permissão `nativeMessaging` primeiro (o Chrome só pede com o gesto; já dada, responde
//                        na hora) e, dada, abre o Anki. Sem a permissão: SEM_PERMISSAO.
//   esperarOAnki(opcoes) true quando a Conexão responde ligada; false se `prazo` passa ou `continuar()` diz que não
//   abrirOuConsertar(opcoes)  o que o abridor faz sozinho (#152): `consertar` primeiro (o Anki que não responde fecha à força e abre de
//                        novo, a Conexão desativada liga e o Anki reinicia; o Anki que a pessoa fechou continua fechado) e, se o Anki
//                        está fechado, abre e espera. { desfecho, motivo, passos, quando }; `aoMudar('abrindo' | 'consertando')` conta a
//                        fase (“consertando” só se o abridor demora), `continuar()` cancela a espera
//   abrirEEsperar()      o clique inteiro: pede a permissão, abre ou conserta e espera (uma só por página); o desfecho
//   falaDoDesfecho(d)    o que a tela diz de um desfecho que o abridor consertou ou não: { texto, sucesso?, acao?, detalhes? }
//   montarBotao(classe)  o botão Abrir o Anki (BRG-38) e a linha do que deu, para o selo BRG-12, o BRG-37 e o popup
//   montarSeJaConectou(lugar, classe)  põe o botão em `lugar` (se existe; uma vez) só depois de a Conexão ter respondido neste computador:
//                        sem ela o que falta é a Conexão, não abrir o Anki (como o Envio)
//
// Carregado depois de lib/abridor.js e lib/conexao-anki.js.

(function (raiz) {
  const { textoDaVoz, Abridor, ConexaoAnki, Veio } = raiz;
  const { RESULTADO } = Abridor;
  const DESFECHO = Object.freeze({
    RESPONDEU: 'respondeu',         // o abridor viu a Conexão responder: nada a consertar
    ABERTO: 'aberto',               // o Anki estava fechado, abriu e a Conexão respondeu
    REINICIADO: 'reiniciado',       // o Anki travou: fechado à força e aberto de novo, e a Conexão respondeu
    LIGADO: 'ligado',               // a Conexão estava desativada no Anki: ligada, o Anki reiniciou e ela respondeu
    SUMIU: 'sumiu',                 // a Conexão não está mais no Anki: o único botão é Instalar de novo
    FALHOU: 'falhou',               // o conserto não deu certo (`motivo`)
    NAO_ABRIU: 'nao_abriu',         // o abridor não abriu o Anki (ou não existe): a pessoa abre à mão
    SEM_RESPOSTA: 'sem_resposta',   // o Anki abriu e a Conexão não respondeu no prazo nem consertando
    SEM_PERMISSAO: 'sem_permissao',
  });
  /** O consertar demora a responder (ele espera 30 s sem resposta antes de fechar): passado isto a tela diz que confere. */
  const DEMORA_DO_CONSERTAR_MS = 3000;
  /** O que o Chrome diz de um host que não está mais lá (a Conexão saiu da pasta de complementos do Anki). */
  const HOST_SUMIU = /not found|failed to start/i;
  /** Quanto o Anki tem para abrir e a Conexão responder, depois do abridor; passado o prazo, a pessoa abre à mão. */
  const PRAZO_DO_ANKI_MS = 2 * 60 * 1000;
  const INTERVALO_MS = 2000;

  function abrirNoClique() {
    return Abridor.pedirPermissao().then(dada => (dada ? Abridor.abrirOAnki() : { resultado: RESULTADO.SEM_PERMISSAO, detalhe: '' }));
  }

  /** O prazo conta os intervalos, não o relógio da página. */
  async function esperarOAnki({ prazo = PRAZO_DO_ANKI_MS, intervalo = INTERVALO_MS, continuar = () => true } = {}) {
    for (let esperado = 0; esperado <= prazo && continuar(); esperado += intervalo) {
      if (await ConexaoAnki.conferir() === ConexaoAnki.SITUACAO.LIGADA) return true;
      await new Promise(resolver => setTimeout(resolver, intervalo));
    }
    return false;
  }

  /**
   * Consertar sem clique, e abrir o Anki que está fechado. Só o Anki que a Conexão anotou, e só enquanto ele roda, é fechado: o que a
   * pessoa fechou o abridor encontra fechado e o deixa assim (`consertar` → fechado), e então só o `abrir` o abre, a pedido.
   */
  async function abrirOuConsertar({ aoMudar = () => {}, continuar = () => true } = {}) {
    const passos = [];
    const pronto = fim => ({ ...fim, passos, quando: new Date().toISOString() });
    const anotar = (passo, { resultado, motivo = '', detalhe = '' }) => passos.push(`${passo} → ${[resultado, motivo, detalhe].filter(Boolean).join(' · ')}`);

    async function consertar() {
      let terminou = false;
      setTimeout(() => { if (!terminou) aoMudar('consertando'); }, DEMORA_DO_CONSERTAR_MS);
      const conserto = await Abridor.consertarOAnki().finally(() => { terminou = true; });
      anotar('consertar', conserto);
      return conserto;
    }

    /** O desfecho de um consertar, ou `null` quando é o Anki fechado (ou um abridor de antes do consertar): segue para o abrir. */
    async function desfechar(conserto) {
      switch (conserto.resultado) {
        case RESULTADO.RESPONDEU:
          return { desfecho: DESFECHO.RESPONDEU };
        case RESULTADO.REINICIADO:
        case RESULTADO.LIGADO: {
          aoMudar('abrindo');
          const respondeu = await esperarOAnki({ continuar });
          passos.push(`esperar a Conexão depois de ${conserto.resultado} → ${respondeu ? 'respondeu' : 'sem resposta'}`);
          return respondeu ? { desfecho: conserto.resultado } : { desfecho: DESFECHO.FALHOU, motivo: 'sem_resposta_depois' };
        }
        case RESULTADO.SUMIU:
          return { desfecho: DESFECHO.SUMIU };
        case RESULTADO.FALHOU:
          return { desfecho: DESFECHO.FALHOU, motivo: conserto.motivo };
        case RESULTADO.SEM_PERMISSAO:
          return { desfecho: DESFECHO.SEM_PERMISSAO };
        case RESULTADO.SEM_ABRIDOR:
          return HOST_SUMIU.test(conserto.detalhe) && ConexaoAnki.jaConectou() ? { desfecho: DESFECHO.SUMIU } : null;
        default:
          return null;
      }
    }

    const primeiro = await desfechar(await consertar());
    if (primeiro) return pronto(primeiro);
    aoMudar('abrindo');
    const aberto = await Abridor.abrirOAnki();
    anotar('abrir', aberto);
    if (aberto.resultado !== RESULTADO.ABRIU) return pronto({ desfecho: DESFECHO.NAO_ABRIU, resultado: aberto.resultado, detalhe: aberto.detalhe });
    const respondeu = await esperarOAnki({ continuar });
    passos.push(`esperar a Conexão depois de abrir → ${respondeu ? 'respondeu' : 'sem resposta'}`);
    if (respondeu) return pronto({ desfecho: DESFECHO.ABERTO });
    if (!continuar()) return pronto({ desfecho: DESFECHO.SEM_RESPOSTA });
    // O Anki abriu e a Conexão continua muda: é o que acontece com a Conexão desativada. Uma vez só, o abridor vê o Anki aberto.
    const segundo = await desfechar(await consertar());
    return pronto(segundo && segundo.desfecho !== DESFECHO.RESPONDEU ? segundo : { desfecho: DESFECHO.SEM_RESPOSTA });
  }

  /** Com o desfecho que o abridor deu: o que a tela diz, e o botão se há um. Quem não consertou nada (aberto, sem resposta…) não tem fala. */
  function falaDoDesfecho(desfecho) {
    switch (desfecho.desfecho) {
      case DESFECHO.REINICIADO:
        return { sucesso: true, texto: textoDaVoz('BRG-39.reiniciado') };
      case DESFECHO.LIGADO:
        return { sucesso: true, texto: textoDaVoz('BRG-39.ligado') };
      case DESFECHO.SUMIU:
        return { texto: textoDaVoz('BRG-39.sumiu'), acao: { rotulo: textoDaVoz('BRG-39.instalar'), aoUsar: instalarDeNovo } };
      case DESFECHO.FALHOU:
        return {
          texto: textoDaVoz('BRG-39.falhou'),
          acao: { rotulo: textoDaVoz('BRG-39.baixar'), aoUsar: () => baixarDiagnostico(desfecho) },
          detalhes: [desfecho.motivo, ...desfecho.passos].filter(Boolean).join('\n'),
        };
      default:
        return null;
    }
  }

  /** O único botão da Conexão que sumiu: leva ao passo da primeira conexão, na área Conexão com o Anki do painel. */
  async function instalarDeNovo() {
    await ConexaoAnki.esquecerQueConectou();
    const painel = chrome.runtime.getURL('painel.html');
    if (location.href.startsWith(painel)) location.hash = '#anki';
    else chrome.tabs.create({ url: `${painel}#anki` });
  }

  /** O que o abridor respondeu, como arquivo para pedir ajuda. O download é o retorno: sem toast. */
  function baixarDiagnostico({ desfecho, motivo, passos, quando }) {
    const conteudo = { tipo: 'diagnostico-do-conserto', quando, desfecho, motivo, passos, extensao: chrome.runtime.getManifest().version };
    const url = URL.createObjectURL(new Blob([JSON.stringify(conteudo, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'diagnostico-do-conserto.json';
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  let emAndamento = null;
  function abrirEEsperar(opcoes) {
    emAndamento = emAndamento || Abridor.pedirPermissao()
      .then(dada => (dada ? abrirOuConsertar(opcoes) : { desfecho: DESFECHO.SEM_PERMISSAO, passos: [] }))
      .finally(() => { emAndamento = null; });
    return emAndamento;
  }

  /** O botão da fala do desfecho, ao lado do texto. */
  function botaoDaFala({ rotulo, aoUsar }) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'veio-botao veio-botao--link';
    botao.textContent = rotulo;
    botao.addEventListener('click', aoUsar);
    return botao;
  }

  function montarBotao(classe = 'veio-botao veio-botao--contorno veio-botao--compacto') {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = classe;
    botao.textContent = textoDaVoz('BRG-38.abrir');
    const aviso = document.createElement('span');
    aviso.setAttribute('role', 'status');
    const lugar = document.createElement('span');
    lugar.className = 'abrir-o-anki';
    lugar.append(botao, aviso);

    botao.addEventListener('click', () => {
      if (botao.getAttribute('aria-disabled') === 'true') return;
      const aberto = abrirEEsperar();
      botao.setAttribute('aria-disabled', 'true');
      botao.textContent = textoDaVoz('BRG-38.abrindo');
      aviso.replaceChildren();
      aberto.then(desfecho => {
        const fala = falaDoDesfecho(desfecho);
        // Com o Anki de volta o selo sai da tela: o que o abridor fez fica num toast, não no selo.
        if (fala?.sucesso) Veio.mostrarToastDeSucesso(fala.texto);
        else if (fala) aviso.replaceChildren(fala.texto, ...(fala.acao ? [' ', botaoDaFala(fala.acao)] : []));
        else if (![DESFECHO.ABERTO, DESFECHO.RESPONDEU].includes(desfecho.desfecho)) aviso.textContent = textoDaVoz('BRG-38.naoAbriu');
      }, () => { aviso.textContent = textoDaVoz('BRG-38.naoAbriu'); }).finally(() => {
        botao.removeAttribute('aria-disabled');
        botao.textContent = textoDaVoz('BRG-38.abrir');
      });
    });
    return lugar;
  }

  function montarSeJaConectou(lugar, classe) {
    if (lugar && ConexaoAnki.jaConectou() && !lugar.querySelector('.abrir-o-anki')) lugar.append(montarBotao(classe));
  }

  raiz.AbrirOAnki = { PRAZO_DO_ANKI_MS, DESFECHO, abrirNoClique, esperarOAnki, abrirOuConsertar, abrirEEsperar, falaDoDesfecho, montarBotao, montarSeJaConectou };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
