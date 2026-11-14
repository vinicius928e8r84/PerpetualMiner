"""O item de login de “Abrir o Anki com o computador” ao abrir a Conexão (#401): o que difere do que ela escreveria agora é reescrito.
Visto de fora: o `inicio.iniciar` real com o atalho do Windows já na pasta Inicializar.

    python3.9 complemento/test_inicio_item_de_login.py
"""

import os
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import item_de_login  # noqa: E402
from complemento.test_inicio import parar, saude  # noqa: E402
from complemento.test_item_de_login import ANKI_DO_WINDOWS, atalho_das_conexoes_0_4_21_a_0_4_24  # noqa: E402
from complemento.test_pareamento_de_mentira import iniciar_pareado  # noqa: E402


class AoAbrirAConexao(unittest.TestCase):
    def iniciar_com_o_atalho(self, pasta, conteudo, comando=ANKI_DO_WINDOWS):
        """Inicia a Conexão com o atalho de login `conteudo` já na pasta Inicializar (`None`: sem atalho); devolve o que ficou e o log."""
        inicializar = os.path.join(pasta, "Startup")
        item = item_de_login.ItemDeLogin(sistema="windows", pasta=inicializar, comando=comando)
        if conteudo is not None:
            os.makedirs(inicializar)
            with open(item.caminho, "wb") as arquivo:
                arquivo.write(conteudo)
        conexao = iniciar_pareado(pasta, lambda: None, porta=0, item_de_login=item, abridor=None)
        try:
            status, _ = saude(conexao.porta)
        finally:
            parar(conexao)
        guardado = None
        if os.path.exists(item.caminho):
            with open(item.caminho, "rb") as arquivo:
                guardado = arquivo.read()
        with open(os.path.join(pasta, "user_files", "logs", "complemento.log"), encoding="utf-8") as arquivo:
            registrado = arquivo.read()
        return status, guardado, registrado, os.listdir(inicializar) if os.path.exists(inicializar) else []

    def test_ao_abrir_a_conexao_troca_o_atalho_quebrado_das_conexoes_antigas_pelo_correto(self):
        with tempfile.TemporaryDirectory() as pasta:
            status, guardado, _, _ = self.iniciar_com_o_atalho(pasta, atalho_das_conexoes_0_4_21_a_0_4_24(ANKI_DO_WINDOWS))
        self.assertEqual((status, guardado), (200, item_de_login._atalho_do_windows(ANKI_DO_WINDOWS)))

    def test_ao_abrir_a_conexao_nao_regrava_o_atalho_que_ja_esta_correto(self):
        correto = item_de_login._atalho_do_windows(ANKI_DO_WINDOWS)
        with tempfile.TemporaryDirectory() as pasta:
            with patch.object(item_de_login.ItemDeLogin, "_gravar", side_effect=OSError("regravou")):
                status, guardado, registrado, _ = self.iniciar_com_o_atalho(pasta, correto)
        self.assertEqual((status, guardado), (200, correto))
        self.assertNotIn("regravou", registrado)

    def test_ao_abrir_a_conexao_sem_atalho_nenhum_e_criado(self):
        with tempfile.TemporaryDirectory() as pasta:
            status, guardado, _, restou = self.iniciar_com_o_atalho(pasta, None)
        self.assertEqual((status, guardado, restou), (200, None, []))

    def test_uma_falha_ao_trocar_o_atalho_nao_derruba_a_conexao_e_vai_ao_log(self):
        antigo = atalho_das_conexoes_0_4_21_a_0_4_24(ANKI_DO_WINDOWS)
        with tempfile.TemporaryDirectory() as pasta:
            with patch("complemento.item_de_login.os.replace", side_effect=OSError("disco cheio")):
                status, guardado, registrado, restou = self.iniciar_com_o_atalho(pasta, antigo)
        self.assertEqual((status, guardado, restou), (200, antigo, ["Anki (PerpetualMiner).lnk"]))
        self.assertIn("O item de login não foi conferido: disco cheio", registrado)


if __name__ == "__main__":
    unittest.main()
