'use strict';

const { rota, rotaSe, PASSA } = require('./rota');
const { criarBaralhos } = require('./baralhos');

const EXEMPLO_DO_BARALHO_QUE_NAO_EXISTE = 'Números de um Baralho que existe e de um que não existe';

function criarRotasDaLeitura({ estado, contrato, respostaDoContrato }) {
  const { vocabulario, numerosDosBaralhos } = criarBaralhos({ estado, contrato, nomeDoExemploSemBaralho: EXEMPLO_DO_BARALHO_QUE_NAO_EXISTE });

  const leituraDoAnki = ['/anki/vocabulary', '/anki/decks', '/anki/stats/decks'];
  const corpoDaLeitura = req => JSON.parse(req.postData() || '{}');

  const rotas = [
    rotaSe(({ url }) => leituraDoAnki.includes(url.pathname), ({ req, url, responder }) => {
      if (req.method() !== 'POST') return responder(404, { error: 'not_found' });
      const corpo = corpoDaLeitura(req);
      if (estado.contexto.colecao !== undefined) {
        const { status, json } = respostaDoContrato('POST', url.pathname, corpo);
        return responder(status, json);
      }
      return PASSA;
    }),
    rota('*', '/anki/vocabulary', ({ req, route, responder }) => {
      const falha = estado.falhaDoVocabulario;
      if (falha?.rede) return route.abort('connectionrefused');
      if (falha) return responder(falha.status, { error: 'anki_vocabulary_unavailable', detail: 'collection_not_open' });
      return responder(200, vocabulario(corpoDaLeitura(req)));
    }),
    rota('*', '/anki/decks', ({ responder }) => {
      if (!estado.baralhosDoAnki) return responder(503, { error: 'anki_decks_unavailable', detail: 'collection_not_open' });
      return responder(200, { decks: estado.baralhosDoAnki });
    }),
    rota('*', '/anki/stats/decks', ({ req, route, responder }) => {
      const falha = estado.falhaDosBaralhos;
      if (falha?.rede) return route.abort('connectionrefused');
      if (falha) return responder(falha.status, { error: 'anki_stats_unavailable', detail: 'collection_not_open' });
      return responder(200, numerosDosBaralhos(corpoDaLeitura(req)));
    }),
  ];

  const api = {
    definirVocabulario(lang, palavras) { estado.vocabulario[lang] = palavras; },
    falharVocabulario(falha = { status: 503 }) { estado.falhaDoVocabulario = falha; },
    voltarVocabulario() { estado.falhaDoVocabulario = null; },

    definirBaralho(deckName, numeros) { estado.baralhos[deckName] = numeros; },
    definirBaralhosDoAnki(nomes) { estado.baralhosDoAnki = nomes; },
    falharBaralhos(falha = { status: 503 }) { estado.falhaDosBaralhos = falha; },
    voltarBaralhos() { estado.falhaDosBaralhos = null; },
  };

  return { rotas, api };
}

module.exports = { criarRotasDaLeitura };
