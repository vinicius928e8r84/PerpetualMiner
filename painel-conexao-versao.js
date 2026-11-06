'use strict';

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
// Carregado depois de lib/abridor.js, lib/abrir-o-anki.js e painel-shell.js.

(function (raiz) {
  const { textoDaVoz, Veio, ConexaoAnki, PedidoAoAnki, Abridor, AbrirOAnki } = raiz;
  const { SITUACAO } = ConexaoAnki;
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
    if (!velhaDemais(saude.versao)) {
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

  async function iniciar() {
    try {
      estado.vista = (await chrome.storage.local.get({ [CHAVE_DA_ATUALIZADA_VISTA]: null }))[CHAVE_DA_ATUALIZADA_VISTA];
    } catch {
    }
    ConexaoAnki.acompanhar(desenhar);
  }

  raiz.ConexaoVersao = { iniciar };
  iniciar();
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
