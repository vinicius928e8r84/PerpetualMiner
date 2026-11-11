"""#372: depois que a retenção apaga o Envio, a lista da Conexão ainda diz quais Frases foram enviadas (só ids).

    python3.9 complemento/test_retencao_e_frases_enviadas.py
"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import retencao_dos_envios  # noqa: E402
from complemento.test_envio import ID, EnvioNoTeste  # noqa: E402
from complemento.test_retencao_dos_envios import envelhecer, ler_estado, mudar_estado, terminado  # noqa: E402


class AListaDepoisDaRetencao(unittest.TestCase):
    def test_depois_da_retencao_a_lista_ainda_diz_quais_frases_foram_enviadas_sem_reenviar_nem_pagar_de_novo(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            terminado(conexao, ID)
            enviadas = ler_estado(conexao, ID)["successfulPhraseIds"]
            envelhecer(conexao, ID, 31)
            retencao_dos_envios.reter(conexao.conexao.fila)
            lista = json.loads(conexao.pedir("POST", "/jobs/list", corpo={})[2])["jobs"]
            ficha = conexao.conexao.fila.ficha(ID)
        self.assertTrue(enviadas)
        self.assertEqual([(job["jobId"], job["state"]["status"], job["state"]["successfulPhraseIds"]) for job in lista], [(ID, "completed", enviadas)])
        self.assertEqual(ficha["successfulPhraseIds"], enviadas)
        self.assertNotIn("entries", json.dumps(lista))  # só ids: nunca a Palavra nem a Frase

    def test_depois_da_retencao_as_frases_que_ja_estavam_no_anki_continuam_duplicadas(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            terminado(conexao, ID)
            enviadas = ler_estado(conexao, ID)["successfulPhraseIds"]
            mudar_estado(conexao, ID, duplicatePhraseIds=enviadas)
            envelhecer(conexao, ID, 31)
            retencao_dos_envios.reter(conexao.conexao.fila)
            lista = json.loads(conexao.pedir("POST", "/jobs/list", corpo={})[2])["jobs"]
        self.assertEqual(lista[0]["state"]["duplicatePhraseIds"], enviadas)

    def test_um_envio_parcial_retido_volta_como_terminado_para_nao_oferecer_continuar_que_da_404(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            terminado(conexao, ID)
            mudar_estado(conexao, ID, status="partial", stage="partial", lastError="openai_rate_limited")
            envelhecer(conexao, ID, 31)
            retencao_dos_envios.reter(conexao.conexao.fila)
            lista = json.loads(conexao.pedir("POST", "/jobs/list", corpo={})[2])["jobs"]
        self.assertEqual((lista[0]["status"], lista[0]["state"]["status"], lista[0]["state"]["stage"]), ("completed", "completed", "completed"))


if __name__ == "__main__":
    unittest.main()
