'use strict';

// O Envio no limite do plano do ChatGPT (#158, história 85): o cartão do Envio (painel-envio-cartao.js) diz “Limite de uso atingido ·
// Faltam 7 cartões” (ENV-19) com três ações: Gerenciar uso (a principal: a página de uso do ChatGPT), Usar a minha chave (o que falta
// vai pela chave da OpenAI) e Tentar de novo (a Conexão pede o texto já, sem esperar a próxima tentativa dela). O Envio volta sozinho
// quando o plano libera: a Conexão tira o `waiting` e o cartão volta ao normal na volta seguinte.
//
//   pedido(envio, estado, ajuda)  o motivo e as ações do cartão no limite, ou null (o Envio não espera o plano, ou a chave já foi escolhida)
//                                 `ajuda`: { tentarDeNovo(), falhou, redesenhar() }
//
// Carregado depois de painel-ia-chatgpt.js (o endereço do Gerenciar uso) e lib/pedido-ao-anki.js.

(function (raiz) {
  const { textoDaVoz, PedidoAoAnki, ConexaoAnki, ColunaDoChatGPT } = raiz;
  const FIM = ['completed', 'partial', 'failed'];
  const escolheram = new Set();   // jobIds com Usar a minha chave aceito, até o estado deixar de dizer que o Envio espera o plano
  const naoDeu = new Set();       // jobIds em que Usar a minha chave não deu
  const pedindo = new Set();      // jobIds com Usar a minha chave a caminho

  /** Quantos Cartões do Envio ainda não estão no Anki, pelo `cards` que a Conexão manda. */
  function faltam(estado) {
    return Object.values(estado.cards || {}).filter(c => c.status !== 'added' && c.status !== 'duplicate').length;
  }

  const esperaOPlano = estado => estado?.waiting?.reason === 'plan_limit' && !FIM.includes(estado.status);

  /** Sem chave guardada na Conexão, a chave se cola nas Configurações: o progresso fecha e o Envio segue esperando o plano. */
  function irAoCardDaIA() {
    document.getElementById('modal-envio-fechar')?.click();
    location.hash = '#configuracoes/ia';
  }

  /** Usar a minha chave: a Conexão marca o Envio e o que falta vai pela chave (`POST /jobs/usar-a-chave`). */
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
