'use strict';

(function (raiz) {
  const { textoDaVoz, PedidoAoAnki, ConexaoAnki, ColunaDoChatGPT } = raiz;
  const FIM = ['completed', 'partial', 'failed'];
  const escolheram = new Set();
  const naoDeu = new Set();
  const pedindo = new Set();

  function faltam(estado) {
    return Object.values(estado.cards || {}).filter(c => c.status !== 'added' && c.status !== 'duplicate').length;
  }

  const esperaOPlano = estado => estado?.waiting?.reason === 'plan_limit' && !FIM.includes(estado.status);

  function irAoCardDaIA() {
    document.getElementById('modal-envio-fechar')?.click();
    location.hash = '#configuracoes/ia';
  }

  async function usarAChave(envio, redesenhar) {
    if (pedindo.has(envio.jobId)) return;
    pedindo.add(envio.jobId);
    naoDeu.delete(envio.jobId);
    try {
      const resposta = await PedidoAoAnki.pedir(ConexaoAnki.ENDERECO, PedidoAoAnki.usarAChaveNoEnvio(envio.jobId));
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) escolheram.add(envio.jobId);
      else if (dados.error === 'openai_key_missing') irAoCardDaIA();
      else naoDeu.add(envio.jobId);
    } catch {
      naoDeu.add(envio.jobId);
    } finally {
      pedindo.delete(envio.jobId);
      redesenhar();
    }
  }

  function pedido(envio, estado, { tentarDeNovo, falhou, redesenhar }) {
    if (!esperaOPlano(estado)) {
      escolheram.delete(envio.jobId);
      return null;
    }
    if (escolheram.has(envio.jobId)) return null;
    return {
      motivo: [textoDaVoz('ENV-19.limite', { n: faltam(estado) }), textoDaVoz(falhou || naoDeu.has(envio.jobId) ? 'ENV-14.falha' : 'ENV-19.continua')],
      acoes: [
        { rotulo: textoDaVoz('ENV-19.gerenciar'), foco: 'gerenciar', href: ColunaDoChatGPT.GERENCIAR_USO, principal: true },
        { rotulo: textoDaVoz('ENV-19.chave'), foco: 'usar-a-chave', emAndamento: pedindo.has(envio.jobId), aoUsar: () => usarAChave(envio, redesenhar) },
        { rotulo: textoDaVoz('ENV-03.tentarDeNovo'), foco: 'tentar', aoUsar: tentarDeNovo },
      ],
    };
  }

  raiz.EnvioNoLimite = Object.freeze({ pedido });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
