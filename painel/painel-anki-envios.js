'use strict';

(function (raiz) {
  const { textoDaVoz, Veio, Contexto, PedidoAoAnki, ConversaComOAnki, SomaDosCustos, RetratoDosCustos } = raiz;
  const { elemento } = Veio;
  const { numero, partes } = SomaDosCustos;
  const { haQuanto } = Contexto;
  const { linhasDosCustos, naoEntraram, situacaoDoDetalhe, statusDoEnvio } = RetratoDosCustos;
  const porId = id => document.getElementById(id);

  let estado = null;
  let desenhar = null;
  let apoio = null;

  function usar(entrada) {
    ({ estado, desenhar, apoio } = entrada);
  }

  function tituloDoEnvio(envio) {
    return textoDaVoz('ENV-08.titulo', { idioma: apoio.nomeDoIdioma(envio.lang).toLowerCase(), n: numero(envio.requestedCards) });
  }

  function listaEDetalhe(envios) {
    if (!envios.some(envio => envio.jobId === estado.escolhido)) estado.escolhido = envios[0]?.jobId || null;
    const escolhido = envios.find(envio => envio.jobId === estado.escolhido);

    const lista = elemento('div', 'anki-lista');
    lista.setAttribute('role', 'listbox');
    lista.setAttribute('aria-label', textoDaVoz('BRG-31.titulo'));
    lista.addEventListener('keydown', evento => andarNaLista(evento, envios));
    for (const envio of envios) lista.append(opcaoDoEnvio(envio));

    const cartaoDaLista = elemento('section', 'anki-cartao anki-cartao--lista',
      elemento('h3', null, textoDaVoz('BRG-31.titulo'), ' ',
        elemento('small', null, `· ${textoDaVoz('BRG-28.envios', { n: envios.length })}`)),
      lista);
    const partesDaTela = [cartaoDaLista];
    if (escolhido) partesDaTela.push(detalheDoEnvio(escolhido));
    return elemento('div', 'anki-lista-e-detalhe', ...partesDaTela);
  }

  function opcaoDoEnvio(envio) {
    const escolhido = envio.jobId === estado.escolhido;
    const meta = [haQuanto(envio.createdAt)];
    if (estado.ids) meta.push(envio.jobId);
    const ponto = elemento('span', `anki-ponto-status anki-ponto-status--${statusDoEnvio(envio).tom}`);
    ponto.setAttribute('aria-hidden', 'true');
    const opcao = elemento('div', 'anki-opcao',
      elemento('span', 'anki-opcao__titulo', tituloDoEnvio(envio), elemento('small', null, meta.join(' · '))),
      elemento('span', 'anki-opcao__valor', ponto, elemento('span', null, apoio.dinheiro(partes(envio).total))));
    opcao.setAttribute('role', 'option');
    opcao.setAttribute('aria-selected', String(escolhido));
    opcao.tabIndex = escolhido ? 0 : -1;
    opcao.dataset.foco = `envio:${envio.jobId}`;
    opcao.addEventListener('click', () => escolherEnvio(envio.jobId));
    return opcao;
  }

  function escolherEnvio(jobId) {
    estado.escolhido = jobId;
    desenhar();
    porId('anki-custos-corpo').querySelector(`[data-foco="${CSS.escape(`envio:${jobId}`)}"]`)?.focus();
  }

  function andarNaLista(evento, envios) {
    const indice = envios.findIndex(envio => envio.jobId === estado.escolhido);
    const destino = {
      ArrowDown: Math.min(envios.length - 1, indice + 1),
      ArrowUp: Math.max(0, indice - 1),
      Home: 0,
      End: envios.length - 1,
    }[evento.key];
    if (destino === undefined) return;
    evento.preventDefault();
    escolherEnvio(envios[destino].jobId);
  }

  function textoDoSelo(envio) {
    if (envio.status === 'completed') return textoDaVoz('ENV-07.concluido');
    if (envio.status === 'failed') return textoDaVoz('ENV-07.falhou');
    if (envio.status === 'partial') {
      return textoDaVoz('BRG-31.emParte', { n: numero(envio.successfulCards), total: numero(envio.requestedCards) });
    }
    const etapa = raiz.Envio?.nomeDaEtapa(envio.stage) || 'naFila';
    return textoDaVoz('BRG-31.enviando', { etapa: textoDaVoz(`ENV-07.${etapa}`) });
  }

  function seloDoEnvio(envio) {
    return elemento('span', `veio-selo ${statusDoEnvio(envio).selo}`, textoDoSelo(envio));
  }

  function detalheDoEnvio(envio) {
    const situacao = situacaoDoDetalhe(envio, estado);
    const detalhe = cabecaDoDetalhe(envio);
    detalhe.append(...avisosDoDetalhe(envio, situacao), custosDoEnvio(envio), imagensDoEnvio(envio));
    if (situacao.retomavel) detalhe.append(apoio.continuar.montar(envio));
    return detalhe;
  }

  function cabecaDoDetalhe(envio) {
    const idDoTitulo = 'anki-detalhe-titulo';
    const meta = [haQuanto(envio.createdAt), apoio.nomeDoIdioma(envio.lang)];
    if (estado.ids) meta.push(envio.jobId);
    const detalhe = elemento('section', 'anki-cartao anki-detalhe',
      elemento('p', 'anki-apoio', meta.join(' · ')),
      elemento('h3', null, tituloDoEnvio(envio)),
      seloDoEnvio(envio));
    detalhe.querySelector('h3').id = idDoTitulo;
    detalhe.setAttribute('aria-labelledby', idDoTitulo);
    return detalhe;
  }

  const linhaDoMotivo = texto => elemento('p', 'anki-motivo', texto);

  function avisosDoDetalhe(envio, { apagado, retomavel, falhaAoRetomar }) {
    if (retomavel) return avisosDeRetomar(envio, falhaAoRetomar);
    const avisos = apagado ? [linhaDoMotivo(textoDaVoz('ENV-24.apagado'))] : [];
    if (envio.lastError) avisos.push(Veio.montarDetalhes(String(envio.lastError)));
    return avisos;
  }

  function avisosDeRetomar(envio, falhaAoRetomar) {
    const avisos = [linhaDoMotivo(falhaAoRetomar ? textoDaVoz('ENV-14.falha') : textoDaVoz('ENV-10.naoEntraram', { n: naoEntraram(envio) }))];
    const causas = [falhaAoRetomar, envio.lastError].filter(Boolean).map(String);
    if (causas.length) avisos.push(Veio.montarDetalhes(causas.join('\n')));
    return avisos;
  }

  function custosDoEnvio(envio) {
    const p = partes(envio);
    const custos = elemento('dl', 'anki-partes', ...linhasDosCustos(p).flatMap(([codigo, valor]) =>
      [elemento('dt', null, textoDaVoz(codigo)), elemento('dd', null, apoio.dinheiro(valor))]));
    custos.append(elemento('dt', 'anki-partes__total', textoDaVoz('BRG-29.total')),
      elemento('dd', 'anki-partes__total', apoio.dinheiro(p.total)));
    return custos;
  }

  function imagensDoEnvio(envio) {
    const imagens = envio.images || {};
    const barra = elemento('div', 'anki-barra-serie anki-barra-serie--grossa');
    barra.setAttribute('aria-hidden', 'true');
    for (const origem of apoio.ORIGENS) {
      const n = numero(imagens[origem.chave]);
      if (!n) continue;
      const pedaco = elemento('i', `anki-serie--${origem.serie}`);
      pedaco.style.flex = String(n);
      barra.append(pedaco);
    }
    const legenda = [
      ['real', textoDaVoz('BRG-31.fotosReais', { n: numero(imagens.real) })],
      ['gerada', textoDaVoz('BRG-09.geradas', { n: numero(imagens.generated) })],
      ['sem', textoDaVoz('BRG-31.semImagem', { n: numero(imagens.skipped) })],
      ['falhou', textoDaVoz('BRG-31.falharam', { n: numero(imagens.failed) })],
    ];
    return elemento('div', 'anki-imagens-do-envio',
      elemento('h4', null, textoDaVoz('BRG-31.imagens')),
      barra,
      elemento('p', 'anki-legenda', ...legenda.map(([serie, texto]) => {
        const marca = elemento('i', `anki-serie--${serie}`);
        marca.setAttribute('aria-hidden', 'true');
        return elemento('span', null, marca, texto);
      })));
  }

  function desenharAvancado(envios, soma) {
    const numeros = [
      [textoDaVoz('BRG-08.escolhaDeImagem'), soma.escolha],
      [textoDaVoz('BRG-08.triagemDeImagem'), soma.triagem],
      [textoDaVoz('BRG-32.totalQuatroCasas'), soma.total],
    ];
    porId('anki-custos-avancado-numeros').replaceChildren(...numeros.map(([rotulo, valor]) =>
      elemento('div', 'anki-numero', elemento('dt', null, rotulo), elemento('dd', null, apoio.dinheiro(valor, { quatroCasas: true })))));

    porId('anki-custos-diagnostico').replaceChildren(...envios.map(envio => {
      const codigo = apoio.CODIGO_DO_IDIOMA[envio.lang];
      const meta = [haQuanto(envio.createdAt), codigo ? textoDaVoz(codigo) : String(envio.lang || '')];
      if (estado.ids) meta.push(envio.jobId);
      const baixar = apoio.botao(textoDaVoz('BRG-23.baixar'), 'veio-botao veio-botao--fantasma veio-botao--compacto',
        () => baixarDiagnostico(envio.jobId));
      return elemento('tr', null,
        elemento('td', null, tituloDoEnvio(envio)),
        elemento('td', 'anki-apoio', meta.join(' · ')),
        elemento('td', 'anki-tabela__acao', baixar));
    }));
    const falha = porId('anki-diagnostico-falha');
    falha.hidden = !estado.diagnosticoFalhou;
    falha.textContent = textoDaVoz('BRG-23.falha');
  }

  async function baixarDiagnostico(jobId) {
    const desfecho = await ConversaComOAnki.pedir(PedidoAoAnki.pacoteDeDiagnostico(jobId));
    estado.diagnosticoFalhou = !desfecho.ok;
    if (desfecho.ok) {
      const url = URL.createObjectURL(new Blob([JSON.stringify(desfecho.dados, null, 2)], { type: 'application/json' }));
      const link = elemento('a');
      link.href = url;
      link.download = `diagnostico-${jobId}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }
    desenhar();
  }

  raiz.EnviosNosCustos = { usar, listaEDetalhe, desenharAvancado };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
