import os
import struct
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import item_de_login

TEM_LISTA_DO_ALVO = 0x01
INICIO_DA_LISTA = 0x4C

LISTAS_DO_ALVO = {
    "o arquivo direto na unidade": (
        "C:\\anki.exe",
        "470014001f50e04fd020ea3a6910a2d808002b30309d19002f433a5c00000000000000000000000000000000000000"
        "1800320000000000210000002000616e6b692e65786500000000",
    ),
    "pastas de nome de tamanho par e ímpar": (
        "C:\\Anki\\abc\\anki.exe",
        "6d0014001f50e04fd020ea3a6910a2d808002b30309d19002f433a5c00000000000000000000000000000000000000"
        "1400310000000000210000001000416e6b6900001200310000000000210000001000616263001800320000000000210000002000616e6b692e65786500000000",
    ),
    "pasta e arquivo com acento, que vão em Unicode": (
        "C:\\Users\\João\\ánki.exe",
        "7b0014001f50e04fd020ea3a6910a2d808002b30309d19002f433a5c00000000000000000000000000000000000000"
        "140031000000000021000000100055736572730018003500000000002100000010004a006f00e3006f0000002000360000000000210000002000"
        "e1006e006b0069002e0065007800650000000000",
    ),
    "só a unidade": (
        "D:\\",
        "2f0014001f50e04fd020ea3a6910a2d808002b30309d19002f443a5c000000000000000000000000000000000000000000",
    ),
}
SEM_UNIDADE = {
    "caminho de rede": "\\\\servidor\\pasta\\anki.exe",
    "caminho sem unidade": "anki.exe",
    "unidade sem dois pontos": "CD\\anki.exe",
    "unidade com mais de uma letra": "CD:\\anki.exe",
}


class ListaDoAlvo(unittest.TestCase):
    def test_cada_forma_de_caminho_gera_a_lista_de_sempre(self):
        for nome, (alvo, esperada) in LISTAS_DO_ALVO.items():
            with self.subTest(nome):
                self.assertEqual(item_de_login._lista_do_alvo(alvo), bytes.fromhex(esperada))

    def test_o_que_nao_comeca_por_uma_unidade_fica_sem_lista(self):
        for nome, alvo in SEM_UNIDADE.items():
            with self.subTest(nome):
                self.assertEqual(item_de_login._lista_do_alvo(alvo), b"")

    def test_o_atalho_leva_a_lista_logo_depois_do_cabecalho_e_avisa_nas_flags(self):
        for nome, (alvo, esperada) in LISTAS_DO_ALVO.items():
            with self.subTest(nome):
                atalho = item_de_login._atalho_do_windows(alvo)
                flags, = struct.unpack_from("<I", atalho, 20)
                lista = bytes.fromhex(esperada)
                self.assertTrue(flags & TEM_LISTA_DO_ALVO)
                self.assertEqual(atalho[INICIO_DA_LISTA : INICIO_DA_LISTA + len(lista)], lista)

    def test_o_atalho_sem_lista_nao_avisa_nas_flags_e_vai_direto_ao_link_info(self):
        for nome, alvo in SEM_UNIDADE.items():
            with self.subTest(nome):
                atalho = item_de_login._atalho_do_windows(alvo)
                flags, = struct.unpack_from("<I", atalho, 20)
                self.assertFalse(flags & TEM_LISTA_DO_ALVO)
                tamanho_do_link_info, tamanho_do_cabecalho = struct.unpack_from("<II", atalho, INICIO_DA_LISTA)
                self.assertEqual(tamanho_do_cabecalho, 0x24)
                self.assertGreater(tamanho_do_link_info, tamanho_do_cabecalho)


if __name__ == "__main__":
    unittest.main()
