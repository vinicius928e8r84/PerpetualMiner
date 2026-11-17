'use strict';

(function (raiz) {
  const { textoDaVoz, Veio, ConexaoAnki, ConexaoNaTela, PareamentoComOAnki, PedidoAoAnki, Abridor, AbrirOAnki, AvisoDaVersao } = raiz;
  const { elemento } = Veio;
  const { SITUACAO } = ConexaoAnki;
  const { ESTADO } = PareamentoComOAnki;
  const { ESTADO: AVISO, EVENTO } = AvisoDaVersao;
  const CHAVE_DA_ATUALIZADA_VISTA = 'pm_conexao_atualizada_vista';
  /** Quanto o Anki tem para fechar (ele sincroniza ao fechar) antes de a extensão desistir de esperar a Conexão calar. */
  const PRAZO_DE_FECHAR_MS = 60 * 1000;
  const FOLGA_DO_FECHAMENTO_MS = 3000;
  const INTERVALO_MS = 1000;

  let maquina = AvisoDaVersao.inicial();
  let assinatura = '';

  const porId = id => document.getElementById(id);
  const espera = ms => new Promise(resolver => setTimeout(resolver, ms));

  async function chamar(pedido, limiteMs) {
    const resposta = await PedidoAoAnki.pedir(ConexaoAnki.ENDERECO, pedido, { signal: AbortSignal.timeout(limiteMs) });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return resposta.json();
  }

  function despachar(evento) {
    const antes = maquina;
    maquina = AvisoDaVersao.proxima(maquina, evento);
    desenhar();
    return maquina !== antes;
  }

  function lerASaude() {
    const saude = ConexaoAnki.situacao() === SITUACAO.LIGADA ? ConexaoAnki.saude() : null;
    despachar({ tipo: EVENTO.LEITURA, leitura: saude && { versao: saude.versao, atualizacao: saude.atualizacao, antiga: ConexaoAnki.pareamento() === ESTADO.ANTIGA } });
  }

  async function atualizarAgora() {
    if (!despachar({ tipo: EVENTO.ATUALIZAR })) return;
    let resultado;
    try {
      resultado = await chamar(PedidoAoAnki.atualizarAConexao(), 60 * 1000);
    } catch {
      resultado = { estado: 'falhou', versao: null };
    }
    await ConexaoAnki.conferir();
    despachar({ tipo: EVENTO.ATUALIZOU, resultado });
  }

  /** O clique de Reiniciar o Anki. A permissão do abridor é pedida primeiro, no gesto; sem ela o Anki não é fechado (ninguém o abriria de volta). */
  async function reiniciarOAnki() {
    const permissao = Abridor.pedirPermissao();
    if (!despachar({ tipo: EVENTO.REINICIAR })) return;
    let desfecho = EVENTO.NAO_REINICIOU;
    try {
      if (!await permissao) {
        desfecho = EVENTO.SEM_PERMISSAO;
      } else {
        await chamar(PedidoAoAnki.reiniciarOAnki(), 15 * 1000);
        await esperarCalar();
        await espera(FOLGA_DO_FECHAMENTO_MS);
        const aberto = await Abridor.abrirOAnki();
        if (aberto.resultado === Abridor.RESULTADO.ABRIU && await AbrirOAnki.esperarOAnki()) desfecho = EVENTO.REINICIOU;
      }
    } catch {
    }
    await ConexaoAnki.conferir();
    despachar({ tipo: desfecho });
  }

  async function esperarCalar() {
    for (let esperado = 0; esperado <= PRAZO_DE_FECHAR_MS; esperado += INTERVALO_MS) {
      if (await ConexaoAnki.conferir() !== SITUACAO.LIGADA) return;
      await espera(INTERVALO_MS);
    }
    throw new Error('o Anki não fechou');
  }

  const FALA = {
    [AVISO.VELHA]: () => ({ texto: textoDaVoz('BRG-50.velha'), tom: 'perigo', acao: { rotulo: textoDaVoz('BRG-50.atualizarAgora'), aoUsar: atualizarAgora } }),
    [AVISO.ATUALIZANDO]: () => ({ texto: textoDaVoz('BRG-50.atualizando'), tom: 'info' }),
    [AVISO.FALHOU]: versao => ({
      texto: textoDaVoz('BRG-50.falhou', { versao: versao || textoDaVoz('BRG-50.versaoAnterior') }), tom: 'perigo',
      acao: { rotulo: textoDaVoz('BRG-50.tentarDeNovo'), aoUsar: atualizarAgora },
    }),
    [AVISO.NO_DISCO]: versao => ({ texto: textoDaVoz('BRG-50.atualizadaReiniciar', { versao }), tom: 'info', acao: { rotulo: textoDaVoz('BRG-50.reiniciar'), aoUsar: reiniciarOAnki } }),
    [AVISO.REINICIANDO]: () => ({ texto: textoDaVoz('BRG-50.reiniciando'), tom: 'info' }),
    [AVISO.NAO_REINICIOU]: () => ({ texto: textoDaVoz('BRG-50.reiniciarFalhou'), tom: 'info', acao: maquina.leitura ? { rotulo: textoDaVoz('BRG-50.reiniciar'), aoUsar: reiniciarOAnki } : null }),
    [AVISO.SEM_ABRIDOR]: () => ({ texto: textoDaVoz('BRG-50.semAbridor'), tom: 'info' }),
    [AVISO.ATUALIZADA]: versao => ({ texto: textoDaVoz('BRG-50.atualizada', { versao }), tom: 'info', fechavel: true }),
  };

  function desenhar() {
    const { estado, versao } = maquina;
    const fala = FALA[estado]?.(versao);
    if (fala && maquina.leitura?.antiga) fala.acao = null;
    const nova = fala ? JSON.stringify([estado, versao, fala.texto, Boolean(fala.acao)]) : '';
    if (nova === assinatura) return;
    assinatura = nova;
    porId('painel-conexao-versao')?.remove();
    if (!fala) return;
    const aviso = Veio.montarAviso({
      texto: fala.texto,
      tom: fala.tom,
      acao: fala.acao || undefined,
      fechavel: Boolean(fala.fechavel),
      rotuloDeFechar: fala.fechavel ? textoDaVoz('PAI-34') : undefined,
      aoFechar: fala.fechavel ? () => despachar({ tipo: EVENTO.FECHOU }) : undefined,
    });
    aviso.id = 'painel-conexao-versao';
    document.querySelector('.shell-conteudo').prepend(aviso);
    if (estado === AVISO.ATUALIZADA && maquina.mostrada !== versao) {
      chrome.storage.local.set({ [CHAVE_DA_ATUALIZADA_VISTA]: versao });
      despachar({ tipo: EVENTO.MOSTROU });
    }
  }

  const conectando = {
    fase: 'inicio',
    mensagem: null,
    ocupado: false,
    assinatura: '',
    desenhado: null,
  };

  function dizer(mensagem) {
    if (!mensagem) return '';
    if (mensagem.tipo === 'errado') return textoDaVoz('BRG-52.errado', { n: mensagem.n });
    return textoDaVoz(`BRG-52.${mensagem.tipo}`);
  }

  async function conectar() {
    if (conectando.ocupado) return;
    conectando.ocupado = true;
    const resposta = await PareamentoComOAnki.comecar(ConexaoAnki.ENDERECO);
    conectando.ocupado = false;
    conectando.fase = resposta.ok ? 'codigo' : 'inicio';
    conectando.mensagem = resposta.ok ? null : { tipo: 'naoConfirmou' };
    desenharOPareamento();
    if (resposta.ok) porId('painel-pareamento-campo')?.focus();
  }

  async function confirmar(campo) {
    if (conectando.ocupado || !campo.value.trim()) return;
    conectando.ocupado = true;
    const resposta = await PareamentoComOAnki.concluir(ConexaoAnki.ENDERECO, campo.value);
    conectando.ocupado = false;
    if (resposta.ok) {
      Object.assign(conectando, { fase: 'inicio', mensagem: null });
      await ConexaoAnki.tentarDeNovo();
      Veio.mostrarToastDeSucesso(ConexaoNaTela.texto(SITUACAO.LIGADA));
      return;
    }
    if (resposta.erro === 'errado') conectando.mensagem = { tipo: 'errado', n: resposta.restam };
    else if (resposta.erro === 'venceu') Object.assign(conectando, { fase: 'inicio', mensagem: { tipo: 'venceu' } });
    else conectando.mensagem = { tipo: 'naoConfirmou' };
    desenharOPareamento();
    porId('painel-pareamento-campo')?.focus();
  }

  function montarOCodigo() {
    const pergunta = elemento('p', null, textoDaVoz('BRG-52.digite'));
    pergunta.id = 'painel-pareamento-pergunta';
    const campo = elemento('input', 'veio-campo painel-pareamento__campo');
    Object.assign(campo, { id: 'painel-pareamento-campo', type: 'text', autocomplete: 'off', spellcheck: false, maxLength: 16 });
    campo.setAttribute('aria-labelledby', pergunta.id);
    const botao = elemento('button', 'veio-botao veio-botao--primario veio-botao--compacto', textoDaVoz('BRG-52.confirmar'));
    botao.type = 'button';
    const resposta = elemento('p', 'anki-apoio');
    resposta.id = 'painel-pareamento-resposta';
    resposta.setAttribute('role', 'alert');
    botao.addEventListener('click', () => confirmar(campo));
    campo.addEventListener('keydown', evento => { if (evento.key === 'Enter') confirmar(campo); });
    return elemento('section', 'anki-cartao painel-pareamento', pergunta, elemento('p', 'painel-pareamento__linha', campo, botao), resposta);
  }

  function visaoDoPareamento() {
    if (ConexaoAnki.situacao() !== SITUACAO.LIGADA) return null;
    const pareamento = ConexaoAnki.pareamento();
    if (pareamento !== ESTADO.A_PAREAR && pareamento !== ESTADO.NAO_CONFIRMADA) return null;
    if (pareamento === ESTADO.NAO_CONFIRMADA) return { tipo: 'naoConfirmada' };
    return { tipo: conectando.fase === 'codigo' ? 'codigo' : 'inicio' };
  }

  function desenharOPareamento() {
    const atual = visaoDoPareamento();
    const assinatura = atual ? JSON.stringify([atual.tipo, conectando.mensagem]) : '';
    if (assinatura === conectando.assinatura) return;
    conectando.assinatura = assinatura;
    const aberto = porId('painel-pareamento');
    if (atual?.tipo === 'codigo' && conectando.desenhado === 'codigo' && aberto) {
      aberto.querySelector('#painel-pareamento-resposta').textContent = dizer(conectando.mensagem);
      return;
    }
    const tinhaFoco = aberto?.contains(document.activeElement);
    aberto?.remove();
    conectando.desenhado = atual?.tipo ?? null;
    if (!atual) return;
    let no;
    if (atual.tipo === 'codigo') {
      no = montarOCodigo();
      no.querySelector('#painel-pareamento-resposta').textContent = dizer(conectando.mensagem);
    } else {
      const naoConfirmada = atual.tipo === 'naoConfirmada';
      no = Veio.montarAviso({
        texto: dizer(conectando.mensagem) || textoDaVoz(naoConfirmada ? 'BRG-52.naoConfirmou' : 'BRG-52.conectar'),
        tom: naoConfirmada || conectando.mensagem ? 'perigo' : 'info',
        acao: naoConfirmada
          ? { rotulo: textoDaVoz('BRG-50.tentarDeNovo'), aoUsar: () => ConexaoAnki.tentarDeNovo() }
          : { rotulo: textoDaVoz('BRG-52.botao'), aoUsar: conectar },
        fechavel: false,
      });
    }
    no.id = 'painel-pareamento';
    ponhaNoLugar(no);
    if (tinhaFoco) no.querySelector('input, button')?.focus();
  }

  function ponhaNoLugar(no) {
    const boasVindas = porId('boas-vindas');
    const noPasso = [...document.querySelectorAll('.pc-pareamento')].find(lugar => lugar.offsetParent !== null);
    if (noPasso) noPasso.append(no);
    else if (boasVindas && !boasVindas.hidden) boasVindas.insertBefore(no, boasVindas.querySelector('.bv-grade'));
    else document.querySelector('.shell-conteudo').prepend(no);
  }

  async function iniciar() {
    try {
      maquina = AvisoDaVersao.inicial({ vista: (await chrome.storage.local.get({ [CHAVE_DA_ATUALIZADA_VISTA]: null }))[CHAVE_DA_ATUALIZADA_VISTA] });
    } catch {
    }
    ConexaoAnki.acompanhar(lerASaude);
    ConexaoAnki.acompanhar(desenharOPareamento);
    PareamentoComOAnki.aoMudar(desenharOPareamento);
    addEventListener('hashchange', () => setTimeout(() => raiz.ConexaoVersao.reposicionar()));
  }

  raiz.ConexaoVersao = { iniciar, conectar, reposicionar: () => { const no = porId('painel-pareamento'); if (no) ponhaNoLugar(no); } };
  iniciar();
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
