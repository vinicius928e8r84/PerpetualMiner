"""Os endereços dos serviços de fora e as esperas da Conexão: os valores de fábrica são os que a Conexão sempre teve, cada `Esperas` tem o seu
`parar`, e o Motor do Cartão sai montado com o que as duas dizem.

    python3.9 complemento/test_servicos_e_esperas.py
"""

import os
import sys
import unittest
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.esperas import Esperas
from complemento.montagem_do_cartao import motor_do_cartao
from complemento.servicos_de_fora import ServicosDeFora


class OsServicosDeFora(unittest.TestCase):
    def test_sem_nada_pedido_cada_servico_fica_no_endereco_de_producao(self):
        self.assertEqual(
            ServicosDeFora(),
            ServicosDeFora(
                openai="https://api.openai.com", openverse="https://api.openverse.org", voz="https://translate.google.{tld}",
                firestore="https://firestore.googleapis.com/v1/projects/perpetualminer-4c219/databases/(default)/documents",
                chatgpt="https://auth.openai.com"))

    def test_um_teste_aponta_so_o_servico_que_troca(self):
        servicos = ServicosDeFora(openai="http://127.0.0.1:1")
        self.assertEqual((servicos.openai, servicos.openverse), ("http://127.0.0.1:1", "https://api.openverse.org"))


class AsEsperas(unittest.TestCase):
    def test_sem_nada_pedido_cada_espera_dura_o_que_sempre_durou(self):
        esperas = Esperas()
        self.assertEqual(
            (esperas.do_anki, esperas.da_openai, esperas.do_plano, esperas.do_teto, esperas.do_contato, esperas.do_envio, esperas.da_parada, esperas.teto),
            (2.0, (2, 8, 30), 300, 60, 60.0, 1.0, 0.1, None))

    def test_cada_conjunto_de_esperas_tem_o_seu_evento_de_parar(self):
        primeiras, segundas = Esperas(), Esperas()
        primeiras.parar.set()
        self.assertEqual((primeiras.parar.is_set(), segundas.parar.is_set()), (True, False))


class OMotorDoCartaoMontado(unittest.TestCase):
    def test_as_esperas_das_tentativas_e_a_parada_do_motor_sao_as_das_esperas(self):
        fila = SimpleNamespace(motor=object(), logger=None, tranca=object())
        esperas = Esperas(da_openai=(0, 1))
        motor = motor_do_cartao(fila, ServicosDeFora(), esperas)
        self.assertEqual((motor.esperas.parar is esperas.parar, motor.esperas.segundos), (True, (0, 1)))


if __name__ == "__main__":
    unittest.main()
