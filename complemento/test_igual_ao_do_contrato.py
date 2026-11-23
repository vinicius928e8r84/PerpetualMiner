"""A conferência de uma resposta contra a do exemplo do contrato (`test_comparar_com_o_contrato.igual_ao_do_contrato`), caso a caso."""

import unittest

from complemento.test_comparar_com_o_contrato import igual_ao_do_contrato

SEGREDO = "A" * 43 + "="
URL_DO_LOGIN = "https://auth.openai.com/api/accounts/authorize?client_id=dynamic_agent_client&state=x"


class IgualAoDoContrato(unittest.TestCase):
    def test_segredo_e_prova_sao_trinta_e_dois_bytes_em_base64(self):
        for marca in ("<segredo>", "<prova>"):
            self.assertTrue(igual_ao_do_contrato(SEGREDO, marca))
            self.assertTrue(igual_ao_do_contrato("a+/" + "B" * 40 + "=", marca))
            for errado in ("A" * 43, "A" * 42 + "=", "A" * 44 + "=", "", None, 1, ["A"]):
                self.assertFalse(igual_ao_do_contrato(errado, marca), (marca, errado))

    def test_sessao_e_trinta_e_dois_caracteres_hexadecimais_minusculos(self):
        self.assertTrue(igual_ao_do_contrato("0123456789abcdef" * 2, "<sessão>"))
        for errado in ("0123456789ABCDEF" * 2, "0" * 31, "0" * 33, "g" * 32, "", None, 5):
            self.assertFalse(igual_ao_do_contrato(errado, "<sessão>"), errado)

    def test_agora_e_um_instante_iso_8601_em_z(self):
        for certo in ("2026-05-01T10:20:30Z", "2026-05-01T10:20:30.123456Z", "2026-05-01T10:20:30.1Z"):
            self.assertTrue(igual_ao_do_contrato(certo, "<agora>"), certo)
        for errado in ("2026-05-01T10:20:30", "2026-05-01 10:20:30Z", "2026-05-01T10:20:30+00:00", "2026-05-01T10:20:30.Z", "ontem", "", None, 0):
            self.assertFalse(igual_ao_do_contrato(errado, "<agora>"), errado)

    def test_audio_e_um_base64_que_nao_e_vazio(self):
        for certo in ("QUJD", "QQ==", "QUI=", "a+/9"):
            self.assertTrue(igual_ao_do_contrato(certo, "<áudio>"), certo)
        for errado in ("", "QUJD===", "QU JD", "QUJD!", None, b"QUJD"):
            self.assertFalse(igual_ao_do_contrato(errado, "<áudio>"), errado)

    def test_url_de_autorizacao_e_a_do_login_do_chatgpt(self):
        self.assertTrue(igual_ao_do_contrato(URL_DO_LOGIN, "<url de autorização>"))
        for errado in ("https://auth.openai.com/api/accounts/authorize?client_id=outro&x", "http://auth.openai.com/api/accounts/authorize?client_id=dynamic_agent_client&", "", None):
            self.assertFalse(igual_ao_do_contrato(errado, "<url de autorização>"), errado)

    def test_o_dicionario_tem_de_ter_as_mesmas_chaves_e_cada_valor_igual(self):
        esperado = {"a": 1, "quando": "<agora>", "dentro": {"b": [1, "<sessão>"]}}
        obtido = {"a": 1, "quando": "2026-05-01T10:20:30Z", "dentro": {"b": [1, "f" * 32]}}
        self.assertTrue(igual_ao_do_contrato(obtido, esperado))
        self.assertTrue(igual_ao_do_contrato({}, {}))
        for errado in ({**obtido, "extra": 1}, {"a": 1, "quando": obtido["quando"]}, {**obtido, "a": 2}, {**obtido, "quando": "x"},
                       {**obtido, "dentro": {"b": [1, "x"]}}, [], None, "a"):
            self.assertFalse(igual_ao_do_contrato(errado, esperado), errado)

    def test_a_lista_tem_de_ter_o_mesmo_tamanho_e_cada_item_igual_na_ordem(self):
        self.assertTrue(igual_ao_do_contrato([], []))
        self.assertTrue(igual_ao_do_contrato([1, "f" * 32], [1, "<sessão>"]))
        for errado in ([1], [1, "f" * 32, 3], ["f" * 32, 1], (1, "f" * 32), {}, None):
            self.assertFalse(igual_ao_do_contrato(errado, [1, "<sessão>"]), errado)

    def test_o_resto_e_comparado_por_igualdade(self):
        for valor in (1, "texto", None, True, 1.5):
            self.assertTrue(igual_ao_do_contrato(valor, valor))
        self.assertFalse(igual_ao_do_contrato(2, 1))
        self.assertFalse(igual_ao_do_contrato("<outra marca>", "<agora>"))
        self.assertTrue(igual_ao_do_contrato("<outra marca>", "<outra marca>"))


if __name__ == "__main__":
    unittest.main()
