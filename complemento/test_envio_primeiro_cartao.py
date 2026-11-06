"""O primeiro Cartão da Boas-vindas (#173), visto de fora: o servidor real com a thread de trabalho ligada e a coleção em memória. O teste confere o
que fica na coleção (a etiqueta da Frase de teste, o Cartão que não dobra ao repetir o passo) e o que atravessa HTTP (o `guid` do Cartão no estado do
Envio, a prévia dele e o “Abrir no Anki”).

    python3.9 complemento/test_envio_primeiro_cartao.py
"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_contrato_da_criacao import ANKI_EM_INGLES  # noqa: E402
from complemento.test_envio import ID, OUTRO_ID, EnvioNoTeste, pedido  # noqa: E402

FRASE = "gave up : She gave up smoking [Context: Série - The Office - S01E01]"
# As Frases de teste que a extensão manda (`painel-boas-vindas-envio.js`), com o contexto no formato que o painel escreve.
CONTEXTO = "[Contexto: Teste - Boas-vindas - Primeiro cartão]"
DE_TESTE = "give up : She gave up smoking last year. " + CONTEXTO
DE_TESTE_RUSSA = "приходила : Она приходила вчера. " + CONTEXTO
BARALHO = "PerpetualMiner::Inglês"


def enviar(corpo, colecao=None, id_=ID):
    """Faz o Envio inteiro e devolve o estado, a coleção e o que a Conexão respondeu ao pedir de novo o mesmo Envio."""
    colecao = colecao or ColecaoEmMemoria(ANKI_EM_INGLES)
    with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
        conexao.criar(dict(corpo, jobId=id_))
        estado = conexao.esperar(id_)
        de_novo = conexao.criar(dict(corpo, jobId=id_))
    return estado, colecao, de_novo


class AFraseDeTesteTemEtiquetaPropria(unittest.TestCase):
    def test_o_cartao_da_frase_de_teste_leva_a_etiqueta_perpetualminer_teste_e_as_dela(self):
        _, colecao, _ = enviar(dict(pedido(ID, DE_TESTE, baralho=BARALHO), teste=True))
        self.assertEqual(len(colecao.gravadas), 1)
        etiquetas = colecao.gravadas[0]["etiquetas"]
        self.assertEqual((etiquetas[0], etiquetas[-1]), ("perpetual_miner", "perpetualminer-teste"))
        self.assertEqual(etiquetas.count("perpetualminer-teste"), 1)

    def test_o_cartao_de_uma_frase_minerada_nao_leva_a_etiqueta_de_teste(self):
        _, colecao, _ = enviar(pedido(ID, FRASE, baralho=BARALHO))
        self.assertNotIn("perpetualminer-teste", colecao.gravadas[0]["etiquetas"])

    def test_teste_que_nao_e_verdadeiro_ou_falso_e_recusado(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, trabalhando=False) as conexao:
            status, resposta = conexao.criar(dict(pedido(ID, DE_TESTE), teste="sim"))
        self.assertEqual((status, resposta), (400, {"error": "invalid_request"}))

    def test_o_custo_do_cartao_de_teste_entra_nos_custos_como_o_de_qualquer_envio(self):
        colecao = ColecaoEmMemoria(ANKI_EM_INGLES)
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.criar(dict(pedido(ID, DE_TESTE, baralho=BARALHO), teste=True))
            conexao.esperar(ID)
            _, _, corpo = conexao.pedir("POST", "/analytics/jobs", corpo={"lang": "all"})
        self.assertEqual([linha["jobId"] for linha in json.loads(corpo)["jobs"]], [ID])


class AFraseDeTesteDeCadaIdiomaViraCartao(unittest.TestCase):
    def test_a_frase_de_teste_do_russo_vira_um_cartao_com_a_etiqueta_no_baralho_do_russo(self):
        colecao = ColecaoEmMemoria(ANKI_EM_INGLES)
        estado, colecao, _ = enviar(dict(pedido(ID, DE_TESTE_RUSSA, lang="ru", baralho="PerpetualMiner::Russo"), teste=True), colecao)
        self.assertEqual((estado["status"], len(colecao.gravadas)), ("completed", 1))
        self.assertEqual((colecao.gravadas[0]["baralho"], colecao.gravadas[0]["tipo"]), ("PerpetualMiner::Russo", "PerpetualMiner Russo"))
        self.assertIn("perpetualminer-teste", colecao.gravadas[0]["etiquetas"])

    def test_a_frase_de_teste_do_ingles_tem_a_palavra_e_o_contexto_dela(self):
        _, colecao, _ = enviar(dict(pedido(ID, DE_TESTE, baralho=BARALHO), teste=True))
        self.assertEqual(colecao.gravadas[0]["campos"]["Palavra"].split(" - ")[0], "give up")


class RepetirOPassoNaoDuplicaNada(unittest.TestCase):
    def test_repetir_o_mesmo_envio_nao_cria_outro_cartao_nem_outro_baralho(self):
        estado, colecao, de_novo = enviar(dict(pedido(ID, DE_TESTE, baralho=BARALHO), teste=True))
        self.assertEqual(de_novo[0], 201)
        self.assertEqual(len(colecao.gravadas), 1)
        self.assertEqual(colecao.nomes_dos_baralhos().count(BARALHO), 1)
        self.assertEqual(estado["status"], "completed")

    def test_tentar_de_novo_depois_de_chegar_ao_anki_nao_dobra_o_cartao(self):
        colecao = ColecaoEmMemoria(ANKI_EM_INGLES)
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.criar(dict(pedido(ID, DE_TESTE, baralho=BARALHO), teste=True))
            conexao.esperar(ID)
            conexao.pedir("POST", "/jobs/retry", corpo={"jobId": ID})
            conexao.esperar(ID)
            self.assertEqual(len(colecao.gravadas), 1)


class OCartaoEnviadoSeMostraEAbreNoAnki(unittest.TestCase):
    def test_o_cartao_adicionado_diz_o_guid_da_nota_e_a_previa_e_o_abrir_no_anki_a_acham(self):
        colecao = ColecaoEmMemoria(ANKI_EM_INGLES)
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.criar(dict(pedido(ID, DE_TESTE, baralho=BARALHO), teste=True))
            estado = conexao.esperar(ID)
            guid = next(iter(estado["cards"].values()))["guid"]
            previa = conexao.pedir("POST", "/anki/card-preview", corpo={"guid": guid})
            abrir = conexao.pedir("POST", "/anki/browse", corpo={"guid": guid})
            nao_acha = conexao.pedir("POST", "/anki/browse", corpo={"guid": "nao-existe"})
        self.assertEqual(guid, colecao.gravadas[0]["guid"])
        self.assertEqual(previa[0], 200)
        self.assertEqual((abrir[0], json.loads(abrir[2])), (200, {"ok": True}))
        self.assertEqual(colecao.navegador_aberto, [guid])
        self.assertEqual((nao_acha[0], json.loads(nao_acha[2])), (404, {"error": "note_not_found"}))

    def test_outro_envio_tem_outro_guid(self):
        a, _, _ = enviar(pedido(ID, DE_TESTE, baralho=BARALHO))
        b, _, _ = enviar(pedido(OUTRO_ID, DE_TESTE, baralho=BARALHO), id_=OUTRO_ID)
        self.assertNotEqual(next(iter(a["cards"].values()))["guid"], next(iter(b["cards"].values()))["guid"])


if __name__ == "__main__":
    unittest.main()
