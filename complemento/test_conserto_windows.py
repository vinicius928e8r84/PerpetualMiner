"""O abridor que conserta sozinho (#152), o `.ps1` do Windows: só se confere por inspeção, e onde houver `pwsh`.

    python3.9 complemento/test_conserto_windows.py
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import abridor  # noqa: E402
from complemento.test_abridor import ANKI_DO_WINDOWS, RegistroDeMentira  # noqa: E402


class NoWindows(unittest.TestCase):
    """O `.ps1` do Windows só se confere por inspeção aqui; onde houver `pwsh` ele ainda roda o caso que não toca em nada."""

    def setUp(self):
        self._raiz = tempfile.TemporaryDirectory()
        self.pasta = os.path.join(self._raiz.name, "user_files", "abridor")
        self.complemento = r"C:\Users\Maria\AppData\Roaming\Anki2\addons21\perpetualminer"
        abridor.deste_computador(
            plataforma="win32", ambiente={"ANKI_LAUNCHER": ANKI_DO_WINDOWS}, executavel=r"C:\Anki\pythonw.exe",
            pasta=self.pasta, registro=RegistroDeMentira(), complemento=self.complemento,
        ).escrever("Usuário 1")
        with open(os.path.join(self.pasta, "abrir-o-anki.ps1"), "rb") as arquivo:
            self.ps1 = arquivo.read().decode("utf-8-sig")

    def tearDown(self):
        self._raiz.cleanup()

    def valor(self, variavel):
        for linha in self.ps1.splitlines():
            if linha.startswith("$%s = " % variavel):
                return linha[len("$%s = " % variavel):]
        self.fail("o .ps1 não tem $%s" % variavel)

    def test_o_ps1_leva_o_programa_a_pasta_do_complemento_e_a_espera(self):
        self.assertEqual(self.valor("programaDoAnki"), r"'C:\Anki\pythonw.exe'")
        self.assertEqual(self.valor("complemento"), "'%s'" % self.complemento)
        self.assertEqual(self.valor("espera"), "30")

    def test_o_ps1_so_fecha_os_processos_do_programa_que_o_complemento_anotou(self):
        self.assertIn("$_.Path -ieq $programaDoAnki", self.ps1)
        self.assertEqual(self.ps1.count("Stop-Process"), 1)
        self.assertIn("ProcessosDoAnki | Stop-Process -Force", self.ps1)
        self.assertNotIn("Get-Process -Name", self.ps1)
        self.assertNotIn("taskkill", self.ps1.lower())

    def test_o_ps1_fecha_pelo_caminho_normal_para_ligar_o_complemento_e_a_forca_so_depois_da_espera(self):
        self.assertIn("CloseMainWindow()", self.ps1)
        corpo = self.ps1[self.ps1.index("function Consertar"):]
        self.assertLess(corpo.index("Start-Sleep"), corpo.index("Stop-Process"))

    def test_o_ps1_guarda_o_meta_json_de_antes_e_troca_o_arquivo_de_uma_vez(self):
        self.assertIn("meta.json.antes", self.ps1)
        self.assertIn("Move-Item", self.ps1)

    @unittest.skipUnless(shutil.which("pwsh"), "o .ps1 só roda onde houver PowerShell (pwsh)")
    def test_o_ps1_responde_acao_desconhecida_a_uma_mensagem_que_nao_conhece(self):
        import struct
        corpo = b'{"acao":"fechar"}'
        saida = subprocess.run(
            ["pwsh", "-NoProfile", "-NonInteractive", "-File", os.path.join(self.pasta, "abrir-o-anki.ps1")],
            input=struct.pack("<I", len(corpo)) + corpo, stdout=subprocess.PIPE, timeout=60, check=True).stdout
        self.assertEqual(json.loads(saida[4:].decode("utf-8")), {"erro": "acao_desconhecida"})



if __name__ == "__main__":
    unittest.main()
