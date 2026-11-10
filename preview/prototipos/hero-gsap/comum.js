'use strict';

// O que as quatro variantes escrevem do mesmo jeito: os dados como HTML, sem deixar passar marcação, e a chamada,
// que é a da variante Produto de ../hero/ (a tela da extensão primeiro, operada por quem visita, com a demonstração
// do atalho). O que elas movem do mesmo jeito (a linha do tempo da demonstração, as curvas dos tokens, as abas)
// está em variante.js.

(function () {
  const P = (window.ProtoHero = window.ProtoHero || {});


  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  P.esc = texto => String(texto).replace(/[&<>"']/g, c => ESCAPES[c]);

  /** As teclas do atalho, cada uma na sua <kbd>. `data-tecla` é o que a demonstração acende quando a tecla desce. */
  P.teclas = atalho => atalho.map(tecla => `<kbd data-tecla="${P.esc(tecla)}">${P.esc(tecla)}</kbd>`).join('');

  /** O texto de um passo, com `{atalho}` trocado pelas teclas como a landing as escreve (Alt+S). */
  P.comAtalho = (texto, atalho) =>
    P.esc(texto).replace('{atalho}', `<span class="pg-atalho">${atalho.map(tecla => `<kbd>${P.esc(tecla)}</kbd>`).join('+<wbr>')}</span>`);

  /** A frase minerada, com a palavra grifada. */
  P.frase = frase => `${P.esc(frase.antes)}<mark>${P.esc(frase.palavra)}</mark>${P.esc(frase.depois)}`;

  P.fraseInteira = frase => P.esc(`${frase.antes}${frase.palavra}${frase.depois}`);

  /** Uma captura de preview/site/capturas, com as medidas que guardam o lugar dela antes de carregar. */
  P.captura = (captura, { classe = '', preguicosa = false, alt = captura.alt } = {}) =>
    `<img${classe ? ` class="${classe}"` : ''} src="${P.esc(captura.src)}" width="${captura.largura}" height="${captura.altura}"${preguicosa ? ' loading="lazy"' : ''} alt="${P.esc(alt)}">`;

  /** O botão com as teclas: no teclado é o atalho de verdade; no toque, é onde se toca. */
  P.botaoDasTeclas = dados =>
    `<button class="pg-teclas" type="button" data-minerar aria-label="Minerar a legenda (${P.esc(dados.atalho.join('+'))})">${P.teclas(dados.atalho)}</button>`;

  /** O que a legenda da demonstração diz em cada etapa. */
  P.legendaDaEtapa = (dados, etapa) => dados.demo[etapa].replace('{atalho}', dados.atalho.join('+'));

  /** O comando da demonstração: as teclas, a legenda da etapa de agora ("2/3 Você aperta Alt+S.") e o Repetir. */
  P.comando = dados => `
<div class="pg-comando">
  ${P.botaoDasTeclas(dados)}
  <p class="pg-legenda" role="status"><b data-passo>1/3</b> <span data-estado>${P.esc(dados.demo.convite)}</span></p>
  <button class="pg-repetir" type="button" data-repetir>${P.esc(dados.demo.repetir)}</button>
</div>`;

  /**
   * As teclas grandes por cima da captura, na etapa da tecla: o destaque fica onde a pessoa já está olhando. A caixa
   * de fora só guarda o lugar; quem o GSAP move é o corpo, que não tem `transform` no CSS.
   */
  P.teclaNaTela = dados =>
    `<div class="pg-tecla-na-tela" aria-hidden="true"><div class="pg-tecla-corpo">${dados.atalho.map(tecla => `<kbd>${P.esc(tecla)}</kbd>`).join('')}</div></div>`;

  /**
   * As três etapas paradas, lado a lado: a captura de antes, as teclas, a captura de depois, cada uma com a sua
   * legenda. É a demonstração com "menos movimento". As capturas são miniaturas de apoio da tela que já está na
   * página, e por isso não repetem o texto alternativo.
   */
  P.quadros = dados => `
<ol class="pg-quadros" aria-label="A demonstração do atalho, em três quadros" hidden>
  <li class="pg-quadro" data-quadro="antes">
    ${P.captura(dados.capturas.antes, { alt: '', preguicosa: true })}
    <p><b>1</b> ${P.esc(P.legendaDaEtapa(dados, 'antes'))}</p>
  </li>
  <li class="pg-quadro pg-quadro--tecla" data-quadro="tecla">
    <span class="pg-teclas pg-teclas--paradas">${dados.atalho.map(tecla => `<kbd>${P.esc(tecla)}</kbd>`).join('')}</span>
    <p><b>2</b> ${P.esc(P.legendaDaEtapa(dados, 'tecla'))}</p>
  </li>
  <li class="pg-quadro" data-quadro="resultado">
    ${P.captura(dados.capturas.depois, { alt: '', preguicosa: true })}
    <p><b>3</b> ${P.esc(P.legendaDaEtapa(dados, 'resultado'))}</p>
  </li>
</ol>`;

  /** O que a frase vira depois do atalho: uma linha do histórico. O lugar dela existe sempre (vazio, tracejado). */
  P.historico = dados => `
<div class="pg-historico">
  <p class="pg-vazio">${P.esc(dados.demo.vazio)}</p>
  <p class="pg-resultado">
    <span class="pg-idioma">${P.esc(dados.frase.idioma)}</span>
    <span class="pg-frase" lang="${dados.frase.lang}">${P.fraseInteira(dados.frase)}</span>
  </p>
</div>`;

  /**
   * A chamada, a mesma nas quatro: a tela da extensão com a demonstração, e o texto ao lado. Cada variante põe o
   * que é dela em `naTela` (por cima da captura), em `sobOComando` e no lugar do histórico, que pode vir logo
   * abaixo da tela (`historicoPrimeiro`) em vez de abaixo do comando.
   */
  P.chamada = (d, { naTela = '', sobOComando = '', historico = P.historico(d), historicoPrimeiro = false } = {}) => `
  <section class="pg-chamada" aria-labelledby="titulo">
    <figure class="pg-janela" data-demo data-etapa="antes">
      <div class="pg-tela">
        ${P.captura(d.capturas.antes)}
        ${P.captura(d.capturas.depois, { classe: 'pg-depois' })}
        <span class="pg-anel" aria-hidden="true"></span>
        ${P.teclaNaTela(d)}
        ${naTela}
      </div>
      <figcaption${historicoPrimeiro ? ' class="pg-historico-primeiro"' : ''}>
        ${historicoPrimeiro ? historico : ''}
        ${P.comando(d)}
        ${sobOComando}
        ${P.quadros(d)}
        ${historicoPrimeiro ? '' : historico}
      </figcaption>
    </figure>
    <div class="pg-texto">
      <p class="site-selo"><span class="site-selo-ponto" aria-hidden="true"></span>${P.esc(d.selo)}</p>
      <h1 id="titulo">${P.esc(d.titulo.comeco)} <span class="site-brilho">${P.esc(d.titulo.brilho)}</span></h1>
      <p class="pg-lead">${P.esc(d.leadCurto)}</p>
      <div class="pg-acoes">
        <a class="site-botao" href="${d.loja}">${P.esc(d.botao)} <span class="site-seta" aria-hidden="true">→</span></a>
        <a class="site-link" href="#como-funciona">${P.esc(d.link)}</a>
      </div>
      <p class="site-nota">${P.esc(d.nota)}</p>
    </div>
  </section>`;

  /** O cabeçalho do Como funciona, o mesmo nas quatro. */
  P.cabecaDoComo = d => `
    <p class="site-sobretitulo">${P.esc(d.como.sobretitulo)}</p>
    <h2 id="como-funciona-titulo">${P.esc(d.como.titulo)}</h2>`;

  P.numero = indice => String(indice + 1).padStart(2, '0');

  /** A tela de um passo, parada no trecho que o passo conta: o popup, o painel na frase, o painel no envio. */
  P.vistaDoPasso = (d, indice, classe = '') => `
        <figure class="pg-vista${classe ? ` ${classe}` : ''}">
          ${[
            `<div class="pg-recorte pg-recorte--popup">${P.captura(d.capturas.popup, { preguicosa: true })}</div>`,
            `<div class="pg-recorte" style="--plano: ${d.capturas.painel.planos.palavra}">${P.captura(d.capturas.painel, { preguicosa: true })}</div>`,
            `<div class="pg-recorte" style="--plano: ${d.capturas.painel.planos.envio}">${P.captura(d.capturas.painel, { preguicosa: true })}</div>`,
          ][indice]}
          <figcaption>${P.esc(d.como.passos[indice].destino || d.como.passos[indice].legenda)}</figcaption>
        </figure>`;

  /** As etapas de um envio, como o painel as mostra. */
  P.etapasDoEnvio = d =>
    `<ol class="pg-etapas" aria-label="As etapas de um envio, como o painel as mostra">${d.como.etapas.map(etapa => `<li>${P.esc(etapa)}</li>`).join('')}</ol>`;

  /**
   * As abas dos três passos. A lista acesa (ouro) é uma cópia da lista, vista por uma janela do tamanho de uma aba:
   * a janela anda para um lado e a cópia, dentro dela, anda o mesmo tanto para o outro. O fundo e a letra mudam
   * juntos, e só `transform` se mexe.
   */
  P.abas = d => `
    <div class="pg-abas">
      <div class="pg-lista" role="tablist" aria-labelledby="como-funciona-titulo">
        ${d.como.passos.map((passo, indice) => `
        <button class="pg-aba" type="button" role="tab" id="pg-aba-${indice}" aria-controls="pg-painel-${indice}" aria-selected="${indice === 0}" tabindex="${indice === 0 ? 0 : -1}"><b>${indice + 1}</b>${P.esc(passo.rotulo)}</button>`).join('')}
      </div>
      <div class="pg-abas-janela" aria-hidden="true">
        <div class="pg-lista pg-lista--acesa">
          ${d.como.passos.map((passo, indice) => `
          <span class="pg-aba"><b>${indice + 1}</b>${P.esc(passo.rotulo)}</span>`).join('')}
        </div>
      </div>
    </div>`;
})();
