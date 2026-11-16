'use strict';

(function (raiz) {
  const { textoDaVoz, Veio, ConexaoAnki, PedidoAoAnki } = raiz;
  const { SITUACAO } = ConexaoAnki;
  const AVISO_A_PARTIR_DE = 0.8;
  const FIM = ['completed', 'partial', 'failed'];

  const porId = id => document.getElementById(id);
  let dados = null;
  let assinaturaDoAviso = '';

  const dinheiro = valor => textoDaVoz('BRG-03.valor', { valor: valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
  const numero = valor => valor.toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false });
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

  async function ler() {
    if (ConexaoAnki.situacao() !== SITUACAO.LIGADA) {
      dados = null;
      return desenhar();
    }
    try {
      dados = await chamar(PedidoAoAnki.tetoDoMes());
    } catch {
      return;
    }
    desenhar();
  }

  function irAoCusto() {
    addEventListener('hashchange', () => porId('anki-teto-campo')?.focus(), { once: true });
    if (location.hash === '#anki/custos') porId('anki-teto-campo')?.focus();
    else location.hash = '#anki/custos';
  }

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

  const noTeto = estado => estado?.waiting?.reason === 'monthly_cap' && !FIM.includes(estado.status);

  function verCustos() {
    document.querySelectorAll('.veio-scrim:not([hidden]) .veio-modal__fechar').forEach(fechar => fechar.click());
    location.hash = '#anki/custos';
  }

  function pedido(envio, estado) {
    if (!noTeto(estado)) return null;
    return {
      motivo: [textoDaVoz('ENV-21.pausado'), textoDaVoz('ENV-21.continua')],
      acoes: [{ rotulo: textoDaVoz('ENV-21.custos'), foco: 'ver-custos', aoUsar: verCustos }],
    };
  }

  raiz.EnvioNoTeto = Object.freeze({ pedido });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
