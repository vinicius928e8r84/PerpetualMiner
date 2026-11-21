'use strict';

const fs = require('fs');
const path = require('path');
const contrato = require('../../complemento/contrato/carregar');

const LISTA_NOSSA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'complemento', 'modelos_da_ia.json'), 'utf8')).modelos;
const AUTOMATICO = 'automatico';
const INDISPONIVEL = { status: 503, json: { error: 'models_unavailable' } };
const PEDIDO_INVALIDO = { status: 400, json: { error: 'invalid_request' } };
const MODELO_QUE_NAO_HA = { status: 404, json: { error: 'model_not_found' } };
const ESTADO = '/ia/modelo/estado';
const ESCOLHER = '/ia/modelo/escolher';

const fazTextoEFoto = m => Boolean(m.texto && m.foto);
const semChave = chaveNaConexao => (chaveNaConexao ?? null) === null;
const semQuemPague = ({ chatgpt, chaveNaConexao }) => chatgpt === 'acabou' || semChave(chaveNaConexao);

const modeloPedido = corpo => (typeof corpo?.modelo === 'string' ? corpo.modelo : '');

function recusaDaEscolha(modelo, oferta) {
  if (!modelo) return PEDIDO_INVALIDO;
  if (modelo === AUTOMATICO) return null;
  if (!oferta) return INDISPONIVEL;
  return oferta.modelos.includes(modelo) ? null : MODELO_QUE_NAO_HA;
}

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

  const serveNaChave = m => fazTextoEFoto(m) && estado.cenario.conta.includes(m.modelo);
  const modelosDaChave = () => LISTA_NOSSA.filter(serveNaChave).map(m => m.modelo);

  function conta() {
    const contexto = contextoDeAgora();
    if (contexto.chatgpt === 'conectada') return { paga: 'plano', modelos: estado.cenario.plano.filter(m => !saiu(m)) };
    if (semQuemPague(contexto)) return { paga: null, modelos: [] };
    if (contexto.openai === 'fora_do_ar') return null;
    return { paga: 'chave', modelos: modelosDaChave().filter(m => !saiu(m)) };
  }

  function resolver(oferta) {
    if (estado.escolha === AUTOMATICO) return { efetivo: AUTOMATICO, de: null };
    const caiu = saiu(estado.escolha) || (oferta.paga !== null && !oferta.modelos.includes(estado.escolha));
    return caiu ? { efetivo: AUTOMATICO, de: estado.escolha } : { efetivo: estado.escolha, de: null };
  }

  function aviso(efetivo) {
    const dia = saida(efetivo);
    if (efetivo === AUTOMATICO || !dia) return null;
    return estado.hoje < dia ? { modelo: efetivo, saida: dia } : null;
  }

  function oEstado(oferta) {
    if (!oferta) return INDISPONIVEL;
    const { efetivo, de } = resolver(oferta);
    return { status: 200, json: { paga: oferta.paga, escolha: efetivo, modelos: oferta.modelos, aviso: aviso(efetivo), trocou: de ? { de } : estado.trocou } };
  }

  function escolher(oferta, corpo) {
    const modelo = modeloPedido(corpo);
    const recusa = recusaDaEscolha(modelo, oferta);
    if (recusa) return recusa;
    Object.assign(estado, { escolha: modelo, trocou: null });
    return { status: 200, json: { ok: true, escolha: modelo } };
  }

  const ROTAS = new Map([[ESTADO, oEstado], [ESCOLHER, escolher]]);

  function responder(metodo, caminho, corpo) {
    const rota = metodo === 'POST' ? ROTAS.get(caminho) : undefined;
    return rota ? rota(conta(), corpo) : null;
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
