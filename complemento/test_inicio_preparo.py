"""O que a Conexão prepara na coleção ao carregar e a cada perfil que abre (#161): o tipo de nota de cada idioma e, numa instalação nova,
os Baralhos. Visto de fora: o `inicio.iniciar` real com a coleção em memória e o gancho de perfil que o Anki dá.

    python3.9 complemento/test_inicio_preparo.py
"""

import json
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import inicio  # noqa: E402
from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_contrato_da_criacao import SO_O_DEFAULT  # noqa: E402

TIPOS = ("PerpetualMiner Inglês", "PerpetualMiner Russo")


def iniciar(raiz, colecao, perfil="Usuário 1"):
    """A Conexão carregada no Anki com `colecao`; devolve (a Conexão, os ganchos de perfil que ela registrou)."""
    ganchos = []
    conexao = inicio.iniciar(os.path.join(raiz, "complemento"), lambda: perfil, porta=0, colecao=colecao, abridor=None, ao_abrir_o_perfil=ganchos.append)
    return conexao, ganchos


def tipos_de(colecao):
    return [nome for nome in TIPOS if colecao.tipo_de_nota(nome) is not None]


class AConexaoPreparaAColecao(unittest.TestCase):
    def test_ao_carregar_com_o_perfil_aberto_a_colecao_ganha_os_tipos_de_nota_e_os_baralhos_de_uma_instalacao_nova(self):
        colecao = ColecaoEmMemoria(SO_O_DEFAULT)
        with tempfile.TemporaryDirectory() as raiz:
            conexao, _ = iniciar(raiz, colecao)
            conexao.parar()
        self.assertEqual(tipos_de(colecao), list(TIPOS))
        self.assertEqual(sorted(colecao.nomes_dos_baralhos()), ["Default", "PerpetualMiner::Inglês", "PerpetualMiner::Russo"])

    def test_com_o_anki_na_tela_de_perfis_nada_e_criado_e_quando_o_perfil_abre_a_colecao_e_preparada(self):
        colecao = ColecaoEmMemoria.fechada()
        with tempfile.TemporaryDirectory() as raiz:
            conexao, ganchos = iniciar(raiz, colecao, perfil=None)
            try:
                colecao.abrir()
                self.assertEqual(tipos_de(colecao), [])  # até o perfil abrir, nada foi criado
                for gancho in ganchos:
                    gancho()
            finally:
                conexao.parar()
        self.assertEqual(tipos_de(colecao), list(TIPOS))

    def test_cada_perfil_que_abre_repete_o_preparo_sem_criar_nada_de_novo(self):
        colecao = ColecaoEmMemoria(SO_O_DEFAULT)
        with tempfile.TemporaryDirectory() as raiz:
            conexao, ganchos = iniciar(raiz, colecao)
            antes = sorted(colecao.nomes_dos_baralhos())
            for _ in range(3):
                for gancho in ganchos:
                    gancho()
            conexao.parar()
        self.assertEqual(sorted(colecao.nomes_dos_baralhos()), antes)
        self.assertEqual(tipos_de(colecao), list(TIPOS))

    def test_quem_ja_tem_baralho_ganha_os_tipos_de_nota_e_fica_so_com_os_baralhos_dele(self):
        colecao = ColecaoEmMemoria({"baralhos": [{"nome": "Default"}, {"nome": "CIMV"}, {"nome": "RUSSIAN"}]})
        with tempfile.TemporaryDirectory() as raiz:
            conexao, _ = iniciar(raiz, colecao)
            conexao.parar()
        self.assertEqual((tipos_de(colecao), sorted(colecao.nomes_dos_baralhos())), (list(TIPOS), ["CIMV", "Default", "RUSSIAN"]))

    def test_com_outro_perfil_aberto_que_o_marcado_nada_e_criado_nele(self):
        colecao = ColecaoEmMemoria(SO_O_DEFAULT, perfis=("Ana", "Beto"), perfil_aberto="Beto")
        with tempfile.TemporaryDirectory() as raiz:
            os.makedirs(os.path.join(raiz, "complemento", "user_files"))
            with open(os.path.join(raiz, "complemento", "user_files", "perfil.json"), "w", encoding="utf-8") as arquivo:
                json.dump({"perfil": "Ana"}, arquivo)
            conexao, _ = iniciar(raiz, colecao, perfil="Beto")
            conexao.parar()
        self.assertEqual((tipos_de(colecao), colecao.nomes_dos_baralhos()), ([], ["Default"]))

    def test_um_erro_ao_preparar_nao_derruba_a_conexao_e_o_log_diz_por_que(self):
        colecao = ColecaoEmMemoria(SO_O_DEFAULT)
        with patch.object(colecao, "criar_tipo_de_nota", side_effect=RuntimeError("o Anki mudou")), tempfile.TemporaryDirectory() as raiz:
            conexao, _ = iniciar(raiz, colecao)
            vivo = conexao is not None
            if vivo:
                conexao.parar()
            with open(os.path.join(raiz, "complemento", "user_files", "logs", "complemento.log"), encoding="utf-8") as log:
                registrado = log.read()
        self.assertTrue(vivo)
        self.assertIn("A coleção não foi preparada", registrado)


if __name__ == "__main__":
    unittest.main()
