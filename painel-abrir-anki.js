'use strict';

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
  // O perfil fixo (#149): a lista que a Conexão leu do Anki, o marcado e o que a última escolha disse.
  const perfis = {
    lista: null,         // os perfis do Anki; null enquanto a Conexão não os disse
    marcado: null,
    escolhendo: false,   // um pedido de escolha no ar
    falha: null,         // o erro da escolha que a Conexão não fez
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
      if (voltou) { ler(); lerOsPerfis(); }
      else if (situacao === SITUACAO.LIGADA && !estado.confirmado && estado.semResposta === 'falhou' && !estado.gravando) ler();
      desenhar();
    });
    // O item pode mudar fora daqui (a pessoa o tira dos Itens de Início): ao entrar na área, lê de novo.
    Shell.aoEntrarNaArea('configuracoes', () => { if (estado.situacao === SITUACAO.LIGADA) { ler(); lerOsPerfis(); } });
  }

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
      estado.confirmado = false;
      estado.semResposta = raiz.PedidoAoAnki.ausenciaDaRota(erro.status);
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

  /** Pede à Conexão e devolve o JSON da resposta; levanta o erro (com o `status`) se ela não respondeu 2xx. */
  async function pedirOPerfil(pedido) {
    const resposta = await raiz.PedidoAoAnki.pedir(ConexaoAnki.ENDERECO, pedido, { signal: AbortSignal.timeout(ConexaoAnki.TEMPO_DA_RESPOSTA) });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) throw Object.assign(new Error(`HTTP ${resposta.status}${dados?.error ? ` · ${dados.error}` : ''}`), { status: resposta.status });
    return dados;
  }

  /** Lê os perfis do Anki e o marcado. Sem resposta que se entenda (uma Conexão sem a rota, o Anki ocupado) a tela não diz nada de perfis. */
  async function lerOsPerfis() {
    const leitura = ++perfis.leitura;
    let dados = null;
    try {
      dados = await pedirOPerfil(raiz.PedidoAoAnki.perfisDoAnki());
    } catch {
      dados = null;
    }
    if (leitura !== perfis.leitura || perfis.escolhendo) return;
    const entendida = Array.isArray(dados?.profiles) && dados.profiles.every(nome => typeof nome === 'string');
    perfis.lista = entendida ? dados.profiles : null;
    perfis.marcado = entendida && typeof dados.marked === 'string' ? dados.marked : null;
    desenhar();
  }

  /** Marca outro perfil. A tela mostra o que a Conexão ficou com (relido no fim), nunca o que a pessoa pediu. */
  async function escolherOPerfil(nome) {
    perfis.escolhendo = true;
    perfis.falha = null;
    perfis.leitura++;
    desenhar();
    try {
      await pedirOPerfil(raiz.PedidoAoAnki.escolherOPerfil(nome));
    } catch (erro) {
      perfis.falha = erro;
    }
    perfis.escolhendo = false;
    await lerOsPerfis();
  }

  /** Só com 2 ou mais perfis, ou com o marcado que o Anki já não tem (a pessoa precisa escolher outro). */
  function oMarcadoSumiu() {
    return perfis.lista !== null && perfis.marcado !== null && !perfis.lista.includes(perfis.marcado);
  }

  function aLinhaDoPerfilAparece() {
    return estado.situacao === SITUACAO.LIGADA && perfis.lista !== null && (perfis.lista.length >= 2 || oMarcadoSumiu());
  }

  /** A linha “Perfil do Anki ▾” (CFG-43): o aviso em vermelho do marcado que sumiu, o que o Anki não escolheu, e a lista. */
  function montarALinhaDoPerfil() {
    const nome = elemento('label', 'cfg-nome', textoDaVoz('CFG-43.rotulo'));
    nome.htmlFor = 'cfg-anki-perfil-escolha';
    const lista = elemento('select', 'veio-campo');
    lista.id = 'cfg-anki-perfil-escolha';
    lista.disabled = perfis.escolhendo;
    lista.setAttribute('aria-busy', String(perfis.escolhendo));
    lista.append(...perfis.lista.map(perfil => Object.assign(elemento('option'), { value: perfil, textContent: perfil })));
    lista.value = perfis.marcado ?? '';
    if (!perfis.lista.includes(lista.value)) lista.selectedIndex = -1;
    lista.addEventListener('change', () => escolherOPerfil(lista.value));

    const avisos = [];
    if (oMarcadoSumiu()) {
      avisos.push(Veio.montarAviso({ texto: textoDaVoz('CFG-43.sumiu', { perfil: perfis.marcado }), fechavel: false }));
    }
    if (perfis.falha) {
      avisos.push(Veio.montarAviso({
        texto: textoDaVoz('CFG-43.falha'), detalhes: perfis.falha.message, rotuloDeFechar: textoDaVoz('PAI-34'),
        aoFechar: () => { perfis.falha = null; },
      }));
    }
    const linha = elemento('div', 'cfg-linha',
      elemento('div', 'cfg-quem', nome, elemento('span', 'cfg-nota', textoDaVoz('CFG-43.nota'))),
      elemento('div', 'cfg-acoes', elemento('span', 'veio-select', lista)));
    linha.id = 'cfg-anki-perfil';
    return [...avisos, linha]; // filhos diretos do corpo do card, que já os espaça
  }

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
    return { aviso, avisoDe: null, nota, interruptor, perfil: [], assinaturaDoPerfil: null };
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
    desenharOPerfil();
  }

  /** A linha fechada: o que o item faz agora; sem a Conexão, que não se sabe. */
  function desenharOResumo(sabe) {
    const texto = !sabe ? 'CFG-37.indisponivel' : estado.ligado ? 'CFG-37.ligado' : 'CFG-37.desligado';
    porId('cfg-anki-resumo').replaceChildren(elemento('span', null, textoDaVoz(texto)));
  }

  /** A linha do perfil é refeita só quando muda o que ela mostra, para a lista aberta não piscar a cada conferência da Conexão. */
  function desenharOPerfil() {
    const aparece = aLinhaDoPerfilAparece();
    const assinatura = JSON.stringify(aparece ? [perfis.lista, perfis.marcado, perfis.escolhendo, perfis.falha?.message ?? null] : null);
    if (assinatura === partes.assinaturaDoPerfil) return;
    partes.assinaturaDoPerfil = assinatura;
    const tinhaFoco = partes.perfil.some(no => no.contains(document.activeElement));
    partes.perfil.forEach(no => no.remove());
    partes.perfil = aparece ? montarALinhaDoPerfil() : [];
    porId('cfg-anki-corpo').append(...partes.perfil);
    if (tinhaFoco) document.getElementById('cfg-anki-perfil-escolha')?.focus();
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
