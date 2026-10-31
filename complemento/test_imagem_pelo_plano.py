"""A imagem do Cartão com o plano do ChatGPT (#156), vista de fora: o servidor real com a thread de trabalho ligada, o login feito (o teste
faz o papel do navegador), a coleção em memória, a OpenAI e o Openverse de mentira na fronteira HTTP. Com o login, o juiz de imagem vai
pela Responses API (o JSON por `text.format`) e a imagem gerada sai sempre pela chave; sem chave, o Cartão leva a foto real ou nenhuma
imagem gerada; o primeiro limite de uso do plano para o Envio sem estragar o Cartão. O desenho: `docs/design/imagem-pelo-plano.md`.

    python3.9 complemento/test_imagem_pelo_plano.py
"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_envio import CHAVE, ID, EnvioNoTeste, pedido  # noqa: E402
from complemento.test_envio_imagem import FOTOS, FRASE, imagens, juiz_fraco_que_prefere_a_gerada, juiz_que_prefere, so_a_imagem  # noqa: E402
from complemento.test_imagens_de_mentira import png_de  # noqa: E402
from complemento.test_login_do_chatgpt import arquivo_do_login, entrar_e_voltar, tudo_o_que_ficou  # noqa: E402
from complemento.test_modelo_dos_cartoes import cenario, escolher  # noqa: E402

JUIZ = "You are an expert visual selector"


def acesso_do_login(conexao):
    with open(arquivo_do_login(conexao), encoding="utf-8") as arquivo:
        return "Bearer " + json.load(arquivo)["access_token"]


def enviar_com_o_plano(conexao, *, corpo=None):
    """Entra com o ChatGPT, envia a Frase e devolve (o login, o estado do Envio, as notas gravadas)."""
    entrar_e_voltar(conexao)
    conexao.criar(corpo or pedido(ID, FRASE))
    estado = conexao.esperar(ID)
    return acesso_do_login(conexao), estado, conexao.conexao.colecao.gravadas


def do_juiz(conexao):
    """Os pedidos do juiz à Responses API: (Authorization, corpo)."""
    return [(autorizacao, corpo) for autorizacao, corpo in conexao.openai.respostas if corpo["instructions"].startswith(JUIZ)]


class OJuizDeImagemPeloPlano(unittest.TestCase):
    def test_com_o_login_o_juiz_vai_pela_responses_api_com_o_json_em_text_format_e_a_foto_que_ele_escolhe_entra_no_cartao(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openverse.fotos = FOTOS
            conexao.openai.juiz = juiz_que_prefere(1)
            acesso, estado, notas = enviar_com_o_plano(conexao)
            [(autorizacao, corpo)] = do_juiz(conexao)
            juizes, geradas = list(conexao.openai.juizes), list(conexao.openai.imagens)
        self.assertEqual((estado["status"], estado["cards"]["1760000000000-0"]["status"]), ("completed", "added"))
        arquivo, = imagens(notas[0]["campos"])
        self.assertEqual(so_a_imagem(notas[0]["midia"]), {arquivo: png_de("foto-b")})
        self.assertEqual(autorizacao, acesso)
        self.assertEqual(sorted(corpo), ["input", "instructions", "model", "store", "stream", "text"])
        self.assertEqual((corpo["model"], corpo["store"], corpo["stream"], corpo["text"]), ("gpt-6-luna", False, True, {"format": {"type": "json_object"}}))
        mensagem, = corpo["input"]
        self.assertEqual(mensagem["role"], "user")
        partes = mensagem["content"]
        self.assertEqual([parte["type"] for parte in partes], ["input_text"] + ["input_text", "input_image"] * 2)
        self.assertIn("JSON", partes[0]["text"])  # o `json_object` exige a palavra no que a pessoa manda
        self.assertTrue(all(parte["image_url"].startswith("data:image/png;base64,") for parte in partes[2::2]))
        self.assertEqual([(a, modo, [c["imagem"] for c in candidatas]) for a, modo, candidatas in juizes], [(acesso, "real_only", [png_de("foto-a"), png_de("foto-b")])])
        self.assertEqual((conexao.openai.chats, geradas), ([], []))

    def test_a_foto_que_o_juiz_do_plano_nao_le_manda_o_cartao_para_a_imagem_gerada_pela_chave(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openverse.fotos = FOTOS
            conexao.openai.recusar_o_chat_de("[juiz]", 400, "invalid_image_format")
            _, estado, notas = enviar_com_o_plano(conexao)
            geradas = list(conexao.openai.imagens)
        arquivo, = imagens(notas[0]["campos"])
        self.assertEqual((estado["status"], so_a_imagem(notas[0]["midia"]), [a for a, _ in geradas]), ("completed", {arquivo: png_de("gerada")}, ["Bearer " + CHAVE]))

    def test_o_juiz_do_plano_usa_o_automatico_da_conta_e_nao_o_modelo_que_a_pessoa_escolheu_para_o_texto(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, modelo=cenario("Automático")) as conexao:
            conexao.openverse.fotos = FOTOS
            conexao.openai.juiz = juiz_que_prefere(1)
            entrar_e_voltar(conexao)
            escolher(conexao, "gpt-6-sol")
            conexao.criar(pedido(ID, FRASE))
            conexao.esperar(ID)
            texto = [corpo["model"] for _, corpo in conexao.openai.respostas if not corpo["instructions"].startswith(JUIZ)]
            juiz = [corpo["model"] for _, corpo in do_juiz(conexao)]
        self.assertEqual((texto, juiz), (["gpt-6-sol"], ["gpt-6-luna"]))

    def test_o_custo_do_juiz_pelo_plano_nao_vira_dolar_nos_registros(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openverse.fotos = FOTOS
            enviar_com_o_plano(conexao)
            registros = [conteudo for nome, conteudo in conexao.arquivos().items() if nome.startswith("custos")]
        self.assertTrue(registros)
        self.assertFalse([registro for registro in registros if b"image_judge" in registro])


class AImagemGeradaSaiSempreSemChave(unittest.TestCase):
    def test_com_o_login_a_imagem_gerada_sai_pela_chave_e_a_comparacao_com_a_foto_vai_pelo_plano(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openverse.fotos = FOTOS
            conexao.openai.juiz = juiz_fraco_que_prefere_a_gerada
            acesso, estado, notas = enviar_com_o_plano(conexao)
            geradas, juizes = list(conexao.openai.imagens), [(a, modo) for a, modo, _ in conexao.openai.juizes]
        arquivo, = imagens(notas[0]["campos"])
        self.assertEqual((estado["status"], so_a_imagem(notas[0]["midia"])), ("completed", {arquivo: png_de("gerada")}))
        self.assertEqual([a for a, _ in geradas], ["Bearer " + CHAVE])
        self.assertEqual(juizes, [(acesso, "real_only"), (acesso, "real_vs_generated")])
        self.assertEqual(conexao.openai.chats, [])

    def test_com_o_login_e_a_imagem_gerada_pedida_nos_ajustes_a_triagem_e_a_geracao_saem_pela_chave(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            _, estado, notas = enviar_com_o_plano(conexao, corpo=dict(pedido(ID, FRASE), imageSource="2"))
            triagens, geradas = list(conexao.openai.triagens), list(conexao.openai.imagens)
        arquivo, = imagens(notas[0]["campos"])
        self.assertEqual((estado["status"], so_a_imagem(notas[0]["midia"])), ("completed", {arquivo: png_de("gerada")}))
        self.assertEqual(([a for a, _ in triagens], [a for a, _ in geradas]), (["Bearer " + CHAVE], ["Bearer " + CHAVE]))


class ComOPlanoESemChave(unittest.TestCase):
    def test_sem_chave_o_cartao_leva_a_foto_real_que_o_juiz_do_plano_escolheu_e_nenhuma_imagem_e_gerada(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, chave=None) as conexao:
            conexao.openverse.fotos = FOTOS
            conexao.openai.juiz = juiz_que_prefere(1)
            _, estado, notas = enviar_com_o_plano(conexao)
            geradas, triagens = list(conexao.openai.imagens), list(conexao.openai.triagens)
        arquivo, = imagens(notas[0]["campos"])
        self.assertEqual((estado["status"], so_a_imagem(notas[0]["midia"])), ("completed", {arquivo: png_de("foto-b")}))
        self.assertEqual((geradas, triagens), ([], []))

    def test_sem_chave_e_sem_foto_que_preste_o_cartao_sai_sem_imagem_e_a_geracao_nem_e_pedida(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, chave=None) as conexao:
            conexao.openverse.fotos = FOTOS
            conexao.openai.juiz = juiz_fraco_que_prefere_a_gerada
            acesso, estado, notas = enviar_com_o_plano(conexao)
            geradas, juizes = list(conexao.openai.imagens), [(a, modo) for a, modo, _ in conexao.openai.juizes]
        self.assertEqual((estado["status"], imagens(notas[0]["campos"]), so_a_imagem(notas[0]["midia"]), geradas), ("completed", [], {}, []))
        self.assertEqual(juizes, [(acesso, "real_only")])
        self.assertIn("<b>gave up</b>", notas[0]["campos"]["Frente"])

    def test_sem_chave_e_sem_nenhuma_foto_no_openverse_o_cartao_sai_sem_imagem(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, chave=None) as conexao:
            _, estado, notas = enviar_com_o_plano(conexao)
            pedidos = list(conexao.openai.imagens), do_juiz(conexao)
        self.assertEqual((estado["status"], imagens(notas[0]["campos"]), pedidos), ("completed", [], ([], [])))

    def test_sem_chave_com_a_imagem_gerada_pedida_nos_ajustes_o_cartao_sai_sem_imagem_e_nada_e_pedido_a_openai(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, chave=None) as conexao:
            conexao.openverse.fotos = FOTOS
            _, estado, notas = enviar_com_o_plano(conexao, corpo=dict(pedido(ID, FRASE), imageSource="2"))
            pedidos = (list(conexao.openai.imagens), list(conexao.openai.triagens), conexao.openverse.buscas)
        self.assertEqual((estado["status"], imagens(notas[0]["campos"]), pedidos), ("completed", [], ([], [], [])))


class OPrimeiroLimiteDeUsoDoPlano(unittest.TestCase):
    def test_o_limite_de_uso_no_juiz_para_o_envio_sem_gravar_o_cartao_sem_foto_e_tentar_de_novo_o_termina_sem_pagar_o_texto_outra_vez(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openverse.fotos = FOTOS
            conexao.openai.juiz = juiz_que_prefere(1)
            conexao.openai.recusa_do_juiz_do_plano = (429, "subscription_sharing_usage_limit_exceeded")
            acesso, parou, notas = enviar_com_o_plano(conexao)
            textos = len(conexao.openai.respostas) - len(do_juiz(conexao))
            self.assertEqual((parou["status"], parou["lastError"], notas), ("failed", "chatgpt_usage_limit", []))
            self.assertEqual(parou["cards"]["1760000000000-0"], {"phraseId": 1760000000000, "status": "failed", "error": "chatgpt_usage_limit"})
            self.assertEqual(json.loads(conexao.pedir("POST", "/ia/chatgpt/estado", corpo={})[2])["conectada"], True)

            conexao.openai.recusa_do_juiz_do_plano = None
            conexao.pedir("POST", "/jobs/retry", corpo={"jobId": ID})
            fim = conexao.esperar(ID, lambda estado: estado["status"] == "completed")
            notas = conexao.conexao.colecao.gravadas
            textos_depois = len(conexao.openai.respostas) - len(do_juiz(conexao))
        arquivo, = imagens(notas[0]["campos"])
        self.assertEqual((fim["lastError"], so_a_imagem(notas[0]["midia"]), textos, textos_depois), (None, {arquivo: png_de("foto-b")}, 1, 1))

    def test_quando_o_juiz_do_plano_falha_o_token_nao_vai_ao_log_nem_aos_arquivos_nem_a_resposta_da_conexao(self):
        # A OpenAI de mentira repete o `Authorization` na mensagem do erro: o que a Conexão guarda ou responde não pode repeti-lo.
        for recusa in ((429, "subscription_sharing_usage_limit_exceeded"), (403, "subscription_sharing_user_not_eligible"), (500, "server_error")):
            with self.subTest(recusa), tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
                conexao.openverse.fotos = FOTOS
                conexao.openai.recusa_do_juiz_do_plano = recusa
                acesso, _, _ = enviar_com_o_plano(conexao)
                segredos = [acesso[len("Bearer "):], *conexao.servidor_de_login.emitidos]
                respostas = [conexao.pedir("POST", caminho, corpo=corpo)[2] for caminho, corpo in (
                    ("/jobs/get", {"jobId": ID}), ("/jobs/list", {}), ("/jobs/debug-bundle", {"jobId": ID}), ("/analytics/jobs", {"lang": "all"}))]
                ficou, log = tudo_o_que_ficou(conexao), conexao.log()
                for segredo in segredos:
                    self.assertNotIn(segredo, log)
                    self.assertFalse([nome for nome, conteudo in ficou.items() if segredo in conteudo], segredo)
                    self.assertFalse([resposta for resposta in respostas if segredo.encode("utf-8") in resposta])

    def test_a_conta_que_o_plano_nao_atende_para_o_envio_com_chatgpt_not_eligible_e_nao_gasta_a_chave(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openai.recusa_das_respostas = (403, "subscription_sharing_user_not_eligible")
            _, estado, notas = enviar_com_o_plano(conexao)
            pedidos = (conexao.openai.chats, list(conexao.openai.imagens), list(conexao.openai.triagens))
        self.assertEqual((estado["status"], estado["lastError"], notas, pedidos), ("failed", "chatgpt_not_eligible", [], ([], [], [])))


if __name__ == "__main__":
    unittest.main()
