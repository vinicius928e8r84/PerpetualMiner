'use strict';

const INTERNO = { status: 500, json: { error: 'internal_error' } };
const PERFIL_QUE_NAO_EXISTE = { status: 404, json: { error: 'profile_not_found' } };
const PEDIDO_INVALIDO = { status: 400, json: { error: 'invalid_request' } };

const semNomeDePerfil = corpo => typeof corpo?.profile !== 'string' || !corpo.profile.trim();

function criarPerfis(contextoDeAgora) {
  const estado = { lista: ['Usuário 1'], marcado: 'Usuário 1', falhaAoEscolher: false, aberto: undefined, definido: false };
  const aberto = () => (estado.aberto === undefined ? contextoDeAgora().perfil : estado.aberto);
  const existe = perfil => estado.lista.includes(perfil);

  function listar() {
    if (contextoDeAgora().falhaNoPerfil) return INTERNO;
    if (!estado.marcado && aberto()) estado.marcado = aberto();
    return { status: 200, json: { profiles: [...estado.lista], marked: estado.marcado, open: aberto() ?? null } };
  }

  function marcar(corpo) {
    if (semNomeDePerfil(corpo)) return PEDIDO_INVALIDO;
    if (!existe(corpo.profile)) return PERFIL_QUE_NAO_EXISTE;
    if (estado.falhaAoEscolher) return INTERNO;
    estado.marcado = corpo.profile;
    return { status: 200, json: { ok: true, marked: estado.marcado } };
  }

  function abrirOMarcado() {
    if (!estado.marcado || !existe(estado.marcado)) return PERFIL_QUE_NAO_EXISTE;
    estado.aberto = estado.marcado;
    return { status: 200, json: { ok: true, profile: estado.marcado } };
  }

  const rotas = new Map([['/anki/profiles', listar], ['/anki/profile', marcar], ['/anki/profile/open', abrirOMarcado]]);

  function responder(metodo, caminho, corpo) {
    const atender = metodo === 'POST' ? rotas.get(caminho) : undefined;
    return atender ? atender(corpo) : null;
  }

  return {
    responder,
    definir(lista, opcoes = {}) {
      const { marcado = null } = opcoes;
      Object.assign(estado, { lista: [...lista], marcado, aberto: opcoes.aberto === undefined ? lista[0] : opcoes.aberto, definido: true });
    },
    paraAReal: () => (estado.definido ? { lista: [...estado.lista], marcado: estado.marcado } : null),
    espelhar({ lista, marcado, aberto: abertoNaReal }) { Object.assign(estado, { lista, marcado }, estado.definido && { aberto: abertoNaReal }); },
    marcado: () => estado.marcado,
    aberto,
    saudeCom(resposta) {
      return estado.aberto === undefined || !resposta.json.perfil ? resposta : { ...resposta, json: { ...resposta.json, perfil: estado.aberto } };
    },
    falharAEscolha() { estado.falhaAoEscolher = true; },
  };
}

module.exports = { criarPerfis };
