"""A passagem do Windows do dono (#178), vista de fora: uma Conexão de hoje de mentira na porta (`test_conexao_antiga_de_mentira.py`), a
Conexão nova de verdade subindo depois dela e um sistema de mentira no lugar do Windows (as entradas de início automático e o processo).
Aqui: a espera do Envio de agora, a ordem e a porta; as cópias e os Envios passados estão em `test_passagem_cartoes.py`.

    python3.9 complemento/test_passagem.py
"""

import http.client
import json
import os
import socket
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import inicio, passagem  # noqa: E402
from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_conexao_antiga_de_mentira import ConexaoAntigaDeMentira  # noqa: E402
from complemento.test_envio import ID, OUTRO_ID, EnvioNoTeste  # noqa: E402
from complemento.test_passagem_de_mentira import CHAVE_DO_DONO, NaPassagem, SistemaDeMentira, uma_conexao_de_hoje  # noqa: E402


class APassagemEsperaOEnvioDeAgora(unittest.TestCase):
    def test_espera_o_envio_de_agora_terminar_e_nao_copia_nada_enquanto_ele_anda(self):
        with tempfile.TemporaryDirectory() as pasta, uma_conexao_de_hoje(pasta) as antiga, NaPassagem(pasta, antiga) as nova:
            nova.a_cada_espera = lambda vez: antiga.terminar(ID, [10]) if vez == 4 else None
            nova.passar()
            esperas = nova.dormiu
        self.assertGreaterEqual(len(esperas), 4)
        self.assertEqual({tuple(arquivos) for arquivos, _ in esperas}, {()}, "nada foi copiado enquanto o Envio de agora andava")
        self.assertEqual({situacao for _, situacao in esperas}, {"esperando"})
        self.assertIsNone(nova.conexao.situacao_da_passagem)

    def test_a_janela_do_anki_diz_esperando_o_envio_de_agora_terminar_enquanto_espera(self):
        from complemento import janela

        with tempfile.TemporaryDirectory() as pasta, uma_conexao_de_hoje(pasta) as antiga, NaPassagem(pasta, antiga) as nova:
            vistos = []
            leitor = janela.Janela(nova.conexao, lambda: "Usuário 1", "0", nova.novo.logger)
            nova.a_cada_espera = lambda vez: (vistos.append(leitor.estado().conexao), antiga.terminar(ID, [10]) if vez == 2 else None)
            nova.passar()
            depois = leitor.estado().conexao
        self.assertEqual(vistos[0], "Esperando o Envio de agora terminar")
        self.assertEqual(depois, "Ligada")


class ALiberacaoDaPorta(unittest.TestCase):
    def test_libera_a_porta_so_depois_de_tudo_copiado_e_a_conexao_nova_sobe_nela(self):
        with tempfile.TemporaryDirectory() as pasta, uma_conexao_de_hoje(pasta) as antiga:
            antiga.terminar(ID, [10])
            with NaPassagem(pasta, antiga, colecao=ColecaoEmMemoria({"baralhos": []}, perfis=("Usuário 1", "Ingles - Vinicius")), trabalhando=False) as nova:
                porta = antiga.porta
                self.assertTrue(nova.passagem.pendente(nova.conexao))
                nova.passar()
                (na_hora_de_parar,) = nova.fotografias
                no_ar, porta_da_nova = nova.no_ar, nova.conexao.porta
        self.assertEqual(nova.eventos, ["inicio_apagado", "processo_parado"], "o início automático some antes de o processo parar")
        self.assertEqual(na_hora_de_parar["chave"], CHAVE_DO_DONO)
        self.assertEqual(len(na_hora_de_parar["custos"]), 1)
        self.assertEqual(na_hora_de_parar["prompts"], [os.path.join("prompts", "en_card.txt")])
        self.assertEqual(na_hora_de_parar["perfil"], "Ingles - Vinicius")
        self.assertIn(OUTRO_ID, na_hora_de_parar["fila"])
        self.assertTrue(na_hora_de_parar["inicio_apagado"])
        self.assertTrue(no_ar)
        self.assertEqual(porta_da_nova, porta, "a Conexão nova ficou na porta da de hoje")

    def test_com_o_inicio_automatico_que_nao_apaga_a_conexao_de_hoje_continua_no_ar_e_a_porta_nao_e_liberada(self):
        with tempfile.TemporaryDirectory() as pasta, uma_conexao_de_hoje(pasta) as antiga:
            antiga.terminar(ID, [10])
            with NaPassagem(pasta, antiga, falha_em="inicio", trabalhando=False) as nova:
                nova.passar()
                marca = os.path.exists(os.path.join(nova.conexao.dados.raiz, "passagem.json"))
                no_ar, log = nova.no_ar, nova.log()
            self.assertTrue(antiga.no_ar)
        self.assertEqual((nova.eventos, marca, no_ar), ([], False, False))
        self.assertIn("A passagem não terminou", log)

    def test_tentar_de_novo_depois_de_uma_falha_nao_duplica_a_fila_nem_os_custos(self):
        with tempfile.TemporaryDirectory() as pasta, uma_conexao_de_hoje(pasta) as antiga:
            antiga.terminar(ID, [10])
            with NaPassagem(pasta, antiga, falha_em="parar", trabalhando=False) as nova:
                nova.passar()
                primeira = nova.novo_arquivos(), [i["jobId"] for i in nova.conexao.fila.ordem()]
                nova.sistema.falha_em = None
                nova.conexao._cancelar.clear()
                nova.passagem.fazer(nova.conexao)
                segunda = nova.novo_arquivos(), [i["jobId"] for i in nova.conexao.fila.ordem()]
        self.assertEqual(primeira[1], segunda[1])
        self.assertEqual([a for a in segunda[0] if a not in primeira[0]], ["passagem.json"])

    def test_sem_conexao_de_hoje_na_porta_a_passagem_nao_tem_o_que_fazer(self):
        with tempfile.TemporaryDirectory() as pasta:
            livre = socket.socket()
            livre.bind(("127.0.0.1", 0))
            porta = livre.getsockname()[1]
            livre.close()
            with EnvioNoTeste(os.path.join(pasta, "novo"), trabalhando=False) as nova:
                outra = passagem.Passagem(sistema=None, porta=porta)
                self.assertFalse(outra.pendente(nova.conexao))

    def test_depois_da_passagem_feita_a_conexao_de_hoje_que_voltasse_nao_dispara_outra(self):
        with tempfile.TemporaryDirectory() as pasta, uma_conexao_de_hoje(pasta) as antiga:
            antiga.terminar(ID, [10])
            with NaPassagem(pasta, antiga, trabalhando=False) as nova:
                nova.passar()
                novamente = ConexaoAntigaDeMentira(os.path.join(pasta, "volta"))
                self.assertFalse(nova.passagem.pendente(nova.conexao))
                self.assertIsNotNone(novamente)


class ASaidaDaPassagem(unittest.TestCase):
    def test_sem_a_passagem_o_complemento_sobe_como_antes_e_a_conexao_de_hoje_fica_intacta(self):
        with tempfile.TemporaryDirectory() as pasta, uma_conexao_de_hoje(pasta) as antiga:
            antes = antiga.fotografia()
            conexao = inicio.iniciar(os.path.join(pasta, "anki"), lambda: None, porta=antiga.porta, abridor=None, passagem=None)
            self.assertIsNone(conexao, "a porta é da Conexão de hoje e a de agora só se cala")
            self.assertEqual((antiga.no_ar, antiga.fotografia()), (True, antes))

    def test_o_inicio_sobe_a_conexao_depois_da_passagem_e_ela_ocupa_a_porta_da_de_hoje(self):
        with tempfile.TemporaryDirectory() as pasta, uma_conexao_de_hoje(pasta) as antiga:
            antiga.terminar(ID, [10])
            antiga.estado(OUTRO_ID, "completed", [20, 21])
            eventos = []
            sistema = SistemaDeMentira(antiga, eventos)
            conexao = inicio.iniciar(
                os.path.join(pasta, "anki"), lambda: "Usuário 1", porta=antiga.porta, abridor=None,
                passagem=passagem.Passagem(sistema=sistema, porta=antiga.porta, intervalo=0, espera_da_porta=5), colecao=ColecaoEmMemoria({"baralhos": []}))
            try:
                conexao._thread_da_passagem.join(timeout=30)
                ligacao = http.client.HTTPConnection("127.0.0.1", antiga.porta, timeout=5)
                ligacao.request("GET", "/health")
                resposta = ligacao.getresponse().read().decode("utf-8")
                ligacao.close()
            finally:
                conexao.parar()
        self.assertEqual(eventos, ["inicio_apagado", "processo_parado"])
        self.assertIn('"versao"', resposta)
        self.assertNotIn('"bridge"', resposta)


if __name__ == "__main__":
    unittest.main()
