if __package__:
    from . import openai_http
else:
    import openai_http

OPENAI = "openai"
ADAPTADORES = {OPENAI: openai_http}

ErroDoProvedor = openai_http.ErroDaOpenAI
REPETICOES_DA_IMAGEM = openai_http.REPETICOES_DA_IMAGEM
TEMPO_DA_IMAGEM = openai_http.TEMPO_DA_IMAGEM
IMAGEM_INVALIDA = openai_http.IMAGEM_INVALIDA
passageira = openai_http.passageira
PROVEDOR_DESCONHECIDO = "provider_unknown"


def _adaptador(cred):
    adaptador = ADAPTADORES.get(cred.get("provedor"))
    if adaptador is None:
        raise ErroDoProvedor(PROVEDOR_DESCONHECIDO)
    return adaptador


def texto(cred, sistema, mensagem, **opcoes):
    return _adaptador(cred).texto(cred, sistema, mensagem, **opcoes)


def imagem(cred, prompt, tamanho):
    return _adaptador(cred).imagem(cred, prompt, tamanho)


class PelaChave:
    def __init__(self, segredo, base=None):
        self._credencial = {"provedor": OPENAI, "segredo": segredo, "base": base}

    def __repr__(self):
        return "PelaChave(%s)" % self._credencial["provedor"]

    def texto(self, modelo, sistema, mensagem, **opcoes):
        return texto(dict(self._credencial, modelo=modelo), sistema, mensagem, **opcoes)

    def imagem(self, modelo, prompt, tamanho):
        return imagem(dict(self._credencial, modelo=modelo), prompt, tamanho)
