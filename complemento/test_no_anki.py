"""O adaptador que o `__init__.py` usa no Anki, com um `mw` de mentira, pelo HTTP.

    python3.9 complemento/test_no_anki.py
"""

import http.client
import json
import os
import queue
import sqlite3
import sys
import tempfile
import threading
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import baralhos, configuracao, no_anki  # noqa: E402
from complemento.test_colecao_em_memoria import DESCRICAO, ContratoDoAdaptadorDaColecao  # noqa: E402


class AnkiDeMentira:
    """O que o complemento lê do `mw`: `pm.name` (o perfil que o gerente guarda) e `col` (a coleção aberta)."""

    def __init__(self):
        self.pm = types.SimpleNamespace(name=None)
        self.col = None

    def selecionar_na_janela_de_perfis(self, nome):
        self.pm.name, self.col = nome, None  # `pm.load(nome)` guarda o nome sem abrir a coleção

    def abrir(self, nome):
        self.pm.name, self.col = nome, object()

    def fechar_o_perfil(self):
        self.col = None  # volta à janela de perfis; o gerente ainda lembra o nome


class ThreadPrincipalDeMentira:
    """A thread principal do Anki: `run_on_main` roda a função nela, como o `taskman` do Anki."""

    def __init__(self):
        self._tarefas = queue.Queue()
        self.thread = threading.Thread(target=self._rodar, name="principal-do-anki", daemon=True)
        self.thread.start()
        self.parada = False

    def _rodar(self):
        while True:
            tarefa = self._tarefas.get()
            if tarefa is None:
                return
            if not self.parada:
                tarefa()

    def run_on_main(self, funcao):
        self._tarefas.put(funcao)

    def encerrar(self):
        self._tarefas.put(None)


class ColecaoDoAnkiDeMentira:
    """O que o adaptador usa de `mw.col`: `decks.all_names_and_ids`, `models.get` e `db.all`, sobre um sqlite de verdade
    (as tabelas `cards` e `notes` do Anki, só com as colunas que o Anki tem e o complemento lê)."""

    def __init__(self, descricao, thread_principal):
        self._principal = thread_principal
        self.fora_da_principal = []
        self._sqlite = sqlite3.connect(":memory:", check_same_thread=False)
        self._sqlite.executescript(
            "create table notes (id integer primary key, mid integer, flds text);"
            "create table cards (id integer primary key, nid integer, did integer, odid integer, type integer, ivl integer);"
        )
        self._baralhos, self._modelos = [], {}
        proxima = 1700000000000
        for indice, baralho in enumerate(descricao["baralhos"], start=1):
            self._baralhos.append(types.SimpleNamespace(id=indice, name=baralho["nome"]))
            for nota in baralho.get("notas", []):
                proxima += 1
                campos = list((nota.get("campos") or {"Frente": nota["frente"], "Verso": nota["verso"]}).items())
                modelo = self._modelos.setdefault(tuple(nome for nome, _ in campos), len(self._modelos) + 1)
                self._sqlite.execute("insert into notes values (?, ?, ?)", (proxima, modelo, "\x1f".join(valor for _, valor in campos)))
                for cartao in nota["cartoes"]:
                    self._sqlite.execute(
                        "insert into cards (nid, did, odid, type, ivl) values (?, ?, 0, ?, ?)", (proxima, indice, cartao["tipo"], cartao["intervalo"])
                    )
        self.decks = types.SimpleNamespace(all_names_and_ids=self._conferido(lambda: list(self._baralhos)))
        self.models = types.SimpleNamespace(get=self._conferido(self._modelo))
        self.db = types.SimpleNamespace(all=self._conferido(lambda sql: [list(linha) for linha in self._sqlite.execute(sql)]))

    def _conferido(self, funcao):
        def chamada(*argumentos):
            if threading.current_thread() is not self._principal.thread:
                self.fora_da_principal.append(threading.current_thread().name)
            return funcao(*argumentos)

        return chamada

    def _modelo(self, id_do_modelo):
        nomes = next((nomes for nomes, id_ in self._modelos.items() if id_ == id_do_modelo), None)
        if nomes is None:
            return None
        return {"flds": [{"name": nome, "ord": posicao} for posicao, nome in enumerate(nomes)]}


class AnkiComColecaoDeMentira(AnkiDeMentira):
    """Um `mw` com perfis, a thread principal e, quando há descrição, a coleção do perfil aberto."""

    def __init__(self, descricao=None, perfis=("Usuário 1",)):
        super().__init__()
        self.taskman = ThreadPrincipalDeMentira()
        self.pm.profiles = lambda: list(perfis)
        self.descricao = descricao
        if descricao is not None:
            self.abrir(perfis[0])

    def abrir(self, nome):
        super().abrir(nome)
        self.col = ColecaoDoAnkiDeMentira(self.descricao, self.taskman) if self.descricao is not None else object()


class AdaptadorDoAnki(ContratoDoAdaptadorDaColecao, unittest.TestCase):
    """O adaptador do Anki passa pelos mesmos testes que o da memória."""

    def setUp(self):
        self.anki = None
        self.addCleanup(lambda: self.anki and self.anki.taskman.encerrar())

    def adaptador(self, descricao, perfis=("Usuário 1",)):
        self.anki = AnkiComColecaoDeMentira(descricao, perfis)
        return no_anki.LeitorDaColecaoDoAnki(self.anki)

    def adaptador_fechado(self, perfis=("Usuário 1",)):
        self.anki = AnkiComColecaoDeMentira(None, perfis)
        return no_anki.LeitorDaColecaoDoAnki(self.anki)

    def test_a_colecao_so_e_tocada_pela_thread_principal_do_anki(self):
        colecao = self.adaptador(DESCRICAO)
        colecao.nomes_dos_baralhos()
        colecao.cartoes_do_baralho("Inglês")
        self.assertEqual(self.anki.col.fora_da_principal, [])

    def test_um_anki_que_nao_responde_a_tempo_diz_que_esta_ocupado_sem_prender_a_conexao(self):
        leitor = no_anki.LeitorDaColecaoDoAnki(self.adaptador(DESCRICAO)._mw, limite_s=0.2)
        self.anki.taskman.parada = True  # a thread principal está ocupada com outra coisa
        with self.assertRaises(baralhos.ColecaoIndisponivel) as erro:
            leitor.nomes_dos_baralhos()
        self.assertEqual(str(erro.exception), "anki_busy")

    def test_um_baralho_filtrado_empresta_os_cartoes_ao_baralho_de_origem(self):
        colecao = self.adaptador(DESCRICAO)
        self.anki.col._sqlite.execute("update cards set odid = did, did = 4 where did = 2")  # um Baralho filtrado os emprestou
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


class BaralhosLidosDoAnki(unittest.TestCase):
    def conectar(self, anki):
        pasta = tempfile.TemporaryDirectory()
        self.addCleanup(pasta.cleanup)
        conexao = no_anki.ao_carregar(anki, pasta.name, porta=0)
        self.addCleanup(conexao.parar)
        self.addCleanup(anki.taskman.encerrar)
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


class PerfilQueOAnkiTemAberto(unittest.TestCase):
    def test_a_saude_so_diz_o_perfil_com_a_colecao_aberta_e_volta_a_null_ao_fechar(self):
        anki = AnkiDeMentira()
        with tempfile.TemporaryDirectory() as pasta:
            conexao = no_anki.ao_carregar(anki, pasta, porta=0)
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
            conexao = no_anki.ao_carregar(anki, pasta, porta=0)
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
