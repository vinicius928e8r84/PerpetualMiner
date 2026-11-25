import contextlib
import io
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import servidor
from test_harness import ConexaoNoTeste, RESPONDIDOS, ler_o_contrato
from complemento.test_colecao_em_memoria import ColecaoEmMemoria
from complemento.test_matriz_de_rotas import MATRIZ
from test_harness import tearDownModule


class QuebradaAoLer(ColecaoEmMemoria):
    def __init__(self):
        super().__init__({"quebra": True, "baralhos": []})


@contextlib.contextmanager
def o_anki_no_estado(calar_o_erro=False, **estado):
    calada = contextlib.redirect_stderr(io.StringIO()) if calar_o_erro else contextlib.nullcontext()
    with tempfile.TemporaryDirectory() as pasta, calada, ConexaoNoTeste(pasta, **estado) as conexao:
        yield conexao


class EstadosDeCadaRota(unittest.TestCase):
    def conferir_que_toda_rota_esta_na_matriz(self, rotas, matriz):
        sem_entrada = sorted(rota for rota in rotas if rota not in matriz)
        self.assertEqual(sem_entrada, [], "rota nova sem entrada em MATRIZ (complemento/test_matriz_de_rotas.py): diga o corpo, se lê a coleção e o perfil, e as recusas dela")

    def pedir_cada_rota(self, conexao, rotas, matriz):
        return {rota: conexao.pedir(rota[0], rota[1], corpo=matriz[rota]["corpo"]) for rota in sorted(rotas, key=lambda r: (matriz[r].get("abre_perfil", False), r))}

    def pedir_cada_rota_no_estado(self, rotas, matriz, **estado):
        with o_anki_no_estado(**estado) as conexao:
            return self.pedir_cada_rota(conexao, rotas, matriz)

    def conferir_o_erro_interno(self, rota, status, corpo):
        self.assertEqual((status, json.loads(corpo)), (500, {"error": "internal_error"}), rota)

    def conferir_a_rota_que_o_estado_nao_afeta(self, rota, status, matriz):
        self.assertEqual(status, matriz[rota].get("status", 200), rota)

    def conferir_a_colecao_que_quebra(self, rotas, matriz):
        respostas = self.pedir_cada_rota_no_estado(rotas, matriz, colecao=QuebradaAoLer(), calar_o_erro=True)
        for rota, (status, _, corpo) in respostas.items():
            if matriz[rota]["le_a_colecao"]:
                self.conferir_o_erro_interno(rota, status, corpo)
            else:
                self.conferir_a_rota_que_o_estado_nao_afeta(rota, status, matriz)

    def conferir_sem_a_colecao_aberta(self, rotas, matriz):
        respostas = self.pedir_cada_rota_no_estado(rotas, matriz, colecao=ColecaoEmMemoria.fechada())
        for rota, (status, _, corpo) in respostas.items():
            if matriz[rota]["le_a_colecao"]:
                self.assertEqual(status, 503, rota)
                self.assertTrue(json.loads(corpo)["error"].endswith("_unavailable"), rota)
            else:
                self.conferir_a_rota_que_o_estado_nao_afeta(rota, status, matriz)

    def conferir_o_perfil_que_nao_se_le(self, rotas, matriz):
        respostas = self.pedir_cada_rota_no_estado(rotas, matriz, colecao=ColecaoEmMemoria.fechada(), falha_no_perfil=True, calar_o_erro=True)
        for rota, (status, _, corpo) in respostas.items():
            if matriz[rota]["le_o_perfil"]:
                self.conferir_o_erro_interno(rota, status, corpo)
            elif matriz[rota]["le_a_colecao"]:
                self.assertEqual(status, 503, rota)
            else:
                self.conferir_a_rota_que_o_estado_nao_afeta(rota, status, matriz)

    def conferir_as_recusas_de_cada_rota(self, rotas, matriz):
        with o_anki_no_estado(colecao=ColecaoEmMemoria(ler_o_contrato()["colecoes"]["inglês com subbaralho"])) as conexao:
            for rota in sorted(rotas):
                for corpo, status_esperado, erro_esperado in matriz[rota]["recusas"]:
                    status, _, resposta = conexao.pedir(rota[0], rota[1], corpo=corpo)
                    self.assertEqual((status, json.loads(resposta)), (status_esperado, {"error": erro_esperado}), (rota, corpo))

    def conferir_o_corpo_que_nao_e_um_objeto_json(self, rotas, matriz):
        with o_anki_no_estado() as conexao:
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
