import base64

from . import voz, voz_da_openai

AMOSTRAS = {"en": "Hello, this is how I sound.", "ru": "Здравствуйте, вот как я звучу."}
PROVEDORES = ("google", "openai")
LIMITE_DA_FRASE = 200


def _idioma_com_amostra(lang):
    return isinstance(lang, str) and lang in AMOSTRAS


def _frase_que_cabe(frase):
    if not isinstance(frase, str):
        return False
    return bool(frase.strip()) and len(frase) <= LIMITE_DA_FRASE


def _com_o_audio(audio):
    return 200, {"audio": base64.b64encode(audio).decode("ascii")}


def _amostra_do_google(conexao, corpo, lang):
    if not voz.sotaque_valido(corpo.get("sotaque")):
        return 400, {"error": "invalid_request"}
    return _com_o_audio(voz.pedir_o_audio(conexao.voz_base, AMOSTRAS[lang], lang, corpo["sotaque"]))


def _amostra_da_openai(conexao, lang):
    chave = conexao.ia.para_a_fala()
    if not chave:
        return 409, {"error": "openai_key_missing"}
    return _com_o_audio(voz_da_openai.pedir_o_audio(conexao.openai_base, chave, AMOSTRAS[lang]))


def ouvir_a_voz(conexao, corpo):
    lang, provedor = corpo.get("lang"), corpo.get("provedor")
    if not _idioma_com_amostra(lang) or provedor not in PROVEDORES:
        return 400, {"error": "invalid_request"}
    try:
        if provedor == "google":
            return _amostra_do_google(conexao, corpo, lang)
        return _amostra_da_openai(conexao, lang)
    except voz.ErroDaVoz as erro:
        conexao.logger.warning("Ouvir: a voz (%s) não veio (%s)", provedor, erro.codigo)
        return 502, {"error": erro.codigo}


def falar_a_frase(conexao, corpo):
    lang, sotaque, frase = corpo.get("lang"), corpo.get("sotaque"), corpo.get("texto")
    if not _idioma_com_amostra(lang) or not voz.sotaque_valido(sotaque):
        return 400, {"error": "invalid_request"}
    if not _frase_que_cabe(frase):
        return 400, {"error": "invalid_request"}
    try:
        audio = voz.pedir_o_audio(conexao.voz_base, frase, lang, sotaque)
    except voz.ErroDaVoz as erro:
        conexao.logger.warning("Falar: a voz do Google não veio (%s)", erro.codigo)
        return 502, {"error": erro.codigo}
    return _com_o_audio(audio)


ROTAS_DA_VOZ = {("POST", "/voz/ouvir"): ouvir_a_voz, ("POST", "/voz/falar"): falar_a_frase}
