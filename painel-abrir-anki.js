'use strict';

// O card Conexão com o Anki de Configurações: o interruptor “Abrir o Anki com o
// computador” (história 101, #106). Vem desligado. Ligado, a Conexão escreve o
// item de login (um LaunchAgent no Mac, um atalho na pasta Inicializar no
// Windows); desligado, ela o apaga. O item mora na Conexão, não na extensão:
// por isso o interruptor mostra o que a Conexão diz (`POST
// /abrir-com-o-computador/estado`) e só muda depois da resposta dela (`POST
// /abrir-com-o-computador`, `{ ligado }`). Nada é gravado no storage.
//
// A tela só diz o que a Conexão confirmou (C8): sem a Conexão, com uma que não
// tem a rota (o bridge de hoje), com uma leitura que falha ou com uma resposta que
// não traz um `ligado` verdadeiro ou falso, o interruptor fica indisponível e a nota
// diz por quê, nunca “desligado”. Um pedido que a Conexão recusa deixa o item como
// estava e mostra o aviso persistente (CFG-39), com a causa em Detalhes. Um pedido
// sem resposta (a conexão caiu, passou o prazo) é incerto: o item pode ter mudado,
// então o aviso não afirma nada (CFG-39.incerta), a tela confere por `/estado` e o
// aviso some, ou passa a dizer o que ficou, quando a leitura confirma.
//
// O Anki nunca abre sozinho por aqui: esta tela só escreve ou apaga o item. Toda
// cópia vem do catálogo da Voz.

(function (raiz) {
  const { textoDaVoz, Veio, ConexaoAnki, Shell } = raiz;
  const { SITUACAO } = ConexaoAnki;
  const porId = id => document.getElementById(id);

  /** O que a Conexão responde quando recusa de propósito: o item não foi mexido. Qualquer outra falha deixa o resultado incerto. */
  const RECUSAS = new Set(['anki_not_found', 'login_item_failed', 'login_item_unsupported', 'invalid_request']);

  const estado = {
    situacao: SITUACAO.CONECTANDO,
    ligado: null,        // o último estado que a Conexão confirmou
    confirmado: false,   // `ligado` é o estado de agora: a última leitura ou escrita da Conexão deu certo
    semResposta: null,   // por que não se confirma: 'antiga' (não tem esta rota) ou 'falhou'; null enquanto não se sabe
    gravando: false,     // um pedido de ligar ou desligar no ar
    falha: null,         // { ligar, erro, incerta }: o que não mudou e a causa; `incerta`: a resposta não chegou, o item pode ter mudado
    leitura: 0,          // só a leitura mais recente vale
  };
  let partes = null;     // o conteúdo do card, montado uma vez e atualizado no lugar

  function iniciar() {
    desenhar();
    ConexaoAnki.acompanhar(situacao => {
      const voltou = situacao === SITUACAO.LIGADA && estado.situacao !== SITUACAO.LIGADA;
      estado.situacao = situacao;
      // Sem a Conexão não se sabe o que o item é agora: o que estava confirmado deixa de valer.
      if (situacao !== SITUACAO.LIGADA) estado.confirmado = false;
      if (voltou) ler();
      else if (situacao === SITUACAO.LIGADA && !estado.confirmado && estado.semResposta === 'falhou' && !estado.gravando) ler();
      desenhar();
    });
    // O item pode mudar fora daqui (a pessoa o tira dos Itens de Início): ao entrar na área, lê de novo.
    Shell.aoEntrarNaArea('configuracoes', () => { if (estado.situacao === SITUACAO.LIGADA) ler(); });
  }

  // ─── A Conexão ─────────────────────────────────────────────────────────────

  /** Envia o `pedido` (de `PedidoAoAnki`); devolve o `ligado` da resposta, ou levanta o erro (com o `codigo` e o `status`, se a Conexão respondeu). */
  async function pedir(pedido) {
    const resposta = await raiz.PedidoAoAnki.pedir(ConexaoAnki.ENDERECO, pedido, { signal: AbortSignal.timeout(ConexaoAnki.TEMPO_DA_RESPOSTA) });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      throw Object.assign(new Error(`HTTP ${resposta.status}${dados?.error ? ` · ${dados.error}` : ''}`), {
        codigo: dados?.error || null,
        status: resposta.status,
      });
    }
    // Uma resposta sem um `ligado` verdadeiro ou falso não diz nada: nunca vira “desligado”.
    if (typeof dados?.ligado !== 'boolean') throw Object.assign(new Error('Resposta sem “ligado”'), { status: resposta.status });
    return dados.ligado;
  }

  /** Lê o item de verdade. Uma leitura que já foi ultrapassada (outra começou, ou uma escrita) não decide nada. */
  async function ler() {
    const leitura = ++estado.leitura;
    let ligado = null;
    let erro = null;
    try {
      ligado = await pedir(raiz.PedidoAoAnki.estadoDoItemDeLogin());
    } catch (causa) {
      erro = causa;
    }
    if (leitura !== estado.leitura || estado.gravando) return;
    if (erro) {
      // 404 é uma Conexão que não tem a rota: o bridge de hoje, antes do complemento.
      estado.confirmado = false;
      estado.semResposta = erro.status === 404 ? 'antiga' : 'falhou';
    } else {
      Object.assign(estado, { ligado, confirmado: true, semResposta: null });
      reconciliarOAviso();
    }
    desenhar();
  }

  /** O que a leitura confirmou decide o aviso: o que deu certo não fica como falha, e o que era incerto passa a ser sabido. */
  function reconciliarOAviso() {
    const { falha } = estado;
    if (!falha) return;
    if (estado.ligado === falha.ligar) estado.falha = null;
    else if (falha.incerta) estado.falha = { ...falha, incerta: false };
  }

  async function mudar(ligar) {
    estado.gravando = true;
    estado.falha = null;
    estado.leitura++;
    desenhar();
    let erro = null;
    try {
      Object.assign(estado, { ligado: await pedir(raiz.PedidoAoAnki.abrirComOComputador(ligar)), confirmado: true, semResposta: null });
    } catch (causa) {
      erro = causa;
    }
    estado.gravando = false;
    if (erro) {
      // Sem a resposta (ou com uma que não se entende) não se sabe o que ficou: a tela confere em vez de supor.
      estado.falha = { ligar, erro, incerta: !RECUSAS.has(erro.codigo) };
      estado.confirmado = false;
    }
    desenhar();
    if (erro) await ler();
    partes.interruptor.focus();
  }

  // ─── Card ──────────────────────────────────────────────────────────────────

  function montar() {
    const nome = elemento('b', 'cfg-nome', textoDaVoz('CFG-36.rotulo'));
    nome.id = 'cfg-anki-nome';
    const nota = elemento('span', 'cfg-nota');
    nota.id = 'cfg-anki-nota';
    const interruptor = elemento('input');
    interruptor.type = 'checkbox';
    interruptor.id = 'cfg-anki-interruptor';
    interruptor.setAttribute('role', 'switch');
    interruptor.setAttribute('aria-labelledby', nome.id);
    interruptor.setAttribute('aria-describedby', nota.id);
    interruptor.addEventListener('change', () => mudar(interruptor.checked));
    const aviso = elemento('div', 'cfg-anki-aviso');

    const linha = elemento('div', 'cfg-linha',
      elemento('div', 'cfg-quem', nome, nota),
      elemento('div', 'cfg-acoes', elemento('label', 'veio-toggle', interruptor, elemento('span', 'veio-toggle__trilho'))));
    porId('cfg-anki-corpo').replaceChildren(aviso, linha);
    return { aviso, avisoDe: null, nota, interruptor };
  }

  function desenhar() {
    if (!partes) partes = montar();
    const ligada = estado.situacao === SITUACAO.LIGADA;
    const sabe = ligada && estado.confirmado;
    const lendo = ligada && !estado.confirmado && !estado.semResposta;

    partes.interruptor.checked = sabe && estado.ligado === true;
    partes.interruptor.disabled = !sabe || estado.gravando;
    partes.interruptor.setAttribute('aria-busy', String(estado.gravando || lendo));
    partes.nota.textContent = !ligada ? textoDaVoz('CFG-38.indisponivel')
      : lendo ? textoDaVoz('CFG-38.lendo')
        : !sabe ? textoDaVoz(`CFG-38.${estado.semResposta}`)
          : textoDaVoz('CFG-36.nota');
    desenharOResumo(sabe);
    desenharOAviso();
  }

  /** A linha fechada: o que o item faz agora; sem a Conexão, que não se sabe. */
  function desenharOResumo(sabe) {
    const texto = !sabe ? 'CFG-37.indisponivel' : estado.ligado ? 'CFG-37.ligado' : 'CFG-37.desligado';
    porId('cfg-anki-resumo').replaceChildren(elemento('span', null, textoDaVoz(texto)));
  }

  /** O aviso fica o mesmo nó enquanto a falha é a mesma: o Detalhes aberto e o foco sobrevivem às outras leituras. */
  function desenharOAviso() {
    const { falha } = estado;
    if (falha === partes.avisoDe) return;
    partes.avisoDe = falha;
    if (!falha) {
      partes.aviso.replaceChildren();
      return;
    }
    const texto = falha.incerta ? textoDaVoz('CFG-39.incerta')
      : falha.erro.codigo === 'anki_not_found' ? textoDaVoz('CFG-39.semAnki')
        : falha.erro.codigo === 'login_item_unsupported' ? textoDaVoz('CFG-39.semSuporte')
          : textoDaVoz(falha.ligar ? 'CFG-39.ligar' : 'CFG-39.desligar');
    partes.aviso.replaceChildren(Veio.montarAviso({
      texto,
      detalhes: falha.erro.message,
      rotuloDeFechar: textoDaVoz('PAI-34'),
      aoFechar: () => { estado.falha = null; partes.avisoDe = null; },
    }));
  }

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
