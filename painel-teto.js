'use strict';

// O teto do mês (#160, histórias 112 e 113). O valor (vem ligado com US$ 10) e o gasto da chave no mês são da Conexão com o Anki deste
// computador (`POST /custos/teto`); a extensão só lê, mostra e sobe ou baixa o teto (`POST /custos/teto/definir`).
//
//   TetoDoMes   o aviso no alto do Painel aos 80% (BRG-41) e o card Teto do mês na aba Custos, onde a pessoa ajusta o teto
//   EnvioNoTeto o cartão do Envio pausado aos 100% (ENV-21): “Envio pausado: o teto do mês chegou” e Ver Custos, sem valor nenhum
//
// Carregado antes de painel-envio-cartao.js (que pede o cartão) e depois de lib/pedido-ao-anki.js e painel-shell.js.

(function (raiz) {
  const { textoDaVoz, Veio, ConexaoAnki, PedidoAoAnki } = raiz;
  const { SITUACAO } = ConexaoAnki;
  const AVISO_A_PARTIR_DE = 0.8;
  const FIM = ['completed', 'partial', 'failed'];

  const porId = id => document.getElementById(id);
  let dados = null;              // a última leitura: { limitUsd, spentUsd, month }
  let assinaturaDoAviso = '';

  const dinheiro = valor => textoDaVoz('BRG-03.valor', { valor: valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
  const numero = valor => valor.toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false });
  /** O que a pessoa digitou como número: “12,50” e “12.50” valem 12,5; qualquer outra coisa (“1.250,50”, “1e3”, “-1”) é NaN. */
  const lerNumero = texto => (/^\d+(?:[.,]\d+)?$/.test(texto.trim()) ? Number(texto.trim().replace(',', '.')) : NaN);
  const usado = () => (dados && dados.limitUsd > 0 ? dados.spentUsd / dados.limitUsd : 0);

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  async function chamar(pedido) {
    const resposta = await PedidoAoAnki.pedir(ConexaoAnki.ENDERECO, pedido);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return resposta.json();
  }

  /** Lê o teto e o gasto; sem a Conexão ligada nada se mostra (o que ela guarda não está à vista). */
  async function ler() {
    if (ConexaoAnki.situacao() !== SITUACAO.LIGADA) {
      dados = null;
      return desenhar();
    }
    try {
      dados = await chamar(PedidoAoAnki.tetoDoMes());
    } catch {
      return;   // a leitura que falhou deixa a tela como estava; a próxima volta tenta de novo
    }
    desenhar();
  }

  function irAoCusto() {
    // O shell troca de área no `hashchange` (o ouvinte dele veio antes): o campo só aceita foco depois disso.
    addEventListener('hashchange', () => porId('anki-teto-campo')?.focus(), { once: true });
    if (location.hash === '#anki/custos') porId('anki-teto-campo')?.focus();
    else location.hash = '#anki/custos';
  }

  /** O aviso no alto do Painel, em qualquer área: aos 80% avisa (info), aos 100% diz que o Envio está pausado. */
  function desenharOAviso() {
    const cheio = usado() >= 1;
    const mostrar = dados && usado() >= AVISO_A_PARTIR_DE;
    const assinatura = mostrar ? `${cheio}|${Math.floor(usado() * 100)}` : '';
    if (assinatura === assinaturaDoAviso) return;
    assinaturaDoAviso = assinatura;
    porId('painel-teto-aviso')?.remove();
    if (!mostrar) return;
    const aviso = Veio.montarAviso({
      texto: cheio ? textoDaVoz('BRG-41.cheio') : textoDaVoz('BRG-41.aviso', { pct: Math.floor(usado() * 100) }),
      tom: cheio ? 'perigo' : 'info',
      acao: { rotulo: textoDaVoz('BRG-41.ajustar'), aoUsar: irAoCusto },
      fechavel: false,
    });
    aviso.id = 'painel-teto-aviso';
    document.querySelector('.shell-conteudo').prepend(aviso);
  }

  /** O card da aba Custos, montado uma vez: o campo só é reescrito com o que a Conexão guarda quando a pessoa não está digitando. */
  function montarOCard() {
    const uso = elemento('small');
    const campo = elemento('input', 'veio-campo');
    // Texto, não `type=number`: o número do navegador lê “12,50” conforme o idioma do Chrome (em inglês vira 1250).
    Object.assign(campo, { id: 'anki-teto-campo', type: 'text', inputMode: 'decimal', autocomplete: 'off' });
    campo.setAttribute('aria-label', textoDaVoz('BRG-41.campo'));
    const moeda = elemento('span', 'anki-teto-moeda', textoDaVoz('BRG-41.moeda'));
    moeda.setAttribute('aria-hidden', 'true');
    const salvar = elemento('button', 'veio-botao veio-botao--contorno veio-botao--compacto', textoDaVoz('BRG-41.salvar'));
    salvar.type = 'button';
    const situacao = elemento('p', 'anki-apoio');
    situacao.setAttribute('role', 'status');
    const secao = elemento('section', 'anki-cartao', elemento('h3', null, textoDaVoz('BRG-41.titulo'), ' ', uso),
      elemento('p', 'anki-teto-linha', moeda, campo, salvar), situacao, elemento('p', 'anki-apoio', textoDaVoz('BRG-41.nota')));
    secao.id = 'anki-custos-teto';
    secao.setAttribute('aria-label', textoDaVoz('BRG-41.titulo'));

    salvar.addEventListener('click', async () => {
      const valor = lerNumero(campo.value);
      if (!(valor > 0)) return void (situacao.textContent = textoDaVoz('BRG-41.invalido'));
      try {
        dados = await chamar(PedidoAoAnki.definirOTeto(valor));
        situacao.textContent = textoDaVoz('BRG-41.salvo');
        campo.value = numero(dados.limitUsd);
      } catch {
        situacao.textContent = textoDaVoz('BRG-41.falha');
      }
      desenhar();
    });
    campo.addEventListener('input', () => { situacao.textContent = ''; });
    return { secao, uso, campo };
  }

  let card = null;
  function desenharOCard() {
    const custos = porId('anki-custos');
    if (!custos) return;
    if (!dados) return void card?.secao.remove();
    if (!card) card = montarOCard();
    if (!card.secao.isConnected) porId('anki-custos-corpo').before(card.secao);
    card.uso.textContent = `· ${textoDaVoz('BRG-41.uso', { gasto: dinheiro(dados.spentUsd), teto: dinheiro(dados.limitUsd) })}`;
    if (document.activeElement !== card.campo && !card.campo.value) card.campo.value = numero(dados.limitUsd);
  }

  function desenhar() {
    desenharOAviso();
    desenharOCard();
  }

  /** O teto é lido quando a situação da Conexão muda, ao entrar na área e a cada volta de um Envio andando (painel-envio.js), não a cada saúde de 15 s. */
  let situacaoVista = null;
  function aoSituacao(situacao) {
    if (situacao === situacaoVista) return;
    situacaoVista = situacao;
    return ler();
  }

  function iniciar() {
    ConexaoAnki.acompanhar(aoSituacao);
    raiz.Shell.aoEntrarNaArea('anki', ler);
  }

  raiz.TetoDoMes = Object.freeze({ atualizar: ler });
  document.addEventListener('DOMContentLoaded', iniciar);

  // O cartão do Envio: parado de pé, sem valor, só o que a pessoa faz agora (Ver Custos) e o que acontece depois.
  const noTeto = estado => estado?.waiting?.reason === 'monthly_cap' && !FIM.includes(estado.status);

  function verCustos() {
    document.querySelectorAll('.veio-scrim:not([hidden]) .veio-modal__fechar').forEach(fechar => fechar.click());
    location.hash = '#anki/custos';
  }

  /** O motivo e a ação do cartão do Envio pausado pelo teto, ou null (o Envio não espera o teto). */
  function pedido(envio, estado) {
    if (!noTeto(estado)) return null;
    return {
      motivo: [textoDaVoz('ENV-21.pausado'), textoDaVoz('ENV-21.continua')],
      acoes: [{ rotulo: textoDaVoz('ENV-21.custos'), foco: 'ver-custos', aoUsar: verCustos }],
    };
  }

  raiz.EnvioNoTeto = Object.freeze({ pedido });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
