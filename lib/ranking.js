'use strict';

// O ranking do grupo (#172, ONB-23): o registro de quem topou aparecer, a nota, o “melhor que X%” e o pedido ao Firestore. Sem tela (a tela é de `painel-boas-vindas-ranking.js`).
//
// Uma coleção comum, `ranking/{idioma}_{uid}`, com um documento só por pessoa e idioma, e só de quem topou: topar grava, desmarcar apaga, e quem não topou não grava nada. As regras
// (`docs/seguranca/ranking-do-grupo.rules`, que o dono publica; este código nunca as publica) deixam ler só o que tem `topou: true` e gravar só o próprio documento. O documento guarda o que
// o ranking mostra (nome, foto, nível, melhor sequência) e o que os recortes de depois pedem (o idioma, a nota e os acertos para a média, `grupos` para os grupos, `em` para o tempo).
// O ranking “meio multiplayer” (global, por grupos e com a média) fica fora: aqui só o registro nasce pronto para eles.

(function (raiz) {
  const { Sincronizacao } = raiz;
  const COLECAO = 'ranking';
  const ORDEM_DOS_NIVEIS = ['iniciante', 'intermediario', 'avancado'];
  const LIMITE_DA_LISTA = 200;

  const idDoRegistro = (idioma, uid) => `${idioma}_${uid}`;

  /** A nota ordena primeiro pelo nível e, dentro dele, pela parte de acertos (0 a 100), igual em 3 ou em 6 perguntas. */
  function nota({ nivel, acertos, perguntas }) {
    return ORDEM_DOS_NIVEIS.indexOf(nivel) * 1000 + (perguntas ? Math.round(100 * acertos / perguntas) : 0);
  }

  /** O documento de quem topou: `resultado` é o do quiz (`QuizDeNivel`), `nome` e `foto` os da conta Google. */
  function registro({ uid, idioma, nome, foto, resultado, em }) {
    return {
      uid, idioma, nome, foto: foto || '', nivel: resultado.nivel, melhorSequencia: resultado.melhorSequencia,
      nota: nota(resultado), acertos: resultado.acertos, perguntas: resultado.perguntas, grupos: [], topou: true, em,
    };
  }

  /** Quem está na frente: a nota maior primeiro, e no empate a melhor sequência. */
  function ordenar(pessoas) {
    return [...pessoas].sort((a, b) => b.nota - a.nota || b.melhorSequencia - a.melhorSequencia);
  }

  /** De 0 a 100, a parte de quem topou (sem contar `uid`) que tem nota abaixo da `minha`; null quando não há mais ninguém. Empate não é ser melhor. */
  function melhorQue(minha, pessoas, uid) {
    const outras = pessoas.filter(p => p.uid !== uid);
    if (!outras.length) return null;
    return Math.round(100 * outras.filter(p => p.nota < minha).length / outras.length);
  }

  /** O ranking na nuvem pelo REST, com a sessão da conta. `buscar` é o `fetch`. */
  function nuvem({ sessao, buscar = (...a) => fetch(...a) }) {
    async function pedir(metodo, caminho, corpo) {
      const opcoes = { method: metodo, headers: { Authorization: `Bearer ${await sessao.token()}` } };
      if (corpo) {
        opcoes.headers['Content-Type'] = 'application/json';
        opcoes.body = JSON.stringify(corpo);
      }
      const resposta = await buscar(`${Sincronizacao.URL_DOS_DOCUMENTOS}${caminho}`, opcoes);
      // 404 ao apagar: o documento já não existe, tudo certo.
      if (resposta.status === 404 && metodo === 'DELETE') return null;
      if (!resposta.ok) throw await Sincronizacao.erroDaResposta(resposta);
      return resposta.json().catch(() => null);
    }

    const igual = (campo, tipo, valor) => ({ fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: { [tipo]: valor } } });

    return {
      /** Quem topou aparecer neste idioma (sem ordem). */
      async listar(idioma) {
        const resposta = await pedir('POST', ':runQuery', { structuredQuery: {
          from: [{ collectionId: COLECAO }],
          where: { compositeFilter: { op: 'AND', filters: [igual('topou', 'booleanValue', true), igual('idioma', 'stringValue', idioma)] } },
          limit: LIMITE_DA_LISTA,
        } });
        return (resposta || []).filter(item => item.document).map(item => Sincronizacao.deCampos(item.document.fields));
      },
      /** A pessoa topou: grava o registro dela. */
      entrar(doc) {
        return pedir('PATCH', `/${COLECAO}/${idDoRegistro(doc.idioma, doc.uid)}`, { fields: Sincronizacao.paraCampos(doc) });
      },
      /** A pessoa desmarcou: apaga o registro dela. */
      sair(idioma) {
        return pedir('DELETE', `/${COLECAO}/${idDoRegistro(idioma, sessao.uid)}`);
      },
    };
  }

  raiz.Ranking = Object.freeze({ COLECAO, idDoRegistro, nota, registro, ordenar, melhorQue, nuvem });
  if (typeof module !== 'undefined') module.exports = raiz.Ranking;
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
