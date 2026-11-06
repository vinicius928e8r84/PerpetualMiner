'use strict';

// O quiz de nível na tela (#170, ONB-21 e ONB-22): o que a pessoa vê no passo do nível da Boas-vindas ao abrir “Não sei meu nível, quero descobrir” de um idioma.
// A regra e as perguntas são de `lib/quiz-de-nivel.js`; aqui ficam a tela, o áudio e o resultado. Um quiz por idioma ligado, no russo com o alfabeto antes de tudo.
//
// O ritmo é o da spec (#137): a pessoa responde, vê a certa por ~1 s e a próxima pergunta entra sozinha, sem relógio; o áudio da pergunta toca sozinho. O
// áudio é a voz do Google do Cartão, pedida à Conexão (`POST /voz/falar`, no sotaque da Frase dos Ajustes de envio). Errar ou “Não sei” só mostram a certa.
// Sem a festa (#171). No fim vem o nível sugerido com a prévia do Cartão, e sob o resumo o ranking do grupo (#172, `painel-boas-vindas-ranking.js`): “Usar este estilo” ou trocar o nível ali (`EstiloDoCartao`).

(function (raiz) {
  const { textoDaVoz, IDIOMAS } = raiz;
  const PAUSA_DA_RESPOSTA_MS = 1000;
  const NOME_DO_IDIOMA = { en: IDIOMAS.INGLES, ru: IDIOMAS.RUSSO };
  const VOZ_DO_TIPO = { escuta: 'ONB-21.escuta', legenda: 'ONB-21.legenda', verso: 'ONB-21.verso' };
  const VOZ_DO_AUDIO = { semConexao: 'ONB-21.audioSemConexao', antiga: 'ONB-21.audioAntiga', falhou: 'ONB-21.semAudio' };

  const lidos = new Map();   // `${idioma}/${sotaque}/${texto}` → a leitura (a promessa de `{ audio }` ou `{ erro }`): o mesmo texto não é pedido duas vezes

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  function botao(texto, classe, aoClicar) {
    const no = elemento('button', `veio-botao ${classe}`, texto);
    no.type = 'button';
    no.addEventListener('click', aoClicar);
    return no;
  }

  /** Pede à Conexão que diga o texto; devolve `{ audio }` (base64) ou `{ erro }` (o ID da Voz que diz por que não veio), nunca levanta. Só a leitura boa fica guardada. */
  function ler(lang, texto) {
    const sotaque = raiz.AjustesDeEnvio.atual()[lang].ttsPhraseTld;
    const chave = `${lang}/${sotaque}/${texto}`;
    if (!lidos.has(chave)) {
      const leitura = pedir(lang, sotaque, texto);
      lidos.set(chave, leitura);
      leitura.then(({ erro }) => { if (erro) lidos.delete(chave); });
    }
    return lidos.get(chave);
  }

  async function pedir(lang, sotaque, texto) {
    const { PedidoAoAnki, ConexaoAnki } = raiz;
    let resposta;
    try {
      resposta = await PedidoAoAnki.pedir(ConexaoAnki.ENDERECO, PedidoAoAnki.falarAFrase(lang, sotaque, texto));
    } catch {
      return { erro: VOZ_DO_AUDIO.semConexao };
    }
    if (!resposta.ok) return { erro: PedidoAoAnki.ausenciaDaRota(resposta.status) === 'antiga' ? VOZ_DO_AUDIO.antiga : VOZ_DO_AUDIO.falhou };
    const dados = await resposta.json().catch(() => null);
    return typeof dados?.audio === 'string' && dados.audio ? { audio: dados.audio } : { erro: VOZ_DO_AUDIO.falhou };
  }

  /**
   * O quiz de `lang`. `aoUsar(nivel)` grava o nível escolhido no resultado e devolve uma promessa de `true` (gravou) ou `false` (quem o chama já avisou); `aoSair()`
   * fecha o quiz. Devolve `{ no, iniciar, parar }`: `iniciar()` começa (no russo, pelo alfabeto) e `parar()` desliga o relógio e o áudio.
   */
  function montar({ lang, aoUsar, aoSair }) {
    const Quiz = raiz.QuizDeNivel;
    const idioma = NOME_DO_IDIOMA[lang].toLowerCase();
    const estado = { pontos: [], sessao: null, pausa: null, audio: null, vez: 0 };

    const progresso = elemento('span', 'quiz__progresso');
    const sequencia = elemento('span', 'quiz__sequencia');
    const sair = botao(textoDaVoz('ONB-21.sair'), 'veio-botao--link', () => { parar(); aoSair(); });
    const cabecalho = elemento('div', 'quiz__cabecalho', progresso, sequencia, sair);
    const palco = elemento('div', 'quiz__palco');
    const no = elemento('section', 'quiz', cabecalho, palco);
    no.setAttribute('aria-label', textoDaVoz('ONB-21.rotulo', { idioma }));

    function parar() {
      estado.vez++;
      clearTimeout(estado.pausa);
      estado.pausa = null;
      estado.audio?.pause();
      estado.audio = null;
      estado.ranking?.parar();
    }

    /** Põe a pergunta na tela: o título dela recebe o foco, para o leitor de tela dizer a pergunta nova. */
    function mostrar(titulo, ...filhos) {
      const cabeca = elemento('h4', 'quiz__pergunta', titulo);
      cabeca.tabIndex = -1;
      palco.replaceChildren(cabeca, ...filhos);
      cabeca.focus();
      return cabeca;
    }

    function escreverASequencia() {
      sequencia.textContent = textoDaVoz('ONB-21.sequencia', { n: estado.sessao.sequencia() });
    }

    // O alfabeto (só o russo)

    function mostrarOAlfabeto() {
      progresso.textContent = '';
      sequencia.textContent = '';
      mostrar(textoDaVoz('ONB-21.alfabeto'), elemento('div', 'quiz__opcoes',
        botao(textoDaVoz('ONB-21.jaLeio'), 'veio-botao--secundario quiz__opcao', () => mostrarOPerfil(0)),
        botao(textoDaVoz('ONB-21.aindaNao'), 'veio-botao--secundario quiz__opcao', () => mostrarOResultado({ nivel: Quiz.NIVEIS.INICIANTE, semAlfabeto: true }))));
    }

    // A parte 1: o que a pessoa já faz

    function mostrarOPerfil(indice) {
      progresso.textContent = '';
      sequencia.textContent = '';
      const { pergunta, opcoes } = Quiz.PARTE_1[indice];
      mostrar(textoDaVoz(pergunta, { idioma }), elemento('div', 'quiz__opcoes', ...opcoes.map(([voz, pontos]) =>
        botao(textoDaVoz(voz, { idioma }), 'veio-botao--secundario quiz__opcao', () => {
          estado.pontos[indice] = pontos;
          if (indice + 1 < Quiz.PARTE_1.length) return mostrarOPerfil(indice + 1);
          estado.sessao = Quiz.iniciar(lang, Quiz.portaoInicial(estado.pontos));
          mostrarAPergunta();
        }))));
    }

    // A parte 2: o quiz de 4 alternativas

    async function tocar(texto, aviso) {
      const vez = ++estado.vez;
      estado.audio?.pause();
      aviso.hidden = true;
      const lido = await ler(lang, texto);
      if (vez !== estado.vez) return;
      try {
        if (lido.erro) throw new Error(lido.erro);
        estado.audio = new Audio(`data:audio/mpeg;base64,${lido.audio}`);
        await estado.audio.play();
      } catch (erro) {
        if (vez !== estado.vez) return;
        aviso.textContent = textoDaVoz(lido.erro || VOZ_DO_AUDIO.falhou);
        aviso.hidden = false;
      }
    }

    function mostrarAPergunta() {
      const pergunta = estado.sessao.pergunta();
      if (!pergunta) return mostrarOResultado(estado.sessao.resultado());
      progresso.textContent = textoDaVoz('ONB-21.progresso', { n: pergunta.numero, total: pergunta.total });
      escreverASequencia();
      const feedback = elemento('p', 'quiz__feedback');
      feedback.setAttribute('role', 'status');
      const aviso = elemento('p', 'bv-falha quiz__aviso');
      aviso.setAttribute('role', 'alert');
      aviso.hidden = true;
      const frase = pergunta.tipo === 'escuta' ? null : elemento('p', 'quiz__frase', pergunta.texto);
      frase?.setAttribute('lang', lang);
      const ouvir = pergunta.tipo === 'escuta' ? botao(textoDaVoz('ONB-21.ouvirDeNovo'), 'veio-botao--secundario quiz__ouvir', () => tocar(pergunta.texto, aviso)) : null;
      const alternativas = pergunta.opcoes.map((texto, indice) => botao(texto, 'veio-botao--secundario quiz__opcao', () => responder(indice)));
      const naoSei = botao(textoDaVoz('ONB-21.naoSei'), 'veio-botao--link quiz__nao-sei', () => responder(Quiz.NAO_SEI));
      const botoes = [...alternativas, naoSei];

      function responder(escolha) {
        parar();
        for (const b of botoes) b.disabled = true;
        const { acertou, naoSei: pulou, certa } = estado.sessao.responder(escolha);
        alternativas[certa].dataset.estado = 'certa';
        alternativas[certa].setAttribute('aria-current', 'true');
        if (!acertou && !pulou) alternativas[escolha].dataset.estado = 'errada';
        feedback.textContent = textoDaVoz(acertou ? 'ONB-21.acertou' : pulou ? 'ONB-21.naoSeiResposta' : 'ONB-21.errou');
        escreverASequencia();
        estado.pausa = setTimeout(mostrarAPergunta, PAUSA_DA_RESPOSTA_MS);
      }

      const grupo = elemento('div', 'quiz__opcoes', ...alternativas);
      const titulo = mostrar(textoDaVoz(VOZ_DO_TIPO[pergunta.tipo]), ...(ouvir ? [ouvir] : []), ...(frase ? [frase] : []), grupo, naoSei, feedback, aviso);
      grupo.setAttribute('role', 'group');
      grupo.setAttribute('aria-labelledby', (titulo.id = `quiz-${lang}-pergunta`));
      if (pergunta.tipo === 'escuta') tocar(pergunta.texto, aviso);
    }

    // O resultado: o nível sugerido com a prévia do Cartão

    function mostrarOResultado({ nivel, semAlfabeto = false, acertos, perguntas, melhorSequencia, escuta }) {
      parar();
      // O ranking é de quem fez o quiz: quem disse “Ainda não” no alfabeto não respondeu nada, e não entra.
      estado.ranking = semAlfabeto ? null : raiz.RankingNaTela.montar({ lang, idioma, resultado: { nivel, acertos, perguntas, melhorSequencia } });
      progresso.textContent = '';
      sequencia.textContent = '';
      const rascunho = { nivel };
      const resumo = semAlfabeto ? textoDaVoz('ONB-22.semAlfabeto')
        : textoDaVoz('ONB-22.resumo', { acertos, perguntas, sequencia: melhorSequencia, escutaAcertos: escuta.acertos, escutaPerguntas: escuta.perguntas });
      const usar = botao(textoDaVoz('ONB-22.usar'), 'veio-botao--primario', async () => {
        usar.disabled = true;
        const gravou = await aoUsar(rascunho.nivel);
        if (!gravou) usar.disabled = false;
      });
      mostrar(textoDaVoz('ONB-22.titulo', { idioma }),
        elemento('p', 'quiz__resumo', resumo),
        ...(estado.ranking ? [estado.ranking.no] : []),
        ...(semAlfabeto ? [] : [elemento('p', 'bv-nota', textoDaVoz('ONB-22.escutaNota'))]),
        elemento('p', 'bv-texto', textoDaVoz('ONB-22.trocar')),
        raiz.EstiloDoCartao.campo(lang, rascunho, { prefixo: 'bvq' }),
        elemento('div', 'quiz__acoes', usar),
        elemento('p', 'bv-nota', textoDaVoz('ONB-22.depois')));
      estado.ranking?.iniciar();
    }

    function iniciar() {
      parar();
      estado.pontos = [];
      estado.sessao = null;
      estado.ranking = null;
      if (lang === 'ru') mostrarOAlfabeto();
      else mostrarOPerfil(0);
    }

    return { no, iniciar, parar };
  }

  raiz.QuizNaTela = Object.freeze({ montar, PAUSA_DA_RESPOSTA_MS });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
