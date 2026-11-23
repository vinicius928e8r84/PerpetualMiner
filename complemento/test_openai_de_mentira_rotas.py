"""O que a OpenAI de mentira (`test_openai_de_mentira.OpenAIDeMentira`) responde em cada rota, vista de fora, por HTTP: é o que os testes do complemento põem no lugar
da OpenAI, então o que ela devolve não pode mudar sem que um teste diga."""

import base64
import json
import unittest
import urllib.error
import urllib.request

from complemento import test_openai_de_mentira as mentira
from complemento.test_imagens_de_mentira import png_de

CHAVE = "Bearer sk-de-mentira"
PLANO = "Bearer acesso-de-mentira"
SISTEMA_DO_JUIZ = "You are an expert visual selector for flashcards."


def pedir(servidor, caminho, corpo=None, autorizacao=CHAVE):
    dados = None if corpo is None else json.dumps(corpo).encode("utf-8")
    pedido = urllib.request.Request(servidor.base + caminho, data=dados, method="GET" if dados is None else "POST")
    pedido.add_header("Authorization", autorizacao)
    try:
        with urllib.request.urlopen(pedido, timeout=5) as resposta:
            return resposta.status, resposta.headers.get("Content-Type"), resposta.read()
    except urllib.error.HTTPError as erro:
        return erro.code, erro.headers.get("Content-Type"), erro.read()


def em_json(resposta):
    status, tipo, corpo = resposta
    assert tipo == "application/json", tipo
    return status, json.loads(corpo)


def eventos_do_stream(resposta):
    status, tipo, corpo = resposta
    assert tipo == "text/event-stream", tipo
    blocos = [bloco for bloco in corpo.decode("utf-8").split("\n\n") if bloco]
    return status, [json.loads(bloco.split("data: ", 1)[1]) for bloco in blocos]


def chat(sistema, usuario):
    return {"model": "gpt-x", "messages": [{"role": "system", "content": sistema}, {"role": "user", "content": usuario}]}


def pedido_de_cartao(palavra="give up", frase="She gave up smoking"):
    return chat("Prompt do nível", "Input Format:\n%s : %s" % (palavra, frase))


def partes_do_juiz(imagens, como_url):
    partes = [{"type": "text", "text": "Mode: pick"}]
    for indice, imagem in enumerate(imagens):
        url = "data:image/png;base64," + base64.b64encode(imagem).decode("ascii")
        partes.append({"type": "text", "text": "Candidate %d\ntitle=foto %d\nkind=real" % (indice, indice)})
        partes.append({"type": "image_url", "image_url": url if como_url == "responses" else {"url": url}})
    return partes


class OpenAIDeMentiraPorRota(unittest.TestCase):
    def servidor(self, comportamento="aceita"):
        servidor = mentira.OpenAIDeMentira(comportamento)
        servidor.__enter__()
        self.addCleanup(servidor.__exit__, None, None, None)
        return servidor

    def test_a_conferencia_da_chave_segue_o_comportamento(self):
        for comportamento, (modelos, embeddings) in mentira.COMPORTAMENTOS.items():
            servidor = self.servidor(comportamento)
            self.assertEqual(em_json(pedir(servidor, "/v1/models")), modelos, comportamento)
            self.assertEqual(em_json(pedir(servidor, "/v1/embeddings", {"input": "x"})), embeddings, comportamento)

    def test_cada_pedido_fica_guardado_com_o_metodo_o_caminho_e_a_autorizacao_e_avisa_antes_de_responder(self):
        servidor = self.servidor()
        avisos = []
        servidor.antes_de_responder = lambda metodo, autorizacao: avisos.append((metodo, autorizacao))
        pedir(servidor, "/v1/models")
        pedir(servidor, "/v1/embeddings", {"input": "x"}, autorizacao=PLANO)
        self.assertEqual(servidor.pedidos, [("GET", "/v1/models", CHAVE), ("POST", "/v1/embeddings", PLANO)])
        self.assertEqual(avisos, [("GET", CHAVE), ("POST", PLANO)])

    def test_os_modelos_do_plano_vao_a_quem_traz_o_acesso_do_login_e_os_da_conta_a_quem_traz_a_chave(self):
        servidor = self.servidor()
        self.assertEqual(em_json(pedir(servidor, "/v1/models", autorizacao=PLANO)), mentira.MODELOS_DO_PLANO)
        servidor.modelos_do_plano = ["gpt-6-luna"]
        self.assertEqual(em_json(pedir(servidor, "/v1/models", autorizacao=PLANO)), (200, {"models": [{"slug": "gpt-6-luna", "visibility": "list"}]}))
        servidor.modelos_da_conta = ["gpt-a", "gpt-b"]
        self.assertEqual(em_json(pedir(servidor, "/v1/models")), (200, {"object": "list", "data": [{"id": "gpt-a", "object": "model"}, {"id": "gpt-b", "object": "model"}]}))

    def test_os_modelos_da_conta_nao_valem_quando_a_chave_e_recusada(self):
        servidor = self.servidor("recusa")
        servidor.modelos_da_conta = ["gpt-a"]
        self.assertEqual(em_json(pedir(servidor, "/v1/models"))[0], 401)

    def test_o_texto_do_cartao_volta_um_cartao_feito_do_pedido_com_o_uso_de_mil_e_duzentos_tokens(self):
        servidor = self.servidor()
        status, corpo = em_json(pedir(servidor, "/v1/chat/completions", pedido_de_cartao()))
        self.assertEqual((status, corpo["usage"]), (200, {"prompt_tokens": 1000, "completion_tokens": 200}))
        texto = corpo["choices"][0]["message"]["content"]
        self.assertIn("Front: She *gave up* smoking", texto)
        self.assertIn("Back: give up - /ipa/", texto)
        self.assertEqual([autorizacao for autorizacao, _ in servidor.chats], [CHAVE])

    def test_o_chat_recusa_a_palavra_mandada_e_so_nos_primeiros_pedidos_quando_dito(self):
        servidor = self.servidor()
        servidor.recusar_o_chat_de("give up", 401, "invalid_api_key", vezes=2)
        pedido = pedido_de_cartao()
        recusas = [em_json(pedir(servidor, "/v1/chat/completions", pedido)) for _ in range(3)]
        self.assertEqual([status for status, _ in recusas], [401, 401, 200])
        self.assertEqual(recusas[0][1]["error"], {"message": "Incorrect API key provided: " + CHAVE, "type": "x", "code": "invalid_api_key"})
        servidor.recusar_o_chat_de("*", 429, "rate_limit_exceeded")
        self.assertEqual(em_json(pedir(servidor, "/v1/chat/completions", pedido_de_cartao("other", "Another one")))[0], 429)

    def test_o_chat_do_juiz_escolhe_pelo_veredito_e_recusa_pelo_juiz(self):
        servidor = self.servidor()
        fotos = [png_de("a"), png_de("b")]
        pedido = chat(SISTEMA_DO_JUIZ, "x")
        pedido["messages"][1]["content"] = partes_do_juiz(fotos, "chat")
        status, corpo = em_json(pedir(servidor, "/v1/chat/completions", pedido))
        self.assertEqual((status, corpo["usage"]), (200, {"prompt_tokens": 1500, "completion_tokens": 40}))
        self.assertEqual(json.loads(corpo["choices"][0]["message"]["content"]), mentira.veredito_do_juiz(0, [90, 10]))
        self.assertEqual([(modo, [(c["index"], c["title"], c["kind"], c["imagem"]) for c in candidatas]) for _, modo, candidatas in servidor.juizes],
                         [("pick", [(0, "foto 0", "real", fotos[0]), (1, "foto 1", "real", fotos[1])])])
        servidor.recusar_o_chat_de("[juiz]", 400, "image_unsupported")
        status, corpo = em_json(pedir(servidor, "/v1/chat/completions", pedido))
        self.assertEqual((status, corpo["error"]["code"]), (400, "image_unsupported"))

    def test_a_triagem_devolve_a_classe_dada(self):
        servidor = self.servidor()
        servidor.triagem = "B"
        status, corpo = em_json(pedir(servidor, "/v1/chat/completions", chat("You are a classifier", "foto")))
        self.assertEqual((status, corpo["choices"][0]["message"]["content"], corpo["usage"]), (200, "B", {"prompt_tokens": 80, "completion_tokens": 1}))
        self.assertEqual(servidor.triagens, [(CHAVE, "foto")])

    def test_a_correcao_da_criacao_volta_a_frase_ou_a_recusa(self):
        servidor = self.servidor()
        pedido = chat("You correct a language learner", "Word: give\nLearner's sentence: I give up")
        status, corpo = em_json(pedir(servidor, "/v1/chat/completions", pedido))
        self.assertEqual((status, corpo["choices"][0]["message"]["content"], corpo["usage"]), (200, "I give up", {"prompt_tokens": 300, "completion_tokens": 40}))
        self.assertEqual(servidor.correcoes, [(CHAVE, "I give up", "give")])
        servidor.recusar_o_chat_de("[correcao]", 401, "invalid_api_key")
        self.assertEqual(em_json(pedir(servidor, "/v1/chat/completions", pedido))[0], 401)

    def test_o_plano_responde_o_cartao_em_eventos_com_o_uso(self):
        servidor = self.servidor()
        corpo = {"instructions": "Prompt do nível", "input": [{"role": "user", "content": "Input Format:\ngive up : She gave up smoking"}]}
        status, eventos = eventos_do_stream(pedir(servidor, "/v1/responses", corpo, autorizacao=PLANO))
        self.assertEqual(status, 200)
        self.assertEqual([evento["type"] for evento in eventos], ["response.created", "response.output_text.delta", "response.output_text.delta", "response.completed"])
        texto = "".join(evento["delta"] for evento in eventos if "delta" in evento)
        self.assertIn("Front: She *gave up* smoking", texto)
        self.assertEqual(eventos[-1]["response"], {"id": "resp_1", "status": "completed", "usage": {"input_tokens": 1000, "output_tokens": 200}})
        self.assertEqual(servidor.respostas, [(PLANO, corpo)])

    def test_o_plano_responde_a_correcao_e_o_stream_pode_terminar_em_falha(self):
        servidor = self.servidor()
        corpo = {"instructions": "You correct a language learner", "input": [{"role": "user", "content": "Word: give\nLearner's sentence: I give up"}]}
        _, eventos = eventos_do_stream(pedir(servidor, "/v1/responses", corpo, autorizacao=PLANO))
        self.assertEqual("".join(evento["delta"] for evento in eventos if "delta" in evento), "I give up")
        servidor.falha_no_stream = "server_error"
        _, eventos = eventos_do_stream(pedir(servidor, "/v1/responses", corpo, autorizacao=PLANO))
        self.assertEqual(eventos[-1], {"type": "response.failed", "response": {"error": {"code": "server_error", "message": "falhou para " + PLANO}}})

    def test_o_plano_recusa_antes_do_stream_pelo_numero_do_pedido_ou_pelo_juiz(self):
        servidor = self.servidor()
        corpo = {"instructions": "Prompt do nível", "input": [{"role": "user", "content": "Input Format:\ngive up : She gave up smoking"}]}
        servidor.recusa_das_respostas = lambda quantos: (429, "rate_limit_exceeded") if quantos == 1 else None
        status, erro = em_json(pedir(servidor, "/v1/responses", corpo, autorizacao=PLANO))
        self.assertEqual((status, erro), (429, {"error": {"code": "rate_limit_exceeded", "message": "recusado para " + PLANO}}))
        self.assertEqual(eventos_do_stream(pedir(servidor, "/v1/responses", corpo, autorizacao=PLANO))[0], 200)
        juiz = {"instructions": SISTEMA_DO_JUIZ, "input": [{"role": "user", "content": partes_do_juiz([png_de("a"), png_de("b")], "responses")}]}
        status, eventos = eventos_do_stream(pedir(servidor, "/v1/responses", juiz, autorizacao=PLANO))
        self.assertEqual(json.loads("".join(evento["delta"] for evento in eventos if "delta" in evento)), mentira.veredito_do_juiz(0, [90, 10]))
        servidor.recusa_do_juiz_do_plano = (400, "image_unsupported")
        self.assertEqual(em_json(pedir(servidor, "/v1/responses", juiz, autorizacao=PLANO))[0], 400)

    def test_a_fala_volta_o_mp3_da_voz_pedida_ou_a_recusa(self):
        servidor = self.servidor()
        status, tipo, corpo = pedir(servidor, "/v1/audio/speech", {"voice": "nova", "input": "give up"})
        self.assertEqual((status, tipo, corpo), (200, "audio/mpeg", mentira.audio_da_openai("nova", "give up")))
        servidor.recusa_da_fala = (429, "rate_limit_exceeded")
        status, erro = em_json(pedir(servidor, "/v1/audio/speech", {"voice": "nova", "input": "x"}))
        self.assertEqual((status, erro["error"]["code"]), (429, "rate_limit_exceeded"))
        self.assertEqual([corpo["input"] for _, corpo in servidor.falas], ["give up", "x"])

    def test_a_imagem_gerada_volta_em_base64_ou_a_recusa(self):
        servidor = self.servidor()
        status, corpo = em_json(pedir(servidor, "/v1/images/generations", {"prompt": "a dog"}))
        self.assertEqual((status, base64.b64decode(corpo["data"][0]["b64_json"])), (200, servidor.imagem_gerada))
        servidor.recusa_da_imagem = (400, "content_policy_violation")
        status, erro = em_json(pedir(servidor, "/v1/images/generations", {"prompt": "a dog"}))
        self.assertEqual((status, erro["error"]["code"], erro["error"]["message"]), (400, "content_policy_violation", "Billing hard limit " + CHAVE))
        self.assertEqual(len(servidor.imagens), 2)


if __name__ == "__main__":
    unittest.main()
