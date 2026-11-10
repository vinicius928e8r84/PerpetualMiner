"""O navegador que a pessoa desconectou no Anki (#192): a Conexão guarda o segredo revogado (até 20) só para provar, no `conferir`, que foi ela que o
desconectou (`401 pairing_revoked` com a prova da revogação). O segredo revogado não assina pedido nenhum. Servidor real por HTTP, como `test_pareamento.py`.

    python3.9 complemento/test_pareamento_revogado.py
"""

import base64
import os
import stat
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import pareamento  # noqa: E402
from complemento.test_pareamento_de_mentira import (  # noqa: E402
    _CONTRATO, CLIENTE, DESAFIO, OUTRO_CLIENTE, OUTRO_SEGREDO, SEGREDO, UM_CLIENTE_NOVO, arquivo_do_pareamento, cabecalhos_assinados, comecar, concluir, json_de, segredo_em_base64, semear,
)
from complemento.test_servidor import ConexaoNoTeste  # noqa: E402

VETOR_DA_REVOGACAO = _CONTRATO["vetorDaRevogacao"]


def conferir(conexao, cliente=CLIENTE, desafio=DESAFIO):
    status, cabecalhos, corpo = conexao.pedir("POST", "/pareamento/conferir", corpo={"cliente": cliente, "desafio": desafio}, assinar=False)
    return status, json_de(corpo), cabecalhos


class OConferirDeQuemFoiDesconectado(unittest.TestCase):
    def test_o_navegador_desconectado_recebe_401_com_a_prova_da_revogacao_que_so_o_segredo_antigo_da(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            conexao.conexao.pareamento.desconectar()
            status, resposta, cabecalhos = conferir(conexao)
            outro_desafio = conferir(conexao, desafio="outro-desafio-0123456789abcdef")[1]
        self.assertEqual((status, resposta["error"]), (401, "pairing_revoked"))
        self.assertEqual(resposta["prova"], pareamento.prova_da_revogacao(SEGREDO, DESAFIO))
        self.assertNotEqual(resposta["prova"], outro_desafio["prova"])
        self.assertNotIn("sessao", resposta)
        self.assertNotIn(pareamento.CABECALHO_DA_PROVA, cabecalhos)

    def test_o_vetor_do_contrato_da_a_mesma_prova_da_revogacao_que_o_webcrypto_deu(self):
        vetor = VETOR_DA_REVOGACAO
        self.assertEqual(pareamento.prova_da_revogacao(base64.b64decode(vetor["segredo"]), vetor["desafio"]), vetor["prova"])

    def test_a_prova_da_revogacao_nao_serve_de_nenhuma_outra_prova(self):
        segredo = b"s" * 32
        provas = {
            pareamento.prova_da_revogacao(segredo, "nonce-00"),
            pareamento.prova_do_servidor(segredo, "nonce-00", ""),
            pareamento.prova_do_servidor(segredo, "nonce-00", "sessao"),
            pareamento.prova_da_resposta(segredo, "sessao", "nonce-00", 401, b""),
        }
        self.assertEqual(len(provas), 4)

    def test_quem_a_conexao_nunca_conheceu_segue_sem_prova_nenhuma(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            conexao.conexao.pareamento.desconectar()
            status, resposta, _ = conferir(conexao, cliente=UM_CLIENTE_NOVO)
        self.assertEqual((status, resposta), (401, {"error": "pairing_required"}))

    def test_o_segredo_revogado_nao_assina_pedido_nenhum(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            sessao = conexao.conexao.pareamento.sessao
            conexao.conexao.pareamento.desconectar()
            status, _, corpo = conexao.pedir("POST", "/ia/estado", corpo={}, assinar=False, cabecalhos=cabecalhos_assinados(sessao, "POST", "/ia/estado", b"{}"))
        self.assertEqual((status, json_de(corpo)), (401, {"error": "pairing_required"}))

    def test_o_arquivo_com_os_revogados_segue_so_do_dono_e_a_lista_dos_pareados_fica_vazia(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            conexao.conexao.pareamento.desconectar()
            dados = arquivo_do_pareamento(conexao)
            modo = stat.S_IMODE(os.stat(os.path.join(conexao.pasta, "pareamento.json")).st_mode)
            quantos = conexao.conexao.pareamento.quantos()
        self.assertEqual((dados["clientes"], [linha["cliente"] for linha in dados["revogados"]], quantos), ([], [CLIENTE], 0))
        if os.name == "posix":
            self.assertEqual(modo, 0o600)

    def test_pareado_de_novo_o_navegador_deixa_de_estar_revogado_e_os_outros_revogados_ficam(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            semear(os.path.join(pasta, "pareamento.json"), ((CLIENTE, SEGREDO), (OUTRO_CLIENTE, OUTRO_SEGREDO)))
            conexao.conexao.pareamento.desconectar()
            comecar(conexao)
            concluir(conexao, cliente=CLIENTE)
            depois = conferir(conexao)
            do_outro = conferir(conexao, cliente=OUTRO_CLIENTE)
            dados = arquivo_do_pareamento(conexao)
        self.assertEqual(depois[0], 200)
        self.assertEqual((do_outro[0], do_outro[1]["error"]), (401, "pairing_revoked"))
        self.assertEqual([linha["cliente"] for linha in dados["revogados"]], [OUTRO_CLIENTE])

    def test_a_conexao_guarda_no_maximo_vinte_revogados_e_esquece_os_mais_antigos(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            p = conexao.conexao.pareamento
            clientes = ["%08x-0000-4000-8000-000000000000" % n for n in range(pareamento.MAXIMO_DE_REVOGADOS + 3)]
            for cliente in clientes:
                p._gravar([{"cliente": cliente, "segredo": segredo_em_base64(SEGREDO)}])   # `semear` apagaria os revogados
                p.desconectar()
            primeiro, ultimo = conferir(conexao, cliente=clientes[0])[1], conferir(conexao, cliente=clientes[-1])[1]
            guardados = len(arquivo_do_pareamento(conexao)["revogados"])
        self.assertEqual((guardados, primeiro, ultimo["error"]), (pareamento.MAXIMO_DE_REVOGADOS, {"error": "pairing_required"}, "pairing_revoked"))

    def test_o_pareamento_de_quem_nao_foi_desconectado_nao_toca_nos_revogados(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            conexao.conexao.pareamento.desconectar()
            comecar(conexao)
            concluir(conexao)
            revogados = [linha["cliente"] for linha in arquivo_do_pareamento(conexao)["revogados"]]
        self.assertEqual(revogados, [CLIENTE])


if __name__ == "__main__":
    unittest.main()
