"""O provisório `.novo` que a morte da Conexão deixa (`gravacao_de_json.apagar_os_provisorios`): sai na subida seguinte.

    python3.9 complemento/test_envio_provisorios.py
"""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_envio import ID, LINHA, EnvioNoTeste, pedido  # noqa: E402


def os_novos(pasta):
    return sorted(os.path.relpath(os.path.join(raiz, nome), pasta) for raiz, _, nomes in os.walk(pasta) for nome in nomes if nome.endswith(".novo"))


class OProvisorioDaMorteSaiNaSubida(unittest.TestCase):
    def test_o_provisorio_novo_que_a_morte_deixou_sai_na_subida_e_a_frase_nao_sobra_depois_do_envio_concluido(self):
        # A Conexão morreu entre escrever o provisório e renomeá-lo (#318: o nome é único por gravação, então nenhuma gravação
        # seguinte o reescreve): sem a limpeza na subida, a Frase ficaria em `fila/` para sempre, mesmo com o Envio concluído.
        with tempfile.TemporaryDirectory() as pasta:
            with EnvioNoTeste(pasta, trabalhando=False) as conexao:
                conexao.criar(pedido(ID, LINHA))
            with open(os.path.join(pasta, "fila", ID + ".json"), "rb") as arquivo:
                conteudo = arquivo.read()
            sobras = [("fila", ID + ".json.mzg1xqcn.novo"), ("fila", "fila.json.k2d9aa.novo"), ("estado", ID + ".json.q8w7e6.novo"),
                      ("estado", ID, "1.txt.r5t4y3.novo"), ("custos", ID, "custos.jsonl.u2i1o0.novo")]
            for partes in sobras:
                caminho = os.path.join(pasta, *partes)
                os.makedirs(os.path.dirname(caminho), exist_ok=True)
                with open(caminho, "wb") as arquivo:
                    arquivo.write(conteudo)
            antes = len(os_novos(pasta))
            with EnvioNoTeste(pasta) as conexao:
                estado = conexao.esperar(ID)
            restos = os_novos(pasta)
        self.assertEqual(antes, len(sobras), "a prova só vale se os provisórios estavam lá")
        self.assertEqual(estado["status"], "completed")
        self.assertEqual(restos, [])


if __name__ == "__main__":
    unittest.main()
