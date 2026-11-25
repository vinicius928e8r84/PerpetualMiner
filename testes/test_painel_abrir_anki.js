'use strict';

const assert = require('assert');

const { prepararAPagina, noComId, esperar } = require('./painel_de_mentira.js');

const { documento, raiz } = prepararAPagina();
require('../lib/pedido-ao-anki.js');
const { textoDaVoz } = raiz;
const { MOTIVO } = raiz.ConversaComOAnki;

const corpo = noComId(documento, 'cfg-anki-corpo');
const resumo = noComId(documento, 'cfg-anki-resumo');

const seguidores = [];
const visitas = [];
const pedidos = [];
const filas = { item: [], mudar: [], perfis: [], escolher: [] };
const ligado = valor => ({ ok: true, dados: { ligado: valor } });
const recusa = (status, erro) => ({ ok: false, motivo: MOTIVO.RECUSADO, status, dados: { error: erro }, detalhes: '' });
const SEM_RESPOSTA = { ok: false, motivo: MOTIVO.SEM_RESPOSTA, detalhes: 'rede caiu' };
const ROTAS = { '/abrir-com-o-computador/estado': 'item', '/abrir-com-o-computador': 'mudar', '/anki/profiles': 'perfis', '/anki/profile': 'escolher' };
const PADRAO = { item: ligado(false), mudar: ligado(true), perfis: { ok: true, dados: { profiles: ['A'], marked: 'A' } }, escolher: { ok: true, dados: {} } };

raiz.ConexaoAnki = {
  SITUACAO: { CONECTANDO: 'conectando', LIGADA: 'ligada', DESLIGADA: 'desligada' },
  TEMPO_DA_RESPOSTA: 4000,
  acompanhar: seguidor => seguidores.push(seguidor),
};
raiz.Shell = { aoEntrarNaArea: (area, quando) => visitas.push([area, quando]) };
const naoTemOFormato = (desfecho, formato) => desfecho.ok && formato && !formato(desfecho.dados);
const pedir = async (pedido, { formato }) => {
  const tipo = ROTAS[pedido.caminho];
  pedidos.push([tipo, pedido.corpo]);
  const desfecho = filas[tipo].length ? filas[tipo].shift() : PADRAO[tipo];
  return naoTemOFormato(desfecho, formato) ? { ok: false, motivo: MOTIVO.INVALIDA } : desfecho;
};
raiz.ConversaComOAnki = { ...raiz.ConversaComOAnki, pedir };

require('../painel/painel-abrir-anki.js');
documento.disparar('DOMContentLoaded');

const interruptor = () => documento.getElementById('cfg-anki-interruptor');
const nota = () => documento.getElementById('cfg-anki-nota').textContent;
const avisos = () => corpo.querySelectorAll('.veio-aviso').map(no => no.textContent);
const linhaDoPerfil = () => documento.getElementById('cfg-anki-perfil');
const conexao = situacao => seguidores[0](situacao);
const pedidosFeitos = () => pedidos.splice(0).map(([tipo, dados]) => (tipo === 'mudar' || tipo === 'escolher' ? [tipo, dados] : tipo));
const doInterruptor = () => ({
  marcado: interruptor().checked, desligado: interruptor().disabled, ocupado: interruptor().getAttribute('aria-busy'),
});

async function aTelaComecaSemConexao() {
  assert.deepStrictEqual(doInterruptor(), { marcado: false, desligado: true, ocupado: 'false' });
  assert.strictEqual(nota(), textoDaVoz('CFG-38.indisponivel'));
  assert.strictEqual(resumo.textContent, textoDaVoz('CFG-37.indisponivel'));
  assert.strictEqual(interruptor().getAttribute('role'), 'switch');
  assert.strictEqual(interruptor().getAttribute('aria-labelledby'), 'cfg-anki-nome');
  assert.strictEqual(seguidores.length, 1);
  assert.deepStrictEqual(visitas.map(([area]) => area), ['configuracoes']);
}

async function aoLigarAConexaoLeOItemEOsPerfis() {
  conexao('ligada');
  assert.deepStrictEqual(doInterruptor(), { marcado: false, desligado: true, ocupado: 'true' });
  assert.strictEqual(nota(), textoDaVoz('CFG-38.lendo'));
  await esperar();
  assert.deepStrictEqual(pedidosFeitos(), ['item', 'perfis']);
  assert.deepStrictEqual(doInterruptor(), { marcado: false, desligado: false, ocupado: 'false' });
  assert.strictEqual(nota(), textoDaVoz('CFG-36.nota'));
  assert.strictEqual(resumo.textContent, textoDaVoz('CFG-37.desligado'));
  assert.strictEqual(linhaDoPerfil(), null, 'com um perfil só, não há o que escolher');
  conexao('ligada');
  await esperar();
  assert.deepStrictEqual(pedidosFeitos(), [], 'a mesma situação não lê de novo');
}

async function ligarOInterruptorGrava() {
  interruptor().checked = true;
  interruptor().disparar('change');
  assert.deepStrictEqual(doInterruptor(), { marcado: false, desligado: true, ocupado: 'true' });
  await esperar();
  assert.deepStrictEqual(pedidosFeitos(), [['mudar', { ligado: true }]]);
  assert.deepStrictEqual(doInterruptor(), { marcado: true, desligado: false, ocupado: 'false' });
  assert.strictEqual(resumo.textContent, textoDaVoz('CFG-37.ligado'));
  assert.deepStrictEqual(avisos(), []);
  assert.strictEqual(documento.activeElement, interruptor(), 'o foco volta ao interruptor');
}

async function aFalhaSemRespostaFicaIncertaEAConferenciaLimpa() {
  filas.mudar.push(SEM_RESPOSTA);
  filas.item.push(SEM_RESPOSTA);
  interruptor().checked = false;
  interruptor().disparar('change');
  await esperar();
  assert.deepStrictEqual(pedidosFeitos(), [['mudar', { ligado: false }], 'item']);
  assert.strictEqual(avisos().length, 1);
  assert.ok(avisos()[0].startsWith(textoDaVoz('CFG-39.incerta')));
  assert.ok(avisos()[0].includes('rede caiu'), 'o detalhe da falha vem no aviso');
  assert.strictEqual(doInterruptor().marcado, false, 'sem confirmar, o interruptor não afirma nada');
}

async function cadaRecusaTemOSeuTexto() {
  const casos = [
    [recusa(500, 'anki_not_found'), 'CFG-39.semAnki', 'HTTP 500 · anki_not_found'],
    [recusa(500, 'login_item_unsupported'), 'CFG-39.semSuporte', 'HTTP 500 · login_item_unsupported'],
    [recusa(400, 'invalid_request'), 'CFG-39.ligar', 'HTTP 400 · invalid_request'],
    [{ ok: true, dados: { sem: 'ligado' } }, 'CFG-39.ligar', 'Resposta sem “ligado”'],
  ];
  for (const [desfecho, voz, detalhe] of casos) {
    filas.mudar.push(desfecho);
    filas.item.push(ligado(false));
    interruptor().checked = true;
    interruptor().disparar('change');
    await esperar();
    pedidosFeitos();
    assert.strictEqual(avisos().length, 1, voz);
    assert.ok(avisos()[0].startsWith(textoDaVoz(voz)), `${voz}: ${avisos()[0]}`);
    assert.ok(avisos()[0].includes(detalhe), detalhe);
  }
  filas.mudar.push(ligado(false));
  interruptor().checked = false;
  interruptor().disparar('change');
  await esperar();
  pedidosFeitos();
  assert.deepStrictEqual(avisos(), [], 'uma gravação que dá certo apaga o aviso');
}

async function aoVoltarALerConfirmaOQueFalhou() {
  filas.mudar.push(recusa(500, 'login_item_unsupported'));
  filas.item.push(ligado(true));
  interruptor().checked = true;
  interruptor().disparar('change');
  await esperar();
  pedidosFeitos();
  assert.deepStrictEqual(avisos(), [], 'a leitura mostra que o item ficou como a pessoa pediu: o aviso some');
  assert.strictEqual(doInterruptor().marcado, true);
  interruptor().checked = false;
  interruptor().disparar('change');
  await esperar();
  pedidosFeitos();
}

async function osPerfisAparecemComDoisOuMais() {
  filas.perfis.push({ ok: true, dados: { profiles: ['A', 'B'], marked: 'B' } });
  conexao('desligada');
  assert.strictEqual(nota(), textoDaVoz('CFG-38.indisponivel'));
  assert.strictEqual(linhaDoPerfil(), null);
  conexao('ligada');
  await esperar();
  assert.deepStrictEqual(pedidosFeitos(), ['item', 'perfis']);
  const seletor = documento.getElementById('cfg-anki-perfil-escolha');
  assert.deepStrictEqual(seletor.children.map(no => no.value), ['A', 'B']);
  assert.strictEqual(seletor.value, 'B');
  assert.strictEqual(documento.getElementById('cfg-anki-perfil').textContent, `${textoDaVoz('CFG-43.rotulo')}${textoDaVoz('CFG-43.nota')}AB`);
  assert.strictEqual(corpo.children.at(-1).id, 'cfg-anki-perfil');
}

async function escolherOutroPerfil() {
  const seletor = documento.getElementById('cfg-anki-perfil-escolha');
  filas.perfis.push({ ok: true, dados: { profiles: ['A', 'B'], marked: 'A' } });
  seletor.value = 'A';
  seletor.focus();
  seletor.disparar('change');
  assert.strictEqual(documento.getElementById('cfg-anki-perfil-escolha').disabled, true);
  await esperar();
  assert.deepStrictEqual(pedidosFeitos(), [['escolher', { profile: 'A' }], 'perfis']);
  assert.strictEqual(documento.getElementById('cfg-anki-perfil-escolha').value, 'A');
  assert.strictEqual(documento.activeElement, documento.getElementById('cfg-anki-perfil-escolha'), 'o foco acompanha a troca');

  filas.escolher.push(recusa(500, 'boom'));
  filas.perfis.push({ ok: true, dados: { profiles: ['A', 'B'], marked: 'A' } });
  documento.getElementById('cfg-anki-perfil-escolha').value = 'B';
  documento.getElementById('cfg-anki-perfil-escolha').disparar('change');
  await esperar();
  pedidosFeitos();
  assert.strictEqual(avisos().length, 1);
  assert.ok(avisos()[0].startsWith(textoDaVoz('CFG-43.falha')));
  assert.ok(avisos()[0].includes('HTTP 500 · boom'));
}

async function oPerfilMarcadoQueSumiuEOsPerfisIlegiveis() {
  filas.perfis.push({ ok: true, dados: { profiles: ['A', 'B'], marked: 'Z' } });
  conexao('conectando');
  conexao('ligada');
  await esperar();
  pedidosFeitos();
  assert.ok(avisos().some(texto => texto.startsWith(textoDaVoz('CFG-43.sumiu', { perfil: 'Z' }))));
  assert.strictEqual(documento.getElementById('cfg-anki-perfil-escolha').selectedIndex, -1);
  filas.perfis.push({ ok: true, dados: { profiles: [1, 2], marked: 'A' } });
  conexao('desligada');
  conexao('ligada');
  await esperar();
  pedidosFeitos();
  assert.strictEqual(linhaDoPerfil(), null, 'uma lista que não é de nomes não vira linha');
  assert.deepStrictEqual(avisos(), []);
}

async function semRespostaEAConexaoAntiga() {
  filas.item.push({ ok: false, motivo: MOTIVO.ANTIGA });
  conexao('desligada');
  conexao('ligada');
  await esperar();
  pedidosFeitos();
  assert.strictEqual(nota(), textoDaVoz('CFG-38.antiga'));
  assert.strictEqual(doInterruptor().desligado, true);
  filas.item.push(SEM_RESPOSTA);
  conexao('desligada');
  conexao('ligada');
  await esperar();
  pedidosFeitos();
  assert.strictEqual(nota(), textoDaVoz('CFG-38.falhou'));
  conexao('ligada');
  await esperar();
  assert.deepStrictEqual(pedidosFeitos(), ['item'], 'ligada de novo depois de falhar: tenta ler outra vez');
  assert.strictEqual(nota(), textoDaVoz('CFG-36.nota'));
  visitas[0][1]();
  await esperar();
  assert.deepStrictEqual(pedidosFeitos(), ['item', 'perfis'], 'entrar em Configurações lê de novo');
}

(async () => {
  await aTelaComecaSemConexao();
  await aoLigarAConexaoLeOItemEOsPerfis();
  await ligarOInterruptorGrava();
  await aFalhaSemRespostaFicaIncertaEAConferenciaLimpa();
  await cadaRecusaTemOSeuTexto();
  await aoVoltarALerConfirmaOQueFalhou();
  await osPerfisAparecemComDoisOuMais();
  await escolherOutroPerfil();
  await oPerfilMarcadoQueSumiuEOsPerfisIlegiveis();
  await semRespostaEAConexaoAntiga();
  console.log('abrir o Anki com o computador ok');
})().catch(erro => { console.error(erro); process.exit(1); });
