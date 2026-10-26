"""O adaptador que o `__init__.py` usa no Anki, com um `mw` de mentira, pelo HTTP.

    python3.9 complemento/test_no_anki.py
"""

import http.client
import json
import os
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import baralhos, configuracao, no_anki  # noqa: E402
from complemento.test_anki_de_mentira import AnkiComColecaoDeMentira, AnkiDeMentira  # noqa: E402
from complemento.test_colecao_em_memoria import DESCRICAO, ContratoDoAdaptadorDaColecao  # noqa: E402


class AdaptadorDoAnki(ContratoDoAdaptadorDaColecao, unittest.TestCase):
    """O adaptador do Anki passa pelos mesmos testes que o da memória."""

    def setUp(self):
        self.anki = None
        self.addCleanup(lambda: self.anki and self.anki.encerrar())

    def adaptador(self, descricao, perfis=("Usuário 1",), aberto=None):
        self.anki = AnkiComColecaoDeMentira(descricao, perfis, aberto)
        return no_anki.ColecaoDoAnki(self.anki)

    def adaptador_fechado(self, perfis=("Usuário 1",)):
        self.anki = AnkiComColecaoDeMentira(None, perfis)
        return no_anki.ColecaoDoAnki(self.anki)

    def sincronizar(self, colecao, sincronizando):
        (colecao.sincronizacao_comecou if sincronizando else colecao.sincronizacao_terminou)()

    def test_a_gravacao_tambem_so_toca_a_colecao_pela_thread_principal(self):
        colecao = self.adaptador(DESCRICAO)
        colecao.tipo_de_nota("Básico")
        colecao.adicionar_nota("Inglês", "Básico", {"Frente": "a", "Verso": "b"}, ["perpetual_miner"], "guid-1")
        colecao.guids_existentes(["guid-1"])
        self.assertEqual(self.anki.col.fora_da_principal, [])
        self.assertEqual(self.anki.col.notas_gravadas(), [["a\x1fb", "guid-1", "perpetual_miner"]])

    def test_a_gravacao_que_o_anki_ocupado_atrasou_nao_dobra_a_nota_quando_o_envio_tenta_de_novo(self):
        colecao = no_anki.ColecaoDoAnki(self.adaptador(DESCRICAO)._mw, limite_s=0.2)
        self.anki.taskman.livre.clear()  # o Anki fica ocupado mais que o limite
        with self.assertRaises(baralhos.ColecaoIndisponivel):
            colecao.adicionar_nota("Inglês", "Básico", {"Frente": "a", "Verso": "b"}, [], "guid-1")
        self.anki.taskman.livre.set()  # a gravação atrasada roda; o Envio tenta de novo
        colecao.adicionar_nota("Inglês", "Básico", {"Frente": "a", "Verso": "b"}, [], "guid-1")
        self.assertEqual([guid for _, guid, _ in self.anki.col.notas_gravadas()], ["guid-1"])

    def gravar_o_cartao(self, colecao, guid="guid-1", frente="a"):
        return colecao.gravar_cartao(
            "Inglês", "Básico", {"Frente": frente, "Verso": "b"}, [], guid, "Frente", frente.strip().lower(), lambda valor: valor.strip().lower())

    def test_o_cartao_que_o_anki_ocupado_atrasou_da_uma_nota_so_e_a_volta_seguinte_diz_added(self):
        colecao = no_anki.ColecaoDoAnki(self.adaptador(DESCRICAO)._mw, limite_s=0.2)
        self.anki.taskman.livre.clear()
        with self.assertRaises(baralhos.ColecaoIndisponivel):
            self.gravar_o_cartao(colecao)
        self.anki.taskman.livre.set()  # a função atrasada roda e grava; a thread de trabalho já tinha desistido
        self.assertEqual(self.gravar_o_cartao(colecao), "added")  # nunca “duplicate” da própria nota
        self.assertEqual([guid for _, guid, _ in self.anki.col.notas_gravadas()], ["guid-1"])

    def test_a_funcao_de_gravar_que_roda_depois_de_o_perfil_fechar_nao_levanta_na_thread_principal(self):
        # O perfil fecha com a função na fila: ela acha `mw.col` vazio, devolve `ColecaoIndisponivel` à thread de trabalho
        # e nada escapa para a thread principal (o diálogo de erro do Anki nunca abriria).
        colecao = no_anki.ColecaoDoAnki(self.adaptador(DESCRICAO)._mw, limite_s=0.2)
        escapou = []
        anterior = threading.excepthook
        threading.excepthook = lambda argumentos: escapou.append(argumentos.exc_value)
        try:
            self.anki.taskman.livre.clear()
            with self.assertRaises(baralhos.ColecaoIndisponivel):
                self.gravar_o_cartao(colecao)
            self.anki.fechar_o_perfil()
            self.anki.taskman.livre.set()
            time.sleep(0.2)
        finally:
            threading.excepthook = anterior
        self.assertEqual(escapou, [])
        with self.assertRaises(baralhos.ColecaoIndisponivel):
            self.gravar_o_cartao(colecao)

    def test_uma_sincronizacao_que_comeca_com_a_gravacao_na_fila_a_impede(self):
        colecao = no_anki.ColecaoDoAnki(self.adaptador(DESCRICAO)._mw, limite_s=1)
        self.anki.taskman.livre.clear()
        resultado = {}
        gravacao = threading.Thread(target=lambda: resultado.setdefault("erro", self._erro_de(colecao)))
        gravacao.start()
        time.sleep(0.1)
        colecao.sincronizacao_comecou()
        self.anki.taskman.livre.set()
        gravacao.join(5)
        self.assertEqual((resultado["erro"], self.anki.col.notas_gravadas()), ("anki_syncing", []))

    @staticmethod
    def _erro_de(colecao):
        try:
            colecao.adicionar_nota("Inglês", "Básico", {"Frente": "a", "Verso": "b"}, [], "guid-1")
        except baralhos.ColecaoIndisponivel as erro:
            return str(erro)
        return None

    def test_um_campo_que_o_tipo_de_nota_nao_tem_nao_grava_nada(self):
        colecao = self.adaptador(DESCRICAO)
        with self.assertRaises(baralhos.TipoDeNotaAusente):
            colecao.adicionar_nota("Inglês", "Básico", {"Front": "a", "Verso": "b"}, [], "guid-1")
        self.assertEqual(self.anki.col.notas_gravadas(), [])

    def test_a_colecao_so_e_tocada_pela_thread_principal_do_anki(self):
        colecao = self.adaptador(DESCRICAO)
        colecao.nomes_dos_baralhos()
        colecao.cartoes_do_baralho("Inglês")
        self.assertEqual(self.anki.col.fora_da_principal, [])

    def test_um_anki_que_nao_responde_a_tempo_diz_que_esta_ocupado_sem_prender_a_conexao(self):
        leitor = no_anki.ColecaoDoAnki(self.adaptador(DESCRICAO)._mw, limite_s=0.2)
        self.anki.taskman.parada = True  # a thread principal está ocupada com outra coisa
        with self.assertRaises(baralhos.ColecaoIndisponivel) as erro:
            leitor.nomes_dos_baralhos()
        self.assertEqual(str(erro.exception), "anki_busy")

    def test_um_baralho_filtrado_empresta_os_cartoes_ao_baralho_de_origem(self):
        colecao = self.adaptador(DESCRICAO)
        self.anki.col._sqlite.execute("update cards set odid = did, did = 4 where did = 2")
        self.assertEqual(len(colecao.cartoes_do_baralho("Inglês")), 4)

    def test_um_tipo_de_nota_que_o_anki_nao_acha_nao_derruba_a_leitura_e_a_frente_e_o_primeiro_campo(self):
        colecao = self.adaptador(DESCRICAO)
        self.anki.col._modelos.clear()
        cartoes = colecao.cartoes_do_baralho("Inglês::Séries")
        self.assertEqual([cartao["campos"] for cartao in cartoes][0], [("", "They keep running"), ("", "run /rʌn/")])
        self.assertEqual(baralhos.vocabulario(colecao, "Inglês::Séries", "en")["totalCards"], 2)

    def test_cada_cartao_vem_com_os_campos_com_o_nome_que_o_tipo_de_nota_deu(self):
        ingles = {"baralhos": [{"nome": "English", "notas": [{"campos": {"Front": "Hello", "Back": "Olá", "Extra": "x"}, "cartoes": [{"tipo": 0, "intervalo": 0}]}]}]}
        cartoes = self.adaptador(ingles).cartoes_do_baralho("English")
        self.assertEqual(cartoes[0]["campos"], [("Front", "Hello"), ("Back", "Olá"), ("Extra", "x")])


def perfil_na_saude(porta):
    pedido = http.client.HTTPConnection("127.0.0.1", porta, timeout=5)
    try:
        pedido.request("GET", "/health")
        return json.loads(pedido.getresponse().read())["perfil"]
    finally:
        pedido.close()


def ler_pelo_http(porta, caminho, corpo):
    pedido = http.client.HTTPConnection("127.0.0.1", porta, timeout=5)
    try:
        pedido.request("POST", caminho, body=json.dumps(corpo), headers={"Origin": configuracao.ORIGENS_ACEITAS[0], "Content-Type": "application/json"})
        resposta = pedido.getresponse()
        return resposta.status, json.loads(resposta.read())
    finally:
        pedido.close()


class SemRegistroReal:
    def setUp(self):
        remendo = patch("complemento.inicio.abridores.deste_computador", side_effect=AssertionError("host real proibido"))
        fabrica = remendo.start()
        self.addCleanup(remendo.stop)
        self.addCleanup(fabrica.assert_not_called)


class BaralhosLidosDoAnki(SemRegistroReal, unittest.TestCase):
    def conectar(self, anki):
        pasta = tempfile.TemporaryDirectory()
        self.addCleanup(pasta.cleanup)
        conexao = no_anki.ao_carregar(anki, pasta.name, porta=0, abridor=None)
        self.addCleanup(conexao.parar)
        self.addCleanup(anki.encerrar)
        return conexao

    def test_com_o_perfil_aberto_a_extensao_le_os_baralhos_e_o_vocabulario_da_colecao(self):
        conexao = self.conectar(AnkiComColecaoDeMentira(DESCRICAO))
        _, baralhos_do_anki = ler_pelo_http(conexao.porta, "/anki/decks", {})
        _, vocabulario = ler_pelo_http(conexao.porta, "/anki/vocabulary", {"deck": "Inglês", "lang": "en"})
        self.assertEqual(baralhos_do_anki["decks"], ["Inglês", "Inglês::Séries", "Vazio"])
        self.assertIn(("gave up", "term"), [(palavra["word"], palavra["type"]) for palavra in vocabulario["words"]])

    def test_com_o_anki_na_tela_de_perfis_nada_se_le_e_a_extensao_recebe_o_erro_do_contrato(self):
        anki = AnkiComColecaoDeMentira(DESCRICAO)
        anki.fechar_o_perfil()
        conexao = self.conectar(anki)
        status, corpo = ler_pelo_http(conexao.porta, "/anki/decks", {})
        self.assertEqual((status, corpo), (503, {"error": "anki_decks_unavailable", "detail": "collection_not_open"}))

    def test_o_vocabulario_acompanha_os_cartoes_que_o_anki_tem_a_cada_leitura(self):
        anki = AnkiComColecaoDeMentira(DESCRICAO)
        conexao = self.conectar(anki)
        antes = ler_pelo_http(conexao.porta, "/anki/stats/decks", {"decks": [{"deckName": "Inglês", "lang": "en"}]})[1]["decks"][0]["cards"]
        anki.col._sqlite.execute("insert into cards (nid, did, odid, type, ivl) select nid, did, 0, 0, 0 from cards where did = 2 limit 1")
        depois = ler_pelo_http(conexao.porta, "/anki/stats/decks", {"decks": [{"deckName": "Inglês", "lang": "en"}]})[1]["decks"][0]["cards"]
        self.assertEqual((antes, depois), (4, 5))


class EnvioGravadoNoAnki(SemRegistroReal, unittest.TestCase):
    """O Envio pelo adaptador do Anki, do `POST /jobs` à nota no sqlite da coleção, com a OpenAI de mentira."""

    def test_uma_frase_vira_nota_na_colecao_gravada_pela_thread_principal(self):
        from complemento.test_openai_de_mentira import OpenAIDeMentira

        anki = AnkiComColecaoDeMentira(DESCRICAO)
        self.addCleanup(anki.encerrar)
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira() as openai:
            conexao = no_anki.ao_carregar(anki, pasta, porta=0, abridor=None, ao_sincronizar=lambda colecao: None, openai_base=openai.base)
            try:
                conexao.cofre.guardar("openai", "sk-proj-chave-do-anki-0000")
                job = "11111111-2222-4333-8444-555555555555"
                ler_pelo_http(conexao.porta, "/jobs", {"jobId": job, "lang": "en", "deckName": "Inglês",
                                                       "entries": [{"phraseId": 1, "line": "keep going : They keep going"}]})
                fim = time.monotonic() + 10
                while ler_pelo_http(conexao.porta, "/jobs/get", {"jobId": job})[1]["state"]["status"] not in ("completed", "partial", "failed"):
                    self.assertLess(time.monotonic(), fim)
                    time.sleep(0.02)
                estado = ler_pelo_http(conexao.porta, "/jobs/get", {"jobId": job})[1]["state"]
            finally:
                conexao.parar()
        self.assertEqual(estado["status"], "completed")
        self.assertEqual([flds.split("\x1f")[0] for flds, _, _ in anki.col.notas_gravadas()], ["They <b>keep going</b>"])
        self.assertEqual(anki.col.fora_da_principal, [])


class PerfilQueOAnkiTemAberto(SemRegistroReal, unittest.TestCase):
    def test_o_adaptador_sem_abridor_nao_aciona_a_fabrica_de_registro_real(self):
        with tempfile.TemporaryDirectory() as pasta, patch(
            "complemento.inicio.abridores.deste_computador", side_effect=AssertionError("host real proibido")
        ) as fabrica:
            conexao = no_anki.ao_carregar(AnkiDeMentira(), pasta, porta=0, abridor=None)
            try:
                self.assertIsNotNone(conexao)
                self.assertIsNone(perfil_na_saude(conexao.porta))
                fabrica.assert_not_called()
            finally:
                if conexao is not None:
                    conexao.parar()

    def test_a_saude_so_diz_o_perfil_com_a_colecao_aberta_e_volta_a_null_ao_fechar(self):
        anki = AnkiDeMentira()
        with tempfile.TemporaryDirectory() as pasta:
            conexao = no_anki.ao_carregar(anki, pasta, porta=0, abridor=None)
            try:
                anki.selecionar_na_janela_de_perfis("Maria")
                na_janela = perfil_na_saude(conexao.porta)
                anki.abrir("Maria")
                aberto = perfil_na_saude(conexao.porta)
                anki.fechar_o_perfil()
                de_volta_na_janela = perfil_na_saude(conexao.porta)
            finally:
                conexao.parar()
        self.assertEqual((na_janela, aberto, de_volta_na_janela), (None, "Maria", None))

    def test_a_saude_traz_a_versao_do_complemento_com_o_perfil_do_adaptador(self):
        anki = AnkiDeMentira()
        anki.abrir("João")
        with tempfile.TemporaryDirectory() as pasta:
            conexao = no_anki.ao_carregar(anki, pasta, porta=0, abridor=None)
            try:
                pedido = http.client.HTTPConnection("127.0.0.1", conexao.porta, timeout=5)
                pedido.request("GET", "/health")
                corpo = json.loads(pedido.getresponse().read())
                pedido.close()
            finally:
                conexao.parar()
        self.assertEqual(corpo, {"ok": True, "versao": configuracao.VERSAO, "perfil": "João"})

    def test_ao_importar_fora_do_anki_nada_sobe(self):
        import complemento

        self.assertIsNone(complemento.mw)
        self.assertFalse(hasattr(complemento, "CONEXAO"))


if __name__ == "__main__":
    unittest.main()
