'use strict';

(function (raiz) {
  const { textoDaVoz } = raiz;
  const { montarAviso, elemento } = raiz.Veio;

  const AUTOMATICO = 'automatico';
  const estado = { modelo: null, erro: false, aberto: null };
  const lugares = new Map();
  let rodada = 0;

  const pedir = pedido => raiz.ConversaComOAnki.pedir(pedido, { prazoMs: 8000 });

  const ehEstadoDoModelo = lido => Array.isArray(lido?.modelos) && typeof lido.escolha === 'string';

  async function reler() {
    const minha = ++rodada;
    const resposta = await pedir(raiz.PedidoAoAnki.estadoDoModelo());
    if (minha !== rodada) return;
    const lido = resposta.status === 200 ? resposta.dados : null;
    estado.modelo = ehEstadoDoModelo(lido) ? lido : null;
    estado.erro = resposta.status === 503;
    desenharTudo();
  }

  async function escolher(modelo) {
    const minha = ++rodada;
    const resposta = await pedir(raiz.PedidoAoAnki.escolherOModelo(modelo));
    if (minha !== rodada) return;
    if (resposta.status === 200) return reler();
    estado.erro = true;
    desenharTudo();
  }
  const botao = (rotulo, aoUsar) => Object.assign(elemento('button', 'veio-botao veio-botao--contorno', rotulo), { type: 'button', onclick: aoUsar });

  const dia = saida => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${saida}T12:00:00Z`));

  function seletor(lugar, { escolha, modelos }) {
    const campo = elemento('select', 'veio-campo');
    campo.id = `${lugar.prefixo}-ia-modelo`;
    campo.append(new Option(textoDaVoz('CFG-44.automatico'), AUTOMATICO), ...modelos.map(modelo => new Option(modelo, modelo)));
    campo.value = escolha;
    campo.addEventListener('change', () => escolher(campo.value));
    return campo;
  }

  function avisoDaSaida(campo, { modelo, saida }) {
    const aviso = montarAviso({
      tom: 'info', icone: 'alerta', fechavel: false,
      texto: textoDaVoz('CFG-44.aviso', { modelo, data: dia(saida) }),
      acao: { rotulo: textoDaVoz('CFG-44.trocarAgora'), aoUsar: () => escolher(AUTOMATICO) },
    });
    aviso.classList.add('ia-modelo__aviso');
    aviso.querySelector('.veio-aviso__acoes').append(botao(textoDaVoz('CFG-44.escolherOutro'), () => campo.focus()));
    return aviso;
  }

  function corpo(lugar, dados) {
    const campo = seletor(lugar, dados);
    const rotulo = Object.assign(elemento('label', 'ajustes-campo__rotulo', textoDaVoz('CFG-44.titulo')), { htmlFor: campo.id });
    const partes = [elemento('div', 'ajustes-campo', rotulo, campo),
      dados.paga === 'plano' ? raiz.ColunaDoChatGPT.linhaDoPlano() : elemento('p', 'cfg-nota', textoDaVoz('CFG-44.chave'))];
    if (dados.aviso) partes.push(avisoDaSaida(campo, dados.aviso));
    if (dados.trocou) {
      const ponto = elemento('span', 'cfg-ponto');
      ponto.dataset.estado = 'ok';
      ponto.setAttribute('aria-hidden', 'true');
      partes.push(elemento('p', 'cfg-status ia-modelo__trocou', ponto, textoDaVoz(dados.trocou.porque === 'pagador' ? 'CFG-45.trocou' : 'CFG-44.trocou', { modelo: dados.trocou.de })));
    }
    return partes;
  }

  function semALista() {
    return [elemento('p', 'cfg-nota', textoDaVoz('CFG-44.erro')), botao(textoDaVoz('CFG-35.erroTentarDeNovo'), reler)];
  }

  const semNadaParaMostrar = () => !estado.erro && !estado.modelo?.paga;

  const temNovidade = ({ aviso, trocou }) => Boolean(aviso || trocou);

  const novidadeAbreOPainel = modelo => !estado.erro && temNovidade(modelo);

  function desenhar(lugar) {
    const registro = lugares.get(lugar);
    const assinatura = JSON.stringify([estado.erro, estado.modelo]);
    if (assinatura === registro.assinatura) return;
    registro.assinatura = assinatura;
    const { modelo } = estado;
    if (semNadaParaMostrar()) return registro.no.replaceChildren();
    const detalhes = elemento('details', 'anki-avancado ia-avancado', elemento('summary', '', textoDaVoz('BRG-32.titulo')),
      elemento('div', 'anki-avancado__corpo', ...(estado.erro ? semALista() : corpo(lugar, modelo))));
    detalhes.open = estado.aberto ?? novidadeAbreOPainel(modelo);
    detalhes.addEventListener('toggle', () => { estado.aberto = detalhes.open; });
    registro.no.replaceChildren(detalhes);
  }

  function desenharTudo() {
    for (const lugar of lugares.keys()) desenhar(lugar);
  }

  function avancado(lugar) {
    if (!lugares.has(lugar)) {
      lugares.set(lugar, { no: elemento('div', 'ia-modelo'), assinatura: null });
      desenhar(lugar);
    }
    return lugares.get(lugar).no;
  }

  const temEstadoParaEsquecer = () => Boolean(estado.modelo || estado.erro);

  function esquecer() {
    rodada += 1;
    Object.assign(estado, { modelo: null, erro: false });
    desenharTudo();
  }

  document.addEventListener('DOMContentLoaded', () => {
    let antes = null;
    raiz.ConexaoAnki.acompanhar(situacao => {
      const ligou = situacao === raiz.ConexaoAnki.SITUACAO.LIGADA && antes !== situacao;
      if (situacao !== raiz.ConexaoAnki.SITUACAO.CONECTANDO) antes = situacao;
      if (ligou) reler();
      else if (antes === raiz.ConexaoAnki.SITUACAO.DESLIGADA && temEstadoParaEsquecer()) esquecer();
    });
    raiz.Shell.aoAbrirASecao('ia', reler);
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area === 'local' && raiz.ChaveDaOpenAI.MARCA in mudancas) reler();
    });
  });

  raiz.ModeloDosCartoes = { avancado, reler };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
