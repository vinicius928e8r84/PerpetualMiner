'use strict';

const { rota, rotaSe, PASSA } = require('./rota');
const { criarBaralhos } = require('./baralhos');

const EXEMPLO_DO_BARALHO_QUE_NAO_EXISTE = 'Números de um Baralho que existe e de um que não existe';

const LEITURAS_DO_ANKI = ['/anki/vocabulary', '/anki/decks', '/anki/stats/decks'];
const corpoDaLeitura = req => JSON.parse(req.postData() || '{}');
const ehLeituraDoAnki = ({ url }) => LEITURAS_DO_ANKI.includes(url.pathname);

function leituraDoContrato({ estado, respostaDoContrato }) {
  return ({ req, url, responder }) => {
    if (req.method() !== 'POST') return responder(404, { error: 'not_found' });
    const corpo = corpoDaLeitura(req);
    if (estado.contexto.colecao === undefined) return PASSA;
    const { status, json } = respostaDoContrato('POST', url.pathname, corpo);
    return responder(status, json);
  };
}

function leituraQuePodeFalhar({ falhaDe, erro, ler }) {
  return ({ req, route, responder }) => {
    const falha = falhaDe();
    if (falha?.rede) return route.abort('connectionrefused');
    if (falha) return responder(falha.status, { error: erro, detail: 'collection_not_open' });
    return responder(200, ler(corpoDaLeitura(req)));
  };
}

const listaDeBaralhos = estado => ({ responder }) => {
  if (!estado.baralhosDoAnki) return responder(503, { error: 'anki_decks_unavailable', detail: 'collection_not_open' });
  return responder(200, { decks: estado.baralhosDoAnki });
};

function criarRotasDaLeitura({ estado, contrato, respostaDoContrato }) {
  const { vocabulario, numerosDosBaralhos } = criarBaralhos({ estado, contrato, nomeDoExemploSemBaralho: EXEMPLO_DO_BARALHO_QUE_NAO_EXISTE });

  const rotas = [
    rotaSe(ehLeituraDoAnki, leituraDoContrato({ estado, respostaDoContrato })),
    rota('*', '/anki/vocabulary', leituraQuePodeFalhar({ falhaDe: () => estado.falhaDoVocabulario, erro: 'anki_vocabulary_unavailable', ler: vocabulario })),
    rota('*', '/anki/decks', listaDeBaralhos(estado)),
    rota('*', '/anki/stats/decks', leituraQuePodeFalhar({ falhaDe: () => estado.falhaDosBaralhos, erro: 'anki_stats_unavailable', ler: numerosDosBaralhos })),
  ];

  const api = {
    definirVocabulario(lang, palavras) { estado.vocabulario[lang] = palavras; estado.vocabularioDefinido = true; },
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
