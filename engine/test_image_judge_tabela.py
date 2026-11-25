import json
import logging
import tempfile
import unittest
from pathlib import Path

import image_judge
import provedores

ARQUIVOS = {
    "png": b"\x89PNG\r\n\x1a\nfoto",
    "jpeg": b"\xff\xd8\xffjpeg",
    "texto": b"isto nao e imagem",
}

CANDIDATOS = {
    "completo": {"arquivo": "png", "meta": {"source": "openverse", "query": "eye", "title": "Olho", "creator": "Ana", "kind": "real"}},
    "png": {"arquivo": "png", "meta": {"query": "eye"}},
    "jpeg": {"arquivo": "jpeg", "meta": {"query": "witness"}},
    "sem_meta": {"arquivo": "png"},
    "texto": {"arquivo": "texto", "meta": {"query": "texto"}},
    "sumiu": {"arquivo": "sumiu", "meta": {"query": "sumiu"}},
    "sem_caminho": {"meta": {"query": "sem caminho"}},
}

CARTAO = "Front: I saw it.\nImage: an eye"


PEDIDO_DO_CARTAO = (
    "Mode: %s\nKeyword: saw\nPhrase: I saw it.\nContext: %s\nCard brief:\nFront: I saw it.\n\n"
    "Evaluate all candidates. The best image is the one that would help a learner instantly remember the keyword inside this specific card."
)


def o_pedido_do_cartao(parte, cenario):
    texto = PEDIDO_DO_CARTAO % (cenario["modo"], cenario.get("contexto") or "None")
    return parte == {"type": "text", "text": texto}


class JuizDeMentira:
    def __init__(self, cenario):
        self.cenario = cenario
        self.resposta = cenario["resposta"]
        self.pedidos = []

    def julgar(self, modelo, sistema, conteudo, rotulo):
        primeira, *candidatos = conteudo
        self.pedidos.append([modelo, sistema == image_judge._SYSTEM, o_pedido_do_cartao(primeira, self.cenario), candidatos, rotulo])
        if isinstance(self.resposta, str):
            raise provedores.ErroDoProvedor(self.resposta)
        return self.resposta


class AvisosDoMotor(logging.Handler):
    def __init__(self):
        super().__init__(logging.WARNING)
        self.mensagens = []

    def emit(self, registro):
        self.mensagens.append(registro.getMessage())


def candidatos_em(pasta, nomes):
    lista = []
    for nome in nomes:
        candidato = {chave: valor for chave, valor in CANDIDATOS[nome].items() if chave != "arquivo"}
        if "arquivo" in CANDIDATOS[nome]:
            caminho = pasta / ("%s-%d" % (CANDIDATOS[nome]["arquivo"], len(lista)))
            if CANDIDATOS[nome]["arquivo"] in ARQUIVOS:
                caminho.write_bytes(ARQUIVOS[CANDIDATOS[nome]["arquivo"]])
            candidato["path"] = str(caminho)
        lista.append(candidato)
    return lista


def custos_em(pasta):
    arquivo = pasta / "costs.jsonl"
    linhas = arquivo.read_text(encoding="utf-8").splitlines() if arquivo.exists() else []
    return [[registro[chave] for chave in ("type", "model", "input_tokens", "output_tokens", "keyword")] for registro in map(json.loads, linhas)]


def veredito_ou_erro(pedido):
    try:
        return image_judge.rank_candidates(**pedido)
    except provedores.ErroDoProvedor as recusa:
        return ["recusa", recusa.codigo]
    except Exception as erro:
        return ["erro", type(erro).__name__]


def julgar(cenario):
    juiz, avisos = JuizDeMentira(cenario), AvisosDoMotor()
    with tempfile.TemporaryDirectory() as pasta:
        raiz = Path(pasta)
        pedido = dict(
            card=image_judge.CardForTheJudge("saw", "I saw it.", cenario.get("contexto", ""), CARTAO),
            judge=image_judge.TheJudge(juiz, "juiz-1", str(raiz), cenario.get("rotulo")),
            candidates=candidatos_em(raiz, cenario["candidatos"]), mode=cenario["modo"])
        image_judge.LOGGER.addHandler(avisos)
        try:
            veredito = veredito_ou_erro(pedido)
        finally:
            image_judge.LOGGER.removeHandler(avisos)
        return {"veredito": veredito, "pedidos": juiz.pedidos, "custos": custos_em(raiz), "avisos": avisos.mensagens}


VALIDO = json.dumps({"best_index": 0, "best_score": 81, "verdict": "keep_real", "summary": "olho", "candidates": [{"index": 0, "score": 81}]})
USO = {"entrada": 1500, "saida": 40}

CENARIOS = [
    {"modo": "real_only", "candidatos": ["completo"], "resposta": [VALIDO, USO, True], "contexto": "Netflix"},
    {"modo": "real_vs_generated", "candidatos": ["sem_caminho", "png", "texto", "sem_meta"], "resposta": ['{"best_index": 1}', USO, False], "rotulo": "c-7"},
    {"modo": "real_only", "candidatos": ["png", "jpeg"], "resposta": ['{"best_index": 9}', {"entrada": 5}, True], "rotulo": "c-8"},
    {"modo": "real_vs_generated", "candidatos": ["jpeg", "png"], "resposta": ['{"best_index": -1, "verdict": "x"}', {}, True]},
    {"modo": "real_only", "candidatos": ["png"], "resposta": ["  o juiz escreveu texto  ", USO, True]},
    {"modo": "real_vs_generated", "candidatos": ["png"], "resposta": ["", USO, False]},
    {"modo": "real_only", "candidatos": ["png", "jpeg"], "resposta": ['{"best_index": "abc", "best_score": 70}', USO, False]},
    {"modo": "real_only", "candidatos": ["png", "jpeg"], "resposta": ['{"best_index": "1"}', USO, False]},
    {"modo": "real_only", "candidatos": ["png", "jpeg"], "resposta": ['{"best_index": null}', USO, False]},
    {"modo": "real_only", "candidatos": ["png"], "resposta": ["[1, 2]", USO, False]},
    {"modo": "real_only", "candidatos": ["texto", "sumiu"], "resposta": [VALIDO, USO, True]},
    {"modo": "real_vs_generated", "candidatos": [], "resposta": [VALIDO, USO, True]},
    {"modo": "real_only", "candidatos": ["texto", "png", "jpeg"], "resposta": provedores.IMAGEM_INVALIDA, "rotulo": "c-9"},
    {"modo": "real_vs_generated", "candidatos": ["png", "texto", "jpeg"], "resposta": provedores.IMAGEM_INVALIDA},
    {"modo": "real_only", "candidatos": ["png"], "resposta": "openai_rate_limited"},
]

ESPERADOS = [
    {
        "veredito": {"best_index": 0, "best_score": 81, "verdict": "keep_real", "summary": "olho", "candidates": [{"index": 0, "score": 81}]},
        "pedidos": [
            [
                "juiz-1",
                True,
                True,
                [
                    {"type": "text", "text": "Candidate 0\nsource=openverse\nquery=eye\ntitle=Olho\ncreator=Ana\nkind=real"},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgpmb3Rv"}},
                ],
                "saw",
            ],
        ],
        "custos": [["tokens", "juiz-1", 1500, 40, "[image_judge] saw"]],
        "avisos": [],
    },
    {
        "veredito": {"best_index": 3, "best_score": 0, "verdict": "keep_generated", "summary": '{"best_index": 1}', "candidates": []},
        "pedidos": [
            [
                "juiz-1",
                True,
                True,
                [
                    {"type": "text", "text": "Candidate 0\nsource=\nquery=eye\ntitle=\ncreator=\nkind="},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgpmb3Rv"}},
                    {"type": "text", "text": "Candidate 1\nsource=\nquery=\ntitle=\ncreator=\nkind="},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgpmb3Rv"}},
                ],
                "c-7",
            ],
        ],
        "custos": [],
        "avisos": [],
    },
    {
        "veredito": {"best_index": 1, "best_score": 0, "verdict": "keep_real", "summary": '{"best_index": 9}', "candidates": []},
        "pedidos": [
            [
                "juiz-1",
                True,
                True,
                [
                    {"type": "text", "text": "Candidate 0\nsource=\nquery=eye\ntitle=\ncreator=\nkind="},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgpmb3Rv"}},
                    {"type": "text", "text": "Candidate 1\nsource=\nquery=witness\ntitle=\ncreator=\nkind="},
                    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,/9j/anBlZw=="}},
                ],
                "c-8",
            ],
        ],
        "custos": [["tokens", "juiz-1", 5, 0, "[image_judge] c-8"]],
        "avisos": [],
    },
    {
        "veredito": {"best_index": 0, "verdict": "x", "best_score": 0, "summary": '{"best_index": -1, "verdict": "x"}', "candidates": []},
        "pedidos": [
            [
                "juiz-1",
                True,
                True,
                [
                    {"type": "text", "text": "Candidate 0\nsource=\nquery=witness\ntitle=\ncreator=\nkind="},
                    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,/9j/anBlZw=="}},
                    {"type": "text", "text": "Candidate 1\nsource=\nquery=eye\ntitle=\ncreator=\nkind="},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgpmb3Rv"}},
                ],
                "saw",
            ],
        ],
        "custos": [],
        "avisos": [],
    },
    {
        "veredito": {"best_index": 0, "best_score": 0, "verdict": "keep_real", "summary": "o juiz escreveu texto", "candidates": []},
        "pedidos": [
            [
                "juiz-1",
                True,
                True,
                [
                    {"type": "text", "text": "Candidate 0\nsource=\nquery=eye\ntitle=\ncreator=\nkind="},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgpmb3Rv"}},
                ],
                "saw",
            ],
        ],
        "custos": [["tokens", "juiz-1", 1500, 40, "[image_judge] saw"]],
        "avisos": [],
    },
    {
        "veredito": {"best_index": 0, "best_score": 0, "verdict": "keep_generated", "summary": "No summary.", "candidates": []},
        "pedidos": [
            [
                "juiz-1",
                True,
                True,
                [
                    {"type": "text", "text": "Candidate 0\nsource=\nquery=eye\ntitle=\ncreator=\nkind="},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgpmb3Rv"}},
                ],
                "saw",
            ],
        ],
        "custos": [],
        "avisos": [],
    },
    {
        "veredito": {"best_index": 0, "best_score": 70, "verdict": "keep_real", "summary": '{"best_index": "abc", "best_score": 70}', "candidates": []},
        "pedidos": [
            [
                "juiz-1",
                True,
                True,
                [
                    {"type": "text", "text": "Candidate 0\nsource=\nquery=eye\ntitle=\ncreator=\nkind="},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgpmb3Rv"}},
                    {"type": "text", "text": "Candidate 1\nsource=\nquery=witness\ntitle=\ncreator=\nkind="},
                    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,/9j/anBlZw=="}},
                ],
                "saw",
            ],
        ],
        "custos": [],
        "avisos": [],
    },
    {
        "veredito": {"best_index": 1, "best_score": 0, "verdict": "keep_real", "summary": '{"best_index": "1"}', "candidates": []},
        "pedidos": [
            [
                "juiz-1",
                True,
                True,
                [
                    {"type": "text", "text": "Candidate 0\nsource=\nquery=eye\ntitle=\ncreator=\nkind="},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgpmb3Rv"}},
                    {"type": "text", "text": "Candidate 1\nsource=\nquery=witness\ntitle=\ncreator=\nkind="},
                    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,/9j/anBlZw=="}},
                ],
                "saw",
            ],
        ],
        "custos": [],
        "avisos": [],
    },
    {
        "veredito": {"best_index": 0, "best_score": 0, "verdict": "keep_real", "summary": '{"best_index": null}', "candidates": []},
        "pedidos": [
            [
                "juiz-1",
                True,
                True,
                [
                    {"type": "text", "text": "Candidate 0\nsource=\nquery=eye\ntitle=\ncreator=\nkind="},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgpmb3Rv"}},
                    {"type": "text", "text": "Candidate 1\nsource=\nquery=witness\ntitle=\ncreator=\nkind="},
                    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,/9j/anBlZw=="}},
                ],
                "saw",
            ],
        ],
        "custos": [],
        "avisos": [],
    },
    {
        "veredito": ["erro", "AttributeError"],
        "pedidos": [
            [
                "juiz-1",
                True,
                True,
                [
                    {"type": "text", "text": "Candidate 0\nsource=\nquery=eye\ntitle=\ncreator=\nkind="},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgpmb3Rv"}},
                ],
                "saw",
            ],
        ],
        "custos": [],
        "avisos": [],
    },
    {
        "veredito": {"best_index": 0, "best_score": 0, "verdict": "generate_better", "summary": "No supported image candidates.", "candidates": []},
        "pedidos": [],
        "custos": [],
        "avisos": [],
    },
    {
        "veredito": {"best_index": 0, "best_score": 0, "verdict": "keep_generated", "summary": "No supported image candidates.", "candidates": []},
        "pedidos": [],
        "custos": [],
        "avisos": [],
    },
    {
        "veredito": {
            "best_index": 1,
            "best_score": 0,
            "verdict": "generate_better",
            "summary": "OpenAI rejected one or more image candidates as invalid_image_format; candidates discarded.",
            "candidates": [
                {"index": 1, "score": 0, "reason": "discarded_after_invalid_image_format"},
                {"index": 2, "score": 0, "reason": "discarded_after_invalid_image_format"},
            ],
            "error": "invalid_image_format",
        },
        "pedidos": [
            [
                "juiz-1",
                True,
                True,
                [
                    {"type": "text", "text": "Candidate 0\nsource=\nquery=eye\ntitle=\ncreator=\nkind="},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgpmb3Rv"}},
                    {"type": "text", "text": "Candidate 1\nsource=\nquery=witness\ntitle=\ncreator=\nkind="},
                    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,/9j/anBlZw=="}},
                ],
                "c-9",
            ],
        ],
        "custos": [],
        "avisos": ["image_judge invalid_image_format keyword=c-9 mode=real_only candidates=2"],
    },
    {
        "veredito": {
            "best_index": 2,
            "best_score": 0,
            "verdict": "keep_generated",
            "summary": "OpenAI rejected one or more image candidates as invalid_image_format; candidates discarded.",
            "candidates": [
                {"index": 0, "score": 0, "reason": "discarded_after_invalid_image_format"},
                {"index": 2, "score": 0, "reason": "discarded_after_invalid_image_format"},
            ],
            "error": "invalid_image_format",
        },
        "pedidos": [
            [
                "juiz-1",
                True,
                True,
                [
                    {"type": "text", "text": "Candidate 0\nsource=\nquery=eye\ntitle=\ncreator=\nkind="},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgpmb3Rv"}},
                    {"type": "text", "text": "Candidate 1\nsource=\nquery=witness\ntitle=\ncreator=\nkind="},
                    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,/9j/anBlZw=="}},
                ],
                "saw",
            ],
        ],
        "custos": [],
        "avisos": ["image_judge invalid_image_format keyword=saw mode=real_vs_generated candidates=2"],
    },
    {
        "veredito": ["recusa", "openai_rate_limited"],
        "pedidos": [
            [
                "juiz-1",
                True,
                True,
                [
                    {"type": "text", "text": "Candidate 0\nsource=\nquery=eye\ntitle=\ncreator=\nkind="},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgpmb3Rv"}},
                ],
                "saw",
            ],
        ],
        "custos": [],
        "avisos": [],
    },
]

RESUMOS = [
    (None, ""),
    ("", ""),
    (
        "Front: I saw it.\n\n  Back: saw  \nImage: an eye\nGoogle Image Search: eye\nimage search query: witness\nDefinition: perceived.",
        "Front: I saw it.\nBack: saw\nDefinition: perceived.",
    ),
    (
        "Front: x\nGOOGLE IMAGE SEARCH QUERIES:\n1. eye\n2. time: now\nperson looking\nTranslation: vi\nImage Search Queries:\nwitness\nGist: viu",
        "Front: x\nTranslation: vi\nGist: viu",
    ),
    ("Image search queries: eye\nnext line\n3: three\nLiteral: a", "Literal: a"),
    ("\n".join("Linha %d: texto" % numero for numero in range(15)), "\n".join("Linha %d: texto" % numero for numero in range(12))),
]


class OJuizDasFotos(unittest.TestCase):
    def test_cada_pedido_ao_juiz_da_o_mesmo_veredito_manda_o_mesmo_conteudo_e_registra_o_mesmo_custo(self):
        self.assertEqual(len(ESPERADOS), len(CENARIOS))
        for cenario, esperado in zip(CENARIOS, ESPERADOS):
            with self.subTest(cenario=cenario):
                self.assertEqual(json.loads(json.dumps(julgar(cenario))), esperado)

    def test_o_resumo_do_cartao_deixa_de_fora_as_consultas_e_as_linhas_de_imagem_e_guarda_doze_linhas(self):
        for texto, esperado in RESUMOS:
            with self.subTest(texto=texto):
                self.assertEqual(image_judge._card_brief(texto), esperado)


if __name__ == "__main__":
    unittest.main()
