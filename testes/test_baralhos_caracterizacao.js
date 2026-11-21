'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { MundoDosBaralhos, SITUACAO, MINUTO, COMECO } = require('./baralhos_mundo_falso.js');

const ESPERADO = path.join(__dirname, 'baralhos_caracterizacao_esperado.js');
const NOMES = { en: 'Inglês::Frases', ru: 'Русский::Фразы' };
const OUTROS_NOMES = { en: 'Inglês::Novo', ru: NOMES.ru };

const BARALHO_EN = {
  lang: 'en', deckName: 'Inglês::Frases', cards: 120, mature: 40, young: 20, learning: 5, new: 55,
  vocabulary: { phraseVocabulary: 1234, targetTerms: 300, avgNewPhraseVocabularyPerCard: 1.26 },
};
const BARALHO_RU_SEM = { lang: 'ru', deckName: 'Русский::Фразы', missing: true };
const BARALHO_EN_SEM_VOCABULARIO = { lang: 'en', uniqueTermTokens: 7, uniqueTerms: 5, cards: 0, mature: 0, young: 0, learning: 0, new: 0 };
const BARALHO_RU_SO_TERMOS = { lang: 'ru', deckName: 'Русский::Фразы', uniqueTerms: 9, cards: 'muitos', mature: 3, new: 'x' };

const ITENS_EN = [
  { word: 'run', type: 'word', status: 'mature', cards: 3, mature: 2, recent: 1, new: 0 },
  { word: 'give up', type: 'term', status: 'mixed', cards: 2, mature: 1, recent: 0, new: 1 },
  { word: 'Cat', type: 'word', status: 'new', cards: 1, new: 1 },
  { word: 'odd', type: 'outro', status: 'estranho', cards: 'x' },
  { word: 'ran', type: 'word', status: 'recent', cards: 4, recent: 4 },
  { word: 'seen', type: 'word', status: 'seen', cards: 1 },
];
const VOCABULARIO_EN = { deckName: 'Inglês::Frases', totalWords: 9, words: ITENS_EN };
const VOCABULARIO_RU_VAZIO = { words: 'nada' };
const MUITOS = Array.from({ length: 205 }, (_, i) => ({ word: `w${i}`, type: 'word', status: 'new', cards: 1, new: 1 }));

const ok = dados => ({ ok: true, dados });
const falha = detalhes => ({ ok: false, detalhes });

async function ligadoComNomes(gravado) {
  const mundo = new MundoDosBaralhos(gravado);
  await mundo.abrir();
  await mundo.conexao(SITUACAO.LIGADA);
  await mundo.usarBaralhos(NOMES);
  return mundo;
}

async function tudoLido(decks = { decks: [BARALHO_EN, BARALHO_RU_SEM] }, vocabularioRu = VOCABULARIO_RU_VAZIO) {
  const mundo = await ligadoComNomes();
  await mundo.responder(0, ok(decks));
  await mundo.responder(1, ok(VOCABULARIO_EN));
  await mundo.responder(2, ok(vocabularioRu));
  return mundo;
}

const azulejo = (aba, idioma) => `#anki-${aba}-azulejos [data-idioma="${idioma}"]`;
const opcao = palavra => `[data-foco="item:${palavra}"]`;

const CENARIOS = [
  ['conectando, e a Conexão liga sem estar apresentada', async mundo => {
    await mundo.abrir();
    await mundo.usarBaralhos(NOMES);
    mundo.foto('conectando');
    await mundo.conexao(SITUACAO.LIGADA, SITUACAO.CONECTANDO);
    mundo.foto('ligada sem apresentar');
  }],
  ['desligada sem nada guardado', async mundo => {
    await mundo.abrir();
    await mundo.conexao(SITUACAO.DESLIGADA, SITUACAO.CONECTANDO);
    mundo.foto('desligada sem apresentar');
    await mundo.conexao(SITUACAO.DESLIGADA);
    await mundo.usarBaralhos(NOMES);
    mundo.foto('nada');
  }],
  ['desligada com a leitura guardada', async mundo => {
    const quando = COMECO - 125 * MINUTO;
    Object.assign(mundo.gravado, {
      pm_anki_baralhos: { dados: { decks: [BARALHO_EN, BARALHO_RU_SEM], stale: true }, quando, nomes: NOMES },
      pm_anki_vocabulario: { dados: { en: { deckName: 'Inglês::Frases', itens: ITENS_EN, total: 9 } }, quando: quando + MINUTO, nomes: NOMES },
    });
    await mundo.abrir();
    await mundo.conexao(SITUACAO.DESLIGADA, SITUACAO.CONECTANDO);
    mundo.foto('antiga antes de apresentar');
    await mundo.conexao(SITUACAO.DESLIGADA);
    mundo.foto('antiga');
    mundo.agora += 2 * MINUTO;
    await mundo.clicar(mundo.achar(azulejo('baralhos', 'ru')));
    mundo.foto('russo sem baralho, dois minutos depois');
    await mundo.clicar(mundo.achar('#anki-baralhos-corpo .aviso-falso__acao'));
    await mundo.clicar(mundo.achar(azulejo('vocabulario', 'ru')));
    mundo.foto('abriu os ajustes; vocabulário russo sem leitura');
  }],
  ['o guardado não passa por cima da leitura que chegou antes dele', async mundo => {
    const quando = COMECO - 60 * MINUTO;
    Object.assign(mundo.gravado, {
      pm_anki_baralhos: { dados: { decks: [BARALHO_EN_SEM_VOCABULARIO] }, quando, nomes: NOMES },
      pm_anki_vocabulario: { dados: { en: { deckName: 'Velho', itens: [], total: 0 } }, quando, nomes: NOMES },
    });
    Object.assign(mundo, { situacao: SITUACAO.LIGADA, apresentada: SITUACAO.LIGADA, ultimaResposta: { quando } });
    mundo.carregar();
    await mundo.usarBaralhos(NOMES);
    await mundo.responder(0, ok({ decks: [BARALHO_EN, BARALHO_RU_SEM] }));
    await mundo.responder(1, ok(VOCABULARIO_EN));
    await mundo.responder(2, ok(VOCABULARIO_RU_VAZIO));
    await mundo.terminarDeCarregar();
    mundo.foto('a leitura nova ficou');
  }],
  ['ligada: lê, mostra e lê de novo quando o baralho muda', async mundo => {
    await mundo.abrir();
    await mundo.conexao(SITUACAO.LIGADA);
    mundo.foto('ligada sem nomes');
    await mundo.usarBaralhos(NOMES);
    mundo.foto('carregando');
    await mundo.responder(0, ok({ decks: [BARALHO_EN, BARALHO_RU_SEM], stale: true, generatedAt: COMECO - 10 * MINUTO }));
    await mundo.responder(1, ok(VOCABULARIO_EN));
    mundo.foto('baralhos lidos, vocabulário pela metade');
    await mundo.responder(2, ok(VOCABULARIO_RU_VAZIO));
    mundo.foto('tudo lido');
    await mundo.usarBaralhos({ ...NOMES });
    await mundo.usarBaralhos(OUTROS_NOMES);
    await mundo.usarBaralhos({ en: OUTROS_NOMES.en, ru: 'Русский::Новый' });
    mundo.foto('os nomes mudaram duas vezes', []);
  }],
  ['uma releitura que falha, com a Conexão ligada e depois desligada', async mundo => {
    const lido = await tudoLido();
    await lido.avisar('atualizar');
    await lido.responder(3, falha('caiu'));
    await lido.responder(4, falha('caiu'));
    await lido.responder(5, ok(VOCABULARIO_RU_VAZIO));
    lido.foto('o erro no lugar dos dados');
    await lido.conexao(SITUACAO.DESLIGADA);
    lido.foto('desligada: a leitura antiga');
    Object.assign(mundo, { fotos: lido.fotos });
  }],
  ['a leitura guardada pela Conexão sem a data dela', async mundo => {
    const lido = await tudoLido({ decks: [BARALHO_EN_SEM_VOCABULARIO], stale: true });
    lido.foto('sem generatedAt, um baralho sem vocabulary e o russo ausente', ['baralhos']);
    await lido.clicar(lido.achar(azulejo('baralhos', 'ru')));
    lido.foto('o russo ausente', ['baralhos']);
    Object.assign(mundo, { fotos: lido.fotos });
  }],
  ['um baralho só com termos e números estranhos', async mundo => {
    const lido = await tudoLido({ decks: [BARALHO_EN, BARALHO_RU_SO_TERMOS] });
    await lido.clicar(lido.achar(azulejo('baralhos', 'ru')));
    lido.foto('russo', ['baralhos']);
    Object.assign(mundo, { fotos: lido.fotos });
  }],
  ['os filtros do vocabulário', async mundo => {
    const lido = await tudoLido();
    await lido.escrever('anki-vocabulario-tipo', 'change', 'word');
    lido.foto('só palavras', ['vocabulario']);
    await lido.escrever('anki-vocabulario-status', 'change', 'mature');
    lido.foto('só palavras maduras', ['vocabulario']);
    await lido.escrever('anki-vocabulario-status', 'change', 'all');
    await lido.escrever('anki-vocabulario-busca', 'input', '  CA ');
    lido.foto('a busca acha Cat', ['vocabulario']);
    await lido.escrever('anki-vocabulario-busca', 'input', 'zz');
    lido.foto('a busca não acha nada', ['vocabulario']);
    await lido.clicar(lido.achar('#anki-vocabulario-corpo .veio-botao'));
    lido.foto('Limpar busca limpou tudo', ['vocabulario']);
    await lido.escrever('anki-vocabulario-tipo', 'change', 'term');
    await lido.escrever('anki-vocabulario-busca', 'input', 'run');
    lido.foto('termo com run: vazio', ['vocabulario']);
    await lido.clicar(lido.no('anki-vocabulario-limpar'));
    lido.foto('o × limpa só a busca', ['vocabulario']);
    Object.assign(mundo, { fotos: lido.fotos });
  }],
  ['um idioma sem itens, e o status sozinho', async mundo => {
    const lido = await tudoLido();
    await lido.clicar(lido.achar(azulejo('vocabulario', 'ru')));
    lido.foto('russo vazio, sem nada para limpar', ['vocabulario']);
    await lido.escrever('anki-vocabulario-status', 'change', 'new');
    lido.foto('russo vazio com status', ['vocabulario']);
    Object.assign(mundo, { fotos: lido.fotos });
  }],
  ['andar na lista pelo teclado e pelo clique', async mundo => {
    const lido = await tudoLido();
    const lista = () => lido.achar('#anki-vocabulario-corpo .anki-lista');
    const teclas = [];
    for (const tecla of ['ArrowDown', 'ArrowDown', 'End', 'ArrowDown', 'Home', 'ArrowUp', 'a', 'ArrowUp']) {
      teclas.push(`${tecla}:${await lido.tecla(lista(), tecla)}`);
    }
    lido.foto(`teclas ${teclas.join(' ')}`, ['vocabulario']);
    await lido.clicar(lido.achar(opcao('term:give up')));
    lido.foto('clicou em give up', ['vocabulario']);
    await lido.escrever('anki-vocabulario-status', 'change', 'mixed');
    lido.foto('o foco volta à opção desenhada de novo', ['vocabulario']);
    await lido.escrever('anki-vocabulario-status', 'change', 'new');
    lido.foto('o escolhido saiu da lista: o primeiro', ['vocabulario']);
    Object.assign(mundo, { fotos: lido.fotos });
  }],
  ['no máximo 200 itens na lista', async mundo => {
    const lido = await tudoLido(undefined, ok({ deckName: 'Русский', totalWords: 9000, words: MUITOS }).dados);
    await lido.clicar(lido.achar(azulejo('vocabulario', 'ru')));
    const mostrados = lido.achar('#anki-vocabulario-corpo .anki-lista').children.length;
    lido.foto(`opções na lista: ${mostrados}`, []);
    lido.fotos.push(['resumo', lido.no('anki-vocabulario-resumo').textContent]);
    Object.assign(mundo, { fotos: lido.fotos });
  }],
  ['as falhas e o Tentar de novo de cada aba', async mundo => {
    const lido = await ligadoComNomes();
    await lido.responder(0, falha('HTTP 500'));
    await lido.responder(1, falha('sem baralho'));
    await lido.responder(2, ok(VOCABULARIO_RU_VAZIO));
    lido.foto('as duas falharam');
    await lido.clicar(lido.achar('#anki-vocabulario-corpo .aviso-falso__acao'));
    lido.foto('Tentar de novo do vocabulário', []);
    await lido.clicar(lido.achar('#anki-baralhos-corpo .aviso-falso__acao'));
    lido.foto('Tentar de novo dos baralhos');
    Object.assign(mundo, { fotos: lido.fotos });
  }],
  ['a leitura mais velha que chega depois não vale', async mundo => {
    const lido = await ligadoComNomes();
    await lido.avisar('atualizar');
    lido.foto('duas leituras no ar', []);
    await lido.responder(3, ok({ decks: [BARALHO_EN] }));
    await lido.responder(4, ok(VOCABULARIO_EN));
    await lido.responder(5, ok(VOCABULARIO_RU_VAZIO));
    await lido.responder(0, falha('velha'));
    await lido.responder(1, falha('velha'));
    await lido.responder(2, ok(VOCABULARIO_RU_VAZIO));
    lido.foto('a nova ficou');
    Object.assign(mundo, { fotos: lido.fotos });
  }],
  ['fora da área do Anki', async mundo => {
    await mundo.abrir();
    mundo.area = 'frases';
    await mundo.conexao(SITUACAO.LIGADA);
    await mundo.usarBaralhos(NOMES);
    await mundo.conexao(SITUACAO.DESLIGADA);
    await mundo.conexao(SITUACAO.LIGADA);
    mundo.foto('nada lido fora da área', []);
    mundo.area = 'anki';
    await mundo.avisar('entrar:anki');
    mundo.foto('entrou na área', []);
    await mundo.conexao(SITUACAO.LIGADA);
    mundo.foto('ligada de novo não lê', []);
    await mundo.conexao(SITUACAO.CONECTANDO);
    await mundo.conexao(SITUACAO.LIGADA);
    mundo.foto('voltou a ligar na área', []);
  }],
];

const resumo = texto => crypto.createHash('sha256').update(texto).digest('hex').slice(0, 16);

async function fotografarOsCenarios() {
  const fotos = [];
  for (const [nome, cenario] of CENARIOS) {
    const mundo = new MundoDosBaralhos();
    await cenario(mundo);
    fotos.push(...mundo.fotos.map(([rotulo, texto]) => [`${nome} › ${rotulo}`, texto]));
  }
  return fotos;
}

function gravarAsFotos(fotos) {
  const linhas = fotos.map(([rotulo, texto]) => `  [${JSON.stringify(rotulo)}, '${resumo(texto)}'],`);
  fs.writeFileSync(ESPERADO, `'use strict';\n\nmodule.exports = [\n${linhas.join('\n')}\n];\n`);
}

function guardarAsFotosParaComparar(fotos) {
  const completo = path.join(os.tmpdir(), 'baralhos_caracterizacao_atual.txt');
  fs.writeFileSync(completo, fotos.map(([rotulo, texto]) => `=== ${rotulo}\n${texto}`).join('\n\n'));
  return completo;
}

function conferirAsFotos(fotos) {
  const vistas = fotos.map(([rotulo, texto]) => [rotulo, resumo(texto)]);
  try {
    assert.deepStrictEqual(vistas, require(ESPERADO));
  } catch (erro) {
    erro.message += `\nas fotos completas de agora estão em ${guardarAsFotosParaComparar(fotos)}`;
    throw erro;
  }
}

fotografarOsCenarios().then(fotos => {
  if (process.argv.includes('--gravar')) gravarAsFotos(fotos);
  else conferirAsFotos(fotos);
}).catch(erro => {
  console.error(erro);
  process.exitCode = 1;
});
