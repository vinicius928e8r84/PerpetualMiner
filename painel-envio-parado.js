'use strict';

(function (raiz) {
  const { textoDaVoz, ConexaoAnki, AbrirOAnki, Veio } = raiz;
  const { DESFECHO } = AbrirOAnki;
  const FIM = ['completed', 'partial', 'failed'];
  const abrindo = new Set();
  const naoAbriu = new Map();

  function contagem(estado) {
    const cartoes = Object.values(estado?.cards || {});
    if (!cartoes.length) return null;
    return { n: cartoes.filter(c => c.status === 'added' || c.status === 'duplicate').length, total: cartoes.length };
  }

  function motivo(envio, estado) {
    const dos = contagem(estado);
    return [
      dos ? textoDaVoz('ENV-18.contagem', dos) : '',
      textoDaVoz(abrindo.has(envio.jobId) ? 'ENV-16.abrindo' : 'ENV-18.continua'),
      naoAbriu.has(envio.jobId) && !abrindo.has(envio.jobId) ? (naoAbriu.get(envio.jobId).fala || textoDaVoz('BRG-38.naoAbriu')) : '',
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

  function falhaDe(resposta) {
    const { desfecho, motivo: porque, passos = [] } = resposta;
    const fala = AbrirOAnki.falaDoDesfecho(resposta);
    if (fala?.sucesso) {
      Veio.mostrarToastDeSucesso(fala.texto);
      return null;
    }
    if (desfecho === DESFECHO.ABERTO || desfecho === DESFECHO.RESPONDEU) return null;
    if (desfecho === DESFECHO.NAO_ABRIU) return { causa: AbrirOAnki.causaDoAbridor(resposta) };
    if (desfecho === DESFECHO.SEM_RESPOSTA) return { causa: 'abridor · sem resposta da Conexão no prazo' };
    const causa = ['abridor', desfecho, porque].filter(Boolean).join(' · ');
    return { causa: [causa, ...passos].join('\n'), ...(fala && { fala: { texto: fala.texto, acao: fala.acao, toString: () => fala.texto } }) };
  }

  async function abrir(envio, estado, link) {
    if (abrindo.has(envio.jobId)) return;
    abrindo.add(envio.jobId);
    naoAbriu.delete(envio.jobId);
    const aberto = AbrirOAnki.abrirEEsperar(); // no clique, antes de qualquer `await`: pede a permissão do Chrome se faltar
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

  function pedido(envio, estado) {
    const desligada = ConexaoAnki.situacao() === ConexaoAnki.SITUACAO.DESLIGADA && ConexaoAnki.jaConectou();
    if (!envio.jobId || !desligada || FIM.includes(estado?.status)) return null;
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
