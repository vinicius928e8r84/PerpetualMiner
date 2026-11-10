'use strict';

// O que as quatro variantes escrevem na tela. É a única porta de entrada do texto e das imagens: cada variante é
// uma função destes dados, e o alternador "Demo data / Worst case / Short" do seletor só troca o conjunto.
//
// DEMO é o texto de hoje da landing (preview/site/sobre.html), sem inventar nada sobre o produto. PIOR e CURTO
// existem para a skill break-ui: valores que um dia chegam de verdade (o título reescrito mais longo, um atalho
// de quatro teclas, uma legenda em russo com palavras compridas, uma captura refeita noutra proporção), não lixo.

(function () {
  const P = (window.ProtoHero = window.ProtoHero || {});

  const LOJA = 'https://chromewebstore.google.com/detail/perpetualminer/ohpoogiccjmdgilgegholdidgfhjkadf';

  const DEMO = {
    loja: LOJA,
    selo: 'Extensão do Chrome · inglês e russo',
    titulo: { comeco: 'A frase da legenda vira', brilho: 'cartão do Anki.' },
    lead: 'O PerpetualMiner minera frases do que você assiste e lê: a legenda que está na tela, o texto que você selecionou numa página, os trechos marcados na foto de um livro. Depois, a Conexão com o Anki transforma cada frase em cartão, com tradução, áudio e imagem.',
    leadCurto: 'Aperte o atalho num vídeo com legenda e a frase vai para o histórico, já copiada. Depois, a Conexão com o Anki faz dela um cartão com tradução, áudio e imagem.',
    botao: 'Instalar na Chrome Web Store',
    link: 'Como funciona',
    nota: 'Para o Chrome do computador. Minerar funciona sem conta e sem o Anki.',
    atalho: ['Alt', 'S'],
    frase: { antes: 'The quiet ', palavra: 'harbor', depois: ' woke before the gulls did.', idioma: 'EN', lang: 'en', fonte: 'Legenda de vídeo' },
    // A demonstração do atalho, etapa por etapa: o que a legenda dela diz em cada uma. Curtas de propósito: cada
    // uma tem de ser lida no tempo da etapa (comum.js, TEMPOS).
    demo: {
      antes: 'A legenda está na tela.',
      tecla: 'Você aperta {atalho}.',
      resultado: 'Frase minerada e copiada.',
      repetir: 'Repetir',
      convite: 'Aperte no teclado, ou toque nas teclas.',
      vazio: 'Nada minerado ainda nesta demonstração.',
      legenda: 'O overlay da extensão sobre um vídeo simulado.',
    },
    capturas: {
      antes: { src: '/site/capturas/legenda-antes.jpg', largura: 960, altura: 720, alt: 'Um vídeo com a legenda “The quiet harbor woke before the gulls did.”. No canto, o botão da extensão com o contador 7/20 da mineração automática.' },
      depois: { src: '/site/capturas/legenda.jpg', largura: 960, altura: 720, alt: 'O mesmo vídeo depois do atalho: a legenda sublinhada em dourado e, acima dela, o aviso da extensão “Frase minerada e copiada”, em inglês.' },
      // Os planos são onde a câmera para nesta captura, numa janela de 16 por 10: o cartão da primeira frase (a palavra)
      // e a barra da seleção (o envio). Moram ao lado da imagem porque são dela: refez a captura, refaça os planos.
      painel: {
        src: '/site/capturas/painel.png', largura: 2400, altura: 1500,
        alt: 'O painel da extensão, na lista Frases mineradas: filtros por fonte e idioma, busca, e frases em inglês e em russo com a palavra grifada e a fonte de cada uma. Duas frases estão selecionadas e a barra mostra Editar contexto, Exportar .txt, Apagar e Enviar ao Anki.',
        planos: { abertura: 'translate(-30%, -24%) scale(1.6)', palavra: 'translate(-53%, -49%) scale(2.2)', envio: 'translate(-114%, -15%) scale(2.2)' },
      },
      painelEstreito: {
        src: '/site/capturas/painel-estreito.png', largura: 960, altura: 1440,
        alt: 'O painel numa janela estreita: duas frases selecionadas e a barra com Editar contexto, Exportar .txt, Apagar e Enviar ao Anki.',
        planos: { abertura: 'translate(-10%, -90%) scale(1.2)', palavra: 'translate(-22%, -173%) scale(1.2)', envio: 'translate(-34%, -118%) scale(1.4)' },
      },
      popup: { src: '/site/capturas/popup.png', largura: 680, altura: 1200, alt: 'O popup da extensão: o botão Abrir painel, a mineração automática com o inglês ligado em 7 de 20 frases hoje e o russo desligado, o campo para colar ou escrever uma frase e a lista das últimas mineradas.' },
    },
    como: {
      sobretitulo: 'Como funciona',
      titulo: 'Três passos, do vídeo ao baralho',
      passos: [
        {
          rotulo: 'Minere',
          titulo: 'Minere a frase',
          texto: 'Num vídeo com legenda, aperte {atalho}. A frase vai para o histórico e já fica copiada. O atalho é seu: troque por outra tecla ou por um botão extra do mouse.',
          legenda: 'O overlay da extensão sobre um vídeo simulado.',
          destino: 'O popup, com dados de exemplo: a frase minerada entra nas Últimas mineradas.',
        },
        {
          rotulo: 'Escolha',
          titulo: 'Escolha a palavra',
          texto: 'No painel, cada frase guarda o idioma e de onde veio. Marque na frase a palavra que o cartão vai ensinar; com o Anki ligado, a extensão pode sugerir uma.',
          legenda: 'O painel, com frases de exemplo.',
        },
        {
          rotulo: 'Envie',
          titulo: 'Envie ao Anki',
          texto: 'Selecione as frases e use Enviar ao Anki. A Conexão com o Anki cria um cartão para cada uma, e o painel mostra o andamento do envio.',
          legenda: 'Duas frases selecionadas, prontas para Enviar ao Anki.',
        },
      ],
      etapas: ['Criando cartões', 'Gerando áudio', 'Escolhendo imagens', 'Enviando ao Anki', 'Concluído'],
    },
  };

  // O pior caso realista, um defeito por campo: selo que ganhou idiomas, título reescrito sem economia, botão com o
  // nome do app, atalho de quatro teclas (o atalho é do usuário), legenda de duas linhas em russo com palavras de
  // vinte letras, um passo três vezes maior que os vizinhos, uma captura refeita em pé e outra que não carregou.
  const PIOR = {
    ...DEMO,
    selo: 'Extensão do Chrome, do Edge e do Brave · inglês, russo, alemão e japonês',
    titulo: { comeco: 'Cada frase que você ouve na legenda do episódio vira um', brilho: 'cartão completo do Anki, com tradução, áudio e imagem.' },
    lead: `${DEMO.lead} Funciona nos players com leitor próprio de legenda (YouTube, Netflix, Prime Video, Max e Kinopoisk) e, nos outros, procura a legenda sobre o vídeo. A seleção de texto funciona em qualquer página e em PDF, e a foto de livro é lida pelo Gemini, com a sua chave.`,
    leadCurto: `${DEMO.leadCurto} Funciona nos players com leitor próprio de legenda (YouTube, Netflix, Prime Video, Max e Kinopoisk) e, nos outros, procura a legenda sobre o vídeo.`,
    botao: 'Instalar o PerpetualMiner na Chrome Web Store',
    link: 'Ver como funciona, em três passos',
    nota: 'Para o Chrome 110 ou mais novo, no computador. Minerar funciona sem conta, sem chave de IA e sem o Anki instalado; sem a Conexão com o Anki, o que fica indisponível é Enviar ao Anki e a mineração automática.',
    atalho: ['Ctrl', 'Shift', 'Alt', 'PageDown'],
    frase: {
      antes: 'Высокопревосходительство, ',
      palavra: 'достопримечательности',
      depois: ' города произвели на путешественников неизгладимое впечатление, не правда ли?',
      idioma: 'RU',
      lang: 'ru',
      fonte: 'Legenda de vídeo · Кинопоиск · temporada 12, episódio 104',
    },
    demo: {
      antes: 'A legenda do episódio que você está assistindo está na tela, e o botão da extensão está no canto.',
      tecla: 'Você aperta {atalho}, o atalho que gravou nas Configurações.',
      resultado: 'Frase minerada e copiada para a área de transferência.',
      repetir: 'Repetir a demonstração',
      convite: 'Aperte as quatro teclas do seu atalho no teclado, ou toque nelas aqui na página, e a legenda que está na tela é minerada.',
      vazio: 'Nada minerado ainda nesta demonstração: a frase aparece aqui, como no histórico da extensão, assim que o atalho for apertado.',
      legenda: 'O overlay da extensão sobre um vídeo simulado, com o botão flutuante e o contador da mineração automática do dia.',
    },
    capturas: {
      ...DEMO.capturas,
      // Uma captura refeita em pé onde a página espera uma deitada, e uma que não existe (capturar.mjs ainda não rodou).
      painel: { ...DEMO.capturas.painelEstreito },
      popup: { ...DEMO.capturas.popup, src: '/site/capturas/ainda-nao-capturada.png' },
    },
    como: {
      sobretitulo: 'Como funciona, do começo ao fim',
      titulo: 'Três passos, do vídeo que você está assistindo ao baralho que você revisa todo dia',
      passos: [
        {
          rotulo: 'Minere a legenda',
          titulo: 'Minere a frase que acabou de passar na legenda',
          texto: 'Num vídeo com legenda, aperte {atalho}. A frase vai para o histórico e já fica copiada. O atalho é seu: troque por outra tecla ou por um botão extra do mouse. Há leitores próprios para cinco players; nos outros, a extensão procura a legenda sobre o vídeo. Em qualquer página ou PDF, selecione o trecho e use o botão direito › Minerar com PerpetualMiner.',
          legenda: 'O overlay da extensão sobre um vídeo simulado, com o botão flutuante e o contador da mineração automática do dia.',
          destino: 'O popup da extensão, com dados de exemplo: a frase minerada entra no alto da lista das Últimas mineradas, com a fonte e o dia.',
        },
        {
          rotulo: 'Escolha',
          titulo: 'Escolha',
          texto: 'Marque a palavra.',
          legenda: 'O painel.',
        },
        {
          rotulo: 'Envie para o Anki',
          titulo: 'Envie ao Anki as frases selecionadas',
          texto: 'Selecione as frases e use Enviar ao Anki. A Conexão com o Anki cria um cartão para cada uma, e o painel mostra o andamento do envio.',
          legenda: 'Duas frases selecionadas, prontas para Enviar ao Anki.',
        },
      ],
      etapas: ['Criando os cartões de cada frase', 'Gerando áudio', 'Escolhendo imagens', 'Enviando ao Anki', 'Concluído'],
    },
  };

  // O outro extremo, o que sobra quando o texto encolhe: título de uma palavra, atalho de uma tecla, frase de duas letras.
  const CURTO = {
    ...DEMO,
    selo: 'Chrome',
    titulo: { comeco: 'Minere.', brilho: 'Estude.' },
    lead: 'Legenda vira cartão do Anki.',
    leadCurto: 'Legenda vira cartão do Anki.',
    botao: 'Instalar',
    link: 'Como',
    nota: 'Só no Chrome.',
    atalho: ['F2'],
    frase: { antes: '', palavra: 'Go', depois: '.', idioma: 'EN', lang: 'en', fonte: 'Web' },
    demo: { antes: 'Legenda.', tecla: '{atalho}.', resultado: 'Minerada.', repetir: 'De novo', convite: 'Aperte.', vazio: 'Vazio.', legenda: 'O overlay.' },
    como: {
      sobretitulo: 'Como',
      titulo: 'Três passos',
      passos: [
        { rotulo: 'Vê', titulo: 'Minere', texto: 'Aperte {atalho}.', legenda: 'Vídeo.', destino: 'Popup.' },
        { rotulo: 'Lê', titulo: 'Escolha', texto: 'Marque a palavra.', legenda: 'Painel.' },
        { rotulo: 'Vá', titulo: 'Envie', texto: 'Use Enviar ao Anki.', legenda: 'Envio.' },
      ],
      etapas: ['Criando', 'Áudio', 'Imagens', 'Enviando', 'Fim'],
    },
  };

  P.conjuntos = { demo: DEMO, worst: PIOR, short: CURTO };

  /** O conjunto que o endereço pede (`?data=worst`); sem pedido, o de demonstração. */
  P.dados = () => P.conjuntos[new URLSearchParams(location.search).get('data')] || DEMO;
})();
