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


class PlanoDeMentira:
    """Responde `POST /v1/responses` como o plano do ChatGPT: `resposta` é (status, corpo JSON) antes do stream ou a lista de eventos."""

    def __init__(self, resposta):
        self.resposta = resposta
        self.pedidos = []
        dono = self

        class Atendente(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                corpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                dono.pedidos.append({"caminho": self.path, "autorizacao": self.headers.get("Authorization"), "corpo": corpo})
                if isinstance(dono.resposta, tuple):
                    status, resposta = dono.resposta
                    dados = json.dumps(resposta).encode("utf-8")
                    self.send_response(status)
                    self.send_header("Content-Length", str(len(dados)))
                    self.end_headers()
                    self.wfile.write(dados)
                    return
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.end_headers()
                for evento in dono.resposta:
                    self.wfile.write(("event: %s\ndata: %s\n\n" % (evento["type"], json.dumps(evento))).encode("utf-8"))

        self._servidor = ThreadingHTTPServer(("127.0.0.1", 0), Atendente)
        self.base = "http://127.0.0.1:%d" % self._servidor.server_address[1]
        self._thread = threading.Thread(target=self._servidor.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *erro):
        self._servidor.shutdown()
        self._servidor.server_close()


TOKEN_DO_PLANO = "acesso-do-plano-0000"


def eventos(*pedacos, fim="response.completed", erro_=None):
    lista = [{"type": "response.created", "response": {"status": "in_progress"}}]
    lista += [{"type": "response.output_text.delta", "delta": pedaco} for pedaco in pedacos]
    if fim == "response.completed":
        lista.append({"type": fim, "response": {"status": "completed", "usage": {"input_tokens": 2061, "output_tokens": 387}}})
    elif fim:
        lista.append({"type": fim, "response": {"status": fim.split(".")[1], "error": {"code": erro_, "message": "falhou " + TOKEN_DO_PLANO}}})
    return lista


class ResponderPeloPlano(unittest.TestCase):
    def test_o_pedido_vai_sem_temperature_com_instructions_store_false_e_stream_e_o_texto_vem_dos_pedacos(self):
        with PlanoDeMentira(eventos("Front: ", "oi")) as plano:
            texto, uso = openai_http.responder(plano.base, TOKEN_DO_PLANO, "gpt-6-luna", "o prompt de sistema", "give up : She gave up")
        self.assertEqual((texto, uso), ("Front: oi", {"input_tokens": 2061, "output_tokens": 387}))
        self.assertEqual(plano.pedidos, [{
            "caminho": "/v1/responses",
            "autorizacao": "Bearer " + TOKEN_DO_PLANO,
            "corpo": {"model": "gpt-6-luna", "instructions": "o prompt de sistema", "input": [{"role": "user", "content": "give up : She gave up"}],
                      "store": False, "stream": True},
        }])

    def test_o_json_vai_por_text_format_e_a_mensagem_pode_levar_a_foto_como_input_image(self):
        partes = [{"type": "input_text", "text": "Mode: real_only"}, {"type": "input_image", "image_url": "data:image/png;base64,AAAA"}]
        with PlanoDeMentira(eventos('{"best_index": 1}')) as plano:
            texto, _ = openai_http.responder(plano.base, TOKEN_DO_PLANO, "gpt-6-luna", "o juiz", partes, formato_json=True)
        self.assertEqual(json.loads(texto), {"best_index": 1})
        [pedido] = plano.pedidos
        self.assertEqual(pedido["corpo"]["input"], [{"role": "user", "content": partes}])
        self.assertEqual(pedido["corpo"]["text"], {"format": {"type": "json_object"}})

    def test_a_foto_que_o_plano_nao_le_vira_o_codigo_da_imagem_invalida_e_nao_um_pedido_recusado(self):
        with PlanoDeMentira((400, {"error": {"code": "invalid_image_format", "message": "falhou " + TOKEN_DO_PLANO}})) as plano:
            with self.assertRaises(openai_http.ErroDaOpenAI) as recusa:
                openai_http.responder(plano.base, TOKEN_DO_PLANO, "gpt-6-luna", "p", "m")
        self.assertEqual(recusa.exception.codigo, openai_http.IMAGEM_INVALIDA)

    def test_so_o_response_completed_e_sucesso(self):
        casos = [
            (eventos("Front: oi", fim=None), openai_http.FORA_DO_AR),
            (eventos("Front: oi", fim="response.incomplete", erro_=None), openai_http.RESPOSTA_INCOMPLETA),
            (eventos("Front: oi", fim="response.failed", erro_="subscription_sharing_usage_limit_exceeded"), openai_http.LIMITE_DO_PLANO),
            (eventos("Front: oi", fim="response.failed", erro_="subscription_sharing_usage_unavailable"), openai_http.FORA_DO_AR),
        ]
        for resposta, codigo in casos:
            with self.subTest(codigo), PlanoDeMentira(resposta) as plano:
                with self.assertRaises(openai_http.ErroDaOpenAI) as recusa:
                    openai_http.responder(plano.base, TOKEN_DO_PLANO, "gpt-6-luna", "p", "m")
            self.assertEqual(recusa.exception.codigo, codigo)
            self.assertNotIn(TOKEN_DO_PLANO, str(recusa.exception))

    def test_cada_recusa_antes_do_stream_vira_um_codigo_e_o_que_o_plano_escreveu_nunca_volta(self):
        def recusa(status, codigo):
            return status, {"error": {"code": codigo, "message": "recusado " + TOKEN_DO_PLANO}}

        casos = [
            (recusa(429, "subscription_sharing_usage_limit_exceeded"), openai_http.LIMITE_DO_PLANO),
            (recusa(403, "subscription_sharing_user_not_eligible"), openai_http.PLANO_NAO_SERVE),
            ((401, {"detail": "not accepted " + TOKEN_DO_PLANO}), openai_http.PLANO_RECUSOU),
            (recusa(403, "chatpass_v2_scope_not_authorized"), openai_http.PLANO_RECUSOU),
            (recusa(503, "subscription_sharing_user_unavailable"), openai_http.FORA_DO_AR),
            (recusa(429, "rate_limit_exceeded"), openai_http.LIMITE_DE_USO),
            (recusa(400, "subscription_sharing_unsupported_capability"), openai_http.PEDIDO_RECUSADO),
        ]
        for resposta, codigo in casos:
            with self.subTest(codigo=codigo, status=resposta[0]), PlanoDeMentira(resposta) as plano:
                with self.assertRaises(openai_http.ErroDaOpenAI) as recusa_:
                    openai_http.responder(plano.base, TOKEN_DO_PLANO, "gpt-6-luna", "p", "m")
            self.assertEqual(recusa_.exception.codigo, codigo)
            self.assertNotIn(TOKEN_DO_PLANO, str(recusa_.exception))

    def test_com_o_plano_o_cartao_sai_pela_responses_api_e_nao_conta_custo_em_dolar(self):
        with tempfile.TemporaryDirectory() as pasta, PlanoDeMentira(eventos(CARTAO[:40], CARTAO[40:])) as plano:
            raiz = Path(pasta)
            config = dict(configuracao(raiz), openai_api_key=None, plano_do_chatgpt={"token": TOKEN_DO_PLANO, "modelo": "gpt-6-luna"})
            salvos = generate_cards.run([ENTRADA], config, openai_base=plano.base)
            custos = (raiz / "log" / "costs.jsonl").exists()
        self.assertEqual(salvos, [build_card_stem(ENTRADA.keywords[0], ENTRADA.phrase)])
        self.assertEqual([(p["caminho"], p["corpo"]["instructions"], p["corpo"]["model"]) for p in plano.pedidos], [("/v1/responses", "en prompt", "gpt-6-luna")])
        self.assertFalse(custos)


if __name__ == "__main__":
    unittest.main()
