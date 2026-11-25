import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import baralhos
from complemento.test_colecao_em_memoria import ColecaoEmMemoria

INGLES = {"baralhos": [
    {"nome": "Inglês", "notas": [
        {"frente": "She <b>gave up</b> smoking", "verso": "give up", "cartoes": [{"tipo": 2, "intervalo": 30}]},
        {"frente": "They keep running", "verso": "keep running", "cartoes": [{"tipo": 0, "intervalo": 0}]},
        {"frente": "Smoking kills", "verso": "smoking", "cartoes": [{"tipo": 1, "intervalo": 1}]},
    ]},
    {"nome": "Inglês::Filmes", "notas": [{"frente": "<b>Run away</b>", "verso": "run away", "cartoes": [{"tipo": 2, "intervalo": 3}]}]},
    {"nome": "Default", "notas": []},
]}
TODAS = ["gave up", "run away", "smoking", "away", "gave", "keep", "kills", "run", "running", "she", "they", "up"]
SEM_FILTRO = {"status": "all", "type": "all", "q": "", "limit": 1000, "offset": 0}
HORA_ISO = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")


def sem_a_hora(resposta):
    resposta = dict(resposta)
    hora = resposta.pop("generatedAt")
    if not HORA_ISO.match(hora):
        raise AssertionError("generatedAt fora do formato: %r" % hora)
    return resposta


def vocabulario(filtros=None, nome="Inglês"):
    return sem_a_hora(baralhos.vocabulario(ColecaoEmMemoria(INGLES), nome, "en", filtros))


def palavras_e_filtros(filtros):
    resposta = vocabulario(filtros)
    return [palavra["word"] for palavra in resposta["words"]], resposta["totalWords"], resposta["filters"]


class VocabularioDoBaralho(unittest.TestCase):
    def test_sem_filtros_o_vocabulario_tem_os_termos_e_as_palavras_do_baralho_e_dos_subbaralhos(self):
        resposta = vocabulario()
        palavras = resposta.pop("words")
        self.assertEqual(resposta, {"deckName": "Inglês", "lang": "en", "source": "colecao", "totalCards": 4, "filters": SEM_FILTRO, "totalWords": 12})
        self.assertEqual(palavras[:3], [
            {"word": "gave up", "type": "term", "cards": 1, "new": 0, "recent": 0, "mature": 1, "status": "mature"},
            {"word": "run away", "type": "term", "cards": 1, "new": 0, "recent": 1, "mature": 0, "status": "recent"},
            {"word": "smoking", "type": "word", "cards": 2, "new": 0, "recent": 1, "mature": 1, "status": "mixed"},
        ])

    def test_um_baralho_que_o_anki_nao_tem_tem_vocabulario_vazio_com_os_filtros_lidos(self):
        resposta = vocabulario({"status": "new"}, nome="Nenhum")
        esperado = {
            "deckName": "Nenhum", "lang": "en", "source": "colecao", "totalCards": 0, "filters": dict(SEM_FILTRO, status="new"),
            "totalWords": 0, "words": [],
        }
        self.assertEqual(resposta, esperado)

    def test_os_filtros_de_situacao_tipo_e_busca_escolhem_as_palavras(self):
        casos = {
            "situação": ({"status": " NEW "}, ["keep", "running", "they"], dict(SEM_FILTRO, status="new")),
            "situação desconhecida": ({"status": "zzz"}, TODAS, SEM_FILTRO),
            "tipo": ({"type": "term"}, ["gave up", "run away"], dict(SEM_FILTRO, type="term")),
            "tipo desconhecido": ({"type": "x"}, TODAS, SEM_FILTRO),
            "busca": ({"q": " SMOK"}, ["smoking"], dict(SEM_FILTRO, q="smok")),
            "busca no meio": ({"q": "UP"}, ["gave up", "up"], dict(SEM_FILTRO, q="up")),
            "situação e tipo": ({"status": "recent", "type": "word"}, ["away", "kills", "run"], dict(SEM_FILTRO, status="recent", type="word")),
            "os três": ({"status": "mature", "type": "term", "q": "gave"}, ["gave up"], dict(SEM_FILTRO, status="mature", type="term", q="gave")),
            "vazios": ({"status": "", "type": None, "q": None}, TODAS, SEM_FILTRO),
        }
        for nome, (filtros, esperadas, lidos) in casos.items():
            with self.subTest(nome):
                self.assertEqual(palavras_e_filtros(filtros), (esperadas, len(esperadas), lidos))

    def test_a_pagina_vem_do_limite_e_do_deslocamento_dentro_dos_limites_e_o_total_e_o_de_antes_da_pagina(self):
        casos = {
            "uma página": ({"limit": 2, "offset": 1}, TODAS[1:3], 2, 1),
            "em texto": ({"limit": "3", "offset": "10"}, TODAS[10:], 3, 10),
            "limite zero vale o padrão": ({"limit": 0}, TODAS, 1000, 0),
            "limite zero em texto vale um": ({"limit": "0"}, TODAS[:1], 1, 0),
            "limite negativo vale um": ({"limit": -3}, TODAS[:1], 1, 0),
            "limite acima do máximo": ({"limit": 99999}, TODAS, 10000, 0),
            "o que não é número vale o padrão": ({"limit": "x", "offset": "y"}, TODAS, 1000, 0),
            "deslocamento negativo vale zero": ({"offset": -5}, TODAS, 1000, 0),
            "deslocamento depois do fim": ({"offset": 50}, [], 1000, 50),
        }
        for nome, (filtros, esperadas, limite, deslocamento) in casos.items():
            with self.subTest(nome):
                self.assertEqual(palavras_e_filtros(filtros), (esperadas, len(TODAS), dict(SEM_FILTRO, limit=limite, offset=deslocamento)))


class NumerosDosBaralhos(unittest.TestCase):
    def test_os_baralhos_pedidos_vem_na_ordem_sem_repetir_e_o_que_falta_vem_zerado(self):
        pedidos = [
            {"deckName": " Inglês ", "lang": " EN "}, {"deckName": "INGLÊS"}, {"deckName": "Inglês", "lang": "ru"}, {"deckName": ""},
            {"deckName": "Inglês", "lang": "xx"}, {"deckName": "Sumiu", "lang": "en"}, {"lang": "en"}, {"deckName": None, "lang": "en"},
        ]
        resposta = sem_a_hora(baralhos.numeros_dos_baralhos(ColecaoEmMemoria(INGLES), pedidos))
        resumo = [(deck["deckName"], deck["lang"], deck.get("missing", False), deck["cards"], deck["mature"], deck["maturePct"]) for deck in resposta["decks"]]
        self.assertEqual(resumo, [("Inglês", "en", False, 4, 1, 33.3), ("Inglês", "ru", False, 4, 1, 33.3), ("Sumiu", "en", True, 0, 0, 0.0)])
        self.assertEqual((resposta["source"], resposta["totals"]["decks"], resposta["totals"]["cards"]), ("colecao", 3, 8))

    def test_os_numeros_de_um_baralho_contam_as_notas_os_baldes_e_o_vocabulario(self):
        resposta = sem_a_hora(baralhos.numeros_dos_baralhos(ColecaoEmMemoria(INGLES), [{"deckName": "Inglês", "lang": "en"}]))
        numeros = dict(resposta["decks"][0])
        vocabulario_do_baralho = numeros.pop("vocabulary")
        self.assertEqual(numeros, {
            "deckName": "Inglês", "lang": "en", "frontField": "Frente", "notes": 4, "cards": 4, "uniqueTerms": 2, "uniqueFronts": 4,
            "uniqueTermTokens": 10, "termMetric": "anki_target_terms", "new": 1, "learning": 1, "young": 1, "mature": 1, "reviewed": 3,
            "maturePct": 33.3,
        })
        self.assertEqual((vocabulario_do_baralho["targetTerms"], vocabulario_do_baralho["phraseVocabulary"]), (2, 10))


if __name__ == "__main__":
    unittest.main()
