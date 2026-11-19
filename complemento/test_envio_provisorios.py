"""O provisório `.novo` que a morte da Conexão deixa (`gravacao_de_json.apagar_os_provisorios`): sai na subida seguinte.

    python3.9 complemento/test_envio_provisorios.py
"""

import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import gravacao_de_json
from complemento.test_envio import ID, LINHA, OUTRO_ID, PALAVRA, EnvioNoTeste, apagar_as_frases, pedido


def os_novos(pasta):
    return sorted(os.path.relpath(os.path.join(raiz, nome), pasta) for raiz, _, nomes in os.walk(pasta) for nome in nomes if nome.endswith(".novo"))


class OProvisorioDaMorteSaiNaSubida(unittest.TestCase):
    def test_o_provisorio_novo_que_a_morte_deixou_sai_na_subida_e_a_frase_nao_sobra_depois_do_envio_concluido(self):
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
                com_a_palavra = [nome for nome, c in conexao.arquivos().items() if PALAVRA.encode() in c]
            restos = os_novos(pasta)
        self.assertEqual(antes, len(sobras), "a prova só vale se os provisórios estavam lá")
        self.assertEqual(estado["status"], "completed")
        self.assertEqual(restos, [])
        self.assertEqual(com_a_palavra, [], "a Palavra não sobra em nenhum arquivo da Conexão depois do Envio concluído")

    def test_um_provisorio_que_nao_da_para_apagar_nao_impede_a_thread_de_trabalho_nem_os_outros_de_sair(self):
        # Um arquivo aberto por outro programa (o Windows recusa apagar) levanta `PermissionError`: o provisório que ninguém lê não
        # pode custar o Envio da sessão inteira, e os outros provisórios saem mesmo assim.
        with tempfile.TemporaryDirectory() as pasta:
            with EnvioNoTeste(pasta, trabalhando=False) as conexao:
                conexao.criar(pedido(ID, LINHA))
            preso = os.path.join(pasta, "fila", "fila.json.preso1.novo")
            solto = os.path.join(pasta, "estado", ID, "1.txt.solto1.novo")
            os.makedirs(os.path.dirname(solto), exist_ok=True)
            for caminho in (preso, solto):
                with open(caminho, "wb") as arquivo:
                    arquivo.write(LINHA.encode())
            remover = os.remove

            def remover_menos_o_preso(caminho, *argumentos, **nomeados):
                if os.fspath(caminho) == preso:
                    raise PermissionError(13, "Permission denied", preso)
                return remover(caminho, *argumentos, **nomeados)

            with mock.patch("os.remove", remover_menos_o_preso):
                with EnvioNoTeste(pasta) as conexao:
                    estado = conexao.esperar(ID)
                    log = conexao.log()
            restos = os_novos(pasta)
        self.assertEqual(estado["status"], "completed")
        self.assertEqual(restos, [os.path.relpath(preso, pasta)])
        self.assertIn("não deu para apagar o arquivo fila.json.preso1.novo", log)
        self.assertNotIn(PALAVRA, log)

    def test_um_texto_de_envio_apagado_que_nao_da_para_apagar_nao_impede_a_subida_nem_o_envio_vivo(self):
        with tempfile.TemporaryDirectory() as pasta:
            with EnvioNoTeste(pasta, trabalhando=False) as conexao:
                conexao.criar(pedido(ID, LINHA))
                apagar_as_frases(conexao)
                conexao.criar(pedido(OUTRO_ID, LINHA))
            preso = os.path.join(pasta, "estado", ID, "1760000000000-0.txt")
            os.makedirs(os.path.dirname(preso), exist_ok=True)
            with open(preso, "wb") as arquivo:
                arquivo.write(LINHA.encode())
            remover = os.remove

            def remover_menos_o_preso(caminho, *argumentos, **nomeados):
                if os.fspath(caminho) == preso:
                    raise PermissionError(13, "Permission denied", preso)
                return remover(caminho, *argumentos, **nomeados)

            with mock.patch("os.remove", remover_menos_o_preso):
                with EnvioNoTeste(pasta) as conexao:
                    estado = conexao.esperar(OUTRO_ID)
                    log = conexao.log()
            ficou = os.path.exists(preso)
        self.assertEqual(estado["status"], "completed")
        self.assertTrue(ficou, "a prova só vale se o texto ficou preso")
        self.assertIn("não deu para apagar o arquivo 1760000000000-0.txt", log)
        self.assertNotIn(PALAVRA, log)

    def test_a_subida_apaga_o_texto_do_envio_apagado_e_mantem_o_do_envio_vivo(self):
        with tempfile.TemporaryDirectory() as pasta:
            with EnvioNoTeste(pasta, trabalhando=False) as conexao:
                conexao.criar(pedido(ID, LINHA))
                apagar_as_frases(conexao)
                conexao.criar(pedido(OUTRO_ID, LINHA))
                textos = {job: os.path.join(pasta, "estado", job, "1760000000000-0.txt") for job in (ID, OUTRO_ID)}
                for caminho in textos.values():
                    os.makedirs(os.path.dirname(caminho), exist_ok=True)
                    with open(caminho, "wb") as arquivo:
                        arquivo.write(LINHA.encode())
                gravacao_de_json.limpar_ao_subir(conexao.conexao.dados, conexao.conexao.fila.estado)
            sobrou = {job: os.path.exists(caminho) for job, caminho in textos.items()}
        self.assertEqual(sobrou, {ID: False, OUTRO_ID: True})


if __name__ == "__main__":
    unittest.main()
