"""O Motor do Cartão (C4) sem o Envio: `montar` com o motor do complemento, a voz do Google de mentira e a IA dos cartões de um roteiro.

    python3.9 complemento/test_motor_do_cartao.py
"""

import logging
import os
import sys
import tempfile
import threading
import unittest
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import motor_do_envio, voz
from complemento.motor_do_cartao import Cartao, MotorDoCartao
from complemento.test_voz_de_mentira import VozDeMentira, audio_de_mentira

TEXTO = """Front: She *gave up* smoking last year.

Back: gave up - /ipa/

Pronunciation: pronúncia de mentira

Literal: literal de mentira

Natural: tradução de mentira

Gist: cena de mentira.

Image: A gave up, no text.
"""


LOGGER = logging.getLogger("test_motor_do_cartao")
LOGGER.addHandler(logging.NullHandler())
LOGGER.propagate = False


class IaDeRoteiro:
    """A IA dos cartões de um teste: sem chave nem plano, e guarda o que o Motor pediu a ela."""

    def __init__(self):
        self.pedidos = []

    def para_a_fala(self):
        self.pedidos.append("fala")
        return None

    def para_a_imagem(self, pela_chave=False):
        self.pedidos.append(("imagem", pela_chave))
        return None, None


def montar(pasta, voz_base, ia, reserva=None):
    """`(o que montar devolveu ou a ErroDaVoz, as Etapas avisadas, os arquivos da pasta)`."""
    motor = motor_do_envio.motor_do_complemento()
    tts = {} if reserva is None else {"reserva": reserva}
    pedido = {"lang": "en", "deckName": "Inglês", "jobId": "j1", "tts": tts, "imageSource": "1"}
    fila = SimpleNamespace(dados=SimpleNamespace(raiz=pasta), pasta_dos_textos=lambda job_id: os.path.join(pasta, "textos"),
                           pasta_dos_custos=lambda job_id: os.path.join(pasta, "custos"))
    config = motor_do_envio.configuracao_do_motor(motor, fila, pedido, None)
    cartao = Cartao(id="7-0", guid="pmguid", linha="gave up : She gave up smoking last year.", pedido=pedido, config=config, pela_chave=True, job_id="j1")
    motor_do_cartao = MotorDoCartao(motor, LOGGER, threading.RLock(), threading.Event(), "http://127.0.0.1:9",
                                    voz_base, "http://127.0.0.1:9", esperas_da_openai=())
    avisos = []
    try:
        resultado = motor_do_cartao.montar(cartao, TEXTO, ia, avisos.append)
    except voz.ErroDaVoz as erro:
        resultado = erro
    arquivos = sorted(os.path.relpath(os.path.join(raiz, nome), pasta) for raiz, _, nomes in os.walk(pasta) for nome in nomes)
    return resultado, avisos, arquivos


class Montar(unittest.TestCase):
    def test_montar_da_a_nota_com_as_duas_vozes_sem_nada_no_disco_e_montar_de_novo_da_a_mesma_nota(self):
        with tempfile.TemporaryDirectory() as pasta, VozDeMentira() as voz_do_google:
            primeiro, avisos, arquivos = montar(pasta, voz_do_google.base, IaDeRoteiro())
            segundo, _, _ = montar(pasta, voz_do_google.base, IaDeRoteiro())
        nota, midia = primeiro
        self.assertEqual(midia, {"pmguid_word.mp3": audio_de_mentira("com", "en", "gave up"),
                                 "pmguid_phrase.mp3": audio_de_mentira("co.uk", "en", "She gave up smoking last year.")})
        self.assertIn("[sound:pmguid_phrase.mp3]", nota["campos"]["Áudio da frase"])
        self.assertIn("[sound:pmguid_word.mp3]", nota["campos"]["Áudio da palavra"])
        self.assertEqual((avisos, arquivos), (["generate_audio", "generate_images"], []))
        self.assertEqual(segundo, primeiro)

    def test_a_imagem_e_pedida_a_porta_com_o_usar_a_minha_chave_do_cartao_e_sem_juiz_o_cartao_vai_sem_imagem(self):
        ia = IaDeRoteiro()
        with tempfile.TemporaryDirectory() as pasta, VozDeMentira() as voz_do_google:
            (nota, midia), _, _ = montar(pasta, voz_do_google.base, ia)
        self.assertEqual(ia.pedidos, [("imagem", True)])
        self.assertEqual(sorted(midia), ["pmguid_phrase.mp3", "pmguid_word.mp3"])
        self.assertNotIn("<img", "".join(nota["campos"].values()))

    def test_a_voz_recusada_sem_reserva_sobe_com_o_codigo_e_a_imagem_nem_e_pedida(self):
        ia = IaDeRoteiro()
        with tempfile.TemporaryDirectory() as pasta, VozDeMentira() as voz_do_google:
            voz_do_google.recusar("*", 400)
            erro, avisos, arquivos = montar(pasta, voz_do_google.base, ia, reserva=[])
        self.assertIsInstance(erro, voz.ErroDaVoz)
        self.assertEqual((avisos, ia.pedidos, arquivos), (["generate_audio"], [], []))

    def test_sem_a_chave_na_porta_a_voz_de_reserva_nao_fala_e_vale_a_falha_do_google(self):
        ia = IaDeRoteiro()
        with tempfile.TemporaryDirectory() as pasta, VozDeMentira() as voz_do_google:
            voz_do_google.recusar("*", 400)
            erro, _, arquivos = montar(pasta, voz_do_google.base, ia)
        self.assertIsInstance(erro, voz.ErroDaVoz)
        self.assertEqual((ia.pedidos[:1], arquivos), (["fala"], []))


if __name__ == "__main__":
    unittest.main()
