"""A voz do Cartão: o áudio da Palavra e o da Frase, pedido ao Google Tradutor só com a biblioteca padrão.

É o pedido que o gTTS 2.5 faz na Conexão de hoje (o RPC `jQ1olc` do `translate.google.<sotaque>`), sem a biblioteca: um POST por
pedaço de texto de até 100 letras, e o áudio (MP3) volta em base64 dentro da resposta; os pedaços de uma Frase comprida são
pedidos em ordem e colados. O texto e o sotaque (`tld`) vêm do motor (`generate_audio.voices`), os mesmos da Conexão de hoje.

O texto é preparado e quebrado como o gTTS 2.5 faz (`pedacos`). Escrito contra o gTTS 2.5.4: o endereço, o corpo e os cabeçalhos
de cada pedaço saem iguais aos dele; a biblioteca não é dependência do complemento, então o teste da Conexão confere o pedido
contra uma voz de mentira (`test_voz_de_mentira.py`), não contra o gTTS.

O que o Google diz ao recusar nunca é copiado para o log nem para a resposta: quem pede recebe só um código.
"""

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

RECUSADA = "tts_rejected"  # o Google recusou o pedido (um 4xx, como o 400 do risco 11)
FORA_DO_AR = "tts_unreachable"  # nem a resposta chegou, ou o Google está sobrecarregado (429, 5xx): vale tentar de novo
SEM_AUDIO = "tts_empty"  # a resposta veio boa, mas sem áudio
PASSAGEIROS = (FORA_DO_AR,)

# O sotaque entra no endereço (`translate.google.<sotaque>`): só `com`, `ru`, `co.uk`, `com.au`… servem, nunca outro domínio.
_SOTAQUE = re.compile(r"^(?:com?\.)?[a-z]{2,3}$")
# Daqui até `pedacos`, o texto como o gTTS 2.5 o prepara e o quebra (`gtts/tts.py`, `tokenizer/`), para o áudio sair igual.
_ABREVIACOES = ("dr", "jr", "mr", "mrs", "ms", "msgr", "prof", "sr", "st")
_PONTUACAO = "?!？！.,¡()[]¿…‥،;:—。，、：\n"
_SO_PONTUACAO_OU_ESPACO = re.compile("^[%s]*$" % re.escape(_PONTUACAO + string.whitespace))
_CORTES = re.compile(
    r"(?<=\?).|(?<=!).|(?<=？).|(?<=！).|(?<!\.[a-z])\. |(?<!\.[a-z]), |(?<!\d):|—|\(|،|…|。|‥|\]|、|\n|¡|，|\[|：|¿|\)|;",
    re.IGNORECASE | re.UNICODE,
)
_AUDIO = re.compile(r'jQ1olc","\[\\"(.*)\\"]')


class ErroDaVoz(Exception):
    """O Google não deu o áudio: `codigo` é um dos de cima."""

    def __init__(self, codigo):
        super().__init__(codigo)
        self.codigo = codigo


def sotaque_valido(sotaque):
    return isinstance(sotaque, str) and bool(_SOTAQUE.match(sotaque))


def _preparar(texto):
    """Os pré-processadores do gTTS: espaço depois de `?` e `!`, palavra cortada no fim da linha, ponto das abreviações, `Esq.`."""
    texto = re.sub(r"(?<=[?!？！])", " ", texto.strip())
    texto = texto.replace("-\n", "")
    for abreviacao in _ABREVIACOES:
        texto = re.sub(r"(?<=%s)(?=\.)." % abreviacao, "", texto, flags=re.IGNORECASE)
    return re.sub(re.escape("Esq."), "Esquire", texto, flags=re.IGNORECASE)


def pedacos(texto):
    """O texto em pedaços de até 100 letras, como o gTTS: inteiro se cabe; senão cortado na pontuação e, se um trecho ainda
    é comprido, no último espaço que cabe."""
    texto = _preparar(texto)
    trechos = [texto] if len(texto) <= LIMITE_DO_PEDACO else _CORTES.split(texto)
    achados = []
    for trecho in (t.strip() for t in trechos if not _SO_PONTUACAO_OU_ESPACO.match(t)):
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
    for linha in linhas:
        if RPC in linha:
            achou = _AUDIO.search(linha)
            try:
                audio = base64.b64decode(achou.group(1).encode("ascii")) if achou else b""
            except ValueError:
                audio = b""
            if audio:
                return audio
    raise ErroDaVoz(SEM_AUDIO)


def pedir_o_audio(base, texto, lang, sotaque):
    """O MP3 que o Google fala para `texto` em `lang` com o `sotaque`; levanta `ErroDaVoz`. `base` é `VOZ_BASE` (com `{tld}`)."""
    partes = pedacos(texto)
    if not partes:
        raise ErroDaVoz(SEM_AUDIO)
    return b"".join(_pedir_um_pedaco(base, parte, lang, sotaque) for parte in partes)
