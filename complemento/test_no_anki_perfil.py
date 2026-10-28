"""O perfil fixo (#149) com o `mw` de mentira: o que a Conexão pede ao Anki, na ordem, e o que o Anki devolve pelo HTTP.

    python3.9 complemento/test_no_anki_perfil.py
"""

import json
import os
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import no_anki  # noqa: E402
from complemento.test_anki_de_mentira import AnkiComColecaoDeMentira  # noqa: E402
from complemento.test_colecao_em_memoria import DESCRICAO  # noqa: E402
from complemento.test_no_anki import SemRegistroReal, ler_pelo_http  # noqa: E402


class OPerfilFixoNoAnki(SemRegistroReal, unittest.TestCase):

    def conectar(self, anki, marcado=None, ganchos=None):
        pasta = tempfile.TemporaryDirectory()
        self.addCleanup(pasta.cleanup)
        if marcado:
            os.makedirs(os.path.join(pasta.name, "user_files"))
            with open(os.path.join(pasta.name, "user_files", "perfil.json"), "w", encoding="utf-8") as arquivo:
                json.dump({"perfil": marcado}, arquivo)
        conexao = no_anki.ao_carregar(
            anki, pasta.name, porta=0, abridor=None, ao_sincronizar=lambda colecao: None,
            ao_abrir_o_perfil=(ganchos.append if ganchos is not None else lambda funcao: None),
        )
        self.addCleanup(conexao.parar)
        self.addCleanup(anki.encerrar)
        return conexao

    def test_o_perfil_aberto_ao_carregar_fica_marcado_e_a_lista_vem_do_gerente_de_perfis_do_anki(self):
        conexao = self.conectar(AnkiComColecaoDeMentira(DESCRICAO, perfis=("Ana", "Beto"), aberto="Ana"))
        self.assertEqual(
            ler_pelo_http(conexao.porta, "/anki/profiles", {}), (200, {"profiles": ["Ana", "Beto"], "marked": "Ana", "open": "Ana"}))

    def test_um_perfil_que_abre_depois_nao_muda_o_marcado(self):
        anki = AnkiComColecaoDeMentira(DESCRICAO, perfis=("Ana", "Beto"), aberto="Ana")
        ganchos = []
        conexao = self.conectar(anki, ganchos=ganchos)
        anki.fechar_o_perfil()
        anki.abrir("Beto")
        for gancho in ganchos:
            gancho()
        self.assertEqual(
            ler_pelo_http(conexao.porta, "/anki/profiles", {}), (200, {"profiles": ["Ana", "Beto"], "marked": "Ana", "open": "Beto"}))

    def test_com_o_anki_na_tela_de_perfis_a_conexao_entra_pelas_funcoes_de_perfil_do_anki(self):
        anki = AnkiComColecaoDeMentira(None, perfis=("Ana", "Beto"))
        conexao = self.conectar(anki, marcado="Beto")
        status, corpo = ler_pelo_http(conexao.porta, "/anki/profile/open", {})
        self.assertEqual((status, corpo), (200, {"ok": True, "profile": "Beto"}))
        self.assertEqual(anki.passos, [("pm.load", "Beto"), ("onOpenProfile", "Beto")])
        self.assertEqual(ler_pelo_http(conexao.porta, "/anki/profiles", {})[1]["open"], "Beto")

    def test_com_um_dialogo_modal_aberto_na_tela_de_perfis_a_conexao_nao_entra_no_perfil(self):
        anki = AnkiComColecaoDeMentira(None, perfis=("Ana", "Beto"))
        anki.janela_modal = object()  # a pessoa está no “Excluir” ou no “Renomear” do perfil Beto: o que ela confirmar vale para `pm.name`
        conexao = self.conectar(anki, marcado="Ana")
        status, corpo = ler_pelo_http(conexao.porta, "/anki/profile/open", {})
        self.assertEqual((status, corpo), (200, {"ok": True, "profile": "Ana"}))
        self.assertEqual((anki.passos, anki.pm.name, anki.col), ([], None, None))

    def test_com_outra_janela_ativa_no_lugar_da_janela_de_perfis_a_conexao_nao_entra_no_perfil(self):
        anki = AnkiComColecaoDeMentira(None, perfis=("Ana", "Beto"))
        anki.janela_ativa = object()
        conexao = self.conectar(anki, marcado="Ana")
        ler_pelo_http(conexao.porta, "/anki/profile/open", {})
        self.assertEqual(anki.passos, [])

    def test_fechado_o_dialogo_modal_a_conexao_entra_no_perfil_marcado(self):
        anki = AnkiComColecaoDeMentira(None, perfis=("Ana", "Beto"))
        anki.janela_modal = object()
        conexao = self.conectar(anki, marcado="Ana")
        ler_pelo_http(conexao.porta, "/anki/profile/open", {})
        anki.janela_modal = None
        ler_pelo_http(conexao.porta, "/anki/profile/open", {})
        self.assertEqual(anki.passos, [("pm.load", "Ana"), ("onOpenProfile", "Ana")])

    def test_dois_cliques_em_abrir_durante_a_sincronizacao_ao_fechar_fecham_o_perfil_uma_vez_so(self):
        anki = AnkiComColecaoDeMentira(DESCRICAO, perfis=("Ana", "Beto"), aberto="Beto")
        anki.fechamentos_adiados = []  # o Anki ainda sincroniza: o perfil continua aberto
        conexao = self.conectar(anki, marcado="Ana")
        ler_pelo_http(conexao.porta, "/anki/profile/open", {})
        ler_pelo_http(conexao.porta, "/anki/profile/open", {})
        self.assertEqual(anki.passos, [("unloadProfile", "Beto")])
        anki.terminar_o_fechamento()
        self.assertEqual(
            anki.passos, [("unloadProfile", "Beto"), ("showProfileManager", None), ("pm.load", "Ana"), ("onOpenProfile", "Ana")])

    def test_depois_de_trocar_um_novo_clique_volta_a_fechar_o_perfil_aberto(self):
        anki = AnkiComColecaoDeMentira(DESCRICAO, perfis=("Ana", "Beto"), aberto="Beto")
        anki.fechamentos_adiados = []
        conexao = self.conectar(anki, marcado="Ana")
        ler_pelo_http(conexao.porta, "/anki/profile/open", {})
        anki.terminar_o_fechamento()
        anki.abrir("Beto")  # a pessoa volta ao Beto por conta própria
        ler_pelo_http(conexao.porta, "/anki/profile/open", {})
        self.assertEqual(anki.passos.count(("unloadProfile", "Beto")), 2)

    def test_o_clique_fecha_o_perfil_pelo_caminho_normal_do_anki_e_abre_o_marcado(self):
        anki = AnkiComColecaoDeMentira(DESCRICAO, perfis=("Ana", "Beto"), aberto="Beto")
        conexao = self.conectar(anki, marcado="Ana")
        ler_pelo_http(conexao.porta, "/anki/profile/open", {})
        self.assertEqual(
            anki.passos,
            [("unloadProfile", "Beto"), ("showProfileManager", None), ("pm.load", "Ana"), ("onOpenProfile", "Ana")],
        )
        self.assertEqual(ler_pelo_http(conexao.porta, "/anki/profiles", {})[1]["open"], "Ana")

    def test_com_outro_perfil_aberto_o_envio_espera_e_o_anki_nao_e_tocado(self):
        from complemento.test_openai_de_mentira import OpenAIDeMentira

        anki = AnkiComColecaoDeMentira(DESCRICAO, perfis=("Ana", "Beto"), aberto="Beto")
        self.addCleanup(anki.encerrar)
        job = "11111111-2222-4333-8444-555555555555"
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira() as openai:
            os.makedirs(os.path.join(pasta, "user_files"))
            with open(os.path.join(pasta, "user_files", "perfil.json"), "w", encoding="utf-8") as arquivo:
                json.dump({"perfil": "Ana"}, arquivo)
            conexao = no_anki.ao_carregar(anki, pasta, porta=0, abridor=None, ao_sincronizar=lambda colecao: None, openai_base=openai.base)
            try:
                conexao.cofre.guardar("openai", "sk-proj-chave-do-anki-0000")
                ler_pelo_http(conexao.porta, "/jobs", {"jobId": job, "lang": "en", "deckName": "Inglês",
                                                       "entries": [{"phraseId": 1, "line": "keep going : They keep going"}]})
                fim = time.monotonic() + 10
                while "waiting" not in ler_pelo_http(conexao.porta, "/jobs/get", {"jobId": job})[1]["state"]:
                    self.assertLess(time.monotonic(), fim)
                    time.sleep(0.02)
                estado = ler_pelo_http(conexao.porta, "/jobs/get", {"jobId": job})[1]["state"]
            finally:
                conexao.parar()
        self.assertEqual(estado["waiting"], {"reason": "other_profile", "profile": "Beto", "marked": "Ana"})
        self.assertEqual((anki.col.notas_gravadas(), anki.passos), ([], []))


if __name__ == "__main__":
    unittest.main()
