"""A OpenAI de mentira dos testes do complemento: um servidor HTTP local que responde como a OpenAI.

Não é um teste: é o que os testes põem no lugar de `https://api.openai.com`. O complemento só fala com
ela por HTTP, então é aqui, na fronteira, que o teste decide como a OpenAI responde.
"""

import base64
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

from complemento.test_imagens_de_mentira import png_de

# O que cada comportamento faz com os dois pedidos que a Conexão faz ao conferir uma chave:
# (status, corpo) de GET /v1/models e de POST /v1/embeddings.
MODELOS_OK = (200, {"object": "list", "data": [{"id": "gpt-4.1-mini", "object": "model"}]})
EMBEDDINGS_OK = (200, {"object": "list", "data": [{"embedding": [0.0]}]})
# A lista de modelos que o plano do ChatGPT devolve ao `access_token` do login (a forma da doc: `models`, `slug`, `visibility`).
MODELOS_DO_PLANO = (200, {"models": [{"slug": "gpt-interno", "visibility": "hide"}, {"slug": "gpt-6-luna", "display_name": "GPT-6 Luna", "visibility": "list"},
                                     {"slug": "gpt-6-sol", "display_name": "GPT-6 Sol", "visibility": "list"}]})


def audio_da_openai(voz, texto):
    """Os bytes que a OpenAI de mentira fala para um texto: dizem com que voz ele foi pedido."""
    return ("mp3-da-openai|%s|%s" % (voz, texto)).encode("utf-8")


def _erro(status, mensagem, tipo, codigo):
    return status, {"error": {"message": mensagem, "type": tipo, "code": codigo}}


COMPORTAMENTOS = {
    "aceita": (MODELOS_OK, EMBEDDINGS_OK),
    "recusa": (
        _erro(401, "Incorrect API key provided.", "invalid_request_error", "invalid_api_key"),
        EMBEDDINGS_OK,
    ),
    "sem_credito": (
        MODELOS_OK,
        _erro(429, "You exceeded your current quota, please check your plan and billing details.", "insufficient_quota", "insufficient_quota"),
    ),
    "org_nao_verificada": (
        MODELOS_OK,
        _erro(403, "Your organization must be verified to use this feature.", "invalid_request_error", None),
    ),
    # O limite de uso (429 que não diz “quota”) nos dois pedidos: nada foi conferido.
    "limite_de_uso": (
        _erro(429, "Rate limit reached for requests.", "requests", "rate_limit_exceeded"),
        _erro(429, "Rate limit reached for requests.", "requests", "rate_limit_exceeded"),
    ),
    # Os modelos responderam, mas o pedido pago bateu no limite: a conta não tem como pagar o uso agora.
    "limite_so_no_pago": (
        MODELOS_OK,
        _erro(429, "Rate limit reached for requests.", "requests", "rate_limit_exceeded"),
    ),
    # O pagamento recusado por um 402, direto, em cada um dos dois pedidos.
    "pagamento_402_nos_modelos": (
        _erro(402, "Payment required.", "billing_error", None),
        EMBEDDINGS_OK,
    ),
    "pagamento_402_no_pago": (
        MODELOS_OK,
        _erro(402, "Payment required.", "billing_error", None),
    ),
    "fora_do_ar": (
        _erro(503, "The server is overloaded.", "server_error", None),
        _erro(503, "The server is overloaded.", "server_error", None),
    ),
}


PARTES_DE_MENTIRA = {
    "Pronunciation": "pronúncia de mentira", "Literal": "literal de mentira", "Natural": "tradução de mentira",
    "Definition": "definição de mentira", "Other example": "outro exemplo de mentira", "Gist": "cena de mentira.",
}


def _cartao_de_mentira(mensagens, prompt=""):
    """Um Cartão que o motor aceita, feito do pedido: a Palavra no verso e destacada na frente, o contexto, se veio, e as partes do verso que
    o `prompt` do nível manda escrever (sem prompt, as do Iniciante); o alinhamento só se o prompt o pede."""
    pedido = mensagens[-1]["content"]
    texto_do_prompt = " ".join(prompt.split())
    partes = re.findall(r"(%s): \[" % "|".join(PARTES_DE_MENTIRA), texto_do_prompt) or list(PARTES_DE_MENTIRA)[:3] + ["Gist"]
    com_alinhamento = not prompt or "Alignment: 1 |" in texto_do_prompt
    if re.search(r"[\u0400-\u04FF]", pedido):  # russo: a frase inteira é a frente
        frase = pedido.split("\n")[0]
        primeira = frase.split()[0]
        return ("Front\n%s\n\nBack\nPronunciation: pronúncia de mentira\n\nLiteral: literal de mentira\n\nNatural: tradução de mentira\n\n"
                "Gist: cena de mentira.\n\nAlignment:\n1 | %s | literal\n" % (frase, primeira))
    alvo = re.search(r"Target keyword for this card: (.+)", pedido)
    linha = pedido.split("Input Format:\n")[-1].strip()
    palavra, frase = [parte.strip() for parte in linha.split(" : ", 1)]
    palavra = alvo.group(1).strip() if alvo else palavra
    contexto = re.search(r"\[Contexto: (.+?)\]", frase)
    frase = re.sub(r"\s*\[Contexto: .+?\]", "", frase)
    frente = frase.replace(palavra, "*%s*" % palavra, 1) if palavra in frase else "*%s* aqui" % palavra
    fonte = "Source Context: %s\n\n" % contexto.group(1) if contexto else ""
    imagem = "Google Image Search Queries:\n1. %s\n2. %s photo\n\nImage: A %s, no text.\n" % (palavra, palavra, palavra)
    verso = "".join("%s: %s\n\n" % (parte, PARTES_DE_MENTIRA[parte]) for parte in partes)
    alinhamento = "\nAlignment:\n1 | %s | literal\n" % palavra if com_alinhamento else ""
    return "%sFront: %s\n\nBack: %s - /ipa/\n\n%s%s%s" % (fonte, frente, palavra, verso, imagem, alinhamento)


def _palavra_do_pedido(mensagens):
    pedido = mensagens[-1]["content"]
    alvo = re.search(r"Target keyword for this card: (.+)", pedido)
    return alvo.group(1).strip() if alvo else pedido.split("Input Format:\n")[-1].split(" : ", 1)[0].strip()


class OpenAIDeMentira:
    """`OpenAIDeMentira("aceita")` escuta numa porta livre; `base` é o endereço que a Conexão usa no lugar da OpenAI.

    A conferência da chave (`/v1/models`, `/v1/embeddings`) segue o `comportamento`. O texto dos Cartões
    (`/v1/chat/completions`) volta um Cartão válido feito do pedido, com 1000 tokens de entrada e 200 de saída,
    salvo para a Palavra que `recusar_o_chat_de` mandou recusar (`"*"`: todas). `chats` guarda (Authorization, corpo).
    O plano do ChatGPT: um `Bearer acesso-…` (o do login de mentira) recebe a lista do plano em `/v1/models`, e `/v1/responses`
    devolve o mesmo Cartão em stream de eventos; `respostas` guarda (Authorization, corpo), `recusa_das_respostas` = (status, código)
    (ou uma função de quantos pedidos já chegaram que devolve isso, ou None) recusa antes do stream e `falha_no_stream` = código termina o stream com `response.failed`. O juiz de imagem pelo plano (#156) é
    a `/v1/responses` com as instruções do juiz: ele entra em `juizes` como o do chat, e `recusa_do_juiz_do_plano` = (status, código) o recusa.
    """

    def __init__(self, comportamento="aceita"):
        self.comportamento = comportamento
        self.pedidos = []  # (metodo, caminho, Authorization)
        self.chats = []  # (Authorization, corpo) de cada pedido de texto
        self.recusas_do_chat = {}  # Palavra (ou "*") → (status, código)
        self.respostas = []
        self.recusa_das_respostas = None
        self.falha_no_stream = None
        self.recusa_do_juiz_do_plano = None
        self.modelos_da_conta = self.modelos_do_plano = None  # os ids de `GET /v1/models` para a chave e para o plano (None: os de cima)
        # As imagens do Cartão (#144): o juiz (`juiz(modo, candidatas) -> veredito`, `candidatas`: `{index, title, kind, imagem}`), a triagem
        # (a letra que ela responde) e a imagem gerada (`recusa_da_imagem`: (status, código); `imagem_gerada`: o que devolve).
        self.juiz = _juiz_que_gosta_da_primeira
        self.triagem = "C"
        self.recusa_da_imagem = None
        self.imagem_gerada = png_de("gerada")
        self.juizes, self.triagens, self.imagens = [], [], []  # (Authorization, modo, candidatas) / (…, palavra) / (…, corpo)
        self.falas, self.recusa_da_fala = [], None  # a voz (`/v1/audio/speech`): (Authorization, corpo) de cada pedido; (status, código)
        self.antes_de_responder = lambda _metodo, _autorizacao: None
        dono = self

        class Atendente(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _responder(self):
                tamanho = int(self.headers.get("Content-Length") or 0)
                lido = self.rfile.read(tamanho) if tamanho else b""
                dono.pedidos.append((self.command, self.path, self.headers.get("Authorization")))
                dono.antes_de_responder(self.command, self.headers.get('Authorization'))
                modelos, embeddings = COMPORTAMENTOS[dono.comportamento]
                if self.path == "/v1/responses":
                    return dono._respostas(self, self.headers.get("Authorization"), json.loads(lido.decode("utf-8")))
                if self.path == "/v1/models" and (self.headers.get("Authorization") or "").startswith("Bearer acesso-"):
                    modelos = MODELOS_DO_PLANO if dono.modelos_do_plano is None else (200, {"models": [{"slug": slug, "visibility": "list"} for slug in dono.modelos_do_plano]})
                elif self.path == "/v1/models" and dono.modelos_da_conta is not None and modelos[0] == 200:
                    modelos = (200, {"object": "list", "data": [{"id": id_, "object": "model"} for id_ in dono.modelos_da_conta]})
                if self.path == "/v1/audio/speech":
                    return dono._fala(self, self.headers.get("Authorization"), json.loads(lido.decode("utf-8")))
                if self.path == "/v1/chat/completions":
                    status, corpo = dono._chat(self.headers.get("Authorization"), json.loads(lido.decode("utf-8")))
                elif self.path == "/v1/images/generations":
                    status, corpo = dono._imagem(self.headers.get("Authorization"), json.loads(lido.decode("utf-8")))
                else:
                    status, corpo = modelos if self.path == "/v1/models" else embeddings
                dados = json.dumps(corpo).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(dados)))
                self.end_headers()
                self.wfile.write(dados)

            do_GET = do_POST = _responder

        self._servidor = ThreadingHTTPServer(("127.0.0.1", 0), Atendente)
        self._servidor.daemon_threads = True
        self.base = "http://127.0.0.1:%d" % self._servidor.server_address[1]
        self._thread = threading.Thread(target=lambda: self._servidor.serve_forever(poll_interval=0.005), daemon=True)

    def recusar_o_chat_de(self, palavra, status, codigo):
        """O texto da `palavra` (`"*"`: de todas) volta `status` com o erro `codigo`; `status` None volta a aceitar."""
        if status is None:
            self.recusas_do_chat.pop(palavra, None)
        else:
            self.recusas_do_chat[palavra] = (status, codigo)

    def _fala(self, atendente, autorizacao, corpo):
        """`POST /v1/audio/speech`: o MP3 (bytes, não JSON) do texto na voz pedida, ou a recusa de `recusa_da_fala`."""
        self.falas.append((autorizacao, corpo))
        if self.recusa_da_fala:
            status, codigo = self.recusa_da_fala
            dados, tipo = json.dumps({"error": {"code": codigo, "message": "recusado para %s" % autorizacao}}).encode("utf-8"), "application/json"
        else:
            status, dados, tipo = 200, audio_da_openai(corpo.get("voice"), corpo.get("input")), "audio/mpeg"
        atendente.send_response(status)
        atendente.send_header("Content-Type", tipo)
        atendente.send_header("Content-Length", str(len(dados)))
        atendente.end_headers()
        atendente.wfile.write(dados)

    def _imagem(self, autorizacao, corpo):
        self.imagens.append((autorizacao, corpo))
        if self.recusa_da_imagem:
            return _erro(self.recusa_da_imagem[0], "Billing hard limit " + (autorizacao or ""), "x", self.recusa_da_imagem[1])
        return 200, {"data": [{"b64_json": base64.b64encode(self.imagem_gerada).decode("ascii")}]}

    def _chat(self, autorizacao, corpo):
        sistema = corpo["messages"][0]["content"]
        if sistema.startswith("You are an expert visual selector"):
            return self._juiz(autorizacao, corpo)
        if sistema.startswith("You are a classifier"):
            self.triagens.append((autorizacao, corpo["messages"][1]["content"]))
            return 200, {"choices": [{"message": {"content": self.triagem}}], "usage": {"prompt_tokens": 80, "completion_tokens": 1}}
        self.chats.append((autorizacao, corpo))
        recusa = self.recusas_do_chat.get(_palavra_do_pedido(corpo["messages"])) or self.recusas_do_chat.get("*")
        if recusa:
            return _erro(recusa[0], "Incorrect API key provided: %s" % (autorizacao or ""), "x", recusa[1])
        texto = _cartao_de_mentira(corpo["messages"], sistema)
        return 200, {"choices": [{"message": {"role": "assistant", "content": texto}}], "usage": {"prompt_tokens": 1000, "completion_tokens": 200}}

    def _respostas(self, atendente, autorizacao, corpo):
        """`POST /v1/responses`: o Cartão em eventos (`response.output_text.delta` em pedaços e `response.completed` com o uso).
        Com as instruções do juiz de imagem (#156), o texto do stream é o veredito em JSON."""
        self.respostas.append((autorizacao, corpo))
        eh_o_juiz = corpo["instructions"].startswith("You are an expert visual selector")
        recusa_do_texto = self.recusa_das_respostas(len(self.respostas)) if callable(self.recusa_das_respostas) else self.recusa_das_respostas
        recusa = (self.recusa_do_juiz_do_plano or self.recusas_do_chat.get("[juiz]")) if eh_o_juiz else recusa_do_texto
        if recusa:
            status, codigo = recusa
            dados = json.dumps({"error": {"code": codigo, "message": "recusado para %s" % autorizacao}}).encode("utf-8")
            atendente.send_response(status)
            atendente.send_header("Content-Type", "application/json")
            atendente.send_header("Content-Length", str(len(dados)))
            atendente.end_headers()
            atendente.wfile.write(dados)
            return
        if eh_o_juiz:
            partes = corpo["input"][0]["content"]
            texto = json.dumps(self._veredito(autorizacao, partes[0]["text"], partes[1::2], [foto["image_url"] for foto in partes[2::2]]))
        else:
            texto = _cartao_de_mentira([{"content": corpo["input"][-1]["content"]}], corpo["instructions"])
        meio = len(texto) // 2
        eventos = [{"type": "response.created", "response": {"id": "resp_1", "status": "in_progress"}}]
        eventos += [{"type": "response.output_text.delta", "delta": pedaco} for pedaco in (texto[:meio], texto[meio:])]
        if self.falha_no_stream:
            eventos.append({"type": "response.failed", "response": {"error": {"code": self.falha_no_stream, "message": "falhou para %s" % autorizacao}}})
        else:
            eventos.append({"type": "response.completed", "response": {"id": "resp_1", "status": "completed", "usage": {"input_tokens": 1000, "output_tokens": 200}}})
        atendente.send_response(200)
        atendente.send_header("Content-Type", "text/event-stream")
        atendente.end_headers()
        for evento in eventos:
            atendente.wfile.write(("event: %s\ndata: %s\n\n" % (evento["type"], json.dumps(evento))).encode("utf-8"))
            atendente.wfile.flush()

    def _veredito(self, autorizacao, cabecalho, textos, urls):
        """O veredito do juiz: o do chat e o da Responses API mandam as mesmas partes (o texto de cada candidata e a foto dela, como URL de dados)."""
        modo = re.search(r"Mode: (\w+)", cabecalho).group(1)
        candidatas = [{"index": int(re.search(r"Candidate (\d+)", texto["text"]).group(1)), "title": re.search(r"title=(.*)", texto["text"]).group(1),
                       "kind": re.search(r"kind=(.*)", texto["text"]).group(1), "imagem": base64.b64decode(url.split(",", 1)[1])}
                      for texto, url in zip(textos, urls)]
        self.juizes.append((autorizacao, modo, candidatas))
        return self.juiz(modo, candidatas)

    def _juiz(self, autorizacao, corpo):
        partes = corpo["messages"][1]["content"]
        veredito = self._veredito(autorizacao, partes[0]["text"], partes[1::2], [foto["image_url"]["url"] for foto in partes[2::2]])
        recusa = self.recusas_do_chat.get("[juiz]")
        if recusa:
            return _erro(recusa[0], "unsupported image " + (autorizacao or ""), "invalid_request_error", recusa[1])
        return 200, {"choices": [{"message": {"content": json.dumps(veredito)}}], "usage": {"prompt_tokens": 1500, "completion_tokens": 40}}

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *erro):
        self._servidor.shutdown()
        self._servidor.server_close()
        self._thread.join(timeout=5)


def veredito_do_juiz(melhor, notas):
    """O que o juiz devolve: `notas` é a nota de cada candidata, na ordem; `melhor` é o índice da que ele escolhe."""
    return {"best_index": melhor, "best_score": notas[melhor], "verdict": "keep_real", "summary": "de mentira",
            "candidates": [{"index": indice, "score": nota, "reason": "de mentira"} for indice, nota in enumerate(notas)]}


def _juiz_que_gosta_da_primeira(modo, candidatas):
    return veredito_do_juiz(0, [90] + [10] * (len(candidatas) - 1))


class FirestoreDeMentira:
    """Seam HTTP externo; o cofre/sync sob teste continuam reais."""

    def __init__(self):
        self.documentos = {}
        self.falha = 0
        self.recusar_escritas = False
        self.pedidos = []
        dono = self

        class Atendente(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def atender(self):
                caminho = unquote(urlsplit(self.path).path)
                uid = caminho.split('/usuarios/')[-1].split('/')[0]
                dono.pedidos.append((self.command, uid, self.headers.get('Authorization')))
                status, dados = 200, {}
                if dono.falha:
                    status = dono.falha
                elif self.command == 'GET':
                    if uid in dono.documentos:
                        dados = {'fields': dono.documentos[uid]}
                    else:
                        status = 404
                elif self.command == 'PATCH':
                    if dono.recusar_escritas:
                        status = 503
                    else:
                        corpo = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                        dono.documentos[uid] = corpo['fields']
                        dados = {'fields': corpo['fields']}
                else:
                    status = 400
                if status >= 400:
                    dados = {'error': {'code': status, 'message': 'falha externa fictícia'}}
                corpo = json.dumps(dados).encode('utf-8')
                self.send_response(status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(corpo)))
                self.end_headers()
                self.wfile.write(corpo)

            do_GET = do_PATCH = atender

        self._servidor = ThreadingHTTPServer(('127.0.0.1', 0), Atendente)
        self._servidor.daemon_threads = True
        self.base = 'http://127.0.0.1:%d/documents' % self._servidor.server_address[1]
        self._thread = threading.Thread(target=lambda: self._servidor.serve_forever(poll_interval=0.005), daemon=True)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *_erro):
        self._servidor.shutdown()
        self._servidor.server_close()
        self._thread.join(timeout=5)
