'use strict';

(function (raiz) {
  const { textoDaVoz, ChaveDaOpenAI, ConexaoAnki, RetratoDaChave } = raiz;
  const { mostrarToastDeSucesso, montarAviso, abrirConfirmacao, elemento } = raiz.Veio;
  const porId = id => document.getElementById(id);

  const ONDE_CRIAR_A_CHAVE = 'https://platform.openai.com/api-keys';
  const ONDE_ADICIONAR_CREDITO = 'https://platform.openai.com/settings/organization/billing/overview';
  const ONDE_VERIFICAR_A_ORGANIZACAO = 'https://platform.openai.com/settings/organization/general';

  const MASCARA_DA_CHAVE = '••••••••';

  const estado = {
    ultimos4: null,
    copia: null,
    focarAoLer: false,
    uid: '',
    contaDaChave: '',
    comConta: false,
  };

  const lugares = [];
  let configuracoes = null;
  let conexaoLigada = false;
  let leituraInicial = Promise.resolve();

  function iniciar() {
    configuracoes = montar(porId('cfg-ia-corpo'), { prefixo: 'cfg' });
    leituraInicial = ChaveDaOpenAI.conferirACopia().catch(() => null);
    leituraInicial.then(lerOQueEstaGuardado);
    chrome.storage.onChanged.addListener(aoMudarOGuardado);
    ConexaoAnki.acompanhar(aoMudarAConexao);
    raiz.Shell.aoAbrirASecao('ia', focarOCampoSeVazio);
  }

  function lerOQueEstaGuardado(tem) {
    estado.copia = conexaoLigada ? tem : null;
    chrome.storage.local.get({ [ChaveDaOpenAI.MARCA]: null, pm_user_info: null }, dados => {
      Object.assign(estado, RetratoDaChave.daMarca(dados[ChaveDaOpenAI.MARCA]), RetratoDaChave.daConta(dados.pm_user_info));
      desenharResumo();
      lugares.forEach(desenhar);
      if (estado.focarAoLer) focarOCampoSeVazio();
    });
  }

  const livre = lugar => !lugar.trocando && !lugar.conferindo;

  function redesenharOsLivres() {
    for (const lugar of lugares) if (livre(lugar)) desenhar(lugar);
  }

  function redesenharOsQueNaoConferem() {
    for (const lugar of lugares) if (!lugar.conferindo) desenhar(lugar);
  }

  function aoMudarOGuardado(mudancas, area) {
    if (area !== 'local') return;
    if ('pm_user_info' in mudancas) aoMudarAConta(mudancas.pm_user_info.newValue);
    if (ChaveDaOpenAI.MARCA in mudancas) aoMudarAChave(mudancas[ChaveDaOpenAI.MARCA].newValue);
  }

  function aoMudarAConta(usuario) {
    Object.assign(estado, RetratoDaChave.daConta(usuario));
    redesenharOsLivres();
  }

  function aoMudarAChave(marca) {
    Object.assign(estado, RetratoDaChave.daMarca(marca));
    rodada += 1;
    estado.copia = null;
    desenharResumo();
    redesenharOsLivres();
    if (conexaoLigada) conferirACopia();
  }

  function aoMudarAConexao(situacao) {
    if (situacao === ConexaoAnki.SITUACAO.CONECTANDO) return;
    const ligada = situacao === ConexaoAnki.SITUACAO.LIGADA;
    conexaoLigada = ligada;
    if (ligada && ConexaoAnki.apresentada() === ConexaoAnki.SITUACAO.LIGADA) esquecerOAParear();
    if (ligada) {
      conferirACopia();
    } else {
      rodada += 1;
      mudarACopia(null);
    }
  }

  function esquecerOAParear() {
    for (const lugar of lugares) {
      if (lugar.erro?.motivo === 'a_parear' && !lugar.conferindo) { lugar.erro = null; desenhar(lugar); }
    }
  }

  function montar(corpo, { prefixo }) {
    const lugar = { corpo, prefixo, trocando: false, conferindo: false, erro: null, digitado: '' };
    lugares.push(lugar);
    if (estado.ultimos4 !== null) desenhar(lugar);
    return lugar;
  }

  const idDe = (lugar, parte) => `${lugar.prefixo}-ia-${parte}`;

  function focarOCampoSeVazio() {
    if (estado.ultimos4 === null) {
      estado.focarAoLer = true;
      return;
    }
    if (!estado.ultimos4 || configuracoes.trocando) porId(idDe(configuracoes, 'campo'))?.focus();
  }

  let rodada = 0;

  async function conferirACopia() {
    await leituraInicial;
    const minha = ++rodada;
    const tem = await ChaveDaOpenAI.conferirACopia().catch(() => null);
    if (minha === rodada) mudarACopia(tem);
  }

  function mudarACopia(tem) {
    if (tem === estado.copia) return;
    estado.copia = tem;
    redesenharOsLivres();
  }

  function desenharResumo() {
    const resumo = porId('cfg-ia-resumo');
    if (!estado.ultimos4) {
      const ponto = elemento('span', 'cfg-ponto');
      ponto.dataset.estado = 'erro';
      ponto.setAttribute('aria-hidden', 'true');
      resumo.replaceChildren(elemento('span', 'cfg-status cfg-status--erro', ponto, textoDaVoz('CFG-28.semChave')));
      return;
    }
    resumo.replaceChildren(elemento('span', 'cfg-chave-mascarada', mascarada()));
  }

  const mascarada = () => MASCARA_DA_CHAVE + estado.ultimos4;

  function desenhar(lugar) {
    const colunaDaChave = estado.ultimos4 && !lugar.trocando
      ? chaveSalva(lugar)
      : campoDaChave(lugar);
    const colunas = elemento('div', 'ia-colunas', colunaDaChave, raiz.ColunaDoChatGPT.coluna(lugar));
    const partes = [colunas];
    if (lugar.erro) partes.push(faixaDoErro(lugar));
    partes.push(raiz.ColunaDoChatGPT.faixa(lugar), elemento('p', 'cfg-nota ia-imagem', textoDaVoz('CFG-35.imagem')),
      raiz.ModeloDosCartoes.avancado(lugar));
    lugar.corpo.classList.add('ia-cartao');
    lugar.corpo.replaceChildren(...partes);
  }

  function colunaDaChave(lugar, ...filhos) {
    const titulo = elemento('h3', 'ia-coluna__titulo', textoDaVoz('CFG-35.chaveTitulo'));
    titulo.id = idDe(lugar, 'chave-titulo');
    const coluna = elemento('section', 'ia-coluna', titulo,
      elemento('p', 'cfg-nota', textoDaVoz('CFG-35.chaveCorpo')), ...filhos);
    coluna.setAttribute('aria-labelledby', titulo.id);
    return coluna;
  }

  function chaveSalva(lugar) {
    const ponto = elemento('span', 'cfg-ponto');
    ponto.dataset.estado = 'ok';
    ponto.setAttribute('aria-hidden', 'true');
    const trocar = botao('contorno', textoDaVoz('CFG-35.chaveTrocar'), () => {
      lugar.trocando = true;
      lugar.erro = null;
      lugar.digitado = '';
      desenhar(lugar);
      porId(idDe(lugar, 'campo')).focus();
    });
    trocar.id = idDe(lugar, 'trocar');
    const apagar = botao('perigo', textoDaVoz('CFG-35.chaveApagar'), () => confirmarApagar(lugar));
    apagar.id = idDe(lugar, 'apagar');

    const linha = elemento('div', 'cfg-linha',
      elemento('div', 'cfg-quem',
        elemento('span', 'cfg-status', ponto, textoDaVoz('CFG-35.chaveSalva')),
        elemento('span', 'cfg-chave-mascarada cfg-chave-mascarada--card', mascarada())),
      elemento('div', 'cfg-acoes', trocar, ...(RetratoDaChave.deOutraConta(estado) ? [] : [apagar])));
    return colunaDaChave(lugar, linha, ...notasDaChave(lugar, true));
  }

  function campoDaChave(lugar) {
    const campo = elemento('input', 'veio-campo cfg-chave-campo');
    campo.id = idDe(lugar, 'campo');
    campo.type = 'text';
    campo.autocomplete = 'off';
    campo.spellcheck = false;
    campo.placeholder = textoDaVoz('CFG-35.chaveCampo');
    campo.setAttribute('aria-label', textoDaVoz('CFG-35.chaveTitulo'));
    campo.value = lugar.digitado;
    campo.disabled = lugar.conferindo;

    const vazia = elemento('p', 'veio-campo-erro', textoDaVoz('CFG-35.chaveVazia'));
    vazia.id = idDe(lugar, 'vazia');
    vazia.hidden = true;
    campo.addEventListener('input', () => {
      lugar.digitado = campo.value;
      marcarVazia(campo, vazia, false);
      if (lugar.erro) {
        lugar.erro = null;
        porId(idDe(lugar, 'erro'))?.remove();
      }
    });

    const conferir = elemento('button', `veio-botao veio-botao--${estado.ultimos4 ? 'secundario' : 'primario'}`,
      textoDaVoz(lugar.conferindo ? 'CFG-35.chaveConferindo' : 'CFG-35.chaveConferir'));
    conferir.type = 'submit';
    conferir.id = idDe(lugar, 'conferir');
    if (lugar.conferindo) conferir.setAttribute('aria-disabled', 'true');
    const acoes = elemento('div', 'cfg-acoes', conferir);
    if (lugar.trocando) {
      const cancelar = botao('fantasma', textoDaVoz('CFG-35.chaveCancelar'), () => {
        lugar.trocando = false;
        lugar.erro = null;
        lugar.digitado = '';
        desenhar(lugar);
        porId(idDe(lugar, 'trocar')).focus();
      });
      cancelar.disabled = lugar.conferindo;
      acoes.append(cancelar);
    }

    const formulario = elemento('form', 'cfg-chave-form',
      elemento('div', 'cfg-chave-entrada', campo, vazia), acoes);
    formulario.noValidate = true;
    formulario.addEventListener('submit', evento => {
      evento.preventDefault();
      conferirAChave(lugar, campo, vazia);
    });
    if (lugar.conferindo) formulario.setAttribute('aria-busy', 'true');

    return colunaDaChave(lugar, formulario, ...notasDaChave(lugar, false));
  }

  function notasDaChaveSalva() {
    const notas = [elemento('p', 'cfg-nota', textoDaVoz(RetratoDaChave.notaDaConta(estado)))];
    const daCopia = RetratoDaChave.notaDaCopia(estado.copia);
    if (daCopia) {
      const copia = elemento('p', 'cfg-nota', textoDaVoz(daCopia.texto));
      copia.dataset.copia = daCopia.copia;
      notas.push(copia);
    }
    return notas;
  }

  function notasDaChave(lugar, salva) {
    const notas = salva ? notasDaChaveSalva() : [];
    const onde = elemento('a', 'veio-botao veio-botao--link', textoDaVoz('CFG-35.chaveOnde'));
    onde.href = ONDE_CRIAR_A_CHAVE;
    onde.target = '_blank';
    onde.rel = 'noopener noreferrer';
    notas.push(elemento('p', 'cfg-nota', textoDaVoz('CFG-35.chaveDica'), ' ', onde));
    return notas;
  }

  function faixaDoErro(lugar) {
    const { motivo, detalhes } = lugar.erro;
    const abrir = url => () => window.open(url, '_blank', 'noopener,noreferrer');
    const tentar = { rotulo: textoDaVoz('CFG-35.erroTentarDeNovo'), aoUsar: () => reenviar(lugar) };
    const cada = {
      recusada: { texto: 'CFG-35.erroRecusada', acao: { rotulo: textoDaVoz('CFG-35.erroTrocar'), aoUsar: () => trocarDeNovo(lugar) } },
      sem_credito: { texto: 'CFG-35.erroSemCredito', acao: { rotulo: textoDaVoz('CFG-35.erroAdicionarCredito'), aoUsar: abrir(ONDE_ADICIONAR_CREDITO) } },
      organizacao_nao_verificada: { texto: 'CFG-35.erroOrganizacao', acao: { rotulo: textoDaVoz('CFG-35.erroVerificarOrganizacao'), aoUsar: abrir(ONDE_VERIFICAR_A_ORGANIZACAO) } },
      openai_fora_do_ar: { texto: 'CFG-35.erroForaDoAr', acao: tentar },
      sem_conexao: { texto: 'CFG-35.erroSemConexao', acao: tentar },
      a_parear: ConexaoAnki.pareamento() === raiz.PareamentoComOAnki.ESTADO.A_PAREAR
        ? { texto: 'BRG-52.chaveAParear', acao: { rotulo: textoDaVoz('BRG-52.botao'), aoUsar: () => raiz.ConexaoVersao.conectar() } }
        : { texto: 'BRG-52.naoConfirmou', acao: tentar },
      conexao_com_erro: { texto: 'CFG-35.erroConexaoComErro', acao: tentar },
      conexao_antiga: { texto: 'CFG-35.erroConexaoAntiga', acao: { rotulo: textoDaVoz('CFG-35.erroAtualizar'), aoUsar: baixarConexao } },
      outra_conta: { texto: 'CFG-35.erroOutraConta', acao: { rotulo: textoDaVoz('CFG-35.erroTrocar'), aoUsar: () => { lugar.trocando = true; trocarDeNovo(lugar); } } },
      apagar_local: { texto: 'CFG-35.erroAoApagar', acao: { rotulo: textoDaVoz('CFG-35.erroTentarDeNovo'), aoUsar: () => apagarAChave(lugar) } },
    }[motivo];
    const aviso = montarAviso({
      abertura: textoDaVoz('CFG-35.erroEntrada'),
      texto: textoDaVoz(cada.texto),
      icone: 'alerta',
      acao: cada.acao,
      detalhes,
      fechavel: false,
    });
    aviso.id = idDe(lugar, 'erro');
    return aviso;
  }

  function marcarVazia(campo, aviso, vazia) {
    aviso.hidden = !vazia;
    if (vazia) {
      campo.setAttribute('aria-invalid', 'true');
      campo.setAttribute('aria-describedby', aviso.id);
    } else {
      campo.removeAttribute('aria-invalid');
      campo.removeAttribute('aria-describedby');
    }
  }

  async function conferirAChave(lugar, campo, vazia) {
    if (lugar.conferindo) return;
    const chave = campo.value.trim();
    if (!chave) {
      marcarVazia(campo, vazia, true);
      campo.focus();
      return;
    }
    await enviarAChave(lugar, chave);
  }

  async function confirmarNaConexao(chave) {
    try {
      return await ChaveDaOpenAI.confirmar(chave);
    } catch (erro) {
      return RetratoDaChave.falhaAoConfirmar(erro);
    }
  }

  async function enviarAChave(lugar, chave) {
    rodada += 1;
    mudarACopia(null);
    lugar.conferindo = true;
    lugar.erro = null;
    lugar.digitado = chave;
    desenhar(lugar);
    porId(idDe(lugar, 'conferir')).focus();
    const resultado = await confirmarNaConexao(chave);
    lugar.conferindo = false;
    if (resultado.ok) chaveConfirmada(lugar, resultado.ultimos4);
    else chaveRecusada(lugar, resultado);
  }

  function esquecerOsOutrosLugares(lugar) {
    for (const outro of lugares) {
      outro.digitado = '';
      if (outro !== lugar && !outro.conferindo) {
        outro.trocando = false;
        outro.erro = null;
      }
    }
  }

  function chaveConfirmada(lugar, ultimos4) {
    lugar.trocando = false;
    esquecerOsOutrosLugares(lugar);
    estado.ultimos4 = ultimos4;
    estado.copia = conexaoLigada ? true : null;
    desenharResumo();
    redesenharOsQueNaoConferem();
    porId(idDe(lugar, 'trocar'))?.focus();
    mostrarToastDeSucesso(textoDaVoz('CFG-35.chaveToast'));
  }

  function chaveRecusada(lugar, { motivo, detalhes }) {
    lugar.erro = { motivo, detalhes };
    desenhar(lugar);
    porId(idDe(lugar, 'campo'))?.focus();
  }

  function confirmarApagar(lugar) {
    abrirConfirmacao({
      id: idDe(lugar, 'apagar-modal'),
      titulo: textoDaVoz('CFG-35.apagarTitulo'),
      corpo: textoDaVoz(estado.comConta ? 'CFG-35.apagarCorpo' : 'CFG-35.apagarCorpoSemConta'),
      cancelar: textoDaVoz('CFG-35.apagarCancelar'),
      confirmar: textoDaVoz('CFG-35.apagarConfirmar'),
      aoConfirmar: () => apagarAChave(lugar),
    });
  }

  async function apagarAChave(lugar) {
    rodada += 1;
    mudarACopia(null);
    let dono;
    try {
      dono = await ChaveDaOpenAI.apagar();
    } catch (erro) {
      lugar.erro = RetratoDaChave.falhaAoApagar(erro);
      desenhar(lugar);
      return;
    }
    chaveApagada(lugar, dono);
  }

  function chaveApagada(lugar, dono) {
    for (const cada of lugares) Object.assign(cada, { trocando: false, erro: null, digitado: '' });
    Object.assign(estado, RetratoDaChave.depoisDeApagar(dono, conexaoLigada));
    desenharResumo();
    redesenharOsQueNaoConferem();
    porId(idDe(lugar, 'campo'))?.focus();
    mostrarToastDeSucesso(textoDaVoz('CFG-35.apagarToast'));
  }

  function reenviar(lugar) {
    if (lugar.digitado.trim()) enviarAChave(lugar, lugar.digitado.trim());
  }

  function trocarDeNovo(lugar) {
    lugar.erro = null;
    lugar.digitado = '';
    desenhar(lugar);
    porId(idDe(lugar, 'campo'))?.focus();
  }

  function botao(variante, rotulo, aoUsar) {
    const b = elemento('button', `veio-botao veio-botao--${variante}`, rotulo);
    b.type = 'button';
    b.addEventListener('click', aoUsar);
    return b;
  }

  document.addEventListener('DOMContentLoaded', iniciar);

  function baixarConexao() {
    const link = document.createElement('a');
    link.href = chrome.runtime.getURL('conexao/perpetualminer.ankiaddon');
    link.download = 'perpetualminer.ankiaddon';
    link.click();
  }

  raiz.CartaoDaIA = { montar, baixarConexao, temChave: () => Boolean(estado.ultimos4), trocarChave: () => {
    location.hash = '#configuracoes/ia';
    configuracoes.trocando = true;
    trocarDeNovo(configuracoes);
  } };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
