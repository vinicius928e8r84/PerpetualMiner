'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..');
const contexto = { console };
contexto.globalThis = contexto;
vm.createContext(contexto);
for (const arquivo of ['lib/voz/catalogo.js', 'lib/voz/texto.js', 'lib/idioma.js', 'lib/mineracao.js', 'lib/palavra-automatica.js']) {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, arquivo), 'utf8'), contexto, { filename: arquivo });
}
const { PalavraAutomatica } = contexto.PerpetualMiner;

const STOP_WORDS_EN = [
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during',
  'each', 'few', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', "i'd", "i'll", "i'm", "i've", 'if', 'in', 'into', 'is', 'it', "it's", 'its', 'itself',
  'just', 'me', 'more', 'most', 'my', 'myself',
  'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves',
  'out', 'over', 'own', 'same', 'she', "she's", 'should', 'so', 'some', 'such',
  'than', 'that', "that's", 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', "there's",
  'these', 'they', "they're", 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very',
  'was', 'we', "we're", 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with',
  'you', 'your', 'yours', 'yourself', 'yourselves',
];

const STOP_WORDS_RU = [
  'а', 'без', 'бы', 'в', 'вам', 'вас', 'все', 'всё', 'вы', 'где', 'да', 'для', 'до', 'его', 'ее', 'её',
  'если', 'есть', 'же', 'за', 'и', 'из', 'или', 'им', 'их', 'к', 'как', 'ко', 'когда', 'ли', 'мне',
  'мы', 'на', 'над', 'нас', 'не', 'него', 'нее', 'неё', 'нет', 'ни', 'но', 'ну', 'о', 'об', 'он',
  'она', 'они', 'оно', 'от', 'по', 'под', 'при', 'с', 'со', 'так', 'там', 'тебе', 'тебя', 'то',
  'только', 'ты', 'у', 'уже', 'что', 'чтобы', 'это', 'я',
];

const PADROES = [
  'as soon as', 'as long as', 'as far as', 'as if', 'as though',
  'even though', 'even if', 'rather than', 'instead of', 'because of', 'due to',
  'in order to', 'so that', 'so as to', 'used to', 'be used to', 'get used to',
  'be supposed to', 'about to', 'going to', 'have to', 'had better',
  'no matter', 'let alone', 'at least', 'at all', 'after all',
  'in spite of', 'out of', 'up to', 'in charge of', 'on behalf of',
];

const PARTICULAS = [
  'about', 'across', 'after', 'along', 'around', 'aside', 'away', 'back', 'by',
  'down', 'forward', 'in', 'into', 'off', 'on', 'out', 'over', 'through',
  'together', 'up',
];

const FINAIS = [
  'about', 'across', 'after', 'against', 'at', 'by', 'for', 'from', 'into',
  'of', 'on', 'over', 'through', 'to', 'with',
];

const OBJETOS_DE_ACAO = [
  'plough', 'ploughing', 'plow', 'plowing', 'sow', 'sowing',
  'plant', 'planting', 'harvest', 'harvesting', 'reap', 'reaping',
];

const FORTES = ['nursing', 'weaned', 'weaning', 'gruel', 'sow'];
const RAIZES_FORTES = ['fritter', 'frittered', 'frittering'];
const STATUS = ['unknown', 'new', 'recent', 'mixed', 'seen', 'mature'];

const PLACAR = {
  idioma: { unknown: 122, new: 94, recent: 84, mixed: 70, seen: 60, mature: 36 },
  conteudo: { unknown: 124, new: 96, recent: 86, mixed: 72, seen: 62, mature: 38 },
  acao: { unknown: 118, new: 92, recent: 82, mixed: 68, seen: 58, mature: 34 },
  padrao: { unknown: 72, new: 52, recent: 44, mixed: 36, seen: 30, mature: 18 },
  frasal: { unknown: 60, new: 50, recent: 42, mixed: 34, seen: 28, mature: 16 },
};

const palavrasDe = texto => texto.toLowerCase().match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) || [];

function vocabulario({ words = [], terms = [], termInfo = {}, wordInfo = {}, available = true } = {}) {
  return {
    available,
    words: new Set(words),
    terms: new Set(terms),
    wordInfo: new Map(Object.entries(wordInfo)),
    termInfo: new Map(Object.entries(termInfo).filter(([, status]) => status !== 'unknown').map(([termo, status]) => [termo, { status }])),
  };
}

const rival = tamanho => 'q'.repeat(tamanho);

const casos = {};
const EXIGIDO = { limit: 2, requireVocabulary: true };
const UMA = { limit: 1, requireVocabulary: true };
const EN = { lang: 'en', opcoes: EXIGIDO };
const EN_UMA = { lang: 'en', opcoes: UMA };
const ru = opcoes => ({ lang: 'ru', opcoes });
const en = opcoes => ({ lang: 'en', opcoes });
const RU_DUAS = ru({ limit: 2 });
const marcadas = (...palavras) => palavras.map((palavra, i) => `${palavra}@${2 * i}`);

function caso(id, texto, vocab, { lang, opcoes } = EN) {
  assert.ok(!(id in casos), `caso repetido: ${id}`);
  casos[id] = { esperado: undefined, executar: () => PalavraAutomatica.escolher(texto, lang, vocabulario(vocab), opcoes) };
  return { espera: esperado => { casos[id].esperado = esperado; } };
}

const tamanhosDeRival = tamanhos => [...new Set(tamanhos.filter(t => t >= 3 && t <= 17))];

function contraRivais(id, texto, vocab, placar) {
  const sozinho = Math.max(placar - 70, 3);
  for (const tamanho of tamanhosDeRival([sozinho, sozinho + 1])) caso(`${id} contra ${rival(tamanho)}`, `${texto} ${rival(tamanho)}`, vocab, EN_UMA);
  for (const forte of ['gruel', 'sow']) caso(`${id} contra ${forte}`, `${texto} ${forte}`, vocab, EN_UMA);
  for (const tamanho of tamanhosDeRival([sozinho - 1, sozinho, 16])) caso(`${id} depois de ${rival(tamanho)}`, `${rival(tamanho)} ${texto}`, vocab, EN_UMA);
}

function casoContraRivais(id, texto, vocab, placar) {
  caso(id, texto, vocab);
  contraRivais(id, texto, vocab, placar);
}

function casosDePalavraDeParada() {
  for (const palavra of STOP_WORDS_EN) caso(`en parada ${palavra}`, palavra, {}).espera([]);
  for (const palavra of STOP_WORDS_RU) caso(`ru parada ${palavra}`, palavra, {}, RU_DUAS).espera([]);
}

function casosDeControle() {
  caso('en controle zebra', 'zebra', {});
  caso('ru controle', 'зебра', {}, RU_DUAS);
  caso('en curta', 'zb', {});
  caso('en com digito', 'abc1 4ab', {});
  caso('en sem letra latina', 'пппп', {});
  caso('ru em latim', 'zebra', {}, RU_DUAS);
  caso('ru com digito', 'зебра1 4аб', {}, RU_DUAS);
  caso('ru uma letra', 'ж', {}, RU_DUAS);
  caso('ru duas letras', 'жж', {}, RU_DUAS);
  caso('ru sem vocabulario', 'зебра', { available: false }, RU_DUAS);
  caso('en sem vocabulario exigido', 'zebra', { available: false });
  caso('en sem vocabulario nao exigido', 'zebra', { available: false }, en({ limit: 2 }));
  caso('en limite zero vira 2', 'zebra yak llama', {}, en({ limit: 0 }));
  caso('en limite 5 vira 2', 'zebra yak llama', {}, en({ limit: 5 }));
  caso('en limite 1', 'zebra yak llama', {}, en({ limit: 1 }));
  caso('ru limite 3', 'зебра як лама', {}, ru({ limit: 3 }));
  caso('ru sem limite', 'зебра як лама', {}, ru({}));
}

const SO_O_USED_TO_FICA = ['be used to', 'get used to'];
const esperadoComTermoEstudado = padrao => (SO_O_USED_TO_FICA.includes(padrao) ? ['used@2', 'to@4'] : []);

function casosDoPadrao(padrao) {
  const palavras = padrao.split(' ');
  caso(`padrao conhecido ${padrao}`, padrao, { words: palavras }).espera(marcadas(...palavras));
  caso(`padrao com termo estudado ${padrao}`, padrao, { words: palavras, terms: [padrao] }).espera(esperadoComTermoEstudado(padrao));
  const placar = PLACAR.padrao.unknown + palavras.length;
  const perde = rival(placar - 71);
  const vence = rival(placar - 70);
  caso(`padrao ${padrao} vence ${perde}`, `${perde} ${padrao}`, { words: palavras }, EN_UMA).espera(palavras.map((palavra, i) => `${palavra}@${2 + 2 * i}`));
  caso(`padrao ${padrao} perde para ${vence}`, `${vence} ${padrao}`, { words: palavras }, EN_UMA).espera([`${vence}@0`]);
}

function casosDoPadraoPorEstado(padrao) {
  for (const estado of STATUS) caso(`padrao ${padrao} ${estado}`, padrao, { words: padrao.split(' '), termInfo: { [padrao]: estado } });
}

function casosDePadrao() {
  for (const padrao of PADROES) casosDoPadrao(padrao);
  for (const padrao of ['as soon as', 'out of', 'in spite of']) casosDoPadraoPorEstado(padrao);
}

function casosDeIdioma() {
  const termo = 'around the clock';
  for (const estado of STATUS) {
    casoContraRivais(`idioma ${estado}`, termo, { words: palavrasDe(termo), termInfo: { [termo]: estado } }, PLACAR.idioma[estado] + 3);
  }
  caso('idioma estudado', termo, { words: ['around', 'the', 'clock'], terms: [termo] });
  caso('idioma desconhecido com palavra nova', termo, {});
  caso('idioma no meio do texto', 'He worked around the clock again', { words: ['worked', 'again', 'around', 'the', 'clock'] });
  caso('idioma no fim e no comeco', 'around the clock around the clock', { words: ['around', 'the', 'clock'] });
}

const bonusDoTamanho = (...palavras) => Math.min(8, palavras.join('').length);

function casosDoConteudo([primeira, terceira]) {
  const termo = `${primeira} of ${terceira}`;
  for (const estado of STATUS) {
    casoContraRivais(`conteudo ${termo} ${estado}`, termo, { words: [terceira], termInfo: { [termo]: estado } }, PLACAR.conteudo[estado] + bonusDoTamanho(primeira, terceira));
  }
  caso(`conteudo ${termo} estudado`, termo, { words: [terceira], terms: [termo] });
  caso(`conteudo ${termo} tudo conhecido`, termo, { words: [primeira, terceira] });
  caso(`conteudo ${termo} so a terceira nova`, termo, { words: [primeira] });
}

function casosDeConteudo() {
  for (const par of [['drought', 'rain'], ['lack', 'sleep']]) casosDoConteudo(par);
  for (const ligacao of ['for', 'to', 'in', 'on', 'and', 'with', 'from', 'at', 'by', 'or', 'the', 'a']) {
    caso(`conteudo ligacao ${ligacao}`, `drought ${ligacao} rain`, { words: ['rain'] });
  }
  caso('conteudo primeira curta', 'ox of rain', { words: ['rain'] });
  caso('conteudo terceira parada', 'drought of the', {});
  caso('conteudo primeira parada', 'the of drought', {});
}

function casosDoObjetoDeAcao(objeto) {
  caso(`acao ${objeto} fields`, `${objeto} fields`, { words: ['fields'] });
  caso(`acao ${objeto} fields desconhecido`, `${objeto} fields`, {});
  caso(`acao ${objeto} conhecido`, `${objeto} fields`, { words: [objeto, 'fields'] });
}

function casosDeAcao() {
  for (const objeto of OBJETOS_DE_ACAO) casosDoObjetoDeAcao(objeto);
  const termo = 'ploughing fields';
  for (const estado of STATUS) {
    casoContraRivais(`acao ${estado}`, termo, { words: ['fields'], termInfo: { [termo]: estado } }, PLACAR.acao[estado] + bonusDoTamanho('ploughing', 'fields'));
  }
  caso('acao estudada', termo, { words: ['fields'], terms: [termo] });
  caso('acao generica ing longa', 'wandering dogs', { words: ['dogs'] });
  caso('acao generica ing de 5 letras', 'doing dogs', { words: ['dogs'] });
  caso('acao generica ing de 6 letras', 'eating dogs', { words: ['dogs'] });
  caso('acao generica ing de 7 letras', 'walking dogs', { words: ['dogs'] });
  caso('acao generica ing parada', 'during dogs', { words: ['dogs'] });
  caso('acao generica ing parada nothing', 'nothing dogs', { words: ['dogs'] });
  caso('acao objeto parado', 'ploughing the', {});
  caso('acao objeto curto', 'ploughing ox', { words: [] });
  caso('acao objeto com digito', 'ploughing a1b', {});
  caso('acao nao termina em ing', 'ploughed fields', { words: ['fields'] });
  caso('acao 4 letras', 'plow fields', { words: ['fields'] });
}

const PLACAR_DO_VERBO_FORTE = 58;

function casosDoFrasalPorEstado(raiz, estado) {
  const termo = `${raiz} away`;
  casoContraRivais(`frasal ${raiz} ${estado}`, termo, { termInfo: { [termo]: estado } }, PLACAR.frasal[estado] + 2 + PLACAR_DO_VERBO_FORTE);
  const termo3 = `${raiz} away with`;
  casoContraRivais(`frasal ${raiz} tres ${estado}`, termo3, { termInfo: { [termo3]: estado } }, PLACAR.frasal[estado] + 3 + PLACAR_DO_VERBO_FORTE);
}

function casosDaRaizForte(raiz) {
  for (const particula of PARTICULAS) caso(`frasal ${raiz} ${particula}`, `${raiz} ${particula}`, {}).espera(marcadas(raiz, particula));
  for (const final of FINAIS) caso(`frasal ${raiz} away ${final}`, `${raiz} away ${final}`, {});
  caso(`frasal ${raiz} sem particula`, `${raiz} money`, {});
  caso(`frasal ${raiz} particula e palavra nao final`, `${raiz} away money`, {});
  caso(`frasal ${raiz} termo estudado`, `${raiz} away`, { terms: [`${raiz} away`] });
  caso(`frasal ${raiz} termo de tres estudado`, `${raiz} away on`, { terms: [`${raiz} away on`] });
  for (const estado of STATUS) casosDoFrasalPorEstado(raiz, estado);
}

function casosDeFrasal() {
  for (const raiz of RAIZES_FORTES) casosDaRaizForte(raiz);
  for (const particula of PARTICULAS) caso(`frasal comum ${particula}`, `turn ${particula}`, {});
  for (const final of FINAIS) caso(`frasal comum tres ${final}`, `turn up ${final}`, {});
  caso('frasal com primeira parada', 'out up', {});
  caso('frasal raiz forte parada nao conta', 'up away', {});
  caso('frasal raiz forte curta', 'fritter', {});
  caso('frasal particula no fim', 'money frittered away', {});
  caso('frasal tres com particula e final no meio do texto', 'He frittered away with joy', { words: ['he', 'joy'] });
}

const paresDistintos = lista => lista.flatMap(primeira => lista.filter(segunda => segunda !== primeira).map(segunda => [primeira, segunda]));

function casosDeTamanhoEForca() {
  for (let tamanho = 3; tamanho <= 17; tamanho++) {
    caso(`palavra ${tamanho} antes de ${tamanho + 1}`, `${rival(tamanho)} ${rival(tamanho + 1)}`, {}, EN_UMA);
    caso(`palavra ${tamanho + 1} antes de ${tamanho}`, `${rival(tamanho + 1)} ${rival(tamanho)}`, {}, EN_UMA);
  }
  for (const forte of FORTES) {
    caso(`forte ${forte}`, forte, {});
    caso(`forte ${forte} conhecida`, forte, { words: [forte] });
  }
  for (const [primeira, segunda] of paresDistintos([rival(16), ...FORTES])) {
    caso(`forte ${primeira} antes de ${segunda}`, `${primeira} ${segunda}`, {}, EN_UMA);
  }
}

function casosSoltos() {
  caso('limiar: todas as palavras conhecidas', 'zebra yak llama', { words: ['zebra', 'yak', 'llama'] });
  caso('desempate pela posicao', 'aaaa bbbb cccc', {}, en({ limit: 3 }));
  caso('sobreposicao some', 'around the clock clock', { words: ['around', 'the'] }, en({ limit: 3 }));
  caso('virgula e hifen', 'a well-known zebra, yak.', {});
  caso('indices com pontuacao', '"Zebra!" said (llama)', {});
  caso('texto vazio', '', {});
  caso('so pontuacao', '... !!!', {});
}

casosDePalavraDeParada();
casosDeControle();
casosDePadrao();
casosDeIdioma();
casosDeConteudo();
casosDeAcao();
casosDeFrasal();
casosDeTamanhoEForca();
casosSoltos();

const AVALIACOES = [];
function avaliacao(id, texto, lang, vocab = {}) {
  AVALIACOES.push([id, texto, lang, vocab]);
}
for (const frase of ['skip intro', 'skip recap', 'next episode', 'prime video', 'audio', 'subtitles',
  'pular abertura', 'próximo episódio', 'legendas', 'temporada', 'episódio']) {
  avaliacao(`bloqueada igual ${frase}`, frase, 'en');
  avaliacao(`bloqueada igual maiuscula ${frase}`, frase.toUpperCase(), 'en');
  avaliacao(`bloqueada dentro ${frase}`, `unfathomable ${frase} unfathomable`, 'en');
  avaliacao(`bloqueada espacos ${frase}`, `  ${frase.replace(' ', '   ')}  `, 'en');
}
avaliacao('curta de 3', 'abc', 'en');
avaliacao('curta de 4', 'abcd', 'en');
avaliacao('so numeros e pontuacao', '12:30 - 4!', 'en');
avaliacao('numeros e uma letra', '12:30 a', 'en');
avaliacao('numeros e duas letras', '12:30 ab', 'en');
avaliacao('240 caracteres', `${'ab '.repeat(79)}abcdefghi`.slice(0, 240), 'en');
avaliacao('240 depois de normalizar mais um', `unfathomable${' '.repeat(10)}${'b'.repeat(228)}`, 'en');
avaliacao('241 caracteres', `${'ab '.repeat(80)}z`.slice(0, 241), 'en');
avaliacao('240 depois de normalizar', `unfathomable${' '.repeat(10)}${'b'.repeat(227)}`, 'en');
avaliacao('300 caracteres russo', `${'зебра '.repeat(50)}`.trim(), 'ru');
avaliacao('en tudo conhecido', 'zebra', 'en', { words: ['zebra'] });
avaliacao('en um grupo', 'zebra', 'en');
avaliacao('en dois grupos', 'zebra and llama', 'en');
avaliacao('en tres grupos so dois contam', 'zebra yak llama', 'en');
avaliacao('en sem vocabulario', 'zebra', 'en', { available: false });
avaliacao('ru sem vocabulario', 'зебра', 'ru', { available: false });
avaliacao('ru nenhuma nova', 'зебра', 'ru', { words: ['зебра'] });
avaliacao('ru uma nova', 'зебра', 'ru');
avaliacao('ru duas novas', 'зебра лама', 'ru');
avaliacao('ru tres novas', 'зебра лама як', 'ru');
avaliacao('lang desconhecida vale como en', 'zebra', 'fr');

async function rodar() {
  const saida = {};
  for (const [id, { executar }] of Object.entries(casos)) saida[id] = JSON.stringify(executar());
  for (const [id, texto, lang, vocab] of AVALIACOES) {
    saida[`avaliar ${id}`] = JSON.stringify(await PalavraAutomatica.avaliar(texto, lang, vocabulario(vocab)));
  }
  return saida;
}

const ESPERADO = require('./palavra_automatica_tabelas_esperado.js');

async function run() {
  const atual = await rodar();
  const inline = id => casos[id] && casos[id].esperado;
  const erradosInline = Object.keys(atual).filter(id => inline(id) && atual[id] !== JSON.stringify(casos[id].esperado));
  assert.deepStrictEqual(erradosInline.map(id => [id, atual[id]]), [], 'a escolha da Palavra automática mudou');
  const fixados = Object.keys(atual).filter(id => !inline(id));
  if (process.env.PALAVRA_GRAVAR) {
    fs.writeFileSync(process.env.PALAVRA_GRAVAR, fixados.map(id => `  ${JSON.stringify(atual[id])},`).join('\n') + '\n');
    return;
  }
  assert.strictEqual(fixados.length, ESPERADO.length, 'os casos fixados mudaram de número');
  const diferentes = fixados.filter((id, i) => atual[id] !== ESPERADO[i]);
  assert.deepStrictEqual(diferentes.map(id => [id, atual[id]]), [], 'a escolha da Palavra automática mudou');
  console.log(`Palavra automática: ${Object.keys(atual).length} casos de tabela e de pontuação iguais.`);
}

run().catch(erro => { console.error(erro); process.exit(1); });
