"""
provedores.py - The provider layer: how the engine's stages ask an AI provider for a text or an image (standard library only, Python 3.9+).

A stage never names a provider's protocol. It builds a credential, `{provedor, segredo, modelo}` (plus `via: "plano"` for the ChatGPT plan, and
`base`, which only code sets: the tests', never the config's or the request's), and calls the two functions below:

  texto(cred, sistema, mensagem, json=False, ...)  -> (text, {entrada, saida})   `mensagem` is a text, or the chat's parts (text and base64 `image_url`)
  imagem(cred, prompt, tamanho)                    -> the first image of the answer, `{"b64_json": ...}` or `{"url": ...}` (`{}` if none)

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


def modelo_do_texto(config):
    """The model the key would write the Cards with: the Conexão's choice (#157), else the engine's."""
    return config.get("modelo_do_texto") or config["openai"].get("chat_model", "gpt-4o")


def credencial_do_texto(config, base=None):
    """The credential of the text stage in `config`: the ChatGPT plan's (`plano_do_chatgpt`), else the key with its model."""
    plano = config.get("plano_do_chatgpt")  # {token, modelo}
    if plano:
        return {"provedor": OPENAI, "via": "plano", "segredo": plano["token"], "modelo": plano["modelo"], "base": base}
    return {"provedor": OPENAI, "segredo": config["openai_api_key"], "modelo": modelo_do_texto(config), "base": base}


def texto(cred, sistema, mensagem, json=False, temperatura=None, max_tokens=None, tempo=None, repeticoes=0):
    """Ask `cred`'s provider for a text. `repeticoes`: how many times a passing refusal is asked again. Returns (text, {entrada, saida})."""
    return _adaptador(cred).texto(cred, sistema, mensagem, json, temperatura, max_tokens, tempo, repeticoes)


def imagem(cred, prompt, tamanho):
    """Ask `cred`'s provider for one image."""
    return _adaptador(cred).imagem(cred, prompt, tamanho)
