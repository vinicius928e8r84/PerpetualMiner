"""Entrar com o ChatGPT (#155), visto de fora: o servidor real da Conexão, o servidor de login de mentira
(`test_chatgpt_de_mentira.py`) e a OpenAI de mentira na fronteira HTTP. O teste faz o papel do navegador da pessoa: abre a URL
de autorização que a Conexão deu e volta pelo `GET /auth/callback`. O desenho: `docs/design/login-do-chatgpt.md`.

    python3.9 complemento/test_login_do_chatgpt.py
"""

import base64
import hashlib
import json
import os
import stat
import sys
import tempfile
import unittest
from urllib.parse import parse_qs, urlencode, urlsplit

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_chatgpt_de_mentira import MARCA  # noqa: E402
from complemento.test_servidor import ConexaoNoTeste  # noqa: E402

ESCOPOS = {"openid", "profile", "email", "offline_access", "resource.invoke", "chatgpt.tokens.use.direct"}


def json_de(resposta):
    return json.loads(resposta[2])


def entrar(conexao):
    """`POST /ia/chatgpt/entrar`: a URL de autorização e os parâmetros dela."""
    status, _, corpo = conexao.pedir("POST", "/ia/chatgpt/entrar", corpo={})
    assert status == 200, corpo
    url = json.loads(corpo)["url"]
    return url, {chave: valor[0] for chave, valor in parse_qs(urlsplit(url).query).items()}


def voltar(conexao, consulta, host=None):
    """O navegador volta ao retorno da Conexão: uma navegação, sem `Origin`."""
    return conexao.pedir("GET", "/auth/callback?" + urlencode(consulta), origem=None, cabecalhos={"Host": host} if host else None)


def entrar_e_voltar(conexao, **autorizar):
    url, _ = entrar(conexao)
    consulta = conexao.servidor_de_login.autorizar(url, **autorizar)
    return consulta, voltar(conexao, consulta)


def estado(conexao):
    return json_de(conexao.pedir("POST", "/ia/chatgpt/estado", corpo={}))


def trocas(conexao):
    return [form for metodo, caminho, form in conexao.servidor_de_login.pedidos if caminho == "/api/accounts/oauth/token"]


def arquivo_do_login(conexao):
    return os.path.join(conexao.chaves, "chatgpt.json")


def tudo_o_que_ficou(conexao):
    """Cada arquivo da pasta de dados da Conexão, menos o do login, como texto."""
    lidos = {}
    for raiz, _, nomes in os.walk(conexao.pasta):
        for nome in nomes:
            caminho = os.path.join(raiz, nome)
            if caminho != arquivo_do_login(conexao):
                with open(caminho, "rb") as arquivo:
                    lidos[os.path.relpath(caminho, conexao.pasta)] = arquivo.read().decode("utf-8", "replace")
    return lidos


class AURLDeAutorizacao(unittest.TestCase):
    def test_entrar_da_a_url_oficial_com_o_cliente_dinamico_o_pkce_e_o_retorno_na_porta_da_conexao(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            url, parametros = entrar(conexao)
            depois = estado(conexao)
            porta = conexao.conexao.porta
        self.assertTrue(url.startswith("https://auth.openai.com/api/accounts/authorize?"), url)
        self.assertEqual(
            {chave: parametros[chave] for chave in ("client_id", "agent_name_hint", "response_type", "redirect_uri", "resource", "code_challenge_method")},
            {"client_id": "dynamic_agent_client", "agent_name_hint": "PerpetualMiner", "response_type": "code",
             "redirect_uri": "http://127.0.0.1:%d/auth/callback" % porta, "resource": "https://api.openai.com/v1", "code_challenge_method": "S256"},
        )
        self.assertEqual(set(parametros["scope"].split()), ESCOPOS)
        self.assertRegex(parametros["ext_agent_host_id"], r"^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
        self.assertRegex(parametros["code_challenge"], r"^[A-Za-z0-9_-]{43}$")
        self.assertGreaterEqual(min(len(parametros["state"]), len(parametros["nonce"])), 32)
        self.assertEqual(depois, {"conectada": False, "entrando": True, "falha": None})

    def test_cada_tentativa_tem_state_desafio_e_nonce_novos_e_o_mesmo_id_deste_computador(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            _, primeira = entrar(conexao)
            _, segunda = entrar(conexao)
        for campo in ("state", "code_challenge", "nonce"):
            self.assertNotEqual(primeira[campo], segunda[campo], campo)
        self.assertEqual(primeira["ext_agent_host_id"], segunda["ext_agent_host_id"])

    def test_sem_login_o_estado_e_desconectada(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            self.assertEqual(estado(conexao), {"conectada": False, "entrando": False, "falha": None})


class ORetorno(unittest.TestCase):
    def test_o_retorno_certo_troca_o_codigo_com_o_verificador_do_desafio_e_guarda_os_tokens_so_para_o_dono(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            url, parametros = entrar(conexao)
            consulta = conexao.servidor_de_login.autorizar(url)
            status, _, _ = voltar(conexao, consulta)
            depois = estado(conexao)
            [troca] = trocas(conexao)
            modo = stat.S_IMODE(os.stat(arquivo_do_login(conexao)).st_mode)
            with open(arquivo_do_login(conexao), encoding="utf-8") as arquivo:
                guardado = json.load(arquivo)
            emitidos = list(conexao.servidor_de_login.emitidos)
        self.assertEqual(status, 200)
        self.assertEqual(depois, {"conectada": True, "entrando": False, "falha": None})
        desafio = base64.urlsafe_b64encode(hashlib.sha256(troca["code_verifier"].encode("ascii")).digest()).rstrip(b"=").decode("ascii")
        self.assertEqual(desafio, parametros["code_challenge"])
        self.assertEqual(
            {chave: troca[chave] for chave in ("grant_type", "client_id", "code", "redirect_uri", "resource")},
            {"grant_type": "authorization_code", "client_id": consulta["client_id"], "code": consulta["code"],
             "redirect_uri": parametros["redirect_uri"], "resource": "https://api.openai.com/v1"},
        )
        self.assertNotIn("client_secret", troca)
        if os.name != "nt":
            self.assertEqual(modo, 0o600)
        self.assertEqual(guardado["client_id"], consulta["client_id"])
        self.assertEqual(sorted(guardado[chave] for chave in ("access_token", "refresh_token", "id_token")), sorted(emitidos))

    def test_o_state_vale_uma_vez_so(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            consulta, _ = entrar_e_voltar(conexao)
            voltar(conexao, consulta)
            self.assertEqual(len(trocas(conexao)), 1)
            self.assertTrue(estado(conexao)["conectada"])

    def test_outro_state_nao_troca_nada_e_a_tentativa_certa_continua_esperando(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            url, _ = entrar(conexao)
            consulta = conexao.servidor_de_login.autorizar(url)
            voltar(conexao, dict(consulta, state="outro-state-de-quem-adivinha"))
            voltar(conexao, {"code": consulta["code"]})
            meio = (estado(conexao), len(trocas(conexao)))
            voltar(conexao, consulta)
            fim = estado(conexao)
        self.assertEqual(meio, ({"conectada": False, "entrando": True, "falha": None}, 0))
        self.assertTrue(fim["conectada"])

    def test_o_retorno_sem_tentativa_ou_com_a_tentativa_expirada_nao_troca_nada(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            voltar(conexao, {"code": "x", "state": "y", "client_id": "oaiapp_x"})
            conexao.conexao.chatgpt.validade_da_tentativa = 0
            entrar_e_voltar(conexao)
            depois = estado(conexao)
            self.assertEqual(trocas(conexao), [])
        self.assertEqual(depois, {"conectada": False, "entrando": False, "falha": None})

    def test_o_retorno_so_vale_no_endereco_de_loopback_da_conexao(self):
        # Um site que aponta o próprio nome para 127.0.0.1 (DNS rebinding) chega à porta com outro `Host`.
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            url, _ = entrar(conexao)
            consulta = conexao.servidor_de_login.autorizar(url)
            voltar(conexao, consulta, host="site-malicioso.exemplo:%d" % conexao.conexao.porta)
            voltar(conexao, consulta, host="localhost:%d" % conexao.conexao.porta)
            self.assertEqual((len(trocas(conexao)), estado(conexao)["entrando"]), (0, True))

    def test_o_retorno_com_a_origem_de_um_site_e_recusado(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            url, _ = entrar(conexao)
            consulta = conexao.servidor_de_login.autorizar(url)
            status, _, _ = conexao.pedir("GET", "/auth/callback?" + urlencode(consulta), origem="https://site.exemplo")
            self.assertEqual((status, len(trocas(conexao))), (403, 0))

    def test_a_pagina_do_retorno_e_sempre_a_mesma_e_nao_repete_nada_do_pedido(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            url, _ = entrar(conexao)
            consulta = conexao.servidor_de_login.autorizar(url)
            paginas = [
                voltar(conexao, dict(consulta, state="errado")),
                voltar(conexao, consulta),
                voltar(conexao, consulta),
                voltar(conexao, {"error": "access_denied", "state": "x"}),
                conexao.pedir("GET", "/auth/callback", origem=None),
            ]
        self.assertEqual({(status, corpo) for status, _, corpo in paginas}, {(200, paginas[0][2])})
        status, cabecalhos, corpo = paginas[1]
        self.assertIn("Pode fechar esta aba e voltar ao PerpetualMiner.", corpo.decode("utf-8"))
        self.assertEqual(
            (cabecalhos["Content-Type"], cabecalhos["Cache-Control"], cabecalhos["Referrer-Policy"], cabecalhos["Content-Security-Policy"]),
            ("text/html; charset=utf-8", "no-store", "no-referrer", "default-src 'none'"),
        )
        for valor in (consulta["code"], consulta["state"], consulta["client_id"], MARCA):
            self.assertNotIn(valor.encode("utf-8"), corpo)


class OQueNaoViraLogin(unittest.TestCase):
    def test_recusar_no_chatgpt_nao_guarda_nada_e_o_estado_diz_a_recusa(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            entrar_e_voltar(conexao, erro="access_denied")
            self.assertEqual(estado(conexao), {"conectada": False, "entrando": False, "falha": "chatgpt_access_denied"})
            self.assertEqual((trocas(conexao), os.path.exists(arquivo_do_login(conexao))), ([], False))

    def test_sem_o_uso_do_plano_autorizado_nada_e_guardado(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            conexao.servidor_de_login.troca = "sem_plano"
            entrar_e_voltar(conexao)
            self.assertEqual(estado(conexao)["falha"], "chatgpt_plan_not_granted")
            self.assertFalse(os.path.exists(arquivo_do_login(conexao)))

    def test_a_troca_recusada_ou_fora_do_ar_nao_guarda_nada_nem_escreve_o_codigo_no_log(self):
        for troca in ("invalid_grant", "fora_do_ar"):
            with self.subTest(troca), tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
                conexao.servidor_de_login.troca = troca
                entrar_e_voltar(conexao)
                [pedido_da_troca] = trocas(conexao)
                self.assertEqual(estado(conexao), {"conectada": False, "entrando": False, "falha": "chatgpt_login_failed"})
                self.assertFalse(os.path.exists(arquivo_do_login(conexao)))
                log = conexao.log()
                self.assertNotIn(MARCA, log)
                self.assertNotIn(pedido_da_troca["code_verifier"], log)

    def test_o_invalid_grant_da_troca_deixa_tentar_de_novo_e_so_o_segundo_seguido_diz_que_o_plano_nao_serve_para_a_conta(self):
        # Risco 9: a conta grátis ou Go deu `400 invalid_grant` sem segunda tentativa. Uma recusa só pode ser um código gasto.
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            conexao.servidor_de_login.troca = "invalid_grant"
            entrar_e_voltar(conexao)
            primeira = estado(conexao)["falha"]
            entrar_e_voltar(conexao)
            segunda = estado(conexao)
            conexao.servidor_de_login.troca = "aceita"
            entrar_e_voltar(conexao)
            conectada = estado(conexao)
            conexao.pedir("POST", "/ia/chatgpt/sair", corpo={})
            conexao.servidor_de_login.troca = "invalid_grant"
            entrar_e_voltar(conexao)
            recomecou = estado(conexao)["falha"]
        self.assertEqual((primeira, segunda["falha"], segunda["conectada"]), ("chatgpt_login_failed", "chatgpt_not_eligible", False))
        self.assertEqual(conectada, {"conectada": True, "entrando": False, "falha": None})
        self.assertEqual(recomecou, "chatgpt_login_failed")

    def test_um_id_token_com_outro_nonce_e_recusado(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            url, parametros = entrar(conexao)
            consulta = conexao.servidor_de_login.autorizar(url.replace(parametros["nonce"], "nonce-de-outra-tentativa"))
            voltar(conexao, consulta)
            self.assertEqual(estado(conexao)["falha"], "chatgpt_login_failed")
            self.assertFalse(os.path.exists(arquivo_do_login(conexao)))


class Sair(unittest.TestCase):
    def test_sair_revoga_o_refresh_token_e_apaga_o_arquivo_e_repetido_responde_igual(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            entrar_e_voltar(conexao)
            with open(arquivo_do_login(conexao), encoding="utf-8") as arquivo:
                guardado = json.load(arquivo)
            _, primeiro = entrar(conexao)
            respostas = [json_de(conexao.pedir("POST", "/ia/chatgpt/sair", corpo={})) for _ in range(2)]
            revogados = list(conexao.servidor_de_login.revogados)
            [revogacao] = [form for _, caminho, form in conexao.servidor_de_login.pedidos if caminho == "/oauth/revoke"]
            depois = estado(conexao)
            existe = os.path.exists(arquivo_do_login(conexao))
            _, de_novo = entrar(conexao)
        self.assertEqual(respostas, [{"ok": True, "revogada": True}] * 2)
        self.assertEqual(revogados, [guardado["refresh_token"]])
        self.assertEqual((revogacao["token_type_hint"], revogacao["client_id"]), ("refresh_token", guardado["client_id"]))
        self.assertEqual((depois, existe), ({"conectada": False, "entrando": False, "falha": None}, False))
        self.assertEqual(de_novo["ext_agent_host_id"], primeiro["ext_agent_host_id"])

    def test_sair_sem_a_revogacao_confirmada_apaga_assim_mesmo_e_diz_que_nao_confirmou(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            entrar_e_voltar(conexao)
            conexao.servidor_de_login.revogacao = 503
            resposta = json_de(conexao.pedir("POST", "/ia/chatgpt/sair", corpo={}))
            self.assertEqual((resposta, os.path.exists(arquivo_do_login(conexao))), ({"ok": True, "revogada": False}, False))


if __name__ == "__main__":
    unittest.main()
