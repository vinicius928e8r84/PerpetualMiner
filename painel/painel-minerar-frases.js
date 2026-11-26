'use strict';

(function (raiz) {
  const { textoDaVoz, Mineracao, TxtDeFrases } = raiz;
  const { mostrarToastDeSucesso } = raiz.Veio;

  const FONTE_MANUAL = 'manual';

  let painel = null;
  let mineracaoEmCurso = false;
  let modalDeMinerar = null;
  const idsMineradosForaDaNuvem = new Set();

  function iniciar(ligacao) {
    painel = ligacao;
    ligarOMenu();
    ligarAsAbas();
    ligarColar();
    ligarOArquivo();
  }

  function ligarOMenu() {
    ligarOBotaoDoMenu(document.getElementById('btn-minerar-frases'));
    ligarOsItensDoMenu(document.getElementById('menu-minerar'));
    ligarOFechamentoDoMenu(document.getElementById('menu-minerar'));
  }

  function ligarOBotaoDoMenu(botao) {
    botao.addEventListener('click', () => {
      if (menuDeMinerarAberto()) fecharMenuDeMinerar();
      else                       abrirMenuDeMinerar(0);
    });
    botao.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      abrirMenuDeMinerar(e.key === 'ArrowUp' ? -1 : 0);
    });
  }

  function ligarOsItensDoMenu(menu) {
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('[data-minerar]');
      if (!item) return;
      fecharMenuDeMinerar();
      escolherModoDeMinerar(item.dataset.minerar);
    });
    menu.addEventListener('keydown', aoTeclarNoMenuDeMinerar);
  }

  function ligarOFechamentoDoMenu(menu) {
    menu.addEventListener('focusout', (e) => {
      if (e.relatedTarget && !e.relatedTarget.closest('.minerar-menu')) fecharMenuDeMinerar({ devolverFoco: false });
    });
    document.addEventListener('click', (e) => {
      if (menuDeMinerarAberto() && !e.target.closest('.minerar-menu')) fecharMenuDeMinerar({ devolverFoco: false });
    });
  }

  function ligarAsAbas() {
    for (const radio of document.querySelectorAll('input[name="aba-minerar"]')) {
      radio.addEventListener('change', () => mostrarAbaDeMinerar(radio.value));
    }
    document.getElementById('btn-minerar-foto').addEventListener('click', () => {
      modalDeMinerar?.fechar();
      abrirFoto();
    });
  }

  function ligarColar() {
    const campo = document.getElementById('minerar-frases');
    campo.placeholder = textoDaVoz('ADD-02');
    document.getElementById('minerar-fonte').placeholder  = textoDaVoz('ADD-12.exemploFonte');
    document.getElementById('minerar-titulo').placeholder = textoDaVoz('ADD-12.exemploTitulo');
    campo.addEventListener('input', () => {
      atualizarContagemDeColar();
      if (linhasColadas().length > 0) mostrarErroDeColar(null);
    });
    document.getElementById('minerar-colar').addEventListener('submit', (e) => {
      e.preventDefault();
      minerarColadas();
    });
  }

  function ligarOArquivo() {
    const escolha = document.getElementById('minerar-arquivo-escolha');
    document.getElementById('btn-minerar-escolher').addEventListener('click', () => escolha.click());
    escolha.addEventListener('change', () => {
      const arquivo = escolha.files?.[0];
      escolha.value = '';
      if (arquivo) importarArquivoTxt(arquivo);
    });
  }

  function itensDoMenuDeMinerar() {
    return [...document.querySelectorAll('#menu-minerar [role="menuitem"]')];
  }

  function menuDeMinerarAberto() {
    return !document.getElementById('menu-minerar').hidden;
  }

  function abrirMenuDeMinerar(indice) {
    document.getElementById('menu-minerar').hidden = false;
    document.getElementById('btn-minerar-frases').setAttribute('aria-expanded', 'true');
    itensDoMenuDeMinerar().at(indice).focus();
  }

  function fecharMenuDeMinerar({ devolverFoco = true } = {}) {
    document.getElementById('menu-minerar').hidden = true;
    const botao = document.getElementById('btn-minerar-frases');
    botao.setAttribute('aria-expanded', 'false');
    if (devolverFoco) botao.focus();
  }

  function aoTeclarNoMenuDeMinerar(e) {
    const itens = itensDoMenuDeMinerar();
    const atual = itens.indexOf(document.activeElement);
    const passos = { ArrowDown: 1, ArrowUp: -1 };
    if (e.key in passos) {
      e.preventDefault();
      itens[(atual + passos[e.key] + itens.length) % itens.length].focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      itens.at(e.key === 'Home' ? 0 : -1).focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      fecharMenuDeMinerar();
    } else if (e.key === 'Tab') {
      fecharMenuDeMinerar({ devolverFoco: false });
    }
  }

  function escolherModoDeMinerar(modo) {
    if (modo === 'foto') abrirFoto();
    else                 abrirMinerarFrases(modo);
  }

  function abrirFoto() {
    chrome.tabs.create({ url: chrome.runtime.getURL('bookreader/bookreader.html') });
  }

  function abrirMinerarFrases(aba) {
    if (mineracaoEmCurso) return;
    document.getElementById('minerar-frases').value = '';
    document.getElementById('minerar-fonte').value  = '';
    document.getElementById('minerar-titulo').value = '';
    mostrarErroDeColar(null);
    atualizarContagemDeColar();
    mostrarArquivoEscolhido(null);
    document.getElementById('minerar-edicao').hidden    = false;
    document.getElementById('minerar-progresso').hidden = true;
    mostrarAbaDeMinerar(aba);

    modalDeMinerar = painel.abrirModal('modal-minerar', () => { modalDeMinerar = null; });
    focarAbaDeMinerar(aba);
  }

  function mostrarAbaDeMinerar(aba) {
    document.querySelector(`input[name="aba-minerar"][value="${aba}"]`).checked = true;
    document.getElementById('minerar-colar').hidden   = aba !== 'colar';
    document.getElementById('minerar-arquivo').hidden = aba !== 'arquivo';
  }

  function focarAbaDeMinerar(aba) {
    document.getElementById(aba === 'colar' ? 'minerar-frases' : 'btn-minerar-escolher').focus();
  }

  function mostrarProgressoDeMinerar(feitas, total) {
    document.getElementById('minerar-edicao').hidden    = true;
    document.getElementById('minerar-progresso').hidden = false;
    document.getElementById('minerar-progresso-rotulo').textContent = textoDaVoz('ADD-04', { n: feitas, total });
    const barra = document.querySelector('#minerar-progresso .minerar-progresso__barra');
    barra.setAttribute('aria-valuenow', String(feitas));
    barra.setAttribute('aria-valuemax', String(total));
    barra.firstElementChild.style.width = `${total ? (feitas / total) * 100 : 0}%`;
  }

  function linhasDoTexto(texto) {
    return texto.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  }

  function linhasColadas() {
    return linhasDoTexto(document.getElementById('minerar-frases').value);
  }

  function atualizarContagemDeColar() {
    const n = linhasColadas().length;
    document.getElementById('minerar-contagem').textContent = textoDaVoz('PAI-05', { n });
    document.getElementById('btn-minerar-colar').textContent = n
      ? textoDaVoz('ADD-12.minerar', { n })
      : textoDaVoz('ADD-01.botao');
  }

  function mostrarErroDeColar(mensagem) {
    const campo = document.getElementById('minerar-frases');
    const erro  = document.getElementById('minerar-frases-erro');
    erro.textContent = mensagem || '';
    erro.hidden = !mensagem;
    if (mensagem) campo.setAttribute('aria-invalid', 'true');
    else          campo.removeAttribute('aria-invalid');
  }

  async function umaMineracaoPorVez(minerar) {
    if (mineracaoEmCurso) return;
    mineracaoEmCurso = true;
    try { await minerar(); }
    finally { mineracaoEmCurso = false; }
  }

  function minerarColadas() {
    return umaMineracaoPorVez(minerarColadasAgora);
  }

  async function minerarColadasAgora() {
    const linhas = linhasColadas();
    if (linhas.length === 0) {
      mostrarErroDeColar(textoDaVoz('ADD-03'));
      document.getElementById('minerar-frases').focus();
      return;
    }
    const fonte  = document.getElementById('minerar-fonte').value.trim() || FONTE_MANUAL;
    const titulo = document.getElementById('minerar-titulo').value.trim();
    const resultado = await minerarEmSequencia(linhas.map(texto => ({ texto, contexto: { fonte, titulo, detalhe: '' } })));
    concluirMineracao(resultado, n => textoDaVoz('ADD-05', { n }));
  }

  function mostrarArquivoEscolhido(nome) {
    document.getElementById('minerar-arquivo-nome').textContent = nome || textoDaVoz('ADD-12.arquivo');
    document.getElementById('btn-minerar-escolher').textContent =
      textoDaVoz(nome ? 'ADD-12.escolherOutro' : 'ADD-12.escolher');
    document.getElementById('btn-minerar-arquivo-sair').textContent = textoDaVoz('ADD-12.cancelar');
    mostrarFimDoArquivo({});
  }

  function mostrarFimDoArquivo({ erro, resultado }) {
    const noErro      = document.getElementById('minerar-arquivo-erro');
    const noResultado = document.getElementById('minerar-arquivo-resultado');
    noErro.textContent      = erro || '';
    noErro.hidden           = !erro;
    noResultado.textContent = resultado || '';
    noResultado.hidden      = !resultado;
    if (resultado) document.getElementById('btn-minerar-arquivo-sair').textContent = textoDaVoz('ADD-12.fechar');
  }

  function importarArquivoTxt(arquivo) {
    return umaMineracaoPorVez(() => importarArquivoTxtAgora(arquivo));
  }

  async function importarArquivoTxtAgora(arquivo) {
    mostrarArquivoEscolhido(arquivo.name);

    let conteudo;
    try { conteudo = await lerArquivoDeTexto(arquivo); }
    catch { mostrarFimDoArquivo({ erro: textoDaVoz('ADD-07') }); return; }

    const linhas = linhasDoTexto(conteudo);
    if (linhas.length === 0) { mostrarFimDoArquivo({ erro: textoDaVoz('ADD-08') }); return; }

    const { novas, duplicadas, invalidas } = separarNovasDeRepetidasEIlegiveis(linhas);
    if (novas.length === 0) {
      mostrarFimDoArquivo({ resultado: textoDaVoz(`ADD-09.${parteSemNovas({ duplicadas, invalidas })}`, { duplicadas, invalidas }) });
      return;
    }

    const resultado = await minerarEmSequencia(novas);
    concluirMineracao(resultado, n => (duplicadas > 0
      ? textoDaVoz('ADD-10', { n, duplicadas })
      : textoDaVoz('ADD-05', { n })));
  }

  function separarNovasDeRepetidasEIlegiveis(linhas) {
    const jaExistem = new Set(painel.frases().map(f => chaveDeRepetida(f.texto)));
    const novas = [];
    let duplicadas = 0;
    let invalidas  = 0;
    for (const linha of linhas) {
      const lida = TxtDeFrases.ler(linha);
      if (!lida) { invalidas++; continue; }
      const chave = chaveDeRepetida(lida.texto);
      if (jaExistem.has(chave)) { duplicadas++; continue; }
      jaExistem.add(chave);
      novas.push(lida);
    }
    return { novas, duplicadas, invalidas };
  }

  function parteSemNovas({ duplicadas, invalidas }) {
    if (!invalidas) return 'soRepetidas';
    return duplicadas ? 'ambas' : 'soIlegiveis';
  }

  async function lerArquivoDeTexto(arquivo) {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (texto.includes('\u0000')) throw new Error('arquivo binário');
    return texto;
  }

  function chaveDeRepetida(texto) {
    return texto.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  async function minerarEmSequencia(frases) {
    const mineradas = [];
    let erroLocal = null;
    mostrarProgressoDeMinerar(0, frases.length);
    try {
      for (const { texto, contexto, palavras } of frases) {
        const resposta = await Mineracao.minerar({ texto, contexto, palavras, semNuvem: true });
        if (!resposta.ok) throw new Error(resposta.error);
        mineradas.push(resposta.frase);
        mostrarProgressoDeMinerar(mineradas.length, frases.length);
      }
    } catch (err) {
      erroLocal = err;
    }
    const erroNaNuvem = await painel.sincronizacao().subirFrases(mineradas);
    return { mineradas, erroLocal, erroNaNuvem };
  }

  function concluirMineracao({ mineradas, erroLocal, erroNaNuvem }, textoDoSucesso) {
    modalDeMinerar?.fechar();
    if (erroLocal) painel.avisar('minerar', { texto: textoDaVoz('GLB-01'), erro: erroLocal });
    if (erroNaNuvem) {
      mineradas.forEach(f => idsMineradosForaDaNuvem.add(f.id));
      mostrarAvisoForaDaNuvem(erroNaNuvem);
      return;
    }
    if (!erroLocal && mineradas.length > 0) mostrarToastDeSucesso(textoDoSucesso(mineradas.length));
  }

  function mostrarAvisoForaDaNuvem(erro) {
    painel.falhaNaNuvem(erro);
    painel.avisar('fora-da-nuvem', {
      texto: textoDaVoz('ADD-06.aviso', { n: idsMineradosForaDaNuvem.size }),
      acao: { rotulo: textoDaVoz('ADD-06.tentarDeNovo'), aoUsar: tentarSubirDeNovo },
      aoFechar: () => idsMineradosForaDaNuvem.clear(),
    });
  }

  async function tentarSubirDeNovo() {
    const frases = painel.frases().filter(f => idsMineradosForaDaNuvem.has(f.id));
    const erro = await painel.sincronizacao().subirFrases(frases);
    if (erro) {
      mostrarAvisoForaDaNuvem(erro);
      return;
    }
    idsMineradosForaDaNuvem.clear();
    painel.tirarAviso('fora-da-nuvem');
    painel.sincronizado();
  }

  raiz.MinerarFrases = { iniciar, abrir: abrirMinerarFrases };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
