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
// `VERSAO_MINIMA` é a Conexão mais velha que esta extensão aceita: sobe quando uma função da extensão passa a precisar de uma rota ou de um comportamento
// que as versões de antes não têm. Uma Conexão que não diz a versão é a de antes de a saúde dizê-la: velha demais.
//
//
// O pareamento (#192): a Conexão só atende quem a assina com um segredo que nasce nela e chega aqui uma vez (lib/pareamento.js; desenho em
// docs/design/pareamento-da-conexao.md). Com a Conexão ligada e este navegador ainda sem pareamento:
//
//   a parear      o aviso “Conecte este navegador ao Anki” e Conectar → o Anki abre o diálogo com o código (ANK-05)
//   o código      “Digite o código que apareceu no Anki”, o campo e Confirmar: certo, o navegador fica conectado; errado, diz quantas tentativas
//                 restam; vencido (5 minutos, ou as 5 tentativas), volta ao Conectar com “O código venceu. Peça outro”
//   não confirmada  a porta respondeu a saúde mas não provou ter o segredo deste navegador: “Algo na porta do Anki não se confirmou. Nada foi enviado”
//                 e Tentar de novo; nenhum pedido privado sai enquanto for assim
//
// A Conexão antiga (sem o pareamento) não aparece no pareamento: é a velha demais acima. O estado é o de `ConexaoAnki.pareamento()`.
//
// Carregado depois de lib/abridor.js, lib/abrir-o-anki.js, lib/pareamento.js, lib/conexao-na-tela.js e painel-shell.js.

(function (raiz) {
  const { textoDaVoz, Veio, ConexaoAnki, ConexaoNaTela, PareamentoComOAnki, PedidoAoAnki, Abridor, AbrirOAnki } = raiz;
  const { SITUACAO } = ConexaoAnki;
  const { ESTADO } = PareamentoComOAnki;
  const VERSAO_MINIMA = [0, 4, 0];
  const CHAVE_DA_ATUALIZADA_VISTA = 'pm_conexao_atualizada_vista';
  /** Quanto o Anki tem para fechar (ele sincroniza ao fechar) antes de a extensão desistir de esperar a Conexão calar. */
  const PRAZO_DE_FECHAR_MS = 60 * 1000;
  /** O Anki que fechou ainda está saindo quando a Conexão cala: o abridor espera isto antes de abri-lo de novo. */
  const FOLGA_DO_FECHAMENTO_MS = 3000;
  const INTERVALO_MS = 1000;

  const estado = {
    pedido: null,        // 'atualizando' | 'reiniciando' | null
    resultado: null,     // o que o Atualizar agora respondeu: { estado, versao }
    erroDoReinicio: null, // 'semAbridor' | 'reiniciarFalhou' | null
    vista: null,         // a versão atualizada que a pessoa já viu em outra vez (storage)
    mostrada: null,      // a versão atualizada que esta página já mostrou (fica até a pessoa fechar ou a página fechar)
    fechada: null,
    assinatura: '',
  };

  /** A Conexão de `versao` é velha demais para esta extensão? Sem versão (ou sem ser `a.b.c`), sim. */
  function velhaDemais(versao) {
    if (typeof versao !== 'string' || !/^\d+(\.\d+)*$/.test(versao)) return true;
    const numeros = versao.split('.').map(Number);
    for (let i = 0; i < VERSAO_MINIMA.length; i += 1) {
      if ((numeros[i] ?? 0) !== VERSAO_MINIMA[i]) return (numeros[i] ?? 0) < VERSAO_MINIMA[i];
    }
    return false;
  }

  const porId = id => document.getElementById(id);
  const espera = ms => new Promise(resolver => setTimeout(resolver, ms));

  async function chamar(pedido, limiteMs) {
    const resposta = await PedidoAoAnki.pedir(ConexaoAnki.ENDERECO, pedido, { signal: AbortSignal.timeout(limiteMs) });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return resposta.json();
  }

  /** O que a tela mostra agora, a partir da saúde e do que a pessoa já fez: `{ tipo, versao }` ou `null`. */
  function visao() {
    const saude = ConexaoAnki.situacao() === SITUACAO.LIGADA ? ConexaoAnki.saude() : null;
    if (!saude) return null;
    const atualizacao = saude.atualizacao;
    // A Conexão que não tem o pareamento (404 no `conferir`, #192) é velha demais seja qual for a versão que diz: nenhum pedido privado sai para ela.
    if (!velhaDemais(saude.versao) && ConexaoAnki.pareamento() !== ESTADO.ANTIGA) {
      const nova = atualizacao?.atualizada;
      return nova && nova !== estado.fechada && (nova !== estado.vista || nova === estado.mostrada) ? { tipo: 'atualizada', versao: nova } : null;
    }
    const noDisco = estado.resultado?.estado === 'instalada' ? estado.resultado.versao : atualizacao?.estado === 'instalada' ? atualizacao.versao : null;
    if (noDisco && !velhaDemais(noDisco)) return { tipo: 'reiniciar', versao: noDisco };
    if (estado.resultado || atualizacao?.estado === 'falhou') return { tipo: 'falhou', versao: saude.versao };
    return { tipo: 'velha', versao: saude.versao };
  }

  async function atualizarAgora() {
    estado.pedido = 'atualizando';
    desenhar();
    try {
      estado.resultado = await chamar(PedidoAoAnki.atualizarAConexao(), 60 * 1000);
    } catch {
      estado.resultado = { estado: 'falhou', versao: null };
    }
    estado.pedido = null;
    await ConexaoAnki.conferir();
    desenhar();
  }

  /** O clique de Reiniciar o Anki. A permissão do abridor é pedida primeiro, no gesto; sem ela o Anki não é fechado (ninguém o abriria de volta). */
  async function reiniciarOAnki() {
    const permissao = Abridor.pedirPermissao();
    estado.pedido = 'reiniciando';
    estado.erroDoReinicio = null;
    desenhar();
    try {
      if (!await permissao) {
        estado.erroDoReinicio = 'semAbridor';
      } else {
        await chamar(PedidoAoAnki.reiniciarOAnki(), 15 * 1000);
        await esperarCalar();
        await espera(FOLGA_DO_FECHAMENTO_MS);
        const aberto = await Abridor.abrirOAnki();
        if (aberto.resultado !== Abridor.RESULTADO.ABRIU || !await AbrirOAnki.esperarOAnki()) estado.erroDoReinicio = 'reiniciarFalhou';
        else estado.resultado = null;
      }
    } catch {
      estado.erroDoReinicio = 'reiniciarFalhou';
    }
    estado.pedido = null;
    await ConexaoAnki.conferir();
    desenhar();
  }

  /** Espera a Conexão parar de responder (o Anki fechou); sem isso no prazo, o reinício não deu. */
  async function esperarCalar() {
    for (let esperado = 0; esperado <= PRAZO_DE_FECHAR_MS; esperado += INTERVALO_MS) {
      if (await ConexaoAnki.conferir() !== SITUACAO.LIGADA) return;
      await espera(INTERVALO_MS);
    }
    throw new Error('o Anki não fechou');
  }

  /** O texto e o botão de uma visão. */
  function falaDa({ tipo, versao }) {
    const versaoDita = versao || textoDaVoz('BRG-50.versaoAnterior');
    if (estado.pedido === 'atualizando') return { texto: textoDaVoz('BRG-50.atualizando'), tom: 'info' };
    if (estado.pedido === 'reiniciando') return { texto: textoDaVoz('BRG-50.reiniciando'), tom: 'info' };
    switch (tipo) {
      case 'velha':
        return { texto: textoDaVoz('BRG-50.velha'), tom: 'perigo', acao: { rotulo: textoDaVoz('BRG-50.atualizarAgora'), aoUsar: atualizarAgora } };
      case 'falhou':
        return { texto: textoDaVoz('BRG-50.falhou', { versao: versaoDita }), tom: 'perigo', acao: { rotulo: textoDaVoz('BRG-50.tentarDeNovo'), aoUsar: atualizarAgora } };
      case 'reiniciar':
        return {
          texto: estado.erroDoReinicio ? textoDaVoz(`BRG-50.${estado.erroDoReinicio}`) : textoDaVoz('BRG-50.atualizadaReiniciar', { versao }),
          tom: 'info',
          acao: estado.erroDoReinicio === 'semAbridor' ? null : { rotulo: textoDaVoz('BRG-50.reiniciar'), aoUsar: reiniciarOAnki },
        };
      default:
        return { texto: textoDaVoz('BRG-50.atualizada', { versao }), tom: 'info', fechavel: true };
    }
  }

  /** O aviso no alto do Painel, em qualquer área; refeito só quando o que ele diz muda. */
  function desenhar() {
    const atual = visao();
    const fala = atual && falaDa(atual);
    const assinatura = fala ? JSON.stringify([atual.tipo, atual.versao, fala.texto, Boolean(fala.acao)]) : '';
    if (assinatura === estado.assinatura) return;
    estado.assinatura = assinatura;
    porId('painel-conexao-versao')?.remove();
    if (!fala) return;
    const aviso = Veio.montarAviso({
      texto: fala.texto,
      tom: fala.tom,
      acao: fala.acao || undefined,
      fechavel: Boolean(fala.fechavel),
      rotuloDeFechar: fala.fechavel ? textoDaVoz('PAI-34') : undefined,
      aoFechar: fala.fechavel ? () => fechar(atual.versao) : undefined,
    });
    aviso.id = 'painel-conexao-versao';
    document.querySelector('.shell-conteudo').prepend(aviso);
    if (atual.tipo === 'atualizada' && estado.mostrada !== atual.versao) {   // “Conexão atualizada” aparece uma vez por versão: gravar na primeira vez que se vê
      estado.mostrada = atual.versao;
      chrome.storage.local.set({ [CHAVE_DA_ATUALIZADA_VISTA]: atual.versao });
    }
  }

  function fechar(versao) {
    estado.fechada = versao;
    desenhar();
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
    if (pareamento === ESTADO.NAO_CONFIRMADA) return { tipo: 'naoConfirmada' };
    return pareamento === ESTADO.A_PAREAR ? { tipo: conectando.fase } : null;
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
        texto: naoConfirmada ? textoDaVoz('BRG-52.naoConfirmou') : dizer(conectando.mensagem) || textoDaVoz('BRG-52.conectar'),
        tom: naoConfirmada || conectando.mensagem ? 'perigo' : 'info',
        acao: naoConfirmada
          ? { rotulo: textoDaVoz('BRG-50.tentarDeNovo'), aoUsar: () => ConexaoAnki.tentarDeNovo() }
          : { rotulo: textoDaVoz('BRG-52.botao'), aoUsar: conectar },
        fechavel: false,
      });
    }
    no.id = 'painel-pareamento';
    document.querySelector('.shell-conteudo').prepend(no);
    if (tinhaFoco) no.querySelector('input, button')?.focus();
  }

  async function iniciar() {
    try {
      estado.vista = (await chrome.storage.local.get({ [CHAVE_DA_ATUALIZADA_VISTA]: null }))[CHAVE_DA_ATUALIZADA_VISTA];
    } catch {
    }
    ConexaoAnki.acompanhar(desenhar);
    ConexaoAnki.acompanhar(desenharOPareamento);
    PareamentoComOAnki.aoMudar(desenharOPareamento);
  }

  raiz.ConexaoVersao = { iniciar };
  iniciar();
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
