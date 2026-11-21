"""O adaptador da OpenAI pela chave (`openai_http.py`), gravado com o código de antes da refatoração da Onda 3 do CodeScene.

Cada cenário é uma chamada do adaptador e o que a rede responde a cada pedido; o que se grava é o que a chamada devolve (ou o código
da recusa), cada pedido que saiu (endereço, cabeçalhos, corpo, tempo, quantas vezes) e as esperas entre as tentativas. As recusas da
chave e as passageiras têm a sua tabela; o plano do ChatGPT está em `test_openai_http_plano_tabela.py`.
"""

import io
import json
import ssl
import unittest
import urllib.error
from unittest import mock

import openai_http

CHAVE = "sk-chave-0000"
BASE = "http://openai.local"
CRED = {"provedor": "openai", "segredo": CHAVE, "modelo": "gpt-x", "base": BASE}
PLANO = dict(CRED, via="plano", segredo="token-do-plano")
MENSAGENS = [{"role": "user", "content": "oi"}]
DA_CHAVE = {"Authorization": "Bearer " + CHAVE, "Content-type": "application/json"}
DO_PLANO = {"Authorization": "Bearer token", "Content-type": "application/json", "Accept": "text/event-stream"}
USO_DO_CHAT = {"prompt_tokens": 5, "completion_tokens": 2}
PARTES = [{"type": "text", "text": "Mode: real_only"}, {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAAA"}}]


def evento(**campos):
    return ("data: " + json.dumps(campos)).encode("utf-8")


DELTA = evento(type="response.output_text.delta", delta="Front: ")
FIM = evento(type="response.completed", response={"usage": {"input_tokens": 7, "output_tokens": 3}})


class RespostaDeMentira:
    def __init__(self, linhas):
        self.linhas = linhas

    def __enter__(self):
        return self

    def __exit__(self, *erro):
        return False

    def __iter__(self):
        return iter(self.linhas)

    def read(self):
        return b"".join(self.linhas)


def falha_da_rede(resposta, url):
    tipo = resposta[0]
    if tipo == "http":
        return urllib.error.HTTPError(url, resposta[1], "recusa", {}, io.BytesIO(resposta[2].encode("utf-8")))
    return {"rede": urllib.error.URLError("sem rede"), "tempo": TimeoutError("tempo"), "os": OSError("caiu")}[tipo]


class RedeDeMentira:
    def __init__(self, respostas):
        self.respostas = list(respostas)
        self.pedidos = []
        self.esperas = []
        self.tls = []

    def urlopen(self, pedido, timeout=None, context=None):
        corpo = json.loads(pedido.data.decode("utf-8"))
        self.pedidos.append([pedido.get_method() + " " + pedido.full_url.replace(BASE, ""), dict(pedido.header_items()), corpo, timeout])
        self.tls.append(isinstance(context, ssl.SSLContext))
        resposta = self.respostas.pop(0)
        if resposta[0] == "linhas":
            return RespostaDeMentira(resposta[1])
        raise falha_da_rede(resposta, pedido.full_url)


def chamada_ou_recusa(chamada):
    try:
        return chamada()
    except openai_http.ErroDaOpenAI as recusa:
        return ["recusa", recusa.codigo, recusa.status, str(recusa)]
    except Exception as erro:
        return ["erro", type(erro).__name__]


def rodar(cenario):
    funcao, argumentos, opcoes, respostas = cenario
    rede = RedeDeMentira(respostas)
    with mock.patch.object(openai_http.urllib.request, "urlopen", rede.urlopen), mock.patch.object(openai_http.time, "sleep", rede.esperas.append):
        devolvido = chamada_ou_recusa(lambda: getattr(openai_http, funcao)(*argumentos, **opcoes))
    return json.loads(json.dumps({"devolvido": devolvido, "pedidos": repetidos_juntos(rede.pedidos), "esperas": rede.esperas, "tls": all(rede.tls)}))


def repetidos_juntos(pedidos):
    juntos = []
    for pedido in pedidos:
        if juntos and juntos[-1][:-1] == pedido:
            juntos[-1][-1] += 1
        else:
            juntos.append(pedido + [1])
    return juntos


def corpo(objeto):
    return ["linhas", [json.dumps(objeto).encode("utf-8")]]


CHAT = corpo({"choices": [{"message": {"content": "  oi  "}}], "usage": {"prompt_tokens": 5, "completion_tokens": 2}})

CENARIOS = [
    ["completar", [BASE, CHAVE, "gpt-x", MENSAGENS], {}, [CHAT]],
    ["completar", [BASE, CHAVE, "gpt-x", MENSAGENS], {"temperatura": 0, "formato_json": True, "max_tokens": 0, "tempo": 9}, [CHAT]],
    ["completar", [BASE, CHAVE, "gpt-x", MENSAGENS], {"temperatura": 0.2, "max_tokens": 50, "repeticoes": 2}, [["http", 503, "{}"], ["rede"], CHAT]],
    ["completar", [BASE, CHAVE, "gpt-x", []], {"repeticoes": 3}, [["http", 429, '{"error": {"code": "rate_limit_exceeded"}}']] * 4],
    ["completar", [BASE, CHAVE, "gpt-x", []], {"repeticoes": 2}, [["http", 408, "x"], ["http", 409, "[]"], ["http", 401, "{}"]]],
    ["completar", [BASE, CHAVE, "gpt-x", []], {"repeticoes": 2}, [["http", 402, "{}"]]],
    ["completar", [BASE, CHAVE, "gpt-x", []], {}, [corpo({})]],
    ["completar", [BASE, CHAVE, "gpt-x", []], {}, [corpo({"choices": [None]})]],
    ["completar", [BASE, CHAVE, "gpt-x", []], {}, [corpo({"choices": [{"message": None}], "usage": None})]],
    ["completar", [BASE, CHAVE, "gpt-x", []], {}, [["linhas", [b"nao e json"]]]],
    ["completar", [BASE, CHAVE, "gpt-x", []], {}, [["tempo"]]],
    ["completar", [BASE, CHAVE, "gpt-x", []], {}, [["os"]]],
    ["imagem", [CRED, "um gato", "1024x1024"], {}, [corpo({"data": [{"b64_json": "QUJD"}, {"url": "x"}]})]],
    ["imagem", [dict(CRED, base=None), "um gato", "512x512"], {}, [["http", 503, "{}"], ["http", 503, "{}"], corpo({"data": []})]],
    ["imagem", [CRED, "um gato", "1024x1024"], {}, [corpo({"data": ["texto"]})]],
    ["imagem", [CRED, "um gato", "1024x1024"], {}, [["http", 400, '{"error": {"code": "invalid_image_format"}}']]],
    ["imagem", [CRED, "um gato", "1024x1024"], {}, [["http", 503, "{}"]] * 3],
    ["texto", [CRED, "o sistema", "a mensagem"], {}, [CHAT]],
    ["texto", [dict(CRED, base=""), "o sistema", PARTES], {"json": True, "temperatura": 0, "max_tokens": 1, "tempo": 4, "repeticoes": 1}, [CHAT]],
    ["texto", [CRED, "o sistema", "a mensagem"], {}, [corpo({"choices": []})]],
]

ESPERADOS = [
    {
        "devolvido": ["oi", USO_DO_CHAT],
        "pedidos": [["POST /v1/chat/completions", DA_CHAVE, {"model": "gpt-x", "messages": MENSAGENS}, 120, 1]],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["oi", USO_DO_CHAT],
        "pedidos": [
            [
                "POST /v1/chat/completions",
                DA_CHAVE,
                {"model": "gpt-x", "messages": MENSAGENS, "temperature": 0, "response_format": {"type": "json_object"}, "max_tokens": 0},
                9,
                1,
            ],
        ],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["oi", USO_DO_CHAT],
        "pedidos": [["POST /v1/chat/completions", DA_CHAVE, {"model": "gpt-x", "messages": MENSAGENS, "temperature": 0.2, "max_tokens": 50}, 120, 3]],
        "esperas": [0.5, 1.0],
        "tls": True,
    },
    {
        "devolvido": ["recusa", "openai_rate_limited", 429, "openai_rate_limited (HTTP 429)"],
        "pedidos": [["POST /v1/chat/completions", DA_CHAVE, {"model": "gpt-x", "messages": []}, 120, 4]],
        "esperas": [0.5, 1.0, 2.0],
        "tls": True,
    },
    {
        "devolvido": ["recusa", "openai_key_rejected", 401, "openai_key_rejected (HTTP 401)"],
        "pedidos": [["POST /v1/chat/completions", DA_CHAVE, {"model": "gpt-x", "messages": []}, 120, 3]],
        "esperas": [0.5, 1.0],
        "tls": True,
    },
    {
        "devolvido": ["recusa", "openai_no_credit", 402, "openai_no_credit (HTTP 402)"],
        "pedidos": [["POST /v1/chat/completions", DA_CHAVE, {"model": "gpt-x", "messages": []}, 120, 1]],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["", {}],
        "pedidos": [["POST /v1/chat/completions", DA_CHAVE, {"model": "gpt-x", "messages": []}, 120, 1]],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["", {}],
        "pedidos": [["POST /v1/chat/completions", DA_CHAVE, {"model": "gpt-x", "messages": []}, 120, 1]],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["", {}],
        "pedidos": [["POST /v1/chat/completions", DA_CHAVE, {"model": "gpt-x", "messages": []}, 120, 1]],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["recusa", "openai_unreachable", None, "openai_unreachable"],
        "pedidos": [["POST /v1/chat/completions", DA_CHAVE, {"model": "gpt-x", "messages": []}, 120, 1]],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["recusa", "openai_unreachable", None, "openai_unreachable"],
        "pedidos": [["POST /v1/chat/completions", DA_CHAVE, {"model": "gpt-x", "messages": []}, 120, 1]],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["recusa", "openai_unreachable", None, "openai_unreachable"],
        "pedidos": [["POST /v1/chat/completions", DA_CHAVE, {"model": "gpt-x", "messages": []}, 120, 1]],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": {"b64_json": "QUJD"},
        "pedidos": [["POST /v1/images/generations", DA_CHAVE, {"model": "gpt-x", "prompt": "um gato", "n": 1, "size": "1024x1024"}, 240, 1]],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": {},
        "pedidos": [
            [
                "POST https://api.openai.com/v1/images/generations",
                DA_CHAVE,
                {"model": "gpt-x", "prompt": "um gato", "n": 1, "size": "512x512"},
                240,
                3,
            ],
        ],
        "esperas": [0.5, 1.0],
        "tls": True,
    },
    {
        "devolvido": {},
        "pedidos": [["POST /v1/images/generations", DA_CHAVE, {"model": "gpt-x", "prompt": "um gato", "n": 1, "size": "1024x1024"}, 240, 1]],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["recusa", "openai_invalid_image", 400, "openai_invalid_image (HTTP 400)"],
        "pedidos": [["POST /v1/images/generations", DA_CHAVE, {"model": "gpt-x", "prompt": "um gato", "n": 1, "size": "1024x1024"}, 240, 1]],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["recusa", "openai_unreachable", 503, "openai_unreachable (HTTP 503)"],
        "pedidos": [["POST /v1/images/generations", DA_CHAVE, {"model": "gpt-x", "prompt": "um gato", "n": 1, "size": "1024x1024"}, 240, 3]],
        "esperas": [0.5, 1.0],
        "tls": True,
    },
    {
        "devolvido": ["oi", {"entrada": 5, "saida": 2}],
        "pedidos": [
            [
                "POST /v1/chat/completions",
                DA_CHAVE,
                {"model": "gpt-x", "messages": [{"role": "system", "content": "o sistema"}, {"role": "user", "content": "a mensagem"}]},
                120,
                1,
            ],
        ],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["oi", {"entrada": 5, "saida": 2}],
        "pedidos": [
            [
                "POST https://api.openai.com/v1/chat/completions",
                DA_CHAVE,
                {
                    "model": "gpt-x",
                    "messages": [{"role": "system", "content": "o sistema"}, {"role": "user", "content": PARTES}],
                    "temperature": 0,
                    "response_format": {"type": "json_object"},
                    "max_tokens": 1,
                },
                4,
                1,
            ],
        ],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["", {}],
        "pedidos": [
            [
                "POST /v1/chat/completions",
                DA_CHAVE,
                {"model": "gpt-x", "messages": [{"role": "system", "content": "o sistema"}, {"role": "user", "content": "a mensagem"}]},
                120,
                1,
            ],
        ],
        "esperas": [],
        "tls": True,
    },
]

RECUSAS_DA_CHAVE = [
    (400, {"code": "invalid_image_format"}, "openai_invalid_image"),
    (400, {"code": "other"}, "openai_request_rejected"),
    (401, {}, "openai_key_rejected"),
    (403, {"code": "invalid_image_format"}, "openai_key_rejected"),
    (402, {}, "openai_no_credit"),
    (429, {"code": "insufficient_quota"}, "openai_no_credit"),
    (429, {"code": None, "type": "billing_hard_limit"}, "openai_no_credit"),
    (429, {"code": "", "type": "requests"}, "openai_rate_limited"),
    (429, {}, "openai_rate_limited"),
    (404, {}, "openai_request_rejected"),
    (499, {"type": "quota"}, "openai_request_rejected"),
    (500, {}, "openai_unreachable"),
    (503, {"code": "insufficient_quota"}, "openai_unreachable"),
]

PASSAGEIRAS = [
    ("openai_unreachable", None, True),
    ("openai_rate_limited", 429, True),
    ("openai_request_rejected", 408, True),
    ("openai_request_rejected", 409, True),
    ("openai_request_rejected", 400, False),
    ("openai_key_rejected", 401, False),
    ("openai_no_credit", 409, True),
    ("chatgpt_usage_limit", 429, False),
    ("empty_response", None, False),
]


class OAdaptadorPelaChave(unittest.TestCase):
    def test_cada_chamada_faz_os_mesmos_pedidos_espera_o_mesmo_e_devolve_o_mesmo(self):
        self.assertEqual(len(ESPERADOS), len(CENARIOS))
        for cenario, esperado in zip(CENARIOS, ESPERADOS):
            with self.subTest(cenario=cenario):
                self.assertEqual(rodar(cenario), esperado)

    def test_cada_recusa_da_chave_vira_o_mesmo_codigo(self):
        for status, detalhe, codigo in RECUSAS_DA_CHAVE:
            with self.subTest(status=status, detalhe=detalhe):
                self.assertEqual(openai_http._classificar(status, detalhe), codigo)

    def test_so_a_recusa_passageira_e_pedida_de_novo(self):
        for codigo, status, passageira in PASSAGEIRAS:
            with self.subTest(codigo=codigo, status=status):
                self.assertEqual(openai_http.passageira(codigo, status), passageira)


if __name__ == "__main__":
    unittest.main()
