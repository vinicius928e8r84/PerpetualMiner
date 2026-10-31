"""A voz de reserva do Cartão (#174), vista de fora: o servidor real com a thread de trabalho ligada, a coleção em memória, a voz do
Google de mentira e a OpenAI de mentira, as duas na fronteira HTTP. O que o teste confere é o que atravessa o HTTP, o que fica
guardado na coleção (a nota e a mídia) e o que a aba Custos lê.

    python3.9 complemento/test_voz_de_reserva.py
"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_envio import CHAVE, ID, EnvioNoTeste, chats, pedido  # noqa: E402
from complemento.test_envio_audio import FRASE, RUSSO, sons, so_o_audio  # noqa: E402
from complemento.test_openai_de_mentira import audio_da_openai  # noqa: E402
from complemento.test_voz_de_mentira import audio_de_mentira  # noqa: E402

CARTAO = "1760000000000-0"


def com_reserva(reserva):
    corpo = pedido(ID, FRASE)
    if reserva is not None:
        corpo["tts"]["reserva"] = reserva
    return corpo


def audios_da_nota(conexao):
    """Os dois áudios da nota gravada: (o da Frase, o da Palavra)."""
    nota = conexao.conexao.colecao.gravadas[0]
    da_frase, da_palavra = sons(nota["campos"])
    audios = so_o_audio(nota["midia"])
    return audios[da_frase[0]], audios[da_palavra[0]]


class QuandoOGoogleFalha(unittest.TestCase):
    def test_o_400_do_google_na_palavra_cai_para_a_voz_da_openai_pela_chave_e_o_cartao_entra_com_os_dois_audios(self):
        # O risco 11: a voz da Palavra por translate.google.com deu 400 no Mac do dono.
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.voz.recusar("com", 400)
            conexao.criar(pedido(ID, FRASE))
            estado = conexao.esperar(ID)
            da_frase, da_palavra = audios_da_nota(conexao)
            falas = list(conexao.openai.falas)
        self.assertEqual((estado["status"], estado["cards"][CARTAO]["status"]), ("completed", "added"))
        self.assertEqual(da_frase, audio_de_mentira("co.uk", "en", "She gave up smoking"))
        self.assertEqual(da_palavra, audio_da_openai("alloy", "gave up"))
        self.assertEqual([(autorizacao, corpo["input"]) for autorizacao, corpo in falas], [("Bearer " + CHAVE, "gave up")])

    def test_a_voz_da_frase_recusada_tambem_cai_para_a_reserva_e_o_google_segue_falando_a_palavra(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.voz.recusar("co.uk", 400)
            conexao.criar(pedido(ID, FRASE))
            conexao.esperar(ID)
            da_frase, da_palavra = audios_da_nota(conexao)
        self.assertEqual((da_frase, da_palavra), (audio_da_openai("alloy", "She gave up smoking"), audio_de_mentira("com", "en", "gave up")))

    def test_a_frase_russa_cai_para_a_reserva_com_o_texto_em_russo(self):
        corpo = pedido(ID, "Я не мальчик! [Context: Série - Episódio 1]", lang="ru", baralho="Русский")
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=RUSSO) as conexao:
            conexao.voz.recusar("*", 400)
            conexao.criar(corpo)
            conexao.esperar(ID)
            falas = [corpo_da_fala["input"] for _, corpo_da_fala in conexao.openai.falas]
        self.assertEqual(sorted(falas), ["Я не", "Я не мальчик!"])

    def test_o_google_fora_do_ar_esgota_as_esperas_e_so_entao_a_reserva_fala(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.voz.recusar("com", 503)
            conexao.criar(pedido(ID, FRASE))
            estado = conexao.esperar(ID)
            da_palavra = audios_da_nota(conexao)[1]
            pedidos_ao_google = [p for p in conexao.voz.pedidos if p[0] == "com"]
        self.assertEqual(estado["status"], "completed")
        self.assertEqual(len(pedidos_ao_google), 3)  # o pedido e as duas esperas, antes da reserva
        self.assertEqual(da_palavra, audio_da_openai("alloy", "gave up"))

    def test_a_resposta_sem_audio_do_google_tambem_cai_para_a_reserva(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.voz.sem_audio()
            conexao.criar(pedido(ID, FRASE))
            estado = conexao.esperar(ID)
            falas = len(conexao.openai.falas)
        self.assertEqual((estado["status"], falas), ("completed", 2))

    def test_o_google_que_responde_nao_chama_a_reserva(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(pedido(ID, FRASE))
            conexao.esperar(ID)
            falas = list(conexao.openai.falas)
        self.assertEqual(falas, [])


class SemReservaQueSirva(unittest.TestCase):
    def falha_do_google_com(self, corpo, **conexao_no_teste):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, **conexao_no_teste) as conexao:
            conexao.voz.recusar("com", 400)
            conexao.criar(corpo)
            estado = conexao.esperar(ID)
            return estado, list(conexao.openai.falas), list(conexao.conexao.colecao.gravadas)

    def test_sem_a_chave_so_com_o_login_do_chatgpt_a_voz_da_openai_nao_e_pedida_porque_o_plano_nao_cobre_voz(self):
        estado, falas, notas = self.falha_do_google_com(pedido(ID, FRASE), chave=None, chatgpt="conectada")
        self.assertEqual((estado["lastError"], falas, notas), ("tts_rejected", [], []))

    def test_o_pedido_sem_reserva_deixa_a_falha_do_google_valer_e_nao_gasta_a_chave(self):
        estado, falas, notas = self.falha_do_google_com(com_reserva([]))
        self.assertEqual((estado["status"], estado["lastError"], falas, notas), ("failed", "tts_rejected", [], []))

    def test_a_reserva_que_a_conexao_nao_conhece_e_pulada_e_a_seguinte_da_lista_fala(self):
        estado, falas, _ = self.falha_do_google_com(com_reserva(["outro-provedor", "openai"]))
        self.assertEqual((estado["status"], len(falas)), ("completed", 1))

    def test_a_openai_que_recusa_a_chave_deixa_o_cartao_falho_com_o_codigo_do_google_e_a_chave_nao_vai_ao_log(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.voz.recusar("com", 400)
            conexao.openai.recusa_da_fala = (401, "invalid_api_key")
            conexao.criar(pedido(ID, FRASE))
            estado = conexao.esperar(ID)
            log = conexao.log()
        self.assertEqual((estado["status"], estado["cards"][CARTAO]["error"]), ("failed", "tts_rejected"))
        for segredo in (CHAVE, "gave up"):
            self.assertNotIn(segredo, log)

    def test_com_a_reserva_falha_o_tentar_de_novo_nao_paga_o_texto_de_novo(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.voz.recusar("com", 400)
            conexao.openai.recusa_da_fala = (429, "insufficient_quota")
            conexao.criar(pedido(ID, FRASE))
            conexao.esperar(ID)
            conexao.openai.recusa_da_fala = None
            conexao.pedir("POST", "/jobs/retry", corpo={"jobId": ID})
            estado = conexao.esperar(ID)
            texto_pago = len(chats(conexao.openai))
        self.assertEqual((estado["status"], texto_pago), ("completed", 1))


class OQueOPedidoDizDaReserva(unittest.TestCase):
    def criar(self, reserva):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            return conexao.criar(com_reserva(reserva))

    def test_a_reserva_que_nao_e_uma_lista_de_nomes_e_recusada_sem_criar_o_envio(self):
        for reserva in ("openai", {"openai": True}, [1], ["openai", None], ["com espaço"], ["a"] * 9):
            with self.subTest(reserva=reserva):
                self.assertEqual(self.criar(reserva), (400, {"error": "invalid_request"}))

    def test_a_lista_vazia_e_a_lista_com_a_openai_sao_pedidos_validos(self):
        for reserva in ([], ["openai"], None):
            with self.subTest(reserva=reserva):
                self.assertEqual(self.criar(reserva), (201, {"jobId": ID, "status": "queued"}))


class OCustoDaVozDeReserva(unittest.TestCase):
    def test_a_voz_da_openai_que_falou_entra_nos_custos_do_envio_e_a_do_google_nao(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.voz.recusar("com", 400)
            conexao.criar(pedido(ID, FRASE))
            conexao.esperar(ID)
            linhas = json.loads(conexao.pedir("POST", "/analytics/jobs", corpo={"lang": "all"})[2])["jobs"]
        custos = linhas[0]["costs"]
        self.assertEqual(custos["otherUsd"], round(len("gave up") * 0.015 / 1000, 6))  # tts-1: US$ 0,015 por mil letras
        self.assertEqual(custos["totalUsd"], round(sum(valor for chave, valor in custos.items() if chave != "totalUsd"), 6))

    def test_o_envio_cujo_google_falou_tudo_nao_tem_custo_de_voz(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(pedido(ID, FRASE))
            conexao.esperar(ID)
            linhas = json.loads(conexao.pedir("POST", "/analytics/jobs", corpo={"lang": "all"})[2])["jobs"]
        self.assertEqual(linhas[0]["costs"]["otherUsd"], 0)


if __name__ == "__main__":
    unittest.main()
