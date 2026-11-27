from . import termos_da_linha


def _termos_da_linha(conexao, corpo):
    return termos_da_linha.ler_os_termos(conexao, corpo.get("lang"), corpo.get("texto"))


ROTAS_DOS_TERMOS = {("POST", "/ia/termos"): _termos_da_linha}
