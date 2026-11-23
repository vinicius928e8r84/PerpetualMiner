"""O pedido de um Envio (`POST /jobs`) visto pela função que o valida: cada recusa com o seu status, a ordem em que elas valem e o pedido que a Conexão guarda.

    python3.9 complemento/test_pedido_do_envio.py
"""

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.pedido_do_envio import MAXIMO_DE_FRASES, MAXIMO_DE_RESERVAS, impressao, validar_pedido

ID = "11111111-2222-4333-8444-555555555555"
LINHA = "give up : She gave up smoking"
FRASE = {"phraseId": 1760000000000, "line": LINHA}
MEU_TIPO = {"nome": "Meu Inglês", "mapa": {"frase": "Pergunta", "resposta": "Resposta"}}


def corpo(**mudancas):
    return dict({"jobId": ID, "lang": "en", "deckName": "Inglês", "entries": [FRASE]}, **mudancas)


def sem(chave):
    return {nome: valor for nome, valor in corpo().items() if nome != chave}


def frases(quantas):
    return [{"phraseId": numero, "line": LINHA} for numero in range(quantas)]


def guardado(**mudancas):
    return dict({"jobId": ID, "lang": "en", "deckName": "Inglês", "imageSource": "1", "tts": {}, "entries": [FRASE]}, **mudancas)


RECUSAS = [
    ("sem jobId", sem("jobId"), (400, "invalid_job_id")),
    ("jobId fora de UUID minúsculo", corpo(jobId="AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE"), (400, "invalid_job_id")),
    ("jobId que não é texto", corpo(jobId=7), (400, "invalid_job_id")),
    ("sem lang", sem("lang"), (400, "invalid_lang")),
    ("lang que a Conexão não tem", corpo(lang="de"), (400, "invalid_lang")),
    ("sem deckName", sem("deckName"), (400, "invalid_request")),
    ("deckName que não é texto", corpo(deckName=["Inglês"]), (400, "invalid_request")),
    ("deckName só de espaços", corpo(deckName="   "), (400, "invalid_request")),
    ("deckName de 257 letras", corpo(deckName="a" * 257), (400, "invalid_request")),
    ("nivel que o idioma não tem", corpo(nivel="expert"), (400, "invalid_level")),
    ("nivel nulo", corpo(nivel=None), (400, "invalid_level")),
    ("teste que não é sim ou não", corpo(teste="sim"), (400, "invalid_request")),
    ("teste 1", corpo(teste=1), (400, "invalid_request")),
    ("tipoProprio nulo", corpo(tipoProprio=None), (400, "invalid_mapping")),
    ("tipoProprio sem nome", corpo(tipoProprio={"mapa": MEU_TIPO["mapa"]}), (400, "invalid_mapping")),
    ("tipoProprio sem a resposta", corpo(tipoProprio={"nome": "Meu", "mapa": {"frase": "Pergunta"}}), (400, "invalid_mapping")),
    ("tipoProprio com a frase e a resposta no mesmo campo", corpo(tipoProprio={"nome": "Meu", "mapa": {"frase": "A", "resposta": "A"}}),
     (400, "invalid_mapping")),
    ("sem entries", sem("entries"), (400, "entries_required")),
    ("entries vazia", corpo(entries=[]), (400, "entries_required")),
    ("entries que não é lista", corpo(entries={"0": FRASE}), (400, "entries_required")),
    ("entries além do teto", corpo(entries=frases(MAXIMO_DE_FRASES + 1)), (413, "too_many_entries")),
    ("uma entrada que não é objeto", corpo(entries=[FRASE, "give up"]), (400, "entries_required")),
    ("phraseId verdadeiro", corpo(entries=[{"phraseId": True, "line": LINHA}]), (400, "entries_required")),
    ("phraseId em texto", corpo(entries=[{"phraseId": "1", "line": LINHA}]), (400, "entries_required")),
    ("phraseId com fração", corpo(entries=[{"phraseId": 1.0, "line": LINHA}]), (400, "entries_required")),
    ("line que não é texto", corpo(entries=[{"phraseId": 1, "line": 2}]), (400, "entries_required")),
    ("entrada sem line", corpo(entries=[{"phraseId": 1}]), (400, "entries_required")),
    ("reserva que não é lista", corpo(tts={"reserva": "google"}), (400, "invalid_request")),
    ("reserva além do teto", corpo(tts={"reserva": ["google"] * (MAXIMO_DE_RESERVAS + 1)}), (400, "invalid_request")),
    ("reserva com maiúscula", corpo(tts={"reserva": ["Google"]}), (400, "invalid_request")),
    ("reserva com um nome que não é texto", corpo(tts={"reserva": ["google", 3]}), (400, "invalid_request")),
    ("reserva com nome vazio", corpo(tts={"reserva": [""]}), (400, "invalid_request")),
    ("reserva com nome de 33 letras", corpo(tts={"reserva": ["a" * 33]}), (400, "invalid_request")),
    ("reserva nula", corpo(tts={"reserva": None}), (400, "invalid_request")),
]

PRIMEIRA_RECUSA = [
    ("jobId antes de lang", corpo(jobId="x", lang="de"), (400, "invalid_job_id")),
    ("lang antes de deckName", corpo(lang="de", deckName=""), (400, "invalid_lang")),
    ("deckName antes de nivel", corpo(deckName="", nivel="expert"), (400, "invalid_request")),
    ("nivel antes de teste", corpo(nivel="expert", teste="sim"), (400, "invalid_level")),
    ("teste antes de tipoProprio", corpo(teste="sim", tipoProprio=None), (400, "invalid_request")),
    ("tipoProprio antes de entries", corpo(tipoProprio=None, entries=[]), (400, "invalid_mapping")),
    ("entries vazia antes da reserva", corpo(entries=[], tts={"reserva": "google"}), (400, "entries_required")),
    ("teto de entries antes de uma entrada que não serve", corpo(entries=[*frases(MAXIMO_DE_FRASES), "x"]), (413, "too_many_entries")),
    ("entrada que não serve antes da reserva", corpo(entries=["x"], tts={"reserva": "google"}), (400, "entries_required")),
    ("entrada que não serve depois de uma repetida", corpo(entries=[FRASE, FRASE, {"phraseId": 2}]), (400, "entries_required")),
]

GUARDADOS = [
    ("o pedido mínimo", corpo(), guardado()),
    ("deckName sem os espaços das pontas", corpo(deckName="  Inglês \n"), guardado()),
    ("deckName de 256 letras", corpo(deckName="a" * 256), guardado(deckName="a" * 256)),
    ("imageSource dado", corpo(imageSource="2"), guardado(imageSource="2")),
    ("imageSource em número", corpo(imageSource=3), guardado(imageSource="3")),
    ("imageSource vazio vira 1", corpo(imageSource=""), guardado()),
    ("imageSource zero vira 1", corpo(imageSource=0), guardado()),
    ("nivel do idioma", corpo(lang="ru", nivel="avancado"), guardado(lang="ru", nivel="avancado")),
    ("teste sim", corpo(teste=True), guardado(teste=True)),
    ("teste não some", corpo(teste=False), guardado()),
    ("tipoProprio normalizado", corpo(tipoProprio=dict(MEU_TIPO, mapa=dict(MEU_TIPO["mapa"], imagem="Foto"), cor="azul")),
     guardado(tipoProprio={"nome": "Meu Inglês", "mapa": {"frase": "Pergunta", "resposta": "Resposta", "imagem": "Foto"}})),
    ("tts que não é objeto", corpo(tts=["com"]), guardado()),
    ("tts só com os textos", corpo(tts={"wordTld": "com", "phraseTld": "co.uk", "velocidade": 1, "voz": None}),
     guardado(tts={"wordTld": "com", "phraseTld": "co.uk"})),
    ("reserva sem repetir, na ordem", corpo(tts={"reserva": ["openai", "google", "openai", "edge_1"], "wordTld": "com"}),
     guardado(tts={"wordTld": "com", "reserva": ["openai", "google", "edge_1"]})),
    ("reserva vazia", corpo(tts={"reserva": []}), guardado(tts={"reserva": []})),
    ("reserva no teto", corpo(tts={"reserva": ["google"] * MAXIMO_DE_RESERVAS}), guardado(tts={"reserva": ["google"]})),
    ("frases repetidas valem a primeira", corpo(entries=[FRASE, {"phraseId": 2, "line": "b"}, {"phraseId": FRASE["phraseId"], "line": "outra"}]),
     guardado(entries=[FRASE, {"phraseId": 2, "line": "b"}])),
    ("entrada só com phraseId e line", corpo(entries=[dict(FRASE, contexto="Série", lang="en")]), guardado()),
    ("o teto de entries", corpo(entries=frases(MAXIMO_DE_FRASES)), guardado(entries=frases(MAXIMO_DE_FRASES))),
    ("o que o pedido traz a mais fica de fora", corpo(cor="azul", corpoSha256="x"), guardado()),
]

PEDIDO_COMPLETO = corpo(
    nivel="iniciante", teste=True, imageSource="2", tipoProprio=MEU_TIPO, tts={"wordTld": "com", "reserva": ["google"]},
)
IMPRESSAO_DO_PEDIDO_COMPLETO = "421e597d7df8b8bef16dba6c948ca25eb4f6ca9f32dc41718ad757a7bac2246d"


class ORecusadoDizPorQue(unittest.TestCase):
    def test_cada_pedido_que_nao_serve_volta_com_o_status_e_o_erro_dele(self):
        for nome, pedido, recusa in RECUSAS:
            with self.subTest(nome):
                self.assertEqual(validar_pedido(pedido), (None, recusa))

    def test_com_dois_problemas_vale_o_que_e_conferido_primeiro(self):
        for nome, pedido, recusa in PRIMEIRA_RECUSA:
            with self.subTest(nome):
                self.assertEqual(validar_pedido(pedido), (None, recusa))


class OAceitoEOQueAConexaoGuarda(unittest.TestCase):
    def test_cada_pedido_que_serve_vira_o_pedido_normalizado(self):
        for nome, pedido, esperado in GUARDADOS:
            with self.subTest(nome):
                self.assertEqual(validar_pedido(pedido), (esperado, None))

    def test_o_pedido_completo_guarda_as_chaves_nesta_ordem_e_a_impressao_dele_nao_muda(self):
        normalizado, recusa = validar_pedido(PEDIDO_COMPLETO)
        self.assertIsNone(recusa)
        self.assertEqual(json.dumps(normalizado, ensure_ascii=False), json.dumps({
            "jobId": ID, "lang": "en", "deckName": "Inglês", "imageSource": "2", "nivel": "iniciante", "tipoProprio": MEU_TIPO, "teste": True,
            "tts": {"wordTld": "com", "reserva": ["google"]}, "entries": [FRASE],
        }, ensure_ascii=False))
        self.assertEqual(impressao(normalizado), IMPRESSAO_DO_PEDIDO_COMPLETO)

    def test_validar_nao_muda_o_corpo_recebido(self):
        recebido = json.loads(json.dumps(PEDIDO_COMPLETO))
        validar_pedido(recebido)
        self.assertEqual(recebido, PEDIDO_COMPLETO)


if __name__ == "__main__":
    unittest.main()
