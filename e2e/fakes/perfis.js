'use strict';

// O perfil fixo na Conexão de mentira (#149): a lista de perfis do Anki, o que ficou marcado e a rota de cada pedido
// (`POST /anki/profiles`, `/anki/profile`, `/anki/profile/open`), como o complemento responde. O perfil aberto (`null`: a tela de
// perfis) é o da saúde também: o contrato só tem a saúde do “Usuário 1” e a da tela de perfis, então com perfis definidos a saúde
// é a do exemplo com o nome do perfil aberto no lugar (`saudeCom`). `test_fake_anki.js` e `contrato-da-conexao.spec.js` conferem as
// respostas contra os exemplos de `complemento/contrato/exemplos-do-perfil.json`.

const INTERNO = { status: 500, json: { error: 'internal_error' } };

/** `contextoDeAgora()` devolve o contexto do fake (`estado.contexto`, que ele troca por outro objeto a cada mudança): lido a cada pedido. */
function criarPerfis(contextoDeAgora) {
  const estado = { lista: ['Usuário 1'], marcado: 'Usuário 1', falhaAoEscolher: false, aberto: undefined };
  const aberto = () => (estado.aberto === undefined ? contextoDeAgora().perfil : estado.aberto);

  /** Os pedidos da extensão ao perfil fixo; `null` para qualquer outra rota. */
  function responder(metodo, caminho, corpo) {
    if (metodo !== 'POST') return null;
    const contexto = contextoDeAgora();
    if (caminho === '/anki/profiles') {
      if (contexto.falhaNoPerfil) return INTERNO;
      // Na primeira conexão, o perfil aberto fica marcado.
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
      estado.aberto = estado.marcado; // o Anki fecha o outro pelo caminho dele e abre o marcado
      return { status: 200, json: { ok: true, profile: estado.marcado } };
    }
    return null;
  }

  return {
    responder,
    /** Os perfis que o Anki tem; `marcado` (nenhum por padrão: a primeira conexão) e `aberto` (o primeiro por padrão; `null`: a tela de perfis). */
    definir(lista, opcoes = {}) {
      const { marcado = null } = opcoes;
      Object.assign(estado, { lista: [...lista], marcado, aberto: opcoes.aberto === undefined ? lista[0] : opcoes.aberto });
    },
    marcado: () => estado.marcado,
    aberto,
    /** A saúde com o perfil que o Anki tem aberto, quando os perfis foram definidos: o exemplo do “Usuário 1” com o nome trocado. */
    saudeCom(resposta) {
      return estado.aberto === undefined || !resposta.json.perfil ? resposta : { ...resposta, json: { ...resposta.json, perfil: estado.aberto } };
    },
    falharAEscolha() { estado.falhaAoEscolher = true; },
  };
}

module.exports = { criarPerfis };
