"""O que a extensão lê dos Baralhos pela Conexão real, além dos exemplos do contrato (`test_servidor.py`): paginação, filtros, corpo recusado, o limite do `Origin`.

    python3.9 complemento/test_servidor_leitura.py
"""

import contextlib
import io
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import baralhos, servidor  # noqa: E402
from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_servidor import ORIGEM, ConexaoNoTeste, ler_o_contrato  # noqa: E402


class LeituraDaColecao(unittest.TestCase):
    """O que a extensão lê dos Baralhos, além dos exemplos do contrato."""

    DECKS = {"decks": [{"deckName": "Inglês", "lang": "en"}]}

    def com_a_colecao(self, pasta, **argumentos):
        return ConexaoNoTeste(pasta, colecao=ColecaoEmMemoria(ler_o_contrato()["colecoes"]["inglês com subbaralho"]), **argumentos)

    def test_um_corpo_que_nao_e_um_objeto_json_e_recusado(self):
        with tempfile.TemporaryDirectory() as pasta, self.com_a_colecao(pasta) as conexao:
            respostas = [conexao.pedir("POST", "/anki/vocabulary", corpo=corpo) for corpo in (b"{isto nao e json", b"[1, 2]", b"\xff\xfe")]
        for status, _, corpo in respostas:
            self.assertEqual((status, json.loads(corpo)), (400, {"error": "invalid_json"}))

    def test_um_corpo_maior_que_o_limite_e_recusado(self):
        with tempfile.TemporaryDirectory() as pasta, self.com_a_colecao(pasta) as conexao:
            status, _, corpo = conexao.pedir(
                "POST", "/anki/stats/decks", corpo=json.dumps({"decks": [{"deckName": "x" * (servidor.LIMITE_DO_CORPO + 1), "lang": "en"}]}).encode("utf-8")
            )
        self.assertEqual((status, json.loads(corpo)), (400, {"error": "invalid_json"}))

    def test_os_numeros_pedidos_voltam_na_ordem_pedida_sem_repetir(self):
        pedidos = [{"deckName": "Vazio", "lang": "en"}, {"deckName": "Inglês", "lang": "en"}, {"deckName": "vazio", "lang": "en"}]
        with tempfile.TemporaryDirectory() as pasta, self.com_a_colecao(pasta) as conexao:
            _, _, corpo = conexao.pedir("POST", "/anki/stats/decks", corpo={"decks": pedidos})
        self.assertEqual([baralho["deckName"] for baralho in json.loads(corpo)["decks"]], ["Vazio", "Inglês"])

    def test_o_vocabulario_vem_paginado_pelo_limite_e_pelo_deslocamento(self):
        with tempfile.TemporaryDirectory() as pasta, self.com_a_colecao(pasta) as conexao:
            _, _, inteiro = conexao.pedir("POST", "/anki/vocabulary", corpo={"deck": "Inglês", "lang": "en"})
            _, _, pagina = conexao.pedir("POST", "/anki/vocabulary", corpo={"deck": "Inglês", "lang": "en", "limit": 3, "offset": 2})
        todas = json.loads(inteiro)["words"]
        self.assertEqual(json.loads(pagina)["words"], todas[2:5])
        self.assertEqual(json.loads(pagina)["totalWords"], len(todas))

    def test_um_limite_e_um_deslocamento_que_nao_sao_numeros_voltam_ao_padrao(self):
        with tempfile.TemporaryDirectory() as pasta, self.com_a_colecao(pasta) as conexao:
            for ruim in ({"a": 1}, [3], "muitos"):
                with self.subTest(ruim):
                    status, _, corpo = conexao.pedir("POST", "/anki/vocabulary", corpo={"deck": "Inglês", "lang": "en", "limit": ruim, "offset": ruim})
                    filtros = json.loads(corpo)["filters"]
                    self.assertEqual((status, filtros["limit"], filtros["offset"]), (200, baralhos.LIMITE_PADRAO, 0))

    def test_um_cliente_fora_do_navegador_que_declara_a_origem_da_extensao_sem_a_assinatura_nao_recebe_o_vocabulario(self):
        """O limite que o contrato aceitava (LEIA-ME, “Quem o complemento atende”, item 3) acabou com o pareamento (#192): o `Origin` não é
        autenticação, e quem só o declara (um programa local, uma extensão com `extraHeaders`) recebe 401 em vez dos Baralhos. Assinado
        como o navegador pareado, a mesma leitura responde. Sem a origem, ou com a de outro site, 403."""
        with tempfile.TemporaryDirectory() as pasta, self.com_a_colecao(pasta) as conexao:
            forjado = conexao.pedir("POST", "/anki/vocabulary", origem=ORIGEM, corpo={"deck": "Inglês", "lang": "en"}, assinar=False)
            pareado = conexao.pedir("POST", "/anki/vocabulary", origem=ORIGEM, corpo={"deck": "Inglês", "lang": "en"})
            sem_a_origem = conexao.pedir("POST", "/anki/vocabulary", origem=None, corpo={"deck": "Inglês", "lang": "en"})[0]
        self.assertEqual((forjado[0], json.loads(forjado[2])), (401, {"error": "pairing_required"}))
        self.assertEqual((pareado[0], json.loads(pareado[2])["totalWords"], sem_a_origem), (200, 12, 403))

    def test_o_vocabulario_filtra_pela_situacao_do_cartao(self):
        with tempfile.TemporaryDirectory() as pasta, self.com_a_colecao(pasta) as conexao:
            _, _, corpo = conexao.pedir("POST", "/anki/vocabulary", corpo={"deck": "Inglês", "lang": "en", "status": "new"})
        self.assertEqual({palavra["status"] for palavra in json.loads(corpo)["words"]}, {"new"})

    def test_o_vocabulario_do_russo_ignora_o_contexto_entre_colchetes_e_o_yo(self):
        russo = {"baralhos": [{"nome": "Русский", "notas": [{"frente": "Ёлка стоит [Context: série]", "verso": "", "cartoes": [{"tipo": 2, "intervalo": 30}]}]}]}
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, colecao=ColecaoEmMemoria(russo)) as conexao:
            _, _, corpo = conexao.pedir("POST", "/anki/vocabulary", corpo={"deck": "Русский", "lang": "ru"})
        self.assertEqual(
            [(palavra["word"], palavra["type"]) for palavra in json.loads(corpo)["words"]],
            [("елка стоит", "term"), ("елка", "word"), ("стоит", "word")],
        )

    def test_a_colecao_que_quebra_vira_erro_interno_no_log_e_nao_no_anki(self):
        class Quebrada(ColecaoEmMemoria):
            def nomes_dos_baralhos(self):
                raise RuntimeError("coleção ilegível")

        saida, erro = io.StringIO(), io.StringIO()
        with tempfile.TemporaryDirectory() as pasta, contextlib.redirect_stdout(saida), contextlib.redirect_stderr(erro):
            with ConexaoNoTeste(pasta, colecao=Quebrada()) as conexao:
                status, _, corpo = conexao.pedir("POST", "/anki/decks", corpo={})
                registrado = conexao.log()
        self.assertEqual((status, json.loads(corpo)), (500, {"error": "internal_error"}))
        self.assertIn("coleção ilegível", registrado)
        self.assertEqual((saida.getvalue(), erro.getvalue()), ("", ""))

    def test_uma_conexao_sem_adaptador_da_colecao_diz_que_nao_ha_o_que_ler(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _, corpo = conexao.pedir("POST", "/anki/decks", corpo={})
        self.assertEqual((status, json.loads(corpo)["error"]), (503, "anki_decks_unavailable"))


if __name__ == "__main__":
    unittest.main()
