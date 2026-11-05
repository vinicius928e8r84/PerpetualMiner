"""A rota do Ouvir dos Ajustes de envio (#174): a Conexão fala uma frase de amostra com a voz que a pessoa escolheu e devolve o MP3.

É a Conexão quem fala (o Google e a OpenAI não deixam uma página da extensão pedir, e a chave é dela). A frase é da Conexão, uma
por idioma: a extensão não escolhe o que ela diz, então o pedido nunca gasta mais que uma frase curta. O pedido diz o idioma, o
`provedor` (`google` com o `sotaque`, ou `openai`, pela chave) e a resposta traz o `audio` em base64. A voz de reserva do Envio é outra
coisa (`audio_do_cartao.py`): aqui a pessoa pede uma voz e ouve essa, nunca a reserva.

O quiz de nível (#170) pede outra coisa: `POST /voz/falar`, a Conexão fala a frase que o pedido traz (de até `LIMITE_DA_FRASE` letras) com a voz do
Google no sotaque dado. É uma rota à parte para uma Conexão antiga não responder o `Ouvir` (a amostra) no lugar da frase: sem a rota, ela dá 404 e a
extensão pede para atualizar. Só o Google: é de graça, e a OpenAI gastaria a chave da pessoa numa frase de quiz.
"""

import base64

from . import voz, voz_da_openai

AMOSTRAS = {"en": "Hello, this is how I sound.", "ru": "Здравствуйте, вот как я звучу."}
PROVEDORES = ("google", "openai")
LIMITE_DA_FRASE = 200


def ouvir_a_voz(conexao, corpo):
    lang, provedor = corpo.get("lang"), corpo.get("provedor")
    if not isinstance(lang, str) or lang not in AMOSTRAS or provedor not in PROVEDORES:
        return 400, {"error": "invalid_request"}
    try:
        if provedor == "google":
            if not voz.sotaque_valido(corpo.get("sotaque")):
                return 400, {"error": "invalid_request"}
            audio = voz.pedir_o_audio(conexao.voz_base, AMOSTRAS[lang], lang, corpo["sotaque"])
        else:
            chave = conexao.cofre.ler("openai")  # só a chave: o plano do ChatGPT não cobre voz
            if not chave:
                return 409, {"error": "openai_key_missing"}
            audio = voz_da_openai.pedir_o_audio(conexao.openai_base, chave, AMOSTRAS[lang])
    except voz.ErroDaVoz as erro:
        conexao.logger.warning("Ouvir: a voz (%s) não veio (%s)", provedor, erro.codigo)
        return 502, {"error": erro.codigo}
    return 200, {"audio": base64.b64encode(audio).decode("ascii")}


def falar_a_frase(conexao, corpo):
    lang, sotaque, frase = corpo.get("lang"), corpo.get("sotaque"), corpo.get("texto")
    if not isinstance(lang, str) or lang not in AMOSTRAS or not voz.sotaque_valido(sotaque):
        return 400, {"error": "invalid_request"}
    if not isinstance(frase, str) or not frase.strip() or len(frase) > LIMITE_DA_FRASE:
        return 400, {"error": "invalid_request"}
    try:
        audio = voz.pedir_o_audio(conexao.voz_base, frase, lang, sotaque)
    except voz.ErroDaVoz as erro:
        conexao.logger.warning("Falar: a voz do Google não veio (%s)", erro.codigo)  # nunca a frase: é o log da Conexão
        return 502, {"error": erro.codigo}
    return 200, {"audio": base64.b64encode(audio).decode("ascii")}


ROTAS_DA_VOZ = {("POST", "/voz/ouvir"): ouvir_a_voz, ("POST", "/voz/falar"): falar_a_frase}
