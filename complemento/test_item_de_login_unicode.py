import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import item_de_login
from complemento.test_item_de_login import ANKI_DO_WINDOWS, ler_lista_do_alvo


class NoWindowsComNomeForaDoAscii(unittest.TestCase):
    def item(self, pasta, comando=ANKI_DO_WINDOWS):
        return item_de_login.ItemDeLogin(sistema="windows", pasta=pasta, comando=comando)

    def test_o_nome_fora_do_ascii_vai_em_unicode_na_lista_do_alvo_e_os_outros_ficam_como_eram(self):
        alvo = "C:\\Users\\João\\Ωμέγα\\日本語\\Ana\U0001F600\\Anki\\anki.exe"
        with tempfile.TemporaryDirectory() as pasta:
            self.item(pasta, alvo).ligar()
            with open(os.path.join(pasta, "Anki (PerpetualMiner).lnk"), "rb") as arquivo:
                itens = ler_lista_do_alvo(arquivo.read())[2:]
        tipos = [tipo for tipo, _ in itens]
        nomes = [corpo[11:].decode("utf-16-le").rstrip("\x00") if tipo & 0x04 else corpo[11:].rstrip(b"\x00").decode("ascii") for tipo, corpo in itens]
        self.assertEqual(tipos, [0x31, 0x35, 0x35, 0x35, 0x35, 0x31, 0x32])
        self.assertEqual(nomes, ["Users", "João", "Ωμέγα", "日本語", "Ana\U0001F600", "Anki", "anki.exe"])

    def test_o_arquivo_de_nome_fora_do_ascii_e_um_item_de_arquivo_em_unicode(self):
        with tempfile.TemporaryDirectory() as pasta:
            self.item(pasta, "C:\\Programas\\Anki\\ánki.exe").ligar()
            with open(os.path.join(pasta, "Anki (PerpetualMiner).lnk"), "rb") as arquivo:
                tipo, corpo = ler_lista_do_alvo(arquivo.read())[-1]
        self.assertEqual((tipo, corpo[11:].decode("utf-16-le")), (0x36, "ánki.exe\x00"))


if __name__ == "__main__":
    unittest.main()
