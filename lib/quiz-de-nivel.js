'use strict';

// O quiz de nível (#170, #130, #134): a regra e as perguntas, como dados e sem tela. Quem desenha é `painel-boas-vindas-quiz.js`. As perguntas vêm prontas
// por idioma (sem IA e sem custo; o áudio é a voz do Google do Cartão, pedida à Conexão). A pessoa responde a duas perguntas sobre o que já faz (a parte 1)
// e depois a de 3 a 6 perguntas de 4 alternativas, sempre com “Não sei” (a parte 2): só o áudio (a escuta), a Frase como legenda e o teste do verso.
//
// A regra tem dois portões: Intermediário = as 2 de legenda certas; Avançado = também as 2 do verso. A escuta aparece no resultado e não muda o estilo.
// A parte 1 só escolhe por qual portão a parte 2 começa:
//   - aponta Iniciante  → legenda (2 + 1 de escuta); acertou as 2, entra o verso (2 + 1 de escuta): 6 perguntas; senão são 3 e o nível é o Iniciante;
//   - aponta Intermediário ou Avançado → verso (2 + 1 de escuta); acertou as 2, é o Avançado com 3 perguntas; errou uma, entra a legenda (2 + 1): 6.
// A sequência de acertos sobe a cada acerto, “Não sei” a pausa (não sobe nem zera) e o chute errado a zera.

(function (raiz) {
  const TIPOS = Object.freeze({ LEGENDA: 'legenda', VERSO: 'verso', ESCUTA: 'escuta' });
  const NAO_SEI = 'nao_sei';
  const NIVEIS = Object.freeze({ INICIANTE: 'iniciante', INTERMEDIARIO: 'intermediario', AVANCADO: 'avancado' });

  // A parte 1: o que a pessoa já faz. Cada alternativa vale 0 (Iniciante), 1 (Intermediário) ou 2 (Avançado); o texto é o ID da Voz (ONB-21).
  const PARTE_1 = Object.freeze([
    { pergunta: 'ONB-21.series', opcoes: [['ONB-21.seriesDublada', 0], ['ONB-21.seriesLegenda', 1], ['ONB-21.seriesSemLegenda', 2]] },
    { pergunta: 'ONB-21.noticia', opcoes: [['ONB-21.noticiaTraduzo', 0], ['ONB-21.noticiaGeral', 1], ['ONB-21.noticiaDireto', 2]] },
  ]);

  // As perguntas da parte 2, por idioma: `texto` é a frase dita (escuta), lida (legenda) ou a explicação de uma palavra (verso); as 4 alternativas estão em
  // português e `certa` é o índice da certa. Duas de cada tipo; um idioma novo traz as suas.
  const PERGUNTAS = Object.freeze({
    en: {
      legenda: [
        { texto: 'I would have called you earlier, but my phone died.', certa: 1,
          opcoes: ['Eu liguei para você mais cedo, mas ninguém atendeu.', 'Eu teria ligado mais cedo, mas meu celular descarregou.', 'Eu vou ligar mais cedo amanhã, se meu celular funcionar.', 'Eu não liguei porque você disse que estava ocupado.'] },
        { texto: "She didn't get the job, even though she was the most qualified candidate.", certa: 3,
          opcoes: ['Ela conseguiu o emprego porque era a candidata mais qualificada.', 'Ela não quis o emprego porque achou que não era qualificada.', 'Ela perdeu o emprego quando outra candidata chegou.', 'Ela não conseguiu o emprego, apesar de ser a candidata mais qualificada.'] },
      ],
      verso: [
        { texto: 'not willing to do something, and slow to agree to do it', certa: 2, opcoes: ['Animado', 'Distraído', 'Relutante', 'Orgulhoso'] },
        { texto: 'to make something less bad or less severe', certa: 0, opcoes: ['Atenuar', 'Esconder', 'Repetir', 'Comprar'] },
      ],
      escuta: [
        { texto: 'Could you tell me where the nearest pharmacy is?', certa: 2,
          opcoes: ['Você sabe a que horas a farmácia fecha?', 'Eu preciso comprar um remédio para a minha irmã.', 'Você pode me dizer onde fica a farmácia mais próxima?', 'A farmácia mais próxima fica a dois quarteirões daqui.'] },
        { texto: "We're running late, so let's grab something quick on the way.", certa: 0,
          opcoes: ['Estamos atrasados, então vamos comer algo rápido no caminho.', 'Chegamos cedo, então vamos esperar por eles aqui.', 'Estamos sem tempo, então vamos cancelar o jantar.', 'Vamos pegar o carro mais tarde, depois do almoço.'] },
      ],
    },
    ru: {
      legenda: [
        { texto: 'Я забыл зонт дома, поэтому промок под дождём.', certa: 2,
          opcoes: ['Levei o guarda-chuva, por isso não me molhei na chuva.', 'Perdi o guarda-chuva na rua, então voltei para casa.', 'Esqueci o guarda-chuva em casa, por isso me molhei na chuva.', 'Comprei um guarda-chuva novo porque começou a chover.'] },
        { texto: 'Мы хотели пойти в кино, но все билеты уже раскупили.', certa: 0,
          opcoes: ['Queríamos ir ao cinema, mas os ingressos já tinham acabado.', 'Fomos ao cinema, mas o filme já tinha começado.', 'Queríamos ir ao cinema, mas não tínhamos dinheiro.', 'Compramos os ingressos para o cinema de amanhã.'] },
      ],
      verso: [
        { texto: 'человек, который не хочет тратить деньги зря и не выбрасывает полезные вещи', certa: 1, opcoes: ['Generoso', 'Econômico', 'Preguiçoso', 'Corajoso'] },
        { texto: 'перенести дело на другое, более позднее время', certa: 3, opcoes: ['Terminar', 'Comprar', 'Esquecer', 'Adiar'] },
      ],
      escuta: [
        { texto: 'Завтра мы поедем к бабушке на поезде.', certa: 1,
          opcoes: ['Ontem a avó chegou de trem.', 'Amanhã vamos de trem para a casa da avó.', 'Amanhã vamos de carro para a casa dos pais.', 'Hoje a avó vai nos visitar.'] },
        { texto: 'Пожалуйста, закройте окно, на улице очень холодно.', certa: 2,
          opcoes: ['Por favor, abra a janela, está muito quente aqui.', 'Por favor, feche a porta, tem muito barulho na rua.', 'Por favor, feche a janela, está muito frio lá fora.', 'A janela está fechada porque está chovendo.'] },
      ],
    },
  });

  /** Por qual portão a parte 2 começa, pelas alternativas da parte 1 (os pontos de cada resposta): a soma de 0 a 1 é o Iniciante (legenda); de 2 a 4, o verso. */
  function portaoInicial(pontos) {
    return pontos.reduce((soma, ponto) => soma + ponto, 0) >= 2 ? TIPOS.VERSO : TIPOS.LEGENDA;
  }

  /**
   * Uma volta da parte 2 em `lang`, a começar pelo portão `inicial`. `pergunta()` é a da vez (ou null no fim), `responder(escolha)` recebe o índice da
   * alternativa ou `NAO_SEI`, e `resultado()` o nível e os números, quando `pergunta()` é null.
   */
  function iniciar(lang, inicial) {
    const perguntas = PERGUNTAS[lang];
    if (!perguntas) throw new Error(`O quiz não tem perguntas em ${lang}`);
    const outro = inicial === TIPOS.LEGENDA ? TIPOS.VERSO : TIPOS.LEGENDA;
    const fila = bloco(inicial, 0);
    const respostas = [];
    let sequencia = 0;
    let melhor = 0;
    let ampliado = false;

    function bloco(portao, escuta) {
      return [{ tipo: portao, indice: 0 }, { tipo: TIPOS.ESCUTA, indice: escuta }, { tipo: portao, indice: 1 }];
    }

    const passou = portao => {
      const dadas = respostas.filter(r => r.tipo === portao);
      return dadas.length === 2 && dadas.every(r => r.acertou);
    };

    /** Terminado o bloco, a regra diz se entra o outro portão. */
    function seguir() {
      if (fila.length || ampliado) return;
      const pedeOOutro = inicial === TIPOS.LEGENDA ? passou(TIPOS.LEGENDA) : !passou(TIPOS.VERSO);
      if (!pedeOOutro) return;
      ampliado = true;
      fila.push(...bloco(outro, 1));
    }

    function pergunta() {
      if (!fila.length) return null;
      const { tipo, indice } = fila[0];
      return { tipo, ...perguntas[tipo][indice], numero: respostas.length + 1, total: ampliado ? 6 : 3 };
    }

    function responder(escolha) {
      const atual = pergunta();
      if (!atual) throw new Error('O quiz já acabou');
      const naoSei = escolha === NAO_SEI;
      if (!naoSei && !(Number.isInteger(escolha) && escolha >= 0 && escolha < atual.opcoes.length)) throw new Error(`Alternativa fora da pergunta: ${escolha}`);
      const acertou = !naoSei && escolha === atual.certa;
      respostas.push({ tipo: atual.tipo, acertou });
      if (acertou) melhor = Math.max(melhor, ++sequencia);
      else if (!naoSei) sequencia = 0;
      fila.shift();
      seguir();
      return { acertou, naoSei, certa: atual.certa, sequencia, melhorSequencia: melhor };
    }

    function nivel() {
      if (inicial === TIPOS.LEGENDA) {
        if (!passou(TIPOS.LEGENDA)) return NIVEIS.INICIANTE;
        return passou(TIPOS.VERSO) ? NIVEIS.AVANCADO : NIVEIS.INTERMEDIARIO;
      }
      if (passou(TIPOS.VERSO)) return NIVEIS.AVANCADO;
      return passou(TIPOS.LEGENDA) ? NIVEIS.INTERMEDIARIO : NIVEIS.INICIANTE;
    }

    function resultado() {
      if (fila.length) throw new Error('O quiz ainda tem perguntas');
      const da = tipo => respostas.filter(r => r.tipo === tipo);
      return {
        nivel: nivel(),
        acertos: respostas.filter(r => r.acertou).length,
        perguntas: respostas.length,
        escuta: { acertos: da(TIPOS.ESCUTA).filter(r => r.acertou).length, perguntas: da(TIPOS.ESCUTA).length },
        melhorSequencia: melhor,
      };
    }

    return { pergunta, responder, resultado, sequencia: () => sequencia, melhorSequencia: () => melhor };
  }

  raiz.QuizDeNivel = Object.freeze({ TIPOS, NAO_SEI, NIVEIS, PARTE_1, PERGUNTAS, portaoInicial, iniciar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
