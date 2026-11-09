"""A camada de provedor: o que o motor pede por `provedores.texto` e `provedores.imagem` chega à OpenAI como chegava antes da camada.

Uma OpenAI de mentira (um servidor local) responde no lugar da de verdade; o endereço dela vai na credencial, por código.
"""

import unittest

import openai_http
import provedores
from test_openai_http import CHAVE, TOKEN_DO_PLANO, OpenAIDeMentira, PlanoDeMentira, erro, eventos, resposta_do_chat


def pela_chave(base, modelo="gpt-4o"):
    return {"provedor": provedores.OPENAI, "segredo": CHAVE, "modelo": modelo, "base": base}


def pelo_plano(base):
    return {"provedor": provedores.OPENAI, "via": "plano", "segredo": TOKEN_DO_PLANO, "modelo": "gpt-6-luna", "base": base}


class TextoPelaChave(unittest.TestCase):
    def test_o_pedido_leva_o_sistema_e_a_mensagem_o_modelo_e_a_temperatura_e_o_uso_volta_com_os_nomes_da_camada(self):
        with OpenAIDeMentira([resposta_do_chat("oi", entrada=11, saida=7)]) as openai:
            texto, uso = provedores.texto(pela_chave(openai.base), "o sistema", "a mensagem", temperatura=0.2)
        self.assertEqual((texto, uso), ("oi", {"entrada": 11, "saida": 7}))
        self.assertEqual(openai.pedidos, [{
            "caminho": "/v1/chat/completions",
            "autorizacao": "Bearer " + CHAVE,
            "corpo": {"model": "gpt-4o", "temperature": 0.2,
                      "messages": [{"role": "system", "content": "o sistema"}, {"role": "user", "content": "a mensagem"}]},
        }])

    def test_o_json_o_limite_de_palavras_e_as_fotos_da_mensagem_vao_no_corpo(self):
        partes = [{"type": "text", "text": "Mode: real_only"}, {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAAA"}}]
        with OpenAIDeMentira([resposta_do_chat('{"best_index": 1}')]) as openai:
            provedores.texto(pela_chave(openai.base, "gpt-4.1-mini"), "o juiz", partes, json=True, temperatura=0, max_tokens=1)
        [pedido] = openai.pedidos
        self.assertEqual(pedido["corpo"], {
            "model": "gpt-4.1-mini", "temperature": 0, "max_tokens": 1, "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": "o juiz"}, {"role": "user", "content": partes}]})

    def test_sem_uso_na_resposta_o_uso_volta_vazio_e_nao_zerado(self):
        with OpenAIDeMentira([(200, {"choices": [{"message": {"content": "oi"}}]})]) as openai:
            _, uso = provedores.texto(pela_chave(openai.base), "s", "m")
        self.assertEqual(uso, {})

    def test_a_recusa_vira_o_codigo_do_provedor_e_o_que_a_openai_escreveu_nao_volta(self):
        with OpenAIDeMentira([erro(401, "Incorrect API key provided", "invalid_api_key")]) as openai:
            with self.assertRaises(provedores.ErroDoProvedor) as recusa:
                provedores.texto(pela_chave(openai.base), "s", "m")
        self.assertEqual(recusa.exception.codigo, "openai_key_rejected")
        self.assertNotIn(CHAVE, str(recusa.exception))

    def test_o_pedido_passageiro_e_repetido_quantas_vezes_se_pediu(self):
        with OpenAIDeMentira([erro(503, "overloaded"), resposta_do_chat("oi")]) as openai:
            texto, _ = provedores.texto(pela_chave(openai.base), "s", "m", repeticoes=provedores.REPETICOES_DA_IMAGEM)
        self.assertEqual((texto, len(openai.pedidos)), ("oi", 2))


class TextoPeloPlano(unittest.TestCase):
    def test_o_pedido_vai_pela_responses_api_sem_temperature_e_o_uso_volta_com_os_nomes_da_camada(self):
        with PlanoDeMentira(eventos("Front: ", "oi")) as plano:
            texto, uso = provedores.texto(pelo_plano(plano.base), "o sistema", "a mensagem", temperatura=0.2)
        self.assertEqual((texto, uso), ("Front: oi", {"entrada": 2061, "saida": 387}))
        self.assertEqual(plano.pedidos, [{
            "caminho": "/v1/responses",
            "autorizacao": "Bearer " + TOKEN_DO_PLANO,
            "corpo": {"model": "gpt-6-luna", "instructions": "o sistema", "input": [{"role": "user", "content": "a mensagem"}], "store": False, "stream": True},
        }])

    def test_as_fotos_da_mensagem_viram_input_image_e_o_json_vai_por_text_format(self):
        partes = [{"type": "text", "text": "Mode: real_only"}, {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAAA"}}]
        with PlanoDeMentira(eventos('{"best_index": 1}')) as plano:
            provedores.texto(pelo_plano(plano.base), "o juiz", partes, json=True)
        [pedido] = plano.pedidos
        self.assertEqual(pedido["corpo"]["input"], [{"role": "user", "content": [
            {"type": "input_text", "text": "Mode: real_only\nReply with the JSON verdict."},
            {"type": "input_image", "image_url": "data:image/png;base64,AAAA"}]}])
        self.assertEqual(pedido["corpo"]["text"], {"format": {"type": "json_object"}})


class Imagem(unittest.TestCase):
    def test_a_primeira_imagem_da_resposta_volta_e_o_pedido_leva_o_modelo_o_prompt_e_o_tamanho(self):
        with OpenAIDeMentira([(200, {"data": [{"b64_json": "AAAA"}, {"b64_json": "BBBB"}]})]) as openai:
            item = provedores.imagem(pela_chave(openai.base, "gpt-image-2.5-flare"), "uma maçã", "1024x1024")
        self.assertEqual(item, {"b64_json": "AAAA"})
        self.assertEqual(openai.pedidos, [{
            "caminho": "/v1/images/generations",
            "autorizacao": "Bearer " + CHAVE,
            "corpo": {"model": "gpt-image-2.5-flare", "prompt": "uma maçã", "n": 1, "size": "1024x1024"},
        }])


class Credencial(unittest.TestCase):
    def test_um_provedor_que_a_camada_nao_tem_e_recusado_sem_pedido_nenhum(self):
        with OpenAIDeMentira([]) as openai:
            with self.assertRaises(provedores.ErroDoProvedor) as recusa:
                provedores.texto({"provedor": "outro", "segredo": CHAVE, "modelo": "m", "base": openai.base}, "s", "m")
        self.assertEqual((recusa.exception.codigo, openai.pedidos), ("provider_unknown", []))

    def test_o_plano_na_configuracao_vira_a_credencial_do_plano_e_a_chave_leva_o_modelo_escolhido_ou_o_do_motor(self):
        config = {"openai_api_key": CHAVE, "openai": {"chat_model": "gpt-4o"}}
        self.assertEqual(provedores.credencial_do_texto(config, "http://x"),
                         {"provedor": "openai", "segredo": CHAVE, "modelo": "gpt-4o", "base": "http://x"})
        self.assertEqual(provedores.credencial_do_texto(dict(config, modelo_do_texto="gpt-4.1-mini"))["modelo"], "gpt-4.1-mini")
        plano = provedores.credencial_do_texto(dict(config, plano_do_chatgpt={"token": TOKEN_DO_PLANO, "modelo": "gpt-6-luna"}))
        self.assertEqual((plano["via"], plano["segredo"], plano["modelo"]), ("plano", TOKEN_DO_PLANO, "gpt-6-luna"))

    def test_o_endereco_so_vem_do_codigo_que_monta_a_credencial_nunca_da_configuracao(self):
        self.assertIs(provedores.ADAPTADORES[provedores.OPENAI], openai_http)
        self.assertIsNone(provedores.credencial_do_texto({"openai_api_key": CHAVE, "openai": {}, "openai_base": "http://outro"})["base"])


if __name__ == "__main__":
    unittest.main()
