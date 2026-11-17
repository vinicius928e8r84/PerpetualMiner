'use strict';

(function (raiz) {
  const { textoDaVoz, Veio, ConexaoAnki, Shell } = raiz;
  const { elemento } = Veio;
  const { SITUACAO } = ConexaoAnki;
  const porId = id => document.getElementById(id);

  const RECUSAS = new Set(['anki_not_found', 'login_item_failed', 'login_item_unsupported', 'invalid_request']);

  const estado = {
    situacao: SITUACAO.CONECTANDO,
    ligado: null,
    confirmado: false,
    semResposta: null,
    gravando: false,
    falha: null,
    leitura: 0,
  };
  const perfis = {
    lista: null,
    marcado: null,
    escolhendo: false,
    falha: null,
    leitura: 0,
  };
  let partes = null;

  function iniciar() {
    desenhar();
    ConexaoAnki.acompanhar(situacao => {
      const voltou = situacao === SITUACAO.LIGADA && estado.situacao !== SITUACAO.LIGADA;
      estado.situacao = situacao;
      if (situacao !== SITUACAO.LIGADA) estado.confirmado = false;
      if (voltou) { ler(); lerOsPerfis(); }
      else if (situacao === SITUACAO.LIGADA && !estado.confirmado && estado.semResposta === 'falhou' && !estado.gravando) ler();
      desenhar();
    });
    Shell.aoEntrarNaArea('configuracoes', () => { if (estado.situacao === SITUACAO.LIGADA) { ler(); lerOsPerfis(); } });
  }

  async function pedir(pedido) {
    const resposta = await raiz.PedidoAoAnki.pedir(ConexaoAnki.ENDERECO, pedido, { signal: AbortSignal.timeout(ConexaoAnki.TEMPO_DA_RESPOSTA) });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      throw Object.assign(new Error(`HTTP ${resposta.status}${dados?.error ? ` · ${dados.error}` : ''}`), {
        codigo: dados?.error || null,
        status: resposta.status,
      });
    }
    if (typeof dados?.ligado !== 'boolean') throw Object.assign(new Error('Resposta sem “ligado”'), { status: resposta.status });
    return dados.ligado;
  }

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
      estado.falha = { ligar, erro, incerta: !RECUSAS.has(erro.codigo) };
      estado.confirmado = false;
    }
    desenhar();
    if (erro) await ler();
    partes.interruptor.focus();
  }

  async function pedirOPerfil(pedido) {
    const resposta = await raiz.PedidoAoAnki.pedir(ConexaoAnki.ENDERECO, pedido, { signal: AbortSignal.timeout(ConexaoAnki.TEMPO_DA_RESPOSTA) });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) throw Object.assign(new Error(`HTTP ${resposta.status}${dados?.error ? ` · ${dados.error}` : ''}`), { status: resposta.status });
    return dados;
  }

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
    if (perfis.falha && perfis.marcado === perfis.falha.nome) perfis.falha = null;
    desenhar();
  }

  async function escolherOPerfil(nome) {
    perfis.escolhendo = true;
    perfis.falha = null;
    perfis.leitura++;
    desenhar();
    try {
      await pedirOPerfil(raiz.PedidoAoAnki.escolherOPerfil(nome));
    } catch (erro) {
      perfis.falha = { nome, erro };
    }
    perfis.escolhendo = false;
    await lerOsPerfis();
  }

  function oMarcadoSumiu() {
    return perfis.lista !== null && perfis.marcado !== null && !perfis.lista.includes(perfis.marcado);
  }

  function aLinhaDoPerfilAparece() {
    return estado.situacao === SITUACAO.LIGADA && perfis.lista !== null && (perfis.lista.length >= 2 || oMarcadoSumiu());
  }

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
        texto: textoDaVoz('CFG-43.falha'), detalhes: perfis.falha.erro.message, rotuloDeFechar: textoDaVoz('PAI-34'),
        aoFechar: () => { perfis.falha = null; },
      }));
    }
    const linha = elemento('div', 'cfg-linha',
      elemento('div', 'cfg-quem', nome, elemento('span', 'cfg-nota', textoDaVoz('CFG-43.nota'))),
      elemento('div', 'cfg-acoes', elemento('span', 'veio-select', lista)));
    linha.id = 'cfg-anki-perfil';
    return [...avisos, linha];
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

  function desenharOResumo(sabe) {
    const texto = !sabe ? 'CFG-37.indisponivel' : estado.ligado ? 'CFG-37.ligado' : 'CFG-37.desligado';
    porId('cfg-anki-resumo').replaceChildren(elemento('span', null, textoDaVoz(texto)));
  }

  function desenharOPerfil() {
    const aparece = aLinhaDoPerfilAparece();
    const assinatura = JSON.stringify(aparece ? [perfis.lista, perfis.marcado, perfis.escolhendo, perfis.falha?.erro.message ?? null] : null);
    if (assinatura === partes.assinaturaDoPerfil) return;
    partes.assinaturaDoPerfil = assinatura;
    const tinhaFoco = partes.perfil.some(no => no.contains(document.activeElement));
    partes.perfil.forEach(no => no.remove());
    partes.perfil = aparece ? montarALinhaDoPerfil() : [];
    porId('cfg-anki-corpo').append(...partes.perfil);
    if (tinhaFoco) document.getElementById('cfg-anki-perfil-escolha')?.focus();
  }

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

  document.addEventListener('DOMContentLoaded', iniciar);
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
