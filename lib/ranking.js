'use strict';

(function (raiz) {
  const { Sincronizacao } = raiz;
  const COLECAO = 'ranking';
  // Os níveis são os do quiz, do menor para o maior. Carregado depois de `lib/quiz-de-nivel.js`.
  const ORDEM_DOS_NIVEIS = Object.values(raiz.QuizDeNivel.NIVEIS);
  const LIMITE_DA_LISTA = 200;
  const URL_DOS_DOCUMENTOS = 'https://firestore.googleapis.com/v1/projects/perpetualminer-4c219/databases/(default)/documents';

  async function erroDaResposta(resposta) {
    const corpo = await resposta.json().catch(() => ({}));
    const mensagem = corpo?.error?.message || `HTTP ${resposta.status}`;
    if (resposta.status === 401) return Sincronizacao.erroDaNuvem(mensagem, { motivo: Sincronizacao.MOTIVO.EXPIROU });
    if (resposta.status === 403 || corpo?.error?.status === 'PERMISSION_DENIED') return Sincronizacao.erroDaNuvem(mensagem, { motivo: Sincronizacao.MOTIVO.RECUSADO });
    return Sincronizacao.erroDaNuvem(mensagem, { status: resposta.status });
  }

  const idDoRegistro = (idioma, uid) => `${idioma}_${uid}`;

  function nota({ nivel, acertos, perguntas }) {
    return ORDEM_DOS_NIVEIS.indexOf(nivel) * 1000 + (perguntas ? Math.round(100 * acertos / perguntas) : 0);
  }

  function registro({ uid, idioma, nome, foto, resultado, em }) {
    return {
      uid, idioma, nome, foto: foto || '', nivel: resultado.nivel, melhorSequencia: resultado.melhorSequencia,
      nota: nota(resultado), acertos: resultado.acertos, perguntas: resultado.perguntas, grupos: [], topou: true, em,
    };
  }

  function ordenar(pessoas) {
    return [...pessoas].sort((a, b) => b.nota - a.nota || b.melhorSequencia - a.melhorSequencia);
  }

  function melhorQue(minha, pessoas, uid) {
    const outras = pessoas.filter(p => p.uid !== uid);
    if (!outras.length) return null;
    return Math.round(100 * outras.filter(p => p.nota < minha).length / outras.length);
  }

  function nuvem({ sessao, buscar = (...a) => fetch(...a) }) {
    async function pedir(metodo, caminho, corpo) {
      const opcoes = { method: metodo, headers: { Authorization: `Bearer ${await sessao.token()}` } };
      if (corpo) {
        opcoes.headers['Content-Type'] = 'application/json';
        opcoes.body = JSON.stringify(corpo);
      }
      const resposta = await buscar(`${URL_DOS_DOCUMENTOS}${caminho}`, opcoes);
      if (resposta.status === 404 && metodo === 'DELETE') return null;
      if (!resposta.ok) throw await erroDaResposta(resposta);
      return resposta.json().catch(() => null);
    }

    const igual = (campo, tipo, valor) => ({ fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: { [tipo]: valor } } });

    return {
      async listar(idioma) {
        const resposta = await pedir('POST', ':runQuery', { structuredQuery: {
          from: [{ collectionId: COLECAO }],
          where: { compositeFilter: { op: 'AND', filters: [igual('topou', 'booleanValue', true), igual('idioma', 'stringValue', idioma)] } },
          limit: LIMITE_DA_LISTA,
        } });
        return (resposta || []).filter(item => item.document).map(item => Sincronizacao.deCampos(item.document.fields));
      },
      entrar(doc) {
        return pedir('PATCH', `/${COLECAO}/${idDoRegistro(doc.idioma, doc.uid)}`, { fields: Sincronizacao.paraCampos(doc) });
      },
      sair(idioma) {
        return pedir('DELETE', `/${COLECAO}/${idDoRegistro(idioma, sessao.uid)}`);
      },
    };
  }

  raiz.Ranking = Object.freeze({ COLECAO, idDoRegistro, nota, registro, ordenar, melhorQue, nuvem });
  if (typeof module !== 'undefined') module.exports = raiz.Ranking;
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
