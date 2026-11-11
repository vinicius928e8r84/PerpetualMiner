"""O `pareamento.json` no Windows (#192): lá, trocar (`os.replace`) um arquivo que outra thread tem aberto para leitura dá `PermissionError`; no Linux e no Mac
a troca passa. O teste faz o Linux se comportar como o Windows e põe uma leitura aberta no meio da gravação de um pareamento e de um Desconectar.

    python3.9 complemento/test_pareamento_no_windows.py
"""

import logging
import os
import sys
import tempfile
import threading
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import pareamento  # noqa: E402
from complemento.test_pareamento_de_mentira import CLIENTE, OUTRO_CLIENTE, SEGREDO, UM_CLIENTE_NOVO, semear  # noqa: E402

ESPERA_DA_GRAVACAO_S = 0.3


class JanelaDeMentira:
    def mostrar_codigo(self, codigo, validade_s, ao_cancelar):
        pass

    def fechar_codigo(self):
        pass

    def conectou(self):
        pass


class OWindowsDeMentira:
    """Os arquivos abertos para leitura em `pareamento.py`, e um `os.replace` que falha como no Windows quando há algum.

    Na primeira leitura aberta, `gravacao` roda numa thread e o teste espera um pouco por ela: quem grava tem a leitura aberta na frente dele."""

    def __init__(self, gravacao):
        self.gravacao = gravacao
        self.abertos = 0
        self.disparou = False
        self.erro_da_gravacao = None
        self._real_open = open
        self._real_replace = os.replace
        self._thread = None

    def open(self, caminho, *args, **kwargs):
        arquivo = self._real_open(caminho, *args, **kwargs)
        return _Leitura(arquivo, self)

    def replace(self, origem, destino):
        if self.abertos:
            raise PermissionError(13, "Acesso negado", destino)
        return self._real_replace(origem, destino)

    def disparar_a_gravacao(self):
        if self.disparou:
            return
        self.disparou = True

        def gravar():
            try:
                self.gravacao()
            except BaseException as erro:
                self.erro_da_gravacao = erro
        self._thread = threading.Thread(target=gravar)
        self._thread.start()
        self._thread.join(ESPERA_DA_GRAVACAO_S)

    def esperar(self):
        self._thread.join(5)


class _Leitura:
    def __init__(self, arquivo, mundo):
        self._arquivo, self._mundo = arquivo, mundo

    def __enter__(self):
        self._mundo.abertos += 1
        return self

    def __exit__(self, *erro):
        self._mundo.abertos -= 1
        self._arquivo.close()

    def read(self, *args):
        self._mundo.disparar_a_gravacao()
        return self._arquivo.read(*args)


def uma_conexao(pasta):
    arquivo = os.path.join(pasta, "pareamento.json")
    semear(arquivo)
    return pareamento.Pareamento(arquivo, logging.getLogger("teste"), na_tela=JanelaDeMentira(), sortear=lambda: "K7M4PX")


class AGravacaoComUmaLeituraAberta(unittest.TestCase):
    def _com_uma_leitura_aberta(self, gravacao, lendo):
        mundo = OWindowsDeMentira(gravacao)
        with mock.patch.object(pareamento, "open", mundo.open, create=True), mock.patch.object(os, "replace", mundo.replace):
            lendo()
            mundo.esperar()
        return mundo

    def test_o_pareamento_que_cai_com_uma_leitura_aberta_espera_e_grava(self):
        with tempfile.TemporaryDirectory() as pasta:
            p = uma_conexao(pasta)
            p.comecar()
            respostas = []
            mundo = self._com_uma_leitura_aberta(lambda: respostas.append(p.concluir("K7M-4PX", UM_CLIENTE_NOVO, "Chrome")), p.quantos)
            guardados = [linha["cliente"] for linha in p._ler()]
        self.assertIsNone(mundo.erro_da_gravacao)
        self.assertEqual([resposta[0] for resposta in respostas], [200])
        self.assertEqual(guardados, [CLIENTE, UM_CLIENTE_NOVO])

    def test_o_desconectar_que_cai_com_uma_leitura_aberta_espera_e_grava(self):
        with tempfile.TemporaryDirectory() as pasta:
            p = uma_conexao(pasta)
            saiu = []
            mundo = self._com_uma_leitura_aberta(lambda: saiu.append(p.desconectar()), p.quantos)
            pareados, revogados = [linha["cliente"] for linha in p._ler()], [linha["cliente"] for linha in p._ler("revogados")]
        self.assertIsNone(mundo.erro_da_gravacao)
        self.assertEqual((saiu, pareados, revogados), ([1], [], [CLIENTE]))

    def test_a_leitura_que_cai_no_meio_da_troca_espera_e_ve_o_arquivo_novo(self):
        with tempfile.TemporaryDirectory() as pasta:
            p = uma_conexao(pasta)
            semear(os.path.join(pasta, "pareamento.json"), ((CLIENTE, SEGREDO), (OUTRO_CLIENTE, SEGREDO)))
            visto = []
            troca = threading.Event()
            real = os.replace

            def replace_demorado(origem, destino):
                troca.set()
                threading.Event().wait(ESPERA_DA_GRAVACAO_S)   # a troca leva um tempo; quem lê no meio dela espera e vê o arquivo novo
                return real(origem, destino)
            gravando = threading.Thread(target=p.desconectar)
            with mock.patch.object(os, "replace", replace_demorado):
                gravando.start()
                troca.wait(5)
                visto.append(p.quantos())
                gravando.join(5)
        self.assertEqual(visto, [0])


if __name__ == "__main__":
    unittest.main()
