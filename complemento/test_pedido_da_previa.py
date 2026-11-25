import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import previa_do_cartao
from complemento.nota_a_gravar import NotaAGravar
from complemento.test_colecao_em_memoria import ColecaoEmMemoria
from complemento.test_envio import EnvioNoTeste

MEU_TIPO = "Meu Inglês"
CAMPOS = ["Pergunta", "Resposta", "Anotações", "Som"]
MAPA = {"frase": "Pergunta", "resposta": "Resposta"}
COM_UMA_NOTA = {
    "baralhos": [{"nome": "Inglês", "notas": [{"guid": "guid-1", "tipo": "Básico", "campos": {"Frente": "She gave up", "Verso": "give up"}}]}],
    "tiposDeNota": {"Básico": ["Frente", "Verso"], MEU_TIPO: CAMPOS},
}
INDISPONIVEL = "anki_card_preview_unavailable"


class ColecaoQueNaoDesenhaCartao(ColecaoEmMemoria):
    def cartao_renderizado(self, tipo, campos):
        return None


class ColecaoQueDevolveArquivoGrande(ColecaoEmMemoria):
    def arquivo_de_midia(self, nome, teto):
        return b"\x89PNG" + b"0" * (previa_do_cartao.TETO_DA_IMAGEM + 1)


def responder(corpo, colecao=None):
    with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao or ColecaoEmMemoria(COM_UMA_NOTA)) as conexao:
        status, _, resposta = conexao.pedir("POST", "/anki/card-preview", corpo=corpo)
    return status, json.loads(resposta)


class AsRecusasDoPedidoDaPrevia(unittest.TestCase):
    RECUSAS = [
        ("corpo vazio", {}, "invalid_request"),
        ("guid vazio", {"guid": ""}, "invalid_request"),
        ("guid que não é texto", {"guid": 7}, "invalid_request"),
        ("idioma que não é texto", {"lang": 7}, "invalid_request"),
        ("guid e idioma juntos", {"guid": "guid-1", "lang": "en"}, "invalid_request"),
        ("guid nulo com idioma", {"guid": None, "lang": "en"}, "invalid_request"),
        ("idioma nulo com guid", {"guid": "guid-1", "lang": None}, "invalid_request"),
        ("idioma que o Anki não tem", {"lang": "fr"}, "invalid_lang"),
        ("nível que o idioma não tem", {"lang": "ru", "nivel": "mestre"}, "invalid_level"),
        ("nível que não é texto", {"lang": "en", "nivel": 3}, "invalid_level"),
        ("tipo próprio que não é um mapeamento", {"lang": "en", "tipoProprio": "Meu Inglês"}, "invalid_mapping"),
        ("tipo próprio nulo", {"lang": "en", "tipoProprio": None}, "invalid_mapping"),
        ("tipo próprio sem a resposta", {"lang": "en", "tipoProprio": {"nome": MEU_TIPO, "mapa": {"frase": "Pergunta"}}}, "invalid_mapping"),
        ("tipo próprio com a frase e a resposta no mesmo campo", {"lang": "en", "tipoProprio": {"nome": MEU_TIPO, "mapa": {"frase": "A", "resposta": "A"}}}, "invalid_mapping"),
    ]

    def test_cada_pedido_mal_feito_volta_400_com_o_motivo(self):
        for nome, corpo, motivo in self.RECUSAS:
            with self.subTest(nome):
                status, resposta = responder(corpo)
                self.assertEqual((status, resposta), (400, {"error": motivo}))

    def test_o_pedido_recusado_nem_chega_a_ler_a_colecao_fechada(self):
        for nome, corpo, motivo in self.RECUSAS:
            with self.subTest(nome):
                status, resposta = responder(corpo, ColecaoEmMemoria.fechada())
                self.assertEqual((status, resposta), (400, {"error": motivo}))


class OQueAPreviaDevolve(unittest.TestCase):
    def test_o_exemplo_sem_nivel_usa_o_nivel_padrao_e_nao_grava_nota(self):
        colecao = ColecaoEmMemoria(COM_UMA_NOTA)
        status, previa = responder({"lang": "en"}, colecao)
        self.assertEqual(status, 200)
        self.assertEqual((previa["source"], previa["lang"], previa["nivel"], previa["deck"], previa["noteType"]), ("example", "en", "iniciante", "PerpetualMiner::Inglês", "PerpetualMiner Inglês"))
        self.assertTrue(previa["front"] and previa["back"] and previa["css"])
        self.assertEqual(colecao.gravadas, [])

    def test_o_exemplo_de_outro_idioma_e_nivel_diz_de_onde_vem(self):
        status, previa = responder({"lang": "ru", "nivel": "iniciante"})
        self.assertEqual(status, 200)
        self.assertEqual((previa["source"], previa["lang"], previa["nivel"], previa["deck"], previa["noteType"]), ("example", "ru", "iniciante", "PerpetualMiner::Russo", "PerpetualMiner Russo"))

    def test_a_previa_de_uma_nota_gravada_traz_o_baralho_e_o_tipo_dela_e_nao_traz_idioma(self):
        status, previa = responder({"guid": "guid-1"})
        self.assertEqual(status, 200)
        self.assertEqual((previa["source"], previa["deck"], previa["noteType"]), ("note", "Inglês", "Básico"))
        self.assertNotIn("lang", previa)
        self.assertIn("She gave up", previa["front"])

    def test_a_previa_no_tipo_da_pessoa_diz_o_tipo_e_o_baralho_do_idioma(self):
        colecao = ColecaoEmMemoria(COM_UMA_NOTA)
        status, previa = responder({"lang": "en", "nivel": "iniciante", "tipoProprio": {"nome": MEU_TIPO, "mapa": MAPA}}, colecao)
        self.assertEqual(status, 200)
        self.assertEqual((previa["source"], previa["lang"], previa["nivel"], previa["deck"], previa["noteType"]), ("example", "en", "iniciante", "PerpetualMiner::Inglês", MEU_TIPO))
        self.assertNotIn("PerpetualMiner Inglês", colecao.tipos_de_nota())


class AImagemDaNotaNaPrevia(unittest.TestCase):
    def previa_com_a_imagem(self, colecao):
        previa_do_cartao.previa_do_exemplo(colecao, "en", "iniciante")
        campos = {"Frase": "a", "Imagem": '<img src="foto.png">'}
        colecao.adicionar_nota(NotaAGravar("PerpetualMiner::Inglês", "PerpetualMiner Inglês", campos, [], "guid-1", {"foto.png": b"\x89PNG"}))
        return previa_do_cartao.previa_da_nota(colecao, "guid-1")["back"]

    def test_a_imagem_que_cabe_vai_dentro_do_html(self):
        verso = self.previa_com_a_imagem(ColecaoEmMemoria(COM_UMA_NOTA))
        self.assertIn('<img src="data:image/png;base64,iVBORw==">', verso)

    def test_a_imagem_maior_que_o_teto_vira_o_espaco_da_imagem(self):
        verso = self.previa_com_a_imagem(ColecaoQueDevolveArquivoGrande(COM_UMA_NOTA))
        self.assertEqual(verso.count("data:image/svg+xml;base64,"), 1)
        self.assertNotIn("data:image/png", verso)


class OQueAPreviaDizQuandoNaoDa(unittest.TestCase):
    def test_a_nota_que_a_colecao_nao_tem_volta_404(self):
        self.assertEqual(responder({"guid": "nao-existe"}), (404, {"error": "note_not_found"}))

    def test_o_tipo_da_pessoa_que_a_colecao_nao_tem_volta_404(self):
        corpo = {"lang": "en", "tipoProprio": {"nome": "Apagado", "mapa": MAPA}}
        self.assertEqual(responder(corpo), (404, {"error": "note_type_missing"}))

    def test_o_mapeamento_com_um_campo_que_o_tipo_nao_tem_volta_409(self):
        corpo = {"lang": "en", "tipoProprio": {"nome": MEU_TIPO, "mapa": {"frase": "Pergunta", "resposta": "Verso"}}}
        self.assertEqual(responder(corpo), (409, {"error": "invalid_mapping"}))

    def test_o_anki_que_nao_desenha_o_cartao_diz_que_a_nota_ou_o_tipo_sumiu(self):
        colecao = lambda: ColecaoQueNaoDesenhaCartao(COM_UMA_NOTA)
        self.assertEqual(responder({"guid": "guid-1"}, colecao()), (404, {"error": "note_not_found"}))
        self.assertEqual(responder({"lang": "en"}, colecao()), (404, {"error": "note_type_missing"}))
        corpo = {"lang": "en", "tipoProprio": {"nome": MEU_TIPO, "mapa": MAPA}}
        self.assertEqual(responder(corpo, colecao()), (404, {"error": "note_type_missing"}))

    def test_sem_colecao_aberta_cada_pedido_volta_503_com_o_motivo_do_anki(self):
        corpos = [{"guid": "guid-1"}, {"lang": "en"}, {"lang": "en", "tipoProprio": {"nome": MEU_TIPO, "mapa": MAPA}}]
        for corpo in corpos:
            with self.subTest(corpo):
                status, resposta = responder(corpo, ColecaoEmMemoria.fechada())
                self.assertEqual((status, resposta["error"]), (503, INDISPONIVEL))
                self.assertTrue(resposta["detail"])


if __name__ == "__main__":
    unittest.main()
