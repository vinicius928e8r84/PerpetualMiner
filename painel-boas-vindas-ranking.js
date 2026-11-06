'use strict';

// O ranking do grupo na tela (#172, ONB-24): sob o resultado do quiz de nível, para quem tem conta Google. Mostra “Você foi melhor que X% de quem fez o quiz”, a caixa “Aparecer no
// ranking do grupo”, a lista de quem topou e “Chamar um amigo”. Os dados e o Firestore são de `lib/ranking.js`.
//
// Nada da pessoa sai sem ela marcar a caixa, que começa desmarcada: marcar grava o registro dela, desmarcar o apaga, e a caixa só muda de estado quando a nuvem confirma
// (a lista é relida depois de cada escolha). Sem conta, só o aviso, e nada é pedido à nuvem. O que vem dos outros (nome, foto) entra na tela como texto e como imagem https.

(function (raiz) {
  const { textoDaVoz, Ranking, Sincronizacao } = raiz;
  const VOZ_DO_NIVEL = { iniciante: 'BRG-42.iniciante', intermediario: 'BRG-42.intermediario', avancado: 'BRG-42.avancado' };
  const AVISO_DO_CONVITE_MS = 4000;

  function elemento(tag, classe, ...filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    no.append(...filhos);
    return no;
  }

  function botao(texto, aoClicar) {
    const no = elemento('button', 'veio-botao veio-botao--secundario', texto);
    no.type = 'button';
    no.addEventListener('click', aoClicar);
    return no;
  }

  /** A conta Google da extensão e o ranking na nuvem dela; null sem conta (a sessão guardada tem de ser a da conta mostrada). */
  async function abrirAConta() {
    const { pm_user_info: perfil } = await chrome.storage.local.get({ pm_user_info: null });
    const credenciais = await Sincronizacao.lerCredenciais();
    if (!perfil || credenciais?.uid !== perfil.uid) return null;
    const sessao = Sincronizacao.criarSessao({ credenciais, aoRenovar: Sincronizacao.guardarCredenciais });
    return { perfil, nuvem: Ranking.nuvem({ sessao }) };
  }

  /**
   * O ranking de `lang` para o `resultado` do quiz (`{ nivel, acertos, perguntas, melhorSequencia }`); `idioma` é o nome em minúsculas (inglês, russo).
   * Devolve `{ no, iniciar }`: `iniciar()` lê a conta e a lista.
   */
  function montar({ lang, idioma, resultado }) {
    const palco = elemento('div', 'ranking__palco');
    const no = elemento('section', 'ranking', elemento('h5', 'ranking__titulo', textoDaVoz('ONB-24.titulo')), palco);
    let conta = null;
    let vez = 0;

    function nota(texto, classe = 'bv-nota') {
      return elemento('p', classe, texto);
    }

    function foto(pessoa) {
      const caixa = elemento('span', 'ranking__foto');
      if (/^https:\/\//.test(pessoa.foto || '')) {
        const imagem = elemento('img');
        imagem.alt = '';
        imagem.referrerPolicy = 'no-referrer';
        imagem.src = pessoa.foto;
        caixa.append(imagem);
      }
      return caixa;
    }

    function linha(pessoa) {
      const nome = pessoa.nome || textoDaVoz('ONB-24.semNome');
      const meu = pessoa.uid === conta.perfil.uid;
      const texto = textoDaVoz('ONB-24.pessoa', {
        nome: meu ? textoDaVoz('ONB-24.voce', { nome }) : nome,
        nivel: textoDaVoz(VOZ_DO_NIVEL[pessoa.nivel] || VOZ_DO_NIVEL.iniciante), sequencia: pessoa.melhorSequencia,
      });
      return elemento('li', 'ranking__pessoa', foto(pessoa), elemento('span', null, texto));
    }

    async function chamarUmAmigo(aviso) {
      try {
        await navigator.clipboard.writeText(textoDaVoz('ONB-24.convite', { idioma }));
        aviso.textContent = textoDaVoz('ONB-24.convidou');
      } catch {
        aviso.textContent = textoDaVoz('ONB-24.semConvite');
      }
      setTimeout(() => { aviso.textContent = ''; }, AVISO_DO_CONVITE_MS);
    }

    function mostrarOGrupo(pessoas) {
      const topou = pessoas.some(p => p.uid === conta.perfil.uid);
      const minha = Ranking.nota(resultado);
      const x = Ranking.melhorQue(minha, pessoas, conta.perfil.uid);

      const caixa = elemento('input', 'veio-checkbox');
      caixa.type = 'checkbox';
      caixa.checked = topou;
      const falha = nota('', 'bv-falha');
      falha.setAttribute('role', 'alert');
      falha.hidden = true;
      caixa.addEventListener('change', async () => {
        caixa.disabled = true;
        falha.hidden = true;
        try {
          if (caixa.checked) await conta.nuvem.entrar(Ranking.registro({
            uid: conta.perfil.uid, idioma: lang, nome: conta.perfil.displayName || '', foto: conta.perfil.photoURL || '', resultado, em: Date.now(),
          }));
          else await conta.nuvem.sair(lang);
        } catch {
          caixa.checked = !caixa.checked;
          falha.textContent = textoDaVoz('ONB-24.falhaAoTopar');
          falha.hidden = false;
          caixa.disabled = false;
          return;
        }
        iniciarALista();
      });
      const rotulo = elemento('label', 'ranking__topar', caixa, elemento('span', null, textoDaVoz('ONB-24.topar')));

      const aviso = elemento('span', 'bv-nota');
      aviso.setAttribute('role', 'status');
      const lista = pessoas.length
        ? elemento('ol', 'ranking__lista', ...Ranking.ordenar(pessoas).map(linha))
        : nota(textoDaVoz('ONB-24.vazia'));
      palco.replaceChildren(
        x === null ? nota(textoDaVoz('ONB-24.primeira'), 'quiz__resumo') : nota(textoDaVoz('ONB-24.melhorQue', { x }), 'quiz__resumo'),
        rotulo, nota(textoDaVoz(topou ? 'ONB-24.topouNota' : 'ONB-24.naoTopouNota')), falha,
        elemento('h6', 'ranking__subtitulo', textoDaVoz('ONB-24.lista')), lista,
        elemento('div', 'ranking__convite', botao(textoDaVoz('ONB-24.chamar'), () => chamarUmAmigo(aviso)), aviso),
      );
    }

    async function iniciarALista() {
      const minhaVez = ++vez;
      palco.replaceChildren(nota(textoDaVoz('ONB-24.carregando')));
      try {
        conta ||= await abrirAConta();
        if (minhaVez !== vez) return;
        if (!conta) return palco.replaceChildren(nota(textoDaVoz('ONB-24.semConta')));
        const pessoas = await conta.nuvem.listar(lang);
        if (minhaVez === vez) mostrarOGrupo(pessoas);
      } catch {
        if (minhaVez !== vez) return;
        const falha = nota(textoDaVoz('ONB-24.falhou'), 'bv-falha');
        falha.setAttribute('role', 'alert');
        palco.replaceChildren(falha, botao(textoDaVoz('ONB-24.tentarDeNovo'), iniciarALista));
      }
    }

    return { no, iniciar: iniciarALista, parar: () => { vez++; } };
  }

  raiz.RankingNaTela = Object.freeze({ montar });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
