import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import envio
from complemento.ia_dos_cartoes import CORRECAO, IMAGEM, TEXTO, IaDosCartoes
from complemento.modelo_dos_cartoes import PARADO, Conta
from complemento.test_correcao_de_mentira import COMECO_DO_PROMPT
from complemento.test_ia_dos_cartoes import CHAVE_GUARDADA, SEM_CHAVE, custos, porta_na_openai
from complemento.test_openai_de_mentira import OpenAIDeMentira


class OTextoPelaPorta(unittest.TestCase):
    def test_pela_chave_o_texto_vai_com_a_chave_e_o_custo_dos_tokens_fica_com_o_nome_do_cartao(self):
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira() as openai:
            ia, config = porta_na_openai(pasta, "sem login", openai)
            pedir = ia.pedido_do_texto(ia.para_o_texto(), config)
            texto = pedir("o prompt", "give up : She gave up smoking", "17-0")
            registros = custos(config)
            [(autorizacao, corpo)] = openai.chats
        self.assertIn("Front:", texto)
        self.assertEqual((autorizacao, corpo["model"], corpo["messages"][0]), ("Bearer " + CHAVE_GUARDADA, "gpt-4o", {"role": "system", "content": "o prompt"}))
        self.assertEqual(corpo["temperature"], 0.2)
        self.assertEqual([(r["type"], r["model"], r["input_tokens"], r["output_tokens"], r["cost_usd"], r["keyword"]) for r in registros],
                         [("tokens", "gpt-4o", 1000, 200, 0.0045, "17-0")])
        self.assertEqual(openai.respostas, [])

    def test_pelo_plano_o_texto_vai_pela_responses_api_sem_custo_em_dolar_e_com_o_que_a_chave_teria_cobrado(self):
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira() as openai:
            ia, config = porta_na_openai(pasta, "com login", openai)
            pedir = ia.pedido_do_texto(ia.para_o_texto(), config)
            texto = pedir("o prompt", "give up : She gave up smoking", "17-0")
            registros = custos(config)
            [(autorizacao, corpo)] = openai.respostas
        self.assertIn("Front:", texto)
        self.assertEqual((autorizacao, corpo["model"], corpo["instructions"]), ("Bearer acesso-do-teste", "gpt-6-luna", "o prompt"))
        self.assertNotIn("temperature", corpo)
        self.assertEqual([(r["type"], r["model"], r["cost_usd"], r["would_cost_usd"], r["keyword"]) for r in registros],
                         [("plan_tokens", "gpt-6-luna", 0.0, 0.0045, "17-0")])
        self.assertNotIn("acesso-do-teste", json.dumps(registros))
        self.assertEqual(openai.chats, [])

    def test_pelo_plano_o_que_a_chave_teria_cobrado_e_do_modelo_do_motor_e_nao_do_do_plano(self):
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira() as openai:
            ia, config = porta_na_openai(pasta, "com login", openai)
            config["openai"]["chat_model"] = "gpt-4.1-mini"
            ia.pedido_do_texto(ia.para_o_texto(), config)("o prompt", "give up : She gave up smoking", "17-0")
            registros = custos(config)
        self.assertEqual([(r["type"], r["model"], r["cost_usd"], r["would_cost_usd"]) for r in registros], [("plan_tokens", "gpt-6-luna", 0.0, 0.00072)])

    def test_a_recusa_da_openai_chega_a_quem_pediu_como_o_codigo_e_nada_fica_no_custo(self):
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira() as openai:
            openai.recusar_o_chat_de("*", 401, "invalid_api_key")
            ia, config = porta_na_openai(pasta, "sem login", openai)
            pedir = ia.pedido_do_texto(ia.para_o_texto(), config)
            with self.assertRaises(envio.motor_do_complemento().provedores.ErroDoProvedor) as recusa:
                pedir("o prompt", "give up : She gave up smoking", "17-0")
            ficou = os.path.exists(os.path.join(config["paths"]["log_dir"], "costs.jsonl"))
        self.assertEqual(recusa.exception.codigo, "openai_key_rejected")
        self.assertFalse(ficou)


class OTextoSemCredencial(unittest.TestCase):
    def test_sem_credencial_o_pedido_do_texto_nao_chega_a_openai_nem_ao_custo(self):
        for etapa in (TEXTO, CORRECAO):
            with self.subTest(etapa), tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira() as openai:
                ia, config = porta_na_openai(pasta, "sem chave", openai)
                pagador = ia.para_o_texto()
                self.assertEqual((pagador.quem, pagador.credencial, pagador.motivo), (PARADO, None, SEM_CHAVE))
                with self.assertRaises(TypeError):
                    ia.pedido_do_texto(pagador, config, etapa)("o prompt", "give up : She gave up smoking", "17-0")
                self.assertEqual((openai.chats, openai.respostas, openai.correcoes), ([], [], []))
                self.assertFalse(os.path.exists(os.path.join(config["paths"]["log_dir"], "costs.jsonl")))


PEDIDO_DE_CORRECAO = (COMECO_DO_PROMPT + ".", "Word: give up\nExample sentence: She gave up smoking\nLearner's sentence: She give up the job", "")


class ACorrecaoPelaPorta(unittest.TestCase):
    def test_pela_chave_a_correcao_vai_com_a_chave_e_o_custo_fica_a_parte_do_dos_cartoes(self):
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira() as openai:
            ia, config = porta_na_openai(pasta, "sem login", openai)
            corrigida = ia.pedido_do_texto(ia.para_o_texto(), config, CORRECAO)(*PEDIDO_DE_CORRECAO)
            registros = custos(config)
        self.assertEqual(corrigida, "She give up the job")
        self.assertEqual(openai.correcoes, [("Bearer " + CHAVE_GUARDADA, "She give up the job", "give up")])
        self.assertEqual([(r["type"], r["model"], r["input_tokens"], r["output_tokens"], r["cost_usd"]) for r in registros],
                         [("correction_tokens", "gpt-4o", 300, 40, 0.00115)])

    def test_pelo_plano_a_correcao_nao_gasta_a_chave_e_custa_zero(self):
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira() as openai:
            ia, config = porta_na_openai(pasta, "com login", openai)
            corrigida = ia.pedido_do_texto(ia.para_o_texto(), config, CORRECAO)(*PEDIDO_DE_CORRECAO)
            registros = custos(config)
        self.assertEqual(corrigida, "She give up the job")
        self.assertEqual([autorizacao for autorizacao, _, _ in openai.correcoes], ["Bearer acesso-do-teste"])
        self.assertEqual([(r["type"], r["model"], r["cost_usd"]) for r in registros], [("correction_tokens", "gpt-6-luna", 0.0)])
        self.assertNotIn("acesso-do-teste", json.dumps(registros))

    def test_so_o_texto_e_a_correcao_sao_pedidos_pela_porta(self):
        with self.assertRaises(ValueError):
            IaDosCartoes(Conta(None, None), None).pedido_do_texto(None, {"paths": {"log_dir": "."}}, IMAGEM)


if __name__ == "__main__":
    unittest.main()
