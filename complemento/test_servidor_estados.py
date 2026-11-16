"""Cada rota do servidor, pedida por HTTP em cada estado do Anki (parte de `test_servidor.py`).

    python3.9 complemento/test_servidor_estados.py
"""

import contextlib
import io
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import servidor  # noqa: E402
from test_harness import ConexaoNoTeste, RESPONDIDOS, ler_o_contrato  # noqa: E402
from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_matriz_de_rotas import MATRIZ  # noqa: E402
from test_harness import tearDownModule  # noqa: E402,F401


class QuebradaAoLer(ColecaoEmMemoria):
    """O Anki que levanta um erro inesperado ao ler a coleção."""

    def __init__(self):
        super().__init__({"quebra": True, "baralhos": []})


class EstadosDeCadaRota(unittest.TestCase):
    """Cada rota que o servidor tem é pedida de verdade, por HTTP, em cada estado em que o Anki pode estar.

    Não depende dos exemplos do contrato: o que o servidor responde fica registrado (`registrar_a_resposta`) e,
    no fim do arquivo, `tearDownModule` exige um exemplo para cada resposta. Tirar um exemplo, ou uma rota
    nova que responde um estado que ninguém escreveu, quebra por aqui, dizendo o estado.
    Os métodos `conferir_*` recebem a matriz e as rotas, para o teste da própria matriz usar uma rota inventada.
    A rota inventada que não lê a coleção é como a de estado da chave de IA (PR 191): não toca a coleção nem o perfil, e o corpo `{}` basta."""

    def conferir_que_toda_rota_esta_na_matriz(self, rotas, matriz):
        sem_entrada = sorted(rota for rota in rotas if rota not in matriz)
        self.assertEqual(sem_entrada, [], "rota nova sem entrada em MATRIZ (complemento/test_matriz_de_rotas.py): diga o corpo, se lê a coleção e o perfil, e as recusas dela")

    def pedir_cada_rota(self, conexao, rotas, matriz):
        """`abre_perfil`: a rota abre um perfil no Anki (a tela de perfis passa a ter coleção); vai por último, para as outras a pedirem como estava."""
        return {rota: conexao.pedir(rota[0], rota[1], corpo=matriz[rota]["corpo"]) for rota in sorted(rotas, key=lambda r: (matriz[r].get("abre_perfil", False), r))}

    def conferir_a_colecao_que_quebra(self, rotas, matriz):
        with tempfile.TemporaryDirectory() as pasta, contextlib.redirect_stderr(io.StringIO()), ConexaoNoTeste(pasta, colecao=QuebradaAoLer()) as conexao:
            respostas = self.pedir_cada_rota(conexao, rotas, matriz)
        for rota, (status, _, corpo) in respostas.items():
            if matriz[rota]["le_a_colecao"]:
                self.assertEqual((status, json.loads(corpo)), (500, {"error": "internal_error"}), rota)
            else:
                self.assertEqual(status, matriz[rota].get("status", 200), rota)

    def conferir_sem_a_colecao_aberta(self, rotas, matriz):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, colecao=ColecaoEmMemoria.fechada()) as conexao:
            respostas = self.pedir_cada_rota(conexao, rotas, matriz)
        for rota, (status, _, corpo) in respostas.items():
            if matriz[rota]["le_a_colecao"]:
                self.assertEqual(status, 503, rota)
                self.assertTrue(json.loads(corpo)["error"].endswith("_unavailable"), rota)
            else:
                self.assertEqual(status, matriz[rota].get("status", 200), rota)

    def conferir_o_perfil_que_nao_se_le(self, rotas, matriz):
        with tempfile.TemporaryDirectory() as pasta, contextlib.redirect_stderr(io.StringIO()), ConexaoNoTeste(pasta, falha_no_perfil=True, colecao=ColecaoEmMemoria.fechada()) as conexao:
            respostas = self.pedir_cada_rota(conexao, rotas, matriz)
        for rota, (status, _, corpo) in respostas.items():
            if matriz[rota]["le_o_perfil"]:
                self.assertEqual((status, json.loads(corpo)), (500, {"error": "internal_error"}), rota)
            elif matriz[rota]["le_a_colecao"]:
                self.assertEqual(status, 503, rota)
            else:
                self.assertEqual(status, matriz[rota].get("status", 200), rota)

    def conferir_as_recusas_de_cada_rota(self, rotas, matriz):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, colecao=ColecaoEmMemoria(ler_o_contrato()["colecoes"]["inglês com subbaralho"])) as conexao:
            for rota in sorted(rotas):
                for corpo, status_esperado, erro_esperado in matriz[rota]["recusas"]:
                    status, _, resposta = conexao.pedir(rota[0], rota[1], corpo=corpo)
                    self.assertEqual((status, json.loads(resposta)), (status_esperado, {"error": erro_esperado}), (rota, corpo))

    def conferir_o_corpo_que_nao_e_um_objeto_json(self, rotas, matriz):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            for metodo, caminho in sorted(rotas):
                status, _, corpo = conexao.pedir(metodo, caminho, corpo=b"{isto nao e json")
                self.assertEqual((status, json.loads(corpo)), (400, {"error": "invalid_json"}), (metodo, caminho))

    def conferir_tudo(self, rotas, matriz):
        self.conferir_que_toda_rota_esta_na_matriz(rotas, matriz)
        self.conferir_a_colecao_que_quebra(rotas, matriz)
        self.conferir_sem_a_colecao_aberta(rotas, matriz)
        self.conferir_o_perfil_que_nao_se_le(rotas, matriz)
        self.conferir_as_recusas_de_cada_rota(rotas, matriz)
        self.conferir_o_corpo_que_nao_e_um_objeto_json(rotas, matriz)

    def test_cada_rota_do_servidor_em_cada_estado_do_anki(self):
        self.conferir_tudo(servidor.ROTAS, MATRIZ)

    def test_uma_rota_nova_sem_entrada_na_matriz_quebra_dizendo_o_que_declarar(self):
        rotas = dict(servidor.ROTAS)
        rotas[("POST", "/rota/inventada")] = lambda conexao, corpo: (200, {"ok": True})
        with self.assertRaisesRegex(AssertionError, r"rota nova sem entrada em MATRIZ.*se lê a coleção"):
            self.conferir_que_toda_rota_esta_na_matriz(rotas, MATRIZ)

    def test_uma_rota_que_nao_le_a_colecao_responde_200_em_todos_os_estados_dela(self):
        rota = ("POST", "/rota/inventada")
        original, respondidos = dict(servidor.ROTAS), set(RESPONDIDOS)
        servidor.ROTAS[rota] = lambda conexao, corpo: (200, {"configurada": False})
        try:
            matriz = dict(MATRIZ)
            matriz[rota] = {"corpo": {}, "le_a_colecao": False, "le_o_perfil": False, "recusas": []}
            self.conferir_tudo(servidor.ROTAS, matriz)
        finally:
            servidor.ROTAS.clear()
            servidor.ROTAS.update(original)
            RESPONDIDOS.intersection_update(respondidos)


if __name__ == "__main__":
    unittest.main()
