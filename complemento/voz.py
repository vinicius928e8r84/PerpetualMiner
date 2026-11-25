import base64
import json
import re
import string
import urllib.error
import urllib.parse
import urllib.request

from .openai_api import contexto_tls

TEMPO_DE_CADA_PEDIDO = 15
LIMITE_DO_PEDACO = 100
RPC = "jQ1olc"
CAMINHO = "/_/TranslateWebserverUi/data/batchexecute"
CABECALHOS = {
    "Referer": "http://translate.google.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/47.0.2526.106 Safari/537.36",
    "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
}

RECUSADA = "tts_rejected"
FORA_DO_AR = "tts_unreachable"
SEM_AUDIO = "tts_empty"
PASSAGEIROS = (FORA_DO_AR,)

_SOTAQUE = re.compile(r"^(?:com?\.)?[a-z]{2,3}$")
_ABREVIACOES = ("dr", "jr", "mr", "mrs", "ms", "msgr", "prof", "sr", "st")
_PONTUACAO = "?!？！.,¡()[]¿…‥،;:—。，、：\n"
_SO_PONTUACAO_OU_ESPACO = re.compile("^[%s]*$" % re.escape(_PONTUACAO + string.whitespace))
_CORTES = re.compile(
    r"(?<=\?).|(?<=!).|(?<=？).|(?<=！).|(?<!\.[a-z])\. |(?<!\.[a-z]), |(?<!\d):|—|\(|،|…|。|‥|\]|、|\n|¡|，|\[|：|¿|\)|;",
    re.IGNORECASE | re.UNICODE,
)
_AUDIO = re.compile(r'jQ1olc","\[\\"(.*)\\"]')


class ErroDaVoz(Exception):
    def __init__(self, codigo):
        super().__init__(codigo)
        self.codigo = codigo


def sotaque_valido(sotaque):
    return isinstance(sotaque, str) and bool(_SOTAQUE.match(sotaque))


def _preparar(texto):
    texto = re.sub(r"(?<=[?!？！])", " ", texto.strip())
    texto = texto.replace("-\n", "")
    for abreviacao in _ABREVIACOES:
        texto = re.sub(r"(?<=%s)(?=\.)." % abreviacao, "", texto, flags=re.IGNORECASE)
    return re.sub(re.escape("Esq."), "Esquire", texto, flags=re.IGNORECASE)


def _no_ultimo_espaco_que_cabe(trecho):
    achados = []
    while True:
        if trecho.startswith(" "):
            trecho = trecho[1:]
        if len(trecho) <= LIMITE_DO_PEDACO:
            break
        corte = trecho.rfind(" ", 0, LIMITE_DO_PEDACO)
        corte = corte if corte >= 0 else LIMITE_DO_PEDACO
        achados.append(trecho[:corte])
        trecho = trecho[corte:]
    if trecho.strip():
        achados.append(trecho)
    return achados


def pedacos(texto):
    texto = _preparar(texto)
    trechos = [texto] if len(texto) <= LIMITE_DO_PEDACO else _CORTES.split(texto)
    achados = []
    for trecho in (t.strip() for t in trechos if not _SO_PONTUACAO_OU_ESPACO.match(t)):
        achados.extend(_no_ultimo_espaco_que_cabe(trecho))
    return [achado for achado in achados if achado]


def _pedir_um_pedaco(base, texto, lang, sotaque):
    parametro = json.dumps([texto, lang, None, "null"], separators=(",", ":"))
    rpc = json.dumps([[[RPC, parametro, None, "generic"]]], separators=(",", ":"))
    endereco = base.format(tld=sotaque) + CAMINHO
    pedido = urllib.request.Request(endereco, data=("f.req=%s&" % urllib.parse.quote(rpc)).encode("utf-8"), method="POST", headers=CABECALHOS)
    try:
        with urllib.request.urlopen(pedido, timeout=TEMPO_DE_CADA_PEDIDO, context=contexto_tls()) as resposta:
            linhas = resposta.read(16 * 1024 * 1024).decode("utf-8", "replace").splitlines()
    except urllib.error.HTTPError as erro:
        erro.close()
        raise ErroDaVoz(FORA_DO_AR if erro.code == 429 or erro.code >= 500 else RECUSADA)
    except (urllib.error.URLError, OSError, ValueError):
        raise ErroDaVoz(FORA_DO_AR)
    return _o_audio_da_resposta(linhas)


def _o_audio_da_linha(linha):
    achou = _AUDIO.search(linha)
    try:
        return base64.b64decode(achou.group(1).encode("ascii")) if achou else b""
    except ValueError:
        return b""


def _o_audio_da_resposta(linhas):
    for linha in linhas:
        if RPC in linha:
            audio = _o_audio_da_linha(linha)
            if audio:
                return audio
    raise ErroDaVoz(SEM_AUDIO)


def pedir_o_audio(base, texto, lang, sotaque):
    partes = pedacos(texto)
    if not partes:
        raise ErroDaVoz(SEM_AUDIO)
    return b"".join(_pedir_um_pedaco(base, parte, lang, sotaque) for parte in partes)
