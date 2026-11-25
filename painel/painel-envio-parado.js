'use strict';

(function (raiz) {
  const { textoDaVoz, ConexaoAnki, AbrirOAnki, Veio } = raiz;
  const { DESFECHO } = AbrirOAnki;
  const FIM = ['completed', 'partial', 'failed'];
  const ENVIADO = ['added', 'duplicate'];
  const abrindo = new Set();
  const naoAbriu = new Map();

  function contagem(estado) {
    const cartoes = Object.values(estado?.cards || {});
    if (!cartoes.length) return null;
    return { n: cartoes.filter(c => ENVIADO.includes(c.status)).length, total: cartoes.length };
  }

  function porQueNaoAbriu(jobId) {
    if (!naoAbriu.has(jobId) || abrindo.has(jobId)) return '';
    return naoAbriu.get(jobId).fala || textoDaVoz('BRG-38.naoAbriu');
  }

  function motivo(envio, estado) {
    const dos = contagem(estado);
    return [
      dos ? textoDaVoz('ENV-18.contagem', dos) : '',
      textoDaVoz(abrindo.has(envio.jobId) ? 'ENV-16.abrindo' : 'ENV-18.continua'),
      porQueNaoAbriu(envio.jobId),
    ].filter(Boolean);
  }

  function escrever(paragrafo, partes) {
    if (typeof partes === 'string') return void (paragrafo.textContent = partes);
    paragrafo.replaceChildren(...partes.flatMap((parte, i) => {
      const frase = document.createElement('span');
      frase.textContent = parte.texto ?? parte;
      return [...(i ? [' '] : []), frase, ...(parte.acao ? [' ', AbrirOAnki.botaoDaFala(parte.acao)] : [])];
    }));
  }

  const FALHA_DO_DESFECHO = new Map([
    [DESFECHO.ABERTO, () => null],
    [DESFECHO.RESPONDEU, () => null],
    [DESFECHO.NAO_ABRIU, resposta => ({ causa: AbrirOAnki.causaDoAbridor(resposta) })],
    [DESFECHO.SEM_RESPOSTA, () => ({ causa: 'abridor · sem resposta da Conexão no prazo' })],
  ]);

  function falhaDe(resposta) {
    const { desfecho, motivo: porque, passos = [] } = resposta;
    const fala = AbrirOAnki.falaDoDesfecho(resposta);
    if (fala?.sucesso) {
      Veio.mostrarToastDeSucesso(fala.texto);
      return null;
    }
    if (FALHA_DO_DESFECHO.has(desfecho)) return FALHA_DO_DESFECHO.get(desfecho)(resposta);
    const causa = ['abridor', desfecho, porque].filter(Boolean).join(' · ');
    return { causa: [causa, ...passos].join('\n'), ...(fala && { fala: { texto: fala.texto, acao: fala.acao, toString: () => fala.texto } }) };
  }

  async function abrir(envio, estado, link) {
    if (abrindo.has(envio.jobId)) return;
    abrindo.add(envio.jobId);
    naoAbriu.delete(envio.jobId);
    const aberto = AbrirOAnki.abrirEEsperar();
    const cartao = link.closest('.envio-cartao');
    const mostrar = () => {
      escrever(cartao.querySelector('.envio-cartao__motivo'), motivo(envio, estado));
      if (abrindo.has(envio.jobId)) link.setAttribute('aria-disabled', 'true');
      else link.removeAttribute('aria-disabled');
    };
    mostrar();
    try {
      const falha = falhaDe(await aberto);
      if (falha) naoAbriu.set(envio.jobId, falha);
    } catch (erro) {
      naoAbriu.set(envio.jobId, { causa: `abridor · ${erro.message || erro}` });
    } finally {
      abrindo.delete(envio.jobId);
      if (naoAbriu.has(envio.jobId)) mostrar();
      else link.removeAttribute('aria-disabled');
    }
  }

  const conexaoCaiu = () => ConexaoAnki.situacao() === ConexaoAnki.SITUACAO.DESLIGADA && ConexaoAnki.jaConectou();
  const terminou = estado => FIM.includes(estado?.status);

  function pedido(envio, estado) {
    const desligada = conexaoCaiu();
    if (!envio.jobId || !desligada) return null;
    if (terminou(estado)) return null;
    return {
      motivo: motivo(envio, estado),
      rotulo: textoDaVoz('ENV-13.continuar'),
      foco: 'continuar',
      emAndamento: abrindo.has(envio.jobId),
      aoUsar: evento => abrir(envio, estado, evento.currentTarget),
    };
  }

  const causa = envio => naoAbriu.get(envio.jobId)?.causa || '';

  raiz.EnvioParado = Object.freeze({ pedido, causa, escrever });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
