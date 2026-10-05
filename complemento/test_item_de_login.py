"""O item de login de “Abrir o Anki com o computador”: escrito e apagado numa pasta temporária, por sistema.

    python3.9 complemento/test_item_de_login.py

O que o Mac e o Windows fazem com o item (abrir o Anki no login) só o dono vê, no ensaio dele;
aqui se confere o que fica no disco: o arquivo certo, no lugar certo, com o conteúdo certo.
"""

import ntpath
import os
import plistlib
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import item_de_login  # noqa: E402

ANKI_DO_MAC = ["/usr/bin/open", "/Applications/Anki.app"]
ANKI_DO_WINDOWS = r"C:\Users\Maria\AppData\Local\Programs\Anki\anki.exe"


def ler_atalho(conteudo):
    """O alvo e a pasta de trabalho de um `.lnk` (MS-SHLLINK), lidos como o Windows os lê."""
    tamanho_do_cabecalho, = struct.unpack_from("<I", conteudo, 0)
    clsid = conteudo[4:20]
    flags, = struct.unpack_from("<I", conteudo, 20)
    assert tamanho_do_cabecalho == 0x4C
    assert clsid == bytes.fromhex("0114020000000000c000000000000046")
    assert flags & 0x02, "sem LinkInfo o Windows não acha o alvo"
    posicao = 0x4C
    if flags & 0x01:  # LinkTargetIDList
        tamanho, = struct.unpack_from("<H", conteudo, posicao)
        posicao += 2 + tamanho
    inicio_do_link_info = posicao
    (tamanho_do_link_info, tamanho_do_cabecalho_do_link_info, _, _, base_ansi, _, _, base_unicode, _) = struct.unpack_from(
        "<9I", conteudo, inicio_do_link_info
    )
    assert tamanho_do_cabecalho_do_link_info >= 0x24
    fim_ansi = conteudo.index(b"\x00", inicio_do_link_info + base_ansi)
    alvo_ansi = conteudo[inicio_do_link_info + base_ansi : fim_ansi].decode("cp1252")
    inicio_unicode = inicio_do_link_info + base_unicode
    fim_unicode = inicio_unicode
    while conteudo[fim_unicode : fim_unicode + 2] != b"\x00\x00":
        fim_unicode += 2
    alvo = conteudo[inicio_unicode:fim_unicode].decode("utf-16-le")
    posicao = inicio_do_link_info + tamanho_do_link_info
    textos = {}
    for bit, nome in ((0x04, "nome"), (0x08, "relativo"), (0x10, "pasta"), (0x20, "argumentos"), (0x40, "icone")):
        if flags & bit:
            quantos, = struct.unpack_from("<H", conteudo, posicao)
            textos[nome] = conteudo[posicao + 2 : posicao + 2 + 2 * quantos].decode("utf-16-le")
            posicao += 2 + 2 * quantos
    assert conteudo[posicao:] == b"\x00\x00\x00\x00", "o atalho termina com o bloco final"
    return alvo, alvo_ansi, textos


class NoMac(unittest.TestCase):
    def item(self, pasta):
        return item_de_login.ItemDeLogin(sistema="mac", pasta=pasta, comando=ANKI_DO_MAC)

    def test_ligar_escreve_o_launchagent_que_abre_o_anki_no_login(self):
        with tempfile.TemporaryDirectory() as pasta:
            self.item(pasta).ligar()
            escritos = os.listdir(pasta)
            with open(os.path.join(pasta, escritos[0]), "rb") as arquivo:
                plist = plistlib.load(arquivo)
        self.assertEqual(escritos, ["com.perpetualminer.abrir-o-anki.plist"])
        self.assertEqual(plist, {
            "Label": "com.perpetualminer.abrir-o-anki",
            "ProgramArguments": ANKI_DO_MAC,
            "RunAtLoad": True,
        })

    def test_desligar_apaga_o_item_e_nao_deixa_nada_na_pasta(self):
        with tempfile.TemporaryDirectory() as pasta:
            item = self.item(pasta)
            item.ligar()
            item.desligar()
            restou = os.listdir(pasta)
        self.assertEqual(restou, [])

    def test_ligado_diz_se_o_item_esta_na_pasta(self):
        with tempfile.TemporaryDirectory() as pasta:
            item = self.item(pasta)
            antes = item.ligado()
            item.ligar()
            ligado = item.ligado()
            item.desligar()
            depois = item.ligado()
        self.assertEqual((antes, ligado, depois), (False, True, False))

    def test_ligar_de_novo_troca_o_item_sem_duplicar(self):
        with tempfile.TemporaryDirectory() as pasta:
            item_de_login.ItemDeLogin(sistema="mac", pasta=pasta, comando=["/usr/bin/open", "-a", "Anki"]).ligar()
            self.item(pasta).ligar()
            escritos = os.listdir(pasta)
            with open(os.path.join(pasta, escritos[0]), "rb") as arquivo:
                comando = plistlib.load(arquivo)["ProgramArguments"]
        self.assertEqual((len(escritos), comando), (1, ANKI_DO_MAC))

    def test_ligar_cria_a_pasta_dos_launchagents_que_um_mac_novo_ainda_nao_tem(self):
        with tempfile.TemporaryDirectory() as raiz:
            pasta = os.path.join(raiz, "Library", "LaunchAgents")
            item = self.item(pasta)
            item.ligar()
            ligado = item.ligado()
        self.assertTrue(ligado)

    def test_desligar_sem_item_nao_falha(self):
        with tempfile.TemporaryDirectory() as pasta:
            self.item(pasta).desligar()

    def test_nao_apaga_o_que_outro_programa_deixou_na_pasta(self):
        with tempfile.TemporaryDirectory() as pasta:
            alheio = os.path.join(pasta, "com.outro.programa.plist")
            with open(alheio, "wb") as arquivo:
                arquivo.write(b"x")
            item = self.item(pasta)
            item.ligar()
            item.desligar()
            restou = os.listdir(pasta)
        self.assertEqual(restou, ["com.outro.programa.plist"])


class NoWindows(unittest.TestCase):
    def item(self, pasta, comando=ANKI_DO_WINDOWS):
        return item_de_login.ItemDeLogin(sistema="windows", pasta=pasta, comando=comando)

    def test_ligar_escreve_um_atalho_na_pasta_inicializar_que_aponta_para_o_anki(self):
        with tempfile.TemporaryDirectory() as pasta:
            self.item(pasta).ligar()
            escritos = os.listdir(pasta)
            with open(os.path.join(pasta, escritos[0]), "rb") as arquivo:
                alvo, alvo_ansi, textos = ler_atalho(arquivo.read())
        self.assertEqual(escritos, ["Anki (PerpetualMiner).lnk"])
        self.assertEqual(alvo, ANKI_DO_WINDOWS)
        self.assertEqual(alvo_ansi, ANKI_DO_WINDOWS)
        self.assertEqual(textos, {"pasta": r"C:\Users\Maria\AppData\Local\Programs\Anki"})

    def test_o_alvo_com_acento_chega_inteiro_pelo_texto_unicode_do_atalho(self):
        alvo_com_acento = r"C:\Users\João\AppData\Local\Programs\Anki\anki.exe"
        with tempfile.TemporaryDirectory() as pasta:
            self.item(pasta, alvo_com_acento).ligar()
            with open(os.path.join(pasta, os.listdir(pasta)[0]), "rb") as arquivo:
                alvo, _, textos = ler_atalho(arquivo.read())
        self.assertEqual(alvo, alvo_com_acento)
        self.assertEqual(textos["pasta"], r"C:\Users\João\AppData\Local\Programs\Anki")

    def test_desligar_apaga_o_atalho_e_nao_deixa_nada_na_pasta(self):
        with tempfile.TemporaryDirectory() as pasta:
            item = self.item(pasta)
            item.ligar()
            ligado = item.ligado()
            item.desligar()
            restou = os.listdir(pasta)
            depois = item.ligado()
        self.assertEqual((ligado, restou, depois), (True, [], False))

    def test_nao_apaga_o_atalho_do_anki_que_a_pessoa_mesma_pos_na_pasta(self):
        with tempfile.TemporaryDirectory() as pasta:
            da_pessoa = os.path.join(pasta, "Anki.lnk")
            with open(da_pessoa, "wb") as arquivo:
                arquivo.write(b"x")
            item = self.item(pasta)
            item.ligar()
            item.desligar()
            restou = os.listdir(pasta)
        self.assertEqual(restou, ["Anki.lnk"])


class SemComoAbrirOAnki(unittest.TestCase):
    def test_ligar_sem_saber_onde_o_anki_esta_nao_escreve_nada_e_diz_o_motivo(self):
        with tempfile.TemporaryDirectory() as pasta:
            item = item_de_login.ItemDeLogin(sistema="windows", pasta=pasta, comando=None)
            with self.assertRaises(item_de_login.AnkiNaoEncontrado):
                item.ligar()
            restou = os.listdir(pasta)
        self.assertEqual(restou, [])

    def test_ligar_numa_pasta_que_nao_aceita_escrita_levanta_o_erro_do_sistema(self):
        with tempfile.TemporaryDirectory() as pasta:
            ocupada = os.path.join(pasta, "arquivo")
            with open(ocupada, "wb") as arquivo:
                arquivo.write(b"x")
            item = item_de_login.ItemDeLogin(sistema="mac", pasta=os.path.join(ocupada, "dentro"), comando=ANKI_DO_MAC)
            with self.assertRaises(OSError):
                item.ligar()


class DesteComputador(unittest.TestCase):
    """Onde cada sistema guarda o item, e como o Anki é aberto, pelo ambiente em que o complemento roda."""

    def test_no_mac_o_item_mora_nos_launchagents_do_usuario(self):
        item = item_de_login.deste_computador(plataforma="darwin", ambiente={"HOME": "/Users/maria"}, executavel="/x/python")
        self.assertEqual((item.sistema, item.pasta), ("mac", "/Users/maria/Library/LaunchAgents"))

    def test_no_windows_o_item_mora_na_pasta_inicializar_do_usuario(self):
        item = item_de_login.deste_computador(
            plataforma="win32", ambiente={"APPDATA": r"C:\Users\Maria\AppData\Roaming"}, executavel="x", existe=lambda _: False
        )
        self.assertEqual(item.sistema, "windows")
        self.assertEqual(
            item.pasta,
            ntpath.join(r"C:\Users\Maria\AppData\Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup"),
        )

    def test_em_outro_sistema_nao_ha_item_de_login(self):
        self.assertIsNone(item_de_login.deste_computador(plataforma="linux", ambiente={}, executavel="/usr/bin/python3"))

    def test_no_mac_abre_o_aplicativo_de_onde_o_anki_roda(self):
        item = item_de_login.deste_computador(
            plataforma="darwin", ambiente={"HOME": "/Users/maria"}, executavel="/Applications/Anki.app/Contents/MacOS/anki"
        )
        self.assertEqual(item.comando, ["/usr/bin/open", "/Applications/Anki.app"])

    def test_no_mac_com_o_abridor_novo_do_anki_abre_o_aplicativo_dele(self):
        item = item_de_login.deste_computador(
            plataforma="darwin",
            ambiente={"HOME": "/Users/maria", "ANKI_LAUNCHER": "/Applications/Anki.app/Contents/MacOS/launcher"},
            executavel="/Users/maria/Library/Application Support/AnkiProgramFiles/.venv/bin/python",
        )
        self.assertEqual(item.comando, ["/usr/bin/open", "/Applications/Anki.app"])

    def test_no_mac_sem_saber_onde_ele_roda_pede_ao_sistema_o_aplicativo_chamado_anki(self):
        item = item_de_login.deste_computador(plataforma="darwin", ambiente={"HOME": "/Users/maria"}, executavel="/usr/bin/python3")
        self.assertEqual(item.comando, ["/usr/bin/open", "-a", "Anki"])

    def test_no_windows_abre_o_anki_pelo_abridor_que_o_anki_mesmo_diz(self):
        item = item_de_login.deste_computador(
            plataforma="win32",
            ambiente={"APPDATA": "C:\\a", "ANKI_LAUNCHER": ANKI_DO_WINDOWS},
            executavel=r"C:\Users\Maria\AppData\Local\AnkiProgramFiles\.venv\Scripts\python.exe",
        )
        self.assertEqual(item.comando, ANKI_DO_WINDOWS)

    def test_no_windows_abre_o_programa_do_anki_quando_e_ele_que_roda_o_complemento(self):
        item = item_de_login.deste_computador(
            plataforma="win32", ambiente={"APPDATA": "C:\\a"}, executavel=r"C:\Program Files\Anki\anki.exe"
        )
        self.assertEqual(item.comando, r"C:\Program Files\Anki\anki.exe")

    def test_no_windows_procura_o_anki_onde_o_instalador_o_poe(self):
        instalado = r"C:\Users\Maria\AppData\Local\Programs\Anki\anki.exe"
        item = item_de_login.deste_computador(
            plataforma="win32",
            ambiente={"APPDATA": "C:\\a", "LOCALAPPDATA": r"C:\Users\Maria\AppData\Local"},
            executavel=r"C:\Python39\python.exe",
            existe=lambda caminho: caminho == instalado,
        )
        self.assertEqual(item.comando, instalado)

    def test_no_windows_sem_achar_o_anki_o_item_nao_sabe_como_abri_lo(self):
        item = item_de_login.deste_computador(
            plataforma="win32", ambiente={"APPDATA": "C:\\a"}, executavel=r"C:\Python39\python.exe", existe=lambda _: False
        )
        self.assertIsNone(item.comando)


if __name__ == "__main__":
    unittest.main()
