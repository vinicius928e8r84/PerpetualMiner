'use strict';

const fs = require('fs');
const path = require('path');
const contrato = require('../../complemento/contrato/carregar');

const LISTA_NOSSA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'complemento', 'modelos_da_ia.json'), 'utf8')).modelos;
const AUTOMATICO = 'automatico';
const INDISPONIVEL = { status: 503, json: { error: 'models_unavailable' } };

function criarModelo(contextoDeAgora) {
  const estado = {};
  const definir = (nome = 'Automático') => {
    const cenario = contrato.modelos[nome];
    if (!cenario) throw new Error(`O contrato não tem o cenário de modelo "${nome}" (complemento/contrato/exemplos-do-modelo.json)`);
    Object.assign(estado, { cenario, escolha: cenario.escolha, trocou: cenario.trocou, hoje: cenario.hoje });
  };
  definir();

  const saida = modelo => estado.cenario.saidas[modelo] ?? LISTA_NOSSA.find(m => m.modelo === modelo)?.saida ?? null;
  const saiu = modelo => saida(modelo) !== null && estado.hoje >= saida(modelo);

  function conta() {
    const { chatgpt, chaveNaConexao, openai } = contextoDeAgora();
    if (chatgpt === 'conectada') return { paga: 'plano', modelos: estado.cenario.plano.filter(m => !saiu(m)) };
    if (chatgpt === 'acabou' || chaveNaConexao === null || chaveNaConexao === undefined) return { paga: null, modelos: [] };
    if (openai === 'fora_do_ar') return null;
    const daChave = LISTA_NOSSA.filter(m => m.texto && m.foto && estado.cenario.conta.includes(m.modelo)).map(m => m.modelo);
    return { paga: 'chave', modelos: daChave.filter(m => !saiu(m)) };
  }

  function resolver(oferta) {
    if (estado.escolha === AUTOMATICO) return { efetivo: AUTOMATICO, de: null };
    const caiu = saiu(estado.escolha) || (oferta.paga !== null && !oferta.modelos.includes(estado.escolha));
    return caiu ? { efetivo: AUTOMATICO, de: estado.escolha } : { efetivo: estado.escolha, de: null };
  }

  function responder(metodo, caminho, corpo) {
    if (metodo !== 'POST' || !['/ia/modelo/estado', '/ia/modelo/escolher'].includes(caminho)) return null;
    const oferta = conta();
    if (caminho === '/ia/modelo/estado') {
      if (!oferta) return INDISPONIVEL;
      const { efetivo, de } = resolver(oferta);
      const dia = saida(efetivo);
      const aviso = efetivo !== AUTOMATICO && dia && estado.hoje < dia ? { modelo: efetivo, saida: dia } : null;
      return { status: 200, json: { paga: oferta.paga, escolha: efetivo, modelos: oferta.modelos, aviso, trocou: de ? { de } : estado.trocou } };
    }
    if (typeof corpo?.modelo !== 'string' || !corpo.modelo) return { status: 400, json: { error: 'invalid_request' } };
    if (corpo.modelo !== AUTOMATICO && !oferta) return INDISPONIVEL;
    if (corpo.modelo !== AUTOMATICO && !oferta.modelos.includes(corpo.modelo)) return { status: 404, json: { error: 'model_not_found' } };
    Object.assign(estado, { escolha: corpo.modelo, trocou: null });
    return { status: 200, json: { ok: true, escolha: corpo.modelo } };
  }

  return {
    responder,
    definir,
    aoComecarUmEnvio() {
      const oferta = conta();
      const { de } = oferta ? resolver(oferta) : { de: null };
      if (de) Object.assign(estado, { escolha: AUTOMATICO, trocou: { de } });
    },
    /** @estado-guardado A escolha e o que a Conexão contou que trocou (o arquivo `modelo-dos-cartoes.json`). */
    guardado: () => ({ escolha: estado.escolha, trocou: estado.trocou }),
    passarOTempoAte(dia) { estado.hoje = dia; },
    hoje: () => estado.hoje,
  };
}

module.exports = { criarModelo };
