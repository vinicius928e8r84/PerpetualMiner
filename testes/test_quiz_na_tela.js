'use strict';

const assert = require('assert');

const T = require('./quiz_na_tela_de_mentira.js');
const ESPERADO = require('./quiz_na_tela_esperado.js');

const { Quiz, textoDaVoz, chamadas, pedidos, mundo, saidas, usados, esperar, abrir, opcao, botaoDe, botoes, palco, feedback, aviso, cabecalho, vivos, passarOTempo, estados, hashDaTela } = T;
const MOTIVO = T.raiz.ConversaComOAnki.MOTIVO;
const gravando = process.env.GRAVAR_O_ESPERADO === '1';
const gravados = {};

function conferir(nome, visto) {
  if (gravando) { gravados[nome] = JSON.parse(JSON.stringify(visto)); return; }
  assert.deepStrictEqual(JSON.parse(JSON.stringify(visto)), ESPERADO[nome], nome);
}

const QUESTOES = Quiz.PERGUNTAS.en;
const resumoDaTela = quiz => ({ cabecalho: cabecalho(quiz), tela: hashDaTela(quiz), botoes: estados(quiz), feedback: palco(quiz).querySelector('.quiz__feedback')?.textContent });
const chamadasFeitas = () => chamadas.splice(0);

async function aPrimeiraPerguntaDepoisDoPerfil() {
  mundo.desfecho = { ok: true, dados: { audio: 'AAAA' } };
  const quiz = abrir('en');
  conferir('perfil', { cabecalho: cabecalho(quiz), tela: hashDaTela(quiz) });
  T.irAtePrimeiraPergunta(quiz);
  conferir('primeira', resumoDaTela(quiz));
  assert.deepStrictEqual(chamadasFeitas(), []);
  return quiz;
}

async function acertarMarcaACertaDaFestaEDaPlacar(quiz) {
  opcao(quiz, QUESTOES.legenda[0].certa).disparar('click');
  conferir('acertou', { ...resumoDaTela(quiz), chamadas: chamadasFeitas(), atrasos: vivos().map(t => t.atraso) });
  passarOTempo();
  await esperar();
}

async function aEscutaTocaESeErrarMarcaAsDuas(quiz) {
  conferir('escuta', { ...resumoDaTela(quiz), chamadas: chamadasFeitas(), pedidos: pedidos.splice(0), aviso: aviso(quiz).hidden });
  const errada = (QUESTOES.escuta[0].certa + 1) % QUESTOES.escuta[0].opcoes.length;
  opcao(quiz, errada).disparar('click');
  conferir('errou', { ...resumoDaTela(quiz), chamadas: chamadasFeitas(), atrasos: vivos().map(t => t.atraso) });
  passarOTempo();
  await esperar();
}

async function naoSeiNaoErraENaoPontua(quiz) {
  conferir('terceira', resumoDaTela(quiz));
  botaoDe(quiz, textoDaVoz('ONB-21.naoSei')).disparar('click');
  conferir('nao_sei', { ...resumoDaTela(quiz), chamadas: chamadasFeitas() });
  passarOTempo();
  await esperar();
}

async function oResultadoLevaONivelEOUsarGrava(quiz) {
  conferir('resultado', { cabecalho: cabecalho(quiz), tela: hashDaTela(quiz), chamadas: chamadasFeitas() });
  const usar = botaoDe(quiz, textoDaVoz('ONB-22.usar'));
  usar.disparar('click');
  await esperar();
  conferir('usou', { usados, desligado: Boolean(usar.disabled) });
}

async function umQuizDeTresPerguntasDoPrimeiroAoUltimo() {
  const quiz = await aPrimeiraPerguntaDepoisDoPerfil();
  await acertarMarcaACertaDaFestaEDaPlacar(quiz);
  await aEscutaTocaESeErrarMarcaAsDuas(quiz);
  await naoSeiNaoErraENaoPontua(quiz);
  await oResultadoLevaONivelEOUsarGrava(quiz);
}

async function aFalhaDoAudioDizPorQueEOOuvirDeNovoTentaOutraVez() {
  const casos = [
    ['sem conexão', { ok: false, motivo: MOTIVO.SEM_RESPOSTA }, 'ONB-21.audioSemConexao'],
    ['Conexão antiga', { ok: false, motivo: MOTIVO.ANTIGA }, 'ONB-21.audioAntiga'],
    ['outra falha', { ok: false, motivo: MOTIVO.RECUSADO }, 'ONB-21.semAudio'],
    ['resposta sem áudio', { ok: true, dados: { audio: '' } }, 'ONB-21.semAudio'],
  ];
  const vistos = {};
  for (const [nome, desfecho, voz] of casos) {
    mundo.desfecho = desfecho;
    mundo.sotaque = nome;
    const quiz = abrirNaEscuta(nome);
    await esperar();
    vistos[nome] = { aviso: aviso(quiz).textContent, oculto: aviso(quiz).hidden, esperado: textoDaVoz(voz) };
    assert.strictEqual(vistos[nome].aviso, vistos[nome].esperado, nome);
  }
  conferir('falhas_do_audio', vistos);
  mundo.desfecho = { ok: true, dados: { audio: 'BBBB' } };
  mundo.sotaque = 'recusa';
  mundo.tocar = () => Promise.reject(new Error('sem som'));
  const quiz = abrirNaEscuta('o navegador recusa tocar');
  await esperar();
  conferir('recusa_de_tocar', { aviso: aviso(quiz).textContent, oculto: aviso(quiz).hidden });
  mundo.tocar = () => Promise.resolve();
  chamadasFeitas();
  const pedidosAntes = pedidos.length;
  botaoDe(quiz, textoDaVoz('ONB-21.ouvirDeNovo')).disparar('click');
  await esperar();
  conferir('ouvir_de_novo', { chamadas: chamadasFeitas(), aviso: aviso(quiz).hidden, pedidosNovos: pedidos.length - pedidosAntes });
}

function abrirNaEscuta() {
  const quiz = abrir('en');
  T.irAtePrimeiraPergunta(quiz);
  opcao(quiz, QUESTOES.legenda[0].certa).disparar('click');
  passarOTempo();
  return quiz;
}

async function sairParaOQuizEPoeOQueEstaTocandoEmSilencio() {
  mundo.desfecho = { ok: true, dados: { audio: 'CCCC' } };
  mundo.sotaque = 'sair';
  const quiz = abrirNaEscuta();
  await esperar();
  chamadasFeitas();
  botaoDe(quiz, textoDaVoz('ONB-21.sair')).disparar('click');
  conferir('sair', { saidas, chamadas: chamadasFeitas(), vivos: vivos().length });
}

async function oRussoComecaPeloAlfabetoEQuemNaoLePulaOResultado() {
  const quiz = abrir('ru');
  conferir('alfabeto', { cabecalho: cabecalho(quiz), tela: hashDaTela(quiz) });
  botaoDe(quiz, textoDaVoz('ONB-21.aindaNao')).disparar('click');
  conferir('sem_alfabeto', { cabecalho: cabecalho(quiz), tela: hashDaTela(quiz), chamadas: chamadasFeitas() });
  const outro = abrir('ru');
  botaoDe(outro, textoDaVoz('ONB-21.jaLeio')).disparar('click');
  conferir('perfil_do_russo', { cabecalho: cabecalho(outro), tela: hashDaTela(outro) });
}

async function main() {
  const casos = [
    umQuizDeTresPerguntasDoPrimeiroAoUltimo,
    aFalhaDoAudioDizPorQueEOOuvirDeNovoTentaOutraVez,
    sairParaOQuizEPoeOQueEstaTocandoEmSilencio,
    oRussoComecaPeloAlfabetoEQuemNaoLePulaOResultado,
  ];
  for (const caso of casos) await caso();
  if (gravando) console.log(`'use strict';\n\nmodule.exports = {\n${Object.entries(gravados).map(([nome, valor]) => `  ${nome}: ${JSON.stringify(valor)},`).join('\n')}\n};`);
  else console.log('quiz na tela tests passed');
}

main().catch(erro => { console.error(erro); process.exit(1); });
