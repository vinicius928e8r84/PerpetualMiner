'use strict';

// A Boas-vindas (#boas-vindas): a abertura, os nove passos e Tudo pronto, sem a lateral, como no painel. Os passos
// usam os mesmos controles das Configurações (PS.cfg). O quiz de nível e o ranking do passo 7 ficaram de fora do
// protótipo: aqui o nível é só a escolha entre os três. O texto é o do catálogo da Voz (ONB-01 a ONB-23).

(function (PS) {
  const { esc, ic, pecas } = PS;
  const d = PS.dados;
  const PASSOS = [   // ONB-03
    { titulo: 'Minerar a primeira frase' },
    { titulo: 'Escolher o atalho de Minerar seleção' },
    { titulo: 'Entrar com Google', opcional: true },
    { titulo: 'Ligar a Conexão com o Anki' },
    { titulo: 'Configurar a IA dos cartões', opcional: true },
    { titulo: 'Ligar a mineração automática', opcional: true },
    { titulo: 'Escolher o nível do cartão', opcional: true },
    { titulo: 'Adicionar a chave do Gemini', opcional: true },
    { titulo: 'Enviar o primeiro cartão' },
  ];
  const TOTAL = PASSOS.length;
  const visao = { confirmados: new Set(), pulados: new Set(), minerada: '', envio: 'parado' };
  const NIVEIS = [['iniciante', 'Iniciante', 'Não entendo nada ou só algumas palavras'], ['intermediario', 'Intermediário', 'Com legenda, entendo 30% ou mais · numa frase, só me falta uma palavra'], ['avancado', 'Avançado', 'Entendo o {idioma} explicado em {idioma}']];
  const conexaoLigada = () => !['desligada', 'primeira'].includes(PS.estado.estado);

  /** O que cada passo já tem: 'feito', 'agora não' ou 'falta' (ONB-13). */
  function situacaoDe(n) {
    const feito = [
      () => d.frases.length > 0,
      () => Boolean(d.atalhos.selecao),
      () => d.conta.entrou,
      conexaoLigada,
      () => Boolean(d.openai) || PS.cfg.visao.chatgpt === 'dentro',
      () => d.automatica.en.ligada || d.automatica.ru.ligada,
      () => visao.confirmados.has(7),
      () => Boolean(d.gemini),
      () => visao.envio === 'enviado',
    ][n - 1]();
    if (feito) return ['feito', 'sucesso'];
    if (visao.pulados.has(n)) return ['agora não', 'secundario'];
    return ['falta', 'contorno'];
  }

  function corpoDoPasso(n) {
    if (n === 1) {   // ONB-05
      return `<p>Num vídeo com legenda, aperte <kbd class="tecla mono">${esc(d.atalhos.legenda || 'Sem atalho')}</kbd>. A frase vai para o histórico e já fica copiada.</p><p>Numa página ou PDF, selecione o texto e use o botão direito › Minerar com PerpetualMiner.</p>`
        + `<div class="bv-exemplo" lang="en"><p class="frase__texto">${visao.minerada ? esc(visao.minerada) : 'I never <mark>take it for granted</mark>.'}</p>${visao.minerada ? '<span class="selo selo--sucesso">Frase minerada</span>' : '<span class="selo selo--contorno"><span class="mono">palavra:</span> <b>take it for granted</b></span>'}</div>`
        + `<form class="campo-grupo" data-ao-enviar="bv.minerar"><label class="campo-ajuda" for="bv-frase">Ou cole uma frase aqui, como no popup:</label><div class="com-acao"><input class="campo" id="bv-frase" placeholder="Cole ou escreva uma frase" autocomplete="off"><button type="submit" class="botao botao--secundario">Minerar</button></div></form>`;
    }
    if (n === 2) return `<p>Escolha uma tecla ou um botão extra do mouse para minerar o texto selecionado, sem abrir o menu.</p><div class="item item--contorno bv-bloco">${PS.cfg.linhaDoAtalho('selecao')}</div>`;   // ONB-06
    if (n === 3) return `<p>Entre com Google para ter suas frases em qualquer computador. Sem conta, elas ficam só neste.</p><div class="item item--contorno bv-bloco">${PS.cfg.corpoDaConta()}</div>`;   // ONB-07
    if (n === 4) {   // ONB-08
      const estado = conexaoLigada()
        ? `<div class="item item--contorno"><span class="ponto ponto--sucesso"></span><div class="item__conteudo"><p class="rotulo">Conexão com o Anki: ligada</p><p class="item__descricao">Achei o Anki · versão 0.4.24</p></div></div>`
        : `<div class="item item--contorno"><span class="ponto ponto--perigo"></span><div class="item__conteudo"><p class="rotulo">Conexão com o Anki: desligada</p><p class="item__descricao">Enviar ao Anki fica indisponível</p></div><a class="botao botao--contorno botao--p" href="#anki/custos">Como ligar</a></div>`;
      return `<p>A Conexão com o Anki fica dentro do Anki, neste computador. É ela que cria os cartões e diz quais palavras você já conhece.</p>${estado}`;
    }
    if (n === 5) return `<p>É ela que escreve o texto dos cartões. Dá para configurar depois, em Configurações.</p>${PS.cfg.corpoDaIa()}`;   // CFG-35.passo
    if (n === 6) {   // ONB-09
      const linha = idioma => `<div class="linha-ajuste"><label class="com-controle"><input type="checkbox" role="switch" class="interruptor" id="bv-auto-${idioma}" ${d.automatica[idioma].ligada ? 'checked' : ''} aria-label="Mineração automática em ${PS.idiomaEm(idioma)}" data-ao-mudar="bv.automatica" data-valor="${idioma}" ${conexaoLigada() ? '' : 'disabled'}><span>${d.IDIOMAS[idioma]}</span></label>`
        + `<label class="com-controle campo-ajuda">limite<input class="campo campo--mono bv-limite" id="bv-limite-${idioma}" inputmode="numeric" aria-label="Limite por dia em ${PS.idiomaEm(idioma)}" value="${d.automatica[idioma].limite}" data-ao-digitar="bv.limite" data-valor="${idioma}">/dia</label></div>`;
      return `<p>Com ela ligada, as legendas com uma palavra que você ainda não conhece são mineradas sozinhas, até um limite por dia. Liga por idioma.</p>`
        + `${conexaoLigada() ? '' : pecas.alerta({ tipo: 'aviso', icone: 'tomada-fora', titulo: 'Nada é minerado com a Conexão com o Anki desligada: é ela que diz quais palavras você já conhece.' })}`   // ONB-10
        + `<div class="item item--contorno bv-bloco">${linha('en')}${linha('ru')}</div><p class="campo-ajuda">Os mesmos botões ficam no popup, pelo ícone da extensão.</p>`;
    }
    if (n === 7) {   // ONB-20
      const ligados = Object.keys(d.IDIOMAS).filter(idioma => d.automatica[idioma].ligada);
      const corpo = ligados.length
        ? ligados.map(idioma => `<div class="campo-grupo"><span class="rotulo">${d.IDIOMAS[idioma]}</span>${pecas.escolha({ rotulo: `Nível em ${PS.idiomaEm(idioma)}`, valor: d.ajustes[idioma].estilo, acao: 'bv.nivel', chave: `bv-nivel-${idioma}`, opcoes: NIVEIS.map(([v, nome]) => [v, nome]) })}<span class="campo-ajuda">${NIVEIS.find(([v]) => v === d.ajustes[idioma].estilo)[2].replaceAll('{idioma}', PS.idiomaEm(idioma))}</span></div>`).join('')
        : `<div class="item item--contorno bv-bloco"><p class="campo-ajuda">Nenhum idioma está ligado. Ligue a mineração automática em um idioma para escolher o nível dele aqui; o nível também fica em Ajustes de envio.</p><div><button type="button" class="botao botao--secundario botao--p" data-acao="bv.ir" data-valor="6">Ligar a mineração automática</button></div></div>`;
      return `<p>Escolha o nível de cada idioma ligado. Ele decide o que o verso do cartão explica, e dá para mudar depois.</p>${corpo}<p><a class="botao botao--link" href="#anki/ajustes">Mais estilos em Ajustes de envio</a></p>`;
    }
    if (n === 8) return `<p>Só é usada em Minerar de uma foto, para ler os trechos marcados numa página de livro. Dá para adicionar depois: a página pede quando precisar.</p><div class="item item--contorno bv-bloco">${PS.cfg.corpoDoGemini()}</div><details class="recolhivel"><summary>${ic('direita', 'ic--seta')}Onde conseguir a chave</summary><p class="campo-ajuda">No Google AI Studio, em “Get API key”. A chave fica só neste computador.</p></details>`;   // ONB-11
    // ONB-23: o primeiro Envio manda um Cartão de verdade.
    const envio = {
      parado: `<div><button type="button" class="botao" data-acao="bv.enviar" data-foco="bv-enviar" ${conexaoLigada() ? '' : 'aria-disabled="true" data-dica="A Conexão com o Anki não respondeu. Confira se ela está ligada."'}>${ic('enviar')}Enviar o primeiro cartão</button></div>`,
      enviando: `<p class="com-controle" role="status">${ic('carregando', 'girando')}Enviando…</p>`,
      enviado: `<div class="item item--contorno"><span class="vazio__icone" style="color:var(--sucesso)">${ic('certo-circulo')}</span><div class="item__conteudo"><p class="rotulo">Cartão enviado ao Anki</p>${d.frases.length ? '' : '<p class="item__descricao">Você ainda não minerou nenhuma frase, então este é um cartão de teste. Ele tem a etiqueta perpetualminer-teste no Anki, para você apagá-lo quando quiser.</p>'}</div><button type="button" class="botao botao--contorno botao--p" data-acao="bv.abrirNoAnki">Abrir no Anki</button></div>`,
    }[visao.envio];
    return `<p>Vamos mandar um cartão de verdade ao Anki, para provar que tudo está ligado.</p>${envio}`;
  }

  function abertura() {   // ONB-01, ONB-02
    return `<p class="bv-sobre">Boas-vindas</p><h1 class="bv-titulo" id="titulo-da-tela" tabindex="-1">Boas-vindas ao PerpetualMiner</h1><div class="bv-corpo"><p>Minere frases de vídeos, páginas e fotos de livros, e envie ao Anki como cartões. Nove passos rápidos deixam tudo pronto; os opcionais dá para pular.</p>`
      + `<ol class="bv-resumo">${PASSOS.map((passo, i) => `<li class="item item--contorno"><span class="passos__numero">${i + 1}</span><span class="item__conteudo">${passo.titulo}</span>${passo.opcional ? '<span class="selo selo--secundario">opcional</span>' : ''}</li>`).join('')}</ol></div>`
      + `<div class="bv-pe"><button type="button" class="botao botao--fantasma" data-acao="bv.pular">Pular a configuração</button><span style="flex:1"></span><button type="button" class="botao" data-acao="bv.ir" data-valor="1" data-foco="bv-continuar">Começar</button></div>`;
  }

  function pronto() {   // ONB-12
    return `<p class="bv-sobre">Pronto</p><h1 class="bv-titulo" id="titulo-da-tela" tabindex="-1">Tudo pronto</h1><div class="bv-corpo"><p>Dá para mudar qualquer coisa depois, em Configurações. A mineração automática fica no popup.</p>`
      + `<ol class="bv-resumo">${PASSOS.map((passo, i) => { const [rotulo, selo] = situacaoDe(i + 1); return `<li class="item item--contorno"><span class="passos__numero" data-feito="${rotulo === 'feito'}">${rotulo === 'feito' ? ic('visto') : i + 1}</span><span class="item__conteudo">${passo.titulo}</span><span class="selo selo--${selo}">${rotulo}</span></li>`; }).join('')}</ol></div>`
      + `<div class="bv-pe"><button type="button" class="botao botao--contorno" data-acao="bv.ir" data-valor="${TOTAL}">Voltar</button><span style="flex:1"></span><a class="botao" href="#frases" data-foco="bv-continuar">Abrir painel</a></div>`;
  }

  function passo(n) {
    const p = PASSOS[n - 1];
    const ultimo = n === TOTAL;
    const continuar = ultimo
      ? `<button type="button" class="botao" data-acao="bv.ir" data-valor="${TOTAL + 1}" data-foco="bv-continuar" ${visao.envio === 'enviado' ? '' : 'disabled'}>Concluir</button>`
      : `<button type="button" class="botao" data-acao="bv.ir" data-valor="${n + 1}" data-foco="bv-continuar">Continuar</button>`;
    return `<p class="bv-sobre">Passo ${n} de ${TOTAL}${p.opcional ? ' · opcional' : ''}</p><h1 class="bv-titulo" id="titulo-da-tela" tabindex="-1">${p.titulo}</h1><div class="bv-corpo">${corpoDoPasso(n)}</div>`
      + `<div class="bv-pe"><button type="button" class="botao botao--contorno" data-acao="bv.ir" data-valor="${n - 1}">Voltar</button><span style="flex:1"></span>${p.opcional ? `<button type="button" class="botao botao--fantasma" data-acao="bv.agoraNao" data-valor="${n}">Agora não</button>` : ''}${continuar}</div>`;
  }

  PS.telas['boas-vindas'] = {
    titulo: 'Boas-vindas',
    desenhar(rota) {
      const n = Math.min(Math.max(0, Number(rota.sub) || 0), TOTAL + 1);
      const item = (i, titulo) => {
        const atual = i === n;
        const feito = i >= 1 && i <= TOTAL && situacaoDe(i)[0] === 'feito';
        return `<li><a class="item" href="#boas-vindas/${i}" aria-current="${atual ? 'step' : 'false'}"><span class="passos__numero" data-feito="${feito}">${feito ? ic('visto') : i === 0 ? '·' : i > TOTAL ? ic('visto') : i}</span><span class="item__titulo">${titulo}</span></a></li>`;
      };
      return `<div class="bv"><div class="marca bv-marca">${PS.marca}<span>Perpetual<b>Miner</b></span></div><div class="bv-grade"><nav aria-label="Passos da configuração"><ol class="passos cartao bv-passos">${item(0, 'Boas-vindas')}${PASSOS.map((p, i) => item(i + 1, p.titulo)).join('')}${item(TOTAL + 1, 'Tudo pronto')}</ol></nav>`
        + `<main class="cartao bv-cartao">${n === 0 ? abertura() : n > TOTAL ? pronto() : passo(n)}</main></div></div>`;
    },
  };

  /** Sair da Boas-vindas com passos por fazer deixa o lembrete "Configuração pela metade" em Frases (ONB-15). */
  function deixarLembrete() {
    const feitos = PASSOS.filter((_, i) => situacaoDe(i + 1)[0] === 'feito').length;
    const primeiroQueFalta = PASSOS.findIndex((_, i) => situacaoDe(i + 1)[0] !== 'feito') + 1;
    PS.frases.lembrete = feitos < TOTAL ? { feitos, total: TOTAL, passo: primeiroQueFalta } : null;
  }
  addEventListener('hashchange', evento => {
    if (new URL(evento.oldURL).hash.startsWith('#boas-vindas') && !location.hash.startsWith('#boas-vindas')) deixarLembrete();
  });

  const A = PS.acoes;
  A['bv.ir'] = botao => {
    const destino = Number(botao.dataset.valor);
    const atual = Number(PS.rota().sub) || 0;
    if (destino === atual + 1 && atual >= 1) { visao.confirmados.add(atual); visao.pulados.delete(atual); }   // Continuar confirma o passo
    PS.ir(`boas-vindas/${destino}`);
  };
  A['bv.pular'] = () => PS.ir('frases');
  A['bv.agoraNao'] = botao => { const n = Number(botao.dataset.valor); visao.pulados.add(n); visao.confirmados.delete(n); PS.ir(`boas-vindas/${n + 1}`); };
  A['bv.minerar'] = () => {
    const texto = document.getElementById('bv-frase').value.trim();
    if (!texto) { document.getElementById('bv-frase').focus(); return; }
    visao.minerada = texto;
    d.frases.unshift({ id: d.proximoId++, texto, dias: 0, fonte: 'manual', idioma: /[Ѐ-ӿ]/.test(texto) ? 'ru' : 'en', titulo: '', detalhe: '', grupos: [] });
    PS.desenhar();
    PS.avisar('Frase minerada');   // MIN-02
  };
  A['bv.automatica'] = caixa => { d.automatica[caixa.dataset.valor].ligada = caixa.checked; };
  A['bv.limite'] = campo => { const n = Number(campo.value); if (n > 0) d.automatica[campo.dataset.valor].limite = n; };
  A['bv.nivel'] = botao => {
    const idioma = botao.dataset.foco.split('-')[2];
    d.ajustes[idioma].estilo = botao.dataset.valor;
    d.ajustesSalvos[idioma].estilo = botao.dataset.valor;
    PS.desenhar();
  };
  A['bv.enviar'] = () => { visao.envio = 'enviando'; PS.desenhar(); setTimeout(() => { visao.envio = 'enviado'; PS.desenhar(); }, 1400); };
  A['bv.abrirNoAnki'] = () => PS.avisar('No painel, isto abre o cartão no Anki (fora deste protótipo)');
})(window.PS);
