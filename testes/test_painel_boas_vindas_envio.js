'use strict';

const assert = require('assert');

const { prepararAPagina, esperar } = require('./painel_de_mentira.js');

const { documento, raiz } = prepararAPagina();
require('../lib/idioma.js');
require('../painel/painel-envio-estado.js');
const { textoDaVoz } = raiz;
const { ESTADO } = raiz.SituacaoDoEnvio;

const AGORA = 1700000000000;
Date.now = () => AGORA;
Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: () => 'uuid-1' }, configurable: true });

const registro = { guardado: [], envios: [], previas: [], pedidos: [], trocouAChave: 0, concluiu: 0, linhas: [] };
const mundo = { frases: [], desfechoDoCriar: { ok: true }, abrirNoAnki: { ok: true }, mostrada: { previa: { deck: 'Inglês::Frases::Nível 2' } }, ajustesFalham: false, conta: '', contaFalha: false };
const AJUSTES = {
  en: { deckName: 'Inglês::Frases', imageSource: 'openverse', nivel: 'intermediario' },
  ru: { deckName: 'Русский::Фразы', imageSource: 'nenhuma', nivel: 'iniciante' },
};

raiz.AjustesDeEnvio = {
  ler: async () => { if (mundo.ajustesFalham) throw new Error('sem ajustes'); return AJUSTES; },
  vozENivel: ajustes => ({ nivel: ajustes.nivel }),
  nomeDoBaralho: nome => String(nome || '').split('::').map(parte => parte.trim()).filter(Boolean).join(' › '),
};
raiz.ChaveDaOpenAI = { contaAtual: async () => { if (mundo.contaFalha) throw new Error('session_changed'); return mundo.conta; } };
raiz.Configuracao = { guardarPrimeiroEnvio: async troca => { registro.guardado.push(troca()); } };
raiz.ConversaComOAnki = { pedir: async pedido => { registro.pedidos.push(pedido); return mundo.abrirNoAnki; } };
raiz.PedidoAoAnki = { abrirNoAnki: guid => `abrir:${guid}` };
raiz.PreviaDoCartao = {
  montar: opcoes => {
    const no = documento.createElement('div');
    no.className = `previa-${opcoes.lang}`;
    const previa = { no, mostrar: async nivel => { registro.previas.push(['mostrar', opcoes.lang, nivel]); return mundo.mostrada; }, mostrarNota: async guid => { registro.previas.push(['nota', guid]); return mundo.mostrada; } };
    registro.montadas = [...(registro.montadas || []), opcoes];
    return previa;
  },
};
raiz.EnvioAcompanhado = {
  acompanhar: (corpo, opcoes) => {
    const envio = {
      corpo, opcoes, largou: 0,
      aoNaoLer: funcao => { envio.quandoNaoLe = funcao; },
      aoMudar: funcao => { envio.quandoMuda = funcao; },
      criar: async () => mundo.desfechoDoCriar,
      largar: () => { envio.largou += 1; },
    };
    registro.envios.push(envio);
    return envio;
  },
};
chrome.storage.local.get = async padrao => ({ ...padrao, frases: mundo.frases });

require('../painel/painel-boas-vindas-envio.js');

const assentar = async () => { for (let volta = 0; volta < 12; volta++) await esperar(); };
const retratoComAutomatica = (automatica, primeiroEnvio) => ({ estado: { automatica, progresso: { primeiroEnvio } } });
const EM = { en: true, ru: false };
const linhaDaFrase = frase => { registro.linhas.push(frase.id); return `linha:${frase.id}`; };

function novoPasso() {
  const passo = raiz.PassoDoPrimeiroEnvio.montar({
    linhaDaFrase, aoTrocarAChave: () => { registro.trocouAChave += 1; }, aoConcluir: () => { registro.concluiu += 1; },
  });
  return { ...passo, lugar: passo.no.children[1] };
}

const forma = no => (no.nodeType === 3 ? no.data : `${no.localName}${no.className ? `.${no.className.split(' ').join('.')}` : ''}[${no.children.length ? no.childNodes.map(forma).join(' ') : ''}]`);
const botoes = lugar => lugar.querySelectorAll('button').map(botao => botao.textContent);
const clicar = (lugar, nome) => lugar.querySelectorAll('button').find(botao => botao.textContent === nome).disparar('click');
const concluido = (cards = { a: { guid: 'g-1' } }) => [{ estado: ESTADO.CONCLUIDO }, { cards }];

async function oPrimeiroEnvioDeTesteComecaEMostraEnviando() {
  const passo = novoPasso();
  assert.strictEqual(passo.no.children[0].textContent, textoDaVoz('ONB-23.corpo'));
  assert.strictEqual(passo.lugar.getAttribute('aria-live'), 'polite');
  passo.desenhar(null, true);
  assert.strictEqual(registro.envios.length, 0, 'sem retrato, nada começa');
  passo.desenhar(retratoComAutomatica(EM), true);
  assert.strictEqual(passo.lugar.dataset.estado, 'enviando');
  assert.strictEqual(passo.lugar.textContent, textoDaVoz('ONB-23.enviando'));
  await assentar();
  assert.deepStrictEqual(registro.guardado.splice(0), [{ corpo: registro.envios[0].corpo }]);
  assert.deepStrictEqual(registro.envios[0].corpo, {
    jobId: 'uuid-1', lang: 'en', deckName: 'Inglês::Frases', imageSource: 'openverse', nivel: 'intermediario', teste: true,
    entries: [{ phraseId: AGORA, line: 'give up : She gave up smoking last year. [Contexto: Teste - Boas-vindas - Primeiro cartão]' }],
  });
  assert.deepStrictEqual(registro.envios[0].opcoes, { intervaloMs: 1000 });
  passo.desenhar(retratoComAutomatica(EM), true);
  assert.strictEqual(registro.envios.length, 1, 'desenhar de novo à vista não recomeça');
  return passo;
}

async function aConclusaoMostraOCartaoEnviado(passo) {
  const [situacao, lido] = concluido();
  await registro.envios[0].quandoMuda(situacao, lido);
  await assentar();
  assert.deepStrictEqual(registro.guardado.splice(0), [{ chegou: true, guid: 'g-1' }]);
  assert.strictEqual(passo.lugar.dataset.estado, 'enviado');
  assert.deepStrictEqual(botoes(passo.lugar), [textoDaVoz('ONB-23.abrirNoAnki'), textoDaVoz('ONB-23.concluir')]);
  assert.strictEqual(passo.lugar.children[1].textContent, textoDaVoz('ONB-23.teste'));
  assert.strictEqual(passo.lugar.children[0].querySelector('.bv-envio__baralho').textContent, 'Inglês › Frases › Nível 2');
  assert.deepStrictEqual(registro.previas.splice(0), [['nota', 'g-1']]);
  assert.deepStrictEqual(registro.montadas.splice(0), [{ prefixo: 'bv-envio', lang: 'en' }]);

  clicar(passo.lugar, textoDaVoz('ONB-23.abrirNoAnki'));
  await assentar();
  assert.deepStrictEqual(registro.pedidos.splice(0), ['abrir:g-1']);
  assert.strictEqual(passo.lugar.querySelector('.bv-falha').hidden, true);
  mundo.abrirNoAnki = { ok: false };
  clicar(passo.lugar, textoDaVoz('ONB-23.abrirNoAnki'));
  await assentar();
  assert.strictEqual(passo.lugar.querySelector('.bv-falha').hidden, false);
  assert.strictEqual(passo.lugar.querySelector('.bv-falha').textContent, textoDaVoz('ONB-23.naoAbriu'));
  mundo.abrirNoAnki = { ok: true };
  clicar(passo.lugar, textoDaVoz('ONB-23.concluir'));
  assert.strictEqual(registro.concluiu, 1);
}

async function oTesteDepoisDeMinerarSemPalavraDizOutraNota() {
  mundo.frases = [{ id: 1, texto: 'sem palavra', keywords: ['|'] }];
  const passo = novoPasso();
  const chegou = { chegou: true, guid: null, corpo: { lang: 'ru', deckName: 'Русский::Фразы', teste: true } };
  const antes = registro.envios.length;
  passo.desenhar(retratoComAutomatica(EM, chegou), true);
  await assentar();
  assert.strictEqual(registro.envios.length, antes, 'quando o primeiro envio já chegou, não cria outro');
  assert.strictEqual(passo.lugar.dataset.estado, 'enviado');
  assert.strictEqual(passo.lugar.children[1].textContent, textoDaVoz('ONB-23.testeSemPalavra'));
  assert.deepStrictEqual(botoes(passo.lugar), [textoDaVoz('ONB-23.concluir')]);
  assert.strictEqual(passo.lugar.querySelector('.bv-envio__baralho').textContent, 'Inglês › Frases › Nível 2');
  assert.deepStrictEqual(registro.previas.splice(0), [['mostrar', 'ru', 'iniciante']]);
}

async function aFraseMineradaMaisNovaViraOCartao() {
  mundo.frases = [
    { id: 5, texto: 'old one', keywords: ['one'] },
    { id: 9, texto: 'Она приходила вчера', idioma: 'Russo', keywords: ['приходила'] },
    { id: 12, texto: 'sem palavra', keywords: ['|'] },
    { id: 7, texto: 'newer one', keywords: ['newer'] },
  ];
  const passo = novoPasso();
  passo.desenhar(retratoComAutomatica(EM), true);
  await assentar();
  const { corpo } = registro.envios.at(-1);
  assert.deepStrictEqual([corpo.lang, corpo.deckName, corpo.teste, corpo.entries], ['ru', 'Русский::Фразы', undefined, [{ phraseId: 9, line: 'linha:9' }]]);
  assert.deepStrictEqual(registro.linhas.splice(0), [9]);
  registro.guardado.length = 0;
  mundo.frases = [{ id: 3, texto: 'plain', keywords: [] }, { id: 4, texto: 'x', keywords: ['|', 'y'] }];
  const outro = novoPasso();
  outro.desenhar(retratoComAutomatica(EM), true);
  await assentar();
  assert.deepStrictEqual(registro.envios.at(-1).corpo.entries, [{ phraseId: 4, line: 'linha:4' }]);
  assert.strictEqual(registro.envios.at(-1).corpo.teste, undefined);
  registro.linhas.length = 0;
}

async function semFraseOIdiomaVemDaMineracaoAutomatica() {
  mundo.frases = [];
  const russo = novoPasso();
  russo.desenhar(retratoComAutomatica({ en: false, ru: true }), true);
  await assentar();
  const { corpo } = registro.envios.at(-1);
  assert.deepStrictEqual([corpo.lang, corpo.teste, corpo.entries[0].line], ['ru', true, 'приходила : Она приходила вчера. [Contexto: Teste - Boas-vindas - Primeiro cartão]']);
  const ambos = novoPasso();
  ambos.desenhar(retratoComAutomatica({ en: true, ru: true }), true);
  await assentar();
  assert.strictEqual(registro.envios.at(-1).corpo.lang, 'en');
  const nenhum = novoPasso();
  nenhum.desenhar(retratoComAutomatica({ en: false, ru: false }), true);
  await assentar();
  assert.strictEqual(registro.envios.at(-1).corpo.lang, 'en');
  registro.guardado.length = 0;
}

async function oEnvioJaGuardadoNaoMontaOCorpoDeNovo() {
  const corpo = { jobId: 'guardado', lang: 'ru', deckName: 'D', teste: true, entries: [] };
  const passo = novoPasso();
  passo.desenhar(retratoComAutomatica(EM, { corpo }), true);
  await assentar();
  assert.strictEqual(registro.envios.at(-1).corpo, corpo);
  assert.deepStrictEqual(registro.guardado, []);
}

const falhaDe = lugar => ({
  estado: lugar.dataset.estado, papel: lugar.children[0].getAttribute('role'), titulo: lugar.querySelector('h3').textContent,
  texto: lugar.querySelector('p').textContent, botoes: botoes(lugar),
});
const TENTAR = textoDaVoz('ONB-23.tentarDeNovo');
const TROCAR = textoDaVoz('ONB-23.trocarAChave');
const faladaDe = (fala, ...acoes) => ({ estado: 'falhou', papel: 'alert', titulo: textoDaVoz('ONB-23.falhou'), texto: textoDaVoz(fala), botoes: acoes });

async function comecar(retrato = retratoComAutomatica(EM)) {
  const passo = novoPasso();
  passo.desenhar(retrato, true);
  await assentar();
  registro.guardado.length = 0;
  return { passo, envio: registro.envios.at(-1) };
}

async function quandoAConexaoNaoLeOEnvioFalhaESePodeTentarDeNovo() {
  const { passo, envio } = await comecar();
  envio.quandoNaoLe();
  assert.deepStrictEqual(falhaDe(passo.lugar), faladaDe('ONB-23.motivoConexao', TENTAR));
  assert.strictEqual(envio.largou, 1, 'a leitura que falhou é largada');
  const total = registro.envios.length;
  clicar(passo.lugar, TENTAR);
  assert.strictEqual(passo.lugar.dataset.estado, 'enviando');
  await assentar();
  assert.strictEqual(registro.envios.length, total + 1, 'tentar de novo acompanha outro envio');
  registro.envios[total - 1].quandoNaoLe();
  assert.strictEqual(passo.lugar.dataset.estado, 'enviando', 'o aviso de um envio antigo não vale mais');
  await registro.envios[total - 1].quandoMuda({ estado: ESTADO.DESCONHECIDO }, {});
  assert.strictEqual(passo.lugar.dataset.estado, 'enviando');
}

async function cadaFimSemSucessoTemOSeuMotivo() {
  const casos = [
    [{ estado: ESTADO.DESCONHECIDO }, {}, faladaDe('ONB-23.motivoConexao', TENTAR)],
    [{ estado: ESTADO.NAO_CONCLUIDO }, { lastError: 'openai_key_missing' }, faladaDe('ONB-23.motivoSemChave', TENTAR, TROCAR)],
    [{ estado: ESTADO.NAO_CONCLUIDO }, { lastError: 'openai_rate_limited' }, faladaDe('ONB-23.motivoOpenAI', TENTAR)],
    [{ estado: ESTADO.EM_PARTE }, { lastError: 'inventado' }, faladaDe('ONB-23.motivoOutro', TENTAR, TROCAR)],
    [{ estado: ESTADO.NAO_CONCLUIDO }, { lastError: 'cards_failed', cards: { a: { status: 'failed', error: 'anki_write_failed' } } }, faladaDe('ONB-23.motivoAnki', TENTAR)],
    [{ estado: ESTADO.NAO_CONCLUIDO }, { lastError: 'cards_failed', cards: { a: { status: 'failed' }, b: { status: 'done', error: 'x' } } }, faladaDe('ONB-23.motivoOutro', TENTAR, TROCAR)],
  ];
  for (const [situacao, lido, esperado] of casos) {
    const { passo, envio } = await comecar();
    await envio.quandoMuda(situacao, lido);
    assert.deepStrictEqual(falhaDe(passo.lugar), esperado, JSON.stringify(lido));
  }
}

async function oPrimeiroEnvioSemMotivoNoCartaoEsqueceOCorpo() {
  const { envio } = await comecar();
  await envio.quandoMuda({ estado: ESTADO.NAO_CONCLUIDO }, { lastError: 'cards_failed', cards: { a: { status: 'failed' } } });
  assert.deepStrictEqual(registro.guardado.splice(0), [{ corpo: null }]);
  const outro = await comecar();
  await outro.envio.quandoMuda({ estado: ESTADO.NAO_CONCLUIDO }, { lastError: 'cards_failed', cards: { a: { error: 'anki_write_failed' } } });
  assert.deepStrictEqual(registro.guardado, [], 'com o motivo no cartão, o corpo fica guardado');
  const terceiro = await comecar();
  await terceiro.envio.quandoMuda({ estado: ESTADO.ANDANDO }, {});
  assert.strictEqual(terceiro.passo.lugar.dataset.estado, 'enviando', 'um estado que não terminou não muda a tela');
}

async function trocarAChaveAvisaOPasso() {
  const { passo, envio } = await comecar();
  await envio.quandoMuda({ estado: ESTADO.NAO_CONCLUIDO }, { lastError: 'openai_key_rejected' });
  clicar(passo.lugar, TROCAR);
  assert.strictEqual(registro.trocouAChave, 1);
}

async function cadaDesfechoDoPedidoDeCriarTemSuaFala() {
  const casos = [
    [{ ok: true }, 'enviando', null],
    [{ ok: false, apagado: true }, 'falhou', faladaDe('ONB-23.motivoOutro', TENTAR, TROCAR)],
    [{ ok: false, semResposta: true }, 'falhou', faladaDe('ONB-23.motivoConexao', TENTAR)],
    [{ ok: false, status: 503 }, 'falhou', faladaDe('ONB-23.motivoConexao', TENTAR)],
    [{ ok: false, status: 400 }, 'falhou', faladaDe('ONB-23.motivoOutro', TENTAR, TROCAR)],
  ];
  for (const [desfecho, estado, falha] of casos) {
    mundo.desfechoDoCriar = desfecho;
    const { passo } = await comecar();
    assert.strictEqual(passo.lugar.dataset.estado, estado, JSON.stringify(desfecho));
    if (falha) assert.deepStrictEqual(falhaDe(passo.lugar), falha, JSON.stringify(desfecho));
  }
  mundo.desfechoDoCriar = { ok: false, apagado: true };
  registro.guardado.length = 0;
  await comecar();
  mundo.desfechoDoCriar = { ok: false, apagado: true };
  const novo = novoPasso();
  novo.desenhar(retratoComAutomatica(EM), true);
  await assentar();
  assert.deepStrictEqual(registro.guardado.splice(0), [{ corpo: registro.envios.at(-1).corpo }, { corpo: null }]);
  mundo.desfechoDoCriar = { ok: true };
}

async function semAjustesOCorpoNaoSaiEAFalhaEOutra() {
  mundo.ajustesFalham = true;
  const total = registro.envios.length;
  const { passo } = await comecar();
  mundo.ajustesFalham = false;
  assert.strictEqual(registro.envios.length, total);
  assert.deepStrictEqual(falhaDe(passo.lugar), faladaDe('ONB-23.motivoOutro', TENTAR, TROCAR));
}

async function aContaDeAgoraVaiNoCorpoParaAChaveDeOutraContaNaoSerGasta() {
  mundo.conta = 'uid-A';
  const { envio } = await comecar();
  mundo.conta = '';
  const { envio: semConta } = await comecar();
  assert.strictEqual(envio.corpo.conta, 'uid-A');
  assert.strictEqual('conta' in semConta.corpo, false);
}

async function semSaberAContaOCorpoNaoSaiEAFalhaEOutra() {
  mundo.contaFalha = true;
  const total = registro.envios.length;
  const { passo } = await comecar();
  mundo.contaFalha = false;
  assert.strictEqual(registro.envios.length, total);
  assert.deepStrictEqual(falhaDe(passo.lugar), faladaDe('ONB-23.motivoOutro', TENTAR, TROCAR));
}

async function sairDeVistaLargaOEnvioEVoltarRecomeca() {
  const { passo, envio } = await comecar();
  passo.desenhar(retratoComAutomatica(EM), false);
  assert.strictEqual(envio.largou, 1);
  await envio.quandoMuda({ estado: ESTADO.NAO_CONCLUIDO }, { lastError: 'openai_key_missing' });
  assert.strictEqual(passo.lugar.dataset.estado, 'enviando', 'depois de sair de vista, o envio antigo não desenha');
  passo.desenhar(retratoComAutomatica(EM), false);
  assert.strictEqual(envio.largou, 1, 'sair de novo não largar de novo');
  const total = registro.envios.length;
  passo.desenhar(retratoComAutomatica(EM), true);
  await assentar();
  assert.strictEqual(registro.envios.length, total + 1);
}

(async () => {
  const passo = await oPrimeiroEnvioDeTesteComecaEMostraEnviando();
  await aConclusaoMostraOCartaoEnviado(passo);
  await oTesteDepoisDeMinerarSemPalavraDizOutraNota();
  await aFraseMineradaMaisNovaViraOCartao();
  await semFraseOIdiomaVemDaMineracaoAutomatica();
  await oEnvioJaGuardadoNaoMontaOCorpoDeNovo();
  await quandoAConexaoNaoLeOEnvioFalhaESePodeTentarDeNovo();
  await cadaFimSemSucessoTemOSeuMotivo();
  await oPrimeiroEnvioSemMotivoNoCartaoEsqueceOCorpo();
  await trocarAChaveAvisaOPasso();
  await cadaDesfechoDoPedidoDeCriarTemSuaFala();
  await semAjustesOCorpoNaoSaiEAFalhaEOutra();
  await aContaDeAgoraVaiNoCorpoParaAChaveDeOutraContaNaoSerGasta();
  await semSaberAContaOCorpoNaoSaiEAFalhaEOutra();
  await sairDeVistaLargaOEnvioEVoltarRecomeca();
  console.log('boas-vindas: o passo do primeiro envio ok');
})().catch(erro => { console.error(erro); process.exit(1); });
