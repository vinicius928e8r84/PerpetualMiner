"""A troca da frente do Cartão (#166), vista de fora: o servidor real com a thread de trabalho ligada, a coleção em memória e a OpenAI, a voz e o
Openverse de mentira. A troca só reescreve o modelo de Cartão do tipo de nota do idioma: o teste confere o que fica na coleção (as notas, os campos, o
modelo) e que nada atravessa para a IA, a voz nem a busca de fotos.

    python3.9 complemento/test_frente_do_cartao.py
"""

import contextlib
import json
import os
import re
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import tipo_de_nota  # noqa: E402
from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_contrato_da_criacao import SO_O_DEFAULT  # noqa: E402
from complemento.test_envio import ID, OUTRO_ID, EnvioNoTeste, pedido  # noqa: E402

FRASE = "gave up : She gave up smoking [Context: Série - The Office - S01E01]"
INGLES = "PerpetualMiner Inglês"
ROTA = "/anki/card-front"


def trocar(conexao, lang, frente):
    status, _, corpo = conexao.pedir("POST", ROTA, corpo={"lang": lang, "frente": frente})
    return status, json.loads(corpo)


def modelo_do(conexao, tipo=INGLES):
    [modelo] = conexao.conexao.colecao.modelos_do_tipo_de_nota(tipo)
    return modelo


def chamadas_de_fora(conexao):
    """O que a Conexão pediu à IA, à voz e à busca de fotos."""
    return (len(conexao.openai.pedidos), conexao.voz.pedidos[:], conexao.openverse.buscas[:])


@contextlib.contextmanager
def com_um_cartao_enviado():
    """A Conexão com a coleção nova e um Cartão do inglês já enviado (o que a troca de frente não pode tocar)."""
    with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=ColecaoEmMemoria(SO_O_DEFAULT)) as conexao:
        conexao.criar(pedido(ID, FRASE, baralho="PerpetualMiner::Inglês"))
        conexao.esperar(ID)
        yield conexao


class TrocarAFrenteSoEditaOModelo(unittest.TestCase):
    def test_trocar_a_frente_reescreve_so_o_modelo_sem_nota_nova_nem_chamada_a_ia_a_voz_ou_as_fotos(self):
        with com_um_cartao_enviado() as conexao:
            colecao = conexao.conexao.colecao
            notas, cartoes, campos = list(colecao.gravadas), colecao.cartoes_do_baralho("PerpetualMiner::Inglês"), colecao.tipo_de_nota(INGLES)
            fora = chamadas_de_fora(conexao)
            self.assertEqual(trocar(conexao, "en", "lacuna"), (200, {"ok": True}))
            self.assertEqual(modelo_do(conexao), tipo_de_nota.definicao("en", frente="lacuna")["modelos"][0])
            self.assertEqual(
                (colecao.gravadas, colecao.cartoes_do_baralho("PerpetualMiner::Inglês"), colecao.tipo_de_nota(INGLES), chamadas_de_fora(conexao)),
                (notas, cartoes, campos, fora))

    def test_o_cartao_enviado_antes_da_troca_ja_tem_os_campos_que_a_frente_lacuna_mostra(self):
        with com_um_cartao_enviado() as conexao:
            trocar(conexao, "en", "lacuna")
            campos = conexao.conexao.colecao.gravadas[0]["campos"]
            frente = modelo_do(conexao)["frente"]
        for citado in set(re.findall(r"\{\{[#^/]?([^{}]+)\}\}", frente)) - {"Frase"}:
            self.assertIn(citado, campos, "a frente Lacuna cita o campo %r e o Cartão não o grava" % citado)
        self.assertNotIn("gave up", campos["Frase com lacuna"])
        self.assertNotIn("Áudio da frase", frente)

    def test_o_envio_seguinte_a_troca_grava_a_nota_no_mesmo_tipo_de_nota_e_com_o_mesmo_modelo(self):
        with com_um_cartao_enviado() as conexao:
            trocar(conexao, "en", "ouvir_primeiro")
            conexao.criar(pedido(OUTRO_ID, "late : She is always late for work", baralho="PerpetualMiner::Inglês"))
            self.assertEqual(conexao.esperar(OUTRO_ID)["status"], "completed")
            self.assertEqual([nota["tipo"] for nota in conexao.conexao.colecao.gravadas], [INGLES, INGLES])
            self.assertEqual(modelo_do(conexao)["nome"], "Ouvir primeiro")

    def test_repetir_o_pedido_responde_igual_e_nao_muda_nada(self):
        with com_um_cartao_enviado() as conexao:
            primeira = trocar(conexao, "en", "lacuna")
            modelo = modelo_do(conexao)
            self.assertEqual(trocar(conexao, "en", "lacuna"), primeira)
            self.assertEqual(modelo_do(conexao), modelo)

    def test_cada_idioma_guarda_a_sua_frente(self):
        with com_um_cartao_enviado() as conexao:
            trocar(conexao, "en", "lacuna")
            trocar(conexao, "ru", "ouvir_primeiro")
            self.assertEqual((modelo_do(conexao)["nome"], modelo_do(conexao, "PerpetualMiner Russo")["nome"]), ("Lacuna", "Ouvir primeiro"))

    def test_com_o_anki_na_tela_de_perfis_a_frente_nao_troca(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=ColecaoEmMemoria.fechada()) as conexao:
            self.assertEqual(trocar(conexao, "en", "lacuna"), (503, {"error": "anki_card_front_unavailable", "detail": "collection_not_open"}))

    def test_a_frente_imagem_primeiro_nao_existe(self):
        with com_um_cartao_enviado() as conexao:
            antes = modelo_do(conexao)
            self.assertEqual(trocar(conexao, "en", "imagem_primeiro"), (400, {"error": "invalid_front"}))
            self.assertEqual(modelo_do(conexao), antes)
        self.assertEqual(tipo_de_nota.FRENTES, ("frase_com_audio", "ouvir_primeiro", "lacuna"))


if __name__ == "__main__":
    unittest.main()
