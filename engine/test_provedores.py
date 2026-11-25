import unittest
import urllib.request
from unittest import mock

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


class AsOpcoesDoTexto(unittest.TestCase):
    def tempos_do_pedido(self, cred, **opcoes):
        abrir = urllib.request.urlopen
        tempos = []

        def espiar(pedido, timeout=None, context=None):
            tempos.append(timeout)
            return abrir(pedido, timeout=timeout, context=context)

        with mock.patch.object(openai_http.urllib.request, "urlopen", espiar):
            provedores.texto(cred, "s", "m", **opcoes)
        return tempos

    def test_sem_tempo_o_pedido_espera_o_padrao_e_o_tempo_pedido_vale_so_se_vier(self):
        for opcoes, esperado in (({}, 120), ({"tempo": None}, 120), ({"tempo": 7}, 7), ({"tempo": 0}, 120)):
            with self.subTest(opcoes), OpenAIDeMentira([resposta_do_chat("oi")]) as openai:
                self.assertEqual(self.tempos_do_pedido(pela_chave(openai.base), **opcoes), [esperado])

    def test_o_tempo_vale_tambem_para_o_plano(self):
        with PlanoDeMentira(eventos("oi")) as plano:
            self.assertEqual(self.tempos_do_pedido(pelo_plano(plano.base), tempo=9), [9])

    def test_uma_opcao_que_a_camada_nao_conhece_e_recusada_sem_pedido_nenhum(self):
        for cred in (pela_chave, pelo_plano):
            with self.subTest(cred.__name__), OpenAIDeMentira([]) as openai:
                with self.assertRaises(TypeError):
                    provedores.texto(cred(openai.base), "s", "m", cor="azul")
                self.assertEqual(openai.pedidos, [])

    def test_so_o_chat_leva_a_temperatura_o_limite_e_o_json_sem_eles_o_corpo_nao_os_tem(self):
        with OpenAIDeMentira([resposta_do_chat("oi")]) as openai:
            provedores.texto(pela_chave(openai.base), "s", "m")
        self.assertEqual(openai.pedidos[0]["corpo"], {"model": "gpt-4o", "messages": [{"role": "system", "content": "s"}, {"role": "user", "content": "m"}]})

    def test_o_plano_sem_json_nao_leva_o_formato_e_ignora_a_temperatura_e_o_limite(self):
        with PlanoDeMentira(eventos("oi")) as plano:
            provedores.texto(pelo_plano(plano.base), "s", "m", temperatura=0, max_tokens=1)
        self.assertEqual(plano.pedidos[0]["corpo"], {"model": "gpt-6-luna", "instructions": "s", "input": [{"role": "user", "content": "m"}], "store": False, "stream": True})


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


class AChavePresa(unittest.TestCase):
    def test_o_texto_e_a_imagem_pela_chave_presa_vao_com_a_chave_e_o_modelo_pedido(self):
        with OpenAIDeMentira([resposta_do_chat("C", entrada=80, saida=1), (200, {"data": [{"b64_json": "AAAA"}]})]) as openai:
            presa = provedores.PelaChave(CHAVE, openai.base)
            texto, uso = presa.texto("gpt-4o-mini", "o sistema", "bicycle", temperatura=0, max_tokens=1)
            item = presa.imagem("gpt-image-2.5-flare", "uma maçã", "1024x1024")
        self.assertEqual((texto, uso, item), ("C", {"entrada": 80, "saida": 1}, {"b64_json": "AAAA"}))
        self.assertEqual([(p["caminho"], p["autorizacao"], p["corpo"]["model"]) for p in openai.pedidos], [
            ("/v1/chat/completions", "Bearer " + CHAVE, "gpt-4o-mini"), ("/v1/images/generations", "Bearer " + CHAVE, "gpt-image-2.5-flare")])
        self.assertEqual((openai.pedidos[0]["corpo"]["temperature"], openai.pedidos[0]["corpo"]["max_tokens"]), (0, 1))

    def test_a_chave_presa_nao_se_mostra_quando_escrita(self):
        presa = provedores.PelaChave(CHAVE, "http://x")
        self.assertNotIn(CHAVE, repr(presa) + str(presa))


class Credencial(unittest.TestCase):
    def test_um_provedor_que_a_camada_nao_tem_e_recusado_sem_pedido_nenhum(self):
        with OpenAIDeMentira([]) as openai:
            with self.assertRaises(provedores.ErroDoProvedor) as recusa:
                provedores.texto({"provedor": "outro", "segredo": CHAVE, "modelo": "m", "base": openai.base}, "s", "m")
        self.assertEqual((recusa.exception.codigo, openai.pedidos), ("provider_unknown", []))

    def test_o_endereco_so_vem_do_codigo_que_monta_a_credencial_nunca_da_configuracao(self):
        self.assertIs(provedores.ADAPTADORES[provedores.OPENAI], openai_http)
        self.assertFalse(hasattr(provedores, "credencial_do_texto"), "a credencial vem pronta da Conexão: o motor não a monta de um config")


if __name__ == "__main__":
    unittest.main()
