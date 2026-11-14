'use strict';

// Minerar frases: o menu do botão, o diálogo de colar ou importar um .txt e o progresso (ADD-01 a ADD-12).

(function (PS) {
  const { ic, pecas, plural } = PS;
  const visao = PS.frases;
  const A = PS.acoes;

  // ---------- Minerar frases (ADD-01 a ADD-12) ----------
  A['frases.menuMinerar'] = botao => PS.abrirMenu(botao, [
    { rotulo: 'Colar', ajuda: 'Uma frase por linha', icone: 'colar', acao: () => abrirMinerar('colar') },
    { rotulo: 'Arquivo .txt', ajuda: 'Importar um .txt com uma frase por linha', icone: 'arquivo', acao: () => abrirMinerar('arquivo') },
    { rotulo: 'Foto', ajuda: 'Abre Minerar de uma foto numa aba nova', icone: 'foto', acao: avisarDaFoto },
  ], { rotulo: 'Minerar frases' });
  A['frases.minerar'] = botao => abrirMinerar(botao.dataset.valor);

  function avisarDaFoto() { PS.avisar('No painel, isto abre Minerar de uma foto numa aba nova (fora deste protótipo)'); }

  let abaDeMinerar = 'colar';
  function corpoDeMinerar() {
    const abas = `<div class="minerar__abas">${pecas.abas({ rotulo: 'Minerar frases', valor: abaDeMinerar, acao: 'frases.abaDeMinerar', chave: 'minerar', opcoes: [['colar', 'Colar'], ['arquivo', 'Arquivo .txt']] })}<button type="button" class="botao botao--fantasma botao--p" data-acao="frases.foto">Foto${ic('externo')}</button></div>`;
    if (abaDeMinerar === 'arquivo') {
      return `${abas}<div class="minerar__arquivo"><span class="vazio__icone">${ic('arquivo')}</span><b id="minerar-arquivo-nome">Escolha um arquivo .txt</b><p class="campo-ajuda">Uma frase por linha. O .txt exportado daqui volta com o contexto. Frases que já estão no histórico ficam de fora.</p>`
        + `<input type="file" id="minerar-arquivo" accept=".txt,text/plain" hidden data-ao-mudar="frases.lerArquivo"><button type="button" class="botao botao--contorno botao--p" data-acao="frases.escolherArquivo">Escolher arquivo</button><p class="campo-erro" id="minerar-arquivo-erro" role="alert" hidden></p></div>`
        + '<div class="dialogo__pe"><button type="button" class="botao botao--contorno" data-acao="camada.fechar">Fechar</button></div>';
    }
    return `${abas}<form class="dialogo__corpo" data-ao-enviar="frases.minerarColadas" novalidate><div class="campo-grupo"><label class="rotulo" for="minerar-frases-campo">Frases</label>`
      + `<textarea class="campo" id="minerar-frases-campo" rows="6" spellcheck="false" placeholder="Cole as frases, uma por linha" aria-describedby="minerar-erro" data-ao-digitar="frases.contarColadas" data-foco-inicial></textarea><span class="campo-erro" id="minerar-erro" role="alert" hidden>Cole pelo menos uma frase.</span></div>`
      + `<div class="minerar__contexto"><div class="campo-grupo"><label class="rotulo" for="minerar-fonte">Fonte</label><input class="campo" id="minerar-fonte" placeholder="livro, web, podcast" autocomplete="off"></div>`
      + `<div class="campo-grupo"><label class="rotulo" for="minerar-titulo">Título</label><input class="campo" id="minerar-titulo" placeholder="Atomic Habits" autocomplete="off"></div></div>`
      + `<div class="dialogo__pe"><span class="empurra campo-ajuda mono" id="minerar-contagem">0 frases</span><button type="button" class="botao botao--contorno" data-acao="camada.fechar">Cancelar</button><button type="submit" class="botao" id="minerar-enviar">Minerar frases</button></div></form>`;
  }
  function abrirMinerar(aba) {
    abaDeMinerar = aba;
    PS.abrirCamada({ rotulo: 'Minerar frases', classe: 'dialogo--largo', conteudo: PS.dialogo({ titulo: 'Minerar frases', corpo: `<div id="minerar-corpo" class="dialogo__corpo">${corpoDeMinerar()}</div>` }) });
  }
  A['frases.abaDeMinerar'] = botao => { abaDeMinerar = botao.dataset.valor; document.getElementById('minerar-corpo').innerHTML = corpoDeMinerar(); };
  A['frases.foto'] = avisarDaFoto;
  const linhasDe = texto => texto.split('\n').map(linha => linha.trim()).filter(Boolean);
  A['frases.contarColadas'] = campo => {
    const n = linhasDe(campo.value).length;
    document.getElementById('minerar-contagem').textContent = `${n} ${plural(n, 'frase', 'frases')}`;
    document.getElementById('minerar-enviar').textContent = n ? `Minerar ${n} ${plural(n, 'frase', 'frases')}` : 'Minerar frases';
    if (n) { campo.removeAttribute('aria-invalid'); document.getElementById('minerar-erro').hidden = true; }
  };
  A['frases.minerarColadas'] = () => {
    const campo = document.getElementById('minerar-frases-campo');
    const linhas = linhasDe(campo.value);
    if (!linhas.length) { campo.setAttribute('aria-invalid', 'true'); document.getElementById('minerar-erro').hidden = false; campo.focus(); return; }   // ADD-03
    minerarLinhas(linhas, { fonte: document.getElementById('minerar-fonte').value.trim().toLowerCase() || 'manual', titulo: document.getElementById('minerar-titulo').value.trim() });
  };
  A['frases.escolherArquivo'] = () => document.getElementById('minerar-arquivo').click();
  A['frases.lerArquivo'] = async campo => {
    const arquivo = campo.files[0];
    if (!arquivo) return;
    const erro = document.getElementById('minerar-arquivo-erro');
    document.getElementById('minerar-arquivo-nome').textContent = arquivo.name;
    const linhas = /\.txt$/i.test(arquivo.name) || arquivo.type === 'text/plain' ? linhasDe(await arquivo.text()) : null;
    if (!linhas) { erro.textContent = 'Não deu para ler este arquivo. Use um .txt com uma frase por linha.'; erro.hidden = false; return; }   // ADD-07
    if (!linhas.length) { erro.textContent = 'O arquivo está vazio.'; erro.hidden = false; return; }   // ADD-08
    minerarLinhas(linhas, { fonte: 'importado', titulo: '' });
  };

  /** Minera as linhas uma a uma, com o progresso no modal (ADD-04); as que já estão no histórico ficam de fora. */
  function minerarLinhas(linhas, { fonte, titulo }) {
    const existentes = new Set(PS.dados.frases.map(frase => frase.texto));
    const novas = [...new Set(linhas)].filter(linha => !existentes.has(linha));
    const repetidas = linhas.length - novas.length;
    if (!novas.length) {   // ADD-09
      PS.fecharCamada();
      PS.avisar(`Nenhuma frase nova: ${repetidas} já ${plural(repetidas, 'estava', 'estavam')} no histórico.`);
      return;
    }
    const corpo = document.getElementById('minerar-corpo');
    corpo.innerHTML = `<div class="minerar__progresso"><b id="minerar-rotulo" aria-live="polite">Minerando 1 de ${novas.length}…</b><div class="progresso progresso--g" role="progressbar" aria-labelledby="minerar-rotulo" aria-valuemin="0" aria-valuemax="${novas.length}" aria-valuenow="0"><i style="width:0"></i></div><p class="campo-ajuda">As frases entram no topo da lista.</p></div>`;
    let feitas = 0;
    const passo = () => {
      if (!document.contains(corpo)) return;
      const texto = novas[feitas];
      PS.dados.frases.unshift({ id: PS.dados.proximoId++, texto, dias: 0, fonte, idioma: /[Ѐ-ӿ]/.test(texto) ? 'ru' : 'en', titulo, detalhe: '', grupos: [] });
      feitas += 1;
      corpo.querySelector('#minerar-rotulo').textContent = `Minerando ${Math.min(feitas + 1, novas.length)} de ${novas.length}…`;
      corpo.querySelector('.progresso').setAttribute('aria-valuenow', feitas);
      corpo.querySelector('.progresso i').style.width = `${feitas / novas.length * 100}%`;
      if (feitas < novas.length) { setTimeout(passo, 260); return; }
      setTimeout(() => {
        PS.fecharCamada();
        if (PS.estado.estado === 'vazio') PS.mudar({ estado: 'normal' }, { redesenhar: false });
        Object.assign(visao, { pagina: 1, busca: '', fonte: '', idioma: '' });
        PS.desenhar();
        PS.avisar(`${feitas} ${plural(feitas, 'frase minerada', 'frases mineradas')}${repetidas ? ` · ${repetidas} já ${plural(repetidas, 'existia', 'existiam')}` : ''}`);   // ADD-05, ADD-10
      }, 350);
    };
    setTimeout(passo, 260);
  }
})(window.PS);
