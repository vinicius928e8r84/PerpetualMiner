"""A voz do Google (`voz.py`), sem o Envio: os pedaços em que o texto é quebrado, como o gTTS 2.5, e o que cada resposta da voz
de mentira (`test_voz_de_mentira.py`) dá a quem pede o áudio.

    python3.9 complemento/test_voz.py
"""

import base64
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import voz
from complemento.test_voz_de_mentira import VozDeMentira, audio_de_mentira

PEDACOS_COMO_O_GTTS = [
    ("", []),
    ("  Hello world  ", ["Hello world"]),
    ("a" * 49 + ", " + "b" * 49, ["a" * 49 + ", " + "b" * 49]),
    ("a" * 50 + ", " + "b" * 49, ["a" * 50, "b" * 49]),
    ("x" * 150, ["x" * 100, "x" * 50]),
    ("x" * 250 + " end", ["x" * 100, "x" * 100, "x" * 50 + " end"]),
    ("Really?! Are you sure?! " + "word " * 20 + "!!! ... ?? (ok) [no] — fine; done: yes",
     ["Really?", "Are you sure?", " ".join(["word"] * 20), "!", "ok", "no", "fine", "done", "yes"]),
    ("Dr. Smith met Mr. Jones and Prof. Brown, Esq. at the St. Mary hall-\nway yesterday morning, then they all went home quietly.",
     ["Dr Smith met Mr Jones and Prof Brown", "Esquire at the St Mary hallway yesterday morning", "then they all went home quietly."]),
    ("Hello?World!Again " + "z" * 90, ["Hello?", "World!", "Again " + "z" * 90]),
    ("Он сказал: «Я не мальчик!» — и ушёл, а потом вернулся, потому что забыл свою книгу на столе в большой комнате.",
     ["Он сказал", "«Я не мальчик!", "»", "и ушёл", "а потом вернулся", "потому что забыл свою книгу на столе в большой комнате."]),
    ("一二三四五六七八九十" * 6 + "。" + "一二三四五六七八九十" * 6, ["一二三四五六七八九十" * 6, "一二三四五六七八九十" * 6]),
    (", , , " + "palavra " * 15, [" ".join(["palavra"] * 12), " ".join(["palavra"] * 3)]),
]


def linha_com_o_audio(audio):
    """A linha da resposta do `batchexecute` que traz o áudio (em base64) do RPC da voz."""
    return json.dumps([["wrb.fr", voz.RPC, json.dumps([audio]), None, None, None, "generic"]], separators=(",", ":"))


def codigo_do_erro(base, texto):
    try:
        return voz.pedir_o_audio(base, texto, "en", "com")
    except voz.ErroDaVoz as erro:
        return erro.codigo


class OsPedacosComoOGtts(unittest.TestCase):
    def test_cada_texto_e_quebrado_nos_pedacos_de_ate_cem_letras_que_o_gtts_pede(self):
        for texto, esperado in PEDACOS_COMO_O_GTTS:
            with self.subTest(texto[:30]):
                self.assertEqual(voz.pedacos(texto), esperado)


class ORespostaDaVoz(unittest.TestCase):
    def test_os_pedacos_sao_pedidos_em_ordem_e_o_audio_e_colado(self):
        texto = "a" * 50 + ", " + "b" * 49
        with VozDeMentira() as falsa:
            audio = voz.pedir_o_audio(falsa.base, texto, "en", "co.uk")
            pedidos = list(falsa.pedidos)
        self.assertEqual(pedidos, [("co.uk", "en", "a" * 50), ("co.uk", "en", "b" * 49)])
        self.assertEqual(audio, audio_de_mentira("co.uk", "en", "a" * 50) + audio_de_mentira("co.uk", "en", "b" * 49))

    def test_a_linha_do_rpc_sem_audio_ou_com_o_base64_estragado_e_pulada_e_a_seguinte_com_audio_vale(self):
        audio = base64.b64encode(b"mp3").decode("ascii")
        with VozDeMentira() as falsa:
            falsa.responder_com("\n".join([
                ")]}'", json.dumps([["wrb.fr", voz.RPC, None]]), linha_com_o_audio("abc"), linha_com_o_audio(""), linha_com_o_audio(audio)]))
            self.assertEqual(voz.pedir_o_audio(falsa.base, "hello", "en", "com"), b"mp3")

    def test_so_linhas_sem_audio_dao_sem_audio(self):
        respostas = {
            "sem a linha do rpc": ")]}'\n[[\"di\",12]]",
            "o rpc sem audio": json.dumps([["wrb.fr", voz.RPC, None]]),
            "o base64 estragado": linha_com_o_audio("abc"),
            "o audio vazio": linha_com_o_audio(""),
        }
        for nome, corpo in respostas.items():
            with self.subTest(nome), VozDeMentira() as falsa:
                falsa.responder_com(corpo)
                self.assertEqual(codigo_do_erro(falsa.base, "hello"), voz.SEM_AUDIO)

    def test_o_429_e_o_5xx_sao_fora_do_ar_e_o_resto_e_recusa(self):
        for status, esperado in ((429, voz.FORA_DO_AR), (500, voz.FORA_DO_AR), (503, voz.FORA_DO_AR), (400, voz.RECUSADA), (403, voz.RECUSADA)):
            with self.subTest(status), VozDeMentira() as falsa:
                falsa.recusar("*", status)
                self.assertEqual(codigo_do_erro(falsa.base, "hello"), esperado)

    def test_sem_servidor_que_responda_e_fora_do_ar_e_sem_texto_e_sem_audio_sem_pedir(self):
        with VozDeMentira() as falsa:
            base = falsa.base
            sem_texto = codigo_do_erro(base, "  ")
            pedidos = list(falsa.pedidos)
        self.assertEqual((sem_texto, pedidos), (voz.SEM_AUDIO, []))
        self.assertEqual(codigo_do_erro(base, "hello"), voz.FORA_DO_AR)


if __name__ == "__main__":
    unittest.main()
