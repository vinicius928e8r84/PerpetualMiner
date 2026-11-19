"""
provedores.py - The provider layer: how the engine's stages ask an AI provider for a text or an image (standard library only, Python 3.9+).

A stage never names a provider's protocol. A credential is `{provedor, segredo, modelo}` (plus `via: "plano"` for the ChatGPT plan, and
`base`, which only code sets: the tests', never the config's or the request's); in the Anki add-on it comes ready from the Conexão's IA dos
cartões (`complemento/ia_dos_cartoes.py`), never from the engine's config. The two functions below take it:

  texto(cred, sistema, mensagem, json=False, ...)  -> (text, {entrada, saida})   `mensagem` is a text, or the chat's parts (text and base64 `image_url`)
  imagem(cred, prompt, tamanho)                    -> the first image of the answer, `{"b64_json": ...}` or `{"url": ...}` (`{}` if none)

A stage that the key always pays (the image screening, the generated image) gets a `PelaChave` instead:
the key bound to its provider, so the stage asks with a model and never holds the secret (the add-on's IA dos cartões makes it).

Each provider is an adapter: a module with the same two functions, listed in `ADAPTADORES`. `openai_http` is the only one so far. A refusal
is an `ErroDoProvedor(codigo)`, the code of the provider that refused (`openai_key_rejected`...), never what the provider wrote.
"""

if __package__:  # inside the Anki add-on the engine is the package `complemento.motor`
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


def texto(cred, sistema, mensagem, json=False, temperatura=None, max_tokens=None, tempo=None, repeticoes=0):
    """Ask `cred`'s provider for a text. `repeticoes`: how many times a passing refusal is asked again. Returns (text, {entrada, saida})."""
    return _adaptador(cred).texto(cred, sistema, mensagem, json, temperatura, max_tokens, tempo, repeticoes)


def imagem(cred, prompt, tamanho):
    """Ask `cred`'s provider for one image."""
    return _adaptador(cred).imagem(cred, prompt, tamanho)


class PelaChave:
    """A key bound to its provider: `texto(modelo, sistema, mensagem, ...)` and `imagem(modelo, prompt, tamanho)` as above, with no secret to hand on."""

    def __init__(self, segredo, base=None):
        self._credencial = {"provedor": OPENAI, "segredo": segredo, "base": base}

    def __repr__(self):
        return "PelaChave(%s)" % self._credencial["provedor"]

    def texto(self, modelo, sistema, mensagem, **opcoes):
        return texto(dict(self._credencial, modelo=modelo), sistema, mensagem, **opcoes)

    def imagem(self, modelo, prompt, tamanho):
        return imagem(dict(self._credencial, modelo=modelo), prompt, tamanho)
