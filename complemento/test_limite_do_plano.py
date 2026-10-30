"""O limite do plano do ChatGPT no Envio (#158), visto de fora: o plano recusa por limite de uso, o Envio espera sem falhar (o estado diz
`waiting: plan_limit`), volta sozinho quando o plano libera, e a pessoa pode pedir Tentar de novo agora ou Usar a minha chave (o que falta
vai pela chave). Nada disso refaz um Cartão que já está no Anki. O desenho do login: `docs/design/login-do-chatgpt.md`.

    python3.9 complemento/test_limite_do_plano.py
"""

import json
import os
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_envio import CHAVE, ID, EnvioNoTeste, chats, pedido  # noqa: E402
from complemento.test_envio_imagem import FOTOS, FRASE, juiz_que_prefere  # noqa: E402
from complemento.test_envio_retomada import TRES_FRASES, esperar_ate, palavras_pedidas  # noqa: E402

LIMITE = (429, "subscription_sharing_usage_limit_exceeded")
DUAS_FRASES = ("give up : She gave up smoking", "keep running : They keep running")
ESPERANDO_O_PLANO = {"reason": "plan_limit"}


class PlanoNoLimite:
    """O plano do ChatGPT de mentira: responde o primeiro pedido de texto e, depois dele, recusa por limite de uso até `liberar()`."""

    def __init__(self, conexao, aceitos=1):
        self.conexao, self.aceitos, self.livre = conexao, aceitos, False
        conexao.openai.recusa_das_respostas = lambda pedidos: None if self.livre or pedidos <= self.aceitos else LIMITE

    def liberar(self):
        self.livre = True

    def pedidos(self):
        return len(self.conexao.openai.respostas)


def em_espera(estado):
    return estado.get("waiting") == ESPERANDO_O_PLANO


class EnvioNoLimite(EnvioNoTeste):
    """Uma Conexão com o login do ChatGPT feito e a espera do plano curta: os testes não esperam os minutos de verdade."""

    def __init__(self, pasta, espera_do_plano=0.02, **argumentos):
        argumentos.setdefault("chatgpt", "conectada")
        super().__init__(pasta, espera_do_plano=espera_do_plano, **argumentos)


class NoLimiteDoPlanoOEnvioEspera(unittest.TestCase):
    def test_o_limite_do_plano_nao_falha_o_envio_o_estado_diz_que_ele_espera_o_plano_e_nenhum_cartao_novo_e_gravado(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoLimite(pasta) as conexao:
            PlanoNoLimite(conexao)
            conexao.criar(pedido(ID, *DUAS_FRASES))
            esperando = conexao.esperar(ID, em_espera)
            esperar_ate(lambda: conexao.estado(ID)["cards"]["1760000000000-0"]["status"] == "added")
            notas = len(conexao.conexao.colecao.gravadas)
        self.assertEqual((esperando["status"], esperando["stage"], esperando["lastError"]), ("running", "generate_cards", None))
        self.assertEqual(sorted(c["status"] for c in esperando["cards"].values()), ["added", "pending"])
        self.assertEqual(notas, 1)

    def test_quando_o_plano_libera_o_envio_continua_sozinho_sem_pedir_de_novo_o_texto_do_cartao_pronto(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoLimite(pasta) as conexao:
            plano = PlanoNoLimite(conexao)
            conexao.criar(pedido(ID, *DUAS_FRASES))
            conexao.esperar(ID, em_espera)
            plano.liberar()
            fim = conexao.esperar(ID)
            pedidas = [corpo["input"][0]["content"] for _, corpo in conexao.openai.respostas if corpo["input"][0]["content"] == DUAS_FRASES[0]]
            notas = len(conexao.conexao.colecao.gravadas)
        self.assertEqual((fim["status"], fim["lastError"], "waiting" in fim), ("completed", None, False))
        self.assertEqual((len(pedidas), notas), (1, 2))

    def test_a_espera_do_plano_tenta_de_novo_sozinha_a_cada_intervalo(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoLimite(pasta) as conexao:
            plano = PlanoNoLimite(conexao)
            conexao.criar(pedido(ID, *DUAS_FRASES))
            conexao.esperar(ID, em_espera)
            esperar_ate(lambda: plano.pedidos() >= 4)
            ainda = conexao.estado(ID)
        self.assertEqual((ainda["status"], ainda["waiting"]), ("running", ESPERANDO_O_PLANO))

    def test_o_limite_no_meio_do_stream_tambem_so_espera(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoLimite(pasta) as conexao:
            conexao.openai.falha_no_stream = "subscription_sharing_usage_limit_exceeded"
            conexao.criar(pedido(ID, *DUAS_FRASES))
            esperando = conexao.esperar(ID, em_espera)
        self.assertEqual((esperando["status"], esperando["lastError"]), ("running", None))


class TentarDeNovoNoLimite(unittest.TestCase):
    def test_tentar_de_novo_pede_o_texto_na_hora_sem_esperar_o_intervalo_e_nada_muda_no_estado(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoLimite(pasta, espera_do_plano=300) as conexao:
            plano = PlanoNoLimite(conexao)
            conexao.criar(pedido(ID, *DUAS_FRASES))
            antes = conexao.esperar(ID, em_espera)
            pedidos = plano.pedidos()
            status, _, resposta = conexao.pedir("POST", "/jobs/retry", corpo={"jobId": ID})
            esperar_ate(lambda: plano.pedidos() > pedidos)
            conexao.esperar(ID, em_espera)
            plano.liberar()
            conexao.pedir("POST", "/jobs/retry", corpo={"jobId": ID})
            fim = conexao.esperar(ID)
        self.assertEqual((status, json.loads(resposta)), (200, {"jobId": ID, "status": "running"}))
        self.assertEqual((antes["waiting"], fim["status"]), (ESPERANDO_O_PLANO, "completed"))


class UsarAMinhaChaveNoLimite(unittest.TestCase):
    def test_usar_a_minha_chave_segue_o_envio_pela_chave_so_com_o_que_falta(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoLimite(pasta, espera_do_plano=300) as conexao:
            PlanoNoLimite(conexao)
            conexao.criar(pedido(ID, *DUAS_FRASES))
            conexao.esperar(ID, em_espera)
            status, _, resposta = conexao.pedir("POST", "/jobs/usar-a-chave", corpo={"jobId": ID})
            fim = conexao.esperar(ID)
            pela_chave = chats(conexao.openai)
            notas = len(conexao.conexao.colecao.gravadas)
            do_plano = [corpo["input"][0]["content"] for _, corpo in conexao.openai.respostas]
            gravado = conexao.estado(ID)
        self.assertEqual((status, json.loads(resposta)), (200, {"jobId": ID, "status": "running"}))
        self.assertEqual((fim["status"], fim["lastError"], "waiting" in fim, notas), ("completed", None, False, 2))
        self.assertEqual([autorizacao for autorizacao, _ in pela_chave], ["Bearer " + CHAVE])
        self.assertEqual(palavras_pedidas(conexao.openai), ["keep running"])  # o Cartão que já estava no Anki não paga de novo
        self.assertEqual(do_plano.count(DUAS_FRASES[0]), 1)
        self.assertTrue(gravado["usingKey"])

    def test_usar_a_minha_chave_leva_tambem_o_juiz_da_imagem_pela_chave_e_nao_pelo_plano_que_esta_no_limite(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoLimite(pasta, espera_do_plano=300) as conexao:
            conexao.openverse.fotos = FOTOS
            conexao.openai.juiz = juiz_que_prefere(1)
            PlanoNoLimite(conexao, aceitos=0)
            conexao.criar(pedido(ID, FRASE))
            conexao.esperar(ID, em_espera)
            conexao.pedir("POST", "/jobs/usar-a-chave", corpo={"jobId": ID})
            fim = conexao.esperar(ID)
            pedidos_ao_plano = len(conexao.openai.respostas)
            juizes = [autorizacao for autorizacao, _, _ in conexao.openai.juizes]
        self.assertEqual((fim["status"], fim["lastError"], fim["cards"]["1760000000000-0"]["status"]), ("completed", None, "added"))
        self.assertEqual((pedidos_ao_plano, juizes), (1, ["Bearer " + CHAVE]))  # o único pedido ao plano foi o texto recusado

    def test_usar_a_minha_chave_sem_chave_guardada_recusa_e_o_envio_segue_esperando_o_plano(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoLimite(pasta, chave=None) as conexao:
            PlanoNoLimite(conexao)
            conexao.criar(pedido(ID, *DUAS_FRASES))
            conexao.esperar(ID, em_espera)
            status, _, resposta = conexao.pedir("POST", "/jobs/usar-a-chave", corpo={"jobId": ID})
            time.sleep(0.2)
            ainda = conexao.estado(ID)
            pedidas_pela_chave = len(chats(conexao.openai))
        self.assertEqual((status, json.loads(resposta)), (409, {"error": "openai_key_missing"}))
        self.assertEqual((ainda["status"], ainda["waiting"], "usingKey" in ainda, pedidas_pela_chave), ("running", ESPERANDO_O_PLANO, False, 0))

    def test_usar_a_minha_chave_num_envio_que_ja_terminou_e_recusado(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoLimite(pasta) as conexao:
            conexao.criar(pedido(ID, DUAS_FRASES[0]))
            conexao.esperar(ID)
            status, _, resposta = conexao.pedir("POST", "/jobs/usar-a-chave", corpo={"jobId": ID})
        self.assertEqual((status, json.loads(resposta)), (409, {"error": "job_finished"}))


class UmEnvioEsperandoOPlano(unittest.TestCase):
    def test_se_a_conexao_cai_enquanto_espera_o_plano_ela_volta_a_pedir_so_o_que_falta(self):
        with tempfile.TemporaryDirectory() as pasta:
            with EnvioNoLimite(pasta, espera_do_plano=300) as conexao:
                PlanoNoLimite(conexao)
                conexao.criar(pedido(ID, *TRES_FRASES))
                conexao.esperar(ID, em_espera)
            with EnvioNoLimite(pasta) as conexao:
                fim = conexao.esperar(ID)
                depois = [corpo["input"][0]["content"] for _, corpo in conexao.openai.respostas]
                notas = len(conexao.conexao.colecao.gravadas)
        self.assertEqual((fim["status"], notas), ("completed", 2))  # a coleção da primeira Conexão não é a desta: só o que faltava foi pedido
        self.assertNotIn(TRES_FRASES[0], depois)

    def test_apagar_tudo_com_o_envio_esperando_o_plano_para_o_envio_e_nenhum_texto_novo_e_pedido(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoLimite(pasta, espera_do_plano=300) as conexao:
            plano = PlanoNoLimite(conexao)
            conexao.criar(pedido(ID, *DUAS_FRASES))
            conexao.esperar(ID, em_espera)
            pedidos = plano.pedidos()
            conexao.pedir("POST", "/jobs/apagar-frases", corpo={})
            fim = conexao.esperar(ID)
            time.sleep(0.2)
            depois = plano.pedidos()
        self.assertEqual((fim["status"], fim["lastError"], fim.get("wiped")), ("failed", "frases_apagadas", True))
        self.assertEqual((depois, "waiting" in fim), (pedidos, False))


if __name__ == "__main__":
    unittest.main()
