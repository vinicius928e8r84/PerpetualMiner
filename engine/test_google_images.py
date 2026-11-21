"""A busca de fotos reais no Openverse, só com a biblioteca padrão: o que atravessa o HTTP e o que volta."""

import unittest
from urllib.parse import parse_qs, urlsplit

import google_images
from test_servidor_de_mentira import ServidorDeMentira


def resposta(*resultados):
    return 200, {"results": list(resultados)}


class BuscarCandidatas(unittest.TestCase):
    def test_a_busca_pede_a_consulta_o_limite_e_as_licencas_e_devolve_as_candidatas_com_os_dados_de_cada_uma(self):
        achado = {"url": "https://x/a.jpg", "thumbnail": "https://x/a_t.jpg", "title": "Eye", "creator": "Ana", "width": 800, "height": 600, "license": "by"}
        with ServidorDeMentira({"/v1/images/": resposta(achado, {"title": "sem endereço"})}) as openverse:
            candidatas = google_images.search_candidates("eye", limit=5, openverse_base=openverse.base)
            pedido = openverse.pedidos[0]
        self.assertEqual(urlsplit(pedido["caminho"]).path, "/v1/images/")
        self.assertEqual(
            {chave: valor[0] for chave, valor in parse_qs(urlsplit(pedido["caminho"]).query).items()},
            {"q": "eye", "page_size": "5", "license_type": "all", "mature": "false"},
        )
        self.assertIn("PerpetualMiner", pedido["cabecalhos"]["User-Agent"])
        self.assertEqual(candidatas, [{
            "url": "https://x/a.jpg", "thumbnail": "https://x/a_t.jpg", "title": "Eye", "creator": "Ana", "source": "openverse",
            "query": "eye", "width": 800, "height": 600, "license": "by",
        }])

    def test_a_candidata_sem_miniatura_usa_o_endereco_dela_como_miniatura(self):
        with ServidorDeMentira({"/v1/images/": resposta({"url": "https://x/a.jpg"})}) as openverse:
            candidatas = google_images.search_candidates("eye", openverse_base=openverse.base)
        self.assertEqual(candidatas[0]["thumbnail"], "https://x/a.jpg")

    def test_o_que_o_openverse_manda_nulo_ou_vazio_vira_texto_vazio_ou_zero_e_a_ordem_dos_dados_e_a_de_sempre(self):
        resultados = [
            {"url": "", "thumbnail": "https://x/t.jpg", "title": None, "creator": "", "width": None, "height": 0, "license": None},
            {"url": None, "thumbnail": None, "title": "sem endereco nenhum"},
            {"url": "https://x/b.jpg", "thumbnail": "", "title": "B", "creator": "Bia", "width": 10, "height": 20, "license": "cc0"},
        ]
        with ServidorDeMentira({"/v1/images/": resposta(*resultados)}) as openverse:
            candidatas = google_images.search_candidates("olho", openverse_base=openverse.base)
        self.assertEqual([list(c.items()) for c in candidatas], [
            [("url", "https://x/t.jpg"), ("thumbnail", "https://x/t.jpg"), ("title", ""), ("creator", ""), ("source", "openverse"),
             ("query", "olho"), ("width", 0), ("height", 0), ("license", "")],
            [("url", "https://x/b.jpg"), ("thumbnail", "https://x/b.jpg"), ("title", "B"), ("creator", "Bia"), ("source", "openverse"),
             ("query", "olho"), ("width", 10), ("height", 20), ("license", "cc0")],
        ])

    def test_uma_resposta_sem_a_lista_ou_com_um_resultado_que_nao_e_objeto_nao_acha_nada(self):
        respostas = {
            "sem results": {"outra": []},
            "results nulo": {"results": None},
            "uma lista": [{"url": "https://x/a.jpg"}],
            "um resultado que e texto": {"results": [{"url": "https://x/a.jpg"}, "https://x/b.jpg"]},
            "utf-8 quebrado": ("application/json", b'{"results": [{"url": "\xff"}]}'),
        }
        achado = {}
        for nome, corpo in respostas.items():
            with ServidorDeMentira({"/v1/images/": (200, corpo)}) as openverse:
                achado[nome] = google_images.search_candidates("eye", openverse_base=openverse.base)
        self.assertEqual(achado, {nome: [] for nome in respostas})

    def test_o_openverse_recusando_ou_fora_do_ar_ou_respondendo_lixo_nao_levanta_e_nao_acha_nada(self):
        with ServidorDeMentira({"/v1/images/": (429, {"detail": "slow down"})}) as openverse:
            recusada = google_images.search_candidates("eye", openverse_base=openverse.base)
        with ServidorDeMentira({"/v1/images/": (200, "<html>nao e json</html>")}) as openverse:
            lixo = google_images.search_candidates("eye", openverse_base=openverse.base)
        with ServidorDeMentira() as fora:
            base = fora.base
        self.assertEqual((recusada, lixo, google_images.search_candidates("eye", openverse_base=base)), ([], [], []))


if __name__ == "__main__":
    unittest.main()
