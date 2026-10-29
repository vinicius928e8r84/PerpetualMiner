'use strict';

// O Envio que parou porque a pessoa fechou o Anki (#151): o cartão do Envio (painel-envio-cartao.js) diz quantos Cartões já estão
// no Anki e que o Envio continua sozinho quando o Anki abrir (a Conexão retoma o que ficou na fila ao subir com o Anki), e oferece
// Continuar envio, que abre o Anki pelo abridor. O abridor só é chamado nesse clique: um Anki fechado pela pessoa nunca é reaberto
// por conta própria, com o painel esperando por voltas e voltas.
//
//   pedido(envio, estado)  o motivo e a ação do cartão quando o Envio parou, ou null (a Conexão responde, ou o Envio terminou)
//   escrever(p, motivo)    põe o motivo (um texto, ou as frases de `pedido`) no parágrafo do cartão
//   causa(envio)           o que o abridor disse quando não deu certo, para o Detalhes do cartão ('' sem falha)
//
// Carregado depois de lib/abridor.js, lib/abrir-o-anki.js e lib/conexao-anki.js.

(function (raiz) {
  const { textoDaVoz, ConexaoAnki, AbrirOAnki, Veio } = raiz;
  const { DESFECHO } = AbrirOAnki;
  const FIM = ['completed', 'partial', 'failed'];
  const abrindo = new Set();      // jobIds com o Anki abrindo pelo clique
  const naoAbriu = new Map();     // jobId → { causa, fala? }: o que o abridor disse quando o Anki não abriu (`fala`: a de falaDoDesfecho, se tem botão)

  /** Quantos Cartões do Envio estão no Anki, pelo `cards` que a Conexão manda; null sem ele (a Conexão ainda não os listou). */
  function contagem(estado) {
    const cartoes = Object.values(estado?.cards || {});
    if (!cartoes.length) return null;
    return { n: cartoes.filter(c => c.status === 'added' || c.status === 'duplicate').length, total: cartoes.length };
  }

  /** As frases do motivo, cada uma do catálogo da Voz: a contagem, o que o Envio faz e, se o Anki não abriu, o aviso. */
  function motivo(envio, estado) {
    const dos = contagem(estado);
    return [
      dos ? textoDaVoz('ENV-18.contagem', dos) : '',
      textoDaVoz(abrindo.has(envio.jobId) ? 'ENV-16.abrindo' : 'ENV-18.continua'),
      naoAbriu.has(envio.jobId) && !abrindo.has(envio.jobId) ? (naoAbriu.get(envio.jobId).fala || textoDaVoz('BRG-38.naoAbriu')) : '',
    ].filter(Boolean);
  }

  /** Escreve o motivo no parágrafo do cartão: um texto só, ou uma frase por trecho (`motivo`; a fala do abridor leva o botão dela). */
  function escrever(paragrafo, partes) {
    if (typeof partes === 'string') return void (paragrafo.textContent = partes);
    paragrafo.replaceChildren(...partes.flatMap((parte, i) => {
      const frase = document.createElement('span');
      frase.textContent = parte.texto ?? parte;
      return [...(i ? [' '] : []), frase, ...(parte.acao ? [' ', AbrirOAnki.botaoDaFala(parte.acao)] : [])];
    }));
  }

  /** O que o cartão guarda do desfecho do abridor, ou null quando nada falhou (o toast de sucesso do conserto sai aqui). */
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

  /** Continuar envio, no clique: abre o Anki e espera a Conexão responder. A Conexão retoma o Envio sozinha, então nada mais é pedido. */
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
      // Abriu e a Conexão respondeu: o cartão volta ao normal na próxima volta do Envio.
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
