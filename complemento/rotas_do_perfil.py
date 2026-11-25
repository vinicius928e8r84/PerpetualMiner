from . import baralhos


def _lendo_os_perfis(conexao, leitura):
    try:
        return leitura(conexao.colecao.perfis())
    except baralhos.ColecaoIndisponivel as motivo:
        return 503, {"error": "anki_profiles_unavailable", "detail": str(motivo)}


def listar_os_perfis(conexao, corpo):
    def listar(perfis):
        aberto = conexao.perfil_aberto()
        return 200, {"profiles": perfis, "marked": conexao.perfil_fixo.marcar_se_falta(aberto), "open": aberto}

    return _lendo_os_perfis(conexao, listar)


def escolher_o_perfil(conexao, corpo):
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
    def abrir(perfis):
        marcado = conexao.perfil_fixo.marcado()
        if marcado is None or marcado not in perfis:
            return 404, {"error": "profile_not_found"}
        conexao.colecao.trocar_para_o_perfil_fixo()
        return 200, {"ok": True, "profile": marcado}

    return _lendo_os_perfis(conexao, abrir)


def anki_responde(conexao, corpo):
    try:
        conexao.colecao.perfis()
    except baralhos.ColecaoIndisponivel as motivo:
        return 503, {"error": "anki_not_responding", "detail": str(motivo)}
    return 200, {"ok": True}
