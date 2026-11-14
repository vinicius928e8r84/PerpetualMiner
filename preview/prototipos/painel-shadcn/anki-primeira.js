'use strict';

// Nunca houve conexão neste computador: os quatro passos de ligar a Conexão com o Anki (ONB-16, ONB-17, ONB-18).

(function (PS) {
  const { ic, pecas } = PS;
  const { visao, situacao } = PS.partesDoAnki;
  const A = PS.acoes;

  // ---------- Nunca conectada: os passos de ligar (ONB-16, ONB-17, ONB-18) ----------
  const PASSOS = ['Ter o Anki', 'Pôr a Conexão no Anki', 'Reiniciar o Anki', 'Abrir o Anki sozinho'];
  function corpoDoPasso() {
    if (visao.passo === 1) {
      const resposta = visao.temAnki === true ? '<p class="campo-ajuda" role="status">Abra o Anki para continuar.</p>'
        : visao.temAnki === false ? `<div class="com-acao"><button type="button" class="botao botao--contorno" data-acao="anki.baixar" data-valor="o Anki">${ic('baixar')}Baixar o Anki</button><span class="campo-ajuda">Depois de instalar, abra o Anki.</span></div>` : '';
      return `<p>O Anki é o programa que guarda os cartões e onde você estuda. Ele roda neste computador, junto com a Conexão com o Anki.</p><div class="item item--contorno passo__pergunta"><div class="item__conteudo"><p class="rotulo">Você já tem o Anki?</p>${resposta}</div>${pecas.escolha({ rotulo: 'Você já tem o Anki?', valor: visao.temAnki === null ? '' : String(visao.temAnki), acao: 'anki.temAnki', chave: 'tem-anki', opcoes: [['true', 'Já tenho'], ['false', 'Não tenho']] })}</div>`;
    }
    if (visao.passo === 2) return `<p>Baixe o arquivo e abra-o. Se o Anki estiver fechado, ele abre sozinho. Quando o Anki perguntar se você quer instalar, responda Sim.</p><div><button type="button" class="botao" data-acao="anki.baixar" data-valor="a Conexão com o Anki">${ic('baixar')}Baixar a Conexão com o Anki</button></div><details class="recolhivel"><summary>${ic('direita', 'ic--seta')}O arquivo não abriu?</summary><p class="campo-ajuda">O código para colar em Ferramentas › Extensões › Obter extensões vem em breve.</p></details>`;
    if (visao.passo === 3) return `<p>Feche o Anki e abra-o de novo. A Conexão liga quando o Anki abre, e esta tela confere sozinha.</p><p class="com-controle"><span class="ponto ponto--aviso ponto--pulsa"></span>Esperando a Conexão</p>`;
    const abridor = { parado: `<button type="button" class="botao botao--contorno" data-acao="anki.permitirAbridor">Permitir abrir o Anki</button><span class="campo-ajuda">Sem essa permissão, quando o Anki estiver fechado o Envio pede que você o abra.</span>`, procurando: `<p class="com-controle" role="status">${ic('carregando', 'girando')}Procurando o Anki…</p>`, achou: `<p class="com-controle" role="status"><span class="ponto ponto--sucesso"></span>O Anki abre sozinho quando um Envio precisar.</p>` }[visao.abridor];
    return `<p>Com a sua permissão, a extensão abre o Anki quando um Envio precisar dele. O Chrome vai pedir para ela se comunicar com o abridor que a Conexão com o Anki deixou neste computador. Agora ela só confere se acha o Anki: nada abre nem fecha.</p><div class="com-acao">${abridor}</div>`;
  }

  function primeiraConexao() {
    if (visao.passo > PASSOS.length) {
      return `<section class="cartao coluna-estreita" aria-label="Pronto"><div class="cartao__corpo"><div class="vazio" style="border:0"><span class="vazio__icone" style="color:var(--sucesso)">${ic('certo-circulo')}</span><div><p class="vazio__titulo">Achei o Anki · versão 0.4.24</p><p class="vazio__texto">Pronto. As abas voltam em seguida.</p></div></div></div></section>`;
    }
    return `<section class="primeira" aria-labelledby="primeira-titulo"><div><h2 class="tela__titulo" id="primeira-titulo">Ainda não houve conexão neste computador</h2><p class="tela__descricao">A Conexão com o Anki fica dentro do Anki, neste computador, e é ela que cria os cartões.</p></div>`
      + `<div class="primeira__grade"><ol class="passos" aria-label="Como ligar">${PASSOS.map((nome, i) => `<li><button type="button" class="item" aria-current="${visao.passo === i + 1 ? 'step' : 'false'}" data-acao="anki.passo" data-valor="${i + 1}" data-foco="passo-${i + 1}"><span class="passos__numero" data-feito="${visao.passo > i + 1}">${visao.passo > i + 1 ? ic('visto') : i + 1}</span><span class="item__titulo">${nome}</span></button></li>`).join('')}</ol>`
      + `<div class="cartao"><div class="cartao__topo"><p class="campo-ajuda">Como ligar · passo ${visao.passo} de ${PASSOS.length}</p><h3 class="cartao__titulo passo__titulo">${PASSOS[visao.passo - 1]}</h3></div><div class="cartao__corpo passo">${corpoDoPasso()}</div>`
      + `<div class="cartao__pe">${visao.passo > 1 ? '<button type="button" class="botao botao--contorno" data-acao="anki.passo" data-valor="anterior">Voltar</button>' : ''}<span style="flex:1"></span><button type="button" class="botao" data-acao="anki.passo" data-valor="proximo" data-foco="passo-continuar">Continuar</button></div></div></div>`
      + `<p class="com-controle campo-ajuda"><span class="ponto"></span>Confere sozinho a cada 15 s · última vez há 0 s</p>`
      + `<div class="duas-colunas"><div class="item item--contorno item--tracejado"><div class="item__conteudo"><p class="rotulo">Continua funcionando</p><p class="item__descricao">Minerar de vídeos, páginas e fotos.</p></div></div><div class="item item--contorno item--tracejado"><div class="item__conteudo"><p class="rotulo">Fica indisponível sem ela</p><p class="item__descricao">Enviar ao Anki e a mineração automática.</p></div></div></div></section>`;
  }

  A['anki.temAnki'] = botao => { visao.temAnki = botao.dataset.valor === 'true'; PS.desenhar(); };
  A['anki.baixar'] = botao => PS.avisar(`No painel, isto baixa ${botao.dataset.valor} (fora deste protótipo)`);
  A['anki.permitirAbridor'] = () => {
    visao.abridor = 'procurando';
    PS.desenhar();
    setTimeout(() => { visao.abridor = 'achou'; if (situacao() === 'primeira') PS.desenhar(); }, 1000);
  };
  A['anki.passo'] = botao => {
    const pedido = botao.dataset.valor;
    visao.passo = pedido === 'proximo' ? visao.passo + 1 : pedido === 'anterior' ? visao.passo - 1 : Number(pedido);
    PS.desenhar();
    if (visao.passo > PASSOS.length) {
      setTimeout(() => { Object.assign(visao, { passo: 1, temAnki: null, abridor: 'parado' }); PS.mudar({ estado: 'normal' }); PS.avisar('Conexão com o Anki: ligada'); }, 1500);
    }
  };

  PS.partesDoAnki.primeiraConexao = primeiraConexao;
  PS.partesDoAnki.passosDeLigar = PASSOS.length;
})(window.PS);
