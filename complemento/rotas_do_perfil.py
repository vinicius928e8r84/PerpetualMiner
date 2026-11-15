"""As rotas do perfil fixo do Anki (`/anki/profiles`, `/anki/profile`, `/anki/profile/open`, #149): a lista de perfis com o marcado,
escolher outro e abrir o marcado. Cada uma é uma função `(conexao, corpo) -> (status, json)`, listada em `servidor.ROTAS`."""

from . import baralhos


def _lendo_os_perfis(conexao, leitura):
    """Roda `leitura(perfis)` com a lista de perfis do Anki, que se lê mesmo sem coleção aberta; com o Anki sem responder, 503."""
    try:
        return leitura(conexao.colecao.perfis())
    except baralhos.ColecaoIndisponivel as motivo:
        return 503, {"error": "anki_profiles_unavailable", "detail": str(motivo)}


def listar_os_perfis(conexao, corpo):
    """Os perfis do Anki, o marcado e o aberto. Na primeira vez que há um perfil aberto, ele fica marcado (a primeira conexão)."""
    def listar(perfis):
        aberto = conexao.perfil_aberto()
        return 200, {"profiles": perfis, "marked": conexao.perfil_fixo.marcar_se_falta(aberto), "open": aberto}

    return _lendo_os_perfis(conexao, listar)


def escolher_o_perfil(conexao, corpo):
    """Marca outro perfil (“Perfil do Anki ▾”): os Cartões passam a entrar nele e o abridor passa a abrir o Anki nele."""
    nome = corpo.get("profile")
    if not isinstance(nome, str) or not nome.strip():
        return 400, {"error": "invalid_request"}

    def escolher(perfis):
        if nome not in perfis:
            return 404, {"error": "profile_not_found"}
        conexao.perfil_fixo.marcar(nome)
        conexao.ao_mudar_o_perfil()
        return 200, {"ok": True, "marked": nome}

    return _lendo_os_perfis(conexao, escolher)


def abrir_o_perfil_marcado(conexao, corpo):
    """“Abrir <perfil>”: fecha o perfil aberto pelo caminho normal do Anki e abre o marcado; já aberto, só responde igual."""
    def abrir(perfis):
        marcado = conexao.perfil_fixo.marcado()
        if marcado is None or marcado not in perfis:
            return 404, {"error": "profile_not_found"}
        conexao.colecao.trocar_para_o_perfil_fixo()
        return 200, {"ok": True, "profile": marcado}

    return _lendo_os_perfis(conexao, abrir)


def anki_responde(conexao, corpo):
    """`POST /anki/responde`: a thread principal do Anki está viva? Só o abridor que conserta sozinho pergunta (`conserto_do_anki.py`): ele
    não é um navegador pareado e não assina. Por isso a resposta não leva dado nenhum (`{ ok: true }`: nem os nomes dos perfis, nem o marcado)
    e nada muda (não marca perfil). Com o Anki sem responder, 503."""
    try:
        conexao.colecao.perfis()
    except baralhos.ColecaoIndisponivel as motivo:
        return 503, {"error": "anki_not_responding", "detail": str(motivo)}
    return 200, {"ok": True}
