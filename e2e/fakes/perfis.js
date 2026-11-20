'use strict';

const INTERNO = { status: 500, json: { error: 'internal_error' } };

function criarPerfis(contextoDeAgora) {
  const estado = { lista: ['Usuário 1'], marcado: 'Usuário 1', falhaAoEscolher: false, aberto: undefined, definido: false };
  const aberto = () => (estado.aberto === undefined ? contextoDeAgora().perfil : estado.aberto);

  function responder(metodo, caminho, corpo) {
    if (metodo !== 'POST') return null;
    const contexto = contextoDeAgora();
    if (caminho === '/anki/profiles') {
      if (contexto.falhaNoPerfil) return INTERNO;
      if (!estado.marcado && aberto()) estado.marcado = aberto();
      return { status: 200, json: { profiles: [...estado.lista], marked: estado.marcado, open: aberto() ?? null } };
    }
    if (caminho === '/anki/profile') {
      if (typeof corpo?.profile !== 'string' || !corpo.profile.trim()) return { status: 400, json: { error: 'invalid_request' } };
      if (!estado.lista.includes(corpo.profile)) return { status: 404, json: { error: 'profile_not_found' } };
      if (estado.falhaAoEscolher) return INTERNO;
      estado.marcado = corpo.profile;
      return { status: 200, json: { ok: true, marked: estado.marcado } };
    }
    if (caminho === '/anki/profile/open') {
      if (!estado.marcado || !estado.lista.includes(estado.marcado)) return { status: 404, json: { error: 'profile_not_found' } };
      estado.aberto = estado.marcado;
      return { status: 200, json: { ok: true, profile: estado.marcado } };
    }
    return null;
  }

  return {
    responder,
    definir(lista, opcoes = {}) {
      const { marcado = null } = opcoes;
      Object.assign(estado, { lista: [...lista], marcado, aberto: opcoes.aberto === undefined ? lista[0] : opcoes.aberto, definido: true });
    },
    paraAReal: () => (estado.definido ? { lista: [...estado.lista], marcado: estado.marcado } : null),
    espelhar({ lista, marcado, aberto: abertoNaReal }) { Object.assign(estado, { lista, marcado, aberto: abertoNaReal }); },
    marcado: () => estado.marcado,
    aberto,
    saudeCom(resposta) {
      return estado.aberto === undefined || !resposta.json.perfil ? resposta : { ...resposta, json: { ...resposta.json, perfil: estado.aberto } };
    },
    falharAEscolha() { estado.falhaAoEscolher = true; },
  };
}

module.exports = { criarPerfis };
