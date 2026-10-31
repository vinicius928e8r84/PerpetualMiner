"""O Cartão de texto pelo plano do ChatGPT (#155), visto de fora: com o login feito (o teste faz o papel do navegador, como em
`test_login_do_chatgpt.py`), o Envio pede o texto pela Responses API, renova o token, para quando o login acaba ou o plano chega ao
limite, e nenhum token, código ou verificador sai do arquivo do login. O desenho: `docs/design/login-do-chatgpt.md`.

    python3.9 complemento/test_plano_do_chatgpt.py
"""

import json
import os
import re
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_chatgpt_de_mentira import MARCA  # noqa: E402
from complemento.test_envio import ID, EnvioNoTeste, pedido  # noqa: E402
from complemento.test_login_do_chatgpt import arquivo_do_login, entrar_e_voltar, estado, trocas, tudo_o_que_ficou  # noqa: E402


class CartaoPeloPlano(unittest.TestCase):
    def test_com_o_login_o_texto_do_cartao_vai_pela_responses_api_e_nao_gasta_a_chave(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            entrar_e_voltar(conexao)
            with open(arquivo_do_login(conexao), encoding="utf-8") as arquivo:
                acesso = json.load(arquivo)["access_token"]
            conexao.criar(pedido(ID, "gave up : She gave up smoking"))
            fim = conexao.esperar(ID)
            notas = conexao.conexao.colecao.gravadas
            respostas, chats = list(conexao.openai.respostas), list(conexao.openai.chats)
            with open(os.path.join(os.path.dirname(__file__), "..", "engine", "prompts", "en_card.txt"), encoding="utf-8") as arquivo:
                prompt = arquivo.read().strip()
        self.assertEqual(fim["status"], "completed")
        self.assertEqual(chats, [])
        [(autorizacao, corpo)] = respostas
        self.assertEqual(autorizacao, "Bearer " + acesso)
        self.assertEqual(sorted(corpo), ["input", "instructions", "model", "store", "stream"])
        self.assertEqual((corpo["model"], corpo["store"], corpo["stream"]), ("gpt-6-luna", False, True))
        self.assertEqual(corpo["instructions"].strip(), prompt)
        self.assertEqual(corpo["input"], [{"role": "user", "content": "gave up : She gave up smoking"}])
        self.assertIn("<b>gave up</b>", notas[0]["campos"]["Frente"])

    def test_o_access_token_perto_de_vencer_e_renovado_antes_do_cartao_e_o_refresh_novo_substitui_o_antigo(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.servidor_de_login.validade = 60
            entrar_e_voltar(conexao)
            with open(arquivo_do_login(conexao), encoding="utf-8") as arquivo:
                antes = json.load(arquivo)
            conexao.criar(pedido(ID, "gave up : She gave up smoking"))
            conexao.esperar(ID)
            renovacoes = [form for form in trocas(conexao) if form["grant_type"] == "refresh_token"]
            with open(arquivo_do_login(conexao), encoding="utf-8") as arquivo:
                depois = json.load(arquivo)
            [(autorizacao, _)] = conexao.openai.respostas
        self.assertEqual(
            {chave: renovacoes[0][chave] for chave in ("client_id", "refresh_token", "resource")},
            {"client_id": antes["client_id"], "refresh_token": antes["refresh_token"], "resource": "https://api.openai.com/v1"},
        )
        self.assertNotIn("scope", renovacoes[0])
        self.assertNotEqual(depois["refresh_token"], antes["refresh_token"])
        # Com a validade abaixo da margem, a escolha da imagem renova de novo depois do texto: o arquivo guarda o último, o do texto é um renovado.
        self.assertNotEqual(autorizacao, "Bearer " + antes["access_token"])
        self.assertNotEqual(depois["access_token"], antes["access_token"])

    def test_um_login_que_acabou_para_o_envio_e_nao_gasta_a_chave(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.servidor_de_login.validade = 60
            entrar_e_voltar(conexao)
            conexao.servidor_de_login.renovacao = "invalid_grant"
            conexao.criar(pedido(ID, "gave up : She gave up smoking"))
            fim = conexao.esperar(ID)
            self.assertEqual((fim["status"], fim["lastError"]), ("failed", "chatgpt_signed_out"))
            self.assertEqual((conexao.openai.chats, conexao.openai.respostas), ([], []))
            self.assertEqual(estado(conexao)["conectada"], False)
            self.assertNotIn(MARCA, conexao.log())

    def test_o_limite_do_plano_faz_o_envio_esperar_o_plano_sem_pedir_o_texto_de_novo_antes_da_hora(self):
        for como in ("antes do stream", "no meio do stream"):
            with self.subTest(como), tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
                if como == "antes do stream":
                    conexao.openai.recusa_das_respostas = (429, "subscription_sharing_usage_limit_exceeded")
                else:
                    conexao.openai.falha_no_stream = "subscription_sharing_usage_limit_exceeded"
                entrar_e_voltar(conexao)
                conexao.criar(pedido(ID, "gave up : She gave up smoking", "give in : They gave in"))
                espera = conexao.esperar(ID, lambda estado: estado.get("waiting"))
                self.assertEqual((espera["status"], espera["lastError"], espera["waiting"]), ("running", None, {"reason": "plan_limit"}))
                self.assertEqual((len(conexao.openai.respostas), conexao.conexao.colecao.gravadas), (1, []))


class OsCustosDoPlano(unittest.TestCase):
    def test_a_aba_custos_conta_o_cartao_feito_pelo_plano_e_o_que_ele_teria_custado_na_chave(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            entrar_e_voltar(conexao)
            conexao.criar(pedido(ID, "gave up : She gave up smoking", "give in : They gave in"))
            conexao.esperar(ID, limite=60)
            [linha] = json.loads(conexao.pedir("POST", "/analytics/jobs", corpo={"lang": "all"})[2])["jobs"]
            registros = conexao.arquivos()[os.path.join("custos", ID, "costs.jsonl")].decode("utf-8")
        # 1000 tokens de entrada e 200 de saída por Cartão, ao preço do gpt-4o da chave (US$ 0,0045 cada).
        self.assertEqual(linha["plan"], {"cards": 2, "wouldCostUsd": 0.009})
        self.assertEqual((linha["successfulCards"], linha["costs"]["cardUsd"]), (2, 0.0))
        self.assertNotIn("gave up", registros)

    def test_o_cartao_feito_pela_chave_nao_leva_plano_nos_custos(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(pedido(ID, "gave up : She gave up smoking"))
            conexao.esperar(ID)
            [linha] = json.loads(conexao.pedir("POST", "/analytics/jobs", corpo={"lang": "all"})[2])["jobs"]
        self.assertNotIn("plan", linha)
        self.assertEqual(linha["costs"]["cardUsd"], 0.0045)

    def test_o_limite_do_plano_nao_conta_cartao_que_o_plano_nao_fez(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openai.recusa_das_respostas = (429, "subscription_sharing_usage_limit_exceeded")
            entrar_e_voltar(conexao)
            conexao.criar(pedido(ID, "gave up : She gave up smoking"))
            conexao.esperar(ID, lambda estado: estado.get("waiting"))  # o limite do plano espera, não falha (#158)
            [linha] = json.loads(conexao.pedir("POST", "/analytics/jobs", corpo={"lang": "all"})[2])["jobs"]
        self.assertNotIn("plan", linha)


class OsTokensSoNoArquivoDoLogin(unittest.TestCase):
    def test_nenhum_token_codigo_ou_verificador_aparece_fora_do_arquivo_do_login(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.servidor_de_login.validade = 60  # renova antes do Cartão: o token novo também
            consulta, retorno = entrar_e_voltar(conexao)
            conexao.criar(pedido(ID, "gave up : She gave up smoking"))
            conexao.esperar(ID)
            [troca] = [form for form in trocas(conexao) if form["grant_type"] == "authorization_code"]
            segredos = list(conexao.servidor_de_login.emitidos) + [consulta["code"], troca["code_verifier"]]
            respostas = [retorno[2]] + [conexao.pedir("POST", caminho, corpo=corpo)[2] for caminho, corpo in (
                ("/ia/chatgpt/estado", {}), ("/ia/estado", {}), ("/jobs/list", {}), ("/jobs/get", {"jobId": ID}),
                ("/jobs/debug-bundle", {"jobId": ID}), ("/analytics/jobs", {"lang": "all"}))]
            ficou = tudo_o_que_ficou(conexao)
        self.assertGreaterEqual(len(segredos), 5)
        for segredo in segredos:
            for nome, conteudo in ficou.items():
                self.assertNotIn(segredo, conteudo, nome)
            for resposta in respostas:
                self.assertNotIn(segredo.encode("utf-8"), resposta)
        self.assertFalse([nome for nome in ficou if re.search(MARCA, nome)])

    def test_quando_a_renovacao_ou_a_responses_api_falham_nenhum_token_vai_ao_log_nem_ao_que_a_conexao_responde(self):
        # Os de mentira devolvem o token no corpo do erro: o que a Conexão guarda ou responde não pode repeti-lo.
        falhas = {
            "renovacao fora do ar": lambda conexao: setattr(conexao.servidor_de_login, "renovacao", "fora_do_ar"),
            "renovacao recusada": lambda conexao: setattr(conexao.servidor_de_login, "renovacao", "invalid_grant"),
            "recusa antes do stream": lambda conexao: setattr(conexao.openai, "recusa_das_respostas", (401, "invalid_token")),
            "limite antes do stream": lambda conexao: setattr(conexao.openai, "recusa_das_respostas", (429, "subscription_sharing_usage_limit_exceeded")),
            "falha no meio do stream": lambda conexao: setattr(conexao.openai, "falha_no_stream", "server_error"),
        }
        for nome, falhar in falhas.items():
            with self.subTest(nome), tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
                conexao.servidor_de_login.validade = 60  # renova antes do Cartão
                entrar_e_voltar(conexao)
                falhar(conexao)
                conexao.criar(pedido(ID, "gave up : She gave up smoking"))
                conexao.esperar(ID, lambda estado: estado["status"] == "failed" or estado.get("waiting"))  # o limite do plano espera, não falha
                segredos = list(conexao.servidor_de_login.emitidos)
                respostas = [conexao.pedir("POST", caminho, corpo=corpo)[2] for caminho, corpo in (
                    ("/ia/chatgpt/estado", {}), ("/ia/estado", {}), ("/jobs/list", {}), ("/jobs/get", {"jobId": ID}),
                    ("/jobs/debug-bundle", {"jobId": ID}), ("/analytics/jobs", {"lang": "all"}))]
                ficou = tudo_o_que_ficou(conexao)
                log = conexao.log()
                self.assertGreaterEqual(len(segredos), 2)
                for segredo in segredos:
                    self.assertNotIn(segredo, log)
                    self.assertNotIn(MARCA, log)
                    for arquivo, conteudo in ficou.items():
                        self.assertNotIn(segredo, conteudo, arquivo)
                    for resposta in respostas:
                        self.assertNotIn(segredo.encode("utf-8"), resposta)
                self.assertFalse([arquivo for arquivo in ficou if re.search(MARCA, arquivo)])


if __name__ == "__main__":
    unittest.main()
