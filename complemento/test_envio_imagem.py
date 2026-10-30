"""A imagem do Cartão (#144), vista de fora: o servidor real com a thread de trabalho ligada, a coleção em memória, a OpenAI e o
Openverse de mentira, os dois na fronteira HTTP. O que o teste confere é o que atravessa o HTTP e o que fica guardado: a nota, a
mídia que a coleção guarda para ela e os arquivos da pasta de dados.

    python3.9 complemento/test_envio_imagem.py
"""

import json
import os
import re
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_envio import CHAVE, ID, INGLES, EnvioNoTeste, pedido  # noqa: E402
from complemento.test_imagens_de_mentira import JPEG_DE_MENTIRA, png_de  # noqa: E402
from complemento.test_openai_de_mentira import audio_da_openai, veredito_do_juiz  # noqa: E402

FRASE = "gave up : She gave up smoking [Context: Série - The Office - S01E01]"
FOTOS = {"gave up": ["foto-a", "foto-b"]}


def imagens(campos):
    """Os arquivos que os campos da nota mostram (`<img src="...">`)."""
    return re.findall(r'<img src="([^"]+)">', campos["Frente"] + campos["Verso"])


def so_a_imagem(midia):
    """A mídia da nota que é imagem: a voz (#143) vai na mesma nota e tem os seus testes."""
    return {nome: dados for nome, dados in midia.items() if nome.endswith(".png")}


def juiz_que_prefere(escolhida, nota=95):
    """Um juiz que dá `nota` à candidata `escolhida` e 10 às outras, e na comparação com a gerada mantém a foto."""
    return lambda modo, candidatas: veredito_do_juiz(escolhida, [nota if i == escolhida else 10 for i in range(len(candidatas))])


def juiz_fraco_que_prefere_a_gerada(modo, candidatas):
    """Nenhuma foto presta (nota 10); na comparação, a gerada ganha de longe."""
    return veredito_do_juiz(0, [10, 10]) if modo == "real_only" else veredito_do_juiz(1, [30, 80])


def enviar(conexao, *, corpo=None, linha=FRASE):
    conexao.criar(corpo or pedido(ID, linha))
    estado = conexao.esperar(ID)
    return estado, conexao.conexao.colecao.gravadas


class AFotoRealQueOJuizEscolhe(unittest.TestCase):
    def test_o_cartao_leva_a_foto_que_o_juiz_escolheu_e_a_colecao_guarda_os_bytes_dela(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openverse.fotos = FOTOS
            conexao.openai.juiz = juiz_que_prefere(1)
            estado, notas = enviar(conexao)
            juizes, geradas = list(conexao.openai.juizes), list(conexao.openai.imagens)
        self.assertEqual((estado["status"], estado["cards"]["1760000000000-0"]["status"]), ("completed", "added"))
        self.assertEqual(len(notas), 1)
        arquivo, = imagens(notas[0]["campos"])
        self.assertEqual(so_a_imagem(notas[0]["midia"]), {arquivo: png_de("foto-b")})
        self.assertEqual(geradas, [])
        autorizacao, modo, candidatas = juizes[0]
        self.assertEqual((autorizacao, modo, [c["imagem"] for c in candidatas]), ("Bearer " + CHAVE, "real_only", [png_de("foto-a"), png_de("foto-b")]))

    def test_a_busca_pede_as_consultas_do_cartao_ao_openverse_na_ordem_dele_e_para_nas_que_acharam_foto(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openverse.fotos = FOTOS
            enviar(conexao)
            buscas = list(conexao.openverse.buscas)
        self.assertEqual(buscas[:2], ["gave up", "gave up photo"])

    def test_a_foto_em_jpeg_passa_pelo_adaptador_de_imagem_e_o_cartao_guarda_o_png_que_ele_fez(self):
        class Adaptador:
            def __init__(self):
                self.pedidos = []

            def converter(self, dados, formato):
                self.pedidos.append((dados.startswith(JPEG_DE_MENTIRA), formato))
                return png_de("convertida")

        adaptador = Adaptador()
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, adaptador_de_imagem=adaptador) as conexao:
            conexao.openverse.fotos = {"gave up": ["foto.jpg"]}
            estado, notas = enviar(conexao)
        self.assertEqual(estado["status"], "completed")
        arquivo, = imagens(notas[0]["campos"])
        self.assertEqual((so_a_imagem(notas[0]["midia"]), adaptador.pedidos), ({arquivo: png_de("convertida")}, [(True, "PNG")]))

    def test_a_foto_que_o_juiz_nao_le_manda_o_cartao_para_a_imagem_gerada(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openverse.fotos = FOTOS
            conexao.openai.recusar_o_chat_de("[juiz]", 400, "invalid_image_format")
            estado, notas = enviar(conexao)
            geradas = len(conexao.openai.imagens)
        self.assertEqual(estado["status"], "completed")
        arquivo, = imagens(notas[0]["campos"])
        self.assertEqual((so_a_imagem(notas[0]["midia"]), geradas), ({arquivo: png_de("gerada")}, 1))


class AImagemGeradaPelaChave(unittest.TestCase):
    def test_sem_foto_que_preste_a_imagem_gerada_pela_chave_entra_no_cartao_se_o_juiz_a_prefere(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openverse.fotos = FOTOS
            conexao.openai.juiz = juiz_fraco_que_prefere_a_gerada
            estado, notas = enviar(conexao)
            geradas, juizes = list(conexao.openai.imagens), [modo for _, modo, _ in conexao.openai.juizes]
        arquivo, = imagens(notas[0]["campos"])
        self.assertEqual((estado["status"], so_a_imagem(notas[0]["midia"])), ("completed", {arquivo: png_de("gerada")}))
        self.assertEqual(juizes, ["real_only", "real_vs_generated"])
        autorizacao, corpo = geradas[0]
        self.assertEqual((autorizacao, corpo["model"], corpo["n"], corpo["size"]), ("Bearer " + CHAVE, "gpt-image-2.5-flare", 1, "1024x1024"))
        self.assertIn("gave up", corpo["prompt"])

    def test_sem_nenhuma_foto_no_openverse_a_imagem_gerada_entra_sem_juiz(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            estado, notas = enviar(conexao)
            juizes = len(conexao.openai.juizes)
        arquivo, = imagens(notas[0]["campos"])
        self.assertEqual((estado["status"], so_a_imagem(notas[0]["midia"]), juizes), ("completed", {arquivo: png_de("gerada")}, 0))

    def test_com_a_imagem_gerada_pedida_nos_ajustes_nao_ha_busca_e_a_triagem_decide_antes_de_gastar(self):
        corpo = dict(pedido(ID, FRASE), imageSource="2")
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openverse.fotos = FOTOS
            estado, notas = enviar(conexao, corpo=corpo)
            buscas, triagens, geradas = list(conexao.openverse.buscas), list(conexao.openai.triagens), len(conexao.openai.imagens)
        arquivo, = imagens(notas[0]["campos"])
        self.assertEqual((estado["status"], so_a_imagem(notas[0]["midia"]), buscas, geradas), ("completed", {arquivo: png_de("gerada")}, [], 1))
        self.assertEqual([autorizacao for autorizacao, _ in triagens], ["Bearer " + CHAVE])

    def test_a_triagem_que_acha_a_palavra_abstrata_manda_o_cartao_sem_imagem_e_sem_gastar_a_geracao(self):
        corpo = dict(pedido(ID, FRASE), imageSource="2")
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openai.triagem = "A"
            estado, notas = enviar(conexao, corpo=corpo)
            geradas = len(conexao.openai.imagens)
        self.assertEqual((estado["status"], imagens(notas[0]["campos"]), so_a_imagem(notas[0]["midia"]), geradas), ("completed", [], {}, 0))


class JuntoComOAudio(unittest.TestCase):
    """A voz (#143) e a imagem (#144) vão na mesma nota; só a falha da voz derruba o Cartão."""

    def test_o_cartao_leva_a_voz_e_a_foto_na_mesma_nota_e_a_colecao_guarda_os_tres_arquivos(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openverse.fotos = FOTOS
            conexao.openai.juiz = juiz_que_prefere(1)
            estado, notas = enviar(conexao)
        self.assertEqual((estado["status"], len(notas)), ("completed", 1))
        arquivo, = imagens(notas[0]["campos"])
        sons = re.findall(r"\[sound:([^\]]+)\]", notas[0]["campos"]["Frente"] + notas[0]["campos"]["Verso"])
        self.assertEqual((len(sons), sorted(notas[0]["midia"])), (2, sorted(sons + [arquivo])))
        self.assertEqual(notas[0]["midia"][arquivo], png_de("foto-b"))

    def test_a_voz_recusada_sem_reserva_falha_o_cartao_sem_nota_e_sem_gastar_com_a_imagem(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openverse.fotos = FOTOS
            conexao.voz.recusar("com", 400)
            sem_reserva = pedido(ID, FRASE)
            sem_reserva["tts"]["reserva"] = []  # com a reserva (#174) a voz da OpenAI falaria e o Cartão entraria
            estado, notas = enviar(conexao, corpo=sem_reserva)
            buscas, geradas = list(conexao.openverse.buscas), list(conexao.openai.imagens)
        self.assertEqual((estado["status"], estado["lastError"], notas), ("failed", "tts_rejected", []))
        self.assertEqual((buscas, geradas), ([], []))

    def test_a_voz_recusada_com_a_reserva_falando_o_cartao_entra_com_o_audio_da_openai_e_a_foto(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openverse.fotos = FOTOS
            conexao.openai.juiz = juiz_que_prefere(1)
            conexao.voz.recusar("com", 400)
            estado, notas = enviar(conexao)
        self.assertEqual((estado["status"], len(notas)), ("completed", 1))
        arquivo, = imagens(notas[0]["campos"])
        self.assertEqual(notas[0]["midia"][arquivo], png_de("foto-b"))
        da_palavra = re.findall(r"\[sound:([^\]]+)\]", notas[0]["campos"]["Verso"])
        self.assertEqual(notas[0]["midia"][da_palavra[0]], audio_da_openai("alloy", "gave up"))

    def test_a_imagem_que_falha_com_a_voz_boa_deixa_o_cartao_com_o_audio_e_sem_a_foto(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openverse.fora_do_ar = 503
            conexao.openai.recusa_da_imagem = (503, "server_error")
            estado, notas = enviar(conexao)
        self.assertEqual((estado["status"], len(notas), imagens(notas[0]["campos"])), ("completed", 1, []))
        self.assertEqual(sorted(notas[0]["midia"]), sorted(re.findall(r"\[sound:([^\]]+)\]", notas[0]["campos"]["Frente"] + notas[0]["campos"]["Verso"])))


class SoAImagemFalha(unittest.TestCase):
    """Se só a imagem falha, o Cartão vai sem ela e conta como enviado."""

    def conferir_cartao_sem_imagem(self, estado, notas, conexao, tentou_gerar=True):
        self.assertEqual(bool(conexao.openai.imagens), tentou_gerar)  # a imagem foi mesmo tentada: só ela falhou
        self.assertEqual((estado["status"], estado["successfulPhraseIds"], estado["failedPhraseIds"]), ("completed", [1760000000000], []))
        self.assertEqual(estado["cards"]["1760000000000-0"], {"phraseId": 1760000000000, "status": "added", "error": None})
        self.assertEqual((len(notas), imagens(notas[0]["campos"]), so_a_imagem(notas[0]["midia"])), (1, [], {}))

    def test_a_geracao_recusada_e_sem_foto_nenhuma_o_cartao_vai_sem_imagem_e_conta_como_enviado(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openai.recusa_da_imagem = (400, "billing_hard_limit_reached")
            estado, notas = enviar(conexao)
        self.conferir_cartao_sem_imagem(estado, notas, conexao)

    def test_o_openverse_fora_do_ar_e_a_geracao_fora_do_ar_o_cartao_vai_sem_imagem(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openverse.fora_do_ar = 503
            conexao.openai.recusa_da_imagem = (503, "server_error")
            estado, notas = enviar(conexao)
        self.conferir_cartao_sem_imagem(estado, notas, conexao)

    def test_o_juiz_recusado_pela_openai_leva_so_a_imagem_junto_e_o_cartao_vai_sem_ela(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openverse.fotos = FOTOS
            conexao.openai.recusar_o_chat_de("[juiz]", 429, "rate_limit_exceeded")
            estado, notas = enviar(conexao)
        self.conferir_cartao_sem_imagem(estado, notas, conexao, tentou_gerar=False)

    def test_uma_foto_que_nao_se_converte_e_sem_geracao_possivel_o_cartao_vai_sem_imagem(self):
        # Sem o Qt do Anki nem outro adaptador (é o caso aqui), o JPEG não vira PNG: a foto não serve.
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openverse.fotos = {"gave up": ["foto.jpg"]}
            conexao.openai.recusa_da_imagem = (500, "server_error")
            estado, notas = enviar(conexao)
        self.conferir_cartao_sem_imagem(estado, notas, conexao)

    def test_a_falha_da_imagem_vai_ao_log_so_com_o_cartao_e_o_codigo(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openai.recusa_da_imagem = (400, "billing_hard_limit_reached")
            enviar(conexao)
            with open(os.path.join(conexao.logs, "complemento.log"), encoding="utf-8") as log:
                linhas = [linha for linha in log if "1760000000000-0" in linha and "imagem" in linha]
        self.assertTrue(linhas)
        self.assertNotIn(CHAVE, "".join(linhas))
        self.assertNotIn("Billing", "".join(linhas))


class OQueFicaGuardado(unittest.TestCase):
    def test_a_imagem_nunca_fica_na_pasta_de_dados_e_nem_a_palavra_nem_a_frase_nos_custos_ou_no_log(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openverse.fotos = {"xilofone": ["foto-a"]}
            enviar(conexao, linha="xilofone : O pai toca xilofone muito alto")
            arquivos = conexao.arquivos()
            _, _, pacote = conexao.pedir("POST", "/jobs/debug-bundle", corpo={"jobId": ID})
        imagem = [nome for nome in arquivos if nome.endswith((".png", ".jpg", ".jpeg", ".webp"))]
        guardado = b"".join(dados for nome, dados in arquivos.items() if not nome.startswith("chaves")) + pacote
        self.assertEqual(imagem, [])
        self.assertNotIn(b"xilofone", guardado)
        custos = [json.loads(linha) for linha in arquivos[os.path.join("custos", ID, "costs.jsonl")].decode("utf-8").splitlines()]
        self.assertIn("image_pipeline", [c["type"] for c in custos])
        self.assertTrue(all("queries" not in c and "query_stats" not in c and "best_real_query" not in c for c in custos))
        self.assertIn("[image_judge] 1760000000000-0", [c["keyword"] for c in custos if c["type"] == "tokens"])

    def test_a_chave_vai_so_para_a_openai_e_nunca_para_o_openverse_nem_para_um_arquivo_fora_do_cofre(self):
        for fonte in ("1", "2"):
            with self.subTest(imageSource=fonte), tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
                conexao.openverse.fotos = FOTOS
                conexao.openai.juiz = juiz_fraco_que_prefere_a_gerada  # a foto não presta: o Envio paga a OpenAI pelo juiz e pela geração
                enviar(conexao, corpo=dict(pedido(ID, FRASE), imageSource=fonte))
                arquivos = conexao.arquivos()
                _, _, pacote = conexao.pedir("POST", "/jobs/debug-bundle", corpo={"jobId": ID})
                with open(os.path.join(conexao.logs, "complemento.log"), "rb") as log:
                    guardado = b"".join(dados for nome, dados in arquivos.items() if not nome.startswith("chaves")) + pacote + log.read()
                para_a_openai = [autorizacao for _, caminho, autorizacao in conexao.openai.pedidos if caminho in ("/v1/chat/completions", "/v1/images/generations")]
                para_o_openverse = list(conexao.openverse.cabecalhos)
            self.assertTrue(conexao.openai.imagens)
            self.assertEqual(set(para_a_openai), {"Bearer " + CHAVE})
            self.assertEqual(bool(para_o_openverse), fonte == "1")
            self.assertNotIn(CHAVE, json.dumps(para_o_openverse))
            self.assertNotIn(CHAVE.encode("utf-8"), guardado)

    def test_a_aba_custos_conta_a_foto_real_do_envio(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openverse.fotos = FOTOS
            enviar(conexao)
            _, _, resposta = conexao.pedir("POST", "/analytics/jobs", corpo={})
        imagens_do_envio = json.loads(resposta)["jobs"][0]["images"]
        self.assertEqual((imagens_do_envio["total"], imagens_do_envio["real"], imagens_do_envio["generated"]), (1, 1, 0))


class AEtapaDasImagens(unittest.TestCase):
    def test_enquanto_a_imagem_e_escolhida_o_envio_diz_a_etapa_de_imagens_e_depois_volta_a_enviar(self):
        parado, solto = threading.Event(), threading.Event()

        def juiz(modo, candidatas):
            parado.set()
            solto.wait(10)
            return veredito_do_juiz(0, [90] + [10] * (len(candidatas) - 1))

        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openverse.fotos = FOTOS
            conexao.openai.juiz = juiz
            conexao.criar(pedido(ID, FRASE))
            parado.wait(10)
            durante = conexao.estado(ID)
            solto.set()
            fim = conexao.esperar(ID)
        self.assertEqual((durante["status"], durante["stage"]), ("running", "generate_images"))
        self.assertEqual(fim["status"], "completed")


class AColecaoNaoGuardaImagemDeCartaoQueJaEstava(unittest.TestCase):
    def test_o_cartao_duplicado_nao_grava_a_imagem_na_midia_da_colecao(self):
        colecao = ColecaoEmMemoria({"baralhos": [{"nome": "Inglês", "notas": [{"frente": "She <b>gave up</b> smoking", "verso": "x"}]}]})
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.openverse.fotos = FOTOS
            estado, notas = enviar(conexao)
        self.assertEqual((estado["duplicatePhraseIds"], notas, colecao.midia), ([1760000000000], [], {}))


if __name__ == "__main__":
    unittest.main()
