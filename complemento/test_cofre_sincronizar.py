import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.chaves import Cofre, LegadoNaoVinculado, OutraContaNaoEnviada

CONTA = 'A'

AQUI = {
    'vazio': None,
    'legado_sem_conta': {'chave': 'K1', 'versao': 1},
    'legado_sem_conta_com_hora': {'chave': 'K1', 'versao': 1, 'em': 100},
    'A_pendente': {'chave': 'K1', 'conta': 'A', 'versao': 2, 'em': 100, 'naoEnviada': True},
    'A_enviada': {'chave': 'K1', 'conta': 'A', 'versao': 2, 'em': 100, 'naoEnviada': False},
    'A_apagada': {'chave': '', 'conta': 'A', 'versao': 3, 'em': 100, 'naoEnviada': False},
    'B_pendente': {'chave': 'K1', 'conta': 'B', 'versao': 2, 'em': 100, 'naoEnviada': True},
    'B_enviada': {'chave': 'K1', 'conta': 'B', 'versao': 2, 'em': 100, 'naoEnviada': False},
    'B_apagada': {'chave': '', 'conta': 'B', 'versao': 3, 'em': 100, 'naoEnviada': False},
    'A_sem_marca_de_envio': {'chave': 'K1', 'conta': 'A', 'versao': 2, 'em': 100},
}
NUVEM = {
    'nada': None,
    'mesma': {'chave': 'K1', 'em': 100},
    'mais_nova': {'chave': 'K2', 'em': 200},
    'mais_velha': {'chave': 'K2', 'em': 50},
    'apagada_mais_nova': {'chave': '', 'em': 200},
    'apagada_mais_velha': {'chave': '', 'em': 50},
    'empate_outra': {'chave': 'K2', 'em': 100},
    'apagada_empate': {'chave': '', 'em': 100},
}
LEGADO = 'LegadoNaoVinculado'
OUTRA = 'OutraContaNaoEnviada'

CASOS = [
    ('vazio', 'nada', {'resultado': None, 'versao': 0}, [], (None, None, None, None, None)),
    ('vazio', 'mesma', {'resultado': 'chegou', 'versao': 1}, [], ('K1', 'A', 1, 100, False)),
    ('vazio', 'mais_nova', {'resultado': 'chegou', 'versao': 1}, [], ('K2', 'A', 1, 200, False)),
    ('vazio', 'mais_velha', {'resultado': 'chegou', 'versao': 1}, [], ('K2', 'A', 1, 50, False)),
    ('vazio', 'apagada_mais_nova', {'resultado': None, 'versao': 1}, [], ('', 'A', 1, 200, False)),
    ('vazio', 'apagada_mais_velha', {'resultado': None, 'versao': 1}, [], ('', 'A', 1, 50, False)),
    ('vazio', 'empate_outra', {'resultado': 'chegou', 'versao': 1}, [], ('K2', 'A', 1, 100, False)),
    ('vazio', 'apagada_empate', {'resultado': None, 'versao': 1}, [], ('', 'A', 1, 100, False)),
    ('legado_sem_conta', 'nada', LEGADO, [], ('K1', None, 1, None, None)),
    ('legado_sem_conta', 'mesma', LEGADO, [], ('K1', None, 1, None, None)),
    ('legado_sem_conta', 'mais_nova', LEGADO, [], ('K1', None, 1, None, None)),
    ('legado_sem_conta', 'mais_velha', LEGADO, [], ('K1', None, 1, None, None)),
    ('legado_sem_conta', 'apagada_mais_nova', LEGADO, [], ('K1', None, 1, None, None)),
    ('legado_sem_conta', 'apagada_mais_velha', LEGADO, [], ('K1', None, 1, None, None)),
    ('legado_sem_conta', 'empate_outra', LEGADO, [], ('K1', None, 1, None, None)),
    ('legado_sem_conta', 'apagada_empate', LEGADO, [], ('K1', None, 1, None, None)),
    ('legado_sem_conta_com_hora', 'nada', LEGADO, [], ('K1', None, 1, 100, None)),
    ('legado_sem_conta_com_hora', 'mesma', LEGADO, [], ('K1', None, 1, 100, None)),
    ('legado_sem_conta_com_hora', 'mais_nova', LEGADO, [], ('K1', None, 1, 100, None)),
    ('legado_sem_conta_com_hora', 'mais_velha', LEGADO, [], ('K1', None, 1, 100, None)),
    ('legado_sem_conta_com_hora', 'apagada_mais_nova', LEGADO, [], ('K1', None, 1, 100, None)),
    ('legado_sem_conta_com_hora', 'apagada_mais_velha', LEGADO, [], ('K1', None, 1, 100, None)),
    ('legado_sem_conta_com_hora', 'empate_outra', LEGADO, [], ('K1', None, 1, 100, None)),
    ('legado_sem_conta_com_hora', 'apagada_empate', LEGADO, [], ('K1', None, 1, 100, None)),
    ('A_pendente', 'nada', {'resultado': 'subiu', 'versao': 2}, [('K1', 100)], ('K1', 'A', 2, 100, False)),
    ('A_pendente', 'mesma', {'resultado': None, 'versao': 2}, [], ('K1', 'A', 2, 100, False)),
    ('A_pendente', 'mais_nova', {'resultado': 'chegou', 'versao': 3}, [], ('K2', 'A', 3, 200, False)),
    ('A_pendente', 'mais_velha', {'resultado': 'subiu', 'versao': 2}, [('K1', 100)], ('K1', 'A', 2, 100, False)),
    ('A_pendente', 'apagada_mais_nova', {'resultado': 'apagada', 'versao': 3}, [], ('', 'A', 3, 200, False)),
    ('A_pendente', 'apagada_mais_velha', {'resultado': 'subiu', 'versao': 2}, [('K1', 100)], ('K1', 'A', 2, 100, False)),
    ('A_pendente', 'empate_outra', {'resultado': 'subiu', 'versao': 2}, [('K1', 100)], ('K1', 'A', 2, 100, False)),
    ('A_pendente', 'apagada_empate', {'resultado': 'subiu', 'versao': 2}, [('K1', 100)], ('K1', 'A', 2, 100, False)),
    ('A_enviada', 'nada', {'resultado': 'subiu', 'versao': 2}, [('K1', 100)], ('K1', 'A', 2, 100, False)),
    ('A_enviada', 'mesma', {'resultado': None, 'versao': 2}, [], ('K1', 'A', 2, 100, False)),
    ('A_enviada', 'mais_nova', {'resultado': 'chegou', 'versao': 3}, [], ('K2', 'A', 3, 200, False)),
    ('A_enviada', 'mais_velha', {'resultado': 'subiu', 'versao': 2}, [('K1', 100)], ('K1', 'A', 2, 100, False)),
    ('A_enviada', 'apagada_mais_nova', {'resultado': 'apagada', 'versao': 3}, [], ('', 'A', 3, 200, False)),
    ('A_enviada', 'apagada_mais_velha', {'resultado': 'subiu', 'versao': 2}, [('K1', 100)], ('K1', 'A', 2, 100, False)),
    ('A_enviada', 'empate_outra', {'resultado': 'chegou', 'versao': 3}, [], ('K2', 'A', 3, 100, False)),
    ('A_enviada', 'apagada_empate', {'resultado': 'apagada', 'versao': 3}, [], ('', 'A', 3, 100, False)),
    ('A_apagada', 'nada', {'resultado': 'subiu', 'versao': 3}, [('', 100)], ('', 'A', 3, 100, False)),
    ('A_apagada', 'mesma', {'resultado': 'chegou', 'versao': 4}, [], ('K1', 'A', 4, 100, False)),
    ('A_apagada', 'mais_nova', {'resultado': 'chegou', 'versao': 4}, [], ('K2', 'A', 4, 200, False)),
    ('A_apagada', 'mais_velha', {'resultado': 'subiu', 'versao': 3}, [('', 100)], ('', 'A', 3, 100, False)),
    ('A_apagada', 'apagada_mais_nova', {'resultado': 'apagada', 'versao': 4}, [], ('', 'A', 4, 200, False)),
    ('A_apagada', 'apagada_mais_velha', {'resultado': 'subiu', 'versao': 3}, [('', 100)], ('', 'A', 3, 100, False)),
    ('A_apagada', 'empate_outra', {'resultado': 'chegou', 'versao': 4}, [], ('K2', 'A', 4, 100, False)),
    ('A_apagada', 'apagada_empate', {'resultado': None, 'versao': 3}, [], ('', 'A', 3, 100, False)),
    ('B_pendente', 'nada', OUTRA, [], ('K1', 'B', 2, 100, True)),
    ('B_pendente', 'mesma', OUTRA, [], ('K1', 'B', 2, 100, True)),
    ('B_pendente', 'mais_nova', OUTRA, [], ('K1', 'B', 2, 100, True)),
    ('B_pendente', 'mais_velha', OUTRA, [], ('K1', 'B', 2, 100, True)),
    ('B_pendente', 'apagada_mais_nova', OUTRA, [], ('K1', 'B', 2, 100, True)),
    ('B_pendente', 'apagada_mais_velha', OUTRA, [], ('K1', 'B', 2, 100, True)),
    ('B_pendente', 'empate_outra', OUTRA, [], ('K1', 'B', 2, 100, True)),
    ('B_pendente', 'apagada_empate', OUTRA, [], ('K1', 'B', 2, 100, True)),
    ('B_enviada', 'nada', {'resultado': 'apagada', 'versao': 3}, [], ('', 'A', 3, 0, False)),
    ('B_enviada', 'mesma', {'resultado': 'chegou', 'versao': 3}, [], ('K1', 'A', 3, 100, False)),
    ('B_enviada', 'mais_nova', {'resultado': 'chegou', 'versao': 3}, [], ('K2', 'A', 3, 200, False)),
    ('B_enviada', 'mais_velha', {'resultado': 'chegou', 'versao': 3}, [], ('K2', 'A', 3, 50, False)),
    ('B_enviada', 'apagada_mais_nova', {'resultado': 'apagada', 'versao': 3}, [], ('', 'A', 3, 200, False)),
    ('B_enviada', 'apagada_mais_velha', {'resultado': 'apagada', 'versao': 3}, [], ('', 'A', 3, 50, False)),
    ('B_enviada', 'empate_outra', {'resultado': 'chegou', 'versao': 3}, [], ('K2', 'A', 3, 100, False)),
    ('B_enviada', 'apagada_empate', {'resultado': 'apagada', 'versao': 3}, [], ('', 'A', 3, 100, False)),
    ('B_apagada', 'nada', {'resultado': None, 'versao': 4}, [], ('', 'A', 4, 0, False)),
    ('B_apagada', 'mesma', {'resultado': 'chegou', 'versao': 4}, [], ('K1', 'A', 4, 100, False)),
    ('B_apagada', 'mais_nova', {'resultado': 'chegou', 'versao': 4}, [], ('K2', 'A', 4, 200, False)),
    ('B_apagada', 'mais_velha', {'resultado': 'chegou', 'versao': 4}, [], ('K2', 'A', 4, 50, False)),
    ('B_apagada', 'apagada_mais_nova', {'resultado': None, 'versao': 4}, [], ('', 'A', 4, 200, False)),
    ('B_apagada', 'apagada_mais_velha', {'resultado': None, 'versao': 4}, [], ('', 'A', 4, 50, False)),
    ('B_apagada', 'empate_outra', {'resultado': 'chegou', 'versao': 4}, [], ('K2', 'A', 4, 100, False)),
    ('B_apagada', 'apagada_empate', {'resultado': None, 'versao': 4}, [], ('', 'A', 4, 100, False)),
    ('A_sem_marca_de_envio', 'nada', {'resultado': 'subiu', 'versao': 2}, [('K1', 100)], ('K1', 'A', 2, 100, None)),
    ('A_sem_marca_de_envio', 'mesma', {'resultado': None, 'versao': 2}, [], ('K1', 'A', 2, 100, None)),
    ('A_sem_marca_de_envio', 'mais_nova', {'resultado': 'chegou', 'versao': 3}, [], ('K2', 'A', 3, 200, False)),
    ('A_sem_marca_de_envio', 'mais_velha', {'resultado': 'subiu', 'versao': 2}, [('K1', 100)], ('K1', 'A', 2, 100, None)),
    ('A_sem_marca_de_envio', 'apagada_mais_nova', {'resultado': 'apagada', 'versao': 3}, [], ('', 'A', 3, 200, False)),
    ('A_sem_marca_de_envio', 'apagada_mais_velha', {'resultado': 'subiu', 'versao': 2}, [('K1', 100)], ('K1', 'A', 2, 100, None)),
    ('A_sem_marca_de_envio', 'empate_outra', {'resultado': 'subiu', 'versao': 2}, [('K1', 100)], ('K1', 'A', 2, 100, None)),
    ('A_sem_marca_de_envio', 'apagada_empate', {'resultado': 'subiu', 'versao': 2}, [('K1', 100)], ('K1', 'A', 2, 100, None)),
]


class NuvemFalsa:
    def __init__(self, remota):
        self.remota = remota
        self.recebido = []

    def ler(self):
        return self.remota

    def gravar(self, chave, hora):
        self.recebido.append((chave, hora))


def cofre_com(pasta, documento):
    cofre = Cofre(pasta)
    if documento is not None:
        cofre._gravar('openai', dict(documento))
    return cofre


def no_cofre(cofre):
    d = cofre.documento('openai')
    return tuple(d.get(campo) for campo in ('chave', 'conta', 'versao', 'em', 'naoEnviada'))


class SincronizarACadaCaso(unittest.TestCase):
    def test_cada_estado_do_cofre_contra_cada_estado_da_nuvem(self):
        for aqui, nuvem, saida, recebido, depois in CASOS:
            with self.subTest(aqui=aqui, nuvem=nuvem), tempfile.TemporaryDirectory() as pasta:
                cofre = cofre_com(pasta, AQUI[aqui])
                versao = (AQUI[aqui] or {}).get('versao', 0)
                dona = NuvemFalsa(NUVEM[nuvem])
                if isinstance(saida, dict):
                    self.assertEqual(cofre.sincronizar('openai', CONTA, dona, versao), saida)
                else:
                    with self.assertRaises({LEGADO: LegadoNaoVinculado, OUTRA: OutraContaNaoEnviada}[saida]):
                        cofre.sincronizar('openai', CONTA, dona, versao)
                self.assertEqual(dona.recebido, recebido)
                self.assertEqual(no_cofre(cofre), depois)

    def test_revisao_velha_nao_mexe_no_cofre_nem_na_nuvem(self):
        with tempfile.TemporaryDirectory() as pasta:
            cofre = cofre_com(pasta, AQUI['A_pendente'])
            dona = NuvemFalsa({'chave': 'K2', 'em': 200})
            self.assertIsNone(cofre.sincronizar('openai', CONTA, dona, 1))
            self.assertEqual(dona.recebido, [])
            self.assertEqual(no_cofre(cofre), ('K1', 'A', 2, 100, True))


if __name__ == '__main__':
    unittest.main()
