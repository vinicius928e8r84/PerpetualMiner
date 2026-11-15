'use strict';

// O que a Conexão com o Anki precisa antes de ser de confiança, no alto do Painel: a versão (#177, BRG-50) e o pareamento deste navegador (#192, BRG-52).
//
// A versão da Conexão com o Anki no alto do Painel (#177, BRG-50). A Conexão se atualiza sozinha pelo AnkiWeb, em silêncio; a extensão lê a versão e
// a atualização na resposta de saúde (`ConexaoAnki.saude()`) e só fala em três casos:
//
//   velha demais   “A Conexão com o Anki está desatualizada · O Envio espera. Suas frases estão guardadas.” e Atualizar agora
//   falhou         “A Conexão com o Anki segue na versão X.” e Tentar de novo (a tentativa da pessoa, ou a que a Conexão fez sozinha, falhou)
//   atualizada     discreto: “Conexão atualizada · X”, uma vez por versão
//
// Mais nova, ou velha mas funcionando: nada aparece. “Reiniciar o Anki” (um botão, pelo abridor) só aparece quando a Conexão velha demais já tem a
// versão nova no disco: a extensão a precisa na hora. O botão pede a permissão do abridor no clique (antes de qualquer espera), fecha o Anki pelo caminho
// normal dele (`POST /atualizacao/reiniciar`), espera a Conexão calar e o abridor o abre de novo. Sem a permissão o Anki não é fechado: a tela só diz como.
//
// Os estados do aviso e o que leva de um a outro são a máquina de `painel-conexao-versao-estado.js` (`AvisoDaVersao`); este arquivo manda os eventos (a
// leitura da saúde, os cliques, o desfecho de cada pedido) e desenha o estado. O Reiniciar é dono do aviso do clique até o desfecho, com ou sem a Conexão: o
// Anki que fecha e não volta termina em “Não deu para reiniciar o Anki”. `VERSAO_MINIMA` (lá) é a Conexão mais velha que esta extensão aceita; uma Conexão
// que não diz a versão é a de antes de a saúde dizê-la: velha demais.
//
//
// O pareamento (#192): a Conexão só atende quem a assina com um segredo que nasce nela e chega aqui uma vez (lib/pareamento.js; desenho em
// docs/design/pareamento-da-conexao.md). Com a Conexão ligada e este navegador ainda sem pareamento:
//
//   a parear      o aviso “Conecte este navegador ao Anki” e Conectar → o Anki abre o diálogo com o código (ANK-05)
//   o código      “Digite o código que apareceu no Anki”, o campo e Confirmar: certo, o navegador fica conectado; errado, diz quantas tentativas
//                 restam; vencido (5 minutos, ou as 5 tentativas), volta ao Conectar com “O código venceu. Peça outro”
//   não confirmada  a porta respondeu a saúde mas não provou ter o segredo deste navegador: “Algo na porta do Anki não se confirmou. Nada foi enviado”
//                 e Tentar de novo; nenhum pedido privado sai enquanto for assim, e quem já tem credencial nunca é levado a digitar um código por isso
//
// A Conexão antiga (sem o pareamento) não aparece no pareamento: é a velha demais acima, só com o texto: nada é enviado a ela, nem o Atualizar agora nem o
// Reiniciar o Anki. O estado é o de `ConexaoAnki.pareamento()`.
//
// Carregado depois de lib/abridor.js, lib/abrir-o-anki.js, lib/pareamento.js, lib/conexao-na-tela.js, painel-shell.js e painel-conexao-versao-estado.js.

(function (raiz) {
  const { textoDaVoz, Veio, ConexaoAnki, ConexaoNaTela, PareamentoComOAnki, PedidoAoAnki, Abridor, AbrirOAnki, AvisoDaVersao } = raiz;
  const { SITUACAO } = ConexaoAnki;
  const { ESTADO } = PareamentoComOAnki;
  const { ESTADO: AVISO, EVENTO } = AvisoDaVersao;
  const CHAVE_DA_ATUALIZADA_VISTA = 'pm_conexao_atualizada_vista';
  /** Quanto o Anki tem para fechar (ele sincroniza ao fechar) antes de a extensão desistir de esperar a Conexão calar. */
  const PRAZO_DE_FECHAR_MS = 60 * 1000;
  /** O Anki que fechou ainda está saindo quando a Conexão cala: o abridor espera isto antes de abri-lo de novo. */
  const FOLGA_DO_FECHAMENTO_MS = 3000;
  const INTERVALO_MS = 1000;

  /** O aviso da versão: a máquina de `painel-conexao-versao-estado.js` e a assinatura do que está desenhado. */
  let maquina = AvisoDaVersao.inicial();
  let assinatura = '';

  const porId = id => document.getElementById(id);
  const espera = ms => new Promise(resolver => setTimeout(resolver, ms));

  async function chamar(pedido, limiteMs) {
    const resposta = await PedidoAoAnki.pedir(ConexaoAnki.ENDERECO, pedido, { signal: AbortSignal.timeout(limiteMs) });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return resposta.json();
  }

  /** Manda um evento à máquina e desenha o estado novo. Devolve se o estado aceitou o evento (o clique repetido não é aceito). */
  function despachar(evento) {
    const antes = maquina;
    maquina = AvisoDaVersao.proxima(maquina, evento);
    desenhar();
    return maquina !== antes;
  }

  /** O que a saúde diz agora, como a máquina a lê: `null` sem a Conexão ligada. */
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
    await ConexaoAnki.conferir();   // a leitura de agora chega à máquina antes do desfecho: ele já sai com a Conexão como ela está
    despachar({ tipo: desfecho });
  }

  /** Espera a Conexão parar de responder (o Anki fechou); sem isso no prazo, o reinício não deu. */
  async function esperarCalar() {
    for (let esperado = 0; esperado <= PRAZO_DE_FECHAR_MS; esperado += INTERVALO_MS) {
      if (await ConexaoAnki.conferir() !== SITUACAO.LIGADA) return;
      await espera(INTERVALO_MS);
    }
    throw new Error('o Anki não fechou');
  }

  /** O texto e o botão de cada estado do aviso; o estado sem fala (`semConexao`, `emDia`) não tem linha. */
  const FALA = {
    [AVISO.VELHA]: () => ({ texto: textoDaVoz('BRG-50.velha'), tom: 'perigo', acao: { rotulo: textoDaVoz('BRG-50.atualizarAgora'), aoUsar: atualizarAgora } }),
    [AVISO.ATUALIZANDO]: () => ({ texto: textoDaVoz('BRG-50.atualizando'), tom: 'info' }),
    [AVISO.FALHOU]: versao => ({
      texto: textoDaVoz('BRG-50.falhou', { versao: versao || textoDaVoz('BRG-50.versaoAnterior') }), tom: 'perigo',
      acao: { rotulo: textoDaVoz('BRG-50.tentarDeNovo'), aoUsar: atualizarAgora },
    }),
    [AVISO.NO_DISCO]: versao => ({ texto: textoDaVoz('BRG-50.atualizadaReiniciar', { versao }), tom: 'info', acao: { rotulo: textoDaVoz('BRG-50.reiniciar'), aoUsar: reiniciarOAnki } }),
    [AVISO.REINICIANDO]: () => ({ texto: textoDaVoz('BRG-50.reiniciando'), tom: 'info' }),
    // Com a Conexão ligada (o Anki não chegou a fechar) o Reiniciar vale de novo; sem ela, não há a quem pedir.
    [AVISO.NAO_REINICIOU]: () => ({ texto: textoDaVoz('BRG-50.reiniciarFalhou'), tom: 'info', acao: maquina.leitura ? { rotulo: textoDaVoz('BRG-50.reiniciar'), aoUsar: reiniciarOAnki } : null }),
    [AVISO.SEM_ABRIDOR]: () => ({ texto: textoDaVoz('BRG-50.semAbridor'), tom: 'info' }),
    [AVISO.ATUALIZADA]: versao => ({ texto: textoDaVoz('BRG-50.atualizada', { versao }), tom: 'info', fechavel: true }),
  };

  /** O aviso no alto do Painel, em qualquer área; refeito só quando o que ele diz muda. */
  function desenhar() {
    const { estado, versao } = maquina;
    const fala = FALA[estado]?.(versao);
    // A Conexão de antes do pareamento não recebe nada da extensão (nem o Atualizar agora, nem o Reiniciar: nenhum pedido sem assinatura sai): ela se atualiza pelo AnkiWeb e a pessoa reinicia o Anki.
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
    if (estado === AVISO.ATUALIZADA && maquina.mostrada !== versao) {   // “Conexão atualizada” aparece uma vez por versão: gravar na primeira vez que se vê
      chrome.storage.local.set({ [CHAVE_DA_ATUALIZADA_VISTA]: versao });
      despachar({ tipo: EVENTO.MOSTROU });
    }
  }

  // --- o pareamento -------------------------------------------------------------------------------------------------------------

  const conectando = {
    fase: 'inicio',    // 'inicio' (Conectar) | 'codigo' (o campo e Confirmar)
    mensagem: null,    // o que a última tentativa disse: { tipo: 'errado', n } | { tipo: 'venceu' } | { tipo: 'naoConfirmou' } | null
    ocupado: false,    // um pedido à Conexão está no ar
    assinatura: '',
    desenhado: null,   // o tipo da visão que está na tela
  };

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

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
      await ConexaoAnki.tentarDeNovo();   // pareado, a Conexão passa por “conectando” e volta ligada: quem lê dela refaz a leitura
      Veio.mostrarToastDeSucesso(ConexaoNaTela.texto(SITUACAO.LIGADA));
      return;
    }
    if (resposta.erro === 'errado') conectando.mensagem = { tipo: 'errado', n: resposta.restam };
    else if (resposta.erro === 'venceu') Object.assign(conectando, { fase: 'inicio', mensagem: { tipo: 'venceu' } });
    else conectando.mensagem = { tipo: 'naoConfirmou' };
    desenharOPareamento();
    porId('painel-pareamento-campo')?.focus();
  }

  /** O card do código: o campo e Confirmar. Refeito só quando a fase muda (a saúde de 15 s não apaga o que a pessoa digita). */
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

  /** O que o pareamento mostra agora: `null`, ou `{ tipo }` conforme o estado dele. */
  function visaoDoPareamento() {
    if (ConexaoAnki.situacao() !== SITUACAO.LIGADA) return null;
    const pareamento = ConexaoAnki.pareamento();
    if (pareamento !== ESTADO.A_PAREAR && pareamento !== ESTADO.NAO_CONFIRMADA) return null;
    if (pareamento === ESTADO.NAO_CONFIRMADA) return { tipo: 'naoConfirmada' };   // quem já tem credencial nunca é levado a digitar um código por um 401 sem prova (L7)
    return { tipo: conectando.fase === 'codigo' ? 'codigo' : 'inicio' };
  }

  function desenharOPareamento() {
    const atual = visaoDoPareamento();
    const assinatura = atual ? JSON.stringify([atual.tipo, conectando.mensagem]) : '';
    if (assinatura === conectando.assinatura) return;
    conectando.assinatura = assinatura;
    const aberto = porId('painel-pareamento');
    if (atual?.tipo === 'codigo' && conectando.desenhado === 'codigo' && aberto) {   // o código errado só muda a frase: o campo guarda o que a pessoa digitou
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

  /** O pareamento aparece onde a pessoa está: no alto do Painel, ou no alto da Boas-vindas (que esconde o resto do Painel). */
  function ponhaNoLugar(no) {
    const boasVindas = porId('boas-vindas');
    if (boasVindas && !boasVindas.hidden) boasVindas.insertBefore(no, boasVindas.querySelector('.bv-grade'));
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
    addEventListener('hashchange', () => setTimeout(() => { const no = porId('painel-pareamento'); if (no) ponhaNoLugar(no); }));   // a Boas-vindas e o Painel trocam de lugar sem recarregar
  }

  raiz.ConexaoVersao = { iniciar };
  iniciar();
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
