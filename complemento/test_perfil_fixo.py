"""O perfil fixo do Anki (#149), visto de fora: a Conexão real pelo HTTP, a coleção em memória e a thread de trabalho do Envio.

Os Cartões só entram no perfil marcado na primeira conexão; a lista de perfis e o marcado atravessam o HTTP; com outro perfil
aberto o Envio espera sem trocar nada; com o Anki na tela de perfis a Conexão entra no perfil certo; o clique troca o perfil.

    python3.9 complemento/test_perfil_fixo.py
"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_envio import ID, INGLES, EnvioNoTeste, pedido  # noqa: E402
from complemento.test_servidor import ConexaoNoTeste  # noqa: E402

ORIGEM_DE_OUTRO_SITE = "https://exemplo.invalid"


def perfis_pelo_http(conexao):
    status, _, corpo = conexao.pedir("POST", "/anki/profiles", corpo={})
    return status, json.loads(corpo)


def pedir_json(conexao, caminho, corpo):
    status, _, resposta = conexao.pedir("POST", caminho, corpo=corpo)
    return status, json.loads(resposta)


def com_a_ana_e_o_beto(aberto="Ana", aberta=True):
    return ColecaoEmMemoria(INGLES, perfis=("Ana", "Beto"), perfil_aberto=aberto, aberta=aberta)


class AListaDePerfis(unittest.TestCase):
    def test_na_primeira_conexao_fica_marcado_o_perfil_que_estava_aberto(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, perfil="Ana", colecao=com_a_ana_e_o_beto("Ana")) as conexao:
            resposta = perfis_pelo_http(conexao)
        self.assertEqual(resposta, (200, {"profiles": ["Ana", "Beto"], "marked": "Ana", "open": "Ana"}))

    def test_o_perfil_marcado_continua_o_mesmo_quando_a_conexao_sobe_de_novo_com_outro_perfil_aberto(self):
        with tempfile.TemporaryDirectory() as pasta:
            with ConexaoNoTeste(pasta, perfil="Ana", colecao=com_a_ana_e_o_beto("Ana")) as conexao:
                perfis_pelo_http(conexao)
            with ConexaoNoTeste(pasta, perfil="Beto", colecao=com_a_ana_e_o_beto("Beto")) as conexao:
                resposta = perfis_pelo_http(conexao)
        self.assertEqual(resposta, (200, {"profiles": ["Ana", "Beto"], "marked": "Ana", "open": "Beto"}))

    def test_a_lista_se_le_com_o_anki_na_tela_de_perfis_e_nada_fica_marcado_sem_perfil_aberto(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, perfil=None, colecao=com_a_ana_e_o_beto(aberta=False)) as conexao:
            resposta = perfis_pelo_http(conexao)
        self.assertEqual(resposta, (200, {"profiles": ["Ana", "Beto"], "marked": None, "open": None}))

    def test_a_lista_so_responde_a_extensao(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, colecao=com_a_ana_e_o_beto()) as conexao:
            status, _, _ = conexao.pedir("POST", "/anki/profiles", origem=ORIGEM_DE_OUTRO_SITE, corpo={})
        self.assertEqual(status, 403)


class EscolherOutroPerfil(unittest.TestCase):
    def test_escolher_outro_perfil_muda_o_marcado_e_ele_fica_guardado(self):
        with tempfile.TemporaryDirectory() as pasta:
            with ConexaoNoTeste(pasta, perfil="Ana", colecao=com_a_ana_e_o_beto("Ana")) as conexao:
                escolha = pedir_json(conexao, "/anki/profile", {"profile": "Beto"})
            with ConexaoNoTeste(pasta, perfil="Ana", colecao=com_a_ana_e_o_beto("Ana")) as conexao:
                depois = perfis_pelo_http(conexao)
        self.assertEqual(escolha, (200, {"ok": True, "marked": "Beto"}))
        self.assertEqual(depois, (200, {"profiles": ["Ana", "Beto"], "marked": "Beto", "open": "Ana"}))

    def test_um_perfil_que_o_anki_nao_tem_e_recusado_e_o_marcado_nao_muda(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, perfil="Ana", perfil_marcado="Ana", colecao=com_a_ana_e_o_beto("Ana")) as conexao:
            recusa = pedir_json(conexao, "/anki/profile", {"profile": "Carla"})
            depois = perfis_pelo_http(conexao)
        self.assertEqual(recusa, (404, {"error": "profile_not_found"}))
        self.assertEqual(depois[1]["marked"], "Ana")

    def test_um_pedido_sem_nome_de_perfil_e_recusado(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, colecao=com_a_ana_e_o_beto()) as conexao:
            respostas = [pedir_json(conexao, "/anki/profile", corpo) for corpo in ({}, {"profile": ""}, {"profile": 3})]
        self.assertEqual(respostas, [(400, {"error": "invalid_request"})] * 3)

    def test_o_perfil_marcado_que_foi_apagado_aparece_na_lista_fora_dos_perfis_e_escolher_outro_resolve(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(
            pasta, perfil="Beto", perfil_marcado="Ana", colecao=ColecaoEmMemoria(INGLES, perfis=("Beto",), perfil_aberto="Beto"),
        ) as conexao:
            antes = perfis_pelo_http(conexao)
            escolha = pedir_json(conexao, "/anki/profile", {"profile": "Beto"})
            depois = perfis_pelo_http(conexao)
        self.assertEqual(antes, (200, {"profiles": ["Beto"], "marked": "Ana", "open": "Beto"}))
        self.assertEqual(escolha[0], 200)
        self.assertEqual(depois[1]["marked"], "Beto")


class AbrirOPerfilMarcado(unittest.TestCase):
    def test_o_clique_em_abrir_troca_o_perfil_aberto_pelo_marcado(self):
        colecao = com_a_ana_e_o_beto("Beto")
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, perfil="Beto", perfil_marcado="Ana", colecao=colecao) as conexao:
            resposta = pedir_json(conexao, "/anki/profile/open", {})
        self.assertEqual(resposta, (200, {"ok": True, "profile": "Ana"}))
        self.assertEqual((colecao.trocas, colecao.perfil_aberto()), ([("Beto", "Ana")], "Ana"))

    def test_sem_o_perfil_marcado_no_anki_o_clique_nao_abre_perfil_nenhum(self):
        colecao = ColecaoEmMemoria(INGLES, perfis=("Beto",), perfil_aberto="Beto")
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, perfil="Beto", perfil_marcado="Ana", colecao=colecao) as conexao:
            resposta = pedir_json(conexao, "/anki/profile/open", {})
        self.assertEqual(resposta, (404, {"error": "profile_not_found"}))
        self.assertEqual((colecao.trocas, colecao.entradas, colecao.perfil_aberto()), ([], [], "Beto"))

    def test_com_o_anki_na_tela_de_perfis_o_clique_entra_no_marcado(self):
        colecao = com_a_ana_e_o_beto(aberta=False)
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, perfil=None, perfil_marcado="Beto", colecao=colecao) as conexao:
            resposta = pedir_json(conexao, "/anki/profile/open", {})
        self.assertEqual(resposta, (200, {"ok": True, "profile": "Beto"}))
        self.assertEqual(colecao.perfil_aberto(), "Beto")


class OEnvioSoVaiParaOPerfilMarcado(unittest.TestCase):
    def test_com_outro_perfil_aberto_o_envio_espera_sem_gravar_nem_trocar_e_termina_no_marcado_quando_ele_abre(self):
        colecao = com_a_ana_e_o_beto("Beto")
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao, perfil="Beto", perfil_marcado="Ana") as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            esperando = conexao.esperar(ID, lambda estado: estado.get("waiting"))
            gravadas_na_espera, trocas, entradas = list(colecao.gravadas), list(colecao.trocas), list(colecao.entradas)
            colecao.abrir("Ana")  # a pessoa fecha o Beto pelo Anki e abre a Ana
            conexao.perfil = "Ana"
            fim = conexao.esperar(ID)
        self.assertEqual((esperando["status"], esperando["stage"]), ("running", "wait_anki"))
        self.assertEqual(esperando["waiting"], {"reason": "other_profile", "profile": "Beto", "marked": "Ana"})
        self.assertEqual((gravadas_na_espera, trocas, entradas), ([], [], []))
        self.assertEqual((fim["status"], len(colecao.gravadas), "waiting" in fim), ("completed", 1, False))

    def test_o_perfil_marcado_apagado_faz_o_envio_esperar_com_o_aviso_e_escolher_outro_o_libera(self):
        colecao = ColecaoEmMemoria(INGLES, perfis=("Beto",), perfil_aberto="Beto")
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao, perfil="Beto", perfil_marcado="Ana") as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            esperando = conexao.esperar(ID, lambda estado: estado.get("waiting"))
            gravadas_na_espera = list(colecao.gravadas)
            escolha = pedir_json(conexao, "/anki/profile", {"profile": "Beto"})
            fim = conexao.esperar(ID)
        self.assertEqual(esperando["waiting"], {"reason": "profile_missing", "profile": "Beto", "marked": "Ana"})
        self.assertEqual((gravadas_na_espera, escolha[0]), ([], 200))
        self.assertEqual((fim["status"], len(colecao.gravadas)), ("completed", 1))

    def test_com_o_anki_na_tela_de_perfis_a_conexao_entra_no_perfil_marcado_e_o_envio_termina(self):
        colecao = com_a_ana_e_o_beto(aberta=False)
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao, perfil=None, perfil_marcado="Beto") as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            fim = conexao.esperar(ID)
        self.assertEqual((fim["status"], colecao.entradas, colecao.perfil_aberto(), len(colecao.gravadas)), ("completed", ["Beto"], "Beto", 1))

    def test_o_clique_em_abrir_deixa_o_envio_que_esperava_terminar_no_perfil_marcado(self):
        colecao = com_a_ana_e_o_beto("Beto")
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao, perfil="Beto", perfil_marcado="Ana") as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            conexao.esperar(ID, lambda estado: estado.get("waiting"))
            clique = pedir_json(conexao, "/anki/profile/open", {})
            fim = conexao.esperar(ID)
        self.assertEqual(clique, (200, {"ok": True, "profile": "Ana"}))
        self.assertEqual((fim["status"], colecao.trocas, len(colecao.gravadas)), ("completed", [("Beto", "Ana")], 1))

    def test_com_um_perfil_so_o_envio_termina_sem_espera_nem_aviso(self):
        colecao = ColecaoEmMemoria(INGLES, perfis=("Usuário 1",))
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            fim = conexao.esperar(ID)
            lista = perfis_pelo_http(conexao)
        self.assertEqual((fim["status"], "waiting" in fim), ("completed", False))
        self.assertEqual(lista[1], {"profiles": ["Usuário 1"], "marked": "Usuário 1", "open": "Usuário 1"})

    def test_o_primeiro_envio_marca_o_perfil_aberto_quando_ninguem_o_marcou_antes(self):
        colecao = com_a_ana_e_o_beto("Beto")
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao, perfil="Beto") as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            conexao.esperar(ID)
            lista = perfis_pelo_http(conexao)
        self.assertEqual(lista[1]["marked"], "Beto")


if __name__ == "__main__":
    unittest.main()
