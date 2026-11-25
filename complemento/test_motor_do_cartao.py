import logging
import os
import sys
import tempfile
import threading
import unittest
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import motor_do_envio, voz
from complemento.ia_do_envio import SemQuemPague
from complemento.motor.provedores import ErroDoProvedor
from complemento.audio_do_cartao import AudioDoCartao, VozDeReserva, VozDoGoogle
from complemento.imagem_do_cartao import ImagemDoCartao
from complemento.motor_do_cartao import Cartao, EsperasDaOpenai, MotorDoCartao
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
    def __init__(self, *respostas, parado=None):
        self.pedidos, self.respostas, self.parado = [], list(respostas), parado

    def pedido_do_texto(self, config):
        self.pedidos.append("texto")
        if self.parado:
            raise SemQuemPague(self.parado)

        def pedir(sistema, mensagem, rotulo):
            self.pedidos.append(("pedir", rotulo))
            resposta = self.respostas.pop(0)
            if isinstance(resposta, Exception):
                raise resposta
            return resposta

        return pedir

    def esperar_o_plano(self):
        self.pedidos.append("esperar o plano")

    def para_a_fala(self):
        self.pedidos.append("fala")
        return None

    def para_a_imagem(self):
        self.pedidos.append("imagem")
        return None, None


class ParadaDeRoteiro:
    def __init__(self):
        self.esperas = []

    def wait(self, segundos):
        self.esperas.append(segundos)
        return False


def o_motor_do_cartao(motor, voz_base, esperas):
    audio = AudioDoCartao(motor, LOGGER, VozDoGoogle(voz_base, esperas), VozDeReserva("http://127.0.0.1:9", threading.RLock(), LOGGER))
    return MotorDoCartao(motor, esperas, audio, ImagemDoCartao(motor, LOGGER, "http://127.0.0.1:9"))


def cartao_e_motor(pasta, voz_base="http://127.0.0.1:9/{tld}", reserva=None):
    motor = motor_do_envio.motor_do_complemento()
    tts = {} if reserva is None else {"reserva": reserva}
    linha = "gave up : She gave up smoking last year."
    pedido = {"lang": "en", "deckName": "Inglês", "jobId": "j1", "tts": tts, "imageSource": "1",
              "entries": [{"phraseId": 7, "line": linha, "keywords": ["gave up"]}]}
    fila = SimpleNamespace(dados=SimpleNamespace(raiz=pasta), pasta_dos_textos=lambda job_id: os.path.join(pasta, "textos"),
                           pasta_dos_custos=lambda job_id: os.path.join(pasta, "custos"))
    config = motor_do_envio.configuracao_do_motor(motor, fila, pedido)
    cartao = Cartao(id="7-0", guid="pmguid", linha=linha, pedido=pedido, config=config, job_id="j1")
    return cartao, o_motor_do_cartao(motor, voz_base, EsperasDaOpenai(threading.Event(), (0,)))


def arquivos_da(pasta):
    return sorted(os.path.relpath(os.path.join(raiz, nome), pasta) for raiz, _, nomes in os.walk(pasta) for nome in nomes)


def montar(pasta, voz_base, ia, reserva=None):
    cartao, motor_do_cartao = cartao_e_motor(pasta, voz_base, reserva)
    avisos = []
    try:
        resultado = motor_do_cartao.montar(cartao, TEXTO, ia, avisos.append)
    except voz.ErroDaVoz as erro:
        resultado = erro
    return resultado, avisos, arquivos_da(pasta)


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

    def test_a_imagem_e_pedida_a_porta_e_sem_juiz_o_cartao_vai_sem_imagem(self):
        ia = IaDeRoteiro()
        with tempfile.TemporaryDirectory() as pasta, VozDeMentira() as voz_do_google:
            (nota, midia), _, _ = montar(pasta, voz_do_google.base, ia)
        self.assertEqual(ia.pedidos, ["imagem"])
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


class Escrever(unittest.TestCase):
    def test_escrever_pede_pela_porta_e_o_texto_fica_no_disco_com_o_nome_do_cartao(self):
        ia = IaDeRoteiro(TEXTO)
        with tempfile.TemporaryDirectory() as pasta:
            cartao, motor_do_cartao = cartao_e_motor(pasta)
            falha = motor_do_cartao.escrever(cartao, ia)
            arquivos = arquivos_da(pasta)
        self.assertEqual((falha, ia.pedidos, arquivos), (None, ["texto", ("pedir", "7-0")], ["textos/7-0.txt"]))

    def test_escrever_duas_vezes_paga_uma(self):
        ia = IaDeRoteiro(TEXTO)
        with tempfile.TemporaryDirectory() as pasta:
            cartao, motor_do_cartao = cartao_e_motor(pasta)
            falhas = [motor_do_cartao.escrever(cartao, ia) for _ in range(2)]
        self.assertEqual((falhas, [p for p in ia.pedidos if p != "texto"]), ([None, None], [("pedir", "7-0")]))

    def test_com_o_plano_no_limite_a_porta_espera_e_o_texto_e_pedido_de_novo_a_ela(self):
        ia = IaDeRoteiro(ErroDoProvedor("chatgpt_usage_limit"), TEXTO)
        with tempfile.TemporaryDirectory() as pasta:
            cartao, motor_do_cartao = cartao_e_motor(pasta)
            falha = motor_do_cartao.escrever(cartao, ia)
        self.assertEqual((falha, ia.pedidos), (None, ["texto", ("pedir", "7-0"), "esperar o plano", "texto", ("pedir", "7-0")]))

    def test_a_falha_passageira_e_pedida_de_novo_nas_esperas_da_openai_sem_mudar_quem_paga(self):
        ia = IaDeRoteiro(ErroDoProvedor("openai_unreachable"), TEXTO)
        with tempfile.TemporaryDirectory() as pasta:
            cartao, motor_do_cartao = cartao_e_motor(pasta)
            falha = motor_do_cartao.escrever(cartao, ia)
        self.assertEqual((falha, ia.pedidos), (None, ["texto", ("pedir", "7-0"), ("pedir", "7-0")]))

    def test_a_recusa_que_nao_e_passageira_volta_como_o_codigo_e_nada_fica_no_disco(self):
        ia = IaDeRoteiro(ErroDoProvedor("openai_key_rejected"))
        with tempfile.TemporaryDirectory() as pasta:
            cartao, motor_do_cartao = cartao_e_motor(pasta)
            falha = motor_do_cartao.escrever(cartao, ia)
            textos = [nome for nome in arquivos_da(pasta) if nome.startswith("textos/")]
        self.assertEqual((falha, textos), ("openai_key_rejected", []))

    def test_sem_quem_pague_a_parada_da_porta_sobe_e_nada_e_pedido(self):
        ia = IaDeRoteiro(parado="openai_key_missing")
        with tempfile.TemporaryDirectory() as pasta:
            cartao, motor_do_cartao = cartao_e_motor(pasta)
            with self.assertRaises(SemQuemPague) as parado:
                motor_do_cartao.escrever(cartao, ia)
        self.assertEqual((parado.exception.codigo, ia.pedidos), ("openai_key_missing", ["texto"]))


class AsEsperasDaOpenai(unittest.TestCase):
    def test_sem_esperas_dadas_o_texto_e_a_voz_que_falham_por_um_motivo_passageiro_sao_pedidos_de_novo_depois_de_2_8_e_30_s(self):
        parada = ParadaDeRoteiro()
        ia = IaDeRoteiro(*[ErroDoProvedor("openai_unreachable")] * 4)
        with tempfile.TemporaryDirectory() as pasta, VozDeMentira() as voz_do_google:
            voz_do_google.recusar("*", 503)
            cartao, _ = cartao_e_motor(pasta, reserva=[])
            motor_do_cartao = o_motor_do_cartao(motor_do_envio.motor_do_complemento(), voz_do_google.base, EsperasDaOpenai(parada))
            falha = motor_do_cartao.escrever(cartao, ia)
            with self.assertRaises(voz.ErroDaVoz):
                motor_do_cartao.montar(cartao, TEXTO, ia, lambda etapa: None)
            pedidos_a_voz = len(voz_do_google.pedidos)
        self.assertEqual((falha, parada.esperas, pedidos_a_voz), ("openai_unreachable", [2, 8, 30, 2, 8, 30], 4))


if __name__ == "__main__":
    unittest.main()
