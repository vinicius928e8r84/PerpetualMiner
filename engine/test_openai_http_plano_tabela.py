import unittest

import openai_http
from test_openai_http_tabela import BASE, DELTA, DO_PLANO, FIM, PARTES, PLANO, evento, rodar

CENARIOS = [
    ["responder", [BASE, "token", "gpt-6", "o sistema", "a mensagem"], {}, [["linhas", [b"event: x", DELTA, b": ping", DELTA, FIM]]]],
    ["responder", [BASE, "token", "gpt-6", "o juiz", PARTES], {"formato_json": True, "tempo": 3}, [["linhas", [FIM]]]],
    ["responder", [BASE, "token", "gpt-6", "s", "m"], {}, [["linhas", [b"data: [1]", evento(type=["lista"]), evento(type="response.completed")]]]],
    ["responder", [BASE, "token", "gpt-6", "s", "m"], {}, [["linhas", [evento(type="response.output_text.delta"), evento(type="response.completed", response=None)]]]],
    ["responder", [BASE, "token", "gpt-6", "s", "m"], {}, [["linhas", [DELTA]]]],
    ["responder", [BASE, "token", "gpt-6", "s", "m"], {}, [["linhas", [b"data: {quebrado"]]]],
    ["responder", [BASE, "token", "gpt-6", "s", "m"], {}, [["linhas", [evento(type="response.incomplete"), FIM]]]],
    ["responder", [BASE, "token", "gpt-6", "s", "m"], {}, [["linhas", [evento(type="response.failed", response={"error": {"code": "subscription_sharing_invalid_user"}})]]]],
    ["responder", [BASE, "token", "gpt-6", "s", "m"], {}, [["linhas", [evento(type="error", error={"code": "subscription_sharing_usage_limit_exceeded"})]]]],
    ["responder", [BASE, "token", "gpt-6", "s", "m"], {}, [["linhas", [evento(type="error", code="subscription_sharing_user_not_eligible")]]]],
    ["responder", [BASE, "token", "gpt-6", "s", "m"], {}, [["linhas", [evento(type="response.failed", response={"error": "texto"})]]]],
    ["responder", [BASE, "token", "gpt-6", "s", "m"], {"repeticoes": 2}, [["http", 500, "{}"], ["http", 429, "{}"], ["linhas", [FIM]]]],
    ["responder", [BASE, "token", "gpt-6", "s", "m"], {"repeticoes": 1}, [["http", 403, '{"error": {"code": "chatpass_v2_scope_not_authorized"}}']]],
    ["responder", [BASE, "token", "gpt-6", "s", "m"], {}, [["http", 400, '{"error": {"code": "invalid_image_format"}}']]],
    ["responder", [BASE, "token", "gpt-6", "s", "m"], {}, [["rede"]]],
    ["texto", [PLANO, "o sistema", "a mensagem"], {"temperatura": 0.2, "max_tokens": 9}, [["linhas", [DELTA, FIM]]]],
    ["texto", [PLANO, "o juiz", PARTES], {"json": True, "repeticoes": 2, "tempo": 5}, [["http", 503, "{}"], ["linhas", [evento(type="response.completed")]]]],
]

ESPERADOS = [
    {
        "devolvido": ["Front: Front:", {"input_tokens": 7, "output_tokens": 3}],
        "pedidos": [
            [
                "POST /v1/responses",
                DO_PLANO,
                {"model": "gpt-6", "instructions": "o sistema", "input": [{"role": "user", "content": "a mensagem"}], "store": False, "stream": True},
                120,
                1,
            ],
        ],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["", {"input_tokens": 7, "output_tokens": 3}],
        "pedidos": [
            [
                "POST /v1/responses",
                DO_PLANO,
                {
                    "model": "gpt-6",
                    "instructions": "o juiz",
                    "input": [{"role": "user", "content": PARTES}],
                    "store": False,
                    "stream": True,
                    "text": {"format": {"type": "json_object"}},
                },
                3,
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
                "POST /v1/responses",
                DO_PLANO,
                {"model": "gpt-6", "instructions": "s", "input": [{"role": "user", "content": "m"}], "store": False, "stream": True},
                120,
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
                "POST /v1/responses",
                DO_PLANO,
                {"model": "gpt-6", "instructions": "s", "input": [{"role": "user", "content": "m"}], "store": False, "stream": True},
                120,
                1,
            ],
        ],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["recusa", "openai_unreachable", None, "openai_unreachable"],
        "pedidos": [
            [
                "POST /v1/responses",
                DO_PLANO,
                {"model": "gpt-6", "instructions": "s", "input": [{"role": "user", "content": "m"}], "store": False, "stream": True},
                120,
                1,
            ],
        ],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["recusa", "openai_unreachable", None, "openai_unreachable"],
        "pedidos": [
            [
                "POST /v1/responses",
                DO_PLANO,
                {"model": "gpt-6", "instructions": "s", "input": [{"role": "user", "content": "m"}], "store": False, "stream": True},
                120,
                1,
            ],
        ],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["recusa", "empty_response", None, "empty_response"],
        "pedidos": [
            [
                "POST /v1/responses",
                DO_PLANO,
                {"model": "gpt-6", "instructions": "s", "input": [{"role": "user", "content": "m"}], "store": False, "stream": True},
                120,
                1,
            ],
        ],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["recusa", "chatgpt_rejected", None, "chatgpt_rejected"],
        "pedidos": [
            [
                "POST /v1/responses",
                DO_PLANO,
                {"model": "gpt-6", "instructions": "s", "input": [{"role": "user", "content": "m"}], "store": False, "stream": True},
                120,
                1,
            ],
        ],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["recusa", "chatgpt_usage_limit", None, "chatgpt_usage_limit"],
        "pedidos": [
            [
                "POST /v1/responses",
                DO_PLANO,
                {"model": "gpt-6", "instructions": "s", "input": [{"role": "user", "content": "m"}], "store": False, "stream": True},
                120,
                1,
            ],
        ],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["recusa", "chatgpt_not_eligible", None, "chatgpt_not_eligible"],
        "pedidos": [
            [
                "POST /v1/responses",
                DO_PLANO,
                {"model": "gpt-6", "instructions": "s", "input": [{"role": "user", "content": "m"}], "store": False, "stream": True},
                120,
                1,
            ],
        ],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["recusa", "openai_unreachable", None, "openai_unreachable"],
        "pedidos": [
            [
                "POST /v1/responses",
                DO_PLANO,
                {"model": "gpt-6", "instructions": "s", "input": [{"role": "user", "content": "m"}], "store": False, "stream": True},
                120,
                1,
            ],
        ],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["", {"input_tokens": 7, "output_tokens": 3}],
        "pedidos": [
            [
                "POST /v1/responses",
                DO_PLANO,
                {"model": "gpt-6", "instructions": "s", "input": [{"role": "user", "content": "m"}], "store": False, "stream": True},
                120,
                3,
            ],
        ],
        "esperas": [0.5, 1.0],
        "tls": True,
    },
    {
        "devolvido": ["recusa", "chatgpt_rejected", 403, "chatgpt_rejected (HTTP 403)"],
        "pedidos": [
            [
                "POST /v1/responses",
                DO_PLANO,
                {"model": "gpt-6", "instructions": "s", "input": [{"role": "user", "content": "m"}], "store": False, "stream": True},
                120,
                1,
            ],
        ],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["recusa", "openai_invalid_image", 400, "openai_invalid_image (HTTP 400)"],
        "pedidos": [
            [
                "POST /v1/responses",
                DO_PLANO,
                {"model": "gpt-6", "instructions": "s", "input": [{"role": "user", "content": "m"}], "store": False, "stream": True},
                120,
                1,
            ],
        ],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["recusa", "openai_unreachable", None, "openai_unreachable"],
        "pedidos": [
            [
                "POST /v1/responses",
                DO_PLANO,
                {"model": "gpt-6", "instructions": "s", "input": [{"role": "user", "content": "m"}], "store": False, "stream": True},
                120,
                1,
            ],
        ],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["Front:", {"entrada": 7, "saida": 3}],
        "pedidos": [
            [
                "POST /v1/responses",
                {"Authorization": "Bearer token-do-plano", "Content-type": "application/json", "Accept": "text/event-stream"},
                {"model": "gpt-x", "instructions": "o sistema", "input": [{"role": "user", "content": "a mensagem"}], "store": False, "stream": True},
                120,
                1,
            ],
        ],
        "esperas": [],
        "tls": True,
    },
    {
        "devolvido": ["", {"entrada": 0, "saida": 0}],
        "pedidos": [
            [
                "POST /v1/responses",
                {"Authorization": "Bearer token-do-plano", "Content-type": "application/json", "Accept": "text/event-stream"},
                {
                    "model": "gpt-x",
                    "instructions": "o juiz",
                    "input": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "input_text", "text": "Mode: real_only\nReply with the JSON verdict."},
                                {"type": "input_image", "image_url": "data:image/png;base64,AAAA"},
                            ],
                        },
                    ],
                    "store": False,
                    "stream": True,
                    "text": {"format": {"type": "json_object"}},
                },
                5,
                2,
            ],
        ],
        "esperas": [0.5],
        "tls": True,
    },
]

RECUSAS_DO_PLANO = [
    (429, {"code": "subscription_sharing_usage_limit_exceeded"}, "chatgpt_usage_limit"),
    (500, {"code": "subscription_sharing_user_unavailable"}, "openai_unreachable"),
    (400, {"code": "chatpass_v2_invalid_authorization_context"}, "chatgpt_rejected"),
    (400, {"code": "invalid_image_format"}, "openai_invalid_image"),
    (401, {}, "chatgpt_rejected"),
    (403, {"code": "outra"}, "chatgpt_rejected"),
    (429, {"code": "rate_limit_exceeded"}, "openai_rate_limited"),
    (429, {"type": "insufficient_quota"}, "openai_rate_limited"),
    (402, {}, "openai_request_rejected"),
    (404, {}, "openai_request_rejected"),
    (500, {}, "openai_unreachable"),
    (502, {"code": None}, "openai_unreachable"),
]


class OAdaptadorPeloPlano(unittest.TestCase):
    def test_cada_chamada_faz_os_mesmos_pedidos_espera_o_mesmo_e_devolve_o_mesmo(self):
        self.assertEqual(len(ESPERADOS), len(CENARIOS))
        for cenario, esperado in zip(CENARIOS, ESPERADOS):
            with self.subTest(cenario=cenario):
                self.assertEqual(rodar(cenario), esperado)

    def test_cada_recusa_do_plano_vira_o_mesmo_codigo(self):
        for status, detalhe, codigo in RECUSAS_DO_PLANO:
            with self.subTest(status=status, detalhe=detalhe):
                self.assertEqual(openai_http._classificar_do_plano(status, detalhe), codigo)


if __name__ == "__main__":
    unittest.main()
