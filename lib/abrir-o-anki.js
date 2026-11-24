'use strict';

(function (raiz) {
  const { textoDaVoz, Abridor, ConexaoAnki, Veio } = raiz;
  const { RESULTADO } = Abridor;
  const DESFECHO = Object.freeze({
    RESPONDEU: 'respondeu',
    ABERTO: 'aberto',
    FECHOU: 'fechou',
    REINICIADO: 'reiniciado',
    LIGADO: 'ligado',
    SUMIU: 'sumiu',
    FALHOU: 'falhou',
    NAO_ABRIU: 'nao_abriu',
    SEM_RESPOSTA: 'sem_resposta',
    SEM_PERMISSAO: 'sem_permissao',
  });
  const DEMORA_DO_CONSERTAR_MS = 3000;
  /** O que o Chrome diz de um host que não está mais lá (a Conexão saiu da pasta de complementos do Anki). */
  const HOST_SUMIU = /not found|failed to start/i;
  const PRAZO_DO_ANKI_MS = 2 * 60 * 1000;
  const INTERVALO_MS = 2000;

  const DESFECHO_DIRETO = new Map([
    [RESULTADO.RESPONDEU, DESFECHO.RESPONDEU],
    [RESULTADO.FECHOU, DESFECHO.FECHOU],
    [RESULTADO.SUMIU, DESFECHO.SUMIU],
    [RESULTADO.SEM_PERMISSAO, DESFECHO.SEM_PERMISSAO],
  ]);
  const ESPERAM_A_CONEXAO = new Set([RESULTADO.REINICIADO, RESULTADO.LIGADO]);

  const abridorSumiu = detalhe => HOST_SUMIU.test(detalhe) && ConexaoAnki.jaConectou();

  function desfechoDoConserto({ resultado, motivo, detalhe }) {
    if (DESFECHO_DIRETO.has(resultado)) return { desfecho: DESFECHO_DIRETO.get(resultado) };
    if (resultado === RESULTADO.FALHOU) return { desfecho: DESFECHO.FALHOU, motivo };
    if (resultado === RESULTADO.SEM_ABRIDOR && abridorSumiu(detalhe)) return { desfecho: DESFECHO.SUMIU };
    return null;
  }

  function abrirNoClique() {
    return Abridor.pedirPermissao().then(dada => (dada ? Abridor.abrirOAnki() : { resultado: RESULTADO.SEM_PERMISSAO, detalhe: '' }));
  }

  async function esperarOAnki({ prazo = PRAZO_DO_ANKI_MS, intervalo = INTERVALO_MS, continuar = () => true } = {}) {
    for (let esperado = 0; esperado <= prazo && continuar(); esperado += intervalo) {
      if (await ConexaoAnki.conferir() === ConexaoAnki.SITUACAO.LIGADA) return true;
      await new Promise(resolver => setTimeout(resolver, intervalo));
    }
    return false;
  }

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

    async function desfechar(conserto) {
      if (!ESPERAM_A_CONEXAO.has(conserto.resultado)) return desfechoDoConserto(conserto);
      aoMudar('abrindo');
      const respondeu = await esperarOAnki({ continuar });
      passos.push(`esperar a Conexão depois de ${conserto.resultado} → ${respondeu ? 'respondeu' : 'sem resposta'}`);
      return respondeu ? { desfecho: conserto.resultado } : { desfecho: DESFECHO.FALHOU, motivo: 'sem_resposta_depois' };
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
    const segundo = await desfechar(await consertar());
    return pronto(segundo && segundo.desfecho !== DESFECHO.RESPONDEU ? segundo : { desfecho: DESFECHO.SEM_RESPOSTA });
  }

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
          texto: textoDaVoz(desfecho.motivo === 'conexao_fora' ? 'BRG-39.conexaoFora' : 'BRG-39.falhou'),
          acao: { rotulo: textoDaVoz('BRG-39.baixar'), aoUsar: () => baixarDiagnostico(desfecho) },
          detalhes: [desfecho.motivo, ...desfecho.passos].filter(Boolean).join('\n'),
        };
      default:
        return null;
    }
  }

  async function instalarDeNovo() {
    await ConexaoAnki.esquecerQueConectou();
    const painel = chrome.runtime.getURL('painel/painel.html');
    if (location.href.startsWith(painel)) location.hash = '#anki';
    else chrome.tabs.create({ url: `${painel}#anki` });
  }

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

  const causaDoAbridor = ({ resultado, detalhe }) => `abridor · ${resultado}${detalhe ? ` · ${detalhe}` : ''}`;

  let emAndamento = null;
  function abrirEEsperar(opcoes) {
    emAndamento = emAndamento || Abridor.pedirPermissao()
      .then(dada => (dada ? abrirOuConsertar(opcoes) : { desfecho: DESFECHO.SEM_PERMISSAO, passos: [] }))
      .finally(() => { emAndamento = null; });
    return emAndamento;
  }

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
        if (fala?.sucesso) Veio.mostrarToastDeSucesso(fala.texto);
        else if (fala) aviso.replaceChildren(fala.texto, ...(fala.acao ? [' ', botaoDaFala(fala.acao)] : []));
        else if (![DESFECHO.ABERTO, DESFECHO.RESPONDEU, DESFECHO.FECHOU].includes(desfecho.desfecho)) aviso.textContent = textoDaVoz('BRG-38.naoAbriu');
      }, () => { aviso.textContent = textoDaVoz('BRG-38.naoAbriu'); }).finally(() => {
        botao.removeAttribute('aria-disabled');
        botao.textContent = textoDaVoz('BRG-38.abrir');
      });
    });
    return lugar;
  }

  const podeLevarOBotao = lugar => Boolean(lugar) && !lugar.querySelector('.abrir-o-anki');

  function montarSeJaConectou(lugar, classe) {
    if (podeLevarOBotao(lugar) && ConexaoAnki.jaConectou()) lugar.append(montarBotao(classe));
  }

  raiz.AbrirOAnki = { PRAZO_DO_ANKI_MS, DESFECHO, abrirNoClique, esperarOAnki, abrirOuConsertar, desfechoDoConserto, abrirEEsperar, causaDoAbridor, falaDoDesfecho, botaoDaFala, montarBotao, montarSeJaConectou };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
