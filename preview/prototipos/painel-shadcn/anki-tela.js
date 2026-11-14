'use strict';

// Conexão com o Anki, a tela: o cabeçalho com o estado da conexão, o aviso de desligada, as abas e o que cada estado
// mostra no lugar delas (BRG-01, BRG-02, ENV-01, SHL-03).

(function (PS) {
  const { ic, pecas } = PS;
  const { visao, situacao } = PS.partesDoAnki;
  const partes = PS.partesDoAnki;
  const CORPOS = partes.corpos;
  const A = PS.acoes;

  // ---------- A tela ----------
  const ABAS = [['custos', 'Custos'], ['baralhos', 'Baralhos e termos'], ['vocabulario', 'Vocabulário'], ['ajustes', 'Ajustes de envio']];

  // Os passos de ligar acabaram de achar o Anki: a Conexão já conta como ligada, antes de as abas voltarem.
  const achouOAnki = () => situacao() === 'primeira' && visao.passo > partes.passosDeLigar;
  const desligada = () => (situacao() === 'desligada' || situacao() === 'primeira') && !achouOAnki();

  PS.conexao = function () {   // o estado da Conexão, para a lateral e o cabeçalho
    if (visao.conectando) return { rotulo: 'Conectando ao Anki…', ponto: 'aviso ponto--pulsa', selo: 'aviso' };
    if (desligada()) return { rotulo: 'Desligada', ponto: 'perigo', selo: 'perigo' };
    return { rotulo: 'Ligada', ponto: 'sucesso', selo: 'sucesso' };
  };

  PS.telas.anki = {
    titulo: 'Conexão com o Anki',
    desenhar(rota) {
      const aba = CORPOS[rota.sub] ? rota.sub : 'custos';
      const conexao = PS.conexao();
      const cabeca = `<header class="tela__cabeca"><div><h1 class="tela__titulo" id="titulo-da-tela" tabindex="-1">Conexão com o Anki <span class="selo selo--${conexao.selo}"><span class="ponto ponto--${conexao.ponto}"></span>${conexao.rotulo}</span></h1><p class="tela__descricao">O que os envios custam, o que o Anki já sabe e como cada cartão é feito.</p></div>`
        + `<button type="button" class="botao botao--contorno" id="anki-atualizar" data-acao="anki.atualizar" data-dica="Atualizar (abre o Anki se precisar)" aria-busy="${visao.atualizando}">${ic(visao.atualizando ? 'carregando' : 'atualizar')}Atualizar</button></header>`;
      const faixa = desligada()
        ? pecas.alerta({ tipo: 'perigo', icone: 'tomada-fora', papel: 'status', titulo: visao.conectando ? 'Conectando ao Anki…' : 'A Conexão com o Anki está desligada.', texto: visao.conectando ? '' : 'Ligue-a neste computador e tente de novo.', acoes: visao.conectando ? '' : '<button type="button" class="botao botao--contorno botao--p" data-acao="anki.tentarDeNovo" data-foco="tentar-de-novo">Tentar de novo</button>' }) : '';   // ENV-01, BRG-02
      if (situacao() === 'primeira') return `<div class="tela">${cabeca}${faixa}${partes.primeiraConexao()}</div>`;
      return `<div class="tela">${cabeca}${faixa}${pecas.abas({ rotulo: 'Seções da Conexão com o Anki', valor: aba, acao: 'anki.aba', chave: 'aba-anki', opcoes: ABAS })}`
        + `<div role="tabpanel" aria-label="${ABAS.find(([v]) => v === aba)[1]}" class="tela__painel">${CORPOS[aba]()}</div></div>`;
    },
  };

  A['anki.aba'] = botao => PS.ir(`anki/${botao.dataset.valor}`);
  A['anki.atualizar'] = () => {
    visao.atualizando = true;
    PS.desenhar();
    setTimeout(() => { visao.atualizando = false; PS.desenhar(); }, 900);
  };
  A['anki.tentarDeNovo'] = () => {
    visao.conectando = true;
    PS.desenhar();
    setTimeout(() => {
      visao.conectando = false;
      if (situacao() === 'primeira') { PS.desenhar(); return; }   // nunca conectou: só os passos ligam
      PS.mudar({ estado: 'normal' });
      PS.avisar('Conexão com o Anki: ligada');   // BRG-01
    }, 1100);
  };
  A['anki.abrirOAnki'] = () => PS.avisar('Abrindo o Anki…');   // BRG-38
})(window.PS);
