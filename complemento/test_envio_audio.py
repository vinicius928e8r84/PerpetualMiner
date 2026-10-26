"""O áudio do Cartão (#143), visto de fora: o servidor real com a thread de trabalho ligada, a coleção em memória, a OpenAI de
mentira e a voz do Google de mentira, as duas na fronteira HTTP. O que o teste confere é o que atravessa o HTTP e o que
fica guardado na coleção (a nota e a mídia que ela cita).

    python3.9 complemento/test_envio_audio.py
"""

import json
import os
import re
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_envio import ID, INGLES, EnvioNoTeste, apagar_as_frases, chats, pedido  # noqa: E402
from complemento.test_voz_de_mentira import audio_de_mentira, dito  # noqa: E402

FRASE = "gave up : She gave up smoking [Context: Série - The Office - S01E01]"
RUSSO = ColecaoEmMemoria({"baralhos": [{"nome": "Русский"}]})


def sons(campos):
    """Os nomes dos arquivos que os campos da nota tocam (`[sound:...]`), do verso e da frente."""
    return re.findall(r"\[sound:([^\]]+)\]", campos["Frente"]), re.findall(r"\[sound:([^\]]+)\]", campos["Verso"])


def so_o_audio(midia):
    """A mídia da nota que é voz: a imagem (#144) vai na mesma nota e tem os seus testes."""
    return {nome: dados for nome, dados in midia.items() if nome.endswith(".mp3")}


class OCartaoGanhaAudio(unittest.TestCase):
    def test_o_cartao_gravado_toca_a_frase_e_a_palavra_e_os_dois_arquivos_ficam_na_colecao_ligados_a_nota(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(pedido(ID, FRASE))
            estado = conexao.esperar(ID)
            notas = conexao.conexao.colecao.gravadas
            arquivos = conexao.arquivos()
        self.assertEqual((estado["status"], estado["cards"]["1760000000000-0"]["status"]), ("completed", "added"))
        self.assertEqual(len(notas), 1)
        da_frase, da_palavra = sons(notas[0]["campos"])
        self.assertEqual((len(da_frase), len(da_palavra)), (1, 1))
        audios = so_o_audio(notas[0]["midia"])
        self.assertEqual(sorted(audios), sorted(da_frase + da_palavra))
        self.assertEqual(audios[da_frase[0]], audio_de_mentira("co.uk", "en", "She gave up smoking"))
        self.assertEqual(audios[da_palavra[0]], audio_de_mentira("com", "en", "gave up"))
        self.assertEqual([nome for nome in arquivos if nome.endswith(".mp3")], [])

    def test_os_sotaques_dos_ajustes_de_envio_dizem_com_que_voz_a_palavra_e_a_frase_sao_pedidas(self):
        corpo = pedido(ID, FRASE)
        corpo["tts"] = {"wordTld": "com.au", "phraseTld": "ca"}
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(corpo)
            conexao.esperar(ID)
            pedidos = sorted(conexao.voz.pedidos)
        self.assertEqual(pedidos, [("ca", "en", "She gave up smoking"), ("com.au", "en", "gave up")])

    def test_sem_sotaque_no_pedido_vale_o_de_hoje_do_motor_global_para_a_palavra_e_britanico_para_a_frase(self):
        corpo = pedido(ID, FRASE)
        corpo["tts"] = {}
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(corpo)
            conexao.esperar(ID)
            pedidos = sorted(conexao.voz.pedidos)
        self.assertEqual(pedidos, [("co.uk", "en", "She gave up smoking"), ("com", "en", "gave up")])

    def test_um_sotaque_que_nao_e_de_um_endereco_do_google_nao_desvia_o_pedido_e_vale_o_de_hoje(self):
        corpo = pedido(ID, FRASE)
        corpo["tts"] = {"wordTld": "evil.example/x", "phraseTld": "com@evil"}
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(corpo)
            conexao.esperar(ID)
            pedidos = sorted(conexao.voz.pedidos)
        self.assertEqual(pedidos, [("co.uk", "en", "She gave up smoking"), ("com", "en", "gave up")])

    def test_a_frase_russa_e_dita_em_russo_com_o_sotaque_dos_ajustes(self):
        corpo = pedido(ID, "Я не мальчик! [Context: Série - Episódio 1]", lang="ru", baralho="Русский")
        corpo["tts"] = {"wordTld": "kz", "phraseTld": "com.ua"}
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=RUSSO) as conexao:
            conexao.criar(corpo)
            estado = conexao.esperar(ID)
            pedidos = conexao.voz.pedidos
            notas = conexao.conexao.colecao.gravadas
        self.assertEqual(estado["status"], "completed")
        self.assertEqual(sorted(pedidos), [("com.ua", "ru", "Я не мальчик!"), ("kz", "ru", "Я не")])
        self.assertEqual(len(notas[0]["midia"]), 2)

    def test_uma_frase_comprida_e_pedida_em_pedacos_de_ate_cem_letras_como_o_gtts_de_hoje_e_o_arquivo_toca_os_pedacos_na_ordem(self):
        longa = ("She gave up smoking after twenty years, and everyone at the office was surprised. "
                 "Nobody thought she could do it, but she did, and now she runs every single morning before work.")
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(pedido(ID, "gave up : " + longa.replace("gave up", "gave up")))
            conexao.esperar(ID)
            da_frase = [p for p in conexao.voz.pedidos if p[2] != "gave up"]
            notas = conexao.conexao.colecao.gravadas
        self.assertGreater(len(da_frase), 1)
        self.assertTrue(all(len(texto) <= 100 for _, _, texto in da_frase))
        self.assertEqual([texto for _, _, texto in da_frase], [
            "She gave up smoking after twenty years", "and everyone at the office was surprised", "Nobody thought she could do it", "but she did",
            "and now she runs every single morning before work."])  # os pedaços que o gTTS de hoje pede
        tocado = notas[0]["midia"][sons(notas[0]["campos"])[0][0]]
        self.assertEqual([texto for _, _, texto in dito(tocado)], [texto for _, _, texto in da_frase])

    def test_o_texto_e_preparado_como_o_gtts_de_hoje_a_abreviacao_perde_o_ponto(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(pedido(ID, "gave up : Mr. Smith gave up smoking"))
            conexao.esperar(ID)
            frase = [texto for _, _, texto in conexao.voz.pedidos if texto != "gave up"]
        self.assertEqual(frase, ["Mr Smith gave up smoking"])

    def test_o_trecho_sem_pontuacao_que_so_passa_de_cem_letras_por_causa_do_espaco_do_corte_vai_inteiro_como_no_gtts_de_hoje(self):
        primeiro = "gave up " + " ".join(["abcdefghi"] * 8) + " abcdefghijk"  # 99 letras, e um espaço no cem
        segundo = " ".join(["abcdefghi"] * 9 + ["abcdefghij"])  # 100 letras
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(pedido(ID, "gave up : %s %s" % (primeiro, segundo)))
            conexao.esperar(ID)
            frase = [texto for _, _, texto in conexao.voz.pedidos if texto != "gave up"]
        self.assertEqual(frase, [primeiro, segundo])

    def test_o_esq_ponto_vira_esquire_em_qualquer_caixa_como_no_gtts_de_hoje(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(pedido(ID, "gave up : John esq. gave up smoking"))
            conexao.esperar(ID)
            frase = [texto for _, _, texto in conexao.voz.pedidos if texto != "gave up"]
        self.assertEqual(frase, ["John Esquire gave up smoking"])

    def test_a_frase_que_ja_esta_no_baralho_nao_leva_midia_para_a_colecao(self):
        colecao = ColecaoEmMemoria({"baralhos": [{"nome": "Inglês", "notas": [{"frente": "She <b>gave up</b> smoking", "verso": "x"}]}]})
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.criar(pedido(ID, "gave up : She gave up smoking"))
            estado = conexao.esperar(ID)
        self.assertEqual((estado["status"], estado["duplicatePhraseIds"]), ("completed", [1760000000000]))
        self.assertEqual((colecao.gravadas, colecao.midia), ([], {}))


class AVozQueFalha(unittest.TestCase):
    def test_a_voz_da_palavra_recusada_com_400_deixa_o_cartao_sem_nota_com_o_codigo_e_o_tentar_de_novo_nao_paga_o_texto_de_novo(self):
        # O risco 11: a voz da Palavra por translate.google.com deu 400 no Mac do dono; a reserva é o #174.
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.voz.recusar("com", 400)
            conexao.criar(pedido(ID, FRASE))
            falhou = conexao.esperar(ID)
            sem_nota = list(conexao.conexao.colecao.gravadas)
            conexao.voz.recusar("com", None)
            conexao.pedir("POST", "/jobs/retry", corpo={"jobId": ID})
            estado = conexao.esperar(ID)
            notas = conexao.conexao.colecao.gravadas
            texto_pago = len(chats(conexao.openai))
            log = conexao.log()
        self.assertEqual((falhou["status"], falhou["lastError"], falhou["cards"]["1760000000000-0"]["error"]), ("failed", "tts_rejected", "tts_rejected"))
        self.assertEqual(sem_nota, [])
        self.assertEqual((estado["status"], len(notas), len(so_o_audio(notas[0]["midia"])), texto_pago), ("completed", 1, 2, 1))
        self.assertNotIn("gave up", log)

    def test_a_voz_fora_do_ar_por_um_momento_e_pedida_de_novo_e_o_cartao_entra_com_audio(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.voz.recusar("*", 503, vezes=2)
            conexao.criar(pedido(ID, FRASE))
            estado = conexao.esperar(ID)
            notas = conexao.conexao.colecao.gravadas
        self.assertEqual((estado["status"], len(notas), len(so_o_audio(notas[0]["midia"]))), ("completed", 1, 2))

    def test_a_voz_fora_do_ar_para_sempre_falha_o_cartao_com_o_codigo_de_voz_fora_do_ar(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.voz.recusar("*", 503)
            conexao.criar(pedido(ID, FRASE))
            estado = conexao.esperar(ID)
        self.assertEqual((estado["status"], estado["lastError"]), ("failed", "tts_unreachable"))

    def test_o_apagar_tudo_no_meio_do_pedido_da_voz_nao_grava_nota_nem_deixa_midia_na_colecao(self):
        colecao = ColecaoEmMemoria(INGLES)
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.voz.recusar("*", 503, vezes=1)  # o primeiro pedido volta 503, o Apagar tudo chega nele, e a voz depois responde
            conexao.voz.antes_de_responder = lambda: (apagar_as_frases(conexao), setattr(conexao.voz, "antes_de_responder", lambda: None))
            conexao.criar(pedido(ID, FRASE))
            estado = conexao.esperar(ID)  # o Apagar tudo já deu o Envio por falho: o Trabalho ainda vai pedir a voz de novo
            fim = time.monotonic() + 15
            while len(conexao.voz.pedidos) < 2 and time.monotonic() < fim:
                time.sleep(0.02)
        pedidos = len(conexao.voz.pedidos)  # fora do `with`: a Conexão parada já juntou a thread de trabalho, nada mais é gravado
        self.assertEqual((estado["status"], estado["lastError"], estado["wiped"]), ("failed", "frases_apagadas", True))
        self.assertGreater(pedidos, 1)
        self.assertEqual((colecao.gravadas, colecao.midia), ([], {}))

    def test_a_resposta_boa_sem_audio_dentro_falha_o_cartao_e_nao_grava_nota_muda(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.voz.sem_audio()
            conexao.criar(pedido(ID, FRASE))
            estado = conexao.esperar(ID)
            notas = conexao.conexao.colecao.gravadas
        self.assertEqual((estado["status"], estado["lastError"], notas), ("failed", "tts_empty", []))


class AMidiaNaColecao(unittest.TestCase):
    def test_dois_cartoes_da_mesma_frase_levam_arquivos_de_nomes_diferentes(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(pedido(ID, "keep running | run : They keep running"))
            conexao.esperar(ID)
            notas = conexao.conexao.colecao.gravadas
        nomes = [nome for nota in notas for nome in so_o_audio(nota["midia"])]
        self.assertEqual((len(notas), len(nomes), len(set(nomes))), (2, 4, 4))


if __name__ == "__main__":
    unittest.main()
