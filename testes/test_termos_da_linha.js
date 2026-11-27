'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..');
const contexto = { console, AbortSignal };
contexto.globalThis = contexto;
vm.createContext(contexto);
for (const arquivo of ['lib/pedido-ao-anki.js', 'lib/palavra-em-duvida.js', 'lib/termos-da-linha.js']) {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, arquivo), 'utf8'), contexto, { filename: arquivo });
}
const { ConversaComOAnki, TermosDaLinha, PedidoAoAnki, PalavraEmDuvida } = contexto.PerpetualMiner;

const plano = valor => JSON.parse(JSON.stringify(valor));
const ELA = "She can't put up with him";
const PUT_UP_WITH = { texto: 'put up with', posicoes: [2, 3, 4], tipo: 'phrasal_verb', comum: true };
const RESPOSTA_BOA = { status: 200, texto: JSON.stringify({ termos: [PUT_UP_WITH], pagou: 'chave' }) };

function montar({ respostas = [RESPOSTA_BOA], teto, prazoMs } = {}) {
  const idas = [];
  const prazos = [];
  const transporte = async pedido => {
    idas.push(plano({ metodo: pedido.metodo, caminho: pedido.caminho, corpo: pedido.corpo }));
    const resposta = respostas[Math.min(idas.length - 1, respostas.length - 1)];
    if (resposta instanceof Error) throw resposta;
    return resposta;
  };
  const conversa = ConversaComOAnki.criar({ endereco: 'http://127.0.0.1:1', transporte, sinalDoPrazo: ms => { prazos.push(ms); return null; } });
  return { idas, prazos, termos: TermosDaLinha.criar({ conversa, teto, prazoMs }) };
}

async function aRotaRespondeOsTermosComAsPosicoesOTipoESeEComum() {
  const { idas, prazos, termos } = montar();
  assert.deepStrictEqual(plano(await termos.perguntar('en', ELA)), [{ posicoes: [2, 3, 4], tipo: 'phrasal_verb', comum: true }]);
  assert.deepStrictEqual(idas, [{ metodo: 'POST', caminho: '/ia/termos', corpo: { lang: 'en', texto: ELA } }]);
  assert.deepStrictEqual(prazos, [TermosDaLinha.PRAZO_MS]);
  assert.ok(TermosDaLinha.PRAZO_MS <= 8000, 'o prazo é curto: o vídeo não espera a IA');
}

async function aMesmaLinhaDuasVezesChamaARotaUmaVezSo() {
  const { idas, termos } = montar();
  await termos.perguntar('en', ELA);
  await termos.perguntar('en', ELA);
  await termos.perguntar('en', `  ${ELA.toUpperCase()} `);
  assert.strictEqual(idas.length, 1);
  await termos.perguntar('ru', ELA);
  assert.strictEqual(idas.length, 2, 'o mesmo texto em outro idioma é outra pergunta');
}

async function aMesmaLinhaPerguntadaAoMesmoTempoChamaARotaUmaVezSo() {
  const { idas, termos } = montar();
  const todas = await Promise.all([termos.perguntar('en', ELA), termos.perguntar('en', ELA), termos.perguntar('en', ELA)]);
  assert.strictEqual(idas.length, 1);
  assert.deepStrictEqual(plano(todas[2]), plano(todas[0]));
}

async function semRespostaNaoFicaGuardadoEAProximaVezPergunta() {
  const falhas = [
    { status: 409, texto: '{"error":"openai_key_missing"}' },
    { status: 502, texto: '{"error":"ai_invalid_response"}' },
    { status: 200, texto: 'isto não é JSON' },
    new Error('sem rede'),
  ];
  for (const falha of falhas) {
    const { idas, termos } = montar({ respostas: [falha, RESPOSTA_BOA] });
    assert.strictEqual(await termos.perguntar('en', ELA), null);
    assert.strictEqual((await termos.perguntar('en', ELA)).length, 1);
    assert.strictEqual(idas.length, 2);
  }
}

async function umaRespostaForaDoFormatoContaComoSemResposta() {
  const ruins = [
    { termos: [{ posicoes: [0], tipo: 'sigla', comum: true }] },
    { termos: [{ posicoes: [0], tipo: 'palavra', comum: 'sim' }] },
    { termos: [{ posicoes: 'a', tipo: 'palavra', comum: true }] },
    { termos: [{ posicoes: [0.5], tipo: 'palavra', comum: true }] },
    { termos: [null] },
    { termos: 'nenhum' },
    { outra: [] },
  ];
  for (const ruim of ruins) {
    const { termos } = montar({ respostas: [{ status: 200, texto: JSON.stringify(ruim) }] });
    assert.strictEqual(await termos.perguntar('en', ELA), null, JSON.stringify(ruim));
  }
}

async function umaRespostaSemTermosEUmaRespostaValida() {
  const { idas, termos } = montar({ respostas: [{ status: 200, texto: '{"termos":[],"pagou":"plano"}' }] });
  assert.deepStrictEqual(plano(await termos.perguntar('en', ELA)), []);
  await termos.perguntar('en', ELA);
  assert.strictEqual(idas.length, 1);
}

async function linhaVaziaLongaOuDeOutroIdiomaNaoChamaARota() {
  const { idas, termos } = montar();
  for (const [lang, texto] of [['en', '   '], ['en', 'a'.repeat(501)], ['es', 'hola amigo'], ['en', 42]]) {
    assert.strictEqual(await termos.perguntar(lang, texto), null, `${lang} ${String(texto).slice(0, 10)}`);
  }
  assert.deepStrictEqual(idas, []);
}

async function oTetoDeItensDescartaAMaisAntiga() {
  const { idas, termos } = montar({ teto: 2 });
  for (const linha of ['one two', 'three four', 'five six']) await termos.perguntar('en', linha);
  assert.strictEqual(idas.length, 3);
  await termos.perguntar('en', 'five six');
  await termos.perguntar('en', 'three four');
  assert.strictEqual(idas.length, 3, 'as duas mais novas continuam guardadas');
  await termos.perguntar('en', 'one two');
  assert.strictEqual(idas.length, 4, 'a mais antiga saiu');
}

async function olimiteDaLinhaDaIAEOMesmoDaRota() {
  const limite = PalavraEmDuvida.MAXIMO_DE_LETRAS_PARA_A_IA;
  assert.doesNotThrow(() => PedidoAoAnki.termosDaLinha('en', 'a'.repeat(limite)));
  assert.throws(() => PedidoAoAnki.termosDaLinha('en', 'a'.repeat(limite + 1)));
}

(async () => {
  const casos = [
    aRotaRespondeOsTermosComAsPosicoesOTipoESeEComum, aMesmaLinhaDuasVezesChamaARotaUmaVezSo, aMesmaLinhaPerguntadaAoMesmoTempoChamaARotaUmaVezSo,
    semRespostaNaoFicaGuardadoEAProximaVezPergunta, umaRespostaForaDoFormatoContaComoSemResposta, umaRespostaSemTermosEUmaRespostaValida,
    linhaVaziaLongaOuDeOutroIdiomaNaoChamaARota, oTetoDeItensDescartaAMaisAntiga, olimiteDaLinhaDaIAEOMesmoDaRota,
  ];
  let falhas = 0;
  for (const caso of casos) {
    try {
      await caso();
      console.log(`ok  ${caso.name}`);
    } catch (erro) {
      falhas++;
      console.log(`FALHOU  ${caso.name}\n${erro.stack || erro.message}`);
    }
  }
  if (falhas) process.exit(1);
  console.log('test_termos_da_linha.js: tudo certo');
})();
