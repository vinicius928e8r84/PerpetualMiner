"""A Conexão com o Anki vista de fora: o servidor real, sem Anki e sem Qt.

Roda no Python 3.9 (o do Anki do Mac) e no 3.13:
    python3.9 complemento/test_servidor.py
"""

import contextlib
import http.client
import io
import json
import os
import socket
import sys
import tempfile
import threading
import unittest
import warnings

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import configuracao, registro, servidor  # noqa: E402
from test_openai_de_mentira import OpenAIDeMentira  # noqa: E402

CONTRATO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "contrato", "exemplos.json")
ORIGEM = configuracao.ORIGENS_ACEITAS[0]
VARIAVEIS_DE_PROXY = ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy")


def exemplos_do_contrato():
    with open(CONTRATO, encoding="utf-8") as arquivo:
        return json.load(arquivo)["exemplos"]


class ConexaoNoTeste:
    """A Conexão real numa porta livre, com o perfil que o teste escolher e uma OpenAI de mentira no lugar da de verdade.

    `chave_na_conexao`: os 4 últimos caracteres de uma chave que a Conexão já guardava antes de o teste começar.
    """

    def __init__(self, pasta, perfil="Usuário 1", origens=None, falha_no_perfil=False, openai="aceita", chave_na_conexao=None):
        self.perfil = perfil
        self.falha_no_perfil = falha_no_perfil
        self.pasta = pasta
        self.logs = os.path.join(pasta, "logs")
        self.chaves = os.path.join(pasta, "chaves")
        os.makedirs(self.logs, exist_ok=True)
        os.makedirs(self.chaves, exist_ok=True)
        if chave_na_conexao is not None:
            with open(os.path.join(self.chaves, "openai.json"), "w", encoding="utf-8") as arquivo:
                json.dump({"chave": "sk-proj-guardada-antes-" + chave_na_conexao}, arquivo)
        self.openai = OpenAIDeMentira(openai)
        self.logger = registro.criar(self.logs)
        self.conexao = servidor.Conexao(
            porta=0,
            origens_aceitas=origens or configuracao.ORIGENS_ACEITAS,
            versao=configuracao.VERSAO,
            perfil_aberto=self._ler_o_perfil,
            logger=self.logger,
            pasta_das_chaves=self.chaves,
            openai_base=self.openai.base,
        )

    def _ler_o_perfil(self):
        if self.falha_no_perfil:
            raise RuntimeError("perfil ilegível")
        return self.perfil

    def __enter__(self):
        self.openai.__enter__()
        assert self.conexao.iniciar(), "a porta de teste devia estar livre"
        return self

    def __exit__(self, *erro):
        self.conexao.parar()
        self.openai.__exit__(*erro)
        for handler in list(self.logger.handlers):
            handler.close()

    def pedir(self, metodo, caminho, origem=ORIGEM, cabecalhos=None, corpo=None, corpo_bruto=None):
        """`corpo` é um JSON (um dict); `corpo_bruto`, os bytes como vierem."""
        pedido = http.client.HTTPConnection("127.0.0.1", self.conexao.porta, timeout=5)
        enviados = dict(cabecalhos or {})
        if origem is not None:
            enviados["Origin"] = origem
        if corpo is not None:
            corpo_bruto = json.dumps(corpo)
        if corpo_bruto is not None:
            enviados["Content-Type"] = "application/json"
            corpo_bruto = corpo_bruto.encode("utf-8") if isinstance(corpo_bruto, str) else corpo_bruto
        try:
            pedido.request(metodo, caminho, body=corpo_bruto, headers=enviados)
            resposta = pedido.getresponse()
            return resposta.status, dict(resposta.getheaders()), resposta.read()
        finally:
            pedido.close()

    def log(self):
        with open(os.path.join(self.logs, "complemento.log"), encoding="utf-8") as arquivo:
            return arquivo.read()


class ContratoDaConexao(unittest.TestCase):
    def test_cada_exemplo_do_contrato_tem_a_resposta_combinada(self):
        for exemplo in exemplos_do_contrato():
            with self.subTest(exemplo["nome"]), tempfile.TemporaryDirectory() as pasta:
                contexto = exemplo["contexto"]
                with ConexaoNoTeste(
                    pasta,
                    perfil=contexto["perfil"],
                    falha_no_perfil=contexto.get("falhaNoPerfil", False),
                    openai=contexto.get("openai", "aceita"),
                    chave_na_conexao=contexto.get("chaveNaConexao"),
                ) as conexao:
                    pedido = exemplo["pedido"]
                    status, _, corpo = conexao.pedir(
                        pedido["metodo"], pedido["caminho"], pedido["origem"],
                        corpo=pedido.get("corpo"), corpo_bruto=pedido.get("corpoBruto"),
                    )
                self.assertEqual(
                    (status, json.loads(corpo)),
                    (exemplo["resposta"]["status"], exemplo["resposta"]["json"]),
                    'O complemento e o contrato (complemento/contrato/exemplos.json) se separaram no exemplo "%s". '
                    "Se a mudança é de propósito, atualize o exemplo; o fake da Conexão do e2e lê o mesmo arquivo."
                    % exemplo["nome"],
                )

    def test_o_contrato_tem_a_origem_da_extensao_que_o_complemento_aceita(self):
        with open(CONTRATO, encoding="utf-8") as arquivo:
            self.assertEqual(json.load(arquivo)["origemDaExtensao"], ORIGEM)


class SaudeDaConexao(unittest.TestCase):
    def test_saude_traz_a_versao_do_complemento_e_o_perfil_aberto(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, perfil="Maria") as conexao:
            status, _, corpo = conexao.pedir("GET", "/health")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(corpo), {"ok": True, "versao": configuracao.VERSAO, "perfil": "Maria"})

    def test_saude_acompanha_o_perfil_que_o_anki_abre_depois(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, perfil=None) as conexao:
            antes = json.loads(conexao.pedir("GET", "/health")[2])["perfil"]
            conexao.perfil = "Maria"
            depois = json.loads(conexao.pedir("GET", "/health")[2])["perfil"]
        self.assertEqual((antes, depois), (None, "Maria"))


class OrigemDosPedidos(unittest.TestCase):
    def test_a_extensao_recebe_a_resposta_com_a_origem_dela_liberada(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            _, cabecalhos, _ = conexao.pedir("GET", "/health")
        self.assertEqual(cabecalhos.get("Access-Control-Allow-Origin"), ORIGEM)

    def test_saude_sem_origem_responde_so_a_versao_e_o_perfil(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, cabecalhos, corpo = conexao.pedir("GET", "/health", origem=None)
        self.assertEqual(status, 200)
        self.assertEqual(sorted(json.loads(corpo)), ["ok", "perfil", "versao"])
        self.assertNotIn("Access-Control-Allow-Origin", cabecalhos)

    def test_sem_origem_nada_alem_da_saude_e_atendido_com_ou_sem_sec_fetch_site(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            for cabecalhos in ({}, {"Sec-Fetch-Site": "none"}):
                for metodo, caminho in (("GET", "/jobs"), ("GET", "/health/"), ("POST", "/health"), ("POST", "/jobs"), ("OPTIONS", "/health")):
                    with self.subTest("%s %s %s" % (metodo, caminho, cabecalhos)):
                        status, _, corpo = conexao.pedir(metodo, caminho, origem=None, cabecalhos=cabecalhos)
                        self.assertEqual((status, json.loads(corpo) if corpo else None), (403, {"error": "origin_not_allowed"}))

    def test_todo_verbo_passa_pela_mesma_autorizacao_de_origem(self):
        verbos = ("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE", "FOO")
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            for verbo in verbos:
                for descricao, origem in (("sem origem", None), ("com origem de outro site", "https://exemplo.com")):
                    with self.subTest("%s %s" % (verbo, descricao)):
                        status, cabecalhos, corpo = conexao.pedir(verbo, "/jobs", origem=origem)
                        self.assertEqual(status, 403)
                        self.assertEqual(corpo, b"" if verbo == "HEAD" else b'{"error": "origin_not_allowed"}')
                        self.assertNotIn("text/html", cabecalhos.get("Content-Type", ""))
                with self.subTest("%s com a origem da extensão numa rota que não existe" % verbo):
                    status, _, _ = conexao.pedir(verbo, "/nao-existe")
                    self.assertEqual(status, 404 if verbo != "OPTIONS" else 204)

    def test_com_a_origem_de_outra_extensao_nada_e_atendido_nem_a_saude(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            outra = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            respostas = [conexao.pedir(m, c, origem=outra)[0] for m, c in (("GET", "/health"), ("GET", "/jobs"), ("POST", "/jobs"))]
        self.assertEqual(respostas, [403, 403, 403])

    def test_origem_de_outro_site_nao_recebe_a_origem_liberada_nem_dado_algum(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, cabecalhos, corpo = conexao.pedir("GET", "/health", origem="https://exemplo.com")
        self.assertEqual(status, 403)
        self.assertNotIn("Access-Control-Allow-Origin", cabecalhos)
        self.assertNotIn(b"versao", corpo)

    def test_pedido_de_verificacao_previa_da_extensao_e_respondido(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, cabecalhos, _ = conexao.pedir(
                "OPTIONS",
                "/health",
                cabecalhos={"Access-Control-Request-Method": "POST", "Access-Control-Request-Private-Network": "true"},
            )
        self.assertEqual(status, 204)
        self.assertEqual(cabecalhos.get("Access-Control-Allow-Origin"), ORIGEM)
        self.assertIn("POST", cabecalhos.get("Access-Control-Allow-Methods", ""))
        self.assertEqual(cabecalhos.get("Access-Control-Allow-Private-Network"), "true")

    def test_pedido_de_verificacao_previa_de_outro_site_e_recusado(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, cabecalhos, _ = conexao.pedir("OPTIONS", "/health", origem="https://exemplo.com")
        self.assertEqual(status, 403)
        self.assertNotIn("Access-Control-Allow-Origin", cabecalhos)


class ProcessoDoAnki(unittest.TestCase):
    """Dentro do Anki a Conexão não mexe no processo e nenhum erro abre o diálogo dele."""

    def estado_do_processo(self):
        return {
            "proxy": {nome: os.environ.get(nome) for nome in VARIAVEIS_DE_PROXY},
            "stdout": sys.stdout,
            "stderr": sys.stderr,
            "excepthook": sys.excepthook,
            "thread_excepthook": threading.excepthook,
            "avisos": list(warnings.filters),
            "mostrar_aviso": warnings.showwarning,
            "tempo_do_socket": socket.getdefaulttimeout(),
        }

    def test_subir_atender_e_parar_nao_troca_proxy_stdout_stderr_excepthook_nem_avisos(self):
        antes = self.estado_do_processo()
        with tempfile.TemporaryDirectory() as pasta:
            with ConexaoNoTeste(pasta) as conexao:
                conexao.pedir("GET", "/health")
                conexao.pedir("GET", "/nao-existe")
                conexao.pedir("GET", "/health", origem="https://exemplo.com")
        self.assertEqual(self.estado_do_processo(), antes)

    def test_erro_dentro_de_uma_rota_vai_ao_log_do_complemento_e_a_nenhum_outro_lugar(self):
        chamadas_do_excepthook = []
        original = sys.excepthook
        sys.excepthook = lambda *dados: chamadas_do_excepthook.append(dados)
        saida, erro = io.StringIO(), io.StringIO()
        try:
            with tempfile.TemporaryDirectory() as pasta:
                with contextlib.redirect_stdout(saida), contextlib.redirect_stderr(erro):
                    with ConexaoNoTeste(pasta, falha_no_perfil=True) as conexao:
                        conexao.pedir("GET", "/health")  # a resposta 500 é o exemplo do contrato
                        registrado = conexao.log()
        finally:
            sys.excepthook = original
        self.assertIn("perfil ilegível", registrado)
        self.assertEqual((saida.getvalue(), erro.getvalue(), chamadas_do_excepthook), ("", "", []))

    def test_pedido_quebrado_vai_ao_log_e_nao_ao_stderr(self):
        erro = io.StringIO()
        with tempfile.TemporaryDirectory() as pasta, contextlib.redirect_stderr(erro):
            with ConexaoNoTeste(pasta) as conexao:
                bruto = socket.create_connection(("127.0.0.1", conexao.conexao.porta), timeout=5)
                bruto.sendall(b"\x16\x03\x01 isto nao e http\r\n\r\n")
                bruto.recv(4096)
                bruto.close()
                conexao.pedir("GET", "/health")
                registrado = conexao.log()
        self.assertEqual(erro.getvalue(), "")
        self.assertIn("Bad request", registrado)


if __name__ == "__main__":
    unittest.main()
