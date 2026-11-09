"""O teto de Frases de um Envio (#243): o criar recusa o que passa dele e não grava nada.

    python3.9 complemento/test_envio_teto.py
"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.pedido_do_envio import MAXIMO_DE_FRASES  # noqa: E402
from complemento.test_envio import ID, OUTRO_ID, EnvioNoTeste, pedido  # noqa: E402

LINHA = "give up : She gave up smoking"


class TetoDeFrases(unittest.TestCase):
    def test_um_envio_com_frases_demais_e_recusado_e_nada_e_gravado(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, trabalhando=False) as conexao:
            recusa = conexao.criar(pedido(OUTRO_ID, *[LINHA] * (MAXIMO_DE_FRASES + 1)))
            aceito = conexao.criar(pedido(ID, *[LINHA] * MAXIMO_DE_FRASES))
            lista = json.loads(conexao.pedir("POST", "/jobs/list", corpo={})[2])["jobs"]
            gravados = sorted(os.listdir(os.path.join(pasta, "fila")))
        self.assertEqual((recusa, aceito), ((413, {"error": "too_many_entries"}), (201, {"jobId": ID, "status": "queued"})))
        self.assertEqual([envio["jobId"] for envio in lista], [ID])
        self.assertNotIn(OUTRO_ID + ".json", gravados)


if __name__ == "__main__":
    unittest.main()
