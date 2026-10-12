"""O texto do motor fala com a OpenAI por HTTP direto, sem o SDK: o que atravessa a fronteira e o que volta.

Uma OpenAI de mentira (um servidor local) responde no lugar da de verdade; o motor recebe o endereço dela por código.
"""

import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import generate_cards
import openai_http
from parser import MiningEntry, build_card_stem

CHAVE = "sk-proj-chave-de-teste-0000"

CARTAO = """## Anki Card
Source Context: Scientific Advertising - Chapter 8

Front: He *exerts himself* on brands of his own, if at all.

Back: exerts himself - /ig-ZURTS him-SELF/

Definition: Makes a deliberate personal effort.
"""


class OpenAIDeMentira:
    """Responde `POST /v1/chat/completions` com o que o teste pôs em `respostas` (status, corpo), em ordem."""

    def __init__(self, respostas):
        self.respostas = list(respostas)
        self.pedidos = []
        dono = self

        class Atendente(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                corpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                dono.pedidos.append({"caminho": self.path, "autorizacao": self.headers.get("Authorization"), "corpo": corpo})
                status, resposta = dono.respostas.pop(0)
                dados = json.dumps(resposta).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(dados)))
                self.end_headers()
                self.wfile.write(dados)

        self._servidor = ThreadingHTTPServer(("127.0.0.1", 0), Atendente)
        self.base = "http://127.0.0.1:%d" % self._servidor.server_address[1]
        self._thread = threading.Thread(target=self._servidor.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *erro):
        self._servidor.shutdown()
        self._servidor.server_close()


def resposta_do_chat(texto, entrada=1000, saida=200):
    return 200, {"choices": [{"message": {"role": "assistant", "content": texto}}], "usage": {"prompt_tokens": entrada, "completion_tokens": saida}}


def erro(status, mensagem, codigo=None):
    return status, {"error": {"message": mensagem + " " + CHAVE, "type": "x", "code": codigo}}


class Completar(unittest.TestCase):
    def test_o_pedido_leva_a_chave_no_cabecalho_e_o_modelo_a_temperatura_e_as_mensagens_no_corpo(self):
        with OpenAIDeMentira([resposta_do_chat("oi")]) as openai:
            texto, uso = openai_http.completar(openai.base, CHAVE, "gpt-4o", [{"role": "user", "content": "olá"}], temperatura=0.2)
        self.assertEqual((texto, uso), ("oi", {"prompt_tokens": 1000, "completion_tokens": 200}))
        self.assertEqual(openai.pedidos, [{
            "caminho": "/v1/chat/completions",
            "autorizacao": "Bearer " + CHAVE,
            "corpo": {"model": "gpt-4o", "temperature": 0.2, "messages": [{"role": "user", "content": "olá"}]},
        }])

    def test_cada_recusa_vira_o_codigo_da_chave_e_a_mensagem_da_openai_nunca_volta(self):
        casos = [
            (erro(401, "Incorrect API key provided", "invalid_api_key"), openai_http.RECUSADA),
            (erro(429, "You exceeded your current quota", "insufficient_quota"), openai_http.SEM_CREDITO),
            (erro(429, "Rate limit reached", "rate_limit_exceeded"), openai_http.LIMITE_DE_USO),
            (erro(503, "The server is overloaded"), openai_http.FORA_DO_AR),
            (erro(400, "model not found", "model_not_found"), openai_http.PEDIDO_RECUSADO),
        ]
        for resposta, codigo in casos:
            with self.subTest(codigo), OpenAIDeMentira([resposta]) as openai:
                with self.assertRaises(openai_http.ErroDaOpenAI) as recusa:
                    openai_http.completar(openai.base, CHAVE, "gpt-4o", [])
            self.assertEqual(recusa.exception.codigo, codigo)
            self.assertNotIn(CHAVE, str(recusa.exception))
            self.assertNotIn("Incorrect", str(recusa.exception))

    def test_sem_resposta_e_a_openai_fora_do_ar(self):
        with OpenAIDeMentira([]) as openai:
            base = openai.base
        with self.assertRaises(openai_http.ErroDaOpenAI) as recusa:
            openai_http.completar(base, CHAVE, "gpt-4o", [], tempo=2)
        self.assertEqual(recusa.exception.codigo, openai_http.FORA_DO_AR)


def configuracao(raiz):
    (raiz / "prompts").mkdir()
    (raiz / "prompts" / "en_card.txt").write_text("en prompt", encoding="utf-8")
    (raiz / "prompts" / "ru_card.txt").write_text("ru prompt", encoding="utf-8")
    return {
        "lang": "en",
        "openai_api_key": CHAVE,
        "openai": {"chat_model": "gpt-4o"},
        "paths": {
            "output_dir": str(raiz / "Output"),
            "log_dir": str(raiz / "log"),
            "prompts": {"en_card": str(raiz / "prompts" / "en_card.txt"), "ru_card": str(raiz / "prompts" / "ru_card.txt")},
        },
    }


ENTRADA = MiningEntry(keywords=["exerts himself"], phrase="He exerts himself on brands of his own, if at all.")


class GerarCartoesPorHttp(unittest.TestCase):
    def test_o_cartao_gerado_fica_no_disco_e_o_custo_dos_tokens_no_log_de_custos(self):
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira([resposta_do_chat(CARTAO)]) as openai:
            raiz = Path(pasta)
            salvos = generate_cards.run([ENTRADA], configuracao(raiz), openai_base=openai.base)
            stem = build_card_stem(ENTRADA.keywords[0], ENTRADA.phrase)
            texto = (raiz / "Output" / (stem + ".txt")).read_text(encoding="utf-8")
            custos = [json.loads(linha) for linha in (raiz / "log" / "costs.jsonl").read_text(encoding="utf-8").splitlines()]
        self.assertEqual(salvos, [stem])
        self.assertIn("Back: exerts himself", texto)
        self.assertEqual(openai.pedidos[0]["corpo"]["messages"][0], {"role": "system", "content": "en prompt"})
        self.assertEqual([(c["type"], c["model"], c["input_tokens"], c["output_tokens"], c["cost_usd"]) for c in custos],
                         [("tokens", "gpt-4o", 1000, 200, 0.0045)])

    def test_um_texto_ja_gerado_nao_e_pedido_de_novo_quando_se_pede_para_pular_os_prontos(self):
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira([]) as openai:
            raiz = Path(pasta)
            stem = build_card_stem(ENTRADA.keywords[0], ENTRADA.phrase)
            (raiz / "Output").mkdir()
            (raiz / "Output" / (stem + ".txt")).write_text(CARTAO, encoding="utf-8")
            salvos = generate_cards.run([ENTRADA], configuracao(raiz), openai_base=openai.base, skip_existing=True)
        self.assertEqual((salvos, openai.pedidos), ([stem], []))

    def test_a_falha_de_cada_cartao_fica_com_o_codigo_para_quem_pediu(self):
        falhas = {}
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira([erro(401, "Incorrect API key provided", "invalid_api_key")]) as openai:
            salvos = generate_cards.run([ENTRADA], configuracao(Path(pasta)), openai_base=openai.base, failures=falhas)
        self.assertEqual((salvos, falhas), ([], {build_card_stem(ENTRADA.keywords[0], ENTRADA.phrase): openai_http.RECUSADA}))

    def test_gerar_nao_escreve_na_saida_do_processo(self):
        # Dentro do Anki, o que o motor escrevesse no stdout/stderr iria para o processo do Anki: vai ao logger.
        import contextlib
        import io

        saida, erro_ = io.StringIO(), io.StringIO()
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira([resposta_do_chat(CARTAO)]) as openai:
            with contextlib.redirect_stdout(saida), contextlib.redirect_stderr(erro_):
                generate_cards.run([ENTRADA], configuracao(Path(pasta)), openai_base=openai.base)
        self.assertEqual((saida.getvalue(), erro_.getvalue()), ("", ""))

    def test_importar_o_motor_de_texto_nao_mexe_nos_avisos_do_processo_nem_precisa_do_sdk(self):
        import subprocess
        import sys

        codigo = (
            "import sys, warnings; sys.modules['openai'] = None; sys.modules['yaml'] = None; sys.modules['dotenv'] = None; "
            "antes = list(warnings.filters); import generate_cards, config_loader, send_to_anki, cost_tracker; "
            "print(antes == list(warnings.filters))"
        )
        feito = subprocess.run([sys.executable, "-c", codigo], cwd=str(Path(__file__).parent), capture_output=True, text=True)
        self.assertEqual((feito.stdout.strip(), feito.stderr), ("True", ""))


if __name__ == "__main__":
    unittest.main()
